import * as THREE from 'three';
import { BasePhysicsProvider, SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Perlin Noise implementation for mountain generation
 */
class PerlinNoise {
    constructor(seed = Math.random() * 10000) {
        this.permutation = this._generatePermutation(seed);
    }

    _generatePermutation(seed) {
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;

        // Fisher-Yates shuffle with seed
        let n = seed;
        for (let i = 255; i > 0; i--) {
            n = (n * 16807) % 2147483647;
            const j = n % (i + 1);
            [p[i], p[j]] = [p[j], p[i]];
        }

        return [...p, ...p];
    }

    _fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    _grad(hash, x, y) {
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }

    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = this._fade(x);
        const v = this._fade(y);

        const p = this.permutation;
        const A = p[X] + Y;
        const B = p[X + 1] + Y;

        return THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(this._grad(p[A], x, y), this._grad(p[B], x - 1, y), u),
            THREE.MathUtils.lerp(this._grad(p[A + 1], x, y - 1), this._grad(p[B + 1], x - 1, y - 1), u),
            v
        );
    }

    fbm(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / maxValue;
    }
}

/**
 * Ice Mountain Generator - Infinite procedural downhill icy mountain terrain
 * 
 * Features:
 * - Infinite chunk-based terrain generation
 * - Twin mountain chains with valley/ramp between them
 * - ~45° average slope with variation
 * - Zero friction ice surface
 */
export class IceMountainGenerator extends BasePhysicsProvider {
    constructor(params = {}) {
        super();

        this.noise = new PerlinNoise(params.seed || 54321);
        this.ridgeNoise = new PerlinNoise((params.seed || 54321) + 1000);

        // Chunk system for infinite terrain
        this.chunkSize = params.chunkSize || 500;      // 500m per chunk
        this.visibleDistance = params.visibleDistance || 3000; // 3km view distance
        this.chunksPerSide = Math.ceil(this.visibleDistance / this.chunkSize);
        this.chunks = new Map();

        // Mountain parameters
        this.baseSlope = (params.slopeAngle || 45) * Math.PI / 180; // Convert degrees to radians
        this.slopeVariation = 15 * Math.PI / 180;     // ±15° variation
        this.peakHeight = 100;                         // Height of peaks above base slope
        this.valleyWidth = 80;                         // Width of center valley/ramp
        this.mountainSpacing = 150;                    // Distance between peaks on ridgeline
        this.ridgeOffset = 100;                        // Distance from center to each ridge

        // Cosmic Skybox parameters (merge with passed params)
        this.skyParams = Object.assign({
            starCount: 20000,
            galaxyCount: 200,
            nebulaCount: 100,
            universeSize: 10000 // EXTREME REDUCTION: Close and personal
        }, params);

        // Mesh subdivision
        this.segmentsPerChunk = 32;

        // Player tracking for chunk updates
        this.lastPlayerChunkZ = null;

        // Main mesh group
        this.mesh = new THREE.Group();

        // Height cache for physics (approximate)
        this.heightCache = new Map();

        // Cosmic Skybox elements
        this.skyGroup = new THREE.Group();
        this.skyObjects = []; // References for animation/updates
        this.skyLights = [];  // References for light intensity updates
        // skyParams already initialized above with constructor params merging
    }

    /**
     * Generate the terrain mesh group
     * @returns {THREE.Group}
     */
    generate() {
        // Initial chunk generation around origin
        this._updateChunks(new THREE.Vector3(0, 0, 0));

        // Generate cosmic skybox
        this._generateCosmicSky();
        this.mesh.add(this.skyGroup);

        return this.mesh;
    }

