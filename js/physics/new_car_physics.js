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
        this.counterSteerBoost = carSpec.steering?.counterSteerBoost || 1.8; // Multiplier for countersteering
        this.highSpeedSteerLimit = carSpec.steering?.highSpeedLimit || 0.65; // Min steering ratio at high speed

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
        // Pacejka tire model parameters
        this.pacejkaB = carSpec.tires?.pacejkaB || 10;   // Stiffness factor
        this.pacejkaC = carSpec.tires?.pacejkaC || 1.4;  // Shape factor
        this.pacejkaE = carSpec.tires?.pacejkaE || -0.5; // Curvature factor

        // Center of gravity for weight transfer
        this.cgHeight = carSpec.dimensions?.cgHeight || 2.4;

        // Weight transfer tracking
        this.lateralWeightTransfer = [0, 0, 0, 0]; // Per-wheel load adjustment
        this.longitudinalWeightTransfer = 0;

        // ==================== DRIFT MECHANICS ====================
        // Drift parameters for lateral inertia and sliding behavior
        this.driftGripMultiplier = carSpec.drift?.gripMultiplier || 0.45;     // Increased grip when drifting (was 0.2)
        this.lateralInertiaFactor = carSpec.drift?.lateralInertia || 0.4;   // Reduced lateral inertia (was 0.6)
        this.handbrakeGripReduction = carSpec.drift?.handbrakeGripReduction || 0.15; // Rear grip when handbrake is pulled
        this.driftAngleThreshold = carSpec.drift?.angleThreshold || 0.08;    // Slip angle to trigger drift state
        this.driftRecoveryRate = carSpec.drift?.recoveryRate || 3.0;         // Faster recovery (was 1.0)

        // Drift state tracking
        this.isDrifting = false;
        this.isBoosting = false;
        this.driftIntensity = 0;         // 0-1, how much the car is currently sliding
        this.lateralVelocity = 0;        // Tracks lateral speed for inertia
        this.currentDriftGrip = 1.0;     // Current grip multiplier (smoothed)

        // Wheel spin velocities (for realistic wheel-spin)
        this.wheelSpinVelocities = [0, 0, 0, 0]; // rad/s for each wheel

        // ==================== AIRBORNE STATE ====================
        this.isAirborne = false;              // True when no wheels are touching ground
        this.airborneTime = 0;                // Time spent in the air (seconds)
        this.airControlStrength = carSpec.airborne?.controlStrength || 0.3; // How much player can adjust rotation in air
        this.airAngularDamping = carSpec.airborne?.angularDamping || 0.9999; // Very low damping in air (preserves spin)
        this.groundAngularDamping = carSpec.airborne?.groundDamping || 0.98; // Normal damping on ground

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
        const baseGravity = (this.physicsProvider && this.physicsProvider.getGravity) ?
            this.physicsProvider.getGravity() : 9.81;

        // Apply scale factor (gravity is negative Y)
        const currentGravity = -baseGravity * this.scaleFactor;
        const gravityForce = new THREE.Vector3(0, currentGravity * this.mass, 0);

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
        // Speed-dependent steering limit: reduce max angle at high speed for stability
        const speedKMH = this.getSpeedKMH();
        const speedSteerFactor = THREE.MathUtils.lerp(1.0, this.highSpeedSteerLimit,
            THREE.MathUtils.clamp((speedKMH - 40) / 80, 0, 1)); // Full reduction at 120+ km/h
        const effectiveMaxSteer = this.maxSteeringAngle * speedSteerFactor;

        const steerInput = input.steer || 0;
        const steerTarget = steerInput * effectiveMaxSteer;

        // Countersteering detection: faster response when steering opposite to current angle
        const isCountersteering = Math.sign(steerTarget) !== Math.sign(this.steeringAngle) &&
            Math.abs(this.steeringAngle) > 0.05;
        const steerSpeed = isCountersteering ? this.steeringSpeed * this.counterSteerBoost : this.steeringSpeed;

        this.steeringAngle += (steerTarget - this.steeringAngle) * Math.min(1, steerSpeed * dt * 5);

        // ==================== 3.5 WEIGHT TRANSFER ====================
        this._updateWeightTransfer(input);

        // ==================== 3.6 NITROUS BOOST ====================
        this.isBoosting = input.boost || false;
        if (this.isBoosting) {
            // Apply strong forward force (Rocket-style boost)
            // Force = Mass * Acceleration. Target ~1.5G extra acceleration.
            const boostAccel = 15.0 * this.scaleFactor; 
            const boostForce = this._forwardDir.clone().multiplyScalar(this.mass * boostAccel);
            totalForce.add(boostForce);
        }

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

        // ==================== UPDATE AIRBORNE STATE ====================
        this.isAirborne = (groundedCount === 0);
        if (this.isAirborne) {
            this.airborneTime += dt;
        } else {
            this.airborneTime = 0;
        }

        // Angular damping - much lower in air to preserve rotation momentum
        if (this.isAirborne) {
            // ==================== PURE AIRBORNE PHYSICS ====================
            // In the air, angular momentum is preserved with almost no damping.
            // The car will continue rotating with whatever spin it had when leaving ground.
            // This is 0.9999 - essentially no damping per frame.
            this.angularVelocity.multiplyScalar(1.0); // No damping at all in air

            // Optional: Subtle weight distribution effect
            // Real cars have weight distribution that causes slight nose-down tendency
            // This is VERY subtle and doesn't fight existing rotation
            const weightBias = 2.0; // 0 = no effect, higher = stronger nose-down
            if (weightBias > 0) {
                // Only apply if car is relatively level (not mid-tumble)
                const upDotWorld = this._upDir.dot(new THREE.Vector3(0, 1, 0));
                if (upDotWorld > 0.2) { // Car is somewhat upright (lowered threshold)
                    // Gentle nose-down torque based on how tilted the nose is
                    const nosePitch = this._forwardDir.y; // How much nose points up (+) or down (-)
                    // If nose is up (positive), apply forward pitch to bring it down
                    const pitchCorrection = nosePitch * weightBias * 1.5;
                    this.angularVelocity.x += this._rightDir.x * pitchCorrection * dt;
                    this.angularVelocity.z += this._rightDir.z * pitchCorrection * dt;
                }
            }

            // Air control: player can adjust rotation while airborne
            if (this.airControlStrength > 0) {
                const steer = input.steer || 0;
                const pitch = (input.throttle || 0) - (input.brake || 0);

                // Direct angular velocity modification for responsive air control
                const yawRate = steer * this.airControlStrength * 3.0;
                const pitchRate = -pitch * this.airControlStrength * 2.0;
                const rollRate = steer * this.airControlStrength * 1.5;

                // Apply in local space then convert to world
                const localAngVelDelta = new THREE.Vector3(pitchRate, yawRate, rollRate);
                localAngVelDelta.applyQuaternion(this.quaternion);
                this.angularVelocity.add(localAngVelDelta.multiplyScalar(dt));
            }
        } else {
            this.angularVelocity.multiplyScalar(this.groundAngularDamping);
        }

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

        // ==================== FLIP DETECTION ====================
        // Check if the car is flipped by comparing car's up vector with ground normal.
        // If the car's up direction is pointing away from the ground (dot product < threshold),
        // the suspension should not apply forces - only body collision should affect the car.
        const upDotGround = this._upDir.dot(groundNormal);
        if (upDotGround < 0.1) {
            // Car is flipped or nearly flipped - wheels cannot contact ground properly
            this.wheelGrounded[wheelIndex] = false;
            this.wheelCompressions[wheelIndex] = 0;
            this.wheelSuspensionForces[wheelIndex] = 0;
            return result;
        }

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
     * Update weight transfer based on acceleration and cornering
     */
    _updateWeightTransfer(input) {
        const trackWidth = this.spec.dimensions?.trackWidth || 7.55;
        const wheelBase = this.spec.dimensions?.wheelBase || 10.55;

        // Get local velocity to determine lateral and longitudinal G-forces
        const localVelocity = this.velocity.clone().applyQuaternion(this.quaternion.clone().invert());
        const lateralSpeed = localVelocity.x;
        const forwardSpeed = Math.abs(localVelocity.z);

        // Estimate lateral G-force from cornering (simplified)
        // Using centripetal acceleration approximation: a = v²/r, and we estimate r from steer angle
        let lateralG = 0;
        if (forwardSpeed > 5 && Math.abs(this.steeringAngle) > 0.01) {
            const turnRadius = wheelBase / Math.tan(Math.abs(this.steeringAngle) + 0.01);
            const centripetalAccel = (forwardSpeed * forwardSpeed) / turnRadius;
            lateralG = centripetalAccel / (9.81 * this.scaleFactor);
            // Clamp to reasonable values
            lateralG = THREE.MathUtils.clamp(lateralG, -2.5, 2.5);
            // Sign based on steering direction
            if (this.steeringAngle < 0) lateralG = -lateralG;
        }

        // Longitudinal weight transfer (braking shifts weight forward)
        const brake = input.brake || 0;
        const throttle = input.throttle || 0;
        this.longitudinalWeightTransfer = (brake * 0.3 - throttle * 0.15) * this.mass * 9.81;

        // Lateral weight transfer calculation
        // Transfer = (lateral_G * mass * cgHeight) / trackWidth
        const lateralTransfer = (lateralG * this.mass * this.cgHeight) / trackWidth;

        // Apply to each wheel:
        // Left wheels (0, 2): subtract when turning right, add when turning left
        // Right wheels (1, 3): add when turning right, subtract when turning left
        this.lateralWeightTransfer[0] = -lateralTransfer; // Front Left
        this.lateralWeightTransfer[1] = lateralTransfer;  // Front Right
        this.lateralWeightTransfer[2] = -lateralTransfer; // Rear Left
        this.lateralWeightTransfer[3] = lateralTransfer;  // Rear Right
    }

    /**
     * Get Ackermann steering angle for a specific wheel
     * Inner wheel turns sharper than outer for realistic cornering geometry
     */
    _getWheelSteerAngle(wheelIndex) {
        if (wheelIndex >= 2) return 0; // Rear wheels don't steer

        const baseAngle = this.steeringAngle;
        if (Math.abs(baseAngle) < 0.001) return 0;

        const wheelBase = this.spec.dimensions?.wheelBase || 10.55;
        const trackWidth = this.spec.dimensions?.trackWidth || 7.55;

        // Calculate turn radius from steering angle
        const turnRadius = wheelBase / Math.tan(Math.abs(baseAngle));

        // Ackermann geometry: inner wheel has sharper angle, outer has shallower
        const isLeft = wheelIndex === 0;
        const turningLeft = baseAngle > 0;
        const isInnerWheel = (isLeft && turningLeft) || (!isLeft && !turningLeft);

        let wheelAngle;
        if (isInnerWheel) {
            // Inner wheel turns more
            wheelAngle = Math.atan(wheelBase / (turnRadius - trackWidth / 2));
        } else {
            // Outer wheel turns less
            wheelAngle = Math.atan(wheelBase / (turnRadius + trackWidth / 2));
        }

        // Apply correct sign based on steering direction
        return baseAngle > 0 ? wheelAngle : -wheelAngle;
    }

    /**
     * Pacejka-inspired lateral force calculation (simplified Magic Formula)
     * Provides non-linear grip that saturates at high slip angles
     */
    _getLateralForceFromSlip(slipAngle, normalLoad, gripMultiplier = 1.0) {
        const B = this.pacejkaB;  // Stiffness factor
        const C = this.pacejkaC;  // Shape factor
        const D = normalLoad * this.gripCoefficient * gripMultiplier; // Peak value
        const E = this.pacejkaE;  // Curvature factor

        // Simplified Pacejka "Magic Formula"
        // F = D * sin(C * atan(B*slip - E*(B*slip - atan(B*slip))))
        const Bslip = B * slipAngle;
        const force = D * Math.sin(C * Math.atan(Bslip - E * (Bslip - Math.atan(Bslip))));

        return force;
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

        // Get wheel forward direction with Ackermann steering for front wheels
        let wheelForward = this._forwardDir.clone();
        if (isFront) {
            // Use Ackermann steering angle for this specific wheel
            const wheelSteerAngle = this._getWheelSteerAngle(wheelIndex);
            const steerQuat = new THREE.Quaternion().setFromAxisAngle(this._upDir, wheelSteerAngle);
            wheelForward.applyQuaternion(steerQuat);
        }

        // Wheel right direction
        const wheelRight = wheelForward.clone().cross(groundNormal).normalize();

        // Decompose velocity into forward/lateral
        const forwardVel = groundVel.dot(wheelForward);
        const lateralVel = groundVel.dot(wheelRight);

        // Normal load on this wheel (from suspension + weight transfer)
        let normalLoad = this.wheelSuspensionForces[wheelIndex];
        // Apply weight transfer
        normalLoad += this.lateralWeightTransfer[wheelIndex];
        // Apply longitudinal weight transfer (front gets more under braking)
        if (isFront) {
            normalLoad += this.longitudinalWeightTransfer * 0.5;
        } else {
            normalLoad -= this.longitudinalWeightTransfer * 0.5;
        }
        // Clamp to prevent negative load
        normalLoad = Math.max(0, normalLoad);
        if (normalLoad <= 0) return result;

        // Get surface friction from physics provider
        let surfaceFriction = 1.0;
        if (this.physicsProvider && this.physicsProvider.getSurfaceType) {
            const surface = this.physicsProvider.getSurfaceType(contactPoint.x, contactPoint.z);
            surfaceFriction = surface.friction || 1.0;
        }

        // Maximum friction force (scaled by surface friction)
        const effectiveGrip = this.gripCoefficient * surfaceFriction;
        const maxFriction = effectiveGrip * normalLoad;

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
            // Front brakes (more effective due to weight transfer)
            const brake = input.brake;
            const brakeForce = maxFriction * brake * 0.6; // Front brakes do 60% of braking
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
            // Slip angle = atan2(lateral_vel, forward_vel) for accurate calculation
            slipAngle = Math.atan2(lateralVel, Math.abs(forwardVel) + 0.1);
        }

        // Check if drifting based on slip angle
        const aboveThreshold = Math.abs(slipAngle) > this.driftAngleThreshold;
        const handbrakeActive = (input.handbrake || 0) > 0.5;

        // Calculate lateral force using Pacejka-inspired model
        let lateralForce = 0;

        if (Math.abs(lateralVel) > 0.05 || Math.abs(slipAngle) > 0.01) {
            // Base lateral grip multiplier
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
                    lateralGripMultiplier = 0.85;
                }
            }

            // Use Pacejka model for non-linear tire response
            const pacejkaForce = this._getLateralForceFromSlip(slipAngle, normalLoad, lateralGripMultiplier);

            // Speed-sensitive boost for high-speed cornering
            const speedKMH = this.getSpeedKMH();
            let speedBoost = 1.0;
            if (speedKMH > 30 && !handbrakeActive && !aboveThreshold) {
                // Progressive boost for normal cornering, not during drift
                const speedFactor = Math.min(1.0, (speedKMH - 30) / 80);
                if (isFront) {
                    speedBoost = 1.0 + speedFactor * 0.6; // Up to 1.6x at high speed
                } else {
                    speedBoost = 1.0 + speedFactor * 0.25; // Rear gets less boost
                }
            }

            // Apply Pacejka force with speed boost
            lateralForce = -pacejkaForce * speedBoost * surfaceFriction;

            // Cap at maximum friction
            const maxLateralForce = maxFriction * lateralGripMultiplier * speedBoost;
            lateralForce = THREE.MathUtils.clamp(lateralForce, -maxLateralForce, maxLateralForce);

            // Apply lateral inertia during drift - reduces force to let car carry sideways momentum
            // MODIFY: Only apply this to REAR wheels. Front wheels need full force to steer the drift.
            if ((isRear && handbrakeActive) || (aboveThreshold && isRear)) {
                lateralForce *= (1.0 - this.lateralInertiaFactor * 0.5);
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

    /**
     * Check if car is fully airborne (no wheels touching ground)
     */
    getIsAirborne() {
        return this.isAirborne;
    }

    /**
     * Get time spent airborne (useful for jump effects, landing audio, etc.)
     */
    getAirborneTime() {
        return this.airborneTime;
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
     * Check if car is boosting
     */
    getIsBoosting() {
        return this.isBoosting;
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
