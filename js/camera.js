import * as THREE from 'three';

/**
 * Camera Controller - Third-person follow camera with dynamic effects and mouse orbit
 */
export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement || document.body;

        // Camera modes
        this.modes = ['chase', 'far', 'hood'];
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

        this.orbitSensitivity = 0.003;
        this.orbitReturnSpeed = 2;    // Speed at which camera returns to default position
        this.minOrbitY = -0.3;        // Min pitch (looking up)
        this.maxOrbitY = 0.8;         // Max pitch (looking down)

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

        // Prevent context menu on right click
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
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

    get currentMode() {
        return this.modes[this.currentModeIndex];
    }

    get config() {
        return this.modeConfigs[this.currentMode];
    }

    nextMode() {
        this.currentModeIndex = (this.currentModeIndex + 1) % this.modes.length;
        // Reset orbit when changing modes
        this.targetOrbitX = 0;
        this.targetOrbitY = 0;
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

        // Smoothly return orbit angles to default when not dragging
        if (!this.isMouseDown) {
            this.targetOrbitX = THREE.MathUtils.lerp(this.targetOrbitX, 0, this.orbitReturnSpeed * deltaTime);
            this.targetOrbitY = THREE.MathUtils.lerp(this.targetOrbitY, 0, this.orbitReturnSpeed * deltaTime);
        }

        // Smooth orbit angle interpolation
        this.orbitAngleX = THREE.MathUtils.lerp(this.orbitAngleX, this.targetOrbitX, 8 * deltaTime);
        this.orbitAngleY = THREE.MathUtils.lerp(this.orbitAngleY, this.targetOrbitY, 8 * deltaTime);

        // Get target's world position and direction
        const targetPos = new THREE.Vector3();
        target.getWorldPosition(targetPos);

        // Car forward is +Z, so camera should be behind at -Z relative to car
        const targetDir = new THREE.Vector3(0, 0, 1);
        targetDir.applyQuaternion(target.quaternion);

        // Calculate base camera offset (behind the car = negative of forward direction)
        let offsetX = -targetDir.x * config.distance;
        let offsetZ = -targetDir.z * config.distance;
        let offsetY = config.height;

        // Apply orbit rotation around the car
        // Rotate the offset around Y axis (horizontal orbit)
        const cosX = Math.cos(this.orbitAngleX);
        const sinX = Math.sin(this.orbitAngleX);
        const rotatedX = offsetX * cosX - offsetZ * sinX;
        const rotatedZ = offsetX * sinX + offsetZ * cosX;
        offsetX = rotatedX;
        offsetZ = rotatedZ;

        // Apply vertical orbit (adjusts height and pulls camera in/out)
        const verticalFactor = 1 + this.orbitAngleY * 0.5;
        offsetY = config.height * verticalFactor;

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
