import * as THREE from 'three';

/**
 * Realistic Car Physics System
 * Features: Raycast suspension, tire slip model, engine/gearbox simulation
 */
export class CarPhysics {
    constructor(carMesh, terrain) {
        this.mesh = carMesh;
        this.terrain = terrain;

        // ==================== VEHICLE SPECS (AE86-inspired) ====================
        this.specs = {
            mass: 940,                    // kg
            wheelBase: 2.4,               // m (front to rear axle)
            trackWidth: 1.4,              // m (left to right)
            cgHeight: 0.45,               // Center of gravity height

            // Suspension
            suspensionRestLength: 0.4,
            suspensionTravel: 0.25,
            springStrength: 25000,        // N/m - reduced for less bounce
            damperStrength: 6000,         // N/(m/s) - increased for less oscillation

            // Wheels
            wheelRadius: 0.31,

            // Engine
            maxPower: 96000,              // Watts (~130 HP)
            maxTorque: 149,               // Nm
            redlineRPM: 7600,
            idleRPM: 900,

            // Transmission
            gearRatios: [-3.4, 0, 3.6, 2.2, 1.4, 1.0, 0.8], // R, N, 1-5
            finalDrive: 4.1,
            shiftTime: 0.2,

            // Steering
            maxSteerAngle: 0.6,           // radians (~35 degrees)
            steerSpeed: 2.5,

            // Tires
            gripCoefficient: 1.3,
            slipAnglePeak: 0.15,          // radians (~8.5 degrees)
            rollingResistance: 0.015,

            // Aero
            dragCoefficient: 0.35,
            frontalArea: 1.8,             // m^2
            airDensity: 1.225,            // kg/m^3
            downforce: 0.1
        };

        // ==================== STATE ====================
        this.position = new THREE.Vector3(0, 5, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.angularVelocity = new THREE.Vector3();

        // Derived - Note: In Three.js, -Z is forward
        this.forward = new THREE.Vector3(0, 0, 1); // Car faces +Z in local space, will be rotated by quaternion
        this.right = new THREE.Vector3(1, 0, 0);
        this.up = new THREE.Vector3(0, 1, 0);

        this.speed = 0;               // m/s (signed, + = forward)
        this.speedKmh = 0;
        this.rpm = this.specs.idleRPM;
        this.gear = 1;                // 0=N, 1-5=gears, -1=R (using index: 0=R, 1=N, 2-6=1st-5th)
        this.gearIndex = 2;           // Start in 1st gear
        this.isShifting = false;
        this.shiftTimer = 0;

        // Wheel states (FL, FR, RL, RR)
        // Front wheels at +Z (forward in car's local space), Rear at -Z
        this.wheels = [
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, 0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },   // FL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, 0, this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },    // FR
            { offset: new THREE.Vector3(-this.specs.trackWidth / 2, 0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 },  // RL
            { offset: new THREE.Vector3(this.specs.trackWidth / 2, 0, -this.specs.wheelBase / 2), compression: 0, velocity: 0, grounded: false, slipRatio: 0, slipAngle: 0, rpm: 0 }   // RR
        ];

        this.steerAngle = 0;
        this.throttleInput = 0;
        this.brakeInput = 0;
        this.handbrakeInput = 0;
    }

    /**
     * Main physics update
     */
    update(deltaTime, input) {
        // Clamp deltaTime to prevent physics explosions
        const dt = Math.min(deltaTime, 0.02);

        // Update inputs
        this.throttleInput = input.throttle;
        this.brakeInput = input.brake;
        this.handbrakeInput = input.handbrake;

        // Steering (speed-dependent sensitivity)
        const speedFactor = 1 - Math.min(Math.abs(this.speed) / 40, 0.7);
        const targetSteer = input.steering * this.specs.maxSteerAngle * speedFactor;
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, this.specs.steerSpeed * dt * 10);

        // Update direction vectors
        this._updateDirections();

        // ==================== SIMPLIFIED PHYSICS ====================
        let totalForce = new THREE.Vector3();

        // Ground check - simple raycast from center
        const groundHeight = this.terrain.getHeightAt(this.position.x, this.position.z);
        const targetHeight = groundHeight + 0.8; // Car body height above ground
        const isGrounded = this.position.y <= targetHeight + 0.5;

        if (isGrounded) {
            // Keep car on ground
            this.position.y = THREE.MathUtils.lerp(this.position.y, targetHeight, 10 * dt);
            if (this.velocity.y < 0) {
                this.velocity.y *= 0.5; // Dampen vertical velocity when grounded
            }

            // ==================== DRIVE FORCE ====================
            if (this.throttleInput > 0 && !this.isShifting) {
                const gearRatio = this.specs.gearRatios[this.gearIndex];
                if (gearRatio !== 0) {
                    // Simple force calculation
                    const maxForce = 8000; // Newtons - strong enough to accelerate car
                    const driveForce = maxForce * this.throttleInput;

                    // Apply force in forward direction
                    totalForce.addScaledVector(this.forward, driveForce);
                }
            }

            // ==================== BRAKE FORCE ====================
            if (this.brakeInput > 0) {
                const brakeForce = 12000 * this.brakeInput;
                // Apply opposite to velocity direction
                if (this.speed > 0.5) {
                    totalForce.addScaledVector(this.forward, -brakeForce);
                } else if (this.speed < -0.5) {
                    totalForce.addScaledVector(this.forward, brakeForce);
                } else if (this.gearIndex === 0) {
                    // Reverse
                    totalForce.addScaledVector(this.forward, -brakeForce * 0.5);
                }
            }

            // ==================== STEERING ====================
            if (Math.abs(this.speed) > 1) {
                // Turn rate based on speed and steering
                const turnRate = this.steerAngle * Math.min(Math.abs(this.speed) / 10, 1) * 2;
                this.rotation.y += turnRate * dt * Math.sign(this.speed);
            }

            // ==================== FRICTION/DRAG ====================
            // Rolling resistance
            if (Math.abs(this.speed) > 0.1) {
                const friction = 500 * Math.sign(this.speed);
                totalForce.addScaledVector(this.forward, -friction);
            }

            // Lateral friction (prevents sliding sideways)
            const lateralVel = this.velocity.dot(this.right);
            const lateralFriction = -lateralVel * this.specs.mass * 5;
            totalForce.addScaledVector(this.right, lateralFriction);

        } else {
            // In air - apply gravity
            totalForce.y -= this.specs.mass * 9.81;
        }

        // Aerodynamic drag
        const speedSquared = this.velocity.lengthSq();
        if (speedSquared > 1) {
            const dragMagnitude = 0.5 * 1.225 * 0.35 * 1.8 * speedSquared;
            const dragForce = this.velocity.clone().normalize().multiplyScalar(-dragMagnitude);
            totalForce.add(dragForce);
        }

        // ==================== INTEGRATE ====================
        // Acceleration
        const acceleration = totalForce.clone().divideScalar(this.specs.mass);
        this.velocity.addScaledVector(acceleration, dt);

        // Clamp velocity
        if (this.velocity.length() > 60) { // ~216 km/h max
            this.velocity.normalize().multiplyScalar(60);
        }

        // Update position
        this.position.addScaledVector(this.velocity, dt);

        // Terrain slope following
        const groundNormal = this.terrain.getNormalAt(this.position.x, this.position.z);
        const targetPitch = Math.asin(-groundNormal.z) * 0.3;
        const targetRoll = Math.asin(groundNormal.x) * 0.3;
        this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, targetPitch, 5 * dt);
        this.rotation.z = THREE.MathUtils.lerp(this.rotation.z, targetRoll, 5 * dt);

