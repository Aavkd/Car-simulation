# 🏃 Animation System & Deep Animator Editor Roadmap

This roadmap outlines the implementation of a AAA-quality animation system for the Racing & RPG Simulator. The goal is to bring characters (Player & NPCs) to life with fluid, state-driven animations and provide a robust tool for authoring these behaviors.

## 🏗️ Phase 1: Core Animation Infrastructure
**Goal:** Establish the foundational classes to handle GLB animations and the main update loop.

- [x] **Animation Component System** `js/animation/core/`
    - Create `AnimationController.js`: Wrapper around `THREE.AnimationMixer`.
    - Handle initialization of `THREE.AnimationAction` from GLTF clips.
    - Implement `play(clipName, loop, fadeTime)` interface.
- [x] **Asset Pipeline Update**
    - Update `AssetLibrary.js` to flag assets as "SkinnedMesh" compatible.
    - Ensure `gltf.animations` are preserved during loading.
- [x] **Basic Integration**
    - Hook `AnimationController.update(delta)` into `NPCEntity.update`.
    - **Note**: `knight_final.glb` is rigged but has no animations.
    - Animation playback verification will be deferred until Phase 4 (Editor).

## 🧬 Phase 2: State Machine & Locomotion
**Goal:** Implement a generic State Machine to manage logic transitions (Idle -> Walk -> Run -> Jump).

- [x] **Finite State Machine (FSM)** `js/animation/fsm/`
    - Create `StateMachine.js`: Base class for managing states.
    - Create `State.js`: Base class with `enter()`, `update()`, `exit()`.
- [x] **Standard Character States**
    - `IdleState`: Random idle variations.
    - `MoveState`: Handles walking/running based on velocity.
    - `AirState`: Falling/Jumping logic.
- [x] **Input-to-Animation Driver**
    - Map `PlayerController` velocity/input to animation parameters (speed, direction).
    - Implement smooth dampening for input values using `MathUtils.damp`.

## 🎭 Phase 3: Procedural Layer & Blending
**Goal:** Add "weight" and realism using blend trees and procedural bone manipulation.

- [x] **1D/2D Blend Trees**
    - Create `BlendTree1D.js`: Blend between Idle -> Walk -> Run based on a single float (Speed).
    - Create `BlendTree2D.js`: Blend for strafing (X, Z movement).
- [x] **Procedural Spines (Inverse Kinematics)**
    - Implement **Head Look**, allowing characters to look at POIs or the Camera.
    - Implement **Torso Twist** to face aiming directions independent of hips.
    - Implement **Foot IK** (optional but recommended) for terrain slope adaptation.
- [x] **Layered Animation**
    - Allow playing "Upper Body" actions (Attack, Wave, Eat) while "Lower Body" is running or idle.
    - Implement `AnimationLayer` class with masking support (Avatar masks).

## 🎬 Phase 4: Deep Animator Editor (Distinct from F9)
**Goal:** A "Unity Animator" style editor to visualize and tweak state machines in real-time.

- [x] **Editor Core** `js/editor/animator/`
    - **Toggle**: Use `F8` to switch to Animator Mode.
    - **Selection**: Click a character in the world to "Inspect" their animator.
- [x] **Visual Graph (GUI) **
    - **Nodes**: innovative UI showing current active State (highlighted).
    - **Parameters**: Real-time slider adjustments for `Speed`, `Health`, `IsGrounded`.
    - **Transition Rules**: View/Edit transition conditions (e.g., `Speed > 0.1` → Move).
- [x] **Timeline / Preview**
    - [x] Implement animation scrubber.
    - [ ] "Record" button to capture a sequence of inputs and replay it to test transitions. ⏳ Pending
- [x] **Deep Animation Creation Mode**
    - [x] **Visual Pose Editor**:
        - Select bones (FK) or effectors (IK) to create key poses.
        - "Ghosting" / Onion skinning to see previous frames.
    - [x] **Timeline & Keyframing**:
        - [x] Capture keyframes with bone quaternion data.
        - [x] Direct bone interpolation preview (slerp between poses).
        - Dope-sheet view for adjusting timing.
    - **JSON Persistence System**:
        - [x] **Export**: Serialize `THREE.AnimationClip` data to `.anim.json` files.
        - [ ] **Storage**: Save to `assets/animations/` (requires server-side write or manual file save).
        - [ ] **Import**: Runtime loader to parse `.anim.json` back into clips and apply to `AnimationController`.
    - **Retargeting Support**:
        - Auto-map standard bone names (Hips, Spine, Head) so saved JSON animations work on any humanoid Rig.

## ⚔️ Phase 5: Advanced Gameplay Integration
**Goal:** Apply the system to complex gameplay scenarios.

- [ ] **Combat System**
    - Hitbox generation attached to specific bones (RightHand, Sword).
    - "Hit Stop" or "Freeze Frame" effect on impact.
- [ ] **Swimming & Crouching**
    - Add specific physics states to `PlayerController`.
    - Create corresponding Animation States.
- [ ] **NPC Life**
    - Give NPCs "Schedule States" (Wander, Sit, Talk).
    - Use the Animator to seamlessly transition them between behaviors.

## 📅 Execution Order
1. **Infrastructure**: Get a model moving (Phase 1).
2. **Logic**: Make it smart (Phase 2).
3. **Feel**: Make it fluid (Phase 3).
4. **Tools**: Build the Editor to scale content (Phase 4).
5. **Gameplay**: fun stuff (Phase 5).
