import * as THREE from 'three';

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
            if (Math.abs(input.gamepad.steering) > 0.1) {
                inputRight += input.gamepad.steering;  // Stick right (positive) = strafe right
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
}
