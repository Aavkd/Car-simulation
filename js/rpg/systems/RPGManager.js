import { RPGProfile } from '../RPGProfile.js';
import { InventoryManager } from './InventoryManager.js';
import { QuestManager } from './QuestManager.js';
import { DialogueSystem } from './DialogueSystem.js';
import { RPGUIController } from '../ui/RPGUIController.js';

import { RPGData } from '../RPGData.js';

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
        this.data = RPGData; // Attach static data
        this.profile = new RPGProfile();
        this.initialized = false;

        // Subsystems
        this.inventory = new InventoryManager(this.profile);
        // Inject back-reference
        this.inventory.rpgManager = this;

        this.questManager = new QuestManager(this.profile);
        this.questManager.rpgManager = this;

        this.dialogueSystem = new DialogueSystem(this);
        this.uiController = new RPGUIController(this);

        console.log('[RPGManager] Constructed with all subsystems.');
    }

    init() {
        if (this.initialized) return;

        // Initialize interaction listeners, etc.
        this._loadCustomData();
        console.log('[RPGManager] Initialized.');

        this.initialized = true;
    }



    update(time, delta) {
        // Only update if we are in a state that supports RPG logic (usually PLAY)
        if (this.game && this.game.gameState === 'play') {
            this.uiController.update(time, delta);
        }
    }

    _loadCustomData() {
        try {
            // Load Custom Items
            const customItems = JSON.parse(localStorage.getItem('ae86_custom_items') || '{}');
            // Merge into runtime data (shallow merge is enough for top-level IDs)
            this.data.ITEMS = { ...this.data.ITEMS, ...customItems };
            if (Object.keys(customItems).length > 0) {
                console.log(`[RPGManager] Loaded ${Object.keys(customItems).length} custom items.`);
            }

            // Load Custom Quests
            const customQuests = JSON.parse(localStorage.getItem('ae86_custom_quests') || '[]');
            if (customQuests.length > 0) {
                // Determine which are new vs overrides
                const runtimeQuests = [...this.data.QUESTS];
                customQuests.forEach(cq => {
                    const idx = runtimeQuests.findIndex(rq => rq.id === cq.id);
                    if (idx >= 0) {
                        runtimeQuests[idx] = cq; // Override
                    } else {
                        runtimeQuests.push(cq); // Add new
                    }
                });
                this.data.QUESTS = runtimeQuests;
                console.log(`[RPGManager] Loaded ${customQuests.length} custom quests.`);
            }

        } catch (e) {
            console.error('[RPGManager] Failed to load custom data:', e);
        }
    }
}
