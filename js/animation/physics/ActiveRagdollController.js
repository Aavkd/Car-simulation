import * as THREE from 'three';
import { RagdollPhysics } from './RagdollPhysics.js';
import { SkeletonRegistry } from './SkeletonRegistry.js';
import { RagdollConfig } from './RagdollConfig.js';

export class ActiveRagdollController {
    constructor(mesh, terrain = null) {
        this.mesh = mesh;
        this.registry = new SkeletonRegistry(mesh);
        this.physics = new RagdollPhysics();
        if (terrain) {
            this.physics.setTerrain(terrain);
        }

        // Map bone names to their physics particles
        this.boneParticles = new Map();

        // State
        this.isRagdoll = false;

        // UI Compatibility State Object
        this.state = {
            currentState: 'inactive',
            currentPhysicsWeight: 0.0,
            balance: { isStable: true }
        };

        this._initRagdoll();
    }

    /**
     * Check if character has control
     */
    hasControl() {
        return !this.isRagdoll;
    }

    /**
     * Get full state for UI
     */
    getState() {
        return {
            state: this.state.currentState,
            physicsBlend: this.state.currentPhysicsWeight,
            balance: this.state.balance
        };
    }

    _initRagdoll() {
        // 1. Create Particles for major bones
        this._createParticle('hips', RagdollConfig.physics.mass.hips, RagdollConfig.physics.radius.hips);
        this._createParticle('spine', RagdollConfig.physics.mass.spine, RagdollConfig.physics.radius.spine);
        this._createParticle('spine1', RagdollConfig.physics.mass.spine, RagdollConfig.physics.radius.spine);
        this._createParticle('spine2', RagdollConfig.physics.mass.spine, RagdollConfig.physics.radius.spine); // Chest
        this._createParticle('head', RagdollConfig.physics.mass.head, RagdollConfig.physics.radius.head);

        // Arms
        this._createParticle('leftArm', RagdollConfig.physics.mass.arm, RagdollConfig.physics.radius.arm);
        this._createParticle('leftForearm', RagdollConfig.physics.mass.arm, RagdollConfig.physics.radius.arm);
        this._createParticle('leftHand', 0.5, RagdollConfig.physics.radius.hand);

        this._createParticle('rightArm', RagdollConfig.physics.mass.arm, RagdollConfig.physics.radius.arm); // Use arm for Upper Arm
        this._createParticle('rightForearm', RagdollConfig.physics.mass.arm, RagdollConfig.physics.radius.arm);
        this._createParticle('rightHand', 0.5, RagdollConfig.physics.radius.hand);

        // Legs
        this._createParticle('leftUpLeg', RagdollConfig.physics.mass.thigh, RagdollConfig.physics.radius.thigh);
        this._createParticle('leftLeg', RagdollConfig.physics.mass.leg, RagdollConfig.physics.radius.leg);
        this._createParticle('leftFoot', 0.5, RagdollConfig.physics.radius.foot);

        this._createParticle('rightUpLeg', RagdollConfig.physics.mass.thigh, RagdollConfig.physics.radius.thigh);
        this._createParticle('rightLeg', RagdollConfig.physics.mass.leg, RagdollConfig.physics.radius.leg);
        this._createParticle('rightFoot', 0.5, RagdollConfig.physics.radius.foot);

        // 2. Create Constraints (Skeleton Structure)
        // Core
        this._link('hips', 'spine');
        this._link('spine', 'spine1');
        this._link('spine1', 'spine2');
        this._link('spine2', 'head');

        // Shoulders (Spine2 -> Arms)
        this._link('spine2', 'leftArm');
        this._link('spine2', 'rightArm');

        // Arms
        this._link('leftArm', 'leftForearm');
        this._link('leftForearm', 'leftHand');
        this._link('rightArm', 'rightForearm');
        this._link('rightForearm', 'rightHand');

        // Hips -> Legs
        this._link('hips', 'leftUpLeg');
        this._link('leftUpLeg', 'leftLeg');
        this._link('leftLeg', 'leftFoot');

        this._link('hips', 'rightUpLeg');
        this._link('rightUpLeg', 'rightLeg');
        this._link('rightLeg', 'rightFoot');
    }

