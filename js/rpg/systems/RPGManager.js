
import { RPGProfile } from '../RPGProfile.js';

/**
 * RPGManager.js
 * Singleton that orchestrates all RPG-related systems.
 */
export class RPGManager {
    constructor(game) {
        if (RPGManager.instance) {
            return RPGManager.instance;
        }
        RPGManager.instance = this;

        this.game = game;
        this.profile = new RPGProfile();
        this.initialized = false;

        // Subsystems will be initialized here in later phases
        // this.questManager = new QuestManager(this.profile);
        // this.dialogueSystem = new DialogueSystem();

        console.log('[RPGManager] Constructed.');
    }

    init() {
        if (this.initialized) return;

        // Initialize interaction listeners, etc.
        console.log('[RPGManager] Initialized.');
        this.initialized = true;
    }

    update(time, delta) {
        // Only update if we are in a state that supports RPG logic (usually PLAY)

        // Example: Update Quest timers
        // this.questManager.update(delta);
    }
}
