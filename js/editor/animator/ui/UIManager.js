/**
 * UIManager.js
 * Phase 1: Editor Foundation
 * 
 * Centralized UI management for the animator editor.
 * Handles panel creation, theming, and layout.
 */

/**
 * Theme definitions
 */
export const THEMES = {
    dark: {
        name: 'Dark',
        primary: '#3498db',
        secondary: '#9b59b6',
        accent: '#e67e22',
        success: '#27ae60',
        danger: '#e74c3c',
        warning: '#f39c12',
        background: 'rgba(20, 20, 25, 0.96)',
        backgroundSecondary: 'rgba(30, 30, 40, 0.9)',
        surface: '#222',
        surfaceHover: '#333',
        border: '#444',
        borderLight: '#555',
        text: '#eee',
        textSecondary: '#aaa',
        textMuted: '#666',
    },
    light: {
        name: 'Light',
        primary: '#2980b9',
        secondary: '#8e44ad',
        accent: '#d35400',
        success: '#27ae60',
        danger: '#c0392b',
        warning: '#f39c12',
        background: 'rgba(245, 245, 250, 0.96)',
        backgroundSecondary: 'rgba(235, 235, 245, 0.9)',
        surface: '#fff',
        surfaceHover: '#f0f0f0',
        border: '#ddd',
        borderLight: '#ccc',
        text: '#222',
        textSecondary: '#555',
        textMuted: '#888',
    }
};

/**
 * Panel configuration defaults
 */
export const PANEL_DEFAULTS = {
    inspector: {
        position: 'left',
        width: 320,
        minWidth: 280,
        maxWidth: 500
    },
    timeline: {
        position: 'bottom',
        height: 250,
        minHeight: 150,
        maxHeight: 400
    },
    toolbar: {
        position: 'top',
        height: 50
    }
};

/**
 * UIManager - Centralized UI management
 */
export class UIManager {
    constructor(animatorEditor) {
        this.editor = animatorEditor;
        this.theme = THEMES.dark;
        this.panels = new Map();

        // Root container
        this.root = null;

        // Panel states for docking/undocking
        this.panelStates = new Map();

        console.log('[UIManager] Initialized');
    }

    /**
     * Initialize the UI
     */
    initialize() {
        this._createRootContainer();
        this._applyTheme();
    }

    /**
     * Create the main root container
     * @private
     */
    _createRootContainer() {
        this.root = document.createElement('div');
        this.root.id = 'animator-editor';
        this.root.className = 'animator-root';
        this.root.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            display: none;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 1000;
        `;
        document.body.appendChild(this.root);
    }

    /**
     * Apply current theme to CSS variables
     * @private
     */
    _applyTheme() {
        const style = document.createElement('style');
        style.id = 'animator-theme';
        style.textContent = `
            .animator-root {
                --anim-primary: ${this.theme.primary};
                --anim-secondary: ${this.theme.secondary};
                --anim-accent: ${this.theme.accent};
                --anim-success: ${this.theme.success};
                --anim-danger: ${this.theme.danger};
                --anim-warning: ${this.theme.warning};
                --anim-bg: ${this.theme.background};
                --anim-bg-secondary: ${this.theme.backgroundSecondary};
                --anim-surface: ${this.theme.surface};
                --anim-surface-hover: ${this.theme.surfaceHover};
                --anim-border: ${this.theme.border};
                --anim-border-light: ${this.theme.borderLight};
                --anim-text: ${this.theme.text};
                --anim-text-secondary: ${this.theme.textSecondary};
                --anim-text-muted: ${this.theme.textMuted};
            }
            
            /* Animator Panel Base Styles */
            .animator-panel {
                background: var(--anim-bg);
                border: 1px solid var(--anim-border);
                color: var(--anim-text);
                pointer-events: auto;
                box-shadow: 2px 0 10px rgba(0,0,0,0.5);
            }
            
            .animator-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                border-bottom: 1px solid var(--anim-border);
                background: var(--anim-bg-secondary);
            }
            
