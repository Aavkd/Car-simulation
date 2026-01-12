/**
 * QuestManager.js
 * Manages quest states, objectives, and progression.
 */
export class QuestManager {
    constructor(profile) {
        this.profile = profile;
        console.log('[QuestManager] Initialized.');
    }

    /**
     * Starts a quest by ID.
     * @param {string} questId 
     * @param {Object} questData - Optional initial data or overrides.
     */
    startQuest(questId, questData = {}) {
        if (this.profile.quests[questId]) {
            console.warn(`[QuestManager] Quest ${questId} already active or completed.`);
            return;
        }

        // Look up static definition
        // We assume this.rpgManager.data.QUESTS is an array, so we find by ID
        // (Optimally this would be a map, but the current file format is an array)
        const staticDef = this.rpgManager.data.QUESTS.find(q => q.id === questId);
        if (!staticDef) {
            console.error(`[QuestManager] Quest definition for ${questId} not found.`);
            return;
        }

        this.profile.quests[questId] = {
            id: questId,
            status: 'ACTIVE',
            objectiveIndex: 0,
            startedAt: Date.now(),
            title: staticDef.title, // Cache basics in save for easier UI display
            ...questData
        };

        console.log(`[QuestManager] Started quest: ${staticDef.title} (${questId})`);
        this.profile.save();

        window.dispatchEvent(new CustomEvent('RPG_QUEST_START', {
            detail: { id: questId, title: staticDef.title }
        }));
        window.dispatchEvent(new CustomEvent('RPG_QUEST_UPDATE', { detail: { id: questId } }));
    }

    /**
     * Advances the objective of a quest.
     * @param {string} questId 
     */
    completeObjective(questId) {
        const quest = this.profile.quests[questId];
        if (!quest || quest.status !== 'ACTIVE') return;

        quest.objectiveIndex++;
        console.log(`[QuestManager] Quest ${questId} objective updated to ${quest.objectiveIndex}.`);
        this.profile.save();

        window.dispatchEvent(new CustomEvent('RPG_QUEST_UPDATE', { detail: { id: questId } }));
    }

    /**
     * Completes a quest.
     * @param {string} questId 
     */
    completeQuest(questId) {
        const quest = this.profile.quests[questId];
        if (!quest || quest.status !== 'ACTIVE') return;

        quest.status = 'COMPLETED';
        quest.completedAt = Date.now();

        console.log(`[QuestManager] Quest completed: ${questId}`);
        this.profile.save();

        // Find static data for title and rewards
        const staticDef = this.rpgManager.data.QUESTS.find(q => q.id === questId);

        if (staticDef && staticDef.rewards) {
            const rewards = staticDef.rewards;
            if (rewards.xp) this.profile.addXp(rewards.xp);
            if (rewards.gold || rewards.money) this.profile.addMoney(rewards.gold || rewards.money);

            if (rewards.items && this.rpgManager.inventory) {
                rewards.items.forEach(item => {
                    // Handle both string ID and object {id, count} formats
                    if (typeof item === 'string') {
                        this.rpgManager.inventory.addItem(item, 1);
                    } else if (item.id) {
                        this.rpgManager.inventory.addItem(item.id, item.count || 1);
                    }
                });
            }
            console.log(`[QuestManager] Awarded rewards for ${questId}`, rewards);
        }

        window.dispatchEvent(new CustomEvent('RPG_QUEST_COMPLETE', {
            detail: { id: questId, title: staticDef ? staticDef.title : questId, rewards: staticDef ? staticDef.rewards : null }
        }));
        window.dispatchEvent(new CustomEvent('RPG_QUEST_UPDATE', { detail: { id: questId } }));
    }

    /**
     * Fails a quest.
     * @param {string} questId 
     */
    failQuest(questId) {
        const quest = this.profile.quests[questId];
        if (!quest || quest.status !== 'ACTIVE') return;

        quest.status = 'FAILED';

        console.log(`[QuestManager] Quest failed: ${questId}`);
        this.profile.save();
    }

    /**
     * Checks the status of a quest.
     * @param {string} questId 
     * @returns {string|null} 'ACTIVE', 'COMPLETED', 'FAILED', or null if not started.
     */
    getQuestStatus(questId) {
        return this.profile.quests[questId] ? this.profile.quests[questId].status : null;
    }

    getActiveQuest() {
        // Find the first ACTIVE quest
        const activeQuestId = Object.keys(this.profile.quests).find(id => this.profile.quests[id].status === 'ACTIVE');
        if (!activeQuestId) return null;

        const dynamicData = this.profile.quests[activeQuestId];
        const staticDef = this.rpgManager.data.QUESTS.find(q => q.id === activeQuestId);

        if (!staticDef) return null;

        // Merge objectives with completion status
        const objectives = staticDef.objectives.map((obj, index) => ({
            description: obj.text || obj.description || obj,
            isCompleted: index < dynamicData.objectiveIndex
        }));

        return {
            id: activeQuestId,
            title: staticDef.title,
            description: staticDef.description,
            objectives: objectives,
            dynamicData: dynamicData
        };
    }
}
