import * as THREE from 'three';
import { NewCarPhysicsEngine } from '../physics/new_car_physics.js';

/**
 * Car Physics System (Controller)
 * 
 * This class manages car state and delegates physics calculations to NewCarPhysicsEngine.
 * It handles: visual systems (lights, mesh), input callbacks, and UI helpers.
 * 
 * Physics logic is in js/physics/new_car_physics.js.
 */
export class CarPhysics {
    constructor(carMesh, terrain, scene, carSpec = null) {
        this.mesh = carMesh;
        this.terrain = terrain;
        this.scene = scene;
        this.debug = false;
        this.debugGroup = null;

        // Store the raw car spec for accessing additional properties like lights
        this.carSpec = carSpec;

        // ==================== NEW PHYSICS ENGINE ====================
        this.physics = new NewCarPhysicsEngine(carSpec || this._getDefaultSpec(), terrain);

        // Expose state references for external access (main.js uses these)
        this.position = this.physics.position;
        this.velocity = this.physics.velocity;
        this.quaternion = this.physics.quaternion;
        this.angularVelocity = this.physics.angularVelocity;

        // Derived directions
        this.forward = new THREE.Vector3(0, 0, 1);
        this.right = new THREE.Vector3(1, 0, 0);
        this.up = new THREE.Vector3(0, 1, 0);

        // For legacy compatibility
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');

        // UI state
        this.speed = 0;
        this.speedKmh = 0;
        this.rpm = 900;
        this.gearIndex = 2;
        this.manualGearMode = true;

        // Input state (for taillights)
        this.throttleInput = 0;
        this.brakeInput = 0;
        this.handbrakeInput = 0;
        this.steerAngle = 0;

        // Specs for dimensions used by debug/lights
        this.specs = this._buildSpecs(carSpec);

        // Headlights
        this.headlightsOn = false;
        this._createHeadlights();

        // Taillights (rear lights)
        this.taillightsOn = false;
        this.isBraking = false;
        this._createTaillights();
    }

    /**
     * Build specs object from carSpec (for dimensions, lights, etc.)
     */
    _buildSpecs(carSpec) {
        if (!carSpec) return this._getDefaultSpecs();

        return {
            width: carSpec.dimensions?.width || 6.7,
            height: carSpec.dimensions?.height || 4.5,
            length: carSpec.dimensions?.length || 18.4,
            trackWidth: carSpec.dimensions?.trackWidth || 7.55,
            wheelBase: carSpec.dimensions?.wheelBase || 10.55,
            wheelRadius: carSpec.dimensions?.wheelRadius || 1.35,
            suspensionRestLength: carSpec.suspension?.restLength || 1.5,
            suspensionTravel: carSpec.suspension?.travel || 1.1,
            visualOffsetX: carSpec.visualOffset?.x || 0,
            visualOffsetY: carSpec.visualOffset?.y || 0,
            idleRPM: carSpec.engine?.idleRPM || 900,
            redlineRPM: carSpec.engine?.redlineRPM || 7800,
            gearRatios: carSpec.transmission?.gears || [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8]
        };
    }

    _getDefaultSpecs() {
        return {
            width: 6.7,
            height: 4.5,
            length: 18.4,
            trackWidth: 7.55,
            wheelBase: 10.55,
            wheelRadius: 1.35,
            suspensionRestLength: 1.5,
            suspensionTravel: 1.1,
            visualOffsetX: 0,
            visualOffsetY: 0,
            idleRPM: 900,
            redlineRPM: 7800,
            gearRatios: [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8]
        };
    }

    _getDefaultSpec() {
        // Minimal spec for physics engine if none provided
        return {
            mass: 950,
            dimensions: { trackWidth: 7.55, wheelBase: 10.55, wheelRadius: 1.35, width: 6.7, height: 4.5, length: 18.4 },
            suspension: { restLength: 1.5, travel: 1.1, stiffness: 35000, damping: 3000 },
            engine: { idleRPM: 900, redlineRPM: 7800, maxTorque: 150, powerCurve: [0.4, 0.7, 0.9, 1.0, 0.85] },
            transmission: { gears: [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8], finalDrive: 4.3 },
            tires: { gripCoefficient: 1.5, rollingResistance: 0.005 },
            steering: { maxAngle: 0.6, speed: 3.0 }
        };
    }

