Ragdoll System Analysis Report
Executive Summary
After a comprehensive deep dive into the ragdoll system implementation, I've identified 12 critical issues that explain why limbs go through the ground, why limbs phase through each other, and why the ragdoll behavior is generally unstable. The current implementation represents a Phase 2 system (basic physics rig) but lacks the fundamental physics components required for robust ragdoll behavior.
---
Current Architecture Overview
File Structure
js/animation/physics/
├── RagdollPhysics.js         # Core Verlet physics engine (~252 lines)
├── ActiveRagdollController.js # Skeleton-physics bridge (~426 lines)
├── RagdollConfig.js          # Configuration parameters (~134 lines)
└── SkeletonRegistry.js       # Bone discovery service (~216 lines)
What's Implemented
| Component | Status | Description |
|-----------|--------|-------------|
| Verlet Integration | ✅ Done | PhysicsParticle.update() - Basic position-based dynamics |
| Distance Constraints | ✅ Done | PhysicsConstraint.resolve() - Maintains bone lengths |
| Ground Collision | ⚠️ Flawed | resolveCollisions() - Simple Y-axis projection |
| Self Collision | ⚠️ Flawed | resolveSelfCollisions() - Sphere-sphere detection |
| Bone Sync | ⚠️ Flawed | _syncBonesToPhysics() - Aim-based rotation |
| Angular Limits | ❌ Missing | No joint rotation limits |
| Active Motors | ❌ Missing | No pose-matching muscle simulation |
| CCD | ❌ Missing | No continuous collision detection |
---
Critical Issues Identified
Issue #1: Ground Penetration - Broken Verlet Position Correction
Location: RagdollPhysics.js:229-233
// Current Implementation
if (particle.position.y < groundY + particle.radius) {
    const depth = (groundY + particle.radius) - particle.position.y;
    particle.position.y += depth;  // BUG: Only moves current position
    // ...friction applied to previousPosition
}
Problem: When projecting a particle out of the ground, only position.y is corrected. In Verlet integration, velocity is implicitly stored as position - previousPosition. By not correcting previousPosition in the Y-axis, the particle retains its downward velocity and will immediately tunnel back through the ground on the next frame.
Fix Required:
// Correct BOTH positions to zero out velocity in penetration direction
particle.position.y = groundY + particle.radius;
particle.previousPosition.y = groundY + particle.radius; // Critical!
---
Issue #2: No Terrain Normal Support - Slope Handling Broken
Location: RagdollPhysics.js:216-243
Problem: Ground collision only projects particles upward along the Y-axis. On sloped terrain, particles should be projected along the terrain normal, not just vertically. This causes:
- Limbs to clip through hillsides
- Unnatural sliding behavior on slopes
- Jittery movement on uneven terrain
Fix Required:
// Should use terrain normal for proper slope handling
const normal = this.terrain.getNormalAt(particle.position.x, particle.position.z);
const penetration = (groundY + particle.radius) - particle.position.y;
particle.position.add(normal.multiplyScalar(penetration));
---
Issue #3: Self-Collision Insufficient Correction Factor
Location: RagdollPhysics.js:183
const correction = delta.normalize().multiplyScalar(overlap * 0.8);
Problem: The 0.8 correction factor means only 80% of the overlap is resolved per iteration. Combined with only 10 solver iterations, deep interpenetrations may not fully resolve. Additionally:
- Equal mass split ignores particle mass (heavier should move less)
- No restitution coefficient for bounce
- No friction between colliding limbs
Fix Required:
// Use inverse mass weighting
const totalInvMass = (1/pA.mass) + (1/pB.mass);
const correctionA = delta.clone().multiplyScalar(overlap * (1/pA.mass) / totalInvMass);
const correctionB = delta.clone().multiplyScalar(overlap * (1/pB.mass) / totalInvMass);
---
Issue #4: Missing Angular/Hinge Constraints (Joint Limits)
Location: Entire codebase - NOT IMPLEMENTED
Problem: The system only has distance constraints. Without angular constraints:
- Knees can bend backward (hyperextension)
- Elbows can rotate 360°
- Spine can twist into impossible poses
- Head can rotate through the body
This is explicitly marked as incomplete in Ragdoll_Roadmap.md (Phase 3):
> "  Swing/Twist Limits: Prevent unnatural limb rotation."
Fix Required: Implement PhysicsAngularConstraint class with:
- Cone limits for ball joints (shoulders, hips)
- Hinge limits for single-axis joints (knees, elbows)
- Twist limits to prevent over-rotation
---
Issue #5: Missing Continuous Collision Detection (CCD)
Location: RagdollPhysics.js:216-243
Problem: At high velocities (falls, impacts), particles can move more than their radius in a single frame, tunneling completely through the ground without ever triggering collision detection.
Current: Discrete collision check at end of frame
Required: Swept sphere collision or sub-stepping
Fix Required:
// Option 1: Sub-stepping
const subSteps = Math.ceil(velocity.length() / minRadius);
for (let i = 0; i < subSteps; i++) {
    this.resolveCollisions();
}
// Option 2: Swept sphere ray test
const ray = new THREE.Ray(previousPosition, velocity.normalize());
const hit = terrain.raycast(ray, velocity.length() + radius);
---
Issue #6: Sphere Colliders Instead of Capsules
Location: ActiveRagdollController.js:49-74
Problem: All body parts use spheres for collision. Long bones (femur, tibia, humerus) should use capsule colliders for accurate coverage. Spheres centered at joints leave the mid-bone area unprotected.
Current:          Required:
  (O)               ====O====
   |                   ||
  (O)   →          ====O====
   |                   ||
  (O)               ====O====
