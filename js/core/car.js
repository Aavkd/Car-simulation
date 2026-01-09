import * as THREE from 'three';
import { CarPhysicsEngine } from '../physics/car_physics.js';

/**
 * Car Physics System (Controller)
 * 
 * This class manages car state and delegates physics calculations to CarPhysicsEngine.
 * It handles: state management, visual systems (lights, mesh), input, and UI helpers.
 * 
 * Physics logic is in js/physics/car_physics.js for easy replacement.
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
            this.specs = CarPhysicsEngine.buildGameSpecs(carSpec, this.SCALE);
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
        this.bodyCollisionPoints = CarPhysicsEngine.createBodyCollisionPoints(this.specs);

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
        const nightBaseIntensity = isNight ? 3.0 : 0;
        const brakeIntensity = isBraking ? 15.0 : 0;
        const brakeSpotIntensity = isBraking ? 25.0 : 0;

        this.taillights.forEach((tl) => {
            if (tl.type === 'rear') {
                tl.light.intensity = nightBaseIntensity + brakeIntensity;
            } else if (tl.type === 'brakespot') {
                tl.light.intensity = brakeSpotIntensity;
            }
        });

        // Update glow opacity
        const nightGlowOpacity = isNight ? 0.4 : 0;
        const brakeGlowOpacity = isBraking ? 1.0 : 0;
        const totalGlowOpacity = Math.min(nightGlowOpacity + brakeGlowOpacity, 1.0);

        this.taillightGlows.forEach((glow) => {
            glow.material.opacity = totalGlowOpacity;
            if (isBraking) {
                glow.material.color.setHex(0xff2200);
            } else {
                glow.material.color.setHex(0xff0000);
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
                hl.light.intensity = on ? 50.0 : 0;
            } else if (hl.type === 'highbeam') {
                hl.light.intensity = on ? 80.0 : 0;
            } else if (hl.type === 'point') {
                hl.light.intensity = on ? 15.0 : 0;
            } else if (hl.type === 'flood') {
                hl.light.intensity = on ? 35.0 : 0;
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
     * Main physics update - delegates to CarPhysicsEngine
     */
    update(deltaTime, input) {
        // Clamp deltaTime 
        const dt = Math.min(deltaTime, 0.05);

        // Update inputs
        this.throttleInput = input.throttle;
        this.brakeInput = input.brake;
        this.handbrakeInput = input.handbrake;

        // Steering 
        const speedFactor = 1 - Math.min(Math.abs(this.speed) / 60, 0.6);
        const targetSteer = input.steering * this.specs.maxSteerAngle * speedFactor;
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, this.specs.steerSpeed * dt * 10);

        // Update direction vectors
        this._updateDirections();

        // ==================== PHYSICS CALCULATIONS (delegated to engine) ====================
        let totalForce = new THREE.Vector3();
        let totalTorque = new THREE.Vector3();

        // 1. Gravity
        totalForce.y -= this.specs.mass * this.specs.gravity;

        // 2. Aerodynamic Drag
        const dragForce = CarPhysicsEngine.calculateDrag(this.velocity, this.specs);
        totalForce.add(dragForce);

        // 3. Suspension & Tire Forces
        const physicsParams = {
            position: this.position,
            velocity: this.velocity,
            rotation: this.rotation,
            angularVelocity: this.angularVelocity,
            wheels: this.wheels,
            specs: this.specs,
            terrain: this.terrain,
            up: this.up,
            forward: this.forward,
            right: this.right,
            steerAngle: this.steerAngle,
            throttleInput: this.throttleInput,
            brakeInput: this.brakeInput,
            handbrakeInput: this.handbrakeInput,
            isShifting: this.isShifting,
            gearIndex: this.gearIndex,
            rpm: this.rpm
        };

        let groundedWheels = 0;
        for (let i = 0; i < 4; i++) {
            const { force, torque } = CarPhysicsEngine.processWheel(physicsParams, i, dt);
            totalForce.add(force);
            totalTorque.add(torque);
            if (this.wheels[i].grounded) groundedWheels++;
        }

        // 4. Body Collision
        const collisionParams = {
            position: this.position,
            velocity: this.velocity,
            rotation: this.rotation,
            angularVelocity: this.angularVelocity,
            bodyCollisionPoints: this.bodyCollisionPoints,
            terrain: this.terrain,
            up: this.up
        };

        for (let i = 0; i < this.bodyCollisionPoints.length; i++) {
            const { force, torque } = CarPhysicsEngine.processBodyCollision(collisionParams, i);
            totalForce.add(force);
            totalTorque.add(torque);
        }

        // ==================== INTEGRATE ====================
        const integrateState = {
            position: this.position,
            velocity: this.velocity,
            rotation: this.rotation,
            angularVelocity: this.angularVelocity,
            specs: this.specs,
            up: this.up,
            terrain: this.terrain
        };

        const newState = CarPhysicsEngine.integrate(integrateState, totalForce, totalTorque, dt, groundedWheels);
        this.position = newState.position;
        this.velocity = newState.velocity;
        this.rotation = newState.rotation;
        this.angularVelocity = newState.angularVelocity;

        // Handle manual gear shifts from input
        if (input.shiftUp) {
            this.shiftUp();
            input.shiftUp = false;
        }
        if (input.shiftDown) {
            this.shiftDown();
            input.shiftDown = false;
        }

        // Update engine/transmission
        const drivetrainParams = {
            rpm: this.rpm,
            isShifting: this.isShifting,
            shiftTimer: this.shiftTimer,
            gearIndex: this.gearIndex,
            specs: this.specs,
            wheels: this.wheels,
            speed: this.speed,
            throttleInput: this.throttleInput
        };

        const drivetrainState = CarPhysicsEngine.updateDrivetrain(drivetrainParams, dt);
        this.rpm = drivetrainState.rpm;
        this.isShifting = drivetrainState.isShifting;
        this.shiftTimer = drivetrainState.shiftTimer;

        // Auto-shift only if not in manual mode
        if (!this.manualGearMode) {
            const autoShiftParams = {
                isShifting: this.isShifting,
                gearIndex: this.gearIndex,
                speed: this.speed,
                brakeInput: this.brakeInput,
                rpm: this.rpm,
                specs: this.specs
            };
            const newGear = CarPhysicsEngine.autoShift(autoShiftParams);
            if (newGear !== null) {
                this._shift(newGear);
            }
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
        this.forward.set(0, 0, 1).applyQuaternion(quaternion);
        this.right.set(1, 0, 0).applyQuaternion(quaternion);
        this.up.set(0, 1, 0).applyQuaternion(quaternion);
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
        box.rotation.copy(this.rotation);
        this.debugGroup.add(box);

        // 2. Draw Wheel Raycasts
        const localUp = this.up.clone();
        this.wheels.forEach((wheel, index) => {
            const wheelWorldPos = this.position.clone();
            const localOffset = wheel.offset.clone();
            localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
            wheelWorldPos.add(localOffset);

            const rayOrigin = wheelWorldPos.clone();
            rayOrigin.addScaledVector(localUp, this.specs.suspensionRestLength);

            const rayMaxLen = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;
            const rayDest = rayOrigin.clone();
            rayDest.addScaledVector(localUp, -rayMaxLen);

            const rayPoints = [rayOrigin, rayDest];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const rayMat = new THREE.LineBasicMaterial({ color: wheel.grounded ? 0x00ff00 : 0xff0000 });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            this.debugGroup.add(rayLine);

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

        // 3. Draw Ground Normal
        const groundNormal = this.terrain.getNormalAt(this.position.x, this.position.z);
        const normalOrigin = this.position.clone();
        normalOrigin.y -= 0.5;
        const arrow = new THREE.ArrowHelper(groundNormal, normalOrigin, 2, 0x0000ff);
        this.debugGroup.add(arrow);

        // 4. Draw Body Collision Points
        this.bodyCollisionPoints.forEach((point, index) => {
            const worldPos = this.position.clone();
            const localOffset = point.offset.clone();
            localOffset.applyQuaternion(new THREE.Quaternion().setFromEuler(this.rotation));
            worldPos.add(localOffset);

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