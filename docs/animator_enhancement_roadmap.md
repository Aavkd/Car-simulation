# Animator Editor Enhancement & Player Integration Roadmap

## 1. Executive Summary
**Goal**: Enhance the Animator Editor to allow setting and editing animations for game entities (NPCs, Player).
**Validation Case**: Implement this system for the Player character, enabling full third-person animation (Idle, Walk, Sprint) editable within the tooling.
**Status**: **Completed** (Jan 14, 2026)

## 2. Current Architecture & Gap Analysis

### 2.1 Existing Systems
- **Animator Editor (`AnimatorEditorController.js`)**:
    -   Supports raycast selection of entities via `userData.entity`.
    -   Includes a `LibraryPanel` for browsing animations.
    -   Includes a `LibraryService` for importing/retargeting.
-   **Animation System (`AnimationController.js`)**:
    -   Handles FSM (Finite State Machine) and BlendTrees.
    -   Wraps `THREE.AnimationMixer`.
-   **Player Controller (`PlayerController.js`)**:
    -   Loads a static `Knight.fbx`.
    -   **Gap**: No `AnimationController` attached.
    -   **Gap**: Mesh is not marked as an entity, making it unselectable in the Editor.
-   **Library Service**:
    -   **Bug**: Contains incorrect property access (`animator.controller.actions` vs `animator.actions`) preventing animations from being applied.

## 3. Implementation Phases

### Phase 1: Core Plumbing & Fixes (Completed)
*Objective: Ensure the underlying tools can actually apply animations to an entity.*

1.  **Fix `LibraryService.js`**:
    -   Corrected the `applyAnimation()` method to properly register new clips to the `AnimationController`.
    -   Replaced `animator.controller.actions` with `animator.actions`.
    -   **Fix**: Correctly stored `THREE.AnimationAction` objects directly in the map instead of wrapper objects.
2.  **Verify `AnimationController.js`**:
    -   Confirmed dynamic addition of clips (`actions.set(...)`) is supported at runtime.

### Phase 2: Player Entity Upgrade (Completed)
*Objective: Make the Player a valid "Entity" that accepts animations.*

1.  **Refactor `loadModel` in `PlayerController.js`**:
    -   Loaded `Idle.fbx`, `Walk.fbx`, and `Sprint.fbx` alongside the base mesh using `THREE.LoadingManager`.
    -   Initialized `this.animator = new AnimationController(mesh, animations)`.
    -   **Feature**: Added fallback logic to auto-generate a `Walk` animation from `Sprint` (at 50% speed) if `Walk.fbx` fails to load.
2.  **Entity Tagging**:
    -   Set `this.mesh.userData.entity = this` to enable Raycast selection in the Editor.
    -   Set `this.mesh.userData.type = 'player'`.
3.  **State Machine Integration**:
    -   Connected Player input (velocity, isGrounded) to `animator.setInput()`.
    -   Defined 'Locomotion' BlendTree:
        -   Idle: 0.0
        -   Walk: 20.0
        -   Sprint: 40.0

### Phase 3: Editor Integration (Completed)
*Objective: Allow the user to use the Editor UI to manipulate the Player.*

1.  **Selection Support**:
    -   Verified `AnimatorEditorController` successfully selects the Player mesh via `userData.entity`.
2.  **Clip Management**:
    -   Ensured the Editor's "Clips" list refreshes when `LibraryService` applies a new animation.
3.  **Persistence Strategy (Design Only)**:
    -   *Future*: Editor should export an `entity_config.json` defining which animations load for which entity.

### Phase 4: Validation & Third-Person Testing (Completed)
*Objective: Verify the end-to-end user story.*

1.  **Test 3rd Person View**:
    -   Verified camera correctly follows the now-animated mesh.
2.  **Editor Workflow Test**:
    -   Verified selecting Player in Editor works.
    -   Verified applying new animations works.

## 4. Technical Specifications

### File Targets
-   `js/editor/animator/library/LibraryService.js` (Fix Applied)
-   `js/core/player.js` (Feature Implemented)
-   `js/animation/core/AnimationController.js` (Verified)

### Data Flow
1.  **Input**: User presses WASD.
2.  **PlayerController**: Calculates velocity -> `animator.setInput('speed', 5.0)`.
3.  **AnimationController**: FSM evaluates 'Locomotion' BlendTree -> Blends 'Walk' and 'Run' clips.
4.  **Editor Override**: User selects Player -> `animator.play('Dance')` -> Overrides Locomotion.

## 5. Verification Checklist
-   [x] Player mesh is visible and animating in 3rd person.
-   [x] Player transitions smoothly from Idle to Run.
-   [x] Clicking Player in Editor selects it.
-   [x] "Apply" in Library Service adds the clip to the Player's dropdown list.