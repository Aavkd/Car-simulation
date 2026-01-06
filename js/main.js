import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { InputHandler } from './input.js';
import { CameraController } from './camera.js';
import { TerrainGenerator } from './terrain.js';
import { CarPhysics } from './car.js';

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

        // Game systems
        this.input = null;
        this.cameraController = null;
        this.terrain = null;
        this.car = null;
        this.carMesh = null;

        // Timing
        this.clock = new THREE.Clock();
        this.lastTime = 0;

        // HUD elements
        this.hudElements = {
            speedValue: document.querySelector('.speed-value'),
            gearValue: document.querySelector('.gear-value'),
            rpmFill: document.querySelector('.rpm-fill')
        };

        this._init();
    }

    async _init() {
        this._setupRenderer();
        this._setupScene();
        this._setupLighting();
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

        // Sky gradient background
        this.scene.background = new THREE.Color(0x87CEEB);

        // Fog for depth (extended for massive map)
        this.scene.fog = new THREE.Fog(0x87CEEB, 300, 2000);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            6000  // Extended far plane for massive terrain
        );
        this.camera.position.set(0, 5, 10);
    }

    _setupLighting() {
        // Ambient light (sky color)
        const ambient = new THREE.AmbientLight(0x6699CC, 0.5);
        this.scene.add(ambient);

        // Hemisphere light (sky/ground gradient)
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3d5c3d, 0.6);
        this.scene.add(hemi);

        // Directional sun light
        const sun = new THREE.DirectionalLight(0xFFE4B5, 1.2);
        sun.position.set(100, 100, 50);
        sun.castShadow = true;

        // Shadow settings
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        sun.shadow.bias = -0.0005;

        this.scene.add(sun);
        this.sun = sun;
    }

    _setupInput() {
        this.input = new InputHandler();
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
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const deltaTime = this.clock.getDelta();

        // Update input
        this.input.update(deltaTime);

        // Update car physics
        if (this.car) {
            this.car.update(deltaTime, this.input);

            // Update sun position to follow car (for shadows)
            this.sun.position.set(
                this.car.position.x + 100,
                100,
                this.car.position.z + 50
            );
            this.sun.target.position.copy(this.car.position);
            this.sun.target.updateMatrixWorld();
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

        // Render
        this.renderer.render(this.scene, this.camera);
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
    }
}

// Start game
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
