import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { AnimationController } from '../animation/core/AnimationController.js';

/**
 * Animation Set Configurations
 * Easily switch between different animation sets for the player
 */
const ANIMATION_SETS = {
    basic: {
        path: 'assets/animations/library/basic/',
        clips: ['Idle', 'Walk', 'Sprint', 'Right Strafe Walking', 'Right Strafe Sprint', 'Walking Backward'],
        blendTree: [
            { threshold: -5.4, clip: 'Walking Backward' },
            { threshold: 0.0, clip: 'Idle' },
            { threshold: 9.0, clip: 'Walk' },
            { threshold: 20.0, clip: 'Sprint' }
        ],
        strafeBlendTree: [
            { threshold: 0.0, clip: 'Idle' },
            { threshold: 9.0, clip: 'Right Strafe Walking' },
            { threshold: 20.0, clip: 'Right Strafe Sprint' }
        ]
    },
    knight: {
        path: 'assets/animations/library/Knight_anims/',
        clips: [
            // Core locomotion
            'idle',
            'walking',
            'running',
            // Jump
            'jump',
            // Strafe walking (slow)
            'left strafe walking',
            'right strafe walking',
            // Strafe (fast)
            'left strafe',
            'right strafe',
            // Turning
            'left turn',
            'right turn',
            'left turn 90',
            'right turn 90'
        ],
        blendTree: [
            { threshold: 0.0, clip: 'idle' },
            { threshold: 9.0, clip: 'walking' },
            { threshold: 20.0, clip: 'running' }
        ]
    }
};


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
            walkSpeed: 9.0,        // m/s walking speed (scaled 4x)
            sprintSpeed: 20.0,      // m/s sprinting speed (scaled 4x)
            jumpForce: 25.0,        // Jump velocity (scaled)
            gravity: 60.0,          // Gravity strength (scaled)
            height: 5.5,            // Player eye height (1.7m * 4 = 6.8m)
            radius: 1.2,            // Collision radius (scaled)
            acceleration: 60.0,     // How quickly player accelerates (scaled)
            friction: 30.0,          // Ground friction / deceleration (scaled)
            backwardSpeedMulti: 0.6 // Reduce speed when walking backward
        };

        // ==================== STATE ====================
        this.position = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);

        // Rotation split: 
        // rotation = body orientation (visual mesh)
        // viewRotation = camera/look orientation (input)
        this.rotation = { yaw: 0, pitch: 0 };
        this.viewRotation = { yaw: 0, pitch: 0 };

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

        // Turn smoothing
        this.turnSpeed = 10.0; // Radians per second

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

        // Animation set (can be 'basic' or 'knight')
        this.animationSet = 'basic'; // Default to knight animations
        this.scene = null; // Store scene reference for reloading
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
        this.viewRotation.yaw = yaw;
        this.viewRotation.pitch = 0;
        this.velocity.set(0, 0, 0);
    }

    /**
     * Handle mouse movement for looking around
     * @param {number} deltaX - Mouse X movement
     * @param {number} deltaY - Mouse Y movement
     */
    handleMouseLook(deltaX, deltaY) {
        // Update View Rotation (Camera)
        this.viewRotation.yaw -= deltaX * this.mouseSensitivity;
        this.viewRotation.pitch -= deltaY * this.mouseSensitivity;

        // Clamp pitch to prevent flipping
        this.viewRotation.pitch = THREE.MathUtils.clamp(
            this.viewRotation.pitch,
            this.minPitch,
            this.maxPitch
        );

        // Keep body pitch zero
        this.rotation.pitch = 0;
    }

    /**
     * Handle analog stick look (gamepad)
     * @param {number} x - Right stick X
     * @param {number} y - Right stick Y
     * @param {number} deltaTime - Frame time
     */
    handleAnalogLook(x, y, deltaTime) {
        const sensitivity = 2.0;
        this.viewRotation.yaw -= x * sensitivity * deltaTime;
        this.viewRotation.pitch -= y * sensitivity * deltaTime;

        // Clamp pitch
        this.viewRotation.pitch = THREE.MathUtils.clamp(
            this.viewRotation.pitch,
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

        // ==================== MOVEMENT ====================
        // Calculate movement direction relative to VIEW (Camera)
        const moveDir = new THREE.Vector3();

        // Use viewRotation for direction calculation
        const forward = new THREE.Vector3(
            -Math.sin(this.viewRotation.yaw),
            0,
            -Math.cos(this.viewRotation.yaw)
        );
        const right = new THREE.Vector3(
            Math.cos(this.viewRotation.yaw),
            0,
            -Math.sin(this.viewRotation.yaw)
        );

        moveDir.addScaledVector(forward, this.moveForward);
        moveDir.addScaledVector(right, this.moveRight);

        // Normalize if moving diagonally
        if (moveDir.lengthSq() > 1) {
            moveDir.normalize();
        }

        // ==================== STRAFE DETECTION (for rotation & animation) ====================
        // Detect if player is strafing (any lateral movement triggers strafe mode)
        // Also treat backward movement as a "combat/strafe" state to prevent turning around
        const isBackward = this.moveForward < -0.1;
        const isStrafing = Math.abs(this.moveRight) > 0.1 || isBackward;

        // ==================== ROTATION ====================
        if (isStrafing) {
            // When strafing or moving backward, keep body facing the view direction
            this.rotation.yaw = this.viewRotation.yaw;
        } else if (moveDir.lengthSq() > 0.1) {
            // Normal movement: rotate body to face movement direction
            // Calculate target yaw based on movement vector
            // Yaw = atan2(-x, -z) based on our forward definition
            const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);

            // Shortest angle difference
            let diff = targetYaw - this.rotation.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            // Smooth rotation
            this.rotation.yaw += diff * this.turnSpeed * dt;
        }

        // Determine target speed
        let targetSpeed = this.isSprinting ? this.specs.sprintSpeed : this.specs.walkSpeed;

        if (isBackward) {
            targetSpeed *= this.specs.backwardSpeedMulti;
        }

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
            // Calculate signed speed relative to player forward direction
            // Forward = Positive, Backward = Negative
            // We use the dot product of velocity and model forward vector

            // Model forward (based on rotation.yaw)
            // Note: rotation.yaw is 0 when facing -Z (North), but THREE.js forward is -Z? 
            // Let's stick to the convention used in movement:
            // forward = (-sin(yaw), 0, -cos(yaw))
            const modelForward = new THREE.Vector3(
                -Math.sin(this.rotation.yaw),
                0,
                -Math.cos(this.rotation.yaw)
            );

            // Normalize velocity to get direction, but we need the magnitude for speed
            // Signed Speed = Velocity . ModelForward
            const speedMagnitude = this.velocity.length();
            let signedSpeed = speedMagnitude;

            // Check if moving backward relative to model orientation
            const velDir = this.velocity.clone().normalize();
            const dot = velDir.dot(modelForward);
            if (dot < -0.1) {
                signedSpeed = -speedMagnitude;
            }

            // Speed (horizontal only)
            // const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

            // Check if we're using knight animations (which have jump)
            const hasAdvancedAnims = this.animationSet === 'knight';

            // ===== STRAFE & LOCOMOTION BLENDING =====
            const strafeDirection = this.moveRight > 0 ? 1 : -1;

            // Calculate Blend Factor based on angle
            // 0 = Forward, 1 = Sideways
            // Angle range: 0 (Forward) to PI/2 (Sideways)
            const angle = Math.atan2(Math.abs(this.moveRight), Math.max(0, this.moveForward));
            const blendFactor = THREE.MathUtils.clamp(angle / (Math.PI / 2), 0, 1);

            if (!this.isGrounded && hasAdvancedAnims) {
                // ===== JUMPING / IN AIR =====
                this.animator.play('jump');
            } else if (this.animator.blendTrees.has('Strafe')) {
                // Directional Blending
                // Always update parameters for both trees
                // Use absolute speed for Strafe tree (blend factor handles the rest)
                // Use SIGNED speed for Locomotion tree (to pick backward/forward)
                this.animator.setTreeParameter('Locomotion', signedSpeed);
                this.animator.setTreeParameter('Strafe', Math.abs(signedSpeed));

                // Determine tree weights
                let strafeWeight = 0;
                let locomotionWeight = 0;

                if (isStrafing) {
                    // Blending mode
                    strafeWeight = blendFactor;
                    locomotionWeight = 1.0 - blendFactor;
                } else {
                    // Adventure mode (pure locomotion)
                    locomotionWeight = 1.0;
                    strafeWeight = 0.0;
                }

                // Apply weights
                this.animator.setTreeTargetWeight('Locomotion', locomotionWeight);
                this.animator.setTreeTargetWeight('Strafe', strafeWeight);

                // Mirror Logic (Sticky Scale)
                const strafeTree = this.animator.getTree('Strafe');
                const currentStrafeWeight = strafeTree ? strafeTree.fadeWeight : 0;

                if (this.mesh) {
                    // Logic: 
                    // If strafing Left, flip immediately. Delay caused wrong rotation.
                    if (this.moveRight < -0.1) {
                        this.mesh.scale.x = -0.03;
                    } else if (this.moveRight > 0.1) {
                        // Right strafe -> Normal scale immediately
                        this.mesh.scale.x = 0.03;
                    }
                    // else keep current scale (Sticky)
                }

            } else {
                // Fallback for basic set without strafe tree
                this.animator.setTreeParameter('Locomotion', signedSpeed);
                // this.animator.setInput('speed', speed); // Deprecated if using blend trees manually?
                // Actually the FSM MoveState might update 'speed' too, so let's keep it consistent if needed, 
                // but here we are driving blend tree manually.

                // Ensure the tree is active
                this.animator.playBlendTree('Locomotion');
            }

            this.animator.setInput('isGrounded', this.isGrounded);
            this.animator.setInput('strafeDirection', strafeDirection);
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
        // Use viewRotation so first-person camera follows mouse look
        return new THREE.Vector3(
            -Math.sin(this.viewRotation.yaw) * Math.cos(this.viewRotation.pitch),
            Math.sin(this.viewRotation.pitch),
            -Math.cos(this.viewRotation.yaw) * Math.cos(this.viewRotation.pitch)
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
        this.scene = scene; // Store reference for reloading

        return new Promise((resolve, reject) => {
            const loader = new FBXLoader();
            const manager = new THREE.LoadingManager();
            const fbxLoader = new FBXLoader(manager);

            const animations = [];
            let characterMesh = null;

            // Get animation set configuration
            const animSet = ANIMATION_SETS[this.animationSet];
            if (!animSet) {
                console.error(`[Player] Unknown animation set: ${this.animationSet}`);
                reject(new Error(`Unknown animation set: ${this.animationSet}`));
                return;
            }

            console.log(`[Player] Loading animation set: ${this.animationSet}`);

            // Load Character Mesh
            fbxLoader.load('assets/models/Knight.fbx', (fbx) => {
                characterMesh = fbx;
                characterMesh.scale.setScalar(0.03);

                characterMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            });

            // Load Animations from configured set
            const animFiles = animSet.clips;
            const loadedClips = [];

            let loadedCount = 0;
            const checkLoad = () => {
                loadedCount++;
                if (loadedCount === animFiles.length + 1) { // +1 for mesh
                    this._finalizeLoad(scene, characterMesh, loadedClips, resolve);
                }
            };

            animFiles.forEach(name => {
                fbxLoader.load(`${animSet.path}${name}.fbx`, (anim) => {
                    if (anim.animations && anim.animations.length > 0) {
                        let clip = anim.animations[0];
                        clip.name = name; // Rename clip to file name

                        // Strip root motion (position tracks) from knight animations
                        // This prevents the animation from physically moving the character
                        if (this.animationSet === 'knight') {
                            clip = this._stripRootMotion(clip);
                        }

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

                    // Setup Locomotion BlendTree from config
                    this.animator.addBlendTree('Locomotion', animSet.blendTree);

                    // Setup Strafe BlendTree if available
                    if (animSet.strafeBlendTree) {
                        this.animator.addBlendTree('Strafe', animSet.strafeBlendTree);
                        console.log('[Player] Strafe blend tree registered');
                    }

                    // Default to Locomotion
                    this.animator.playBlendTree('Locomotion');

                    // Initially hidden
                    this.mesh.visible = false;
                    this.meshLoaded = true;

                    scene.add(this.mesh);
                    console.log(`[Player] Knight model and ${this.animationSet} animations initialized`);
                }
                resolve();
            };
        });
    }

    /**
     * Strip root motion (position tracks) from an animation clip
     * This prevents the animation from physically moving the character
     * @param {THREE.AnimationClip} clip - The animation clip to process
     * @returns {THREE.AnimationClip} - The clip with root motion removed
     */
    _stripRootMotion(clip) {
        // Filter out position tracks for the root bone (usually named 'mixamo' or 'Hips' or root-level)
        // Keep rotation and scale tracks
        const filteredTracks = clip.tracks.filter(track => {
            const trackName = track.name.toLowerCase();

            // Remove position tracks for root-level bones
            // Common root bone names: mixamorig:Hips, Hips, Root, Armature
            const isPositionTrack = trackName.includes('.position');
            const isRootBone = trackName.includes('hips') ||
                trackName.includes('root') ||
                trackName.includes('armature') ||
                trackName.startsWith('mixamorig');

            // Only remove position tracks on root bones
            if (isPositionTrack && isRootBone) {
                console.log(`[Player] Stripping root motion track: ${track.name}`);
                return false;
            }

            return true;
        });

        // Create a new clip with the filtered tracks
        return new THREE.AnimationClip(clip.name, clip.duration, filteredTracks);
    }

    /**
     * Switch to a different animation set
     * @param {string} setName - Name of the animation set ('basic' or 'knight')
     */
    async setAnimationSet(setName) {
        if (!ANIMATION_SETS[setName]) {
            console.error(`[Player] Unknown animation set: ${setName}`);
            return;
        }

        if (setName === this.animationSet) {
            console.log(`[Player] Already using animation set: ${setName}`);
            return;
        }

        console.log(`[Player] Switching animation set from ${this.animationSet} to ${setName}`);
        this.animationSet = setName;

        // If mesh is already loaded, reload with new animations
        if (this.scene && this.meshLoaded) {
            // Remove old mesh
            if (this.mesh) {
                this.scene.remove(this.mesh);
                this.mesh = null;
            }

            this.meshLoaded = false;
            this.animator = null;

            // Reload with new animation set
            await this.loadModel(this.scene);

            // Restore visibility
            if (this.meshVisible) {
                this.setMeshVisible(true);
            }
        }
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
