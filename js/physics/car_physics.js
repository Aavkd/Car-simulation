import * as THREE from 'three';

/**
 * Car Physics Engine
 * 
 * Core physics simulation for vehicle dynamics.
 * Handles suspension, tire forces, body collision, drivetrain, and integration.
 * 
 * Design: This class is stateless regarding car position/velocity - it receives
 * state from CarPhysics and returns forces/torques. This allows the physics
 * logic to be replaced independently of the car's visual and state systems.
 */
export class CarPhysicsEngine {
    /**
     * Build game-world specs from real-world car specification
     * Applies scale factor to physics values
     * @param {Object} spec - Raw car specification
     * @param {number} scale - Scale factor for physics (typically 4.5)
     * @returns {Object} Game-tuned specs
     */
    static buildGameSpecs(spec, scale) {
        const S = scale;

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
     * @param {Object} specs - Car specifications with width, height, length
     * @returns {Array} Array of collision point objects
     */
    static createBodyCollisionPoints(specs) {
        const w = specs.width / 2;   // Half width
        const h = specs.height / 2;  // Half height
        const l = specs.length / 2;  // Half length

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
     * Process a single wheel - suspension, tire forces
     * 
     * Key physics:
     * - Raycast along car's LOCAL UP vector (not world Y) for correct slope behavior
     * - Damping calculated from chassis velocity at wheel point (no 1-frame lag)
     * - Forces applied at shock mount point (reduces destabilizing torque)
     * - suspensionRestLength = FREE length (fully extended, unloaded spring)
     * - suspensionTravel = maximum compression distance from free length
     * 
     * @param {Object} params - Physics state parameters
     * @param {number} index - Wheel index (0=FL, 1=FR, 2=RL, 3=RR)
     * @param {number} dt - Delta time
     * @returns {Object} { force: THREE.Vector3, torque: THREE.Vector3 }
     */
    static processWheel(params, index, dt) {
        const { position, velocity, rotation, angularVelocity, wheels, specs, terrain, up, forward, right, steerAngle, throttleInput, brakeInput, handbrakeInput, isShifting, gearIndex, rpm } = params;

        const wheel = wheels[index];
        const isFront = index < 2;

        // Calculate wheel world position (wheel hub at rest)
        const wheelWorldPos = position.clone();
        const localOffset = wheel.offset.clone();
        const carQuat = new THREE.Quaternion().setFromEuler(rotation);
        localOffset.applyQuaternion(carQuat);
        wheelWorldPos.add(localOffset);

        // Use car's local UP vector for suspension direction, not world Y
        const localUp = up.clone();

        // Ray origin is at shock mount (wheel position + rest length along local up)
        const rayOrigin = wheelWorldPos.clone();
        rayOrigin.addScaledVector(localUp, specs.suspensionRestLength);

        // Total ray length from mount to wheel center at full extension + wheel radius
        const rayLength = specs.suspensionRestLength + specs.suspensionTravel + specs.wheelRadius;

        // Get ground height and calculate contact point
        const groundHeight = terrain.getHeightAt(wheelWorldPos.x, wheelWorldPos.z);
        const groundPoint = new THREE.Vector3(wheelWorldPos.x, groundHeight, wheelWorldPos.z);

        // Calculate distance to ground ALONG the local up axis
        const toGround = groundPoint.clone().sub(rayOrigin);
        const distanceToGround = -toGround.dot(localUp); // Positive when ground is below ray origin

        let force = new THREE.Vector3();
        let torque = new THREE.Vector3();

        // Suspension can only push the car AWAY from the ground
        const canApplySuspension = localUp.y > 0.1;

        if (distanceToGround < rayLength && distanceToGround > -specs.wheelRadius && canApplySuspension) {
            // Wheel is in contact range and car is oriented correctly for suspension
            wheel.grounded = true;

            // Get ground normal early (needed for velocity and force direction)
            const groundNormal = terrain.getNormalAt(wheelWorldPos.x, wheelWorldPos.z);

            // compression = how much spring is compressed from FREE length
            const compression = rayLength - distanceToGround;
            const compressionRatio = Math.min(compression / specs.suspensionTravel, 1.5);
            wheel.compression = compressionRatio;

            // Calculate chassis velocity at this wheel point (no 1-frame lag)
            const wheelPointVel = velocity.clone();
            const angularContrib = new THREE.Vector3().crossVectors(angularVelocity, localOffset);
            wheelPointVel.add(angularContrib);

            // Apply force strictly along car's local UP (suspension axis)
            const forceDirection = localUp.clone();

            // Calculate ground vertical velocity for damping (slope effect)
            let groundVerticalVel = 0;
            if (groundNormal.y > 0.15) {
                groundVerticalVel = -(groundNormal.x * wheelPointVel.x + groundNormal.z * wheelPointVel.z) / groundNormal.y;
                groundVerticalVel = Math.max(-50, Math.min(50, groundVerticalVel));
            }

            // Construct velocity vector of the contact point on the ground
            const groundPointVel = new THREE.Vector3(wheelPointVel.x, groundVerticalVel, wheelPointVel.z);

            // Relative velocity = Closing speed between chassis and ground
            const relVel = wheelPointVel.clone().sub(groundPointVel);

            // Damping velocity = rate of compression (positive = compressing)
            wheel.velocity = -relVel.dot(localUp);

            // Spring force (Hooke's law)
            const springForce = compressionRatio * specs.suspensionTravel * specs.springStrength;

            // Damper force with asymmetric rebound
            const dampingMultiplier = wheel.velocity > 0 ? 1.0 : 0.5;
            let damperForce = wheel.velocity * specs.damperStrength * dampingMultiplier;

            // Anti-jitter: reduce micro-oscillations when nearly at rest
            if (Math.abs(wheel.velocity) < 0.5 && compressionRatio < 0.3 && compressionRatio > 0.05) {
                damperForce *= 2.0;
            }

            // Bump stop forces
            let extraForce = 0;
            const maxCompress = specs.suspensionTravel;
            if (compression > maxCompress) {
                const penetration = compression - maxCompress;
                const bumpStiffness = 50000;
                const bumpDamping = 8000;
                const bumpSpringForce = penetration * bumpStiffness;
                const bumpDampForce = wheel.velocity > 0 ? wheel.velocity * bumpDamping : 0;
                extraForce = bumpSpringForce + bumpDampForce;
            }

            // Total suspension force
            let suspensionForce = springForce + damperForce + extraForce;

            // Smooth initial contact
            if (!wheel.wasGrounded && compressionRatio < 0.15) {
                suspensionForce *= 0.5 + (compressionRatio / 0.15) * 0.5;
            }

            // Clamp force
            suspensionForce = Math.max(0, Math.min(suspensionForce, 200000));

            // Store for debug
            wheel.forceVal = suspensionForce;

            let suspForceVec = forceDirection.clone().multiplyScalar(suspensionForce);

            // Final safety check: if force would push car INTO ground (negative Y), zero it out
            if (suspForceVec.y < 0) {
                suspForceVec.set(0, 0, 0);
                suspensionForce = 0;
            }
            force.add(suspForceVec);

            // Apply torque at shock mount point (higher on chassis)
            const shockMountOffset = new THREE.Vector3(
                wheel.offset.x,
                specs.suspensionRestLength * 0.5,
                wheel.offset.z
            ).applyQuaternion(carQuat);

            // Check how upright the car is
            const upDot = up.dot(new THREE.Vector3(0, 1, 0));

            // Calculate torque from suspension force at shock mount
            const suspTorqueWorld = new THREE.Vector3().crossVectors(shockMountOffset, suspForceVec);

            // Transform torque from world space to body-local space
            const carQuatInverse = carQuat.clone().invert();
            const suspTorque = suspTorqueWorld.clone().applyQuaternion(carQuatInverse);

            // Reduce torque when severely tilted to prevent instability
            if (upDot < 0.3) {
                suspTorque.multiplyScalar(0.2);
            }
            torque.add(suspTorque);

            // Calculate tire forces
            const tireForces = CarPhysicsEngine.calculateTireForces({
                position, velocity, rotation, angularVelocity, wheels, specs,
                forward, right, steerAngle, throttleInput, brakeInput, handbrakeInput,
                isShifting, gearIndex, rpm
            }, index, suspensionForce, dt);

            // Reduce tire grip when car is very tilted
            if (upDot < 0.4) {
                const tireGripFactor = Math.max(0.1, upDot / 0.4);
                tireForces.multiplyScalar(tireGripFactor);
            }
            force.add(tireForces);

            // Calculate torque from tire forces
            const horizontalLever = new THREE.Vector3(localOffset.x, 0, localOffset.z);
            const tireTorqueWorld = new THREE.Vector3().crossVectors(horizontalLever, tireForces);
            const tireTorque = tireTorqueWorld.clone().applyQuaternion(carQuatInverse);
            if (upDot < 0.3) {
                tireTorque.multiplyScalar(0.3);
            }
            torque.add(tireTorque);

            // Store grounded state for next frame
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
     * @param {Object} params - Physics state parameters
     * @param {number} pointIndex - Index of the body collision point
     * @returns {Object} { force: THREE.Vector3, torque: THREE.Vector3 }
     */
    static processBodyCollision(params, pointIndex) {
        const { position, velocity, rotation, angularVelocity, bodyCollisionPoints, terrain, up } = params;
        const point = bodyCollisionPoints[pointIndex];

        // Calculate world position of this collision point
        const worldPos = position.clone();
        const localOffset = point.offset.clone();
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(rotation));
        worldPos.add(localOffset);

        // Get ground height at this point
        const groundHeight = terrain.getHeightAt(worldPos.x, worldPos.z);
        const penetration = groundHeight - worldPos.y;

        let force = new THREE.Vector3();
        let torque = new THREE.Vector3();

        // Only apply force if penetrating the ground
        if (penetration > 0) {
            const collisionStiffness = 100000;
            const collisionDamping = 15000;

            // Get surface normal
            const groundNormal = terrain.getNormalAt(worldPos.x, worldPos.z);
            const worldUp = new THREE.Vector3(0, 1, 0);
            const normal = new THREE.Vector3()
                .addScaledVector(worldUp, 0.8)
                .addScaledVector(groundNormal, 0.2)
                .normalize();

            // Calculate velocity at collision point
            const pointVel = velocity.clone();
            const angularContrib = new THREE.Vector3().crossVectors(angularVelocity, localOffset);
            pointVel.add(angularContrib);

            // Velocity into ground
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
            const upDot = up.dot(new THREE.Vector3(0, 1, 0));

            const horizontalLever = new THREE.Vector3(localOffset.x, 0, localOffset.z);
            torque.crossVectors(horizontalLever, force);

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
     * @param {Object} params - Physics state parameters
     * @param {number} wheelIndex - Wheel index
     * @param {number} normalLoad - Normal force on tire
     * @param {number} dt - Delta time
     * @returns {THREE.Vector3} Combined tire force
     */
    static calculateTireForces(params, wheelIndex, normalLoad, dt) {
        const { position, velocity, rotation, angularVelocity, wheels, specs, forward, right, steerAngle, throttleInput, brakeInput, handbrakeInput, isShifting, gearIndex, rpm } = params;

        const wheel = wheels[wheelIndex];
        const isFront = wheelIndex < 2;
        const isRear = !isFront;

        // Get wheel world velocity
        const wheelWorldPos = position.clone();
        const localOffset = wheel.offset.clone();
        localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(rotation));
        wheelWorldPos.add(localOffset);

        // Point velocity = linear velocity + angular velocity × position
        const pointVel = velocity.clone();
        const angularContrib = new THREE.Vector3().crossVectors(angularVelocity, localOffset);
        pointVel.add(angularContrib);

        // Get wheel direction (front wheels steer)
        let wheelForward = forward.clone();
        wheelForward.y = 0;
        if (wheelForward.lengthSq() > 0.001) {
            wheelForward.normalize();
        } else {
            wheelForward.set(0, 0, 1);
        }

        let wheelRight = right.clone();
        wheelRight.y = 0;
        if (wheelRight.lengthSq() > 0.001) {
            wheelRight.normalize();
        } else {
            wheelRight.set(1, 0, 0);
        }

        if (isFront) {
            const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -steerAngle);
            wheelForward.applyQuaternion(steerQuat);
            wheelRight.applyQuaternion(steerQuat);
        }

        // Decompose velocity into wheel frame
        const groundVel = pointVel.clone();
        groundVel.y = 0;
        const forwardVel = groundVel.dot(wheelForward);
        const lateralVel = groundVel.dot(wheelRight);

        // LATERAL FORCE (CORNERING)
        wheel.slipAngle = 0;
        if (Math.abs(forwardVel) > 0.5 || Math.abs(lateralVel) > 0.5) {
            wheel.slipAngle = Math.atan2(lateralVel, Math.abs(forwardVel) + 0.1);
        }

        const maxLateralForce = normalLoad * specs.gripCoefficient;
        const slipAngleNorm = THREE.MathUtils.clamp(wheel.slipAngle / specs.slipAnglePeak, -1, 1);
        let lateralForce = -maxLateralForce * slipAngleNorm * 0.9;

        // LONGITUDINAL FORCE (DRIVE/BRAKE)
        let longForce = 0;

        // DRIVE FORCE - Apply directly from engine for rear wheels
        if (isRear && throttleInput > 0 && !isShifting) {
            const gearRatio = specs.gearRatios[gearIndex];
            if (gearRatio !== 0) {
                const rpmNormalized = rpm / specs.redlineRPM;
                const torqueCurve = 0.8 + 0.4 * Math.sin(rpmNormalized * Math.PI) - 0.2 * rpmNormalized;
                const engineTorque = specs.maxTorque * Math.max(0.6, torqueCurve) * throttleInput;

                const transmissionRatio = Math.abs(gearRatio) * specs.finalDrive;
                const wheelTorque = engineTorque * transmissionRatio;
                const driveForce = wheelTorque / specs.wheelRadius;

                const forcePerWheel = driveForce / 2;
                const maxDriveForce = normalLoad * specs.gripCoefficient * 1.5;
                longForce = Math.min(forcePerWheel, maxDriveForce);

                if (gearRatio < 0) {
                    longForce = -longForce;
                }
            }
        }

        // BRAKING FORCE
        if (brakeInput > 0) {
            const brakeForce = normalLoad * specs.gripCoefficient * brakeInput * 0.8;
            if (forwardVel > 0.5) {
                longForce -= brakeForce;
            } else if (forwardVel < -0.5) {
                longForce += brakeForce;
            } else {
                if (isRear && gearIndex === 0) {
                    longForce = -brakeForce * 0.4;
                }
            }
        }

        // HANDBRAKE - rear wheels only
        if (isRear && handbrakeInput > 0) {
            if (Math.abs(forwardVel) > 0.3) {
                longForce -= Math.sign(forwardVel) * normalLoad * specs.gripCoefficient * handbrakeInput;
            }
            lateralForce *= (1 - handbrakeInput * 0.7);
        }

        // Rolling resistance
        if (Math.abs(forwardVel) > 0.1) {
            longForce -= Math.sign(forwardVel) * normalLoad * specs.rollingResistance;
        }

        // Combine into world force
        const force = new THREE.Vector3();
        force.addScaledVector(wheelForward, longForce);
        force.addScaledVector(wheelRight, lateralForce);

        return force;
    }

    /**
     * Calculate aerodynamic drag
     * @param {THREE.Vector3} velocity - Current velocity
     * @param {Object} specs - Car specifications
     * @returns {THREE.Vector3} Drag force vector
     */
    static calculateDrag(velocity, specs) {
        const speedSquared = velocity.lengthSq();
        if (speedSquared < 0.1) return new THREE.Vector3();

        const dragMagnitude = 0.5 * specs.airDensity * specs.dragCoefficient *
            specs.frontalArea * speedSquared;

        const dragForce = velocity.clone().normalize().multiplyScalar(-dragMagnitude);
        return dragForce;
    }

    /**
     * Update engine and transmission
     * @param {Object} params - Drivetrain state
     * @param {number} dt - Delta time
     * @returns {Object} Updated drivetrain state { rpm, isShifting, shiftTimer }
     */
    static updateDrivetrain(params, dt) {
        let { rpm, isShifting, shiftTimer, gearIndex, specs, wheels, speed, throttleInput } = params;

        // Handle shifting
        if (isShifting) {
            shiftTimer -= dt;
            if (shiftTimer <= 0) {
                isShifting = false;
            }
            // No power during shift
            CarPhysicsEngine.updateWheelRPM({ wheels, specs, speed }, 0, dt);
            return { rpm, isShifting, shiftTimer };
        }

        const gearRatio = specs.gearRatios[gearIndex];

        if (gearRatio === 0) {
            // Neutral
            rpm = THREE.MathUtils.lerp(rpm, specs.idleRPM, 5 * dt);
            CarPhysicsEngine.updateWheelRPM({ wheels, specs, speed }, 0, dt);
            return { rpm, isShifting, shiftTimer };
        }

        // Calculate RPM from wheel speed
        const avgWheelRPM = (wheels[2].rpm + wheels[3].rpm) / 2;
        const transmissionRatio = Math.abs(gearRatio) * specs.finalDrive;
        const engineRPMFromWheels = avgWheelRPM * transmissionRatio;

        // Blend between idle and wheel-driven RPM
        let targetRPM = Math.max(engineRPMFromWheels, specs.idleRPM);

        // Rev up when throttle applied but low speed
        if (throttleInput > 0 && speed < 5) {
            targetRPM = THREE.MathUtils.lerp(targetRPM, specs.redlineRPM * 0.8, throttleInput);
        }

        rpm = THREE.MathUtils.lerp(rpm, targetRPM, 10 * dt);
        rpm = THREE.MathUtils.clamp(rpm, specs.idleRPM, specs.redlineRPM);

        // Calculate engine torque
        const rpmNormalized = rpm / specs.redlineRPM;
        const torqueCurve = 0.8 + 0.4 * Math.sin(rpmNormalized * Math.PI) - 0.2 * rpmNormalized;
        const engineTorque = specs.maxTorque * Math.max(0.6, torqueCurve) * throttleInput;

        // Torque at wheels
        const wheelTorque = engineTorque * transmissionRatio * (gearRatio < 0 ? -1 : 1);

        // Update rear wheel RPMs (RWD)
        CarPhysicsEngine.updateWheelRPM({ wheels, specs, speed }, wheelTorque, dt);

        return { rpm, isShifting, shiftTimer };
    }

    /**
     * Update wheel RPM based on torque and ground contact
     * @param {Object} params - Wheel state
     * @param {number} driveTorque - Torque applied to wheels
     * @param {number} dt - Delta time
     */
    static updateWheelRPM(params, driveTorque, dt) {
        const { wheels, specs, speed } = params;
        const wheelInertia = 2; // kg·m²

        for (let i = 2; i < 4; i++) { // Rear wheels only (RWD)
            const wheel = wheels[i];

            if (wheel.grounded) {
                const torqueAccel = driveTorque / wheelInertia;
                wheel.rpm += torqueAccel * dt * 60 / (2 * Math.PI);

                const groundSpeed = speed;
                const groundRPM = (groundSpeed / (specs.wheelRadius * 2 * Math.PI)) * 60;
                wheel.rpm = THREE.MathUtils.lerp(wheel.rpm, groundRPM, 5 * dt);
            } else {
                wheel.rpm *= 0.99;
            }

            wheel.rpm = Math.max(wheel.rpm, 0);
        }

        // Front wheels follow ground speed
        for (let i = 0; i < 2; i++) {
            const wheel = wheels[i];
            if (wheel.grounded) {
                wheel.rpm = (Math.abs(speed) / (specs.wheelRadius * 2 * Math.PI)) * 60;
            }
        }
    }

    /**
     * Automatic transmission logic
     * @param {Object} params - Transmission state
     * @returns {number|null} New gear index to shift to, or null if no shift
     */
    static autoShift(params) {
        const { isShifting, gearIndex, speed, brakeInput, rpm, specs } = params;

        if (isShifting) return null;

        const gearRatio = specs.gearRatios[gearIndex];

        // Handle reverse
        if (speed < -0.5 && brakeInput > 0 && gearIndex !== 0) {
            return 0; // Shift to reverse
        }

        if (speed > 0.5 && gearIndex === 0) {
            return 2; // Shift to 1st from reverse
        }

        // Normal shifting
        if (gearIndex >= 2) {
            // Upshift
            if (rpm > specs.redlineRPM * 0.9 && gearIndex < 6) {
                return gearIndex + 1;
            }
            // Downshift
            else if (rpm < specs.idleRPM * 1.5 && gearIndex > 2) {
                return gearIndex - 1;
            }
        }

        return null;
    }

    /**
     * Integrate physics state
     * @param {Object} state - Current physics state
     * @param {THREE.Vector3} totalForce - Total force
     * @param {THREE.Vector3} totalTorque - Total torque
     * @param {number} dt - Delta time
     * @param {number} groundedWheels - Number of grounded wheels
     * @returns {Object} Updated state
     */
    static integrate(state, totalForce, totalTorque, dt, groundedWheels) {
        let { position, velocity, rotation, angularVelocity, specs, up, terrain } = state;

        // Linear: F = ma -> a = F/m
        const acceleration = totalForce.clone().divideScalar(specs.mass);
        velocity.addScaledVector(acceleration, dt);

        // Air resistance drift
        velocity.x *= 0.999;
        velocity.z *= 0.999;

        // Position
        position.addScaledVector(velocity, dt);

        // Angular: Torque -> Angular Accel
        const w = specs.trackWidth;
        const h = 1.5;
        const l = specs.wheelBase;
        const mass = specs.mass;

        // Moments of inertia (box)
        const Ix = (mass / 12) * (h * h + w * w) * 2;
        const Iy = (mass / 12) * (w * w + l * l);
        const Iz = (mass / 12) * (h * h + l * l) * 2;

        angularVelocity.x += (totalTorque.x / Ix) * dt;
        angularVelocity.y += (totalTorque.y / Iy) * dt;
        angularVelocity.z += (totalTorque.z / Iz) * dt;

        // Angular Damping
        const upDot = up.dot(new THREE.Vector3(0, 1, 0));
        const isUnstable = upDot < 0.4 || (groundedWheels < 2 && upDot < 0.7);
        const angularDamping = isUnstable ? 0.95 : 0.98;
        angularVelocity.multiplyScalar(angularDamping);

        // Clamp extreme angular velocities when unstable
        if (isUnstable) {
            const maxAngularVel = 4.0;
            const angularSpeed = angularVelocity.length();
            if (angularSpeed > maxAngularVel) {
                angularVelocity.multiplyScalar(maxAngularVel / angularSpeed);
            }
        }

        // Apply Rotation
        const rotationChange = new THREE.Euler(
            angularVelocity.x * dt,
            angularVelocity.y * dt,
            angularVelocity.z * dt
        );

        const rotQuat = new THREE.Quaternion().setFromEuler(rotation);
        const deltaQuat = new THREE.Quaternion().setFromEuler(rotationChange);
        rotQuat.multiply(deltaQuat);
        rotation.setFromQuaternion(rotQuat, 'YXZ');

        // Ground constraint (Emergency)
        const groundHeight = terrain.getHeightAt(position.x, position.z);
        if (position.y < groundHeight + 0.5) {
            if (position.y < groundHeight - 2) {
                position.y = groundHeight + 2;
                velocity.y = 0;
            }
        }

        return { position, velocity, rotation, angularVelocity };
    }
}
