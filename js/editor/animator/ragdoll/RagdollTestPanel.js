/**
 * RagdollTestPanel.js
 * Phase 9: Ragdoll Testing Tools
 * 
 * Testing panel for triggering and debugging the Active Ragdoll System.
 * Provides impact testing, custom force controls, state monitoring, and config overrides.
 */

import * as THREE from 'three';
import { RagdollConfig } from '../../../animation/physics/RagdollConfig.js';

/**
 * RagdollTestPanel - Ragdoll testing and debugging UI
 */
export class RagdollTestPanel {
    /**
     * @param {Object} uiManager - Reference to UIManager
     * @param {Object} editor - Reference to AnimatorEditorController
     */
    constructor(uiManager, editor) {
        this.uiManager = uiManager;
        this.editor = editor;

        // UI elements
        this.container = null;
        this.stateDisplay = null;
        this.statusBar = null;

        // Custom force state
        this.customForce = { x: 0, y: 0, z: -100 };
        this.impactDirection = 'front'; // front, back, left, right

        // Config overrides (local copy)
        this.configOverrides = null;
        this._loadConfigDefaults();

        // Update interval
        this.updateInterval = null;
    }

    /**
     * Load default config values for override sliders
     * @private
     */
    _loadConfigDefaults() {
        this.configOverrides = {
            stumbleThreshold: RagdollConfig.impact.stumbleThreshold,
            staggerThreshold: RagdollConfig.impact.staggerThreshold,
            fallThreshold: RagdollConfig.impact.fallThreshold,
            knockdownThreshold: RagdollConfig.impact.knockdownThreshold,
            spineStrength: RagdollConfig.motors.spineStrength,
            legStrength: RagdollConfig.motors.legStrength,
            armStrength: RagdollConfig.motors.armStrength,
            headStrength: RagdollConfig.motors.headStrength,
        };
    }

    /**
     * Build the panel UI
     * @returns {HTMLElement}
     */
    build() {
        this.container = document.createElement('div');
        this.container.className = 'ragdoll-test-panel';
        this.container.style.cssText = `
            position: absolute;
            top: 40px;
            right: 0;
            width: 340px;
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
            overflow-y: auto;
        `;

        // Header
        this.container.appendChild(this._buildHeader());

        // Impact Testing Section
        this.container.appendChild(this._buildImpactSection());

        // Custom Force Section
        this.container.appendChild(this._buildCustomForceSection());

        // State Monitor Section
        this.container.appendChild(this._buildStateMonitor());

        // Config Overrides Section
        this.container.appendChild(this._buildConfigOverrides());

        // Debug Toggles Section
        this.container.appendChild(this._buildDebugToggles());

        // Status bar
        this.container.appendChild(this._buildStatusBar());

        return this.container;
    }

