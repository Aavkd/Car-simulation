# Animation Editor Enhancement Plan

## Goal
Enable the Animator Editor to set and edit animations for entities (NPCs and Player), and verify by adding animations to the player in third-person mode.

## Current State Analysis
- **Animator Editor**: Can select entities via `userData.entity`. Can pose bones and create keyframes. Has a `LibraryPanel` backed by `LibraryService` for previewing animations.
- **Player Controller**: Loads `Knight.fbx` but does not initialize `AnimationController` properly. Does not link `mesh.userData.entity` to itself, making it unselectable in the editor.
- **Library Service**: Has logic to apply animations but uses an incorrect property access (`animator.controller.actions` instead of `animator.actions`).

## Implementation Steps

### 1. Fix LibraryService
- **Target**: `js/editor/animator/library/LibraryService.js`
- **Action**: Correct `applyAnimation` method to access `animator.actions` instead of `animator.controller.actions`.

### 2. Enhance PlayerController
- **Target**: `js/core/player.js`
- **Actions**:
    - Import `AnimationController` and `FBXLoader`.
    - In `loadModel`:
        - Set `this.mesh.userData.entity = this`.
        - Set `this.mesh.userData.type = 'player'`.
        - Load `Idle.fbx` and `Sprint.fbx` (and others if available) from `assets/animations/library/basic/`.
        - Initialize `this.animator` with the loaded mesh and clips.
        - Setup `Locomotion` BlendTree (similar to `NPCEntity`).

### 3. Verification
- **Test**: `rpg_verify.mjs` (or manual test in browser).
- **Steps**:
    - Launch game.
    - Switch to 3rd person (if key available, or ensure default).
    - Open Animator Editor (e.g., press `~` or specific key).
    - Click on Player. Verify selection works.
    - Check if "Idle" and "Sprint" animations are playing based on movement.

## Future Considerations (Post-Goal)
- Implement a UI to browse `assets/animations/` and add them to the selected entity at runtime via the Editor.
- Save the configuration to a JSON file (e.g., `player-config.json`) for persistence.
