---
# Ragdoll System Fix - Implementation Plan
## Overview
| Attribute | Value |
|-----------|-------|
| **Scope** | Tier 1 (Critical Fixes) + Tier 2 (Major Improvements) |
| **Estimated Time** | 2-3 days |
| **Files Modified** | 3 existing + 1 new |
| **Files Created** | 1 (`PhysicsAngularConstraint.js`) |
| **Breaking Changes** | None - backward compatible |
---

## Phase 1: Critical Core Fixes (Day 1, ~4 hours)

### 1.1 Fix Ground Penetration Velocity Bug

**File:** `js/animation/physics/RagdollPhysics.js`  
**Function:** `resolveCollisions()`  
**Lines:** ~216-243
**Current Problem:**
```javascript
// BUG: Only corrects position.y, leaving previousPosition with downward velocity
particle.position.y += depth;
```

**Required Change:**
```javascript
// Fix: Correct BOTH positions to zero vertical velocity
particle.position.y = groundY + particle.radius;
particle.previousPosition.y = particle.position.y; // Zero out Y velocity

// Apply ground friction to horizontal velocity only
const velocityX = particle.position.x - particle.previousPosition.x;
const velocityZ = particle.position.z - particle.previousPosition.z;
particle.previousPosition.x = particle.position.x - velocityX * this.groundFriction;
particle.previousPosition.z = particle.position.z - velocityZ * this.groundFriction;
```

**Acceptance Test:** Particle dropped from height should settle at `groundY + radius` without bouncing through.

---

### 1.2 Implement Mass-Weighted Constraint Resolution

**File:** `js/animation/physics/RagdollPhysics.js`  
**Class:** `PhysicsConstraint`  
**Function:** `resolve()`  
**Lines:** ~79-103
**Current Problem:**
```javascript
// Equal split regardless of mass
this.particleA.position.sub(correction);
this.particleB.position.add(correction);
```

**Required Change:**
```javascript
resolve() {
    const delta = new THREE.Vector3().subVectors(this.particleA.position, this.particleB.position);
    const distance = delta.length();
    if (distance === 0) return;
    const difference = (distance - this.restDistance) / distance;
    
    // Inverse mass weighting
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
```

**Acceptance Test:** Hips (15kg) should barely move when hand (0.5kg) is pulled.

---

### 1.3 Implement Fixed Timestep Sub-stepping

