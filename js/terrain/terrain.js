import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Perlin Noise implementation for terrain generation
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

        // Duplicate for overflow
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

    /**
     * Multi-octave noise for natural terrain
     */
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
 * Terrain Generator - Creates large low-poly procedural terrain
 */
export class TerrainGenerator {
    constructor(config = {}) {
        this.config = config;
        this.noise = new PerlinNoise(config.seed || 42);

        // Terrain parameters
        this.size = config.size || 5000;          // Massive terrain (5km x 5km)
        this.segments = config.segments || 400;       // More segments to maintain detail
        this.maxHeight = config.maxHeight !== undefined ? config.maxHeight : 50;       // Higher mountains for epic scale
        this.baseHeight = config.baseHeight !== undefined ? config.baseHeight : 0;       // Level base
        this.heightScale = config.heightScale !== undefined ? config.heightScale : 1.0; // Global scalar for height

        // Noise parameters - MUCH lower scales for smoother, spread terrain
        this.noiseScale = config.noiseScale !== undefined ? config.noiseScale : 0.002;   // Very spread out base terrain
        this.hillScale = config.hillScale !== undefined ? config.hillScale : 0.006;    // Medium hills
        this.detailScale = config.detailScale !== undefined ? config.detailScale : 0.015;  // Gentle detail
        this.microScale = config.microScale !== undefined ? config.microScale : 0.04;    // Subtle micro texture

        // Noise Amplitudes (replacing hardcoded multipliers)
        this.baseNoiseHeight = config.baseNoiseHeight !== undefined ? config.baseNoiseHeight : 10;
        this.hillNoiseHeight = config.hillNoiseHeight !== undefined ? config.hillNoiseHeight : 6;
        this.detailNoiseHeight = config.detailNoiseHeight !== undefined ? config.detailNoiseHeight : 2;

        // Colors
        this.colors = config.colors || {
            grassLow: 0x3d5c3d,
            grassHigh: 0x5a7d4a,
            dirt: 0x6b5344,
            rock: 0x7a7a7a,
            snow: 0xe8e8e8,
            water: 0x1a6985
        };

        // Water
        this.waterLevel = config.waterLevel !== undefined ? config.waterLevel : -100; // Default hidden
        this.waterMesh = null;

        this.mesh = null;
        this.heightData = [];      // For collision queries
    }

    /**
     * Update terrain parameters
     * @param {Object} params - New parameters
     */
    updateParams(params) {
        if (params.seed !== undefined && params.seed !== this.config.seed) {
            this.noise = new PerlinNoise(params.seed);
            this.config.seed = params.seed;
        }

        if (params.size !== undefined) this.size = params.size;
        if (params.segments !== undefined) this.segments = params.segments;
        if (params.maxHeight !== undefined) this.maxHeight = params.maxHeight;
        if (params.baseHeight !== undefined) this.baseHeight = params.baseHeight;
        if (params.heightScale !== undefined) this.heightScale = params.heightScale;

        if (params.noiseScale !== undefined) this.noiseScale = params.noiseScale;
        if (params.hillScale !== undefined) this.hillScale = params.hillScale;
        if (params.detailScale !== undefined) this.detailScale = params.detailScale;
        if (params.microScale !== undefined) this.microScale = params.microScale;

        if (params.baseNoiseHeight !== undefined) this.baseNoiseHeight = params.baseNoiseHeight;
        if (params.hillNoiseHeight !== undefined) this.hillNoiseHeight = params.hillNoiseHeight;
        if (params.detailNoiseHeight !== undefined) this.detailNoiseHeight = params.detailNoiseHeight;

        if (params.waterLevel !== undefined) this.waterLevel = params.waterLevel;

        if (params.colors) {
            this.colors = { ...this.colors, ...params.colors };
        }
    }

    /**
     * Dispose of terrain resources
     */
    dispose() {
        if (this.mesh) {
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            // Dispose water child
            this.mesh.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
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

        // Rotate to be horizontal
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const colors = [];

        // Initialize height data array
        const gridSize = this.segments + 1;
        this.heightData = new Array(gridSize).fill(null).map(() => new Array(gridSize));

        // Generate heights and colors
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];

            // Calculate height using multi-octave noise
            const height = this._calculateHeight(x, z);
            positions[i + 1] = height;

            // Store for collision
            const gridX = Math.floor((i / 3) % gridSize);
            const gridZ = Math.floor((i / 3) / gridSize);
            this.heightData[gridZ][gridX] = { x, z, height };

            // Calculate color based on height and slope
            const color = this._calculateColor(height, x, z);
            colors.push(color.r, color.g, color.b);
        }

        // Add colors to geometry
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Compute normals for lighting
        geometry.computeVertexNormals();

        // Create material with vertex colors and flat shading for low-poly look
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;

        // Create water if level is high enough to be visible
        if (this.waterLevel > -50) {
            this._createWater();
        }

