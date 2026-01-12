import * as THREE from 'three';

/**
 * HeadLook
 * PROCEDURAL ANIMATION LAYER
 * Makes a character look at a target position using bone rotations.
 */
export class HeadLook {
    /**
     * @param {THREE.SkinnedMesh} mesh - The character mesh
     * @param {Object} options 
     */
    constructor(mesh, options = {}) {
        this.mesh = mesh;
        this.enabled = true;

        this.targetPosition = new THREE.Vector3();
        this.lookAtWeight = 0; // 0 = forward, 1 = full look at
        this.targetWeight = 0; // destination weight

        // Configuration
        this.speed = options.speed || 5.0;
        this.maxYaw = options.maxYaw || 80 * (Math.PI / 180); // 80 degrees
        this.maxPitch = options.maxPitch || 45 * (Math.PI / 180); // 45 degrees

        // Find Bones
        this.headBone = this._findBone(options.headBoneName || 'Head');
        this.neckBone = this._findBone(options.neckBoneName || 'Neck');

        // Store initial rotations (rest pose)
        // We assume the character is T-pose or Idle when initialized?
        // Actually, we apply this ON TOP of animation, so we need to be careful.
        // Usually, look-at overrides animation or adds to it.
        // For simple implementation, we will perform LookAt in LateUpdate (after animation mixer).
    }

    _findBone(name) {
        let bone = null;
        this.mesh.traverse(child => {
            if (child.isBone && child.name.toLowerCase().includes(name.toLowerCase())) {
                bone = child;
            }
        });
        return bone;
    }

    /**
     * Set the world position to look at.
     * @param {THREE.Vector3} pos 
     */
    setTarget(pos) {
        if (pos) {
            this.targetPosition.copy(pos);
            this.targetWeight = 1.0;
        } else {
            this.targetWeight = 0.0;
        }
    }

    /**
     * Update the bones. Must be called AFTER AnimationMixer update.
     * @param {number} delta 
     */
    update(delta) {
        if (!this.headBone) return;

        // Smoothly blend weight
        this.lookAtWeight = THREE.MathUtils.damp(this.lookAtWeight, this.targetWeight, this.speed, delta);

        if (this.lookAtWeight <= 0.01) return;

        // 1. Get Look Direction in Component Space (Mesh space)
        // Ideally we want looking in World Space, but we apply rotation in Local or World.
        // Easiest is to convert Target World -> Bone Local.

        // Current implementation: distribute rotation between Neck and Head
        const bones = [this.neckBone, this.headBone].filter(b => b !== null);
        const weightPerBone = this.lookAtWeight / bones.length;

        bones.forEach(bone => {
            this._applyLookAt(bone, weightPerBone);
        });
    }

    _applyLookAt(bone, weight) {
        // Convert target to bone's parent space to calculate local rotation
        const nodeWorldPosition = new THREE.Vector3();
        bone.getWorldPosition(nodeWorldPosition);

        const lookDir = new THREE.Vector3().subVectors(this.targetPosition, nodeWorldPosition).normalize();

        // We need to know the "forward" vector of the bone. 
        // For standard rigs (Mixamo), Z is forward? Or Y?
        // Usually, Z+ is forward for the character, but bones might be oriented differently.
        // Let's assume Z+ is forward for the character mesh.

        // We convert the look direction into the bone's local parent space
        // This is getting complex mathematically. 
        // Simplified approach: Use `lookAt` but clamped.

        // 1. Get target in parent space
        const targetLocal = this.targetPosition.clone();
        if (bone.parent) {
            bone.parent.worldToLocal(targetLocal);
        }

        // 2. Calculate desired rotation
        // Store original rotation to blend back
        const originalQuat = bone.quaternion.clone();

        // Make bone look at target
        // NOTE: This assumes bone's forward is +Z. If bone is rotated (e.g. Y-up), this might fail.
        // We might need an "up" vector.
        bone.lookAt(targetLocal);

        // Correct for any pre-rotations or coordinate system differences if needed.
        // For now, assume standard Y-up Z-forward local space for generic implementation.

        // 3. Clamp angles (Local Euler)
        // This is tricky with Quaternions. Converting to Euler is safer for clamping.
        // But `lookAt` changes the whole basis.

        // Let's try blending purely:
        // Slerp from Original (Animation) to LookAt (Procedural)
        bone.quaternion.slerp(originalQuat, 1.0 - weight);
    }
}
