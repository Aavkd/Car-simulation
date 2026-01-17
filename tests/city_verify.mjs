
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Mock THREE
const THREE = {
    Vector3: class {
        constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
        addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
        subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        normalize() { const l = this.length(); if(l>0) this.multiplyScalar(1/l); return this; }
        length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
        distanceTo(v) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        addScaledVector(v, s) { this.x += v.x*s; this.y += v.y*s; this.z += v.z*s; return this; }
        lookAt() {}
    },
    Matrix4: class { set() {} multiply() {} },
    Quaternion: class { setFromAxisAngle() {} },
    Euler: class {},
    Color: class { setHex() { return this; } multiplyScalar() { return this; } },
    Group: class { add() {} constructor() { this.children = []; } },
    Mesh: class { 
        constructor(geo, mat) { this.geometry = geo; this.material = mat; }
        add() {}
    },
    InstancedMesh: class { 
        constructor() { this.userData = {}; this.instanceMatrix = { needsUpdate: false }; this.instanceColor = { needsUpdate: false }; }
        setMatrixAt() {} 
        setColorAt() {}
    },
    PlaneGeometry: class { rotateX() {} },
    BoxGeometry: class { translate() {} },
    CylinderGeometry: class { translate() {} },
    BufferGeometry: class { setAttribute() {} computeVertexNormals() {} },
    Float32BufferAttribute: class {},
    MeshLambertMaterial: class {},
    MeshBasicMaterial: class {},
    CanvasTexture: class {},
    Object3D: class { 
        constructor() { this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(1,1,1); this.rotation = {x:0, y:0, z:0, set: function(x,y,z){this.x=x;this.y=y;this.z=z;}}; this.matrix = {}; }
        updateMatrix() {}
    },
    Box3: class {},
    MathUtils: {
        lerp: (a, b, t) => a + (b - a) * t
    },
    RepeatWrapping: 1,
    NearestFilter: 1,
    DoubleSide: 2
};

// Mock document for canvas
const document = {
    createElement: (tag) => {
        if (tag === 'canvas') return {
            width: 0, height: 0,
            getContext: () => ({
                fillStyle: '', fillRect: () => {}, globalAlpha: 1
            })
        };
        return {};
    }
};

// Mock PerlinNoise (simplified from terrain.js)
class PerlinNoise {
    constructor(seed) { this.seed = seed; }
    noise2D(x, y) { return 0; } // Return 0 for predictable grid
    fbm(x, y) { return 0; }
}

// Read and Shim CityGenerator
const cityJsPath = path.join(projectRoot, 'js', 'terrain', 'city.js');
let cityCode = fs.readFileSync(cityJsPath, 'utf8');

// Replacements
cityCode = cityCode.replace(/import\s+\*\s+as\s+THREE\s+from\s+['"]three['"];?/g, '');
cityCode = cityCode.replace(/import\s+\{\s*SurfaceTypes\s*\}\s+from\s+['"].*physics-provider\.js['"];?/g, 'const SurfaceTypes = { CONCRETE: "concrete", TARMAC: "tarmac" };');
cityCode = cityCode.replace(/import\s+\{\s*PerlinNoise\s*\}\s+from\s+['"].*terrain\.js['"];?/g, '');
cityCode = cityCode.replace(/export\s+class\s+CityGenerator/g, 'class CityGenerator');

console.log("--- DEBUG CODE START ---");
console.log(cityCode.substring(0, 500));
console.log("--- DEBUG CODE END ---");

// Add mocks to scope and execute

// Add mocks to scope and execute
const testLogic = `
    // Test Logic
    const city = new CityGenerator({ size: 1000, blockSize: 100, roadWidth: 20, seed: 123 });
    // Inject mock noise
    city.noise = new PerlinNoise(123);
    
    // city.generate(); // Visuals, skippable for physics check
    
    // Check Center Block (0,0)
    // GridStep = 100 + 20 = 120.
    // Center is 0,0.
    // Block Corners: +/- 60.
    // Inset: roadWidth/2 + margin = 10 + 4 = 14.
    // Sidewalk extends to 60 - 14 = 46.
    
    // Test Point Inside (10, 10)
    const h0 = city.getHeightAt(10, 10);
    console.log("Height at 10,10 (Inside):", h0);
    
    // Test Point Near Edge (45, 0) -> Should be Sidewalk
    const hEdgeIn = city.getHeightAt(45, 0);
    console.log("Height at 45,0 (Edge In):", hEdgeIn);
    
    // Test Point in Road (50, 0) -> Should be Road (Ground)
    const hRoad = city.getHeightAt(50, 0);
    console.log("Height at 50,0 (Road):", hRoad);
    
    // Return results
    return { h0, hEdgeIn, hRoad, sidewalkHeight: city.sidewalkHeight, groundHeight: city.groundHeight };
`;

const evalContext = cityCode + '\n' + testLogic;

// Helper to run
function runTest() {
    // We use Function to create a scope with our mocks
    const fn = new Function('THREE', 'document', 'PerlinNoise', evalContext);
    return fn(THREE, document, PerlinNoise);
}

try {
    const res = runTest();
    if (res.h0 === res.sidewalkHeight && res.hEdgeIn === res.sidewalkHeight && res.hRoad === res.groundHeight) {
        console.log("Verification PASSED: Basic grid logic holds.");
    } else {
        console.error("Verification FAILED:", res);
    }
} catch (e) {
    console.error("Test Error:", e);
}