        return this.mesh;
    }

    _createWater() {
        const waterGeometry = new THREE.PlaneGeometry(this.size, this.size);
        waterGeometry.rotateX(-Math.PI / 2);

        const waterMaterial = new THREE.MeshLambertMaterial({
            color: this.colors.water,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });

        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.position.y = this.waterLevel;
        water.receiveShadow = true;

        this.mesh.add(water);
    }

    /**
     * Calculate terrain height at a given position
     */
    _calculateHeight(x, z) {
        // Base rolling terrain - very smooth, large scale
        let height = this.noise.fbm(x * this.noiseScale, z * this.noiseScale, 3, 2, 0.4) * this.baseNoiseHeight;

        // Medium hills - gentler
        height += this.noise.fbm(x * this.hillScale, z * this.hillScale, 3, 2, 0.5) * this.hillNoiseHeight;

        // Fine detail for subtle variation
        height += this.noise.noise2D(x * this.detailScale, z * this.detailScale) * this.detailNoiseHeight;

        // Micro texture for low-poly feel
        height += this.noise.noise2D(x * this.microScale, z * this.microScale) * 0.5;

        // MOUNTAINS - scarce and spread out
        // Use very low frequency noise to determine mountain regions
        const mountainNoise = this.noise.noise2D(x * 0.001, z * 0.001);
        if (mountainNoise > 0.5) {
            // Only add mountains in specific areas (when noise > 0.5)
            const mountainIntensity = (mountainNoise - 0.5) * 2; // 0 to 1
            const mountainHeight = this.noise.fbm(x * 0.004, z * 0.004, 4, 2, 0.6) * this.maxHeight;
            height += mountainHeight * mountainIntensity * mountainIntensity; // Squared for sharper transition
        }

        // Large flat plains - make most of the terrain flat
        const plainNoise = this.noise.noise2D(x * 0.0015, z * 0.0015);
        if (plainNoise < 0.2) {
            // Strong flattening in plain areas
            const flattenFactor = (0.2 - plainNoise) / 0.2;
            height = THREE.MathUtils.lerp(height, 2, flattenFactor * 0.8);
        } else if (plainNoise < 0.4) {
            // Gentle flattening in transition areas
            const flattenFactor = (0.4 - plainNoise) / 0.2;
            height = THREE.MathUtils.lerp(height, height * 0.5 + 2, flattenFactor * 0.4);
        }

        // Add base height
        height += this.baseHeight;

        return height * this.heightScale;
    }

    /**
     * Calculate vertex color based on height and position
     */
    _calculateColor(height, x, z) {
        // Color palette for natural terrain
        const grassLow = new THREE.Color(this.colors.grassLow);    // Dark grass
        const grassHigh = new THREE.Color(this.colors.grassHigh);   // Light grass
        const dirt = new THREE.Color(this.colors.dirt);        // Brown dirt
        const rock = new THREE.Color(this.colors.rock);        // Grey rock
        const snow = new THREE.Color(this.colors.snow);        // White snow

        // Add some noise to color transitions
        const colorNoise = this.noise.noise2D(x * 0.05, z * 0.05) * 0.3;
        const adjustedHeight = height + colorNoise * 10;

        let color = new THREE.Color();

        if (adjustedHeight < 0) {
            // Low areas - dark grass with dirt patches
            color.lerpColors(dirt, grassLow, (adjustedHeight + 5) / 5);
        } else if (adjustedHeight < 10) {
            // Mid areas - grass
            color.lerpColors(grassLow, grassHigh, adjustedHeight / 10);
        } else if (adjustedHeight < 20) {
            // Higher areas - grass to rock
            color.lerpColors(grassHigh, rock, (adjustedHeight - 10) / 10);
        } else if (adjustedHeight < 30) {
            // High areas - rock
            color.copy(rock);
        } else {
            // Peaks - snow
            color.lerpColors(rock, snow, (adjustedHeight - 30) / 10);
        }

        // Add subtle color variation
        const variation = 0.05;
        color.r += (Math.random() - 0.5) * variation;
        color.g += (Math.random() - 0.5) * variation;
        color.b += (Math.random() - 0.5) * variation;

        return color;
    }

    /**
     * Get terrain height at world position (for collision)
     * Uses bilinear interpolation for smooth results
     */
    getHeightAt(worldX, worldZ) {
        // Convert world position to grid coordinates
        const halfSize = this.size / 2;
        const cellSize = this.size / this.segments;

        // Normalize to 0-1 range across terrain
        const nx = (worldX + halfSize) / this.size;
        const nz = (worldZ + halfSize) / this.size;

        // Get grid indices
        const gx = nx * this.segments;
        const gz = nz * this.segments;

        const x0 = Math.floor(gx);
        const z0 = Math.floor(gz);
        const x1 = Math.min(x0 + 1, this.segments);
        const z1 = Math.min(z0 + 1, this.segments);

        // Check bounds
        if (x0 < 0 || z0 < 0 || x0 >= this.segments || z0 >= this.segments) {
            return 0;
        }

        // Get corner heights
        const h00 = this.heightData[z0]?.[x0]?.height ?? 0;
        const h10 = this.heightData[z0]?.[x1]?.height ?? 0;
        const h01 = this.heightData[z1]?.[x0]?.height ?? 0;
        const h11 = this.heightData[z1]?.[x1]?.height ?? 0;

        // Bilinear interpolation
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
     * Get surface type/properties at world position
     * Returns friction and drag properties based on terrain height
     * @param {number} worldX - World X coordinate
     * @param {number} worldZ - World Z coordinate
     * @returns {SurfaceProperties} Surface properties for physics
     */
    getSurfaceType(worldX, worldZ) {
        const height = this.getHeightAt(worldX, worldZ);

        if (height < this.waterLevel) {
            return {
                type: 'water',
                friction: 0.3,
                drag: 5.0
            };
        }

        // Return surface type based on height/biome
        if (height < 0) {
            return SurfaceTypes.DIRT;
        } else if (height < 15) {
            return SurfaceTypes.GRASS;
        } else if (height < 25) {
            return SurfaceTypes.GRAVEL;
        } else {
            return SurfaceTypes.SNOW;
        }
    }

    /**
     * Check if this is Deep Space terrain (for warp effect)
     * @returns {boolean}
     */
    isDeepSpace() {
        return false;
    }
}

