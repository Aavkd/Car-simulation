# Third-Person Camera with Knight Model

**Date:** 2026-01-14

## Summary

Added a third-person camera mode for on-foot gameplay that displays a 3D Knight model representing the player.

## Files Modified

### js/core/camera.js
- Added `playerCameraModes` array and `playerCameraModeIndex` for tracking on-foot camera mode
- Added `playerThirdPersonConfig` with distance, height, lookAtHeight, and FOV settings
- Added `playerCameraMode` getter property
- Added `nextPlayerCameraMode()` method to cycle between first-person and third-person
- Added `updatePlayerThirdPersonCamera(player, deltaTime)` method that positions camera behind player

### js/core/player.js
- Added FBXLoader import for loading Knight.fbx
- Added `mesh`, `meshLoaded`, `meshVisible` properties
- Added `loadModel(scene)` async method to load Knight.fbx model
- Added `updateMesh()` method to sync mesh position/rotation with player state (including a 180-degree rotation offset to ensure the model faces correctly)
- Added `setMeshVisible(visible)` method to show/hide the 3D model, ensuring visibility is propagated to all sub-meshes

### js/main.js
- Modified `enterPlayTestMode()` (for editor) and `_enterPlayState()` (for standard play) to call `player.loadModel(this.scene)`
- Modified `_handleCameraChange()` to toggle player camera mode when on foot
- Modified `_animate()` loop to:
  - Call `player.updateMesh()` for position sync
  - Choose appropriate camera update method based on mode
- Modified `_toggleVehicleMode()` to manage Knight mesh visibility when entering/exiting vehicles

## Usage

- Press **C** while on foot to toggle between first-person and third-person camera
- The Knight model is only visible in third-person mode
- The model is automatically hidden when entering a vehicle
- The model is automatically shown when exiting a vehicle (if in third-person mode)

## Technical Notes

- Knight model path: `assets/models/Knight.fbx`
- **Model Scale:** 0.04 (tuned for world dimensions)
- **Model Orientation:** A 180-degree offset (`Math.PI`) is applied in `updateMesh()` to ensure the model faces forward
- **Late Load Support:** `updateMesh()` checks the `meshVisible` flag each frame to handle cases where the model finishes loading after the camera has already been switched to third-person
- Animation not implemented yet - to be added later
