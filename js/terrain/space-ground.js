import * as THREE from 'three';
import { TerrainGenerator } from './terrain.js';
import { DeepSpaceGenerator } from './deep-space.js';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Space Ground Generator
 * 
 * Hybrid terrain that combines:
 * - Flat/low procedural ground for takeoff and landing
 * - Full deep space visuals (galaxies, nebulas, black holes, stars)
 * - Proper ground physics with optional space gravity attractors
 * - Atmosphere transition sky (blue -> space based on altitude)
 * 
 * Players can drive on the ground and fly out into infinite space.
 */
export class SpaceGroundGenerator extends TerrainGenerator {
    constructor(params = {}) {
        // Merge default flat ground params with user params
        const groundParams = Object.assign({
            // Default to very flat terrain
            seed: 1337,
            size: 4000000,         // Large ground area (10km x 10km)
            segments: 200,       // Lower segments for performance
            maxHeight: 5,        // Very low hills
            baseHeight: 0,
            heightScale: 0.2,    // Minimal height variation
            noiseScale: 0.001,   // Very smooth
            hillScale: 0.002,
            detailScale: 0.005,
            microScale: 0.01,
            waterLevel: -100,    // No water visible
            // Ground colors - space station theme
            colors: {
                grassLow: 0x2a3a4a,    // Dark metallic blue-grey
                grassHigh: 0x3a4a5a,   // Slightly lighter
                dirt: 0x1a2a3a,        // Dark base
                rock: 0x4a5a6a,        // Light grey
                snow: 0x5a6a7a,        // Lightest areas
                water: 0x0a1a2a
            }
        }, params);

        super(groundParams);

        // Space environment parameters with exclusion zone
        this.spaceParams = Object.assign({
            starCount: 2000,
            galaxyCount: 2,
            nebulaCount: 2,
            universeSize: 20000,
            blackHoleChance: 0.01,
            anomalyChance: 0.1,
            thrustMultiplier: 100,
            gravityScale: 1000,
            // Offset space objects upward so they don't intersect ground
            spaceOffset: 800000,  // Increased offset to push objects further up
            // Exclusion zone - minimum distance from origin where space objects can spawn
            exclusionRadius: 15000  // Keep attractors at least 15km from origin
        }, params);

        // Calculate minSpawnHeight to start space objects 20km above ground
        // Ground is at Y=0. Space coordinates are shifted by -spaceOffset.
        // We want objects only above 20,000m Real Altitude.
        // Virtual Altitude = 20000 - 800000 = -780000
        this.spaceParams.minSpawnHeight = 20000 - this.spaceParams.spaceOffset;

        // Internal deep space generator for visuals
        this.spaceEnvironment = new DeepSpaceGenerator(this.spaceParams);
        this.spaceGroup = null;

        // Combined mesh group
        this.combinedMesh = null;

        // Sky type flag - use atmosphere transition sky
        this.useAtmosphereTransition = true;
    }

    /**
     * Generate the terrain mesh along with space environment
     * @returns {THREE.Group}
     */
    generate() {
        // Create combined group
        this.combinedMesh = new THREE.Group();
        this.combinedMesh.name = 'SpaceGroundTerrain';

        // 1. Generate ground mesh using parent TerrainGenerator
        const groundMesh = super.generate();
        groundMesh.name = 'ground';
        this.combinedMesh.add(groundMesh);

        // 2. Create and position space environment
        // this.spaceEnvironment already initialized in constructor
        this.spaceGroup = this.spaceEnvironment.generate();
        this.spaceGroup.name = 'space';

        // Offset space objects slightly upward to be above ground plane
        this.spaceGroup.position.y = this.spaceParams.spaceOffset;

        this.combinedMesh.add(this.spaceGroup);

        // Store reference for physics queries
        this.mesh = this.combinedMesh;

        return this.combinedMesh;
    }

    /**
     * Update both ground and space environments
     * Called each frame with player position
     */
    update(playerPos, skySystem, deltaTime = 1 / 60) {
        // Update space environment (chunk loading, animations)
        if (this.spaceEnvironment && playerPos) {
            // Offset player position for space chunk calculations
            const spacePlayerPos = playerPos.clone();
            spacePlayerPos.y -= this.spaceParams.spaceOffset;
            this.spaceEnvironment.update(spacePlayerPos, skySystem, deltaTime);
        }
    }

    /**
     * Get terrain height at world position
     * Returns ground height if within ground bounds, otherwise returns space "floor"
     */
    getHeightAt(worldX, worldZ) {
        // Check if within ground bounds
        const halfSize = this.size / 2;
        if (Math.abs(worldX) <= halfSize && Math.abs(worldZ) <= halfSize) {
            return super.getHeightAt(worldX, worldZ);
        }
        // Outside ground - return a very low value (space)
        return -100000;
    }

