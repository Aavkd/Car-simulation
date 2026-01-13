/**
 * Level Data Configuration
 * Defines presets for all available map types
 */

export const LevelData = {
    original: {
        id: 'original',
        name: 'Grasslands',
        description: 'Rolling green hills and vast plains',
        type: 'procedural',
        difficulty: 1,
        color: '#4ade80', // Green accent
        params: {
            seed: 42,
            heightScale: 1.2, // Slightly higher than default internal
            noiseScale: 0.002, // Base rolling terrain
            hillScale: 0.006,  // Medium hills
            detailScale: 0.015, // Fine detail
            microScale: 0.04,   // Texture
            baseHeight: 0,
            maxHeight: 60      // Higher peaks
        }
    },
    dunes: {
        id: 'dunes',
        name: 'Desert Dunes',
        description: 'Sandy dunes with challenging drift physics',
        type: 'dunes',
        difficulty: 2,
        color: '#fbbf24', // Amber accent
        params: {
            seed: 123,
            heightScale: 1.0,
            noiseScale: 0.003, // More frequent dunes
            hillScale: 0.01,   // Sharper dunes
            detailScale: 0.02, // Ripples
            microScale: 0.05,  // Sand grain
            baseHeight: 0,
            maxHeight: 40
        }
    },
    highway: {
        id: 'highway',
        name: 'Highway',
        description: 'High-speed tarmac roads for top speed runs',
        type: 'highway',
        difficulty: 1,
        color: '#60a5fa', // Blue accent
        params: {}
    },
    city: {
        id: 'city',
        name: 'City Streets',
        description: 'Urban grid with tight technical corners',
        type: 'city',
        difficulty: 3,
        color: '#f472b6', // Pink accent
        params: {}
    },
    everest: {
        id: 'everest',
        name: 'The Everest',
        description: 'Massive snow mountain - start at the summit!',
        type: 'everest',
        difficulty: 3,
        color: '#e0f2fe', // Light blue/white accent
        params: {
            seed: 8848,
            peakHeight: 800, // Kept for backward compatibility
            maxHeight: 800,
            baseHeight: 0,
            noiseScale: 0.003, // Ridge scale
            hillScale: 0.012,  // Detail scale
            detailScale: 0.025, // Snow scale
            heightScale: 1.0
        }
    },
    vaporwave: {
        id: 'vaporwave',
        name: 'Neon Horizon',
        description: 'Infinite psychedelic highway in the void',
        type: 'vaporwave',
        difficulty: 3,
        color: '#ff00ff', // Magenta accent
        params: {
            roadWidth: 160,
            segmentLength: 50000, // 50km track
            curveIntensity: 150,
            slopeIntensity: 40
        }
    },
    cosmic: {
        id: 'cosmic',
        name: 'Cosmic Infinite',
        description: 'Infinite chaotic road through the galaxy',
        type: 'cosmic',
        difficulty: 4,
        color: '#8b5cf6', // Violet accent
        params: {
            roadWidth: 30,
            segmentLength: 100000,
            curveIntensity: 200,
            slopeIntensity: 80
        }
    },
    deepspace: {
        id: 'deepspace',
        name: 'Deep Space',
        description: 'Infinite cosmic void with galaxies and nebulae. Best for flight.',
        type: 'deepspace',
        difficulty: 5,
        color: '#4c1d95', // Deep purple
        params: {
            universeSize: 50000,
            starCount: 30000,
            galaxyCount: 2000,
            nebulaCount: 2000
        }
    },
    icemountain: {
        id: 'icemountain',
        name: 'Infinite Descent',
        description: 'Frictionless ice slide down infinite mountain chains. No brakes!',
        type: 'icemountain',
        difficulty: 4,
        color: '#88ccff', // Light ice blue
        params: {
            seed: 54321,
            slopeAngle: 30,
            chunkSize: 500,
            visibleDistance: 3000
        }
    },
    longdrive: {
        id: 'longdrive',
        name: 'Drift Plains',
        description: 'Endless uneven plains designed for long drives and drifting.',
        type: 'longdrive',
        difficulty: 2,
        color: '#8B4513', // Saddle Brown
        params: {
            seed: 12345,
            chunkSize: 500,
            visibleDistance: 3000
        }
    },
    spaceground: {
        id: 'spaceground',
        name: 'Space Station',
        description: 'Flat ground with cosmic deep space view. Take off and explore the universe!',
        type: 'spaceground',
        difficulty: 3,
        color: '#1e3a5f', // Dark space blue
        params: {
            // Ground params (flat)
            seed: 1337,
            size: 10000,
            segments: 200,
            heightScale: 0.2,
            maxHeight: 5,
            baseHeight: 0,
            // Space environment params
            universeSize: 20000,
            starCount: 2000,
            galaxyCount: 2,
            nebulaCount: 2,
            thrustMultiplier: 100,
            gravityScale: 1000
        }
    }
};

/**
 * Get all available levels as an array
 * @returns {Array} Array of level config objects
 */
export function getAllLevels() {
    return Object.values(LevelData);
}

/**
 * Get a specific level by ID
 * @param {string} levelId 
 * @returns {Object|undefined} Level config or undefined
 */
export function getLevelById(levelId) {
    return LevelData[levelId];
}
