import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * Perlin Noise for variation
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
}

/**
 * District definitions for varied city areas
 */
const Districts = {
    DOWNTOWN: {
        name: 'Downtown',
        blockSize: 60,
        streetWidth: 25,
        buildingHeight: { min: 20, max: 60 },
        density: 0.9,  // Chance of building per block
        color: new THREE.Color(0x4a4a5a)  // Blue-grey
    },
    INDUSTRIAL: {
        name: 'Industrial',
        blockSize: 100,
        streetWidth: 30,
        buildingHeight: { min: 8, max: 18 },
        density: 0.7,
        color: new THREE.Color(0x5a5045)  // Brown-grey
    },
    RESIDENTIAL: {
        name: 'Residential',
        blockSize: 50,
        streetWidth: 15,
        buildingHeight: { min: 5, max: 12 },
        density: 0.6,
        color: new THREE.Color(0x5a6055)  // Green-grey
    },
    COMMERCIAL: {
        name: 'Commercial',
        blockSize: 70,
        streetWidth: 22,
        buildingHeight: { min: 10, max: 30 },
        density: 0.8,
        color: new THREE.Color(0x605a50)  // Warm grey
    },
    PARK: {
        name: 'Park',
        blockSize: 120,
        streetWidth: 12,
        buildingHeight: { min: 0, max: 2 },
        density: 0.1,  // Mostly open space
        color: new THREE.Color(0x4a6a4a)  // Green
    }
};

/**
 * City Generator - Urban grid with distinct districts
 * 10 km² city area (approx 3.16km x 3.16km square, we'll use 3.5km x 3.0km)
 */
export class CityGenerator {
    constructor(params = {}) {
        this.noise = new PerlinNoise(params.seed || 789);

        // City dimensions - 10km² area
        this.sizeX = 3500;          // 3.5km width
        this.sizeZ = 3000;          // 3km depth (~10.5 km²)
        this.segments = 350;        // Mesh resolution

        // Building collision data
        this.buildings = [];        // Array of building bounds for raycasting

        // Road parameters
        this.defaultBlockSize = 70;
        this.defaultStreetWidth = 20;

        this.mesh = null;
        this.heightData = [];
    }

    /**
     * Generate the terrain and buildings
     */
    generate() {
        // Generate flat ground with roads colored in
        const geometry = new THREE.PlaneGeometry(
            this.sizeX,
            this.sizeZ,
            this.segments,
            Math.floor(this.segments * (this.sizeZ / this.sizeX))
        );

        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;
        const colors = [];

        const gridSizeX = this.segments + 1;
        const gridSizeZ = Math.floor(this.segments * (this.sizeZ / this.sizeX)) + 1;

        // Initialize height data
        this.heightData = [];
        for (let z = 0; z < gridSizeZ; z++) {
            this.heightData[z] = [];
        }

        // Process each vertex
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];

            // Ground is flat
            const height = 0;
            positions[i + 1] = height;

            // Store for collision
            const idx = i / 3;
            const gridX = idx % gridSizeX;
            const gridZ = Math.floor(idx / gridSizeX);
            if (this.heightData[gridZ]) {
                this.heightData[gridZ][gridX] = { x, z, height };
            }

            // Calculate color based on district and position
            const color = this._calculateGroundColor(x, z);
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

        // Generate 3D buildings
        this._generateBuildings();

