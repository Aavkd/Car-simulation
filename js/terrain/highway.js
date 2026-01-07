import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Perlin Noise for terrain variation
 */
class PerlinNoise {
    constructor(seed = Math.random() * 10000) {
        this.permutation = this._generatePermutation(seed);
    }

    _generatePermutation(seed) {
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;
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
 * Highway Generator - Long highway cutting through gentle terrain
 * Features: Multi-lane road, grass/dirt edges, gentle hills
 */
export class HighwayGenerator {
    constructor(params = {}) {
        this.noise = new PerlinNoise(params.seed || 456);

        // Terrain parameters
        this.size = 5000;           // 5km x 5km area
        this.segments = 400;        // Mesh resolution

        // Road parameters
        this.roadWidth = 40;        // 4-lane highway width
        this.shoulderWidth = 8;     // Gravel shoulder on each side
        this.rumbleWidth = 2;       // Rumble strip marking

        // Terrain height parameters
        this.maxHeight = 25;        // Gentle rolling hills
        this.noiseScale = 0.002;
        this.hillScale = 0.005;

        this.mesh = null;
        this.heightData = [];
    }

    /**
     * Generate the terrain mesh
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

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];

            const height = this._calculateHeight(x, z);
            positions[i + 1] = height;

            const gridX = Math.floor((i / 3) % gridSize);
            const gridZ = Math.floor((i / 3) / gridSize);
            this.heightData[gridZ][gridX] = { x, z, height };

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

        // Add road markings
        this._createRoadMarkings();

        return this.mesh;
    }

    /**
     * Create road lane markings as a separate mesh
     */
    _createRoadMarkings() {
        // Center dashed line
        const dashLength = 8;
        const dashGap = 12;
        const lineWidth = 0.3;
        const numDashes = Math.floor(this.size / (dashLength + dashGap));

        const markingGeometry = new THREE.PlaneGeometry(lineWidth, dashLength);
        const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        for (let i = 0; i < numDashes; i++) {
            const dash = new THREE.Mesh(markingGeometry, markingMaterial);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.1, -this.size / 2 + i * (dashLength + dashGap) + dashLength / 2);
            this.mesh.add(dash);
        }

        // Solid edge lines
        const edgeGeometry = new THREE.PlaneGeometry(0.4, this.size);
        const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        leftEdge.rotation.x = -Math.PI / 2;
        leftEdge.position.set(-this.roadWidth / 2 + 1, 0.1, 0);
        this.mesh.add(leftEdge);

        const rightEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        rightEdge.rotation.x = -Math.PI / 2;
        rightEdge.position.set(this.roadWidth / 2 - 1, 0.1, 0);
        this.mesh.add(rightEdge);
    }

    /**
     * Calculate terrain height
     * Road is flat, surrounding terrain has gentle hills
     */
    _calculateHeight(x, z) {
        const halfRoad = this.roadWidth / 2;
        const totalWidth = halfRoad + this.shoulderWidth;

        // Distance from road center (road runs along X=0)
        const distFromRoad = Math.abs(x);

        // On the road - perfectly flat
        if (distFromRoad <= halfRoad) {
            return 0;
        }

        // On shoulder - slight slope up
        if (distFromRoad <= totalWidth) {
            const t = (distFromRoad - halfRoad) / this.shoulderWidth;
            return t * 0.5;
        }

        // Off-road terrain - gentle rolling hills
        const terrainDist = distFromRoad - totalWidth;
        const transitionZone = 30; // Gradual blend from road to hills

        // Base terrain height
        let height = this.noise.fbm(x * this.noiseScale, z * this.noiseScale, 3, 2, 0.4) * 8;
        height += this.noise.fbm(x * this.hillScale, z * this.hillScale, 3, 2, 0.5) * this.maxHeight;
        height += this.noise.noise2D(x * 0.01, z * 0.01) * 3;

        // Smooth transition from flat road edge to hills
        if (terrainDist < transitionZone) {
            const t = terrainDist / transitionZone;
            height = THREE.MathUtils.lerp(0.5, height, this._smoothstep(t));
        }

        return Math.max(0, height);
    }

    _smoothstep(t) {
        t = THREE.MathUtils.clamp(t, 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Calculate vertex color
     */
    _calculateColor(height, x, z) {
        const halfRoad = this.roadWidth / 2;
        const totalWidth = halfRoad + this.shoulderWidth;
        const distFromRoad = Math.abs(x);

        // Color palette
        const asphalt = new THREE.Color(0x2a2a2a);      // Dark grey road
        const asphaltLight = new THREE.Color(0x3a3a3a); // Slightly lighter for variation
        const gravel = new THREE.Color(0x6b6b60);       // Shoulder gravel
        const grassDark = new THREE.Color(0x3d5c3d);    // Dark grass
        const grassLight = new THREE.Color(0x5a8a4a);   // Light grass
        const dirt = new THREE.Color(0x6b5344);         // Dirt patches

        let color = new THREE.Color();

        // Road surface
        if (distFromRoad <= halfRoad) {
            color.lerpColors(asphalt, asphaltLight, Math.random() * 0.3);
            // Add some wear variation
            const wear = this.noise.noise2D(x * 0.05, z * 0.05);
            color.r += wear * 0.05;
            color.g += wear * 0.05;
            color.b += wear * 0.05;
        }
        // Shoulder
        else if (distFromRoad <= totalWidth) {
            color.copy(gravel);
            const variation = this.noise.noise2D(x * 0.1, z * 0.1) * 0.1;
            color.r += variation;
            color.g += variation;
            color.b += variation;
        }
        // Grass/terrain
        else {
            // Mix grass and dirt based on noise
            const grassFactor = this.noise.noise2D(x * 0.02, z * 0.02) * 0.5 + 0.5;
            color.lerpColors(dirt, grassDark, grassFactor);

            // Lighter grass on higher ground
            if (height > 5) {
                const t = Math.min((height - 5) / 15, 1);
                color.lerpColors(color, grassLight, t * 0.5);
            }

            // Random variation
            const variation = 0.04;
            color.r += (Math.random() - 0.5) * variation;
            color.g += (Math.random() - 0.5) * variation;
            color.b += (Math.random() - 0.5) * variation;
        }

        return color;
    }

    /**
     * Get terrain height at world position
     */
    getHeightAt(worldX, worldZ) {
        const halfSize = this.size / 2;

        const nx = (worldX + halfSize) / this.size;
        const nz = (worldZ + halfSize) / this.size;

        const gx = nx * this.segments;
        const gz = nz * this.segments;

        const x0 = Math.floor(gx);
        const z0 = Math.floor(gz);
        const x1 = Math.min(x0 + 1, this.segments);
        const z1 = Math.min(z0 + 1, this.segments);

        if (x0 < 0 || z0 < 0 || x0 >= this.segments || z0 >= this.segments) {
            return 0;
        }

        const h00 = this.heightData[z0]?.[x0]?.height ?? 0;
        const h10 = this.heightData[z0]?.[x1]?.height ?? 0;
        const h01 = this.heightData[z1]?.[x0]?.height ?? 0;
        const h11 = this.heightData[z1]?.[x1]?.height ?? 0;

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
     * Get surface type based on position
     */
    getSurfaceType(worldX, worldZ) {
        const halfRoad = this.roadWidth / 2;
        const totalWidth = halfRoad + this.shoulderWidth;
        const distFromRoad = Math.abs(worldX);

        // On road - tarmac
        if (distFromRoad <= halfRoad) {
            return SurfaceTypes.TARMAC;
        }

        // On shoulder - gravel
        if (distFromRoad <= totalWidth) {
            return SurfaceTypes.GRAVEL;
        }

        // Off-road - grass
        return SurfaceTypes.GRASS;
    }
}
