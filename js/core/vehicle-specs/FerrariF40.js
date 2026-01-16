/**
 * Ferrari F40 - Vehicle Specification
 * 
 * Real-world physical properties adapted for game scale (S=4.5).
 */

export const FerrariF40 = {
    // ==================== IDENTITY ====================
    name: "Ferrari F40",

    // ==================== REAL WORLD PHYSICS (metric) ====================
    mass: 1250,                 // kg (slightly heavier than curb for game stability)
    dragCoefficient: 0.34,      // Cd
    frontalArea: 1.95,          // m²
    // modelScale: 1.0,         // Physics container scale (1.0 = standard)
    importScale: 400.0,         // Scale applied ONLY to the imported mesh children (fixes microscopic import)

    // ==================== DIMENSIONS (Game Units - 4.5x scale) ====================
    dimensions: {
        wheelRadius: 1.35,      // Standard game wheel radius
        trackWidth: 7.8,        // Wide track
        wheelBase: 11.0,        // ~2.45m * 4.5
        cgHeight: 2.2,          // Very low center of gravity
        width: 8.9,             // Wide body (1.98m * 4.5)
        height: 5.1,            // Low profile (1.13m * 4.5)
        length: 19.9            // (4.43m * 4.5)
    },

    // ==================== SUSPENSION ====================
    suspension: {
        restLength: 1.3,        // Lower stance
        travel: 0.9,            // Stiff, less travel
        stiffness: 45000,       // Very stiff race suspension
        damping: 4500           // High damping
    },

    // ==================== ENGINE ====================
    // 2.9L Twin-Turbo V8
    engine: {
        idleRPM: 1100,
        redlineRPM: 7800,
        maxTorque: 577,         // Nm - Updates physics engine to use this raw value
        // Turbo lag simulation in power curve: weak low end, massive spike
        powerCurve: [0.3, 0.5, 0.85, 1.0, 0.95]
    },

    // ==================== TRANSMISSION ====================
    transmission: {
        // 5-speed manual
        gears: [-3.0, 0, 2.9, 1.9, 1.4, 1.1, 0.9],
        finalDrive: 3.8,
        shiftTime: 0.15         // Fast shifting
    },

    // ==================== TIRES ====================
    tires: {
        gripCoefficient: 1.85,  // High grip slick-like tires
        slipAnglePeak: 0.10,    // Peaky grip (snappy at limit)
        pacejkaB: 12,           // Stiffer response
        pacejkaC: 1.5,
        pacejkaE: -0.8,
        rollingResistance: 0.006
    },

    // ==================== DRIFT / HANDLING ====================
    drift: {
        gripMultiplier: 0.30,   // Slippery when drifting
        angleThreshold: 0.08,
        recoveryRate: 2.0       // Snappy recovery
    },

    // ==================== STEERING ====================
    steering: {
        maxAngle: 0.55,         // Sharper, smaller steering lock
        speed: 5.0,             // Very responsive
        counterSteerBoost: 1.5,
        highSpeedLimit: 0.5
    },

    // ==================== VISUAL CONFIGURATION ====================
    lights: {
        // Pop-up headlights + Fog lights
        headlightPos: [
            { x: -2.5, y: 2.0, z: 9.0 },
            { x: 2.5, y: 2.0, z: 9.0 }
        ],
        taillightPos: [
            { x: -2.2, y: 2.8, z: -9.8 },
            { x: 2.2, y: 2.8, z: -9.8 }
        ]
    },

    exhaust: {
        positions: [
            { x: 0, y: -1.3, z: -8 }  // Central triple exhaust
        ]
    },

    visualOffset: {
        x: 0,
        y: -2.4                 // Adjust based on model pivot
    },

    // ==================== CAMERA CONFIGURATION ====================
    camera: {
        cockpit: {
            distance: -0.4,     // Closer to windshield for supercar feel
            height: 3.7,        // Driver eye level
            seatOffsetX: 1.3,  // Left-Hand Drive (Negative X)
            fov: 90,            // Wider FOV for speed sensation
            showModel: true     // Keep car body visible (dashboard/hood)
        }
    }
};
