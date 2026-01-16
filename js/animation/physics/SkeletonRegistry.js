import * as THREE from 'three';

/**
 * SkeletonRegistry
 * 
 * Centralizer service that scans a character heirarchy, identifies bones
 * based on common naming conventions (Unreal, Mixamo, etc.), and provides
 * access to them for various controllers.
 * 
 * Eliminates duplicate bone-finding logic in ActiveRagdoll, Balance, and Fall controllers.
 */
export class SkeletonRegistry {
    /**
     * @param {THREE.Object3D} mesh - Root character mesh or group
     */
    constructor(mesh) {
        this.mesh = mesh;

        // Storage for all SkinnedMesh components found
        this.skinnedMeshes = [];
        this.skeletons = new Set();

        // Registry maps bone types to ARRAYS of bone objects (one per skeleton)
        // This supports multi-part meshes (e.g. separate head, body, clothes meshes)
        this.bones = {
            // Core
            hips: [],
            spine: [],
            spine1: [],
            spine2: [],
            chest: [],
            neck: [],
            head: [],

            // Arms
            leftArm: [],
            rightArm: [],
            leftForearm: [],
            rightForearm: [],
            leftHand: [],
            rightHand: [],

            // Legs
            leftUpLeg: [],
            rightUpLeg: [],
            leftLeg: [],
            rightLeg: [],
            leftFoot: [],
            rightFoot: []
        };

        // Cache for primary bones (first found)
        this.primaryBones = {};

        this._scan();
    }

    /**
     * Scan the hierarchy and populate the registry
     */
    _scan() {
        // 1. Find all SkinnedMeshes
        this.mesh.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton) {
                this.skinnedMeshes.push(child);
                this.skeletons.add(child.skeleton);
            }
        });

        // 2. Iterate ALL skeletons to find bones
        this.skeletons.forEach(skeleton => {
            skeleton.bones.forEach(bone => {
                this._categorizeBone(bone);
            });
        });

        // 3. Populate primary bones cache
        Object.keys(this.bones).forEach(key => {
            if (this.bones[key].length > 0) {
                this.primaryBones[key] = this.bones[key][0];
            } else {
                this.primaryBones[key] = null;
            }
        });

        this._logStats();
    }

    /**
     * Categorize a single bone based on its name
     */
    _categorizeBone(bone) {
        const name = bone.name.toLowerCase();

        // --- Core ---

        // Pelvis / Hips (UE4: pelvis, Mixamo: hips)
        if (name === 'pelvis' || name.includes('hips')) {
            this._add('hips', bone);
        }

        // Spine (UE4: spine_01, spine_02... Mixamo: spine)
        // Note: Logic attempts to separate spine segments, but falls back to generic "spine"
        if (name === 'spine_01' || (name === 'spine' && !name.includes('_'))) {
            this._add('spine', bone);
        }
        if (name === 'spine_02' || name === 'spine1') {
            this._add('spine1', bone);
        }
        if (name === 'spine_03' || name === 'spine_04' || name === 'spine2') {
            this._add('spine2', bone);
            this._add('chest', bone); // Alias
        }

        // Neck & Head
        if (name === 'neck_01' || name === 'neck') {
            this._add('neck', bone);
        }
        if (name === 'head') {
            this._add('head', bone);
        }

        // --- Arms ---

        // Upper Arms (UE4: upperarm_l, Mixamo: LeftArm)
        if (name === 'upperarm_l' || (name.includes('leftarm') && !name.includes('fore') && !name.includes('lower'))) {
            this._add('leftArm', bone);
        }
        if (name === 'upperarm_r' || (name.includes('rightarm') && !name.includes('fore') && !name.includes('lower'))) {
            this._add('rightArm', bone);
        }

        // Forearms (UE4: lowerarm_l, Mixamo: LeftForeArm)
        if (name === 'lowerarm_l' || name.includes('leftforearm')) {
            this._add('leftForearm', bone);
        }
        if (name === 'lowerarm_r' || name.includes('rightforearm')) {
            this._add('rightForearm', bone);
        }

        // Hands
        if (name === 'hand_l' || name.includes('lefthand')) {
            this._add('leftHand', bone);
        }
        if (name === 'hand_r' || name.includes('righthand')) {
            this._add('rightHand', bone);
        }

        // --- Legs ---

        // Upper Legs / Thighs (UE4: thigh_l, Mixamo: LeftUpLeg)
        if (name === 'thigh_l' || name.includes('leftupleg') || name.includes('leftthigh')) {
            this._add('leftUpLeg', bone);
        }
        if (name === 'thigh_r' || name.includes('rightupleg') || name.includes('rightthigh')) {
            this._add('rightUpLeg', bone);
        }

        // Lower Legs / Calves (UE4: calf_l, Mixamo: LeftLeg)
        if (name === 'calf_l' || (name.includes('leftleg') && !name.includes('upleg'))) {
            this._add('leftLeg', bone);
        }
        if (name === 'calf_r' || (name.includes('rightleg') && !name.includes('upleg'))) {
            this._add('rightLeg', bone);
        }

        // Feet
        if (name === 'foot_l' || name.includes('leftfoot')) {
            this._add('leftFoot', bone);
        }
        if (name === 'foot_r' || name.includes('rightfoot')) {
            this._add('rightFoot', bone);
        }
    }

    /**
     * Helper to add unique bone to category
     */
    _add(category, bone) {
        if (!this.bones[category].includes(bone)) {
            this.bones[category].push(bone);
        }
    }

    /**
     * Get all bones of a specific type (from all skeletons)
     * @param {string} type - Bone type (e.g. 'hips', 'leftArm')
     * @returns {THREE.Bone[]} Array of bones
     */
    getBones(type) {
        return this.bones[type] || [];
    }

    /**
     * Get the primary bone of a specific type (from first skeleton)
     * @param {string} type - Bone type
     * @returns {THREE.Bone|null} Bone or null
     */
    getBone(type) {
        return this.primaryBones[type];
    }

    /**
     * Log found bones for debugging
     */
    _logStats() {
        const found = Object.keys(this.bones).filter(k => this.bones[k].length > 0);
        console.log(`[SkeletonRegistry] Found ${this.skinnedMeshes.length} SkinnedMeshes, ${this.skeletons.size} Skeletons.`);
        console.log(`[SkeletonRegistry] Mapped categories: ${found.join(', ')}`);

        if (this.bones.hips.length === 0) {
            console.warn('[SkeletonRegistry] CRITICAL: Hips/Pelvis not found!');
        }
    }
}
