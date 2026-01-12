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
import { RPGManager } from './rpg/systems/RPGManager.js';
import { NPCEntity } from './rpg/entities/NPCEntity.js';
import { BlackHole } from './environment/BlackHole.js';
import { ASCIIShader } from './postprocessing/ASCIIShader.js';
import { HalftoneShader } from './postprocessing/HalftoneShader.js';

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
        'colorDepth': { value: 32.0 },
        'contrast': { value: 1.1 },
        'scanlineIntensity': { value: 0.15 },
        'scanlineCount': { value: 1.5 },
        'saturation': { value: 1.2 },
        // New Effects
        'noiseIntensity': { value: 0.05 },
        'vignetteStength': { value: 0.3 }, // Radius
        'vignetteIntensity': { value: 0.5 }, // Darkness
        'aberration': { value: 0.0 },
        'brightness': { value: 0.0 },
        'exposure': { value: 1.0 }
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
        uniform float contrast;
        uniform float scanlineIntensity;
        uniform float scanlineCount;
        uniform float saturation;
        
        uniform float noiseIntensity;
        uniform float vignetteStength;
        uniform float vignetteIntensity;
        uniform float aberration;
        uniform float brightness;
        uniform float exposure;
        
        varying vec2 vUv;
        
        vec3 adjustSaturation(vec3 color, float value) {
            float average = (color.r + color.g + color.b) / 3.0;
            return mix(vec3(average), color, value);
        }
        
        // Simple pseudo-random noise
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
            // Pixelation
            vec2 dxy = pixelSize / resolution;
            vec2 coord = dxy * floor(vUv / dxy);
            
            // Chromatic Aberration (RGB Shift)
            vec4 color;
            if (aberration > 0.0) {
                float r = texture2D(tDiffuse, coord + vec2(aberration * 0.005, 0.0)).r;
                float g = texture2D(tDiffuse, coord).g;
                float b = texture2D(tDiffuse, coord - vec2(aberration * 0.005, 0.0)).b;
                color = vec4(r, g, b, 1.0);
            } else {
                color = texture2D(tDiffuse, coord);
            }
            
            // Saturation
            color.rgb = adjustSaturation(color.rgb, saturation);
            
            // Contrast
            color.rgb = (color.rgb - 0.5) * contrast + 0.5;
            
            // Brightness (Lift) & Exposure (Gain)
            color.rgb = (color.rgb + brightness) * exposure;
            
            // Color quantization
            if (colorDepth > 0.0) {
                float levels = colorDepth;
                color.r = floor(color.r * levels + 0.5) / levels;
                color.g = floor(color.g * (levels) + 0.5) / (levels); 
                color.b = floor(color.b * levels + 0.5) / levels;
            }
            
            // Scanlines
            float scanline = sin(gl_FragCoord.y * scanlineCount) * scanlineIntensity + (1.0 - scanlineIntensity);
            color.rgb *= scanline;
            
            // Noise
            if (noiseIntensity > 0.0) {
                float n = random(vUv + fract(sin(dot(coord, vec2(12.989, 78.233)))*43758.54)); 
                // That was static noise. For animated, we need time, but we don't have time uniform yet.
                // Let's use static grain for "print/retro" look or just pixel noise.
                // Or better:
                n = random(gl_FragCoord.xy);
                color.rgb += (n - 0.5) * noiseIntensity;
            }
            
            // Vignette
            if (vignetteStength > 0.0) {
                vec2 center = vUv - 0.5;
                float dist = length(center);
                float vign = smoothstep(vignetteStength, vignetteStength - vignetteIntensity, dist);
                // Actually: smoothstep(edge0, edge1, x). we want 1 at center, 0 at edges.
                // radius is where it starts fading?
                // Let's use standard formula:
                // col *= 1.0 - smoothstep(radius, radius+softness, len)
                float v = 1.0 - smoothstep(vignetteStength, vignetteStength + 0.5, dist);
                // Mix with intensity
                color.rgb = mix(color.rgb, color.rgb * v, vignetteIntensity);
            }
            
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
        this.selectedCarId = 'ae86'; // Default car selection
        this.activeVehicle = 'car'; // 'car' or 'plane'

        // RPG System
        this.rpgManager = new RPGManager(this);

        // Track vehicles spawned from editor
        this.spawnedVehicles = [];

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
        this.asciiEnabled = false;
        this.halftoneEnabled = false;

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
        this.input.onAsciiToggle = () => this._toggleAsciiFilter();
        this.input.onHalftoneToggle = () => this._toggleHalftoneFilter();
        this.input.onExitPlayMode = () => this.exitPlayTestMode();

        // Hide loading screen, show main menu
        this.loadingScreen.classList.add('hidden');

        // Populate and show main menu
        this._setupMainMenu();
        this._enterMenuState();

        // Initialize RPG System
        this.rpgManager.init();

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
     * @param {boolean} forceInit - Force re-initialization of editor
     */
    async _enterEditorState(levelConfig, forceInit = false) {
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

        // Initialize editor if not exists OR forced
        if (!this.editor) {
            this.editor = new EditorController(this);
            await this.editor.initialize(levelConfig);
        } else if (forceInit || this.editor.levelConfig !== levelConfig) {
            console.log('[Game] Re-initializing editor for new level context');
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

        // 5. Initialize Vehicles and NPCs from Editor Objects
        this.spawnedVehicles = [];
        let playerSpawnedAtVehicle = false;
        const interactableObjects = [];

        // Find relevant objects in the editor scene
        const editorObjects = this.editor ? this.editor.objectManager.objects : [];

        console.log(`[Game] Processing ${editorObjects.length} editor objects for Play Mode...`);

        if (editorObjects.length > 0) {
            for (const obj of editorObjects) {
                // handle Vehicles
                if (obj.userData.type === 'car') {
                    // ... (existing car logic) ...
                    // Start with AE86 as base, but we should really load the specific spec
                    let carSpec = ToyotaAE86;
                    // Check asset path or name to determine spec
                    // Ideally we should store carId in userData
                    if (obj.userData.assetPath.includes('RX-7') || obj.userData.name.includes('RX-7')) carSpec = MazdaRX7;
                    if (obj.userData.assetPath.includes('cobra') || obj.userData.name.includes('Cobra')) carSpec = ShelbyCobra427;

                    // Allow simple override via exact asset path match (fallback)
                    Object.values(CAR_REGISTRY).forEach(reg => {
                        if (obj.userData.assetPath === reg.model) carSpec = reg.spec;
                    });

                    const carMesh = obj.clone();
                    this.scene.add(carMesh);

                    const carPhysics = new CarPhysics(carMesh, this.terrain, this.scene, carSpec);

                    // Set initial state from editor object
                    carPhysics.position.copy(obj.position);
                    carPhysics.physics.position.copy(obj.position);
                    carPhysics.physics.quaternion.copy(obj.quaternion);
                    carPhysics.physics.velocity.set(0, 0, 0);
                    carPhysics.physics.angularVelocity.set(0, 0, 0);
                    carPhysics._updateMesh();

                    this.spawnedVehicles.push(carPhysics);

                    if (!this.car) {
                        this.car = carPhysics;
                        this.carMesh = carMesh;
                    }

                } else if (obj.userData.type === 'plane') {
                    // ... (existing plane logic) ...
                    const planeMesh = obj.clone();
                    this.scene.add(planeMesh);

                    const planePhysics = new PlanePhysics(planeMesh, this.scene);
                    if (this.terrain) planePhysics.setPhysicsProvider(this.terrain);

                    planePhysics.mesh.position.copy(obj.position);
                    planePhysics.mesh.quaternion.copy(obj.quaternion);
                    planePhysics.speed = 0;
                    planePhysics.velocity.set(0, 0, 0);

                    this.spawnedVehicles.push(planePhysics);

                    if (!this.plane) {
                        this.plane = planePhysics;
                        this.planeMesh = planeMesh;
                    }

                } else if (obj.userData.type === 'npc') {
                    console.log(`[Game] Spawning NPC: ${obj.userData.name}`);
                    const npcMesh = obj.clone();
                    this.scene.add(npcMesh);

                    // Create Wrapper Entity
                    const npcEntity = new NPCEntity(npcMesh, {
                        name: obj.userData.name,
                        dialogueId: obj.userData.dialogueId,
                        behavior: obj.userData.behavior,
                        flags: obj.userData.flags,
                        npcId: obj.userData.npcId
                    });

                    // Add to tracked objects
                    this.spawnedVehicles.push({
                        mesh: npcMesh,
                        update: (dt) => npcEntity.update(dt),
                        dispose: () => { }
                    });

                    interactableObjects.push(npcMesh);

                } else if (obj.userData.type === 'procedural') {
                    // Procedural Objects
                    if (obj.userData.generator === 'BlackHole') {
                        console.log(`[Game] Spawning Procedural BlackHole: ${obj.userData.name}`);

                        // Get config from editor instance or metadata
                        const config = obj.userData.proceduralInstance ?
                            obj.userData.proceduralInstance.getConfig() :
                            obj.userData.proceduralOptions;

                        const bh = new BlackHole(config);
                        bh.mesh.position.copy(obj.position);
                        bh.mesh.rotation.copy(obj.rotation);
                        bh.mesh.scale.copy(obj.scale);

                        this.scene.add(bh.mesh);
                        this.spawnedVehicles.push(bh);
                    }
                } else {
                    // Static Props / Buildings / Other Objects
                    console.log(`[Game] Spawning Static Object: ${obj.userData.name}`);
                    const mesh = obj.clone();
                    this.scene.add(mesh);

                    this.spawnedVehicles.push({
                        mesh: mesh,
                        dispose: () => { }
                    });
                }
            }

            // Hide editor objects
            editorObjects.forEach(obj => obj.visible = false);

        } else {
            // FALLBACK: No vehicles placed, spawn default car near player
            // ... (existing fallback logic unchanged, but need to be careful with replacement)
            // I will include the fallback logic here to be safe since I'm replacing the whole block
            console.log('[Game] No vehicles in editor, spawning default car.');

            const selectedCar = CAR_REGISTRY[this.selectedCarId] || CAR_REGISTRY['ae86'];

            if (!this.carMesh) {
                await this._loadCarModel(selectedCar.model);
            }
            if (!this.car) {
                this.car = new CarPhysics(this.carMesh, this.terrain, this.scene, selectedCar.spec);
            }

            // Position near camera
            const spawnPos = this.camera.position.clone();
            const offset = new THREE.Vector3(5, 0, -10);
            const carPos = spawnPos.clone().add(offset);
            if (this.terrain) {
                carPos.y = this.terrain.getHeightAt(carPos.x, carPos.z) + 2;
            }

            this.car.position.copy(carPos);
            this.car.physics.position.copy(carPos);
            this.car.velocity.set(0, 0, 0);
            this.car.physics.velocity.set(0, 0, 0);
            this.car.physics.quaternion.set(0, 0, 0, 1);
            this.car._updateMesh();

            this.spawnedVehicles.push(this.car);
        }

        // 6. Spawn Player at Camera Position
        const spawnPos = this.camera.position.clone();

        // Ensure we spawn above ground
        if (this.terrain) {
            const groundH = this.terrain.getHeightAt(spawnPos.x, spawnPos.z);
            spawnPos.y = Math.max(spawnPos.y, groundH + 3);
        }

        // Initialize Player if needed
        if (!this.player) {
            this.player = new PlayerController(this.terrain);
        }

        // Set Player Position
        this.player.setPosition(spawnPos, 0);

        // Pass interactables to player
        this.player.setInteractables(interactableObjects);

        // 8. Setup Camera for Player
        this.cameraController.setPlayerMode(true);

        // 9. Configure Atmosphere
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
        this.input.onInteract = () => {
            if (this.isOnFoot && this.player) {
                this.player.interact();
            }
        };

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

        // 3. Cleanup Spawned Vehicles
        // We spawned duplicates of editor objects or new instances, so we should remove them
        // to avoid accumulation and state persistence issues
        if (this.spawnedVehicles) {
            this.spawnedVehicles.forEach(v => {
                if (v.mesh) this.scene.remove(v.mesh);
                if (v.dispose) v.dispose(); // If physics classes have dispose
            });
            this.spawnedVehicles = [];
        }

        // Restore visibility of editor objects
        if (this.editor && this.editor.objectManager) {
            this.editor.objectManager.objects.forEach(obj => obj.visible = true);
        }

        // 4. Re-enable Editor
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
        // Use a separate scene for wind to bypass post-processing artifacts (like bloom/pixelation)
        this.windScene = new THREE.Scene();
        this.wind = new WindEffect(this.windScene);
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

        // Bloom Pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        this.bloomPass.threshold = 0.0;
        this.bloomPass.strength = 0.132;
        this.bloomPass.radius = 1.0;
        this.composer.addPass(this.bloomPass);

        // Retro Pass
        this.retroPass = new ShaderPass(Retro16BitShader);
        this.retroPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        this.retroPass.uniforms['pixelSize'].value = 4.0;
        this.retroPass.uniforms['colorDepth'].value = 16.0;

        // Custom defaults from user
        this.retroPass.uniforms['contrast'].value = 0.9;
        this.retroPass.uniforms['saturation'].value = 0.5;
        this.retroPass.uniforms['scanlineIntensity'].value = 0.15;
        this.retroPass.uniforms['scanlineCount'].value = 1.5;
        this.retroPass.uniforms['noiseIntensity'].value = 0.0;
        this.retroPass.uniforms['vignetteStength'].value = 0.4;
        this.retroPass.uniforms['vignetteIntensity'].value = 0.6;
        this.retroPass.uniforms['aberration'].value = 0.0;
        this.retroPass.uniforms['brightness'].value = -0.02;
        this.retroPass.uniforms['exposure'].value = 3.0;

        this.retroPass.enabled = this.retroEnabled;
        this.composer.addPass(this.retroPass);

        // ASCII Pass
        this.asciiPass = new ShaderPass(ASCIIShader);
        this.asciiPass.enabled = false;

        // Load ASCII textures
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('assets/texture/fillASCII.png', (tex) => {
            this.asciiPass.uniforms['tFill'].value = tex;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
        });
        // textureLoader.load('assets/texture/edgesASCII.png', (tex) => { ... });

        this.asciiPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        this.composer.addPass(this.asciiPass);

        // Halftone Pass
        this.halftonePass = new ShaderPass(HalftoneShader);
        this.halftonePass.enabled = false;
        this.halftonePass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
        this.composer.addPass(this.halftonePass);
    }

    _toggleRetroFilter() {
        this.retroEnabled = !this.retroEnabled;
        if (this.retroPass) {
            this.retroPass.enabled = this.retroEnabled;
        }

        // Disable others if exclusive is desired? 
        // Let's allow stacking for chaos, or disable others for clarity.
        // User request implied switching filters, but stacking could be fun.
        // Let's implement exclusive switching for F4/F5/F6 if they want clean views.
        // But for now, independent toggles.

        console.log(`[Game] Retro Filter: ${this.retroEnabled}`);
    }

    _toggleAsciiFilter() {
        this.asciiEnabled = !this.asciiEnabled;
        if (this.asciiPass) {
            this.asciiPass.enabled = this.asciiEnabled;
        }
        console.log(`[Game] ASCII Filter: ${this.asciiEnabled}`);
    }

    _toggleHalftoneFilter() {
        this.halftoneEnabled = !this.halftoneEnabled;
        if (this.halftonePass) {
            this.halftonePass.enabled = this.halftoneEnabled;
        }
        console.log(`[Game] Halftone Filter: ${this.halftoneEnabled}`);
    }

    _setupLighting() {
        // Lighting is now handled by SkySystem
        // Get reference to sun light for shadow following
        this.sun = this.sky.getSunLight();
    }

    _setupInput() {
        this.input = new InputHandler();
        this.input.onRetroToggle = () => this._toggleRetroFilter();
        this.input.onAsciiToggle = () => this._toggleAsciiFilter();
        this.input.onHalftoneToggle = () => this._toggleHalftoneFilter();
        this.input.onEditorToggle = () => this.enterLevelEditorFromPlay();
    }

    /**
     * Enter EDITOR state from PLAY state (via F9)
     */
    async enterLevelEditorFromPlay() {
        if (this.gameState !== GameState.PLAY) return;

        console.log('[Game] Switching to Editor from Play Mode...');

        // If we are in a Play Test session (from Editor), just exit it
        if (this.previousState === GameState.EDITOR) {
            this.exitPlayTestMode();
            return;
        }

        // Clean up Play elements
        this._cleanupPlayState();

        // Enter Editor with current level
        if (this.levelManager.currentLevel) {
            // Force re-initialization of editor with strictly current level
            await this._enterEditorState(this.levelManager.currentLevel, true);
        } else {
            // Fallback
            this._openEditorSelector();
        }
    }

    /**
     * Clean up Play Mode entities when switching to Editor/Menu
     */
    _cleanupPlayState() {
        // Unlock pointer
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Remove Player
        if (this.player) {
            this.player = null;
        }

        // Remove Main Car
        if (this.car) {
            if (this.carMesh) this.scene.remove(this.carMesh);
            this.car = null;
            this.carMesh = null;
        }

        // Remove Plane
        if (this.plane) {
            if (this.planeMesh) this.scene.remove(this.planeMesh);
            this.plane = null;
            this.planeMesh = null;
        }

        // Remove Spawned Vehicles (NPCs, etc.)
        if (this.spawnedVehicles) {
            this.spawnedVehicles.forEach(v => {
                if (v.mesh) this.scene.remove(v.mesh);
            });
            this.spawnedVehicles = [];
        }
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
            // Update RPG Systems
            if (this.rpgManager) {
                this.rpgManager.update(this.clock.elapsedTime, deltaTime);
            }

            // Update all spawned vehicles
            this.spawnedVehicles.forEach(vehicle => {
                // Only pass input if this is the active vehicle AND we are not on foot
                const isActive = !this.isOnFoot &&
                    ((this.activeVehicle === 'car' && vehicle === this.car) ||
                        (this.activeVehicle === 'plane' && vehicle === this.plane));

                // For inactive vehicles, pass empty input to let them idle/coast
                const vehicleInput = isActive ? this.input : {};

                // Update vehicle physics/logic
                if (vehicle.update) {
                    vehicle.update(deltaTime, vehicleInput);
                }
            });

            // Legacy support for single active car/plane (if not in spawned list)
            // This covers the main menu car or default spawn if no editor vehicles
            if (this.car && !this.spawnedVehicles.includes(this.car) && !this.isOnFoot && this.activeVehicle === 'car') {
                this.car.update(deltaTime, this.input);
            }
            if (this.plane && !this.spawnedVehicles.includes(this.plane) && !this.isOnFoot && this.activeVehicle === 'plane') {
                this.plane.update(deltaTime, this.input);
            }

            // Update sun shadow to follow active vehicle or player
            let shadowTarget = null;
            if (this.isOnFoot && this.player) {
                shadowTarget = this.player.position;
            } else if (this.activeVehicle === 'car' && this.car) {
                shadowTarget = this.car.position;
            } else if (this.activeVehicle === 'plane' && this.plane) {
                shadowTarget = this.plane.mesh.position;
            }

            if (this.sun && shadowTarget) {
                this.sun.target.position.copy(shadowTarget);
                this.sun.target.updateMatrixWorld();
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
        // Render with post-processing
        this.composer.render();

        // Render Wind Overlay (ignores post-processing)
        if (this.windScene && this.wind && this.wind.enabled) {
            this.renderer.autoClear = false;
            this.renderer.clearDepth(); // Clear depth so it draws on top? 
            // NO! If we clear depth, it will draw on top of mountains.
            // But we don't have the main scene depth buffer here because Composer target might be different.
            // Actually, if we render to screen, the depth buffer is in the default framebuffer.
            // Composer.render() renders a quad. The depth of that quad is ... flat.
            // So we effectively lost 3D depth for the overlay.
            // We have to accept it's an overlay or use a more complex depth copy.
            // For "fog banks", overlay is acceptable if soft.
            this.renderer.render(this.windScene, this.camera);
            this.renderer.autoClear = true;
        }
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
    /**
     * Toggle between vehicle and on-foot modes
     */
    _toggleVehicleMode() {
        if (!this.player) return;

        if (this.isOnFoot) {
            // Finding closest vehicle in spawned list
            const playerPos = this.player.position;
            const INTERACTION_RADIUS = 3.0; // Meters (Distance to surface) - increased for usability
            const VIEW_THRESHOLD = 0.5; // Dot product (approx 60 degrees cone)

            let closestVehicle = null;
            let minDistance = Infinity;

            // Gather all candidate vehicles
            const candidates = [...this.spawnedVehicles];
            if (this.car && !candidates.includes(this.car)) candidates.push(this.car);
            if (this.plane && !candidates.includes(this.plane)) candidates.push(this.plane);

            const tempBox = new THREE.Box3();
            const center = new THREE.Vector3();
            const camDir = new THREE.Vector3();
            if (this.camera) this.camera.getWorldDirection(camDir);
            const dirToVehicle = new THREE.Vector3();

            console.log(`[VehicleToggle] Candidates: ${candidates.length}`);

            for (const vehicle of candidates) {
                // Get mesh for bounds check
                const mesh = vehicle.mesh;
                if (!mesh) continue;

                // Calculate distance to the vehicle's bounding box
                tempBox.setFromObject(mesh);
                const dist = tempBox.distanceToPoint(playerPos);

                // Calculate View Alignment (Looking at vehicle?)
                tempBox.getCenter(center);
                dirToVehicle.subVectors(center, playerPos).normalize();
                const alignment = camDir.dot(dirToVehicle);

                // Check Proximity AND View Alignment
                if (dist < INTERACTION_RADIUS) {
                    if (alignment > VIEW_THRESHOLD) {
                        // Priority: Closest distance among those we are looking at
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestVehicle = vehicle;
                        }
                    }
                }
            }

            if (closestVehicle) {
                // Determine type
                const isCar = closestVehicle instanceof CarPhysics;
                const isPlane = closestVehicle instanceof PlanePhysics;

                if (isCar) {
                    console.log('Entering Car');
                    this.isOnFoot = false;
                    this.activeVehicle = 'car';
                    this.car = closestVehicle; // Set active car
                    this.carMesh = closestVehicle.mesh;

                    this.cameraController.setVehicleType('car');
                    this.cameraController.setPlayerMode(false);
                    this.cameraController.currentModeIndex = 0; // Chase

                    if (this.carMesh) {
                        this.carMesh.visible = !this.cameraController.isCockpitMode;
                    }

                } else if (isPlane) {
                    console.log('Entering Plane');
                    this.isOnFoot = false;
                    this.activeVehicle = 'plane';
                    this.plane = closestVehicle; // Set active plane
                    this.planeMesh = closestVehicle.mesh;

                    this.cameraController.setVehicleType('plane');
                    this.cameraController.setPlayerMode(false);
                    // Switch to flight cam
                    const flightIndex = this.cameraController.modes.indexOf('flight');
                    if (flightIndex >= 0) this.cameraController.currentModeIndex = flightIndex;
                }
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
            const vehicleQuat = this.activeVehicle === 'car' ? this.car.physics.quaternion : this.plane.mesh.quaternion;

            // Offset slightly so we don't spawn inside
            const offset = new THREE.Vector3(3, 0, 0); // Side
            if (this.activeVehicle === 'car') {
                offset.set(-3, 0, 0); // Left of car
            } else {
                offset.set(5, 0, 0); // Side of plane
            }
            offset.applyQuaternion(vehicleQuat);

            const exitPos = vehiclePos.clone().add(offset);

            // Ensure on ground
            if (this.terrain) {
                const groundH = this.terrain.getHeightAt(exitPos.x, exitPos.z);
                exitPos.y = groundH + this.player.specs.height;
            }

            this.player.setPosition(exitPos, 0);

            // Hide cockpit overlay if visible
            if (this.cockpitOverlay) {
                this.cockpitOverlay.classList.add('hidden');
            }

            // Don't nullify activeVehicle/car/plane strictly if we want them to stay valid references,
            // but for logic we set activeVehicle to null or keep it for HUD logic??
            // Main loop checks !isOnFoot && activeVehicle, so clearing activeVehicle is safe for input blocking
            // but we might want to keep this.car assigned for updates if we want it to simulate while we walk?
            // Current _animate loop updates all spawnedVehicles regardless, but only passes input if active.
            // So we can leave this.car/this.plane assigned.

            // Just update HUD state via logic
            this.activeVehicle = null;
        }
    }
}

// Start game
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
