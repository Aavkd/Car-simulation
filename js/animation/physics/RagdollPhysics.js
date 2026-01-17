import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';

/**
 * A single point mass in the physics simulation.
 */
export class PhysicsParticle {
    constructor(position, mass = 1.0, radius = 0.1, isPinned = false) {
        this.position = position.clone();
        this.previousPosition = position.clone();
        this.mass = mass;
        this.radius = radius;
        this.isPinned = isPinned; // If true, unaffected by physics (e.g., kinematic control)
        this.forces = new THREE.Vector3();
    }

    addForce(force) {
        if (!this.isPinned) {
            this.forces.add(force);
        }
    }

    update(dt, friction, gravity) {
        if (this.isPinned) return;

        // Verlet Integration
        // x(t+dt) = 2x(t) - x(t-dt) + a(t) * dt^2
        // We implement it as:
        // velocity = x - oldX
        // nextX = x + velocity * friction + a * dt^2

        const velocity = new THREE.Vector3().subVectors(this.position, this.previousPosition);
        velocity.multiplyScalar(friction);

        // Save current position as previous
        this.previousPosition.copy(this.position);

        // Apply Update
        // pos += velocity
        this.position.add(velocity);

        // Apply Acceleration (F=ma => a=F/m) + Gravity
        // totalAccel = gravity + forces / mass
        const acceleration = new THREE.Vector3().copy(gravity);

        // Add external forces
        if (this.mass > 0) {
            const forceAccel = new THREE.Vector3().copy(this.forces).divideScalar(this.mass);
            acceleration.add(forceAccel);
        }

        // pos += accel * dt * dt
        acceleration.multiplyScalar(dt * dt);
        this.position.add(acceleration);

        // Reset forces
        this.forces.set(0, 0, 0);
    }

    setPosition(pos) {
        this.position.copy(pos);
        this.previousPosition.copy(pos); // Reset velocity
    }
}

/**
 * A distance constraint between two particles.
 */
export class PhysicsConstraint {
    constructor(particleA, particleB, stiffness = 1.0) {
        this.particleA = particleA;
        this.particleB = particleB;
        this.stiffness = stiffness;

        // Calculate rest distance from initial positions
        this.restDistance = particleA.position.distanceTo(particleB.position);
    }

    resolve() {
        const delta = new THREE.Vector3().subVectors(this.particleA.position, this.particleB.position);
        const distance = delta.length();

        if (distance === 0) return; // Prevent division by zero

        // Difference factor: (current - rest) / current
        const difference = (distance - this.restDistance) / distance;

        // Inverse mass weighting - lighter particles move more
        const invMassA = this.particleA.isPinned ? 0 : 1 / this.particleA.mass;
        const invMassB = this.particleB.isPinned ? 0 : 1 / this.particleB.mass;
        const totalInvMass = invMassA + invMassB;

        if (totalInvMass === 0) return; // Both pinned

        const scalar = difference * this.stiffness;

        // Weight correction by inverse mass (lighter moves more)
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

/**
 * The core lightweight physics engine.
 */
export class RagdollPhysics {
    constructor() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = []; // For Phase 2 angular constraints
        this.gravity = RagdollConfig.physics.gravity;
        this.friction = RagdollConfig.physics.friction;
        this.groundFriction = RagdollConfig.physics.groundFriction;
        this.solverIterations = RagdollConfig.physics.solverIterations;

        // Fixed timestep sub-stepping
        this.accumulator = 0;
        this.fixedDeltaTime = 1 / 60; // 60 Hz physics
        this.maxSubSteps = 8; // Prevent spiral of death
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
        // Fixed timestep sub-stepping for stability
        this.accumulator += dt;
        let steps = 0;

        while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSubSteps) {
            this._step(this.fixedDeltaTime);
            this.accumulator -= this.fixedDeltaTime;
            steps++;
        }
    }

    /**
     * Internal physics step at fixed timestep
     * @param {number} dt - Fixed delta time
     */
    _step(dt) {
        // 1. Update Particles (Integration)
        for (const particle of this.particles) {
            particle.update(dt, this.friction, this.gravity);
        }

        // 2. Solve Constraints (Iterative)
        for (let i = 0; i < this.solverIterations; i++) {
            // Distance constraints first
            for (const constraint of this.constraints) {
                constraint.resolve();
            }

            // Angular constraints (joint limits) - Phase 2
            for (const angular of this.angularConstraints) {
                angular.resolve();
            }

            // Environment collisions (Ground)
            this.resolveCollisions();

            // Self collisions (Limb vs Limb)
            this.resolveSelfCollisions();
        }

        // 3. Final collision pass (prevents residual penetration)
        this.resolveCollisions();
    }

    resolveSelfCollisions() {
        // Simple O(N^2) collision check
        // Optimization: In a full engine, we'd use spatial hashing or a grid.
        // For < 20 particles, N^2 is fine (approx 200 checks * iterations).

        const count = this.particles.length;
        for (let i = 0; i < count; i++) {
            const pA = this.particles[i];

            for (let j = i + 1; j < count; j++) {
                const pB = this.particles[j];

                // Skip if connected by constraint (optimization + stability)
                if (this.areConnected(pA, pB)) continue;

                const delta = new THREE.Vector3().subVectors(pA.position, pB.position);
                const distSq = delta.lengthSq();
                const minDist = pA.radius + pB.radius;

                if (distSq < minDist * minDist && distSq > 0.0001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;

                    // Inverse mass weighting - lighter particles move more
                    const invMassA = pA.isPinned ? 0 : 1 / pA.mass;
                    const invMassB = pB.isPinned ? 0 : 1 / pB.mass;
                    const totalInvMass = invMassA + invMassB;

                    if (totalInvMass === 0) continue; // Both pinned

                    const normal = delta.normalize();

                    // Push apart weighted by inverse mass
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

    // Helper to check connections. 
    // Ideally we cache this or store neighbors on particles.
    // Given the small scale, iterating constraints is "okay" but caching is better.
    // Let's cache it on the particle itself during setup? 
    // Since we don't change constraints often, that's best.
    // But modification of existing classes is risky without full refactor.
    // Let's simple check constraints for now.
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
        // Default ground at Y=0
        const defaultGroundY = 0;

        for (const particle of this.particles) {
            let groundY = defaultGroundY;

            // If terrain is available, get exact height at particle position
            if (this.terrain) {
                groundY = this.terrain.getHeightAt(particle.position.x, particle.position.z);
            }

            // Ground collision
            if (particle.position.y < groundY + particle.radius) {
                // FIX: Correct BOTH positions to zero vertical velocity
                // This prevents particles from tunneling back through the ground
                particle.position.y = groundY + particle.radius;
                particle.previousPosition.y = particle.position.y; // Zero out Y velocity

                // Apply ground friction to horizontal velocity only
                const velocityX = particle.position.x - particle.previousPosition.x;
                const velocityZ = particle.position.z - particle.previousPosition.z;
                particle.previousPosition.x = particle.position.x - velocityX * this.groundFriction;
                particle.previousPosition.z = particle.position.z - velocityZ * this.groundFriction;
            }
        }
    }

    // Helper to reset the simulation
    clear() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = [];
    }
}
