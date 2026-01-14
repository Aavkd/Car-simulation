/**
 * LibraryPanel.js
 * Animation Library System - Phase 5.2
 * 
 * Searchable UI panel for browsing and previewing animations.
 * Displays folder hierarchy with preview/apply functionality.
 */

/**
 * LibraryPanel - Animation library browser UI
 */
export class LibraryPanel {
    /**
     * @param {Object} uiManager - Reference to UIManager
     * @param {Object} libraryService - Reference to LibraryService
     * @param {Object} editor - Reference to AnimatorEditorController
     */
    constructor(uiManager, libraryService, editor) {
        this.uiManager = uiManager;
        this.libraryService = libraryService;
        this.editor = editor;

        // UI elements
        this.container = null;
        this.searchInput = null;
        this.categoryContainer = null;
        this.statusBar = null;

        // State
        this.selectedAnimation = null;
        this.expandedCategories = new Set();
        this.searchQuery = '';

        // Callbacks
        this.onPreview = null;
        this.onApply = null;
    }

    /**
     * Build the panel UI
     * @returns {HTMLElement}
     */
    build() {
        this.container = document.createElement('div');
        this.container.className = 'library-panel';
        this.container.style.cssText = `
            position: absolute;
            top: 40px;
            right: 0;
            width: 320px;
            height: calc(100% - 70px);
            background: rgba(30, 30, 35, 0.98);
            border-left: 1px solid #444;
            display: none;
            flex-direction: column;
            color: #eee;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            pointer-events: auto;
            box-shadow: -2px 0 10px rgba(0,0,0,0.3);
            z-index: 100;
        `;

        // Header
        this.container.appendChild(this._buildHeader());

        // Search bar
        this.container.appendChild(this._buildSearchBar());

        // Category list (scrollable)
        this.container.appendChild(this._buildCategoryList());

        // Status bar
        this.container.appendChild(this._buildStatusBar());

        // Initial load
        this._loadLibrary();

        return this.container;
    }

    /**
     * Build header section
     * @private
     * @returns {HTMLElement}
     */
    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'library-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: #2a2a30;
            border-bottom: 1px solid #444;
        `;

        const title = document.createElement('span');
        title.innerHTML = '📚 Animation Library';
        title.style.cssText = `
            font-weight: 600;
            font-size: 13px;
        `;
        header.appendChild(title);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close Library';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 16px;
            padding: 4px 8px;
            border-radius: 4px;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#888';
        closeBtn.onclick = () => {
            if (this.editor.toggleLibraryPanel) {
                this.editor.toggleLibraryPanel();
            } else {
                this.hide();
            }
        };
        header.appendChild(closeBtn);

        return header;
    }

    /**
     * Build search bar
     * @private
     * @returns {HTMLElement}
     */
    _buildSearchBar() {
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            padding: 8px 12px;
            border-bottom: 1px solid #444;
        `;

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = '🔍 Search animations...';
        this.searchInput.style.cssText = `
            width: 100%;
            padding: 8px 10px;
            background: #1a1a1e;
            border: 1px solid #444;
            border-radius: 6px;
            color: #eee;
            font-size: 12px;
            outline: none;
            box-sizing: border-box;
        `;

        this.searchInput.onfocus = () => {
            this.searchInput.style.borderColor = '#4a9eff';
        };

        this.searchInput.onblur = () => {
            this.searchInput.style.borderColor = '#444';
        };

        this.searchInput.oninput = () => {
            this.searchQuery = this.searchInput.value;
            this._updateCategoryList();
        };

