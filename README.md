# 🏎️ Universal Racing & Flight Simulator

> **A browser-based, high-fidelity vehicle simulation engine building on Three.js.**  
> Features realistic raycast vehicle physics, 6-DOF aerodynamics, infinite procedural terrains, and a fully-featured in-game level editor.

![Three.js](https://img.shields.io/badge/Three.js-r160-black?logo=three.js)
![Physics](https://img.shields.io/badge/Physics-Custom_RigidBody-red)
![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen)

---

## 📚 Table of Contents
- [✨ Key Features](#-key-features)
- [🎮 Controls & Input](#-controls--input)
- [🔧 Technical Architecture](#-technical-architecture)
- [🏎️ Physics Engine Deep Dive](#-physics-engine-deep-dive)
- [🌌 Rendering & Visuals](#-rendering--visuals)
- [🛠️ Level Editor Manual](#-level-editor-manual)
- [🚀 Content Overview](#-content-overview)
- [📝 Installation](#-installation)

---

## ✨ Key Features

### Core Gameplay
- **Hybrid Vehicle System**: Seamlessly switch between realistic cars, stunt planes, and on-foot exploration.
- **Infinite Worlds**: Procedurally generated terrains including infinite ice mountains, deep space voids, and vaporwave highways.
- **Dynamic Time & Weather**: Full 24-hour day/night cycle with volumetric fog, wind effects, and atmospheric scattering.

### Advanced Physics
- **Raycast Suspension**: 4-point independent suspension with compression damping and bump stops.
- **Tire Model**: Pacejka-inspired friction curves with surface-dependent grip (Tarmac, Ice, Sand, Dirt).
- **Aerodynamics**: Drag, lift, and downforce simulation for both cars and planes.
- **Flight Dynamics**: 6-DOF physics with thrust vectoring, stalling, and banking mechanics.

### Creative Tools
- **In-Game Editor**: Fly-camera based editor to place objects, ramps, and cosmic phenomena in real-time.
- **Procedural Objects**: Configure black holes, nebulae, and loop-the-loops with tweakable parameters.
- **Save/Load System**: Export your custom tracks to JSON and share them.

---

## 📁 Project Structure & Architecture

The project follows a modular, component-based architecture designed for extensibility.

```bash
Racing/
├── index.html              # Main entry point (DOM structure, UI overlay)
├── styles.css              # Glassmorphism UI, HUD, and Editor styling
├── js/
│   ├── main.js             # Game Bootstrapper & State Machine (Menu/Play/Editor)
│   │
│   ├── core/               # Central Systems
│   │   ├── input.js        # Universal input handler (Keyboard + Gamepad)
│   │   ├── camera.js       # Camera controller (Chase, Cockpit, Fly modes)
│   │   ├── car.js          # Car entity logic (Visuals + Audio + Input mapping)
│   │   ├── plane.js        # Plane entity logic & Aerodynamics
│   │   ├── player.js       # On-foot first-person controller
│   │   └── vehicle-specs/  # Configuration files for each car (AE86, RX7, Cobra)
│   │
│   ├── physics/            # Deterministic Physics Engine
│   │   ├── new_car_physics.js  # The custom RigidBody + Suspension engine
│   │   ├── physics-provider.js # Interface for terrain collision queries
│   │   └── car_physics.js      # (Legacy) Old physics implementation
│   │
│   ├── environment/        # Visual Enivronment
│   │   ├── sky.js          # Day/Night cycle & Atmospheric scattering
│   │   ├── starfield.js    # Procedural stars & Milky Way rendering
│   │   ├── wind.js         # Volumetric fog & wind effect controller
│   │   └── BlackHole.js    # Shader-based cosmic entity
│   │
│   ├── terrain/            # Infinite Terrain Generators
│   │   ├── terrain.js      # Base class & Simplex noise utils
│   │   ├── deep-space.js   # Void generator
│   │   ├── city.js         # Procedural city grid generator
│   │   └── ...             # (dunes.js, everest.js, ice-mountain.js, etc.)
│   │
│   ├── editor/             # Level Editor System
│   │   ├── EditorController.js # Editor state logic & UI bindings
│   │   ├── SceneObjectManager.js # Gizmos & Object placement logic
│   │   ├── AssetLibrary.js     # Registry of placeable props
│   │   └── LevelSerializer.js  # JSON Import/Export logic
│   │
│   └── levels/             # Data
│       ├── level-data.js   # Configuration presets for all levels
│       └── level-manager.js # Factory for instantiating terrain
│
└── assets/                 # Binary Assets
    ├── models/             # GLTF/GLB 3D models (Cars, Plane, Props)
    └── texture/            # Textures & Sprites
```

### Architectural Highlights

1.  **State Machine (`main.js`)**
    The game operates efficiently by sequestering logic into three distinct states:
    -   `MENU`: Lightweight rendering, UI focused.
    -   `PLAY`: Full physics simulation loop, HUD active.
    -   `EDITOR`: Physics paused, `FlyControls` active, Object manipulation enabled.

2.  **Physics Decoupling**
    The physics engine (`new_car_physics.js`) is entirely math-based and decoupled from Three.js. It accepts an Input state and a `PhysicsProvider` (terrain), then outputs a raw position/quaternion. This separation allows the physics to run at a fixed timestep for determinism, while the visuals interpolate at the monitor's refresh rate.

3.  **Terrain Strategy Pattern**
    All terrains share a common interface. The `LevelManager` instantiates the correct class (e.g., `DunesGenerator` or `CityGenerator`) at runtime. This makes adding new infinite worlds as simple as creating a new class file and adding it to the registry.

---

## 🎮 Controls & Input

The game supports automatic switching between Keyboard/Mouse and Gamepad (DualSense/Xbox) inputs.

### 🚗 Car Controls
| Action | Keyboard | Gamepad |
|--------|----------|---------|
| **Throttle** | `W` / `↑` | `R2` / `Right Trigger` |
| **Brake / Reverse** | `S` / `↓` | `L2` / `Left Trigger` |
| **Steering** | `A` `D` / `←` `→` | `Left Stick` |
| **Handbrake** | `Space` | `Circle` / `B` |
| **Nitro / Sprint** | `Shift` | `L3` |
| **Enter/Exit Vehicle** | `F` | `Triangle` / `Y` |
| **Headlights** | `H` | - |
| **Shift Up (Manual)** | `E` | `R1` |
| **Shift Down (Manual)** | `A` | `L1` |

### ✈️ Flight Controls
| Action | Keyboard | Gamepad |
|--------|----------|---------|
| **Pitch** (Nose Up/Down) | `W` / `S` | `Left Stick Y` |
| **Roll** | `Q` / `D` | `Left Stick X` (or Steering) |
| **Yaw** (Rudder) | `A` / `E` | `L1` / `R1` |
| **Thrust** | `Shift` | `R2` |
| **Air Brake / Reverse** | `S` (Ground) | `L2` |
| **Hover Mode** | `X` | `Cross` / `A` |

### 🛠️ Editor & General
| Action | Key | Description |
|--------|-----|-------------|
| **Toggle Camera** | `C` | Cycle between Chase, Cockpit, Hood, and On-Foot views |
| **Time Control** | `T` | Pause/Resume Time |
| **Time Speed** | `[` `]` | Decrease/Increase day/night cycle speed |
| **Retro Mode** | `F4` | Toggle 16-bit CRT shader effect |
| **Debug Mode** | `P` | Show physics debug lines (suspension rays, forces) |

---

## 🔧 Technical Architecture

### Game Loop & State Machine
The application runs on a strict state machine architecture defined in `main.js`:
1.  **MENU**: Level selection, vehicle configuration, and settings.
2.  **PLAY**: Active gameplay loop with physics steps and rendering.
3.  **EDITOR**: Paused physics, enabled fly-camera, and object manipulation tools.

### Component System
-   **Core**: `Game` class initializes subsystems (Renderer, Input, Audio).
-   **Physics**: Decoupled physics engine running on a fixed timestep for deterministic behavior.
-   **Environment**: Modular systems for Sky (`sky.js`), Stars (`starfield.js`), and Particles (`spark-system.js`).
-   **Terrain**: Strategy pattern for terrain generation. Each level type (`dunes.js`, `deep-space.js`) implements a common `TerrainGenerator` interface.

4.  **Level Editor Architecture**
    The editor uses a composition pattern where `EditorController` orchestrates three specialized subsystems:
    -   `SceneObjectManager`: Handles raycasting, gizmo manipulation, and object placement.
    -   `AssetLibrary`: Manages asynchronous loading and previewing of 3D assets.
    -   `LevelSerializer`: Converts the scene graph into a JSON schema (position, rotation, scale, metadata) for persistence.

---

## 🏎️ Physics Engine Deep Dive

### 📐 New Car Physics (`new_car_physics.js`)
State-of-the-art rigid body simulation tailored for arcade-simulation balance.
-   **Integration**: Uses semi-implicit Euler integration for stability.
-   **Inertia Tensor**: Approximated box inertia tensor allows for realistic tumbling and mid-air rotation.
-   **Suspension**:
    *   **Hooke's Law**: $F = -k \cdot x - c \cdot v$ (Spring + Damping).
    *   **Bump Stops**: Hard collision response when suspension bottoms out ($x > travel$).
-   **Tire Friction**:
    *   Separates **Longitudinal** (Acceleration/Braking) and **Lateral** (Cornering) forces.
    *   **Slip Ratio**: Calculates wheel spin relative to ground speed for realistic burnouts.
    *   **Circle of Friction**: Clamps total tire force to usually $F_{max} = \mu \cdot F_{normal}$.
-   **Drift Mechanics**:
    *   Detects high slip angles to engage "Drift State".
    *   Modifies lateral friction coefficients dynamically to allow sustained slides without spinning out.
    *   Applies "Speed Boost" to steering at high velocities to counter understeer.

### ✈️ Flight Dynamics (`plane.js`)
6-Degrees-of-Freedom (6-DOF) physics model.
-   **Aerodynamics**: Lift and Drag forces are calculated based on velocity squared and angle of attack.
    *   *Lift*: $L = 0.5 \cdot \rho \cdot v^2 \cdot C_L \cdot A$
    *   *Drag*: $D = 0.5 \cdot \rho \cdot v^2 \cdot C_D \cdot A$
-   **Thrust Vectoring**: Allows for VTOL-like maneuvers (Hover Mode).
-   **Ground Effect**: simulated "cushion" when flying close to terrain.

---

## 🌌 Rendering & Visuals

### Dynamic Sky System
-   **Atmospheric Scattering**: Custom fragment shader (`sky.js`) blends horizon, zenith, and sun colors based on Rayleigh scattering approximation.
-   **Volumetric Fog**: Density varies by biome (e.g., thick sandstorms in Dunes, clear void in Deep Space).
-   **Starfield**:
    *   Procedural generation of 15,000+ stars with individual size and color attributes.
    *   **Milky Way**: Rendered using a combination of point clouds and a custom GLB model with emissive materials.
    *   **Twinkle Shader**: Stars shimmer based on time uniforms in the vertex shader.

### Post-Processing Pipeline
1.  **RenderPass**: Main scene render.
2.  **UnrealBloomPass**: High-dynamic-range glow (critical for neon levels and stars).
3.  **Retro16BitShader**: Custom shader that quantizes colors (5-6-5 bits) and adds pixelation/scanlines for a vintage aesthetic.

### Particle Systems
-   **Sparks**: GPU-instanced geometry emitted on collision impacts.
-   **Tire Smoke**: Alpha-blended sprites generated based on wheel slip ratio.
-   **Speed Lines**: Vertex-displacement shader that stretches lines based on camera velocity ("Star Wars" warp effect).

---

## 🛠️ Level Editor Manual

Access the editor from the Main Menu or by pressing the **Editor** card.

### Features
-   **Fly Controls**: `WASD` to move, `Right-Click Drag` to look. `Shift` for speed.
-   **Gizmos**: Visual handles for Translation, Rotation, and Scaling.
-   **Snapping**: Press `G` or the "Snap to Ground" button to align objects with terrain.
-   **Procedural Objects**:
    *   **Black Holes**: Customizable Disk Radius, Event Horizon Color, and Distortion strength.
    *   **Ramps/Loops**: Math-generated geometry for smooth stunt driving.

### Object Management
-   **Inspector**: Select an object to view its properties (Position, Scale, Custom Params).
-   **Asset Library**: Drag and drop assets from the sidebar (Speed Boosts, Neon Rings, Barriers).
-   **Serialization**: Levels are saved to LocalStorage automatically. Use **Export/Import** to save to `.json` files.

---

## 🚀 Content Overview

### Terrains
1.  **Grasslands**: Rolling procedural hills. Good for testing suspension.
2.  **Desert Dunes**: Large-scale sand simulation with high friction drag.
3.  **The Everest**: 10km² map starting at 800m elevation. Extreme downhill physics.
4.  **Deep Space**: Zero-gravity feel (visual only), infinite void. Features galaxies and nebulae.
5.  **Vaporwave**: "Neon Horizon". Infinite highway with synthwave aesthetics.
6.  **City**: Procedural urban grid with skyscrapers and tight alleyways.

### Vehicles
-   **Toyota AE86**: The drift king. RWD, lightweight, loose rear end.
-   **Mazda RX-7**: Rotary power. Higher grip, higher top speed.
-   **Shelby Cobra**: High torque V8. Requires careful throttle control.
-   **F-16 Jet / Stunt Plane**: High thrust-to-weight ratio, extremely agile.

---

## 📝 Installation

1.  **Clone the project**
    ```bash
    git clone https://github.com/yourusername/racing-sim.git
    cd racing-sim
    ```

2.  **Start a local server**  
    *Due to ES6 Modules and CORS security for textures/models, you cannot just open `index.html`.*
    
    Using Node.js (npx):
    ```bash
    npx -y serve .
    ```
    
    Using Python:
    ```bash
    python -m http.server 8000
    ```

3.  **Launch**
    Open `http://localhost:3000` (or the port shown in your terminal).

---

**License**: Educational / Personal Use.  
**Credits**: Built with [Three.js](https://threejs.org/).
