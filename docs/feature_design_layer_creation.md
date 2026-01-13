# Feature Design: Dynamic Layer Creation

## 1. Overview
Currently, the **Deep Animator** allows viewing and adjusting weights of *existing* animation layers. However, there is no UI to **create new layers** at runtime. This feature will enable users to define new masking layers (e.g., "UpperBody", "RightArm") directly within the editor.

## 2. User Stories
-   **As an animator**, I want to create a new layer named "UpperBody" that only affects bones from the "Spine" upwards, so I can play attack animations while running.
-   **As a rigger**, I want to visualize which bones are included in my mask to ensure I selected the correct root bone.

## 3. UI Design

### 3.1 "Layers" Section Update
The existing **Layers** section in `InspectorPanel.js` will be enhanced:

-   **Existing**: List of layers with Weight Slider + Mask Toggle.
-   **New**: A **[+ Add Layer]** button at the bottom of the list.

### 3.2 Add Layer Modal/Dialog
When **[+ Add Layer]** is clicked, a small form appears (either inline or as a modal overlay):

1.  **Layer Name**: Text input (default: "New Layer").
2.  **Mask Root**: Dropdown list containing all bones in the character's skeleton.
    -   *Filter/Search* support for the dropdown would be ideal given large hierarchies.
3.  **Action Buttons**:
    -   **[Create]**: Commits the change.
    -   **[Cancel]**: Closes the form.

## 4. Technical Implementation

### 4.1 Backend: `AnimationController.js`
-   The method `addLayer(name, rootBoneName)` already exists. 
-   **Verification**: Ensure it handles duplicate names gracefully (e.g., warn or append suffix).

### 4.2 Frontend: `InspectorPanel.js`
-   Implement `_buildAddLayerUI()`:
    -   Renders the "Add Layer" button.
    -   Renders the creation form state (toggleable).
-   Populate bone dropdown:
    -   Requires access to `editor.selectedEntity.mesh.skeleton.bones` or traversing the mesh to get all bone names.

### 4.3 Controller: `AnimatorEditorController.js`
-   Add method `createLayer(name, rootBoneName)`:
    -   Validates inputs (name not empty, bone exists).
    -   Calls `entity.animator.addLayer()`.
    -   Triggers UI refresh.
    -   Optional: Auto-visualize the new mask immediately after creation.

## 5. Workflow
1.  User Selects Entity (e.g., Knight).
2.  Goes to **Layers** section.
3.  Clicks **+ Add Layer**.
4.  Enters name: "ArmOverride".
5.  Selects Bone: "RightArm".
6.  Clicks **Create**.
7.  "ArmOverride" appears in the list with Weight 1.0.
8.  User toggles Eye icon to verify only the right arm is red.
9.  User plays an animation clip on this layer (Future feature: Layer-specific playback controls).

## 6. Future Considerations (Out of Scope for now)
-   **Layer-specific Clip Selection**: Currently we play clip on *Full Body*. Future UI should allow selecting a clip *specifically* for a layer.
-   **Avatar Masks**: Saving/Loading mask definitions to JSON.