    /**
     * Create headlights for the car
     */
    _createHeadlights() {
        this.headlights = [];

        // Use light positions from car spec, or fall back to defaults
        const frontZ = this.specs.length / 2;
        const defaultPositions = [
            { x: -2.2, y: 1.5, z: frontZ },
            { x: 2.2, y: 1.5, z: frontZ }
        ];

        const headlightPositions = (this.carSpec && this.carSpec.lights && this.carSpec.lights.headlightPos)
            ? this.carSpec.lights.headlightPos
            : defaultPositions;

        headlightPositions.forEach((pos, index) => {
            // Main spotlight (low beam)
            const spotlight = new THREE.SpotLight(0xfff8e8, 0, 600, Math.PI / 3.5, 0.3, 0.8);
            spotlight.position.set(pos.x, pos.y, pos.z);
            spotlight.castShadow = true;
            spotlight.shadow.mapSize.width = 1024;
            spotlight.shadow.mapSize.height = 1024;

            const target = new THREE.Object3D();
            target.position.set(pos.x * 0.3, pos.y - 10, pos.z + 150);
            spotlight.target = target;

            this.mesh.add(spotlight);
            this.mesh.add(target);
            this.headlights.push({ light: spotlight, target: target, type: 'main' });

            // High beam spotlight
            const highBeam = new THREE.SpotLight(0xffffff, 0, 1000, Math.PI / 6, 0.15, 0.6);
            highBeam.position.set(pos.x, pos.y, pos.z);

            const highBeamTarget = new THREE.Object3D();
            highBeamTarget.position.set(pos.x * 0.2, pos.y - 6, pos.z + 400);
            highBeam.target = highBeamTarget;

            this.mesh.add(highBeam);
            this.mesh.add(highBeamTarget);
            this.headlights.push({ light: highBeam, target: highBeamTarget, type: 'highbeam' });

            // Point light for local illumination
            const pointLight = new THREE.PointLight(0xfff5e6, 0, 120, 1.2);
            pointLight.position.set(pos.x, pos.y - 0.5, pos.z + 2);
            this.mesh.add(pointLight);
            this.headlights.push({ light: pointLight, type: 'point' });
        });

        // Center flood light
        const floodLight = new THREE.SpotLight(0xfff8e8, 0, 500, Math.PI / 2.5, 0.4, 1.0);
        floodLight.position.set(0, 2.0, frontZ);
        const floodTarget = new THREE.Object3D();
        floodTarget.position.set(0, -8, frontZ + 150);
        floodLight.target = floodTarget;
        this.mesh.add(floodLight);
        this.mesh.add(floodTarget);
        this.headlights.push({ light: floodLight, target: floodTarget, type: 'flood' });

        // Headlight glow meshes
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

        const rearZ = -this.specs.length / 2;
        const defaultPositions = [
            { x: -2.0, y: 3, z: rearZ },
            { x: 2.0, y: 3, z: rearZ }
        ];

        const taillightPositions = (this.carSpec && this.carSpec.lights && this.carSpec.lights.taillightPos)
            ? this.carSpec.lights.taillightPos
            : defaultPositions;

        taillightPositions.forEach((pos) => {
            const rearLight = new THREE.PointLight(0xff0000, 0, 50, 1.5);
            rearLight.position.set(pos.x, pos.y, pos.z);
            this.mesh.add(rearLight);
            this.taillights.push({ light: rearLight, type: 'rear' });

            const brakeSpot = new THREE.SpotLight(0xff0000, 0, 100, Math.PI / 4, 0.5, 1.0);
            brakeSpot.position.set(pos.x, pos.y, pos.z);

            const brakeTarget = new THREE.Object3D();
            brakeTarget.position.set(pos.x, pos.y - 5, pos.z - 50);
            brakeSpot.target = brakeTarget;

            this.mesh.add(brakeSpot);
            this.mesh.add(brakeTarget);
            this.taillights.push({ light: brakeSpot, target: brakeTarget, type: 'brakespot' });
        });

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
            glow.visible = false;
            glow.position.set(pos.x, pos.y, pos.z - 0.3);
            this.mesh.add(glow);
            this.taillightGlows.push(glow);
        });
    }

    /**
     * Update taillights based on night time and braking
     */
    updateTaillights(isNight, isBraking) {
        this.taillightsOn = isNight;
        this.isBraking = isBraking;

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
     * Main physics update - delegates to NewCarPhysicsEngine
     */
    update(deltaTime, input) {
        // Store input state
        this.throttleInput = input.throttle || 0;
        this.brakeInput = input.brake || 0;
        this.handbrakeInput = input.handbrake || 0;

        // Handle gear shifts
        if (input.shiftUp) {
            this.shiftUp();
            input.shiftUp = false;
        }
        if (input.shiftDown) {
            this.shiftDown();
            input.shiftDown = false;
        }

        // Build physics input
        const physicsInput = {
            throttle: this.throttleInput,
            brake: this.brakeInput,
            steer: input.steering || 0,
            handbrake: this.handbrakeInput
        };

        // Update physics engine
        this.physics.update(deltaTime, physicsInput);

        // Sync state references (these are the same objects, but update directions)
        this._updateDirections();

        // Sync legacy rotation (Euler) from quaternion
        this.rotation.setFromQuaternion(this.physics.quaternion);

        // Update UI values
        this.speed = this.physics.getSpeed();
        this.speedKmh = this.physics.getSpeedKMH();
        this.rpm = this.physics.getRPM();
        this.gearIndex = this.physics.getCurrentGear();
        this.steerAngle = this.physics.steeringAngle;

        // Update visual mesh
        this._updateMesh();

        // Update debug visuals
        this._updateDebug();

        // Log periodically
        if (!this._logTimer) this._logTimer = 0;
        this._logTimer += deltaTime;
        if (this._logTimer > 2.0) {
            this._logTimer = 0;
            console.log(`[Car] Speed: ${this.speedKmh.toFixed(1)} km/h | RPM: ${Math.floor(this.rpm)} | Gear: ${this.getGearDisplay()}`);
        }
    }

    _updateDirections() {
        this.forward.set(0, 0, 1).applyQuaternion(this.physics.quaternion);
        this.right.set(1, 0, 0).applyQuaternion(this.physics.quaternion);
        this.up.set(0, 1, 0).applyQuaternion(this.physics.quaternion);
    }

    /**
     * Manual shift up
     */
    shiftUp() {
        this.physics.shiftUp();
        console.log(`[Gear] Shifted UP to ${this.getGearDisplay()}`);
    }

    /**
     * Manual shift down
     */
    shiftDown() {
        this.physics.shiftDown();
        console.log(`[Gear] Shifted DOWN to ${this.getGearDisplay()}`);
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

        this.mesh.position.copy(this.physics.position);

        // Visual Offset
        const localOffset = new THREE.Vector3(
            this.specs.visualOffsetX,
            this.specs.visualOffsetY,
            0
        );
        localOffset.applyQuaternion(this.physics.quaternion);
        this.mesh.position.add(localOffset);

        this.mesh.quaternion.copy(this.physics.quaternion);
    }

    /**
     * Get gear display string
     */
    getGearDisplay() {
        const gear = this.physics.getCurrentGear();
        if (gear === 0) return 'R';
        if (gear === 1) return 'N';
        return (gear - 1).toString();
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

        // Draw Physics Center Box
        const boxGeom = new THREE.BoxGeometry(this.specs.width, this.specs.height, this.specs.length);
        const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.position.copy(this.physics.position);
        box.quaternion.copy(this.physics.quaternion);
        this.debugGroup.add(box);

        // Draw Wheel Raycasts
        const wheelCompressions = this.physics.getWheelCompressions();
        for (let i = 0; i < 4; i++) {
            const wheelLocal = this.physics.wheelLocalPositions[i];
            const wheelWorld = wheelLocal.clone().applyQuaternion(this.physics.quaternion).add(this.physics.position);

            const rayOrigin = wheelWorld.clone();
            const rayDir = this.up.clone().negate();
            const maxRayDist = this.specs.suspensionRestLength + this.specs.suspensionTravel + this.specs.wheelRadius;
            const rayEnd = rayOrigin.clone().add(rayDir.clone().multiplyScalar(maxRayDist));

            const rayPoints = [rayOrigin, rayEnd];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const grounded = this.physics.wheelGrounded[i];
            const rayMat = new THREE.LineBasicMaterial({ color: grounded ? 0x00ff00 : 0xff0000 });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            this.debugGroup.add(rayLine);

            if (grounded) {
                const contactPoint = this.physics.wheelContactPoints[i];
                const hubGeom = new THREE.SphereGeometry(0.2);
                const hubMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const hub = new THREE.Mesh(hubGeom, hubMat);
                hub.position.copy(contactPoint);
                this.debugGroup.add(hub);
            }
        }

        // Draw Ground Normal
        const groundNormal = this.terrain.getNormalAt(this.physics.position.x, this.physics.position.z);
        const normalOrigin = this.physics.position.clone();
        normalOrigin.y -= 0.5;
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
     */
    setWheelMeshes(wheelMeshes) {
        this.wheelMeshes = wheelMeshes;
        console.log('[CarPhysics] Wheel meshes set:', wheelMeshes.map(w => w ? w.name : 'null'));
    }
}