        return this.mesh;
    }

    /**
     * Get district at position based on city zones
     */
    _getDistrictAt(x, z) {
        // Normalize to 0-1 range
        const nx = (x + this.sizeX / 2) / this.sizeX;
        const nz = (z + this.sizeZ / 2) / this.sizeZ;

        // District layout:
        // - Center: Downtown (high-rise)
        // - North: Industrial
        // - South: Residential
        // - East/West edges: Commercial
        // - Scattered: Parks

        const distFromCenter = Math.sqrt(Math.pow(nx - 0.5, 2) + Math.pow(nz - 0.5, 2));

        // Parks - scattered using noise
        const parkNoise = this.noise.noise2D(x * 0.002, z * 0.002);
        if (parkNoise > 0.6 && distFromCenter > 0.15) {
            return Districts.PARK;
        }

        // Downtown core
        if (distFromCenter < 0.15) {
            return Districts.DOWNTOWN;
        }

        // Industrial - northern part
        if (nz < 0.25) {
            return Districts.INDUSTRIAL;
        }

        // Residential - southern part
        if (nz > 0.7) {
            return Districts.RESIDENTIAL;
        }

        // Commercial - edges and remaining
        if (nx < 0.2 || nx > 0.8) {
            return Districts.COMMERCIAL;
        }

        // Transition zones - mix based on distance
        if (distFromCenter < 0.3) {
            return Districts.DOWNTOWN;
        }

        return Districts.COMMERCIAL;
    }

    /**
     * Check if position is on a road
     */
    _isOnRoad(x, z) {
        const district = this._getDistrictAt(x, z);
        const blockSize = district.blockSize;
        const streetWidth = district.streetWidth;

        // Calculate grid position
        const cellX = Math.abs(x % blockSize);
        const cellZ = Math.abs(z % blockSize);

        // On road if within street width from edge of block
        return cellX < streetWidth / 2 || cellZ < streetWidth / 2;
    }

    /**
     * Calculate ground color
     */
    _calculateGroundColor(x, z) {
        const district = this._getDistrictAt(x, z);
        const isRoad = this._isOnRoad(x, z);

        const roadColor = new THREE.Color(0x2a2a2a);      // Dark asphalt
        const parkGrass = new THREE.Color(0x4a7a4a);      // Park grass

        if (isRoad) {
            // Road with slight variation
            const variation = this.noise.noise2D(x * 0.1, z * 0.1) * 0.03;
            return new THREE.Color(
                roadColor.r + variation,
                roadColor.g + variation,
                roadColor.b + variation
            );
        }

        // Park areas - grass
        if (district === Districts.PARK) {
            const variation = this.noise.noise2D(x * 0.05, z * 0.05) * 0.1;
            return new THREE.Color(
                parkGrass.r + variation,
                parkGrass.g + variation * 1.5,
                parkGrass.b + variation
            );
        }

        // Building footprint area - show as concrete/pavement
        const sidewalk = new THREE.Color(0x6a6a6a);
        const variation = this.noise.noise2D(x * 0.08, z * 0.08) * 0.05;
        return new THREE.Color(
            sidewalk.r + variation,
            sidewalk.g + variation,
            sidewalk.b + variation
        );
    }

    /**
     * Generate 3D building meshes
     */
    _generateBuildings() {
        const buildingMaterial = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true
        });

        // Use instanced mesh for performance
        const tempGeometry = new THREE.BoxGeometry(1, 1, 1);
        const buildingMeshes = [];

        // Iterate over grid to place buildings
        const halfX = this.sizeX / 2;
        const halfZ = this.sizeZ / 2;

        for (let bx = -halfX + 50; bx < halfX - 50; bx += 80) {
            for (let bz = -halfZ + 50; bz < halfZ - 50; bz += 80) {
                const district = this._getDistrictAt(bx, bz);

                // Skip if on road
                if (this._isOnRoad(bx, bz)) continue;

                // Random chance based on district density
                if (Math.random() > district.density) continue;

                // Building dimensions
                const width = district.blockSize * 0.6 + Math.random() * district.blockSize * 0.2;
                const depth = district.blockSize * 0.6 + Math.random() * district.blockSize * 0.2;
                const height = THREE.MathUtils.lerp(
                    district.buildingHeight.min,
                    district.buildingHeight.max,
                    Math.random()
                );

                // Skip very short buildings (parks)
                if (height < 3) continue;

                // Create building geometry
                const buildingGeom = new THREE.BoxGeometry(width, height, depth);

                // Color the building
                const colors = [];
                const baseColor = district.color.clone();

                // Add variation
                const variation = (Math.random() - 0.5) * 0.1;
                baseColor.r += variation;
                baseColor.g += variation;
                baseColor.b += variation;

                // Make top slightly darker
                const positionAttribute = buildingGeom.attributes.position;
                for (let i = 0; i < positionAttribute.count; i++) {
                    const y = positionAttribute.getY(i);
                    const shade = y > 0 ? 0.9 : 1.0;
                    colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);
                }

                buildingGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

                const building = new THREE.Mesh(buildingGeom, buildingMaterial);
                building.position.set(bx, height / 2, bz);
                building.castShadow = true;
                building.receiveShadow = true;

                this.mesh.add(building);

                // Store building bounds for collision
                this.buildings.push({
                    minX: bx - width / 2,
                    maxX: bx + width / 2,
                    minZ: bz - depth / 2,
                    maxZ: bz + depth / 2,
                    height: height
                });
            }
        }

        console.log(`[CityGenerator] Created ${this.buildings.length} buildings`);
    }

    /**
     * Get height at position - includes building collision
     */
    getHeightAt(worldX, worldZ) {
        // Check if inside a building
        for (const building of this.buildings) {
            if (worldX >= building.minX && worldX <= building.maxX &&
                worldZ >= building.minZ && worldZ <= building.maxZ) {
                // Return building top height (car can't drive over buildings)
                return building.height;
            }
        }

        // Ground level
        return 0;
    }

    /**
     * Get terrain normal - flat ground or building top
     */
    getNormalAt(worldX, worldZ) {
        // City is flat, normal is always up
        return new THREE.Vector3(0, 1, 0);
    }

    /**
     * Get surface type
     */
    getSurfaceType(worldX, worldZ) {
        // Check if on a building
        for (const building of this.buildings) {
            if (worldX >= building.minX && worldX <= building.maxX &&
                worldZ >= building.minZ && worldZ <= building.maxZ) {
                // On a building - shouldn't happen but return high drag
                return {
                    type: 'building',
                    friction: 0.1,
                    drag: 10.0  // Very high drag to stop the car
                };
            }
        }

        // Check if on road
        if (this._isOnRoad(worldX, worldZ)) {
            return SurfaceTypes.TARMAC;
        }

        // Park area
        const district = this._getDistrictAt(worldX, worldZ);
        if (district === Districts.PARK) {
            return SurfaceTypes.GRASS;
        }

        // Sidewalk/pavement
        return SurfaceTypes.TARMAC;
    }
}
