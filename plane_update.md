This is a significant but exciting expansion. Moving from 2D surface physics (Car) to 3D volume physics (Plane) requires a dedicated physics controller.Below is the Technical Specification Document for the implementation of the "Jet" feature.✈️ Feature Specification: Flight Simulation & AerodynamicsStatus: DraftTarget Module: js/core/plane.jsAsset: assets/models/jet.glb1. OverviewThis feature introduces a 6-DOF (Six Degrees of Freedom) flight model to the existing AE86 Freeroam engine. It allows players to discover a parked Jet, enter it using the existing character controller, and fly seamlessly across the generated terrains (Everest, Dunes, etc.) using realistic aerodynamic principles.2. Asset IntegrationModel Source: assets/models/jet.glb (User provided).Scale Factor: Must be normalized to match the Toyota AE86.glb scale (approx 1 unit = 1 meter).Components: The GLB should ideally have separate nodes for:Fuselage (Main body for collision)Ailerons/Flaps (Optional: for visual animation during input)Gear (Optional: for landing gear logic)3. Physics Model (The "Realistic" Part)Unlike the car's Raycast Suspension, the plane cannot rely on ground contact. It requires an aerodynamic force model applied to a rigid body.3.1. Core ForcesWe will apply forces to the Three.js object (or physics body) every frame:Thrust ($F_{thrust}$): Applied along the local Forward Vector ($+Z$). Controlled by throttle input.Lift ($F_{lift}$): Opposes gravity, perpendicular to the airflow.$$F_{lift} = C_L \cdot \frac{1}{2} \rho v^2 A$$Simplified for Game: Lift is proportional to the square of speed ($v^2$) and the Angle of Attack.Drag ($F_{drag}$): Air resistance opposing velocity.$$F_{drag} = C_D \cdot \frac{1}{2} \rho v^2 A$$Gravity: Constant downward force ($-Y$ world axis).3.2. Handling CharacteristicsStalling: If speed drops below a threshold (e.g., 80 km/h), Lift approaches zero, and the plane enters a ballistic trajectory (falls).Banking: Rolling the plane rotates the Lift vector. If the plane is banked 90°, 0% of lift fights gravity (plane turns sharp but drops).Auto-Center: Slight restoring force to level the wings when no input is detected (optional, for stability).4. Controls & Input MappingWe will extend the js/core/input.js system to support a specific "Flight Mode."Gamepad (DualShock 5 Style)| Axis / Button | Action | Physics Result || :--- | :--- | :--- || Left Stick X | Roll | Rotates mesh around Local Z axis (Ailerons) || Left Stick Y | Pitch | Rotates mesh around Local X axis (Elevators) || L1 / R1 | Yaw | Rotates mesh around Local Y axis (Rudder) || R2 | Thrust + | Increases engine power / Forward Velocity || L2 | Airbrake | Increases Drag coefficient / Reduces Thrust || Square / X | Landing Gear | Toggles gear state (affects drag/collision) || F / Triangle | Exit | Eject/Exit vehicle (reverts to player.js) |Keyboard FallbacksW/S: Pitch Down/Up (Inverted option needed)A/D: Roll Left/RightQ/E: Yaw Left/RightShift/Ctrl: Thrust/Brake5. Camera System UpdatesThe current js/core/camera.js is built for cars (Orbit/Chase). The plane requires a locked "Flight Cam":Roll Locking: The camera must rotate with the plane's horizon. If the plane is upside down, the camera should be upside down.Velocity Lag: The camera should lag slightly behind the plane based on acceleration (creating a "G-Force" visual effect).FOV Scaling: FOV should widen as speed increases (e.g., from 75° to 90° at Max Speed).6. Implementation Architecture6.1. New Class: js/core/plane.jsShutterstockThis class will mirror the structure of car.js but handle 6-DOF movement.JavaScriptexport class Plane {
    constructor(scene, model) {
        this.velocity = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.throttle = 0;
        this.speed = 0;
        
        // Physics Constants
        this.LIFT_COEFFICIENT = 0.02;
        this.DRAG_COEFFICIENT = 0.01;
        this.MAX_THRUST = 2.0;
    }

    update(dt, input) {
        // 1. Calculate Local Rotations (Roll, Pitch, Yaw)
        this.handleInput(dt, input);
        
        // 2. Apply Thrust
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        this.velocity.add(forward.multiplyScalar(this.throttle * this.MAX_THRUST * dt));
        
        // 3. Apply Lift & Drag (simplified)
        // ...
        
        // 4. Update Position
        this.mesh.position.add(this.velocity);
    }
}
6.2. State Machine Update (js/main.js)We need to modify the interaction loop to distinguish between Car and Plane.Current: if (dist < 2m) Enter CarNew: if (dist < 5m && type === 'PLANE') Enter Plane7. UI / HUD ExtensionsThe current speed is shown in KM/H with gears.Altimeter: Add an altitude indicator (Height from ground raycast).Artificial Horizon: A simple line in the center of the screen to show pitch/roll orientation.Hide Gear UI: Hide the "Gear 1/2/3" UI element when in Plane mode.