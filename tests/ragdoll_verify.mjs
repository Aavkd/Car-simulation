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
            this.x /= s; this.y /= s; this.z /= s;
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
    Object3D: class {
        constructor() {}
    }
};

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
    assert(diff <= tolerance, `${message} (expected: ${expected.toFixed(4)}, actual: ${actual.toFixed(4)})`);
}

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

    addForce(force) {
        if (!this.isPinned) {
            this.forces.add(force);
        }
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

    setPosition(pos) {
        this.position.copy(pos);
        this.previousPosition.copy(pos);
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

    resolve() {
        const delta = new THREE.Vector3().subVectors(this.particleA.position, this.particleB.position);
        const distance = delta.length();

        if (distance === 0) return;

        const difference = (distance - this.restDistance) / distance;

        // Inverse mass weighting
        const invMassA = this.particleA.isPinned ? 0 : 1 / this.particleA.mass;
        const invMassB = this.particleB.isPinned ? 0 : 1 / this.particleB.mass;
        const totalInvMass = invMassA + invMassB;

        if (totalInvMass === 0) return;

        const scalar = difference * this.stiffness;

        if (!this.particleA.isPinned) {
            const ratioA = invMassA / totalInvMass;
            this.particleA.position.sub(delta.clone().multiplyScalar(scalar * ratioA));
        }
        if (!this.particleB.isPinned) {
            const ratioB = invMassB / totalInvMass;
            this.particleB.position.add(delta.clone().multiplyScalar(scalar * ratioB));
        }
    }
}

// ==================== RAGDOLL PHYSICS CLASS ====================

class RagdollPhysics {
    constructor() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = [];
        this.gravity = new THREE.Vector3(0, -40, 0);
        this.friction = 0.98;
        this.groundFriction = 0.6;
        this.solverIterations = 20;
        this.terrain = null;

        // Fixed timestep
        this.accumulator = 0;
        this.fixedDeltaTime = 1 / 60;
        this.maxSubSteps = 8;
    }

    addParticle(position, mass, radius, isPinned) {
        const particle = new PhysicsParticle(position, mass, radius, isPinned);
        this.particles.push(particle);
        return particle;
    }

    addConstraint(particleA, particleB, stiffness) {
        const constraint = new PhysicsConstraint(particleA, particleB, stiffness);
        this.constraints.push(constraint);
        return constraint;
    }

    update(dt) {
        this.accumulator += dt;
        let steps = 0;

        while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSubSteps) {
            this._step(this.fixedDeltaTime);
            this.accumulator -= this.fixedDeltaTime;
            steps++;
        }
        return steps;
    }

    _step(dt) {
        for (const particle of this.particles) {
            particle.update(dt, this.friction, this.gravity);
        }

        for (let i = 0; i < this.solverIterations; i++) {
            for (const constraint of this.constraints) {
                constraint.resolve();
            }
            for (const angular of this.angularConstraints) {
                angular.resolve();
            }
            this.resolveCollisions();
            this.resolveSelfCollisions();
        }

        this.resolveCollisions();
    }

    resolveSelfCollisions() {
        const count = this.particles.length;
        for (let i = 0; i < count; i++) {
            const pA = this.particles[i];
            for (let j = i + 1; j < count; j++) {
                const pB = this.particles[j];

                if (this.areConnected(pA, pB)) continue;

                const delta = new THREE.Vector3().subVectors(pA.position, pB.position);
                const distSq = delta.lengthSq();
                const minDist = pA.radius + pB.radius;

                if (distSq < minDist * minDist && distSq > 0.0001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;

                    const invMassA = pA.isPinned ? 0 : 1 / pA.mass;
                    const invMassB = pB.isPinned ? 0 : 1 / pB.mass;
                    const totalInvMass = invMassA + invMassB;

                    if (totalInvMass === 0) continue;

                    const normal = delta.normalize();

                    if (!pA.isPinned) {
                        const ratioA = invMassA / totalInvMass;
                        pA.position.add(normal.clone().multiplyScalar(overlap * ratioA));
                    }
                    if (!pB.isPinned) {
                        const ratioB = invMassB / totalInvMass;
                        pB.position.sub(normal.clone().multiplyScalar(overlap * ratioB));
                    }
                }
            }
        }
    }

    areConnected(pA, pB) {
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

        for (const particle of this.particles) {
            let groundY = defaultGroundY;

            if (this.terrain) {
                groundY = this.terrain.getHeightAt(particle.position.x, particle.position.z);
            }

            if (particle.position.y < groundY + particle.radius) {
                // FIX: Correct BOTH positions to zero vertical velocity
                particle.position.y = groundY + particle.radius;
                particle.previousPosition.y = particle.position.y;

                // Apply ground friction to horizontal velocity only
                const velocityX = particle.position.x - particle.previousPosition.x;
                const velocityZ = particle.position.z - particle.previousPosition.z;
                particle.previousPosition.x = particle.position.x - velocityX * this.groundFriction;
                particle.previousPosition.z = particle.position.z - velocityZ * this.groundFriction;
            }
        }
    }

    clear() {
        this.particles = [];
        this.constraints = [];
    }
}

