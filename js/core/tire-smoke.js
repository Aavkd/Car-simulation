import * as THREE from 'three';

export class TireSmokeSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.particlePool = [];
        this.maxParticles = 200;

        // Create smoke texture
        this.texture = this._createSmokeTexture();
        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            color: 0xdddddd,
            transparent: true,
            opacity: 0.4,
            depthWrite: false, // Don't write to depth buffer (better for transparency)
            blending: THREE.NormalBlending
        });

        this.spawnTimer = 0;
    }

    _createSmokeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Soft radial gradient
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    getParticle() {
        if (this.particlePool.length > 0) {
            const p = this.particlePool.pop();
            p.visible = true;
            return p;
        }

        if (this.particles.length < this.maxParticles) {
            const p = new THREE.Sprite(this.material.clone()); // Clone material to handle individual opacity if needed
            this.scene.add(p);
            this.particles.push(p);
            return p;
        }

        // Recycle oldest if full (optional, but for now just return null or reuse index 0)
        return null;
    }

    emit(position, intensity) {
        // Rate limit emission
        // intensity is roughly 0-1

        const count = Math.max(1, Math.floor(intensity * 3)); // 1 to 3 particles per call

        for (let i = 0; i < count; i++) {
            const particle = this.getParticle();
            if (!particle) return;

            // Initialize particle state
            particle.position.copy(position);

            // Randomize position slightly
            particle.position.x += (Math.random() - 0.5) * 0.5;
            particle.position.z += (Math.random() - 0.5) * 0.5;
            particle.position.y += Math.random() * 0.5;

            // Initial scale
            const scale = 1.5 + Math.random() * 1.5;
            particle.scale.set(scale, scale, scale);

            // Custom properties for animation
            particle.userData = {
                life: 1.0, // 1.0 to 0.0
                decay: 0.8 + Math.random() * 0.5, // slightly faster decay
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2, // Drift with wind/random
                    1 + Math.random() * 2,     // Rise up
                    (Math.random() - 0.5) * 2
                ),
                initialOpacity: 0.2 + Math.random() * 0.2
            };

            particle.material.opacity = particle.userData.initialOpacity;
            particle.material.rotation = Math.random() * Math.PI * 2;
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            if (!p.visible) continue;

            // Update life
            p.userData.life -= p.userData.decay * dt;

            if (p.userData.life <= 0) {
                p.visible = false;
                this.particlePool.push(p);
                continue;
            }

            // Update physics
            p.position.addScaledVector(p.userData.velocity, dt);

            // Expand
            const expansion = 1 + dt * 2.0;
            p.scale.multiplyScalar(expansion);

            // Fade
            p.material.opacity = p.userData.life * p.userData.initialOpacity;
        }
    }
}
