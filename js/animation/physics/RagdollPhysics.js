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
        
        // Phase 3: Neighbor cache for O(1) areConnected() lookups
        this._neighborCache = new Map(); // particle -> Set of connected particles
    }

    addParticle(position, mass, radius, isPinned) {
        const particle = new PhysicsParticle(position, mass, radius, isPinned);
        this.particles.push(particle);
        return particle;
    }

    addConstraint(particleA, particleB, stiffness) {
        const constraint = new PhysicsConstraint(particleA, particleB, stiffness);
        this.constraints.push(constraint);
        
        // Phase 3: Update neighbor cache for O(1) lookups
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

    // Phase 3: O(1) lookup using neighbor cache
    areConnected(pA, pB) {
        const neighbors = this._neighborCache.get(pA);
        return neighbors ? neighbors.has(pB) : false;
    }

    setTerrain(terrain) {
        this.terrain = terrain;
    }

    resolveCollisions() {
        // Default ground at Y=0
        const defaultGroundY = 0;
        // Reusable vectors to avoid GC pressure
        const groundNormal = new THREE.Vector3();
        const surfacePoint = new THREE.Vector3();
        const toParticle = new THREE.Vector3();
        const velocity = new THREE.Vector3();
        const tangentVelocity = new THREE.Vector3();

        for (const particle of this.particles) {
            let groundY = defaultGroundY;
            groundNormal.set(0, 1, 0); // Default up

            // If terrain is available, get exact height and normal at particle position
            if (this.terrain) {
                groundY = this.terrain.getHeightAt(particle.position.x, particle.position.z);
                
                // Get terrain normal if available (Phase 3 - slope handling)
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

            // Calculate penetration along terrain normal
            surfacePoint.set(
                particle.position.x,
                groundY,
                particle.position.z
            );
            toParticle.subVectors(particle.position, surfacePoint);
            const signedDistance = toParticle.dot(groundNormal);

            // Ground collision - using signed distance along normal
            if (signedDistance < particle.radius) {
                const penetration = particle.radius - signedDistance;

                // Project out along normal (works for both flat and sloped terrain)
                particle.position.add(
                    groundNormal.clone().multiplyScalar(penetration)
                );

                // Calculate velocity and zero component in normal direction
                velocity.subVectors(particle.position, particle.previousPosition);
                const normalVelocity = velocity.dot(groundNormal);

                if (normalVelocity < 0) {
                    // Moving into ground - remove that velocity component
                    particle.previousPosition.add(
                        groundNormal.clone().multiplyScalar(normalVelocity)
                    );
                }

                // Apply friction to tangential velocity only
                tangentVelocity.copy(velocity).sub(
                    groundNormal.clone().multiplyScalar(velocity.dot(groundNormal))
                );
                particle.previousPosition.add(
                    tangentVelocity.multiplyScalar(1 - this.groundFriction)
                );
            }
        }
    }

    // Helper to reset the simulation
    clear() {
        this.particles = [];
        this.constraints = [];
        this.angularConstraints = [];
        this._neighborCache.clear();
    }
}