Impact: Arms and legs pass through objects between joints.
---
Issue #7: Constraint Solver Ordering Issues
Location: RagdollPhysics.js:131-149
update(dt) {
    // 1. Integration (moves particles)
    for (const particle of this.particles) {
        particle.update(dt, this.friction, this.gravity);
    }
    
    // 2. Solver loop
    for (let i = 0; i < this.solverIterations; i++) {
        // Distance constraints
        for (const constraint of this.constraints) {
            constraint.resolve();
        }
        // Collisions
        this.resolveCollisions();
        this.resolveSelfCollisions();
    }
}
Problem: Collision resolution can violate distance constraints, and distance constraints can push particles back into collision. The current interleaved approach is correct in structure but has no post-iteration stabilization pass.
Fix Required: Add final collision pass after all constraints:
// Final collision pass to ensure no penetration
this.resolveCollisions();
---
Issue #8: Insufficient Solver Iterations
Location: RagdollConfig.js:15
solverIterations: 10,
Problem: 10 iterations is marginal for a 17-particle skeleton. Industry standard is 4-8 iterations for simple chains, but 20-30 for full humanoids with self-collision. The current value leads to:
- Stretchy constraints
- Jittery settling
- Constraint drift over time
Fix Required:
solverIterations: 20,  // Minimum for humanoid ragdoll
Or implement SOR (Successive Over-Relaxation) with ω=1.5 for faster convergence.
---
Issue #9: No Fixed Timestep / Sub-stepping
Location: ActiveRagdollController.js:155-159
update(dt) {
    if (!this.isRagdoll) return;
    this.physics.update(dt);  // Variable dt passed directly
}
Problem: Variable delta time causes physics instability. Large dt (lag spike) = explosions; small dt = jitter. Verlet integration is stable but only with fixed timestep.
Fix Required:
const FIXED_DT = 1/60;
this.accumulator += dt;
while (this.accumulator >= FIXED_DT) {
    this.physics.update(FIXED_DT);
    this.accumulator -= FIXED_DT;
}
---
Issue #10: Bone Sync Quaternion Instabilities
Location: ActiveRagdollController.js:298-362
Problem: The _aimBone() function can produce:
- NaN quaternions when limbs are perfectly straight (zero-length cross product)
- Gimbal lock in edge cases
- Bone flipping when pole vector crosses axis
const hingeAxis = new THREE.Vector3().crossVectors(primaryAxis, secondaryVec).normalize();
// BUG: If limb is straight, crossVectors returns (0,0,0), normalize() = NaN
if (hingeAxis.lengthSq() > 0.001) { ... }  // Partial fix, but fallback is weak
Fix Required: Add robust fallback:
if (hingeAxis.lengthSq() < 0.001) {
    // Use previous frame's axis or a default plane
    hingeAxis.copy(this._lastHingeAxis[boneName] || new THREE.Vector3(1, 0, 0));
}
this._lastHingeAxis[boneName] = hingeAxis.clone();
---
Issue #11: Missing Active Motor System
Location: NOT IMPLEMENTED (Phase 3 in roadmap)
Problem: The ragdoll immediately goes limp. Real Euphoria-style systems have motors that apply torques to maintain target poses. Without motors:
- Character cannot resist falling
- No balance recovery
- No protective reflexes
From Roadmap:
> "  Pose Matching (Motors): Apply forces to pull particles towards animation targets."
Fix Required: Implement PhysicsMotor class:
class PhysicsMotor {
    constructor(particle, targetBone, strength) { ... }
    apply(dt) {
        const targetPos = this.targetBone.getWorldPosition(new THREE.Vector3());
        const force = targetPos.sub(this.particle.position).multiplyScalar(this.strength);
        this.particle.addForce(force);
    }
}
---
Issue #12: Mass-Weighted Constraint Resolution Missing
Location: RagdollPhysics.js:93-102
// Current: Equal split
if (!this.particleA.isPinned) {
    this.particleA.position.sub(correction);
}
if (!this.particleB.isPinned) {
    this.particleB.position.add(correction);
}
Problem: Both particles move equally regardless of mass. A 15kg hip and 0.5kg hand should not move the same amount. This causes:
- Light extremities to drag heavy core
- Unnatural weight distribution
- Constraint fights
Fix Required:
const invMassA = this.particleA.isPinned ? 0 : 1 / this.particleA.mass;
const invMassB = this.particleB.isPinned ? 0 : 1 / this.particleB.mass;
const totalInvMass = invMassA + invMassB;
if (totalInvMass > 0) {
    const ratioA = invMassA / totalInvMass;
    const ratioB = invMassB / totalInvMass;
    this.particleA.position.sub(correction.clone().multiplyScalar(ratioA));
    this.particleB.position.add(correction.clone().multiplyScalar(ratioB));
}
---
Priority Recommendations
Tier 1: Critical Fixes (Required for Basic Functionality)
| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Ground penetration (previousPosition fix) | Low | High |
| 2 | Mass-weighted constraints | Low | High |
| 3 | Fixed timestep sub-stepping | Medium | High |
| 4 | Increase solver iterations to 20 | Trivial | Medium |
Tier 2: Major Improvements (Proper Ragdoll Behavior)
| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 5 | Angular/hinge constraints | High | Critical |
| 6 | CCD or swept collision | Medium | High |
| 7 | Terrain normal support | Low | Medium |
| 8 | Bone sync quaternion stability | Medium | Medium |
Tier 3: Polish & Active Features (Euphoria-style)
| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 9 | Capsule colliders | High | Medium |
| 10 | Active motor system | High | High |
| 11 | Self-collision mass weighting | Low | Low |
| 12 | Final collision stabilization pass | Trivial | Low |
---
Conclusion
The current ragdoll implementation has a solid foundation (Verlet integration, distance constraints, skeleton mapping) but is fundamentally incomplete. The two most critical issues causing visible bugs are:
1. Ground penetration: The Verlet velocity (previousPosition) is not corrected during collision, causing immediate re-penetration.
2. Missing angular constraints: Without joint limits, limbs can rotate through each other and into impossible poses.
Fixing Tier 1 issues would take approximately 2-4 hours and would resolve the immediate visible bugs. A fully functional ragdoll system (Tier 1 + 2) would require approximately 2-3 days of focused development. The full Euphoria-style active ragdoll (Tier 3) is a 1-2 week project.