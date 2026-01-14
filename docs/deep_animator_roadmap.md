# 🎬 Deep Animator Editor - Complete Overhaul Roadmap

> **Vision**: Transform the basic Deep Animator into a **Unity-like, production-grade animation editor** with visual state machine graphs, a professional timeline/dope sheet, IK rigging, animation events, and real-time retargeting.

---

## 📸 Current State Analysis

### What We Have Now

![Current Inspect Mode](../images/animator_inspect.png)
*Inspect Mode: Entity selection, State Machine display, Parameters, Active Clip scrubber*

![Current Pose Mode](../images/animator_pose.png)
*Pose Mode: Bone helpers (green boxes), Move/Rotate tools, Keyframe capture, Preview, Export*

### Current Feature Inventory

| Feature | Status | Notes |
|---------|--------|-------|
| Entity Selection (click to inspect) | ✅ Working | Raycasts into scene, extracts animator |
| State Machine Display | ✅ Basic | Shows current state name, parameters |
| Parameter Editing | ✅ Basic | Sliders/checkboxes for FSM data |
| Clip Scrubber | ✅ Basic | Linear time scrub on active action |
| Pose Mode Toggle | ✅ Working | Shows skeleton helper + bone gizmos |
| Bone Selection | ✅ Working | Click green box → attach TransformControls |
| Keyframe Capture | ✅ Basic | Stores quaternion snapshots |
| Preview (Direct) | ✅ Basic | Slerp interpolation between poses |
| JSON Export | ✅ Basic | `AnimationClip.toJSON()` export |
| **Modular UI System** | ✅ **NEW** | UIManager, Toolbar, InspectorPanel, StatusBar |
| **Undo/Redo** | ✅ **NEW** | Command pattern, Ctrl+Z/Ctrl+Shift+Z |
| **Selection Manager** | ✅ **NEW** | Multi-bone selection, hierarchy select |
| **Hotkey Manager** | ✅ **NEW** | W/E/R tools, Space play, S keyframe |
| **Frame Navigation** | ✅ **NEW** | Step through keyframes with ⏪/⏩ buttons |

### Critical Gaps (vs Unity Animator)

1. **No Visual State Machine Graph** - Can't see/edit transition rules visually
2. **No Timeline/Dope Sheet** - Linear keyframe list, no curves
3. **No Animation Curves** - Quaternion-only, no position/scale/custom properties
4. **No Onion Skinning** - Hard to see motion arcs
5. **No IK Handles** - FK-only bone manipulation
6. **No Animation Events** - Can't trigger sounds/effects at keyframes
7. **No Retargeting** - Animations tied to specific skeletons
8. **No Animation Blending Preview** - Can't visualize blend trees in editor
9. **No Additive Layer Preview** - Can't test layer masks
10. ~~**No Undo/Redo** - Destructive editing~~ ✅ **FIXED in Phase 1**

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    subgraph "New Editor Architecture"
        A[AnimatorEditorController.js] --> B[UIManager.js]
        A --> C[SelectionManager.js]
        A --> D[TimelineController.js]
        A --> E[GraphEditor.js]
        
        B --> B1[InspectorPanel]
        B --> B2[TimelinePanel]
        B --> B3[GraphPanel]
        B --> B4[ToolbarPanel]
        
        D --> D1[KeyframeData]
        D --> D2[CurveEditor]
        D --> D3[DopeSheet]
        
        E --> E1[StateNode]
        E --> E2[TransitionEdge]
        E --> E3[ParameterWidget]
        
        A --> F[IKSolver.js]
        A --> G[OnionSkinning.js]
        A --> H[UndoManager.js]
    end
