# Phase 5: Animation Events & Layers
**Date:** January 13, 2026
**Status:** Completed
**Focus:** Gameplay integration (Events) and advanced animation blending (Layers).

---

## 🏗️ Architecture

Phase 5 expanded the animator's capabilities beyond simple playback, enabling interaction with game logic (Events) and complex blending operations (Layers).

```
js/editor/animator/
├── events/
│   ├── EventManager.js    // Triggers callbacks based on time
│   └── AnimationEvent.js  // Data structure
├── ui/
│   └── InspectorPanel.js  // Updated with Events & Layers UI
└── AnimatorEditorController.js // Integration
```

### 1. Events System (`EventManager.js`)
*   **Purpose:** Trigger gameplay logic (sounds, particles, state changes) at specific frames of an animation.
*   **Logic:** Tracks `currentTime` vs `previousTime` to detect when an event timestamp is crossed. 
*   **Visualization:** Events appear as **Pentagon Markers** on the Timeline ruler.
*   **Editor:** Double-click ruler to add, click marker to inspect/edit properties in the Inspector Panel.

### 2. Layer System (`AnimationLayer.js`)
*   **Purpose:** Manage blended animations with masking (e.g., playing an "Attack" on the UpperBody while "Running" on the LowerBody).
*   **Masking:** Defines a `rootBoneName`. Only this bone and its descendants are affected by the layer's animation.
*   **Weighting:** Dynamically adjust the influence (0.0 - 1.0) of the layer.

### 3. Editor Integration (`AnimatorEditorController.js`)
*   **Layer Preview:**
    *   **Visualization:** New "Eye" toggle in the Inspector. When active, it enters Pose Mode and colors masked bones **RED** and unmasked bones **GREEN**.
    *   **Blending:** "Weight" slider in the Inspector directly controls the `effectiveWeight` of the `AnimationAction`, allowing real-time preview of blending results.
    *   **Refactor:** The main UI generation was refactored to delegate to `InspectorPanel`, making the code significantly cleaner and more modular.

---

## 🔧 Key Features Implemented

### 📅 Animation Events
*   **Interactive Timeline:** Drag markers to reschedule events.
*   **Inspector:** Edit function name, parameters (JSON), and time with precision.
*   **Runtime Support:** Events are triggered via `EventManager.update()` during gameplay or preview.

### 🍰 Layer Blending
*   **Real-time Controls:** Adjust layer weights instantly using sliders.
*   **Mask Visualization:** Visual debug tool to verify which bones are included in a layer mask.
*   **Dynamic Creation:** UI to define new layers (Name + Root Bone) at runtime.
    *   **Add Layer Button:** Available in the Layers inspector.
    *   **Bone Selector:** Dropdown populated from the entity's skeleton.

---

## 🔌 Integration Details

### InspectorPanel
*   **Modular UI:** The panel now dynamically builds sections based on the selected entity's capabilities (FSM, Layers, Events).
*   **`_buildLayers()`**: Generates the list of active layers with controls.
    ```javascript
    // Example Layer UI structure
    [Layer Name] [👁️ Toggle Mask]
    Mask: Spine
    Weight: [======|====] 0.60
    ```
*   **Dynamic Creation:** Inline form to add new layers with validation.

### AnimatorEditorController
*   **`createLayer(name, rootBone)`**: Handles validation and calls `animator.addLayer()`.
*   **`_updateMaskVisualization()`**:
    *   Iterates through `boneHelpers`.
    *   Checks if bone name exists in the active layer's mask logic.
    *   Applies Color/Opacity override (Red = Masked).
*   **`setLayerWeight(name, val)`**: Proxies UI input to the backend `AnimationLayer` instance.

---

## 📝 Future Improvements
*   **Layer-specific playback:** Ability to selectively play an animation *only* on a specific layer for testing.
*   **Additive Blending:** Support for additive layers (e.g., breathing, recoil) in the previewer.