**File:** `js/animation/physics/RagdollPhysics.js`  
**Class:** `RagdollPhysics`  
**Function:** `update(dt)` → `step(fixedDt)` + `update(dt)`  
**Lines:** ~131-150
Required Change:
constructor() {
    // ... existing code ...
    this.accumulator = 0;
    this.fixedDeltaTime = 1 / 60; // 60 Hz physics
    this.maxSubSteps = 8; // Prevent spiral of death
}
update(dt) {
    this.accumulator += dt;
    let steps = 0;
    
    while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSubSteps) {
        this._step(this.fixedDeltaTime);
        this.accumulator -= this.fixedDeltaTime;
        steps++;
    }
}
_step(dt) {
    // 1. Integration
    for (const particle of this.particles) {
        particle.update(dt, this.friction, this.gravity);
    }
    
    // 2. Constraint Solving
    for (let i = 0; i < this.solverIterations; i++) {
        for (const constraint of this.constraints) {
            constraint.resolve();
        }
        this.resolveCollisions();
        this.resolveSelfCollisions();
    }
    
    // 3. Final collision pass (prevents residual penetration)
    this.resolveCollisions();
}
Acceptance Test: High-velocity impacts should not tunnel through ground.
---
1.4 Increase Solver Iterations
File: js/animation/physics/RagdollConfig.js
Lines: ~15
Change:
solverIterations: 20,  // Was 10
---
1.5 Mass-Weight Self-Collision Resolution
File: js/animation/physics/RagdollPhysics.js
Function: resolveSelfCollisions()
Lines: ~152-192
Required Change:
if (distSq < minDist * minDist && distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    const overlap = minDist - dist;
    
    // Inverse mass weighting
    const invMassA = pA.isPinned ? 0 : 1 / pA.mass;
    const invMassB = pB.isPinned ? 0 : 1 / pB.mass;
    const totalInvMass = invMassA + invMassB;
    
    if (totalInvMass === 0) continue;
    
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
---

### Phase 1 Success Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| P1-SC1 | **No Ground Tunneling** | Drop particle from Y=50 with dt=0.1s (simulating lag spike) | Particle settles at `groundY + radius`, never goes below ground |
| P1-SC2 | **Velocity Zeroed on Impact** | After ground collision, measure `position.y - previousPosition.y` | Value is 0 or positive (no residual downward velocity) |
| P1-SC3 | **Mass Ratio Respected** | Pull hand (0.5kg) away from hips (15kg) by 1 unit | Hips move < 0.04 units, hand moves > 0.96 units |
| P1-SC4 | **Fixed Timestep Stability** | Run physics with dt=0.5s (30fps drop) | No explosions, constraints hold, max 8 sub-steps taken |
| P1-SC5 | **Self-Collision Mass Weighting** | Collide head (3kg) with hand (0.5kg) | Hand pushed 6x further than head |
| P1-SC6 | **Constraint Stretch < 5%** | After 60 frames of simulation | All distance constraints within 5% of rest length |

**Visual Validation:**
- [ ] Character falls and settles on ground without bouncing through
- [ ] Heavy body parts (hips, torso) remain stable when extremities move
- [ ] No visible jitter or vibration when ragdoll is at rest

---

## Phase 2: Anatomical Angular Constraints (Day 1-2, ~6 hours)
2.1 Create Angular Constraint Class
New File: js/animation/physics/PhysicsAngularConstraint.js
This is the most complex addition. We need a constraint that limits rotation between three particles (defining two bone segments).
Implementation:
import * as THREE from 'three';
/**
 * Angular constraint using swing-twist decomposition for anatomical joint limits.
 * 
 * Joint Model:
 * - Swing: Rotation around axes perpendicular to the bone (like a ball-socket)
 * - Twist: Rotation around the bone axis itself (like supination/pronation)
 * 
 * Constraint Chain: parent → pivot → child
 * Example: UpperArm → Elbow → Forearm
 */
export class PhysicsAngularConstraint {
    /**
     * @param {PhysicsParticle} parent - Parent bone end (e.g., shoulder)
     * @param {PhysicsParticle} pivot - Joint particle (e.g., elbow)
     * @param {PhysicsParticle} child - Child bone end (e.g., wrist)
     * @param {Object} limits - Joint limit configuration
     */
    constructor(parent, pivot, child, limits = {}) {
        this.parent = parent;
        this.pivot = pivot;
        this.child = child;
        
        // Swing limits (cone angle from parent axis)
        this.swingMin = limits.swingMin ?? -Math.PI / 4;   // -45°
        this.swingMax = limits.swingMax ?? Math.PI / 4;     // +45°
        
        // Twist limits (rotation around bone axis)
        this.twistMin = limits.twistMin ?? -Math.PI / 6;   // -30°
        this.twistMax = limits.twistMax ?? Math.PI / 6;     // +30°
        
        // Stiffness of angular correction (0-1)
        this.stiffness = limits.stiffness ?? 0.8;
        
        // Joint type hint for asymmetric limits
        this.type = limits.type ?? 'ball'; // 'ball', 'hinge', 'saddle'
    }
    
    resolve() {
        // 1. Calculate bone directions
        const parentToPivot = new THREE.Vector3()
            .subVectors(this.pivot.position, this.parent.position)
            .normalize();
        const pivotToChild = new THREE.Vector3()
            .subVectors(this.child.position, this.pivot.position)
            .normalize();
        
        // 2. Calculate current angle between bones
        const dot = parentToPivot.dot(pivotToChild);
        const currentAngle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
        
        // 3. Check swing limits
        // For a hinge joint (elbow/knee), we want angle in [0, ~150°]
        // For a ball joint (shoulder/hip), we allow more range
        
        let targetAngle = currentAngle;
        let needsCorrection = false;
        
        if (this.type === 'hinge') {
            // Hinge joints have asymmetric limits
            // Elbow: 0° (straight) to ~150° (flexed)
            // Knee: ~-5° (slight hyperextension) to ~150° (flexed)
            const minAngle = Math.PI - this.swingMax; // Convert to angle between bones
            const maxAngle = Math.PI - this.swingMin;
            
            if (currentAngle < minAngle) {
                targetAngle = minAngle;
                needsCorrection = true;
            } else if (currentAngle > maxAngle) {
                targetAngle = maxAngle;
                needsCorrection = true;
            }
        } else {
            // Ball/saddle joints - symmetric cone
            const maxDeviation = this.swingMax;
            const deviation = Math.PI - currentAngle; // Angle from straight
            
            if (deviation > maxDeviation) {
                targetAngle = Math.PI - maxDeviation;
                needsCorrection = true;
            }
        }
        
        // 4. Apply correction if needed
        if (needsCorrection) {
            this._applySwingCorrection(parentToPivot, pivotToChild, currentAngle, targetAngle);
        }
        
        // 5. Apply twist limits (rotation around pivot-to-child axis)
        // Note: Twist is harder to detect with just positions. 
        // We'd need to track a reference vector perpendicular to the bone.
        // For now, we skip explicit twist and rely on distance constraints.
    }
    
    _applySwingCorrection(parentDir, childDir, currentAngle, targetAngle) {
        // Calculate the rotation axis (perpendicular to both bones)
        const axis = new THREE.Vector3().crossVectors(parentDir, childDir);
        
        if (axis.lengthSq() < 0.0001) {
            // Bones are collinear, pick arbitrary perpendicular axis
            axis.set(1, 0, 0);
            if (Math.abs(parentDir.dot(axis)) > 0.9) {
                axis.set(0, 1, 0);
            }
            axis.cross(parentDir).normalize();
        } else {
            axis.normalize();
        }
        
        // Calculate correction angle
        const correction = (targetAngle - currentAngle) * this.stiffness;
        
        // Rotate child position around pivot
        const pivotToChild = new THREE.Vector3()
            .subVectors(this.child.position, this.pivot.position);
        const childDist = pivotToChild.length();
        
        // Apply rotation
        const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, correction);
        pivotToChild.applyQuaternion(rotationQuat);
        
        // Move child (only if not pinned)
        if (!this.child.isPinned) {
            this.child.position.copy(this.pivot.position).add(
                pivotToChild.normalize().multiplyScalar(childDist)
            );
        }
    }
}
---
2.2 Define Anatomical Joint Limits
File: js/animation/physics/RagdollConfig.js
New Section:
// ==================== JOINT LIMITS ====================
// Anatomical swing-twist limits per joint type
joints: {
    // Spine joints - limited flexion/extension, moderate twist
    spine: {
        type: 'ball',
        swingMin: -Math.PI / 6,    // -30° (back extension)
        swingMax: Math.PI / 4,      // +45° (forward flexion)
        twistMin: -Math.PI / 6,
        twistMax: Math.PI / 6,
        stiffness: 0.9
    },
    
    // Neck - more mobile than spine
    neck: {
        type: 'ball',
        swingMin: -Math.PI / 4,     // -45°
        swingMax: Math.PI / 3,      // +60°
        twistMin: -Math.PI / 3,
        twistMax: Math.PI / 3,
        stiffness: 0.8
    },
    
    // Shoulder - high mobility ball joint
    shoulder: {
        type: 'ball',
        swingMin: -Math.PI / 2,     // -90° (arm behind)
        swingMax: Math.PI * 0.8,    // +144° (arm overhead)
        twistMin: -Math.PI / 2,     // Internal rotation
        twistMax: Math.PI / 2,      // External rotation
        stiffness: 0.7
    },
    
    // Elbow - hinge joint, no hyperextension
    elbow: {
        type: 'hinge',
        swingMin: 0,                // No hyperextension
        swingMax: Math.PI * 0.85,   // ~150° flexion
        twistMin: 0,
        twistMax: 0,
        stiffness: 0.95
    },
    
    // Wrist - limited ball joint
    wrist: {
        type: 'ball',
        swingMin: -Math.PI / 4,
        swingMax: Math.PI / 3,
        twistMin: -Math.PI / 2,     // Pronation
        twistMax: Math.PI / 2,      // Supination
        stiffness: 0.8
    },
    
    // Hip - ball joint with anatomical limits
    hip: {
        type: 'ball',
        swingMin: -Math.PI / 6,     // -30° extension (leg back)
        swingMax: Math.PI * 0.6,    // +108° flexion (leg forward)
        twistMin: -Math.PI / 4,     // Internal rotation
        twistMax: Math.PI / 3,      // External rotation
        stiffness: 0.85
    },
    
    // Knee - hinge joint, slight hyperextension allowed
    knee: {
        type: 'hinge',
        swingMin: -Math.PI / 36,    // -5° slight hyperextension
        swingMax: Math.PI * 0.8,    // ~144° flexion
        twistMin: 0,
        twistMax: 0,
        stiffness: 0.95
    },
    
    // Ankle - limited ball joint
    ankle: {
        type: 'ball',
        swingMin: -Math.PI / 6,     // Plantarflexion
        swingMax: Math.PI / 4,      // Dorsiflexion
        twistMin: -Math.PI / 6,
        twistMax: Math.PI / 6,
        stiffness: 0.8
    }
}
---
2.3 Integrate Angular Constraints into Controller
File: js/animation/physics/ActiveRagdollController.js
Changes Required:
1. Import the new class:
import { PhysicsAngularConstraint } from './PhysicsAngularConstraint.js';
2. Add storage for angular constraints:
constructor(mesh, terrain = null) {
    // ... existing code ...
    this.angularConstraints = [];
}
3. Create angular constraints in _initRagdoll():
_initRagdoll() {
    // ... existing particle and distance constraint creation ...
    
    // 3. Create Angular Constraints
    this._createAngularConstraints();
}
_createAngularConstraints() {
    const cfg = RagdollConfig.joints;
    
    // Helper to get particle by bone name
    const p = (name) => this.boneParticles.get(name)?.particle;
    
    // Spine chain
    this._addAngular(p('hips'), p('spine'), p('spine1'), cfg.spine);
    this._addAngular(p('spine'), p('spine1'), p('spine2'), cfg.spine);
    this._addAngular(p('spine1'), p('spine2'), p('head'), cfg.neck);
    
    // Left Arm
    this._addAngular(p('spine2'), p('leftArm'), p('leftForearm'), cfg.shoulder);
    this._addAngular(p('leftArm'), p('leftForearm'), p('leftHand'), cfg.elbow);
    
    // Right Arm
    this._addAngular(p('spine2'), p('rightArm'), p('rightForearm'), cfg.shoulder);
    this._addAngular(p('rightArm'), p('rightForearm'), p('rightHand'), cfg.elbow);
    
    // Left Leg
    this._addAngular(p('hips'), p('leftUpLeg'), p('leftLeg'), cfg.hip);
    this._addAngular(p('leftUpLeg'), p('leftLeg'), p('leftFoot'), cfg.knee);
    
    // Right Leg
    this._addAngular(p('hips'), p('rightUpLeg'), p('rightLeg'), cfg.hip);
    this._addAngular(p('rightUpLeg'), p('rightLeg'), p('rightFoot'), cfg.knee);
    
    console.log(`[ActiveRagdollController] Created  angular constraints`);
}
_addAngular(parent, pivot, child, limits) {
    if (parent && pivot && child) {
        this.angularConstraints.push(
            new PhysicsAngularConstraint(parent, pivot, child, limits)
        );
    }
}
4. Add angular constraint solving to RagdollPhysics.update():
File: js/animation/physics/RagdollPhysics.js
constructor() {
    // ... existing ...
    this.angularConstraints = []; // Reference from controller
}
_step(dt) {
    // 1. Integration
    for (const particle of this.particles) {
        particle.update(dt, this.friction, this.gravity);
    }
    
    // 2. Constraint Solving
    for (let i = 0; i < this.solverIterations; i++) {
        // Distance constraints first
        for (const constraint of this.constraints) {
            constraint.resolve();
        }
        
        // Angular constraints (joint limits)
        for (const angular of this.angularConstraints) {
            angular.resolve();
        }
        
        // Collisions last
        this.resolveCollisions();
        this.resolveSelfCollisions();
    }
    
    // 3. Final collision pass
    this.resolveCollisions();
}
---

