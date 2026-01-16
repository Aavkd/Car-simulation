import * as THREE from 'three';

/**
 * Physics Provider Interface
 * 
 * All terrain/level types must implement this interface for CarPhysics to function.
 * This abstraction allows different terrain generators (procedural, mesh-based, etc.)
 * to provide physics collision data without modifying the car physics code.
 * 
 * @typedef {Object} PhysicsProvider
 * @property {function(number, number): number} getHeightAt - Get Y position at world (x, z)
 * @property {function(number, number): THREE.Vector3} getNormalAt - Get surface normal at (x, z)
 * @property {function(number, number): SurfaceProperties} getSurfaceType - Get friction/drag presets
 */

/**
 * Surface type definitions with physics presets
 * @typedef {Object} SurfaceProperties
 * @property {string} type - Surface type name
 * @property {number} friction - Grip coefficient multiplier (1.0 = normal)
 * @property {number} drag - Rolling resistance multiplier (1.0 = normal)
 */

export const SurfaceTypes = {
    GRASS: {
        type: 'grass',
        friction: 0.9,
        drag: 1.2
    },
    TARMAC: {
        type: 'tarmac',
        friction: 1.0,
        drag: 0.8
    },
    SAND: {
        type: 'sand',
        friction: 0.6,
        drag: 2.0
    },
    DIRT: {
        type: 'dirt',
        friction: 0.7,
        drag: 1.5
    },
    SNOW: {
        type: 'snow',
        friction: 0.4,
        drag: 1.8
    },
    GRAVEL: {
        type: 'gravel',
        friction: 0.65,
        drag: 1.6
    },
    CONCRETE: {
        type: 'concrete',
        friction: 0.95,
        drag: 0.9
    },
    ICE_FRICTIONLESS: {
        type: 'ice_frictionless',
        friction: 0.01,  // Near-zero friction for sliding
        drag: 0.1        // Minimal air drag
    }
};

/**
 * Base Physics Provider class
 * Extend this class for custom terrain types
 */
export class BasePhysicsProvider {
    /**
     * Get terrain height at world position
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {number} Height (Y position) at the given coordinates
     */
    getHeightAt(worldX, worldZ) {
        throw new Error('getHeightAt() must be implemented by subclass');
    }

    /**
     * Get terrain normal vector at world position
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {THREE.Vector3} Normalized surface normal vector
     */
    getNormalAt(worldX, worldZ) {
        throw new Error('getNormalAt() must be implemented by subclass');
    }

    /**
     * Get surface properties at world position
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {SurfaceProperties} Surface friction and drag properties
     */
    getSurfaceType(worldX, worldZ) {
        return SurfaceTypes.GRASS; // Default to grass
    }

    /**
     * Get gravity acceleration for this terrain
     * @returns {number} Gravity (m/s^2)
     */
    getGravity() {
        return 9.81;
    }
}
