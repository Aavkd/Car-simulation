/**
 * LevelSerializer - Handles saving and loading custom levels
 * Uses LocalStorage for persistence and supports JSON export/import
 */
export class LevelSerializer {
    constructor() {
        this.storageKey = 'ae86_custom_levels';
        this.currentLevelKey = 'ae86_current_level';
    }

    /**
     * Save a level to LocalStorage
     * @param {Object} levelData - Complete level data
     * @returns {boolean} Success
     */
    saveLevel(levelData) {
        try {
            // Ensure level has an ID
            if (!levelData.id) {
                levelData.id = this._generateId();
            }

            // Add timestamp
            levelData.savedAt = Date.now();

            // Get existing levels
            const levels = this.getAllLevels();

            // Update or add
            const existingIndex = levels.findIndex(l => l.id === levelData.id);
            if (existingIndex >= 0) {
                levels[existingIndex] = levelData;
            } else {
                levels.push(levelData);
            }

            // Save to LocalStorage
            localStorage.setItem(this.storageKey, JSON.stringify(levels));
            console.log(`[LevelSerializer] Saved level: ${levelData.name}`);

            return true;
        } catch (error) {
            console.error('[LevelSerializer] Failed to save level:', error);
            return false;
        }
    }

    /**
     * Load a level by ID
     * @param {string} levelId 
     * @returns {Object|null}
     */
    loadLevel(levelId) {
        try {
            const levels = this.getAllLevels();
            const level = levels.find(l => l.id === levelId);
            if (level) {
                console.log(`[LevelSerializer] Loaded level: ${level.name}`);
            }
            return level || null;
        } catch (error) {
            console.error('[LevelSerializer] Failed to load level:', error);
            return null;
        }
    }

    /**
     * Delete a level by ID
     * @param {string} levelId 
     * @returns {boolean}
     */
    deleteLevel(levelId) {
        try {
            const levels = this.getAllLevels();
            const filtered = levels.filter(l => l.id !== levelId);
            localStorage.setItem(this.storageKey, JSON.stringify(filtered));
            console.log(`[LevelSerializer] Deleted level: ${levelId}`);
            return true;
        } catch (error) {
            console.error('[LevelSerializer] Failed to delete level:', error);
            return false;
        }
    }

    /**
     * Get all saved levels
     * @returns {Array}
     */
    getAllLevels() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('[LevelSerializer] Failed to get levels:', error);
            return [];
        }
    }

    /**
     * Create a level data object
     * @param {Object} options 
     * @returns {Object}
     */
    createLevelData(options = {}) {
        return {
            version: 1.0,
            id: options.id || this._generateId(),
            meta: {
                name: options.name || 'Untitled Level',
                author: options.author || 'Player',
                baseType: options.baseType || 'procedural',
                createdAt: Date.now()
            },
            environment: {
                seed: options.seed || Math.floor(Math.random() * 10000),
                timeOfDay: options.timeOfDay || 0.5,
                skyType: options.skyType || 'standard',  // 'standard', 'deepspace', 'spaceground', 'vaporwave'
                fogDensity: options.fogDensity || 0.0005,
                fogColor: options.fogColor || 0x87CEEB,
                parameters: {
                    heightScale: options.heightScale || 50,
                    roughness: options.roughness || 1
                }
            },
            objects: options.objects || [],
            physics: {
                gravityMultiplier: options.gravityMultiplier || 1.0,
                frictionModifier: options.frictionModifier || 1.0
            }
        };
    }

    /**
     * Export level to JSON file (downloads)
     * @param {Object} levelData 
     */
    exportToFile(levelData) {
        try {
            const json = JSON.stringify(levelData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `${levelData.meta?.name || 'level'}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`[LevelSerializer] Exported: ${link.download}`);
        } catch (error) {
            console.error('[LevelSerializer] Failed to export:', error);
        }
    }

    /**
     * Import level from JSON file
     * @param {File} file 
     * @returns {Promise<Object>}
     */
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const levelData = JSON.parse(e.target.result);
                    // Generate new ID to avoid conflicts
                    levelData.id = this._generateId();
                    levelData.meta.name = levelData.meta.name + ' (imported)';
                    console.log(`[LevelSerializer] Imported: ${levelData.meta.name}`);
                    resolve(levelData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Save current working level (autosave)
     * @param {Object} levelData 
     */
    saveCurrentLevel(levelData) {
        try {
            localStorage.setItem(this.currentLevelKey, JSON.stringify(levelData));
        } catch (error) {
            console.error('[LevelSerializer] Autosave failed:', error);
        }
    }

    /**
     * Load current working level
     * @returns {Object|null}
     */
    loadCurrentLevel() {
        try {
            const data = localStorage.getItem(this.currentLevelKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear current working level
     */
    clearCurrentLevel() {
        localStorage.removeItem(this.currentLevelKey);
    }

    // === Private Methods ===

    _generateId() {
        return 'level_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}
