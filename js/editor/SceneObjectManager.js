import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

        // GLTF Loader for models
        this.loader = new GLTFLoader();

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

        // Load preview model
        try {
            const gltf = await this._loadModel(assetConfig.path);
            this.placementPreview = gltf.scene.clone();
            this.placementPreview.traverse(child => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.5;
                    child.material.color.setHex(0x00ff00);
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
            const gltf = await this._loadModel(assetPath);
            const object = gltf.scene;

            // Apply position
            object.position.copy(position);

            // Store metadata
            object.userData = {
                id: this._generateId(),
                assetPath: assetPath,
                type: metadata.type || 'object',
                name: metadata.name || assetPath.split('/').pop().replace('.glb', ''),
                ...metadata,
                modified: false
            };

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

        for (const data of objectsData) {
            const object = await this.addObject(data.assetPath, new THREE.Vector3(), {
                id: data.id,
                name: data.name,
                type: data.type
            });

            if (object) {
                object.position.set(data.position.x, data.position.y, data.position.z);
                object.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                object.scale.set(data.scale.x, data.scale.y, data.scale.z);
            }
        }

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
            this.loader.load(path, resolve, undefined, reject);
        });
    }

    _generateId() {
        return 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    _serializeObject(object) {
        return {
            id: object.userData.id,
            assetPath: object.userData.assetPath,
            name: object.userData.name,
            type: object.userData.type,
            position: { x: object.position.x, y: object.position.y, z: object.position.z },
            rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
            scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        };
    }

    async _restoreObject(data) {
        const object = await this.addObject(data.assetPath, new THREE.Vector3(), {
            id: data.id,
            name: data.name,
            type: data.type
        });

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
            this.addObject(this.placementAsset.path, position, {
                name: this.placementAsset.name,
                type: this.placementAsset.type || 'object'
            });
            // Stay in placement mode for multiple placements (hold ESC to cancel)
            return;
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
     * Dispose and cleanup
     */
    dispose() {
        this.disable();
        this.clearAllObjects();
        this.scene.remove(this.transformControls);
        this.transformControls.dispose();
    }
}
