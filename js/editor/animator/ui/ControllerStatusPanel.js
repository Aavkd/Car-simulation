/**
 * ControllerStatusPanel.js
 * 
 * Displays real-time status of the entity's controller (Animator vs Active Ragdoll).
 * Helps debug state transitions and physics blending.
 */

export class ControllerStatusPanel {
    constructor() {
        this.container = null;
        this.entity = null;
        this.updateInterval = null;
    }

    /**
     * Build the panel UI
     * @param {Object} entity - The selected entity
     * @returns {HTMLElement}
     */
    build(entity) {
        this.entity = entity;

        this.container = document.createElement('div');
        this.container.className = 'animator-section';
        this.container.style.cssText = `
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--anim-border);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 10px;
        `;

        this.container.innerHTML = `
            <div class="animator-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🎮 Controller Status</span>
                <span id="ctrl-active-type" style="font-size:10px; padding:2px 6px; border-radius:4px; background:#444; color:#aaa;">UNKNOWN</span>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
                <!-- State -->
                <div style="background:var(--anim-surface); padding:8px; border-radius:4px;">
                    <div style="font-size:10px; color:var(--anim-text-secondary); margin-bottom:2px;">Ragdoll State</div>
                    <div id="ctrl-state" style="font-size:12px; font-weight:600; color:var(--anim-text);">Inactive</div>
                </div>

                <!-- Physics Blend -->
                <div style="background:var(--anim-surface); padding:8px; border-radius:4px;">
                    <div style="font-size:10px; color:var(--anim-text-secondary); margin-bottom:2px;">Physics Weight</div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <div style="flex:1; height:4px; background:#333; border-radius:2px; overflow:hidden;">
                            <div id="ctrl-blend-bar" style="width:0%; height:100%; background:var(--anim-accent); transition:width 0.1s;"></div>
                        </div>
                        <span id="ctrl-blend-val" style="font-size:11px; font-family:monospace; color:var(--anim-accent);">0%</span>
                    </div>
                </div>
            </div>

            <!-- Detailed Stats (Collapsible?) -->
            <div style="margin-top:8px; font-size:10px; color:var(--anim-text-secondary); display:flex; gap:10px;">
                <span>Control: <strong id="ctrl-control-val" style="color:#eee;">YES</strong></span>
                <span>Grounded: <strong id="ctrl-grounded-val" style="color:#eee;">YES</strong></span>
            </div>
        `;

        // Start auto-update polling
        this._startUpdateLoop();

        return this.container;
    }

    /**
     * Start the UI update loop
     * @private
     */
    _startUpdateLoop() {
        if (this.updateInterval) clearInterval(this.updateInterval);

        this.updateInterval = setInterval(() => {
            this._updateUI();
        }, 100); // 10Hz update
    }

    /**
     * Stop the UI update loop (call when panel is destroyed/hidden)
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Update UI with current entity state
     * @private
     */
    _updateUI() {
        if (!this.entity || !this.container) return;

        // Try to find ragdoll controller
        let ragdoll = this.entity.ragdoll;
        // Also check if entity is wrapper
        if (!ragdoll && this.entity.mesh && this.entity.mesh.userData.entity) {
            ragdoll = this.entity.mesh.userData.entity.ragdoll;
        }

        const typeEl = this.container.querySelector('#ctrl-active-type');
        const stateEl = this.container.querySelector('#ctrl-state');
        const blendBar = this.container.querySelector('#ctrl-blend-bar');
        const blendVal = this.container.querySelector('#ctrl-blend-val');
        const controlVal = this.container.querySelector('#ctrl-control-val');
        const groundedVal = this.container.querySelector('#ctrl-grounded-val'); // Not easily available unless passed

        if (ragdoll) {
            const state = ragdoll.state.currentState;
            const weight = ragdoll.state.currentPhysicsWeight;
            const hasControl = ragdoll.hasControl();

            // Update Type Tag
            // If weight > 0, Physics is influencing. If weight == 1, Full Physics.
            if (weight <= 0.01) {
                typeEl.textContent = 'ANIMATOR';
                typeEl.style.background = '#2ecc7133';
                typeEl.style.color = '#2ecc71';
            } else if (weight >= 0.99) {
                typeEl.textContent = 'RAGDOLL';
                typeEl.style.background = '#e74c3c33';
                typeEl.style.color = '#e74c3c';
            } else {
                typeEl.textContent = 'BLENDING';
                typeEl.style.background = '#f39c1233';
                typeEl.style.color = '#f39c12';
            }

            // Update State Text
            if (state && typeof state === 'string') {
                stateEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);

                // Color code state
                if (['falling', 'ragdoll'].includes(state)) stateEl.style.color = '#e74c3c'; // Red
                else if (['stumble', 'stagger'].includes(state)) stateEl.style.color = '#f39c12'; // Orange
                else if (['recovering'].includes(state)) stateEl.style.color = '#3498db'; // Blue
                else stateEl.style.color = '#eee'; // White (normal/braced)
            } else {
                stateEl.textContent = 'Inactive';
                stateEl.style.color = '#888';
            }

            // Update Blend Bar
            const pct = Math.round(weight * 100);
            blendBar.style.width = `${pct}%`;
            blendVal.textContent = `${pct}%`;

            // Update Control Status
            controlVal.textContent = hasControl ? 'YES' : 'NO';
            controlVal.style.color = hasControl ? '#2ecc71' : '#e74c3c';

        } else {
            // No ragdoll found
            if (typeEl) {
                typeEl.textContent = 'ANIMATOR ONLY';
                typeEl.style.background = '#34495e';
                typeEl.style.color = '#bdc3c7';
            }
            if (stateEl) stateEl.textContent = 'N/A';
            if (blendBar) blendBar.style.width = '0%';
            if (blendVal) blendVal.textContent = '-';
        }
    }
}
