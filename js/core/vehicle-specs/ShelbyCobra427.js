/**
 * 1966 Shelby Cobra 427 - Vehicle Specification
 * 
 * This file contains REAL-WORLD physical properties of the Shelby Cobra 427.
 * The PhysicsEngine will automatically apply the Scale Factor (S=4.5)
 * to convert these values to game-world forces.
 * 
 * Reference: physics_update.md Section 3
 */

export const ShelbyCobra427 = {
    // ==================== IDENTITY ====================
    name: "1966 Shelby Cobra 427",
    model: "1966_shelby_cobra_427.glb",
    modelScale: 4.5,            // Scale factor for the 3D model

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 1150,                 // kg (curb weight - lightweight but beefy V8)
    dragCoefficient: 0.42,      // Cd (classic roadster, not very aerodynamic)
    frontalArea: 1.65,          // m² (low and compact profile)

    // ==================== DIMENSIONS (Game Units - already scaled) ====================
    // The 3D model is baked at 4.5x scale, so these are visual/game units
    dimensions: {
        wheelRadius: 1.42,      // Game units (real: ~0.315m * 4.5)
        trackWidth: 6.30,       // Game units (real: ~1.40m * 4.5)
        wheelBase: 10.35,       // Game units (real: ~2.30m * 4.5)
        cgHeight: 2.0,          // Game units - Center of gravity height (very low roadster)
        width: 6.75,            // Body width (for collision) - real 1.50m * 4.5
        height: 4.50,           // Body height (for collision) - real 1.00m * 4.5 (low profile)
        length: 17.55           // Body length (for collision) - real 3.90m * 4.5
    },

    // ==================== SUSPENSION (Tuned for Game Scale) ====================
    suspension: {
        restLength: 1.3,        // Game units (shorter suspension)
        travel: 0.9,            // Game units (limited travel on classic sports car)
        stiffness: 45000,       // N/m - Stiff racing suspension
        damping: 4000           // Ns/m - High damping for track use
    },

    // ==================== ENGINE (Real World Values) ====================
    // 7.0L (427 ci) Ford FE V8 - massive muscle power
    engine: {
        idleRPM: 800,
        redlineRPM: 6500,
        maxTorque: 650,         // Nm (REAL value - legendary torque monster)
        // Normalized torque curve: V8 has peak torque at mid-RPM
        // [low, mid-low, mid, mid-high, high RPM]
        powerCurve: [0.6, 0.85, 1.0, 0.95, 0.8]
    },

    // ==================== TRANSMISSION ====================
    transmission: {
        // [Reverse, Neutral, 1st, 2nd, 3rd, 4th]
        gears: [-3.28, 0, 2.78, 1.93, 1.36, 1.00],
        finalDrive: 3.54,
        shiftTime: 0.25          // seconds (4-speed manual)
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 1.4,   // Peak friction coefficient (period-correct tires)
        slipAnglePeak: 0.16,    // Radians - angle at peak grip
        rollingResistance: 0.006
    },

    // ==================== AERODYNAMICS ====================
    aero: {
        downforce: 0.1          // Downforce coefficient (minimal on classic roadster)
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.65,         // Radians (~37 degrees - wide steering)
        speed: 2.8              // Steering responsiveness (slightly slower, muscle car feel)
    },

    // ==================== VISUAL CONFIGURATION ====================
    // Classic Cobra with round headlights and small taillights
    lights: {
        headlightPos: [
            { x: -2.4, y: 1.2, z: 8.0 },   // Classic round headlights
            { x: 2.4, y: 1.2, z: 8.0 }
        ],
        taillightPos: [
            { x: -2.6, y: 1.5, z: -8.5 },  // Small round taillights on fenders
            { x: 2.6, y: 1.5, z: -8.5 }
        ]
    },

    exhaust: {
        // Side-exit exhaust pipes (classic Cobra style)
        positions: [
            { x: -3.0, y: -0.5, z: 0.0 },  // Left side-exit
            { x: 3.0, y: -0.5, z: 0.0 }    // Right side-exit
        ]
    },

    // Visual offset (mesh origin to physics center)
    // NOTE: These values may need adjustment once the 3D model alignment is verified
    visualOffset: {
        x: 0.0,                 // Adjust based on model alignment
        y: -2.8                 // Adjust based on model alignment (lower roadster)
    }
};
