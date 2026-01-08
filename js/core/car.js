import * as THREE from 'three';

/**
 * Realistic Car Physics System
 * Features: Raycast suspension, tire slip model, engine/gearbox simulation
 */
export class CarPhysics {
    constructor(carMesh, terrain, scene, carSpec = null) {
        this.mesh = carMesh;
        this.terrain = terrain;
        this.scene = scene;
        this.debug = false;
        this.debugGroup = null;

        // ==================== SCALE FACTOR ====================
        // Reconciles visual scale (4.5x) with real-world physics
        this.SCALE = 4.5;

        // ==================== VEHICLE SPECS ====================
        // Use injected spec or build from defaults
        if (carSpec) {
            this.specs = this._buildGameSpecs(carSpec);
        } else {
            // Fallback to legacy hardcoded specs
            this.specs = this._getLegacySpecs();
        }

        // ==================== STATE ====================
        this.position = new THREE.Vector3(0, 2, 0); // Start closer to ground (was 10)
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.angularVelocity = new THREE.Vector3();

        // Derived - Note: In Three.js, -Z is forward
        this.forward = new THREE.Vector3(0, 0, 1);
        this.right = new THREE.Vector3(0, 0, 0);
        this.up = new THREE.Vector3(0, 1, 0);

        this.speed = 0;
        this.speedKmh = 0;
        this.rpm = this.specs.idleRPM;
        this.gear = 1;
        this.gearIndex = 2;
        this.isShifting = false;
        this.shiftTimer = 0;
        this.manualGearMode = true; // Enable manual shifting by default

        // Wheel states (FL, FR, RL, RR)
        this.wheels = [
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, -1.0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },   // FL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, -1.0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },    // FR
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, -1.0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },  // RL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, -1.0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 }   // RR
        ];

        this.steerAngle = 0;
        this.throttleInput = 0;
        this.brakeInput = 0;
        this.handbrakeInput = 0;

        // Headlights
        this.headlightsOn = false;
        this._createHeadlights();

        // Taillights (rear lights)
        this.taillightsOn = false;
        this.isBraking = false;
        this._createTaillights();
    }

    /**
     * Build game-world specs from real-world car specification
     * Applies scale factor to physics values
     */
    _buildGameSpecs(spec) {
        const S = this.SCALE;

        return {
            // Mass (unchanged - force scales, mass is constant)
            mass: spec.mass,

            // Dimensions (already in game units from spec)
            wheelBase: spec.dimensions.wheelBase,
            trackWidth: spec.dimensions.trackWidth,
            cgHeight: spec.dimensions.cgHeight,
            width: spec.dimensions.width,
            height: spec.dimensions.height,
            length: spec.dimensions.length,

            // Suspension (game-tuned values from spec)
            suspensionRestLength: spec.suspension.restLength,
            suspensionTravel: spec.suspension.travel,
            springStrength: spec.suspension.stiffness,
            damperStrength: spec.suspension.damping,

            // Wheels
            wheelRadius: spec.dimensions.wheelRadius,

            // Engine - scale torque by S² for proper force scaling
            maxPower: 500000, // Game feel - kept high
            maxTorque: spec.engine.maxTorque * S * S, // 150 * 20.25 = 3037.5 Nm
            redlineRPM: spec.engine.redlineRPM,
            idleRPM: spec.engine.idleRPM,

            // Transmission (direct from spec)
            gearRatios: spec.transmission.gears,
            finalDrive: spec.transmission.finalDrive,
            shiftTime: spec.transmission.shiftTime,

            // Steering
            maxSteerAngle: spec.steering.maxAngle,
            steerSpeed: spec.steering.speed,

            // Tires
            gripCoefficient: spec.tires.gripCoefficient,
            slipAnglePeak: spec.tires.slipAnglePeak,
            rollingResistance: spec.tires.rollingResistance,

            // Aerodynamics - scale air density by 1/S³
            dragCoefficient: spec.dragCoefficient,
            frontalArea: spec.frontalArea,
            airDensity: 1.225 / Math.pow(S, 3), // ≈ 0.0134
            downforce: spec.aero.downforce,

            // Scaled gravity (for reference in calculations)
            gravity: 9.81 * S, // 44.145 m/s²

            // Visual offset
            visualOffsetY: spec.visualOffset?.y || -3.3
        };
    }


    /**
     * Create headlights for the car
     */
    _createHeadlights() {
        this.headlights = [];

        // Headlight positions (front left and front right) - at front of car hitbox
        const frontZ = this.specs.length / 2;  // Front edge of car
        const headlightPositions = [
            { x: -2.2, y: 1.5, z: frontZ },  // Left headlight
            { x: 2.2, y: 1.5, z: frontZ }    // Right headlight
        ];

        headlightPositions.forEach((pos, index) => {
            // Main spotlight (low beam) - wider angle, medium range
            const spotlight = new THREE.SpotLight(0xfff8e8, 0, 600, Math.PI / 3.5, 0.3, 0.8);
            spotlight.position.set(pos.x, pos.y, pos.z);
            spotlight.castShadow = true;
            spotlight.shadow.mapSize.width = 1024;
            spotlight.shadow.mapSize.height = 1024;

            // Create target for the spotlight (points forward and slightly down)
            const target = new THREE.Object3D();
            target.position.set(pos.x * 0.3, pos.y - 10, pos.z + 150);

            spotlight.target = target;

            this.mesh.add(spotlight);
            this.mesh.add(target);

            this.headlights.push({ light: spotlight, target: target, type: 'main' });

            // High beam spotlight - narrower, longer range
            const highBeam = new THREE.SpotLight(0xffffff, 0, 1000, Math.PI / 6, 0.15, 0.6);
            highBeam.position.set(pos.x, pos.y, pos.z);

            const highBeamTarget = new THREE.Object3D();
            highBeamTarget.position.set(pos.x * 0.2, pos.y - 6, pos.z + 400);
            highBeam.target = highBeamTarget;

            this.mesh.add(highBeam);
            this.mesh.add(highBeamTarget);

            this.headlights.push({ light: highBeam, target: highBeamTarget, type: 'highbeam' });

            // Add a point light for local/ground illumination
            const pointLight = new THREE.PointLight(0xfff5e6, 0, 120, 1.2);
            pointLight.position.set(pos.x, pos.y - 0.5, pos.z + 2);
            this.mesh.add(pointLight);
            this.headlights.push({ light: pointLight, type: 'point' });
        });

        // Add center flood light for road illumination
        const floodLight = new THREE.SpotLight(0xfff8e8, 0, 500, Math.PI / 2.5, 0.4, 1.0);
        floodLight.position.set(0, 2.0, frontZ);
        const floodTarget = new THREE.Object3D();
        floodTarget.position.set(0, -8, frontZ + 150);
        floodLight.target = floodTarget;
        this.mesh.add(floodLight);
        this.mesh.add(floodTarget);
        this.headlights.push({ light: floodLight, target: floodTarget, type: 'flood' });

        // Add headlight glow meshes (visible light sources)
        this.headlightGlows = [];
        headlightPositions.forEach((pos) => {
            const glowGeom = new THREE.SphereGeometry(0.5, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0xffffcc,
                transparent: true,
                opacity: 0
            });
            const glow = new THREE.Mesh(glowGeom, glowMat);
            glow.position.set(pos.x, pos.y, pos.z + 0.3);
            this.mesh.add(glow);
            this.headlightGlows.push(glow);
        });
    }

    /**
     * Create taillights (rear red lights) for the car
     */
    _createTaillights() {
        this.taillights = [];
        this.taillightGlows = [];

        // Taillight positions (rear left and rear right) - at back of car
        const rearZ = -this.specs.length / 2;  // Rear edge of car
        const taillightPositions = [
            { x: -2., y: 3, z: rearZ },  // Left taillight
            { x: 2, y: 3, z: rearZ }    // Right taillight
        ];

        taillightPositions.forEach((pos) => {
            // Main rear light (always dim red at night, bright when braking)
            const rearLight = new THREE.PointLight(0xff0000, 0, 50, 1.5);
            rearLight.position.set(pos.x, pos.y, pos.z);
            this.mesh.add(rearLight);
            this.taillights.push({ light: rearLight, type: 'rear' });

            // Spotlight pointing backward for brake light effect on ground
            const brakeSpot = new THREE.SpotLight(0xff0000, 0, 100, Math.PI / 4, 0.5, 1.0);
            brakeSpot.position.set(pos.x, pos.y, pos.z);

            const brakeTarget = new THREE.Object3D();
            brakeTarget.position.set(pos.x, pos.y - 5, pos.z - 50);
            brakeSpot.target = brakeTarget;

            this.mesh.add(brakeSpot);
            this.mesh.add(brakeTarget);
            this.taillights.push({ light: brakeSpot, target: brakeTarget, type: 'brakespot' });
        });

        // Add taillight glow meshes (invisible - only the light effect is visible)
        taillightPositions.forEach((pos) => {
            const glowGeom = new THREE.SphereGeometry(0.4, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0,
                visible: false
            });
            const glow = new THREE.Mesh(glowGeom, glowMat);
            glow.visible = false;  // Hide the bulb mesh entirely
            glow.position.set(pos.x, pos.y, pos.z - 0.3);
            this.mesh.add(glow);
            this.taillightGlows.push(glow);
        });
    }

    /**
     * Update taillights based on night time and braking
     * @param {boolean} isNight - Whether it's currently night time
     * @param {boolean} isBraking - Whether the car is currently braking
     */
    updateTaillights(isNight, isBraking) {
        this.taillightsOn = isNight;
        this.isBraking = isBraking;

        // Determine light intensities
        // Night mode: dim red lights always on
        // Braking: bright red lights (day or night)
        const nightBaseIntensity = isNight ? 3.0 : 0;
        const brakeIntensity = isBraking ? 15.0 : 0;
        const brakeSpotIntensity = isBraking ? 25.0 : 0;

        this.taillights.forEach((tl) => {
            if (tl.type === 'rear') {
                // Combine night base + brake boost
                tl.light.intensity = nightBaseIntensity + brakeIntensity;
            } else if (tl.type === 'brakespot') {
                // Brake spotlight only active when braking
                tl.light.intensity = brakeSpotIntensity;
            }
        });

        // Update glow opacity
        const nightGlowOpacity = isNight ? 0.4 : 0;
        const brakeGlowOpacity = isBraking ? 1.0 : 0;
        const totalGlowOpacity = Math.min(nightGlowOpacity + brakeGlowOpacity, 1.0);

        this.taillightGlows.forEach((glow) => {
            glow.material.opacity = totalGlowOpacity;
            // Make the glow color brighter when braking
            if (isBraking) {
                glow.material.color.setHex(0xff2200);  // Brighter red-orange
            } else {
                glow.material.color.setHex(0xff0000);  // Normal red
            }
        });
    }

    /**
     * Set headlights on or off
     * @param {boolean} on - Whether headlights should be on
     */
    setHeadlights(on) {
        if (this.headlightsOn === on) return;

        this.headlightsOn = on;

        this.headlights.forEach((hl) => {
            if (hl.type === 'main') {
                hl.light.intensity = on ? 50.0 : 0;  // Very bright low beams
            } else if (hl.type === 'highbeam') {
                hl.light.intensity = on ? 80.0 : 0;  // Extremely bright high beams for distance
            } else if (hl.type === 'point') {
                hl.light.intensity = on ? 15.0 : 0;  // Strong local illumination
            } else if (hl.type === 'flood') {
                hl.light.intensity = on ? 35.0 : 0;  // Powerful flood light for road
            }
        });

        this.headlightGlows.forEach((glow) => {
            glow.material.opacity = on ? 1.0 : 0;
        });
    }

    /**
     * Toggle headlights on/off
     */
    toggleHeadlights() {
        this.setHeadlights(!this.headlightsOn);
    }

    /**
     * Main physics update
     */
    update(deltaTime, input) {
        // Clamp deltaTime 
        const dt = Math.min(deltaTime, 0.05); // Allow slightly larger steps, clamp for stability

        // Update inputs
        this.throttleInput = input.throttle;
        this.brakeInput = input.brake;
        this.handbrakeInput = input.handbrake;

        // Steering 
        const speedFactor = 1 - Math.min(Math.abs(this.speed) / 60, 0.6); // Less reduction for larger turns
        const targetSteer = input.steering * this.specs.maxSteerAngle * speedFactor;
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, this.specs.steerSpeed * dt * 10);

        // Update direction vectors
        this._updateDirections();

        // ==================== FULL PHYSICS ====================
        let totalForce = new THREE.Vector3();
        let totalTorque = new THREE.Vector3();

        // 1. Gravity - uses scaled gravity (g * SCALE) from spec
        totalForce.y -= this.specs.mass * this.specs.gravity;

        // 2. Aerodynamic Drag
        const speedSquared = this.velocity.lengthSq();
        if (speedSquared > 0.1) {
            const dragMagnitude = 0.5 * this.specs.airDensity * this.specs.dragCoefficient * this.specs.frontalArea * speedSquared;
            const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMagnitude);
            totalForce.add(dragForce);
        }

        // 3. Suspension & Tire Forces
        let groundedWheels = 0;
        for (let i = 0; i < 4; i++) {
            const { force, torque } = this._processWheel(i, dt);
            totalForce.add(force);
            totalTorque.add(torque);
            if (this.wheels[i].grounded) groundedWheels++;
        }

        // 4. Stabilizer bars (Anti-roll)
        // Simplified: prevent excessive roll by applying restoring torque
        // (Optional, can add later if rolls too much)

        // ==================== INTEGRATE ====================

        // Linear: F = ma -> a = F/m
        const acceleration = totalForce.clone().divideScalar(this.specs.mass);
        this.velocity.addScaledVector(acceleration, dt);

        // Terminals and Damping
        this.velocity.x *= 0.999; // Air resistance / friction drift
        this.velocity.z *= 0.999;

        // Position
        this.position.addScaledVector(this.velocity, dt);

        // Angular: Torque -> Angular Accel
        // Approximate inertia tensor (Box)
        const w = this.specs.trackWidth;
        const h = 1.5; // Est height
        const l = this.specs.wheelBase;
        const mass = this.specs.mass;

        // Moments of inertia (box)
        const Ix = (mass / 12) * (h * h + w * w) * 2; // Roll inertia (boosted for stability)
        const Iy = (mass / 12) * (w * w + l * l);     // Yaw inertia
        const Iz = (mass / 12) * (h * h + l * l) * 2; // Pitch inertia (boosted)

        this.angularVelocity.x += (totalTorque.x / Ix) * dt;
        this.angularVelocity.y += (totalTorque.y / Iy) * dt;
        this.angularVelocity.z += (totalTorque.z / Iz) * dt;

        // Angular Damping
        this.angularVelocity.multiplyScalar(0.98);

        // Apply Rotation
        const rotationChange = new THREE.Euler(
            this.angularVelocity.x * dt,
            this.angularVelocity.y * dt,
            this.angularVelocity.z * dt
        );

        // Rotate quaternion
        const rotQuat = new THREE.Quaternion().setFromEuler(this.rotation);
        const deltaQuat = new THREE.Quaternion().setFromEuler(rotationChange);
        rotQuat.multiply(deltaQuat);
        this.rotation.setFromQuaternion(rotQuat, 'YXZ');

        // Ground constraint (Emergency) - prevent falling through world if physics explodes
        const groundHeight = this.terrain.getHeightAt(this.position.x, this.position.z);
        if (this.position.y < groundHeight + 0.5) {
            // Only push up if deeply underground (tunneling fix)
            if (this.position.y < groundHeight - 2) {
                this.position.y = groundHeight + 2;
                this.velocity.y = 0;
            }
        }


        // Handle manual gear shifts from input
        if (input.shiftUp) {
            this.shiftUp();
            input.shiftUp = false; // Consume the input
        }
        if (input.shiftDown) {
            this.shiftDown();
            input.shiftDown = false; // Consume the input
        }

        // Update engine/transmission
        this._updateDrivetrain(dt);

        // Auto-shift only if not in manual mode
        if (!this.manualGearMode) {
            this._autoShift();
        }

        // Update mesh
        this._updateMesh();

        // Calculate speed for UI
        this.speed = this.velocity.dot(this.forward);
        this.speedKmh = Math.abs(this.speed * 3.6);

        this._updateDebug();

        // Debug Log (Periodic)
        if (!this._logTimer) this._logTimer = 0;
        this._logTimer += dt;
        if (this._logTimer > 1.0) {
            this._logTimer = 0;
            console.log(`[Car] Speed: ${this.speedKmh.toFixed(1)} km/h | RPM: ${Math.floor(this.rpm)} | Gear: ${this.getGearDisplay()} | Throttle: ${this.throttleInput.toFixed(2)}`);
            console.log(`[Suspension] FL: ${this.wheels[0].compression.toFixed(2)} | Force: ${this.wheels[0].forceVal?.toFixed(0)} | Grounded: ${this.wheels[0].grounded}`);
        }
    }

    _updateDirections() {
        const quaternion = new THREE.Quaternion().setFromEuler(this.rotation);
        // Forward is +Z in car local space (front of car)
        this.forward.set(0, 0, 1).applyQuaternion(quaternion);
        this.right.set(1, 0, 0).applyQuaternion(quaternion);
        this.up.set(0, 1, 0).applyQuaternion(quaternion);
    }

    /**
     * Process a single wheel - suspension, tire forces
     */
    _processWheel(index, dt) {
        const wheel = this.wheels[index];
        const isFront = index < 2;
        const isLeft = index % 2 === 0;

        // Calculate wheel world position
        const wheelWorldPos = this.position.clone();
        const localOffset = wheel.offset.clone();
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
        wheelWorldPos.add(localOffset);

        // Raycast down for ground contact
        const rayOrigin = wheelWorldPos.clone();
        rayOrigin.y += this.specs.suspensionRestLength;

        const groundHeight = this.terrain.getHeightAt(rayOrigin.x, rayOrigin.z);
        const rayLength = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;
        const distanceToGround = rayOrigin.y - groundHeight;

        let force = new THREE.Vector3();
        let torque = new THREE.Vector3();

        if (distanceToGround < rayLength) {
            // Wheel is touching ground
            wheel.grounded = true;

            // Suspension compression
            const compression = rayLength - distanceToGround;
            // Bump Stop Force (Exponential or stiff linear)
            let extraForce = 0;
            const maxCompress = this.specs.suspensionTravel; // Hit stop exactly at travel limit
            if (compression > maxCompress) {
                // Bottomed out
                const penetration = compression - maxCompress;
                const bumpStiffness = 50000;    // Reduced to prevent explosion
                const bumpDamping = 5000;       // Damping
                extraForce = (penetration * bumpStiffness) - (wheel.velocity * bumpDamping);
                extraForce = Math.max(0, extraForce); // Only push up
            }

            const compressionRatio = Math.min(compression / this.specs.suspensionTravel, 1.5); // Allow over-compression calculation
            const prevCompression = wheel.compression;
            wheel.compression = compressionRatio;

            // Suspension velocity
            wheel.velocity = (compressionRatio - prevCompression) / dt;

            // Spring force (Hooke's law) + Damping
            const springForce = compressionRatio * this.specs.suspensionTravel * this.specs.springStrength;
            const damperForce = wheel.velocity * this.specs.damperStrength;

            // Correct Damping: Resists motion (Spring + Damper)
            let suspensionForce = springForce + damperForce + extraForce;

            // Clamp total force to avoid explosions (max ~20 tons)
            suspensionForce = Math.max(0, Math.min(suspensionForce, 200000));

            // Apply suspension force - primarily in world UP direction for stability
            // Using ground normal directly causes instability when tilted (car flips around single wheel contact)
            const groundNormal = this.terrain.getNormalAt(wheelWorldPos.x, wheelWorldPos.z);

            // Blend between world up (stable) and ground normal (terrain following)
            // Heavy bias toward world-up prevents flip-inducing torques
            const worldUp = new THREE.Vector3(0, 1, 0);
            const blendedNormal = new THREE.Vector3()
                .addScaledVector(worldUp, 0.85)      // 85% world up for stability
                .addScaledVector(groundNormal, 0.15) // 15% ground normal for terrain adaptation
                .normalize();

            const suspForceVec = blendedNormal.clone().multiplyScalar(suspensionForce);
            force.add(suspForceVec);

            // CRITICAL: Suspension torque calculation
            // The lever arm is the offset from car's center of mass to the wheel contact point
            // We need to use the world-space offset for proper torque calculation
            const leverArm = localOffset.clone(); // World-space offset from car center

            // Only calculate stabilizing torque - this helps level the car
            // Use only the horizontal components of lever arm to prevent flip-inducing moments
            const horizontalLever = new THREE.Vector3(leverArm.x, 0, leverArm.z);
            const suspTorque = new THREE.Vector3().crossVectors(horizontalLever, suspForceVec);
            torque.add(suspTorque);

            // Calculate tire forces
            const tireForces = this._calculateTireForces(index, suspensionForce, dt);
            force.add(tireForces);

            // Calculate torque from tire forces
            const tireTorque = new THREE.Vector3().crossVectors(leverArm, tireForces);
            torque.add(tireTorque);

        } else {
            wheel.grounded = false;
            wheel.compression = 0;
            wheel.velocity = 0;
        }

        return { force, torque };
    }

    /**
     * Calculate tire friction forces using simplified Pacejka-like model
     */
    _calculateTireForces(wheelIndex, normalLoad, dt) {
        const wheel = this.wheels[wheelIndex];
        const isFront = wheelIndex < 2;
        const isRear = !isFront;

        // Get wheel world velocity
        const wheelWorldPos = this.position.clone();
        const localOffset = wheel.offset.clone();
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
        wheelWorldPos.add(localOffset);

        // Point velocity = linear velocity + angular velocity × position
        const pointVel = this.velocity.clone();
        const angularContrib = new THREE.Vector3().crossVectors(this.angularVelocity, localOffset);
        pointVel.add(angularContrib);

        // Get wheel direction (front wheels steer)
        // CRITICAL: Project onto ground plane so tire forces push horizontally, not in car's tilted direction
        let wheelForward = this.forward.clone();
        wheelForward.y = 0;
        if (wheelForward.lengthSq() > 0.001) {
            wheelForward.normalize();
        } else {
            wheelForward.set(0, 0, 1); // Fallback
        }

        let wheelRight = this.right.clone();
        wheelRight.y = 0;
        if (wheelRight.lengthSq() > 0.001) {
            wheelRight.normalize();
        } else {
            wheelRight.set(1, 0, 0); // Fallback
        }

        if (isFront) {
            // Apply steering angle around world up axis (not car's up)
            const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.steerAngle);
            wheelForward.applyQuaternion(steerQuat);
            wheelRight.applyQuaternion(steerQuat);
        }

        // Decompose velocity into wheel frame (use ground-projected velocity for tire physics)
        const groundVel = pointVel.clone();
        groundVel.y = 0; // Only consider horizontal velocity for tire slip calculations
        const forwardVel = groundVel.dot(wheelForward);
        const lateralVel = groundVel.dot(wheelRight);

        // ==================== LATERAL FORCE (CORNERING) ====================
        // Calculate slip angle (angle between wheel direction and velocity)
        wheel.slipAngle = 0;
        if (Math.abs(forwardVel) > 0.5 || Math.abs(lateralVel) > 0.5) {
            wheel.slipAngle = Math.atan2(lateralVel, Math.abs(forwardVel) + 0.1);
        }

        // Simplified lateral grip model
        const maxLateralForce = normalLoad * this.specs.gripCoefficient;
        const slipAngleNorm = THREE.MathUtils.clamp(wheel.slipAngle / this.specs.slipAnglePeak, -1, 1);
        let lateralForce = -maxLateralForce * slipAngleNorm * 0.9;

        // ==================== LONGITUDINAL FORCE (DRIVE/BRAKE) ====================
        let longForce = 0;

        // DRIVE FORCE - Apply directly from engine for rear wheels
        if (isRear && this.throttleInput > 0 && !this.isShifting) {
            const gearRatio = this.specs.gearRatios[this.gearIndex];
            if (gearRatio !== 0) {
                // Calculate engine torque with a better curve
                // Provides good torque from low RPM, peaks mid-range, slight drop at redline
                const rpmNormalized = this.rpm / this.specs.redlineRPM;
                // Torque curve: good low-end, peak at ~0.5, gradual drop
                const torqueCurve = 0.8 + 0.4 * Math.sin(rpmNormalized * Math.PI) - 0.2 * rpmNormalized;
                const engineTorque = this.specs.maxTorque * Math.max(0.6, torqueCurve) * this.throttleInput;

                // Convert to wheel force
                const transmissionRatio = Math.abs(gearRatio) * this.specs.finalDrive;
                const wheelTorque = engineTorque * transmissionRatio;
                const driveForce = wheelTorque / this.specs.wheelRadius;

                // Apply to each rear wheel (divide by 2 for differential)
                const forcePerWheel = driveForce / 2;

                // Limit by grip - but allow more force (traction control off)
                const maxDriveForce = normalLoad * this.specs.gripCoefficient * 1.5;
                longForce = Math.min(forcePerWheel, maxDriveForce);

                // Debug Drive
                if (wheelIndex === 2 && this._logTimer === 0) { // Log once per sec for RL
                    console.log(`[Drive] Tq: ${engineTorque.toFixed(0)} | ForceReq: ${forcePerWheel.toFixed(0)} | MaxGrip: ${maxDriveForce.toFixed(0)} | Load: ${normalLoad.toFixed(0)}`);
                }

                // Reverse direction in reverse gear
                if (gearRatio < 0) {
                    longForce = -longForce;
                }
            }
        }

        // BRAKING FORCE
        if (this.brakeInput > 0) {
            const brakeForce = normalLoad * this.specs.gripCoefficient * this.brakeInput * 0.8;
            if (forwardVel > 0.5) {
                longForce -= brakeForce;
            } else if (forwardVel < -0.5) {
                longForce += brakeForce;
            } else {
                // At very low speed, allow reversing
                if (isRear && this.gearIndex === 0) {
                    longForce = -brakeForce * 0.4; // Reverse gear
                }
            }
        }

        // HANDBRAKE - rear wheels only
        if (isRear && this.handbrakeInput > 0) {
            // Strong braking force
            if (Math.abs(forwardVel) > 0.3) {
                longForce -= Math.sign(forwardVel) * normalLoad * this.specs.gripCoefficient * this.handbrakeInput;
            }
            // Reduce lateral grip when handbrake is applied (for drifting)
            lateralForce *= (1 - this.handbrakeInput * 0.7);
        }

        // Rolling resistance
        if (Math.abs(forwardVel) > 0.1) {
            longForce -= Math.sign(forwardVel) * normalLoad * this.specs.rollingResistance;
        }

        // Combine into world force
        const force = new THREE.Vector3();
        force.addScaledVector(wheelForward, longForce);
        force.addScaledVector(wheelRight, lateralForce);

        return force;
    }

    /**
     * Calculate aerodynamic drag
     */
    _calculateDrag() {
        const speedSquared = this.velocity.lengthSq();
        if (speedSquared < 0.1) return new THREE.Vector3();

        const dragMagnitude = 0.5 * this.specs.airDensity * this.specs.dragCoefficient *
            this.specs.frontalArea * speedSquared;

        const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMagnitude);
        return dragForce;
    }

    // Note: _integrate function removed - logic is now in update() method

    /**
     * Update engine and transmission
     */
    _updateDrivetrain(dt) {
        // Handle shifting
        if (this.isShifting) {
            this.shiftTimer -= dt;
            if (this.shiftTimer <= 0) {
                this.isShifting = false;
            }
            // No power during shift
            this._updateWheelRPM(0, dt);
            return;
        }

        const gearRatio = this.specs.gearRatios[this.gearIndex];

        if (gearRatio === 0) {
            // Neutral
            this.rpm = THREE.MathUtils.lerp(this.rpm, this.specs.idleRPM, 5 * dt);
            this._updateWheelRPM(0, dt);
            return;
        }

        // Calculate RPM from wheel speed
        const avgWheelRPM = (this.wheels[2].rpm + this.wheels[3].rpm) / 2;
        const transmissionRatio = Math.abs(gearRatio) * this.specs.finalDrive;
        const engineRPMFromWheels = avgWheelRPM * transmissionRatio;

        // Blend between idle and wheel-driven RPM
        let targetRPM = Math.max(engineRPMFromWheels, this.specs.idleRPM);

        // Rev up when throttle applied but low speed
        if (this.throttleInput > 0 && this.speed < 5) {
            targetRPM = THREE.MathUtils.lerp(targetRPM, this.specs.redlineRPM * 0.8, this.throttleInput);
        }

        this.rpm = THREE.MathUtils.lerp(this.rpm, targetRPM, 10 * dt);
        this.rpm = THREE.MathUtils.clamp(this.rpm, this.specs.idleRPM, this.specs.redlineRPM);

        // Calculate engine torque (improved torque curve with good low-end)
        const rpmNormalized = this.rpm / this.specs.redlineRPM;
        const torqueCurve = 0.8 + 0.4 * Math.sin(rpmNormalized * Math.PI) - 0.2 * rpmNormalized;
        const engineTorque = this.specs.maxTorque * Math.max(0.6, torqueCurve) * this.throttleInput;

        // Torque at wheels
        const wheelTorque = engineTorque * transmissionRatio * (gearRatio < 0 ? -1 : 1);

        // Update rear wheel RPMs (RWD)
        this._updateWheelRPM(wheelTorque, dt);
    }

    /**
     * Update wheel RPM based on torque and ground contact
     */
    _updateWheelRPM(driveTorque, dt) {
        const wheelInertia = 2; // kg·m²

        for (let i = 2; i < 4; i++) { // Rear wheels only (RWD)
            const wheel = this.wheels[i];

            if (wheel.grounded) {
                // Torque-driven acceleration
                const torqueAccel = driveTorque / wheelInertia;
                wheel.rpm += torqueAccel * dt * 60 / (2 * Math.PI);

                // Also sync with ground speed
                const groundSpeed = this.speed;
                const groundRPM = (groundSpeed / (this.specs.wheelRadius * 2 * Math.PI)) * 60;
                wheel.rpm = THREE.MathUtils.lerp(wheel.rpm, groundRPM, 5 * dt);
            } else {
                // Spin freely
                wheel.rpm *= 0.99;
            }

            wheel.rpm = Math.max(wheel.rpm, 0);
        }

        // Front wheels follow ground speed
        for (let i = 0; i < 2; i++) {
            const wheel = this.wheels[i];
            if (wheel.grounded) {
                wheel.rpm = (Math.abs(this.speed) / (this.specs.wheelRadius * 2 * Math.PI)) * 60;
            }
        }
    }

    /**
     * Automatic transmission logic
     */
    _autoShift() {
        if (this.isShifting) return;

        const gearRatio = this.specs.gearRatios[this.gearIndex];

        // Handle reverse
        if (this.speed < -0.5 && this.brakeInput > 0 && this.gearIndex !== 0) {
            this._shift(0); // Shift to reverse
            return;
        }

        if (this.speed > 0.5 && this.gearIndex === 0) {
            this._shift(2); // Shift to 1st from reverse
            return;
        }

        // Normal shifting
        if (this.gearIndex >= 2) { // In forward gears
            // Upshift
            if (this.rpm > this.specs.redlineRPM * 0.9 && this.gearIndex < 6) {
                this._shift(this.gearIndex + 1);
            }
            // Downshift
            else if (this.rpm < this.specs.idleRPM * 1.5 && this.gearIndex > 2) {
                this._shift(this.gearIndex - 1);
            }
        }
    }

    _shift(newGearIndex) {
        if (newGearIndex === this.gearIndex) return;
        this.gearIndex = newGearIndex;
        this.isShifting = true;
        this.shiftTimer = this.specs.shiftTime;
    }

    /**
     * Manual shift up (E key)
     */
    shiftUp() {
        if (this.isShifting) return;
        if (this.gearIndex < this.specs.gearRatios.length - 1) {
            this._shift(this.gearIndex + 1);
            console.log(`[Gear] Shifted UP to ${this.getGearDisplay()}`);
        }
    }

    /**
     * Manual shift down (Q key)
     */
    shiftDown() {
        if (this.isShifting) return;
        if (this.gearIndex > 0) {
            this._shift(this.gearIndex - 1);
            console.log(`[Gear] Shifted DOWN to ${this.getGearDisplay()}`);
        }
    }

    /**
     * Toggle between manual and automatic transmission
     */
    toggleTransmissionMode() {
        this.manualGearMode = !this.manualGearMode;
        console.log(`[Transmission] ${this.manualGearMode ? 'MANUAL' : 'AUTOMATIC'} mode`);
    }

    /**
     * Update the visual mesh
     */
    _updateMesh() {
        if (!this.mesh) return;

        // Apply physics position to mesh
        this.mesh.position.copy(this.position);

        // Visual Offset: 
        // Physics center is ~3.1m above ground (radius 1.35 + susp 1.75).
        // Car model origin (bottom) needs to be shifted down.
        // We shift down by ~3.3m to compensate.
        this.mesh.position.y -= 3.3;

        this.mesh.rotation.copy(this.rotation);

        // Offset the mesh rotation as well if needed? 
        // Usually models rotate around 0,0,0 (center bottom).
        // Physics rotation is around center of mass.
        // If we rotate the mesh around bottom, it might look weird (pendulum effect).
        // Ideally we should offset the mesh geometry, but we can't easily here.
        // For now, simple position offset is standard for this level of physics.
    }

    /**
     * Get gear display string
     */
    getGearDisplay() {
        if (this.gearIndex === 0) return 'R';
        if (this.gearIndex === 1) return 'N';
        return (this.gearIndex - 1).toString();
    }

    /**
     * Get RPM as percentage (0-1)
     */
    getRPMPercentage() {
        return (this.rpm - this.specs.idleRPM) / (this.specs.redlineRPM - this.specs.idleRPM);
    }

    /**
     * Internal update for debug visuals
     */
    _updateDebug() {
        if (!this.debug || !this.debugGroup) return;

        // Clear previous debug lines
        while (this.debugGroup.children.length > 0) {
            const object = this.debugGroup.children[0];
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
            this.debugGroup.remove(object);
        }

        // 1. Draw Physics Center Box (Body outline)
        const boxGeom = new THREE.BoxGeometry(this.specs.width, this.specs.height, this.specs.length);
        const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.position.copy(this.position);
        // Offset box to align with visual model (center of mass is lower than geometric center usually)
        // box.position.y += 0.2; 
        box.rotation.copy(this.rotation);
        this.debugGroup.add(box);

        // 2. Draw Wheel Raycasts
        // Re-calculate raycast positions for visualization
        this.wheels.forEach((wheel, index) => {
            const wheelWorldPos = this.position.clone();
            const localOffset = wheel.offset.clone();
            localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
            wheelWorldPos.add(localOffset);

            const rayOrigin = wheelWorldPos.clone();
            rayOrigin.y += this.specs.suspensionRestLength; // Start of ray

            const rayDest = rayOrigin.clone();
            const rayMaxLen = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;
            rayDest.y -= rayMaxLen; // End of max extension

            // Draw Ray Line
            const rayPoints = [rayOrigin, rayDest];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const rayMat = new THREE.LineBasicMaterial({ color: wheel.grounded ? 0x00ff00 : 0xff0000 });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            this.debugGroup.add(rayLine);

            // Draw Wheel Point
            if (wheel.grounded) {
                // Show contact point
                // We don't have exact contact point stored easily, effectively it's at rayOrigin.y - distance
                // Simplified: Just draw a small sphere at the wheel hub position
                const hubGeom = new THREE.SphereGeometry(0.1);
                const hubMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const hub = new THREE.Mesh(hubGeom, hubMat);
                // Calculate actual wheel hub position based on compression
                const currentLen = this.specs.suspensionRestLength + (1 - wheel.compression) * this.specs.suspensionTravel;
                // Wait, compression is 0..1. 1 = fully compressed? No, usually compression is ratio. 
                // Let's just use the wheel mesh position logic if we had it.
                // Ray origin - current length

                // Actually easier: Draw the ground hit point
                const groundH = this.terrain.getHeightAt(rayOrigin.x, rayOrigin.z);
                const hitPoint = new THREE.Vector3(rayOrigin.x, groundH, rayOrigin.z);
                hub.position.copy(hitPoint);
                this.debugGroup.add(hub);
            }
        });

        // 3. Draw Ground Normal (at center)
        const groundNormal = this.terrain.getNormalAt(this.position.x, this.position.z);
        const normalOrigin = this.position.clone();
        normalOrigin.y -= 0.5; // Draw from bottom
        const arrow = new THREE.ArrowHelper(groundNormal, normalOrigin, 2, 0x0000ff);
        this.debugGroup.add(arrow);
    }

    toggleDebug() {
        this.debug = !this.debug;
        if (this.debug) {
            if (!this.debugGroup) {
                this.debugGroup = new THREE.Group();
                if (this.scene) {
                    this.scene.add(this.debugGroup);
                }
            }
            this.debugGroup.visible = true;
        } else {
            if (this.debugGroup) {
                this.debugGroup.visible = false;
            }
        }
    }

    /**
     * Set wheel mesh references for visual suspension animation
     * @param {Array} wheelMeshes - Array of [FL, FR, RL, RR] wheel mesh objects
     */
    setWheelMeshes(wheelMeshes) {
        this.wheelMeshes = wheelMeshes;
        console.log('[CarPhysics] Wheel meshes set:', wheelMeshes.map(w => w ? w.name : 'null'));
    }
}