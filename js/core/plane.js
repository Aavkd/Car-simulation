import * as THREE from 'three';

/**
 * Flight Physics System
 * Features: 6-DOF Aerodynamics (Thrust, Lift, Drag, Gravity)
 */
export class PlanePhysics {
    constructor(planeMesh, scene) {
        this.mesh = planeMesh;
        this.scene = scene;
        this.debug = false;

        // ==================== TRAIL SYSTEM ====================
        this._initTrailSystem();

        // ==================== PHYSICS CONSTANTS ====================
        this.MASS = 2000.0;             // kg
        this.MAX_THRUST = 60000.0;      // Newtons
        this.LIFT_COEFFICIENT = 0.05;   // Base lift factor
        this.DRAG_COEFFICIENT = 0.02;   // Base drag factor
        this.WING_AREA = 25.0;          // m^2
        this.AIR_DENSITY = 1.225;       // kg/m^3 (sea level)
        this.GRAVITY = 9.81;

        // Handling Characteristics
        this.PITCH_SPEED = 1.5;
        this.ROLL_SPEED = 2.5;

        this.YAW_SPEED = 1.2;

        // Smoothing / Inertia
        this.INPUT_ATTACK_SMOOTHING = 8.0;  // Normal acceleration
        this.INPUT_DECAY_SMOOTHING = 1.0;   // Coasting to stop
        this.INPUT_COUNTER_SMOOTHING = 2.0; // Quick direction change

        // ==================== STATE ====================
        this.velocity = new THREE.Vector3();
        this.throttle = 0;              // 0 to 1
        this.speed = 0;                 // m/s
        this.speedKmh = 0;
        this.altitude = 0;

        // Rotational State (for inertia)
        this.currentPitchSpeed = 0;
        this.currentRollSpeed = 0;
        this.currentYawSpeed = 0;

        // Control Inputs
        this.input = {
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttle: 0,
            airbrake: false
        };

        // Engine Sound / Visuals (Placeholder)
        this.engineRunning = false;

        // Physics Provider (terrain collision)
        this.physicsProvider = null;

        // Ground contact state
        this.isGrounded = false;
        this.groundNormal = new THREE.Vector3(0, 1, 0);
        this.GROUND_HOVER_HEIGHT = 0.5;  // Height above ground when surfing
        this.GROUND_FRICTION = 0.99;     // Friction when sliding on ground (closer to 1 = less friction)
        this.GROUND_BOUNCE = 0.2;        // Bounce damping on impact

        // ==================== SPEED EFFECT SYSTEM ====================
        this._initSpeedEffect();
    }

    /**
     * Set the physics provider for terrain collision
     * @param {BasePhysicsProvider} provider - Terrain physics provider
     */
    setPhysicsProvider(provider) {
        this.physicsProvider = provider;
    }

    /**
     * Update physics
     */
    update(dt, input) {
        // 1. Process Input
        this._processInput(input, dt);

        // 2. Physics Calculation
        this._applyPhysics(dt);

        // 3. Update Visuals
        this._updateVisuals(dt);
        this._updateSpeedEffect(dt);

        // Debug
        if (this.debug) {
            console.log(`[Plane] Spd: ${this.speedKmh.toFixed(0)} | Alt: ${this.altitude.toFixed(0)} | Thr: ${this.throttle.toFixed(2)}`);
        }
    }

