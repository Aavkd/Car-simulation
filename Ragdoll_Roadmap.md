# Ragdoll System Roadmap (Redesign)

## Goal
Create a robust **Active Ragdoll** system for Player and NPCs where applying force causes the character to react physically and fall realistically ("True Ragdoll"). The system must support:
- **Real-time Physics**: Reaction to impacts and gravity.
- **Active Balancing**: Characters try to maintain balance before falling.
- **Pure Physical Reactions**: No canned stumble animations; reactions are procedural.
- **Seamless Integration**: Works with existing `SkeletonRegistry` and `RagdollTestPanel`.

## Architecture Overview

### 1. **Physics Engine (`RagdollPhysics.js`)**
A custom lightweight **Verlet Integration** physics engine.
- **Particles**: Point masses corresponding to bones.
- **Constraints**: Distance constraints to enforce skeleton shape.
- **Collision**: Capsule/sphere collision with ground.
- **Solver**: Iterative constraint solver for stability.

### 2. **Controller (`ActiveRagdollController.js`)**
The brain of the system, bridging Animation and Physics.
- **Kinematic Inputs**: Reads current animation pose to set "target" poses for physics.
- **Motors**: Applies forces to particles to match animation targets (Simulated Muscles).
- **State Machine**:
    - `STANDING`: Fully kinematic/animated, but tracking physics balance.
    - `PHYSICAL_REACTION`: **Pure physics.** Motors fight to maintain upright posture against external forces. Legs may stiffen or adjust, but no baked "stumble" clips are played.
    - `FALLING`: Full physics simulation with procedural overlays (bracing).
    - `RAGDOLL`: **Test Mode / Dead**. Zero motor strength, fully limp physics.
    - `RECOVERING`: Blending back from physics pose to animation "Get Up" clip.

### 3. **Registry (`SkeletonRegistry.js`)**
*Existing & Ready.*
- Scans bone hierarchy.
- Standardizes bone names.

### 4. **Configuration (`RagdollConfig.js`)**
*Existing & Ready.*
- Tunable parameters.

## Implementation Phases

### Phase 1: Core Physics Engine (The Foundation)
**Objective**: Get a simple particle system falling and colliding with the ground.
- [x] **Create `RagdollPhysics.js`**:
    - `PhysicsParticle` (pos, oldPos, mass, radius).
    - `PhysicsConstraint` (restDistance, stiffness).
    - `update(dt)`: Verlet integration.
    - `resolveCollisions()`: Ground plane at $y=0$ (or terrain height).

#### Acceptance Criteria
- [x] A standalone test (or console log check) confirms particles accelerate down with gravity.
- [x] Particles stop when hitting $y=0$ (Ground).
- [x] Multiple particles connected by constraints maintain their distance while moving.
- [x] **CRITICAL BUG**: Physics currently hardcodes ground at Y=0. Does not account for Terrain Height. **FIXED.**

### Phase 2: The Ragdoll Rig
**Objective**: Map the character skeleton to the physics system.
- [x] **Create `ActiveRagdollController.js`**:
    - **Initialization**: Use `SkeletonRegistry`.
    - **Ragdoll Building**: Create particles for Hips, Spine, Head, Arms, Legs.
    - **Constraint Generation**: Auto-generate constraints.
    - **Ragdoll Mode**: Implement key toggle for `RAGDOLL` state (limp) to test the rig.

#### Acceptance Criteria
- [x] Enabling "Ragdoll Mode" causes the character mesh to collapse instantly to the floor.
- [x] The collapsed mesh looks like a human pile (limbs attached), not a chaotic explosion of polygons.
- [x] Debug Visualization draws lines connecting the physics particles, matching the skeleton.

### Phase 3: Active Physics & Procedural Balance
**Objective**: Make the ragdoll "stand" and resist forces physically.
- [ ] **Pose Matching (Motors)**:
    - Apply forces to pull particles towards animation targets.
- [ ] **Physics Reaction (No Animation)**:
    - When pushed, instead of playing a clip, the system transitions to `PHYSICAL_REACTION`.
    - Increase motor stiffness in legs/spine to resist falling.
    - Calculates Center of Mass (COM) vs Support Base.
- [ ] **Swing/Twist Limits**: Prevent unnatural limb rotation.

#### Acceptance Criteria
- [ ] Character remains standing upright while physics simulation is running (Motors active).
- [ ] Applying a small force causes the character to sway/lean and physically return to upright without snapping.
- [ ] No animation clips are used for maintaining balance; it is purely physically driven.

### Phase 4: Falling & Protection
**Objective**: Handle loss of balance.
- [ ] **Fall Trigger**:
    - If COM leaves valid support zone -> Transition to `FALLING`.
- [ ] **Procedural Fall Behaviors**:
    - **Arm Bracing**: Raycast to ground, rotate arms to break fall.
    - **Head Protection**: Tuck head away from impact velocity.

#### Acceptance Criteria
- [ ] Pushing the character past a threshold causes them to lose stability and fall.
- [ ] During a fall, hands extend towards the ground (visual check).
- [ ] Character head attempts to stay elevated or tucked rather than slamming instantly into the concrete.

### Phase 5: Integration & Polish
**Objective**: Hook it up to the game.
- [x] **Player/NPC Integration**:
    - Instantiate `ActiveRagdollController`.
    - Delegate `applyImpact`.
- [x] **RagdollTestPanel**:
    - Bind "Stumble" button to moderate force (triggering physical sway).
    - Bind "Ragdoll" button to complete collapse.
- [x] **UI Polish**:
    - Fixed `RagdollTestPanel` and `ControllerStatusPanel` console errors (Added `getState`/`hasControl`).

#### Acceptance Criteria
- [x] Player can walk around, get hit by a force, fall down. (Recovery pending).
- [x] RagdollTestPanel buttons "Stumble" and "Fall" correctly trigger the respective physics states on the selected entity.
- [ ] Performance remains stable (>55 FPS) with active physics.

## Technical Implementation Details

### State Handoff (PlayerController <-> Ragdoll)
- **Activation**: When `applyImpact` triggers a fall:
    - `PlayerController` must disable its own velocity/position updates.
    - `PlayerController` must relinquish control of the mesh position to the Ragdoll.
    - `ActiveRagdollController` takes over `mesh.position` and `mesh.rotation`.
- **Integration Status**:
    - `PlayerController`: Connected.
    - `NPCEntity`: Connected.
    - `RagdollTestPanel`: Connected.
    - **Issue**: `RagdollPhysics` needs Terrain Height injection to support non-flat worlds. **FIXED.**

### File Structure

```
js/
  animation/
    physics/
      RagdollConfig.js       (Existing)
      SkeletonRegistry.js    (Existing)
      RagdollPhysics.js      (Existing)
      ActiveRagdollController.js (Existing)
  editor/
    animator/
      ragdoll/
        RagdollTestPanel.js  (Existing)
```
