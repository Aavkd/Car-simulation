import * as THREE from 'three';

/**
 * New Car Physics Engine
 * 
 * A clean, simple physics engine with:
 * - Rigid body dynamics (position, velocity, rotation, angular velocity)
 * - Spring-damper suspension at 4 wheel points
 * - Realistic wheel-spin based acceleration
 * - Terrain interaction via PhysicsProvider
 * 
 * Design principles:
 * - All forces applied at correct world positions (creates realistic torque)
 * - Scale factor (S) allows tuning physics to game world size
 * - Easily extensible for future tire models, differentials, etc.
 */

export class NewCarPhysicsEngine {
    /**
     * @param {Object} carSpec - Vehicle specification (from ToyotaAE86.js etc)
     * @param {Object} physicsProvider - Terrain provider with getHeightAt, getNormalAt
     */
    constructor(carSpec, physicsProvider) {
        this.spec = carSpec;
        this.physicsProvider = physicsProvider;

        // ==================== PHYSICS SCALE ====================
        // Scale factor: game units are S times larger than real meters
        // Gravity and forces are scaled accordingly
        this.scaleFactor = 4.5;

        // ==================== RIGID BODY STATE ====================
        this.position = new THREE.Vector3(0, 10, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.quaternion = new THREE.Quaternion();
        this.angularVelocity = new THREE.Vector3(0, 0, 0);

        // ==================== PHYSICS CONSTANTS ====================
        this.gravity = -9.81 * this.scaleFactor; // Scaled gravity
        this.mass = carSpec.mass || 950;

        // Inertia tensor (simplified as diagonal for box approximation)
        const dims = carSpec.dimensions || { width: 6.7, height: 4.5, length: 18.4 };
        const m = this.mass;
        this.inertia = new THREE.Vector3(
            (m / 12) * (dims.height * dims.height + dims.length * dims.length),
            (m / 12) * (dims.width * dims.width + dims.length * dims.length),
            (m / 12) * (dims.width * dims.width + dims.height * dims.height)
        );
        this.inverseInertia = new THREE.Vector3(
            1 / this.inertia.x,
            1 / this.inertia.y,
            1 / this.inertia.z
        );

        // ==================== SUSPENSION SETUP ====================
        const susp = carSpec.suspension || { restLength: 1.5, travel: 1.1, stiffness: 35000, damping: 3000 };
        this.suspensionRestLength = susp.restLength;
        this.suspensionTravel = susp.travel;
        this.suspensionStiffness = susp.stiffness;
        this.suspensionDamping = susp.damping;

        // Wheel mount points (relative to car center, in local space)
        const trackWidth = carSpec.dimensions?.trackWidth || 7.55;
        const wheelBase = carSpec.dimensions?.wheelBase || 10.55;
        const wheelRadius = carSpec.dimensions?.wheelRadius || 1.35;

        this.wheelRadius = wheelRadius;
        this.wheelLocalPositions = [
            new THREE.Vector3(-trackWidth / 2, 0, wheelBase / 2),   // Front Left
            new THREE.Vector3(trackWidth / 2, 0, wheelBase / 2),    // Front Right
            new THREE.Vector3(-trackWidth / 2, 0, -wheelBase / 2),  // Rear Left
            new THREE.Vector3(trackWidth / 2, 0, -wheelBase / 2)    // Rear Right
        ];

        // Suspension state per wheel
        this.wheelCompressions = [0, 0, 0, 0];
        this.wheelGrounded = [false, false, false, false];
        this.wheelContactPoints = [
            new THREE.Vector3(), new THREE.Vector3(),
            new THREE.Vector3(), new THREE.Vector3()
        ];
        this.wheelSuspensionForces = [0, 0, 0, 0];

        // ==================== DRIVE/STEERING ====================
        this.steeringAngle = 0;
        this.maxSteeringAngle = carSpec.steering?.maxAngle || 0.85; // Increased for sharper turns (~49 degrees)
        this.steeringSpeed = carSpec.steering?.speed || 4.0; // Faster steering response

        // Engine
        this.engineRPM = carSpec.engine?.idleRPM || 900;
        this.idleRPM = carSpec.engine?.idleRPM || 900;
        this.redlineRPM = carSpec.engine?.redlineRPM || 7800;
        this.maxTorque = carSpec.engine?.maxTorque || 150;
        this.powerCurve = carSpec.engine?.powerCurve || [0.4, 0.7, 0.9, 1.0, 0.85];

        // Transmission
        this.gears = carSpec.transmission?.gears || [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8];
        this.finalDrive = carSpec.transmission?.finalDrive || 4.3;
        this.currentGear = 2; // Start in 1st gear (index 2, after reverse and neutral)

        // Tires
        this.gripCoefficient = carSpec.tires?.gripCoefficient || 1.5;
        this.rollingResistance = carSpec.tires?.rollingResistance || 0.005;

        // ==================== DRIFT MECHANICS ====================
        // Drift parameters for lateral inertia and sliding behavior
        this.driftGripMultiplier = carSpec.drift?.gripMultiplier || 0.2;     // Reduced grip when drifting (lowered for more slide)
        this.lateralInertiaFactor = carSpec.drift?.lateralInertia || 0.6;   // How much lateral velocity is retained (increased)
        this.handbrakeGripReduction = carSpec.drift?.handbrakeGripReduction || 0.15; // Rear grip when handbrake is pulled (lowered)
        this.driftAngleThreshold = carSpec.drift?.angleThreshold || 0.08;    // Slip angle to trigger drift state (lowered)
        this.driftRecoveryRate = carSpec.drift?.recoveryRate || 1;         // How fast grip recovers after drift (slower)

        // Drift state tracking
        this.isDrifting = false;
        this.driftIntensity = 0;         // 0-1, how much the car is currently sliding
        this.lateralVelocity = 0;        // Tracks lateral speed for inertia
        this.currentDriftGrip = 1.0;     // Current grip multiplier (smoothed)

        // Wheel spin velocities (for realistic wheel-spin)
        this.wheelSpinVelocities = [0, 0, 0, 0]; // rad/s for each wheel

        // ==================== HELPER OBJECTS (reused) ====================
        this._tempVec3 = new THREE.Vector3();
        this._tempVec3b = new THREE.Vector3();
        this._tempVec3c = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._forwardDir = new THREE.Vector3();
        this._rightDir = new THREE.Vector3();
        this._upDir = new THREE.Vector3();
    }

    /**
     * Set physics scale factor
     * @param {number} s - Scale factor (default 4.5)
     */
    setScaleFactor(s) {
        this.scaleFactor = s;
        this.gravity = -9.81 * s;
    }

    /**
     * Update physics provider (when changing levels)
     */
    setPhysicsProvider(provider) {
        this.physicsProvider = provider;
    }

    /**
     * Get local direction vectors from current orientation
     */
    _updateDirections() {
        // Forward is +Z in local space
        this._forwardDir.set(0, 0, 1).applyQuaternion(this.quaternion);
        // Right is +X in local space
        this._rightDir.set(1, 0, 0).applyQuaternion(this.quaternion);
        // Up is +Y in local space
        this._upDir.set(0, 1, 0).applyQuaternion(this.quaternion);
    }

    /**
     * Transform local point to world position
     */
    _localToWorld(localPoint) {
        return localPoint.clone().applyQuaternion(this.quaternion).add(this.position);
    }

    /**
     * Main physics update
     * @param {number} dt - Delta time in seconds
     * @param {Object} input - Input state { throttle, brake, steer, handbrake }
     */
    update(dt, input) {
        // Clamp dt to avoid physics explosion on frame drops
        dt = Math.min(dt, 0.05);

        this._updateDirections();

        // ==================== 1. GRAVITY ====================
        const gravityForce = new THREE.Vector3(0, this.gravity * this.mass, 0);

        // ==================== 2. SUSPENSION & WHEEL FORCES ====================
        let totalForce = gravityForce.clone();
        let totalTorque = new THREE.Vector3(0, 0, 0);

        let groundedCount = 0;
        for (let i = 0; i < 4; i++) {
            const result = this._processWheel(i, dt, input);
            totalForce.add(result.force);
            totalTorque.add(result.torque);
            if (this.wheelGrounded[i]) groundedCount++;
        }

        // ==================== 3. STEERING INPUT ====================
        const steerTarget = (input.steer || 0) * this.maxSteeringAngle;
        this.steeringAngle += (steerTarget - this.steeringAngle) * Math.min(1, this.steeringSpeed * dt * 5);

        // ==================== 4. AIR DRAG ====================
        const speed = this.velocity.length();
        if (speed > 0.1) {
            const dragCoeff = this.spec.dragCoefficient || 0.35;
            const frontalArea = this.spec.frontalArea || 1.9;
            const airDensity = 1.225 * this.scaleFactor; // Scaled air density
            const dragMagnitude = 0.5 * airDensity * dragCoeff * frontalArea * speed * speed;
            const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMagnitude);
            totalForce.add(dragForce);
        }

        // ==================== 5. INTEGRATE VELOCITY ====================
        const acceleration = totalForce.divideScalar(this.mass);
        this.velocity.add(acceleration.multiplyScalar(dt));

        // ==================== 6. INTEGRATE ANGULAR VELOCITY ====================
        // Torque is in world space, but inertia tensor is in local space.
        // Transform torque from world space to local space first.
        const inverseQuat = this.quaternion.clone().invert();
        const localTorque = totalTorque.clone().applyQuaternion(inverseQuat);

        // Torque = I * alpha => alpha = torque / I (in local space)
        const localAngularAccel = new THREE.Vector3(
            localTorque.x * this.inverseInertia.x,
            localTorque.y * this.inverseInertia.y,
            localTorque.z * this.inverseInertia.z
        );

        // Transform angular acceleration back to world space
        const worldAngularAccel = localAngularAccel.applyQuaternion(this.quaternion);
        this.angularVelocity.add(worldAngularAccel.multiplyScalar(dt));

        // Angular damping to prevent infinite spinning
        this.angularVelocity.multiplyScalar(0.98);

        // ==================== 7. INTEGRATE POSITION ====================
        this.position.add(this.velocity.clone().multiplyScalar(dt));

        // ==================== 8. INTEGRATE ROTATION ====================
        if (this.angularVelocity.lengthSq() > 0.0001) {
            const angVelMag = this.angularVelocity.length();
            const axis = this.angularVelocity.clone().normalize();
            const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axis, angVelMag * dt);
            this.quaternion.premultiply(deltaQuat);
            this.quaternion.normalize();
        }