```

---

## 🚀 Implementation Phases

---

### Phase 1: Editor Foundation & UI Overhaul ✅ COMPLETED
**Timeline**: Core infrastructure that enables all future features

#### 1.1 Modular UI System
- [x] **[NEW] `js/editor/animator/ui/UIManager.js`**
  - Panel management (dock, undock, resize)
  - Theme system (dark mode by default)
  - Responsive layout (inspector left, timeline bottom, graph center)

- [x] **Refactor `AnimatorEditorController.js`**
  - Extract `_buildUI()` / `_buildPoseUI()` into dedicated panel classes
  - Implement proper separation of concerns

- [x] **[NEW] `js/editor/animator/ui/Toolbar.js`**
  - Tool buttons: Select, Move, Rotate, Scale, IK Handle
  - Play/Pause/Stop controls
  - Frame navigation (|◀ ◀ ▶ ▶|)
  - Snap settings (time, rotation)

#### 1.2 Undo/Redo System
- [x] **[NEW] `js/editor/animator/core/UndoManager.js`**
  - Command pattern for all bone/keyframe modifications
  - History stack with configurable depth (default: 50)
  - Keyboard shortcuts: `Ctrl+Z` / `Ctrl+Shift+Z`

#### 1.3 Selection System Improvements
- [x] **[NEW] `js/editor/animator/core/SelectionManager.js`**
  - Multi-bone selection (`Shift+Click`)
  - Hierarchy selection (`Ctrl+Click` selects children)
  - Selection groups/sets
  - Box selection for timeline keyframes

---

### Phase 2: Visual State Machine Graph Editor ✅ COMPLETED
**Timeline**: Unity's "Animator Window" equivalent

#### 2.1 Graph Canvas
- [x] **[NEW] `js/editor/animator/graph/GraphEditor.js`**
  - Canvas-based node rendering (HTML Canvas or SVG)
  - Pan/Zoom controls (Middle mouse drag, scroll wheel)
  - Grid background with snap-to-grid

#### 2.2 State Nodes
- [x] **[NEW] `js/editor/animator/graph/StateNode.js`**
  - Visual representation of FSM states
  - Color coding: Entry (green), Normal (gray), Any State (yellow)
  - Motion preview thumbnail when hovered
  - Connection ports (in/out)

```javascript
// Example State Node Data Structure
{
    id: 'state_idle',
    name: 'Idle',
    position: { x: 100, y: 200 },
    motion: 'idle_animation.anim.json',
    speed: 1.0,
    isDefault: true,
    transitions: ['to_walk', 'to_jump']
}
```

#### 2.3 Transition System
- [x] **[NEW] `js/editor/animator/graph/TransitionEdge.js`**
  - Curved Bezier lines between states
  - Arrow heads indicating direction
  - Click to select and edit conditions

- [x] **[NEW] `js/editor/animator/graph/TransitionInspector.js`**
  - Condition list: `Parameter`, `Operator`, `Value`
  - Blend settings: Duration, Offset, Interruption source
  - Has Exit Time checkbox
  - Click transition edge to edit

#### 2.4 Parameters Panel (Enhanced)
- [x] **[NEW] `js/editor/animator/graph/ParameterWidget.js`**
  - Add new parameter button (+)
  - Parameter types: `Float`, `Int`, `Bool`, `Trigger`
  - In-graph parameter widgets for testing

#### 2.5 Live State Highlighting
- [x] **Real-time state visualization**
  - Highlight current active state in graph
  - Show transition progress bar during blending
  - Parameter value overlays

---

### Phase 3: Professional Timeline & Dope Sheet ✅ COMPLETED
**Timeline**: Industry-standard keyframe editing

#### 3.1 Timeline Foundation
- [x] **[NEW] `js/editor/animator/timeline/TimelinePanel.js`**
  - Horizontal scrollable timeline area
  - Time ruler with frames/seconds toggle
  - Current time indicator (playhead)
  - Zoom in/out on timeline

#### 3.2 Dope Sheet View
- [x] **[NEW] `js/editor/animator/timeline/DopeSheet.js`**
  - Hierarchical bone list (collapsible)
  - Diamond keyframe markers per bone
  - Color-coded by property (rotation=red, position=green, scale=blue)
  - Batch operations: Copy, Paste, Delete selected keyframes

```
| Bone          | 0s    | 0.5s  | 1s    | 1.5s  | 2s    |
|---------------|-------|-------|-------|-------|-------|
| ► Hips        |   ◆   |       |   ◆   |       |   ◆   |
|   └ Spine     |   ◆   |   ◆   |   ◆   |   ◆   |   ◆   |
|     └ Chest   |   ◆   |       |       |       |   ◆   |
|       └ Head  |   ◆   |   ◆   |       |   ◆   |   ◆   |
| ► LeftArm     |   ◆   |       |   ◆   |       |   ◆   |
```

#### 3.3 Curve Editor
- [x] **[NEW] `js/editor/animator/timeline/CurveEditor.js`**
  - Bezier curve visualization for each property
  - Tangent handles (Smooth, Linear, Stepped, Bezier)
  - Key value editing via number input
  - Curve presets: Ease In, Ease Out, Bounce, Elastic

#### 3.4 Timeline Playback
- [x] **Enhanced playback controls**
  - Frame stepping (comma/period keys)
  - Loop region (set in/out points)
  - Playback speed slider (0.25x - 4x)
  - Integration with existing preview system
  
*(Note: Audio waveform display deferred to future phase)*

---

### Phase 4: Advanced Posing & IK ✅ COMPLETED
**Timeline**: Professional character rigging tools

#### 4.1 IK Solver Integration
- [x] **[NEW] `js/editor/animator/ik/IKSolver.js`**
  - CCD (Cyclic Coordinate Descent) algorithm
  - Pole vector constraints
  - Chain length configuration

- [x] **[NEW] `js/editor/animator/ik/IKHandle.js`**
  - Visual IK target gizmo (distinct from FK)
  - Effector position/rotation controls
  - Blend weight between FK/IK

#### 4.2 IK Chains Configuration
- [x] **Auto-detect common chains**
  - Arm IK: Shoulder → Elbow → Hand
  - Leg IK: Hip → Knee → Foot
  - Spine IK: Hips → Spine → Chest

- [x] **UI for creating custom IK chains**
  - Pick bones from hierarchy
  - Set chain root and tip
  - Configure pole target

#### 4.3 Foot IK (Ground Adaptation)
- [x] **[NEW] `js/editor/animator/ik/FootIK.js`**
  - Raycast to terrain
  - Automatic foot placement on slopes
  - Preview in editor with terrain debug lines

#### 4.4 Enhanced Bone Helpers
- [ ] **Improve visual bone representations**
  - Bone-shaped gizmos (octahedron/pyramid)
  - Size based on bone length
  - Joint rotation arcs/gimbal display
  - Axis display (local X=Red, Y=Green, Z=Blue)

---

### Phase 5: Animation Events & Layers
**Timeline**: Gameplay integration features

#### 5.1 Animation Events System
- [x] **Event Data Structure**
  - Time, Function Name, Parameters (JSON)
  - String/Float/Int/Bool parameter types

- [x] **Event Manager**
  - Trigger events during playback
  - Callback system for game logic

#### 5.2 Events UI
- [x] **Timeline Markers**
  - Draw markers on timeline rule
  - Drag to move events
  - Double-click rule to add event

- [x] **Event Inspector**
  - Edit event properties
  - Delete events

#### 5.3 Layer Preview
- [x] **Visualize animation layers in editor**
  - [x] Layer list with weight sliders
  - [x] Mask visualization on skeleton (Red/Green bones)
  - [x] Toggle layers on/off for preview
  - [x] See blending results in real-time


#### 5.4 Additive Animation Preview
- [ ] **Support additive blending preview**
  - Base layer + additive overlay
  - Weight curves for layers
  - Common use: Breathing, Hit reactions

#### 5.5 Dynamic Layer Creation
- [x] **Run-time layer management**
  - [x] Support creating new layers in Inspector
  - [x] Defining masks via bone selection
  - [x] [Design Document](./feature_design_layer_creation.md)


---

### Phase 6: Onion Skinning & Motion Trails
**Timeline**: Motion visualization aids

#### 6.1 Onion Skinning
- [ ] **[NEW] `js/editor/animator/viz/OnionSkinning.js`**
  - Ghost meshes at configurable frame intervals
  - Backward frames (red tint)
  - Forward frames (green tint)
  - Opacity falloff by distance from current frame

- [ ] **UI Controls**
  - Toggle on/off
  - Frame range slider (-10 to +10)
  - Opacity slider
  - Step interval (every 1, 2, 5 frames)

#### 6.2 Motion Trails
- [ ] **[NEW] `js/editor/animator/viz/MotionTrail.js`**
  - Draw arc paths for selected bones
  - Useful for hand/foot motion arcs
  - Editable splines for path adjustment

---

### Phase 7: Animation Ecosystem & Library
**Timeline**: Scalability & Reusability

#### 7.1 Humanoid Avatar Definition ✅ COMPLETED
- [x] **[NEW] `js/editor/animator/import/HumanoidAvatar.js`**
  - Standard bone mapping (Unity-compatible naming)
  - Auto-detection of common rigs (Mixamo, UE Mannequin)
  - Manual bone assignment UI

```javascript
// Standard humanoid bone map
{
    Hips: 'mixamorig:Hips',
    Spine: 'mixamorig:Spine',
    Chest: 'mixamorig:Spine2',
    Head: 'mixamorig:Head',
    LeftUpperArm: 'mixamorig:LeftArm',
    // ...
}
```

#### 7.2 Animation Retargeting ✅ COMPLETED
- [x] **[NEW] `js/editor/animator/import/Retargeter.js`**
  - Source → Target skeleton mapping
  - Bone length compensation
  - Rotation offset handling
  - Preview retargeted motion before applying
  - [Design Document](./animation_import_design.md)

#### 7.3 Animation Library (New) ✅ COMPLETED
- [x] **[NEW] `js/services/LibraryService.js`**
  - Scanning `assets/animations/library/` for FBX/GLB files
  - Indexing and caching animation metadata
  - "Live Preview" on selected character (click-to-play)
  
- [x] **Library UI Panel**
  - Searchable list of available animations
  - Categorization by folder
  - "Apply to Character" action

#### 7.4 Advanced Visualization (New) ✅ COMPLETED
- [x] **WebGL Import Preview**
  - Dedicated `THREE.WebGLRenderer` inside Import Dialog
  - Split-screen: Source animation vs Target retargeting
  - Scrubbing and playback controls for source file

#### 7.5 Import Enhancements
- [ ] **Support additional formats**
  - BVH (Motion Capture)
  - FBX animations (via three.js FBXLoader)
  - Mixamo direct download integration

#### 7.6 Export Enhancements
- [ ] **Professional export options**
  - GLB/GLTF with embedded animation
  - Separate `.anim.json` files
  - Batch export (all clips in project)
  - Compression options (quantization)

---

### Phase 8: Performance & Polish
**Timeline**: Production readiness

#### 8.1 Performance Optimization
- [ ] **GPU-accelerated rendering**
  - Instanced bone helpers
  - Frustum culling for large scenes
  - LOD for distant characters

- [ ] **Memory management**
  - Lazy loading of animation data
  - Dispose unused clips
  - Worker threads for heavy calculations

#### 8.2 Keyboard Shortcuts
- [ ] **Comprehensive hotkey system**
  | Action | Shortcut |
  |--------|----------|
  | Play/Pause | `Space` |
  | Frame Forward | `.` |
  | Frame Backward | `,` |
  | Go to Start | `Home` |
  | Go to End | `End` |
  | Set Key (Current Bone) | `S` |
  | Delete Key | `Delete` |
  | Select All Bones | `A` |
  | Deselect All | `Alt+A` |
  | Toggle IK/FK | `T` |
  | Undo | `Ctrl+Z` |
  | Redo | `Ctrl+Shift+Z` |

#### 8.3 Help & Onboarding
- [ ] **Tooltips for all UI elements**
- [ ] **Context-sensitive help panel**
- [ ] **Interactive tutorial overlay for first-time users**

---

## 📁 New File Structure

```
js/editor/animator/
├── AnimatorEditorController.js  # Main orchestrator (✅ refactored in Phase 1)
│
├── core/                        # ✅ PHASE 1 COMPLETE
│   ├── UndoManager.js          # ✅ Implemented
│   ├── SelectionManager.js     # ✅ Implemented
│   ├── ClipboardManager.js     # ⏳ Planned
│   └── HotkeyManager.js        # ✅ Implemented
│
├── ui/                          # ✅ PHASE 1 COMPLETE
│   ├── UIManager.js            # ✅ Implemented
│   ├── Toolbar.js              # ✅ Implemented
│   ├── InspectorPanel.js       # ✅ Implemented
│   └── StatusBar.js            # ✅ Implemented
│
├── graph/                       # ✅ PHASE 2 COMPLETE
│   ├── GraphEditor.js          # ✅ Implemented
│   ├── StateNode.js            # ✅ Implemented
│   ├── TransitionEdge.js       # ✅ Implemented
│   ├── TransitionInspector.js  # ✅ Implemented
│   └── ParameterWidget.js      # ✅ Implemented
│
├── timeline/                    # ✅ PHASE 3 COMPLETE
│   ├── TimelinePanel.js        # ✅ Implemented
│   ├── DopeSheet.js            # ✅ Implemented
│   ├── CurveEditor.js          # ✅ Implemented
│   └── KeyframeData.js         # ✅ Implemented
│
├── ik/                          # ✅ PHASE 4 COMPLETE
│   ├── IKSolver.js             # ✅ Implemented
│   ├── IKHandle.js             # ✅ Implemented
│   └── FootIK.js               # ✅ Implemented
│
├── viz/                         # ⏳ Phase 6
│   ├── OnionSkinning.js
│   └── MotionTrail.js
│
├── events/                      # ✅ PHASE 5 COMPLETE
│   ├── AnimationEvent.js       # ✅ Implemented
│   └── EventManager.js         # ✅ Implemented
│
├── retarget/                    # ⏳ Phase 7
│   ├── HumanoidAvatar.js
│   └── Retargeter.js
│
└── utils/                       # ⏳ As needed
    ├── BoneUtils.js
    └── MathUtils.js
