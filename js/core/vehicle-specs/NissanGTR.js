/**
 * Nissan GT-R (R35) - Vehicle Specification
 * 
 * "Godzilla" - High tech, heavy, extremely fast.
 * Adapted for game scale (S=4.5).
 */

export const NissanGTR = {
    // ==================== IDENTITY ====================
    name: "Nissan GT-R",
    model: "assets/models/Nissan GTR.glb",
    importScale: 3,            // Scale factor for the 3D model

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 1740,                 // kg (Heavier than others)
    dragCoefficient: 0.27,      // Cd (Very aerodynamic)
    frontalArea: 2.09,          // m²

    // ==================== DIMENSIONS (Game Units - 4.5x scale) ====================
    dimensions: {
        wheelRadius: 1.45,      // ~20 inch wheels
        trackWidth: 7.2,        // Wide track
        wheelBase: 12.5,        // Long wheelbase
        cgHeight: 2.3,          // Low CG despite size
        width: 8.5,             // Wide body
        height: 6.1,            // Taller than supercars
        length: 21.0            // Long body
    },

    // ==================== SUSPENSION ====================
    suspension: {
        restLength: 1.4,
        travel: 1.0,
        stiffness: 55000,       // Very stiff, heavy car
        damping: 5500           // High damping for control
    },

    // ==================== ENGINE ====================
    // VR38DETT - 3.8L Twin Turbo V6
    engine: {
        idleRPM: 1000,
        redlineRPM: 7000,
        maxTorque: 632,         // High torque
        // Power curve: Strong everywhere, massive mid-range
        powerCurve: [0.5, 0.7, 0.9, 1.0, 0.95]
    },

    // ==================== TRANSMISSION ====================
    // 6-speed Dual Clutch
    transmission: {
        gears: [-3.0, 0, 4.05, 2.30, 1.59, 1.24, 1.0, 0.79], // 6 gears + R
        finalDrive: 3.7,
        shiftTime: 0.05         // Lightning fast DCT shifts
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 2.1,   // Massive mechanical grip (simulating AWD grip)
        slipAnglePeak: 0.12,    // Stable
        pacejkaB: 12,
        pacejkaC: 1.6,
        pacejkaE: -0.2,
        rollingResistance: 0.006
    },

    // ==================== AERO ====================
    aero: {
        downforce: 0.45         // High downforce
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.65,
        speed: 5.5,             // Very fast steering rack
        counterSteerBoost: 2.0, // Helpful for corrections
        highSpeedLimit: 0.6     // Good high speed authority
    },

    // ==================== VISUAL CONFIGURATION ====================
    lights: {
        headlightPos: [
            { x: -2.8, y: 1.8, z: 8.5 },   // Adjusted approximate positions
            { x: 2.8, y: 1.8, z: 8.5 }
        ],
        taillightPos: [
            // GT-R signature quad round lights
            { x: -1.9, y: 0.9, z: -8.4 },
            { x: -2.7, y: 1.0, z: -8.2 },
            { x: 1.9, y: 0.9, z: -8.4 },
            { x: 2.7, y: 1.0, z: -8.2 }
        ]
    },

    exhaust: {
        positions: [
            // Quad exhaust tips
            { x: -1.9, y: -1.0, z: -8.0 },
            { x: -2.7, y: -1.0, z: -8.0 },
            { x: 1.9, y: -1.0, z: -8.0 },
            { x: 2.7, y: -1.0, z: -8.0 }
        ]
    },

    visualOffset: {
        x: 0.0,
        y: 0.0                 // Adjust to sit on ground properly
    }
};
