# Animator Editor Enhancement & Player Integration Roadmap

## 1. Executive Summary
**Goal**: Enhance the Animator Editor to allow setting and editing animations for game entities (NPCs, Player).
**Validation Case**: Implement this system for the Player character, enabling full third-person animation (Idle, Walk, Sprint) editable within the tooling.

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

### Phase 1: Core Plumbing & Fixes
*Objective: Ensure the underlying tools can actually apply animations to an entity.*

1.  **Fix `LibraryService.js`**:
    -   Correct the `applyAnimation()` method to properly register new clips to the `AnimationController`.
    -   Replace `animator.controller.actions` with `animator.actions`.
2.  **Verify `AnimationController.js`**:
    -   Ensure dynamic addition of clips (`actions.set(...)`) is supported at runtime.

### Phase 2: Player Entity Upgrade
*Objective: Make the Player a valid "Entity" that accepts animations.*

1.  **Refactor `loadModel` in `PlayerController.js`**:
    -   Load `Idle.fbx`, `Walk.fbx`, and `Sprint.fbx` alongside the base mesh.
    -   Initialize `this.animator = new AnimationController(mesh, animations)`.
2.  **Entity Tagging**:
    -   Set `this.mesh.userData.entity = this` to enable Raycast selection in the Editor.
    -   Set `this.mesh.userData.type = 'player'`.
3.  **State Machine Integration**:
    -   Connect Player input (velocity, isGrounded) to `animator.setInput()`.
    -   Define a basic 'Locomotion' BlendTree (Idle <-> Walk <-> Sprint).

### Phase 3: Editor Integration
*Objective: Allow the user to use the Editor UI to manipulate the Player.*

1.  **Selection Support**:
    -   Verify `AnimatorEditorController` successfully selects the Player mesh.
2.  **Clip Management**:
    -   Ensure the Editor's "Clips" list refreshes when `LibraryService` applies a new animation.
3.  **Persistence Strategy (Design Only)**:
    -   *Note*: Currently, we will load default animations via code.
    -   *Future*: Editor should export an `entity_config.json` defining which animations load for which entity.

### Phase 4: Validation & Third-Person Testing
*Objective: Verify the end-to-end user story.*

1.  **Test 3rd Person View**:
    -   Ensure the camera correctly follows the now-animated mesh.
2.  **Editor Workflow Test**:
    -   Open Game -> Toggle Editor.
    -   Select Player.
    -   Open Animation Library (Key `L`).
    -   Preview a *new* animation (e.g., a Dance or Attack).
    -   Apply it.
    -   Verify the Player can play this new animation.

## 4. Technical Specifications

### File Targets
-   `js/editor/animator/library/LibraryService.js` (Fix)
-   `js/core/player.js` (Feature)
-   `js/animation/core/AnimationController.js` (Verify)

### Data Flow
1.  **Input**: User presses WASD.
2.  **PlayerController**: Calculates velocity -> `animator.setInput('speed', 5.0)`.
3.  **AnimationController**: FSM evaluates 'Locomotion' BlendTree -> Blends 'Walk' and 'Run' clips.
4.  **Editor Override**: User selects Player -> `animator.play('Dance')` -> Overrides Locomotion.

## 5. Verification Checklist
-   [ ] Player mesh is visible and animating in 3rd person.
-   [ ] Player transitions smoothly from Idle to Run.
-   [ ] Clicking Player in Editor selects it.
-   [ ] "Apply" in Library Service adds the clip to the Player's dropdown list.
