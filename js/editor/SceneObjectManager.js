import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { BlackHole } from '../environment/BlackHole.js';

/**
 * SceneObjectManager - Manages object placement, selection, and manipulation in editor
 */
export class SceneObjectManager {
    constructor(scene, camera, renderer, terrain) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.terrain = terrain;

        // Track all placed objects
        this.objects = [];
        this.selectedObject = null;

        // Raycaster for selection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Transform controls
        this.transformControls = new TransformControls(camera, renderer.domElement);
        this.transformControls.addEventListener('change', () => {
            // Mark selected object as modified
            if (this.selectedObject) {
                this.selectedObject.userData.modified = true;
            }
        });
        this.transformControls.addEventListener('dragging-changed', (event) => {
            // Notify external systems (e.g., FlyControls) to disable during transform
            if (this.onDraggingChanged) {
                this.onDraggingChanged(event.value);
            }
        });
        this.scene.add(this.transformControls);

        // Loaders
        this.loader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();

        // Placement mode
        this.placementMode = false;
        this.placementAsset = null;
        this.placementPreview = null;

        // Undo/redo stack
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        // Callbacks
        this.onDraggingChanged = null;
        this.onSelectionChanged = null;

        // Bind event handlers
        this._onClick = this._onClick.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);

        this.enabled = false;
    }

    /**
     * Enable the object manager
     */
    enable() {
        if (this.enabled) return;
        this.enabled = true;

        this.renderer.domElement.addEventListener('click', this._onClick);
        this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('keydown', this._onKeyDown);

        console.log('[SceneObjectManager] Enabled');
    }

    /**
     * Disable the object manager
     */
    disable() {
        if (!this.enabled) return;
        this.enabled = false;

        this.renderer.domElement.removeEventListener('click', this._onClick);
        this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('keydown', this._onKeyDown);

        // Clear selection
        this.deselectObject();
        this.cancelPlacement();

        console.log('[SceneObjectManager] Disabled');
    }

    /**
     * Enter placement mode with an asset
     * @param {Object} assetConfig - Asset configuration with path and metadata
     */
    async enterPlacementMode(assetConfig) {
        this.cancelPlacement();
        this.placementMode = true;
        this.placementAsset = assetConfig;

        // Handle procedural assets differently
        if (assetConfig.procedural) {
            // Create a simple preview sphere for procedural objects
            const previewGeom = new THREE.SphereGeometry(5, 16, 16);
            const previewMat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.3,
                wireframe: true
            });
            this.placementPreview = new THREE.Mesh(previewGeom, previewMat);
            this.placementPreview.userData.procedural = true;
            this.scene.add(this.placementPreview);
            this.renderer.domElement.style.cursor = 'crosshair';
            console.log(`[SceneObjectManager] Placement mode (procedural): ${assetConfig.name}`);
            return;
        }

        // Load preview model for regular assets
        try {
            const loadedData = await this._loadModel(assetConfig.path);
            let object;

            if (loadedData.scene) {
                object = loadedData.scene; // GLTF based, original scene remains
            } else {
                object = loadedData; // FBX based
            }

            // Use SkeletonUtils to clone correctly for preview (handling skinned meshes)
            this.placementPreview = SkeletonUtils.clone(object);

            // Apply scale if specified in asset config
            if (assetConfig.scale) {
                this.placementPreview.scale.setScalar(assetConfig.scale);
            }

            this.placementPreview.traverse(child => {
                if (child.isMesh) {
                    // Handle multi-material
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => {
                            const newMat = m.clone();
                            newMat.transparent = true;
                            newMat.opacity = 0.5;
                            newMat.color.setHex(0x00ff00);
                            return newMat;
                        });
                    } else if (child.material && child.material.clone) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 0.5;
                        child.material.color.setHex(0x00ff00);
                    }
                }
            });
            this.scene.add(this.placementPreview);
            this.renderer.domElement.style.cursor = 'crosshair';
            console.log(`[SceneObjectManager] Placement mode: ${assetConfig.name}`);
        } catch (error) {
            console.error('[SceneObjectManager] Failed to load placement preview:', error);
            this.cancelPlacement();
        }
    }

    /**
     * Cancel placement mode
     */
    cancelPlacement() {
        this.placementMode = false;
        this.placementAsset = null;
        if (this.placementPreview) {
            this.scene.remove(this.placementPreview);
            this.placementPreview = null;
        }
        this.renderer.domElement.style.cursor = 'default';
    }

    /**
     * Add an object to the scene
     * @param {string} assetPath - Path to the GLB model
     * @param {THREE.Vector3} position - World position
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<THREE.Object3D>}
     */
    async addObject(assetPath, position, metadata = {}) {
        try {
            const loadedData = await this._loadModel(assetPath);
            let object;
            let animations = [];

            if (loadedData.scene) {
                object = loadedData.scene; // GLTF
                animations = loadedData.animations || [];
            } else {
                object = loadedData; // FBX
                animations = loadedData.animations || []; // FBX animations usually attach to root too
            }

            // Safe Clone using SkeletonUtils to preserve skinning
            object = SkeletonUtils.clone(object);

            // Re-attach animations to userData so they persist
            if (animations.length > 0) {
                object.userData.animations = animations;
            } else if (loadedData.userData && loadedData.userData.animations) {
                object.userData.animations = loadedData.userData.animations;
            }

            // Apply position
            object.position.copy(position);

            // Apply scale if provided in metadata (e.g. from asset config)
            if (metadata.scale !== undefined) {
                if (typeof metadata.scale === 'number') {
                    object.scale.setScalar(metadata.scale);
                } else if (metadata.scale && typeof metadata.scale === 'object') {
                    object.scale.set(metadata.scale.x || 1, metadata.scale.y || 1, metadata.scale.z || 1);
                }
            }

            // Store metadata
            object.userData = {
                id: this._generateId(),
                assetPath: assetPath,
                type: metadata.type || 'object',
                name: metadata.name || assetPath.split('/').pop().replace('.glb', ''),
                ...metadata,
                modified: false,
                animations: object.userData.animations // Ensure accessible
            };

            // Link entities for picking 
            // IMPORTANT: Removed child.userData.entity = object assignment to prevent circular references in JSON serialization during Play Mode transition.
            // The AnimatorEditorController now handles finding the root entity by traversing up the parent chain or checking userData.id.

            // Enable shadows
            object.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.scene.add(object);
            this.objects.push(object);

            // Record for undo
            this._recordAction({
                type: 'add',
                objectId: object.userData.id,
                data: this._serializeObject(object)
            });

            console.log(`[SceneObjectManager] Added object: ${object.userData.name}`);
            return object;
        } catch (error) {
            console.error('[SceneObjectManager] Failed to add object:', error);
            return null;
        }
    }

    /**
     * Add a procedural object to the scene
     * @param {Object} assetConfig - Asset configuration with generator and options
     * @param {THREE.Vector3} position - World position
     * @param {Object} metadata - Additional metadata (for restoring saved objects)
     * @returns {THREE.Object3D}
     */
    addProceduralObject(assetConfig, position, metadata = {}) {
        let object;
        let proceduralInstance;

        // Create the appropriate procedural object based on generator type
        switch (assetConfig.generator) {
            case 'BlackHole':
                const options = { ...assetConfig.options, ...metadata.proceduralOptions };
                proceduralInstance = new BlackHole(options);
                object = proceduralInstance.mesh;
                break;
            case 'TriggerVolume':
                const trigOpts = { ...assetConfig.options, ...metadata.proceduralOptions };
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshBasicMaterial({
                    color: trigOpts.color,
                    transparent: true,
                    opacity: trigOpts.opacity,
                    wireframe: false,
                    depthWrite: false
                });
                object = new THREE.Mesh(geometry, material);
                object.scale.set(trigOpts.width || 5, trigOpts.height || 5, trigOpts.depth || 5);

                // Add wireframe helper
                const edges = new THREE.EdgesGeometry(geometry);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
                object.add(line);

                // Mock instance interface for update loop/config
                proceduralInstance = {
                    mesh: object,
                    update: () => { }, // No animation
                    getConfig: () => ({
                        width: object.scale.x,
                        height: object.scale.y,
                        depth: object.scale.z,
                        color: '#' + object.material.color.getHexString(),
                        opacity: object.material.opacity
                    })
                };
                break;
            default:
                console.error(`[SceneObjectManager] Unknown procedural generator: ${assetConfig.generator}`);
                return null;
        }

        // Apply position
        object.position.copy(position);

        // Store metadata
        object.userData = {
            id: metadata.id || this._generateId(),
            assetId: assetConfig.id,
            procedural: true,
            generator: assetConfig.generator,
            type: 'procedural',
            name: metadata.name || assetConfig.name,
            proceduralInstance: proceduralInstance,
            proceduralOptions: proceduralInstance.getConfig(),
            modified: false
        };

        this.scene.add(object);
        this.objects.push(object);

        // Record for undo
        this._recordAction({
            type: 'add',
            objectId: object.userData.id,
            data: this._serializeObject(object)
        });

        console.log(`[SceneObjectManager] Added procedural object: ${object.userData.name}`);
        return object;
    }

    /**
     * Remove an object from the scene
     * @param {THREE.Object3D} object 
     */
    removeObject(object) {
        if (!object) return;

        // Record for undo
        this._recordAction({
            type: 'remove',
            objectId: object.userData.id,
            data: this._serializeObject(object)
        });

        // Deselect if selected
        if (this.selectedObject === object) {
            this.deselectObject();
        }

        // Remove from scene and tracking
        this.scene.remove(object);
        const index = this.objects.indexOf(object);
        if (index > -1) {
            this.objects.splice(index, 1);
        }

        console.log(`[SceneObjectManager] Removed object: ${object.userData.name}`);
    }

    enterPickingMode(callback) {
        this.isPicking = true;
        this.onPick = callback;
        this.renderer.domElement.style.cursor = 'help'; // Indicate picking
        this.deselectObject();
        console.log('[SceneObjectManager] Entered picking mode');
    }

    exitPickingMode() {
        this.isPicking = false;
        this.onPick = null;
        this.renderer.domElement.style.cursor = 'default';
        console.log('[SceneObjectManager] Exited picking mode');
    }

    /**
     * Select an object
     * @param {THREE.Object3D} object 
     */
    selectObject(object) {
        if (this.selectedObject === object) return;

        this.deselectObject();
        this.selectedObject = object;

        if (object) {
            this.transformControls.attach(object);
            if (this.onSelectionChanged) {
                this.onSelectionChanged(object);
            }
            console.log(`[SceneObjectManager] Selected: ${object.userData.name}`);
        }
    }

    /**
     * Deselect current object
     */
    deselectObject() {
        if (this.selectedObject) {
            this.transformControls.detach();
            this.selectedObject = null;
            if (this.onSelectionChanged) {
                this.onSelectionChanged(null);
            }
        }
    }

    /**
     * Duplicate the selected object
     */
    async duplicateSelected() {
        if (!this.selectedObject) return;

        const original = this.selectedObject;
        const offset = new THREE.Vector3(2, 0, 2);
        const newPosition = original.position.clone().add(offset);

        // Be careful with assetPath if it's missing (procedural?)
        if (!original.userData.assetPath) {
            console.warn("Cannot duplicate procedural or path-less object yet");
            return;
        }

        const newObject = await this.addObject(
            original.userData.assetPath,
            newPosition,
            {
                name: original.userData.name + '_copy',
                type: original.userData.type
            }
        );

        if (newObject) {
            // Copy rotation and scale
            newObject.rotation.copy(original.rotation);
            newObject.scale.copy(original.scale);
            this.selectObject(newObject);
        }
    }

    /**
     * Snap selected object to ground
     */
    snapToGround() {
        if (!this.selectedObject || !this.terrain) return;

        const pos = this.selectedObject.position;
        const groundHeight = this.terrain.getHeightAt(pos.x, pos.z);

        // Get object bounding box to place bottom on ground
        const box = new THREE.Box3().setFromObject(this.selectedObject);
        const objectBottom = box.min.y - pos.y;

        pos.y = groundHeight - objectBottom;
        console.log(`[SceneObjectManager] Snapped to ground at y=${pos.y.toFixed(2)}`);
    }

    /**
     * Set transform mode
     * @param {string} mode - 'translate', 'rotate', or 'scale'
     */
    setTransformMode(mode) {
        this.transformControls.setMode(mode);
        console.log(`[SceneObjectManager] Transform mode: ${mode}`);
    }

    /**
     * Get all objects data for serialization
     * @returns {Array}
     */
    getObjectsData() {
        return this.objects.map(obj => this._serializeObject(obj));
    }

    /**
     * Load objects from data
     * @param {Array} objectsData 
     */
    async loadObjects(objectsData) {
        // Clear existing objects
        this.clearAllObjects();

        console.log(`[SceneObjectManager] Loading ${objectsData.length} objects...`);
        for (const data of objectsData) {
            try {
                // Use _restoreObject to handle both standard and procedural objects
                await this._restoreObject(data);
            } catch (err) {
                console.error(`[SceneObjectManager] Failed to load object ${data.name}:`, err);
            }
        }
        console.log('[SceneObjectManager] Objects loaded.');

        // Clear undo stack after load
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Clear all placed objects
     */
    clearAllObjects() {
        this.deselectObject();
        for (const obj of this.objects) {
            this.scene.remove(obj);
        }
        this.objects = [];
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return;

        const action = this.undoStack.pop();
        this.redoStack.push(action);

        // Reverse the action
        if (action.type === 'add') {
            const obj = this.objects.find(o => o.userData.id === action.objectId);
            if (obj) {
                this.scene.remove(obj);
                this.objects = this.objects.filter(o => o !== obj);
            }
        } else if (action.type === 'remove') {
            // Re-add the object
            this._restoreObject(action.data);
        }

        console.log('[SceneObjectManager] Undo');
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return;

        const action = this.redoStack.pop();
        this.undoStack.push(action);

        // Re-apply the action
        if (action.type === 'add') {
            this._restoreObject(action.data);
        } else if (action.type === 'remove') {
            const obj = this.objects.find(o => o.userData.id === action.objectId);
            if (obj) {
                this.scene.remove(obj);
                this.objects = this.objects.filter(o => o !== obj);
            }
        }

        console.log('[SceneObjectManager] Redo');
    }

    // === Private Methods ===

    async _loadModel(path) {
        return new Promise((resolve, reject) => {
            const isFBX = path.toLowerCase().endsWith('.fbx');
            const loader = isFBX ? this.fbxLoader : this.loader;
            loader.load(path, resolve, undefined, reject);
        });
    }

    _generateId() {
        return 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    _serializeObject(object) {
        const data = {
            id: object.userData.id,
            name: object.userData.name,
            type: object.userData.type,
            position: { x: object.position.x, y: object.position.y, z: object.position.z },
            rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
            scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        };

        // Handle procedural objects
        if (object.userData.procedural) {
            data.procedural = true;
            data.assetId = object.userData.assetId;
            data.generator = object.userData.generator;
            // Get current config from the procedural instance
            if (object.userData.proceduralInstance) {
                data.proceduralOptions = object.userData.proceduralInstance.getConfig();
            } else {
                data.proceduralOptions = object.userData.proceduralOptions;
            }
        } else {
            data.assetPath = object.userData.assetPath;
        }

        // RPG NPC Data
        if (object.userData.type === 'npc' || object.userData.type === 'enemy') {
            data.npcId = object.userData.npcId;
            data.dialogueId = object.userData.dialogueId;
            data.behavior = object.userData.behavior; // { type: 'patrol', ... }
            data.flags = object.userData.flags;       // { faction: '...' }
        }

        // RPG Item Data
        if (object.userData.type === 'item') {
            data.itemId = object.userData.itemId;
        }

        return data;
    }

    async _restoreObject(data) {
        let object;

        if (data.procedural) {
            // Find the asset config from library (we need the generator info)
            const assetConfig = {
                id: data.assetId,
                generator: data.generator,
                name: data.name,
                options: data.proceduralOptions,
                procedural: true
            };
            object = this.addProceduralObject(assetConfig, new THREE.Vector3(), {
                id: data.id,
                name: data.name,
                proceduralOptions: data.proceduralOptions
            });
        } else {
            object = await this.addObject(data.assetPath, new THREE.Vector3(), {
                id: data.id,
                name: data.name,
                type: data.type,
                // Restore NPC data
                npcId: data.npcId,
                dialogueId: data.dialogueId,
                behavior: data.behavior,
                flags: data.flags,
                // Restore Item data
                itemId: data.itemId
            });
        }

        if (object) {
            object.position.set(data.position.x, data.position.y, data.position.z);
            object.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
            object.scale.set(data.scale.x, data.scale.y, data.scale.z);
        }
    }

    _recordAction(action) {
        this.undoStack.push(action);
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
        // Clear redo stack on new action
        this.redoStack = [];
    }

    _onClick(event) {
        if (!this.enabled) return;

        // Calculate mouse position in normalized device coordinates
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Handle placement mode
        if (this.placementMode && this.placementPreview) {
            const position = this.placementPreview.position.clone();

            // Handle procedural vs regular assets
            if (this.placementAsset.procedural) {
                this.addProceduralObject(this.placementAsset, position);
            } else {
                const metadata = {
                    ...this.placementAsset,
                    name: this.placementAsset.name,
                    type: this.placementAsset.type || 'object',
                    scale: this.placementAsset.scale || 1
                };
                // Remove internal/irrelevant keys if needed, but addObject handles extras fine
                delete metadata.path;

                this.addObject(this.placementAsset.path, position, metadata);
            }
            // Stay in placement mode for multiple placements (hold ESC to cancel)
            return;
        }

        // Handle picking mode
        if (this.isPicking && this.onPick) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.objects, true);

            if (intersects.length > 0) {
                let target = intersects[0].object;
                while (target.parent && !this.objects.includes(target)) {
                    target = target.parent;
                }
                if (this.objects.includes(target)) {
                    // Call callback with object info
                    this.onPick(target);
                    this.exitPickingMode();
                    return;
                }
            }
        }

        // Handle selection
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.objects, true);

        if (intersects.length > 0) {
            // Find the root object (our tracked object)
            let target = intersects[0].object;
            while (target.parent && !this.objects.includes(target)) {
                target = target.parent;
            }
            if (this.objects.includes(target)) {
                this.selectObject(target);
            }
        } else {
            this.deselectObject();
        }
    }

    _onMouseMove(event) {
        if (!this.enabled || !this.placementMode || !this.placementPreview) return;

        // Update mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycast to terrain/ground
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Try terrain mesh first
        const terrainMesh = this.terrain?.mesh;
        if (terrainMesh) {
            const intersects = this.raycaster.intersectObject(terrainMesh, true);
            if (intersects.length > 0) {
                this.placementPreview.position.copy(intersects[0].point);
                return;
            }
        }

        // Fallback: project onto ground plane
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, intersection);
        if (intersection) {
            // Get height from terrain
            if (this.terrain && this.terrain.getHeightAt) {
                intersection.y = this.terrain.getHeightAt(intersection.x, intersection.z);
            }
            this.placementPreview.position.copy(intersection);
        }
    }

    _onKeyDown(event) {
        if (!this.enabled) return;

        switch (event.code) {
            case 'Delete':
            case 'Backspace':
                if (this.selectedObject) {
                    this.removeObject(this.selectedObject);
                }
                break;
            case 'KeyW':
                if (event.shiftKey) {
                    this.setTransformMode('translate');
                }
                break;
            case 'KeyE':
                if (event.shiftKey) {
                    this.setTransformMode('rotate');
                }
                break;
            case 'KeyR':
                if (event.shiftKey) {
                    this.setTransformMode('scale');
                }
                break;
            case 'KeyD':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.duplicateSelected();
                }
                break;
            case 'KeyG':
                this.snapToGround();
                break;
            case 'KeyZ':
                if (event.ctrlKey && !event.shiftKey) {
                    event.preventDefault();
                    this.undo();
                } else if (event.ctrlKey && event.shiftKey) {
                    event.preventDefault();
                    this.redo();
                }
                break;
            case 'KeyY':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.redo();
                }
                break;
            case 'Escape':
                this.cancelPlacement();
                this.deselectObject();
                break;
        }
    }

    /**
     * Update all procedural objects (call each frame)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        for (const object of this.objects) {
            if (object.userData.procedural && object.userData.proceduralInstance) {
                object.userData.proceduralInstance.update(deltaTime);
            }
        }
    }

}
