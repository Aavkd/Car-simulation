import { TerrainGenerator } from './terrain.js';
import { DunesGenerator } from './dunes.js';
import { HighwayGenerator } from './highway.js';
import { CityGenerator } from './city.js';
import { EverestGenerator } from './everest.js';

/**
 * Level Manager
 * Factory class for instantiating terrain generators based on level configuration
 */
export class LevelManager {
    constructor() {
        this.currentLevel = null;
        this.currentTerrain = null;
    }

    /**
     * Load a level based on configuration
     * @param {Object} config - Level configuration from LevelData
     * @returns {TerrainGenerator} Terrain generator implementing PhysicsProvider interface
     */
    loadLevel(config) {
        console.log(`[LevelManager] Loading level: ${config.name} (type: ${config.type})`);

        switch (config.type) {
            case 'procedural':
            default:
                // Use the standard procedural terrain generator
                this.currentTerrain = new TerrainGenerator(config.params);
                break;

            case 'dunes':
                this.currentTerrain = new DunesGenerator(config.params);
                break;

            case 'highway':
                this.currentTerrain = new HighwayGenerator(config.params);
                break;

            case 'city':
                this.currentTerrain = new CityGenerator(config.params);
                break;

            case 'everest':
                this.currentTerrain = new EverestGenerator(config.params);
                break;
        }

        this.currentLevel = config;
        return this.currentTerrain;
    }

    /**
     * Get the current terrain's physics provider
     * @returns {TerrainGenerator|null}
     */
    getPhysicsProvider() {
        return this.currentTerrain;
    }

    /**
     * Get current level config
     * @returns {Object|null}
     */
    getCurrentLevel() {
        return this.currentLevel;
    }

    /**
     * Unload current level and clean up
     */
    unloadLevel() {
        if (this.currentTerrain && this.currentTerrain.mesh) {
            // Dispose geometry and material
            if (this.currentTerrain.mesh.geometry) {
                this.currentTerrain.mesh.geometry.dispose();
            }
            if (this.currentTerrain.mesh.material) {
                this.currentTerrain.mesh.material.dispose();
            }
        }
        this.currentTerrain = null;
        this.currentLevel = null;
    }
}
