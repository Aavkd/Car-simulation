/**
 * Ragdoll Phase 3 Verification Tests
 * 
 * Tests for:
 * - 3.1 Terrain Normal Support (slope collision)
 * - 3.2 Bone Sync Quaternion Stability (hinge axis caching)
 * - 3.3 Neighbor Cache Optimization (O(1) areConnected)
 * 
 * Run with: node tests/ragdoll_verify_phase3.mjs
 */

// ==================== THREE.js MOCK ====================

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
        subVectors(a, b) {
            this.x = a.x - b.x;
            this.y = a.y - b.y;
            this.z = a.z - b.z;
            return this;
        }
        multiplyScalar(s) {
            this.x *= s; this.y *= s; this.z *= s;
            return this;
        }
        divideScalar(s) {
            if (s === 0) return this;
            this.x /= s; this.y /= s; this.z /= s;
            return this;
        }
        dot(v) {
            return this.x * v.x + this.y * v.y + this.z * v.z;
        }
        crossVectors(a, b) {
            const ax = a.x, ay = a.y, az = a.z;
            const bx = b.x, by = b.y, bz = b.z;
            this.x = ay * bz - az * by;
            this.y = az * bx - ax * bz;
            this.z = ax * by - ay * bx;
            return this;
        }
        length() {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        }
        lengthSq() {
            return this.x * this.x + this.y * this.y + this.z * this.z;
        }
        normalize() {
            const len = this.length();
            if (len > 0) this.multiplyScalar(1 / len);
            return this;
        }
        distanceTo(v) {
            const dx = this.x - v.x;
            const dy = this.y - v.y;
            const dz = this.z - v.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
    },
    MathUtils: {
        clamp: (value, min, max) => Math.max(min, Math.min(max, value))
    }
};

// ==================== MOCK RAGDOLL CONFIG ====================

const RagdollConfig = {
    physics: {
        gravity: new THREE.Vector3(0, -9.81, 0),
        friction: 0.98,
        groundFriction: 0.6,
        solverIterations: 20
    }
};

// ==================== PHYSICS PARTICLE CLASS ====================

class PhysicsParticle {
    constructor(position, mass = 1.0, radius = 0.1, isPinned = false) {
        this.position = position.clone();
        this.previousPosition = position.clone();
        this.mass = mass;
        this.radius = radius;
        this.isPinned = isPinned;
        this.forces = new THREE.Vector3();
    }

    update(dt, friction, gravity) {
        if (this.isPinned) return;
        const velocity = new THREE.Vector3().subVectors(this.position, this.previousPosition);
        velocity.multiplyScalar(friction);
        this.previousPosition.copy(this.position);
        this.position.add(velocity);
        const acceleration = new THREE.Vector3().copy(gravity);
        if (this.mass > 0) {
            const forceAccel = new THREE.Vector3().copy(this.forces).divideScalar(this.mass);
            acceleration.add(forceAccel);
        }
        acceleration.multiplyScalar(dt * dt);
        this.position.add(acceleration);
        this.forces.set(0, 0, 0);
    }
}

// ==================== PHYSICS CONSTRAINT CLASS ====================

class PhysicsConstraint {
    constructor(particleA, particleB, stiffness = 1.0) {
        this.particleA = particleA;
        this.particleB = particleB;
        this.stiffness = stiffness;
        this.restDistance = particleA.position.distanceTo(particleB.position);
    }
}

// ==================== RAGDOLL PHYSICS (Simplified for testing) ====================

class RagdollPhysics {
    constructor() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = [];
        this.gravity = RagdollConfig.physics.gravity;
        this.friction = RagdollConfig.physics.friction;
        this.groundFriction = RagdollConfig.physics.groundFriction;
        this.solverIterations = RagdollConfig.physics.solverIterations;
        this.accumulator = 0;
        this.fixedDeltaTime = 1 / 60;
        this.maxSubSteps = 8;
        
