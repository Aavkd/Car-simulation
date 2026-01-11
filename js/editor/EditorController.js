import * as THREE from 'three';
import { FlyControls } from './FlyControls.js';
import { SceneObjectManager } from './SceneObjectManager.js';
import { AssetLibrary } from './AssetLibrary.js';
import { LevelSerializer } from './LevelSerializer.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

/**
 * EditorController - Main orchestration for the level and game editor
 * Coordinates all editor subsystems and provides the UI
 */
export class EditorController {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.camera = game.camera;
        this.renderer = game.renderer;

        // Editor subsystems
        this.flyControls = null;
        this.objectManager = null;
        this.assetLibrary = null;
        this.serializer = null;

        // lil-gui for game parameters
        this.gui = null;
        this.guiParams = {};

        // Current level data
        this.currentLevel = null;
        this.levelConfig = null; // Base level config (from menu selection)

        // UI elements
        this.editorPanel = null;
        this.assetSidebar = null;
        this.toolbar = null;

        // State
        this.enabled = false;
        this.autosaveInterval = null;
    }

    /**
     * Initialize the editor with a base level
     * @param {Object} levelConfig - Base level configuration
     */
    async initialize(levelConfig) {
        this.levelConfig = levelConfig;

        // Initialize subsystems
        this.flyControls = new FlyControls(this.camera, this.renderer.domElement);
        this.objectManager = new SceneObjectManager(
            this.scene,
            this.camera,
            this.renderer,
            this.game.terrain
        );
        this.assetLibrary = new AssetLibrary();
        this.serializer = new LevelSerializer();

        // Initialize asset library
        await this.assetLibrary.initialize();

        // Create initial level data
        this.currentLevel = this.serializer.createLevelData({
            name: `Custom ${levelConfig.name}`,
            baseType: levelConfig.type,
            seed: levelConfig.params?.seed || Math.floor(Math.random() * 10000),
            heightScale: levelConfig.params?.heightScale || 50
        });

        // Setup UI
        this._createEditorUI();
        this._createGameParameterPanel();

        // Setup callbacks
        this.objectManager.onDraggingChanged = (isDragging) => {
            // Disable fly controls while transforming objects
            if (isDragging) {
                this.flyControls.enabled = false;
            } else {
                this.flyControls.enabled = true;
            }
        };

        console.log('[EditorController] Initialized');
    }

    /**
     * Enable editor mode
     */
    enable() {
        if (this.enabled) return;
        this.enabled = true;

        // Position camera for editing
        const startPos = new THREE.Vector3(0, 50, 100);
        if (this.game.terrain && this.game.terrain.getSpawnPosition) {
            const spawn = this.game.terrain.getSpawnPosition();
            startPos.set(spawn.x, spawn.y + 50, spawn.z + 100);
        }
        this.flyControls.setPosition(startPos);
        this.flyControls.lookAt(new THREE.Vector3(startPos.x, 0, startPos.z - 100));

        // Enable subsystems
        this.flyControls.enable();
        this.objectManager.enable();

        // Show UI
        if (this.editorPanel) {
            this.editorPanel.classList.remove('hidden');
        }
        if (this.gui) {
            this.gui.domElement.style.display = '';
        }

        // Start autosave
        this.autosaveInterval = setInterval(() => {
            this._autosave();
        }, 30000); // Every 30 seconds

        console.log('[EditorController] Enabled');
    }

    /**
     * Disable editor mode
     */
    disable() {
        if (!this.enabled) return;
        this.enabled = false;

        // Disable subsystems
        this.flyControls.disable();
        this.objectManager.disable();

        // Hide UI
        if (this.editorPanel) {
            this.editorPanel.classList.add('hidden');
        }
        if (this.gui) {
            this.gui.domElement.style.display = 'none';
        }

        // Stop autosave
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
            this.autosaveInterval = null;
        }

        console.log('[EditorController] Disabled');
    }

    /**
     * Update editor (call each frame)
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        if (!this.enabled) return;
        this.flyControls.update(deltaTime);

        // Update procedural objects (e.g., black holes)
        this.objectManager.update(deltaTime);
    }

    /**
     * Save the current level
     */
    saveLevel() {
        // Update objects data
        this.currentLevel.objects = this.objectManager.getObjectsData();

        // Save to storage
        if (this.serializer.saveLevel(this.currentLevel)) {
            this._showNotification('Level saved!', 'success');
        } else {
            this._showNotification('Failed to save level', 'error');
        }
    }

    /**
     * Load a saved level
     * @param {string} levelId 
     */
    async loadLevel(levelId) {
        const levelData = this.serializer.loadLevel(levelId);
        if (!levelData) {
            this._showNotification('Failed to load level', 'error');
            return;
        }

        this.currentLevel = levelData;

        // Load objects
        await this.objectManager.loadObjects(levelData.objects || []);

        // Apply environment settings
        if (levelData.environment) {
            this._applyEnvironmentSettings(levelData.environment);
        }

        this._showNotification(`Loaded: ${levelData.meta.name}`, 'success');
    }

    /**
     * Export current level to file
     */
    exportLevel() {
        this.currentLevel.objects = this.objectManager.getObjectsData();
        this.serializer.exportToFile(this.currentLevel);
        this._showNotification('Level exported!', 'success');
    }

    /**
     * Import level from file
     */
    async importLevel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const levelData = await this.serializer.importFromFile(file);
                this.currentLevel = levelData;
                await this.objectManager.loadObjects(levelData.objects || []);
                this._showNotification(`Imported: ${levelData.meta.name}`, 'success');
            } catch (error) {
                console.error('[EditorController] Import failed:', error);
                this._showNotification('Failed to import level', 'error');
            }
        };
        input.click();
    }

    /**
     * Clear the current level
     */
    clearLevel() {
        if (confirm('Clear all objects? This cannot be undone.')) {
            this.objectManager.clearAllObjects();
            this.currentLevel.objects = [];
            this._showNotification('Level cleared', 'info');
        }
    }

    /**
     * Enter play test mode
     */
    playTest() {
        // Save camera state
        this.savedCameraState = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone()
        };

        // Notify game to switch state
        if (this.game.enterPlayTestMode) {
            this.game.enterPlayTestMode();
        }
    }

    /**
     * Return to editor from play test
     */
    returnToEditor() {
        // Restore camera state
        if (this.savedCameraState) {
            this.camera.position.copy(this.savedCameraState.position);
            this.camera.quaternion.copy(this.savedCameraState.quaternion);

            // Sync FlyControls
            // FlyControls uses the camera directly, so just restoring camera is enough
            this.flyControls.setPosition(this.savedCameraState.position);
            this.flyControls.lookAt(new THREE.Vector3(0, 0, -1).applyQuaternion(this.savedCameraState.quaternion).add(this.savedCameraState.position));
        }

        this.enable();
    }

    /**
     * Exit editor mode
     */
    exit() {
        // Autosave before exit
        this._autosave();
        this.disable();

        // Return to menu
        if (this.game._enterMenuState) {
            this.game._enterMenuState();
        }
    }

    // === Private Methods ===

    _createEditorUI() {
        // Remove existing panel if any
        const existing = document.getElementById('editor-panel');
        if (existing) existing.remove();

        // Create editor panel
        this.editorPanel = document.createElement('div');
        this.editorPanel.id = 'editor-panel';
        this.editorPanel.className = 'editor-panel hidden';
        this.editorPanel.innerHTML = `
            <div class="editor-toolbar">
                <div class="toolbar-section">
                    <button id="editor-play-btn" class="editor-btn success" title="Play Test">
                        ▶️ Play
                    </button>
                    <button id="editor-save-btn" class="editor-btn primary" title="Save Level">
                        💾 Save
                    </button>
                    <button id="editor-load-btn" class="editor-btn" title="Load Level">
                        📂 Load
                    </button>
                    <button id="editor-export-btn" class="editor-btn" title="Export JSON">
                        📤 Export
                    </button>
                    <button id="editor-import-btn" class="editor-btn" title="Import JSON">
                        📥 Import
                    </button>
                </div>
                <div class="toolbar-section transform-tools">
                    <span class="toolbar-label">Transform:</span>
                    <button id="transform-translate" class="editor-btn transform-btn active" title="Move (W)">
                        ↔️ Move
                    </button>
                    <button id="transform-rotate" class="editor-btn transform-btn" title="Rotate (E)">
                        🔄 Rotate
                    </button>
                    <button id="transform-scale" class="editor-btn transform-btn" title="Scale (R)">
                        📐 Scale
                    </button>
                </div>
                <div class="toolbar-section">
                    <span class="level-name" id="editor-level-name">${this.currentLevel.meta.name}</span>
                </div>
                <div class="toolbar-section">
                    <button id="editor-clear-btn" class="editor-btn warning" title="Clear Level">
                        🗑️ Clear
                    </button>
                    <button id="editor-exit-btn" class="editor-btn danger" title="Exit Editor">
                        ✕ Exit
                    </button>
                </div>
            </div>
            <div class="editor-sidebar" id="editor-sidebar">
                <div class="sidebar-header">
                    <h3>📦 Assets</h3>
                </div>
                <div class="asset-list" id="asset-list">
                    <!-- Assets populated by JS -->
                </div>
            </div>
            <div class="object-properties hidden" id="object-properties">
                <div class="properties-header">
                    <h4>📝 Object Properties</h4>
                </div>
                <div class="properties-content">
                    <div class="property-group">
                        <label>Scale</label>
                        <div class="scale-controls">
                            <input type="range" id="scale-slider" min="0.1" max="10" step="0.1" value="1">
                            <input type="number" id="scale-input" min="0.1" max="10" step="0.1" value="1">
                        </div>
                    </div>
                    <div class="property-group">
                        <label>Position Y</label>
                        <input type="number" id="position-y-input" step="1" value="0">
                    </div>
                    <div class="property-actions">
                        <button id="snap-ground-btn" class="editor-btn">📍 Snap to Ground</button>
                        <button id="duplicate-btn" class="editor-btn">📋 Duplicate</button>
                        <button id="delete-btn" class="editor-btn danger">🗑️ Delete</button>
                    </div>
                    <div class="procedural-properties hidden" id="procedural-properties">
                        <div class="property-group">
                            <label>🕳️ Black Hole Properties</label>
                        </div>
                        <div class="property-group">
                            <label>Inner Color</label>
                            <input type="color" id="bh-color-inner" value="#ffc880">
                        </div>
                        <div class="property-group">
                            <label>Outer Color</label>
                            <input type="color" id="bh-color-outer" value="#ff5050">
                        </div>
                        <div class="property-group">
                            <label>Rotation Speed</label>
                            <input type="range" id="bh-rotation-speed" min="0.1" max="5" step="0.1" value="1">
                        </div>
                        <div class="property-group">
                            <label>Distortion</label>
                            <input type="range" id="bh-distortion" min="0" max="1" step="0.01" value="0.1">
                        </div>
                        <div class="property-group">
                            <label>Disk Radius</label>
                            <input type="range" id="bh-disk-radius" min="2" max="10" step="0.1" value="4">
                        </div>
                        <div class="property-group">
                            <label>Pulsar Jets</label>
                            <input type="checkbox" id="bh-pulsar">
                        </div>
                    </div>
                </div>
            </div>
            <div class="editor-help">
                <div class="help-item">🖱️ Right-drag to look</div>
                <div class="help-item">WASD to move</div>
                <div class="help-item">SHIFT for speed</div>
                <div class="help-item">Click asset to place</div>
                <div class="help-item">Click object to select</div>
                <div class="help-item">W/E/R transform modes</div>
                <div class="help-item">DEL to delete</div>
                <div class="help-item">G snap to ground</div>
            </div>
        `;

        document.body.appendChild(this.editorPanel);

        // Populate asset list
        this._populateAssetList();

        // Bind toolbar events
        document.getElementById('editor-play-btn').onclick = () => this.playTest();
        document.getElementById('editor-save-btn').onclick = () => this.saveLevel();
        document.getElementById('editor-load-btn').onclick = () => this._showLoadDialog();
        document.getElementById('editor-export-btn').onclick = () => this.exportLevel();
        document.getElementById('editor-import-btn').onclick = () => this.importLevel();
        document.getElementById('editor-clear-btn').onclick = () => this.clearLevel();
        document.getElementById('editor-exit-btn').onclick = () => this.exit();

        // Transform mode buttons
        document.getElementById('transform-translate').onclick = () => this._setTransformMode('translate');
        document.getElementById('transform-rotate').onclick = () => this._setTransformMode('rotate');
        document.getElementById('transform-scale').onclick = () => this._setTransformMode('scale');

        // Object properties panel events
        document.getElementById('scale-slider').oninput = (e) => this._updateSelectedScale(parseFloat(e.target.value));
        document.getElementById('scale-input').onchange = (e) => this._updateSelectedScale(parseFloat(e.target.value));
        document.getElementById('position-y-input').onchange = (e) => this._updateSelectedPositionY(parseFloat(e.target.value));
        document.getElementById('snap-ground-btn').onclick = () => this.objectManager.snapToGround();
        document.getElementById('duplicate-btn').onclick = () => this.objectManager.duplicateSelected();
        document.getElementById('delete-btn').onclick = () => {
            if (this.objectManager.selectedObject) {
                this.objectManager.removeObject(this.objectManager.selectedObject);
            }
        };

        // Procedural (Black Hole) properties event bindings
        document.getElementById('bh-color-inner').oninput = (e) => this._updateBlackHoleProperty('colorInner', e.target.value);
        document.getElementById('bh-color-outer').oninput = (e) => this._updateBlackHoleProperty('colorOuter', e.target.value);
        document.getElementById('bh-rotation-speed').oninput = (e) => this._updateBlackHoleProperty('rotationSpeed', parseFloat(e.target.value));
        document.getElementById('bh-distortion').oninput = (e) => this._updateBlackHoleProperty('distortion', parseFloat(e.target.value));
        document.getElementById('bh-disk-radius').oninput = (e) => this._updateBlackHoleProperty('diskRadius', parseFloat(e.target.value));
        document.getElementById('bh-pulsar').onchange = (e) => this._updateBlackHoleProperty('isPulsar', e.target.checked);

        // Listen for selection changes to show/hide properties panel
        this.objectManager.onSelectionChanged = (object) => this._onSelectionChanged(object);
    }

    _setTransformMode(mode) {
        this.objectManager.setTransformMode(mode);

        // Update button states
        document.querySelectorAll('.transform-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`transform-${mode}`).classList.add('active');
    }

    _onSelectionChanged(object) {
        const propsPanel = document.getElementById('object-properties');
        const proceduralProps = document.getElementById('procedural-properties');
        if (!propsPanel) return;

        if (object) {
            propsPanel.classList.remove('hidden');

            // Update scale UI
            const scale = object.scale.x; // Assuming uniform scale
            document.getElementById('scale-slider').value = scale;
            document.getElementById('scale-input').value = scale.toFixed(1);

            // Update position Y
            document.getElementById('position-y-input').value = object.position.y.toFixed(1);

            // Handle procedural object properties
            if (object.userData.procedural && object.userData.proceduralInstance && proceduralProps) {
                proceduralProps.classList.remove('hidden');
                const instance = object.userData.proceduralInstance;
                const config = instance.getConfig();

                // Populate black hole controls with current values
                document.getElementById('bh-color-inner').value = this._colorToHex(config.colorInner);
                document.getElementById('bh-color-outer').value = this._colorToHex(config.colorOuter);
                document.getElementById('bh-rotation-speed').value = config.rotationSpeed;
                document.getElementById('bh-distortion').value = config.distortion;
                document.getElementById('bh-disk-radius').value = config.diskRadius;
                document.getElementById('bh-pulsar').checked = config.isPulsar;
            } else if (proceduralProps) {
                proceduralProps.classList.add('hidden');
            }
        } else {
            propsPanel.classList.add('hidden');
            if (proceduralProps) proceduralProps.classList.add('hidden');
        }
    }

    _updateBlackHoleProperty(property, value) {
        const object = this.objectManager.selectedObject;
        if (!object || !object.userData.proceduralInstance) return;

        const instance = object.userData.proceduralInstance;
        switch (property) {
            case 'colorInner':
                instance.setColorInner(value);
                break;
            case 'colorOuter':
                instance.setColorOuter(value);
                break;
            case 'rotationSpeed':
                instance.setRotationSpeed(value);
                break;
            case 'distortion':
                instance.setDistortion(value);
                break;
            case 'diskRadius':
                instance.setDiskRadius(value);
                break;
            case 'isPulsar':
                instance.setPulsar(value);
                break;
        }

        // Mark object as modified
        object.userData.modified = true;
    }

    _colorToHex(color) {
        // Convert color to hex string for input[type=color]
        if (typeof color === 'string' && color.startsWith('#')) {
            return color;
        }
        if (typeof color === 'number') {
            return '#' + color.toString(16).padStart(6, '0');
        }
        // Default fallback
        return '#ffffff';
    }

    _updateSelectedScale(scale) {
        const object = this.objectManager.selectedObject;
        if (!object) return;

        object.scale.setScalar(scale);

        // Sync both inputs
        document.getElementById('scale-slider').value = scale;
        document.getElementById('scale-input').value = scale.toFixed(1);
    }

    _updateSelectedPositionY(y) {
        const object = this.objectManager.selectedObject;
        if (!object) return;

        object.position.y = y;
    }

    _populateAssetList() {
        const assetList = document.getElementById('asset-list');
        if (!assetList) return;

        const categories = this.assetLibrary.getCategories();

        let html = '';
        for (const category of categories) {
            const assets = this.assetLibrary.getAssetsByCategory(category);
            html += `
                <div class="asset-category">
                    <div class="category-title">${category.toUpperCase()}</div>
                    <div class="category-items">
                        ${assets.map(asset => `
                            <div class="asset-item" data-asset-id="${asset.id}" title="${asset.name}">
                                <span class="asset-icon">${asset.icon}</span>
                                <span class="asset-name">${asset.name}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        assetList.innerHTML = html;

        // Bind asset click events
        assetList.querySelectorAll('.asset-item').forEach(item => {
            item.onclick = () => {
                const assetId = item.dataset.assetId;
                const asset = this.assetLibrary.getAssetById(assetId);
                if (asset) {
                    this.objectManager.enterPlacementMode(asset);
                    // Highlight selected asset
                    assetList.querySelectorAll('.asset-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                }
            };
        });
    }

    _createGameParameterPanel() {
        // Create lil-gui panel for game parameters
        this.gui = new GUI({ title: '🎮 Game Parameters' });
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.top = '80px';
        this.gui.domElement.style.right = '20px';
        this.gui.domElement.style.zIndex = '300';

        // Physics folder
        const physicsFolder = this.gui.addFolder('Physics');
        this.guiParams.gravity = 1.0;
        this.guiParams.friction = 1.0;
        this.guiParams.airResistance = 0.01;

        physicsFolder.add(this.guiParams, 'gravity', 0.1, 3, 0.1)
            .name('Gravity')
            .onChange(v => this._applyPhysicsChange('gravity', v));
        physicsFolder.add(this.guiParams, 'friction', 0.1, 2, 0.1)
            .name('Friction')
            .onChange(v => this._applyPhysicsChange('friction', v));
        physicsFolder.add(this.guiParams, 'airResistance', 0, 0.1, 0.001)
            .name('Air Resistance')
            .onChange(v => this._applyPhysicsChange('airResistance', v));

        // Environment folder
        const envFolder = this.gui.addFolder('Environment');
        this.guiParams.timeOfDay = 0.5;
        this.guiParams.fogDensity = 0.0005;

        envFolder.add(this.guiParams, 'timeOfDay', 0, 1, 0.01)
            .name('Time of Day')
            .onChange(v => {
                if (this.game.sky && this.game.sky.setTime) {
                    this.game.sky.setTime(v);
                }
            });
        envFolder.add(this.guiParams, 'fogDensity', 0, 0.005, 0.0001)
            .name('Fog Density')
            .onChange(v => {
                if (this.game.scene.fog) {
                    this.game.scene.fog.density = v;
                }
            });

        // Car folder (if car exists)
        if (this.game.car) {
            const carFolder = this.gui.addFolder('Car');
            this.guiParams.suspensionStiffness = 30;
            this.guiParams.suspensionDamping = 4;
            this.guiParams.enginePower = 1.0;

            carFolder.add(this.guiParams, 'suspensionStiffness', 10, 100, 1)
                .name('Suspension Stiff')
                .onChange(v => this._applyCarChange('suspensionStiffness', v));
            carFolder.add(this.guiParams, 'suspensionDamping', 1, 20, 0.5)
                .name('Suspension Damp')
                .onChange(v => this._applyCarChange('suspensionDamping', v));
            carFolder.add(this.guiParams, 'enginePower', 0.5, 3, 0.1)
                .name('Engine Power')
                .onChange(v => this._applyCarChange('enginePower', v));
        }

        // Terrain folder
        const terrainFolder = this.gui.addFolder('Terrain');
        const terrainParams = this.currentLevel.environment.parameters || {};

        // Ensure defaults exist if not in level data
        this.guiParams.terrain = {
            heightScale: terrainParams.heightScale !== undefined ? terrainParams.heightScale : 1.0,
            seed: terrainParams.seed !== undefined ? terrainParams.seed : 42,
            noiseScale: terrainParams.noiseScale !== undefined ? terrainParams.noiseScale : 0.002,
            hillScale: terrainParams.hillScale !== undefined ? terrainParams.hillScale : 0.006,
            detailScale: terrainParams.detailScale !== undefined ? terrainParams.detailScale : 0.015,
            microScale: terrainParams.microScale !== undefined ? terrainParams.microScale : 0.04,
            maxHeight: terrainParams.maxHeight !== undefined ? terrainParams.maxHeight : 50,
            baseHeight: terrainParams.baseHeight !== undefined ? terrainParams.baseHeight : 0,
        };

        const updateTerrain = () => {
            // Debounce regeneration to avoid lag
            if (this._terrainUpdateTimer) clearTimeout(this._terrainUpdateTimer);
            this._terrainUpdateTimer = setTimeout(() => {
                this._regenerateTerrain(this.guiParams.terrain);
            }, 100);
        };

        terrainFolder.add(this.guiParams.terrain, 'heightScale', 0.1, 5.0, 0.1).name('global Height Scale').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'seed', 0, 10000, 1).name('Seed').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'noiseScale', 0.0001, 0.01, 0.0001).name('Base Noise Scale').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'hillScale', 0.001, 0.05, 0.001).name('Hill Scale').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'detailScale', 0.005, 0.1, 0.001).name('Detail Scale').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'microScale', 0.01, 0.2, 0.001).name('Micro Scale').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'maxHeight', 10, 500, 5).name('Max Height').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'baseHeight', -100, 100, 5).name('Base Height').onChange(updateTerrain);

        // Close folders by default
        physicsFolder.close();
        envFolder.close();
        terrainFolder.close();
    }

    _applyPhysicsChange(param, value) {
        // Store in level data
        this.currentLevel.physics = this.currentLevel.physics || {};
        this.currentLevel.physics[param] = value;

        // Apply to game (if physics engine supports hot-reload)
        if (this.game.car && this.game.car.physicsEngine) {
            const engine = this.game.car.physicsEngine;
            if (param === 'gravity') {
                engine.gravity = value * 9.81 * 4.5; // Base gravity calculation
            }
        }
    }

    _applyCarChange(param, value) {
        if (!this.game.car) return;

        // Apply to car physics
        const car = this.game.car;
        if (param === 'suspensionStiffness' && car.physicsEngine) {
            car.physicsEngine.suspensionStiffness = value;
        } else if (param === 'suspensionDamping' && car.physicsEngine) {
            car.physicsEngine.suspensionDamping = value;
        } else if (param === 'enginePower') {
            // Would need to modify car spec
        }
    }

    _regenerateTerrain(params) {
        if (!this.game.terrain) return;

        console.log('[Editor] Regenerating terrain with params:', params);

        // Update level data
        this.currentLevel.environment.parameters = { ...this.currentLevel.environment.parameters, ...params };
        if (params.seed) this.currentLevel.environment.seed = params.seed;

        // Check if terrain supports dynamic update
        if (this.game.terrain.updateParams && this.game.terrain.generate) {
            // 1. Dispose old mesh
            if (this.game.terrain.mesh) {
                this.game.scene.remove(this.game.terrain.mesh);
                if (this.game.terrain.dispose) {
                    this.game.terrain.dispose();
                } else if (this.game.terrain.mesh.geometry) {
                    // Fallback disposal
                    this.game.terrain.mesh.geometry.dispose();
                    this.game.terrain.mesh.material.dispose();
                }
            }

            // 2. Update parameters
            this.game.terrain.updateParams(params);

            // 3. Generate new mesh
            const newMesh = this.game.terrain.generate();
            this.game.scene.add(newMesh);

            // 4. Update Physics Provider connections if needed
            // The terrain object itself is the provider, so references held by Car/Plane should still work 
            // IF they call getHeightAt() on the terrain object.
            // However, visually we need the new mesh.

            this.game.terrain.mesh = newMesh; // Ensure reference consistency if needed
        } else {
            console.warn('[Editor] Current terrain generator does not support dynamic regeneration');
        }
    }

    _applyEnvironmentSettings(env) {
        if (env.timeOfDay !== undefined && this.game.sky) {
            this.game.sky.setTime(env.timeOfDay);
            this.guiParams.timeOfDay = env.timeOfDay;
        }
        if (env.fogDensity !== undefined && this.game.scene.fog) {
            this.game.scene.fog.density = env.fogDensity;
            this.guiParams.fogDensity = env.fogDensity;
        }
    }

    _showLoadDialog() {
        const levels = this.serializer.getAllLevels();
        if (levels.length === 0) {
            this._showNotification('No saved levels found', 'info');
            return;
        }

        // Create simple dialog
        const dialog = document.createElement('div');
        dialog.className = 'editor-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Load Level</h3>
                <div class="level-list">
                    ${levels.map(l => `
                        <div class="level-item" data-level-id="${l.id}">
                            <span class="level-title">${l.meta?.name || 'Untitled'}</span>
                            <span class="level-date">${new Date(l.savedAt).toLocaleDateString()}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="dialog-buttons">
                    <button class="editor-btn" id="dialog-cancel">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Bind events
        dialog.querySelectorAll('.level-item').forEach(item => {
            item.onclick = () => {
                this.loadLevel(item.dataset.levelId);
                dialog.remove();
            };
        });

        document.getElementById('dialog-cancel').onclick = () => dialog.remove();
    }

    _showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `editor-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    _autosave() {
        if (!this.enabled || !this.currentLevel) return;

        this.currentLevel.objects = this.objectManager.getObjectsData();
        this.serializer.saveCurrentLevel(this.currentLevel);
        console.log('[EditorController] Autosaved');
    }

    /**
     * Dispose of editor resources
     */
    dispose() {
        this.disable();

        if (this.flyControls) this.flyControls.dispose();
        if (this.objectManager) this.objectManager.dispose();
        if (this.gui) this.gui.destroy();
        if (this.editorPanel) this.editorPanel.remove();

        console.log('[EditorController] Disposed');
    }
}