    /**
     * Update terrain chunks based on player position
     * Called during game loop to maintain infinite terrain
     * @param {THREE.Vector3} playerPosition
     */
    update(playerPosition, skySystem) {
        if (!playerPosition) return;

        const currentChunkZ = Math.floor(playerPosition.z / this.chunkSize);

        // Only update if player moved to a new chunk
        if (this.lastPlayerChunkZ !== currentChunkZ) {
            this._updateChunks(playerPosition);
            this.lastPlayerChunkZ = currentChunkZ;
        }

        // Update Skybox Visibility based on Night
        if (skySystem) {
            // Calculate night factor (1.0 = full night, 0.0 = full day)
            // skySystem.timeOfDay: 0 = midnight, 0.5 = noon
            const time = skySystem.timeOfDay;
            // Night is around 0.0 and 1.0. Day is around 0.5.
            // Let's say night starts fading in at 0.75 (sunset) and fades out at 0.25 (sunrise)

            // Simple distance from noon logic:
            // dist from 0.5 is 0 to 0.5.
            const distFromNoon = Math.abs(time - 0.5);
            // We want 1.0 when dist is 0.5 (midnight), and 0.0 when dist is < 0.25 (day)

            let nightFactor = (distFromNoon - 0.2) / 0.3;
            // 0.2 -> 0.0 (approx 10am/2pm)
            // 0.5 -> 1.0 (midnight)
            nightFactor = THREE.MathUtils.clamp(nightFactor, 0, 1);

            this._updateSkyboxVisibility(nightFactor);
        }

        // Animate sky objects
        const deltaTime = 1 / 60; // Approx fixed delta or pass it in
        this.skyObjects.forEach(obj => {
            if (obj.type === 'stars') {
                if (obj.material.uniforms) {
                    obj.material.uniforms.time.value += deltaTime;
                }
            } else if (obj.type === 'galaxy') {
                obj.mesh.rotation.y += obj.rotSpeed * deltaTime;
            }
        });

        // Keep skybox centered on player but ignore Y? Or just full player pos
        if (this.skyGroup) {
            this.skyGroup.position.copy(playerPosition);
            // We generally want skybox to just follow player to feel infinite
        }
    }

    _updateSkyboxVisibility(factor) {
        // Update generic objects
        this.skyObjects.forEach(obj => {
            if (obj.type === 'stars') {
                if (obj.material.uniforms) {
                    obj.material.uniforms.globalOpacity.value = factor;
                }
            } else {
                if (obj.material) {
                    if (obj.baseOpacity === undefined) obj.baseOpacity = obj.material.opacity;
                    obj.material.opacity = obj.baseOpacity * factor;
                    obj.mesh.visible = obj.material.opacity > 0.01;
                }
            }
        });

        // Update lights
        this.skyLights.forEach(light => {
            light.intensity = light.baseIntensity * factor;
        });
    }

    /**
     * Generate/remove chunks around player position
     */
    _updateChunks(playerPosition) {
        const centerChunkX = Math.floor(playerPosition.x / this.chunkSize);
        const centerChunkZ = Math.floor(playerPosition.z / this.chunkSize);

        const activeChunks = new Set();

        // Generate chunks in visible range
        for (let dz = -this.chunksPerSide; dz <= this.chunksPerSide; dz++) {
            for (let dx = -2; dx <= 2; dx++) { // Narrower X range since we're going downhill
                const chunkX = centerChunkX + dx;
                const chunkZ = centerChunkZ + dz;
                const chunkId = `${chunkX},${chunkZ}`;

                activeChunks.add(chunkId);

                if (!this.chunks.has(chunkId)) {
                    const chunkMesh = this._generateChunk(chunkX, chunkZ);
                    this.chunks.set(chunkId, chunkMesh);
                    this.mesh.add(chunkMesh);
                }
            }
        }

        // Remove chunks outside visible range
        for (const [chunkId, chunkMesh] of this.chunks) {
            if (!activeChunks.has(chunkId)) {
                this.mesh.remove(chunkMesh);
                if (chunkMesh.geometry) chunkMesh.geometry.dispose();
                if (chunkMesh.material) chunkMesh.material.dispose();
                this.chunks.delete(chunkId);
            }
        }
    }

