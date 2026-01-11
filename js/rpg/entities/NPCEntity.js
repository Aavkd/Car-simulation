import * as THREE from 'three';

/**
 * NPCEntity - Represents an interactive character in the world
 */
export class NPCEntity {
    constructor(mesh, data = {}) {
        this.mesh = mesh;
        this.data = data;

        this.name = data.name || 'Unknown NPC';
        this.dialogueId = data.dialogueId || data.dialogueRootId || 'default';
        this.behavior = data.behavior || 'idle';

        // Setup interactive user data
        this._setupInteraction();
    }

    _setupInteraction() {
        // Ensure the mesh (or its children) has userData.interactive properties
        this.mesh.userData.interactive = true;
        this.mesh.userData.name = this.name;
        this.mesh.userData.type = 'npc';
        this.mesh.userData.entity = this;

        // Interaction callback
        this.mesh.userData.onInteract = () => this.onInteract();

        // Also tag children for raycasting convenience
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.userData.interactive = true;
                child.userData.name = this.name;
                child.userData.onInteract = () => this.onInteract();
            }
        });
    }

    update(deltaTime) {
        // AI/Behavior updates (idle animation, looking at player, etc.)
    }

    onInteract() {
        console.log(`[NPCEntity] Interaction with ${this.name}`);

        if (window.game && window.game.rpgManager) {
            window.game.rpgManager.dialogueSystem.startDialogue(this.dialogueId);
        }

        // Visual feedback (e.g. bounce or emote)
        // this.mesh.position.y += 0.1; // Jump debug
    }
}
