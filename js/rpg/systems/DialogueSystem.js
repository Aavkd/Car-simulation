/**
 * DialogueSystem.js
 * Manages conversation flow, branching, and conditions.
 */
export class DialogueSystem {
    constructor(rpgManager) {
        this.rpgManager = rpgManager;
        this.currentDialogue = null;
        this.currentNode = null;
        console.log('[DialogueSystem] Initialized.');
    }

    /**
     * Starts a dialogue interacton.
     * @param {string} dialogueId - The ID of the dialogue tree to start.
     * @param {Object} dialogueData - The full dialogue data structure (until we have a database).
     */
    startDialogue(dialogueId, dialogueData) {
        if (!dialogueData[dialogueId]) {
            console.warn(`[DialogueSystem] Dialogue ${dialogueId} not found.`);
            return;
        }

        this.currentDialogue = dialogueData;
        this.currentNode = dialogueData[dialogueId];

        console.log(`[DialogueSystem] Started dialogue: ${dialogueId}`);
        console.log(`[NPC]: ${this.currentNode.text}`);

        // Check for auto-triggers (e.g. give quest immediately)
        this.processNodeTriggers(this.currentNode);

        // In a real UI, we would display options here.
        this.logOptions();
    }

    /**
     * Selects a response option.
     * @param {number} index - Index of the option selected.
     */
    selectOption(index) {
        if (!this.currentNode || !this.currentNode.options) return;

        const option = this.currentNode.options[index];
        if (!option) {
            console.warn('[DialogueSystem] Invalid option index.');
            return;
        }

        // Check requirements
        if (option.req && !this.checkRequirement(option.req)) {
            console.log('[DialogueSystem] Requirement not met for this option.');
            return;
        }

        console.log(`[Player]: ${option.text}`);

        if (option.next) {
            this.currentNode = this.currentDialogue[option.next];
            console.log(`[NPC]: ${this.currentNode.text}`);
            this.processNodeTriggers(this.currentNode);
            this.logOptions();
        } else {
            this.endDialogue();
        }
    }

    endDialogue() {
        console.log('[DialogueSystem] Dialogue ended.');
        this.currentDialogue = null;
        this.currentNode = null;
    }

    checkRequirement(req) {
        // Example: req: { type: 'item', id: 'wrench', count: 1 }
        if (req.type === 'item') {
            return this.rpgManager.inventory.hasItem(req.id, req.count);
        }
        if (req.type === 'quest_status') {
            const status = this.rpgManager.questManager.getQuestStatus(req.id);
            return status === req.status;
        }
        return true;
    }

    processNodeTriggers(node) {
        if (!node.trigger) return;

        const t = node.trigger;
        // Example: trigger: { type: 'quest_start', id: 'quest_01' }
        if (t.type === 'quest_start') {
            this.rpgManager.questManager.startQuest(t.id);
        }
        if (t.type === 'item_give') {
            this.rpgManager.inventory.addItem(t.id, t.count || 1);
        }
    }

    logOptions() {
        if (!this.currentNode.options) {
            console.log('[DialogueSystem] (End of conversation)');
            return;
        }
        this.currentNode.options.forEach((opt, i) => {
            const reqText = opt.req ? ` [REQ: ${JSON.stringify(opt.req)}]` : '';
            console.log(`   [${i}] ${opt.text}${reqText}`);
        });
    }
}
