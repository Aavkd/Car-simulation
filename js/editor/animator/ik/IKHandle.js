/**
 * IKHandle.js
 * Phase 4: Advanced Posing & IK
 * 
 * Visual representation of an IK target.
 * Wraps a THREE.Object3D helper that can be selected and moved.
 */
import * as THREE from 'three';

export class IKHandle {
    constructor(name, position, scene) {
        this.scene = scene;
        this.name = name;

        // The actual target object for the solver
        this.target = new THREE.Object3D();
        this.target.position.copy(position);
        this.target.name = name;
        this.target.userData = {
            type: 'ik_handle',
            handle: this
        };

        // Visual Gizmo
        const size = 0.2;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff00ff, // Magenta for IK
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.7,
            wireframe: true
        });

        this.gizmo = new THREE.Mesh(geometry, material);
        this.gizmo.renderOrder = 999;
        this.target.add(this.gizmo);

        this.scene.add(this.target);
    }

    setPosition(pos) {
        this.target.position.copy(pos);
    }

    getPosition(target) {
        return this.target.getWorldPosition(target);
    }

    dispose() {
        if (this.target.parent) {
            this.target.parent.remove(this.target);
        }
        this.gizmo.geometry.dispose();
        this.gizmo.material.dispose();
    }

    setVisible(visible) {
        this.target.visible = visible;
    }
}
