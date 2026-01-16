import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';

/**
 * City Generator
 * Procedurally generates a grid-based city with districts, skyscrapers, and realistic traffic layout.
 */
export class CityGenerator {
    constructor(params = {}) {
        this.seed = params.seed || 12345;
        
        // Dimensions
        this.size = params.size || 6000;
        this.blockSize = params.blockSize || 140;
        this.roadWidth = params.roadWidth || 20;
        
        // Physics
        this.groundHeight = 0;
        this.sidewalkHeight = params.sidewalkHeight !== undefined ? params.sidewalkHeight : 0.25; // Curb height
        this.sidewalkWidth = 5; // Fixed sidewalk width
        
        // Logic
        this.avenueInterval = 4;
        this.gridStep = this.blockSize + this.roadWidth;

        // Meshes
        this.mesh = null;
        this.buildingMesh = null;
        this.sidewalkMesh = null;
        
        // Cache
        this._districtCache = new Map();
    }

    /**
     * Generate the city mesh
     */
    generate() {
        console.log('[CityGenerator] Starting generation...');
        this.mesh = new THREE.Group();

        // 1. Create Base Asphalt Plane (The Roads)
        // We make this huge so it covers everything
        const groundGeo = new THREE.PlaneGeometry(this.size, this.size);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); // Dark Asphalt
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.receiveShadow = true;
        this.mesh.add(ground);

        // 2. Prepare Instances
        // We calculate how many blocks fit in the map
        const blocksPerSide = Math.floor(this.size / this.gridStep);
        const totalBlocks = blocksPerSide * blocksPerSide;
        
        console.log(`[CityGenerator] Grid size: ${blocksPerSide}x${blocksPerSide}, Total blocks: ${totalBlocks}`);
        
