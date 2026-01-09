/**
 * Toyota AE86 Trueno - Vehicle Specification
 * 
 * This file contains REAL-WORLD physical properties of the AE86.
 * The PhysicsEngine will automatically apply the Scale Factor (S=4.5)
 * to convert these values to game-world forces.
 * 
 * Reference: physics_update.md Section 3
 */

export const ToyotaAE86 = {
    // ==================== IDENTITY ====================
    name: "Toyota AE86 Trueno",

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 950,                  // kg (curb weight)
    dragCoefficient: 0.35,      // Cd
    frontalArea: 1.9,           // m² (approximate)

    // ==================== DIMENSIONS (Game Units - already scaled) ====================
    // The 3D model is baked at 4.5x scale, so these are visual/game units
    dimensions: {
        wheelRadius: 1.35,      // Game units (real: ~0.3m * 4.5)
        trackWidth: 7.55,       // Game units (real: ~1.45m * 4.5)
        wheelBase: 10.55,       // Game units (real: ~2.4m * 4.5)
        cgHeight: 2.4,          // Game units - Center of gravity height
        width: 6.70,            // Body width (for collision)
        height: 4.5,            // Body height (for collision) - real AE86 ~1.29m * 4.5 scale
        length: 18.40           // Body length (for collision)
    },

    // ==================== SUSPENSION (Tuned for Game Scale) ====================
    suspension: {
        restLength: 1.5,        // Game units
        travel: 1.1,            // Game units
        stiffness: 35000,       // N/m - Stiffer for scaled gravity (g*4.5)
        damping: 3000           // Ns/m
    },

    // ==================== ENGINE (Real World Values) ====================
    engine: {
        idleRPM: 900,
        redlineRPM: 7800,
        maxTorque: 150,         // Nm (REAL value - will be scaled by S²)
        // Normalized torque curve: [low, mid-low, mid, mid-high, high RPM]
        // Values represent percentage of max torque at these RPM ranges
        powerCurve: [0.4, 0.7, 0.9, 1.0, 0.85]
    },

    // ==================== TRANSMISSION ====================
    transmission: {
        // [Reverse, Neutral, 1st, 2nd, 3rd, 4th, 5th]
        gears: [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8],
        finalDrive: 4.3,
        shiftTime: 0.2          // seconds
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 1.5,   // Peak friction coefficient
        slipAnglePeak: 0.15,    // Radians - angle at peak grip
        rollingResistance: 0.005
    },

    // ==================== AERODYNAMICS ====================
    aero: {
        downforce: 0.2          // Downforce coefficient
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.6,          // Radians (~34 degrees)
        speed: 3.0              // Steering responsiveness
    },

    // ==================== VISUAL CONFIGURATION ====================
    lights: {
        headlightPos: [
            { x: -2.2, y: 1.5, z: 9.2 },
            { x: 2.2, y: 1.5, z: 9.2 }
        ],
        taillightPos: [
            { x: -2.0, y: 3.0, z: -9.2 },
            { x: 2.0, y: 3.0, z: -9.2 }
        ]
    },

    // Visual offset (mesh origin to physics center)
    visualOffset: {
        x: -0.3,                 // Mesh shifted left to center with physics hitbox
        y: -3.3                 // Mesh shifted down to align with physics
    }
};