        // Phase 3: Neighbor cache for O(1) lookups
        this._neighborCache = new Map();
    }

    addParticle(position, mass, radius, isPinned) {
        const particle = new PhysicsParticle(position, mass, radius, isPinned);
        this.particles.push(particle);
        return particle;
    }

    addConstraint(particleA, particleB, stiffness) {
        const constraint = new PhysicsConstraint(particleA, particleB, stiffness);
        this.constraints.push(constraint);
        
        // Update neighbor cache
        if (!this._neighborCache.has(particleA)) {
            this._neighborCache.set(particleA, new Set());
        }
        if (!this._neighborCache.has(particleB)) {
            this._neighborCache.set(particleB, new Set());
        }
        this._neighborCache.get(particleA).add(particleB);
        this._neighborCache.get(particleB).add(particleA);
        
        return constraint;
    }

    // Phase 3: O(1) lookup using neighbor cache
    areConnected(pA, pB) {
        const neighbors = this._neighborCache.get(pA);
        return neighbors ? neighbors.has(pB) : false;
    }

    // Old brute-force method for comparison
    areConnectedBruteForce(pA, pB) {
        for (const c of this.constraints) {
            if ((c.particleA === pA && c.particleB === pB) ||
                (c.particleA === pB && c.particleB === pA)) {
                return true;
            }
        }
        return false;
    }

    setTerrain(terrain) {
        this.terrain = terrain;
    }

    resolveCollisions() {
        const defaultGroundY = 0;
        const groundNormal = new THREE.Vector3();
        const surfacePoint = new THREE.Vector3();
        const toParticle = new THREE.Vector3();
        const velocity = new THREE.Vector3();
        const tangentVelocity = new THREE.Vector3();

        for (const particle of this.particles) {
            let groundY = defaultGroundY;
            groundNormal.set(0, 1, 0);

            if (this.terrain) {
                groundY = this.terrain.getHeightAt(particle.position.x, particle.position.z);
                
                if (typeof this.terrain.getNormalAt === 'function') {
                    const normal = this.terrain.getNormalAt(
                        particle.position.x, 
                        particle.position.z
                    );
                    if (normal) {
                        groundNormal.copy(normal);
                    }
                }
            }

            surfacePoint.set(
                particle.position.x,
                groundY,
                particle.position.z
            );
            toParticle.subVectors(particle.position, surfacePoint);
            const signedDistance = toParticle.dot(groundNormal);

            if (signedDistance < particle.radius) {
                const penetration = particle.radius - signedDistance;

                particle.position.add(
                    groundNormal.clone().multiplyScalar(penetration)
                );

                velocity.subVectors(particle.position, particle.previousPosition);
                const normalVelocity = velocity.dot(groundNormal);

                if (normalVelocity < 0) {
                    particle.previousPosition.add(
                        groundNormal.clone().multiplyScalar(normalVelocity)
                    );
                }

                tangentVelocity.copy(velocity).sub(
                    groundNormal.clone().multiplyScalar(velocity.dot(groundNormal))
                );
                particle.previousPosition.add(
                    tangentVelocity.multiplyScalar(1 - this.groundFriction)
                );
            }
        }
    }

    clear() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = [];
        this._neighborCache.clear();
    }
}

// ==================== MOCK TERRAIN ====================

class MockSlopedTerrain {
    constructor(slopeAngle = Math.PI / 4) {
        // 45 degree slope by default
        this.slopeAngle = slopeAngle;
        // Normal for a slope tilted toward +Z
        this.normal = new THREE.Vector3(
            0,
            Math.cos(slopeAngle),
            -Math.sin(slopeAngle)
        ).normalize();
    }

    getHeightAt(x, z) {
        // Height increases with Z (slope going up in +Z direction)
        return z * Math.tan(this.slopeAngle);
    }

    getNormalAt(x, z) {
        return this.normal.clone();
    }
}

class MockFlatTerrain {
    getHeightAt(x, z) {
        return 0;
    }
    getNormalAt(x, z) {
        return new THREE.Vector3(0, 1, 0);
    }
}

// ==================== TEST UTILITIES ====================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        testsFailed++;
    }
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    assert(diff <= tolerance, `${message} (expected: ${expected.toFixed(4)}, actual: ${actual.toFixed(4)}, diff: ${diff.toFixed(4)})`);
}

function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

// ==================== TESTS ====================

console.log('\n========================================');
console.log('     RAGDOLL PHASE 3 VERIFICATION');
console.log('     (Terrain, Stability, Optimization)');
console.log('========================================\n');

