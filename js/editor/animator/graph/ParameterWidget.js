/**
 * ParameterWidget.js
 * Phase 2: Visual State Machine Graph Editor
 * 
 * Enhanced parameter panel for testing FSM parameters in real-time.
 */

export class ParameterWidget {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;

        this.container = null;
        this.parametersContainer = null;
        this.parameterElements = new Map();
    }

    build() {
        this.container = document.createElement('div');
        this.container.id = 'animator-params-widget';
        this.container.className = 'animator-panel';
        this.container.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 320px;
            width: 300px;
            max-height: 250px;
            display: flex;
            flex-direction: column;
        `;

        const header = this.uiManager.createPanelHeader('Parameters', {});

        // Add parameter button
        const addBtn = document.createElement('button');
        addBtn.className = 'animator-tool-btn';
        addBtn.innerHTML = '+';
        addBtn.title = 'Add Parameter';
        addBtn.onclick = () => this._showAddParameterDialog();
        header.querySelector('div').appendChild(addBtn);

        this.container.appendChild(header);

        // Parameters list
        this.parametersContainer = document.createElement('div');
        this.parametersContainer.className = 'animator-panel-content';
        this.parametersContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px;';
        this.container.appendChild(this.parametersContainer);

        return this.container;
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }

    loadFromAnimator(animator) {
        this.parametersContainer.innerHTML = '';
        this.parameterElements.clear();

        if (!animator?.fsm?.data) {
            this.parametersContainer.innerHTML = '<div style="color:var(--anim-text-muted);font-size:12px;padding:10px;">No parameters</div>';
            return;
        }

        const data = animator.fsm.data;

        for (const [key, value] of Object.entries(data)) {
            const el = this._createParameterRow(key, value, animator.fsm);
            this.parametersContainer.appendChild(el);
            this.parameterElements.set(key, el);
        }
    }

    _createParameterRow(key, value, fsm) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px;background:var(--anim-surface);border-radius:4px;';

        // Type indicator
        const typeIcon = document.createElement('span');
        typeIcon.style.cssText = 'font-size:12px;opacity:0.6;width:20px;';

        // Name
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'flex:1;font-size:12px;color:var(--anim-text);';
        nameEl.textContent = key;

        row.appendChild(typeIcon);
        row.appendChild(nameEl);

        if (typeof value === 'boolean') {
            typeIcon.textContent = '☑';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.style.accentColor = 'var(--anim-primary)';
            checkbox.onchange = () => fsm.setData(key, checkbox.checked);
            row.appendChild(checkbox);
        } else if (typeof value === 'number') {
            typeIcon.textContent = '#';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 0;
            slider.max = 10;
            slider.step = 0.1;
            slider.value = value;
            slider.style.cssText = 'width:80px;accent-color:var(--anim-primary);';

            const display = document.createElement('span');
            display.style.cssText = 'width:40px;font-size:11px;font-family:monospace;color:var(--anim-primary);';
            display.textContent = value.toFixed(2);

            slider.oninput = () => {
                const v = parseFloat(slider.value);
                display.textContent = v.toFixed(2);
                fsm.setData(key, v);
            };

            row.appendChild(slider);
            row.appendChild(display);
        } else {
            typeIcon.textContent = '?';
            const textEl = document.createElement('span');
            textEl.style.cssText = 'font-size:11px;color:var(--anim-text-muted);';
            textEl.textContent = String(value);
            row.appendChild(textEl);
        }

        return row;
    }

    _showAddParameterDialog() {
        console.log('[ParameterWidget] Add parameter dialog not implemented yet');
    }

    update() {
        if (!this.editor.selectedEntity?.animator?.fsm) return;

        const data = this.editor.selectedEntity.animator.fsm.data;
        for (const [key, el] of this.parameterElements) {
            const value = data[key];
            const input = el.querySelector('input');
            if (!input || document.activeElement === input) continue;

            if (input.type === 'checkbox') {
                input.checked = value;
            } else if (input.type === 'range') {
                input.value = value;
                const display = el.querySelector('span:last-child');
                if (display) display.textContent = value.toFixed(2);
            }
        }
    }

    dispose() {
        if (this.container) this.container.remove();
        this.parameterElements.clear();
    }
}

export default ParameterWidget;