        // ==================== 9. UPDATE ENGINE RPM ====================
        this._updateEngineRPM(dt, input, groundedCount);

        // ==================== 10. UPDATE DRIFT STATE ====================
        this._updateDriftState(dt, input);

        // ==================== 11. GROUND COLLISION SAFETY ====================
        this._ensureAboveGround();
    }

    /**
     * Process a single wheel: suspension, friction, drive
     * @returns {{ force: THREE.Vector3, torque: THREE.Vector3 }}
     */
    _processWheel(wheelIndex, dt, input) {
        const result = { force: new THREE.Vector3(), torque: new THREE.Vector3() };

        // Get wheel position in world space
        const wheelMountLocal = this.wheelLocalPositions[wheelIndex].clone();
        const wheelMountWorld = this._localToWorld(wheelMountLocal);

        // Get ground height at wheel XZ position
        const groundHeight = this.physicsProvider.getHeightAt(wheelMountWorld.x, wheelMountWorld.z);
        const groundNormal = this.physicsProvider.getNormalAt(wheelMountWorld.x, wheelMountWorld.z);

        // The wheel hub should be at groundHeight + wheelRadius when on ground
        // The suspension mount (wheelMountWorld) is at car body level
        // 
        // At rest ride height:
        //   - wheelMountWorld.y = groundHeight + wheelRadius + suspensionRestLength
        //   - Spring is at rest length, compression = 0
        //
        // When car drops:
        //   - wheelMountWorld.y decreases
        //   - Spring compresses: compression = (restLength + wheelRadius) - (wheelMountWorld.y - groundHeight)

        const distanceToGround = wheelMountWorld.y - groundHeight;
        const targetDistance = this.wheelRadius + this.suspensionRestLength; // Distance at rest
        const compression = targetDistance - distanceToGround;

        // Check if wheel can reach ground (within max extension)
        const maxExtension = this.suspensionRestLength + this.suspensionTravel;
        const minDistance = this.wheelRadius - this.suspensionTravel; // Minimum before bottoming out

        if (distanceToGround < this.wheelRadius + maxExtension && distanceToGround > 0) {
            this.wheelGrounded[wheelIndex] = true;

            // Contact point on ground
            const contactPoint = new THREE.Vector3(wheelMountWorld.x, groundHeight, wheelMountWorld.z);
            this.wheelContactPoints[wheelIndex].copy(contactPoint);
            this.wheelCompressions[wheelIndex] = compression;

            // Apply suspension force if compressed (compression > 0)
            if (compression > 0) {
                // Clamp to max travel
                const clampedCompression = Math.min(compression, this.suspensionTravel);

                // Spring force (Hooke's law)
                const springForce = this.suspensionStiffness * clampedCompression;

                // Damping force
                const wheelWorldVel = this._getVelocityAtPoint(wheelMountWorld);
                const compressionVelocity = -wheelWorldVel.dot(this._upDir);
                const dampingForce = this.suspensionDamping * compressionVelocity;

                // Total force (can only push, not pull)
                let suspForce = springForce + dampingForce;
                suspForce = Math.max(0, suspForce);

                // ==================== HARD COLLISION (BUMP STOP) ====================
                // When compression exceeds max travel, the suspension has bottomed out.
                // Apply a very strong "bump stop" force to prevent clipping through ground.
                if (compression > this.suspensionTravel) {
                    const overCompression = compression - this.suspensionTravel;
                    // Bump stop stiffness is much higher than spring stiffness (10x)
                    const bumpStopStiffness = this.suspensionStiffness * 10;
                    const bumpStopForce = bumpStopStiffness * overCompression;

                    // Add strong damping to prevent bouncing
                    const bumpStopDamping = this.suspensionDamping * 5;
                    const bumpStopDampingForce = bumpStopDamping * Math.max(0, compressionVelocity);

                    suspForce += bumpStopForce + bumpStopDampingForce;

                    // Also kill downward velocity at this wheel to prevent continued sinking
                    const downwardVel = wheelWorldVel.dot(this._upDir);
                    if (downwardVel < 0) {
                        // Apply impulse-like correction by adjusting velocity
                        const correction = this._upDir.clone().multiplyScalar(-downwardVel * 0.5);
                        this.velocity.add(correction);
                    }
                }

                this.wheelSuspensionForces[wheelIndex] = suspForce;

                // Apply force along ground normal
                const suspensionForce = groundNormal.clone().multiplyScalar(suspForce);
                result.force.add(suspensionForce);

                // Torque from force at wheel mount position
                const leverArm = wheelMountWorld.clone().sub(this.position);
                const torque = leverArm.clone().cross(suspensionForce);
                result.torque.add(torque);

                // Tire forces
                const tireForces = this._computeTireForces(wheelIndex, dt, input, groundNormal);
                result.force.add(tireForces.force);
                result.torque.add(tireForces.torque);
            } else {
                // Spring extended - still grounded but no force
                this.wheelSuspensionForces[wheelIndex] = 0;
            }
        } else {
            // Not touching ground
            this.wheelGrounded[wheelIndex] = false;
            this.wheelCompressions[wheelIndex] = 0;
            this.wheelSuspensionForces[wheelIndex] = 0;
        }

        return result;
    }


    /**
     * Compute tire forces (friction, drive, braking)
     */
    _computeTireForces(wheelIndex, dt, input, groundNormal) {
        const result = { force: new THREE.Vector3(), torque: new THREE.Vector3() };

        const isFront = wheelIndex < 2;
        const isRear = wheelIndex >= 2;

        // Get velocity at contact point
        const contactPoint = this.wheelContactPoints[wheelIndex];
        const wheelVel = this._getVelocityAtPoint(contactPoint);

        // Project velocity onto ground plane
        const velAlongNormal = wheelVel.dot(groundNormal);
        const groundVel = wheelVel.clone().sub(groundNormal.clone().multiplyScalar(velAlongNormal));

        // Get wheel forward direction (includes steering for front wheels)
        let wheelForward = this._forwardDir.clone();
        if (isFront) {
            // Rotate by steering angle around car's up axis
            const steerQuat = new THREE.Quaternion().setFromAxisAngle(this._upDir, this.steeringAngle);
            wheelForward.applyQuaternion(steerQuat);
        }

        // Wheel right direction
        const wheelRight = wheelForward.clone().cross(groundNormal).normalize();

        // Decompose velocity into forward/lateral
        const forwardVel = groundVel.dot(wheelForward);
        const lateralVel = groundVel.dot(wheelRight);

        // Normal load on this wheel (from suspension)
        const normalLoad = this.wheelSuspensionForces[wheelIndex];
        if (normalLoad <= 0) return result;

        // Maximum friction force
        const maxFriction = this.gripCoefficient * normalLoad;

        // ==================== LONGITUDINAL (DRIVE/BRAKE) ====================
        let longitudinalForce = 0;

        if (isRear) {
            // Rear wheels are driven
            const throttle = input.throttle || 0;
            const brake = input.brake || 0;

            if (throttle > 0 && this.currentGear !== 1) {
                // Apply engine torque
                const torqueMultiplier = this._getEngineTorqueMultiplier();
                const gearRatio = this.gears[this.currentGear];
                const totalRatio = gearRatio * this.finalDrive;

                // Engine torque (scaled by S² for game world)
                const engineTorque = this.maxTorque * torqueMultiplier * throttle * this.scaleFactor * this.scaleFactor;
                const wheelTorque = engineTorque * totalRatio;
                const driveForce = wheelTorque / this.wheelRadius;

                // Wheel spin model: if drive force > friction, wheel spins
                const targetSpinVel = forwardVel / this.wheelRadius;
                const spinAccel = (driveForce / this.mass) / this.wheelRadius;
                this.wheelSpinVelocities[wheelIndex] += spinAccel * dt;

                // Friction limits actual forward force
                const slipRatio = (this.wheelSpinVelocities[wheelIndex] * this.wheelRadius - forwardVel) /
                    Math.max(Math.abs(forwardVel), 1);
                const frictionScale = Math.min(1, 1 / (1 + Math.abs(slipRatio) * 5));
                longitudinalForce = Math.min(driveForce * frictionScale, maxFriction * 0.5);
            }

            if (brake > 0) {
                // Braking force opposes motion
                const brakeForce = maxFriction * brake;
                const brakeDir = forwardVel > 0 ? -1 : 1;
                longitudinalForce += brakeForce * brakeDir * 0.5;

                // Slow wheel spin
                this.wheelSpinVelocities[wheelIndex] *= (1 - brake * 0.1);
            }

            // Wheel spin decay
            const groundSpinVel = forwardVel / this.wheelRadius;
            this.wheelSpinVelocities[wheelIndex] += (groundSpinVel - this.wheelSpinVelocities[wheelIndex]) * 0.1;
        }

        if (isFront && (input.brake || 0) > 0) {
            // Front brakes
            const brake = input.brake;
            const brakeForce = maxFriction * brake * 0.5;
            const brakeDir = forwardVel > 0 ? -1 : 1;
            longitudinalForce = brakeForce * brakeDir;
        }

        // Rolling resistance
        const rollingForce = normalLoad * this.rollingResistance;
        if (forwardVel > 0.1) {
            longitudinalForce -= rollingForce;
        } else if (forwardVel < -0.1) {
            longitudinalForce += rollingForce;
        }

        // ==================== LATERAL (CORNERING/DRIFTING) ====================
        // Calculate slip angle (angle between wheel direction and actual velocity)
        const groundSpeed = groundVel.length();
        let slipAngle = 0;
        if (groundSpeed > 0.5) {
            // Slip angle = angle between velocity and wheel heading
            const velNormalized = groundVel.clone().normalize();
            const dotProduct = velNormalized.dot(wheelForward);
            const clampedDot = THREE.MathUtils.clamp(dotProduct, -1, 1);
            slipAngle = Math.acos(clampedDot);

            // Determine sign of slip angle based on lateral velocity
            if (lateralVel < 0) slipAngle = -slipAngle;
        }

        // Check if drifting based on slip angle
        const aboveThreshold = Math.abs(slipAngle) > this.driftAngleThreshold;
        const handbrakeActive = (input.handbrake || 0) > 0.5;

        // ==================== LATERAL (CORNERING/DRIFTING) ====================
        let lateralForce = 0;

        if (Math.abs(lateralVel) > 0.05) {
            // Base lateral grip - strong for normal cornering
            let lateralGripMultiplier = 1.0;

            // HANDBRAKE: Rear wheels lose most lateral grip (allows tail to swing out)
            if (isRear && handbrakeActive) {
                lateralGripMultiplier = 0.1; // Only 10% grip on rear when handbrake
                // Lock rear wheels
                this.wheelSpinVelocities[wheelIndex] *= 0.85;
            }
            // DRIFTING: When already sliding, reduce grip to maintain the slide
            else if (aboveThreshold) {
                if (isRear) {
                    // Rear loses more grip when drifting - allows oversteer
                    lateralGripMultiplier = this.driftGripMultiplier;
                } else {
                    // Front keeps more grip for steering control during drift
                    lateralGripMultiplier = 0.8;
                }
            }

            // Speed-sensitive steering boost - compensate for physics understeer at high speed
            // At low speed (< 30 km/h): multiplier = 1.0
            // At high speed (100+ km/h): multiplier = 1.8 for front, 1.3 for rear
            const speedKMH = this.getSpeedKMH();
            let speedBoost = 1.0;
            if (speedKMH > 30) {
                const speedFactor = Math.min(1.0, (speedKMH - 30) / 70); // 0 at 30km/h, 1 at 100km/h
                if (isFront) {
                    speedBoost = 1.0 + speedFactor * 0.8; // Up to 1.8x at high speed
                } else {
                    speedBoost = 1.0 + speedFactor * 0.3; // Rear gets less boost to maintain balance
                }
            }

            // Calculate lateral friction force
            // Strong multiplier (1.2) for responsive steering, with speed boost
            const lateralFriction = Math.abs(lateralVel) * normalLoad * 1.2 * lateralGripMultiplier * speedBoost;
            const maxLateralForce = maxFriction * lateralGripMultiplier * 0.95 * speedBoost;

            // Lateral force opposes sideways motion
            lateralForce = -Math.sign(lateralVel) * Math.min(lateralFriction, maxLateralForce);

            // Apply lateral inertia during drift - reduces force to let car carry sideways momentum
            if ((isRear && handbrakeActive) || aboveThreshold) {
                lateralForce *= (1.0 - this.lateralInertiaFactor * 0.6);
            }
        }

        // ==================== APPLY FORCES ====================
        const forceVec = wheelForward.clone().multiplyScalar(longitudinalForce);
        forceVec.add(wheelRight.clone().multiplyScalar(lateralForce));
        result.force.copy(forceVec);

        // Torque from tire forces
        const leverArm = contactPoint.clone().sub(this.position);
        const tireTorque = leverArm.clone().cross(forceVec);
        result.torque.copy(tireTorque);

        return result;
    }

    /**
     * Get engine torque multiplier from power curve
     */
    _getEngineTorqueMultiplier() {
        const rpmNormalized = (this.engineRPM - this.idleRPM) / (this.redlineRPM - this.idleRPM);
        const curveIndex = Math.min(this.powerCurve.length - 1, Math.floor(rpmNormalized * (this.powerCurve.length - 1)));
        return this.powerCurve[curveIndex] || 0.5;
    }

    /**
     * Update engine RPM based on wheel speeds and throttle
     */
    _updateEngineRPM(dt, input, groundedCount) {
        const throttle = input.throttle || 0;

        if (groundedCount >= 2 && this.currentGear !== 1) {
            // Calculate RPM from rear wheel average speed
            const avgRearSpeed = (Math.abs(this.wheelSpinVelocities[2]) + Math.abs(this.wheelSpinVelocities[3])) / 2;
            const wheelRPM = (avgRearSpeed * 60) / (2 * Math.PI);
            const gearRatio = Math.abs(this.gears[this.currentGear]) || 1;
            const engineRPMFromWheels = wheelRPM * gearRatio * this.finalDrive;

            // Blend with throttle influence
            const targetRPM = Math.max(this.idleRPM, engineRPMFromWheels + throttle * 1000);
            this.engineRPM += (targetRPM - this.engineRPM) * dt * 5;
        } else {
            // Free rev
            const targetRPM = this.idleRPM + throttle * (this.redlineRPM - this.idleRPM) * 0.7;
            this.engineRPM += (targetRPM - this.engineRPM) * dt * 3;
        }

        // Clamp RPM
        this.engineRPM = THREE.MathUtils.clamp(this.engineRPM, this.idleRPM, this.redlineRPM);
    }

    /**
     * Get velocity at a world point (includes angular velocity contribution)
     */
    _getVelocityAtPoint(worldPoint) {
        const r = worldPoint.clone().sub(this.position);
        const angularContrib = this.angularVelocity.clone().cross(r);
        return this.velocity.clone().add(angularContrib);
    }

    /**
     * Safety: ensure car doesn't clip through terrain
     * Checks all wheel positions to prevent any part of the car from going underground
     */
    _ensureAboveGround() {
        let correctionNeeded = false;
        let maxCorrection = 0;

        // Check each wheel mount position
        for (let i = 0; i < 4; i++) {
            const wheelMountLocal = this.wheelLocalPositions[i].clone();
            const wheelMountWorld = this._localToWorld(wheelMountLocal);

            const groundHeight = this.physicsProvider.getHeightAt(wheelMountWorld.x, wheelMountWorld.z);
            // Minimum height: ground + wheel radius (wheel can't go through ground)
            const minWheelHeight = groundHeight + this.wheelRadius;

            const penetration = minWheelHeight - wheelMountWorld.y;
            if (penetration > maxCorrection) {
                maxCorrection = penetration;
                correctionNeeded = true;
            }
        }

        // Also check car center
        const centerGroundHeight = this.physicsProvider.getHeightAt(this.position.x, this.position.z);
        const minCenterHeight = centerGroundHeight + this.wheelRadius;
        const centerPenetration = minCenterHeight - this.position.y;
        if (centerPenetration > maxCorrection) {
            maxCorrection = centerPenetration;
            correctionNeeded = true;
        }

        // Apply correction if needed
        if (correctionNeeded && maxCorrection > 0) {
            this.position.y += maxCorrection;
            // Kill downward velocity to prevent further sinking
            if (this.velocity.y < 0) {
                this.velocity.y *= -0.3; // Bounce slightly
            }
        }
    }

    // ==================== GEAR CONTROL ====================
    shiftUp() {
        if (this.currentGear < this.gears.length - 1) {
            this.currentGear++;
        }
    }

    shiftDown() {
        if (this.currentGear > 0) {
            this.currentGear--;
        }
    }

    getCurrentGear() {
        return this.currentGear;
    }

    getGearRatio() {
        return this.gears[this.currentGear];
    }

    // ==================== STATE ACCESSORS ====================
    getSpeed() {
        return this.velocity.length();
    }

    getSpeedKMH() {
        // Convert game units/s to km/h (considering scale factor)
        return (this.velocity.length() / this.scaleFactor) * 3.6;
    }

    getRPM() {
        return this.engineRPM;
    }

    isAnyWheelGrounded() {
        return this.wheelGrounded.some(g => g);
    }

    getWheelCompressions() {
        return this.wheelCompressions;
    }

    // ==================== DRIFT STATE ====================
    /**
     * Update drift state variables for UI and audio feedback
     */
    _updateDriftState(dt, input) {
        // Calculate lateral velocity in car's local space
        const localVelocity = this.velocity.clone().applyQuaternion(this.quaternion.clone().invert());
        this.lateralVelocity = localVelocity.x; // X is right in local space

        // Calculate drift intensity based on slip angle
        const forwardSpeed = Math.abs(localVelocity.z);
        const lateralSpeed = Math.abs(this.lateralVelocity);

        if (forwardSpeed > 2) {
            // Slip ratio: how much lateral vs forward motion
            const slipRatio = lateralSpeed / (forwardSpeed + 0.1);
            this.driftIntensity = THREE.MathUtils.clamp(slipRatio * 2, 0, 1);
        } else {
            this.driftIntensity *= 0.95; // Decay when slow
        }

        // Check if actively drifting
        const handbrakeActive = (input.handbrake || 0) > 0.5;
        this.isDrifting = this.driftIntensity > 0.2 || handbrakeActive;

        // Smooth grip recovery when not drifting
        if (this.isDrifting) {
            // Reduce grip during drift
            this.currentDriftGrip = THREE.MathUtils.lerp(
                this.currentDriftGrip,
                this.driftGripMultiplier,
                dt * 5
            );
        } else {
            // Recover grip after drift
            this.currentDriftGrip = THREE.MathUtils.lerp(
                this.currentDriftGrip,
                1.0,
                dt * this.driftRecoveryRate
            );
        }
    }

    /**
     * Get current drift intensity (0-1)
     */
    getDriftIntensity() {
        return this.driftIntensity;
    }

    /**
     * Check if car is currently drifting
     */
    getIsDrifting() {
        return this.isDrifting;
    }

    /**
     * Get current lateral velocity (for tire smoke, audio, etc.)
     */
    getLateralVelocity() {
        return this.lateralVelocity;
    }

    /**
     * Get current drift grip multiplier
     */
    getCurrentDriftGrip() {
        return this.currentDriftGrip;
    }
}
