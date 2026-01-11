import { RPGProfile } from '../RPGProfile.js';
import { InventoryManager } from './InventoryManager.js';
import { QuestManager } from './QuestManager.js';
import { DialogueSystem } from './DialogueSystem.js';

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

        // Subsystems
        this.inventory = new InventoryManager(this.profile);
        this.questManager = new QuestManager(this.profile);
        this.dialogueSystem = new DialogueSystem(this);

        console.log('[RPGManager] Constructed with all subsystems.');
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
