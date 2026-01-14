import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { AnimationController } from '../animation/core/AnimationController.js';

/**
 * Player Controller - First-person on-foot movement
 * Allows player to walk around the world when not in the car
 */
export class PlayerController {
    constructor(terrain) {
        this.terrain = terrain;

        // ==================== PLAYER SPECS ====================
        // Note: Car is scaled ~4x, so player is also scaled to match
        this.specs = {
            walkSpeed: 20.0,        // m/s walking speed (scaled 4x)
            sprintSpeed: 40.0,      // m/s sprinting speed (scaled 4x)
            jumpForce: 25.0,        // Jump velocity (scaled)
            gravity: 60.0,          // Gravity strength (scaled)
            height: 5.5,            // Player eye height (1.7m * 4 = 6.8m)
            radius: 1.2,            // Collision radius (scaled)
            acceleration: 60.0,     // How quickly player accelerates (scaled)
            friction: 30.0          // Ground friction / deceleration (scaled)
        };

        // ==================== STATE ====================
        this.position = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = { yaw: 0, pitch: 0 };  // First-person look angles

        // Grounded state
        this.isGrounded = false;

        // Input state (set externally)
        this.moveForward = 0;
        this.moveRight = 0;
        this.isSprinting = false;
        this.jumpRequested = false;

        // Mouse look
        this.mouseSensitivity = 0.002;
        this.minPitch = -Math.PI / 2 + 0.1;  // Prevent looking straight down
        this.maxPitch = Math.PI / 2 - 0.1;   // Prevent looking straight up

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.interactables = []; // List of objects to check for interaction
        this.interactionRange = 4.0; // Distance to search for interactables

        // Animation
        this.animator = null;

        // 3D Model (Knight for third-person camera)
        this.mesh = null;
        this.meshLoaded = false;
        this.meshVisible = false;
    }

    /**
     * Set player position (e.g., when exiting car)
     * @param {THREE.Vector3} pos - New position
     * @param {number} yaw - Initial yaw rotation (facing direction)
     */
    setPosition(pos, yaw = 0) {
        this.position.copy(pos);
        this.rotation.yaw = yaw;
        this.rotation.pitch = 0;
        this.velocity.set(0, 0, 0);
    }

    /**
     * Handle mouse movement for looking around
     * @param {number} deltaX - Mouse X movement
     * @param {number} deltaY - Mouse Y movement
     */
    handleMouseLook(deltaX, deltaY) {
        this.rotation.yaw -= deltaX * this.mouseSensitivity;
        this.rotation.pitch -= deltaY * this.mouseSensitivity;

        // Clamp pitch to prevent flipping
        this.rotation.pitch = THREE.MathUtils.clamp(
            this.rotation.pitch,
            this.minPitch,
            this.maxPitch
        );
    }

    /**
     * Handle analog stick look (gamepad)
     * @param {number} x - Right stick X
     * @param {number} y - Right stick Y
     * @param {number} deltaTime - Frame time
     */
    handleAnalogLook(x, y, deltaTime) {
        const sensitivity = 2.0;
        this.rotation.yaw -= x * sensitivity * deltaTime;
        this.rotation.pitch -= y * sensitivity * deltaTime;

        // Clamp pitch
        this.rotation.pitch = THREE.MathUtils.clamp(
            this.rotation.pitch,
            this.minPitch,
            this.maxPitch
        );
    }

