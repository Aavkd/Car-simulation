# AE86 Freeroam - Technical & Architecture Overview

## 1. Project High-Level Overview
This project is a high-fidelity WebGL racing and flight simulation engine built on **Three.js**. It differentiates itself from standard web games through a bespoke physics engine, procedural infinite terrain generation, and a fully featured in-game level editor. The architecture is designed to support seamless transitions between vehicle simulation (Car/Plane) and first-person exploration.

---

## 2. Core Architecture & Game Loop

### 2.1 Entry Point: `js/main.js`
The `Game` class orchestrates the entire application lifecycle.
- **State Machine**:
    - `MENU`: Landing screen (Level selection, Vehicle configuration).
    - `PLAY`: Active simulation state.
    - `EDITOR`: Level design and testing.
- **Render Loop** (`_animate`):
    - Delegates update calls to active controllers (`SkySystem`, `CarPhysics` / `PlanePhysics`, `SceneObjectManager`).
    - Manages the `EffectComposer` for post-processing.
- **Post-Processing**:
    - **Retro16BitShader**: Custom GLSL shader combining pixelation, color quantization, and scanlines for the "Vintage" filter mode.

### 2.2 Scene Management
- **SceneObjectManager** (`js/editor/SceneObjectManager.js`):
    - Manages lifecycle of static (buildings, rocks) and dynamic (black holes) objects.
    - Handles **TransformControls** (Translate, Rotate, Scale) in Editor mode.
    - Implements Undo/Redo history stacks.
    - Serializes scene graph to JSON for level saving.

### 2.3 Level Management
- **LevelData** (`js/levels/level-data.js`):
    - Central repository of level configurations (ID, Name, Description, Terrain Type, Params).
    - Defines properties for distinct biomes like `everest` (high peaks), `dunes` (sand physics), and `deepspace` (void).
- **LevelManager** (`js/levels/level-manager.js`):
    - Factory class responsible for instantiating the correct `TerrainGenerator` subclass based on `LevelData`.
    - Manages loading/unloading of terrain resources (meshes, materials).

### 2.4 Input System (`js/core/input.js`)
- Abstracts hardware input (Keyboard, Gamepad) into logical actions (`throttle`, `brake`, `boost`, `camera_toggle`).
- Supports analog inputs for smooth steering/flying.

---

## 3. Physics Simulation Systems

### 3.1 Vehicle Physics (`js/physics/new_car_physics.js`)
A custom rigid-body physics engine tailored for arcade-simulation racing.
- **Integration**: Euler integration for position/rotation.
- **Suspension**: 4-point Raycast Spring-Damper model.
- **Tire Model**:
    - Calculates slip angles and lateral forces.
    - **Drift Logic**: Specialized math to maintain controlled slides (counter-steering assistance, grip loss thresholds).
- **Drivetrain**: Simulates Engine RPM, Torque Curve, Gear Ratios, and Transmission.

### 3.2 Aerodynamics / Flight Physics (`js/core/plane.js`)
A complete 6-DOF flight model.
- **Forces**:
    - **Lift**: Calculated based on angle of attack and airspeed.
    - **Drag**: Air resistance acting opposite to velocity.
    - **Thrust**: Jet engine force.
    - **Gravity**: Constant downward acceleration.
- **Terrain Following**: "Ground Effect" logic allowing the plane to hover/surf along the terrain contours.

### 3.3 Physics Provider Interface (`js/physics/physics-provider.js`)
Abstraction layer decoupling physics from terrain geometry.
- `getHeightAt(x, z)`: Returns minimal ground height.
- `getNormalAt(x, z)`: Returns surface slope.
- `getSurfaceType(x, z)`: Returns material properties (Friction, Drag) enabling different driving feels (Ice vs Tarmac).

---

## 4. Entities & Controls

### 4.1 Player Controller (`js/core/player.js`)
Handles the **on-foot** First Person exploration mode.
- **Movement**: FPS-style WASD movement with collision handling against the terrain.
- **Interactions**: Raycasting logic for determining interactive objects (e.g., entering vehicles).

### 4.2 Car Controller (`js/core/car.js`)
The visual controller for the vehicle.
- Updates wheel mesh positions based on physics suspension data.
- Manages visual effects: Headlights, Taillights, Brake lights.

### 4.3 Camera System (`js/core/camera.js`)
A composite camera system managing multiple view modes:
- **Orbit**: Free camera for vehicle inspection.
- **Chase**: Dynamic camera that follows the vehicle velocity and drift angle.
- **Cockpit**: First-person dashboard view.
- **FPS**: Attached to the `PlayerController` for on-foot movement.

---

## 5. Environment & Visual Systems

### 5.1 Sky & Time (`js/environment/sky.js`)
- **Dynamic Day/Night Cycle**: Real-time transitions affecting global lighting, fog, and sun/moon positions.
- **Procedural Sky Dome**: Gradient based on solar elevation.
- **Lighting**: Dynamic `DirectionalLight` (Sun/Moon) casting shadows, coupled with `HemisphereLight` for ambient.

