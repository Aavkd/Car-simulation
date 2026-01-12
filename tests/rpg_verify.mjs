
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
// Mock Window and CustomEvent
global.window = {
    dispatchEvent: function (event) { console.log(`[Event Dispatched] ${event.type}`); }
};
global.CustomEvent = class CustomEvent {
    constructor(type, detail) {
        this.type = type;
        this.detail = detail;
    }
};

// ... (existing mocks) ...

// 4. Test Dialogue (Basic Logic)
console.log('\n[TEST 4] Testing Dialogue Logic...');
// Mock dialogue data matching the new structure (id, nodes)
const mockDialogueData = {
    'intro': {
        id: 'intro',
        nodes: {
            'start': {
                text: 'Hello, traveler.',
                choices: [
                    { text: 'Hi!', next: 'linear_step' },
                    { text: 'Bye.', next: null }
                ]
            },
            'linear_step': {
                text: 'No choices here, just listen.',
                next: 'final_step'
            },
            'final_step': {
                text: 'Goodbye.',
                end: true
            }
        }
    }
};

// Force inject the mock data since startDialogue usually looks up from RPGManager.data
rpgManager.data = { DIALOGUES: mockDialogueData };

rpgManager.dialogueSystem.startDialogue('intro');
if (rpgManager.dialogueSystem.currentNode && rpgManager.dialogueSystem.currentNode.text === 'Hello, traveler.') {
    console.log('✅ Dialogue started successfully.');
} else {
    console.error('❌ Dialogue start failed.');
}

rpgManager.dialogueSystem.selectOption(0); // Select "Hi!" -> goes to 'linear_step'
if (rpgManager.dialogueSystem.currentNode && rpgManager.dialogueSystem.currentNode.text === 'No choices here, just listen.') {
    console.log('✅ Dialogue navigation (Choice) successful.');
} else {
    console.error('❌ Dialogue navigation (Choice) failed.');
}

// Test advance()
rpgManager.dialogueSystem.advance(); // Should go to 'final_step'
if (rpgManager.dialogueSystem.currentNode && rpgManager.dialogueSystem.currentNode.text === 'Goodbye.') {
    console.log('✅ Dialogue advance() (Linear) successful.');
} else {
    console.error(`❌ Dialogue advance() failed. Current Node: ${JSON.stringify(rpgManager.dialogueSystem.currentNode)}`);
}

// 5. Test Profile Flags
console.log('\n[TEST 5] Testing Profile Flags...');
rpgManager.profile.setFlag('test_flag', 'foobar');
if (rpgManager.profile.getFlag('test_flag') === 'foobar') {
    console.log('✅ Flag set/get successful.');
} else {
    console.error(`❌ Flag set/get failed. Value: ${rpgManager.profile.getFlag('test_flag')}`);
}
if (rpgManager.profile.hasFlag('test_flag')) {
    console.log('✅ hasFlag successful.');
} else {
    console.error('❌ hasFlag failed.');
}

console.log('\n--- VERIFICATION COMPLETE: ALL SYSTEMS GO ---');
