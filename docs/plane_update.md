# Feature Specification: Flight Simulation & Aerodynamics
**Status**: Implemented ✅
**Module**: `js/core/plane.js`
**Asset**: `assets/models/Jet.glb`

## 1. Overview
This feature introduces a 6-DOF (Six Degrees of Freedom) flight model to the existing AE86 Freeroam engine. It allows players to discover a parked Jet, enter it using the existing character controller, and fly seamlessly across the generated terrains using realistic aerodynamic principles.

## 2. Asset Integration
- **Model Source**: `assets/models/Jet.glb`
- **Scale Factor**: Normalized to match the world scale (1.0).
- **Shadows**: Cast and Receive shadows enabled.
- **Initial Position**: Parked at position (30, 0, 30).

## 3. Physics Model (Implemented)
The plane uses a dedicated aerodynamic force model applied to a rigid body, distinct from the car's raycast suspension.

### 3.1. Core Forces
- **Thrust**: Applied along the local Forward Vector (+Z). Controlled by throttle input.
- **Lift**: Calculated based on speed and an approximation of angle of attack to oppose gravity.
- **Drag**: Air resistance opposing velocity.
- **Gravity**: Constant downward force (-Y world axis).

### 3.2. Handling Characteristics
- **Stalling**: Lift decreases significantly at low speeds, causing the plane to lose altitude.
- **Banking**: Rolling the plane rotates the lift vector, facilitating turns.
- **Ground Collision**: Basic collision detection prevents the plane from falling through the floor (y < 0).

## 4. Controls & Input Mapping
Extended `js/core/input.js` to support "Flight Mode" with the following mappings:

### Gamepad (DualShock 5 Style)
| Axis / Button | Action | Physics Result |
| :--- | :--- | :--- |
| **Left Stick X** | Roll | Rotates mesh around Local Z axis (Ailerons) |
| **Left Stick Y** | Pitch | Rotates mesh around Local X axis (Elevators) |
| **L1 / R1** | Yaw | Rotates mesh around Local Y axis (Rudder) |
| **R2** | Thrust + | Increases engine thrust / Forward Velocity |
| **L2** | Airbrake | Reduces Thrust / Increases Drag |
| **Enter/Exit** | Exit | Eject/Exit vehicle (reverts to player.js) |

### Keyboard Fallbacks
- **W/S**: Pitch Down/Up
- **A/D**: Roll Left/Right
- **Q/E**: Yaw Left/Right
- **Shift/Ctrl**: Thrust/Airbrake

## 5. Camera System Updates
Updated `js/core/camera.js` with a new **`flight`** mode:
- **Roll Locking**: Camera rotates with the plane's horizon.
- **Dynamic FOV**: FOV widens as speed increases (75° to 95°).
- **Smooth Interaction**: Smoothly interpolates position and look-at targets behind the plane.

## 6. Implementation Architecture

### 6.1. New Class: `js/core/plane.js`
- Implements `PlanePhysics` class.
- Handles input processing (`_processInput`).
- Applies physical forces (`_applyPhysics`).
- Manages Euler rotation and quaternion updates.

### 6.2. State Machine Update (`js/main.js`)
- **`_loadJetModel()`**: Async loader for the GLB asset.
- **`_toggleVehicleMode()`**: Logic to enter/exit either Car or Plane based on proximity (< 5m).
- **Active Vehicle**: `this.activeVehicle` state ('car' or 'plane') directs input and physics updates to the correct controller.

## 7. UI / HUD Extensions
- **Speed**: Displayed in KPH.
- **Altitude**: Replaces "Gear" display when in Plane mode (e.g., "ALT 120").
- **Throttle**: Replaces RPM bar, visualizes thrust percentage (Blue color).