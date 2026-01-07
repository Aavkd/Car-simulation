import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { InputHandler } from './core/input.js';
import { CameraController } from './core/camera.js';
import { TerrainGenerator } from './terrain/terrain.js';
import { CarPhysics } from './core/car.js';
import { PlayerController } from './core/player.js';
import { SkySystem } from './environment/sky.js';
import { LevelManager } from './levels/level-manager.js';
import { LevelData, getAllLevels } from './levels/level-data.js';
import { ToyotaAE86 } from './core/vehicle-specs/ToyotaAE86.js';

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

        // Setup camera controller (needed for menu showcase view)
        this.cameraController = new CameraController(this.camera, this.canvas);
        this.input.onRetroToggle = () => this._toggleRetroFilter();

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
                        ${'★'.repeat(level.difficulty)}${'☆'.repeat(3 - level.difficulty)}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => this._selectLevel(level));
            levelGrid.appendChild(card);
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

        console.log('[Game] Entered MENU state');
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

        // Load car model
        await this._loadCarModel();

        // Setup input callbacks
        this.input.onCameraChange = () => this._handleCameraChange();

        // Initialize car physics with ToyotaAE86 spec
        this.car = new CarPhysics(this.carMesh, this.terrain, this.scene, ToyotaAE86);
        this.input.onDebugToggle = () => this.car.toggleDebug();

        // Pass wheel meshes to car physics for suspension animation
        if (this.wheelMeshes) {
            this.car.setWheelMeshes(this.wheelMeshes);
        }

        // Initialize player controller (on-foot mode)
        this.player = new PlayerController(this.terrain);

        // Input callbacks
        this.input.onEnterExitVehicle = () => this._toggleVehicleMode();
        this.input.onTimePause = () => this._toggleTimePause();
        this.input.onTimePreset = (preset) => this._setTimePreset(preset);
        this.input.onHeadlightsToggle = () => this._toggleHeadlights();

        // Start position - check for custom spawn from terrain
        let startX = 0;
        let startZ = 0;
        if (this.terrain.getSpawnPosition) {
            const spawn = this.terrain.getSpawnPosition();
            startX = spawn.x;
            startZ = spawn.z;
        }
        const startHeight = this.terrain.getHeightAt(startX, startZ) + 2;
        this.car.position.set(startX, startHeight, startZ);

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
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

        // Initialize dynamic sky system
        this.sky = new SkySystem(this.scene);
        this.sky.setTime(0.35); // Start at morning
        this.sky.setDayDuration(300); // 5 minute day cycle

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
        this.retroPass.uniforms['pixelSize'].value = 9.0;  // Adjust for more/less pixelation
        this.retroPass.uniforms['colorDepth'].value = 16.0;  // 16-bit color depth
        this.retroPass.enabled = this.retroEnabled;
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

        return new Promise((resolve, reject) => {
            loader.load(
                'assets/models/Toyota AE86.glb',
                (gltf) => {
                    this.carMesh = gltf.scene;

                    // Scale and position adjustments
                    this.carMesh.scale.setScalar(1);

                    // Find wheel meshes by name pattern
                    // Common naming: FL_Wheel, FR_Wheel, RL_Wheel, RR_Wheel or similar
                    this.wheelMeshes = [null, null, null, null]; // FL, FR, RL, RR
                    const allMeshNames = [];

                    this.carMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            allMeshNames.push(child.name);
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
            // Update car physics (only when in vehicle)
            if (this.car && !this.isOnFoot) {
                this.car.update(deltaTime, this.input);

                // Update sun shadow to follow car
                if (this.sun) {
                    this.sun.target.position.copy(this.car.position);
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
                } else if (this.carMesh) {
                    if (this.input.gamepad) {
                        this.cameraController.handleAnalogInput(
                            this.input.gamepad.lookX,
                            this.input.gamepad.lookY,
                            20.0
                        );
                    }
                    this.cameraController.update(
                        this.carMesh,
                        this.car ? Math.abs(this.car.speed) : 0,
                        deltaTime
                    );
                }
            }

            // Update HUD
            this._updateHUD();
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
        }

        // Render with post-processing
        this.composer.render();
    }

    _updateHUD() {
        if (!this.car) return;

        // Speed
        this.hudElements.speedValue.textContent = Math.round(this.car.speedKmh);

        // Gear
        this.hudElements.gearValue.textContent = this.car.getGearDisplay();

        // RPM bar
        const rpmPercent = this.car.getRPMPercentage() * 100;
        this.hudElements.rpmFill.style.width = `${Math.min(rpmPercent, 100)}%`;

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

        // Toggle car 3D model visibility (hide in cockpit mode)
        if (this.carMesh) {
            this.carMesh.visible = !isCockpit;
        }

        // Toggle cockpit overlay visibility (show in cockpit mode)
        if (this.cockpitOverlay) {
            if (isCockpit) {
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

    /**
     * Toggle between vehicle and on-foot modes
     */
    _toggleVehicleMode() {
        this.isOnFoot = !this.isOnFoot;

        if (this.isOnFoot) {
            // Exiting vehicle
            console.log('[Player] Exiting vehicle');

            // Position player at driver's door (left side of car)
            const exitOffset = new THREE.Vector3(-5, 0, 0); // Left of car
            exitOffset.applyQuaternion(this.carMesh.quaternion);

            const exitPos = this.car.position.clone().add(exitOffset);
            exitPos.y = this.terrain.getHeightAt(exitPos.x, exitPos.z) + this.player.specs.height;

            // Set player position and face away from car
            this.player.setPosition(exitPos, this.car.rotation.y + Math.PI / 2);

            // Update camera controller
            this.cameraController.setPlayerMode(true);

            // Hide cockpit overlay if visible
            if (this.cockpitOverlay) {
                this.cockpitOverlay.classList.add('hidden');
            }

            // Request pointer lock for mouse look
            this.canvas.requestPointerLock();

        } else {
            // Entering vehicle
            console.log('[Player] Entering vehicle');

            // Release pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }

            // Update camera controller
            this.cameraController.setPlayerMode(false);

            // Restore car visibility in case it was hidden
            if (this.carMesh) {
                this.carMesh.visible = !this.cameraController.isCockpitMode;
            }
        }
    }
}

// Start game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
