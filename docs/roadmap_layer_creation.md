# Roadmap: Dynamic Layer Creation

**Feature:** Allow users to create new animation layers at runtime within the Deep Animator.
**Status:** Completed
**Target Phase:** 5.5 (Delivered)

---

## 1. Overview
Enable the creation of masked animation layers (e.g., "UpperBody") directly in the editor, allowing for complex blending setups (like playback of attack animations while running) without code changes.

## 2. Technical Roadmap

### Phase 2.1: Backend Logic Verification
**File:** `js/animation/core/AnimationController.js`
- [x] **Verify `addLayer`**: Ensure it correctly initializes `AnimationLayer`.
- [x] **Add Validation**: Modify or wrap `addLayer` to handle duplicate names (prevent overwrite or return error).
- [x] **Ensure Reactivity**: Verify if adding a layer dynamically interferes with the current mixer or loop.

### Phase 2.2: Controller Logic
**File:** `js/editor/animator/AnimatorEditorController.js`
- [x] **Implement `createLayer(name, rootBoneName)`**:
    - Validate input (non-empty name, valid bone name).
    - Check if layer name already exists.
    - Call `entity.animator.addLayer()`.
    - Trigger `inspectorPanel.refresh()` or `_buildLayers()` to update UI.
    - Automatically select or visualize the new layer (optional usability boost).
- [x] **Bone List Retrieval**: Add a helper method to get a flat list of all bone names from `selectedEntity.mesh.skeleton`.

### Phase 2.3: UI Implementation
**File:** `js/editor/animator/ui/InspectorPanel.js`
- [x] **Update `_buildLayers()`**:
    - Add a styled `[+ Add Layer]` button at the bottom of the layer list.
- [x] **Implement `_buildAddLayerModal()`**:
    - Create a modal or inline form state.
    - **Inputs**:
        - Text Input: "Layer Name"
        - Dropdown: "Mask Root Bone" (populated from skeleton)
    - **Buttons**: [Create] [Cancel]
- [x] **Refine UX**:
    - Sort bone list alphabetically for easier finding.
    - Add simple validation feedback (e.g., red border if name empty).

### Phase 2.4: Integration & Verification
- [x] **Manual Test**: Create a "UpperBody" layer masked to "Spine".
- [x] **Visual Test**: Toggle "Eye" icon to see if the mask correctly visualizes (Red/Green bones).
- [x] **Functional Test**: Adjust weight and verify it affects blending (if a clip is playing on that layer).

## 3. Implementation Steps

### Step 1: Backend & Controller
1.  Modify `AnimatorEditorController` to add `createLayer` method.
2.  Implement `getSkeletonBoneNames` helper in `AnimatorEditorController`.

### Step 2: UI Structure
3.  In `InspectorPanel`, add the "Add Layer" button to the Layers section.
4.  Create the `AddLayerDialog` class or internal render method.

### Step 3: Wiring
5.  Connect "Add Layer" button to show dialog.
6.  Connect Dialog "Create" to `controller.createLayer`.
7.  Handle success/error feedback.

## 4. Future Improvements (Post-Implementation)
- **Layer-specific Clip Selection**: Allow assigning a specific clip to the new layer immediately.
- **Mask Presets**: Quick options for "Upper Body", "Right Arm", etc. based on common bone names.
