import * as THREE from 'three';

/**
 * Ragdoll Configuration
 * 
 * Euphoria-style active ragdoll system configuration.
 * All tunable parameters for balance, impact response, and falling behaviors.
 */
export const RagdollConfig = {
    // ==================== PHYSICS CONFIGURATION ====================
    physics: {
        gravity: new THREE.Vector3(0, -40, 0),
        friction: 0.98,
        groundFriction: 0.6,
        solverIterations: 20,  // Increased from 10 for better constraint stability

        // Mass Configuration
        mass: {
            default: 1.0,
            hips: 15.0,
            spine: 5.0,
            head: 3.0,
            thigh: 3.0,
            leg: 1.5,
            arm: 1.0
        },

        // Radius Configuration (Game Units - Scaled 4x from Meters)
        // 1 meter = 4 units
        radius: {
            default: 0.4,
            hips: 0.35,       // ~10cm radius (Reduced from 0.6/1.1 to fix floating)
            spine: 0.4,      // ~17cm
            head: 0.5,       // ~12cm
            thigh: 0.5,      // ~12cm
            leg: 0.35,       // ~9cm
            arm: 0.2,        // Reduced from 0.3
            hand: 0.15,      // Reduced from 0.2
            foot: 0.15       // Reduced from 0.25
        },

        // Constraint Configuration
        stiffness: {
            default: 0.8,
            rigid: 1.0,
            soft: 0.5
        }
    },

    // ==================== BALANCE THRESHOLDS ====================
    balance: {
        stabilityConeAngle: 15,           // Degrees from vertical before unstable
        criticalAngle: 45,                // Degrees before inevitable fall
        recoverySpeed: 3.0,               // How fast character corrects posture
        comHeightFactor: 0.55,            // Center of mass height (% of character height)
        supportBaseWidth: 1.0,            // Distance between feet considered stable
    },

    // ==================== IMPACT RESPONSE THRESHOLDS ====================
    // Force magnitude in game units (scaled for 4x world scale)
    impact: {
        stumbleThreshold: 50,             // Light push - stumble step
        staggerThreshold: 150,            // Medium hit - multi-step stagger  
        fallThreshold: 300,               // Heavy hit - lose balance
        knockdownThreshold: 600,          // Massive hit - instant ragdoll

        // Directional multipliers
        frontMultiplier: 1.0,             // Impacts from front
        backMultiplier: 1.3,              // Back impacts are more destabilizing
        sideMultiplier: 1.2,              // Side impacts
    },

    // ==================== MOTOR STRENGTH ====================
    // How hard limbs fight to maintain position (0-1)
    motors: {
        spineStrength: 1.0,               // Core stability
        legStrength: 0.8,                 // Leg correction force
        armStrength: 0.5,                 // Arm damping
        headStrength: 0.7,                // Head stabilization

        // Motor response speeds
        correctionSpeed: 5.0,             // How fast motors respond
        dampingFactor: 0.3,               // Damping to prevent oscillation
    },

    // ==================== FALLING BEHAVIOR ====================
    falling: {
        armBraceDelay: 0.15,              // Seconds before arms extend to brace
        headProtectionAngle: 25,          // Degrees head tucks forward
        groundDetectionDistance: 0.5,     // Meters to detect imminent ground impact
        recoveryDelay: 0.5,               // Seconds on ground before getting up

        // Protective behavior intensities
        armBraceIntensity: 0.8,           // How far arms extend (0-1)
        bodyRotationSpeed: 2.0,           // How fast body rotates during fall
    },

    // ==================== STUMBLE BEHAVIOR ====================
    stumble: {
        stepDistance: 1.5,                // Distance of recovery step
        stepSpeed: 1.5,                   // Speed of recovery step (1.5 = ~0.67s per step)
        maxSteps: 3,                      // Max consecutive stumble steps
        recoveryTime: 0.6,                // Minimum time for stumble effect to play
    },

    // ==================== STAGGER BEHAVIOR ====================
    stagger: {
        swayAmount: 0.3,                  // How much character sways
        swaySpeed: 4.0,                   // Speed of sway oscillation
        armFlailIntensity: 0.5,           // How much arms flail for balance
        durationMin: 0.5,                 // Minimum stagger duration
        durationMax: 1.5,                 // Maximum stagger duration
    },

    // ==================== ANIMATION BLENDING ====================
    blending: {
        physicsBlendSpeed: 5.0,           // Speed of physics takeover (0-1 per second)
        animationRecoverySpeed: 3.0,      // Speed of returning to animation
        ragdollBlendTime: 0.2,            // Seconds to fully transition to ragdoll

        // Blend curve (easing)
        blendEaseIn: 2.0,                 // Exponent for easing into physics
        blendEaseOut: 1.5,                // Exponent for easing out of physics
    },

    // ==================== DEBUG ====================
    debug: {
        showCOM: false,                   // Show center of mass visualization
        showSupportBase: false,           // Show support polygon
        showForces: false,                // Show impact forces
        logStateChanges: true,            // Log state transitions
    },

    // ==================== JOINT LIMITS ====================
    // Anatomical swing-twist limits per joint type
    // 
    // swingMin/swingMax: Define the bend range
    //   - For hinge joints: 0 = straight, positive = flexed
    //   - For ball joints: Cone angle from parent axis
    // 
    // type: 'ball' (shoulder/hip), 'hinge' (elbow/knee), or 'saddle' (wrist/ankle)
    // stiffness: How strongly the constraint is enforced (0-1)
    joints: {
        // Spine joints - limited flexion/extension, moderate twist
        spine: {
            type: 'ball',
            swingMin: -Math.PI / 6,      // -30° (back extension)
            swingMax: Math.PI / 4,        // +45° (forward flexion)
            twistMin: -Math.PI / 6,
            twistMax: Math.PI / 6,
            stiffness: 0.9
        },
        
        // Neck - more mobile than spine
        neck: {
            type: 'ball',
            swingMin: -Math.PI / 4,       // -45°
            swingMax: Math.PI / 3,        // +60°
            twistMin: -Math.PI / 3,
            twistMax: Math.PI / 3,
            stiffness: 0.8
        },
        
        // Shoulder - high mobility ball joint
        shoulder: {
            type: 'ball',
            swingMin: -Math.PI / 2,       // -90° (arm behind)
            swingMax: Math.PI * 0.8,      // +144° (arm overhead)
            twistMin: -Math.PI / 2,       // Internal rotation
            twistMax: Math.PI / 2,        // External rotation
            stiffness: 0.7
        },
        
        // Elbow - hinge joint, no hyperextension
        elbow: {
            type: 'hinge',
            swingMin: 0,                  // No hyperextension (straight arm)
            swingMax: Math.PI * 0.85,     // ~150° flexion
            twistMin: 0,
            twistMax: 0,
            stiffness: 0.95
        },
        
        // Wrist - limited ball joint
        wrist: {
            type: 'ball',
            swingMin: -Math.PI / 4,
            swingMax: Math.PI / 3,
            twistMin: -Math.PI / 2,       // Pronation
            twistMax: Math.PI / 2,        // Supination
            stiffness: 0.8
        },
        
        // Hip - ball joint with anatomical limits
        hip: {
            type: 'ball',
            swingMin: -Math.PI / 6,       // -30° extension (leg back)
            swingMax: Math.PI * 0.6,      // +108° flexion (leg forward)
            twistMin: -Math.PI / 4,       // Internal rotation
            twistMax: Math.PI / 3,        // External rotation
            stiffness: 0.85
        },
        
        // Knee - hinge joint, slight hyperextension allowed
        knee: {
            type: 'hinge',
            swingMin: -Math.PI / 36,      // -5° slight hyperextension
            swingMax: Math.PI * 0.8,      // ~144° flexion
            twistMin: 0,
            twistMax: 0,
            stiffness: 0.95
        },
        
        // Ankle - limited ball joint
        ankle: {
            type: 'ball',
            swingMin: -Math.PI / 6,       // Plantarflexion
            swingMax: Math.PI / 4,        // Dorsiflexion
            twistMin: -Math.PI / 6,
            twistMax: Math.PI / 6,
            stiffness: 0.8
        }
    }
};
