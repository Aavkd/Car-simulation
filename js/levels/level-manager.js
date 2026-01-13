import { TerrainGenerator } from '../terrain/terrain.js';
import { DunesGenerator } from '../terrain/dunes.js';
import { HighwayGenerator } from '../terrain/highway.js';
import { CityGenerator } from '../terrain/city.js';
import { EverestGenerator } from '../terrain/everest.js';
import { VaporwaveGenerator } from '../terrain/vaporwave.js';
import { CosmicGenerator } from '../terrain/cosmic.js';
import { DeepSpaceGenerator } from '../terrain/deep-space.js';
import { IceMountainGenerator } from '../terrain/ice-mountain.js';
import { LongDriveGenerator } from '../terrain/long-drive.js';
import { SpaceGroundGenerator } from '../terrain/space-ground.js';

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

            case 'vaporwave':
                this.currentTerrain = new VaporwaveGenerator(config.params);
                break;

            case 'cosmic':
                this.currentTerrain = new CosmicGenerator(config.params);
                break;

            case 'deepspace':
                this.currentTerrain = new DeepSpaceGenerator(config.params);
                break;

            case 'icemountain':
                this.currentTerrain = new IceMountainGenerator(config.params);
                break;

            case 'longdrive':
                this.currentTerrain = new LongDriveGenerator(config.params);
                break;

            case 'spaceground':
                this.currentTerrain = new SpaceGroundGenerator(config.params);
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