    /**
     * Build header section
     * @private
     */
    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'ragdoll-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: #2a2a30;
            border-bottom: 1px solid #444;
        `;

        const title = document.createElement('span');
        title.innerHTML = '🎭 Ragdoll Test';
        title.style.cssText = `font-weight: 600; font-size: 13px;`;
        header.appendChild(title);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close Panel';
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
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        return header;
    }

    /**
     * Build impact testing section
     * @private
     */
    _buildImpactSection() {
        const section = this._createSection('⚡ Impact Testing');

        // Direction selector
        const dirRow = document.createElement('div');
        dirRow.style.cssText = `display: flex; gap: 4px; margin-bottom: 10px;`;

        const directions = [
            { id: 'front', label: '⬆ Front', force: { x: 0, z: -1 } },
            { id: 'back', label: '⬇ Back', force: { x: 0, z: 1 } },
            { id: 'left', label: '⬅ Left', force: { x: -1, z: 0 } },
            { id: 'right', label: '➡ Right', force: { x: 1, z: 0 } },
        ];

        directions.forEach(dir => {
            const btn = document.createElement('button');
            btn.textContent = dir.label;
            btn.style.cssText = `
                flex: 1;
                padding: 6px;
                background: ${this.impactDirection === dir.id ? '#4a9eff' : '#333'};
                border: 1px solid #444;
                color: #eee;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            `;
            btn.onclick = () => {
                this.impactDirection = dir.id;
                // Update button styles
                dirRow.querySelectorAll('button').forEach((b, i) => {
                    b.style.background = directions[i].id === dir.id ? '#4a9eff' : '#333';
                });
            };
            dirRow.appendChild(btn);
        });
        section.content.appendChild(dirRow);

        // Impact buttons grid
        const grid = document.createElement('div');
        grid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`;

        const impacts = [
            { label: '🚶 Stumble', threshold: 'stumbleThreshold', color: '#4CAF50' },
            { label: '🤸 Stagger', threshold: 'staggerThreshold', color: '#FFC107' },
            { label: '🤾 Fall', threshold: 'fallThreshold', color: '#FF9800' },
            { label: '💥 Knockdown', threshold: 'knockdownThreshold', color: '#F44336' },
        ];

        impacts.forEach(impact => {
            const btn = document.createElement('button');
            btn.innerHTML = `${impact.label}<br><small>${this.configOverrides[impact.threshold]}</small>`;
            btn.style.cssText = `
                padding: 12px 8px;
                background: linear-gradient(135deg, ${impact.color}33, ${impact.color}11);
                border: 1px solid ${impact.color}66;
                color: #eee;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.15s;
            `;
            btn.onmouseover = () => {
                btn.style.background = `linear-gradient(135deg, ${impact.color}55, ${impact.color}33)`;
                btn.style.transform = 'scale(1.02)';
            };
            btn.onmouseout = () => {
                btn.style.background = `linear-gradient(135deg, ${impact.color}33, ${impact.color}11)`;
                btn.style.transform = 'scale(1)';
            };
            btn.onclick = () => this._applyPresetImpact(impact.threshold);
            grid.appendChild(btn);
        });

        section.content.appendChild(grid);

        // Force Recovery button
        const recoveryBtn = document.createElement('button');
        recoveryBtn.textContent = '🔄 Force Recovery';
        recoveryBtn.style.cssText = `
            width: 100%;
            margin-top: 10px;
            padding: 8px;
            background: #333;
            border: 1px solid #444;
            color: #eee;
            border-radius: 4px;
            cursor: pointer;
        `;
        recoveryBtn.onclick = () => this._forceRecovery();
        section.content.appendChild(recoveryBtn);

        // Simulation Pause/Resume button
        this.simPauseBtn = document.createElement('button');
        this.simPauseBtn.textContent = '▶️ Resume Simulation';
        this.simPauseBtn.style.cssText = `
            width: 100%;
            margin-top: 8px;
            padding: 10px;
            background: linear-gradient(135deg, #4CAF5033, #4CAF5011);
            border: 1px solid #4CAF5066;
            color: #eee;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        this.simPauseBtn.onclick = () => this._toggleSimulation();
        this._updateSimButton(); // Set initial state
        section.content.appendChild(this.simPauseBtn);

        return section.container;
    }

    /**
     * Build custom force section
     * @private
     */
    _buildCustomForceSection() {
        const section = this._createSection('🎯 Custom Force');

        // X slider
        const xSlider = this._createSliderRow('X', -500, 500, this.customForce.x, (v) => {
            this.customForce.x = v;
        });
        section.content.appendChild(xSlider);

        // Y slider
        const ySlider = this._createSliderRow('Y', -200, 200, this.customForce.y, (v) => {
            this.customForce.y = v;
        });
        section.content.appendChild(ySlider);

        // Z slider
        const zSlider = this._createSliderRow('Z', -500, 500, this.customForce.z, (v) => {
            this.customForce.z = v;
        });
        section.content.appendChild(zSlider);

        // Buttons row
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `display: flex; gap: 8px; margin-top: 10px;`;

        const applyBtn = document.createElement('button');
        applyBtn.textContent = '⚡ Apply Impact';
        applyBtn.style.cssText = `
            flex: 1;
            padding: 10px;
            background: #4a9eff;
            border: none;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        applyBtn.onclick = () => this._applyCustomImpact();
        btnRow.appendChild(applyBtn);

        const continuousBtn = document.createElement('button');
        continuousBtn.textContent = '🌊 Continuous';
        continuousBtn.dataset.active = 'false';
        continuousBtn.style.cssText = `
            flex: 1;
            padding: 10px;
            background: #333;
            border: 1px solid #444;
            color: #eee;
            border-radius: 4px;
            cursor: pointer;
        `;
        continuousBtn.onclick = () => {
            const isActive = continuousBtn.dataset.active === 'true';
            continuousBtn.dataset.active = (!isActive).toString();
            continuousBtn.style.background = isActive ? '#333' : '#FF9800';
            this._toggleContinuousForce(!isActive);
        };
        btnRow.appendChild(continuousBtn);

        section.content.appendChild(btnRow);

        return section.container;
    }

    /**
     * Build state monitor section
     * @private
     */
    _buildStateMonitor() {
        const section = this._createSection('📊 State Monitor');

        this.stateDisplay = document.createElement('div');
        this.stateDisplay.style.cssText = `
            background: #1a1a1e;
            border-radius: 6px;
            padding: 12px;
            font-family: 'Consolas', monospace;
            font-size: 11px;
        `;
        this.stateDisplay.innerHTML = '<em style="color: #888;">Select an entity to monitor</em>';

        section.content.appendChild(this.stateDisplay);

        return section.container;
    }

    /**
     * Build config overrides section
     * @private
     */
    _buildConfigOverrides() {
        const section = this._createSection('⚙️ Config Overrides', true);

        // Threshold sliders
        const thresholds = [
            { key: 'stumbleThreshold', label: 'Stumble', min: 10, max: 200 },
            { key: 'staggerThreshold', label: 'Stagger', min: 50, max: 400 },
            { key: 'fallThreshold', label: 'Fall', min: 100, max: 600 },
            { key: 'knockdownThreshold', label: 'Knockdown', min: 200, max: 1000 },
        ];

        const thresholdLabel = document.createElement('div');
        thresholdLabel.textContent = 'Impact Thresholds';
        thresholdLabel.style.cssText = `color: #888; font-size: 10px; margin-bottom: 6px;`;
        section.content.appendChild(thresholdLabel);

        thresholds.forEach(t => {
            const slider = this._createSliderRow(t.label, t.min, t.max, this.configOverrides[t.key], (v) => {
                this.configOverrides[t.key] = v;
                this._applyConfigOverrides();
            });
            section.content.appendChild(slider);
        });

        // Motor strength sliders
        const motorLabel = document.createElement('div');
        motorLabel.textContent = 'Motor Strengths';
        motorLabel.style.cssText = `color: #888; font-size: 10px; margin: 12px 0 6px 0;`;
        section.content.appendChild(motorLabel);

        const motors = [
            { key: 'spineStrength', label: 'Spine' },
            { key: 'legStrength', label: 'Leg' },
            { key: 'armStrength', label: 'Arm' },
            { key: 'headStrength', label: 'Head' },
        ];

        motors.forEach(m => {
            const slider = this._createSliderRow(m.label, 0, 1, this.configOverrides[m.key], (v) => {
                this.configOverrides[m.key] = v;
                this._applyConfigOverrides();
            }, 0.1);
            section.content.appendChild(slider);
        });

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ Reset to Defaults';
        resetBtn.style.cssText = `
            width: 100%;
            margin-top: 12px;
            padding: 8px;
            background: #333;
            border: 1px solid #444;
            color: #eee;
            border-radius: 4px;
            cursor: pointer;
        `;
        resetBtn.onclick = () => this._resetConfig();
        section.content.appendChild(resetBtn);

        return section.container;
    }

    /**
     * Build debug toggles section
     * @private
     */
    _buildDebugToggles() {
        const section = this._createSection('🔧 Debug', true);

        const toggles = [
            { key: 'showCOM', label: 'Show Center of Mass' },
            { key: 'showSupportBase', label: 'Show Support Base' },
            { key: 'showForces', label: 'Show Impact Forces' },
            { key: 'logStateChanges', label: 'Log State Changes' },
        ];

        toggles.forEach(t => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 0;
            `;

            const label = document.createElement('span');
            label.textContent = t.label;
            row.appendChild(label);

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = RagdollConfig.debug[t.key];
            toggle.style.cssText = `width: 16px; height: 16px; cursor: pointer;`;
            toggle.onchange = () => {
                RagdollConfig.debug[t.key] = toggle.checked;
                this._setStatus(`${t.label}: ${toggle.checked ? 'ON' : 'OFF'}`);
            };
            row.appendChild(toggle);

            section.content.appendChild(row);
        });

        return section.container;
    }

    /**
     * Build status bar
     * @private
     */
    _buildStatusBar() {
        this.statusBar = document.createElement('div');
        this.statusBar.style.cssText = `
            padding: 8px 12px;
            border-top: 1px solid #444;
            font-size: 11px;
            color: #888;
            background: #222;
            flex-shrink: 0;
        `;
        this.statusBar.textContent = 'Ready';
        return this.statusBar;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Create a collapsible section
     * @private
     */
    _createSection(title, collapsed = false) {
        const container = document.createElement('div');
        container.style.cssText = `border-bottom: 1px solid #333;`;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            user-select: none;
            background: #252528;
        `;
        header.innerHTML = `<span>${title}</span><span style="color:#888;">${collapsed ? '▶' : '▼'}</span>`;

        const content = document.createElement('div');
        content.style.cssText = `
            padding: 12px;
            display: ${collapsed ? 'none' : 'block'};
        `;

        header.onclick = () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            header.querySelector('span:last-child').textContent = isHidden ? '▼' : '▶';
        };

        container.appendChild(header);
        container.appendChild(content);

        return { container, content };
    }

    /**
     * Create a slider row
     * @private
     */
    _createSliderRow(label, min, max, value, onChange, step = 1) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            gap: 8px;
        `;

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = `width: 70px; font-size: 11px;`;
        row.appendChild(labelEl);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.style.cssText = `flex: 1; cursor: pointer;`;

        const valueEl = document.createElement('span');
        valueEl.textContent = step < 1 ? value.toFixed(1) : value;
        valueEl.style.cssText = `width: 40px; text-align: right; font-size: 11px; color: #4a9eff;`;

        slider.oninput = () => {
            const v = parseFloat(slider.value);
            valueEl.textContent = step < 1 ? v.toFixed(1) : v;
            onChange(v);
        };

        row.appendChild(slider);
        row.appendChild(valueEl);

        return row;
    }

    // ==================== ACTIONS ====================

    /**
     * Get ragdoll controller from selected entity
     * @private
     */
    _getRagdollController() {
        // Try to get from editor's selected entity
        if (this.editor.selectedEntity) {
            const entity = this.editor.selectedEntity;

            // Check if entity has ragdoll property directly
            if (entity.ragdoll) {
                console.log('[RagdollTestPanel] Using ragdoll from selected entity:', entity.name || 'unnamed');
                return entity.ragdoll;
            }

            // Check if entity.mesh has userData.entity with ragdoll
            if (entity.mesh?.userData?.entity?.ragdoll) {
                console.log('[RagdollTestPanel] Using ragdoll from mesh.userData.entity');
                return entity.mesh.userData.entity.ragdoll;
            }

            // Check if it's a raw mesh and we can get the entity from userData
            if (entity.userData?.entity?.ragdoll) {
                console.log('[RagdollTestPanel] Using ragdoll from userData.entity');
                return entity.userData.entity.ragdoll;
            }

            // No ragdoll found on selected entity
            console.warn('[RagdollTestPanel] Selected entity has no ragdoll controller:', entity.name || 'unnamed');
        } else {
            console.warn('[RagdollTestPanel] No entity selected');
        }

        return null;
    }

    /**
     * Manually tick the ragdoll controller when simulation is paused
     * This ensures visual effects happen even when the game loop isn't running
     * @private
     */
    _tickRagdoll(ragdoll, duration = 0.5) {
        if (!ragdoll) return;

        const isPaused = window.game?.isPaused ?? true;

        if (isPaused) {
            // Manually update for a short period to show the effect
            const dt = 1 / 60; // 60fps timestep
            const steps = Math.floor(duration / dt);

            console.log(`[RagdollTestPanel] Manual ticking ragdoll for ${steps} steps (simulation paused)`);

            for (let i = 0; i < steps; i++) {
                ragdoll.update(dt);
            }
        }
    }

    /**
     * Get force direction vector
     * @private
     */
    _getDirectionVector() {
        const dirs = {
            front: new THREE.Vector3(0, 0, -1),
            back: new THREE.Vector3(0, 0, 1),
            left: new THREE.Vector3(-1, 0, 0),
            right: new THREE.Vector3(1, 0, 0),
        };
        return dirs[this.impactDirection] || dirs.front;
    }

    /**
     * Apply preset impact
     * @private
     */
    _applyPresetImpact(thresholdKey) {
        const ragdoll = this._getRagdollController();
        if (!ragdoll) {
            this._setStatus('⚠️ No ragdoll controller found');
            return;
        }

        const magnitude = this.configOverrides[thresholdKey] + 10; // Slightly above threshold
        const direction = this._getDirectionVector();
        const force = direction.multiplyScalar(magnitude);

        ragdoll.applyImpact(force, null, 'test_panel');
        this._tickRagdoll(ragdoll, 1.0); // Tick for 1 second to show effect
        this._setStatus(`Applied ${thresholdKey.replace('Threshold', '')}: ${magnitude}`);
    }

    /**
     * Apply custom impact
     * @private
     */
    _applyCustomImpact() {
        const ragdoll = this._getRagdollController();
        if (!ragdoll) {
            this._setStatus('⚠️ No ragdoll controller found');
            return;
        }

        const force = new THREE.Vector3(
            this.customForce.x,
            this.customForce.y,
            this.customForce.z
        );

        ragdoll.applyImpact(force, null, 'test_panel_custom');
        this._tickRagdoll(ragdoll, 1.0); // Tick for 1 second to show effect
        this._setStatus(`Applied custom force: (${force.x}, ${force.y}, ${force.z})`);
    }

    /**
     * Toggle continuous force
     * @private
     */
    _toggleContinuousForce(enable) {
        if (this.continuousForceInterval) {
            clearInterval(this.continuousForceInterval);
            this.continuousForceInterval = null;
        }

        if (enable) {
            this.continuousForceInterval = setInterval(() => {
                const ragdoll = this._getRagdollController();
                if (ragdoll) {
                    const force = new THREE.Vector3(
                        this.customForce.x * 0.1,
                        this.customForce.y * 0.1,
                        this.customForce.z * 0.1
                    );
                    ragdoll.applyContinuousForce(force);
                }
            }, 50);
            this._setStatus('Continuous force ON');
        } else {
            this._setStatus('Continuous force OFF');
        }
    }

    /**
     * Force recovery
     * @private
     */
    _forceRecovery() {
        const ragdoll = this._getRagdollController();
        if (!ragdoll) {
            this._setStatus('⚠️ No ragdoll controller found');
            return;
        }

        ragdoll.forceRecovery();
        this._setStatus('Forced recovery');
    }

    /**
     * Toggle game simulation pause/resume
     * @private
     */
    _toggleSimulation() {
        const game = window.game;
        if (!game) {
            this._setStatus('⚠️ Game not found');
            return;
        }

        // Toggle the paused state
        if (game.isPaused !== undefined) {
            game.isPaused = !game.isPaused;
        } else {
            // Create the property if it doesn't exist
            game.isPaused = false;
        }

        this._updateSimButton();
        this._setStatus(game.isPaused ? '⏸️ Simulation paused' : '▶️ Simulation running');
    }

    /**
     * Update simulation button appearance based on pause state
     * @private
     */
    _updateSimButton() {
        if (!this.simPauseBtn) return;

        const game = window.game;
        const isPaused = game?.isPaused ?? true; // Default to paused in editor

        if (isPaused) {
            this.simPauseBtn.textContent = '▶️ Resume Simulation';
            this.simPauseBtn.style.background = 'linear-gradient(135deg, #4CAF5033, #4CAF5011)';
            this.simPauseBtn.style.borderColor = '#4CAF5066';
        } else {
            this.simPauseBtn.textContent = '⏸️ Pause Simulation';
            this.simPauseBtn.style.background = 'linear-gradient(135deg, #FF980033, #FF980011)';
            this.simPauseBtn.style.borderColor = '#FF980066';
        }
    }

    /**
     * Apply config overrides to RagdollConfig
     * @private
     */
    _applyConfigOverrides() {
        RagdollConfig.impact.stumbleThreshold = this.configOverrides.stumbleThreshold;
        RagdollConfig.impact.staggerThreshold = this.configOverrides.staggerThreshold;
        RagdollConfig.impact.fallThreshold = this.configOverrides.fallThreshold;
        RagdollConfig.impact.knockdownThreshold = this.configOverrides.knockdownThreshold;
        RagdollConfig.motors.spineStrength = this.configOverrides.spineStrength;
        RagdollConfig.motors.legStrength = this.configOverrides.legStrength;
        RagdollConfig.motors.armStrength = this.configOverrides.armStrength;
        RagdollConfig.motors.headStrength = this.configOverrides.headStrength;
    }

    /**
     * Reset config to defaults
     * @private
     */
    _resetConfig() {
        // Reset to hardcoded defaults
        RagdollConfig.impact.stumbleThreshold = 50;
        RagdollConfig.impact.staggerThreshold = 150;
        RagdollConfig.impact.fallThreshold = 300;
        RagdollConfig.impact.knockdownThreshold = 600;
        RagdollConfig.motors.spineStrength = 1.0;
        RagdollConfig.motors.legStrength = 0.8;
        RagdollConfig.motors.armStrength = 0.5;
        RagdollConfig.motors.headStrength = 0.7;

        this._loadConfigDefaults();
        this._setStatus('Config reset to defaults');

        // Rebuild panel to update sliders
        const parent = this.container.parentNode;
        const wasVisible = this.isVisible();
        this.dispose();
        this.build();
        if (parent) parent.appendChild(this.container);
        if (wasVisible) this.show();
    }

    /**
     * Update state monitor display
     * @private
     */
    _updateStateDisplay() {
        const ragdoll = this._getRagdollController();

        if (!ragdoll) {
            this.stateDisplay.innerHTML = '<em style="color: #888;">Select an entity with ragdoll</em>';
            return;
        }

        const state = ragdoll.getState();
        const stateColors = {
            normal: '#4CAF50',
            stumbling: '#FFC107',
            staggering: '#FF9800',
            falling: '#F44336',
            ragdoll: '#9C27B0',
            recovering: '#2196F3',
        };

        this.stateDisplay.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span style="color: ${stateColors[state.state] || '#888'}; font-weight: bold; font-size: 14px;">
                    ● ${state.state.toUpperCase()}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: #aaa;">
                <span>Physics Blend:</span>
                <span style="color: #4a9eff;">${(state.physicsBlend * 100).toFixed(0)}%</span>
                <span>Stability:</span>
                <span style="color: ${state.balance?.isStable ? '#4CAF50' : '#F44336'};">
                    ${state.balance?.isStable ? 'Stable' : 'Unstable'}
                </span>
                <span>Balance Angle:</span>
                <span>${state.balance?.balanceAngle?.toFixed(1) || 0}°</span>
            </div>
        `;
    }

    /**
     * Set status message
     * @private
     */
    _setStatus(message) {
        if (this.statusBar) {
            this.statusBar.textContent = message;
        }
    }

    // ==================== VISIBILITY ====================

    /**
     * Show the panel
     */
    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            // Start state update interval
            this.updateInterval = setInterval(() => this._updateStateDisplay(), 100);
            this._updateStateDisplay();
            this._updateSimButton(); // Update simulation button state
        }
    }

    /**
     * Hide the panel
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            // Stop state update interval
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            // Stop continuous force
            if (this.continuousForceInterval) {
                clearInterval(this.continuousForceInterval);
                this.continuousForceInterval = null;
            }
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
        this.hide();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
    }
}

export default RagdollTestPanel;