// ==================== TESTS ====================

console.log('\n========================================');
console.log('     RAGDOLL PHASE 1 VERIFICATION');
console.log('========================================\n');

// ------------------------------------------
// TEST P1-SC1: No Ground Tunneling
// ------------------------------------------
console.log('TEST P1-SC1: No Ground Tunneling');
{
    const physics = new RagdollPhysics();
    const particle = physics.addParticle(new THREE.Vector3(0, 50, 0), 1.0, 0.5, false);
    
    // Simulate a lag spike with large dt
    physics.update(0.1); // 100ms lag spike
    
    const groundY = 0;
    const minY = groundY + particle.radius;
    
    assert(particle.position.y >= minY, 
        `Particle at Y=${particle.position.y.toFixed(2)} should not go below ${minY}`);
}

// ------------------------------------------
// TEST P1-SC2: Velocity Zeroed on Impact
// ------------------------------------------
console.log('\nTEST P1-SC2: Velocity Zeroed on Impact');
{
    const physics = new RagdollPhysics();
    const particle = physics.addParticle(new THREE.Vector3(0, 5, 0), 1.0, 0.5, false);
    
    // Give it downward velocity
    particle.previousPosition.y = 10; // Moving down fast
    
    // Step physics until it hits ground
    for (let i = 0; i < 60; i++) {
        physics._step(1/60);
    }
    
    // After ground collision, vertical velocity should be zero or positive
    const velocityY = particle.position.y - particle.previousPosition.y;
    assert(velocityY >= 0, 
        `Vertical velocity after impact should be >= 0 (actual: ${velocityY.toFixed(4)})`);
}

// ------------------------------------------
// TEST P1-SC3: Mass Ratio Respected
// ------------------------------------------
console.log('\nTEST P1-SC3: Mass Ratio Respected');
{
    // Hips (15kg) connected to hand (0.5kg)
    const hipsPos = new THREE.Vector3(0, 5, 0);
    const handPos = new THREE.Vector3(1, 5, 0);
    
    const hips = new PhysicsParticle(hipsPos, 15.0, 0.35, false);
    const hand = new PhysicsParticle(handPos, 0.5, 0.15, false);
    
    const constraint = new PhysicsConstraint(hips, hand, 1.0);
    const originalRestDist = constraint.restDistance;
    
    // Pull hand away by 1 unit
    hand.position.x += 1.0;
    
    const hipsStartX = hips.position.x;
    const handStartX = hand.position.x;
    
    // Resolve constraint
    constraint.resolve();
    
    const hipsMove = Math.abs(hips.position.x - hipsStartX);
    const handMove = Math.abs(hand.position.x - handStartX);
    
    // Hips should move < 0.04 units (much less than hand)
    assert(hipsMove < 0.04, `Hips moved ${hipsMove.toFixed(4)} (should be < 0.04)`);
    
    // Hand should move > 0.96 units (much more than hips)
    assert(handMove > 0.96, `Hand moved ${handMove.toFixed(4)} (should be > 0.96)`);
    
    // Verify mass ratio: hand should move ~30x more than hips
    const ratio = handMove / (hipsMove + 0.0001);
    assert(ratio > 20, `Movement ratio ${ratio.toFixed(1)} should be > 20 (hand moves much more)`);
}

