# 🚶 Feature Specification: Procedural Character Controller

**Status**: Draft
**Target Module**: [js/core/character.js](js/core/character.js) (Refactor of [player.js](player.js))
**Dependencies**: Three.js AnimationSystem, [js/core/input.js](js/core/input.js), [js/core/physics-provider.js](js/core/physics-provider.js)

---

## 1. Overview
This feature don't replaces the current static First-Person camera it adds another mode with a fully rigged 3D character displayed in Third-Person. The system utilizes a **Hybrid Animation Architecture**: combining pre-baked animations (Walk, Run) with real-time procedural bone manipulation to simulate environmental interactions (struggling against wind, terrain unevenness) and future combat mechanics.

## 2. Asset Requirements
- **Model**: A rigged humanoid character (`.glb`/`.gltf`) with a standard bone hierarchy:
  - `Hips` -> `Spine` -> `Neck` -> `Head`
  - `UpperLeg` -> `LowerLeg` -> `Foot`
- **Animations**: Basic loopable clips embedded in the GLB:
  - `IDLE`
  - `WALK_FORWARD`
  - `RUN_FORWARD`
  - `COMBAT_IDLE` (Future use)

## 3. Architecture: The Layered Animation System
We will implement a layered approach where the final pose of the character is calculated in three passes per frame.

### Layer 1: The Kinematic Base (Baked)
Standard skeletal animation via `THREE.AnimationMixer`.
- **Input**: Player Velocity magnitude.
- **Logic**: Smoothly blend between `IDLE` (weight 1.0 at speed 0) and `WALK` (weight 1.0 at speed 5).
- **Code Path**: `character.mixer.update(deltaTime)`

### Layer 2: The Environmental Layer (Procedural Wind)
This layer modifies the Spine, Neck, and Shoulder bones after the mixer update but before the render.

**The "Wind Struggle" Algorithm:**
- **Global Wind Vector**: Defined in `js/environment/weather.js` (New module).
- **Dot Product Calculation**: Calculate the alignment between `CharacterForwardVector` and `WindVector`.

$$Alignment = \vec{V}_{char} \cdot \vec{V}_{wind}$$

- `$1.0$` = Tailwind (Wind pushes back).
- `$-1.0$` = Headwind (Wind hits face).
- `$0.0$` = Crosswind (Wind hits side).

**Procedural Rotation:**
- **Headwind**: Rotate Spine +X (Lean forward to resist).
- **Crosswind**: Rotate Spine Z (Lean into the wind).
- **Turbulence**: Add a Perlin noise offset to `Rotation.x/z` to simulate gusts/instability.

### Layer 3: The Terrain Layer (Inverse Kinematics)
To handle steep terrain like The Everest without feet clipping or floating.
- **Raycast**: Cast ray down from Hips position + Offset for each foot.
- **Adjustment**: If ground is higher than foot bone position, lift the UpperLeg and LowerLeg bones analytically to place the foot on the surface.

## 4. Input & Control Scheme
The control scheme updates [js/core/input.js](js/core/input.js) to support character-relative movement.

| Action | Input | Logic |
| :--- | :--- | :--- |
| **Move** | WASD / Stick | Movement vector is relative to Camera Look Direction, not World Z. |
| **Sprint** | SHIFT / L3 | Changes `MaxSpeed` variable; affects wind struggle intensity. |
| **Combat Mode** | R_CLICK / L2 | Locks character rotation to Camera Forward; enables strafing; raises procedural arm bones. |
| **Interact** | E / Square | Raycast forward to detect vehicles or items. |

## 5. Implementation Classes

### 5.1. CharacterController Class ([js/core/character.js](js/core/character.js))

```javascript
export class CharacterController {
    constructor(scene, model, camera) {
        this.fsm = new FiniteStateMachine(); // Idle, Walk, Run, Jump
        this.bones = this._mapBones(model); // Cache bone references
        this.windFactor = 0.0;
    }

    update(dt, input, terrainData) {
        // 1. Handle Movement Physics (Capsule Collider)
        this._applyMovement(dt, input);

        // 2. Update Baked Animations
        this._updateMixer(dt);

        // 3. Apply Procedural Layers
        this._applyWindProcedural(dt);
        this._applyTerrainIK(terrainData);
    }

    _applyWindProcedural(dt) {
        // Get global wind
        const windDir = window.GameLevel.windDirection; 
        const windStr = window.GameLevel.windStrength;

        // Calculate Lean
        // ... (Dot product logic here) ...
        
        // Apply to Spine
        this.bones.spine.rotation.x += leanAmount;
    }
}
```

### 5.2. Camera Upgrade ([js/core/camera.js](js/core/camera.js))
We must add a `ThirdPersonChase` mode distinct from the Car Chase.
- **Pivot Point**: Should be the character's Head/Neck, not feet.
- **Offset**: `(0.5, 1.8, -2.5)` (Over the shoulder view).
- **Smoothing**: High dampening on rotation, low dampening on position to keep the player framed during wind gusts.

## 6. Combat & Future Expansion
The architecture supports combat through **Procedural Masking**:
- **Aiming**: When in combat mode, we override the Spine and RightArm rotation to point exactly where the camera is looking.
- **Recoil**: A simple function `applyRecoil(force)` that momentarily rotates the Spine backwards and Head upwards, then decays back to zero.
- **Hit Reaction**: Instead of playing a generic animation, if hit from the left, add a large impulsive rotation to the Spine to the right.

## 7. Development Roadmap

### Phase 1: The Skeleton (Days 1-2)
- Import Rigged Model into scene.
- Refactor [player.js](player.js) to control the model's position via WASD.
- Map animation clips to velocity (0-1 speed).

### Phase 2: The Camera (Day 3)
- Implement 3rd person camera logic that rotates around the player model.
- Ensure "Forward" on stick means "Forward relative to Camera."

### Phase 3: The Wind (Days 4-5)
- Implement the `_applyWindProcedural` function.
- Add a debug slider in the UI to change Wind Direction/Strength and test the character's "leaning" response.

### Phase 4: Terrain IK (Day 6)
- Add raycasters to the feet.
- Implement simple leg lifting logic for the uneven Dunes and Everest terrain.
