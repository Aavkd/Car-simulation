import * as THREE from 'three';
import { SurfaceTypes } from './physics-provider.js';

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
 * Everest Generator - Massive snow mountain with summit spawn
 * Creates a 5km x 5km terrain with a central mountain peak
 */
export class EverestGenerator {
    constructor(params = {}) {
        this.noise = new PerlinNoise(params.seed || 8848);

        // Terrain parameters - 10km x 10km map (100km²)
        this.size = 10000;          // 10km x 10km terrain
        this.segments = 500;        // Higher mesh resolution for detail

        // Mountain parameters - MASSIVE steep peak
        this.peakHeight = params.peakHeight || 800;   // 800m tall peak!
        this.baseHeight = 0;        // Base level
        this.mountainRadius = 1500; // Smaller radius = steeper slopes
        this.summitRadius = 100;    // Small summit area

        // Noise scales for rocky/snowy details
        this.ridgeScale = 0.003;    // Large rock formations
        this.detailScale = 0.012;   // Medium detail
        this.snowScale = 0.025;     // Small snow texture

        // Snow line (below this height, more rock visible)
        this.snowLineHeight = 150;

        this.mesh = null;
        this.heightData = [];
    }

    /**
     * Generate the terrain mesh
     * @returns {THREE.Mesh}
     */
    generate() {
        const geometry = new THREE.PlaneGeometry(
            this.size,
            this.size,
            this.segments,
            this.segments
        );

        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const colors = [];

        const gridSize = this.segments + 1;
        this.heightData = new Array(gridSize).fill(null).map(() => new Array(gridSize));

        // Generate heights and colors
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];

            const height = this._calculateHeight(x, z);
            positions[i + 1] = height;

            // Store for collision
            const gridX = Math.floor((i / 3) % gridSize);
            const gridZ = Math.floor((i / 3) / gridSize);
            this.heightData[gridZ][gridX] = { x, z, height };

            // Calculate color
            const color = this._calculateColor(height, x, z);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;

        // Add atmospheric fog plane at base
        this._createFogPlane();

