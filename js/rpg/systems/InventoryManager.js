/**
 * InventoryManager.js
 * Manages the player's inventory, including adding, removing, and checking items.
 */
export class InventoryManager {
    constructor(profile) {
        this.profile = profile;
        console.log('[InventoryManager] Initialized.');
    }

    /**
     * Adds an item to the inventory.
     * @param {string} itemId - The ID of the item to add.
     * @param {number} count - The quantity to add (default 1).
     * @param {string} type - The type of item (optional, for new items).
     */
    addItem(itemId, count = 1, type = 'MISC') {
        let item = this.profile.inventory.find(i => i.itemId === itemId);

        if (item) {
            item.count += count;
        } else {
            this.profile.inventory.push({
                itemId: itemId,
                count: count,
                type: type
            });
        }

        console.log(`[InventoryManager] Added ${count}x ${itemId}.`);
        this.profile.save();
    }

    /**
     * Removes an item from the inventory.
     * @param {string} itemId - The ID of the item to remove.
     * @param {number} count - The quantity to remove (default 1).
     * @returns {boolean} - True if successful, false if not enough items.
     */
    removeItem(itemId, count = 1) {
        let index = this.profile.inventory.findIndex(i => i.itemId === itemId);

        if (index === -1) {
            console.warn(`[InventoryManager] Item ${itemId} not found.`);
            return false;
        }

        let item = this.profile.inventory[index];
        if (item.count < count) {
            console.warn(`[InventoryManager] Not enough ${itemId}. Has ${item.count}, needed ${count}.`);
            return false;
        }

        item.count -= count;
        if (item.count === 0) {
            this.profile.inventory.splice(index, 1);
        }

        console.log(`[InventoryManager] Removed ${count}x ${itemId}.`);
        this.profile.save();
        return true;
    }

    /**
     * Checks if the player has a specific item.
     * @param {string} itemId - The ID of the item.
     * @param {number} count - The minimum quantity required (default 1).
     * @returns {boolean}
     */
    hasItem(itemId, count = 1) {
        let item = this.profile.inventory.find(i => i.itemId === itemId);
        return item && item.count >= count;
    }

    /**
     * Returns the quantity of a specific item.
     * @param {string} itemId 
     * @returns {number}
     */
    getItemCount(itemId) {
        let item = this.profile.inventory.find(i => i.itemId === itemId);
        return item ? item.count : 0;
    }

    /**
     * Debug method to list all items.
     */
    listItems() {
        console.table(this.profile.inventory);
    }

    /**
     * Retrieves static item definition.
     * @param {string} itemId 
     */
    getItemDefinition(itemId) {
        // Access static data via RPGManager
        // ITEMS is an object map
        return this.rpgManager.data.ITEMS[itemId];
    }
}