```

---

## 🎯 Priority Matrix

| Phase | Priority | Complexity | User Value | Status |
|-------|----------|------------|------------|--------|
| Phase 1: Foundation | 🔴 Critical | Medium | High | ✅ **COMPLETE** |
| Phase 2: Graph Editor | 🔴 Critical | High | Very High | ✅ **COMPLETE** |
| Phase 3: Timeline | 🔴 Critical | High | Very High | ✅ **COMPLETE** |
| Phase 4: IK | 🟡 High | High | High | ✅ **COMPLETE** |
| Phase 5: Events | 🟡 High | Medium | High | ✅ **COMPLETE** |

| Phase 6: Onion Skin | 🟢 Medium | Low | Medium | ⏳ Planned |
| Phase 7: Retargeting | 🟢 Medium | High | High | ⏳ Planned |
| Phase 8: Polish | 🔵 Low | Low | Medium | ⏳ Planned |

---

## 🛠️ Tech Stack Recommendations

- **Canvas Rendering**: HTML5 Canvas API for graph/timeline
- **State Management**: Custom event-driven store (no external deps)
- **Math**: THREE.js (already in project) for quaternion/matrix ops
- **UI Controls**: Native HTML + CSS (extend existing styles.css)
- **Serialization**: JSON with schema validation

---

## 📋 Verification Strategy

Since this is an editor tool with complex UI interactions, verification will primarily be:

1. **Manual Testing**: 
   - Each phase will include a checklist of features to manually verify
   - Test on multiple character models (Knight, Mixamo rigs)

2. **Browser Console Validation**:
   - Log state machine transitions
   - Verify keyframe data integrity on export

3. **Visual Inspection**:
   - Compare animation output with expected poses
   - Check IK solver convergence

4. **Integration Tests** (Future):
   - Automated browser tests using Playwright (optional, if requested)

---

## 🚀 Recommended Starting Point

**Begin with Phase 1 + Phase 3 (Timeline/Dope Sheet)** as they provide the most immediate value for animation authoring. The Graph Editor (Phase 2) is important but can be built in parallel.

---

*This roadmap reflects an ambitious but achievable transformation of the Deep Animator into a professional-grade tool. Each phase can be implemented incrementally while maintaining a working editor.*