    _createParticle(boneType, mass, radius) {
        const bone = this.registry.getBone(boneType);
        if (bone) {
            // Get world position of the bone
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);

            const particle = this.physics.addParticle(worldPos, mass, radius, false);
            this.boneParticles.set(boneType, { bone, particle });
        } else {
            console.warn(`[ActiveRagdollController] Bone not found: ${boneType}`);
        }
    }

    _link(typeA, typeB) {
        const itemA = this.boneParticles.get(typeA);
        const itemB = this.boneParticles.get(typeB);

        if (itemA && itemB) {
            this.physics.addConstraint(itemA.particle, itemB.particle, RagdollConfig.physics.stiffness.rigid);
        }
    }

    /**
     * Set the system to full limp ragdoll mode
     */
    setRagdollMode(enabled) {
        this.isRagdoll = enabled;

        // Update UI state
        this.state.currentState = enabled ? 'ragdoll' : 'inactive';
        this.state.currentPhysicsWeight = enabled ? 1.0 : 0.0;
        this.state.balance.isStable = !enabled;

        if (enabled) {
            this._matchAnimation(); // Snap physics to current animation before starting
        }
    }

    /**
     * Snap physics particles to current bone positions
     */
    _matchAnimation() {
        this.boneParticles.forEach(({ bone, particle }) => {
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            particle.setPosition(worldPos);
        });
    }

    /**
     * Update physics and sync bones
     */
    update(dt) {
        if (!this.isRagdoll) return;

        // 1. Step Physics
        this.physics.update(dt);

        // 2. Sync Bones to Physics
        this._syncBonesToPhysics();

        // 3. Debug Draw (Auto-enable if config is set)
        // We use mesh.parent to find where to add debug lines
        if (RagdollConfig.debug.showCOM || RagdollConfig.debug.showForces || true) { // Forced true for now for validation
            if (this.mesh.parent) {
                // Ensure we don't spam add
                if (!this.debugGroup || this.debugGroup.parent !== this.mesh.parent) {
                    this.debugDraw(this.mesh.parent);
                } else {
                    this.debugDraw(this.mesh.parent);
                }
            }
        }
    }

    _syncBonesToPhysics() {
        // Phase 2 Fix: Aim-Based Synchronization
        // Instead of setting positions (which dislocates bones), we rotate bones to point at their targets.
        // Assumes bones are Y-aligned (Y axis points down the bone), which is standard for Mixamo/Unity.

        // 1. Root (Hips): Sync Position AND Rotation (Stable Tri-Point)
        this._syncRoot('hips', 'spine');

        // 2. Spine Chain
        this._aimBone('hips', 'spine');
        this._aimBone('spine', 'spine1');
        this._aimBone('spine1', 'spine2');
        this._aimBone('spine2', 'head');

        // 3. Legs
        // Use Pole Vectors (Knee/Foot) to lock rotation axis
        this._aimBone('leftUpLeg', 'leftLeg', 'leftFoot');
        this._aimBone('leftLeg', 'leftFoot'); // Shin follows foot direction

        this._aimBone('rightUpLeg', 'rightLeg', 'rightFoot');
        this._aimBone('rightLeg', 'rightFoot');

        // 4. Arms
        // Use Pole Vectors (Elbow/Hand)
        // Note: Arms bend differently. 
        // Arm -> Forearm. Pole: Hand.
        this._aimBone('leftArm', 'leftForearm', 'leftHand');
        this._aimBone('leftForearm', 'leftHand');

        this._aimBone('rightArm', 'rightForearm', 'rightHand');
        this._aimBone('rightForearm', 'rightHand');
    }

    _syncRoot(rootName, aimTargetName) {
        const rootItem = this.boneParticles.get(rootName);
        if (!rootItem) return;

        const { bone, particle } = rootItem;

        // Debug: Log Position Sync
        const doLog = false; // Disable debug logs

        // 1. Translation: Set Root Bone position to match Physics Particle
        if (bone.parent) {
            if (doLog) console.log(`[RagdollDebug] Physics Hips: ${particle.position.toArray().map(v => v.toFixed(2))}`);

            const parentInverse = new THREE.Matrix4().copy(bone.parent.matrixWorld).invert();
            const localPos = new THREE.Vector3().copy(particle.position);
            localPos.applyMatrix4(parentInverse);

            if (doLog) console.log(`[RagdollDebug] Local Hips Target: ${localPos.toArray().map(v => v.toFixed(2))}`);

            bone.position.copy(localPos);
        } else {
            bone.position.copy(particle.position);
        }

        bone.updateMatrixWorld(true);

        if (doLog) {
            const finalWorld = new THREE.Vector3();
            bone.getWorldPosition(finalWorld);
            console.log(`[RagdollDebug] Final Bone World: ${finalWorld.toArray().map(v => v.toFixed(2))}`);
            console.log(`[RagdollDebug] Delta: ${finalWorld.distanceTo(particle.position).toFixed(4)}`);
        }

        // 2. Rotation: Robust Tri-Point Lock
        // Prevents spinning by using the natural axes of the pelvis.
        // Y-Axis: Hips -> Spine (Torso Up)
        // X-Axis: LeftUpLeg -> RightUpLeg (Pelvis Right) -- Wait, Left to Right is +X.

        const spineItem = this.boneParticles.get('spine');
        const leftLegItem = this.boneParticles.get('leftUpLeg');
        const rightLegItem = this.boneParticles.get('rightUpLeg');

        if (!spineItem || !leftLegItem || !rightLegItem) {
            this._aimBone(rootName, aimTargetName);
            return;
        }

        const posHips = particle.position;
        const posSpine = spineItem.particle.position;
        const posLeft = leftLegItem.particle.position;
        const posRight = rightLegItem.particle.position;

        // 1. Primary Axis (Up): Hips -> Spine
        const yAxis = new THREE.Vector3().subVectors(posSpine, posHips).normalize();

        // 2. Secondary Axis (Right): LeftLeg -> RightLeg
        // CORRECTED: Right Direction = LeftPos - RightPos?
        // Wait, if Left is (+X) and Right is (-X).
        // Vector pointing Right (+X) is (1,0,0).
        // LeftPos (1) - RightPos (-1) = 2. Points Right (+X).
        // PREVIOUS CODE WAS: RightPos - LeftPos = (-1) - (1) = -2 (Points Left).
        // So we want: LeftPos - RightPos.
        const xAxisTemp = new THREE.Vector3().subVectors(posLeft, posRight).normalize();

        // 3. Compute Forward (Z) = Cross(Right, Up)
        // Right(+X) x Up(+Y) = Forward(+Z).
        const zAxis = new THREE.Vector3().crossVectors(xAxisTemp, yAxis).normalize();

        // 4. Recompute Orthogonal Right (X) = Cross(Up, Z) (or Z x Up? No, Up x Forward = Right??)
        // Up(+Y) x Forward(+Z) = Right(+X).
        const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

        // Construct Basis
        // makeBasis(xAxis, yAxis, zAxis)
        const rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

        // Apply
        if (bone.parent) {
            const parentQuatInverse = new THREE.Quaternion().copy(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
            targetQuat.premultiply(parentQuatInverse);
        }

        bone.quaternion.copy(targetQuat);
        bone.updateMatrixWorld();
    }

    _aimBone(boneName, targetName, poleTargetName = null) {
        const boneItem = this.boneParticles.get(boneName);
        const targetItem = this.boneParticles.get(targetName);

        if (!boneItem || !targetItem) return;

        const { bone } = boneItem;
        const targetPos = targetItem.particle.position;

        // Calculate the vector from Bone World Position to Target World Position
        const boneWorldPos = new THREE.Vector3();
        bone.getWorldPosition(boneWorldPos);

        const primaryAxis = new THREE.Vector3().subVectors(targetPos, boneWorldPos).normalize(); // Y-Axis (Bone Length)

        let rotationMatrix = null;

        if (poleTargetName) {
            const poleItem = this.boneParticles.get(poleTargetName);
            if (poleItem) {
                const polePos = poleItem.particle.position;

                // Vector from Target to Pole (e.g., Knee -> Ankle)
                const secondaryVec = new THREE.Vector3().subVectors(polePos, targetPos).normalize();

                // Compute Plane Normal (Hinge Axis)
                // N = Primary x Secondary
                // For a leg: (Hip->Knee) x (Knee->Ankle).
                // If leg bends back, this points Left (or Right depending on system).
                // Mixamo Rig: +X is usually the hinge axis for knees.
                const hingeAxis = new THREE.Vector3().crossVectors(primaryAxis, secondaryVec).normalize();

                // If hinge axis is valid (not straight line)
                if (hingeAxis.lengthSq() > 0.001) {
                    // Construct Basis:
                    // Y = Primary
                    // X = Hinge (Right)
                    // Z = Forward (X cross Y)
                    const zAxis = new THREE.Vector3().crossVectors(hingeAxis, primaryAxis).normalize();
                    const xAxis = new THREE.Vector3().crossVectors(primaryAxis, zAxis).normalize(); // Ensure Orthogonal

                    rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, primaryAxis, zAxis);
                }
            }
        }

        // Fallback or Apply
        const targetQuat = new THREE.Quaternion();

        if (rotationMatrix) {
            targetQuat.setFromRotationMatrix(rotationMatrix);
        } else {
            // Simple aim (Shortest Arc) if no pole or straight limb
            targetQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), primaryAxis);
        }

        // Transform into Parent Space
        if (bone.parent) {
            const parentQuatInverse = new THREE.Quaternion().copy(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
            targetQuat.premultiply(parentQuatInverse);
        }

        bone.quaternion.copy(targetQuat);
        bone.updateMatrixWorld();
    }

    /**
     * Apply an impact force to the ragdoll
     * @param {THREE.Vector3} force 
     * @param {THREE.Vector3} point (optional)
     */
    applyImpact(force, point = null) {
        // For Phase 2/5, any impact forces us into Ragdoll Mode
        if (!this.isRagdoll) {
            console.log('[ActiveRagdollController] Impact received, activating ragdoll mode');
            this.setRagdollMode(true);
        }

        // Apply force to Hips (approximate Center of Mass for now)
        // or distributing to all if no specific point
        const hips = this.boneParticles.get('hips');
        if (hips) {
            // Divide force somewhat to avoid explosion? 
            // Or just apply to hips.
            hips.particle.addForce(force);
        }
    }

    /**
     * Check if ragdoll is active
     */
    isActive() {
        return this.isRagdoll;
    }

    // Debug visualiser
    debugDraw(scene) {
        if (!this.debugGroup) {
            this.debugGroup = new THREE.Group();
            scene.add(this.debugGroup);
        }

        this.debugGroup.clear();

        const mat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const points = [];

        this.physics.constraints.forEach(c => {
            points.push(c.particleA.position);
            points.push(c.particleB.position);

            const geo = new THREE.BufferGeometry().setFromPoints([c.particleA.position, c.particleB.position]);
            const line = new THREE.Line(geo, mat);
            this.debugGroup.add(line);
        });

        // Debug Spheres for Particles
        const sphereGeo = new THREE.SphereGeometry(1, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

        this.physics.particles.forEach(p => {
            const mesh = new THREE.Mesh(sphereGeo, sphereMat);
            mesh.position.copy(p.position);
            mesh.scale.setScalar(p.radius);
            this.debugGroup.add(mesh);
        });
    }
}
