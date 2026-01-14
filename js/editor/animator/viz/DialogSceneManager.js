/**
 * DialogSceneManager.js
 * Advanced Visualization - Phase 6.1
 * 
 * Manages an isolated THREE.js scene for 3D preview inside the ImportDialog.
 * Provides split-screen visualization of source skeleton and target mesh.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * DialogSceneManager - Isolated 3D preview for import dialog
 */
export class DialogSceneManager {
    constructor() {
        // Renderers
        this.renderer = null;
        this.canvas = null;

        // Scene for source skeleton
        this.sourceScene = null;
        this.sourceCamera = null;
        this.sourceControls = null;

        // Scene for target mesh (split view)
        this.targetScene = null;
        this.targetCamera = null;
        this.targetControls = null;

        // Content references
        this.sourceSkeleton = null;
        this.sourceSkeletonHelper = null;
        this.sourceMesh = null;
        this.targetMesh = null;
        this.targetSkeletonHelper = null;

        // Animation state
        this.mixer = null;
        this.currentAction = null;
        this.isPlaying = false;
        this.clock = new THREE.Clock();

        // Split view state
        this.splitViewEnabled = false;

        // Render loop
        this.animationFrameId = null;
        this.isActive = false;

        // Container reference
        this.containerElement = null;

        // Callbacks
        this.onTimeUpdate = null;
    }

    /**
     * Initialize the scene manager
     * @param {HTMLElement} container - DOM element to attach renderer
     */
    initialize(container) {
        if (this.renderer) {
            console.warn('[DialogSceneManager] Already initialized');
            return;
        }

        this.containerElement = container;

        const width = container.clientWidth || 400;
        const height = container.clientHeight || 300;

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x1a1a2e, 1);
        this.renderer.autoClear = false;

