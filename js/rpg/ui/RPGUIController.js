import { DialogueUI } from './DialogueUI.js';
import { HUDManager } from './HUDManager.js';

export class RPGUIController {
    constructor(rpgManager) {
        this.rpgManager = rpgManager;

        // Sub-controllers
        this.dialogueUI = new DialogueUI(this);
        this.hudManager = new HUDManager(this);

        this.uiLayer = document.getElementById('rpg-ui-layer');

        this.bindEvents();
    }

    bindEvents() {
        // Listen to RPG events
        window.addEventListener('RPG_DIALOGUE_START', (e) => this.onDialogueStart(e.detail));
        window.addEventListener('RPG_DIALOGUE_END', () => this.onDialogueEnd());

        window.addEventListener('RPG_QUEST_START', (e) => this.hudManager.showToast('Quest Started', e.detail.title, 'info'));
        window.addEventListener('RPG_QUEST_COMPLETE', (e) => this.hudManager.showToast('Quest Completed', e.detail.title, 'success'));
        window.addEventListener('RPG_ITEM_RECEIVED', (e) => this.hudManager.showToast('Item Received', `${e.detail.name} x${e.detail.amount}`, 'success'));

        // Listen for updates to refresh HUD
        window.addEventListener('RPG_QUEST_UPDATE', () => this.hudManager.updateQuestTracker());
    }

    onDialogueStart(node) {
        this.dialogueUI.show(node);
        this.hudManager.hide(); // Hide HUD during cinematic dialogue
    }

    onDialogueEnd() {
        this.dialogueUI.hide();
        this.hudManager.show();
    }

    update() {
        // Called every frame if needed (e.g. for interaction prompts based on raycast)
        this.hudManager.update();
    }
}
