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
