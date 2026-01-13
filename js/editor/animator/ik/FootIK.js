import * as THREE from 'three';

/**
 * FootIK System
 * Automatically places feet on the ground using raycasting.
 * Designed to work with the IKSolver by adjusting IK targets.
 */
export class FootIK {
    constructor(game, solver) {
        this.game = game;
        this.solver = solver;
        this.enabled = false;

        this.raycaster = new THREE.Raycaster();
        this.down = new THREE.Vector3(0, -1, 0);
        this.up = new THREE.Vector3(0, 1, 0);

        // Configuration
        this.rayHeight = 1.0;     // Start ray this high above foot
        this.rayLength = 2.0;     // Length of ray
        this.footOffset = 0.1;    // Height of foot bone above ground
        this.lerpSpeed = 10.0;    // Smoothing speed

        // Debug
        this.debugLines = new THREE.Group();
        this.game.scene.add(this.debugLines);
        this.showDebug = true;
    }

    /**
     * Enable or disable Foot IK
     * @param {boolean} state 
     */
    setEnabled(state) {
        this.enabled = state;
        this.debugLines.visible = state && this.showDebug;
    }

    /**
     * Update Foot IK for all active leg chains
     * @param {number} dt Delta time
     */
    update(dt) {
        if (!this.enabled) return;

        // Clear debug lines
        this.debugLines.clear();

        for (const chain of this.solver.chains) {
            // Identify if this is a leg chain (heuristic: name contains "Leg", "Foot", "Toe")
            // Or explicitly tagged. For now, check if effector name implies foot/leg
            const isLeg = /leg|foot|toe/i.test(chain.effector.name);

            if (isLeg && chain.target) {
                this._solveFoot(chain, dt);
            }
        }
    }

    _solveFoot(chain, dt) {
        const targetObj = chain.target; // The IK Handle target object (THREE.Object3D)

        // Calculate ray origin (start above the current target position)
        const rayOrigin = targetObj.position.clone();
        rayOrigin.y += this.rayHeight;

        // Raycast down
        this.raycaster.set(rayOrigin, this.down);
        this.raycaster.camera = this.game.camera; // Fix for Sprites (requires camera for raycast)

        // Filter: Intersect with objects that are "Terrain"
        // We can traverse scene children, or assume a specific group if available.
        // For general usage, intersecting the whole scene but filtering for terrain mesh might be needed.
        // Optimized: Intersect specific terrain object if known, otherwise scene.
        // Important: Ignore the character itself (or at least the IK handles)

        const intersects = this.raycaster.intersectObjects(this.game.scene.children, true);

        let groundPoint = null;
        let groundNormal = null;

        for (const hit of intersects) {
            // Filter out the character, helpers, etc.
            // Heuristic: If it has 'isBone', 'isIKHandle', or belongs to player/selected entity
            if (hit.object.isBone || hit.object.userData.type === 'ik_handle' || hit.object.userData.isBoneHelper) continue;

            // Assume we hit ground/static geometry
            groundPoint = hit.point;
            groundNormal = hit.face.normal.clone().applyQuaternion(hit.object.getWorldQuaternion(new THREE.Quaternion())); // Transform normal to world space? Apply normal matrix?
            // Usually hit.face.normal is local to the mesh geometry. 
            // NOTE: Raycaster.intersectObjects returns point in world space, but face.normal is likely needing transformation if the object is rotated? 
            // Actually Three.js Raycaster returns face normal in world space only if computeFaceNormals was called? 
            // Wait, Standard behavior: hit.face.normal is the normal as defined in the geometry (Local Space).
            // We need to transform it to world space.
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            groundNormal.applyMatrix3(normalMatrix).normalize();

            break; // Took the first valid hit
        }

        if (groundPoint) {
            // Visualize
            if (this.showDebug) {
                this._addDebugLine(rayOrigin, groundPoint, 0x00ff00);
            }

            // Target Position: Ground Height + Offset
            const targetY = groundPoint.y + this.footOffset;

            // Smoothly move target Y
            targetObj.position.y = THREE.MathUtils.lerp(targetObj.position.y, targetY, dt * this.lerpSpeed);

            // Target Rotation: Align with ground normal
            // Identify forward direction (project current forward onto ground plane)
            // const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(targetObj.quaternion);
            // const projectedForward = currentForward.clone().projectOnPlane(groundNormal).normalize();

            // Calculate rotation to align Up with GroundNormal, keeping Forward roughly same
            // const targetQuat = new THREE.Quaternion().setFromUnitVectors(this.up, groundNormal);

            // We need to compose this with the original yaw
            // This is complex because we want to preserve the foot's heading.
            // Simple approach: LookAt? No.
            // Approach: 
            // 1. Get current rotation
            // 2. Align local Y (up) to groundNormal

            // Let's rely on the user to rotate the foot for heading (Yaw), 
            // and we auto-adjust Pitch/Roll for slope.
            // But if we override quaternion, user control is lost.
            // Ideally, we apply a correctional rotation on top of user input?
            // Or, we update the target object's rotation directly.

            // Implementation:
            // Find quaternion that rotates (0,1,0) to groundNormal
            const alignRot = new THREE.Quaternion().setFromUnitVectors(this.up, groundNormal);

            // This aligns global Up to Normal.
            // But we want to apply this to the foot's CURRENT orientation relative to flat ground.
            // Simplified: fully overwrite rotation for now to match slope?
            // Better: Modifying the IK Handle's rotation.

            // For now, let's just do position adaptation. Rotation is tricky without messing up user's manual rotation.
            // Users might want to manually rotate the foot. 
            // Maybe only do rotation adjustment if a flag is set "Auto-Rotate Feet".

            // NOTE: I will leave rotation logic commented out or behind a flag for future refinement
            // to avoid fighting with user input in the editor.

            /*
            const targetQ = targetObj.quaternion.clone();
            // ... apply alignment ...
            // targetObj.quaternion.slerp(targetQ, dt * this.lerpSpeed);
            */

        } else {
            if (this.showDebug) {
                const end = rayOrigin.clone().add(this.down.clone().multiplyScalar(this.rayLength));
                this._addDebugLine(rayOrigin, end, 0xff0000);
            }
        }
    }

    _addDebugLine(start, end, color) {
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: color });
        const line = new THREE.Line(geometry, material);
        this.debugLines.add(line);
    }

    dispose() {
        this.game.scene.remove(this.debugLines);
    }
}
