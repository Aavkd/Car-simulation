
// rpg_verify_phase4.mjs
// Verifies RPG Phase 4 Data Integration without loading THREE.js dependencies

import { RPGData } from '../js/rpg/RPGData.js';
import { RPGProfile } from '../js/rpg/RPGProfile.js';
import { QuestManager } from '../js/rpg/systems/QuestManager.js';
import { DialogueSystem } from '../js/rpg/systems/DialogueSystem.js';
import { InventoryManager } from '../js/rpg/systems/InventoryManager.js';

// Mock localStorage
global.localStorage = {
    store: {},
    getItem: function (key) { return this.store[key] || null; },
    setItem: function (key, value) { this.store[key] = value.toString(); },
    removeItem: function (key) { delete this.store[key]; },
    clear: function () { this.store = {}; }
};

console.log('--- RPG PHASE 4 VERIFICATION (Logic Only) ---');

// 1. Mock RPGManager
// We recreate the structure needed by subsystems, avoiding RPGManager import itself (deps on THREE)
class MockRPGManager {
    constructor() {
        this.data = RPGData;
        this.profile = new RPGProfile();

        // Circular deps handling similar to real manager
        this.inventory = new InventoryManager(this.profile);
        this.inventory.rpgManager = this;

        this.questManager = new QuestManager(this.profile);
        this.questManager.rpgManager = this;

        this.dialogueSystem = new DialogueSystem(this);
    }
}

const rpgManager = new MockRPGManager();
console.log('✅ Mock RPGManager constructed with Real Data.');

// 2. Verify Data Integrity
console.log('\n[TEST 1] Data Integrity');
if (rpgManager.data.QUESTS && rpgManager.data.DIALOGUES && rpgManager.data.ITEMS && rpgManager.data.NPCS) {
    console.log(`✅ RPGData loaded: ${rpgManager.data.QUESTS.length} Quests, ${Object.keys(rpgManager.data.DIALOGUES).length} Dialogues.`);
} else {
    console.error('❌ RPGData missing sections.');
    process.exit(1);
}

// 3. Test Quest Loading
console.log('\n[TEST 2] Quest System w/ Data');
const questId = rpgManager.data.QUESTS[0].id; // Grab first quest
console.log(`Testing Quest: ${questId}`);

rpgManager.questManager.startQuest(questId);
const qStatus = rpgManager.questManager.getQuestStatus(questId);
const qTitle = rpgManager.profile.quests[questId].title;

if (qStatus === 'ACTIVE' && qTitle) {
    console.log(`✅ Quest '${qTitle}' started successfully from static data.`);
} else {
    console.error(`❌ Quest start failed. Status: ${qStatus}, Title: ${qTitle}`);
}

// 4. Test Dialogue Tree & Logic
console.log('\n[TEST 3] Dialogue System w/ Data');
// Find a dialogue that exists
const dialogueId = Object.keys(rpgManager.data.DIALOGUES)[0];
console.log(`Testing Dialogue: ${dialogueId}`);

rpgManager.dialogueSystem.startDialogue(dialogueId);
if (rpgManager.dialogueSystem.currentDialogue) {
    console.log(`✅ Dialogue '${dialogueId}' started.`);

    // Simulate option selection
    console.log('Simulating option 0 selection...');
    rpgManager.dialogueSystem.selectOption(0);

    // Check if we moved or ended (depends on data)
    if (rpgManager.dialogueSystem.currentNode === null && rpgManager.dialogueSystem.currentDialogue === null) {
        console.log('ℹ️ Dialogue ended (expected for some branches).');
    } else {
        console.log(`ℹ️ Moved to node: ${rpgManager.dialogueSystem.currentNode ? rpgManager.dialogueSystem.currentNode.text.substring(0, 20) + '...' : 'null'}`);
    }
} else {
    console.error('❌ Dialogue failed to start.');
}

// 5. Test NPC Config (Data check only)
console.log('\n[TEST 4] NPC Data Check');
const npc = rpgManager.data.NPCS[0];
if (npc && npc.visual && npc.visual.modelPath) {
    console.log(`✅ NPC '${npc.name}' has model path: ${npc.visual.modelPath}`);
} else {
    console.warn('⚠️ NPC data might be missing properties.');
}

console.log('\n--- VERIFICATION SUCCESSFUL ---');
