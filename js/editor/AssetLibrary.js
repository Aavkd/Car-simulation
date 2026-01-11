import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * AssetLibrary - Manages available assets for the level editor
 * Provides asset catalog, loading, and caching functionality
 */
export class AssetLibrary {
    constructor() {
        this.loader = new GLTFLoader();

        // Cache loaded models
        this.modelCache = new Map();

        // Asset catalog - will be populated from assets/objects folder
        this.assets = [];

        // Callbacks
        this.onAssetsLoaded = null;
    }

    /**
     * Initialize the asset library with available assets
     */
    async initialize() {
        // Define available assets from assets/objects folder
        // In a real implementation, this could be dynamically discovered
        this.assets = [
            {
                id: 'venus_apple',
                name: 'Venus Apple',
                path: 'assets/objects/100.db.11_venus_apple_thorvaldsen.glb',
                category: 'statue',
                icon: '🍎'
            },
            {
                id: 'ancient_ruins',
                name: 'Ancient Ruins',
                path: 'assets/objects/ancient_ruins_modular.glb',
                category: 'structure',
                icon: '🏛️'
            },
            {
                id: 'ancient_temple',
                name: 'Ancient Temple',
                path: 'assets/objects/ancient_temple.glb',
                category: 'structure',
                icon: '⛩️'
            },
            {
                id: 'castle',
                name: 'Fantastic Castle',
                path: 'assets/objects/fantastic_castle.glb',
                category: 'structure',
                icon: '🏰'
            },
            {
                id: 'kickelhahn_tower',
                name: 'Kickelhahn Tower',
                path: 'assets/objects/kickelhahn_tower.glb',
                category: 'structure',
                icon: '🗼'
            },
            {
                id: 'watchtower',
                name: 'Ruin Watchtower',
                path: 'assets/objects/ruin_watchtower.glb',
                category: 'structure',
                icon: '🏗️'
            },
            {
                id: 'ruins_hill',
                name: 'Ruins on Hill',
                path: 'assets/objects/ruins_on_the_top_of_a_hill.glb',
                category: 'structure',
                icon: '⛰️'
            },
            {
                id: 'discobolus',
                name: 'Discobolus',
                path: 'assets/objects/the_discobolus_of_myron.glb',
                category: 'statue',
                icon: '🏛️'
            },
            {
                id: 'venus_de_milo',
                name: 'Venus de Milo',
                path: 'assets/objects/venus_de_milo.glb',
                category: 'statue',
                icon: '🗿'
            },
            // === Cosmic / Procedural Assets ===
            {
                id: 'blackhole',
                name: 'Black Hole',
                path: null,  // Procedural - no GLB path
                category: 'cosmic',
                icon: '🕳️',
                procedural: true,
                generator: 'BlackHole',
                options: {
                    colorInner: '#ffc880',
                    colorOuter: '#ff5050',
                    rotationSpeed: 1.0,
                    distortion: 0.1,
                    diskRadius: 4.0,
                    isPulsar: false
                }
            },
            {
                id: 'pulsar',
                name: 'Pulsar',
                path: null,
                category: 'cosmic',
                icon: '✴️',
                procedural: true,
                generator: 'BlackHole',
                options: {
                    colorInner: '#88ccff',
                    colorOuter: '#ff44ff',
                    rotationSpeed: 2.0,
                    distortion: 0.15,
                    diskRadius: 3.5,
                    isPulsar: true
                }
            },
            // === Vehicles ===
            {
                id: 'ae86',
                name: 'Toyota AE86',
                path: 'assets/models/Toyota AE86.glb',
                category: 'vehicles',
                icon: '🚗',
                type: 'car',
                specId: 'ae86'
            },
            {
                id: 'rx7',
                name: 'Mazda RX-7',
                path: 'assets/models/Mazda RX-7.glb',
                category: 'vehicles',
                icon: '🏎️',
                type: 'car',
                specId: 'rx7',
                scale: 4.5
            },
            {
                id: 'cobra',
                name: 'Shelby Cobra 427',
                path: 'assets/models/1966_shelby_cobra_427.glb',
                category: 'vehicles',
                icon: '🐍',
                type: 'car',
                specId: 'cobra',
                scale: 4.5
            },
            {
                id: 'f16',
                name: 'F-16 Jet',
                path: 'assets/models/silver_surfer.glb',
                category: 'vehicles',
                icon: '✈️',
                type: 'plane',
                scale: 2.0
            }
        ];

        console.log(`[AssetLibrary] Initialized with ${this.assets.length} assets`);

        if (this.onAssetsLoaded) {
            this.onAssetsLoaded(this.assets);
        }

        return this.assets;
    }

    /**
     * Get all available assets
     * @returns {Array}
     */
    getAssets() {
        return this.assets;
    }

    /**
     * Get assets by category
     * @param {string} category 
     * @returns {Array}
     */
    getAssetsByCategory(category) {
        return this.assets.filter(a => a.category === category);
    }

    /**
     * Get all categories
     * @returns {Array<string>}
     */
    getCategories() {
        return [...new Set(this.assets.map(a => a.category))];
    }

    /**
     * Get a specific asset by id
     * @param {string} id 
     * @returns {Object|undefined}
     */
    getAssetById(id) {
        return this.assets.find(a => a.id === id);
    }

    /**
     * Load and cache a model
     * @param {string} path 
     * @returns {Promise<THREE.Group>}
     */
    async loadModel(path) {
        // Check cache first
        if (this.modelCache.has(path)) {
            return this.modelCache.get(path).scene.clone();
        }

        // Load model
        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => {
                    // Cache the original
                    this.modelCache.set(path, gltf);
                    // Return a clone
                    resolve(gltf.scene.clone());
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Preload all assets
     * @param {function} onProgress - Called with (loaded, total)
     */
    async preloadAll(onProgress) {
        const total = this.assets.length;
        let loaded = 0;

        for (const asset of this.assets) {
            // Skip procedural assets - they don't have a path to load
            if (asset.procedural || !asset.path) {
                continue;
            }
            try {
                await this.loadModel(asset.path);
                loaded++;
                if (onProgress) {
                    onProgress(loaded, total);
                }
            } catch (error) {
                console.warn(`[AssetLibrary] Failed to preload ${asset.name}:`, error);
                loaded++;
            }
        }

        console.log(`[AssetLibrary] Preloaded ${loaded}/${total} assets`);
    }

    /**
     * Clear the model cache
     */
    clearCache() {
        this.modelCache.clear();
    }
}
