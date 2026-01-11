import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Perlin Noise implementation for dune generation
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
 * Dunes Generator - Desert island surrounded by ocean
 * Creates a 5km x 5km island with sand dunes
 */
export class DunesGenerator {
    constructor(config = {}) {
        this.config = config;
        this.noise = new PerlinNoise(config.seed || 123);

        // Island/terrain parameters
        this.size = config.size || 5000;           // 5km x 5km island
        this.segments = config.segments || 400;        // Mesh resolution
        this.maxHeight = config.maxHeight !== undefined ? config.maxHeight : 35;        // Max dune height
        this.baseHeight = config.baseHeight !== undefined ? config.baseHeight : 0;        // Sea level
        this.heightScale = config.heightScale || 1.0;

        // Island shape parameters
        this.islandRadius = 2200;   // Radius of the island (~4.4km diameter)
        this.beachWidth = 150;      // Width of beach transition

        // Dune noise parameters - smooth, flowing shapes
        this.duneScale = config.noiseScale || 0.003;     // Large primary dunes
        this.ridgeScale = config.hillScale || 0.008;    // Ridge detail
        this.rippleScale = config.detailScale || 0.02;    // Small ripple detail
        // microScale not used in dunes yet, but could be mapped or ignored

        // Ocean parameters
        this.waterLevel = -2;       // Ocean surface level
        this.oceanDepth = -15;      // Deep ocean floor

        this.mesh = null;
        this.heightData = [];
    }

    updateParams(params) {
        if (params.seed !== undefined && params.seed !== this.config.seed) {
            this.noise = new PerlinNoise(params.seed);
            this.config.seed = params.seed;
        }
        if (params.maxHeight !== undefined) this.maxHeight = params.maxHeight;
        if (params.baseHeight !== undefined) this.baseHeight = params.baseHeight;
        if (params.heightScale !== undefined) this.heightScale = params.heightScale;

        // Map generic params to specific dune params
        if (params.noiseScale !== undefined) this.duneScale = params.noiseScale;
        if (params.hillScale !== undefined) this.ridgeScale = params.hillScale;
        if (params.detailScale !== undefined) this.rippleScale = params.detailScale;
    }

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

        // Add water plane
        this._createWater();

        return this.mesh;
    }

    /**
     * Create water surface for the ocean
     */
    _createWater() {
        const waterGeometry = new THREE.PlaneGeometry(this.size * 1.5, this.size * 1.5);
        waterGeometry.rotateX(-Math.PI / 2);

        const waterMaterial = new THREE.MeshLambertMaterial({
            color: 0x1a6985,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.position.y = this.waterLevel;
        water.receiveShadow = true;

        // Add water as child of terrain mesh so it's added to scene together
        this.mesh.add(water);
    }

    /**
     * Calculate terrain height at position
     * Uses island falloff + dune noise
     */
    _calculateHeight(x, z) {
        // Distance from center for island shape
        const distFromCenter = Math.sqrt(x * x + z * z);

        // Island falloff - smooth transition from island to ocean
        let islandFactor;
        if (distFromCenter < this.islandRadius - this.beachWidth) {
            // Fully on island
            islandFactor = 1.0;
        } else if (distFromCenter < this.islandRadius) {
            // Beach transition zone
            const t = (distFromCenter - (this.islandRadius - this.beachWidth)) / this.beachWidth;
            islandFactor = 1.0 - this._smoothstep(t);
        } else if (distFromCenter < this.islandRadius + 200) {
            // Shallow water transition
            const t = (distFromCenter - this.islandRadius) / 200;
            islandFactor = -t * 0.5;
        } else {
            // Deep ocean
            islandFactor = -0.5;
        }

        // If in ocean, return ocean floor
        if (islandFactor < 0) {
            return this.oceanDepth * Math.abs(islandFactor);
        }

        // Dune height calculation
        let height = 0;

        // Primary large dunes - long flowing waves
        height += this.noise.fbm(x * this.duneScale, z * this.duneScale, 3, 2, 0.5) * this.maxHeight;

        // Ridge patterns - adds characteristic dune ridges
        const ridgeNoise = this.noise.noise2D(x * this.ridgeScale, z * this.ridgeScale);
        height += Math.abs(ridgeNoise) * 8;

        // Small ripples for texture
        height += this.noise.noise2D(x * this.rippleScale, z * this.rippleScale) * 1.5;

        // Apply island factor
        height *= islandFactor;

        // Beach elevation (low area near water)
        if (islandFactor < 0.3 && islandFactor > 0) {
            height = THREE.MathUtils.lerp(1, height, islandFactor / 0.3);
        }

        return (height + this.baseHeight) * this.heightScale;
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
     */
    _calculateColor(height, x, z) {
        // Sand color palette
        const sandLight = new THREE.Color(0xf4d69a);   // Light sand
        const sandMid = new THREE.Color(0xdbb36b);    // Mid sand
        const sandDark = new THREE.Color(0xc9a050);   // Shadow sand
        const sandWet = new THREE.Color(0x9e7d3d);    // Wet beach sand
        const oceanFloor = new THREE.Color(0x1a4a5e); // Ocean floor

        // Distance from center for island detection
        const distFromCenter = Math.sqrt(x * x + z * z);

        let color = new THREE.Color();

        // Underwater
        if (height < this.waterLevel) {
            const depth = (this.waterLevel - height) / Math.abs(this.oceanDepth);
            color.lerpColors(sandWet, oceanFloor, THREE.MathUtils.clamp(depth, 0, 1));
        }
        // Beach zone (near water)
        else if (distFromCenter > this.islandRadius - this.beachWidth * 1.5) {
            color.copy(sandWet);
            // Add some variation
            const variation = this.noise.noise2D(x * 0.02, z * 0.02) * 0.1;
            color.r += variation;
            color.g += variation * 0.8;
        }
        // Dune coloring based on height and slope
        else {
            const normalizedHeight = (height - this.baseHeight) / this.maxHeight;

            if (normalizedHeight < 0.3) {
                color.lerpColors(sandDark, sandMid, normalizedHeight / 0.3);
            } else if (normalizedHeight < 0.7) {
                color.lerpColors(sandMid, sandLight, (normalizedHeight - 0.3) / 0.4);
            } else {
                color.copy(sandLight);
            }

            // Add noise variation for natural look
            const variation = this.noise.noise2D(x * 0.03, z * 0.03) * 0.08;
            color.r += variation;
            color.g += variation * 0.8;
            color.b += variation * 0.5;
        }

        return color;
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
            return this.waterLevel;
        }

        const h00 = this.heightData[z0]?.[x0]?.height ?? this.waterLevel;
        const h10 = this.heightData[z0]?.[x1]?.height ?? this.waterLevel;
        const h01 = this.heightData[z1]?.[x0]?.height ?? this.waterLevel;
        const h11 = this.heightData[z1]?.[x1]?.height ?? this.waterLevel;

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
     * Get surface type - always SAND on the island
     */
    getSurfaceType(worldX, worldZ) {
        const height = this.getHeightAt(worldX, worldZ);

        // Underwater = high drag (water resistance)
        if (height < this.waterLevel - 1) {
            return {
                type: 'water',
                friction: 0.3,
                drag: 5.0  // Very high drag in water
            };
        }

        // Everything else is sand
        return SurfaceTypes.SAND;
    }
}
