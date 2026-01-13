# 🎬 Feature Design: Animation Import & Retargeting

**Status**: Draft
**Owner**: Editor Team
**Related Phase**: Phase 7 (Retargeting & Import/Export)

## 🎯 Objective
Enable users to import external animations (Mixamo, Blender, Libraries) into the Deep Animator, retarget them onto existing characters, and save them as native `.anim.json` clips.

---

##  Workflow Overview

```mermaid
graph TD
    A[User clicks 'Import' in Toolbar] --> B[File Picker (GLB/FBX/BVH)]
    B --> C{Format?}
    C -- GLB/GLTF --> D[Load via GLTFLoader]
    C -- FBX --> E[Load via FBXLoader]
    C -- BVH --> F[Load via BVHLoader]
    
    D & E & F --> G[Extract AnimationClip & Skeleton]
    G --> H[Retargeting Modal UI]
    
    H --> I[Auto-Map Bones]
    I --> J{Matches Correctly?}
    J -- No --> K[Manual Bone Mapping]
    J -- Yes --> L[Preview Animation]
    
    K --> L
    L --> M[Approve & Import]
    M --> N[Convert to Native Tracks]
    N --> O[Save as .anim.json]
```

---

## 🏗️ Technical Architecture

### 1. Importers
We need to introduce standard loaders to the editor environment.
- **GLTFLoader**: Already available in Three.js examples.
- **FBXLoader**: For standard industry assets.
- **BVHLoader**: For raw motion capture data.

### 2. Retargeting Logic (`Retargeter.js`)
External animations are bound to specific bone names and hierarchies (skeletons) that likely differ from the in-game characters. We need a retargeting system.

#### Bone Mapping Strategy
We will define a "Standard Humanoid" set (similar to Unity's Mecanim):
- Hips (Root)
- Spine, Chest, UpperChest
- Head, Neck
- LeftShoulder, LeftUpperArm, LeftLowerArm, LeftHand
- RightShoulder, RightUpperArm, RightLowerArm, RightHand
- LeftUpperLeg, LeftLowerLeg, LeftFoot, LeftToes
- RightUpperLeg, RightLowerLeg, RightFoot, RightToes

**Auto-Mapping**:
The system will attempt to regex match bone names (e.g., "Mixamorig:Hips" -> "Hips", "def_thigh_L" -> "LeftUpperLeg").

#### Retargeting Algorithm
1.  **Pose Retargeting**:
    -   Calculate `LocalRotation` for Source Bone relative to T-Pose.
    -   Apply that `LocalRotation` to Target Bone (accounting for T-Pose differences).
2.  **Root Motion**:
    -   Extract Hips position delta.
    -   Scale by `(TargetHeight / SourceHeight)`.

### 3. UI Components

#### Toolbar Update
Add an **Import** menu/button:
- "Import Animation..."
- "Import Model..." (Future)

#### Import Modal (`ImportDialog.js`)
A new floating panel that appears after file selection.
-   **Source Skeleton View**: Visualization of the imported file's skeleton.
-   **Target Skeleton View**: The currently selected entity.
-   **Mapping List**: Side-by-side list of Target Bone <-> Source Bone.
-   **Preview Controls**: Play/Pause to see how the mapping looks.
-   **Import Settings**:
    -   *Renaming*: Prefix/Suffix for action name.
    -   *Scale*: Global scale multiplier.
    -   *Remove Root Motion*: Checkbox to strip translation.

---

## 📝 Data Structures

### BoneMap
```javascript
{
    "Hips": "mixamorig:Hips",
    "Spine": "mixamorig:Spine",
    "LeftUpperArm": "mixamorig:LeftArm",
    // ...
}
```

### ImportSelection
```javascript
{
    fileName: "Combat_Pack.fbx",
    selectedClips: [
        { name: "Punch_01", checked: true },
        { name: "Kick_02", checked: false }
    ]
}
```

---

## 🚀 Implementation Steps

1.  **Loaders Integration**: Add `FBXLoader` and `BVHLoader` to project dependencies/utils.
2.  **Skeleton Visualizer**: Create a utility to view raw skeletons from loaded files without adding them to the main scene graph.
3.  **Humanoid Mapper**: Implement the heuristic bone mapper.
4.  **UI Construction**: Build the `ImportDialog` class in `js/editor/animator/ui/`.
5.  **Conversion Logic**: Write `Retargeter.js` to process `THREE.AnimationClip` into the editor's native keyframe format.

---

## ⚠️ Challenges & Risks

-   **Rotational Offsets**: Different rigs have different "zero" rotations (A-Pose vs T-Pose). We must enforce a T-Pose calibration step or calculate offsets.
-   **Scale Differences**: Mixamo is usually meters, Blender can be whatever. Auto-scaling based on height is required.
-   **Performance**: Loading large FBX files can hiccup the browser. Use a loading spinner.

