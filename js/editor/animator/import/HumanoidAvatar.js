/**
 * HumanoidAvatar.js
 * Animation Import System - Phase 2.1
 * 
 * Defines the standard humanoid bone structure for retargeting.
 * Similar to Unity's Mecanim Avatar system.
 */

/**
 * Standard humanoid bone definitions
 * Required bones must be mapped for a valid retarget
 */
export const HUMANOID_BONES = {
    // Root / Pelvis
    Hips: { required: true, category: 'Body' },

    // Spine chain
    Spine: { required: true, category: 'Body' },
    Chest: { required: false, category: 'Body' },
    UpperChest: { required: false, category: 'Body' },

    // Head
    Neck: { required: false, category: 'Head' },
    Head: { required: true, category: 'Head' },

    // Left Arm
    LeftShoulder: { required: false, category: 'Left Arm' },
    LeftUpperArm: { required: true, category: 'Left Arm' },
    LeftLowerArm: { required: true, category: 'Left Arm' },
    LeftHand: { required: true, category: 'Left Arm' },

    // Right Arm
    RightShoulder: { required: false, category: 'Right Arm' },
    RightUpperArm: { required: true, category: 'Right Arm' },
    RightLowerArm: { required: true, category: 'Right Arm' },
    RightHand: { required: true, category: 'Right Arm' },

    // Left Leg
    LeftUpperLeg: { required: true, category: 'Left Leg' },
    LeftLowerLeg: { required: true, category: 'Left Leg' },
    LeftFoot: { required: true, category: 'Left Leg' },
    LeftToes: { required: false, category: 'Left Leg' },

    // Right Leg
    RightUpperLeg: { required: true, category: 'Right Leg' },
    RightLowerLeg: { required: true, category: 'Right Leg' },
    RightFoot: { required: true, category: 'Right Leg' },
    RightToes: { required: false, category: 'Right Leg' }
};

/**
 * Auto-mapping patterns for common naming conventions
 * Key = prefix pattern to strip, Value = bone name mappings
 */
export const BONE_PATTERNS = {
    // Mixamo standard naming
    'mixamorig:': {
        'Hips': 'Hips',
        'Spine': 'Spine',
        'Spine1': 'Chest',
        'Spine2': 'UpperChest',
        'Neck': 'Neck',
        'Head': 'Head',
        'LeftShoulder': 'LeftShoulder',
        'LeftArm': 'LeftUpperArm',
        'LeftForeArm': 'LeftLowerArm',
        'LeftHand': 'LeftHand',
        'RightShoulder': 'RightShoulder',
        'RightArm': 'RightUpperArm',
        'RightForeArm': 'RightLowerArm',
        'RightHand': 'RightHand',
        'LeftUpLeg': 'LeftUpperLeg',
        'LeftLeg': 'LeftLowerLeg',
        'LeftFoot': 'LeftFoot',
        'LeftToeBase': 'LeftToes',
        'RightUpLeg': 'RightUpperLeg',
        'RightLeg': 'RightLowerLeg',
        'RightFoot': 'RightFoot',
        'RightToeBase': 'RightToes'
    },

    // Blender Rigify naming (DEF- prefix)
    'DEF-': {
        'spine': 'Hips',
        'spine.001': 'Spine',
        'spine.002': 'Chest',
        'spine.003': 'UpperChest',
        'spine.004': 'Neck',
        'spine.005': 'Head',
        'shoulder.L': 'LeftShoulder',
        'upper_arm.L': 'LeftUpperArm',
        'forearm.L': 'LeftLowerArm',
        'hand.L': 'LeftHand',
        'shoulder.R': 'RightShoulder',
        'upper_arm.R': 'RightUpperArm',
        'forearm.R': 'RightLowerArm',
        'hand.R': 'RightHand',
        'thigh.L': 'LeftUpperLeg',
        'shin.L': 'LeftLowerLeg',
        'foot.L': 'LeftFoot',
        'toe.L': 'LeftToes',
        'thigh.R': 'RightUpperLeg',
        'shin.R': 'RightLowerLeg',
        'foot.R': 'RightFoot',
        'toe.R': 'RightToes'
    },

    // Generic/CMU naming
    '': {
        'pelvis': 'Hips',
        'spine': 'Spine',
        'spine1': 'Chest',
        'spine2': 'UpperChest',
        'neck': 'Neck',
        'head': 'Head',
        'l_shoulder': 'LeftShoulder',
        'l_upperarm': 'LeftUpperArm',
        'l_forearm': 'LeftLowerArm',
        'l_hand': 'LeftHand',
        'r_shoulder': 'RightShoulder',
        'r_upperarm': 'RightUpperArm',
        'r_forearm': 'RightLowerArm',
        'r_hand': 'RightHand',
        'l_thigh': 'LeftUpperLeg',
        'l_shin': 'LeftLowerLeg',
        'l_foot': 'LeftFoot',
        'l_toe': 'LeftToes',
        'r_thigh': 'RightUpperLeg',
        'r_shin': 'RightLowerLeg',
        'r_foot': 'RightFoot',
        'r_toe': 'RightToes'
    }
};

