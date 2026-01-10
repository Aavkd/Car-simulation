import * as THREE from 'three';

/**
 * Spark Particle System
 * Optimized for high-velocity, short-lived sparks (e.g. metal on tarmac)
 */
export class SparkSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.particlePool = [];
        this.maxParticles = 500; // High count for dense sparks

        // Create spark texture programmatically (sharp point/line)
        this.texture = this._createSparkTexture();

        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            color: 0xaaccff, // Bright Blue/White
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Dynamic light for sparks
        this.light = new THREE.PointLight(0xaaccff, 0, 10);
        this.scene.add(this.light);
        this.lastEmitPosition = new THREE.Vector3();
        this.emitTimer = 0;
    }

    _createSparkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // intense center glow
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');   // White hot center
        gradient.addColorStop(0.2, 'rgba(200, 220, 255, 0.8)'); // Blue-ish white core
        gradient.addColorStop(0.5, 'rgba(100, 150, 255, 0.4)');  // Blue halo
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);

        return new THREE.CanvasTexture(canvas);
    }

    getParticle() {
        if (this.particlePool.length > 0) {
            const p = this.particlePool.pop();
            p.visible = true;
            return p;
        }

        if (this.particles.length < this.maxParticles) {
            const p = new THREE.Sprite(this.material.clone());
            this.scene.add(p);
            this.particles.push(p);
            return p;
        }

        return null;
    }

    /**
     * Emit sparks from a specific point
     * @param {THREE.Vector3} position - World position to emit from
     * @param {THREE.Vector3} velocity - Base velocity (e.g. plane velocity reversed)
     * @param {number} intensity - 0 to 1
     */
    emit(position, velocity, intensity = 1.0) {
        const count = Math.ceil(intensity * 5); // 1-5 sparks per call

        this.lastEmitPosition.copy(position);
        this.emitTimer = 0.1; // Light stays on for a bit

        for (let i = 0; i < count; i++) {
            const p = this.getParticle();
            if (!p) return;

            p.position.copy(position);

            // Randomize position slightly (contact patch width)
            p.position.x += (Math.random() - 0.5) * 0.5;
            p.position.z += (Math.random() - 0.5) * 0.5;

            // Velocity logic:
            // 1. Base velocity (deflecting off ground)
            // 2. Random scatter
            // 3. Upward component (bounce)

            // Deflect velocity: mostly opposite to movement, but scattered
            const speed = velocity.length();
            const dir = velocity.clone().normalize().negate(); // Opposite to movement

            // Add scatter
            dir.x += (Math.random() - 0.5) * 1.5;
            dir.y += Math.random() * 0.5 + 0.2; // Always some up
            dir.z += (Math.random() - 0.5) * 1.5;
            dir.normalize();

            // Speed variation
            const sparkSpeed = speed * (0.2 + Math.random() * 0.3); // Sparks move slower than plane

            p.userData = {
                life: 0.4 + Math.random() * 0.3, // Short life
                velocity: dir.multiplyScalar(sparkSpeed),
                gravity: -15.0 // Heavy sparks fall fast
            };

            // Reset scale and opacity
            p.scale.setScalar(0.2 + Math.random() * 0.3);
            p.material.opacity = 1.0;
            p.material.rotation = Math.random() * Math.PI * 2;
        }
    }

    update(dt) {
        // Update Light
        if (this.emitTimer > 0) {
            this.emitTimer -= dt;
            this.light.position.copy(this.lastEmitPosition);
            this.light.position.y += 0.5; // Slightly above ground
            // flicker
            this.light.intensity = 2.0 + Math.random() * 2.0;
        } else {
            this.light.intensity = 0;
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (!p.visible) continue;

            // Life cycle
            p.userData.life -= dt;
            if (p.userData.life <= 0) {
                p.visible = false;
                this.particlePool.push(p);
                continue;
            }

            // Physics
            p.userData.velocity.y += p.userData.gravity * dt;
            p.position.addScaledVector(p.userData.velocity, dt);

            // Ground collision (simple floor check)
            // Assuming flat ground at y=0 is too simple, but for sparks visual it's okay if they clip slightly
            // or we could just let them fall through.
            // Let's just let them fall, they fade out fast.

            // Stretch effect based on velocity (optional, for "fast" sparks)
            // For Sprites, we can't stretch easily without scaling Y and rotating.
            // But default sprites always face camera.
            // Simple approach: just fade.

            // Fade out
            p.material.opacity = p.userData.life / 0.5;
        }
    }
}
