
/**
 * RPGProfile.js
 * Manages the persistent state of the player in the RPG world.
 * Tracks stats, quest progress, inventory, and world flags.
 */
export class RPGProfile {
    constructor() {
        // Core Stats
        this.xp = 0;
        this.level = 1;
        this.money = 0;
        this.reputation = 0;

        // Quest Tracking
        // Format: { questId: { status: 'ACTIVE'|'COMPLETED'|'FAILED', objectiveIndex: 0 } }
        this.quests = {};

        // Inventory
        // Format: [ { itemId: 'wrench', count: 1, type: 'KEY_ITEM' } ]
        this.inventory = [];

        // World State Flags
        // Format: { 'discovered_mechanic': true, 'unlocked_dunes': false }
        this.flags = {};

        // Attempt to load existing data
        this.load();
    }

    /**
     * Serializes current state to a plain object
     */
    serialize() {
        return {
            xp: this.xp,
            level: this.level,
            money: this.money,
            reputation: this.reputation,
            quests: this.quests,
            inventory: this.inventory,
            flags: this.flags,
            lastSave: Date.now()
        };
    }

    /**
     * Deserializes data into this profile
     */
    deserialize(data) {
        if (!data) return;
        this.xp = data.xp || 0;
        this.level = data.level || 1;
        this.money = data.money || 0;
        this.reputation = data.reputation || 0;
        this.quests = data.quests || {};
        this.inventory = data.inventory || [];
        this.flags = data.flags || {};

        console.log('[RPGProfile] Profile loaded successfully.');
    }

    setFlag(key, value) {
        this.flags[key] = value;
        console.log(`[RPGProfile] Flag set: ${key} = ${value}`);
        this.save();
    }

    getFlag(key) {
        return this.flags[key];
    }

    hasFlag(key) {
        return !!this.flags[key];
    }

    save() {
        const data = JSON.stringify(this.serialize());
        localStorage.setItem('ae86_rpg_profile', data);
        console.log('[RPGProfile] Game saved.');
    }

    load() {
        const data = localStorage.getItem('ae86_rpg_profile');
        if (data) {
            try {
                this.deserialize(JSON.parse(data));
            } catch (e) {
                console.warn('[RPGProfile] Failed to load save data:', e);
            }
        }
    }

    reset() {
        localStorage.removeItem('ae86_rpg_profile');
        this.deserialize({});
        console.log('[RPGProfile] Save data reset.');
    }
}
