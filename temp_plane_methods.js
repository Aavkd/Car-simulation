    async _loadJetModel() {
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
        loader.load('assets/models/Jet.glb', (gltf) => {
            this.planeMesh = gltf.scene;
            this.planeMesh.scale.setScalar(1.0); // Approx match car

            // Shadows
            this.planeMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Set initial position (Parked somewhere - e.g., near start but offset)
            this.planeMesh.position.set(30, 0, 30);

            this.scene.add(this.planeMesh);

            // Initialize physics
            this.plane = new PlanePhysics(this.planeMesh, this.scene);

            console.log('Jet model loaded');
            resolve();
        }, undefined, (e) => {
            console.error('Failed to load Jet', e);
            resolve(); // resolve anyway
        });
    });
}

_toggleVehicleMode() {
    if (!this.player) return;

    if (this.isOnFoot) {
        // Try to enter a vehicle
        const playerPos = this.player.position;

        // Check Car Distance
        const carDist = this.car ? playerPos.distanceTo(this.car.position) : Infinity;

        // Check Plane Distance
        const planeDist = this.plane ? playerPos.distanceTo(this.plane.mesh.position) : Infinity;

        const INTERACTION_RADIUS = 5.0; // Meters

        if (carDist < INTERACTION_RADIUS && carDist <= planeDist) {
            // Enter Car
            console.log('Entering Car');
            this.isOnFoot = false;
            this.activeVehicle = 'car';

            // Set input context if needed

            // Camera
            this.cameraController.setPlayerMode(false);
            this.cameraController.currentModeIndex = 0; // Chase

            // Hide player, show car (if we were hiding it? logic in player.js?)
            // Assuming car is always visible, player is toggled
            // In this codebase, player.js seems to manage the camera/controls, 
            // but main.js loop switches physics updates.

        } else if (planeDist < INTERACTION_RADIUS) {
            // Enter Plane
            console.log('Entering Plane');
            this.isOnFoot = false;
            this.activeVehicle = 'plane';

            this.cameraController.setPlayerMode(false);
            // Switch to flight cam
            const flightIndex = this.cameraController.modes.indexOf('flight');
            if (flightIndex >= 0) this.cameraController.currentModeIndex = flightIndex;

        } else {
            console.log('No vehicle nearby');
        }
    } else {
        // Exit Vehicle
        console.log('Exiting Vehicle');
        this.isOnFoot = true;
        this.cameraController.setPlayerMode(true);

        // Teleport player to vehicle position
        const vehiclePos = this.activeVehicle === 'car' ? this.car.position : this.plane.mesh.position;
        // Offset slightly so we don't spawn inside
        this.player.position.copy(vehiclePos).add(new THREE.Vector3(2, 0, 0));
        // Ensure on ground
        const groundH = this.terrain.getHeightAt(this.player.position.x, this.player.position.z);
        this.player.position.y = groundH + 1.8;

        this.activeVehicle = null;
    }
}