    /**
     * Main physics update
     * @param {number} deltaTime - Time since last frame
     * @param {object} input - Input handler reference
     */
    update(deltaTime, input) {
        const dt = Math.min(deltaTime, 0.05);

        // ==================== INPUT ====================
        // Movement input (WASD / gamepad left stick)
        let inputForward = 0;
        let inputRight = 0;

        if (input.keys.forward) inputForward += 1;
        if (input.keys.backward) inputForward -= 1;
        if (input.keys.left) inputRight -= 1;   // Q key = strafe left
        if (input.keys.right) inputRight += 1;  // D key = strafe right

        // Gamepad movement (additive, don't override keyboard)
        if (input.gamepad) {
            // Left stick X for strafe
            // Use moveX (raw) instead of steering (inverted)
            const strafe = input.gamepad.moveX !== undefined ? input.gamepad.moveX : -input.gamepad.steering;
            if (Math.abs(strafe) > 0.1) {
                inputRight += strafe;  // Stick right (positive) = strafe right
            }
            // Left stick Y for forward/backward (use moveY, not triggers)
            if (input.gamepad.moveY !== undefined && Math.abs(input.gamepad.moveY) > 0.1) {
                inputForward += input.gamepad.moveY;  // Stick up = forward
            }
        }

        this.moveForward = inputForward;
        this.moveRight = inputRight;
        this.isSprinting = input.keys.sprint;  // Shift key for sprint

        // Gamepad sprint (Square/X button)
        if (input.gamepad && input.gamepad.sprint) {
            this.isSprinting = true;
        }

        // Interaction is handled via event callback in main.js calling player.interact()

        // ==================== MOVEMENT ====================
        // Calculate movement direction based on yaw
        // Forward is the direction the player is facing
        const moveDir = new THREE.Vector3();
        const forward = new THREE.Vector3(
            -Math.sin(this.rotation.yaw),
            0,
            -Math.cos(this.rotation.yaw)
        );
        // Right vector - SWAPPED sign to fix inversion
        const right = new THREE.Vector3(
            Math.cos(this.rotation.yaw),
            0,
            -Math.sin(this.rotation.yaw)
        );

        moveDir.addScaledVector(forward, this.moveForward);
        moveDir.addScaledVector(right, this.moveRight);

        // Normalize if moving diagonally
        if (moveDir.lengthSq() > 1) {
            moveDir.normalize();
        }

        // Determine target speed
        const targetSpeed = this.isSprinting ? this.specs.sprintSpeed : this.specs.walkSpeed;

        // Apply acceleration towards target velocity
        const targetVelocity = moveDir.clone().multiplyScalar(targetSpeed);

        if (this.isGrounded) {
            // On ground: accelerate towards target
            const accel = this.specs.acceleration * dt;
            this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, accel);
            this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, accel);

            // Apply friction when no input
            if (moveDir.lengthSq() < 0.01) {
                const friction = this.specs.friction * dt;
                this.velocity.x *= Math.max(0, 1 - friction);
                this.velocity.z *= Math.max(0, 1 - friction);
            }

