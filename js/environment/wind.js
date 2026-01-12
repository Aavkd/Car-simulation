import * as THREE from 'three';

/**
 * Wind Effect System
 * Creates dramatic moving fog banks for atmospheric visuals
 */
export class WindEffect {
    constructor(scene) {
        this.scene = scene;

        // Wind settings
        this.windDirection = new THREE.Vector3(1, 0, 0.3).normalize();
        this.windSpeed = 60; // Base wind speed
        this.gustStrength = 0.5; // Random gust variation

        // Fog wisp settings
        this.wispCount = 60; // More fog sheets
        this.spawnRadius = 500; // Larger area
        this.maxHeight = 100; // Max height above ground
        this.baseHeight = 0; // Start at ground level

        // Fog appearance
        this.fogColor = new THREE.Color(0xdddddd);
        this.fogOpacity = 0.6;

        // Internal state
        this.fogGroup = new THREE.Group();
        this.fogGroup.name = 'windFog';
        this.wisps = [];
        this.time = 0;
        this.enabled = true;

        this._createFogWisps();
        this.scene.add(this.fogGroup);
    }

    _createFogWisps() {
        // Create fog wisp texture procedurally - larger, softer
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Create very soft, large gradient
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.7)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // Add wispy noise variation
        const imageData = ctx.getImageData(0, 0, 512, 512);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 50;
            imageData.data[i + 3] = Math.max(0, Math.min(255, imageData.data[i + 3] + noise));
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create large fog sheet geometry
        const geometry = new THREE.PlaneGeometry(1, 1);

