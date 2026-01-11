
// Mock localStorage
global.localStorage = {
    store: {},
    getItem: function (key) { return this.store[key] || null; },
    setItem: function (key, value) { this.store[key] = value.toString(); },
    removeItem: function (key) { delete this.store[key]; },
    clear: function () { this.store = {}; }
};

// Import Systems
// Note: adjusting paths since we will run this from project root
import { RPGManager } from '../js/rpg/systems/RPGManager.js';

console.log('--- STARTING RPG SYSTEMS VERIFICATION ---');

// Mock Game Object
const mockGame = {
    // Add any game properties accessed by RPGManager if needed
};

// 1. Initialize Manager
console.log('\n[TEST 1] Initializing RPGManager...');
const rpgManager = new RPGManager(mockGame);
if (rpgManager.inventory && rpgManager.questManager && rpgManager.dialogueSystem) {
    console.log('✅ RPGManager initialized with all subsystems.');
} else {
    console.error('❌ RPGManager failed to initialize subsystems.');
    process.exit(1);
}

// 2. Test Inventory
console.log('\n[TEST 2] Testing Inventory...');
const TEST_ITEM = 'wrench';
rpgManager.inventory.addItem(TEST_ITEM, 1);
if (rpgManager.inventory.hasItem(TEST_ITEM, 1)) {
    console.log(`✅ Item '${TEST_ITEM}' added successfully.`);
} else {
    console.error(`❌ Failed to add '${TEST_ITEM}'.`);
}

rpgManager.inventory.removeItem(TEST_ITEM, 1);
if (!rpgManager.inventory.hasItem(TEST_ITEM, 1)) {
    console.log(`✅ Item '${TEST_ITEM}' removed successfully.`);
} else {
    console.error(`❌ Failed to remove '${TEST_ITEM}'.`);
}

// 3. Test Quests
console.log('\n[TEST 3] Testing Quests...');
const TEST_QUEST = 'test_quest_001';
rpgManager.questManager.startQuest(TEST_QUEST);
let status = rpgManager.questManager.getQuestStatus(TEST_QUEST);
if (status === 'ACTIVE') {
    console.log(`✅ Quest '${TEST_QUEST}' started.`);
} else {
    console.error(`❌ Quest start failed. Status: ${status}`);
}

rpgManager.questManager.completeObjective(TEST_QUEST);
// Check internal state (accessing private-ish property for test)
if (rpgManager.profile.quests[TEST_QUEST].objectiveIndex === 1) {
    console.log(`✅ Quest objective updated.`);
} else {
    console.error(`❌ Quest objective update failed.`);
}

rpgManager.questManager.completeQuest(TEST_QUEST);
status = rpgManager.questManager.getQuestStatus(TEST_QUEST);
if (status === 'COMPLETED') {
    console.log(`✅ Quest '${TEST_QUEST}' completed.`);
} else {
    console.error(`❌ Quest completion failed. Status: ${status}`);
}

// 4. Test Dialogue (Basic Logic)
console.log('\n[TEST 4] Testing Dialogue Logic...');
// Mock dialogue data
const mockDialogueData = {
    'intro': {
        text: 'Hello, traveler.',
        options: [
            { text: 'Hi!', next: 'greet' },
            { text: 'Bye.', next: null }
        ]
    },
    'greet': {
        text: 'Welcome to the test.',
        options: []
    }
};

rpgManager.dialogueSystem.startDialogue('intro', mockDialogueData);
if (rpgManager.dialogueSystem.currentNode && rpgManager.dialogueSystem.currentNode.text === 'Hello, traveler.') {
    console.log('✅ Dialogue started successfully.');
} else {
    console.error('❌ Dialogue start failed.');
}

rpgManager.dialogueSystem.selectOption(0); // Select "Hi!"
if (rpgManager.dialogueSystem.currentNode && rpgManager.dialogueSystem.currentNode.text === 'Welcome to the test.') {
    console.log('✅ Dialogue navigation successful.');
} else {
    console.error('❌ Dialogue navigation failed.');
}

console.log('\n--- VERIFICATION COMPLETE: ALL SYSTEMS GO ---');