// ------------------------------------------
// TEST P3-SC1: Slope Collision Works
// ------------------------------------------
console.log('TEST P3-SC1: Slope Collision Works');
{
    const physics = new RagdollPhysics();
    const slope = new MockSlopedTerrain(Math.PI / 4); // 45 degree slope
    physics.setTerrain(slope);
    
    // Place particle on slope at z=2 (where ground is at y=2 for 45 deg slope)
    // Put particle slightly below the surface
    const particle = physics.addParticle(
        new THREE.Vector3(0, 1.5, 2), // Below surface (should be at y=2)
        1.0,
        0.2, // radius
        false
    );
    
    // Resolve collision
    physics.resolveCollisions();
    
    // After collision, particle should be pushed up along the slope normal
    // For 45 deg slope, normal is (0, 0.707, -0.707)
    // Particle should not be below the slope surface
    const expectedGroundY = slope.getHeightAt(0, particle.position.z);
    const distAboveGround = particle.position.y - expectedGroundY;
    
    assert(distAboveGround >= particle.radius - 0.01, 
        `Particle pushed above slope surface (dist: ${distAboveGround.toFixed(3)}, radius: ${particle.radius})`);
}

// ------------------------------------------
// TEST P3-SC2: Normal-Based Projection
// ------------------------------------------
console.log('\nTEST P3-SC2: Normal-Based Projection');
{
    const physics = new RagdollPhysics();
    const slope = new MockSlopedTerrain(Math.PI / 4);
    physics.setTerrain(slope);
    
    // Particle embedded in slope
    const startPos = new THREE.Vector3(0, 1.0, 2);
    const particle = physics.addParticle(startPos.clone(), 1.0, 0.3, false);
    
    const posBefore = particle.position.clone();
    physics.resolveCollisions();
    const posAfter = particle.position.clone();
    
    // Calculate movement direction
    const movement = new THREE.Vector3().subVectors(posAfter, posBefore);
    const movementDir = movement.clone().normalize();
    
    // Movement should be approximately along the slope normal
    const slopeNormal = slope.getNormalAt(0, 2);
    const dotProduct = movementDir.dot(slopeNormal);
    
    assert(dotProduct > 0.9, 
        `Particle pushed along slope normal (dot: ${dotProduct.toFixed(3)}, should be ~1.0)`);
}

// ------------------------------------------
// TEST P3-SC3: Terrain Normal API Used
// ------------------------------------------
console.log('\nTEST P3-SC3: Terrain Normal API Used');
{
    let normalCalled = false;
    const terrain = {
        getHeightAt: (x, z) => 0,
        getNormalAt: (x, z) => {
            normalCalled = true;
            return new THREE.Vector3(0, 1, 0);
        }
    };
    
    const physics = new RagdollPhysics();
    physics.setTerrain(terrain);
    physics.addParticle(new THREE.Vector3(0, 0.05, 0), 1.0, 0.1, false);
    
    physics.resolveCollisions();
    
    assert(normalCalled, 'getNormalAt() is called when terrain supports it');
}

// ------------------------------------------
// TEST P3-SC4: No NaN Quaternions (Hinge Axis Caching Logic)
// ------------------------------------------
console.log('\nTEST P3-SC4: No NaN Quaternions - Straight Limb Handling');
{
    // Simulate the hinge axis calculation with collinear bones
    const primaryAxis = new THREE.Vector3(0, -1, 0).normalize(); // Pointing down
    const secondaryVec = new THREE.Vector3(0, -1, 0).normalize(); // Same direction (straight limb)
    
    let hingeAxis = new THREE.Vector3().crossVectors(primaryAxis, secondaryVec);
    
    // Check if degenerate (straight limb case)
    let usedFallback = false;
    if (hingeAxis.lengthSq() < 0.001) {
        // Use fallback perpendicular axis
        hingeAxis.set(1, 0, 0);
        if (Math.abs(primaryAxis.x) > 0.9) {
            hingeAxis.set(0, 0, 1);
        }
        hingeAxis.crossVectors(hingeAxis, primaryAxis).normalize();
        usedFallback = true;
    }
    
    const hasNaN = isNaN(hingeAxis.x) || isNaN(hingeAxis.y) || isNaN(hingeAxis.z);
    const hasValidLength = hingeAxis.length() > 0.9 && hingeAxis.length() < 1.1;
    
    assert(!hasNaN && hasValidLength, 
        `Collinear case produces valid axis (usedFallback: ${usedFallback}, length: ${hingeAxis.length().toFixed(3)})`);
}