    _processInput(input, dt) {
        // Map inputs to control surfaces (smoothed)
        // Pitch: W/S or Left Stick Y
        let targetPitch = 0;
        if (input.keys.forward) targetPitch = -1; // Nose down
        if (input.keys.backward) targetPitch = 1; // Nose up
        if (input.gamepad) targetPitch += input.gamepad.moveY;

        // Roll: A/D or Left Stick X
        let targetRoll = 0;
        if (input.keys.left) targetRoll = 1; // Roll left
        if (input.keys.right) targetRoll = -1; // Roll right
        // Use moveX (raw) instead of steering (inverted) for inverted roll behavior (Left Stick -> Right Roll)
        // Or actually, steering is inverted (-raw).
        // If we want inverted roll (Stick Left -> Roll Right), we want Negative value for Left Stick.
        // Stick Left -> moveX (-1).
        if (input.gamepad) {
            // Use moveX if available (added in recent update), else fall back to -steering
            const rollInput = input.gamepad.moveX !== undefined ? input.gamepad.moveX : -input.gamepad.steering;
            targetRoll += rollInput;
        }

        // Yaw: Q/E or L1/R1
        let targetYaw = 0;
        if (input.keys.shiftDown) targetYaw = 1; // Left (A key)
        if (input.keys.shiftUp) targetYaw = -1;  // Right (E key)
        // Gamepad L1/R1 for yaw
        if (input.gamepad) {
            if (input.gamepad.yawLeft) targetYaw = 1;   // L1 - Yaw Left
            if (input.gamepad.yawRight) targetYaw = -1; // R1 - Yaw Right
        }

        // Throttle: Shift/Ctrl or R2/L2
        // We accumulate throttle (unlike car where it's direct mapping) ? 
        // Or direct mapping? Direct mapping is easier for casual flight.
        let targetThrottle = 0;
        if (input.keys.sprint) targetThrottle = 1.0; // Shift for max
        if (input.gamepad) targetThrottle = input.gamepad.throttle;

        // Apply smoothed inputs
        this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, 2.0 * dt);

        // Helper for smoothing logic
        const getSmoothing = (target, current, attack, decay, counter) => {
            if (Math.abs(target) < 0.001) return decay; // Input released
            if (target * current < 0) return counter;   // Counter-steering (signs opposite)
            return attack;                              // Normal acceleration
        };

        // Pitch
        const targetPitchRate = targetPitch * this.PITCH_SPEED;
        const pitchSmoothing = getSmoothing(targetPitch, this.currentPitchSpeed, this.INPUT_ATTACK_SMOOTHING, this.INPUT_DECAY_SMOOTHING, this.INPUT_COUNTER_SMOOTHING);
        this.currentPitchSpeed = THREE.MathUtils.lerp(this.currentPitchSpeed, targetPitchRate, 1.0 - Math.exp(-pitchSmoothing * dt));

        // Roll
        const targetRollRate = targetRoll * this.ROLL_SPEED;
        const rollSmoothing = getSmoothing(targetRoll, this.currentRollSpeed, this.INPUT_ATTACK_SMOOTHING, this.INPUT_DECAY_SMOOTHING, this.INPUT_COUNTER_SMOOTHING);
        this.currentRollSpeed = THREE.MathUtils.lerp(this.currentRollSpeed, targetRollRate, 1.0 - Math.exp(-rollSmoothing * dt));

        // Yaw
        const targetYawRate = targetYaw * this.YAW_SPEED;
        const yawSmoothing = getSmoothing(targetYaw, this.currentYawSpeed, this.INPUT_ATTACK_SMOOTHING, this.INPUT_DECAY_SMOOTHING, this.INPUT_COUNTER_SMOOTHING);
        this.currentYawSpeed = THREE.MathUtils.lerp(this.currentYawSpeed, targetYawRate, 1.0 - Math.exp(-yawSmoothing * dt));

