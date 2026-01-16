import * as THREE from 'three';
import { NewCarPhysicsEngine } from '../physics/new_car_physics.js';
import { TireSmokeSystem } from './tire-smoke.js';
import { ExhaustSystem } from './exhaust-system.js';

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
        if (this.mesh) {
            this.mesh.userData.carSpec = carSpec;
        }

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

        // Tire Smoke System
        this.smokeSystem = new TireSmokeSystem(scene);

        // Exhaust System
        const exhaustPositions = (this.carSpec && this.carSpec.exhaust && this.carSpec.exhaust.positions)
            ? this.carSpec.exhaust.positions.map(p => new THREE.Vector3(p.x, p.y, p.z))
            : [];
        this.exhaustSystem = new ExhaustSystem(scene, this, exhaustPositions);

        // ==================== SPEED EFFECT SYSTEM ====================
        this._initSpeedEffect();

        // ==================== TRAIL SYSTEM ====================
        this._initTrails();
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

        this.taillightLocalPositions = taillightPositions.map(p => new THREE.Vector3(p.x, p.y, p.z));

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
            handbrake: this.handbrakeInput,
            boost: input.boost || false
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

        // Update Smoke System
        if (this.smokeSystem) {
            this.smokeSystem.update(deltaTime);

            // Emit smoke if drifting and wheels are on ground
            if (this.physics.getIsDrifting()) {
                const driftIntensity = this.physics.getDriftIntensity();
                // Rear wheels are at index 2 and 3
                for (let i = 2; i <= 3; i++) {
                    if (this.physics.wheelGrounded[i]) {
                        // Position slightly above ground at contact point
                        const contactPos = this.physics.wheelContactPoints[i].clone();
                        // contactPos.y += 0.2; 
                        this.smokeSystem.emit(contactPos, driftIntensity);
                    }
                }
            }
        }

        // Update Exhaust System
        if (this.exhaustSystem) {
            this.exhaustSystem.update(deltaTime);
        }

        // Update Speed Speed Effect
        this._updateSpeedEffect(deltaTime);

        // Update Trails
        this._updateTrails(deltaTime);

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

    /**
     * Initialize the "Star Wars" style speed lines effect
     * (Ported from plane.js)
     */
    _initSpeedEffect() {
        this.speedEffectConfig = {
            count: 200,             // Number of lines
            boxSize: new THREE.Vector3(20, 10, 40), // Volume size around car
            minSpeed: 50,           // Speed (km/h) where effect starts
            maxSpeed: 350,          // Speed where effect is maxed
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
                speedFactor: { value: 0 }, // 0 to 1 based on car speed
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

        // Add to mesh so it rotates with car
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

    // ==================== TRAIL SYSTEM ====================

    _initTrails() {
        this.trails = [];

        const modelScale = (this.carSpec && this.carSpec.modelScale) ? this.carSpec.modelScale : 1;

        // Defaults if not set (though _createTaillights should have run)
        const positions = this.taillightLocalPositions || [
            new THREE.Vector3(-2.0, 3, -this.specs.length / 2),
            new THREE.Vector3(2.0, 3, -this.specs.length / 2)
        ];

        positions.forEach(pos => {
            // Apply model scale to position because we are calculating world positions manually
            // and the mesh scale affects the visual position of the lights
            const scaledPos = pos.clone().multiplyScalar(modelScale);
            this.trails.push(this._createTrailRenderer(scaledPos));
        });
    }

    _createTrailRenderer(localPos) {
        // Trail configuration
        const config = {
            maxPoints: 30,            // Shorter than plane
            minSpeed: 15,             // Start showing earlier
            maxSpeed: 250,            // Max intensity speed
            baseWidth: 0.2,
            maxWidth: 0.8,
            fadeTime: 1.0,            // Fade faster
            localOffset: localPos,
            colors: {
                slow: new THREE.Color(0xaa0000),    // Dark Red
                medium: new THREE.Color(0xff0000),  // Bright Red
                fast: new THREE.Color(0xff6600)     // Red-Orange
            }
        };

        const trailData = {
            config: config,
            points: [],
            times: [],
            timer: 0
        };

        // Geometry & Material
        trailData.geometry = new THREE.BufferGeometry();
        const maxVerts = config.maxPoints * 2;
        const positions = new Float32Array(maxVerts * 3);
        const colors = new Float32Array(maxVerts * 4); // RGBA

        trailData.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailData.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

        trailData.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                glowIntensity: { value: 1.0 }
            },
            vertexShader: `
                attribute vec4 color;
                varying vec4 vColor;
                void main() {
                    vColor = color;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float glowIntensity;
                varying vec4 vColor;
                void main() {
                    float pulse = 0.9 + 0.1 * sin(time * 10.0);
                    vec3 glow = vColor.rgb * glowIntensity * pulse;
                    gl_FragColor = vec4(glow, vColor.a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        trailData.mesh = new THREE.Mesh(trailData.geometry, trailData.material);
        trailData.mesh.frustumCulled = false;
        this.scene.add(trailData.mesh);

        return trailData;
    }

    _updateTrails(dt) {
        if (!this.trails) return;

        // Check conditions: Night time AND Speed > min
        // We use this.taillightsOn as proxy for Night
        const isNight = this.taillightsOn;

        this.trails.forEach(trail => {
            this._updateSingleTrail(trail, dt, isNight);
        });
    }

    _updateSingleTrail(trail, dt, isActive) {
        trail.timer += dt;
        trail.material.uniforms.time.value = trail.timer;

        const cfg = trail.config;

        // Calculate speed ratio
        const speedRatio = Math.min(1, Math.max(0, (this.speedKmh - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)));

        // Determine if we should spawn new points
        const shouldSpawn = isActive && (this.speedKmh > cfg.minSpeed);

        // Calculate world position for emission
        const emissionOffset = cfg.localOffset.clone();
        emissionOffset.applyQuaternion(this.mesh.quaternion);
        const emissionPos = this.mesh.position.clone().add(emissionOffset);

        // Calculate "right" vector for ribbon width
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);

        // Width & Color
        const currentWidth = cfg.baseWidth + (cfg.maxWidth - cfg.baseWidth) * speedRatio;

        const trailColor = new THREE.Color();
        if (speedRatio < 0.5) {
            trailColor.lerpColors(cfg.colors.slow, cfg.colors.medium, speedRatio * 2);
        } else {
            trailColor.lerpColors(cfg.colors.medium, cfg.colors.fast, (speedRatio - 0.5) * 2);
        }

        // Add point
        if (shouldSpawn) {
            trail.points.unshift({
                pos: emissionPos.clone(),
                right: right.clone(),
                width: currentWidth,
                color: trailColor.clone(),
                alpha: 1.0
            });
            trail.times.unshift(trail.timer);
        }

        // Prune old points
        while (trail.points.length > cfg.maxPoints) {
            trail.points.pop();
            trail.times.pop();
        }

        // Update Geometry
        const positions = trail.geometry.attributes.position.array;
        const colors = trail.geometry.attributes.color.array;

        let vertIdx = 0;
        let colorIdx = 0;

        for (let i = 0; i < cfg.maxPoints; i++) {
            if (i < trail.points.length) {
                const point = trail.points[i];
                const age = trail.timer - trail.times[i];
                const lifeParams = age / cfg.fadeTime;
                const fadeAlpha = Math.max(0, 1.0 - lifeParams);

                if (fadeAlpha <= 0) continue;

                // Taper logic
                const taperRatio = 1 - (i / trail.points.length);
                const width = point.width * taperRatio * fadeAlpha;

                // Left Vertex
                const left = point.pos.clone().sub(point.right.clone().multiplyScalar(width));
                positions[vertIdx++] = left.x;
                positions[vertIdx++] = left.y;
                positions[vertIdx++] = left.z;

                // Right Vertex
                const rightPos = point.pos.clone().add(point.right.clone().multiplyScalar(width));
                positions[vertIdx++] = rightPos.x;
                positions[vertIdx++] = rightPos.y;
                positions[vertIdx++] = rightPos.z;

                // Colors
                colors[colorIdx++] = point.color.r;
                colors[colorIdx++] = point.color.g;
                colors[colorIdx++] = point.color.b;
                colors[colorIdx++] = fadeAlpha;

                colors[colorIdx++] = point.color.r;
                colors[colorIdx++] = point.color.g;
                colors[colorIdx++] = point.color.b;
                colors[colorIdx++] = fadeAlpha;

            } else {
                // Zero out
                positions[vertIdx++] = 0; positions[vertIdx++] = 0; positions[vertIdx++] = 0;
                positions[vertIdx++] = 0; positions[vertIdx++] = 0; positions[vertIdx++] = 0;
                colors[colorIdx++] = 0; colors[colorIdx++] = 0; colors[colorIdx++] = 0; colors[colorIdx++] = 0;
                colors[colorIdx++] = 0; colors[colorIdx++] = 0; colors[colorIdx++] = 0; colors[colorIdx++] = 0;
            }
        }

        // Update Indices (Triangle Strip)
        const validPoints = Math.min(trail.points.length, cfg.maxPoints);
        const indices = [];
        for (let i = 0; i < validPoints - 1; i++) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
        }
        trail.geometry.setIndex(indices);

        trail.geometry.attributes.position.needsUpdate = true;
        trail.geometry.attributes.color.needsUpdate = true;
    }

    disposeTrails() {
        if (this.trails) {
            this.trails.forEach(trail => {
                this.scene.remove(trail.mesh);
                trail.geometry.dispose();
                trail.material.dispose();
            });
            this.trails = [];
        }
    }
}