import * as THREE from 'three';

/**
 * FlyControls - Free camera movement for editor mode
 * WASD to move, mouse-drag to look, SHIFT for speed boost, scroll for altitude
 */
export class FlyControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Movement settings
        this.moveSpeed = 50;       // Base movement speed
        this.fastMultiplier = 3;   // Speed multiplier when SHIFT held
        this.lookSpeed = 0.002;    // Mouse look sensitivity
        this.scrollSpeed = 10;     // Scroll wheel altitude speed

        // State tracking
        this.enabled = false;
        this.isRightMouseDown = false;

        // Movement keys state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false,
            fast: false
        };

        // Camera orientation
        this.yaw = 0;   // Horizontal rotation
        this.pitch = 0; // Vertical rotation (clamped)

        // Velocity for smooth movement
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        // Bind event handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
    }

    /**
     * Enable fly controls and bind events
     */
    enable() {
        if (this.enabled) return;
        this.enabled = true;

        // Initialize yaw/pitch from current camera rotation
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = euler.y;
        this.pitch = euler.x;

        // Bind events
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        this.domElement.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('mousemove', this._onMouseMove);
        this.domElement.addEventListener('wheel', this._onWheel);
        this.domElement.addEventListener('contextmenu', this._onContextMenu);

        console.log('[FlyControls] Enabled');
    }

    /**
     * Disable fly controls and unbind events
     */
    disable() {
        if (!this.enabled) return;
        this.enabled = false;

        // Reset keys
        Object.keys(this.keys).forEach(key => this.keys[key] = false);
        this.isRightMouseDown = false;

        // Unbind events
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this.domElement.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        this.domElement.removeEventListener('wheel', this._onWheel);
        this.domElement.removeEventListener('contextmenu', this._onContextMenu);

        console.log('[FlyControls] Disabled');
    }

    /**
     * Update camera position based on input
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (!this.enabled) return;

        const speed = this.moveSpeed * (this.keys.fast ? this.fastMultiplier : 1);

        // Calculate movement direction in camera space
        this.direction.set(0, 0, 0);

        if (this.keys.forward) this.direction.z -= 1;
        if (this.keys.backward) this.direction.z += 1;
        if (this.keys.left) this.direction.x -= 1;
        if (this.keys.right) this.direction.x += 1;
        if (this.keys.up) this.direction.y += 1;
        if (this.keys.down) this.direction.y -= 1;

        // Normalize if moving diagonally
        if (this.direction.lengthSq() > 0) {
            this.direction.normalize();
        }

        // Apply movement in camera's local space
        const moveX = this.direction.x * speed * deltaTime;
        const moveY = this.direction.y * speed * deltaTime;
        const moveZ = this.direction.z * speed * deltaTime;

        // Get camera's forward and right vectors
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        // Apply movement
        this.camera.position.addScaledVector(right, moveX);
        this.camera.position.addScaledVector(up, moveY);
        this.camera.position.addScaledVector(forward, -moveZ);
    }

    /**
     * Set camera position directly
     * @param {THREE.Vector3} position 
     */
    setPosition(position) {
        this.camera.position.copy(position);
    }

    /**
     * Look at a specific point
     * @param {THREE.Vector3} target 
     */
    lookAt(target) {
        this.camera.lookAt(target);
        // Update yaw/pitch from new orientation
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = euler.y;
        this.pitch = euler.x;
    }

    // === Event Handlers ===

    _onKeyDown(e) {
        if (!this.enabled) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'KeyE':
            case 'Space':
                this.keys.up = true;
                break;
            case 'KeyQ':
                this.keys.down = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.fast = true;
                break;
        }
    }

    _onKeyUp(e) {
        if (!this.enabled) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'KeyE':
            case 'Space':
                this.keys.up = false;
                break;
            case 'KeyQ':
                this.keys.down = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.fast = false;
                break;
        }
    }

    _onMouseDown(e) {
        if (!this.enabled) return;
        if (e.button === 2) { // Right mouse button
            this.isRightMouseDown = true;
            this.domElement.style.cursor = 'grabbing';
        }
    }

    _onMouseUp(e) {
        if (e.button === 2) {
            this.isRightMouseDown = false;
            this.domElement.style.cursor = 'default';
        }
    }

    _onMouseMove(e) {
        if (!this.enabled || !this.isRightMouseDown) return;

        // Update yaw and pitch based on mouse movement
        this.yaw -= e.movementX * this.lookSpeed;
        this.pitch -= e.movementY * this.lookSpeed;

        // Clamp pitch to prevent flipping
        this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

        // Apply rotation using euler angles
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
    }

    _onWheel(e) {
        if (!this.enabled) return;
        e.preventDefault();

        // Adjust altitude based on scroll
        const delta = e.deltaY > 0 ? -this.scrollSpeed : this.scrollSpeed;
        this.camera.position.y += delta;
    }

    _onContextMenu(e) {
        // Prevent context menu when right-clicking in editor
        e.preventDefault();
    }

    /**
     * Dispose of controls and cleanup
     */
    dispose() {
        this.disable();
    }
}
