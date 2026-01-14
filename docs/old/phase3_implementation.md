# Phase 3: Timeline & Dope Sheet Implementation

**Date:** January 13, 2026
**Status:** Completed
**Focus:** Professional animation timeline, dope sheet view, and playback controls.

---

## 🏗️ Architecture

Phase 3 introduced a new `timeline` module within the editor architecture. It separates the timeline rendering (Canvas) from the data model and the hierarchical logic.

```
js/editor/animator/timeline/
├── TimelinePanel.js    // Main container & Canvas renderer
├── DopeSheet.js        // Logic for bone hierarchy & keyframe selection
├── CurveEditor.js      // Visual graph editor for interpolation curves
└── KeyframeData.js     // Enhanced data model (PoseKeyframe, TimelineData)
```

### 1. TimelinePanel (`TimelinePanel.js`)
The visualization core, similar to `GraphEditor` but specialized for time-based data.
*   **Rendering:** Uses HTML5 Canvas for high-performance rendering of the grid, ruler, playhead, and keyframe markers.
*   **Interaction:** Handles zoom (`Ctrl+Wheel`), pan (`Wheel/Drag`), and playhead scrubbing.
*   **Responsiveness:** Includes a vertical resize handle and auto-scaling time ruler.
*   **Integration:** Instantiated in `AnimatorEditorController`, toggled via Toolbar (`T`).
*   **View Toggle:** Switches between "Dope Sheet" logic and "Curve Editor" view modes.

### 2. Dope Sheet Logic (`DopeSheet.js`)
Manages the complexity of bone hierarchies and keyframe operations.
*   **Hierarchy:** Builds a tree structure from flat bone lists, grouping them (e.g., "Left Arm", "Spine") for cleaner visualization.
*   **Selection:** Handles bone-specific keyframe selection (single click, shift+click).
*   **Operations:** Implements copy, paste, delete, and duplicate (`Ctrl+D`) logic for selected keys.
*   **Filtering:** Provides filtered views of bones (expanding/collapsing groups).

### 3. Curve Editor (`CurveEditor.js`)
*New in Phase 3.3*: Visual graph editing for precise animation control.
*   **Visualization:** Renders X, Y, Z, W quaternion components as distinct Bezier curves.
*   **Handles:** Interactive tangent handles to shape acceleration/deceleration.
*   **Presets:** Quick-apply buttons for standard motion curves:
    *   `Smooth` (Standard Bezier)
    *   `Linear` (Straight lines)
    *   `Stepped` (Instant hold)
    *   `Bounce` (Physics-based bounce effect)
    *   `Elastic` (Spring effect)
*   **Overlay:** Precision numeric input for selected keyframe Time and Value.

### 4. Keyframe Data Model (`KeyframeData.js`)
An abstraction layer over the legacy `capturedPoses` array.
*   **TimelineData:** Manages the list of `PoseKeyframe` objects.
*   **Interpolation:** Supports extensive tangent types (`SMOOTH`, `LINEAR`, `STEPPED`, `BEZIER`, `BOUNCE`, `ELASTIC`).
*   **Synchronization:** Loads from and saves back to the editor's core data structure.

---

## 🔧 Key Features Implemented

### 🎬 Timeline View
*   **Time Ruler:** Toggle between Seconds (`0.5s`) and Frames (`30f`).
*   **Dynamic Grid:** Auto-adjusts density based on zoom level.
*   **Playhead:** Draggable indicator synced with the animation preview.

### 🦴 Dope Sheet
*   **Grouped Bones:** `Spine`, `Arm_L`, `Arm_R`, `Leg_L`, `Leg_R` groups automatically created from bone names.
*   **Diamond Markers:** Visual representation of keyframes.
    *   **Red**: Unselected
    *   **Blue**: Selected
*   **Row Selection:** Clicking a bone row's keyframe selects only that bone's data for that time.

### 📈 Curve Editor
*   **Mode Toggle:** Switch between 🎞️ Dope Sheet and 📈 Curve Editor via toolbar.
*   **Property Focus:** Select a bone in the left panel to view its rotation curves.
*   **Runtime Evaluation:** Animation playback now uses the actual curve data (Component-wise Bezier) instead of simple SLERP, allowing for complex timing and effects.

### 🎮 Playback & Controls
*   **Toolbar Integration:**
    *   `🎞️` Toggle Timeline (Hotkey: `T`)
    *   `⏱️` Toggle Time/Frame units
    *   `Speed` selector (0.25x - 4x)
*   **Hotkeys:**
    *   `Space`: Play/Pause
    *   `,` / `.`: Frame Step Backward/Forward
    *   `Home` / `End`: Go to Start/End
    *   `S`: Capture Keyframe (Updates timeline instantly)

---

## 🔌 Integration Details

### AnimatorEditorController
*   **Initialization:** `TimelinePanel` is created in `initialize()` but hidden by default.
*   **Pose Mode:** `enablePoseMode()` shows the timeline and loads the current `capturedPoses`. `disablePoseMode()` hides it.
*   **Sync:**
    *   `captureKeyframe()` -> Refreshes timeline.
    *   `deleteKeyframe()` -> Refreshes timeline.
    *   `playPreview()` -> Updates playhead position every frame and evaluates curves.
    *   Timeline scrub -> Updates character pose via `_applyPoseAtTime()` with curve support.

### HotkeyManager
*   Delegates timeline-specific actions (`Ctrl+C`, `Ctrl+V`, `Delete`) to `DopeSheet` when the timeline is active.

---

## 📝 Future Improvements (Deferred)
*   **Audio Support:** Waveform display for syncing animation to sound.
*   **Multi-Select Drag:** Dragging multiple keyframes simultaneously (currently single/batch select works, but drag interaction needs refinement).