        // Update engine/transmission
        this._updateDrivetrain(dt);

        // Auto-shift
        this._autoShift();

        // Update mesh
        this._updateMesh();

        // Calculate speed for UI
        this.speed = this.velocity.dot(this.forward);
        this.speedKmh = Math.abs(this.speed * 3.6);
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
            const compressionRatio = Math.min(compression / this.specs.suspensionTravel, 1);
            const prevCompression = wheel.compression;
            wheel.compression = compressionRatio;

            // Suspension velocity
            wheel.velocity = (compressionRatio - prevCompression) / dt;

            // Spring force (Hooke's law) + Damping
            const springForce = compressionRatio * this.specs.suspensionTravel * this.specs.springStrength;
            const damperForce = wheel.velocity * this.specs.damperStrength;
            const suspensionForce = Math.max(springForce - damperForce, 0);

            // Apply suspension force in world up direction (simplified, should be along suspension axis)
            const groundNormal = this.terrain.getNormalAt(wheelWorldPos.x, wheelWorldPos.z);
            force.addScaledVector(groundNormal, suspensionForce);

            // Calculate tire forces
            const tireForces = this._calculateTireForces(index, suspensionForce, dt);
            force.add(tireForces);

            // Calculate torque from wheel force
            const leverArm = localOffset.clone();
            const torqueContrib = new THREE.Vector3().crossVectors(leverArm, tireForces);
            torque.add(torqueContrib);

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
        let wheelForward = this.forward.clone();
        let wheelRight = this.right.clone();

