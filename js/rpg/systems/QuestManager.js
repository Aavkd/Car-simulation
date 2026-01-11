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

        this.profile.quests[questId] = {
            id: questId,
            status: 'ACTIVE',
            objectiveIndex: 0,
            startedAt: Date.now(),
            ...questData
        };

        console.log(`[QuestManager] Started quest: ${questId}`);
        this.profile.save();
        // TODO: Emit 'quest_started' event
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
        // TODO: Emit 'quest_objective_completed' event
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
        // TODO: Emit 'quest_completed' event (listeners could award XP/money)
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
}