### Phase 2 Success Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| P2-SC1 | **Knee No Hyperextension** | Apply forward force to shin while thigh is fixed | Knee angle never exceeds 175° (5° hyperextension max) |
| P2-SC2 | **Elbow No Hyperextension** | Pull hand backward past straight arm | Elbow stops at 180° (straight), does not bend backward |
| P2-SC3 | **Elbow Flexion Limit** | Push hand toward shoulder | Elbow stops at ~30° (150° flexion), forearm doesn't clip through upper arm |
| P2-SC4 | **Hip Range of Motion** | Swing leg forward and backward | Forward: stops at ~108°, Backward: stops at ~30° |
| P2-SC5 | **Spine Flexibility** | Apply torque to rotate torso | Each spine segment limits to ±30-45° from parent |
| P2-SC6 | **Angular Constraint Class Exists** | Import test | `PhysicsAngularConstraint` class can be instantiated |
| P2-SC7 | **Joint Config Loaded** | Check `RagdollConfig.joints` | All 8 joint types defined (spine, neck, shoulder, elbow, wrist, hip, knee, ankle) |
| P2-SC8 | **Constraints Created** | Log count after init | 10+ angular constraints created for full humanoid |

**Visual Validation:**
- [ ] Knees bend naturally (forward only, like real knees)
- [ ] Elbows bend naturally (inward only, like real elbows)  
- [ ] Spine curves smoothly, no sharp kinks or 90° angles
- [ ] Limbs never rotate through each other
- [ ] Falling character lands in anatomically plausible poses

