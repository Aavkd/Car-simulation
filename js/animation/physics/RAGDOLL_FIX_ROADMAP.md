# Ragdoll Physics Fix Roadmap

**Created:** 2026-01-16  
**Status:** 🟡 Phase 2 Complete (Kinematics Unified)  
**Issue:** Characters spin/backflip around center of gravity instead of stumbling/falling realistically

---

## Overview

This roadmap addresses the unrealistic spinning behavior in the ragdoll physics system. The fixes are organized into 4 phases, with each phase building on the previous one.

---

## Phase 1: Critical Fixes (P0)
**Estimated Time:** 1-2 hours  
**Goal:** Stop the immediate spinning/explosive behavior

### 1.1 Clamp Angular Momentum
- [x] **File:** `BalanceController.js`
- [x] **Location:** `applyForce()` method (lines 336-381)
- [x] **Task:** Add maximum angular momentum clamping after torque is added

```javascript
// After line 351, add:
const MAX_ANGULAR_MOMENTUM = 0.3;
if (this.angularMomentum.length() > MAX_ANGULAR_MOMENTUM) {
    this.angularMomentum.normalize().multiplyScalar(MAX_ANGULAR_MOMENTUM);
}
```

---

### 1.2 Fix Quaternion Mutation Bug
- [x] **File:** `ActiveRagdollController.js`
- [x] **Location:** `_applyStumble()` method (lines 326-440)
- [x] **Task:** Fix quaternion multiplication that mutates `invParent`

```javascript
// Line 369 - Change from:
const localSway = invParent.multiply(swayQuatWorld).multiply(parentQuatWorld);

// To:
const localSway = new THREE.Quaternion()
    .copy(invParent)
    .multiply(swayQuatWorld)
    .multiply(parentQuatWorld);
```

- [x] **Also fix in:** Lines 383-384 (spine sway) with same pattern
- [x] **Also fix in:** `_applyStagger()` method (lines 470-475)

---

### 1.3 Fix Same Bug in Balance Controller
- [x] **File:** `BalanceController.js`
- [x] **Location:** `_applyMomentum()` method (lines 280-328)
- [x] **Task:** Fix quaternion mutation on line 305

```javascript
// Line 305 - Change from:
const localDelta = invParent.multiply(rotQuatWorld).multiply(parentQuatWorld);

// To:
const localDelta = new THREE.Quaternion()
    .copy(invParent)
    .multiply(rotQuatWorld)
    .multiply(parentQuatWorld);
```

---

## Phase 2: Kinematic Unification (P1)
**Estimated Time:** 1 hour
**Goal:** Fix "Candy Wrapper" spinning by addressing update order latency

### 2.1 Calculate World Rotations First
- [x] **File:** `ActiveRagdollController.js`
- [x] **Task:** Implement `_calculateTargetWorldRotations` to pre-calculate physics targets in World Space for all bones before applying them to the scene graph.

### 2.2 Correct Local Math
- [x] **File:** `ActiveRagdollController.js`
- [x] **Location:** `_syncPhysicsToBones` / `_applySwingTwist`
- [x] **Task:** Use the pre-calculated *Parent World Rotation* (from 2.1) instead of `parent.getWorldQuaternion()` (which returns Frame N-1 state) when calculating child local rotations.

---

## Phase 3: Force Cascade Prevention (P1)
**Estimated Time:** 30 minutes  
**Goal:** Prevent force amplification loops

### 2.1 Remove Secondary Stagger Trigger
- [ ] **File:** `ActiveRagdollController.js`
- [ ] **Location:** `update()` method, 'normal' case (lines 631-643)
- [ ] **Task:** Remove or gate the secondary force application

```javascript
case 'normal':
    // REMOVED: Secondary stagger trigger that caused force cascade
    // The ImpactResponseSystem already handles categorization
    // Only track balance state for visual feedback, don't apply forces
    break;
```

---

### 2.2 Add Immunity After State Change
- [ ] **File:** `ActiveRagdollController.js`
- [ ] **Location:** `_handleStumble()` and `_handleStagger()` methods
- [ ] **Task:** Prevent state changes from triggering additional force applications

```javascript
// Add to class properties:
this.stateChangeImmunity = 0;

// In _handleStumble():
if (this.stateChangeImmunity > 0) return;
this.stateChangeImmunity = 0.2; // 200ms immunity

// In update():
if (this.stateChangeImmunity > 0) {
    this.stateChangeImmunity -= delta;
}
```

---

## Phase 4: Improved Damping (P1)
**Estimated Time:** 30 minutes  
**Goal:** Make rotation decay faster, especially when grounded

### 3.1 Grounded Detection for Damping
- [ ] **File:** `BalanceController.js`
- [ ] **Location:** `_applyMomentum()` method (lines 280-328)
- [ ] **Task:** Increase damping when character is grounded

