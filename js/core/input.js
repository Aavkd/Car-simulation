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
            camera: false,
            debug: false,
            timePause: false,
            timeForward: false,
            timeBackward: false,
            timePreset: false,
            headlights: false,
            retroToggle: false,
            enterExit: false,
            sprint: false,
            // Flight specific
            rollLeft: false,
            rollRight: false,
            yawLeft: false,
            yawRight: false,
            pitchUp: false,
            pitchDown: false
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
            case 'KeyQ':
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
            case 'KeyP':
                if (!this.keys.debug) {
                    this.keys.debug = true;
                    this.onDebugToggle?.();
                }
                break;
            case 'KeyA':
                if (!this.keys.shiftDown) {
                    this.keys.shiftDown = true;
                    this.onShiftDown?.();
                }
                break;
            case 'KeyE':
                if (!this.keys.shiftUp) {
                    this.keys.shiftUp = true;
                    this.onShiftUp?.();
                }
                break;
            case 'KeyT':
                if (!this.keys.timePause) {
                    this.keys.timePause = true;
                    this.onTimePause?.();
                }
                break;
            case 'KeyH':
                if (!this.keys.headlights) {
                    this.keys.headlights = true;
                    this.onHeadlightsToggle?.();
                }
                break;
            case 'F4':
                if (!this.keys.retroToggle) {
                    this.keys.retroToggle = true;
                    this.onRetroToggle?.();
                }
                e.preventDefault();
                break;
            case 'KeyF':
                if (!this.keys.enterExit) {
                    this.keys.enterExit = true;
                    this.onEnterExitVehicle?.();
                }
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.sprint = true;
                break;
            case 'BracketRight':
                this.keys.timeForward = true;
                break;
            case 'BracketLeft':
                this.keys.timeBackward = true;
                break;
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
                if (!this.keys.timePreset) {
                    this.keys.timePreset = true;
                    this.onTimePreset?.(parseInt(e.code.replace('Digit', '')));
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
            case 'KeyQ':
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
            case 'KeyP':
                this.keys.debug = false;
                break;
            case 'KeyA':
                this.keys.shiftDown = false;
                break;
            case 'KeyE':
                this.keys.shiftUp = false;
                break;
            case 'KeyT':
                this.keys.timePause = false;
                break;
            case 'KeyH':
                this.keys.headlights = false;
                break;
            case 'F4':
                this.keys.retroToggle = false;
                break;
            case 'KeyF':
                this.keys.enterExit = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.sprint = false;
                break;
            case 'BracketRight':
                this.keys.timeForward = false;
                break;
            case 'BracketLeft':
                this.keys.timeBackward = false;
                break;
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
                this.keys.timePreset = false;
                break;
        }
    }

    /**
     * Update smoothed input values
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        this._updateGamepad(deltaTime);

        // Throttle
        let targetThrottle = this.keys.forward ? 1 : 0;
        if (this.gamepad) {
            targetThrottle = Math.max(targetThrottle, this.gamepad.throttle);
        }
        this.throttle = this._lerp(this.throttle, targetThrottle, this.throttleRate * deltaTime);

        // Brake
        let targetBrake = this.keys.backward ? 1 : 0;
        if (this.gamepad) {
            targetBrake = Math.max(targetBrake, this.gamepad.brake);
        }
        this.brake = this._lerp(this.brake, targetBrake, this.brakeRate * deltaTime);

        // Steering
        let targetSteering = 0;
        if (this.keys.left) targetSteering = 1;
        if (this.keys.right) targetSteering = -1;

        if (this.gamepad && Math.abs(this.gamepad.steering) > 0.1) {
            targetSteering = this.gamepad.steering;
        }

        const steerRate = targetSteering !== 0 ? this.steeringRate : this.steeringReturnRate;
        this.steering = this._lerp(this.steering, targetSteering, steerRate * deltaTime);

        // Handbrake
        this.handbrake = this.keys.handbrake ? 1 : 0;
        if (this.gamepad && this.gamepad.handbrake) {
            this.handbrake = 1;
        }
    }

    _updateGamepad(deltaTime) {
        const gamepads = navigator.getGamepads();
        if (!gamepads) return;

        // Find the first active gamepad
        let gp = null;
        for (const g of gamepads) {
            if (g && g.connected) {
                gp = g;
                break;
            }
        }

        if (!gp) {
            this.gamepad = null;
            return;
        }

        // Initialize gamepad state if needed
        if (!this.gamepad) {
            this.gamepad = {
                throttle: 0,
                brake: 0,
                steering: 0,
                moveX: 0, // NEW: Raw movement X for walking
                moveY: 0,
                handbrake: false,
                lookX: 0,
                lookY: 0,
                sprint: false,
                yawLeft: false,
                yawRight: false
            };
            console.log("Gamepad connected:", gp.id);
        }

        // Standard Mapping (DualSense / Xbox)
        // Axes: 0:L-Right, 1:L-Down, 2:R-Right, 3:R-Down
        // Buttons: 6:L2, 7:R2, 4:L1, 5:R1, 0:X/A, 1:O/B, 2:Sq/X, 3:Tri/Y

        // Normalize axes with deadzone
        const deadzone = 0.1;

        // Steering (Left Stick X - Axis 0)
        let steerRaw = gp.axes[0];
        if (Math.abs(steerRaw) < deadzone) steerRaw = 0;
        this.gamepad.moveX = steerRaw; // Raw X for player movement
        this.gamepad.steering = -steerRaw; // Left stick: negative = left, positive = right

        // Left Stick Y (Axis 1) for on-foot forward/backward
        let moveYRaw = gp.axes[1];
        if (Math.abs(moveYRaw) < deadzone) moveYRaw = 0;
        this.gamepad.moveY = -moveYRaw; // Left stick: up = positive forward, down = negative

        // Throttle (R2 - Button 7)
        // Gamepad API: buttons[7].value is 0..1
        this.gamepad.throttle = gp.buttons[7].value;

        // Brake (L2 - Button 6)
        this.gamepad.brake = gp.buttons[6].value;

        // Handbrake (X/A Button - Button 0 or Square - Button 2? Let's use Cross/A for handbrake usually, or maybe Circle)
        // Request didn't specify, but space is handbrake. Let's map Button 0 (X/Cross on DS, A on Xbox) or Button 1 (Circle/B)
        // Let's use Button 1 (Circle/B) for Handbrake as it's common in racing (or R1, but R1 is Gear Up requested)
        this.gamepad.handbrake = gp.buttons[5].pressed; // Circle

        // Sprint (L3 - Left Stick Press - Button 10) for on-foot mode
        this.gamepad.sprint = gp.buttons[10].pressed; // L3

        // Camera (Right Stick - Axes 2, 3)
        let camX = gp.axes[2];
        let camY = gp.axes[3];
        if (Math.abs(camX) < deadzone) camX = 0;
        if (Math.abs(camY) < deadzone) camY = 0;
        this.gamepad.lookX = camX;
        this.gamepad.lookY = camY;

        // Shifting (L1/R1 - Buttons 4, 5)
        // We need single-press detection for gear shifts
        // Also expose as continuous inputs for plane yaw
        this.gamepad.yawLeft = gp.buttons[1].pressed;  // L1 - Yaw Left (plane mode)
        this.gamepad.yawRight = gp.buttons[2].pressed; // R1 - Yaw Right (plane mode)
        
        if (gp.buttons[4].pressed) { // L1 - Down
            if (!this._l1Pressed) {
                this._l1Pressed = true;
                this.onShiftDown?.();
            }
        } else {
            this._l1Pressed = false;
        }

        if (gp.buttons[5].pressed) { // R1 - Up
            if (!this._r1Pressed) {
                this._r1Pressed = true;
                this.onShiftUp?.();
            }
        } else {
            this._r1Pressed = false;
        }

        // Enter/Exit Vehicle (Triangle/Y button - Button 3)
        if (gp.buttons[3].pressed) {
            if (!this._trianglePressed) {
                this._trianglePressed = true;
                this.onEnterExitVehicle?.();
            }
        } else {
            this._trianglePressed = false;
        }
    }

    _lerp(current, target, rate) {
        const diff = target - current;
        if (Math.abs(diff) < 0.001) return target;
        return current + diff * Math.min(rate, 1);
    }
}