    /**
     * Generate a single terrain chunk
     */
    _generateChunk(chunkX, chunkZ) {
        const geometry = new THREE.PlaneGeometry(
            this.chunkSize,
            this.chunkSize,
            this.segmentsPerChunk,
            this.segmentsPerChunk
        );

        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const colors = [];

        // Chunk world offset
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;

        // Generate heights and colors
        for (let i = 0; i < positions.length; i += 3) {
            const localX = positions[i];
            const localZ = positions[i + 2];

            const worldX = localX + offsetX;
            const worldZ = localZ + offsetZ;

            const height = this._calculateHeight(worldX, worldZ);
            positions[i + 1] = height;

            // Offset to world position (mesh will be at world coords)
            positions[i] = worldX;
            positions[i + 2] = worldZ;

            // Calculate color
            const color = this._calculateColor(worldX, worldZ, height);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
            roughness: 0.05,
            metalness: 0.1,
            transparent: true,
            opacity: 0.65
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;

        return mesh;
    }

    /**
     * Calculate terrain height at world position
     * Creates twin mountain ridges with valley between
     */
    _calculateHeight(worldX, worldZ) {
        // Base slope - height decreases as Z increases (downhill in +Z direction)
        // This creates the average 45° slope (plus additive noise for variation)
        let adjustedBase = -worldZ * Math.tan(this.baseSlope);

        // Add large scale height variation (simulates changing slope without the Z-multiplier artifact)
        // Using low frequency noise for rolling hills/drops
        const slopeVariationHeight = this.noise.noise2D(worldZ * 0.0005, 0) * 200.0;
        adjustedBase += slopeVariationHeight;

        // Calculate distance from center (X = 0)
        const absX = Math.abs(worldX);

        // Twin mountain ridges
        let ridgeHeight = 0;

        // Left ridge (negative X)
        const leftRidgeDist = Math.abs(worldX + this.ridgeOffset);
        if (leftRidgeDist < this.mountainSpacing) {
            const ridgeFactor = 1 - (leftRidgeDist / this.mountainSpacing);
            // Use noise to vary peak heights along the ridge
            const peakNoise = this.ridgeNoise.fbm(worldZ * 0.01, -this.ridgeOffset * 0.01, 3, 2, 0.5);
            ridgeHeight = Math.max(ridgeHeight, ridgeFactor * ridgeFactor * this.peakHeight * (0.6 + 0.4 * peakNoise));
        }

        // Right ridge (positive X)
        const rightRidgeDist = Math.abs(worldX - this.ridgeOffset);
        if (rightRidgeDist < this.mountainSpacing) {
            const ridgeFactor = 1 - (rightRidgeDist / this.mountainSpacing);
            // Use noise to vary peak heights along the ridge
            const peakNoise = this.ridgeNoise.fbm(worldZ * 0.01, this.ridgeOffset * 0.01, 3, 2, 0.5);
            ridgeHeight = Math.max(ridgeHeight, ridgeFactor * ridgeFactor * this.peakHeight * (0.6 + 0.4 * peakNoise));
        }

        // Valley floor variations (small bumps and ice formations)
        const valleyNoise = this.noise.fbm(worldX * 0.02, worldZ * 0.02, 2, 2, 0.5);
        const valleyDetail = valleyNoise * 5;

        // Additional ice/snow texture detail
        const iceDetail = this.noise.noise2D(worldX * 0.1, worldZ * 0.1) * 2;

        // Combine all height components
        let finalHeight = adjustedBase + ridgeHeight + valleyDetail + iceDetail;

        // Drop terrain to void outside the playable corridor
        const corridorWidth = this.ridgeOffset + this.mountainSpacing + 50;
        if (absX > corridorWidth) {
            const fadeStart = corridorWidth;
            const fadeEnd = corridorWidth + 100;
            const fadeFactor = THREE.MathUtils.clamp((absX - fadeStart) / (fadeEnd - fadeStart), 0, 1);
            finalHeight -= fadeFactor * 500; // Drop into void
        }

        return finalHeight;
    }

    /**
     * Calculate vertex color for icy mountain appearance
     */
    _calculateColor(worldX, worldZ, height) {
        // Ice color palette
        const iceWhite = new THREE.Color(0xffffff);
        const iceBlue = new THREE.Color(0xaaddff);
        const iceCyan = new THREE.Color(0x88ccee);
        const deepIce = new THREE.Color(0x5599cc);
        const shadowBlue = new THREE.Color(0x4477aa);

        // Noise for color variation
        const noiseVal = this.noise.noise2D(worldX * 0.02, worldZ * 0.02);
        const detailNoise = this.noise.noise2D(worldX * 0.1, worldZ * 0.1);

        let color = new THREE.Color();

        // Distance from center affects color (ridges are whiter)
        const absX = Math.abs(worldX);
        const ridgeProximity = Math.min(
            Math.abs(absX - this.ridgeOffset),
            absX
        ) / this.mountainSpacing;

        if (ridgeProximity < 0.3) {
            // Ridge peaks - bright white/light blue
            color.lerpColors(iceWhite, iceBlue, ridgeProximity / 0.3);
        } else if (ridgeProximity < 0.6) {
            // Mid slopes - blue ice
            const t = (ridgeProximity - 0.3) / 0.3;
            color.lerpColors(iceBlue, iceCyan, t);
        } else {
            // Valley areas - deeper blue
            color.lerpColors(iceCyan, deepIce, Math.min(1, (ridgeProximity - 0.6) / 0.4));
        }

        // Add noise variation
        if (noiseVal > 0.3) {
            color.lerp(iceWhite, (noiseVal - 0.3) * 0.5);
        } else if (noiseVal < -0.3) {
            color.lerp(shadowBlue, Math.abs(noiseVal + 0.3) * 0.5);
        }

        // Detail noise for texture
        color.r += detailNoise * 0.05;
        color.g += detailNoise * 0.05;
        color.b += detailNoise * 0.03;

        return color;
    }

    /**
     * Get spawn position at the top of the slope
     * @returns {Object} {x, y, z} coordinates
     */
    getSpawnPosition() {
        // Spawn in the center valley, at z=0 (top of infinite slope)
        const spawnX = 0;
        const spawnZ = 0;
        const spawnY = this._calculateHeight(spawnX, spawnZ) + 5;

        return { x: spawnX, y: spawnY, z: spawnZ };
    }

    /**
     * Get terrain height at world position (for collision)
     */
    getHeightAt(worldX, worldZ) {
        return this._calculateHeight(worldX, worldZ);
    }

    /**
     * Get terrain normal at world position
     */
    getNormalAt(worldX, worldZ) {
        const delta = 1.0;
        const hL = this.getHeightAt(worldX - delta, worldZ);
        const hR = this.getHeightAt(worldX + delta, worldZ);
        const hD = this.getHeightAt(worldX, worldZ - delta);
        const hU = this.getHeightAt(worldX, worldZ + delta);

        const normal = new THREE.Vector3(hL - hR, 2 * delta, hD - hU);
        normal.normalize();

        return normal;
    }

    /**
     * Get surface type - FRICTIONLESS ICE everywhere
     */
    getSurfaceType(worldX, worldZ) {
        // Use the new frictionless ice surface type
        return SurfaceTypes.ICE_FRICTIONLESS || {
            type: 'ice_frictionless',
            friction: 0.01,
            drag: 0.1
        };
    }

    /**
     * Get gravity - normal gravity for sliding
     */
    getGravity() {
        return 20.0; // Increased gravity for faster downhill sliding
    }

    /**
     * Cleanup all chunk meshes
     */
    dispose() {
        for (const [chunkId, chunkMesh] of this.chunks) {
            this.mesh.remove(chunkMesh);
            if (chunkMesh.geometry) chunkMesh.geometry.dispose();
            if (chunkMesh.material) chunkMesh.material.dispose();
        }
        this.chunks.clear();

        // Dispose sky
        if (this.skyGroup) {
            this.mesh.remove(this.skyGroup);
        }
    }

    // --- Cosmic Skybox Generation ---

    _generateCosmicSky() {
        this._generateLandmarks(); // Add guaranteed visible objects
        this._generateStarfield();
        this._generateGalaxies();
        this._generateNebulae();
    }

    _generateLandmarks() {
        // 1. Massive Galaxy directly overhead/forward
        const galaxyPos = new THREE.Vector3(0, 1500, -1000);
        this._createSpiralGalaxy({
            position: galaxyPos,
            radius: 2000,
            colorInside: new THREE.Color(0xffaa00),
            colorOutside: new THREE.Color(0xaa00ff),
            rotation: { x: Math.PI / 3, y: 0, z: Math.PI / 4 }
        });
        this._addCosmicLight(galaxyPos, 0xffaa00, 3000.0, 8000); // Orange/Gold light. HUGE intensity.

        // 2. Large Nebula to the right
        const nebulaRightPos = new THREE.Vector3(1200, 1000, 500);
        this._createNebula({
            position: nebulaRightPos,
            scale: 2500,
            color: new THREE.Color(0x00ffff)
        });
        this._addCosmicLight(nebulaRightPos, 0x00ffff, 2500.0, 7000); // Cyan light

        // 3. Large Nebula to the left
        const nebulaLeftPos = new THREE.Vector3(-1200, 1200, -800);
        this._createNebula({
            position: nebulaLeftPos,
            scale: 2000,
            color: new THREE.Color(0xff0044)
        });
        this._addCosmicLight(nebulaLeftPos, 0xff0044, 2500.0, 7000); // Red/Pink light
    }

    _addCosmicLight(position, color, intensity, distance) {
        const light = new THREE.PointLight(color, 0, distance); // Start at 0 intensity
        light.position.copy(position);
        light.baseIntensity = intensity;
        light.decay = 1; // Linear falloff (physics is 2, which is too dim for this scale)
        this.skyGroup.add(light);
        this.skyLights.push(light);
    }

    _generateStarfield() {
        // Create a massive particle system for stars
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];

        const colorPalette = [
            new THREE.Color(0xffffff), // White
            new THREE.Color(0xaabbff), // Blue-ish
            new THREE.Color(0xffddaa), // Yellow-ish
            new THREE.Color(0xffaa88)  // Red-ish
        ];

        for (let i = 0; i < this.skyParams.starCount; i++) {
            const r = 8500 + Math.random() * this.skyParams.universeSize;
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            positions.push(x, y, z);

            // Random color
            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors.push(color.r, color.g, color.b);

            // Random size
            sizes.push(Math.random() * 2.0);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        // Shader material for twinkling stars with Global Opacity support
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pixelRatio: { value: window.devicePixelRatio },
                globalOpacity: { value: 0.0 } // Start invisible (day)
            },
            vertexShader: `
                    uniform float time;
                    uniform float pixelRatio;
                    attribute float size;
                    attribute vec3 color;
                    varying vec3 vColor;
                    
                    void main() {
                        vColor = color;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        
                        // Size attenuation
                        gl_PointSize = size * pixelRatio * (5000.0 / -mvPosition.z);
                        
                        // Twinkle effect
                        float twinkle = sin(time * 2.0 + position.x * 0.1) * 0.5 + 0.5;
                        gl_PointSize *= (0.8 + 0.4 * twinkle);
    
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
            fragmentShader: `
                    varying vec3 vColor;
                    uniform float globalOpacity;
                    
                    void main() {
                        // Circular particle
                        vec2 center = gl_PointCoord - 0.5;
                        float dist = length(center);
                        if (dist > 0.5) discard;
                        
                        // Soft edge
                        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                        
                        // Apply global opacity
                        gl_FragColor = vec4(vColor, alpha * globalOpacity);
                    }
                `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const starSystem = new THREE.Points(geometry, material);
        this.skyGroup.add(starSystem);
        this.skyObjects.push({ type: 'stars', mesh: starSystem, material: material });
    }

    _generateGalaxies() {
        for (let i = 0; i < this.skyParams.galaxyCount; i++) {
            const pos = new THREE.Vector3(
                (Math.random() - 0.5) * this.skyParams.universeSize,
                (Math.random() - 0.5) * this.skyParams.universeSize * 0.5 + 2000, // Bias upwards strongly
                (Math.random() - 0.5) * this.skyParams.universeSize
            );
            // Ensure slightly away but very close
            if (pos.length() < 1500) pos.setLength(1500 + Math.random() * 2000);

            this._createSpiralGalaxy({ position: pos });
        }
    }

    _createSpiralGalaxy(opts = {}) {
        // Procedural Spiral Galaxy
        const starCount = 3000;
        const arms = 3 + Math.floor(Math.random() * 3); // 3 to 5 arms
        const armWidth = 0.5;
        const radius = opts.radius || (2000 + Math.random() * 3000);

        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        // Choose galaxy colors
        const insideColor = opts.colorInside || new THREE.Color(Math.random(), Math.random(), Math.random());
        const outsideColor = opts.colorOutside || new THREE.Color(Math.random(), Math.random(), Math.random());

        for (let i = 0; i < starCount; i++) {
            const r = Math.random() * radius;
            const spinAngle = r * 0.002;
            const branchAngle = (i % arms) / arms * Math.PI * 2;

            const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r;
            const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r / 2;
            const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * armWidth * r;

            const x = Math.cos(branchAngle + spinAngle) * r + randomX;
            const y = randomY + (Math.random() - 0.5) * 200;
            const z = Math.sin(branchAngle + spinAngle) * r + randomZ;

            positions.push(x, y, z);

            const mixedColor = insideColor.clone();
            mixedColor.lerp(outsideColor, r / radius);
            colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 25,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            map: this._createStarTexture(),
            transparent: true,
            opacity: 0.0 // Start hidden
        });

        const galaxy = new THREE.Points(geometry, material);

        if (opts.position) galaxy.position.copy(opts.position);

        galaxy.rotation.x = Math.random() * Math.PI;
        galaxy.rotation.z = Math.random() * Math.PI;

        this.skyGroup.add(galaxy);
        this.skyObjects.push({
            type: 'galaxy',
            mesh: galaxy,
            material: material,
            rotSpeed: (Math.random() * 0.05 + 0.01) * (Math.random() < 0.5 ? 1 : -1),
            baseOpacity: 1.0 // Target opacity
        });
    }

    _generateNebulae() {
        for (let i = 0; i < this.skyParams.nebulaCount; i++) {
            const x = (Math.random() - 0.5) * this.skyParams.universeSize;
            const y = (Math.random() - 0.5) * this.skyParams.universeSize * 0.5 + 1500; // Bias upwards
            const z = (Math.random() - 0.5) * this.skyParams.universeSize;

            const pos = new THREE.Vector3(x, y, z);
            if (pos.length() < 1500) pos.setLength(1500 + Math.random() * 2000);

            const scale = 2000 + Math.random() * 3000;
            const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);

            this._createNebula({
                position: pos,
                scale: scale,
                color: color
            });
        }
    }

    _createNebula(opts) {
        const texture = this._getCloudTexture();
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.0, // Start hidden
            color: opts.color || 0x8800ff,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(opts.scale, opts.scale, 1);
        sprite.position.copy(opts.position);

        this.skyGroup.add(sprite);
        this.skyObjects.push({
            type: 'nebula',
            mesh: sprite,
            material: material,
            baseOpacity: 0.4
        });
    }

    _createStarTexture() {
        if (this._starTexture) return this._starTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        this._starTexture = new THREE.CanvasTexture(canvas);
        return this._starTexture;
    }

    _getCloudTexture() {
        if (!this._cloudTexture) this._cloudTexture = this._createCloudTexture();
        return this._cloudTexture;
    }

    _createCloudTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#000000';
        context.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 128;
            const y = Math.random() * 128;
            const r = 20 + Math.random() * 40;
            const grad = context.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = grad;
            context.beginPath();
            context.arc(x, y, r, 0, Math.PI * 2);
            context.fill();
        }
        return new THREE.CanvasTexture(canvas);
    }
}