        return this.mesh;
    }

    /**
     * Create a foggy base plane for atmosphere
     */
    _createFogPlane() {
        const fogGeometry = new THREE.PlaneGeometry(this.size * 1.5, this.size * 1.5);
        fogGeometry.rotateX(-Math.PI / 2);

        const fogMaterial = new THREE.MeshLambertMaterial({
            color: 0xc8d6e5,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const fog = new THREE.Mesh(fogGeometry, fogMaterial);
        fog.position.y = 20; // Fog at low altitude
        fog.receiveShadow = true;

        this.mesh.add(fog);
    }

    /**
     * Calculate terrain height at position
     * Creates a STEEP mountain peak with rocky/snow details
     */
    _calculateHeight(x, z) {
        // Distance from center
        const distFromCenter = Math.sqrt(x * x + z * z);

        // Mountain falloff - creates steep peak shape using exponential falloff
        let mountainFactor;
        if (distFromCenter < this.summitRadius) {
            // Summit area - small flat-ish top
            mountainFactor = 1.0 - (distFromCenter / this.summitRadius) * 0.02;
        } else if (distFromCenter < this.mountainRadius) {
            // Main mountain slope - STEEP exponential falloff
            const t = (distFromCenter - this.summitRadius) / (this.mountainRadius - this.summitRadius);
            // Use power function for steeper slopes (higher power = steeper)
            mountainFactor = Math.pow(1 - t, 1.8) * 0.98;
        } else if (distFromCenter < this.mountainRadius + 800) {
            // Foothills - gradual transition
            const t = (distFromCenter - this.mountainRadius) / 800;
            mountainFactor = (1 - t) * 0.12;
        } else {
            // Flat base area
            mountainFactor = 0;
        }

        // Base mountain height
        let height = mountainFactor * this.peakHeight;

        // Add dramatic cliff/ridge formations (larger scale)
        const ridgeNoise = this.noise.fbm(x * this.ridgeScale, z * this.ridgeScale, 4, 2.5, 0.55);
        height += ridgeNoise * 60 * mountainFactor;

        // Add steep ravines and gullies
        const ravineNoise = this.noise.noise2D(x * 0.006, z * 0.006);
        if (ravineNoise < -0.3 && mountainFactor > 0.2) {
            height -= Math.abs(ravineNoise + 0.3) * 80 * mountainFactor;
        }

        // Add medium detail rocky texture
        const detailNoise = this.noise.noise2D(x * this.detailScale, z * this.detailScale);
        height += detailNoise * 15 * mountainFactor;

        // Add small snow/ice texture
        const snowNoise = this.noise.noise2D(x * this.snowScale, z * this.snowScale);
        height += snowNoise * 3;

        // Ensure base is not below ground
        return Math.max(height + this.baseHeight, this.baseHeight);
    }

    /**
     * Smooth interpolation function
     */
    _smoothstep(t) {
        t = THREE.MathUtils.clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Calculate vertex color based on height and position
     * Creates snowy mountain appearance
     */
    _calculateColor(height, x, z) {
        // Color palette
        const snowWhite = new THREE.Color(0xffffff);      // Pure white snow
        const snowBlue = new THREE.Color(0xe8f4fc);       // Blue-tinted snow
        const snowShadow = new THREE.Color(0xc8dbe8);     // Shadowy snow
        const rockGray = new THREE.Color(0x6b7280);       // Exposed rock
        const rockDark = new THREE.Color(0x4b5563);       // Dark rock
        const iceBlue = new THREE.Color(0xbfdbfe);        // Icy patches

        // Distance from center
        const distFromCenter = Math.sqrt(x * x + z * z);

        let color = new THREE.Color();

        // Normalized height for color blending
        const normalizedHeight = height / this.peakHeight;

        // Add noise variation for natural look
        const noiseVal = this.noise.noise2D(x * 0.01, z * 0.01);
        const detailNoise = this.noise.noise2D(x * 0.05, z * 0.05);

        if (normalizedHeight > 0.85) {
            // Summit - pure white snow with blue tint
            color.lerpColors(snowBlue, snowWhite, (normalizedHeight - 0.85) / 0.15);
            // Add icy patches randomly
            if (detailNoise > 0.3) {
                color.lerp(iceBlue, 0.3);
            }
        } else if (normalizedHeight > 0.5) {
            // Mid mountain - mix of snow and rock
            const t = (normalizedHeight - 0.5) / 0.35;
            if (noiseVal > 0.2) {
                // Snow covered
                color.lerpColors(snowShadow, snowBlue, t);
            } else {
                // Exposed rock patches
                color.lerpColors(rockGray, snowShadow, t);
            }
        } else if (normalizedHeight > 0.2) {
            // Lower slopes - more rock, less snow
            const t = (normalizedHeight - 0.2) / 0.3;
            color.lerpColors(rockDark, rockGray, t);
            // Add snow patches
            if (noiseVal > 0.4) {
                color.lerp(snowShadow, 0.4);
            }
        } else {
            // Base - dark rock and sparse snow
            color.copy(rockDark);
            if (noiseVal > 0.6) {
                color.lerp(snowShadow, 0.2);
            }
        }

        // Add detail variation
        color.r += detailNoise * 0.03;
        color.g += detailNoise * 0.03;
        color.b += detailNoise * 0.04;

        return color;
    }

    /**
     * Get spawn position at the summit
     * @returns {Object} {x, z} coordinates for spawn
     */
    getSpawnPosition() {
        // Spawn slightly off-center at the summit for a nice starting view
        // Offset to give player a downhill direction
        return {
            x: 50,
            z: 80
        };
    }

    /**
     * Get terrain height at world position (for collision)
     */
    getHeightAt(worldX, worldZ) {
        const halfSize = this.size / 2;
        const cellSize = this.size / this.segments;

        const nx = (worldX + halfSize) / this.size;
        const nz = (worldZ + halfSize) / this.size;

        const gx = nx * this.segments;
        const gz = nz * this.segments;

        const x0 = Math.floor(gx);
        const z0 = Math.floor(gz);
        const x1 = Math.min(x0 + 1, this.segments);
        const z1 = Math.min(z0 + 1, this.segments);

        if (x0 < 0 || z0 < 0 || x0 >= this.segments || z0 >= this.segments) {
            return this.baseHeight;
        }

        const h00 = this.heightData[z0]?.[x0]?.height ?? this.baseHeight;
        const h10 = this.heightData[z0]?.[x1]?.height ?? this.baseHeight;
        const h01 = this.heightData[z1]?.[x0]?.height ?? this.baseHeight;
        const h11 = this.heightData[z1]?.[x1]?.height ?? this.baseHeight;

        const fx = gx - x0;
        const fz = gz - z0;

        const h0 = THREE.MathUtils.lerp(h00, h10, fx);
        const h1 = THREE.MathUtils.lerp(h01, h11, fx);

        return THREE.MathUtils.lerp(h0, h1, fz);
    }

    /**
     * Get terrain normal at world position
     */
    getNormalAt(worldX, worldZ) {
        const delta = 0.5;
        const hL = this.getHeightAt(worldX - delta, worldZ);
        const hR = this.getHeightAt(worldX + delta, worldZ);
        const hD = this.getHeightAt(worldX, worldZ - delta);
        const hU = this.getHeightAt(worldX, worldZ + delta);

        const normal = new THREE.Vector3(hL - hR, 2 * delta, hD - hU);
        normal.normalize();

        return normal;
    }

    /**
     * Get surface type - SNOW everywhere on the mountain
     */
    getSurfaceType(worldX, worldZ) {
        const height = this.getHeightAt(worldX, worldZ);

        // Ice patches at high altitude (even lower friction)
        if (height > this.peakHeight * 0.8) {
            const noiseVal = this.noise.noise2D(worldX * 0.02, worldZ * 0.02);
            if (noiseVal > 0.3) {
                return {
                    type: 'ice',
                    friction: 0.25,  // Very slippery ice
                    drag: 1.2
                };
            }
        }

        // Everything else is snow
        return SurfaceTypes.SNOW;
    }
}
