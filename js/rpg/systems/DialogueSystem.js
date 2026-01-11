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
     * Starts a dialogue interaction.
     * @param {string} dialogueId - The ID of the dialogue tree to start.
     * @param {Object} dialogueData - The full dialogue data registry (usually RPGData.DIALOGUES).
     */
    startDialogue(dialogueId) {
        // Access static data via RPGManager if not passed directly, or assume passed data is the full registry
        const allDialogues = this.rpgManager.data.DIALOGUES;

        if (!allDialogues[dialogueId]) {
            console.warn(`[DialogueSystem] Dialogue ${dialogueId} not found.`);
            return;
        }

        this.currentDialogue = allDialogues[dialogueId];
        // The new data structure has a 'nodes' object containing 'start', etc.
        this.currentNode = this.currentDialogue.nodes['start'];

        if (!this.currentNode) {
            console.error(`[DialogueSystem] Dialogue ${dialogueId} has no 'start' node.`);
            return;
        }

        console.log(`[DialogueSystem] Started dialogue: ${dialogueId}`);
        console.log(`[NPC - ${this.currentNode.speaker || 'Unknown'}]: ${this.currentNode.text}`);

        this.processNodeTriggers(this.currentNode);
        this.logOptions();

        // TODO: Emit event to UI to show dialogue
    }

    /**
     * Selects a response option.
     * @param {number} index - Index of the option selected.
     */
    selectOption(index) {
        if (!this.currentNode || !this.currentNode.choices) return;

        const option = this.currentNode.choices[index];
        if (!option) {
            console.warn('[DialogueSystem] Invalid option index.');
            return;
        }

        // Check requirements (if any)
        if (option.condition && !this.checkRequirement(option.condition)) {
            console.log('[DialogueSystem] Requirement not met for this option.');
            return;
        }

        console.log(`[Player]: ${option.text}`);

        // Process immediate actions on the option (e.g. setFlag)
        this.processOptionActions(option);

        // Move to next node
        if (option.next) {
            this.currentNode = this.currentDialogue.nodes[option.next];
            if (!this.currentNode) {
                console.error(`[DialogueSystem] Node ${option.next} not found.`);
                this.endDialogue();
                return;
            }

            console.log(`[NPC - ${this.currentNode.speaker || 'Unknown'}]: ${this.currentNode.text}`);

            // Process triggers on the new node
            this.processNodeTriggers(this.currentNode);

            if (this.currentNode.end) {
                this.endDialogue();
            } else {
                this.logOptions();
            }
        } else {
            this.endDialogue();
        }
    }

    endDialogue() {
        console.log('[DialogueSystem] Dialogue ended.');
        this.currentDialogue = null;
        this.currentNode = null;
        // TODO: Emit event to UI to close dialogue
    }

    checkRequirement(req) {
        // Example: req: { stat: 'strength', min: 12 }
        if (req.stat) {
            // TODO: Check player stats from profile
            // For now, assume true or check a dummy stat object
            return true;
        }
        return true;
    }

    processOptionActions(option) {
        if (option.setFlag) {
            // { key: 'philosophy', value: 'chaos' }
            this.rpgManager.profile.setFlag(option.setFlag.key, option.setFlag.value);
            console.log(`[DialogueSystem] Set flag ${option.setFlag.key} = ${option.setFlag.value}`);
        }
        if (option.action) {
            this.handleActionString(option.action);
        }
    }

    processNodeTriggers(node) {
        // Some nodes might have immediate actions upon entering
        if (node.action) {
            this.handleActionString(node.action);
        }
    }

    handleActionString(actionStr) {
        // Format: "verb:param" e.g. "acceptQuest:scout_mission" or "openShop:tybalt_scrap"
        const [verb, param] = actionStr.split(':');

        switch (verb) {
            case 'acceptQuest':
                this.rpgManager.questManager.startQuest(param);
                break;
            case 'openShop':
                console.log(`[DialogueSystem] Opening shop: ${param}`);
                // this.rpgManager.ui.openShop(param);
                break;
            default:
                console.warn(`[DialogueSystem] Unknown action: ${verb}`);
        }
    }

    logOptions() {
        if (!this.currentNode.choices) {
            if (!this.currentNode.end) console.log('[DialogueSystem] (No choices, waiting...)');
            return;
        }
        this.currentNode.choices.forEach((opt, i) => {
            const reqText = opt.condition ? ` [REQ: ${JSON.stringify(opt.condition)}]` : '';
            console.log(`   [${i}] ${opt.text}${reqText}`);
        });
    }
}