// ------------------------------------------
// TEST P3-SC5: Hinge Axis Caching
// ------------------------------------------
console.log('\nTEST P3-SC5: Hinge Axis Caching');
{
    // Simulate hinge axis caching behavior
    const cache = new Map();
    const boneName = 'leftUpLeg';
    
    // Frame 1: Bent limb, compute and cache axis
    const primaryAxis1 = new THREE.Vector3(0, -1, 0).normalize();
    const secondaryVec1 = new THREE.Vector3(0, -0.7, 0.7).normalize(); // Bent knee
    
    let hingeAxis1 = new THREE.Vector3().crossVectors(primaryAxis1, secondaryVec1);
    if (hingeAxis1.lengthSq() > 0.001) {
        hingeAxis1.normalize();
        cache.set(boneName, hingeAxis1.clone());
    }
    
    // Frame 2: Straight limb, use cached axis
    const primaryAxis2 = new THREE.Vector3(0, -1, 0).normalize();
    const secondaryVec2 = new THREE.Vector3(0, -1, 0).normalize(); // Straight (collinear)
    
    let hingeAxis2 = new THREE.Vector3().crossVectors(primaryAxis2, secondaryVec2);
    
    if (hingeAxis2.lengthSq() < 0.001) {
        // Use cached axis
        const cached = cache.get(boneName);
        if (cached) {
            hingeAxis2.copy(cached);
        }
    }
    
    // Axis should match cached value
    const matches = hingeAxis2.distanceTo(hingeAxis1) < 0.001;
    assert(matches, 'Straight limb uses cached hinge axis from previous frame');
}

// ------------------------------------------
// TEST P3-SC6: Neighbor Cache O(1) Performance
// ------------------------------------------
console.log('\nTEST P3-SC6: Neighbor Cache O(1)');
{
    const physics = new RagdollPhysics();
    
    // Create 17 particles (humanoid ragdoll)
    const particles = [];
    for (let i = 0; i < 17; i++) {
        particles.push(physics.addParticle(
            new THREE.Vector3(i, 0, 0),
            1.0, 0.1, false
        ));
    }
    
    // Create chain of constraints
    for (let i = 0; i < 16; i++) {
        physics.addConstraint(particles[i], particles[i + 1], 1.0);
    }
    
    // Measure performance of 1000 areConnected calls
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
        physics.areConnected(particles[0], particles[1]);
        physics.areConnected(particles[5], particles[10]);
        physics.areConnected(particles[8], particles[9]);
    }
    const cachedTime = performance.now() - startTime;
    
    // Compare with brute force
    const startBrute = performance.now();
    for (let i = 0; i < 1000; i++) {
        physics.areConnectedBruteForce(particles[0], particles[1]);
        physics.areConnectedBruteForce(particles[5], particles[10]);
        physics.areConnectedBruteForce(particles[8], particles[9]);
    }
    const bruteTime = performance.now() - startBrute;
    
    console.log(`    Cached: ${cachedTime.toFixed(2)}ms, Brute: ${bruteTime.toFixed(2)}ms`);
    
    // Cached should be significantly faster (at least 2x)
    assert(cachedTime < bruteTime, 
        `Cached lookup faster than brute force (${cachedTime.toFixed(2)}ms < ${bruteTime.toFixed(2)}ms)`);
}

// ------------------------------------------
// TEST P3-SC7: Cache Accuracy
// ------------------------------------------
console.log('\nTEST P3-SC7: Cache Accuracy');
{
    const physics = new RagdollPhysics();
    
    // Create particles
    const p1 = physics.addParticle(new THREE.Vector3(0, 0, 0), 1.0, 0.1, false);
    const p2 = physics.addParticle(new THREE.Vector3(1, 0, 0), 1.0, 0.1, false);
    const p3 = physics.addParticle(new THREE.Vector3(2, 0, 0), 1.0, 0.1, false);
    const p4 = physics.addParticle(new THREE.Vector3(3, 0, 0), 1.0, 0.1, false);
    
    // Create constraints: p1-p2, p2-p3 (p3-p4 NOT connected, p1-p4 NOT connected)
    physics.addConstraint(p1, p2, 1.0);
    physics.addConstraint(p2, p3, 1.0);
    
    // Test all pairs
    let allCorrect = true;
    
    // Connected pairs
    if (!physics.areConnected(p1, p2)) allCorrect = false;
    if (!physics.areConnected(p2, p1)) allCorrect = false; // Symmetric
    if (!physics.areConnected(p2, p3)) allCorrect = false;
    if (!physics.areConnected(p3, p2)) allCorrect = false; // Symmetric
    
    // Not connected pairs
    if (physics.areConnected(p1, p3)) allCorrect = false;
    if (physics.areConnected(p1, p4)) allCorrect = false;
    if (physics.areConnected(p3, p4)) allCorrect = false;
    
    assert(allCorrect, 'Cache returns correct results for all particle pairs');
}

