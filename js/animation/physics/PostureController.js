
import * as THREE from 'three';

/**
 * PostureController
 * 
 * Central switching station for bone rotations.
 * Solves the "fighting systems" problem by gathering rotation requests 
 * from various sources (Animation, Balance, Stumble, Physics) 
 * and blending them intelligently into a final bone rotation.
 * 
 * Layers (Order of Evaluation):
 * 0. Base (Animation) - The starting state
 * 1. Balance - Corrective rotations to maintain upright posture
 * 2. Impulse - procedural offsets (stumble, stagger)
 * 3. Protective - overriding specific limbs (bracing, head tuck)
 * 4. Physics - ragdoll simulation (highest priority override)
 */
export class PostureController {
    constructor(skeletonRegistry) {
        this.registry = skeletonRegistry;
        this.bones = this.registry.bones;

        // Stores pending modifications for this frame
        // Key: Bone instance
        // Value: Object { layer: value }
        this.modifications = new Map();

        this.layers = [
            'base',      // 0
            'balance',   // 1
            'impulse',   // 2
            'protective',// 3
            'physics'    // 4
        ];
    }

    /**
     * Clear all modifications for the new frame
     * Should be called at the start of ActiveRagdollController.update()
     */
    reset() {
        this.modifications.clear();
    }

    /**
     * Register a rotation request for a specific bone on a layer
     * 
     * @param {THREE.Bone} bone - The bone to modify
     * @param {string} layer - 'balance', 'impulse', 'protective', or 'physics'
     * @param {THREE.Quaternion} rotation - The desired rotation or delta
     * @param {number} weight - Blend weight (0-1)
     * @param {string} mode - 'absolute' (replace) or 'additive' (premultiply)
     */
    request(bone, layer, rotation, weight = 1.0, mode = 'absolute') {
        if (!bone || weight <= 0.001) return;

        if (!this.modifications.has(bone)) {
            this.modifications.set(bone, {});
        }

        const mods = this.modifications.get(bone);

        mods[layer] = {
            rotation: rotation.clone(),
            weight: Math.min(Math.max(weight, 0), 1),
            mode: mode
        };
    }

    /**
     * Apply all buffered modifications to the skeleton
     * Should be called at the END of ActiveRagdollController.update()
     */
    apply() {
        // Iterate over bones that have modifications
        this.modifications.forEach((layers, bone) => {

            // Start with the current bone rotation (which is the Animation pose)
            // We clone it so we can blend from it
            const resultQuat = bone.quaternion.clone();

            // 1. Balance Layer (Usually tends towards a "Rest Pose")
            if (layers.balance) {
                // Balance usually slerps FROM current (Animation) TO Target (Rest)
                if (layers.balance.mode === 'absolute') {
                    resultQuat.slerp(layers.balance.rotation, layers.balance.weight);
                } else {
                    // Additive (unlikely for balance, but supported)
                    const delta = layers.balance.rotation;
                    resultQuat.premultiply(delta); // Local space addition
                }
            }

            // 2. Impulse Layer (Stumble/Stagger - usually Additive)
            if (layers.impulse) {
                if (layers.impulse.mode === 'additive') {
                    // Parent-space additive (premultiply)
                    const identity = new THREE.Quaternion();
                    const partialDelta = identity.slerp(layers.impulse.rotation, layers.impulse.weight);
                    resultQuat.premultiply(partialDelta);
                } else if (layers.impulse.mode === 'additive_local') {
                    // Local-space additive (multiply)
                    const identity = new THREE.Quaternion();
                    const partialDelta = identity.slerp(layers.impulse.rotation, layers.impulse.weight);
                    resultQuat.multiply(partialDelta);
                } else {
                    resultQuat.slerp(layers.impulse.rotation, layers.impulse.weight);
                }
            }

            // 3. Protective Layer (Bracing - usually Absolute overrides)
            if (layers.protective) {
                // Protective poses (hands up) override previous layers
                resultQuat.slerp(layers.protective.rotation, layers.protective.weight);
            }

            // 4. Physics Layer (Ragdoll - Absolute override)
            if (layers.physics) {
                // Physics is the final truth
                resultQuat.slerp(layers.physics.rotation, layers.physics.weight);
            }

            // Apply final result to bone
            bone.quaternion.copy(resultQuat);
        });
    }
}
