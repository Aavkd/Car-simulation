---
# City.js Comprehensive Refactor Plan
## Overview
This plan addresses all 22 issues identified in the analysis report through 5 phases. The refactor will:
- Split the monolithic 1041-line file into smaller, testable modules
- Fix all memory leaks and performance issues
- Add missing visual features (water, parks)
- Improve physics accuracy
**Estimated Total Effort**: 4-6 hours  
**Files Modified**: 3 existing, 4 new  
**Risk Level**: Medium (isolated to terrain system)
---
Phase 1: Critical Fixes & Infrastructure
Goal: Fix memory leaks and establish reusable vectors to prevent regressions.
1.1 Add dispose() Method
File: js/terrain/city.js (lines ~675, after generate())
dispose() {
    // Dispose InstancedMeshes
    [this.buildingMesh, this.roadMesh, this.markingMesh, 
     this.poleMesh, this.armMesh, this.bulbMesh].forEach(mesh => {
        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    });
    
    // Dispose Points
    if (this.glowPoints) {
        this.glowPoints.geometry.dispose();
    }
    
    // Dispose Materials
    if (this.bulbMat) this.bulbMat.dispose();
    if (this.glowMat) this.glowMat.dispose();
    
    // Dispose ground
    if (this.mesh) {
        this.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    
    // Clear caches
    this.blockPolygons.clear();
    this.allLights = [];
    this._districtCache.clear();
    this.lightPool = [];
    
    this.mesh = null;
}
1.2 Add Reusable Temp Vectors
File: js/terrain/city.js (constructor, ~line 46)
// Add to constructor
this._tempVec1 = new THREE.Vector3();
this._tempVec2 = new THREE.Vector3();
this._tempVec3 = new THREE.Vector3();
this._tempVec4 = new THREE.Vector3();
this._tempDummy = new THREE.Object3D();
1.3 Fix Vector Allocations in Loops
File: js/terrain/city.js (lines 352-358, 556-562)
Replace:
const pos = new THREE.Vector3(p0.x, p0.y, p0.z);
With:
this._tempVec1.set(p0.x, p0.y, p0.z);
const pos = this._tempVec1;
1.4 Extract Named Constants
File: js/terrain/city.js (top of file, after imports)
// District thresholds
const DOWNTOWN_DENSITY_THRESHOLD = 0.6;
const COMMERCIAL_DENSITY_THRESHOLD = 0.3;
const SUBURBS_DENSITY_THRESHOLD = 0.05;
const DOWNTOWN_RADIUS = 4000;
// Noise scales
const DISTRICT_NOISE_SCALE = 0.0003;
const TYPE_NOISE_SCALE = 0.0005;
// Generation limits
const CITY_EDGE_MARGIN = 500;
const ROAD_EDGE_MARGIN = 600;
Estimated Time: 45 minutes
---
Phase 2: Split generate() Method
Goal: Break the 550-line generate() into manageable sub-methods.
2.1 New Method Structure
generate() {
    console.log('[CityGenerator] Starting generation...');
    this.mesh = new THREE.Group();
    this.blockPolygons = new Map();
    
    this._createGround();
    this._prepareInstancedMeshes();
    this._generateBlocks();
    this._generateRoads();
    this._generateStreetLights();
    this._initializeLightPool();
    
    return this.mesh;
}
2.2 Extract Sub-Methods
| Method | Original Lines | Purpose |
|--------|---------------|---------|
| _createGround() | 127-133 | Create base plane |
| _prepareInstancedMeshes() | 135-161 | Initialize instanced geometries |
| _generateBlocks() | 197-312 | Main block/building loop |
| _generateRoads() | 328-433 | Road + marking generation |
| _generateStreetLights() | 449-639 | Light poles + bulbs |
| _initializeLightPool() | 659-672 | Dynamic light pool |
2.3 Merge Duplicate Iterations
Combine the road loop (lines 344-433) and light loop (lines 548-626) into a single _generateRoadsAndLights() method that processes both in one pass.
Estimated Time: 1 hour
---
Phase 3: Extract Lighting System
Goal: Create a dedicated lighting module for better separation of concerns.
3.1 New File: js/terrain/city-lighting.js
import * as THREE from 'three';
/**
 * City Street Lighting System
 * Handles street light placement, dynamic pooling, and day/night transitions.
 */
export class CityLightingSystem {
    constructor(config = {}) {
        this.scale = config.scale || 2.2;
        this.poolSize = config.poolSize || 20;
        
        // Light positions (populated by CityGenerator)
        this.allLights = [];
        
        // Meshes
        this.poleMesh = null;
        this.armMesh = null;
        this.bulbMesh = null;
        this.glowPoints = null;
        
        // Materials
        this.bulbMat = null;
        this.glowMat = null;
        
        // Dynamic light pool
        this.lightPool = [];
        this.poolGroup = null;
        
        // Performance optimization
        this._lastPlayerPos = new THREE.Vector3();
        this._updateThreshold = 10; // Only re-sort when player moves 10+ units
    }
    
    /**
     * Create light meshes and add to parent group
     */
    generate(parentGroup, roadSegments, lightSpacing) { ... }
    
    /**
     * Update dynamic lights based on player position
     */
    update(playerPos, isNight, deltaTime) {
        // Early exit if player hasn't moved significantly
        if (playerPos.distanceToSquared(this._lastPlayerPos) < this._updateThreshold * this._updateThreshold) {
            return;
        }
        this._lastPlayerPos.copy(playerPos);
        
        // ... rest of update logic ...
    }
    
    /**
     * Dispose all resources
     */
    dispose() { ... }
}
3.2 Update CityGenerator to Use Lighting System
File: js/terrain/city.js
import { CityLightingSystem } from './city-lighting.js';
// In constructor:
this.lightingSystem = new CityLightingSystem({ scale: this.scale });
// In generate():
this.lightingSystem.generate(this.mesh, roadSegments, lightSpacing);
// In update():
this.lightingSystem.update(playerPos, isNight, deltaTime);
// In dispose():
this.lightingSystem.dispose();
Estimated Time: 1.5 hours
---
Phase 4: Physics & Collision Improvements
Goal: Fix collision detection, add building collision, improve surface types.
4.1 Fix Height Lookup Edge Cases
File: js/terrain/city.js (getHeightAt())
Replace Math.round() with checking multiple candidate blocks:
getHeightAt(x, z) {
    // Check current and adjacent cells
    const gx = Math.floor(x / this.gridStep);
    const gz = Math.floor(z / this.gridStep);
    
    const candidates = [
        `,`,
        `,`,
        `,`,
        `,`
    ];
    
    for (const key of candidates) {
        if (this.blockPolygons.has(key)) {
            const block = this.blockPolygons.get(key);
            if (this._pointInPolygon(x, z, block.poly)) {
                return block.height;
            }
        }
    }
    
    return this.groundHeight;
}
4.2 Add Building Collision Data
Store building footprints for collision:
// In constructor:
this.buildingFootprints = [];
// In _generateBuildingsForBlock():
// After adding building, also store footprint
this.buildingFootprints.push({
    x: worldX,
    z: worldZ,
    w: width,
    d: depth,
    rot: rotation
});
// Add method:
isInsideBuilding(x, z) {
    // Spatial hash lookup + OBB test
    // Returns true if point is inside any building
}
4.3 Improve Surface Type Detection
File: js/terrain/city.js (getSurfaceType())
getSurfaceType(x, z) {
    const height = this.getHeightAt(x, z);
    
    // On sidewalk
    if (height > 0.1) {
        return SurfaceTypes.CONCRETE;
    }
    
    // Check district type
    const district = this._getDistrict(x, z);
    
    if (district.type === 'park') {
        return SurfaceTypes.GRASS;
    }
    
    if (district.type === 'water') {
        return SurfaceTypes.ICE_FRICTIONLESS; // Slide on water
    }
    
    return SurfaceTypes.TARMAC;
}
4.4 Implement District Cache
File: js/terrain/city.js (_getDistrict())
_getDistrict(x, z) {
    // Quantize to 100-unit grid for caching
    const qx = Math.floor(x / 100);
    const qz = Math.floor(z / 100);
    const key = `,`;
    
    if (this._districtCache.has(key)) {
        return this._districtCache.get(key);
    }
    
    // ... existing calculation ...
    
    this._districtCache.set(key, result);
    return result;
}
Estimated Time: 1 hour
---
Phase 5: Visual Enhancements
Goal: Add water, parks, re-enable frustum culling, fix texture seeding.
5.1 Add Water Rendering
File: js/terrain/city.js (new method)
_generateWater() {
    // Find all water district areas
    const waterGeo = new THREE.PlaneGeometry(this.size, this.size);
    waterGeo.rotateX(-Math.PI / 2);
    
    const waterMat = new THREE.MeshLambertMaterial({
        color: 0x1a6985,
        transparent: true,
        opacity: 0.8
    });
    
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.5; // Slightly below ground
    water.receiveShadow = true;
    
    this.mesh.add(water);
    this.waterMesh = water;
}
5.2 Add Park Decorations
File: js/terrain/city.js (in _generateBlocks())
if (district.type === 'park') {
    // Add grass plane
    const grassGeo = new THREE.PlaneGeometry(usableSize, usableSize);
    grassGeo.rotateX(-Math.PI / 2);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x3d5c3d });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.position.set(centroid.x, this.sidewalkHeight + 0.01, centroid.z);
    this.mesh.add(grass);
    
    // Add simple tree instances (optional)
}
5.3 Re-enable Frustum Culling
File: js/terrain/city.js (lines 151, 160, 336)
Remove or set to true:
this.buildingMesh.frustumCulled = true;
this.roadMesh.frustumCulled = true;
Compute bounding sphere after setting count:
this.buildingMesh.computeBoundingSphere();
5.4 Fix Window Texture Randomness
File: js/terrain/city.js (_createBuildingMaterial())
Replace Math.random() with seeded random:
for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 4; x++) {
        if (this.rand(x * 100 + y) > 0.4) {
            // ...
        }
    }
}
5.5 Clean Up Dead Code
Remove:
- Lines 465-471 (rambling comments)
- Line 384 (unused variable t)
- Line 37 (this.sidewalkMeshes = [] - never used)
Estimated Time: 1 hour
---
Final File Structure
js/terrain/
  city.js              # Main generator (~600 lines, down from 1041)
  city-lighting.js     # NEW - Lighting system (~200 lines)
---
Testing Strategy
Before Implementation
node tests/city_verify.mjs
Save output as baseline.
After Each Phase
1. Run verification: node tests/city_verify.mjs
2. Open index.html, load City level
3. Drive around - check:
   - Buildings render correctly
   - Sidewalk collision works
   - Street lights appear at night
   - No console errors
After All Phases
1. Load another level, then return to City (tests dispose)
2. Check memory usage in DevTools
3. Verify FPS is stable
---
Summary Table
| Phase | Focus | Fixes | Est. Time |
|-------|-------|-------|-----------|
| 1 | Critical Fixes | #1, #4, #16 | 45 min |
| 2 | Refactor generate() | #2, #3 | 1 hour |
| 3 | Extract Lighting | #6, #10 | 1.5 hours |
| 4 | Physics | #8, #11, #12, #13 | 1 hour |
| 5 | Visuals | #5, #19, #20, #21, #22 | 1 hour |
Total: ~5.25 hours
---