        this.canvas = this.renderer.domElement;
        this.canvas.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
            border-radius: 6px;
        `;
        container.appendChild(this.canvas);

        // Create source scene (left/full)
        this._setupSourceScene();

        // Create target scene (right, for split view)
        this._setupTargetScene();

        // Handle resize
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(container);

        console.log('[DialogSceneManager] Initialized');
    }

    /**
     * Setup the source skeleton scene
     * @private
     */
    _setupSourceScene() {
        this.sourceScene = new THREE.Scene();
        this.sourceScene.background = new THREE.Color(0x1a1a2e);

        // Camera
        this.sourceCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        this.sourceCamera.position.set(0, 100, 200);

        // Controls
        this.sourceControls = new OrbitControls(this.sourceCamera, this.canvas);
        this.sourceControls.enableDamping = true;
        this.sourceControls.dampingFactor = 0.1;
        this.sourceControls.target.set(0, 80, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1);
        this.sourceScene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 100, 50);
        this.sourceScene.add(directionalLight);

        // Grid
        const gridHelper = new THREE.GridHelper(200, 20, 0x444466, 0x333355);
        this.sourceScene.add(gridHelper);

        // Label
        this._addSceneLabel(this.sourceScene, 'SOURCE', -80);
    }

    /**
     * Setup the target mesh scene (for split view)
     * @private
     */
    _setupTargetScene() {
        this.targetScene = new THREE.Scene();
        this.targetScene.background = new THREE.Color(0x1e2a3a);

        // Camera
        this.targetCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        this.targetCamera.position.set(0, 100, 200);

        // Controls (will be created when split view is enabled)
        this.targetControls = null;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1);
        this.targetScene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 100, 50);
        this.targetScene.add(directionalLight);

        // Grid
        const gridHelper = new THREE.GridHelper(200, 20, 0x445566, 0x334455);
        this.targetScene.add(gridHelper);

        // Label
        this._addSceneLabel(this.targetScene, 'TARGET', -80);
    }

    /**
     * Add a floating text label to a scene
     * @private
     */
    _addSceneLabel(scene, text, zPos) {
        // Using a simple sprite for now
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 256, 64);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);

        sprite.position.set(0, 180, zPos);
        sprite.scale.set(50, 12.5, 1);

        scene.add(sprite);
    }

    /**
     * Show source skeleton from imported data
     * @param {THREE.Skeleton} skeleton - The imported skeleton
     * @param {THREE.Object3D} scene - Optional scene object containing mesh
     */
    showSourceSkeleton(skeleton, scene = null) {
        // Clear previous
        this._clearSourceContent();

        this.sourceSkeleton = skeleton;

        if (scene) {
            // Clone the scene to avoid polluting the original
            this.sourceMesh = scene.clone();
            this.sourceScene.add(this.sourceMesh);

            // Center the model
            const box = new THREE.Box3().setFromObject(this.sourceMesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            this.sourceMesh.position.sub(center);
            this.sourceMesh.position.y += size.y / 2;

            // Adjust camera
            const maxDim = Math.max(size.x, size.y, size.z);
            this.sourceCamera.position.set(0, size.y * 0.6, maxDim * 2);
            this.sourceControls.target.set(0, size.y * 0.4, 0);
        } else if (skeleton) {
            // Just show skeleton helper
            const bone = skeleton.bones[0];
            if (bone) {
                const root = bone.parent || bone;
                this.sourceSkeletonHelper = new THREE.SkeletonHelper(root);
                this.sourceSkeletonHelper.material.linewidth = 2;
                this.sourceScene.add(this.sourceSkeletonHelper);
            }
        }

        this.sourceControls.update();
    }

    /**
     * Show target mesh for comparison
     * @param {THREE.Object3D} mesh - The target character mesh
     */
    showTargetMesh(mesh) {
        // Clear previous
        this._clearTargetContent();

        if (!mesh) return;

        // Clone the mesh
        this.targetMesh = mesh.clone();
        this.targetScene.add(this.targetMesh);

        // Center the model
        const box = new THREE.Box3().setFromObject(this.targetMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        this.targetMesh.position.sub(center);
        this.targetMesh.position.y += size.y / 2;

        // Adjust camera
        const maxDim = Math.max(size.x, size.y, size.z);
        this.targetCamera.position.set(0, size.y * 0.6, maxDim * 2);
        this.targetCamera.lookAt(0, size.y * 0.4, 0);
    }

    /**
     * Clear source content
     * @private
     */
    _clearSourceContent() {
        if (this.sourceMesh) {
            this.sourceScene.remove(this.sourceMesh);
            this.sourceMesh = null;
        }
        if (this.sourceSkeletonHelper) {
            this.sourceScene.remove(this.sourceSkeletonHelper);
            this.sourceSkeletonHelper = null;
        }
        this.sourceSkeleton = null;
    }

    /**
     * Clear target content
     * @private
     */
    _clearTargetContent() {
        if (this.targetMesh) {
            this.targetScene.remove(this.targetMesh);
            this.targetMesh = null;
        }
        if (this.targetSkeletonHelper) {
            this.targetScene.remove(this.targetSkeletonHelper);
            this.targetSkeletonHelper = null;
        }
    }

    /**
     * Update pose at a specific time
     * @param {THREE.AnimationClip} clip - Animation clip
     * @param {number} time - Time in seconds
     */
    updatePose(clip, time) {
        if (!this.sourceMesh || !clip) return;

        // Create temporary mixer if needed
        if (!this.mixer) {
            this.mixer = new THREE.AnimationMixer(this.sourceMesh);
        }

        // Create action if different clip
        if (!this.currentAction || this.currentAction.getClip() !== clip) {
            this.mixer.stopAllAction();
            this.currentAction = this.mixer.clipAction(clip);
            this.currentAction.play();
            this.currentAction.paused = true;
        }

        // Set time
        this.currentAction.time = time;
        this.mixer.update(0);
    }

    /**
     * Start animation playback
     * @param {THREE.AnimationClip} clip - Animation clip to play
     */
    startPlayback(clip) {
        if (!this.sourceMesh || !clip) return;

        if (!this.mixer) {
            this.mixer = new THREE.AnimationMixer(this.sourceMesh);
        }

        this.mixer.stopAllAction();
        this.currentAction = this.mixer.clipAction(clip);
        this.currentAction.play();
        this.isPlaying = true;
        this.clock.start();
    }

    /**
     * Stop animation playback
     */
    stopPlayback() {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        this.isPlaying = false;
        this.currentAction = null;
    }

    /**
     * Pause/resume playback
     * @param {boolean} paused 
     */
    setPaused(paused) {
        if (this.currentAction) {
            this.currentAction.paused = paused;
        }
        this.isPlaying = !paused;
    }

    /**
     * Toggle split view mode
     * @param {boolean} enabled 
     */
    setSplitView(enabled) {
        this.splitViewEnabled = enabled;

        if (enabled && !this.targetControls) {
            // Create target controls for right viewport
            // Note: OrbitControls need special handling for split view
            // For now, they share mouse events
        }

        this._onResize();
    }

    /**
     * Get current playback time
     * @returns {number}
     */
    getCurrentTime() {
        return this.currentAction ? this.currentAction.time : 0;
    }

    /**
     * Get clip duration
     * @returns {number}
     */
    getDuration() {
        return this.currentAction ? this.currentAction.getClip().duration : 0;
    }

    /**
     * Start rendering
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.clock.start();
        this._render();

        console.log('[DialogSceneManager] Rendering started');
    }

    /**
     * Stop rendering
     */
    stop() {
        this.isActive = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        console.log('[DialogSceneManager] Rendering stopped');
    }

    /**
     * Main render loop
     * @private
     */
    _render() {
        if (!this.isActive) return;

        this.animationFrameId = requestAnimationFrame(() => this._render());

        const dt = this.clock.getDelta();

        // Update controls
        if (this.sourceControls) {
            this.sourceControls.update();
        }

        // Update animation
        if (this.mixer && this.isPlaying) {
            this.mixer.update(dt);

            if (this.onTimeUpdate && this.currentAction) {
                this.onTimeUpdate(this.currentAction.time, this.getDuration());
            }
        }

        // Clear
        this.renderer.clear();

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        if (this.splitViewEnabled) {
            // Split view: render both scenes side by side
            const halfWidth = Math.floor(width / 2);

            // Left viewport (source)
            this.renderer.setViewport(0, 0, halfWidth, height);
            this.renderer.setScissor(0, 0, halfWidth, height);
            this.renderer.setScissorTest(true);
            this.sourceCamera.aspect = halfWidth / height;
            this.sourceCamera.updateProjectionMatrix();
            this.renderer.render(this.sourceScene, this.sourceCamera);

            // Right viewport (target)
            this.renderer.setViewport(halfWidth, 0, halfWidth, height);
            this.renderer.setScissor(halfWidth, 0, halfWidth, height);
            this.targetCamera.aspect = halfWidth / height;
            this.targetCamera.updateProjectionMatrix();
            this.renderer.render(this.targetScene, this.targetCamera);

            // Reset scissor
            this.renderer.setScissorTest(false);
        } else {
            // Full view: render only source scene
            this.renderer.setViewport(0, 0, width, height);
            this.sourceCamera.aspect = width / height;
            this.sourceCamera.updateProjectionMatrix();
            this.renderer.render(this.sourceScene, this.sourceCamera);
        }
    }

    /**
     * Handle container resize
     * @private
     */
    _onResize() {
        if (!this.containerElement || !this.renderer) return;

        const width = this.containerElement.clientWidth;
        const height = this.containerElement.clientHeight;

        if (width === 0 || height === 0) return;

        this.renderer.setSize(width, height);

        // Update camera aspects
        if (this.splitViewEnabled) {
            const halfWidth = width / 2;
            this.sourceCamera.aspect = halfWidth / height;
            this.targetCamera.aspect = halfWidth / height;
        } else {
            this.sourceCamera.aspect = width / height;
        }

        this.sourceCamera.updateProjectionMatrix();
        this.targetCamera.updateProjectionMatrix();
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.stop();

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }

        this._clearSourceContent();
        this._clearTargetContent();

        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        if (this.sourceControls) {
            this.sourceControls.dispose();
        }

        if (this.targetControls) {
            this.targetControls.dispose();
        }

        if (this.renderer) {
            this.renderer.dispose();

            if (this.canvas && this.canvas.parentNode) {
                this.canvas.parentNode.removeChild(this.canvas);
            }
        }

        this.renderer = null;
        this.canvas = null;
        this.sourceScene = null;
        this.targetScene = null;

        console.log('[DialogSceneManager] Disposed');
    }
}

export default DialogSceneManager;
