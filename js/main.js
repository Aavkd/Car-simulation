import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { InputHandler } from './core/input.js';
import { CameraController } from './core/camera.js';
import { TerrainGenerator } from './terrain/terrain.js';
import { CarPhysics } from './core/car.js';
import { PlayerController } from './core/player.js';
import { SkySystem } from './environment/sky.js';
import { SkyVaporwave } from './environment/sky-vaporwave.js';
import { SkyDeepSpace } from './environment/sky-deepspace.js';
import { WindEffect } from './environment/wind.js';
import { LevelManager } from './levels/level-manager.js';
import { LevelData, getAllLevels } from './levels/level-data.js';
import { ToyotaAE86 } from './core/vehicle-specs/ToyotaAE86.js';
import { MazdaRX7 } from './core/vehicle-specs/MazdaRX7.js';
import { ShelbyCobra427 } from './core/vehicle-specs/ShelbyCobra427.js';
import { EditorController } from './editor/EditorController.js';

/**
 * Available car specifications registry
 */
const CAR_REGISTRY = {
    'ae86': {
        spec: ToyotaAE86,
        model: 'assets/models/Toyota AE86.glb',
        name: 'Toyota AE86',
        icon: '🚗',
        color: '#e74c3c'
    },
    'rx7': {
        spec: MazdaRX7,
        model: 'assets/models/Mazda RX-7.glb',
        name: 'Mazda RX-7',
        icon: '🏎️',
        color: '#f39c12'
    },
    'cobra': {
        spec: ShelbyCobra427,
        model: 'assets/models/1966_shelby_cobra_427.glb',
        name: 'Shelby Cobra 427',
        icon: '🐍',
        color: '#3498db'
    }
};
import { PlanePhysics } from './core/plane.js';

/**
 * Game State enum
 */
const GameState = {
    MENU: 'menu',
    PLAY: 'play',
    EDITOR: 'editor'
};

/**
 * Vintage 16-bit Pixelation Shader
 * Combines pixelation with color quantization for retro look
 */
