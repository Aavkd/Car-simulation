import { AnimationController } from '../../animation/core/AnimationController.js';
import { HeadLook } from '../../animation/procedural/HeadLook.js';
import { ActiveRagdollController } from '../../animation/physics/ActiveRagdollController.js';

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

        // LocalMotion BlendTree setup
        this.animator.addBlendTree('Locomotion', [
            { threshold: 0.0, clip: 'Idle' },
            { threshold: 2.0, clip: 'Walk' },
            { threshold: 6.0, clip: 'Run' }
        ]);

        // Procedural Layers
        this.headLook = new HeadLook(this.mesh, {
            headBoneName: 'Head',
            neckBoneName: 'Neck',
            speed: 5.0
        });
        this.animator.addProceduralLayer(this.headLook);

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

        // Active Ragdoll System
        this.ragdoll = new ActiveRagdollController(this.mesh, data.terrain);

        // Setup interactive user data
        this._setupInteraction();
    }

    _setupInteraction() {
        // Ensure the mesh (or its children) has userData.interactive properties
        this.mesh.userData.interactive = true;
        this.mesh.userData.name = this.name;
        this.mesh.userData.type = 'npc';
        this.mesh.userData.entity = this;

        // Also explicitly expose ragdoll to userData for tool access
        this.mesh.userData.ragdoll = this.ragdoll;

        // Interaction callback
        this.mesh.userData.onInteract = () => this.onInteract();

        // Also tag children for raycasting convenience
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.userData.interactive = true;
                child.userData.name = this.name;
                child.userData.onInteract = () => this.onInteract();
                // Link entity to mesh for easier lookup
                child.userData.entity = this;
            }
        });
    }

    update(deltaTime) {
        // ==================== RAGDOLL UPDATE ====================
        if (this.ragdoll && this.ragdoll.isActive()) {
            this.ragdoll.update(deltaTime);
            return; // Skip normal behavior/animation
        }

        // AI/Behavior updates (idle animation, looking at player, etc.)
        if (this.animator) {
            // Placeholder: NPCs are always grounded and idle for now
            this.animator.setInput('speed', 0);
            this.animator.setInput('isGrounded', true);

            this.animator.update(deltaTime);
        }

        // Procedural Look at Player
        if (this.headLook && window.game && window.game.player) {
            // Only look if close enough (e.g. 10 meters)
            const playerPos = window.game.player.position;
            const dist = this.mesh.position.distanceTo(playerPos);

            if (dist < 10) {
                this.headLook.setTarget(playerPos);
            } else {
                this.headLook.setTarget(null); // Return to neutral
            }
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
    // ==================== ACTIVE RAGDOLL API ====================

    /**
     * Apply an impact force to the NPC
     * @param {THREE.Vector3} force - Force vector (direction * magnitude)
     * @param {THREE.Vector3} [point] - World position of impact
     * @param {string} [source] - Source identifier
     * @returns {string} Response type: 'absorbed', 'stumble', 'stagger', 'fall', 'knockdown'
     */
    applyImpact(force, point = null, source = 'unknown') {
        if (this.ragdoll) {
            console.log(`[NPCEntity] Received impact: ${force.length().toFixed(1)} N`);
            this.ragdoll.applyImpact(force, point);
            return 'fall';
        }
        return 'absorbed';
    }

    /**
     * Check if NPC has control (not falling/ragdolling)
     * @returns {boolean} True if NPC can move normally
     */
    hasControl() {
        return !this.ragdoll || !this.ragdoll.isActive();
    }

    /**
     * Check if ragdoll physics is currently active
     * @returns {boolean} True if in any physics state
     */
    isRagdollActive() {
        return this.ragdoll ? this.ragdoll.isActive() : false;
    }

    /**
     * Get full ragdoll state for debugging
     * @returns {Object}
     */
    getRagdollState() {
        return this.ragdoll;
    }
}