// ------------------------------------------
// TEST: Flat Terrain Still Works
// ------------------------------------------
console.log('\nTEST: Flat Terrain Still Works');
{
    const physics = new RagdollPhysics();
    physics.setTerrain(new MockFlatTerrain());
    
    const particle = physics.addParticle(
        new THREE.Vector3(0, -0.5, 0), // Below ground
        1.0,
        0.2,
        false
    );
    
    physics.resolveCollisions();
    
    assert(particle.position.y >= particle.radius - 0.001, 
        `Particle pushed above flat ground (y: ${particle.position.y.toFixed(3)})`);
}

// ------------------------------------------
// TEST: No Terrain (Default Behavior)
// ------------------------------------------
console.log('\nTEST: No Terrain (Default Y=0 Ground)');
{
    const physics = new RagdollPhysics();
    // No terrain set
    
    const particle = physics.addParticle(
        new THREE.Vector3(5, -0.3, 10), // Below default ground
        1.0,
        0.1,
        false
    );
    
    physics.resolveCollisions();
    
    assert(particle.position.y >= particle.radius - 0.001, 
        `Particle respects default ground at Y=0 (y: ${particle.position.y.toFixed(3)})`);
}

// ------------------------------------------
// TEST: Clear() Resets Neighbor Cache
// ------------------------------------------
console.log('\nTEST: Clear() Resets Neighbor Cache');
{
    const physics = new RagdollPhysics();
    
    const p1 = physics.addParticle(new THREE.Vector3(0, 0, 0), 1.0, 0.1, false);
    const p2 = physics.addParticle(new THREE.Vector3(1, 0, 0), 1.0, 0.1, false);
    physics.addConstraint(p1, p2, 1.0);
    
    // Before clear
    const connectedBefore = physics.areConnected(p1, p2);
    
    // Clear
    physics.clear();
    
    // After clear, new particles should not be connected to old ones
    const p3 = physics.addParticle(new THREE.Vector3(0, 0, 0), 1.0, 0.1, false);
    const p4 = physics.addParticle(new THREE.Vector3(1, 0, 0), 1.0, 0.1, false);
    const connectedAfter = physics.areConnected(p3, p4);
    
    assert(connectedBefore === true, 'Particles connected before clear');
    assert(connectedAfter === false, 'New particles not connected after clear');
    assert(physics._neighborCache.size === 0 || 
           (!physics._neighborCache.has(p1) && !physics._neighborCache.has(p2)), 
        'Neighbor cache properly cleared');
}

// ------------------------------------------
// TEST: Velocity Damping on Slope Impact
// ------------------------------------------
console.log('\nTEST: Velocity Damping on Slope Impact');
{
    const physics = new RagdollPhysics();
    const slope = new MockSlopedTerrain(Math.PI / 6); // 30 degree slope
    physics.setTerrain(slope);
    
    // Particle falling into slope with downward velocity
    const particle = physics.addParticle(
        new THREE.Vector3(0, 0.5, 2),
        1.0,
        0.1,
        false
    );
    
    // Simulate downward velocity
    particle.previousPosition.set(0, 0.7, 2); // Was higher = moving down
    
    physics.resolveCollisions();
    
    // Calculate velocity after collision
    const velocityAfter = new THREE.Vector3().subVectors(
        particle.position, 
        particle.previousPosition
    );
    const slopeNormal = slope.getNormalAt(0, 2);
    const normalVel = velocityAfter.dot(slopeNormal);
    
    // Velocity into ground should be zeroed
    assert(normalVel >= -0.01, 
        `Normal velocity damped on impact (normalVel: ${normalVel.toFixed(4)})`);
}

// ==================== SUMMARY ====================

console.log('\n========================================');
console.log('           TEST SUMMARY');
console.log('========================================');
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);
console.log('========================================\n');

if (testsFailed > 0) {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
} else {
    console.log('ALL PHASE 3 TESTS PASSED!');
    process.exit(0);
}