const Retro16BitShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        'pixelSize': { value: 64.0 },
        'colorDepth': { value: 32.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float pixelSize;
        uniform float colorDepth;
        varying vec2 vUv;

        void main() {
            // Pixelation
            vec2 dxy = pixelSize / resolution;
            vec2 coord = dxy * floor(vUv / dxy);
            
            vec4 color = texture2D(tDiffuse, coord);
            
            // Color quantization for 16-bit look (5-6-5 RGB distribution)
            float levels = colorDepth;
            color.r = floor(color.r * levels + 0.5) / levels;
            color.g = floor(color.g * (levels * 1.25) + 0.5) / (levels * 1.25); // More green levels like 16-bit
            color.b = floor(color.b * levels + 0.5) / levels;
            
            // Slight contrast boost for that punchy retro feel
            color.rgb = (color.rgb - 0.5) * 0.9 + 0.5;
            
            // Subtle scanline effect
            float scanline = sin(gl_FragCoord.y * 1.5) * 0.02 + 0.98;
            color.rgb *= scanline;
            
            gl_FragColor = color;
        }
    `
};

/**
 * AE86 Freeroam - Main Game Entry Point
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.loadingScreen = document.getElementById('loading-screen');
        this.mainMenu = document.getElementById('main-menu');

        // Game state machine
        this.gameState = GameState.MENU;
        this.levelManager = new LevelManager();

        // Three.js core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;  // Post-processing composer

        // Game systems
        this.input = null;
        this.cameraController = null;
        this.terrain = null;
        this.car = null;
        this.carMesh = null;
        this.player = null;  // On-foot player controller
        this.sky = null;
        this.wind = null;  // Atmospheric wind/fog effect
        this.plane = null;
        this.planeMesh = null;
        this.selectedVehicleType = 'car'; // Default selection from menu
        this.selectedCarId = 'ae86'; // Default car selection
        this.activeVehicle = 'car'; // 'car' or 'plane'

        // Player mode state
        this.isOnFoot = false;

        // Timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;

        // HUD elements
        this.hudElements = {
            speedValue: document.querySelector('.speed-value'),
            gearValue: document.querySelector('.gear-value'),
            rpmFill: document.querySelector('.rpm-fill'),
            timeValue: document.querySelector('.time-value'),
            timeStatus: document.querySelector('.time-status')
        };

        // Cockpit overlay element
        this.cockpitOverlay = document.getElementById('cockpit-overlay');

        // Time control state
        this.timeSpeed = 1.0;  // Multiplier for time passage
        this.timePaused = false;

        // Headlights state
        this.headlightsManualOverride = false;  // When true, ignores auto on/off

        // Retro filter state
        this.retroEnabled = true;

        this._init();
    }

    async _init() {
        // Phase 1: Setup core rendering systems (always needed)
        this._setupRenderer();
        this._setupScene();
        this._setupLighting();
        this._setupPostProcessing();
        this._setupInput();
        this._setupPointerLock();

        // Setup camera controller (needed for menu showcase view)
        this.cameraController = new CameraController(this.camera, this.canvas);
        this.input.onRetroToggle = () => this._toggleRetroFilter();
        this.input.onExitPlayMode = () => this.exitPlayTestMode();

        // Hide loading screen, show main menu
        this.loadingScreen.classList.add('hidden');

        // Populate and show main menu
        this._setupMainMenu();
        this._enterMenuState();

        // Start render loop (always runs, state controls what's updated)
        this._animate();
    }

    /**
     * Setup main menu UI with level cards
     */
    _setupMainMenu() {
        const levelGrid = document.getElementById('level-grid');
        if (!levelGrid) return;

        const levels = getAllLevels();

        levels.forEach(level => {
            const card = document.createElement('div');
            card.className = 'level-card';
            card.dataset.levelId = level.id;
            card.style.setProperty('--accent-color', level.color);

            card.innerHTML = `
                <div class="level-card-preview" style="background: linear-gradient(135deg, ${level.color}22, ${level.color}44);">
                    <div class="level-icon">${this._getLevelIcon(level.type)}</div>
                </div>
                <div class="level-card-info">
                    <h3 class="level-card-title">${level.name}</h3>
                    <p class="level-card-desc">${level.description}</p>
                    <div class="level-card-difficulty">
                        ${'★'.repeat(level.difficulty)}${'☆'.repeat(Math.max(0, 5 - level.difficulty))}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => this._selectLevel(level));
            levelGrid.appendChild(card);
        });

        // Add Editor Button after level cards
        const editorCard = document.createElement('div');
        editorCard.className = 'level-card editor-card';
        editorCard.style.setProperty('--accent-color', '#9b59b6');
        editorCard.innerHTML = `
            <div class="level-card-preview" style="background: linear-gradient(135deg, #9b59b622, #9b59b644);">
                <div class="level-icon">🛠️</div>
            </div>
            <div class="level-card-info">
                <h3 class="level-card-title">Level Editor</h3>
                <p class="level-card-desc">Create and edit custom levels</p>
                <div class="level-card-difficulty">✨✨✨✨✨</div>
            </div>
        `;
        editorCard.addEventListener('click', () => this._openEditorSelector());
        levelGrid.appendChild(editorCard);

        // Add Vehicle Selector to header or top of menu
        const container = document.querySelector('.menu-container') || document.getElementById('main-menu');
        if (container) {
            let selectorContainer = document.getElementById('vehicle-selector');
            if (!selectorContainer) {
                selectorContainer = document.createElement('div');
                selectorContainer.id = 'vehicle-selector';
                selectorContainer.className = 'vehicle-selector';
                selectorContainer.style.cssText = `
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-bottom: 30px;
                `;

                // Insert before level grid
                const grid = document.getElementById('level-grid');
                if (grid && grid.parentNode) {
                    grid.parentNode.insertBefore(selectorContainer, grid);
                } else {
                    container.appendChild(selectorContainer);
                }
            }

            this._renderVehicleSelector(selectorContainer);
        }
    }

    /**
     * Render vehicle selector UI with car sub-selection
     */
    _renderVehicleSelector(container) {
        const carOptions = Object.entries(CAR_REGISTRY).map(([id, car]) => `
            <div class="car-option ${this.selectedCarId === id ? 'selected' : ''}" data-car-id="${id}" style="
                padding: 10px 20px;
                background: rgba(0, 0, 0, 0.4);
                border: 2px solid ${this.selectedCarId === id ? car.color : '#333'};
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
                min-width: 120px;
            ">
                <div style="font-size: 20px; margin-bottom: 3px;">${car.icon}</div>
                <div style="font-weight: bold; color: white; font-size: 12px;">${car.name}</div>
            </div>
        `).join('');

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
                <!-- Vehicle Type Row -->
                <div style="display: flex; gap: 20px;">
                    <div class="vehicle-option ${this.selectedVehicleType === 'car' ? 'selected' : ''}" data-type="car" style="
                        padding: 15px 30px;
                        background: rgba(0, 0, 0, 0.5);
                        border: 2px solid ${this.selectedVehicleType === 'car' ? '#e74c3c' : '#444'};
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        text-align: center;
                    ">
                        <div style="font-size: 24px; margin-bottom: 5px;">🚗</div>
                        <div style="font-weight: bold; color: white;">CAR</div>
                    </div>
                    <div class="vehicle-option ${this.selectedVehicleType === 'plane' ? 'selected' : ''}" data-type="plane" style="
                        padding: 15px 30px;
                        background: rgba(0, 0, 0, 0.5);
                        border: 2px solid ${this.selectedVehicleType === 'plane' ? '#3498db' : '#444'};
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        text-align: center;
                    ">
                        <div style="font-size: 24px; margin-bottom: 5px;">✈️</div>
                        <div style="font-weight: bold; color: white;">F-16 JET</div>
                    </div>
                </div>
                <!-- Car Selection Row (only shown when car is selected) -->
                <div id="car-selector" style="
                    display: ${this.selectedVehicleType === 'car' ? 'flex' : 'none'};
                    gap: 15px;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                ">
                    ${carOptions}
                </div>
            </div>
        `;

        // Bind vehicle type events
        container.querySelectorAll('.vehicle-option').forEach(opt => {
            opt.addEventListener('click', () => {
                this.selectedVehicleType = opt.dataset.type;
                this._renderVehicleSelector(container);
            });
        });

        // Bind car selection events
        container.querySelectorAll('.car-option').forEach(opt => {
            opt.addEventListener('click', () => {
                this.selectedCarId = opt.dataset.carId;
                this._renderVehicleSelector(container);
            });
        });
    }

    /**
     * Get icon for level type
     */
    _getLevelIcon(type) {
        const icons = {
            procedural: '🏔️',
            dunes: '🏜️',
            highway: '🛣️',
            city: '🏙️',
            everest: '❄️'
        };
        return icons[type] || '🗺️';
    }

    /**
     * Handle level selection from menu
     */
    _selectLevel(levelConfig) {
        console.log(`[Game] Selected level: ${levelConfig.name}`);
        this._enterPlayState(levelConfig);
    }

    /**
     * Enter MENU state
     */
    _enterMenuState() {
        this.gameState = GameState.MENU;

        // Show menu, hide HUD
        if (this.mainMenu) this.mainMenu.classList.remove('hidden');
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
        const controlsHelp = document.getElementById('controls-help');
        if (controlsHelp) controlsHelp.classList.add('hidden');
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.classList.add('hidden');

        // Disable editor if active
        if (this.editor) {
            this.editor.disable();
        }

        console.log('[Game] Entered MENU state');
    }

    /**
     * Open editor level selector dialog
     */
    _openEditorSelector() {
        const levels = getAllLevels();

        // Add Blank Canvas option
        const blankLevel = {
            id: 'blank',
            name: 'Blank Canvas',
            description: 'Flat terrain for building from scratch',
            type: 'procedural',
            color: '#e2e8f0', // Slate 200
            params: {
                seed: 0,
                heightScale: 0, // Ensures flatness
                noiseScale: 0.001,
                hillScale: 0,
                detailScale: 0,
                microScale: 0,
                baseHeight: 0,
                maxHeight: 0
            }
        };

        // Combine blank level with existing levels
        const displayLevels = [blankLevel, ...levels];

        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'editor-select-dialog';
        dialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-box">
                <h2>🛠️ Select Base Level for Editor</h2>
                <p>Choose a terrain template to start editing:</p>
                <div class="level-select-grid">
                    ${displayLevels.map(level => `
                        <div class="level-select-item" data-level-id="${level.id}" style="border-color: ${level.color}">
                            <span class="level-select-icon">${this._getLevelIcon(level.type)}</span>
                            <span class="level-select-name">${level.name}</span>
                        </div>
                    `).join('')}
                </div>
                <button class="dialog-close-btn">Cancel</button>
            </div>
        `;

        document.body.appendChild(dialog);

        // Bind events
        dialog.querySelectorAll('.level-select-item').forEach(item => {
            item.onclick = () => {
                const levelId = item.dataset.levelId;
                const level = displayLevels.find(l => l.id === levelId);
                dialog.remove();
                if (level) {
                    this._enterEditorState(level);
                }
            };
        });

        dialog.querySelector('.dialog-close-btn').onclick = () => dialog.remove();
        dialog.querySelector('.dialog-backdrop').onclick = () => dialog.remove();
    }

    /**
     * Enter EDITOR state
     * @param {Object} levelConfig - Base level configuration
     */
    async _enterEditorState(levelConfig) {
        this.gameState = GameState.EDITOR;

        // Hide menu and HUD
        if (this.mainMenu) this.mainMenu.classList.add('hidden');
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
        const controlsHelp = document.getElementById('controls-help');
        if (controlsHelp) controlsHelp.classList.add('hidden');
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.classList.add('hidden');

        // Load terrain if not already loaded
        if (!this.terrain) {
            this.terrain = this.levelManager.loadLevel(levelConfig);
            const terrainMesh = this.terrain.generate();
            this.scene.add(terrainMesh);
        }

        // Initialize editor if not exists
        if (!this.editor) {
            this.editor = new EditorController(this);
            await this.editor.initialize(levelConfig);
        }

        // Enable editor
        this.editor.enable();

        console.log(`[Game] Entered EDITOR state with base level: ${levelConfig.name}`);
    }

    /**
     * Enter PLAY TEST Mode (from Editor)
     */
    async enterPlayTestMode() {
        console.log('[Game] Entering Play Test Mode');

        // 1. Switch State
        this.gameState = GameState.PLAY;
        this.previousState = GameState.EDITOR; // Remember where we came from

        // 2. Disable editor UI
        if (this.editor) {
            this.editor.disable();
        }

        // 3. Enable HUD
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        const controlsHelp = document.getElementById('controls-help');
        if (controlsHelp) controlsHelp.classList.remove('hidden');
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.classList.remove('hidden');

        // 4. Set Player Mode (Spawn on Foot)
        this.isOnFoot = true;
        this.activeVehicle = null;
        this.canvas.requestPointerLock();

        // 5. Initialize Car if needed (Editor doesn't load it by default)
        // We still need the car to be present so the player can enter it
        const selectedCar = CAR_REGISTRY[this.selectedCarId] || CAR_REGISTRY['ae86'];

        if (!this.carMesh) {
            console.log('Loading car for play test...');
            await this._loadCarModel(selectedCar.model);
        }

        // Ensure physics exists
        if (!this.car) {
            console.log('Initializing car physics for play test...');
            this.car = new CarPhysics(this.carMesh, this.terrain, this.scene, selectedCar.spec);
        }

        // 6. Spawn Player at Camera Position
        const spawnPos = this.camera.position.clone();

        // Ensure we spawn above ground
        if (this.terrain) {
            const groundH = this.terrain.getHeightAt(spawnPos.x, spawnPos.z);
            // Spawn player slightly above ground or at camera height if higher
            spawnPos.y = Math.max(spawnPos.y, groundH + 3);
        }

        // Initialize Player if needed
        if (!this.player) {
            this.player = new PlayerController(this.terrain);
        }

        // Set Player Position
        this.player.setPosition(spawnPos, 0);

        // 7. Park Vehicles Nearby
        // Place car slightly in front/side of player so it's visible and accessible
        const carOffset = new THREE.Vector3(5, 0, -10); // 5m right, 10m forward
        // Rotate offset by camera/spawn rotation if we had one, but simple offset is fine for now
        const carPos = spawnPos.clone().add(carOffset);

        if (this.terrain) {
            const carGroundH = this.terrain.getHeightAt(carPos.x, carPos.z);
            carPos.y = carGroundH + 2;
        }

        if (this.car) {
            this.car.position.copy(carPos);
            this.car.velocity.set(0, 0, 0);
            this.car.physics.velocity.set(0, 0, 0);
            this.car.physics.angularVelocity.set(0, 0, 0);

            // Orient car continuously (e.g. random or aligned) - let's align it to look "forward" relative to spawn
            this.car.physics.quaternion.set(0, 0, 0, 1);
            this.car._updateMesh();
        }

        // 8. Setup Camera for Player
        this.cameraController.setPlayerMode(true);
        // Ensure player variable is updated on camera controller (usually handled in update, but good to be sure)

        // 9. Configure Atmosphere if needed
        if (this.levelManager.currentLevel) {
            if (this.plane) {
                this.plane.setPhysicsProvider(this.terrain);
            }
        }

        // Hide Vehicle HUD initially since we are on foot
        const vehicleHud = document.getElementById('hud');
        if (vehicleHud) {
            vehicleHud.style.opacity = '0.3';
        }

        // 10. Setup Input Callbacks
        this.input.onEnterExitVehicle = () => this._toggleVehicleMode();
        this.input.onTimePause = () => this._toggleTimePause();
        this.input.onTimePreset = (preset) => this._setTimePreset(preset);
        this.input.onHeadlightsToggle = () => this._toggleHeadlights();
        this.input.onCameraChange = () => this._handleCameraChange();

        // Hide Cockpit Overlay
        if (this.cockpitOverlay) this.cockpitOverlay.classList.add('hidden');
    }

    /**
     * Exit PLAY TEST Mode (return to Editor)
     */
    exitPlayTestMode() {
        if (this.previousState !== GameState.EDITOR) return;

        console.log('[Game] Exiting Play Test Mode');

        // 1. Switch State
        this.gameState = GameState.EDITOR;
        this.previousState = null;

        // 2. Disable HUD
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
        const controlsHelp = document.getElementById('controls-help');
        if (controlsHelp) controlsHelp.classList.add('hidden');
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.classList.add('hidden');

        // Hide Cockpit Overlay
        if (this.cockpitOverlay) this.cockpitOverlay.classList.add('hidden');

        // 3. Re-enable Editor
        if (this.editor) {
            this.editor.returnToEditor();
        }
    }

    /**
     * Enter PLAY state - initialize gameplay systems
     */
    async _enterPlayState(levelConfig) {
        this.gameState = GameState.PLAY;

        // Hide menu, show HUD
        if (this.mainMenu) this.mainMenu.classList.add('hidden');
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        const controlsHelp = document.getElementById('controls-help');
        if (controlsHelp) controlsHelp.classList.remove('hidden');
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.classList.remove('hidden');

        // Generate terrain using LevelManager
        this.terrain = this.levelManager.loadLevel(levelConfig);
        const terrainMesh = this.terrain.generate();
        this.scene.add(terrainMesh);

        // Update physics providers with new terrain
        if (this.plane) {
            this.plane.setPhysicsProvider(this.terrain);
        }

        // Apply wind/fog settings based on level type
        if (this.wind) {
            switch (levelConfig.type) {
                case 'vaporwave':
                    // Neon purple fog for vaporwave
                    this.wind.configure({
                        windSpeed: 80,
                        fogColor: 0xff44ff,
                        fogOpacity: 0.5,
                        enabled: true
                    });
                    break;
                case 'cosmic':
                    // Deep space fog
                    this.wind.configure({
                        windSpeed: 50,
                        fogColor: 0x1a0b2e, // Deep violet
                        fogOpacity: 0.3,
                        enabled: true
                    });
                    break;
                case 'deepspace':
                    // No wind/fog in deep space -> but maybe some ether?
                    // Let's keep it clear mostly
                    this.wind.configure({
                        windSpeed: 0,
                        fogColor: 0x000000,
                        fogOpacity: 0.0,
                        enabled: false
                    });
                    break;
                case 'everest':
                    // HEAVY blizzard on Everest
                    this.wind.configure({
                        windSpeed: 120,
                        fogColor: 0xffffff,
                        fogOpacity: 0.8,
                        enabled: true
                    });
                    break;
                case 'dunes':
                    // Thick sandstorm
                    this.wind.configure({
                        windSpeed: 90,
                        fogColor: 0xccaa66,
                        fogOpacity: 0.6,
                        enabled: true
                    });
                    break;
                case 'city':
                    // Heavy smog
                    this.wind.configure({
                        windSpeed: 30,
                        fogColor: 0x888888,
                        fogOpacity: 0.4,
                        enabled: true
                    });
                    break;
                case 'icemountain':
                case 'longdrive': // [NEW] Use light icy atmosphere for Long Drive too
                    // Light icy atmosphere
                    this.wind.configure({
                        windSpeed: 40,
                        fogColor: 0xaaddff,
                        fogOpacity: 0.4,
                        enabled: true
                    });
                    break;
                default:
                    // Strong atmospheric fog
                    this.wind.configure({
                        windSpeed: 40,
                        fogColor: 0xaaddff,
                        fogOpacity: 0.4,
                        enabled: true
                    });
            }
        }

        // Apply visual presets and Skybox based on level type
        if (levelConfig.type === 'vaporwave' || levelConfig.type === 'cosmic' || levelConfig.type === 'deepspace') {
            console.log('Applying Vaporwave/Space Visuals...');
            // Switch to Vaporwave Skybox or Deep Space Skybox
            if (this.sky instanceof SkySystem) {
                console.log('Swapping SkySystem -> Custom Sky');
                // Remove standard sky objects
                if (this.sky.skyDome) this.scene.remove(this.sky.skyDome);
                if (this.sky.sun) this.scene.remove(this.sky.sun);
                if (this.sky.moon) this.scene.remove(this.sky.moon);
                if (this.sky.sunLight) {
                    this.scene.remove(this.sky.sunLight);
                    if (this.sky.sunLight.target) this.scene.remove(this.sky.sunLight.target);
                }
                if (this.sky.moonLight) this.scene.remove(this.sky.moonLight);
                if (this.sky.ambientLight) this.scene.remove(this.sky.ambientLight);
                if (this.sky.hemiLight) this.scene.remove(this.sky.hemiLight);
                if (this.sky.starfield && this.sky.starfield.starsGroup) {
                    this.scene.remove(this.sky.starfield.starsGroup);
                }

                // Create Custom Sky
                if (levelConfig.type === 'deepspace') {
                    this.sky = new SkyDeepSpace(this.scene);
                } else {
                    this.sky = new SkyVaporwave(this.scene);
                }
            }

            // Neon Vibe Configuration
            if (this.bloomPass) {
                this.bloomPass.strength = 0.6;
                this.bloomPass.radius = 0.5;
                this.bloomPass.threshold = 0.2;
            }

            // Override fog
            if (levelConfig.type === 'cosmic') {
                this.scene.fog.color.setHex(0x050011); // Almost black
                this.bloomPass.strength = 0.8; // More bloom for cosmic
            } else if (levelConfig.type === 'deepspace') {
                this.scene.fog.color.setHex(0x000005); // Pure black
                this.scene.fog.density = 0.0002; // Very clear
                this.bloomPass.strength = 1.2; // Massive bloom for stars
                this.bloomPass.radius = 0.8;
                this.bloomPass.threshold = 0.1;

                this.scene.fog.near = 1000;
                this.scene.fog.far = 200000;
                this.camera.far = 200000;
                this.camera.updateProjectionMatrix();
            } else {
                this.scene.fog.color.setHex(0x2a0a3b);
                this.scene.fog.near = 100;
                this.scene.fog.far = 2000;

                // Reset camera for standard vaporwave
                if (this.camera.far !== 6000) {
                    this.camera.far = 6000;
                    this.camera.updateProjectionMatrix();
                }
            }

        } else {
            // Standard Level
            if (this.sky instanceof SkyVaporwave || this.sky instanceof SkyDeepSpace) {
                console.log('Swapping Custom Sky -> SkySystem');
                // Remove sky objects (generic clean up)
                if (this.sky.skyDome) this.scene.remove(this.sky.skyDome);
                if (this.sky.sun) this.scene.remove(this.sky.sun); // Vaporwave only
                if (this.sky.sunLight) this.scene.remove(this.sky.sunLight);
                if (this.sky.ambientLight) this.scene.remove(this.sky.ambientLight);
                if (this.sky.hemiLight) this.scene.remove(this.sky.hemiLight); // Vaporwave only
                if (this.sky.starfield && this.sky.starfield.starsGroup) {
                    this.scene.remove(this.sky.starfield.starsGroup);
                }

                // Restore Standard Sky
                this.sky = new SkySystem(this.scene);
            }

            this.sky.setPaused(false);
            this.scene.fog.color.setHex(0x87CEEB); // Default fog

            // Reset standard visuals
            if (this.bloomPass) {
                this.bloomPass.strength = 0.0;
            }

            this.scene.fog.near = 300;
            this.scene.fog.far = 2000;

            // Reset camera for standard levels
            if (this.camera.far !== 6000) {
                this.camera.far = 6000;
                this.camera.updateProjectionMatrix();
            }
        }


        // Load car model
        await this._loadCarModel();

        // Load jet model
        await this._loadJetModel();

        // Configure Plane Speed Effect based on Level
        if (this.plane) {
            if (levelConfig.type === 'deepspace') {
                // Higher threshold for deep space (trigger at 400km/h, max at 3000km/h)
                this.plane.setSpeedThresholds(200, 3000);
            } else {
                // Default (trigger at 100km/h, max at 800km/h)
                this.plane.setSpeedThresholds(100, 800);
            }
        }

        // Initialize car and plane logic if needed (models are loaded above)
        // Set active vehicle
        this.activeVehicle = this.selectedVehicleType;
        this.isOnFoot = false;

        console.log(`[Game] Starting level with vehicle: ${this.activeVehicle}`);

        // Setup input callbacks
        this.input.onCameraChange = () => this._handleCameraChange();

        // Initialize car physics with selected car spec
        const selectedCar = CAR_REGISTRY[this.selectedCarId];
        this.car = new CarPhysics(this.carMesh, this.terrain, this.scene, selectedCar.spec);
        this.input.onDebugToggle = () => this.car.toggleDebug();

        // Pass wheel meshes to car physics for suspension animation
        if (this.wheelMeshes) {
            this.car.setWheelMeshes(this.wheelMeshes);
        }

        // Initialize plane physics if not already
        // Note: plane initialized in _loadJetModel, but let's ensure it's ready
        if (this.planeMesh && !this.plane) {
            this.plane = new PlanePhysics(this.planeMesh, this.scene);
        }

        // Connect terrain physics provider to plane for ground collision
        if (this.plane && this.terrain) {
            this.plane.setPhysicsProvider(this.terrain);
        }

        // Initialize player controller (on-foot mode)
        this.player = new PlayerController(this.terrain);

        // Input callbacks
        this.input.onEnterExitVehicle = () => this._toggleVehicleMode();
        this.input.onTimePause = () => this._toggleTimePause();
        this.input.onTimePreset = (preset) => this._setTimePreset(preset);
        this.input.onHeadlightsToggle = () => this._toggleHeadlights();

        // Set Spawn Position
        let startX = 0;
        let startZ = 0;
        let startY = null; // New: explicit spawn height

        if (this.terrain.getSpawnPosition) {
            const spawn = this.terrain.getSpawnPosition();
            startX = spawn.x;
            startZ = spawn.z;
            if (spawn.y !== undefined) {
                startY = spawn.y;
            }
        }

        // Apply Spawn to Selected Vehicle
        if (this.activeVehicle === 'car') {
            const startHeight = startY !== null ? startY : (this.terrain.getHeightAt(startX, startZ) + 10);
            this.car.position.set(startX, startHeight, startZ);
            this.car.velocity.set(0, 0, 0); // Reset velocity

            // Park the plane somewhere else if it exists
            if (this.plane) {
                this.plane.setPosition(startX + 30, this.terrain.getHeightAt(startX + 30, startZ + 30) + 5, startZ + 30);
            }

            // Setup camera for car
            this.cameraController.setVehicleType('car');
            this.cameraController.currentModeIndex = 0; // Chase
        } else {
            // Plane Spawn
            const startHeight = startY !== null ? startY : (this.terrain.getHeightAt(startX, startZ) + 5);

            if (this.plane) {
                this.plane.setPosition(startX, startHeight, startZ);
                this.plane.velocity.set(0, 0, 0);
            }

            // Park car away
            this.car.position.set(startX - 30, startHeight, startZ - 30);

            // Setup camera for plane
            this.cameraController.setVehicleType('plane');
            const flightIndex = this.cameraController.modes.indexOf('flight');
            if (flightIndex >= 0) this.cameraController.currentModeIndex = flightIndex;
        }

        // Setup pointer lock for first-person mouse look
        this._setupPointerLock();

        console.log(`[Game] Entered PLAY state with level: ${levelConfig.name}`);
    }

    _setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Handle resize
        window.addEventListener('resize', () => this._onResize());
    }

    _setupScene() {
        this.scene = new THREE.Scene();

        // Sky will be handled by SkySystem
        this.scene.background = new THREE.Color(0x000011);

        // Fog for depth (extended for massive map) - color will be updated by sky system
        this.scene.fog = new THREE.Fog(0x87CEEB, 300, 2000);

        // Initialize dynamic sky system - default to standard
        this.sky = new SkySystem(this.scene);
        this.sky.setTime(0.35); // Start at morning
        this.sky.setDayDuration(300); // 5 minute day cycle

        // Initialize atmospheric wind/fog effect
        this.wind = new WindEffect(this.scene);
        this.wind.setIntensity(0.5); // Medium intensity by default

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            6000  // Extended far plane for massive terrain
        );
        this.camera.position.set(0, 5, 10);
    }

    _setupPostProcessing() {
        // Create effect composer for post-processing
        this.composer = new EffectComposer(this.renderer);

        // Add render pass (renders the scene normally first)
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Add 16-bit retro shader pass
        this.retroPass = new ShaderPass(Retro16BitShader);
        this.retroPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        this.retroPass.uniforms['pixelSize'].value = 4.0;  // Adjust for more/less pixelation
        this.retroPass.uniforms['colorDepth'].value = 16.0;  // 16-bit color depth
        this.retroPass.enabled = this.retroEnabled;
        // Bloom Pass for pure neon vibes - defaults to low/off, enabled per level
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.0,    // strength (0 to start)
            0.4,    // radius
            0.85    // threshold
        );
        this.composer.addPass(this.bloomPass);

        this.composer.addPass(this.retroPass);
    }

    _setupLighting() {
        // Lighting is now handled by SkySystem
        // Get reference to sun light for shadow following
        this.sun = this.sky.getSunLight();
    }

    _setupInput() {
        this.input = new InputHandler();
        this.input.onRetroToggle = () => this._toggleRetroFilter();
    }

    _setupPointerLock() {
        // Request pointer lock on click when on foot
        this.canvas.addEventListener('click', () => {
            if (this.isOnFoot && !document.pointerLockElement) {
                this.canvas.requestPointerLock();
            }
        });

        // Handle mouse movement for player look
        document.addEventListener('mousemove', (e) => {
            if (this.isOnFoot && document.pointerLockElement === this.canvas) {
                this.player.handleMouseLook(e.movementX, e.movementY);
            }
        });

        // Exit pointer lock when entering vehicle
        document.addEventListener('pointerlockchange', () => {
            // Nothing needed here, handled by mode toggle
        });
    }

    async _loadCarModel() {
        const loader = new GLTFLoader();
        const selectedCar = CAR_REGISTRY[this.selectedCarId];
        const modelPath = selectedCar.model;
        console.log(`[Game] Loading car model: ${selectedCar.name} from ${modelPath}`);

        return new Promise((resolve, reject) => {
            loader.load(
                modelPath,
                (gltf) => {
                    this.carMesh = gltf.scene;

                    // Scale and position adjustments - use spec modelScale or default to 1
                    const modelScale = selectedCar.spec.modelScale || 1;
                    this.carMesh.scale.setScalar(modelScale);
                    console.log(`[Car] Applied model scale: ${modelScale}`);

                    // Find wheel meshes by name pattern
                    // Common naming: FL_Wheel, FR_Wheel, RL_Wheel, RR_Wheel or similar
                    this.wheelMeshes = [null, null, null, null]; // FL, FR, RL, RR
                    const allMeshNames = [];

                    this.carMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            allMeshNames.push(child.name);

                            // MATERIAL FIXES:
                            // 1. Ensure car paint reflects light
                            if (child.material) {
                                child.material.needsUpdate = true;
                                // If material looks like car paint (not glass/rubber), make it reflective
                                if (!child.name.toLowerCase().includes('glass') && !child.name.toLowerCase().includes('tire') && !child.name.toLowerCase().includes('rubber')) {
                                    child.material.roughness = 0.4; // Shiny
                                    child.material.metalness = 0.6; // Metallic
                                    child.material.envMapIntensity = 1.0;
                                }
                            }

                            // 2. Fix lighting occlusion
                            // Disable shadow casting for glass/lights so they don't block the point lights inside them
                            const lowerName = child.name.toLowerCase();
                            if (lowerName.includes('glass') || lowerName.includes('light') || lowerName.includes('lamp') || lowerName.includes('lens') || lowerName.includes('window')) {
                                child.castShadow = false; // Don't block light
                                child.receiveShadow = false;
                                console.log(`[Car] Disabled shadow casting for: ${child.name}`);
                            }
                        }

                        // Try to find wheel objects by name (case insensitive)
                        const name = child.name.toLowerCase();
                        const isWheelCandidate = name.includes('wheel') || name.includes('tire') ||
                            name.includes('rim') || name.includes('tyre');

                        if (isWheelCandidate || child.name.match(/^(fl|fr|rl|rr|bl|br)_/i)) {
                            console.log(`[Car] Found wheel candidate: ${child.name} at position:`, child.position);

                            // Identify wheel position by name or position
                            if (name.includes('fl') || name.includes('front_l') || name.includes('frontleft') || name.includes('lf')) {
                                this.wheelMeshes[0] = child;
                            } else if (name.includes('fr') || name.includes('front_r') || name.includes('frontright') || name.includes('rf')) {
                                this.wheelMeshes[1] = child;
                            } else if (name.includes('rl') || name.includes('rear_l') || name.includes('rearleft') || name.includes('bl') || name.includes('back_l') || name.includes('lb')) {
                                this.wheelMeshes[2] = child;
                            } else if (name.includes('rr') || name.includes('rear_r') || name.includes('rearright') || name.includes('br') || name.includes('back_r') || name.includes('rb')) {
                                this.wheelMeshes[3] = child;
                            } else if (isWheelCandidate) {
                                // Try to identify by position in model space
                                const pos = child.position;
                                const isFront = pos.z > 0;
                                const isLeft = pos.x < 0;
                                const idx = (isFront ? 0 : 2) + (isLeft ? 0 : 1);
                                if (!this.wheelMeshes[idx]) {
                                    this.wheelMeshes[idx] = child;
                                    console.log(`[Car] Assigned ${child.name} to slot ${idx} by position`);
                                }
                            }
                        }
                    });

                    console.log('[Car] All mesh names in model:', allMeshNames);
                    console.log('[Car] Wheel meshes found:', this.wheelMeshes.map(w => w ? w.name : 'null'));

                    this.scene.add(this.carMesh);
                    console.log('Car model loaded successfully');
                    resolve();
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    console.log(`Loading: ${percent}%`);
                },
                (error) => {
                    console.error('Error loading car model:', error);
                    // Create fallback box
                    this._createFallbackCar();
                    resolve();
                }
            );
        });
    }

    _createFallbackCar() {
        // Fallback car geometry if model fails to load
        const group = new THREE.Group();

        // Body
        const bodyGeom = new THREE.BoxGeometry(1.8, 0.8, 4);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);

        // Roof
        const roofGeom = new THREE.BoxGeometry(1.6, 0.6, 2);
        const roof = new THREE.Mesh(roofGeom, bodyMat);
        roof.position.set(0, 1.2, -0.3);
        roof.castShadow = true;
        group.add(roof);

        // Wheels
        const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

        const wheelPositions = [
            [-0.9, 0.3, 1.2],
            [0.9, 0.3, 1.2],
            [-0.9, 0.3, -1.2],
            [0.9, 0.3, -1.2]
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeom, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(...pos);
            wheel.castShadow = true;
            group.add(wheel);
        });

        this.carMesh = group;
        this.scene.add(this.carMesh);
    }

    _onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        // Update post-processing composer and shader resolution
        if (this.composer) {
            this.composer.setSize(width, height);
            this.retroPass.uniforms['resolution'].value.set(width, height);
        }
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const deltaTime = this.clock.getDelta();

        // Update input (always needed)
        this.input.update(deltaTime);

        // ==================== PLAY STATE ONLY ====================
        if (this.gameState === GameState.PLAY) {
            // Update car physics (only when in vehicle and active)
            if (this.car && !this.isOnFoot && this.activeVehicle === 'car') {
                this.car.update(deltaTime, this.input);

                // Update sun shadow to follow car
                if (this.sun) {
                    this.sun.target.position.copy(this.car.position);
                    this.sun.target.updateMatrixWorld();
                }
            }

            // Update Plane physics
            if (this.plane && !this.isOnFoot && this.activeVehicle === 'plane') {
                this.plane.update(deltaTime, this.input);

                // Sun shadow follows plane
                if (this.sun) {
                    this.sun.target.position.copy(this.plane.mesh.position);
                    this.sun.target.updateMatrixWorld();
                }
            }

            // Update player (only when on foot)
            if (this.player && this.isOnFoot) {
                this.player.update(deltaTime, this.input);

                // Gamepad look
                if (this.input.gamepad) {
                    this.player.handleAnalogLook(
                        this.input.gamepad.lookX,
                        this.input.gamepad.lookY,
                        deltaTime
                    );
                }

                // Update sun shadow to follow player
                if (this.sun) {
                    this.sun.target.position.copy(this.player.position);
                    this.sun.target.updateMatrixWorld();
                }
            }

            // Update camera for gameplay
            if (this.cameraController) {
                if (this.isOnFoot && this.player) {
                    this.cameraController.updatePlayerCamera(this.player, deltaTime);
                } else if (!this.isOnFoot) {
                    // Update camera for vehicle
                    const targetMesh = this.activeVehicle === 'car' ? this.carMesh : this.planeMesh;
                    const speed = this.activeVehicle === 'car' ? (this.car ? Math.abs(this.car.speed) : 0) : (this.plane ? this.plane.speed : 0);

                    if (targetMesh) {
                        if (this.input.gamepad) {
                            this.cameraController.handleAnalogInput(
                                this.input.gamepad.lookX,
                                this.input.gamepad.lookY,
                                20.0
                            );
                        }
                        this.cameraController.update(
                            targetMesh,
                            speed,
                            deltaTime
                        );
                    }
                }
            }

            // Update terrain for infinite generation (if supported)
            if (this.terrain && this.terrain.update) {
                const playerPos = this.isOnFoot
                    ? (this.player ? this.player.position : null)
                    : (this.activeVehicle === 'car'
                        ? (this.car ? this.car.position : null)
                        : (this.plane ? this.plane.mesh.position : null));
                if (playerPos) {
                    this.terrain.update(playerPos, this.sky);
                }
            }

            // Update HUD
            this._updateHUD();
        }

        // ==================== EDITOR STATE ONLY ====================
        if (this.gameState === GameState.EDITOR) {
            if (this.editor) {
                this.editor.update(deltaTime);
            }
        }

        // ==================== ALWAYS UPDATE (MENU & PLAY) ====================

        // Update sky system (needed for menu backdrop too)
        if (this.sky) {
            // Handle time controls only in PLAY
            if (this.gameState === GameState.PLAY) {
                let effectiveTimeSpeed = this.timeSpeed;
                if (this.input.keys.timeForward) {
                    effectiveTimeSpeed = 10.0;
                } else if (this.input.keys.timeBackward) {
                    effectiveTimeSpeed = -10.0;
                }

                if (!this.timePaused) {
                    const baseDuration = 300;
                    this.sky.setDayDuration(baseDuration / Math.abs(effectiveTimeSpeed));

                    if (effectiveTimeSpeed < 0) {
                        this.sky.setPaused(true);
                        const rewindAmount = deltaTime * Math.abs(effectiveTimeSpeed) / baseDuration;
                        this.sky.setTime(this.sky.getTime() - rewindAmount);
                    } else {
                        this.sky.setPaused(false);
                    }
                }

                // Car headlights based on time
                if (this.car && !this.headlightsManualOverride) {
                    this.car.setHeadlights(this.sky.isNight());
                }

                // Taillights
                if (this.car && !this.isOnFoot) {
                    const isBraking = this.input.brake > 0.1 || this.input.handbrake > 0.1;
                    this.car.updateTaillights(this.sky.isNight(), isBraking);
                }
            }

            this.sky.update(deltaTime, this.camera.position);

            // Update wind fog color based on time of day
            if (this.wind) {
                this.wind.setTimeOfDay(this.sky.getTime());
            }
        }

        // Update wind/fog effect (always, for menu backdrop too)
        if (this.wind) {
            const groundHeight = this.terrain ?
                this.terrain.getHeightAt(this.camera.position.x, this.camera.position.z) : 0;
            this.wind.update(deltaTime, this.camera.position, groundHeight);
        }

        // Render with post-processing
        this.composer.render();
    }

    _updateHUD() {
        if (this.activeVehicle === 'car' && this.car) {
            // Speed
            this.hudElements.speedValue.textContent = Math.round(this.car.speedKmh);
            // Gear
            this.hudElements.gearValue.textContent = this.car.getGearDisplay();
            // RPM bar
            const rpmPercent = this.car.getRPMPercentage() * 100;
            this.hudElements.rpmFill.style.width = `${Math.min(rpmPercent, 100)}%`;
            this.hudElements.rpmFill.style.backgroundColor = '#e74c3c'; // Red for car

        } else if (this.activeVehicle === 'plane' && this.plane) {
            // Speed (Knots or Kmh)
            this.hudElements.speedValue.textContent = Math.round(this.plane.speedKmh);
            // Altitude instead of Gear
            this.hudElements.gearValue.textContent = `ALT ${Math.round(this.plane.altitude)}`;
            // Throttle as bar
            const thrPercent = this.plane.throttle * 100;
            this.hudElements.rpmFill.style.width = `${Math.min(thrPercent, 100)}%`;
            this.hudElements.rpmFill.style.backgroundColor = '#3498db'; // Blue for plane
        }

        // Time display
        if (this.sky && this.hudElements.timeValue) {
            this.hudElements.timeValue.textContent = this.sky.getTimeString();

            // Update time status
            const statusEl = this.hudElements.timeStatus;
            if (statusEl) {
                statusEl.classList.remove('paused', 'fast-forward', 'rewind');

                if (this.timePaused) {
                    statusEl.textContent = '⏸ PAUSED';
                    statusEl.classList.add('paused');
                } else if (this.input.keys.timeForward) {
                    statusEl.textContent = '⏩ FAST FORWARD';
                    statusEl.classList.add('fast-forward');
                } else if (this.input.keys.timeBackward) {
                    statusEl.textContent = '⏪ REWIND';
                    statusEl.classList.add('rewind');
                } else {
                    statusEl.textContent = '';
                }
            }
        }

        // Show/hide vehicle HUD based on mode
        const vehicleHud = document.getElementById('hud');
        if (vehicleHud) {
            vehicleHud.style.opacity = this.isOnFoot ? '0.3' : '1';
        }
    }

    _toggleTimePause() {
        this.timePaused = !this.timePaused;
        if (this.sky) {
            this.sky.setPaused(this.timePaused);
        }
    }

    _setTimePreset(preset) {
        if (!this.sky) return;

        // Time presets: 1 = Dawn, 2 = Noon, 3 = Sunset, 4 = Midnight
        const presets = {
            1: 0.25,   // Dawn (6:00)
            2: 0.5,    // Noon (12:00)
            3: 0.75,   // Sunset (18:00)
            4: 0.0     // Midnight (00:00)
        };

        if (presets[preset] !== undefined) {
            this.sky.setTime(presets[preset]);
        }
    }

    _toggleHeadlights() {
        if (!this.car) return;

        // Enable manual override and toggle
        this.headlightsManualOverride = true;
        this.car.toggleHeadlights();
    }

    _handleCameraChange() {
        this.cameraController.nextMode();

        // Check if in cockpit (first-person) mode
        const isCockpit = this.cameraController.isCockpitMode;

        // Toggle car 3D model visibility (hide in cockpit mode, except for open-top cars like Cobra)
        if (this.carMesh) {
            // Shelby Cobra is a roadster - keep model visible in cockpit to see the body
            const keepVisible = this.selectedCarId === 'cobra';
            this.carMesh.visible = keepVisible || !isCockpit;
        }

        // Toggle cockpit overlay visibility (show in cockpit mode ONLY for cars)
        if (this.cockpitOverlay) {
            if (isCockpit && this.activeVehicle === 'car') {
                this.cockpitOverlay.classList.remove('hidden');
            } else {
                this.cockpitOverlay.classList.add('hidden');
            }
        }
    }

    _toggleRetroFilter() {
        this.retroEnabled = !this.retroEnabled;
        if (this.retroPass) {
            this.retroPass.enabled = this.retroEnabled;
        }
    }

    async _loadJetModel() {
        const loader = new GLTFLoader();
        return new Promise((resolve) => {
            loader.load('assets/models/silver_surfer.glb', (gltf) => {
                this.planeMesh = gltf.scene;
                this.planeMesh.scale.setScalar(2.0); // Approx match car

                // Shadows
                this.planeMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Set initial position (Parked somewhere - e.g., near start but offset)
                this.planeMesh.position.set(30, 0, 30);

                this.scene.add(this.planeMesh);

                // Initialize physics
                this.plane = new PlanePhysics(this.planeMesh, this.scene);

                // Connect terrain physics provider if terrain is already loaded
                if (this.terrain) {
                    this.plane.setPhysicsProvider(this.terrain);
                }

                console.log('Jet model loaded');
                resolve();
            }, undefined, (e) => {
                console.error('Failed to load Jet', e);
                resolve(); // resolve anyway
            });
        });
    }

    /**
     * Toggle between vehicle and on-foot modes
     */
    _toggleVehicleMode() {
        if (!this.player) return;

        if (this.isOnFoot) {
            // Try to enter a vehicle
            const playerPos = this.player.position;

            // Check Car Distance
            const carDist = this.car ? playerPos.distanceTo(this.car.position) : Infinity;

            // Check Plane Distance
            const planeDist = this.plane ? playerPos.distanceTo(this.plane.mesh.position) : Infinity;

            const INTERACTION_RADIUS = 5.0; // Meters

            if (carDist < INTERACTION_RADIUS && carDist <= planeDist) {
                // Enter Car
                console.log('Entering Car');
                this.isOnFoot = false;
                this.activeVehicle = 'car';

                this.cameraController.setVehicleType('car');
                this.cameraController.setPlayerMode(false);
                this.cameraController.currentModeIndex = 0; // Chase

                // Restore car visibility in case it was hidden
                if (this.carMesh) {
                    this.carMesh.visible = !this.cameraController.isCockpitMode;
                }

            } else if (planeDist < INTERACTION_RADIUS) {
                // Enter Plane
                console.log('Entering Plane');
                this.isOnFoot = false;
                this.activeVehicle = 'plane';

                this.cameraController.setVehicleType('plane');
                this.cameraController.setPlayerMode(false);
                // Switch to flight cam
                const flightIndex = this.cameraController.modes.indexOf('flight');
                if (flightIndex >= 0) this.cameraController.currentModeIndex = flightIndex;

            } else {
                console.log('No vehicle nearby');
            }
        } else {
            // Exit Vehicle
            console.log('Exiting Vehicle');
            this.isOnFoot = true;
            this.cameraController.setPlayerMode(true);

            // Teleport player to vehicle position
            const vehiclePos = this.activeVehicle === 'car' ? this.car.position : this.plane.mesh.position;
            // Offset slightly so we don't spawn inside
            const offset = new THREE.Vector3(3, 0, 0); // Side
            if (this.activeVehicle === 'car') {
                offset.set(-3, 0, 0); // Left of car
                offset.applyQuaternion(this.carMesh.quaternion);
            } else {
                offset.set(5, 0, 0); // Side of plane
                offset.applyQuaternion(this.planeMesh.quaternion);
            }

            const exitPos = vehiclePos.clone().add(offset);

            // Ensure on ground
            const groundH = this.terrain.getHeightAt(exitPos.x, exitPos.z);
            exitPos.y = groundH + this.player.specs.height;

            this.player.setPosition(exitPos, 0);

            // Hide cockpit overlay if visible
            if (this.cockpitOverlay) {
                this.cockpitOverlay.classList.add('hidden');
            }

            this.activeVehicle = null;
        }
    }
}

// Start game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