/**
 * Fallback regex patterns for fuzzy matching
 */
export const FALLBACK_PATTERNS = {
    Hips: /hip|pelvis|root/i,
    Spine: /spine(?![\d])|spine\.?0*1?$/i,
    Chest: /chest|spine\.?0*2/i,
    UpperChest: /upper.?chest|spine\.?0*3/i,
    Neck: /neck/i,
    Head: /head/i,

    LeftShoulder: /left.*(shoulder|clavicle)|shoulder.*l|clavicle.*l/i,
    LeftUpperArm: /left.*(upper.?arm|arm(?!.*fore))|upper.?arm.*l(?!ow)/i,
    LeftLowerArm: /left.*(fore.?arm|lower.?arm)|fore.?arm.*l/i,
    LeftHand: /left.*hand|hand.*l(?!eg)/i,

    RightShoulder: /right.*(shoulder|clavicle)|shoulder.*r|clavicle.*r/i,
    RightUpperArm: /right.*(upper.?arm|arm(?!.*fore))|upper.?arm.*r(?!ow)/i,
    RightLowerArm: /right.*(fore.?arm|lower.?arm)|fore.?arm.*r/i,
    RightHand: /right.*hand|hand.*r(?!eg)/i,

    LeftUpperLeg: /left.*(thigh|up.?leg|upper.?leg)|thigh.*l|up.?leg.*l/i,
    LeftLowerLeg: /left.*(shin|calf|low.?leg|lower.?leg)|shin.*l|calf.*l/i,
    LeftFoot: /left.*foot|foot.*l(?!eg)/i,
    LeftToes: /left.*toe|toe.*l/i,

    RightUpperLeg: /right.*(thigh|up.?leg|upper.?leg)|thigh.*r|up.?leg.*r/i,
    RightLowerLeg: /right.*(shin|calf|low.?leg|lower.?leg)|shin.*r|calf.*r/i,
    RightFoot: /right.*foot|foot.*r(?!eg)/i,
    RightToes: /right.*toe|toe.*r/i
};

/**
 * HumanoidMapper - Auto-maps bone names to standard humanoid bones
 */
export class HumanoidMapper {
    /**
     * Attempt to auto-map a skeleton's bones to humanoid standard
     * @param {THREE.Bone[]} bones - Array of bones from skeleton
     * @returns {Object} mapping { humanoidBone: sourceBoneName }
     */
    static autoMap(bones) {
        const mapping = {};
        const boneNames = bones.map(b => b.name);

        // First pass: Try exact pattern matching
        for (const [prefix, patterns] of Object.entries(BONE_PATTERNS)) {
            for (const boneName of boneNames) {
                // Check if bone name starts with this prefix
                if (prefix && !boneName.startsWith(prefix)) continue;

                // Get the part after the prefix
                const suffix = prefix ? boneName.slice(prefix.length) : boneName;

                // Look for a match in our patterns
                const humanoidBone = patterns[suffix];
                if (humanoidBone && !mapping[humanoidBone]) {
                    mapping[humanoidBone] = boneName;
                }
            }
        }

        // Second pass: Use fallback regex for unmapped required bones
        for (const [humanoidBone, def] of Object.entries(HUMANOID_BONES)) {
            if (mapping[humanoidBone]) continue; // Already mapped

            const regex = FALLBACK_PATTERNS[humanoidBone];
            if (!regex) continue;

            for (const boneName of boneNames) {
                if (regex.test(boneName)) {
                    mapping[humanoidBone] = boneName;
                    break;
                }
            }
        }

        return mapping;
    }

    /**
     * Check if a mapping is complete (all required bones mapped)
     * @param {Object} mapping - The bone mapping
     * @returns {Object} { valid: boolean, missing: string[] }
     */
    static validateMapping(mapping) {
        const missing = [];

        for (const [bone, def] of Object.entries(HUMANOID_BONES)) {
            if (def.required && !mapping[bone]) {
                missing.push(bone);
            }
        }

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Get all bones in a category
     * @param {string} category - Category name (e.g., 'Left Arm')
     * @returns {string[]} Array of bone names
     */
    static getBonesByCategory(category) {
        return Object.entries(HUMANOID_BONES)
            .filter(([_, def]) => def.category === category)
            .map(([name]) => name);
    }

    /**
     * Get all categories
     * @returns {string[]} Array of category names
     */
    static getCategories() {
        const categories = new Set();
        for (const def of Object.values(HUMANOID_BONES)) {
            categories.add(def.category);
        }
        return Array.from(categories);
    }
}

export default HumanoidMapper;