        for (let i = 0; i < this.wispCount; i++) {
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                color: this.fogColor,
                transparent: true,
                opacity: this.fogOpacity * (0.6 + Math.random() * 0.4),
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending
            });

            const mesh = new THREE.Mesh(geometry, material);

            // MASSIVE fog banks - 300-600 units wide, 80-200 tall
            const width = 300 + Math.random() * 300;
            const height = 80 + Math.random() * 120;
            mesh.scale.set(width, height, 1);

            // Random position around origin
            mesh.position.set(
                (Math.random() - 0.5) * this.spawnRadius * 2,
                this.baseHeight + Math.random() * this.maxHeight,
                (Math.random() - 0.5) * this.spawnRadius * 2
            );

            // Mostly horizontal orientation with slight tilt
            mesh.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.2;
            mesh.rotation.z = (Math.random() - 0.5) * 0.3;

            // Store wisp data
            this.wisps.push({
                mesh: mesh,
                speed: 0.5 + Math.random() * 1.0,
                phase: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.2 + Math.random() * 0.3,
                baseOpacity: material.opacity,
                verticalOffset: Math.random() * Math.PI * 2,
                baseY: mesh.position.y
            });

            this.fogGroup.add(mesh);
        }
    }

    /**
     * Update wind effect
     * @param {number} deltaTime - Time since last frame
     * @param {THREE.Vector3} cameraPosition - Current camera position
     * @param {number} [groundHeight] - Optional ground height at camera position
     */
    update(deltaTime, cameraPosition, groundHeight = 0) {
        if (!this.enabled) return;

        this.time += deltaTime;

        // Wind movement with gusts
        const gustTime = this.time * 0.3;
        const gustX = Math.sin(gustTime) * this.gustStrength;
        const gustZ = Math.cos(gustTime * 0.7) * this.gustStrength;

        const windX = (this.windDirection.x + gustX) * this.windSpeed * deltaTime;
        const windZ = (this.windDirection.z + gustZ) * this.windSpeed * deltaTime;

        for (const wisp of this.wisps) {
            const mesh = wisp.mesh;

            // Move with wind
            mesh.position.x += windX * wisp.speed;
            mesh.position.z += windZ * wisp.speed;

            // Gentle vertical bobbing
            mesh.position.y = wisp.baseY + Math.sin(this.time * wisp.wobbleSpeed + wisp.verticalOffset) * 8;

            // Slight rotation wobble for organic feel
            mesh.rotation.z = Math.sin(this.time * 0.4 + wisp.phase) * 0.15;

            // Pulse opacity slightly
            const opacityPulse = 0.8 + Math.sin(this.time * 0.5 + wisp.phase) * 0.2;
            mesh.material.opacity = wisp.baseOpacity * opacityPulse * (this.fogOpacity / 0.6);

            // Calculate distance from camera
            const dx = mesh.position.x - cameraPosition.x;
            const dz = mesh.position.z - cameraPosition.z;
            const distSq = dx * dx + dz * dz;

            // Respawn if too far from camera
            if (distSq > this.spawnRadius * this.spawnRadius * 4) {
                // Spawn on the upwind side
                const angle = Math.atan2(-this.windDirection.z, -this.windDirection.x);
                const spread = (Math.random() - 0.5) * Math.PI * 1.8;
                const dist = this.spawnRadius * (0.6 + Math.random() * 0.6);

                mesh.position.x = cameraPosition.x + Math.cos(angle + spread) * dist;
                wisp.baseY = groundHeight + this.baseHeight + Math.random() * this.maxHeight;
                mesh.position.y = wisp.baseY;
                mesh.position.z = cameraPosition.z + Math.sin(angle + spread) * dist;
            }

            // Keep above ground
            const minHeight = groundHeight + this.baseHeight;
            if (wisp.baseY < minHeight) {
                wisp.baseY = minHeight + Math.random() * 20;
            }

            // Billboard - face camera while staying horizontal
            mesh.lookAt(cameraPosition.x, mesh.position.y, cameraPosition.z);
            mesh.rotation.x += Math.PI * 0.5;
        }
    }

    /**
     * Rebuild the effect (used when structural parameters change)
     */
    rebuild() {
        this.dispose();
        this.fogGroup = new THREE.Group();
        this.fogGroup.name = 'windFog';
        this.scene.add(this.fogGroup);
        this.wisps = [];
        this._createFogWisps();
    }

    /**
     * Configure wind settings
     * @param {Object} options - Configuration options
     */
    configure(options = {}) {
        let rebuildNeeded = false;

        if (options.windDirection) {
            this.windDirection.copy(options.windDirection).normalize();
        }
        if (options.windSpeed !== undefined) {
            this.windSpeed = options.windSpeed;
        }
        if (options.fogColor) {
            this.fogColor.set(options.fogColor);
        }

        // Dynamic updates for existing wisps
        if (options.fogOpacity !== undefined) {
            this.fogOpacity = options.fogOpacity;
            // Opacity is applied in update() per frame, so no loop needed here
        }

        // Structural changes requiring rebuild
        if (options.wispCount !== undefined && options.wispCount !== this.wispCount) {
            this.wispCount = options.wispCount;
            rebuildNeeded = true;
        }
        if (options.spawnRadius !== undefined && options.spawnRadius !== this.spawnRadius) {
            this.spawnRadius = options.spawnRadius;
            rebuildNeeded = true;
        }
        if (options.maxHeight !== undefined) {
            this.maxHeight = options.maxHeight;
            // Can update live, but rebuild allows fresh distribution
            rebuildNeeded = true;
        }
        if (options.baseHeight !== undefined) {
            this.baseHeight = options.baseHeight;
            rebuildNeeded = true;
        }

        if (rebuildNeeded) {
            this.rebuild();
        } else if (options.fogColor) {
            // If not rebuilding, update color manually
            for (const wisp of this.wisps) {
                if (wisp.mesh.material) {
                    wisp.mesh.material.color.set(this.fogColor);
                }
            }
        }

        if (options.enabled !== undefined) {
            this.setEnabled(options.enabled);
        }
    }

    /**
     * Set wind intensity (affects both speed and opacity)
     * @param {number} intensity - 0 to 1
     */
    setIntensity(intensity) {
        const clamped = Math.max(0, Math.min(1, intensity));
        this.windSpeed = 20 + clamped * 60;
        this.fogOpacity = 0.15 + clamped * 0.4;
    }

    /**
     * Enable or disable the effect
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.fogGroup) this.fogGroup.visible = enabled;
    }

    /**
     * Set fog color based on time of day
     * @param {number} timeOfDay - 0 to 1
     */
    setTimeOfDay(timeOfDay) {
        // Adjust fog color based on time
        const dayColor = new THREE.Color(0xcccccc);
        const sunsetColor = new THREE.Color(0xffddaa);
        const nightColor = new THREE.Color(0x556677);

        let color;
        if (timeOfDay < 0.25 || timeOfDay > 0.75) {
            // Night
            color = nightColor;
        } else if (timeOfDay < 0.3 || timeOfDay > 0.7) {
            // Sunrise/sunset
            color = sunsetColor;
        } else {
            // Day
            color = dayColor;
        }

        this.fogColor.copy(color);
        for (const wisp of this.wisps) {
            wisp.mesh.material.color.copy(color);
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        for (const wisp of this.wisps) {
            if (wisp.mesh.geometry) wisp.mesh.geometry.dispose();
            if (wisp.mesh.material) wisp.mesh.material.dispose();
        }
        if (this.scene && this.fogGroup) {
            this.scene.remove(this.fogGroup);
        }
        this.wisps = [];
    }
}
