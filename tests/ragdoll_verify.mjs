// Mock THREE
const THREE = {
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x; this.y = y; this.z = z;
            return this;
        }
        copy(v) {
            this.x = v.x; this.y = v.y; this.z = v.z;
            return this;
        }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        add(v) {
            this.x += v.x; this.y += v.y; this.z += v.z;
            return this;
        }
        sub(v) {
            this.x -= v.x; this.y -= v.y; this.z -= v.z;
            return this;
        }
        multiplyScalar(s) {
            this.x *= s; this.y *= s; this.z *= s;
            return this;
        }
    },
    Object3D: class {
        constructor() {}
    }
};

// Mock classes
class MockBone {
    constructor(name) {
        this.name = name;
        this.isBone = true;
    }
}

// Minimal reproduction of RagdollPhysics for testing
class RagdollPhysics {
    constructor() {
        this.particles = [];
    }
    addParticle(bone) {
        const p = {
            bone,
            position: new THREE.Vector3(),
            previousPosition: new THREE.Vector3(),
            mass: 1,
            invMass: 1,
            isLocked: false,
            force: new THREE.Vector3()
        };
        this.particles.push(p);
        return p;
    }
    matchAnimation() {
        this.particles.forEach(p => {
            p.previousPosition.copy(p.position);
            p.force.set(0, 0, 0);
        });
    }
    update(delta) {
        this.particles.forEach(p => {
            const temp = p.position.clone();
            const velocity = p.position.clone().sub(p.previousPosition);
            p.position.add(velocity); // Simple integration
            p.previousPosition.copy(temp);
        });
    }
}

// Test Script
console.log("Starting Ragdoll Verification...");

const physics = new RagdollPhysics();
const bone = new MockBone("Hips");
const particle = physics.addParticle(bone);

// Initial State
particle.position.set(0, 10, 0);
particle.previousPosition.set(0, 10, 0);

console.log(`Initial Position: ${particle.position.y}`);

// Simulate Impact (Logic copied from ActiveRagdollController fix)
const impactForce = new THREE.Vector3(100, 0, 0);

// 1. Match Animation (Reset velocity)
physics.matchAnimation();
console.log(`After MatchAnimation - Pos: ${particle.position.x}, Prev: ${particle.previousPosition.x}`);

// 2. Apply Impulse
const velocityChange = impactForce.clone().multiplyScalar(0.04); // 4 units
particle.previousPosition.sub(velocityChange);

console.log(`After Impulse - Pos: ${particle.position.x}, Prev: ${particle.previousPosition.x}`);
console.log(`Expected Velocity: ${velocityChange.x}`);

// 3. Update Physics (1 Frame)
physics.update(0.016);

console.log(`After Update - Pos: ${particle.position.x}`);
const moved = particle.position.x - 0; // Started at 0

if (Math.abs(moved - 4) < 0.001) {
    console.log("SUCCESS: Particle moved with expected velocity.");
} else {
    console.error(`FAILURE: Particle moved ${moved}, expected 4.`);
}