/**
 * IKSolver.js
 * Phase 4: Advanced Posing & IK
 * 
 * Implements Cyclic Coordinate Descent (CCD) inverse kinematics solver.
 * Manages IK chains and solves for target positions.
 */
import * as THREE from 'three';

export class IKSolver {
    constructor() {
        this.chains = [];
        this.iterations = 10;
        this.tolerance = 0.001; // Distance squared
        this.enabled = true;
    }

    /**
     * Add an IK chain to the solver
     * @param {Object} chain - { root: Bone, effector: Bone, target: Object3D, pole: Object3D (optional), joints: Bone[] }
     */
    addChain(chain) {
        // Ensure chain has populated joints array if not provided
        if (!chain.joints || chain.joints.length === 0) {
            chain.joints = [];
            let current = chain.effector;
            while (current) {
                chain.joints.unshift(current); // Add to front
                if (current === chain.root) break;
                current = current.parent;
            }
        }
        this.chains.push(chain);
        console.log('[IKSolver] Added chain:', chain);
    }

    removeChain(chain) {
        const index = this.chains.indexOf(chain);
        if (index > -1) {
            this.chains.splice(index, 1);
        }
    }

    clear() {
        this.chains = [];
    }

    update() {
        if (!this.enabled) return;

        for (const chain of this.chains) {
            if (!chain.target) continue;
            this._solveCCD(chain);
        }
    }

    /**
     * Solve single chain using CCD
     * @private
     */
    _solveCCD(chain) {
        const targetPos = new THREE.Vector3();
        const endPos = new THREE.Vector3();
        const jointPos = new THREE.Vector3();
        const targetVec = new THREE.Vector3();
        const currentVec = new THREE.Vector3();
        const cross = new THREE.Vector3();

        let target = chain.target;

        // Get world position of target
        target.getWorldPosition(targetPos);

        const joints = chain.joints;
        const n = joints.length;

        // Iteration loop
        for (let iter = 0; iter < this.iterations; iter++) {
            // Check if we reached target
            joints[n - 1].getWorldPosition(endPos);
            if (endPos.distanceToSquared(targetPos) < this.tolerance) {
                break;
            }

            // Iterate backwards from second-to-last joint to root
            // (The effector itself doesn't rotate in CCD usually, it's the parents pointing to it)
            // Wait, standard CCD rotates all joints including the one before effector to point effector to target.
            // Effector is joints[n-1]. We rotate joints[n-2], joints[n-3]... joints[0].

            for (let i = n - 2; i >= 0; i--) {
                const joint = joints[i];

                // 1. Vector from joint to effector
                joints[n - 1].getWorldPosition(endPos);
                joint.getWorldPosition(jointPos);

                currentVec.subVectors(endPos, jointPos).normalize();

                // 2. Vector from joint to target
                targetVec.subVectors(targetPos, jointPos).normalize();

                // 3. Rotation needed to align currentVec to targetVec
                // Angle between vectors
                let angle = currentVec.angleTo(targetVec);

                // Skip small angles
                if (angle < 0.001) continue;

                // Axis of rotation (cross product)
                cross.crossVectors(currentVec, targetVec).normalize();

                // Clamp angle to avoid erratic large jumps? (Optional damping)
                // angle = Math.min(angle, 0.5); 

                // 4. Apply rotation in joint's local space
                // We need to transform the world axis 'cross' into local space of the joint
                // Then apply quaternion multiplication

                const qComp = new THREE.Quaternion().setFromAxisAngle(cross, angle);

                // Rotate the joint in world space
                // joint.quaternion.premultiply(qComp); // This is local application if qComp is local

                // Correct way:
                // World quaternion = qComp * World quaternion
                // But we set local quaternion.
                // easiest is using rotateOnWorldAxis/rotateOnAxis if available, or manual math.

                // Convert axis to local space
                // localAxis = axis * inverse(parentWorldRotation)
                const parentRot = joint.parent ? joint.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
                const invParentRot = parentRot.clone().invert();
                const localAxis = cross.clone().applyQuaternion(invParentRot);

                joint.rotateOnAxis(localAxis, angle);

                // Update matrix world immediately for next link calc
                joint.updateMatrixWorld(true);
            }
        }
    }
}