            .animator-panel-title {
                font-size: 13px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--anim-text-secondary);
            }
            
            .animator-panel-content {
                padding: 15px;
                overflow-y: auto;
            }
            
            /* Animator Button Styles */
            .animator-btn {
                padding: 8px 12px;
                border: 1px solid var(--anim-border);
                border-radius: 4px;
                background: var(--anim-surface);
                color: var(--anim-text);
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            
            .animator-btn:hover {
                background: var(--anim-surface-hover);
                border-color: var(--anim-border-light);
            }
            
            .animator-btn:active {
                transform: scale(0.98);
            }
            
            .animator-btn.primary {
                background: var(--anim-primary);
                border-color: var(--anim-primary);
                color: white;
            }
            
            .animator-btn.primary:hover {
                filter: brightness(1.1);
            }
            
            .animator-btn.success {
                background: var(--anim-success);
                border-color: var(--anim-success);
                color: white;
            }
            
            .animator-btn.danger {
                background: var(--anim-danger);
                border-color: var(--anim-danger);
                color: white;
            }
            
            .animator-btn.warning {
                background: var(--anim-warning);
                border-color: var(--anim-warning);
                color: white;
            }
            
            .animator-btn.accent {
                background: var(--anim-accent);
                border-color: var(--anim-accent);
                color: white;
            }
            
            .animator-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* Input Styles */
            .animator-input {
                padding: 6px 10px;
                border: 1px solid var(--anim-border);
                border-radius: 4px;
                background: var(--anim-surface);
                color: var(--anim-text);
                font-size: 12px;
            }
            
            .animator-input:focus {
                outline: none;
                border-color: var(--anim-primary);
            }
            
            .animator-slider {
                width: 100%;
                accent-color: var(--anim-primary);
            }
            
            /* Section Styles */
            .animator-section {
                margin-bottom: 15px;
                padding-bottom: 15px;
                border-bottom: 1px solid var(--anim-border);
            }
            
            .animator-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .animator-section-title {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--anim-text-secondary);
                margin-bottom: 10px;
            }
            
            /* Toolbar Styles */
            .animator-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 15px;
                background: var(--anim-bg-secondary);
                border-bottom: 1px solid var(--anim-border);
            }
            
            .animator-toolbar-group {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 0 8px;
                border-right: 1px solid var(--anim-border);
            }
            
            .animator-toolbar-group:last-child {
                border-right: none;
            }
            
            .animator-tool-btn {
                width: 32px;
                height: 32px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                border-radius: 4px;
                background: transparent;
                border: 1px solid transparent;
                color: var(--anim-text-secondary);
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .animator-tool-btn:hover {
                background: var(--anim-surface-hover);
                color: var(--anim-text);
            }
            
            .animator-tool-btn.active {
                background: var(--anim-primary);
                color: white;
                border-color: var(--anim-primary);
            }
            
            /* Status text */
            .animator-status {
                font-size: 11px;
                color: var(--anim-text-muted);
                font-family: monospace;
            }
            
            /* Collapsible sections */
            .animator-collapsible {
                cursor: pointer;
            }
            
            .animator-collapsible::before {
                content: '▼';
                display: inline-block;
                margin-right: 6px;
                font-size: 8px;
                transition: transform 0.2s ease;
            }
            
            .animator-collapsible.collapsed::before {
                transform: rotate(-90deg);
            }
            
            .animator-collapsible-content {
                overflow: hidden;
                transition: max-height 0.3s ease;
            }
            
            .animator-collapsible.collapsed + .animator-collapsible-content {
                max-height: 0 !important;
            }
            
            /* Scrollbar styling */
            .animator-panel ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            .animator-panel ::-webkit-scrollbar-track {
                background: var(--anim-surface);
            }
            
            .animator-panel ::-webkit-scrollbar-thumb {
                background: var(--anim-border);
                border-radius: 4px;
            }
            
            .animator-panel ::-webkit-scrollbar-thumb:hover {
                background: var(--anim-border-light);
            }
        `;

        // Remove old theme if exists
        const oldTheme = document.getElementById('animator-theme');
        if (oldTheme) oldTheme.remove();

        document.head.appendChild(style);
    }

    /**
     * Set and apply a new theme
     * @param {string} themeName - 'dark' or 'light'
     */
    setTheme(themeName) {
        if (THEMES[themeName]) {
            this.theme = THEMES[themeName];
            this._applyTheme();
            console.log(`[UIManager] Theme changed to: ${themeName}`);
        }
    }

    /**
     * Create a panel element
     * @param {string} id - Panel identifier
     * @param {Object} config - Panel configuration
     * @returns {HTMLElement}
     */
    createPanel(id, config = {}) {
        const panel = document.createElement('div');
        panel.id = `animator-panel-${id}`;
        panel.className = 'animator-panel';

        const defaults = PANEL_DEFAULTS[id] || {};
        const mergedConfig = { ...defaults, ...config };

        // Apply position-based styling
        switch (mergedConfig.position) {
            case 'left':
                panel.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: ${mergedConfig.width || 320}px;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                `;
                break;
            case 'right':
                panel.style.cssText = `
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: ${mergedConfig.width || 320}px;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                `;
                break;
            case 'bottom':
                panel.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: ${mergedConfig.height || 250}px;
                    display: flex;
                    flex-direction: column;
                `;
                break;
            case 'top':
                panel.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: ${mergedConfig.height || 50}px;
                    display: flex;
                    align-items: center;
                `;
                break;
        }

        // Store panel reference
        this.panels.set(id, panel);
        this.panelStates.set(id, {
            visible: true,
            docked: true,
            config: mergedConfig
        });

        return panel;
    }

    /**
     * Create a panel header
     * @param {string} title 
     * @param {Object} options - { closeable, collapsible }
     * @returns {HTMLElement}
     */
    createPanelHeader(title, options = {}) {
        const header = document.createElement('div');
        header.className = 'animator-panel-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'animator-panel-title';
        titleEl.textContent = title;
        header.appendChild(titleEl);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '4px';

        if (options.closeable) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'animator-tool-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.title = 'Close';
            closeBtn.onclick = options.onClose;
            actions.appendChild(closeBtn);
        }

        header.appendChild(actions);
        return header;
    }

    /**
     * Create a section within a panel
     * @param {string} title 
     * @param {boolean} collapsible 
     * @returns {Object} { container, content }
     */
    createSection(title, collapsible = false) {
        const container = document.createElement('div');
        container.className = 'animator-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'animator-section-title' + (collapsible ? ' animator-collapsible' : '');
        titleEl.textContent = title;
        container.appendChild(titleEl);

        const content = document.createElement('div');
        content.className = collapsible ? 'animator-collapsible-content' : '';
        container.appendChild(content);

        if (collapsible) {
            titleEl.onclick = () => {
                titleEl.classList.toggle('collapsed');
            };
        }

        return { container, content };
    }

    /**
     * Create a button
     * @param {string} text 
     * @param {Object} options - { icon, variant, disabled, onClick }
     * @returns {HTMLElement}
     */
    createButton(text, options = {}) {
        const btn = document.createElement('button');
        btn.className = 'animator-btn';
        if (options.variant) btn.classList.add(options.variant);
        if (options.disabled) btn.disabled = true;

        if (options.icon) {
            const icon = document.createElement('span');
            icon.textContent = options.icon;
            btn.appendChild(icon);
        }

        if (text) {
            const textEl = document.createElement('span');
            textEl.textContent = text;
            btn.appendChild(textEl);
        }

        if (options.onClick) {
            btn.onclick = options.onClick;
        }

        return btn;
    }

    /**
     * Create a labeled slider
     * @param {string} label 
     * @param {Object} options - { min, max, step, value, onChange }
     * @returns {Object} { container, slider, valueDisplay }
     */
    createSlider(label, options = {}) {
        const container = document.createElement('div');
        container.style.marginBottom = '10px';

        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 11px; color: var(--anim-text-secondary); margin-bottom: 4px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelRow.appendChild(labelEl);

        const valueDisplay = document.createElement('span');
        valueDisplay.style.fontFamily = 'monospace';
        valueDisplay.textContent = options.value?.toFixed?.(2) || options.value || '0';
        labelRow.appendChild(valueDisplay);

        container.appendChild(labelRow);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'animator-slider';
        slider.min = options.min ?? 0;
        slider.max = options.max ?? 100;
        slider.step = options.step ?? 1;
        slider.value = options.value ?? 50;

        slider.oninput = () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = val.toFixed(2);
            if (options.onChange) options.onChange(val);
        };

        container.appendChild(slider);

        return { container, slider, valueDisplay };
    }

    /**
     * Show/hide panel
     * @param {string} id 
     * @param {boolean} visible 
     */
    setPanelVisible(id, visible) {
        const panel = this.panels.get(id);
        if (panel) {
            panel.style.display = visible ? '' : 'none';
            const state = this.panelStates.get(id);
            if (state) state.visible = visible;
        }
    }

    /**
     * Get the root container
     * @returns {HTMLElement}
     */
    getRoot() {
        return this.root;
    }

    /**
     * Show the editor UI
     */
    show() {
        if (this.root) {
            this.root.style.display = 'block';
        }
    }

    /**
     * Hide the editor UI
     */
    hide() {
        if (this.root) {
            this.root.style.display = 'none';
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        if (this.root) {
            this.root.remove();
        }
        const themeStyle = document.getElementById('animator-theme');
        if (themeStyle) themeStyle.remove();

        this.panels.clear();
        this.panelStates.clear();
    }
}

export default UIManager;
