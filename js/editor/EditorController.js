import * as THREE from 'three';
import { FlyControls } from './FlyControls.js';
import { SceneObjectManager } from './SceneObjectManager.js';
import { AssetLibrary } from './AssetLibrary.js';
import { LevelSerializer } from './LevelSerializer.js';
import { RPGEditorController } from './RPGEditorController.js';
import { SkyAtmosphereTransition } from '../environment/sky-atmosphere-transition.js';
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
        this.rpgEditor = null;

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
        this.rpgEditor = new RPGEditorController(this);

        // Initialize asset library
        await this.assetLibrary.initialize();

        // Determine skyType based on level type
        let skyType = 'standard';
        if (levelConfig.type === 'spaceground') {
            skyType = 'spaceground';
        } else if (levelConfig.type === 'deepspace') {
            skyType = 'deepspace';
        } else if (levelConfig.type === 'vaporwave' || levelConfig.type === 'cosmic') {
            skyType = 'vaporwave';
        }

        // Create initial level data
        this.currentLevel = this.serializer.createLevelData({
            name: `Custom ${levelConfig.name}`,
            baseType: levelConfig.type,
            skyType: skyType,
            seed: levelConfig.params?.seed || Math.floor(Math.random() * 10000),
            heightScale: levelConfig.params?.heightScale || 50
        });

        // Setup sky system for special level types
        if (levelConfig.type === 'spaceground') {
            this._setupSpacegroundSky();
        }

        // Setup UI
        this._createEditorUI();
        this._createGameParameterPanel();

        // Initialize RPG Editor (needs GUI from parameter panel)
        if (this.gui) {
            this.rpgEditor.initialize(this.gui);
        }

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
        this._captureCurrentState();

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

        await this._applyLevelData(levelData);
    }

    /**
     * Export current level to file
     */
    exportLevel() {
        this._captureCurrentState();
        this.serializer.exportToFile(this.currentLevel);
        this._showNotification('Level exported!', 'success');
    }

    /**
     * Capture all runtime state into currentLevel object
     */
    _captureCurrentState() {
        // 1. Objects
        this.currentLevel.objects = this.objectManager.getObjectsData();

        // 2. Physics
        // (Already updated via GUI callbacks, but good to ensure)
        // this.currentLevel.physics is updated in _applyPhysicsChange

        // 3. Terrain
        // (Already updated in _regenerateTerrain)

        // 4. Sky Settings
        if (this.game.sky) {
            const sky = this.game.sky;
            this.currentLevel.environment.sky = {
                type: sky.constructor.name,
                settings: {}
            };

            if (sky.constructor.name === 'SkySystem') {
                this.currentLevel.environment.sky.settings = {
                    day: { ...sky.settings.day },
                    sunset: { ...sky.settings.sunset },
                    night: { ...sky.settings.night },
                    lights: { ...sky.settings.lights },
                    durations: { ...sky.settings.durations }
                };
                if (sky.starfield) {
                    this.currentLevel.environment.sky.settings.starfield = { ...sky.starfield.settings };
                }
            } else if (sky.constructor.name === 'SkyDeepSpace') {
                this.currentLevel.environment.sky.settings = { ...sky.settings };
            }
        }

        // 5. RPG Data (Custom Items/Quests)
        if (this.rpgEditor) {
            this.currentLevel.rpgData = this.rpgEditor.getCustomData();
        }
    }

    _restoreRPGData(rpgData) {
        if (!rpgData) return;

        // Restore custom items to local storage so they are available
        if (rpgData.items) {
            const current = JSON.parse(localStorage.getItem('ae86_custom_items') || '{}');
            const merged = { ...current, ...rpgData.items };
            localStorage.setItem('ae86_custom_items', JSON.stringify(merged));
        }

        // Restore custom quests
        if (rpgData.quests) {
            const current = JSON.parse(localStorage.getItem('ae86_custom_quests') || '[]');
            // Merge arrays avoiding duplicates by ID
            const merged = [...current];
            rpgData.quests.forEach(q => {
                if (!merged.find(existing => existing.id === q.id)) {
                    merged.push(q);
                }
            });
            localStorage.setItem('ae86_custom_quests', JSON.stringify(merged));
        }

        // Refresh RPG editor UI
        if (this.rpgEditor && this.rpgEditor.refreshItemSpawner) {
            this.rpgEditor.refreshItemSpawner();
        }
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
                await this._applyLevelData(levelData);
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
                            <input type="range" id="scale-slider" min="0.001" max="10" step="0.001" value="1">
                            <input type="number" id="scale-input" step="any" value="1">
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
        this.objectManager.onSelectionChanged = (object) => {
            this._onSelectionChanged(object);
            this.rpgEditor.onObjectSelected(object);
        };
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
            document.getElementById('scale-input').value = scale.toFixed(4);

            // Update position Y
            document.getElementById('position-y-input').value = object.position.y.toFixed(4);

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
        const physics = this.currentLevel.physics || {};

        this.guiParams.gravity = physics.gravity !== undefined ? physics.gravity : 1.0;
        this.guiParams.friction = physics.friction !== undefined ? physics.friction : 1.0;
        this.guiParams.airResistance = physics.airResistance !== undefined ? physics.airResistance : 0.01;

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
        const env = this.currentLevel.environment || {};

        this.guiParams.timeOfDay = env.timeOfDay !== undefined ? env.timeOfDay : 0.5;
        this.guiParams.fogDensity = env.fogDensity !== undefined ? env.fogDensity : 0.0005;

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

        // Post Processing Folder
        const ppFolder = this.gui.addFolder('Post Processing');

        // Bloom
        if (this.game.bloomPass) {
            const bloomFolder = ppFolder.addFolder('Bloom');
            bloomFolder.add(this.game.bloomPass, 'threshold', 0, 1).name('Threshold');
            bloomFolder.add(this.game.bloomPass, 'strength', 0, 3).name('Strength');
            bloomFolder.add(this.game.bloomPass, 'radius', 0, 1).name('Radius');
        }

        // Retro (Pixel)
        if (this.game.retroPass) {
            const retroFolder = ppFolder.addFolder('Retro (Pixel) Filter');
            retroFolder.add(this.game.retroPass.uniforms['pixelSize'], 'value', 1.0, 32.0, 1.0).name('Pixel Size');
            retroFolder.add(this.game.retroPass.uniforms['colorDepth'], 'value', 2.0, 256.0, 1.0).name('Color Depth');
            retroFolder.add(this.game.retroPass.uniforms['contrast'], 'value', 0.5, 2.0, 0.1).name('Contrast');
            retroFolder.add(this.game.retroPass.uniforms['saturation'], 'value', 0.0, 2.0, 0.1).name('Saturation');
            retroFolder.add(this.game.retroPass.uniforms['scanlineIntensity'], 'value', 0.0, 1.0, 0.01).name('Scanline Intensity');
            retroFolder.add(this.game.retroPass.uniforms['scanlineCount'], 'value', 0.1, 10.0, 0.1).name('Scanline Density');

            // New Controls
            retroFolder.add(this.game.retroPass.uniforms['noiseIntensity'], 'value', 0.0, 1.0, 0.01).name('Noise');
            retroFolder.add(this.game.retroPass.uniforms['vignetteStength'], 'value', 0.0, 1.0, 0.01).name('Vignette Radius');
            retroFolder.add(this.game.retroPass.uniforms['vignetteIntensity'], 'value', 0.0, 1.0, 0.01).name('Vignette Darkness');
            retroFolder.add(this.game.retroPass.uniforms['aberration'], 'value', 0.0, 10.0, 0.1).name('Chromatic Aberration');
            retroFolder.add(this.game.retroPass.uniforms['brightness'], 'value', -0.5, 0.5, 0.01).name('Brightness');
            retroFolder.add(this.game.retroPass.uniforms['exposure'], 'value', 0.0, 3.0, 0.1).name('Exposure');
        }

        // ASCII
        if (this.game.asciiPass) {
            const asciiFolder = ppFolder.addFolder('ASCII Filter');
            const uniforms = this.game.asciiPass.uniforms;

            asciiFolder.add(uniforms['fontCharCount'], 'value', 5, 40, 1).name('Char Count');
            asciiFolder.add(uniforms['zoom'], 'value', 0.1, 4.0, 0.1).name('Zoom');
            asciiFolder.add(uniforms['colorChar'], 'value').name('Colorize Chars');
            asciiFolder.add(uniforms['invert'], 'value').name('Invert');

            // Color helpers
            const bindColor = (folder, obj, name) => {
                const proxy = { color: '#' + obj.value.getHexString() };
                folder.addColor(proxy, 'color').name(name).onChange(v => {
                    obj.value.set(v);
                });
            };
            bindColor(asciiFolder, uniforms['fillColor'], 'Fill Color');
            bindColor(asciiFolder, uniforms['backgroundColor'], 'Background Color');
        }

        // Halftone
        if (this.game.halftonePass) {
            const htFolder = ppFolder.addFolder('Halftone Filter');
            htFolder.add(this.game.halftonePass.uniforms['dotSize'], 'value', 0.1, 5.0).name('Dot Size');
            htFolder.add(this.game.halftonePass.uniforms['angle'], 'value', 0, 360).name('Angle');
            htFolder.add(this.game.halftonePass.uniforms['scale'], 'value', 0.1, 5.0).name('Scale');
        }
        if (this.game.sky && this.game.sky.settings) {
            const sky = this.game.sky;
            const skyFolder = envFolder.addFolder('Sky Customization');

            // Helper to bind color property (handles hex conversion)
            const bindColor = (folder, obj, key, name) => {
                const proxy = { color: '#' + obj[key].toString(16).padStart(6, '0') };
                folder.addColor(proxy, 'color').name(name).onChange(v => {
                    if (typeof v === 'string') {
                        obj[key] = parseInt(v.replace('#', ''), 16);
                    } else {
                        obj[key] = v; // Should not happen with addColor but just in case
                    }
                    if (sky.updateSettings) sky.updateSettings();
                });
            };

            if (sky.constructor.name === 'SkySystem') {
                // Day
                const dayFolder = skyFolder.addFolder('Day Colors');
                bindColor(dayFolder, sky.settings.day, 'top', 'Top');
                bindColor(dayFolder, sky.settings.day, 'horizon', 'Horizon');
                bindColor(dayFolder, sky.settings.day, 'bottom', 'Bottom');
                bindColor(dayFolder, sky.settings.day, 'sunGlow', 'Sun Glow');

                // Sunset
                const sunsetFolder = skyFolder.addFolder('Sunset Colors');
                bindColor(sunsetFolder, sky.settings.sunset, 'top', 'Top');
                bindColor(sunsetFolder, sky.settings.sunset, 'horizon', 'Horizon');
                bindColor(sunsetFolder, sky.settings.sunset, 'bottom', 'Bottom');
                bindColor(sunsetFolder, sky.settings.sunset, 'sunGlow', 'Sun Glow');

                // Night
                const nightFolder = skyFolder.addFolder('Night Colors');
                bindColor(nightFolder, sky.settings.night, 'top', 'Top');
                bindColor(nightFolder, sky.settings.night, 'horizon', 'Horizon');
                bindColor(nightFolder, sky.settings.night, 'bottom', 'Bottom');
                bindColor(nightFolder, sky.settings.night, 'sunGlow', 'Sun Glow');

                // Lights
                const lightFolder = skyFolder.addFolder('Light & Atmosphere');
                lightFolder.add(sky.settings.lights, 'sunIntensity', 0, 5).name('Sun Intensity');
                lightFolder.add(sky.settings.lights, 'moonIntensity', 0, 2).name('Moon Intensity');
                lightFolder.add(sky.settings.lights, 'ambientIntensity', 0, 2).name('Ambient Light');
                lightFolder.add(sky.settings.lights, 'hemiIntensity', 0, 2).name('Hemisphere Light');

                // Phase Durations
                const durationFolder = skyFolder.addFolder('Phase Durations (Multipliers)');
                durationFolder.add(sky.settings.durations, 'day', 0.1, 10).name('Day Duration');
                durationFolder.add(sky.settings.durations, 'sunset', 0.1, 10).name('Sunset Duration');
                durationFolder.add(sky.settings.durations, 'night', 0.1, 10).name('Night Duration');

                // Stars
                if (sky.starfield) {
                    const starFolder = skyFolder.addFolder('Starfield');
                    starFolder.add(sky.starfield.settings, 'sizeScale', 0.1, 5).name('Star Size');
                    starFolder.add(sky.starfield.settings, 'brightness', 0, 5).name('Brightness');
                    starFolder.add(sky.starfield.settings, 'milkyWayOpacity', 0, 1).name('Milky Way Opacity');
                }

            } else if (sky.constructor.name === 'SkyDeepSpace') {
                bindColor(skyFolder, sky.settings, 'topColor', 'Top Color');
                bindColor(skyFolder, sky.settings, 'bottomColor', 'Bottom Color');
                bindColor(skyFolder, sky.settings, 'sunColor', 'Sun Color');

                skyFolder.add(sky.settings, 'sunIntensity', 0, 5).name('Sun Intensity').onChange(() => sky.updateSettings());
                skyFolder.add(sky.settings, 'ambientIntensity', 0, 2).name('Ambient Light').onChange(() => sky.updateSettings());
            }

            // Wind Controls
            if (this.game.wind) {
                const windFolder = envFolder.addFolder('Wind & Fog');
                const wind = this.game.wind;

                windFolder.add(wind, 'enabled').name('Enabled').onChange(v => wind.configure({ enabled: v }));

                windFolder.add(wind, 'windSpeed', 0, 200).name('Wind Speed').onChange(v => wind.configure({ windSpeed: v }));
                windFolder.add(wind, 'fogOpacity', 0, 1).name('Opacity').onChange(v => wind.configure({ fogOpacity: v }));

                windFolder.add(wind, 'wispCount', 10, 200, 1).name('Cloud Count').onFinishChange(v => {
                    wind.configure({ wispCount: v });
                });

                windFolder.add(wind, 'spawnRadius', 100, 2000, 50).name('Spread Radius').onFinishChange(v => {
                    wind.configure({ spawnRadius: v });
                });

                windFolder.add(wind, 'maxHeight', 50, 500, 10).name('Max Height').onFinishChange(v => {
                    wind.configure({ maxHeight: v });
                });

                if (wind.fogColor) { // check existence
                    const windColorProxy = { color: '#' + wind.fogColor.getHexString() };
                    windFolder.addColor(windColorProxy, 'color').name('Fog Color').onChange(v => {
                        wind.configure({ fogColor: v });
                    });
                }
            }
        }

        // Car folder (if car exists)
        if (this.game.car) {
            const carFolder = this.gui.addFolder('Car');
            const physics = this.currentLevel.physics || {};

            this.guiParams.suspensionStiffness = physics.suspensionStiffness !== undefined ? physics.suspensionStiffness : 30;
            this.guiParams.suspensionDamping = physics.suspensionDamping !== undefined ? physics.suspensionDamping : 4;
            this.guiParams.enginePower = physics.enginePower !== undefined ? physics.enginePower : 1.0;

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

            // New Shape Params
            baseNoiseHeight: terrainParams.baseNoiseHeight !== undefined ? terrainParams.baseNoiseHeight : 10,
            hillNoiseHeight: terrainParams.hillNoiseHeight !== undefined ? terrainParams.hillNoiseHeight : 6,
            detailNoiseHeight: terrainParams.detailNoiseHeight !== undefined ? terrainParams.detailNoiseHeight : 2,

            // Water
            waterLevel: terrainParams.waterLevel !== undefined ? terrainParams.waterLevel : -100,

            // Colors
            colorGrassLow: terrainParams.colors?.grassLow !== undefined ? terrainParams.colors.grassLow : '#3d5c3d',
            colorGrassHigh: terrainParams.colors?.grassHigh !== undefined ? terrainParams.colors.grassHigh : '#5a7d4a',
            colorDirt: terrainParams.colors?.dirt !== undefined ? terrainParams.colors.dirt : '#6b5344',
            colorRock: terrainParams.colors?.rock !== undefined ? terrainParams.colors.rock : '#7a7a7a',
            colorSnow: terrainParams.colors?.snow !== undefined ? terrainParams.colors.snow : '#e8e8e8',
            colorWater: terrainParams.colors?.water !== undefined ? terrainParams.colors.water : '#1a6985',
        };

        const updateTerrain = () => {
            // Debounce regeneration to avoid lag
            if (this._terrainUpdateTimer) clearTimeout(this._terrainUpdateTimer);
            this._terrainUpdateTimer = setTimeout(() => {
                // Reconstruct colors object
                const params = { ...this.guiParams.terrain };
                params.colors = {
                    grassLow: params.colorGrassLow,
                    grassHigh: params.colorGrassHigh,
                    dirt: params.colorDirt,
                    rock: params.colorRock,
                    snow: params.colorSnow,
                    water: params.colorWater
                };

                // Remove flattened color keys from params passed to generator
                delete params.colorGrassLow;
                delete params.colorGrassHigh;
                delete params.colorDirt;
                delete params.colorRock;
                delete params.colorSnow;
                delete params.colorWater;

                this._regenerateTerrain(params);
            }, 100);
        };

        // General
        terrainFolder.add(this.guiParams.terrain, 'seed', 0, 10000, 1).name('Seed').onChange(updateTerrain);
        terrainFolder.add(this.guiParams.terrain, 'heightScale', 0.1, 5.0, 0.1).name('global Height Scale').onChange(updateTerrain);

        // Shape / Noise
        const shapeFolder = terrainFolder.addFolder('Shape Details');
        shapeFolder.add(this.guiParams.terrain, 'noiseScale', 0.0001, 0.01, 0.0001).name('Base Breakdown').onChange(updateTerrain);
        shapeFolder.add(this.guiParams.terrain, 'baseNoiseHeight', 0, 50, 0.5).name('Base Amplitude').onChange(updateTerrain);

        shapeFolder.add(this.guiParams.terrain, 'hillScale', 0.001, 0.05, 0.001).name('Hill Breakdown').onChange(updateTerrain);
        shapeFolder.add(this.guiParams.terrain, 'hillNoiseHeight', 0, 30, 0.5).name('Hill Amplitude').onChange(updateTerrain);

        shapeFolder.add(this.guiParams.terrain, 'detailScale', 0.005, 0.1, 0.001).name('Detail Breakdown').onChange(updateTerrain);
        shapeFolder.add(this.guiParams.terrain, 'detailNoiseHeight', 0, 10, 0.1).name('Detail Amplitude').onChange(updateTerrain);

        shapeFolder.add(this.guiParams.terrain, 'microScale', 0.01, 0.2, 0.001).name('Micro Texture').onChange(updateTerrain);
        shapeFolder.add(this.guiParams.terrain, 'maxHeight', 10, 500, 5).name('Mnt Max Height').onChange(updateTerrain);
        shapeFolder.add(this.guiParams.terrain, 'baseHeight', -100, 100, 5).name('Base Height').onChange(updateTerrain);

        // Water
        const waterFolder = terrainFolder.addFolder('Water');
        waterFolder.add(this.guiParams.terrain, 'waterLevel', -100, 50, 1).name('Water Level').onChange(updateTerrain);
        waterFolder.addColor(this.guiParams.terrain, 'colorWater').name('Water Color').onChange(updateTerrain);

        // Colors
        const colorFolder = terrainFolder.addFolder('Terrain Colors');
        colorFolder.addColor(this.guiParams.terrain, 'colorDirt').name('Dirt (Low)').onChange(updateTerrain);
        colorFolder.addColor(this.guiParams.terrain, 'colorGrassLow').name('Grass Dk (Low)').onChange(updateTerrain);
        colorFolder.addColor(this.guiParams.terrain, 'colorGrassHigh').name('Grass Lt (Mid)').onChange(updateTerrain);
        colorFolder.addColor(this.guiParams.terrain, 'colorRock').name('Rock (High)').onChange(updateTerrain);
        colorFolder.addColor(this.guiParams.terrain, 'colorSnow').name('Snow (Peak)').onChange(updateTerrain);

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
        if (this.game.terrain.updateParams) {
            // Update parameters first
            this.game.terrain.updateParams(params);

            // Special handling for SpaceGroundGenerator - only regenerate ground mesh
            if (this.game.terrain.regenerateGround) {
                console.log('[Editor] Using regenerateGround for SpaceGroundGenerator');

                // regenerateGround handles its own mesh disposal/creation
                this.game.terrain.regenerateGround();

                // The mesh reference stays the same (combinedMesh), just ground child is replaced
            } else if (this.game.terrain.generate) {
                // Standard terrain - dispose and regenerate
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

                // Generate new mesh
                const newMesh = this.game.terrain.generate();
                this.game.scene.add(newMesh);

                // Update Physics Provider connections if needed
                // The terrain object itself is the provider, so references held by Car/Plane should still work 
                // IF they call getHeightAt() on the terrain object.
                // However, visually we need the new mesh.

                this.game.terrain.mesh = newMesh; // Ensure reference consistency if needed
            }
        } else {
            console.warn('[Editor] Current terrain generator does not support dynamic regeneration');
        }
    }

    /**
     * Setup sky system for spaceground (Space Station) levels
     * Creates SkyAtmosphereTransition with proper fog/camera settings
     */
    _setupSpacegroundSky() {
        console.log('[EditorController] Setting up spaceground sky with atmosphere transition...');

        // Clean up existing sky
        if (this.game.sky) {
            if (this.game.sky.skyDome) this.scene.remove(this.game.sky.skyDome);
            if (this.game.sky.sun) this.scene.remove(this.game.sky.sun);
            if (this.game.sky.moon) this.scene.remove(this.game.sky.moon);
            if (this.game.sky.sunLight) {
                this.scene.remove(this.game.sky.sunLight);
                if (this.game.sky.sunLight.target) this.scene.remove(this.game.sky.sunLight.target);
            }
            if (this.game.sky.moonLight) this.scene.remove(this.game.sky.moonLight);
            if (this.game.sky.ambientLight) this.scene.remove(this.game.sky.ambientLight);
            if (this.game.sky.hemiLight) this.scene.remove(this.game.sky.hemiLight);
            if (this.game.sky.starfield && this.game.sky.starfield.starsGroup) {
                this.scene.remove(this.game.sky.starfield.starsGroup);
            }
            if (this.game.sky.northernLights && this.game.sky.northernLights.mesh) {
                this.scene.remove(this.game.sky.northernLights.mesh);
            }
        }

        // Create atmosphere transition sky (full day/night cycle + space transition at altitude)
        this.game.sky = new SkyAtmosphereTransition(this.scene);

        // Apply spaceground visual configuration - subtle bloom, increases at altitude
        if (this.game.bloomPass) {
            this.game.bloomPass.strength = 0.3;
            this.game.bloomPass.radius = 0.5;
            this.game.bloomPass.threshold = 0.3;
        }

        // Atmospheric fog settings
        if (this.game.scene.fog) {
            this.game.scene.fog.near = 500;
            this.game.scene.fog.far = 50000;
        }

        // Extended camera far plane for space objects
        this.camera.far = 200000;
        this.camera.updateProjectionMatrix();
    }

    _applyEnvironmentSettings(env) {
        // Check if we need to switch sky system based on skyType
        if (env.skyType === 'spaceground' && !(this.game.sky instanceof SkyAtmosphereTransition)) {
            this._setupSpacegroundSky();
        }

        if (env.timeOfDay !== undefined && this.game.sky) {
            this.game.sky.setTime(env.timeOfDay);
            this.guiParams.timeOfDay = env.timeOfDay;
        }
        if (env.fogDensity !== undefined && this.game.scene.fog) {
            this.game.scene.fog.density = env.fogDensity;
            this.guiParams.fogDensity = env.fogDensity;
        }

        // Restore complex sky settings
        if (env.sky && this.game.sky) {
            const savedSky = env.sky;
            const currentSky = this.game.sky;

            // Only apply if types match (e.g. don't apply DeepSpace settings to SkySystem)
            if (savedSky.type === currentSky.constructor.name) {
                if (savedSky.type === 'SkySystem' || savedSky.type === 'SkyAtmosphereTransition') {
                    // Deep merge settings (SkyAtmosphereTransition extends SkySystem)
                    Object.assign(currentSky.settings.day, savedSky.settings.day);
                    Object.assign(currentSky.settings.sunset, savedSky.settings.sunset);
                    Object.assign(currentSky.settings.night, savedSky.settings.night);
                    Object.assign(currentSky.settings.lights, savedSky.settings.lights);
                    Object.assign(currentSky.settings.durations, savedSky.settings.durations);

                    if (currentSky.starfield && savedSky.settings.starfield) {
                        Object.assign(currentSky.starfield.settings, savedSky.settings.starfield);
                    }
                } else if (savedSky.type === 'SkyDeepSpace') {
                    Object.assign(currentSky.settings, savedSky.settings);
                }

                // Trigger update
                if (currentSky.updateSettings) {
                    currentSky.updateSettings();
                }
            }
        }

        // Apply Terrain Parameters
        console.log('[Editor] Applying environment parameters:', env.parameters, 'Terrain exists:', !!this.game.terrain);
        if (env.parameters && this.game.terrain) {
            const params = env.parameters;

            // Update local GUI params
            // Map flat params back to gui defaults where needed
            const terrainP = this.guiParams.terrain;

            // Helper: Update key if exists
            const setIfExists = (key) => {
                if (params[key] !== undefined) terrainP[key] = params[key];
            };

            setIfExists('heightScale');
            setIfExists('seed');
            setIfExists('noiseScale');
            setIfExists('hillScale');
            setIfExists('detailScale');
            setIfExists('microScale');
            setIfExists('maxHeight');
            setIfExists('baseHeight');
            setIfExists('baseNoiseHeight');
            setIfExists('hillNoiseHeight');
            setIfExists('detailNoiseHeight');
            setIfExists('waterLevel');

            if (params.colors) {
                terrainP.colorGrassLow = params.colors.grassLow;
                terrainP.colorGrassHigh = params.colors.grassHigh;
                terrainP.colorDirt = params.colors.dirt;
                terrainP.colorRock = params.colors.rock;
                terrainP.colorSnow = params.colors.snow;
                terrainP.colorWater = params.colors.water;
            }

            // Trigger regeneration
            this._regenerateTerrain(params);
        }
    }

    _applyPhysicsSettings(physics) {
        if (!physics) return;

        // Update GUI params
        if (physics.gravity !== undefined) this.guiParams.gravity = physics.gravity;
        if (physics.friction !== undefined) this.guiParams.friction = physics.friction;
        if (physics.airResistance !== undefined) this.guiParams.airResistance = physics.airResistance;
        if (physics.suspensionStiffness !== undefined) this.guiParams.suspensionStiffness = physics.suspensionStiffness;
        if (physics.suspensionDamping !== undefined) this.guiParams.suspensionDamping = physics.suspensionDamping;
        if (physics.enginePower !== undefined) this.guiParams.enginePower = physics.enginePower;

        // Apply to engines
        this._applyPhysicsChange('gravity', this.guiParams.gravity);
        this._applyPhysicsChange('friction', this.guiParams.friction);
        this._applyPhysicsChange('airResistance', this.guiParams.airResistance);

        // Car specific
        this._applyCarChange('suspensionStiffness', this.guiParams.suspensionStiffness);
        this._applyCarChange('suspensionDamping', this.guiParams.suspensionDamping);
        this._applyCarChange('enginePower', this.guiParams.enginePower);
    }

    _refreshGUI() {
        // Update HTML UI
        const nameEl = document.getElementById('editor-level-name');
        if (nameEl && this.currentLevel) {
            nameEl.textContent = this.currentLevel.meta.name;
        }

        // Rebuild lil-gui
        if (this.gui) {
            this.gui.destroy();
            this.gui = null;
        }

        this._createGameParameterPanel();

        // Re-attach RPG editor
        if (this.rpgEditor) {
            this.rpgEditor.initialize(this.gui);
        }

        // Maintain visibility state
        if (this.gui && this.gui.domElement) {
            this.gui.domElement.style.display = this.enabled ? '' : 'none';
        }
    }

    async _applyLevelData(levelData) {
        this.currentLevel = levelData;

        // Load objects
        await this.objectManager.loadObjects(levelData.objects || []);

        // Apply environment settings
        console.log('[Editor] Loading environment:', levelData.environment);
        if (levelData.environment) {
            this._applyEnvironmentSettings(levelData.environment);
        }

        // Apply physics settings
        if (levelData.physics) {
            this._applyPhysicsSettings(levelData.physics);
        }

        // Restore custom RPG data if present
        if (levelData.rpgData) {
            this._restoreRPGData(levelData.rpgData);
        }

        // Update GUI to match loaded data
        this._refreshGUI();

        this._showNotification(`Loaded: ${levelData.meta.name}`, 'success');
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