    /**
     * Get terrain normal at world position
     */
    getNormalAt(worldX, worldZ) {
        const halfSize = this.size / 2;
        if (Math.abs(worldX) <= halfSize && Math.abs(worldZ) <= halfSize) {
            return super.getNormalAt(worldX, worldZ);
        }
        // In space - return up vector
        return new THREE.Vector3(0, 1, 0);
    }

    /**
     * Get surface type at world position
     */
    getSurfaceType(worldX, worldZ) {
        const halfSize = this.size / 2;
        if (Math.abs(worldX) <= halfSize && Math.abs(worldZ) <= halfSize) {
            // On the ground - return tarmac for good grip (spaceport landing pad)
            return SurfaceTypes.TARMAC;
        }
        // In space
        return SurfaceTypes.TARMAC;
    }

    /**
     * Get spawn position
     */
    getSpawnPosition() {
        // Spawn at center of ground, slightly above
        return new THREE.Vector3(0, 10, 0);
    }

    /**
     * Get gravity value
     * Returns normal gravity on ground, zero in space above threshold
     */
    getGravity() {
        // Return standard gravity - the plane will handle
        // gravitational attractors from space objects
        return 9.81;
    }

    /**
     * Get thrust multiplier for vehicles
     */
    getThrustMultiplier() {
        return this.spaceParams.thrustMultiplier;
    }

    /**
     * Get gravitational force from space objects
     * Delegates to space environment
     */
    getGravitationalForce(playerPos) {
        if (this.spaceEnvironment && playerPos) {
            // Adjust position for space offset
            const adjustedPos = playerPos.clone();
            adjustedPos.y -= this.spaceParams.spaceOffset;
            return this.spaceEnvironment.getGravitationalForce(adjustedPos);
        }
        return new THREE.Vector3(0, 0, 0);
    }

    /**
     * Get nearby gravity attractors for UI
     */
    getNearbyAttractors(playerPos) {
        if (this.spaceEnvironment && playerPos) {
            const adjustedPos = playerPos.clone();
            adjustedPos.y -= this.spaceParams.spaceOffset;
            return this.spaceEnvironment.getNearbyAttractors(adjustedPos);
        }
        return [];
    }

    /**
     * Check if this is a deep space terrain (for warp effect and sky selection)
     * @returns {boolean}
     */
    isDeepSpace() {
        return true;
    }

    /**
     * Check if this is a hybrid terrain (Space Station)
     * Used for physics transitions
     */
    isHybrid() {
        return true;
    }

    /**
     * Update terrain parameters for ground
     * Properly handles the combined mesh structure
     * @param {Object} params - New parameters
     */
    updateParams(params) {
        // Call parent to update noise and height properties
        super.updateParams(params);

        // Also update local config values for heightScale (used in getHeightAt)
        if (params.heightScale !== undefined) {
            this.heightScale = params.heightScale;
        }
        if (params.noiseScale !== undefined) {
            this.noiseScale = params.noiseScale;
        }
        if (params.hillScale !== undefined) {
            this.hillScale = params.hillScale;
        }
        if (params.detailScale !== undefined) {
            this.detailScale = params.detailScale;
        }
        if (params.maxHeight !== undefined) {
            this.maxHeight = params.maxHeight;
        }
        if (params.baseHeight !== undefined) {
            this.baseHeight = params.baseHeight;
        }
    }

    /**
     * Regenerate only the ground mesh (preserves space objects)
     * Call this after updateParams to refresh visuals while keeping space intact
     */
    regenerateGround() {
        if (!this.combinedMesh) return;

        // Find and remove old ground mesh
        const oldGround = this.combinedMesh.getObjectByName('ground');
        if (oldGround) {
            this.combinedMesh.remove(oldGround);
            if (oldGround.geometry) oldGround.geometry.dispose();
            if (oldGround.material) {
                if (Array.isArray(oldGround.material)) {
                    oldGround.material.forEach(m => m.dispose());
                } else {
                    oldGround.material.dispose();
                }
            }
        }

        // Generate new ground mesh using parent
        const newGround = super.generate();
        newGround.name = 'ground';
        this.combinedMesh.add(newGround);

        return this.combinedMesh;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Dispose ground
        super.dispose();

        // Dispose space environment
        if (this.spaceEnvironment) {
            // The space generator may not have a formal dispose, 
            // but we clear references
            this.spaceEnvironment.mesh = null;
            this.spaceEnvironment.objects = [];
            this.spaceEnvironment.chunks.clear();
        }

        this.combinedMesh = null;
        this.spaceGroup = null;
    }
}
