import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';

/**
 * Lightweight Verlet Physics System for Active Ragdolls
 * 
 * Handles particle-based physics simulation with distance constraints
 * to approximate rigid body dynamics without a heavy physics engine.
 */
export class RagdollPhysics {
    constructor(options = {}) {
        const config = RagdollConfig.physics;

        this.gravity = config.gravity.clone();
        this.friction = config.friction;
        this.groundFriction = config.groundFriction;
        this.iterations = config.solverIterations;

        this.particles = [];
        this.constraints = [];

        this.terrain = options.terrain || null;
        this.colliders = options.colliders || [];
        this.stiffnessMultiplier = 1.0;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
    }

    /**
     * Add a particle tied to a bone
     * @param {THREE.Bone} bone - The bone this particle represents
     * @param {number} mass - Particle mass (relative)
     * @param {number} radius - Collision radius
     */
    addParticle(bone, mass = 1.0, radius = 0.1) {
        const position = new THREE.Vector3();
        bone.getWorldPosition(position);

        const particle = {
            bone: bone,
            position: position.clone(),
            previousPosition: position.clone(),
            mass: mass,
            invMass: mass > 0 ? 1.0 / mass : 0,
            radius: radius,
            isLocked: false, // If true, follows animation exactly (kinematic)
            force: new THREE.Vector3()
        };

        this.particles.push(particle);
        return particle;
    }

    /**
     * Set global stiffness multiplier (0.0 to 1.0+)
     * 1.0 = Normal stiffness
     * 0.1 = Floppy/Relaxed
     * 2.0 = Rigid/Braced
     * @param {number} val 
     */
    setStiffnessMultiplier(val) {
        this.stiffnessMultiplier = Math.max(0, val);
    }

    /**
     * Add distance constraint between two particles
     * @param {Object} p1 - First particle
     * @param {Object} p2 - Second particle
     * @param {number} stiffness - 0 to 1 (1 = rigid)
     */
    addConstraint(p1, p2, stiffness = 1.0) {
        const dist = p1.position.distanceTo(p2.position);

        this.constraints.push({
            p1,
            p2,
            distance: dist,
            baseStiffness: stiffness
        });
    }

    /**
     * Reset physics state to match current bone positions
     * Call this when transitioning from Animation -> Ragdoll
     */
    matchAnimation() {
        this.particles.forEach(p => {
            p.bone.getWorldPosition(p.position);
            p.previousPosition.copy(p.position);
            p.force.set(0, 0, 0);
        });
    }

    /**
     * Update physics simulation
     */
    update(delta) {
        // Limit delta to prevent explosion
        const dt = Math.min(delta, 0.05);
        const dtSq = dt * dt;

        // 1. Apply Forces & Integrate Position (Verlet)
        this.particles.forEach(p => {
            if (p.isLocked) return;

            // F = ma -> a = F/m
            const acceleration = this.gravity.clone().add(p.force.multiplyScalar(p.invMass));

            // temp = pos
            const temp = p.position.clone();

            // pos = pos + (pos - prev) * friction + a * dt^2
            const velocity = p.position.clone().sub(p.previousPosition).multiplyScalar(this.friction);

            p.position.add(velocity).add(acceleration.multiplyScalar(dtSq));
            p.previousPosition.copy(temp);

            // Reset force
            p.force.set(0, 0, 0);
        });

        // 2. Solve Constraints
        for (let i = 0; i < this.iterations; i++) {
            this.constraints.forEach(c => {
                const p1 = c.p1;
                const p2 = c.p2;

                const deltaPos = p2.position.clone().sub(p1.position);
                const currentDist = deltaPos.length();

                if (currentDist === 0) return; // Prevent divide by zero

                const difference = (currentDist - c.distance) / currentDist;

                // Effective Stiffness = Base * Multiplier
                const effectiveStiffness = Math.min(1.0, c.baseStiffness * this.stiffnessMultiplier);

                const correction = deltaPos.multiplyScalar(difference * effectiveStiffness);

                // Distribute correction based on mass
                const totalInvMass = p1.invMass + p2.invMass;
                if (totalInvMass === 0) return;

                const m1 = p1.invMass / totalInvMass;
                const m2 = p2.invMass / totalInvMass;

                if (!p1.isLocked) p1.position.add(correction.clone().multiplyScalar(m1));
                if (!p2.isLocked) p2.position.sub(correction.clone().multiplyScalar(m2));
            });

            // 3. Ground Collision (Iterative)
            // We do this inside the loop to resolve conflicts with constraints
            this.particles.forEach(p => {
                if (p.isLocked) return;
                this._resolveGroundCollision(p);
                this._resolveWallCollision(p);
            });
        }
    }