```javascript
// Replace lines 324-327 with:
// Stronger decay when stable/grounded
const isGrounded = this.isStable && this.stabilityFactor > 0.5;
const decayMultiplier = isGrounded ? 8 : 3;
const decayRate = 1 - delta * decayMultiplier;
this.angularMomentum.multiplyScalar(Math.max(decayRate, 0));
this.linearMomentum.multiplyScalar(Math.max(decayRate, 0));
```

---

### 3.2 Add Minimum Threshold Cutoff
- [ ] **File:** `BalanceController.js`
- [ ] **Location:** `_applyMomentum()` method
- [ ] **Task:** Zero out momentum below threshold to prevent lingering spin

```javascript
// After decay, add:
if (this.angularMomentum.lengthSq() < 0.0001) {
    this.angularMomentum.set(0, 0, 0);
}
if (this.linearMomentum.lengthSq() < 0.0001) {
    this.linearMomentum.set(0, 0, 0);
}
```

---

## Phase 5: Physics Grounding (P2)
**Estimated Time:** 2-3 hours  
**Goal:** Make characters rotate around their feet, not center of mass

### 4.1 Implement Foot Locking in Physics
- [ ] **File:** `RagdollPhysics.js`
- [ ] **Location:** `update()` method (lines 94-159)
- [ ] **Task:** Lock foot particles when they touch ground

```javascript
// In the constraint solving loop, before collision:
this.particles.forEach(p => {
    if (p.isLocked) return;
    
    // Check if this is a foot particle
    const boneName = p.bone.name.toLowerCase();
    const isFoot = boneName.includes('foot') || boneName.includes('toe');
    
    if (isFoot) {
        const groundH = this.terrain ? 
            this.terrain.getHeightAt(p.position.x, p.position.z) : 0;
        
        // Lock foot when close to ground
        if (p.position.y <= groundH + p.radius + 0.5) {
            p.isLocked = true;
            p.position.y = groundH + p.radius;
        }
    }
});
```

---

### 4.2 Unlock Feet When Falling
- [ ] **File:** `RagdollPhysics.js`
- [ ] **Location:** New method
- [ ] **Task:** Unlock feet when character loses balance completely

```javascript
unlockAllParticles() {
    this.particles.forEach(p => {
        p.isLocked = false;
    });
}

// In ActiveRagdollController._handleFall():
this.physics.unlockAllParticles();
```

---

### 4.3 Add Friction-Based Y-Axis Rotation Resistance
- [ ] **File:** `BalanceController.js`
- [ ] **Location:** `_applyMomentum()` method
- [ ] **Task:** Apply stronger damping to Y-axis rotation (spin) when grounded

```javascript
// After calculating decayRate:
if (isGrounded) {
    // Extra damping on Y-axis to prevent spinning on the spot
    this.angularMomentum.y *= 0.5;
}
```

---

## Phase 6: ProceduralFall Typo Fix (P2)
**Estimated Time:** 5 minutes

### 5.1 Fix Variable Name Typo
- [ ] **File:** `ProceduralFallController.js`
- [ ] **Location:** `_applyFallingPhysics()` method (line 336)
- [ ] **Task:** Fix typo `propsPhysicsBlend` → `this.physicsBlend`

```javascript
// Line 336 - Change:
-this.propsPhysicsBlend * 0.2

// To:
-this.physicsBlend * 0.2
```

---

## Testing Checklist

After each phase, verify:

- [ ] **Stumble Test:** Apply force = 60 (just above stumbleThreshold) → Should take 1-2 recovery steps without spinning
- [ ] **Stagger Test:** Apply force = 160 → Should sway and struggle for ~1 second, no full rotation
- [ ] **Fall Test:** Apply force = 350 → Should fall in direction of force, arms brace
- [ ] **Knockdown Test:** Apply force = 650 → Immediate ragdoll, no explosive spin
- [ ] **Recovery Test:** After any impact, character should recover within 2 seconds
- [ ] **Direction Test:** Force from back should make character stumble forward, not spin

---

## Success Criteria

| Behavior | Before | After |
|----------|--------|-------|
| Light push | 360° spin | 1-2 step stumble |
| Medium hit | Multiple backflips | Stagger with arm balance |
| Heavy hit | Explosive launch | Controlled fall in force direction |
| Knockdown | Spinning ragdoll | Limp ragdoll, no spin |
| Recovery | Often fails | Consistent return to standing |

---

## Files Modified Summary

| File | Phase | Changes |
|------|-------|---------|
| `BalanceController.js` | 1, 3 | Momentum clamping, quaternion fix, grounded damping |
| `ActiveRagdollController.js` | 1, 2 | Quaternion fix, cascade prevention |
| `RagdollPhysics.js` | 4 | Foot locking system |
| `ProceduralFallController.js` | 5 | Typo fix |

---

## Notes

- Phase 1 fixes are **critical** and should be applied first
- Phase 2-3 can be done in parallel
- Phase 4 is more invasive but provides the most realistic behavior
- Test after each phase to ensure no regressions
