/**
 * 1965 Ford Mustang Convertible - Vehicle Specification
 * 
 * Real-world physical properties adapted for game scale (S=4.5).
 */

export const Mustang1965 = {
    // ==================== IDENTITY ====================
    name: "1965 Mustang",

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 1350,                 // kg
    dragCoefficient: 0.45,      // Cd (Boxier than modern cars)
    frontalArea: 2.1,           // m²
    // modelScale: 1.0,         // Physics container scale (1.0 = standard)
    importScale: 0.2,           // Scale applied ONLY to the imported mesh children (adjust if model is tiny/huge)

    // ==================== DIMENSIONS (Game Units - 4.5x scale) ====================
    dimensions: {
        wheelRadius: 1.35,      // Standard game wheel radius
        trackWidth: 7.0,        // Narrower than supercar ( ~1.5m * 4.5)
        wheelBase: 12.0,        // (2.74m * 4.5)
        cgHeight: 2.5,          // Higher center of gravity
        width: 7.8,             // (1.73m * 4.5)
        height: 5.8,            // (1.3m * 4.5)
        length: 20.7            // (4.61m * 4.5)
    },

    // ==================== SUSPENSION ====================
    suspension: {
        restLength: 1.4,        // Classic ride height
        travel: 1.2,            // More travel, softer
        stiffness: 28000,       // Softer classic suspension
        damping: 2500           // Bouncy classic feel
    },

    // ==================== ENGINE ====================
    // 289ci HiPo V8 (K-Code)
    engine: {
        idleRPM: 800,
        redlineRPM: 6000,
        maxTorque: 423,         // Nm ~312 lb-ft
        // Classic OHV V8 power curve: strong low/mid, falls off top
        powerCurve: [0.4, 0.7, 0.9, 0.95, 0.8]
    },

    // ==================== TRANSMISSION ====================
    transmission: {
        // 4-speed manual (Toploader)
        gears: [-2.8, 0, 2.78, 1.93, 1.36, 1.0],
        finalDrive: 3.50,
        shiftTime: 0.35         // Slower classic shifting
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 1.2,   // Classic bias-ply style grip (lower than slicks)
        slipAnglePeak: 0.12,    // Slides earlier
        pacejkaB: 8,           // Softer response
        pacejkaC: 1.3,
        pacejkaE: -0.2,
        rollingResistance: 0.015
    },

    // ==================== DRIFT / HANDLING ====================
    drift: {
        gripMultiplier: 0.45,   // Drifts easily but loosely
        angleThreshold: 0.05,
        recoveryRate: 1.0       // Boat-like recovery
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.65,         // Good steering angle
        speed: 3.0,             // Slower steering rack
        counterSteerBoost: 1.2,
        highSpeedLimit: 0.6
    },

    // ==================== VISUAL CONFIGURATION ====================
    lights: {
        // Classic round headlights
        headlightPos: [
            { x: -2.8, y: 2.5, z: 9.5 },
            { x: 2.8, y: 2.5, z: 9.5 }
        ],
        taillightPos: [
            { x: -2.3, y: 2.6, z: -8.2 },
            { x: 2.3, y: 2.6, z: -8.2 }
        ]
    },

    exhaust: {
        positions: [
            { x: -2.0, y: -1.0, z: -8.0 },
            { x: 2.0, y: -1.0, z: -8.0 }
        ]
    },

    visualOffset: {
        x: 0,
        y: -2.5                 // Adjust based on model pivot
    },

    // ==================== CAMERA CONFIGURATION ====================
    camera: {
        cockpit: {
            distance: 0.2,
            height: 3.8,
            seatOffsetX: 1.5,   // LHD
            fov: 85,
            showModel: true
        }
    }
};
