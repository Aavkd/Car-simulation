/**
 * TransitionInspector.js
 * Phase 2: Visual State Machine Graph Editor
 * 
 * Panel for editing transition properties when a transition is selected.
 */

export class TransitionInspector {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;

        this.container = null;
        this.selectedTransition = null;
        this.conditionsContainer = null;
    }

    build() {
        this.container = document.createElement('div');
        this.container.id = 'transition-inspector';
        this.container.className = 'animator-panel';
        this.container.style.cssText = `
            position: absolute;
            top: 50px;
            right: 0;
            width: 280px;
            max-height: calc(100% - 300px);
            display: none;
            flex-direction: column;
            background: var(--anim-bg);
            border-left: 1px solid var(--anim-border);
            z-index: 110;
        `;

        // Header
        const header = this.uiManager.createPanelHeader('Transition Inspector', {
            closeable: true,
            onClose: () => this.hide()
        });
        this.container.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'animator-panel-content';
        content.style.cssText = 'flex: 1; overflow-y: auto; padding: 12px;';
        this.container.appendChild(content);

        // Source/Target display
        this.sourceTargetDisplay = document.createElement('div');
        this.sourceTargetDisplay.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 12px;
            background: var(--anim-surface);
            border-radius: 6px;
            margin-bottom: 15px;
        `;
        content.appendChild(this.sourceTargetDisplay);

        // Settings Section
        const settingsSection = this._createSection('Settings');
        content.appendChild(settingsSection);

        // Has Exit Time
        const exitTimeRow = this._createCheckboxRow('Has Exit Time', 'hasExitTime', false,
            'Wait for animation to reach exit time before transitioning');
        settingsSection.appendChild(exitTimeRow);

        // Exit Time Value
        const exitTimeValue = this._createSliderRow('Exit Time', 'exitTime', 0.9, 0, 1, 0.01,
            'Normalized time at which transition can occur');
        settingsSection.appendChild(exitTimeValue);
        this.exitTimeRow = exitTimeValue;

        // Transition Duration
        const durationRow = this._createSliderRow('Duration', 'duration', 0.2, 0, 2, 0.05,
            'Blend duration in seconds');
        settingsSection.appendChild(durationRow);

        // Transition Offset
        const offsetRow = this._createSliderRow('Offset', 'offset', 0, 0, 1, 0.01,
            'Normalized start time of destination animation');
        settingsSection.appendChild(offsetRow);

        // Interruption Source
        const interruptRow = this._createSelectRow('Interruption', 'interruptionSource', [
            { value: 'none', label: 'None' },
            { value: 'current', label: 'Current State' },
            { value: 'next', label: 'Next State' },
            { value: 'both', label: 'Current or Next' }
        ]);
        settingsSection.appendChild(interruptRow);

        // Conditions Section
        const conditionsSection = this._createSection('Conditions');
        content.appendChild(conditionsSection);

        // Add condition button
        const addCondBtn = document.createElement('button');
        addCondBtn.className = 'animator-btn';
        addCondBtn.style.cssText = 'width: 100%; margin-bottom: 10px;';
        addCondBtn.innerHTML = '+ Add Condition';
        addCondBtn.onclick = () => this._addCondition();
        conditionsSection.appendChild(addCondBtn);

        // Conditions list
        this.conditionsContainer = document.createElement('div');
        this.conditionsContainer.id = 'conditions-list';
        conditionsSection.appendChild(this.conditionsContainer);

        return this.container;
    }

    _createSection(title) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 15px;';

        const header = document.createElement('div');
        header.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--anim-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;';
        header.textContent = title;
        section.appendChild(header);

        return section;
    }

    _createCheckboxRow(label, id, defaultValue, tooltip = '') {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
        row.title = tooltip;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `trans-${id}`;
        checkbox.checked = defaultValue;
        checkbox.style.accentColor = 'var(--anim-primary)';
        checkbox.onchange = () => this._onSettingChanged(id, checkbox.checked);

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `trans-${id}`;
        labelEl.style.cssText = 'font-size: 12px; color: var(--anim-text); cursor: pointer;';
        labelEl.textContent = label;

        row.appendChild(checkbox);
        row.appendChild(labelEl);

        return row;
    }

    _createSliderRow(label, id, defaultValue, min, max, step, tooltip = '') {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 10px;';
        row.title = tooltip;

        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 4px;';

        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'font-size: 12px; color: var(--anim-text);';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.id = `trans-${id}-value`;
        valueEl.style.cssText = 'font-size: 11px; color: var(--anim-primary); font-family: monospace;';
        valueEl.textContent = defaultValue.toFixed(2);

        labelRow.appendChild(labelEl);
        labelRow.appendChild(valueEl);
        row.appendChild(labelRow);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = `trans-${id}`;
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultValue;
        slider.style.cssText = 'width: 100%; accent-color: var(--anim-primary);';
        slider.oninput = () => {
            valueEl.textContent = parseFloat(slider.value).toFixed(2);
            this._onSettingChanged(id, parseFloat(slider.value));
        };

        row.appendChild(slider);
        return row;
    }

    _createSelectRow(label, id, options) {
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 10px;';

        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size: 12px; color: var(--anim-text); margin-bottom: 4px;';
        labelEl.textContent = label;
        row.appendChild(labelEl);

        const select = document.createElement('select');
        select.id = `trans-${id}`;
        select.className = 'animator-input';
        select.style.cssText = 'width: 100%; padding: 6px; background: var(--anim-surface); color: var(--anim-text); border: 1px solid var(--anim-border); border-radius: 4px;';

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        select.onchange = () => this._onSettingChanged(id, select.value);
        row.appendChild(select);

        return row;
    }

    _addCondition() {
        if (!this.selectedTransition) return;

        const condition = {
            parameter: 'speed',
            operator: '>',
            value: 0.1
        };

        if (!this.selectedTransition.conditions) {
            this.selectedTransition.conditions = [];
        }
        this.selectedTransition.conditions.push(condition);

        this._renderConditions();
    }

    _renderConditions() {
        if (!this.conditionsContainer) return;
        this.conditionsContainer.innerHTML = '';

        if (!this.selectedTransition?.conditions?.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color: var(--anim-text-muted); font-size: 11px; text-align: center; padding: 10px;';
            empty.textContent = 'No conditions (always transitions)';
            this.conditionsContainer.appendChild(empty);
            return;
        }

        this.selectedTransition.conditions.forEach((cond, index) => {
            const row = this._createConditionRow(cond, index);
            this.conditionsContainer.appendChild(row);
        });
    }

    _createConditionRow(condition, index) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
            padding: 8px;
            background: var(--anim-surface);
            border-radius: 4px;
            margin-bottom: 6px;
        `;

        // Parameter input
        const paramInput = document.createElement('input');
        paramInput.type = 'text';
        paramInput.value = condition.parameter;
        paramInput.className = 'animator-input';
        paramInput.style.cssText = 'flex: 1; padding: 4px 6px; font-size: 11px;';
        paramInput.placeholder = 'param';
        paramInput.onchange = () => {
            condition.parameter = paramInput.value;
            this._updateTransitionLabel();
        };

        // Operator select
        const opSelect = document.createElement('select');
        opSelect.className = 'animator-input';
        opSelect.style.cssText = 'width: 50px; padding: 4px; font-size: 11px;';
        ['>', '<', '>=', '<=', '==', '!='].forEach(op => {
            const opt = document.createElement('option');
            opt.value = op;
            opt.textContent = op;
            if (op === condition.operator) opt.selected = true;
            opSelect.appendChild(opt);
        });
        opSelect.onchange = () => {
            condition.operator = opSelect.value;
            this._updateTransitionLabel();
        };

        // Value input
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.value = condition.value;
        valueInput.className = 'animator-input';
        valueInput.style.cssText = 'width: 50px; padding: 4px 6px; font-size: 11px;';
        valueInput.onchange = () => {
            // Try to parse as number, otherwise keep as string
            const numVal = parseFloat(valueInput.value);
            condition.value = isNaN(numVal) ? valueInput.value : numVal;
            this._updateTransitionLabel();
        };

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'animator-tool-btn';
        deleteBtn.style.cssText = 'width: 24px; height: 24px; padding: 0; font-size: 14px;';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Remove Condition';
        deleteBtn.onclick = () => {
            this.selectedTransition.conditions.splice(index, 1);
            this._renderConditions();
            this._updateTransitionLabel();
        };

        row.appendChild(paramInput);
        row.appendChild(opSelect);
        row.appendChild(valueInput);
        row.appendChild(deleteBtn);

        return row;
    }

    _updateTransitionLabel() {
        if (!this.selectedTransition) return;

        // Build condition string from all conditions
        if (this.selectedTransition.conditions?.length) {
            const condStrings = this.selectedTransition.conditions.map(c =>
                `${c.parameter} ${c.operator} ${c.value}`
            );
            this.selectedTransition.condition = condStrings.join(' && ');
        } else {
            this.selectedTransition.condition = '';
        }
    }

    _onSettingChanged(id, value) {
        if (!this.selectedTransition) return;

        // Store settings on the transition
        if (!this.selectedTransition.settings) {
            this.selectedTransition.settings = {};
        }
        this.selectedTransition.settings[id] = value;

        // Special handling for hasExitTime to show/hide exit time slider
        if (id === 'hasExitTime' && this.exitTimeRow) {
            this.exitTimeRow.style.display = value ? 'block' : 'none';
        }

        console.log(`[TransitionInspector] Setting changed: ${id} = ${value}`);
    }

    show(transition) {
        if (!this.container) return;

        this.selectedTransition = transition;
        this.container.style.display = 'flex';

        // Update source/target display
        if (this.sourceTargetDisplay && transition) {
            const sourceName = transition.source?.name || 'Unknown';
            const targetName = transition.target?.name || 'Unknown';
            this.sourceTargetDisplay.innerHTML = `
                <span style="padding: 6px 12px; background: ${this._getStateColor(transition.source)}; border-radius: 4px; font-size: 12px; font-weight: 600;">${sourceName}</span>
                <span style="font-size: 18px; color: var(--anim-text-muted);">→</span>
                <span style="padding: 6px 12px; background: ${this._getStateColor(transition.target)}; border-radius: 4px; font-size: 12px; font-weight: 600;">${targetName}</span>
            `;
        }

        // Load existing settings
        this._loadSettings(transition);

        // Render conditions
        this._renderConditions();
    }

    _getStateColor(node) {
        if (!node) return 'var(--anim-surface)';
        const colors = {
            entry: 'rgba(39, 174, 96, 0.3)',
            normal: 'rgba(127, 140, 141, 0.3)',
            any: 'rgba(241, 196, 15, 0.3)',
            exit: 'rgba(231, 76, 60, 0.3)'
        };
        return colors[node.type] || colors.normal;
    }

    _loadSettings(transition) {
        if (!transition) return;

        const settings = transition.settings || {};

        // Has Exit Time
        const hasExitTime = document.getElementById('trans-hasExitTime');
        if (hasExitTime) {
            hasExitTime.checked = settings.hasExitTime ?? false;
        }

        // Exit Time
        const exitTime = document.getElementById('trans-exitTime');
        const exitTimeValue = document.getElementById('trans-exitTime-value');
        if (exitTime) {
            exitTime.value = settings.exitTime ?? 0.9;
            if (exitTimeValue) exitTimeValue.textContent = (settings.exitTime ?? 0.9).toFixed(2);
        }

        // Show/hide exit time row
        if (this.exitTimeRow) {
            this.exitTimeRow.style.display = (settings.hasExitTime ?? false) ? 'block' : 'none';
        }

        // Duration
        const duration = document.getElementById('trans-duration');
        const durationValue = document.getElementById('trans-duration-value');
        if (duration) {
            duration.value = settings.duration ?? 0.2;
            if (durationValue) durationValue.textContent = (settings.duration ?? 0.2).toFixed(2);
        }

        // Offset
        const offset = document.getElementById('trans-offset');
        const offsetValue = document.getElementById('trans-offset-value');
        if (offset) {
            offset.value = settings.offset ?? 0;
            if (offsetValue) offsetValue.textContent = (settings.offset ?? 0).toFixed(2);
        }

        // Interruption Source
        const interruption = document.getElementById('trans-interruptionSource');
        if (interruption) {
            interruption.value = settings.interruptionSource ?? 'none';
        }

        // Parse condition into conditions array if not already
        if (transition.condition && !transition.conditions) {
            transition.conditions = this._parseCondition(transition.condition);
        }
    }

    _parseCondition(conditionString) {
        // Simple parser for condition strings like "speed > 0.1"
        if (!conditionString) return [];

        const conditions = [];
        const parts = conditionString.split('&&').map(s => s.trim());

        parts.forEach(part => {
            // Match patterns like "param > value" or "!param"
            const match = part.match(/^(!?)(\w+)\s*(>|<|>=|<=|==|!=)?\s*(.*)$/);
            if (match) {
                const [, not, param, operator, value] = match;
                if (not) {
                    conditions.push({ parameter: param, operator: '==', value: false });
                } else if (operator) {
                    let parsedValue = value;
                    if (value === 'true') parsedValue = true;
                    else if (value === 'false') parsedValue = false;
                    else if (!isNaN(parseFloat(value))) parsedValue = parseFloat(value);

                    conditions.push({ parameter: param, operator, value: parsedValue });
                }
            }
        });

        return conditions;
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
        this.selectedTransition = null;
    }

    dispose() {
        if (this.container) {
            this.container.remove();
        }
    }
}

export default TransitionInspector;
