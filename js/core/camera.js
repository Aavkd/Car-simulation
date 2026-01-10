import * as THREE from 'three';

/**
 * Camera Controller - Third-person follow camera with dynamic effects and mouse orbit
 */
export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement || document.body;

        // Camera modes
        this.modes = ['chase', 'far', 'hood', 'cockpit', 'flight'];
        this.currentModeIndex = 0;

        // Active vehicle context ('car' or 'plane')
        this.activeVehicle = 'car';

        // Mode configurations
        this.modeConfigs = {
            chase: {
                distance: 14,
                height: 6,
                lookAtHeight: 1,
                fov: 60
            },
            far: {
                distance: 24,
                height: 8,
                lookAtHeight: 4,
                fov: 50
            },
            hood: {
                distance: -5,
                height: 1.2,
                lookAtHeight: 1.5,
                fov: 75
            },
            cockpit: {
                distance: 0,        // Inside the car
                height: 4.5,        // Driver eye level (scaled for the large car model)
                lookAtHeight: 4.5,  // Look straight ahead
                fov: 85             // Wide FOV for immersive cockpit view
            },
            flight: {
                distance: 1,       // Farther back
                height: 2,
                lookAtHeight: 2,
                fov: 75,
                rollLock: false,      // Custom flag for plane behavior
                positionSmoothing: 25.0,
                lookAtSmoothing: 25.0
            },
            flight_cockpit: {
                distance: 2.5,     // Forward of center
                height: 3,       // Pilot eye level
                lookAtHeight: 1.2, // Level with eyes
                fov: 120            // Wide FOV for flight
            }
        };

        // Current interpolated values
        this.currentPosition = new THREE.Vector3(0, 5, 10);
        this.currentLookAt = new THREE.Vector3();
        this.currentFov = 60;

        // Smoothing
        this.positionSmoothing = 5;
        this.lookAtSmoothing = 10;
        this.fovSmoothing = 3;

        // Speed-based effects
        this.baseFov = 60;
        this.maxFovIncrease = 15;
        this.maxSpeedForFov = 50; // m/s

        // Shake
        this.shakeIntensity = 0;
        this.shakeDecay = 5;

        // ==================== MOUSE ORBIT ====================
        this.orbitAngleX = 0;        // Horizontal orbit angle (yaw)
        this.orbitAngleY = 0;        // Vertical orbit angle (pitch)
        this.targetOrbitX = 0;
        this.targetOrbitY = 0;

        // Zoom/Distance control
        this.currentDistance = this.modeConfigs.chase.distance; // Initialize with default
        this.minDistance = 2;
        this.maxDistance = 30;

        this.orbitSensitivity = 0.003;
        this.zoomSensitivity = 0.005; // Zoom speed
        this.minOrbitY = -0.2;        // Min pitch (looking from below)
        this.maxOrbitY = 1.2;         // Max pitch (looking from above, ~70 degrees)

        this.isMouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Player mode (on-foot first person)
        this.isPlayerMode = false;

        this._bindMouseEvents();
    }

    _bindMouseEvents() {
        this.domElement.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.domElement.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.domElement.addEventListener('mouseleave', (e) => this._onMouseUp(e));
        this.domElement.addEventListener('wheel', (e) => this._onMouseWheel(e), { passive: false });

        // Prevent context menu on right click
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _onMouseWheel(e) {
        // e.deltaY > 0 means scrolling down (zoom out), < 0 means scrolling up (zoom in)
        this.currentDistance += e.deltaY * this.zoomSensitivity;

        // Clamp distance
        this.currentDistance = THREE.MathUtils.clamp(
            this.currentDistance,
            this.minDistance,
            this.maxDistance
        );

        e.preventDefault(); // Prevent page scrolling if necessary
    }

    _onMouseDown(e) {
        if (e.button === 0) { // Left click
            this.isMouseDown = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this.isMouseDown = false;
        }
    }

    _onMouseMove(e) {
        if (!this.isMouseDown) return;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        this.targetOrbitX += deltaX * this.orbitSensitivity;
        this.targetOrbitY += deltaY * this.orbitSensitivity;

        // Clamp vertical angle
        this.targetOrbitY = THREE.MathUtils.clamp(
            this.targetOrbitY,
            this.minOrbitY,
            this.maxOrbitY
        );

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    /**
     * Handle analog input (e.g. from Gamepad)
     * @param {number} x - Horizontal input (-1 to 1)
     * @param {number} y - Vertical input (-1 to 1)
     * @param {number} factor - Sensitivity multiplier
     */
    handleAnalogInput(x, y, factor = 1.0) {
        if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) return;

        const sensitivity = 2.0 * factor; // Higher base speed for stick
        this.targetOrbitX += x * this.orbitSensitivity * sensitivity; // Multiply by orbitSensitivity (which is 0.003)
        this.targetOrbitY += y * this.orbitSensitivity * sensitivity;

        // Clamp vertical angle
        this.targetOrbitY = THREE.MathUtils.clamp(
            this.targetOrbitY,
            this.minOrbitY,
            this.maxOrbitY
        );
    }

    get currentMode() {
        return this.modes[this.currentModeIndex];
    }

    /**
     * Set the current active vehicle type
     * @param {string} type - 'car' or 'plane'
     */
    setVehicleType(type) {
        this.activeVehicle = type;
    }

    get config() {
        const mode = this.currentMode;
        if (mode === 'cockpit' && this.activeVehicle === 'plane') {
            return this.modeConfigs['flight_cockpit'];
        }
        return this.modeConfigs[mode];
    }

    get isCockpitMode() {
        return this.currentMode === 'cockpit';
    }

    /**
     * Set player mode (on-foot first person)
     * @param {boolean} enabled - Whether player mode is active
     */
    setPlayerMode(enabled) {
        this.isPlayerMode = enabled;
    }

    nextMode() {
        this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
        // Reset orbit when changing modes
        this.targetOrbitX = 0;
        this.targetOrbitY = 0;
        // Reset distance to new mode's default
        this.currentDistance = this.modeConfigs[this.currentMode].distance;
    }

    /**
     * Add camera shake
     * @param {number} intensity - Shake intensity (0-1)
     */
    addShake(intensity) {
        this.shakeIntensity = Math.min(this.shakeIntensity + intensity, 1);
    }

    /**
     * Update camera position and orientation
     * @param {THREE.Object3D} target - Target to follow (car)
     * @param {number} speed - Current speed in m/s
     * @param {number} deltaTime - Time since last frame
     */
    update(target, speed, deltaTime) {
        if (!target) return;


        const config = this.config;
        const positionSmoothing = config.positionSmoothing || this.positionSmoothing;
        const lookAtSmoothing = config.lookAtSmoothing || this.lookAtSmoothing;

        // Get target's world position and direction
        const targetPos = new THREE.Vector3();
        target.getWorldPosition(targetPos);

        // Car forward is +Z
        const targetDir = new THREE.Vector3(0, 0, 1);
        targetDir.applyQuaternion(target.quaternion);

        // ==================== COCKPIT MODE ====================
        if (this.isCockpitMode) {
            // ==================== PLANE COCKPIT (RIGID) ====================
            if (this.activeVehicle === 'plane') {
                // Smooth orbit angle interpolation (Mouse Look)
                this.orbitAngleX = THREE.MathUtils.lerp(this.orbitAngleX, this.targetOrbitX, 15 * deltaTime);
                this.orbitAngleY = THREE.MathUtils.lerp(this.orbitAngleY, this.targetOrbitY, 15 * deltaTime);

                // Rigidly attach to plane for 1:1 movement (no smoothing)
                const planeRotation = new THREE.Matrix4().makeRotationFromQuaternion(target.quaternion);
                const planeUp = new THREE.Vector3(0, 1, 0).applyMatrix4(planeRotation);
                // const planeForward = new THREE.Vector3(0, 0, 1).applyMatrix4(planeRotation); // Not needed if we use local vector

                // Offset relative to plane
                const offset = new THREE.Vector3(0, config.height, config.distance);
                offset.applyMatrix4(planeRotation);

                const desiredPosition = targetPos.clone().add(offset);

                // Set position directly
                this.currentPosition.copy(desiredPosition);
                this.camera.position.copy(this.currentPosition);

                // Local look direction (Forward -Z in Three.js, but our code seems to use +Z as forward for cars?)
                // Previous code used: const targetDir = new THREE.Vector3(0, 0, 1).applyQuaternion(target.quaternion);
                // So local forward is (0, 0, 1).
                const localLookDir = new THREE.Vector3(0, 0, 1);

                // Apply Mouse Look (Orbit)
                // Rotate around Local Y (Yaw) and Local X (Pitch)
                // We typically orbit around Y globally, but here we want "Head Turn" inside cockpit.
                // Pitch (X-axis rotation)
                localLookDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.orbitAngleY);
                // Yaw (Y-axis rotation)
                localLookDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.orbitAngleX);

                // Now transform local look direction to World space relative to Plane
                localLookDir.applyMatrix4(planeRotation);

                // Look target
                const lookTarget = desiredPosition.clone().add(localLookDir.multiplyScalar(100));

                // Set lookAt directly
                this.currentLookAt.copy(lookTarget);
                this.camera.lookAt(this.currentLookAt);

                // Match plane's roll (Up vector)
                this.camera.up.copy(planeUp);

                // Dynamic FOV
                const speedRatio = Math.min(speed / 150, 1);
                const targetFov = config.fov + speedRatio * 10;
                this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, this.fovSmoothing * deltaTime);
                this.camera.fov = this.currentFov;
                this.camera.updateProjectionMatrix();
                return;
            }

            // ==================== CAR COCKPIT (Original) ====================
            // Position camera inside the car at driver's head position
            const cockpitOffset = new THREE.Vector3(0, config.height, 2); // Slightly forward of center
            cockpitOffset.applyQuaternion(target.quaternion);

            const desiredPosition = new THREE.Vector3();
            desiredPosition.copy(targetPos).add(cockpitOffset);

            // Look forward in the car's direction
            const lookAtPoint = new THREE.Vector3();
            lookAtPoint.copy(targetPos);
            lookAtPoint.add(targetDir.clone().multiplyScalar(50)); // Look 50 units ahead
            lookAtPoint.y = targetPos.y + config.lookAtHeight;

            // Faster smoothing for responsive first-person feel
            this.currentPosition.lerp(desiredPosition, 15 * deltaTime);
            this.currentLookAt.lerp(lookAtPoint, 15 * deltaTime);

            // Apply position with reduced shake for cockpit
            const shakeOffset = new THREE.Vector3();
            if (this.shakeIntensity > 0.01) {
                shakeOffset.x = (Math.random() - 0.5) * this.shakeIntensity * 0.03;
                shakeOffset.y = (Math.random() - 0.5) * this.shakeIntensity * 0.03;
                shakeOffset.z = (Math.random() - 0.5) * this.shakeIntensity * 0.03;
                this.shakeIntensity -= this.shakeDecay * deltaTime;
            }

            this.camera.position.copy(this.currentPosition).add(shakeOffset);
            this.camera.lookAt(this.currentLookAt);

            // Speed-based FOV for cockpit
            const speedRatio = Math.min(speed / this.maxSpeedForFov, 1);
            const targetFov = config.fov + speedRatio * this.maxFovIncrease * 0.7; // Reduced FOV increase
            this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, this.fovSmoothing * deltaTime);
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
            return;
        }

        // ==================== FLIGHT MODE ====================
        if (config.rollLock) {
            // Get Plane orientation vectors
            const planeRotation = new THREE.Matrix4().makeRotationFromQuaternion(target.quaternion);
            const planeUp = new THREE.Vector3(0, 1, 0).applyMatrix4(planeRotation);

            // Calculate offset relative to plane orientation
            // We want to be behind (-Z) and up (+Y) in LOCAL space
            const offset = new THREE.Vector3(0, config.height, -config.distance);
            offset.applyMatrix4(planeRotation); // Rotate offset by plane rotation

            // Target Position
            const desiredPos = targetPos.clone().add(offset);

            // Smoothly move there
            this.currentPosition.lerp(desiredPos, positionSmoothing * deltaTime);

            // Look target (ahead of plane)
            const lookOffset = new THREE.Vector3(0, config.lookAtHeight, 50).applyMatrix4(planeRotation);
            const lookTarget = targetPos.clone().add(lookOffset);
            this.currentLookAt.lerp(lookTarget, lookAtSmoothing * deltaTime);

            // Apply to Camera
            this.camera.position.copy(this.currentPosition);
            this.camera.lookAt(this.currentLookAt);

            // Force camera up vector to match plane up (Roll Lock)
            // We smoothly blend the up vector to avoid snapping
            const currentUp = this.camera.up.clone();
            currentUp.lerp(planeUp, 5.0 * deltaTime);
            this.camera.up.copy(currentUp);

            // Dynamic FOV
            const speedRatio = Math.min(speed / 150, 1); // 150 m/s max for FOV effect
            const targetFov = config.fov + speedRatio * 20;
            this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, this.fovSmoothing * deltaTime);
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
            return;
        }

        // Reset Up vector for standard modes (Y-up)
        this.camera.up.set(0, 1, 0);

        // ==================== STANDARD MODES (Chase, Far, Hood) ====================

        // Smooth orbit angle interpolation
        this.orbitAngleX = THREE.MathUtils.lerp(this.orbitAngleX, this.targetOrbitX, 8 * deltaTime);
        this.orbitAngleY = THREE.MathUtils.lerp(this.orbitAngleY, this.targetOrbitY, 8 * deltaTime);

        // Calculate base camera offset (behind the car = negative of forward direction)
        // Use currentDistance instead of config.distance
        let offsetX = -targetDir.x * this.currentDistance;
        let offsetZ = -targetDir.z * this.currentDistance;
        let offsetY = config.height;

        // Apply orbit rotation around the car
        // Rotate the offset around Y axis (horizontal orbit)
        const cosX = Math.cos(this.orbitAngleX);
        const sinX = Math.sin(this.orbitAngleX);
        const rotatedX = offsetX * cosX - offsetZ * sinX;
        const rotatedZ = offsetX * sinX + offsetZ * cosX;
        offsetX = rotatedX;
        offsetZ = rotatedZ;

        // Apply vertical orbit (pitch) - camera orbits in a sphere around the car
        // orbitAngleY controls elevation: negative = look from above, positive = look from below
        const cosY = Math.cos(this.orbitAngleY);
        const sinY = Math.sin(this.orbitAngleY);

        // Scale horizontal offset by cosY (camera gets closer horizontally when pitched)
        const horizontalScale = cosY;
        offsetX *= horizontalScale;
        offsetZ *= horizontalScale;

        // Height is based on config height plus vertical orbit component
        offsetY = config.height + this.currentDistance * sinY;

        // Calculate desired camera position
        const desiredPosition = new THREE.Vector3();
        desiredPosition.copy(targetPos);
        desiredPosition.x += offsetX;
        desiredPosition.z += offsetZ;
        desiredPosition.y = targetPos.y + offsetY;

        // Smooth camera position
        this.currentPosition.lerp(desiredPosition, positionSmoothing * deltaTime);

        // Calculate look-at point (the car)
        const lookAtPoint = new THREE.Vector3();
        lookAtPoint.copy(targetPos);
        lookAtPoint.y += config.lookAtHeight;

        // Smooth look-at
        this.currentLookAt.lerp(lookAtPoint, lookAtSmoothing * deltaTime);

        // Apply position with shake
        const shakeOffset = new THREE.Vector3();
        if (this.shakeIntensity > 0.01) {
            shakeOffset.x = (Math.random() - 0.5) * this.shakeIntensity * 0.1;
            shakeOffset.y = (Math.random() - 0.5) * this.shakeIntensity * 0.1;
            shakeOffset.z = (Math.random() - 0.5) * this.shakeIntensity * 0.1;
            this.shakeIntensity -= this.shakeDecay * deltaTime;
        }

        this.camera.position.copy(this.currentPosition).add(shakeOffset);
        this.camera.lookAt(this.currentLookAt);

        // Speed-based FOV
        const speedRatio = Math.min(speed / this.maxSpeedForFov, 1);
        const targetFov = config.fov + speedRatio * this.maxFovIncrease;
        this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, this.fovSmoothing * deltaTime);
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Update camera for player (on-foot) first-person view
     * @param {PlayerController} player - Player controller reference
     * @param {number} deltaTime - Time since last frame
     */
    updatePlayerCamera(player, deltaTime) {
        if (!player) return;

        // Get player camera position (eye level)
        const cameraPos = player.getCameraPosition();
        const lookAtPoint = player.getLookAtPoint();

        // Smooth camera position (fast for responsive feel)
        this.currentPosition.lerp(cameraPos, 20 * deltaTime);
        this.currentLookAt.lerp(lookAtPoint, 20 * deltaTime);

        // Apply position
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookAt);

        // Fixed FOV for player mode
        const targetFov = 75;
        this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, this.fovSmoothing * deltaTime);
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
    }
}
