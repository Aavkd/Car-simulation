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
        // Store the raw car spec for accessing additional properties like lights
        this.carSpec = carSpec;

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
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, -1.0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, wasGrounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },   // FL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, -1.0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, wasGrounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },    // FR
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, -1.0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, wasGrounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },  // RL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, -1.0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, wasGrounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 }   // RR
        ];

        // Body collision points (8 corners of the hitbox)
        // These are used for rigid body collision, not suspension
        this.bodyCollisionPoints = this._createBodyCollisionPoints();

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
            visualOffsetX: spec.visualOffset?.x || 0,
            visualOffsetY: spec.visualOffset?.y || -3.3
        };
    }

    /**
     * Create body collision points at the 8 corners of the car hitbox
     * These are for rigid collision, separate from wheel suspension
     */
    _createBodyCollisionPoints() {
        const w = this.specs.width / 2;   // Half width
        const h = this.specs.height / 2;  // Half height
        const l = this.specs.length / 2;  // Half length

        // Offset upward to match physics center position
        const yOffset = 0; // Car center is at this.position

        return [
            // Front corners (top and bottom)
            { offset: new THREE.Vector3(-w, h + yOffset, l), name: 'FL_top', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(w, h + yOffset, l), name: 'FR_top', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(-w, -h + yOffset, l), name: 'FL_bottom', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(w, -h + yOffset, l), name: 'FR_bottom', colliding: false, penetration: 0 },
            // Rear corners (top and bottom)
            { offset: new THREE.Vector3(-w, h + yOffset, -l), name: 'RL_top', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(w, h + yOffset, -l), name: 'RR_top', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(-w, -h + yOffset, -l), name: 'RL_bottom', colliding: false, penetration: 0 },
            { offset: new THREE.Vector3(w, -h + yOffset, -l), name: 'RR_bottom', colliding: false, penetration: 0 },
        ];
    }


    /**
     * Create headlights for the car
     */
    _createHeadlights() {
        this.headlights = [];

        // Use light positions from car spec, or fall back to defaults
        const frontZ = this.specs.length / 2;  // Default front edge of car
        const defaultPositions = [
            { x: -2.2, y: 1.5, z: frontZ },
            { x: 2.2, y: 1.5, z: frontZ }
        ];

        const headlightPositions = (this.carSpec && this.carSpec.lights && this.carSpec.lights.headlightPos)
            ? this.carSpec.lights.headlightPos
            : defaultPositions;

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
        // Compensate for model scale so glow spheres stay consistent size
        const modelScale = (this.carSpec && this.carSpec.modelScale) ? this.carSpec.modelScale : 1;
        const glowRadius = 0.5 / modelScale;

        this.headlightGlows = [];
        headlightPositions.forEach((pos) => {
            const glowGeom = new THREE.SphereGeometry(glowRadius, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0xffffcc,
                transparent: true,
                opacity: 0,
                visible: false
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

        // Use taillight positions from car spec, or fall back to defaults
        const rearZ = -this.specs.length / 2;  // Default rear edge of car
        const defaultPositions = [
            { x: -2.0, y: 3, z: rearZ },
            { x: 2.0, y: 3, z: rearZ }
        ];

        const taillightPositions = (this.carSpec && this.carSpec.lights && this.carSpec.lights.taillightPos)
            ? this.carSpec.lights.taillightPos
            : defaultPositions;

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
        // Compensate for model scale so glow spheres stay consistent size
        const modelScale = (this.carSpec && this.carSpec.modelScale) ? this.carSpec.modelScale : 1;
        const glowRadius = 0.4 / modelScale;

        taillightPositions.forEach((pos) => {
            const glowGeom = new THREE.SphereGeometry(glowRadius, 8, 8);
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

        // 4. Body Collision (Frame hitting ground/obstacles)
        // This is separate from wheel suspension - handles roof/side impacts
        let bodyCollisionCount = 0;
        for (let i = 0; i < this.bodyCollisionPoints.length; i++) {
            const { force, torque } = this._processBodyCollision(i);
            if (this.bodyCollisionPoints[i].colliding) bodyCollisionCount++;
            totalForce.add(force);
            totalTorque.add(torque);
        }

        // ==================== ISSUE 6: ANTI-ROLL HACKS DISABLED ====================
        // With correct force application at shock mounts (Issue 4 fix), artificial
        // stabilization should no longer be needed. The car will now behave more
        // realistically on slopes and during tilts.
        // 
        // REMOVED: The old code applied artificial counter-torque and righting forces
        // when the car was tilted with partial wheel contact. This masked underlying
        // physics bugs but caused unpredictable behavior on slopes and jumps.
        //
        // If car still flips unexpectedly, the root cause is likely:
        // - Suspension stiffness too high
        // - CG height too high  
        // - Track width too narrow
        // Rather than adding hacks, tune those physical parameters.

        // 6. Stabilizer bars (Anti-roll)
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

        // Angular Damping - only increase when severely tilted
        const upDot = this.up.dot(new THREE.Vector3(0, 1, 0));
        const isUnstable = upDot < 0.4 || (groundedWheels < 2 && upDot < 0.7);
        const angularDamping = isUnstable ? 0.95 : 0.98;
        this.angularVelocity.multiplyScalar(angularDamping);

        // Clamp extreme angular velocities only when unstable
        if (isUnstable) {
            const maxAngularVel = 4.0;
            const angularSpeed = this.angularVelocity.length();
            if (angularSpeed > maxAngularVel) {
                this.angularVelocity.multiplyScalar(maxAngularVel / angularSpeed);
            }
        }

        // Self-righting assist DISABLED (Issue 6)
        // Cars should behave naturally when airborne - no magic orientation correction
        // This was masking physics issues and causing unrealistic behavior during jumps

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
     * 
     * Key physics:
     * - Raycast along car's LOCAL UP vector (not world Y) for correct slope behavior
     * - Damping calculated from chassis velocity at wheel point (no 1-frame lag)
     * - Forces applied at shock mount point (reduces destabilizing torque)
     * - suspensionRestLength = FREE length (fully extended, unloaded spring)
     * - suspensionTravel = maximum compression distance from free length
     */
    _processWheel(index, dt) {
        const wheel = this.wheels[index];
        const isFront = index < 2;
        const isLeft = index % 2 === 0;

        // Calculate wheel world position (wheel hub at rest)
        const wheelWorldPos = this.position.clone();
        const localOffset = wheel.offset.clone();
        const carQuat = new THREE.Quaternion().setFromEuler(this.rotation);
        localOffset.applyQuaternion(carQuat);
        wheelWorldPos.add(localOffset);

        // ==================== ISSUE 1 FIX: LOCAL UP RAYCAST ====================
        // Use car's local UP vector for suspension direction, not world Y
        // This ensures correct behavior on slopes and when car is tilted/flipped
        const localUp = this.up.clone();

        // Ray origin is at shock mount (wheel position + rest length along local up)
        const rayOrigin = wheelWorldPos.clone();
        rayOrigin.addScaledVector(localUp, this.specs.suspensionRestLength);

        // Total ray length from mount to wheel center at full extension + wheel radius
        const rayLength = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;

        // Get ground height and calculate contact point
        const groundHeight = this.terrain.getHeightAt(wheelWorldPos.x, wheelWorldPos.z);
        const groundPoint = new THREE.Vector3(wheelWorldPos.x, groundHeight, wheelWorldPos.z);

        // Calculate distance to ground ALONG the local up axis
        // This is the key fix: measure suspension travel in car's reference frame
        const toGround = groundPoint.clone().sub(rayOrigin);
        const distanceToGround = -toGround.dot(localUp); // Positive when ground is below ray origin

        let force = new THREE.Vector3();
        let torque = new THREE.Vector3();

        // ==================== ISSUE 8 FIX: SUSPENSION ONLY PUSHES DOWN (relative to car) ====================
        // Suspension can only push the car AWAY from the ground. If the car is inverted
        // (localUp.y < 0), or at extreme angles, suspension should not apply forces.
        // This prevents the car from being "pushed into" the ground when upside down.
        // Threshold of 0.1 allows some leeway for steep slopes (~84 degrees from horizontal).
        const canApplySuspension = localUp.y > 0.1;

        if (distanceToGround < rayLength && distanceToGround > -this.specs.wheelRadius && canApplySuspension) {
            // Wheel is in contact range and car is oriented correctly for suspension
            wheel.grounded = true;

            // Get ground normal early (needed for velocity and force direction)
            const groundNormal = this.terrain.getNormalAt(wheelWorldPos.x, wheelWorldPos.z);

            // ==================== ISSUE 5: REST LENGTH SEMANTICS ====================
            // compression = how much spring is compressed from FREE length
            // rayLength = free length + travel + wheel radius (total extended length)
            // distanceToGround = distance from mount to ground along local up
            // compression = rayLength - distanceToGround (how much shorter than full extension)
            const compression = rayLength - distanceToGround;
            const compressionRatio = Math.min(compression / this.specs.suspensionTravel, 1.5);
            wheel.compression = compressionRatio;

            // ==================== ISSUE 2 FIX: CHASSIS VELOCITY DAMPING ====================
            // Calculate chassis velocity at this wheel point (no 1-frame lag)
            const wheelPointVel = this.velocity.clone();
            const angularContrib = new THREE.Vector3().crossVectors(this.angularVelocity, localOffset);
            wheelPointVel.add(angularContrib);

            // ==================== ISSUE 4 FIX: FORCE APPLICATION POINT ====================
            // Apply force strictly along car's local UP (suspension axis).
            // A physical suspension strut can only exert force along its axis.
            // Blending with groundNormal creates phantom lateral forces that destabilize the car.
            const forceDirection = localUp.clone();

            // Calculate ground vertical velocity for damping (slope effect)
            let groundVerticalVel = 0;
            // Prevent division by zero or extreme values on steep walls (limit slope to ~80 degrees)
            if (groundNormal.y > 0.15) {
                // v_y = -(n_x*v_x + n_z*v_z) / n_y
                groundVerticalVel = -(groundNormal.x * wheelPointVel.x + groundNormal.z * wheelPointVel.z) / groundNormal.y;
                // Clamp ground velocity to prevent explosions on polygon edges
                groundVerticalVel = Math.max(-50, Math.min(50, groundVerticalVel));
            }

            // Construct velocity vector of the contact point on the ground
            // It moves horizontally with the car (at the wheel's location), but changes Y based on slope
            // Use wheelPointVel X/Z components, not global velocity
            const groundPointVel = new THREE.Vector3(wheelPointVel.x, groundVerticalVel, wheelPointVel.z);

            // Relative velocity = Closing speed between chassis and ground
            const relVel = wheelPointVel.clone().sub(groundPointVel);

            // Damping velocity = rate of compression (positive = compressing)
            // Project relative velocity onto local up axis (negative because down = compression)
            wheel.velocity = -relVel.dot(localUp);

            // Spring force (Hooke's law)
            const springForce = compressionRatio * this.specs.suspensionTravel * this.specs.springStrength;

            // ==================== ISSUE 9 FIX: DAMPER FORCE LIMITS ====================
            // Damper force should RESIST motion, but never cause the car to launch.
            // Key insight: suspension can only PUSH (not pull). The damper resists 
            // compression (positive velocity = wheel moving up into car), but during
            // rebound (negative velocity = wheel extending), the damper should only
            // SLOW the extension, not actively push the car upward.
            //
            // The damper force is clamped so that:
            // 1. During compression (velocity > 0): damper adds to spring force (resists compression)
            // 2. During rebound (velocity < 0): damper subtracts from spring force (slows extension)
            //    BUT the total force must remain >= 0 (no pulling/launching)

            const dampingMultiplier = wheel.velocity > 0 ? 1.0 : 0.5; // Much less rebound damping
            let damperForce = wheel.velocity * this.specs.damperStrength * dampingMultiplier;

            // Anti-jitter: reduce micro-oscillations when nearly at rest
            if (Math.abs(wheel.velocity) < 0.5 && compressionRatio < 0.3 && compressionRatio > 0.05) {
                damperForce *= 2.0;
            }

            // ==================== ISSUE 3 FIX: BUMP STOP DAMPING ====================
            let extraForce = 0;
            const maxCompress = this.specs.suspensionTravel;
            if (compression > maxCompress) {
                const penetration = compression - maxCompress;
                const bumpStiffness = 50000;
                const bumpDamping = 8000;
                const bumpSpringForce = penetration * bumpStiffness;
                // Bump stop damping only resists further compression, not rebound
                const bumpDampForce = wheel.velocity > 0 ? wheel.velocity * bumpDamping : 0;
                extraForce = bumpSpringForce + bumpDampForce;
            }

            // Total suspension force
            let suspensionForce = springForce + damperForce + extraForce;

            // Smooth initial contact
            if (!wheel.wasGrounded && compressionRatio < 0.15) {
                suspensionForce *= 0.5 + (compressionRatio / 0.15) * 0.5;
            }

            // ==================== CRITICAL: FORCE DIRECTION CHECK ====================
            // Suspension can only PUSH the car away from ground, never pull it down.
            // Clamp minimum to 0, and also verify final force pushes UP in world space.
            suspensionForce = Math.max(0, Math.min(suspensionForce, 200000));

            // Store for debug
            wheel.forceVal = suspensionForce;

            let suspForceVec = forceDirection.clone().multiplyScalar(suspensionForce);

            // Final safety check: if force would push car INTO ground (negative Y), zero it out
            // This handles edge cases where localUp is at weird angles
            if (suspForceVec.y < 0) {
                suspForceVec.set(0, 0, 0);
                suspensionForce = 0;
            }
            force.add(suspForceVec);

            // ==================== ISSUE 4 FIX: SHOCK MOUNT LEVER ARM ====================
            // Apply torque at shock mount point (higher on chassis), not wheel contact
            // This reduces the lever arm and prevents excessive roll torque
            const shockMountOffset = new THREE.Vector3(
                wheel.offset.x,  // Same X as wheel (left/right)
                this.specs.suspensionRestLength * 0.5,  // Midway up the shock travel
                wheel.offset.z   // Same Z as wheel (front/back)
            ).applyQuaternion(carQuat);

            // Check how upright the car is
            const upDot = this.up.dot(new THREE.Vector3(0, 1, 0));

            // Calculate torque from suspension force at shock mount
            const suspTorqueWorld = new THREE.Vector3().crossVectors(shockMountOffset, suspForceVec);

            // CRITICAL FIX: Transform torque from world space to body-local space
            // The cross product gives world-space torque, but angularVelocity is in body frame
            // Apply inverse car quaternion to convert world -> local
            const carQuatInverse = carQuat.clone().invert();
            const suspTorque = suspTorqueWorld.clone().applyQuaternion(carQuatInverse);

            // Reduce torque when severely tilted to prevent instability
            if (upDot < 0.3) {
                suspTorque.multiplyScalar(0.2);
            }
            torque.add(suspTorque);

            // Calculate tire forces
            const tireForces = this._calculateTireForces(index, suspensionForce, dt);

            // Reduce tire grip when car is very tilted (wheel nearly sideways)
            if (upDot < 0.4) {
                const tireGripFactor = Math.max(0.1, upDot / 0.4);
                tireForces.multiplyScalar(tireGripFactor);
            }
            force.add(tireForces);

            // Calculate torque from tire forces (applied at ground contact, not shock mount)
            // Use horizontal projection of local offset for tire torque
            const horizontalLever = new THREE.Vector3(localOffset.x, 0, localOffset.z);
            const tireTorqueWorld = new THREE.Vector3().crossVectors(horizontalLever, tireForces);
            // Transform tire torque from world space to body-local space
            const tireTorque = tireTorqueWorld.clone().applyQuaternion(carQuatInverse);
            if (upDot < 0.3) {
                tireTorque.multiplyScalar(0.3);
            }
            torque.add(tireTorque);

            // Store grounded state for next frame (for smooth contact detection)
            wheel.wasGrounded = true;
        } else {
            wheel.grounded = false;
            wheel.compression = 0;
            wheel.velocity = 0;
            wheel.wasGrounded = false;
        }

        return { force, torque };
    }

    /**
     * Process body collision for a single collision point
     * This is RIGID collision - no suspension, just prevents penetration
     * @param {number} pointIndex - Index of the body collision point
     * @returns {Object} { force: THREE.Vector3, torque: THREE.Vector3 }
     */
    _processBodyCollision(pointIndex) {
        const point = this.bodyCollisionPoints[pointIndex];

        // Calculate world position of this collision point
        const worldPos = this.position.clone();
        const localOffset = point.offset.clone();
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
        worldPos.add(localOffset);

        // Get ground height at this point
        const groundHeight = this.terrain.getHeightAt(worldPos.x, worldPos.z);
        const penetration = groundHeight - worldPos.y;

        let force = new THREE.Vector3();
        let torque = new THREE.Vector3();

        // Only apply force if penetrating the ground
        if (penetration > 0) {
            // Rigid collision - high stiffness, no spring oscillation
            const collisionStiffness = 100000; // Very stiff (rigid frame)
            const collisionDamping = 15000;    // High damping to prevent bouncing

            // Get surface normal (use world up for stability)
            const groundNormal = this.terrain.getNormalAt(worldPos.x, worldPos.z);
            const worldUp = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3()
                .addScaledVector(worldUp, 0.8)
                .addScaledVector(groundNormal, 0.2)
                .normalize();

            // Calculate velocity at collision point
            const pointVel = this.velocity.clone();
            const angularContrib = new THREE.Vector3().crossVectors(this.angularVelocity, localOffset);
            pointVel.add(angularContrib);

            // Velocity into ground (negative = moving into ground)
            const normalVel = pointVel.dot(normal);

            // Collision force: push out of ground
            let collisionForce = penetration * collisionStiffness;

            // Damping: only apply if moving into ground
            if (normalVel < 0) {
                collisionForce -= normalVel * collisionDamping;
            }

            // Clamp force to prevent explosion
            collisionForce = Math.min(collisionForce, 500000);

            // Apply force in surface normal direction
            force.copy(normal).multiplyScalar(collisionForce);

            // Calculate torque from collision
            const upDot = this.up.dot(new THREE.Vector3(0, 1, 0));

            // Use horizontal lever to prevent bad roll torques
            const horizontalLever = new THREE.Vector3(localOffset.x, 0, localOffset.z);
            torque.crossVectors(horizontalLever, force);

            // Only reduce torque when severely flipped
            if (upDot < 0.3) {
                torque.multiplyScalar(0.2);
            } else {
                torque.multiplyScalar(0.7);
            }

            // Store collision state for debug
            point.colliding = true;
            point.penetration = penetration;
        } else {
            point.colliding = false;
            point.penetration = 0;
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

        // Visual Offset: Transform offset from local to world space
        // This ensures the offset rotates with the car (fixing drift when airborne/tilted)
        const localOffset = new THREE.Vector3(
            this.specs.visualOffsetX,
            this.specs.visualOffsetY,
            0
        );
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
        this.mesh.position.add(localOffset);

        this.mesh.rotation.copy(this.rotation);
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

        // 2. Draw Wheel Raycasts (now along LOCAL UP, not world Y)
        const localUp = this.up.clone();
        this.wheels.forEach((wheel, index) => {
            const wheelWorldPos = this.position.clone();
            const localOffset = wheel.offset.clone();
            localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
            wheelWorldPos.add(localOffset);

            // Ray starts at shock mount (wheel pos + rest length along local up)
            const rayOrigin = wheelWorldPos.clone();
            rayOrigin.addScaledVector(localUp, this.specs.suspensionRestLength);

            // Ray ends at full extension along local down
            const rayMaxLen = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;
            const rayDest = rayOrigin.clone();
            rayDest.addScaledVector(localUp, -rayMaxLen);

            // Draw Ray Line
            const rayPoints = [rayOrigin, rayDest];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const rayMat = new THREE.LineBasicMaterial({ color: wheel.grounded ? 0x00ff00 : 0xff0000 });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            this.debugGroup.add(rayLine);

            // Draw Wheel Contact Point
            if (wheel.grounded) {
                const hubGeom = new THREE.SphereGeometry(0.1);
                const hubMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const hub = new THREE.Mesh(hubGeom, hubMat);
                const groundH = this.terrain.getHeightAt(wheelWorldPos.x, wheelWorldPos.z);
                const hitPoint = new THREE.Vector3(wheelWorldPos.x, groundH, wheelWorldPos.z);
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

        // 4. Draw Body Collision Points
        this.bodyCollisionPoints.forEach((point, index) => {
            const worldPos = this.position.clone();
            const localOffset = point.offset.clone();
            localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
            worldPos.add(localOffset);

            // Draw collision point (red if colliding, blue otherwise)
            const pointGeom = new THREE.SphereGeometry(0.3);
            const pointMat = new THREE.MeshBasicMaterial({
                color: point.colliding ? 0xff0000 : 0x0088ff
            });
            const pointMesh = new THREE.Mesh(pointGeom, pointMat);
            pointMesh.position.copy(worldPos);
            this.debugGroup.add(pointMesh);
        });
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