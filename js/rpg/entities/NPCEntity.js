import { AnimationController } from '../../animation/core/AnimationController.js';

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

        // Initialize Animator if animations exist
        this.animator = null;
        // Initialize Animator
        // We always initialize it so the FSM logic can run (even if no visual clips exist yet)
        const animations = this.mesh.userData.animations || [];
        this.animator = new AnimationController(this.mesh, animations);

        if (animations.length > 0) {
            // Try to play safe defaults
            const clips = this.animator.getClipNames();
            // Case-insensitive search for idle
            const idleClip = clips.find(c => c.toLowerCase().includes('idle')) || clips[0];

            if (idleClip) {
                console.log(`[NPCEntity] Playing initial animation: ${idleClip} for ${this.name}`);
                this.animator.play(idleClip);
            }
        } else {
            console.warn(`[NPCEntity] No animations found for ${this.name}. FSM will run in logic-only mode.`);
        }

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
        if (this.animator) {
            // Placeholder: NPCs are always grounded and idle for now
            this.animator.setInput('speed', 0);
            this.animator.setInput('isGrounded', true);

            this.animator.update(deltaTime);
        }
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