    /**
     * Resolve wall collision using Raycasts
     * Only works if colliders are provided
     */
    _resolveWallCollision(p) {
        if (this.colliders.length === 0 || p.isLocked) return;

        // Calculate velocity vector
        const vel = p.position.clone().sub(p.previousPosition);
        const speed = vel.length();

        if (speed < 0.001) return;

        // Cast ray in direction of movement
        const dir = vel.clone().normalize();

        // Start ray from slightly behind current position (previous position) to catch tunneling
        this.raycaster.set(p.previousPosition, dir);

        // Ray length covers the movement + radius + margin
        const dist = speed + p.radius + 0.1;

        const intersects = this.raycaster.intersectObjects(this.colliders, true); // Recursive check

        if (intersects.length > 0) {
            const hit = intersects[0];

            if (hit.distance < dist) {
                // Hit a wall!

                // 1. Move particle to impact point (minus radius)
                const pushOut = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(p.radius));
                p.position.copy(pushOut);

                // 2. Reflect velocity (lossy bounce)
                // NewVel = Vel - (1 + Coeff) * (Vel . Normal) * Normal
                const restitution = 0.2; // Bounciness

                // Calculate current velocity
                const v = p.position.clone().sub(p.previousPosition);

                // Reflect component along normal
                const vn = v.dot(hit.face.normal);
                if (vn < 0) {
                    const reaction = hit.face.normal.clone().multiplyScalar(-(1 + restitution) * vn);
                    v.add(reaction);

                    // Apply checks to avoid explosion
                    p.previousPosition.copy(p.position).sub(v);
                }
            }
        }
    }

    /**
     * Resolve particle collision with terrain
     */
    _resolveGroundCollision(p) {
        if (!this.terrain) {
            // Simple floor at 0
            if (p.position.y < p.radius) {
                // CRITICAL FIX: Adjust previousPosition by same delta to preserve velocity
                // Otherwise snapping position up creates explosive upward velocity
                const correction = p.radius - p.position.y;
                p.position.y = p.radius;
                p.previousPosition.y += correction; // Preserve velocity by moving prev too

                // Friction
                const velX = p.position.x - p.previousPosition.x;
                const velZ = p.position.z - p.previousPosition.z;
                p.previousPosition.x += velX * (1 - this.groundFriction);
                p.previousPosition.z += velZ * (1 - this.groundFriction);
            }
            return;
        }

        const groundH = this.terrain.getHeightAt(p.position.x, p.position.z);
        if (p.position.y < groundH + p.radius) {
            // CRITICAL FIX: Adjust previousPosition by same delta to preserve velocity
            // Without this, snapping creates (correction / dt) upward velocity = instant backflip
            const correction = (groundH + p.radius) - p.position.y;
            p.position.y = groundH + p.radius;
            p.previousPosition.y += correction; // Key fix: move prev too

            // Apply ground friction to velocity
            // (In Verlet, velocity is implicit in pos - prevPos)
            const frictionFactor = 0.5; // Slide a bit

            const dx = p.position.x - p.previousPosition.x;
            const dz = p.position.z - p.previousPosition.z;

            p.previousPosition.x += dx * frictionFactor;
            p.previousPosition.z += dz * frictionFactor;
        }
    }

    /**
     * Apply forces to particles
     */
    applyForce(force) {
        this.particles.forEach(p => {
            p.force.add(force);
        });
    }

    /**
     * Apply impulse to nearest particle
     */
    applyImpulse(position, force) {
        let nearest = null;
        let minDist = Infinity;

        this.particles.forEach(p => {
            const d = p.position.distanceTo(position);
            if (d < minDist) {
                minDist = d;
                nearest = p;
            }
        });

        if (nearest && minDist < 2.0) {
            // approximate impulse by modifying previous position
            // vel += impulse / mass
            // prev = pos - newVel
            nearest.previousPosition.sub(force.clone().multiplyScalar(nearest.invMass * 0.1));
        }
    }

    /**
     * Sync particle positions back to bones
     * This rotates bones to "look at" their children
     */
    syncBones() {
        // This is tricky for a hierarchy.
        // Simple approach: For each constraint representing a bone,
        // point the parent bone towards the child particle.

        // We need a way to map which particle corresponds to which child bone.
        // For now, let's assume the controller handles the rotation logic
        // because it knows the skeleton hierarchy better.
        // This class just provides the positions.
    }

    getParticlePosition(bone) {
        const p = this.particles.find(p => p.bone === bone);
        return p ? p.position : null;
    }
}