        // Sidewalk Instances (The "Islands" inside the asphalt ocean)
        const sidewalkGeo = new THREE.BoxGeometry(1, 1, 1);
        // Translate geometry so bottom is at 0, useful for scaling
        sidewalkGeo.translate(0, 0.5, 0); 
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x555555 }); // Concrete
        this.sidewalkMesh = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, totalBlocks);
        this.sidewalkMesh.receiveShadow = true;
        this.sidewalkMesh.castShadow = true;

        // Building Instances
        // We'll assume max 4 buildings per block to keep count reasonable
        const maxBuildings = totalBlocks * 4; 
        const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
        buildingGeo.translate(0, 0.5, 0); // Pivot at bottom
        
        // Restore texture material (simplified - no custom shader injection to ensure visibility)
        const buildingMat = this._createBuildingMaterial();
        // Force clear onBeforeCompile just in case, though we will fix the method itself
        buildingMat.onBeforeCompile = () => {}; 
        
        this.buildingMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, maxBuildings);
        this.buildingMesh.receiveShadow = true;
        this.buildingMesh.castShadow = true;
        
        // CRITICAL: Disable culling because the bounding sphere is not computed for the whole city
        // The default bounding sphere is small and centered at 0,0, causing buildings to vanish when looking away
        this.buildingMesh.frustumCulled = false;

        // 3. Populate Grid

        // 3. Populate Grid
        let sidewalkIdx = 0;
        let buildingIdx = 0;
        
        const dummy = new THREE.Object3D();
        const halfSize = this.size / 2;
        const color = new THREE.Color();

        // Iterate grid
        // We center the grid around 0,0
        const range = Math.floor(blocksPerSide / 2);
        
        for (let x = -range; x <= range; x++) {
            for (let z = -range; z <= range; z++) {
                // Determine world position of block center
                const worldX = x * this.gridStep;
                const worldZ = z * this.gridStep;
                
                // Determine district type
                const district = this._getDistrict(worldX, worldZ);
                
                // Check if this is an Avenue intersection
                // (Optional: leave gap for parks or large roads)
                
                // 1. Add Sidewalk Block
                // Scale it to block size
                const currentBlockSize = this.blockSize;
                
                dummy.position.set(worldX, 0, worldZ);
                dummy.scale.set(currentBlockSize, this.sidewalkHeight, currentBlockSize);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                
                this.sidewalkMesh.setMatrixAt(sidewalkIdx++, dummy.matrix);
                
                // 2. Add Buildings on this block
                if (district.type !== 'park' && district.type !== 'water') {
                     const buildings = this._generateBuildingsForBlock(district, worldX, worldZ, currentBlockSize);
                     
                     buildings.forEach(b => {
                         dummy.position.set(b.x, this.sidewalkHeight, b.z);
                         dummy.scale.set(b.w, b.h, b.d);
                         dummy.rotation.y = b.rot;
                         dummy.updateMatrix();
                         
                         // Variation in color (vertex color)
                         // Skyscrapers: Blueish/Glassy
                         // Industrial: Grey/Brown
                         // Residential: Brick/White
                         if (district.type === 'downtown') color.setHex(0x88ccff).multiplyScalar(0.5 + Math.random() * 0.5);
                         else if (district.type === 'commercial') color.setHex(0xaaaaaa).multiplyScalar(0.8 + Math.random() * 0.2);
                         else color.setHex(0xddeeff).multiplyScalar(0.9 + Math.random() * 0.1);
                         
                         this.buildingMesh.setMatrixAt(buildingIdx, dummy.matrix);
                         this.buildingMesh.setColorAt(buildingIdx, color);
                         buildingIdx++;
                     });
                }
            }
        }
        
        this.sidewalkMesh.instanceMatrix.needsUpdate = true;
        this.mesh.add(this.sidewalkMesh);
        
        console.log(`[CityGenerator] Generated ${buildingIdx} buildings.`);
        
        this.buildingMesh.count = buildingIdx;
        this.buildingMesh.instanceMatrix.needsUpdate = true;
        if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
        this.mesh.add(this.buildingMesh);
        
        // Add "Street Lights" (Visual only, maybe simple emissive meshes?)
        // For performance, maybe skip or add very few.
        
        return this.mesh;
    }

    /**
     * Generate building layout for a single block
     */
    _generateBuildingsForBlock(district, bx, bz, blockSize) {
        const buildings = [];
        const margin = 2; // Setback from sidewalk edge
        const usableSize = blockSize - (this.sidewalkWidth * 2) - margin;
        
        // Random seed based on position
        const seed = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453);
        const rand = (offset) => {
            return Math.abs(Math.sin(seed + offset) * 10000) % 1;
        };
        
        if (district.type === 'downtown') {
            // Massive Skyscraper (1 big building)
            if (rand(1) > 0.3) {
                const height = 80 + rand(2) * 150; // 80m to 230m
                buildings.push({
                    x: bx,
                    z: bz,
                    w: usableSize * 0.8,
                    d: usableSize * 0.8,
                    h: height,
                    rot: 0
                });
            } else {
                // Twin Towers
                const w = usableSize * 0.4;
                const h = 60 + rand(3) * 100;
                buildings.push({ x: bx - w * 0.6, z: bz - w * 0.6, w: w, d: w, h: h * (0.9 + rand(4)*0.2), rot: 0 });
                buildings.push({ x: bx + w * 0.6, z: bz + w * 0.6, w: w, d: w, h: h, rot: 0 });
            }
        } 
        else if (district.type === 'commercial') {
            // Mid-rise density (4 buildings or 1 block)
            if (rand(1) > 0.5) {
                // 4 Quadrants
                const w = usableSize * 0.4;
                const hBase = 20 + rand(2) * 40;
                buildings.push({ x: bx - w*0.6, z: bz - w*0.6, w: w, d: w, h: hBase + rand(3)*10, rot: 0 });
                buildings.push({ x: bx + w*0.6, z: bz - w*0.6, w: w, d: w, h: hBase + rand(4)*10, rot: 0 });
                buildings.push({ x: bx - w*0.6, z: bz + w*0.6, w: w, d: w, h: hBase + rand(5)*10, rot: 0 });
                buildings.push({ x: bx + w*0.6, z: bz + w*0.6, w: w, d: w, h: hBase + rand(6)*10, rot: 0 });
            } else {
                // Wide office complex
                const h = 15 + rand(2) * 20;
                buildings.push({ x: bx, z: bz, w: usableSize * 0.9, d: usableSize * 0.6, h: h, rot: 0 });
            }
        }
        else {
            // Residential / Suburbs
            // Random scattering of small houses/shops
            const w = 15;
            const h = 5 + rand(1) * 10;
            // Place 1-3 random buildings
            const count = 1 + Math.floor(rand(2) * 3);
            for(let i=0; i<count; i++) {
                const ox = (rand(10+i) - 0.5) * (usableSize - w);
                const oz = (rand(20+i) - 0.5) * (usableSize - w);
                buildings.push({
                    x: bx + ox,
                    z: bz + oz,
                    w: w + rand(30+i)*10,
                    d: w + rand(40+i)*10,
                    h: h + rand(50+i)*5,
                    rot: 0
                });
            }
        }
        
        return buildings;
    }

    /**
     * Determine district type by world coordinates
     */
    _getDistrict(x, z) {
        const dist = Math.sqrt(x*x + z*z);
        
        // Central Park or Plaza?
        if (Math.abs(x) < 200 && Math.abs(z) < 200) {
            return { type: 'park' };
        }
        
        if (dist < 800) return { type: 'downtown' };
        if (dist < 2000) return { type: 'commercial' };
        
        // Check for river/water?
        // Simple sine wave river
        const riverPath = Math.sin(x * 0.002) * 500;
        if (Math.abs(z - riverPath) < 100) return { type: 'water' };
        
        return { type: 'residential' };
    }
    
    /**
     * Physics: Get Surface Height
     */
    getHeightAt(x, z) {
        // Grid Logic
        // Normalize coordinates to grid
        // Add half gridStep to center alignment if needed, but we generated centered at 0,0
        // Blocks are centered at k * gridStep
        
        // Transform x, z to local block coords
        const halfStep = this.gridStep / 2;
        const relativeX = (Math.abs(x) + halfStep) % this.gridStep;
        const relativeZ = (Math.abs(z) + halfStep) % this.gridStep;
        
        // Gap is the road. Block is the solid part.
        // We need to check if we are INSIDE the block
        // Block width = blockSize
        // Road width = gridStep - blockSize
        
        // The above modulo logic is tricky with negative numbers.
        // Better: Find nearest block center
        const gx = Math.round(x / this.gridStep) * this.gridStep;
        const gz = Math.round(z / this.gridStep) * this.gridStep;
        
        const dx = Math.abs(x - gx);
        const dz = Math.abs(z - gz);
        
        // If within half blockSize, we are on the block (sidewalk)
        if (dx < this.blockSize / 2 && dz < this.blockSize / 2) {
            return this.sidewalkHeight;
        }
        
        // Otherwise on road
        return this.groundHeight;
    }

    /**
     * Physics: Get Normal
     */
    getNormalAt(x, z) {
        // We assume flat ground mostly
        // For curbs, we could return sideways normals, but for car physics
        // simpler is often better (vertical up).
        // Let's stick to Up vector.
        return new THREE.Vector3(0, 1, 0);
    }

    /**
     * Physics: Get Surface Type
     */
    getSurfaceType(x, z) {
        if (this.getHeightAt(x, z) > 0.1) {
            return SurfaceTypes.CONCRETE; // Sidewalk
        }
        return SurfaceTypes.TARMAC; // Road
    }

    /**
     * Visuals: Create Building Material with "Windows"
     */
    _createBuildingMaterial() {
        // Use a simple canvas texture for windows
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128; // Taller for vertical windows
        const ctx = canvas.getContext('2d');
        
        // Background (Building Wall)
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, 64, 128);
        
        // Windows
        ctx.fillStyle = '#ffeedd'; // Warm light
        // Randomize lit windows
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 4; x++) {
                if (Math.random() > 0.4) {
                    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
                    // Draw window rect
                    ctx.fillRect(4 + x * 16, 4 + y * 8, 8, 4);
                }
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        
        // Custom shader to handle world-space UV mapping (Triplanar-ish)
        // Or simpler: just use the texture with high repeat
        // Problem: Scaling geometry stretches texture. 
        // We will modify the material to scale UVs by world position in Vertex Shader
        
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            color: 0xffffff
        });
        
        return material;
    }
}
