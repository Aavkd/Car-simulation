# Phase 4: Advanced Posing & IK
**Date:** January 13, 2026
**Status:** Completed
**Focus:** Inverse Kinematics (IK) system for character posing.

---

## 🏗️ Architecture

Phase 4 introduced a robust Inverse Kinematics system to simplify character posing. It allows users to manipulate bone chains (like arms and legs) by moving a target effector, rather than rotating individual bones.

```
js/editor/animator/
├── ik/
│   ├── IKSolver.js       // cyclic Coordinate Descent (CCD) solver
│   └── IKHandle.js       // Visual helper & target data
└── AnimatorEditorController.js // Integration & UI
```

### 1. IK Solver (`IKSolver.js`)
*   **Algorithm:** Cyclic Coordinate Descent (CCD). This is an iterative algorithm that adjusts joint rotations to minimize the distance between the end-effector and the target.
*   **Features:**
    *   Supports multiple independent IK chains.
    *   Configurable iterations (default: 10) for performance vs. accuracy balance.
    *   Distance-based tolerance check (0.001 units).
*   **Usage:** The solver is updated every frame in the `AnimatorEditorController` update loop when in Pose Mode.

### 2. IK Handle (`IKHandle.js`)
*   **Visuals:** Represented by a **Magenta Wireframe Box** to distinguish it from standard green bone helpers.
*   **Function:** Acts as a selectable scene object that the `TransformControls` can attach to.
*   **Structure:** Wraps a `THREE.Object3D` target that the solver tries to reach.

### 3. Editor Integration (`AnimatorEditorController.js`)
*   **Creation:** New `createIKChain()` method automatically detects the limb hierarchy (defaulting to a 2-bone chain, e.g., Hand -> Forearm -> UpperArm).
*   **Selection:** The Raycaster was updated (`_onMouseDown`) to prioritize selecting IK handles in the scene.
*   **Cleanup:** `disablePoseMode()` automatically disposes of all IK handles and clears the solver to prevent memory leaks and state pollution.

---

## 🔧 Key Features Implemented

### 🦴 Inverse Kinematics
*   **Auto-Chain Creation:** Select a leaf bone (Hand/Foot) and click "Create IK Chain". The system automatically finds the parent bones to form a valid chain.
*   **Real-time Solving:** Dragging the handle solves the chain instantly, providing immediate visual feedback.
*   **Undo/Redo Support:** Since IK handles drive the actual bone `quaternion` properties, the existing `UndoManager` (which tracks bone rotations) works seamlessly with the results of the IK solve once keys are captured.

### 🎮 User Interface
*   **Pose Mode Inspector:** Added a new "Inverse Kinematics" section.
*   **Button:** "Creating IK Chain (2-Bone)" button is enabled when a bone is selected.

---

## 🔌 Integration Details

### AnimatorEditorController
*   **`createIKChain()`**: 
    1.  Identifies `effector` (selected bone) and `root` (grandparent).
    2.  Creates visual `IKHandle`.
    3.  Registers chain with `IKSolver`.
*   **`_selectIKHandle(handle)`**: Switches selection from Bone to IK Handle, attaching the transform gizmo.
*   **`update(dt)`**: Calls `ikSolver.update()` to apply rotations every frame.

---

## 📝 Future Improvements
*   **Pole Vectors:** Add support for explicit pole targets to control knee/elbow pointing direction (currently handled by CCD natural rotation).
*   **Chain Length UI:** Allow users to specify arbitrary chain lengths (e.g., for tails or spine).
*   **Constraint Limits:** Add angle constraints to prevent unnatural bending.