            // Jump
            if (this.jumpRequested) {
                this.velocity.y = this.specs.jumpForce;
                this.isGrounded = false;
                this.jumpRequested = false;
            }
        } else {
            // In air: reduced control
            const airControl = 0.3;
            const accel = this.specs.acceleration * airControl * dt;
            this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, accel);
            this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, accel);
        }

        // ==================== GRAVITY ====================
        this.velocity.y -= this.specs.gravity * dt;

        // ==================== POSITION UPDATE ====================
        this.position.addScaledVector(this.velocity, dt);

        // ==================== GROUND COLLISION ====================
        const groundHeight = this.terrain.getHeightAt(this.position.x, this.position.z);
        const playerBottom = this.position.y - this.specs.height;

        if (playerBottom < groundHeight) {
            // Snap to ground
            this.position.y = groundHeight + this.specs.height;

            if (this.velocity.y < 0) {
                this.velocity.y = 0;
            }
            this.isGrounded = true;
        } else {
            // Check if we're close to ground (for stepping)
            if (playerBottom < groundHeight + 0.1 && this.velocity.y <= 0) {
                this.isGrounded = true;
            } else {
                this.isGrounded = false;
            }
        }

        // ==================== ANIMATION DRIVER ====================
        if (this.animator) {
            // Speed (horizontal only)
            const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            this.animator.setInput('speed', speed);
            this.animator.setInput('isGrounded', this.isGrounded);
            this.animator.update(dt);
        }
    }

    /**
     * Get the camera position (eye level)
     * @returns {THREE.Vector3}
     */
    getCameraPosition() {
        return this.position.clone();
    }

    /**
     * Get the look direction based on yaw and pitch
     * @returns {THREE.Vector3}
     */
    getLookDirection() {
        return new THREE.Vector3(
            -Math.sin(this.rotation.yaw) * Math.cos(this.rotation.pitch),
            Math.sin(this.rotation.pitch),
            -Math.cos(this.rotation.yaw) * Math.cos(this.rotation.pitch)
        );
    }

    /**
     * Get a point to look at (for camera.lookAt)
     * @returns {THREE.Vector3}
     */
    getLookAtPoint() {
        const dir = this.getLookDirection();
        return this.position.clone().add(dir);
    }

    /**
     * Set objects that can be interacted with
     * @param {Array<THREE.Object3D>} objects 
     */
    setInteractables(objects) {
        this.interactables = objects;
    }

    /**
     * Attempt to interact with objects in front of player
     */
    interact() {
        if (!this.interactables || this.interactables.length === 0) return;

        // Setup raycaster
        const startPos = this.getCameraPosition();
        const direction = this.getLookDirection();

        this.raycaster.set(startPos, direction);
        this.raycaster.far = this.interactionRange;

        // Check intersections
        const intersects = this.raycaster.intersectObjects(this.interactables, true);

        if (intersects.length > 0) {
            // Find the closest interactive object
            // Note: intersects are sorted by distance
            let hitObject = intersects[0].object;

            // Traverse up to find the root object with interactivity logic
            // (in case we hit a sub-mesh)
            while (hitObject) {
                if (hitObject.userData && hitObject.userData.interactive) {
                    console.log(`[Player] Interacted with: ${hitObject.userData.name}`);

                    if (hitObject.userData.onInteract) {
                        hitObject.userData.onInteract();
                    } else {
                        console.warn('[Player] Object is interactive but has no onInteract callback');
                    }
                    return; // Stop after first valid interaction
                }
                hitObject = hitObject.parent;
            }
        } else {
            // No hit
            // console.log('[Player] Nothing to interact with');
        }
    }

    /**
     * Load the 3D player model (Knight.fbx)
     * @param {THREE.Scene} scene - The scene to add the model to
     * @returns {Promise} - Resolves when model is loaded
     */
    async loadModel(scene) {
        return new Promise((resolve, reject) => {
            const loader = new FBXLoader();
            const manager = new THREE.LoadingManager();
            const fbxLoader = new FBXLoader(manager);

            const animations = [];
            let characterMesh = null;

            // Load Character Mesh
            fbxLoader.load('assets/models/Knight.fbx', (fbx) => {
                characterMesh = fbx;
                characterMesh.scale.setScalar(0.04);

                characterMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            });

            // Load Animations
            const animFiles = ['Idle', 'Walk', 'Sprint'];
            const loadedClips = [];

            let loadedCount = 0;
            const checkLoad = () => {
                loadedCount++;
                if (loadedCount === animFiles.length + 1) { // +1 for mesh
                    this._finalizeLoad(scene, characterMesh, loadedClips, resolve);
                }
            };

            animFiles.forEach(name => {
                fbxLoader.load(`assets/animations/library/basic/${name}.fbx`, (anim) => {
                    if (anim.animations && anim.animations.length > 0) {
                        const clip = anim.animations[0];
                        clip.name = name; // Rename clip to file name
                        loadedClips.push(clip);
                        console.log(`[Player] Loaded animation: ${name}`);
                    } else {
                        console.error(`[Player] Failed to load animation or no clips found in: ${name}`);
                    }
                    // We don't wait for all to initialize, but let's see. 
                    // The original code relied on manager.onLoad.
                });
            });

            manager.onLoad = () => {
                console.log(`[Player] All assets loaded. Clips: ${loadedClips.map(c => c.name).join(', ')}`);
                if (characterMesh) {
                    this.mesh = characterMesh;

                    // Setup Entity Reference for Editor
                    this.mesh.userData.entity = this;
                    this.mesh.userData.type = 'player';
                    this.mesh.userData.name = 'Player';


                    // Initialize Animator
                    this.animator = new AnimationController(this.mesh, loadedClips);

                    // Setup Locomotion BlendTree
                    this.animator.addBlendTree('Locomotion', [
                        { threshold: 0.0, clip: 'Idle' },
                        { threshold: 20.0, clip: 'Walk' },
                        { threshold: 40.0, clip: 'Sprint' }
                    ]);

                    // Default to Locomotion
                    this.animator.playBlendTree('Locomotion');

                    // Initially hidden
                    this.mesh.visible = false;
                    this.meshLoaded = true;

                    scene.add(this.mesh);
                    console.log('[Player] Knight model and animations initialized');
                }
                resolve();
            };
        });
    }

    /**
     * Update the 3D mesh position and rotation to match player state
     */
    updateMesh() {
        if (!this.mesh || !this.meshLoaded) return;

        // Position mesh at player feet (player.position is at eye level)
        this.mesh.position.set(
            this.position.x,
            this.position.y - this.specs.height,
            this.position.z
        );

        // Rotate mesh to face player's yaw direction
        // Player's forward direction uses -sin(yaw), -cos(yaw)
        // Add PI to flip the model to face forward (away from camera)
        this.mesh.rotation.y = this.rotation.yaw + Math.PI;

        // Apply visibility based on meshVisible flag (in case model loaded after visibility was set)
        if (this.meshVisible && !this.mesh.visible) {
            this.mesh.visible = true;
            this.mesh.traverse((child) => {
                child.visible = true;
            });
            console.log('[Player] Mesh made visible after late load');
        }
    }

    /**
     * Set mesh visibility (show in third-person, hide in first-person)
     * @param {boolean} visible - Whether the mesh should be visible
     */
    setMeshVisible(visible) {
        this.meshVisible = visible;
        console.log(`[Player] setMeshVisible(${visible}), mesh exists: ${!!this.mesh}, meshLoaded: ${this.meshLoaded}`);
        if (this.mesh) {
            this.mesh.visible = visible;
            // Also traverse children to ensure visibility propagates
            this.mesh.traverse((child) => {
                child.visible = visible;
            });
            console.log(`[Player] Mesh visibility set to ${visible}, position:`, this.mesh.position);
        }
    }
}
