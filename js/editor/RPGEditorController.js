import { NPCS } from '../rpg/data/npcs.js';
import { DIALOGUES } from '../rpg/data/dialogues.js';
import { ITEMS } from '../rpg/data/items.js';
import { QUESTS } from '../rpg/data/quests.js';

/**
 * RPGEditorController
 * Manages the RPG-specific features of the Level Editor
 */
export class RPGEditorController {
    constructor(editorController) {
        this.editor = editorController;
        this.gui = null;
        this.rpgFolder = null;
        this.npcFolder = null;

        // State
        this.selectedNPC = null;
    }

    /**
     * Initialize the RPG Editor UI
     * @param {GUI} gui - The main lil-gui instance
     */
    initialize(gui) {
        // Reset UI references to avoid destroying stale controllers
        this.rpgFolder = null;
        this.npcFolder = null;
        this.itemSelector = null;
        this.questSelector = null;
        this.spawnerItemSelector = null;

        this.gui = gui;
        this.rpgFolder = this.gui.addFolder('🎭 RPG Content');

        // NPC Inspector (Initially hidden or empty)
        this.npcFolder = this.rpgFolder.addFolder('NPC Inspector');
        this.npcFolder.close();

        // Data Editors
        this._createDataEditors();

        // Add "Spawn NPC" helper
        this._createSpawnTools();
    }

    _createSpawnTools() {
        const spawnFolder = this.rpgFolder.addFolder('Spawn Entities');

        // --- NPC SPAWNER ---
        const npcParams = {
            npcType: NPCS[0]?.id || '',
            spawn: () => {
                if (!npcParams.npcType) return;
                this._spawnNPC(npcParams.npcType);
            }
        };

        const npcOptions = {};
        NPCS.forEach(n => npcOptions[n.name] = n.id);

        spawnFolder.add(npcParams, 'npcType', npcOptions).name('Select NPC');
        spawnFolder.add(npcParams, 'spawn').name('Place NPC (Click)');

        // --- ITEM SPAWNER ---
        const itemParams = {
            itemId: '(Select Item)',
            spawn: () => this._spawnItem(itemParams.itemId)
        };

        const refreshItemSpawner = () => {
            const customItems = this._getCustomItems();
            const allIds = [...Object.keys(ITEMS), ...Object.keys(customItems)];

            if (this.spawnerItemSelector) this.spawnerItemSelector.destroy();
            this.spawnerItemSelector = spawnFolder.add(itemParams, 'itemId', allIds).name('Select Item');
        };
        refreshItemSpawner();
        spawnFolder.add(itemParams, 'spawn').name('Place Item (Click)');

        // Expose refresh so it can be called when new items are saved
        this.refreshItemSpawner = refreshItemSpawner;
    }

    _spawnNPC(npcId) {
        const npcDef = NPCS.find(n => n.id === npcId);
        if (!npcDef) return;

        // Construct a temporary asset config for the placement system
        // We reuse the visual properties from the NPC definition
        const placementAsset = {
            name: npcDef.name,
            path: npcDef.visual.modelPath,
            type: 'npc',
            category: 'rpg',
            scale: npcDef.visual.scale || 1,
            // Carry over RPG data to be applied on placement
            npcId: npcDef.id,
            dialogueId: npcDef.dialogueId,
            behavior: npcDef.behavior,
            flags: npcDef.flags
        };

        // Enter placement mode
        this.editor.objectManager.enterPlacementMode(placementAsset);
        this.editor._showNotification(`Placing: ${npcDef.name}`, 'info');
    }