        // Apply rotation
        this.mesh.rotateX(this.currentPitchSpeed * dt);
        this.mesh.rotateZ(this.currentRollSpeed * dt);
        this.mesh.rotateY(this.currentYawSpeed * dt);
    }

    _applyPhysics(dt) {
        const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(this.mesh.quaternion);

        // Direction vectors
        const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(rotationMatrix); // +Z is forward for this model? 
        // NOTE: Standard THREE.js forward is -Z. Need to check model orientation. 
        // Assuming GLB is standard: +Z might be backwards. 
        // Let's assume car convention: +Z is forward in local code, but standard is -Z.
        // If we follow car.js: this.forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);

        const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rotationMatrix);
        const right = new THREE.Vector3(1, 0, 0).applyMatrix4(rotationMatrix);

        // Forces
        const forces = new THREE.Vector3();

        // 1. Thrust (Along forward vector)
        const currentThrust = this.throttle * this.MAX_THRUST;
        forces.add(forward.clone().multiplyScalar(currentThrust));

        // 2. Gravity (World -Y)
        const gravity = (this.physicsProvider && this.physicsProvider.getGravity) ?
            this.physicsProvider.getGravity() : this.GRAVITY;
        forces.add(new THREE.Vector3(0, -gravity * this.MASS, 0));

        // 3. Aerodynamics
        const velocitySq = this.velocity.lengthSq();
        if (velocitySq > 0.1) {
            const vLen = Math.sqrt(velocitySq);
            const vDir = this.velocity.clone().normalize();

            // Drag
            // Simple drag opposing velocity
            const dragMag = 0.5 * this.AIR_DENSITY * velocitySq * this.DRAG_COEFFICIENT * this.WING_AREA;
            forces.add(vDir.clone().multiplyScalar(-dragMag));

            // Lift
            // Lift acts perpendicular to velocity, generally in the "Up" direction relative to wings
            // Simplified: Project velocity onto forward axis effectively
            // Or typically: Lift = C_L * 0.5 * rho * v^2 * A
            // We need Angle of Attack (AoA) for realistic lift.
            // Simplified for game: Lift scales with speed and alignment with horizon

            // "Arcade" Lift: Always lift along Local Up based on forward Speed
            // This allows banking to turn (Lift vector tilts)
            const forwardSpeed = this.velocity.dot(forward);
            if (forwardSpeed > 0) {
                const liftMag = 0.5 * this.AIR_DENSITY * (forwardSpeed * forwardSpeed) * this.LIFT_COEFFICIENT * this.WING_AREA;
                forces.add(up.clone().multiplyScalar(liftMag));
            }
        }

        // F = ma -> a = F/m
        const acceleration = forces.divideScalar(this.MASS);
        this.velocity.add(acceleration.multiplyScalar(dt));

        // Damping/Stability
        this.velocity.multiplyScalar(0.999); // Global air friction

        // Apply Velocity
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));

        // Terrain collision and sliding
        this._handleTerrainCollision(dt);

        // Stats
        this.speed = this.velocity.length();
        this.speedKmh = this.speed * 3.6;
        this.altitude = this.mesh.position.y;
    }

    /**
     * Handle terrain collision and sliding physics
     */
    _handleTerrainCollision(dt) {
        const pos = this.mesh.position;

        // Get terrain height at current position
        let terrainHeight = 0;
        let terrainNormal = new THREE.Vector3(0, 1, 0);

        if (this.physicsProvider) {
            terrainHeight = this.physicsProvider.getHeightAt(pos.x, pos.z);
            terrainNormal = this.physicsProvider.getNormalAt(pos.x, pos.z);
        }

        // Target height (hovering slightly above terrain)
        const targetHeight = terrainHeight + this.GROUND_HOVER_HEIGHT;

        // Check if we're at or below terrain
        if (pos.y <= targetHeight) {
            this.isGrounded = true;
            this.groundNormal.copy(terrainNormal);

            // Snap to surface
            pos.y = targetHeight;

            // Calculate velocity relative to terrain surface
            // Project velocity onto the terrain plane for sliding
            const normalVelocity = terrainNormal.clone().multiplyScalar(this.velocity.dot(terrainNormal));
            const tangentVelocity = this.velocity.clone().sub(normalVelocity);

            // If moving into the terrain, cancel that component with bounce
            if (this.velocity.dot(terrainNormal) < 0) {
                // Bounce/dampen the normal component
                this.velocity.sub(normalVelocity.multiplyScalar(1 + this.GROUND_BOUNCE));
            }

            // Apply ground friction to sliding velocity
            this.velocity.multiplyScalar(this.GROUND_FRICTION);

            // Add slight upward push to follow terrain slope
            // This helps the surfer ride up hills naturally
            const slopeInfluence = tangentVelocity.length() * 0.1;
            const upwardPush = Math.max(0, -terrainNormal.dot(new THREE.Vector3(0, -1, 0))) * slopeInfluence;
            this.velocity.y += upwardPush * dt * 10;

            // Align surfer rotation slightly with terrain normal
            this._alignToTerrain(terrainNormal, dt);

            // Get surface properties for friction variation (subtle effect)
            if (this.physicsProvider && this.physicsProvider.getSurfaceType) {
                const surface = this.physicsProvider.getSurfaceType(pos.x, pos.z);
                // Very subtle friction variation based on surface type
                const surfaceFriction = surface.friction || 1.0;
                this.velocity.multiplyScalar(0.995 + 0.005 * surfaceFriction);
            }
        } else {
            // Airborne
            this.isGrounded = false;

            // Smooth transition away from ground alignment
            // (handled by aerodynamics naturally)
        }
    }

    /**
     * Gradually align the surfer to terrain normal when grounded
     */
    _alignToTerrain(terrainNormal, dt) {
        // Get current up vector
        const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.mesh.quaternion);

        // Calculate rotation needed to align with terrain
        const alignmentStrength = 3.0; // How quickly to align
        const targetUp = terrainNormal.clone();

        // Slerp between current and target orientation
        // We only want to affect pitch and roll, not yaw
        const alignQuat = new THREE.Quaternion();
        alignQuat.setFromUnitVectors(currentUp, targetUp);

        // Apply partial rotation
        const slerpAmount = Math.min(1.0, alignmentStrength * dt);
        const identityQuat = new THREE.Quaternion();
        alignQuat.slerp(identityQuat, 1 - slerpAmount);

        this.mesh.quaternion.premultiply(alignQuat);
    }

    _updateVisuals(dt) {
        // Rotate propellers if any
        // Tilt animation for ailerons?

        // Update the luminous trail
        this._updateTrail(dt);
    }

    /**
     * Initialize the luminous trail system behind the board
     */
    _initTrailSystem() {
        // Trail configuration
        this.trailConfig = {
            maxPoints: 100,           // Number of trail segments
            minSpeed: 20,             // Minimum speed (km/h) to show trail
            maxSpeed: 400,            // Speed at full intensity
            baseWidth: 0.3,           // Base trail width
            maxWidth: 1.5,            // Maximum trail width at high speed
            fadeTime: 2.0,            // Time for trail to fade (seconds)
            colors: {
                slow: new THREE.Color(0x00ffff),    // Cyan at low speed
                medium: new THREE.Color(0xff00ff),  // Magenta at medium speed
                fast: new THREE.Color(0xffff00)     // Yellow at high speed
            }
        };

        // Trail points storage
        this.trailPoints = [];
        this.trailTimes = [];   // Time each point was created

        // Create trail geometry (ribbon style)
        this.trailGeometry = new THREE.BufferGeometry();

        // Pre-allocate buffers
        const maxVerts = this.trailConfig.maxPoints * 2;
        const positions = new Float32Array(maxVerts * 3);
        const colors = new Float32Array(maxVerts * 4);  // RGBA

        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

        // Custom shader material for glowing trail
        this.trailMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                glowIntensity: { value: 1.0 }
            },
            vertexShader: `
                attribute vec4 color;
                varying vec4 vColor;
                varying vec2 vUv;
                
                void main() {
                    vColor = color;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float glowIntensity;
                varying vec4 vColor;
                varying vec2 vUv;
                
                void main() {
                    // Pulsing glow effect
                    float pulse = 0.8 + 0.2 * sin(time * 5.0);
                    
                    // Core glow
                    vec3 glow = vColor.rgb * glowIntensity * pulse;
                    
                    // Add bloom-like effect
                    glow += vColor.rgb * 0.3;
                    
                    gl_FragColor = vec4(glow, vColor.a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
        this.trailMesh.frustumCulled = false;
        this.scene.add(this.trailMesh);

        // Secondary glow layer for extra luminosity
        this.glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                glowIntensity: { value: 0.5 }
            },
            vertexShader: `
                attribute vec4 color;
                varying vec4 vColor;
                
                void main() {
                    vColor = color;
                    // Expand vertices slightly for glow effect
                    vec3 expanded = position + normal * 0.2;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float glowIntensity;
                varying vec4 vColor;
                
                void main() {
                    float pulse = 0.7 + 0.3 * sin(time * 3.0 + 1.5);
                    vec3 glow = vColor.rgb * glowIntensity * pulse * 0.5;
                    gl_FragColor = vec4(glow, vColor.a * 0.3);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.glowMesh = new THREE.Mesh(this.trailGeometry, this.glowMaterial);
        this.glowMesh.frustumCulled = false;
        this.glowMesh.scale.setScalar(1.5);  // Slightly larger for outer glow
        this.scene.add(this.glowMesh);

        this.trailTimer = 0;
    }

    /**
     * Update the luminous trail based on current speed
     */
    _updateTrail(dt) {
        this.trailTimer += dt;

        // Update shader time
        this.trailMaterial.uniforms.time.value = this.trailTimer;
        this.glowMaterial.uniforms.time.value = this.trailTimer;

        const cfg = this.trailConfig;

        // Calculate speed-based parameters
        const speedRatio = Math.min(1, Math.max(0, (this.speedKmh - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));
        const showTrail = this.speedKmh > cfg.minSpeed;

        // Get trail spawn position (behind the board)
        const trailOffset = new THREE.Vector3(0, 0, -1.5);  // Behind the surfer
        trailOffset.applyQuaternion(this.mesh.quaternion);
        const trailPos = this.mesh.position.clone().add(trailOffset);

        // Get the "right" vector for ribbon width
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);

        // Calculate current width based on speed
        const currentWidth = cfg.baseWidth + (cfg.maxWidth - cfg.baseWidth) * speedRatio;

        // Calculate color based on speed
        const trailColor = new THREE.Color();
        if (speedRatio < 0.5) {
            trailColor.lerpColors(cfg.colors.slow, cfg.colors.medium, speedRatio * 2);
        } else {
            trailColor.lerpColors(cfg.colors.medium, cfg.colors.fast, (speedRatio - 0.5) * 2);
        }

        // Add new point if moving fast enough
        if (showTrail) {
            this.trailPoints.unshift({
                pos: trailPos.clone(),
                right: right.clone(),
                width: currentWidth,
                color: trailColor.clone(),
                alpha: 1.0
            });
            this.trailTimes.unshift(this.trailTimer);
        }

        // Remove old points
        while (this.trailPoints.length > cfg.maxPoints) {
            this.trailPoints.pop();
            this.trailTimes.pop();
        }

        // Update geometry
        const positions = this.trailGeometry.attributes.position.array;
        const colors = this.trailGeometry.attributes.color.array;

        for (let i = 0; i < cfg.maxPoints; i++) {
            const idx = i * 6;  // 2 verts per point, 3 components per vert
            const colorIdx = i * 8;  // 2 verts per point, 4 components per vert (RGBA)

            if (i < this.trailPoints.length) {
                const point = this.trailPoints[i];
                const age = this.trailTimer - this.trailTimes[i];
                const fadeAlpha = Math.max(0, 1 - (age / cfg.fadeTime));

                // Taper width towards the end
                const taperRatio = 1 - (i / this.trailPoints.length);
                const width = point.width * taperRatio * fadeAlpha;

                // Left vertex
                const left = point.pos.clone().sub(point.right.clone().multiplyScalar(width));
                positions[idx] = left.x;
                positions[idx + 1] = left.y;
                positions[idx + 2] = left.z;

                // Right vertex
                const rightPos = point.pos.clone().add(point.right.clone().multiplyScalar(width));
                positions[idx + 3] = rightPos.x;
                positions[idx + 4] = rightPos.y;
                positions[idx + 5] = rightPos.z;

                // Colors with fade
                const alpha = fadeAlpha * taperRatio * (showTrail ? 1.0 : 0.0);
                colors[colorIdx] = point.color.r;
                colors[colorIdx + 1] = point.color.g;
                colors[colorIdx + 2] = point.color.b;
                colors[colorIdx + 3] = alpha;

                colors[colorIdx + 4] = point.color.r;
                colors[colorIdx + 5] = point.color.g;
                colors[colorIdx + 6] = point.color.b;
                colors[colorIdx + 7] = alpha;
            } else {
                // Zero out unused vertices
                positions[idx] = 0;
                positions[idx + 1] = 0;
                positions[idx + 2] = 0;
                positions[idx + 3] = 0;
                positions[idx + 4] = 0;
                positions[idx + 5] = 0;

                colors[colorIdx + 3] = 0;
                colors[colorIdx + 7] = 0;
            }
        }

        // Build index array for triangle strip
        const indices = [];
        for (let i = 0; i < Math.min(this.trailPoints.length - 1, cfg.maxPoints - 1); i++) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
        }
        this.trailGeometry.setIndex(indices);

        this.trailGeometry.attributes.position.needsUpdate = true;
        this.trailGeometry.attributes.color.needsUpdate = true;

        // Update glow intensity based on speed
        const glowIntensity = 0.5 + speedRatio * 1.5;
        this.trailMaterial.uniforms.glowIntensity.value = glowIntensity;
        this.glowMaterial.uniforms.glowIntensity.value = glowIntensity * 0.5;
    }

    /**
     * Cleanup trail when needed
     */
    disposeTrail() {
        if (this.trailMesh) {
            this.scene.remove(this.trailMesh);
            this.trailGeometry.dispose();
            this.trailMaterial.dispose();
        }
        if (this.glowMesh) {
            this.scene.remove(this.glowMesh);
            this.glowMaterial.dispose();
        }
    }

    setPosition(x, y, z) {
        this.mesh.position.set(x, y, z);
        this.velocity.set(0, 0, 0);
        // Clear trail when teleporting
        this.trailPoints = [];
        this.trailTimes = [];
    }

    /**
     * Initialize the "Star Wars" style speed lines effect
     */
    _initSpeedEffect() {
        this.speedEffectConfig = {
            count: 200,             // Number of lines
            boxSize: new THREE.Vector3(40, 20, 60), // Volume size around plane
            minSpeed: 100,          // Speed (km/h) where effect starts
            maxSpeed: 800,          // Speed where effect is maxed
            maxStretch: 20.0,       // Maximum line length stretch
            color: new THREE.Color(0xaaccff), // Light blueish white
            lineWidth: 0.05         // Thickness of the lines
        };

        // We use a Mesh (Quads) to allow for line thickness
        // Each particle consists of 4 vertices (Head-Left, Head-Right, Tail-Left, Tail-Right)
        const geometry = new THREE.BufferGeometry();
        const count = this.speedEffectConfig.count;

        const positions = new Float32Array(count * 4 * 3); // 4 verts per line, 3 coords
        const offsets = new Float32Array(count * 4);       // Random offset per line
        const ends = new Float32Array(count * 4);          // 0 for head, 1 for tail
        const sides = new Float32Array(count * 4);         // -1 for left, 1 for right
        const indices = [];

        const box = this.speedEffectConfig.boxSize;

        for (let i = 0; i < count; i++) {
            // Random start position within box
            const x = (Math.random() - 0.5) * box.x;
            const y = (Math.random() - 0.5) * box.y;
            const z = (Math.random() - 0.5) * box.z; // Initial Z distribution

            const offset = Math.random() * 100.0; // Random phase
            const baseIdx = i * 4;

            // Vertex 0 (Head, Left)
            positions[baseIdx * 3 + 0] = x;
            positions[baseIdx * 3 + 1] = y;
            positions[baseIdx * 3 + 2] = z;
            offsets[baseIdx + 0] = offset;
            ends[baseIdx + 0] = 0.0;
            sides[baseIdx + 0] = -1.0;

            // Vertex 1 (Head, Right)
            positions[baseIdx * 3 + 3] = x;
            positions[baseIdx * 3 + 4] = y;
            positions[baseIdx * 3 + 5] = z;
            offsets[baseIdx + 1] = offset;
            ends[baseIdx + 1] = 0.0;
            sides[baseIdx + 1] = 1.0;

            // Vertex 2 (Tail, Left)
            positions[baseIdx * 3 + 6] = x;
            positions[baseIdx * 3 + 7] = y;
            positions[baseIdx * 3 + 8] = z;
            offsets[baseIdx + 2] = offset;
            ends[baseIdx + 2] = 1.0;
            sides[baseIdx + 2] = -1.0;

            // Vertex 3 (Tail, Right)
            positions[baseIdx * 3 + 9] = x;
            positions[baseIdx * 3 + 10] = y;
            positions[baseIdx * 3 + 11] = z;
            offsets[baseIdx + 3] = offset;
            ends[baseIdx + 3] = 1.0;
            sides[baseIdx + 3] = 1.0;

            // Indices for 2 triangles
            // 0-2-1, 1-2-3 (Standard quad winding)
            indices.push(
                baseIdx + 0, baseIdx + 2, baseIdx + 1,
                baseIdx + 1, baseIdx + 2, baseIdx + 3
            );
        }

        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
        geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
        geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));

        this.speedEffectMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                speedFactor: { value: 0 }, // 0 to 1 based on plane speed
                color: { value: this.speedEffectConfig.color },
                boxLength: { value: box.z },
                opacity: { value: 0 },
                lineWidth: { value: this.speedEffectConfig.lineWidth }
            },
            vertexShader: `
                uniform float time;
                uniform float speedFactor;
                uniform float boxLength;
                uniform float lineWidth;
                
                attribute float aOffset;
                attribute float aEnd; // 0 = head, 1 = tail
                attribute float aSide; // -1 or 1
                
                varying float vAlpha;

                void main() {
                    vec3 pos = position;
                    
                    // Animate Z movement: push everything back based on time
                    // "Speed" of particles is illusionary, we just cycle them
                    // Higher speedFactor = faster cycling
                    float flightSpeed = 100.0 * (1.0 + speedFactor * 5.0); 
                    float zOffset = -mod(time * flightSpeed + aOffset, boxLength);
                    
                    // Wrap around centered at 0
                    pos.z = pos.z + zOffset;
                    if (pos.z < -boxLength/2.0) pos.z += boxLength;
                    
                    // Stretch logic
                    // If this is the tail (aEnd == 1.0), stretch it forward (or backward?)
                    if (aEnd > 0.5) {
                        pos.z -= speedFactor * 20.0; // Max stretch
                    }
                    
                    // Billboard expansion
                    // Calculate view position for the center of the line
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                    // Direction of the line in View Space (it moves along Z axis)
                    vec3 lineDirView = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
                    lineDirView = normalize(lineDirView);

                    // Vector to camera (in view space, from vertex to origin)
                    // mvPosition is the point in view space. Camera is at (0,0,0).
                    // So vector TO camera is -mvPosition.
                    vec3 viewDir = normalize(-mvPosition.xyz);

                    // Side vector perpendicular to both line direction and view direction
                    vec3 sideDir = normalize(cross(lineDirView, viewDir));

                    // Expand perpendicular to the line
                    mvPosition.xyz += sideDir * aSide * lineWidth;
                    
                    // Calculate alpha fade based on Z position relative to box
                    float zNorm = 2.0 * pos.z / boxLength; // -1 to 1 aprox
                    vAlpha = 1.0 - smoothstep(0.8, 1.0, abs(zNorm)); 
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float opacity;
                varying float vAlpha;
                
                void main() {
                    if (opacity <= 0.01) discard;
                    gl_FragColor = vec4(color, opacity * vAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.speedLinesMesh = new THREE.Mesh(geometry, this.speedEffectMaterial);
        this.speedLinesMesh.frustumCulled = false; // Always render

        // Add to mesh so it rotates with plane? 
        this.mesh.add(this.speedLinesMesh);
    }

    _updateSpeedEffect(dt) {
        if (!this.speedLinesMesh) return;

        // Calculate speed factor (0 to 1)
        const cfg = this.speedEffectConfig;
        const speed = this.speedKmh ? this.speedKmh : 0;

        let factor = 0;
        if (speed > cfg.minSpeed) {
            factor = (speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed);
            factor = Math.min(1, Math.max(0, factor));
        }

        // Smooth opacity transition
        const targetOpacity = factor;
        const currentOpacity = this.speedEffectMaterial.uniforms.opacity.value;
        this.speedEffectMaterial.uniforms.opacity.value = THREE.MathUtils.lerp(currentOpacity, targetOpacity, dt * 2.0);

        // Pass uniforms
        this.speedEffectMaterial.uniforms.time.value += dt;
        this.speedEffectMaterial.uniforms.speedFactor.value = factor;
    }

    disposeSpeedEffect() {
        if (this.speedLinesMesh) {
            this.mesh.remove(this.speedLinesMesh);
            this.speedLinesMesh.geometry.dispose();
            this.speedEffectMaterial.dispose();
            this.speedLinesMesh = null;
        }
    }
}
