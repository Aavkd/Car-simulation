/**
 * StatusBar.js
 * Phase 1: Editor Foundation
 * 
 * Bottom status bar showing context info, tips, and shortcuts.
 */

export class StatusBar {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;
        this.container = null;
        this.messageEl = null;
        this.infoEl = null;
    }

    build() {
        this.container = document.createElement('div');
        this.container.id = 'animator-statusbar';
        this.container.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 320px;
            right: 0;
            height: 28px;
            background: var(--anim-bg-secondary);
            border-top: 1px solid var(--anim-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 15px;
            font-size: 11px;
            color: var(--anim-text-secondary);
            pointer-events: auto;
        `;

        // Left side - contextual message
        this.messageEl = document.createElement('span');
        this.messageEl.textContent = 'Ready';
        this.container.appendChild(this.messageEl);

        // Right side - shortcuts hint
        this.infoEl = document.createElement('span');
        this.infoEl.style.color = 'var(--anim-text-muted)';
        this.infoEl.textContent = 'F8 to exit | Ctrl+Z Undo | Space Play';
        this.container.appendChild(this.infoEl);

        return this.container;
    }

    setMessage(msg) {
        if (this.messageEl) this.messageEl.textContent = msg;
    }

    setInfo(info) {
        if (this.infoEl) this.infoEl.textContent = info;
    }
}

export default StatusBar;
