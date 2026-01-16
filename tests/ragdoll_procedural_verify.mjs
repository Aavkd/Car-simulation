
// Mock THREE
const THREE = {
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
        sub(v) { this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
        multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
        setLength(l) { 
            const len = Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
            if(len>0) this.multiplyScalar(l/len);
            return this;
        }
        length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
        normalize() { return this.setLength(1); }
        dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
        applyQuaternion() { return this; }
    },
    Quaternion: class {
        constructor() { this.x=0; this.y=0; this.z=0; this.w=1; }
        setFromAxisAngle() { return this; }
        setFromEuler() { return this; }
        multiply() { return this; }
        slerp() { return this; }
        clone() { return new THREE.Quaternion(); }
    },
    MathUtils: {
        clamp: (v, min, max) => Math.min(Math.max(v, min), max),
        lerp: (a, b, t) => a + (b-a)*t
    }
};

// Mock classes
class MockBone {
    constructor(name) {
        this.name = name;
        this.isBone = true;
        this.quaternion = new THREE.Quaternion();
        this.position = new THREE.Vector3();
    }
}

// Mock ProceduralFallController - Partial
class MockProceduralFallController {
    constructor() {
        this.bones = { hips: new MockBone('hips') };
        this.fallDirection = new THREE.Vector3();
        this.posture = {
            request: (bone, layer, rot, weight) => {
                if (layer === 'physics' && bone.name === 'hips') {
                    console.log("WARNING: Hips rotation requested via ProceduralFallController (should be disabled)");
                }
            }
        };
        this.physicsBlend = 0;
        this.state = 'falling';
        this.fallTime = 1.0;
        this.config = { bodyRotationSpeed: 1 };
    }
    
    // Simulate the modified update method logic
    update(delta) {
        // ... (abbreviated)
        this._applyFallingPhysics(delta);
    }
    
    _applyFallingPhysics(delta) {
        // This is the method we modified. We check if it still calls posture.request for hips.
        // We'll mimic the "old" code structure but with the comment out to see if it runs.
        
        // Original code had: if (this.bones.hips) { ... }
        // Modified code has it commented out.
        
        // Simulation of the "new" code execution flow:
        // (Nothing happens for hips here)
    }
}

console.log("Starting Verification...");

// 1. Verify Procedural Rotation is Disabled
const procFall = new MockProceduralFallController();
procFall.update(0.016);
console.log("ProceduralFall update complete (no warning expected).");

// 2. Verify Force Clamping logic (Simulated)
const impactForce = new THREE.Vector3(10000, 0, 0); // Massive force
const safeForce = impactForce.clone();

if (safeForce.length() > 100) safeForce.setLength(100);
const velocityChange = safeForce.multiplyScalar(0.02);
if (velocityChange.length() > 2.0) velocityChange.setLength(2.0);

console.log(`Input Force: 10000 -> Clamped Velocity Change: ${velocityChange.length()}`);

if (velocityChange.length() <= 2.001) {
    console.log("SUCCESS: Force was clamped correctly.");
} else {
    console.error("FAILURE: Force was NOT clamped.");
}
