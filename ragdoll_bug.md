---
Ragdoll Physics Instability Analysis
Based on my deep dive into the codebase, I've identified 6 major issues that are likely causing the erratic bouncing and explosive behavior you're seeing in the demo.
---
Issue 1: Ground Collision Velocity Handling is Inverted (CRITICAL)
Location: RagdollPhysics.js:307-311
const normalVelocity = velocity.dot(groundNormal);
if (normalVelocity < 0) {
    // Moving into ground - remove that velocity component
    particle.previousPosition.add(
        groundNormal.clone().multiplyScalar(normalVelocity)
    );
}
Problem: When the particle is moving into the ground, normalVelocity is negative. Adding a negative scalar times the normal to previousPosition actually pushes the previous position down, which in Verlet terms creates upward velocity instead of zeroing it.
Expected behavior: The code should subtract this to cancel the velocity, not add.
Evidence from your image: The trail lines show the ragdoll bouncing higher after each ground contact - classic symptom of energy being added on collision.
---
Issue 2: Ground Friction Adds Energy Instead of Removing It
Location: RagdollPhysics.js:314-320
tangentVelocity.copy(velocity).sub(
    groundNormal.clone().multiplyScalar(velocity.dot(groundNormal))
);
particle.previousPosition.add(
    tangentVelocity.multiplyScalar(1 - this.groundFriction)
);
Problem: With groundFriction = 0.6, this multiplies tangent velocity by 0.4 and adds it to previousPosition. This shifts previousPosition in the direction of motion, which creates more velocity rather than damping it.
Correct approach: Should subtract friction force, or apply as velocity reduction.
---
Issue 3: Self-Collision Resolution Creates Energy (Moderate)
Location: RagdollPhysics.js:199-243
Problem: When particles overlap, they're pushed apart by the overlap distance, but no velocity correction is applied. In Verlet integration, moving position without also moving previousPosition creates velocity.
If two body parts deeply penetrate each other (e.g., hand passing through thigh during a tumble), the aggressive separation generates artificial impulses that compound over iterations.
---
Issue 4: Angular + Distance Constraints Fight Each Other (Moderate)
Location: _step() method, lines 177-193
for (let i = 0; i < this.solverIterations; i++) {
    // Distance constraints first
    for (const constraint of this.constraints) {
        constraint.resolve();
    }
    // Angular constraints (joint limits) - Phase 2
    for (const angular of this.angularConstraints) {
        angular.resolve();
    }
    ...
}
Problem: Angular constraints move the child particle to enforce angle limits. Distance constraints then pull it back to maintain bone length. With 20 solver iterations, this back-and-forth can create oscillations, especially for limbs at extreme angles.
Compounding factor: The angular constraint (PhysicsAngularConstraint.js:191-195) moves the child position without touching previousPosition, creating velocity on each correction.
---
Issue 5: High Gravity + Low Damping = Energy Accumulation
Location: RagdollConfig.js:12-14
gravity: new THREE.Vector3(0, -40, 0),  // 4x Earth gravity
friction: 0.98,                          // Only 2% velocity loss per frame
Problem: The friction = 0.98 means particles only lose 2% of their velocity per physics step. With aggressive collisions adding energy and very little global damping, the system can't dissipate accumulated errors.
At 60Hz physics, this is effectively:
- Per second: 0.98^60 ≈ 0.30 → Only 70% velocity loss per second
Combined with high gravity, particles gain significant momentum before ground impact, and the collision bugs amplify this into explosive bounces.
---
Issue 6: Multiple Collision Passes Per Step Compound Errors
Location: RagdollPhysics.js:176-197
for (let i = 0; i < this.solverIterations; i++) {  // 20 iterations
    ...
    this.resolveCollisions();      // Called 20 times
    this.resolveSelfCollisions();  // Called 20 times
}
this.resolveCollisions();          // Called 1 more time
Problem: resolveCollisions() and resolveSelfCollisions() are called 21 times per physics step. Each call can add positional changes that generate velocity. With the bugs in Issues 1-3, errors compound multiplicatively.
---
The Test File vs Browser Discrepancy
Interestingly, tests/ragdoll_verify.mjs (the Node.js test) has a simplified collision handler at lines 289-300:
if (particle.position.y < groundY + particle.radius) {
    // FIX: Correct BOTH positions to zero vertical velocity
    particle.position.y = groundY + particle.radius;
    particle.previousPosition.y = particle.position.y;  // <-- Correct!
    ...
}
This is the correct approach - setting previousPosition.y = position.y zeroes the vertical velocity. But the actual browser implementation in RagdollPhysics.js uses the flawed vector math described in Issues 1-2.
---
Summary: Root Causes
| Priority | Issue | Impact | Location |
|----------|-------|--------|----------|
| P0 | Ground collision inverts velocity | Energy added on every ground contact | RagdollPhysics.js:307-311 |
| P0 | Ground friction adds velocity | Sliding accelerates instead of slowing | RagdollPhysics.js:314-320 |
| P1 | Self-collision creates velocity | Overlapping limbs explode apart | RagdollPhysics.js:232-239 |
| P1 | Angular constraints create velocity | Joint corrections generate impulses | PhysicsAngularConstraint.js:191-195 |
| P2 | Low global damping | System can't dissipate errors | RagdollConfig.js:13 |
| P2 | Excessive collision iterations | Errors compound 21× per step | RagdollPhysics.js:176-197 |