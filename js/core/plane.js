import * as THREE from 'three';
import { SparkSystem } from './spark-system.js';

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
        // ==================== PHYSICS CONSTANTS (BASE) ====================
        this.BASE_MASS = 2000.0;             // kg
        this.BASE_THRUST = 60000.0;          // Newtons
        this.BASE_HOVER = 35000.0;           // Vertical lift force
        this.BASE_REVERSE = 50000.0;         // Reverse thrust

        // Active Physics Parameters
        this.MASS = this.BASE_MASS;
        this.MAX_THRUST = this.BASE_THRUST;
        this.HOVER_FORCE = this.BASE_HOVER;
        this.REVERSE_THRUST = this.BASE_REVERSE;

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
            airbrake: false,
            hover: false,       // X button - vertical lift
            reverseThrust: 0    // L2 - brake/reverse
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
        this.speedLineDistance = 0;
        this.activeThrustMultiplier = 1.0;
        this._initSpeedEffect();


        // ==================== SPARK SYSTEM ====================
        this.sparkSystem = new SparkSystem(scene);

        // ==================== DEEP SPACE FLIGHT MODE ====================
        // When true, enables atmospheric physics (drag/damping) even in deep space
        this.atmosphereMode = true;

        // Continuous transition factor (0.0 = Full Atmosphere, 1.0 = Full Space)
        this.spaceTransitionFactor = 0.0;
    }

    /**
     * Toggle flight mode between Space (no drag) and Atmosphere (with drag)
     * Only relevant in Deep Space level
     */
    toggleFlightMode() {
        this.setAtmosphereMode(!this.atmosphereMode);
        return this.atmosphereMode;
    }

    /**
     * Set atmosphere mode directly (for automatic altitude-based switching)
     * @param {boolean} enabled - true for atmosphere mode (drag on), false for space mode
     */
    setAtmosphereMode(enabled) {
        // Wrapper for binary toggle (0 or 1)
        this.setSpaceTransitionFactor(enabled ? 0.0 : 1.0);
    }

    /**
     * Set continuous space transition factor
     * 0.0 = Full Atmosphere (1x thrust, full drag)
     * 1.0 = Full Space (Max thrust, zero drag)
     * @param {number} factor - 0 to 1
     */
    setSpaceTransitionFactor(factor) {
        factor = THREE.MathUtils.clamp(factor, 0, 1);

        // Always update state to ensure thrust multipliers are applied correctly
        this.spaceTransitionFactor = factor;
        this.atmosphereMode = (factor < 0.5); // Keep boolean for UI/Logging

        // Interpolate Thrust Multiplier
        // Unscaled (Atmosphere): 1.0
        // Scaled (Space): provider.multiplier (e.g. 100)

        let maxMultiplier = 1.0;
        if (this.physicsProvider && this.physicsProvider.getThrustMultiplier) {
            maxMultiplier = this.physicsProvider.getThrustMultiplier();
        }

        // Use Exponential Interpolation for thrust feels better than linear
        // f=0 -> 1
        // f=0.5 -> sqrt(max)  (100 -> 10)
        // f=1 -> max (100 -> 100)

        // Only scale thrust for Hybrid terrains (Space Station)
        // For pure Deep Space, we always want max thrust regardless of atmosphere mode
        let currentMultiplier = maxMultiplier;

        if (this.physicsProvider && this.physicsProvider.isHybrid && this.physicsProvider.isHybrid()) {
            currentMultiplier = Math.pow(maxMultiplier, factor);
        }

        this.activeThrustMultiplier = currentMultiplier;
        this._applyThrustMultiplier(currentMultiplier);

    }

    /**
     * Set the physics provider for terrain collision
     * @param {BasePhysicsProvider} provider - Terrain physics provider
     */
    setPhysicsProvider(provider) {
        this.physicsProvider = provider;

        // Update gravity if provided
        if (this.physicsProvider && this.physicsProvider.getGravity) {
            this.GRAVITY = this.physicsProvider.getGravity();
        } else {
            this.GRAVITY = 9.81;
        }

        // Set default flight mode for deep space
        // Default to ATMOSPHERE mode (drag on) to match original behavior
        // User can toggle to SPACE mode for zero-drag orbital mechanics
        if (this.physicsProvider?.isDeepSpace?.()) {
            this.atmosphereMode = true; // Start in atmosphere mode by default
            this.spaceTransitionFactor = 0.0;

            if (this.physicsProvider.isHybrid && this.physicsProvider.isHybrid()) {
                console.log(`[PlanePhysics] Space Station detected - starting in ATMOSPHERE mode (1x Thrust)`);
            } else {
                console.log(`[PlanePhysics] Deep Space detected - defaulting to ATMOSPHERE mode (High Thrust + Drag)`);
            }
        } else {
            this.spaceTransitionFactor = 0.0;
        }

        // Force update of multipliers based on current provider and factor
        this.setSpaceTransitionFactor(this.spaceTransitionFactor);
    }

    /**
     * Apply thrust multiplier to physics constants and visual effects
     * @param {number} multiplier 
     */
    _applyThrustMultiplier(multiplier) {
        // Apply to forces
        this.MAX_THRUST = this.BASE_THRUST * multiplier;
        this.HOVER_FORCE = this.BASE_HOVER * multiplier;
        this.REVERSE_THRUST = this.BASE_REVERSE * multiplier;

        if (multiplier !== 1.0) {
            console.log(`[PlanePhysics] Applied thrust multiplier: ${multiplier}x`);

            // Adjust speed effect thresholds to match new speed
            if (this.speedEffectConfig) {
                // Base thresholds (Based on user tuning for 1x)
                const baseMin = 100;
                const baseMax = 2200;
                const baseWidthBoost = 1.0;
                const baseBloomBoost = 1.0;

                // Physics Correction:
                // Plane top speed is limited by Drag = k * v^2 + Linear Friction.
                // Observed Top Speeds: 1x -> ~700, 50x -> ~9700 (Ratio ~14x)
                // 50^0.7 ~= 15.4x, which aligns well with the observed ratio.
                const speedScale = Math.pow(multiplier, 0.7);

                this.speedEffectConfig.minSpeed = baseMin * speedScale;
                this.speedEffectConfig.maxSpeed = baseMax * speedScale;
                this.speedEffectConfig.widthBoost = baseWidthBoost * speedScale;
                this.speedEffectConfig.bloomBoost = baseBloomBoost * speedScale;
            }

            // Update shader uniform if it exists
            if (this.speedEffectMaterial && this.speedEffectMaterial.uniforms.multiplier) {
                this.speedEffectMaterial.uniforms.multiplier.value = multiplier;
            }
        } else {
            // Reset to base
            if (this.speedEffectConfig) {
                this.speedEffectConfig.minSpeed = 100;
                this.speedEffectConfig.maxSpeed = 2200;
                this.speedEffectConfig.widthBoost = 1.0;
                this.speedEffectConfig.bloomBoost = 1.0;
            }

            if (this.speedEffectMaterial && this.speedEffectMaterial.uniforms.multiplier) {
                this.speedEffectMaterial.uniforms.multiplier.value = 1.0;
            }
        }
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
        if (this.sparkSystem) this.sparkSystem.update(dt);

        // Debug
        if (this.debug) {
            console.log(`[Plane] Spd: ${this.speedKmh.toFixed(0)} | Alt: ${this.altitude.toFixed(0)} | Thr: ${this.throttle.toFixed(2)}`);
        }
    }

    _processInput(input, dt) {
        // Map inputs to control surfaces (smoothed)

        // Ensure input objects exist to prevent crashes
        const keys = input.keys || {};
        const gamepad = input.gamepad || {};

        // Pitch: W/S or Left Stick Y
        let targetPitch = 0;
        if (keys.forward) targetPitch = -1; // Nose down
        if (keys.backward) targetPitch = 1; // Nose up
        // Gamepad (ensure gamepad object exists)
        if (gamepad.moveY !== undefined) targetPitch += gamepad.moveY;

        // Roll: A/D or Left Stick X
        let targetRoll = 0;
        if (keys.left) targetRoll = 1; // Roll left
        if (keys.right) targetRoll = -1; // Roll right

        // Gamepad Roll
        if (gamepad.moveX !== undefined) {
            // Use moveX directly
            targetRoll += gamepad.moveX;
        } else if (gamepad.steering !== undefined) {
            // Fallback to steering
            targetRoll += -gamepad.steering;
        }

        // Yaw: Q/E or L1/R1
        let targetYaw = 0;
        if (keys.shiftDown) targetYaw = 1; // Left (A key)
        if (keys.shiftUp) targetYaw = -1;  // Right (E key)

        // Gamepad Yaw
        if (gamepad.yawLeft) targetYaw = 1;   // L1 - Yaw Left
        if (gamepad.yawRight) targetYaw = -1; // R1 - Yaw Right

        // Throttle: Shift/Ctrl or R2/L2
        let targetThrottle = 0;
        if (keys.sprint) targetThrottle = 1.0; // Shift for max
        if (gamepad.throttle !== undefined) targetThrottle = gamepad.throttle;

        // Apply smoothed inputs
        this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, 2.0 * dt);

        // Hover: X key or Cross/A gamepad button
        this.input.hover = keys.hover || gamepad.hover;

        // Reverse Thrust: L2/Left Trigger (analog 0-1)
        let targetReverse = 0;
        if (keys.backward) targetReverse = 1.0;
        if (gamepad.brake !== undefined) targetReverse = Math.max(targetReverse, gamepad.brake);
        this.input.reverseThrust = THREE.MathUtils.lerp(this.input.reverseThrust, targetReverse, 3.0 * dt);

        // Airbrake (B key or Square button) - for deep space braking
        this.input.airbrake = keys.airbrake || gamepad?.airbrake || false;

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

        // Check if we're in deep space (no air resistance)
        const isDeepSpace = this.physicsProvider?.isDeepSpace?.() || false;

        // 2b. Gravitational Attraction from nearby massive objects (black holes, galaxies)
        // This is separate from Earth gravity - it pulls toward specific objects in space
        // Skip if airbrake is active (player is "anchoring" in space)
        if (this.physicsProvider?.getGravitationalForce && !(isDeepSpace && this.input.airbrake)) {
            const gravAccel = this.physicsProvider.getGravitationalForce(this.mesh.position);
            // F = m * a, so we multiply acceleration by mass
            forces.add(gravAccel.clone().multiplyScalar(this.MASS));
        }

        // 3. Aerodynamics
        const velocitySq = this.velocity.lengthSq();
        if (velocitySq > 0.1) {
            const vLen = Math.sqrt(velocitySq);
            const vDir = this.velocity.clone().normalize();

            // Drag
            // Simple drag opposing velocity
            // Scale drag by atmosphere density (1.0 - spaceTransitionFactor)
            // In full space (factor 1.0), drag becomes 0
            if (!isDeepSpace || this.spaceTransitionFactor < 1.0) {
                const atmosphereDensity = 1.0 - this.spaceTransitionFactor;
                const dragMag = 0.5 * this.AIR_DENSITY * velocitySq * this.DRAG_COEFFICIENT * this.WING_AREA * atmosphereDensity;
                forces.add(vDir.clone().multiplyScalar(-dragMag));
            }

            // Lift
            // Lift acts perpendicular to velocity, generally in the "Up" direction relative to wings
            // Simplified: Project velocity onto forward axis effectively
            // Or typically: Lift = C_L * 0.5 * rho * v^2 * A
            // We need Angle of Attack (AoA) for realistic lift.
            // Simplified for game: Lift scales with speed and alignment with horizon

            // \"Arcade\" Lift: Always lift along Local Up based on forward Speed
            // This allows banking to turn (Lift vector tilts)
            const forwardSpeed = this.velocity.dot(forward);
            if (forwardSpeed > 0) {
                let liftMag = 0.5 * this.AIR_DENSITY * (forwardSpeed * forwardSpeed) * this.LIFT_COEFFICIENT * this.WING_AREA;

                // Fix for High Speed: Clamp lift to prevent uncontrollable upward push
                // At 6000 km/h, uncapped lift generates hundreds of Gs.
                // We clamp it to something reasonable (e.g. 15 Gs) so you can still turn but don't fly into space.
                const maxGFactor = 15.0;
                const maxLift = this.MASS * 9.81 * maxGFactor;

                if (liftMag > maxLift) {
                    liftMag = maxLift;
                }

                forces.add(up.clone().multiplyScalar(liftMag));
            }
        }

        // 4. Hover Force (X button) - Vertical force relative to plane's up vector
        // This allows the plane to add vertical lift at any orientation
        if (this.input.hover) {
            forces.add(up.clone().multiplyScalar(this.HOVER_FORCE));
        }

        // 5. Reverse Thrust (L2) - Horizontal force opposite to forward direction
        // This acts like air brakes and can push the plane backwards
        if (this.input.reverseThrust > 0.01) {
            const reverseForce = this.input.reverseThrust * this.REVERSE_THRUST;
            forces.add(forward.clone().multiplyScalar(-reverseForce));
        }

        // F = ma -> a = F/m
        const acceleration = forces.divideScalar(this.MASS);
        this.velocity.add(acceleration.multiplyScalar(dt));

        // Damping/Stability
        // Skip global air friction in deep space (unless partially in atmosphere)
        if (!isDeepSpace || this.spaceTransitionFactor < 1.0) {
            // Lerp friction: 0.999 (Atmosphere) -> 1.0 (Space)
            // factor 0 -> 0.999
            // factor 1 -> 1.0
            const friction = THREE.MathUtils.lerp(0.999, 1.0, this.spaceTransitionFactor);
            this.velocity.multiplyScalar(friction);
        }

        // Airbrake (Deep Space only) - rapidly reduce velocity and cancel gravity
        if (isDeepSpace && this.input.airbrake) {
            const airbrakeStrength = 0.95; // 5% velocity reduction per frame
            this.velocity.multiplyScalar(airbrakeStrength);
        }

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

            // Get surface properties first
            let surfaceFriction = 1.0;
            if (this.physicsProvider && this.physicsProvider.getSurfaceType) {
                const surface = this.physicsProvider.getSurfaceType(pos.x, pos.z);
                surfaceFriction = surface.friction || 1.0;
            }

            // Calculate velocity relative to terrain surface
            // Project velocity onto the terrain plane for sliding
            const normalVelocity = terrainNormal.clone().multiplyScalar(this.velocity.dot(terrainNormal));
            const tangentVelocity = this.velocity.clone().sub(normalVelocity);

            // If moving into the terrain, cancel that component with bounce
            if (this.velocity.dot(terrainNormal) < 0) {
                // Bounce/dampen the normal component
                // On ice (low friction), we want NEGATIVE bounce (stickiness) to stay glued
                // factor -0.5 means we keep 50% of our downward velocity into the track
                const bounceFactor = surfaceFriction < 0.1 ? -0.5 : this.GROUND_BOUNCE;
                this.velocity.sub(normalVelocity.multiplyScalar(1 + bounceFactor));
            }

            // Apply ground friction to sliding velocity

            // Apply friction - for frictionless surfaces (surfaceFriction ~0), nearly no slowdown
            // effectiveFriction approaches 1.0 (no slowdown) as surfaceFriction approaches 0
            const effectiveFriction = surfaceFriction < 0.1
                ? 0.9995  // Nearly no friction on ice - velocity retained each frame
                : this.GROUND_FRICTION * (0.5 + 0.5 * surfaceFriction);
            this.velocity.multiplyScalar(effectiveFriction);

            // Add gravity-induced acceleration along slope
            // Slope direction: terrainNormal points "up" from terrain surface
            // For a downhill slope (+Z), the normal has a positive Z component
            // So we use the normal projected on XZ as the downhill direction
            const slopeDirXZ = new THREE.Vector3(terrainNormal.x, 0, terrainNormal.z);
            if (slopeDirXZ.lengthSq() > 0.0001) {
                slopeDirXZ.normalize();

                // Slope angle from horizontal (0 = flat, PI/2 = vertical wall)
                const slopeAngle = Math.acos(Math.min(1, Math.abs(terrainNormal.y)));

                // Gravity component along slope = g * sin(angle)
                // On frictionless ice, we get the full gravity component
                const gravityAlongSlope = this.GRAVITY * Math.sin(slopeAngle);
                const frictionForce = gravityAlongSlope * surfaceFriction;
                const netAcceleration = Math.max(0, gravityAlongSlope - frictionForce);

                // Scale up for game feel - gravity should be very noticeable
                const accelerationScale = 5.0;

                // Apply acceleration in downhill direction
                this.velocity.add(slopeDirXZ.multiplyScalar(netAcceleration * accelerationScale * dt));
            }

            // Artificial Downforce for ice (magnetic track effect)
            // Keeps the plane glued to the surface even on convex slopes
            if (surfaceFriction < 0.1) {
                const downforce = 100.0 + this.speed * 1.0;
                this.velocity.add(terrainNormal.clone().multiplyScalar(-downforce * dt));
            }

            // Add slight upward push to follow terrain slope
            // This helps the surfer ride up hills naturally
            // DISABLE on ice - we want to slide down, not be pushed up
            if (surfaceFriction > 0.1) {
                const slopeInfluence = tangentVelocity.length() * 0.1;
                const upwardPush = Math.max(0, -terrainNormal.dot(new THREE.Vector3(0, -1, 0))) * slopeInfluence;
                this.velocity.y += upwardPush * dt * 10;
            }

            // Align surfer rotation slightly with terrain normal
            this._alignToTerrain(terrainNormal, dt);

            // Emit sparks if sliding fast enough (less sparks on ice)
            const sparkThreshold = surfaceFriction < 0.1 ? 50.0 : 10.0; // Higher threshold on frictionless ice
            if (this.speedKmh > sparkThreshold) {
                // Determine contact point (bottom of mesh?)
                const contactPos = pos.clone();
                contactPos.y -= 0.5; // Approximate bottom of fuselage/skids

                // Intensity based on speed
                const intensity = Math.min(1.0, (this.speedKmh - sparkThreshold) / 100.0) * surfaceFriction;
                if (intensity > 0.01) {
                    this.sparkSystem.emit(contactPos, this.velocity, intensity);
                }
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
            trailStartOffset: 2.5,    // Distance behind surfer where trail starts
            startFadeSpeed: 2.0,      // How fast new points fade in (lower = more gradual)
            colors: {
                slow: new THREE.Color(0x00ffff),    // Cyan at low speed
                medium: new THREE.Color(0xff00ff),  // Magenta at medium speed
                fast: new THREE.Color(0xffff00)     // Yellow at high speed
            }
        };

        // Ground illumination light - follows the trail and lights up the ground
        this.trailLight = new THREE.PointLight(0xff00ff, 0, 15, 2);
        this.trailLight.castShadow = false;
        this.scene.add(this.trailLight);

        // Trail points storage
        this.trailPoints = [];
        this.trailTimes = [];   // Time each point was created

        // Create trail geometry (ribbon style)
        this.trailGeometry = new THREE.BufferGeometry();

        // Pre-allocate buffers
        const maxVerts = this.trailConfig.maxPoints * 2;
        const positions = new Float32Array(maxVerts * 3);
        const colors = new Float32Array(maxVerts * 4);  // RGBA
        const uvs = new Float32Array(maxVerts * 2);

        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        this.trailGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

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
                    // Soft edges calculation (Cylindrical look)
                    // UV.x goes from 0 to 1 across the width. Center is 0.5
                    float distFromCenter = abs(vUv.x - 0.5) * 2.0; // 0 at center, 1 at edges
                    
                    // Soft falloff at edges
                    float alphaShape = 1.0 - smoothstep(0.4, 1.0, distFromCenter);
                    
                    // Hot core effect
                    float core = 1.0 - smoothstep(0.0, 0.4, distFromCenter);
                    vec3 coreColor = vec3(1.0); // White core
                    
                    // Mix core with base color
                    vec3 finalColor = mix(vColor.rgb, coreColor, core * 0.5);
                    
                    // Add pulse
                    float pulse = 0.9 + 0.1 * sin(time * 8.0 - vUv.y * 10.0);
                    
                    // Final alpha composition
                    float finalAlpha = vColor.a * alphaShape * pulse;
                    
                    // Boost glow
                    finalColor *= glowIntensity * 1.5;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
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

        // Removed secondary glowMesh for cleaner look and better performance

        this.trailTimer = 0;
    }

    /**
     * Update the luminous trail based on current speed
     */
    _updateTrail(dt) {
        this.trailTimer += dt;

        // Update shader time
        this.trailMaterial.uniforms.time.value = this.trailTimer;

        const cfg = this.trailConfig;

        // Calculate speed-based parameters
        const speedRatio = Math.min(1, Math.max(0, (this.speedKmh - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));
        const showTrail = this.speedKmh > cfg.minSpeed;

        // Get trail spawn position (behind the board)
        const trailOffset = new THREE.Vector3(0, 0, -cfg.trailStartOffset);  // Further from board for better blending
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

        // Add new point if moving fast enough or to maintain continuity while stopping
        // Always add point but control alpha? No, limit checks are safer for performace.
        if (showTrail) {
            this.trailPoints.unshift({
                pos: trailPos.clone(),
                right: right.clone(),
                width: currentWidth,
                color: trailColor.clone(),
                alpha: 1.0,
                initialTime: this.trailTimer
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
        const uvs = this.trailGeometry.attributes.uv.array;

        for (let i = 0; i < cfg.maxPoints; i++) {
            const idx = i * 6;  // 2 verts per point, 3 components per vert
            const colorIdx = i * 8;  // 2 verts per point, 4 components per vert (RGBA)
            const uvIdx = i * 4;     // 2 verts per point, 2 components per vert

            if (i < this.trailPoints.length) {
                const point = this.trailPoints[i];
                const age = this.trailTimer - this.trailTimes[i];
                const fadeAlpha = Math.max(0, 1 - (age / cfg.fadeTime));

                // Start fade (near the plane)
                // Fade in over the first few segments/time to blend with surfer
                // "Age" is small for new points - use cfg.startFadeSpeed for more gradual blending
                const startFade = Math.min(1.0, age * cfg.startFadeSpeed); // Gradual fade-in for smoother blending

                // Taper width towards the end
                const taperRatio = 1 - (i / this.trailPoints.length);
                const width = point.width * taperRatio * fadeAlpha;

                // Left vertex
                const left = point.pos.clone().sub(point.right.clone().multiplyScalar(width));
                positions[idx] = left.x;
                positions[idx + 1] = left.y;
                positions[idx + 2] = left.z;

                // UVs for Left (x=0)
                uvs[uvIdx] = 0.0;     // U
                uvs[uvIdx + 1] = i / cfg.maxPoints; // V (along length)

                // Right vertex
                const rightPos = point.pos.clone().add(point.right.clone().multiplyScalar(width));
                positions[idx + 3] = rightPos.x;
                positions[idx + 4] = rightPos.y;
                positions[idx + 5] = rightPos.z;

                // UVs for Right (x=1)
                uvs[uvIdx + 2] = 1.0; // U
                uvs[uvIdx + 3] = i / cfg.maxPoints; // V

                // Colors with fade
                const alpha = fadeAlpha * taperRatio * startFade * (showTrail ? 1.0 : 0.0);

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

        // Build index array for triangle strip (only do this once if constant, but points change)
        // Actually indices are constant if maxPoints is constant.
        // But we initialized them in init? No, we rebuilt them.
        // Optimally we should just build indices once in init unless we change point count dynamically.
        // Assuming maxPoints is constant, we can move this to init, but for now let's leave it or optimize.

        // OPTIMIZATION: Move index generation to init if it was there? 
        // Logic check: previous code rebuilt indices every frame. That's inefficient but safe. 
        // I will keep it for now but note it's not strictly necessary to rebuild if count is static.

        const indices = [];
        for (let i = 0; i < Math.min(this.trailPoints.length - 1, cfg.maxPoints - 1); i++) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
        }
        this.trailGeometry.setIndex(indices);

        this.trailGeometry.attributes.position.needsUpdate = true;
        this.trailGeometry.attributes.color.needsUpdate = true;
        this.trailGeometry.attributes.uv.needsUpdate = true;

        // Update glow intensity based on speed
        const glowIntensity = 1.0 + speedRatio * 2.0;
        this.trailMaterial.uniforms.glowIntensity.value = glowIntensity;

        // Update ground illumination light
        if (this.trailLight && this.trailPoints.length > 3) {
            // Position light at a recent trail point, slightly above ground
            const lightPoint = this.trailPoints[3]; // Use 3rd point for slight offset
            this.trailLight.position.copy(lightPoint.pos);
            this.trailLight.position.y -= 0.3; // Position closer to ground for better illumination

            // Set light color to match trail color
            this.trailLight.color.copy(lightPoint.color);

            // Intensity based on speed and trail visibility
            const lightIntensity = showTrail ? (2.0 + speedRatio * 4.0) : 0;
            this.trailLight.intensity = THREE.MathUtils.lerp(
                this.trailLight.intensity,
                lightIntensity,
                dt * 5.0
            );

            // Distance (range) based on speed
            this.trailLight.distance = 10 + speedRatio * 15;
        } else if (this.trailLight) {
            // Fade out when no trail
            this.trailLight.intensity = THREE.MathUtils.lerp(
                this.trailLight.intensity,
                0,
                dt * 5.0
            );
        }
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
        if (this.trailLight) {
            this.scene.remove(this.trailLight);
            this.trailLight.dispose();
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
            count: 2000,            // Increased density for larger volume
            boxSize: new THREE.Vector3(40, 20, 1000), // Larger box to prevent strobing at high speeds
            minSpeed: 300,          // Speed (km/h) where effect starts
            maxSpeed: 2000,          // Speed where effect is maxed
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
                lineWidth: { value: this.speedEffectConfig.lineWidth },
                multiplier: { value: 1.0 }, // Thrust multiplier
                travelDistance: { value: 0 } // Accumulated distance
            },
            vertexShader: `
                uniform float time;
                uniform float speedFactor;
                uniform float boxLength;
                uniform float lineWidth;
                uniform float multiplier;
                uniform float travelDistance;
                
                attribute float aOffset;
                attribute float aEnd; // 0 = head, 1 = tail
                attribute float aSide; // -1 or 1
                
                varying float vAlpha;
                varying float vMultiplier;

                void main() {
                    vMultiplier = multiplier;
                    vec3 pos = position;
                    
                    // Animate Z movement using accumulated distance
                    // This prevents jumps when speed changes
                    // travelDistance is already accumulated and modulo'd on CPU
                    float zOffset = -mod(travelDistance + aOffset, boxLength);
                    
                    pos.z = pos.z + zOffset;
                    if (pos.z < -boxLength/2.0) pos.z += boxLength;
                    
                    // Stretch logic
                    if (aEnd > 0.5) {
                        float stretch = 20.0 * (1.0 + log(multiplier) * 1.5);
                        pos.z -= speedFactor * stretch; 
                    }
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vec3 lineDirView = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
                    vec3 viewDir = normalize(-mvPosition.xyz);
                    vec3 sideDir = normalize(cross(lineDirView, viewDir));

                    // Boost line width with multiplier so they don't become invisible thin threads
                    // Dampened Logarithmic scaling
                    // Combined with SpeedFactor: Use speedFactor to ensure they start thin and grow appropriately
                    // REMOVED: User wants exact 1x visuals. No width boost.
                    float dynamicWidthBoost = 1.0;
                    mvPosition.xyz += sideDir * aSide * lineWidth * dynamicWidthBoost;
                    
                    float zNorm = 2.0 * pos.z / boxLength; 
                    vAlpha = 1.0 - smoothstep(0.8, 1.0, abs(zNorm)); 
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float opacity;
                varying float vAlpha;
                varying float vMultiplier;
                
                void main() {
                    if (opacity <= 0.01) discard;
                    
                    // Boost Brightness for Bloom
                    // REMOVED: User wants exact 1x visuals. No bloom boost.
                    float currentBoost = 1.0;
                    
                    vec3 finalColor = color * currentBoost;
                    
                    // Boost Opacity
                    // Ensure it stays solid at high speeds
                    float finalOpacity = opacity * vAlpha;
                    // REMOVED: No opacity boost for high multipliers.
                    
                    gl_FragColor = vec4(finalColor, finalOpacity);
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

        // Accumulate distance for smooth scrolling
        // Calculate instantaneous flight speed (logic moved from shader)
        const mult = this.activeThrustMultiplier || 1.0;
        const flightSpeed = 100.0 * (1.0 + factor * 5.0 * Math.sqrt(mult));

        // Accumulate and modulo on CPU to prevent float precision issues (jitter) often seen at high values
        // Box length is now 1000
        const boxLength = this.speedEffectConfig.boxSize.z;
        this.speedLineDistance += flightSpeed * dt;
        this.speedLineDistance = this.speedLineDistance % boxLength;

        this.speedEffectMaterial.uniforms.travelDistance.value = this.speedLineDistance;

        // Debug scaling
        if (this.mesh.visible && Math.random() < 0.01) {
            const mult = this.activeThrustMultiplier || 1.0;
            // console.log(`[PlanePhysics] Speed: ${Math.round(speed)} / ${Math.round(cfg.maxSpeed)} (Mult: ${mult.toFixed(1)})`);
        }
    }

    disposeSpeedEffect() {
        if (this.speedLinesMesh) {
            this.mesh.remove(this.speedLinesMesh);
            this.speedLinesMesh.geometry.dispose();
            this.speedEffectMaterial.dispose();
            this.speedLinesMesh = null;
        }
    }

    /**
     * Set min/max speed for speed lines effect
     * @param {number} min - Speed in km/h where effect starts
     * @param {number} max - Speed in km/h where effect is maxed
     */
    setSpeedThresholds(min, max) {
        if (this.speedEffectConfig) {
            this.speedEffectConfig.minSpeed = min;
            this.speedEffectConfig.maxSpeed = max;
        }
    }
}
