/**
 * Input Handler - Manages keyboard input for vehicle controls
 */
export class InputHandler {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false,
            shiftUp: false,
            shiftDown: false,
            camera: false
        };

        // Smoothed input values (0-1 range)
        this.throttle = 0;
        this.brake = 0;
        this.steering = 0;
        this.handbrake = 0;

        // Input smoothing rates
        this.throttleRate = 4.0;
        this.brakeRate = 6.0;
        this.steeringRate = 3.0;
        this.steeringReturnRate = 5.0;

        this._bindEvents();
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => this._onKeyDown(e));
        window.addEventListener('keyup', (e) => this._onKeyUp(e));
    }

    _onKeyDown(e) {
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
            case 'Space':
                this.keys.handbrake = true;
                e.preventDefault();
                break;
            case 'KeyC':
                if (!this.keys.camera) {
                    this.keys.camera = true;
                    this.onCameraChange?.();
                }
                break;
        }
    }

    _onKeyUp(e) {
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
            case 'Space':
                this.keys.handbrake = false;
                break;
            case 'KeyC':
                this.keys.camera = false;
                break;
        }
    }

    /**
     * Update smoothed input values
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        // Throttle
        const targetThrottle = this.keys.forward ? 1 : 0;
        this.throttle = this._lerp(this.throttle, targetThrottle, this.throttleRate * deltaTime);

        // Brake
        const targetBrake = this.keys.backward ? 1 : 0;
        this.brake = this._lerp(this.brake, targetBrake, this.brakeRate * deltaTime);

        // Steering
        let targetSteering = 0;
        if (this.keys.left) targetSteering = 1;
        if (this.keys.right) targetSteering = -1;

        const steerRate = targetSteering !== 0 ? this.steeringRate : this.steeringReturnRate;
        this.steering = this._lerp(this.steering, targetSteering, steerRate * deltaTime);

        // Handbrake
        this.handbrake = this.keys.handbrake ? 1 : 0;
    }

    _lerp(current, target, rate) {
        const diff = target - current;
        if (Math.abs(diff) < 0.001) return target;
        return current + diff * Math.min(rate, 1);
    }
}
