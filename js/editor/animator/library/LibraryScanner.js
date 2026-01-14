/**
 * LibraryScanner.js
 * Animation Library System - Phase 5.1
 * 
 * Handles loading and parsing of the animation library manifest.
 * Provides search and filtering capabilities.
 */

/**
 * Animation metadata structure
 * @typedef {Object} AnimationInfo
 * @property {string} name - Display name
 * @property {string} file - Filename (e.g., "Idle.fbx")
 * @property {number} duration - Duration in seconds
 * @property {string[]} tags - Searchable tags
 * @property {string} category - Parent category name
 * @property {string} path - Full path to file
 */

/**
 * Category structure
 * @typedef {Object} CategoryInfo
 * @property {string} name - Folder name
 * @property {string} displayName - Human-readable name
 * @property {AnimationInfo[]} animations - Animations in this category
 */

/**
 * LibraryScanner - Fetches and parses the animation library manifest
 */
export class LibraryScanner {
    constructor() {
        this.basePath = 'assets/animations/library';
        this.manifestPath = `${this.basePath}/index.json`;

        /** @type {CategoryInfo[]} */
        this.categories = [];

        /** @type {AnimationInfo[]} */
        this.allAnimations = [];

        this.loaded = false;
        this.loading = false;
        this.error = null;
    }

    /**
     * Load the library manifest
     * @returns {Promise<boolean>} Success status
     */
    async loadManifest() {
        if (this.loaded) {
            return true;
        }

        if (this.loading) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                const check = () => {
                    if (!this.loading) {
                        resolve(this.loaded);
                    } else {
                        setTimeout(check, 50);
                    }
                };
                check();
            });
        }

        this.loading = true;
        this.error = null;

        try {
            const response = await fetch(this.manifestPath);

            if (!response.ok) {
                throw new Error(`Failed to load library manifest: ${response.status}`);
            }

            const manifest = await response.json();
            this._parseManifest(manifest);

            this.loaded = true;
            console.log(`[LibraryScanner] Loaded ${this.allAnimations.length} animations in ${this.categories.length} categories`);

            return true;
        } catch (error) {
            this.error = error.message;
            console.error('[LibraryScanner] Error loading manifest:', error);
            return false;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Parse manifest data and build internal structures
     * @private
     * @param {Object} manifest - Raw manifest JSON
     */
    _parseManifest(manifest) {
        this.categories = [];
        this.allAnimations = [];

        if (!manifest.categories || !Array.isArray(manifest.categories)) {
            return;
        }

        for (const category of manifest.categories) {
            const categoryInfo = {
                name: category.name,
                displayName: category.displayName || category.name,
                animations: []
            };

            if (category.animations && Array.isArray(category.animations)) {
                for (const anim of category.animations) {
                    const animInfo = {
                        name: anim.name,
                        file: anim.file,
                        duration: anim.duration || 0,
                        tags: anim.tags || [],
                        category: category.name,
                        path: this.getAnimationPath(category.name, anim.file)
                    };

                    categoryInfo.animations.push(animInfo);
                    this.allAnimations.push(animInfo);
                }
            }

            this.categories.push(categoryInfo);
        }
    }

    /**
     * Get all categories
     * @returns {CategoryInfo[]}
     */
    getCategories() {
        return this.categories;
    }

    /**
     * Get all animations
     * @returns {AnimationInfo[]}
     */
    getAllAnimations() {
        return this.allAnimations;
    }

    /**
     * Get animations in a specific category
     * @param {string} categoryName 
     * @returns {AnimationInfo[]}
     */
    getAnimationsByCategory(categoryName) {
        const category = this.categories.find(c => c.name === categoryName);
        return category ? category.animations : [];
    }

    /**
     * Search animations by name or tags
     * @param {string} query - Search query
     * @returns {AnimationInfo[]} Matching animations
     */
    searchAnimations(query) {
        if (!query || query.trim() === '') {
            return this.allAnimations;
        }

        const lowerQuery = query.toLowerCase().trim();

        return this.allAnimations.filter(anim => {
            // Match by name
            if (anim.name.toLowerCase().includes(lowerQuery)) {
                return true;
            }

            // Match by tags
            if (anim.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                return true;
            }

            // Match by category
            if (anim.category.toLowerCase().includes(lowerQuery)) {
                return true;
            }

            return false;
        });
    }

    /**
     * Build full path to an animation file
     * @param {string} category - Category folder name
     * @param {string} filename - Animation filename
     * @returns {string} Full URL path
     */
    getAnimationPath(category, filename) {
        return `${this.basePath}/${category}/${filename}`;
    }

    /**
     * Get animation by name
     * @param {string} name - Animation name
     * @returns {AnimationInfo|null}
     */
    getAnimationByName(name) {
        return this.allAnimations.find(a => a.name === name) || null;
    }

    /**
     * Check if library is loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.loaded;
    }

    /**
     * Get loading error if any
     * @returns {string|null}
     */
    getError() {
        return this.error;
    }
}

export default LibraryScanner;