---

## Phase 3: Terrain & Stability Improvements (Day 2, ~3 hours)
3.1 Add Terrain Normal Support
File: js/animation/physics/RagdollPhysics.js
Function: resolveCollisions()
Required Change:
resolveCollisions() {
    for (const particle of this.particles) {
        let groundY = 0;
        let groundNormal = new THREE.Vector3(0, 1, 0); // Default up
        
        if (this.terrain) {
            groundY = this.terrain.getHeightAt(particle.position.x, particle.position.z);
            
            // Get terrain normal if available
            if (typeof this.terrain.getNormalAt === 'function') {
                groundNormal = this.terrain.getNormalAt(
                    particle.position.x, 
                    particle.position.z
                );
            }
        }
        
        // Calculate penetration along terrain normal
        const surfacePoint = new THREE.Vector3(
            particle.position.x,
            groundY,
            particle.position.z
        );
        const toParticle = new THREE.Vector3()
            .subVectors(particle.position, surfacePoint);
        const signedDistance = toParticle.dot(groundNormal);
        
        if (signedDistance < particle.radius) {
            const penetration = particle.radius - signedDistance;
            
            // Project out along normal
            particle.position.add(
                groundNormal.clone().multiplyScalar(penetration)
            );
            
            // Zero velocity in normal direction
            const velocity = new THREE.Vector3()
                .subVectors(particle.position, particle.previousPosition);
            const normalVelocity = velocity.dot(groundNormal);
            
            if (normalVelocity < 0) {
                // Moving into ground - remove that component
                particle.previousPosition.add(
                    groundNormal.clone().multiplyScalar(normalVelocity)
                );
            }
            
            // Apply tangential friction
            const tangentVelocity = velocity.sub(
                groundNormal.clone().multiplyScalar(normalVelocity)
            );
            particle.previousPosition.add(
                tangentVelocity.multiplyScalar(1 - this.groundFriction)
            );
        }
    }
}
---
3.2 Fix Bone Sync Quaternion Stability
File: js/animation/physics/ActiveRagdollController.js
Function: _aimBone()
Add caching for hinge axes:
constructor(mesh, terrain = null) {
    // ... existing ...
    this._lastHingeAxes = new Map(); // Cache for stable hinge axes
}
_aimBone(boneName, targetName, poleTargetName = null) {
    // ... existing code until hinge axis calculation ...
    
    if (poleTargetName) {
        const poleItem = this.boneParticles.get(poleTargetName);
        if (poleItem) {
            const polePos = poleItem.particle.position;
            const secondaryVec = new THREE.Vector3()
                .subVectors(polePos, targetPos).normalize();
            
            let hingeAxis = new THREE.Vector3()
                .crossVectors(primaryAxis, secondaryVec);
            
            // FIX: Handle degenerate case (straight limb)
            if (hingeAxis.lengthSq() < 0.001) {
                // Use cached axis or compute perpendicular
                const cached = this._lastHingeAxes.get(boneName);
                if (cached) {
                    hingeAxis.copy(cached);
                } else {
                    // Generate stable perpendicular
                    hingeAxis.set(1, 0, 0);
                    if (Math.abs(primaryAxis.x) > 0.9) {
                        hingeAxis.set(0, 0, 1);
                    }
                    hingeAxis.cross(primaryAxis).normalize();
                }
            } else {
                hingeAxis.normalize();
                // Cache for next frame
                this._lastHingeAxes.set(boneName, hingeAxis.clone());
            }
            
            // ... rest of rotation calculation ...
        }
    }
}
---
3.3 Optimize areConnected() with Adjacency Cache
File: js/animation/physics/RagdollPhysics.js
Add neighbor cache:
constructor() {
    // ... existing ...
    this._neighborCache = new Map(); // particle -> Set of neighbors
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
areConnected(pA, pB) {
    // O(1) lookup instead of O(constraints)
    const neighbors = this._neighborCache.get(pA);
    return neighbors ? neighbors.has(pB) : false;
}
---

### Phase 3 Success Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| P3-SC1 | **Slope Collision Works** | Drop ragdoll on 45° slope | Character slides down slope, no limbs clip through hillside |
| P3-SC2 | **Normal-Based Projection** | Particle on slope with normal (0.7, 0.7, 0) | Particle pushed along slope normal, not just +Y |
| P3-SC3 | **Terrain Normal API Used** | Check for `getNormalAt` call | Function called when terrain supports it |
| P3-SC4 | **No NaN Quaternions** | Straighten limb to 180° (collinear bones) | No NaN in bone quaternions, rotation remains stable |
| P3-SC5 | **Hinge Axis Caching** | Animate limb from bent to straight and back | Smooth rotation, no sudden flips or 180° jumps |
| P3-SC6 | **Neighbor Cache O(1)** | Call `areConnected()` 1000 times | Completes in < 1ms (vs ~10ms without cache) |
| P3-SC7 | **Cache Accuracy** | Compare cache vs brute-force for all pairs | 100% match |

**Visual Validation:**
- [ ] Character lands correctly on hillsides and ramps
- [ ] No limb clipping through sloped terrain
- [ ] Smooth bone rotations when limbs are nearly straight
- [ ] No visual glitches or sudden bone snapping

---

## Phase 4: Testing & Validation (Day 3, ~2 hours)
4.1 Update Node.js Verification Script
File: tests/ragdoll_verify.mjs
Add tests for:
1. Ground penetration prevention
2. Mass-weighted constraints
3. Angular constraint limits
4. Sub-stepping stability
### 4.2 Update Browser Test
**File:** `tests/ragdoll_phase1_test.html`
Add visual tests for:
1. Knee hyperextension prevention
2. Elbow bend limits
3. Spine flexibility
4. Fall on sloped terrain

---

### Phase 4 Success Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| P4-SC1 | **Node.js Tests Pass** | Run `node tests/ragdoll_verify.mjs` | Exit code 0, all assertions pass |
| P4-SC2 | **Browser Tests Pass** | Open `tests/ragdoll_phase1_test.html` | All test indicators show green/PASS |
| P4-SC3 | **No Console Errors** | Enable ragdoll in browser, check console | Zero errors, warnings acceptable |
| P4-SC4 | **Performance Target** | Enable ragdoll, measure FPS | Maintains > 55 FPS with single ragdoll active |
| P4-SC5 | **Multi-Ragdoll Performance** | Spawn 5 ragdolls simultaneously | Maintains > 45 FPS |
| P4-SC6 | **Test Coverage** | Count test assertions | Minimum 15 test cases across all files |

**Integration Validation:**
- [ ] `node tests/ragdoll_verify.mjs` exits with code 0
- [ ] `tests/ragdoll_phase1_test.html` shows all green
- [ ] `tests/ragdoll_phase2_test.html` shows all green  
- [ ] In-game: Player can trigger ragdoll via impact and settles naturally
- [ ] In-game: NPC ragdolls work identically to player

---

## Overall Project Success Criteria

### Minimum Viable (Must Pass)
| Criterion | Description |
|-----------|-------------|
| **No Ground Clipping** | Limbs never go below terrain surface |
| **No Self-Intersection** | Limbs never pass through each other |
| **Anatomical Poses** | Joints stay within human range of motion |
| **Stable Settling** | Ragdoll comes to rest without jitter |

### Target (Should Pass)  
| Criterion | Description |
|-----------|-------------|
| **Slope Handling** | Works correctly on non-flat terrain |
| **Performance** | > 55 FPS with active ragdoll |
| **Mass Realism** | Heavy parts move less than light parts |

### Stretch (Nice to Have)
| Criterion | Description |
|-----------|-------------|
| **Multi-Ragdoll** | 5+ simultaneous ragdolls at > 45 FPS |
| **Zero Warnings** | No console warnings during normal use |

---
Summary: Files Changed
| File | Action | Changes |
|------|--------|---------|
| js/animation/physics/RagdollPhysics.js | Modify | Ground fix, mass weighting, sub-stepping, neighbor cache, angular constraint integration |
| js/animation/physics/RagdollConfig.js | Modify | Increase solver iterations, add joint limits config |
| js/animation/physics/ActiveRagdollController.js | Modify | Angular constraint creation, hinge axis caching |
| js/animation/physics/PhysicsAngularConstraint.js | Create | New anatomical swing-twist constraint class |
| tests/ragdoll_verify.mjs | Modify | Add new test cases |
---
Execution Order
Phase 1 (Day 1 Morning)
├── 1.1 Fix ground penetration velocity
├── 1.2 Mass-weighted distance constraints  
├── 1.3 Fixed timestep sub-stepping
├── 1.4 Increase solver iterations
└── 1.5 Mass-weighted self-collision
Phase 2 (Day 1 Afternoon - Day 2 Morning)
├── 2.1 Create PhysicsAngularConstraint class
├── 2.2 Define anatomical joint limits in config
└── 2.3 Integrate into controller and physics engine
Phase 3 (Day 2 Afternoon)
├── 3.1 Terrain normal support
├── 3.2 Bone sync quaternion stability
└── 3.3 Neighbor cache optimization
Phase 4 (Day 3)
├── 4.1 Update Node.js tests
└── 4.2 Update browser tests
---
Risk Assessment
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Angular constraints too stiff | Medium | Expose stiffness in config for tuning |
| Performance regression | Low | Neighbor cache + limited iterations |
| Quaternion NaN propagation | Low | Fallback to cached/computed stable axes |
| Joint limits conflict with distance constraints | Medium | Process distance before angular in solver |

---

## Quick Reference Checklist

### Before Starting Implementation
- [ ] Read through all phases and understand dependencies
- [ ] Verify access to all files listed in "Files Changed" table
- [ ] Run existing tests to establish baseline: `node tests/ragdoll_verify.mjs`

### After Each Phase
- [ ] **Phase 1 Complete:** Run ground penetration test, verify no tunneling
- [ ] **Phase 2 Complete:** Check knee/elbow limits visually in browser
- [ ] **Phase 3 Complete:** Test on sloped terrain, verify no NaN errors
- [ ] **Phase 4 Complete:** All automated tests pass

### Final Sign-Off
- [ ] All Phase Success Criteria tables have passing entries
- [ ] Visual validation checkboxes all checked
- [ ] Performance benchmarks met (> 55 FPS)
- [ ] No console errors in production use

---