        if (isFront) {
            // Apply steering angle
            const steerQuat = new THREE.Quaternion().setFromAxisAngle(this.up, -this.steerAngle);
            wheelForward.applyQuaternion(steerQuat);
            wheelRight.applyQuaternion(steerQuat);
        }

        // Decompose velocity into wheel frame
        const forwardVel = pointVel.dot(wheelForward);
        const lateralVel = pointVel.dot(wheelRight);

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
                // Calculate engine torque
                const rpmNormalized = this.rpm / this.specs.redlineRPM;
                const torqueCurve = Math.sin(rpmNormalized * Math.PI) * 1.2;
                const engineTorque = this.specs.maxTorque * torqueCurve * this.throttleInput;

                // Convert to wheel force
                const transmissionRatio = Math.abs(gearRatio) * this.specs.finalDrive;
                const wheelTorque = engineTorque * transmissionRatio;
                const driveForce = wheelTorque / this.specs.wheelRadius;

                // Apply to each rear wheel (divide by 2 for differential)
                const forcePerWheel = driveForce / 2;

                // Limit by grip
                const maxDriveForce = normalLoad * this.specs.gripCoefficient * 0.9;
                longForce = Math.min(forcePerWheel, maxDriveForce);

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

    /**
     * Integrate forces to update velocity and position
     */
    _integrate(force, torque, dt) {
        // Linear acceleration
        const acceleration = force.divideScalar(this.specs.mass);
        this.velocity.addScaledVector(acceleration, dt);

        // Update position
        this.position.addScaledVector(this.velocity, dt);

        // Keep above terrain
        const groundHeight = this.terrain.getHeightAt(this.position.x, this.position.z);
        const minHeight = groundHeight + 0.5;
        if (this.position.y < minHeight) {
            this.position.y = minHeight;
            if (this.velocity.y < 0) this.velocity.y = 0;
        }

        // Angular acceleration (simplified - using Y-axis rotation mainly)
        const inertiaY = this.specs.mass * (this.specs.wheelBase * this.specs.wheelBase) / 12;
        const angularAccelY = torque.y / inertiaY;
        this.angularVelocity.y += angularAccelY * dt;

        // Angular damping
        this.angularVelocity.multiplyScalar(0.98);

        // Update rotation
        this.rotation.y += this.angularVelocity.y * dt;

        // Pitch based on slope
        const groundNormal = this.terrain.getNormalAt(this.position.x, this.position.z);
        const targetPitch = Math.asin(-groundNormal.z) * 0.5;
        const targetRoll = Math.asin(groundNormal.x) * 0.5;
        this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, targetPitch, 5 * dt);
        this.rotation.z = THREE.MathUtils.lerp(this.rotation.z, targetRoll, 5 * dt);
    }

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

        // Calculate engine torque (simplified torque curve)
        const rpmNormalized = this.rpm / this.specs.redlineRPM;
        const torqueCurve = Math.sin(rpmNormalized * Math.PI) * 1.2;
        const engineTorque = this.specs.maxTorque * torqueCurve * this.throttleInput;

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
     * Update the visual mesh
     */
    _updateMesh() {
        if (!this.mesh) return;

        this.mesh.position.copy(this.position);
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
}
