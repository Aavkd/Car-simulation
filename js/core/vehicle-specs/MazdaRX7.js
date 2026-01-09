/**
 * Mazda RX-7 FD3S - Vehicle Specification
 * 
 * This file contains REAL-WORLD physical properties of the RX-7 FD.
 * The PhysicsEngine will automatically apply the Scale Factor (S=4.5)
 * to convert these values to game-world forces.
 * 
 * Reference: physics_update.md Section 3
 */

export const MazdaRX7 = {
    // ==================== IDENTITY ====================
    name: "Mazda RX-7 FD3S",
    model: "Mazda RX-7.glb",
    modelScale: 4.5,            // Scale factor for the 3D model (AE86 is pre-baked at 4.5x)

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 1300,                 // kg (curb weight - FD3S is heavier than AE86)
    dragCoefficient: 0.31,      // Cd (more aerodynamic than AE86)
    frontalArea: 1.79,          // m² (slightly smaller frontal area)

    // ==================== DIMENSIONS (Game Units - already scaled) ====================
    // The 3D model is baked at 4.5x scale, so these are visual/game units
    dimensions: {
        wheelRadius: 1.42,      // Game units (real: ~0.315m * 4.5)
        trackWidth: 6.75,       // Game units (real: ~1.50m * 4.5)
        wheelBase: 11.25,       // Game units (real: ~2.5m * 4.5)
        cgHeight: 2.25,         // Game units - Center of gravity height (lower than AE86)
        width: 7.65,            // Body width (for collision) - real 1.70m * 4.5
        height: 5.40,           // Body height (for collision) - real 1.20m * 4.5
        length: 19.35           // Body length (for collision) - real 4.30m * 4.5
    },

    // ==================== SUSPENSION (Tuned for Game Scale) ====================
    suspension: {
        restLength: 1.4,        // Game units (slightly stiffer than AE86)
        travel: 1.0,            // Game units
        stiffness: 42000,       // N/m - Stiffer sports suspension
        damping: 3500           // Ns/m - Higher damping for sport tune
    },

    // ==================== ENGINE (Real World Values) ====================
    // Twin-turbo 13B-REW rotary engine
    engine: {
        idleRPM: 1000,
        redlineRPM: 8000,
        maxTorque: 294,         // Nm (REAL value - will be scaled by S²)
        // Normalized torque curve: rotary engines have a flatter curve
        // [low, mid-low, mid, mid-high, high RPM]
        powerCurve: [0.5, 0.75, 0.90, 1.0, 0.95]
    },

    // ==================== TRANSMISSION ====================
    transmission: {
        // [Reverse, Neutral, 1st, 2nd, 3rd, 4th, 5th]
        gears: [-3.48, 0, 3.48, 2.02, 1.39, 1.00, 0.72],
        finalDrive: 4.10,
        shiftTime: 0.18          // seconds (faster shifting)
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 1.6,   // Peak friction coefficient (better tires)
        slipAnglePeak: 0.14,    // Radians - angle at peak grip
        rollingResistance: 0.004
    },

    // ==================== AERODYNAMICS ====================
    aero: {
        downforce: 0.35         // Downforce coefficient (better aero package)
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.55,         // Radians (~31 degrees - tighter steering)
        speed: 3.5              // Steering responsiveness (quicker response)
    },

    // ==================== VISUAL CONFIGURATION ====================
    // RX-7 FD3S has pop-up headlights and distinctive round taillights
    lights: {
        headlightPos: [
            { x: -0.55, y: 0.69, z: 1.7 },   // Pop-up lights are higher and more centered
            { x: 0.55, y: 0.69, z: 1.7}
        ],
        taillightPos: [
            { x: -0.55, y: 0.69, z: -1.8 },  // Round taillights are wider and lower
            { x: 0.55, y: 0.69, z: -1.8 }
        ]
    },

    // Visual offset (mesh origin to physics center)
    // NOTE: These values may need adjustment once the 3D model is imported
    visualOffset: {
        x: 0.0,                 // Adjust based on model alignment
        y: -3.0                 // Adjust based on model alignment
    }
};
