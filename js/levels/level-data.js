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
            heightScale: 50
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
            heightScale: 30
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
            seed: 8848,  // Mount Everest elevation in meters :)
            peakHeight: 800
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
