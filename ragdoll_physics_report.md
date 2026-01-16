# Ragdoll Physics Deep Dive Report
## Overview
This report analyzes the "Backflip" issue where the character behaves unrealistically (flips/flies) instead of stumbling or falling when a force is applied. The investigation covered `ActiveRagdollController.js`, `RagdollPhysics.js`, and `BalanceController.js`.
**Root Cause:** The primary cause of the "Backflip" is a combination of **Explosive Ground Collision Resolution** generating massive upward velocity, and **Velocity Loss** destroying natural momentum.
## Critical Issues Identified
### 1. Explosive Ground Collision (The "Pop")
**Location:** `RagdollPhysics.js` -> `_resolveGroundCollision` (lines 233-245)
**Analysis:**
When the ragdoll physics activates, the particle positions are set to the current bone positions via `matchAnimation()`. In many animation states (and especially idle/standing), the feet bones may be slightly below the ground plane (clipping).
Can happen if the collision radius is different from the visual mesh.
When `update()` runs for the first time:
1. `_resolveGroundCollision` detects the particle is below ground.
2. It hard-sets `p.position.y` to `groundHeight + radius`.
3. **CRITICAL ERROR:** It does NOT adjust `p.previousPosition`.
In Verlet integration, velocity is defined implicitly as `velocity = (position - previousPosition) / dt`.
By moving `position` up by e.g. 10cm without moving `previousPosition`, the system interprets this as the particle moving 10cm in one frame (0.016s).
`Velocity = 0.1m / 0.016s = 6.25 m/s` (approx 22 km/h) Upwards.
If the feet shoot up at 22 km/h and the head does not, the character backflips instantly.
**Recommendation:**
When resolving collision (especially the first time), `previousPosition` must be adjusted by the same delta as `position` to preserve velocity (or lack thereof), OR `matchAnimation` must ensure particles are spawned above ground.
### 2. Velocity Zeroing on Transition
**Location:** `RagdollPhysics.js` -> `matchAnimation` (lines 86-92)
**Analysis:**
```javascript
p.previousPosition.copy(p.position);
p.force.set(0, 0, 0);
```
This function sets `previousPosition` to exactly `position`, which mathematically defines **Zero Velocity**.
When the character is stumbling or moving, and then transitions to "Ragdoll" (Knockdown), this function is usually called right before the transition (in the previous frame's update loop).
This deletes all momentum. The "Force" applied by the impact is stored in `BalanceController`, but `RagdollPhysics` ignores it initially.
The physics simulation starts with a stationary character in mid-air/ground.
**Recommendation:**
`matchAnimation` should calculate the velocity of the bone from the previous frame to the current frame and set `previousPosition` to `position - (velocity * dt)`. This ensures the ragdoll inherits the character's motion.
### 3. Balance Control Torque Accumulation
**Location:** `BalanceController.js` -> `applyForce` and `_applyMomentum`
**Analysis:**
When a force is applied, `BalanceController` adds artificial angular momentum:
```javascript
this.angularMomentum.addScaledVector(torqueDir, magnitude * 0.025);
```
For a knockdown force (600N), this is `15` units of angular momentum.
In `update`, this applies a rotation of `15 * dt` radians per frame.
`15 * 0.016 = 0.24` radians (~13 degrees) per frame.
This is a very fast spin. While `ActiveRagdollController` overwrites this during full ragdoll (`physicsBlend = 1.0`), during the transition frames or "stumble" state, this generates a massive rotational impulse that can look like a flip start.
**Recommendation:**
Refine torque calculation to use physical lever arms (Cross product of Force vs Center of Mass) rather than arbitrary scalars, and clamp the maximum angular velocity.
### 4. Root Anchoring Propagation
**Location:** `ActiveRagdollController.js` -> `_syncPhysicsToBones`
**Analysis:**
```javascript
if (blendWeight > 0.5) {
    this.mesh.position.x = hipsParticle.x;
    this.mesh.position.z = hipsParticle.z;
    // ...
}
```
If Issue #1 (Explosive Collision) causes the hips particle to fly (because the legs push it up), this code forces the entire visual mesh to follow it. This confirms why the visual result is a backflip/flying character.
## Proposed Fix Plan
1.  **Fix `RagdollPhysics._resolveGroundCollision`**: Modify it to adjust `previousPosition` when snapping out of the ground to prevent velocity generation.
2.  **Fix `RagdollPhysics.matchAnimation`**: Implement velocity inheritance.
3.  **Refine `BalanceController`**: Tune the torque scaler or limit the maximum angular momentum impact.
This plan addresses the root causes of the unrealistic physics behavior.

## Update: Phase 1 Findings & Residual Spin
**Date:** 2026-01-16
**Status:** Phase 1 fixes applied. Explosive backflips absent. "Candy Wrapper" spinning persists.

### New Critical Issue: Hierarchical Update Latency
**Problem:**
The user reports the character still spins (though less). Investigation into `ActiveRagdollController._syncPhysicsToBones` reveals a **Dependency Order** issue.

1. The method iterates through bone groups to calculate rotations.
2. Ideally, it defines: `ChildRotation = PhysicsTarget wrt Parent`.
3. It calculates this using `parent.getWorldQuaternion()`.
4. **CRITICAL FLAW:** `getWorldQuaternion()` returns the rotation from the **Previous Frame** (or Animation state), NOT the physics rotation we are currently calculating for the parent in this loop.

**Example:**
- Frame 1: Hips rotate 90° Right (Physics).
- Code calculates Hips Rotation -> Queues it.
- Code calculates Spine Rotation. It asks for Hips rotation to determine "Local Up".
- It gets Frame 0 Hips Rotation (Straight).
- It sets Spine to "Straight" relative to "Straight Hips".
- Renderer applies Hips (90°) then Spine (Straight).
- Result: Spine is 90° Right.
- Physics Reality: Spine should be Straight (0°) in World Space.

This mismatch creates a frame-by-frame accumulating error where limbs inherit rotations from parents that they physically shouldn't, appearing as a "Spin" or "Twist" deformation.

**Phase 2 Plan (World Space Unification):**
1. **Calculate World Rotations First:** Compute the target World Rotation for every physics-driven bone.
2. **Apply Hierarchically:** Iterate through the hierarchy (Hips -> Spine -> Head).
3. **Correct Local Math:** Calculate local rotation using the *Parent's New World Rotation* (calculated in step 1), not the outdated scene graph state.

`NewLocalChild = Inv(NewWorldParent) * NewWorldChild`

This will eliminate the kinematic spinning/deformation.