### 5.2 Atmospheric Effects
- **Northern Lights** (`js/environment/northern-lights.js`):
    - Procedural mesh strips with moving UV textures simulating Aurora Borealis.
    - Visibility controlled by night cycle.
- **Wind System** (`js/environment/wind.js`):
    - Moving fog banks/wisps to create a sense of speed and atmosphere.
    - Responsive to time of day (color shifts).

### 5.3 Starfield & Deep Space (`js/environment/starfield.js`)
- **Stars**: Particle system with thousands of points.
- **Milky Way**: Custom GLB model with emissive materials, fading in at night.
- **Nebula**: Billboard clouds for deep space ambience.

### 5.4 Black Hole (`js/environment/BlackHole.js`)
- **Technique**: Volumetric Raymarching via a custom GLSL Fragment Shader.
- **Features**:
    - Gravitational Lensing (bending light).
    - Accretion Disk with procedural noise.
    - Doppler beaming effect.

### 5.5 Particle FX
- **SparkSystem** (`js/core/spark-system.js`): High-velocity sparks collision logic (Metal vs Asphalt).
- **TireSmoke** (`js/core/tire-smoke.js`): Generated based on lateral slip velocity.
- **ExhaustSystem** (`js/core/exhaust-system.js`): Backfire and idle smoke.

---

## 6. Procedural Terrain & Levels

### 6.1 Terrain Engine (`js/terrain/terrain.js`)
- **Base Algorithm**: Perlin Noise (FBM - Fractional Brownian Motion) for heightmap generation.
- **Vertex Coloring**: Procedural texturing based on height/slope (Snow peaks, grassy valleys, sandy beaches).

### 6.2 Terrain Variants
- **City** (`js/terrain/city.js`): Grid-based street generation.
- **Dunes** (`js/terrain/dunes.js`): Sine-wave based desertscapes.
- **Cosmic / Deep Space**: Flattened or specialized geometry for non-terrestrial levels.
- **Ice Mountain**: High-frictionless surface properties for sliding gameplay.

---

## 7. Editor System (`js/editor`)

The in-game editor allows for runtime creation and modification of levels. It is a critical component for content generation.

### 7.1 Editor Controller (`js/editor/EditorController.js`)
- **UI Management**: Uses `lil-gui` to expose properties for Terrain, Environment, and Objects.
- **Mode Switching**: Toggles between Editing (fly cam) and Play Testing (vehicle physics).
- **Persistence**: Handles Save/Load/Export/Import of level JSON data.

### 7.2 Asset & Object Management
- **AssetLibrary**: Registry of available 3D models and procedural object generators.
- **Transform Tools**: Integration of Three.js `TransformControls` for intuitive object manipulation.
- **Procedural Objects**: Special handling for objects like Black Holes that have editable parametric properties (color, scale, distortion) exposed in the GUI.

---

## 8. Vehicle Specifications (`js/core/vehicle-specs/`)
Data-driven design for expanding the car roster.
- **ToyotaAE86**: Balanced drift car.
- **MazdaRX7**: High RPM rotary engine.
- **ShelbyCobra427**: High torque, muscle car handling.

*Each spec defines:*
- Dimensions (Wheel track, wheelbase).
- Engine (Power curve, Redline).
- Suspension (Stiffness, Damping, Rest length).
- Visuals (Light positions, Exhaust positions).

---

## 9. RPG Implementation (Phase 4 Status)
The project has successfully integrated the core RPG architecture and data pipeline.

### 9.1 Architecture
- **RPGManager** (`js/rpg/systems/RPGManager.js`): Singleton orchestrator. Initializes all subsystems and data.
    - **InventoryManager**: Handles item storage and lookups.
    - **QuestManager**: Manages quest states, objectives, and progression.
    - **DialogueSystem**: Logic for traversing conversation trees and triggering events.
- **Data Layer** (`js/rpg/RPGData.js`):
    - Central registry importing static definitions from `js/rpg/data/`.
    - **Files**: `quests.js`, `dialogues.js`, `items.js`, `npcs.js`.
    - **Format**: JS Objects/Arrays exporting const data (e.g. `export const QUESTS = [...]`).

### 9.2 Entities & Spawning
- **NPCEntity** (`js/rpg/entities/NPCEntity.js`): Wraps a visual mesh with RPG data (Name, Dialogue ID).
- **Spawning**: `RPGManager` iterates over the `NPCS` data registry on initialization and spawns entity placeholders (Capsules) or models into the scene.

### 9.3 Interaction Flow
1.  **Input**: Player presses 'E' (Interact).
2.  **Detection**: Raycaster finds object with `userData.interactive = true`.
3.  **Trigger**: `NPCEntity.onInteract()` calls `RPGManager.dialogueSystem.startDialogue(npc.dialogueId)`.
4.  **Dialogue**: UI (console for now) displays text -> Player selects option -> Triggers Quest (via `startQuest`) or Item events.