        searchContainer.appendChild(this.searchInput);
        return searchContainer;
    }

    /**
     * Build category list container
     * @private
     * @returns {HTMLElement}
     */
    _buildCategoryList() {
        this.categoryContainer = document.createElement('div');
        this.categoryContainer.className = 'library-categories';
        this.categoryContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        `;

        return this.categoryContainer;
    }

    /**
     * Build status bar
     * @private
     * @returns {HTMLElement}
     */
    _buildStatusBar() {
        this.statusBar = document.createElement('div');
        this.statusBar.className = 'library-status';
        this.statusBar.style.cssText = `
            padding: 8px 12px;
            border-top: 1px solid #444;
            font-size: 11px;
            color: #888;
            background: #222;
        `;
        this.statusBar.textContent = 'Loading...';
        return this.statusBar;
    }

    /**
     * Load library data
     * @private
     */
    async _loadLibrary() {
        this.statusBar.textContent = 'Loading library...';

        const success = await this.libraryService.initialize();

        if (success) {
            this._updateCategoryList();
            const scanner = this.libraryService.getScanner();
            this.statusBar.textContent = `${scanner.getAllAnimations().length} animations`;
        } else {
            this.categoryContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--anim-text-muted);">
                    <p>⚠️ Failed to load library</p>
                    <p style="font-size: 11px;">Check if index.json exists</p>
                </div>
            `;
            this.statusBar.textContent = 'Error loading library';
        }
    }

    /**
     * Refresh library from server
     * @private
     */
    async _refreshLibrary() {
        this.libraryService.clearCache();
        await this._loadLibrary();
    }

    /**
     * Update category list based on search
     * @private
     */
    _updateCategoryList() {
        this.categoryContainer.innerHTML = '';

        const scanner = this.libraryService.getScanner();

        if (!scanner.isLoaded()) {
            return;
        }

        const categories = scanner.getCategories();
        let totalVisible = 0;

        for (const category of categories) {
            // Filter animations by search
            let animations = category.animations;

            if (this.searchQuery) {
                animations = scanner.searchAnimations(this.searchQuery)
                    .filter(a => a.category === category.name);
            }

            if (animations.length === 0) {
                continue;
            }

            totalVisible += animations.length;

            const categoryEl = this._buildCategory(category, animations);
            this.categoryContainer.appendChild(categoryEl);
        }

        if (totalVisible === 0 && this.searchQuery) {
            this.categoryContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--anim-text-muted);">
                    <p>No animations match "${this.searchQuery}"</p>
                </div>
            `;
        }

        this.statusBar.textContent = this.searchQuery
            ? `${totalVisible} result${totalVisible !== 1 ? 's' : ''}`
            : `${scanner.getAllAnimations().length} animations`;
    }

    /**
     * Build a category section
     * @private
     * @param {Object} category 
     * @param {Array} animations 
     * @returns {HTMLElement}
     */
    _buildCategory(category, animations) {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'library-category';
        categoryEl.style.cssText = `
            margin-bottom: 4px;
        `;

        // Category header
        const isExpanded = this.expandedCategories.has(category.name) || this.searchQuery;

        const header = document.createElement('div');
        header.className = 'category-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            padding: 8px 12px;
            cursor: pointer;
            user-select: none;
            background: transparent;
            transition: background 0.15s;
        `;

        header.onmouseover = () => header.style.background = '#333';
        header.onmouseout = () => header.style.background = 'transparent';

        const arrow = document.createElement('span');
        arrow.textContent = isExpanded ? '▼' : '▶';
        arrow.style.cssText = `
            margin-right: 8px;
            font-size: 10px;
            color: #888;
        `;

        const name = document.createElement('span');
        name.textContent = category.displayName;
        name.style.cssText = `
            flex: 1;
            font-weight: 500;
        `;

        const count = document.createElement('span');
        count.textContent = animations.length;
        count.style.cssText = `
            font-size: 11px;
            color: #888;
            background: #1a1a1e;
            padding: 2px 6px;
            border-radius: 10px;
        `;

        header.appendChild(arrow);
        header.appendChild(name);
        header.appendChild(count);
        categoryEl.appendChild(header);

        // Animation list
        const list = document.createElement('div');
        list.className = 'category-list';
        list.style.cssText = `
            display: ${isExpanded ? 'block' : 'none'};
            padding-left: 12px;
        `;

        for (const anim of animations) {
            list.appendChild(this._buildAnimationItem(anim));
        }

        categoryEl.appendChild(list);

        // Toggle expand/collapse
        header.onclick = () => {
            const nowExpanded = list.style.display !== 'none';
            list.style.display = nowExpanded ? 'none' : 'block';
            arrow.textContent = nowExpanded ? '▶' : '▼';

            if (nowExpanded) {
                this.expandedCategories.delete(category.name);
            } else {
                this.expandedCategories.add(category.name);
            }
        };

        return categoryEl;
    }

    /**
     * Build an animation item row
     * @private
     * @param {Object} anim - Animation info
     * @returns {HTMLElement}
     */
    _buildAnimationItem(anim) {
        const item = document.createElement('div');
        item.className = 'library-animation-item';
        item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 6px 12px;
            cursor: pointer;
            border-radius: 4px;
            margin: 2px 4px;
            transition: background 0.15s;
        `;

        const isSelected = this.selectedAnimation === anim;
        item.style.background = isSelected ? 'rgba(74, 158, 255, 0.2)' : 'transparent';

        item.onmouseover = () => {
            if (this.selectedAnimation !== anim) {
                item.style.background = '#333';
            }
        };

        item.onmouseout = () => {
            item.style.background = this.selectedAnimation === anim
                ? 'rgba(74, 158, 255, 0.2)'
                : 'transparent';
        };

        // Icon
        const icon = document.createElement('span');
        icon.textContent = '🎬';
        icon.style.marginRight = '8px';

        // Name
        const name = document.createElement('span');
        name.textContent = anim.name;
        name.style.cssText = `flex: 1; font-size: 12px;`;

        // Duration
        const duration = document.createElement('span');
        duration.textContent = `${anim.duration.toFixed(1)}s`;
        duration.style.cssText = `
            font-size: 10px;
            color: #888;
            margin-right: 8px;
        `;

        // Preview button
        const previewBtn = document.createElement('button');
        previewBtn.innerHTML = this.libraryService.getCurrentPreview() === anim ? '⏹' : '▶';
        previewBtn.title = 'Preview Animation';
        previewBtn.style.cssText = `
            background: #4a9eff;
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            margin-right: 4px;
        `;
        previewBtn.onclick = (e) => {
            e.stopPropagation();
            this._togglePreview(anim, previewBtn);
        };

        // Apply button
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.title = 'Import Animation';
        applyBtn.style.cssText = `
            background: #333;
            border: 1px solid #444;
            color: #eee;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
        `;
        applyBtn.onclick = (e) => {
            e.stopPropagation();
            this._applyAnimation(anim);
        };

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(duration);
        item.appendChild(previewBtn);
        item.appendChild(applyBtn);

        // Click to select
        item.onclick = () => {
            this.selectedAnimation = anim;
            this._updateCategoryList();
        };

        // Double-click to preview
        item.ondblclick = () => {
            this._togglePreview(anim, previewBtn);
        };

        return item;
    }

    /**
     * Toggle animation preview
     * @private
     * @param {Object} anim 
     * @param {HTMLElement} button 
     */
    async _togglePreview(anim, button) {
        if (!this.editor.selectedEntity) {
            this.statusBar.textContent = '⚠️ Select an entity first';
            return;
        }

        if (this.libraryService.getCurrentPreview() === anim) {
            // Stop preview
            this.libraryService.stopPreview();
            button.innerHTML = '▶';
            this.statusBar.textContent = 'Preview stopped';
        } else {
            // Stop any existing preview
            this.libraryService.stopPreview();

            // Start new preview
            this.statusBar.textContent = `Loading ${anim.name}...`;

            const success = await this.libraryService.previewAnimation(anim);

            if (success) {
                button.innerHTML = '⏹';
                this.statusBar.textContent = `Playing: ${anim.name}`;

                if (this.onPreview) {
                    this.onPreview(anim);
                }
            } else {
                this.statusBar.textContent = '⚠️ Preview failed';
            }
        }

        // Update all buttons
        this._updateCategoryList();
    }

    /**
     * Apply animation to entity
     * @private
     * @param {Object} anim 
     */
    async _applyAnimation(anim) {
        if (!this.editor.selectedEntity) {
            this.statusBar.textContent = '⚠️ Select an entity first';
            return;
        }

        this.statusBar.textContent = `Importing ${anim.name}...`;

        // First preview if not already
        if (this.libraryService.getCurrentPreview() !== anim) {
            await this.libraryService.previewAnimation(anim);
        }

        const success = await this.libraryService.applyAnimation();

        if (success) {
            this.statusBar.textContent = `✅ Imported: ${anim.name}`;

            if (this.onApply) {
                this.onApply(anim);
            }
        } else {
            this.statusBar.textContent = '⚠️ Import failed';
        }
    }

    /**
     * Show the panel
     */
    show() {
        if (this.container) {
            this.container.style.display = 'flex';
        }
    }

    /**
     * Hide the panel
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
     * Check if visible
     * @returns {boolean}
     */
    isVisible() {
        return this.container && this.container.style.display !== 'none';
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
    }
}

export default LibraryPanel;