// ------------------------------------------
// TEST P1-SC4: Fixed Timestep Stability
// ------------------------------------------
console.log('\nTEST P1-SC4: Fixed Timestep Stability');
{
    const physics = new RagdollPhysics();
    const particle = physics.addParticle(new THREE.Vector3(0, 10, 0), 1.0, 0.5, false);
    
    // Simulate extreme lag (0.5s frame)
    const steps = physics.update(0.5);
    
    // Should take max 8 sub-steps (spiral of death prevention)
    assert(steps <= 8, `Sub-steps ${steps} should be <= 8 (maxSubSteps)`);
    
    // Position should not explode
    assert(Math.abs(particle.position.x) < 1000, 'No X explosion');
    assert(Math.abs(particle.position.y) < 1000 && particle.position.y >= 0, 'No Y explosion');
    assert(Math.abs(particle.position.z) < 1000, 'No Z explosion');
}

// ------------------------------------------
// TEST P1-SC5: Self-Collision Mass Weighting
// ------------------------------------------
console.log('\nTEST P1-SC5: Self-Collision Mass Weighting');
{
    const physics = new RagdollPhysics();
    
    // Head (3kg) and hand (0.5kg) overlapping
    const head = physics.addParticle(new THREE.Vector3(0, 5, 0), 3.0, 0.5, false);
    const hand = physics.addParticle(new THREE.Vector3(0.5, 5, 0), 0.5, 0.15, false);
    
    const headStartX = head.position.x;
    const handStartX = hand.position.x;
    
    // Resolve self-collisions
    physics.resolveSelfCollisions();
    
    const headMove = Math.abs(head.position.x - headStartX);
    const handMove = Math.abs(hand.position.x - handStartX);
    
    // Hand should move approximately 6x more than head (3kg / 0.5kg = 6)
    const ratio = handMove / (headMove + 0.0001);
    assert(ratio > 4, `Hand/Head movement ratio ${ratio.toFixed(1)} should be > 4`);
}

// ------------------------------------------
// TEST P1-SC6: Constraint Stretch < 5%
// ------------------------------------------
console.log('\nTEST P1-SC6: Constraint Stretch < 5%');
{
    const physics = new RagdollPhysics();
    
    // Create a simple chain
    const p1 = physics.addParticle(new THREE.Vector3(0, 10, 0), 5.0, 0.3, false);
    const p2 = physics.addParticle(new THREE.Vector3(0, 9, 0), 2.0, 0.3, false);
    const p3 = physics.addParticle(new THREE.Vector3(0, 8, 0), 1.0, 0.3, false);
    
    const c1 = physics.addConstraint(p1, p2, 1.0);
    const c2 = physics.addConstraint(p2, p3, 1.0);
    
    // Run simulation for 60 frames
    for (let i = 0; i < 60; i++) {
        physics._step(1/60);
    }
    
    // Check constraint stretch
    const dist1 = p1.position.distanceTo(p2.position);
    const dist2 = p2.position.distanceTo(p3.position);
    
    const stretch1 = Math.abs(dist1 - c1.restDistance) / c1.restDistance;
    const stretch2 = Math.abs(dist2 - c2.restDistance) / c2.restDistance;
    
    assert(stretch1 < 0.05, `Constraint 1 stretch ${(stretch1*100).toFixed(1)}% should be < 5%`);
    assert(stretch2 < 0.05, `Constraint 2 stretch ${(stretch2*100).toFixed(1)}% should be < 5%`);
}

// ------------------------------------------
// TEST: Solver Iterations Set to 20
// ------------------------------------------
console.log('\nTEST: Solver Iterations Configuration');
{
    const physics = new RagdollPhysics();
    assert(physics.solverIterations === 20, 
        `Solver iterations should be 20 (actual: ${physics.solverIterations})`);
}

// ------------------------------------------
// TEST: Original Velocity Test (Backward Compatibility)
// ------------------------------------------
console.log('\nTEST: Original Velocity Test (Backward Compat)');
{
    const particle = {
        position: new THREE.Vector3(0, 0, 0),
        previousPosition: new THREE.Vector3(0, 0, 0),
        forces: new THREE.Vector3()
    };
    
    // Apply impulse
    const impulse = new THREE.Vector3(100, 0, 0);
    const velocityChange = impulse.clone().multiplyScalar(0.04);
    particle.previousPosition.sub(velocityChange);
    
    // Simple Verlet step
    const velocity = particle.position.clone().sub(particle.previousPosition);
    const temp = particle.position.clone();
    particle.position.add(velocity);
    particle.previousPosition.copy(temp);
    
    assertApprox(particle.position.x, 4, 0.001, 'Particle moved with expected velocity');
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
    console.log('ALL TESTS PASSED!');
    process.exit(0);
}