    _spawnItem(itemId) {
        if (!itemId || itemId === '(Select Item)') return;

        // Get item def to display name
        const customItems = this._getCustomItems();
        const itemDef = ITEMS[itemId] || customItems[itemId];
        const itemName = itemDef ? itemDef.name : itemId;

        // Use a generic model for items for now (e.g., the Apple from asset lib)
        // In a real scenario, items might have specific models defined in ITEMS
        const modelPath = 'assets/objects/100.db.11_venus_apple_thorvaldsen.glb';

        const placementAsset = {
            name: itemName,
            path: modelPath,
            type: 'item',
            category: 'rpg',
            scale: 5.0, // Make it visible
            itemId: itemId,
            // Add a bobbing animation tag if we want
            proceduralOptions: { bob: true }
        };

        this.editor.objectManager.enterPlacementMode(placementAsset);
        this.editor._showNotification(`Placing Item: ${itemName}`, 'info');
    }

    /**
     * Called when an object is selected in the main editor
     * @param {THREE.Object3D} object 
     */
    onObjectSelected(object) {
        // Clear previous UI
        this._clearNPCInspector();

        if (!object || (object.userData.type !== 'npc' && object.userData.type !== 'enemy')) {
            this.selectedNPC = null;
            return;
        }

        this.selectedNPC = object;
        this.npcFolder.open();

        // Populate Fields
        const params = {
            id: object.userData.npcId || 'custom',
            name: object.userData.name,
            dialogueId: object.userData.dialogueId || '',
            behaviorType: object.userData.behavior?.type || 'idle',
            faction: object.userData.flags?.faction || 'neutral'
        };

        // Identity (Read Only for ID usually, but Name editable)
        this.npcFolder.add(params, 'id').name('NPC ID').disable();
        this.npcFolder.add(params, 'name').name('Display Name').onChange(v => {
            object.userData.name = v;
            object.userData.modified = true;
        });

        // Dialogue Selector
        const dialogueIds = Object.keys(DIALOGUES);
        this.npcFolder.add(params, 'dialogueId', ['(None)', ...dialogueIds])
            .name('Dialogue Tree')
            .onChange(v => {
                object.userData.dialogueId = v === '(None)' ? null : v;
                object.userData.modified = true;
            });

        // Behavior
        this.npcFolder.add(params, 'behaviorType', ['idle', 'patrol', 'guard', 'wander'])
            .name('Behavior')
            .onChange(v => {
                if (!object.userData.behavior) object.userData.behavior = {};
                object.userData.behavior.type = v;
                object.userData.modified = true;
            });

        // Faction
        this.npcFolder.add(params, 'faction', ['neutral', 'aethelgard', 'solis', 'bandit'])
            .name('Faction')
            .onChange(v => {
                if (!object.userData.flags) object.userData.flags = {};
                object.userData.flags.faction = v;
                object.userData.modified = true;
            });
    }

    _clearNPCInspector() {
        // Remove all controllers from the folder
        // lil-gui doesn't have a clear() method on folders, so we iterate controllers
        const controllers = [...this.npcFolder.controllers];
        controllers.forEach(c => c.destroy());
    }

