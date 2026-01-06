import * as THREE from 'three';

/**
 * Camera Controller - Third-person follow camera with dynamic effects and mouse orbit
 */
export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement || document.body;

        // Camera modes
        this.modes = ['chase', 'far', 'hood', 'cockpit'];
        this.currentModeIndex = 0;

        // Mode configurations
        this.modeConfigs = {
            chase: {
                distance: 8,
                height: 3,
                lookAtHeight: 1,
                fov: 60
            },
            far: {
                distance: 15,
                height: 6,
                lookAtHeight: 1,
                fov: 50
            },
            hood: {
                distance: 0.5,
                height: 1.2,
                lookAtHeight: 1.5,
                fov: 75
            },
            cockpit: {
                distance: 0,        // Inside the car
                height: 4.5,        // Driver eye level (scaled for the large car model)
                lookAtHeight: 4.5,  // Look straight ahead
                fov: 85             // Wide FOV for immersive cockpit view
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
        this.maxDistance = 20;

        this.orbitSensitivity = 0.003;
        this.zoomSensitivity = 0.005; // Zoom speed
        this.minOrbitY = -0.2;        // Min pitch (looking from below)
        this.maxOrbitY = 1.2;         // Max pitch (looking from above, ~70 degrees)

        this.isMouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

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

    get config() {
        return this.modeConfigs[this.currentMode];
    }

    get isCockpitMode() {
        return this.currentMode === 'cockpit';
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

        // Get target's world position and direction
        const targetPos = new THREE.Vector3();
        target.getWorldPosition(targetPos);

        // Car forward is +Z
        const targetDir = new THREE.Vector3(0, 0, 1);
        targetDir.applyQuaternion(target.quaternion);

        // Handle cockpit (first-person) mode specially
        if (this.isCockpitMode) {
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

        // Standard third-person camera modes (chase, far, hood)
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
        this.currentPosition.lerp(desiredPosition, this.positionSmoothing * deltaTime);

        // Calculate look-at point (the car)
        const lookAtPoint = new THREE.Vector3();
        lookAtPoint.copy(targetPos);
        lookAtPoint.y += config.lookAtHeight;

        // Smooth look-at
        this.currentLookAt.lerp(lookAtPoint, this.lookAtSmoothing * deltaTime);

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
}
