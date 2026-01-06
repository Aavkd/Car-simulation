import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { InputHandler } from './input.js';
import { CameraController } from './camera.js';
import { TerrainGenerator } from './terrain.js';
import { CarPhysics } from './car.js';
import { SkySystem } from './sky.js';

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
        this.sky = null;

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
        this._setupRenderer();
        this._setupScene();
        this._setupLighting();
        this._setupPostProcessing();
        this._setupInput();

        // Generate terrain
        this.terrain = new TerrainGenerator();
        const terrainMesh = this.terrain.generate();
        this.scene.add(terrainMesh);

        // Load car model
        await this._loadCarModel();

        // Setup camera controller (pass canvas for mouse events)
        this.cameraController = new CameraController(this.camera, this.canvas);
        this.input.onCameraChange = () => this.cameraController.nextMode();

        // Initialize car physics
        this.car = new CarPhysics(this.carMesh, this.terrain, this.scene);
        this.input.onDebugToggle = () => this.car.toggleDebug();

        // Time control callbacks
        this.input.onTimePause = () => this._toggleTimePause();
        this.input.onTimePreset = (preset) => this._setTimePreset(preset);

        // Headlights callback
        this.input.onHeadlightsToggle = () => this._toggleHeadlights();

        // Start position
        const startX = 0;
        const startZ = 0;
        const startHeight = this.terrain.getHeightAt(startX, startZ) + 2;
        this.car.position.set(startX, startHeight, startZ);

        // Hide loading screen
        this.loadingScreen.classList.add('hidden');

        // Start game loop
        this._animate();
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

    async _loadCarModel() {
        const loader = new GLTFLoader();

        return new Promise((resolve, reject) => {
            loader.load(
                'assets/models/Toyota AE86.glb',
                (gltf) => {
                    this.carMesh = gltf.scene;

                    // Scale and position adjustments
                    this.carMesh.scale.setScalar(1);

                    // Enable shadows
                    this.carMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

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

        // Update input
        this.input.update(deltaTime);

        // Update car physics
        if (this.car) {
            this.car.update(deltaTime, this.input);

            // Update sun shadow to follow car
            if (this.sun) {
                this.sun.target.position.copy(this.car.position);
                this.sun.target.updateMatrixWorld();
            }
        }

        // Update sky system with time controls
        if (this.sky) {
            // Handle continuous time forward/backward
            let effectiveTimeSpeed = this.timeSpeed;
            if (this.input.keys.timeForward) {
                effectiveTimeSpeed = 10.0;  // Fast forward
            } else if (this.input.keys.timeBackward) {
                effectiveTimeSpeed = -10.0;  // Rewind
            }
            
            // Temporarily adjust day duration based on speed
            if (!this.timePaused) {
                const baseDuration = 300;  // 5 minutes base
                this.sky.setDayDuration(baseDuration / Math.abs(effectiveTimeSpeed));
                
                // Handle rewind by manually adjusting time
                if (effectiveTimeSpeed < 0) {
                    this.sky.setPaused(true);
                    const rewindAmount = deltaTime * Math.abs(effectiveTimeSpeed) / baseDuration;
                    this.sky.setTime(this.sky.getTime() - rewindAmount);
                } else {
                    this.sky.setPaused(false);
                }
            }
            
            this.sky.update(deltaTime, this.camera.position);

            // Update car headlights based on time of day (unless manual override)
            if (this.car && !this.headlightsManualOverride) {
                this.car.setHeadlights(this.sky.isNight());
            }
        }

        // Update camera
        if (this.cameraController && this.carMesh) {
            // Apply gamepad camera control
            if (this.input.gamepad) {
                // Adjust sensitivity as needed
                this.cameraController.handleAnalogInput(
                    this.input.gamepad.lookX,
                    this.input.gamepad.lookY,
                    20.0 // Stick needs much higher multiplier than mouse pixels
                );
            }

            this.cameraController.update(
                this.carMesh,
                this.car ? Math.abs(this.car.speed) : 0,
                deltaTime
            );
        }

        // Update HUD
        this._updateHUD();

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

    _toggleRetroFilter() {
        this.retroEnabled = !this.retroEnabled;
        if (this.retroPass) {
            this.retroPass.enabled = this.retroEnabled;
        }
    }
}

// Start game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