    _createDataEditors() {
        const dataFolder = this.rpgFolder.addFolder('Data Editors');
        dataFolder.close(); // Closed by default

        // --- ITEM EDITOR ---
        const itemFolder = dataFolder.addFolder('Items');
        const itemParams = {
            selectedId: '(New Item)',
            id: 'item_new',
            name: 'New Item',
            type: 'consumable',
            value: 10,
            save: () => this._saveCustomItem(itemParams)
        };

        const refreshItemDropdown = () => {
            // Combine static and custom items
            const customItems = this._getCustomItems();
            const allIds = ['(New Item)', ...Object.keys(ITEMS), ...Object.keys(customItems)];

            // Update controller (lil-gui specific hack to update options)
            // simplified: we just destroy and recreate the dropdown
            if (this.itemSelector) this.itemSelector.destroy();
            this.itemSelector = itemFolder.add(itemParams, 'selectedId', allIds).name('Select Item').onChange(v => {
                if (v === '(New Item)') {
                    itemParams.id = 'item_new_' + Math.floor(Math.random() * 1000);
                    itemParams.name = 'New Item';
                    itemParams.type = 'consumable';
                    itemParams.value = 10;
                } else {
                    const item = ITEMS[v] || customItems[v];
                    if (item) {
                        itemParams.id = item.id;
                        itemParams.name = item.name;
                        itemParams.type = item.type;
                        itemParams.value = item.value;
                    }
                }
                // Refresh UI fields
                itemFolder.controllers.forEach(c => c.updateDisplay());
            });
            // Move selector to top
            // lil-gui appends, so we can't easily move it. Just allow it to be appended.
        };

        refreshItemDropdown();

        itemFolder.add(itemParams, 'id').name('ID');
        itemFolder.add(itemParams, 'name').name('Name');
        itemFolder.add(itemParams, 'type', ['consumable', 'equipment', 'key', 'material']).name('Type');
        itemFolder.add(itemParams, 'value').name('Value');
        itemFolder.add(itemParams, 'save').name('💾 Save Custom Item');

        // --- QUEST EDITOR ---
        const questFolder = dataFolder.addFolder('Quests');
        const questParams = {
            selectedId: '(New Quest)',
            id: 'quest_new',
            title: 'New Quest',
            desc: 'Description...',
            save: () => this._saveCustomQuest(questParams)
        };

        const refreshQuestDropdown = () => {
            const customQuests = this._getCustomQuests(); // Array
            const staticIds = QUESTS.map(q => q.id);
            const customIds = customQuests.map(q => q.id);
            const allIds = ['(New Quest)', ...staticIds, ...customIds];

            if (this.questSelector) this.questSelector.destroy();
            this.questSelector = questFolder.add(questParams, 'selectedId', allIds).name('Select Quest').onChange(v => {
                if (v === '(New Quest)') {
                    questParams.id = 'quest_new_' + Math.floor(Math.random() * 1000);
                    questParams.title = 'New Quest';
                    questParams.desc = 'Description...';
                } else {
                    const quest = QUESTS.find(q => q.id === v) || customQuests.find(q => q.id === v);
                    if (quest) {
                        questParams.id = quest.id;
                        questParams.title = quest.title;
                        questParams.desc = quest.description;
                    }
                }
                questFolder.controllers.forEach(c => c.updateDisplay());
            });
        };

        refreshQuestDropdown();

        questFolder.add(questParams, 'id').name('ID');
        questFolder.add(questParams, 'title').name('Title');
        questFolder.add(questParams, 'desc').name('Description');
        questFolder.add(questParams, 'save').name('💾 Save Custom Quest');
    }

    _getCustomItems() {
        try {
            return JSON.parse(localStorage.getItem('ae86_custom_items') || '{}');
        } catch (e) { return {}; }
    }

    _saveCustomItem(params) {
        const custom = this._getCustomItems();
        custom[params.id] = {
            id: params.id,
            name: params.name,
            type: params.type,
            value: params.value,
            custom: true
        };
        localStorage.setItem('ae86_custom_items', JSON.stringify(custom));
        // Refresh logic would go here ideally
        if (this.refreshItemSpawner) this.refreshItemSpawner();
    }

    _getCustomQuests() {
        try {
            return JSON.parse(localStorage.getItem('ae86_custom_quests') || '[]');
        } catch (e) { return []; }
    }

    _saveCustomQuest(params) {
        let custom = this._getCustomQuests();
        // Check if exists
        const idx = custom.findIndex(q => q.id === params.id);
        const questData = {
            id: params.id,
            title: params.title,
            description: params.desc,
            type: 'side',
            objectives: [], // Placeholder
            rewards: {},
            custom: true
        };

        if (idx >= 0) {
            custom[idx] = questData;
        } else {
            custom.push(questData);
        }

        localStorage.setItem('ae86_custom_quests', JSON.stringify(custom));
        alert(`Saved quest: ${params.id}`);
    }
    getCustomData() {
        return {
            items: this._getCustomItems(),
            quests: this._getCustomQuests()
        };
    }
}
