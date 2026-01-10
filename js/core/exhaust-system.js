import * as THREE from 'three';

export class ExhaustSystem {
    constructor(scene, carPhysics, positions) {
        this.scene = scene;
        this.carPhysics = carPhysics;
        this.exhaustPositions = positions || []; // Array of local Vector3s
        this.particles = [];
        this.maxParticles = 100;

        // Texture generation
        this.texture = this._createParticleTexture();
        this.baseMaterial = new THREE.SpriteMaterial({
            map: this.texture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending // Glowy look
        });

        // State for flame logic
        this.lastThrottleTime = 0;
        this.isBrakingSequence = false;
        this.brakeSequenceTimer = 0;
        this.flameCooldown = 0;
    }

    _createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        return new THREE.CanvasTexture(canvas);
    }

    /**
     * Trigger a backfire flame
     */
    triggerFlame() {
        if (this.flameCooldown > 0) return;
        this.flameCooldown = 0.5; // Short cooldown

        this.exhaustPositions.forEach(pos => {
            // Convert local pos to world
            const worldPos = pos.clone().applyQuaternion(this.carPhysics.quaternion).add(this.carPhysics.position);

            // Emit multiple flame particles
            for (let i = 0; i < 5; i++) {
                this.emit(worldPos, 'FLAME');
            }
        });
    }

    /**
     * Emit nitrous trail
     */
    updateNitrous(intensity) {
        if (intensity <= 0) return;

        // Rate limit happens natively by update call frequency, but we can throttle if needed
        this.exhaustPositions.forEach(pos => {
            const worldPos = pos.clone().applyQuaternion(this.carPhysics.quaternion).add(this.carPhysics.position);
            this.emit(worldPos, 'NITROUS');
        });
    }

    emit(position, type) {
        if (this.particles.length >= this.maxParticles) {
            // Remove oldest
            const old = this.particles.shift();
            this.scene.remove(old);
        }

        const material = this.baseMaterial.clone();
        const p = new THREE.Sprite(material);

        p.position.copy(position);

        // Customize based on type
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.carPhysics.quaternion);
        // Exhaust shoots BACK (-Z in local), so velocity is negative forward
        // Add some random spread
        const spread = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );

        if (type === 'FLAME') {
            material.color.setHex(0xffaa00); // Orange
            // Randomly vary color towards red or yellow
            if (Math.random() > 0.5) material.color.setHex(0xff4400); // Redder

            p.scale.set(0.5, 0.5, 0.5);

            p.userData = {
                type: 'FLAME',
                life: 0.1 + Math.random() * 0.1, // Short life
                velocity: forward.clone().multiplyScalar(-5).add(spread).add(this.carPhysics.velocity), // Eject backwards + car velocity
                initialScale: 0.5,
                growth: 4.0 // Grow fast
            };
        } else if (type === 'NITROUS') {
            material.color.setHex(0x00ffff); // Cyan/Blue
            p.scale.set(0.3, 0.3, 0.3);

            p.userData = {
                type: 'NITROUS',
                life: 0.3 + Math.random() * 0.2,
                velocity: forward.clone().multiplyScalar(-8).add(spread).add(this.carPhysics.velocity),
                initialScale: 0.3,
                growth: 2.0
            };
        } else {
            // Generic smoke?
            material.color.setHex(0xaaaaaa);
            p.userData = {
                life: 1.0,
                velocity: new THREE.Vector3(0, 1, 0),
                growth: 1.0
            };
        }

        p.userData.maxLife = p.userData.life;
        this.scene.add(p);
        this.particles.push(p);
    }

    update(dt) {
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.userData.life -= dt;

            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
                continue;
            }

            // Move
            p.position.addScaledVector(p.userData.velocity, dt);

            // Grow
            const age = 1.0 - (p.userData.life / p.userData.maxLife);
            const currentScale = p.userData.initialScale + (age * p.userData.growth);
            p.scale.set(currentScale, currentScale, currentScale);

            // Fade
            p.material.opacity = p.userData.life / p.userData.maxLife;
        }

        // Update Flame Logic
        this._updateLogic(dt);
    }

    _updateLogic(dt) {
        // Inputs
        const throttle = this.carPhysics.throttleInput;
        const brake = this.carPhysics.brakeInput;
        const handbrake = this.carPhysics.handbrakeInput;
        const speed = this.carPhysics.speedKmh;

        // Nitrous Logic (High Speed)
        if (speed > 130 && throttle > 0.9) {
            this.updateNitrous(1.0);
        }

        // Backfire/Flame Logic
        // Sequence: Throttle -> Brake/Handbrake -> Throttle

        if (this.flameCooldown > 0) {
            this.flameCooldown -= dt;
        }

        // 1. Detect Throttle (State 0 -> 1)
        if (throttle > 0.8) {
            this.lastThrottleTime = 0.5; // Window to hit brake
        } else {
            if (this.lastThrottleTime > 0) this.lastThrottleTime -= dt;
        }

        // 2. Detect Brake/Handbrake while Throttle was recent (State 1 -> 2)
        const isBraking = brake > 0.5 || handbrake > 0.5;
        if (isBraking && this.lastThrottleTime > 0) {
            this.isBrakingSequence = true;
            this.brakeSequenceTimer = 0.5; // Window to hit throttle again
        }

        if (this.isBrakingSequence) {
            this.brakeSequenceTimer -= dt;
            if (this.brakeSequenceTimer <= 0) {
                this.isBrakingSequence = false; // Timed out
            }

            // 3. Detect Re-Throttle (State 2 -> Fire)
            // Ensure brakes are released before firing
            const brakesReleased = brake < 0.1 && handbrake < 0.1;
            if (throttle > 0.8 && brakesReleased) {
                this.triggerFlame();
                this.isBrakingSequence = false; // Reset
            }
        }
    }
}
