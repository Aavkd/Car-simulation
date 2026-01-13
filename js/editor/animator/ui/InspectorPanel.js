/**
 * InspectorPanel.js
 * Phase 1: Editor Foundation
 * 
 * Inspector panel for entity and bone inspection.
 */

export class InspectorPanel {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;
        this.container = null;
        this.contentContainer = null;
        this.selectedEvent = null; // Track selected event for editing
    }

    build() {
        this.container = document.createElement('div');
        this.container.id = 'animator-inspector';
        this.container.className = 'animator-panel';
        this.container.style.cssText = `
            position: absolute; top: 0; left: 0; width: 320px; height: 100%;
            display: flex; flex-direction: column; overflow: hidden;
        `;

        this.container.appendChild(this._buildHeader());

        this.contentContainer = document.createElement('div');
        this.contentContainer.id = 'animator-content';
        this.contentContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 15px;';
        this.container.appendChild(this.contentContainer);

        this._buildEmptyState();
        return this.container;
    }

    _buildHeader() {
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; border-bottom: 1px solid var(--anim-border);';
        header.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:15px;">
                <h2 style="margin:0;font-size:20px;color:var(--anim-primary);font-weight:600;">Deep Animator</h2>
                <span style="font-size:11px;color:var(--anim-text-muted);">v0.2.0</span>
            </div>
            <button id="btn-pose-mode" class="animator-btn" style="width:100%;padding:10px;display:flex;align-items:center;justify-content:center;gap:8px;">
                <span>🦴</span><span id="txt-pose-mode">Enter Pose Mode</span>
            </button>
        `;
        header.querySelector('#btn-pose-mode').onclick = () => this.editor.togglePoseMode();
        return header;
    }

    _buildEmptyState() {
        this.contentContainer.innerHTML = `
            <div style="text-align:center;padding:40px 20px;border:2px dashed var(--anim-border);border-radius:8px;color:var(--anim-text-muted);">
                <div style="font-size:24px;margin-bottom:10px;">🖱️</div>
                <div>Click on a character to inspect.</div>
            </div>
        `;
    }

    buildInspectUI() {
        if (!this.editor.selectedEntity) { this._buildEmptyState(); return; }
        const entity = this.editor.selectedEntity;
        const animator = entity.animator;
        const stateName = animator?.fsm?.currentState?.name || 'None';

        let paramsHTML = this._buildParams(animator);
        let layersHTML = this._buildLayers(animator);
        let clipHTML = animator?.currentAction ? this._buildClipUI(animator) : '<div style="font-size:12px;color:var(--anim-text-muted);font-style:italic;padding:10px;background:var(--anim-surface);border-radius:4px;">No clip playing.</div>';

        this.contentContainer.innerHTML = `
            <div class="animator-section" style="background:rgba(0,0,0,0.3);padding:15px;border-radius:6px;">
                <div style="font-size:10px;text-transform:uppercase;color:var(--anim-text-secondary);margin-bottom:5px;">Entity</div>
                <div style="font-size:18px;font-weight:bold;color:var(--anim-text);">${entity.name || 'Unknown'}</div>
                <div style="font-size:12px;color:var(--anim-success);">● Active</div>
            </div>
            <div class="animator-section">
                <div class="animator-section-title">State Machine</div>
                <div style="background:var(--anim-surface);border:1px solid var(--anim-border);border-radius:4px;padding:10px;">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--anim-text-secondary);">Current State:</span>
                        <span id="anim-state-name" style="color:var(--anim-warning);font-weight:bold;">${stateName}</span>
                    </div>
                </div>
            </div>
            <div class="animator-section">
                <div class="animator-section-title">Parameters</div>
                <div style="background:var(--anim-surface);border:1px solid var(--anim-border);border-radius:4px;padding:10px;">${paramsHTML}</div>
            </div>
            <div class="animator-section">
                <div class="animator-section-title">Layers</div>
                <div style="background:var(--anim-surface);border:1px solid var(--anim-border);border-radius:4px;padding:10px;">${layersHTML}</div>
            </div>
            <div class="animator-section">
                <div class="animator-section-title">Active Clip</div>
                ${clipHTML}
            </div>
        `;
    }

    _buildLayers(animator) {
        if (!animator || !animator.layers || animator.layers.size === 0) {
            return '<div style="color:var(--anim-text-muted);font-style:italic;">No layers defined.</div>';
        }

        let html = '';
        for (const [name, layer] of animator.layers) {
            html += `
                <div style="margin-bottom:12px; border-bottom:1px solid #333; padding-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:12px; font-weight:600; color:#ddd;">${name}</span>
                        <button onclick="window.game.animator.toggleLayerMask('${name}')" title="Visualize Mask" 
                            style="background:none; border:none; cursor:pointer; font-size:14px; opacity:${this.editor.visualizedLayer === name ? '1' : '0.4'}">
                            👁️
                        </button>
                    </div>
                    <div style="font-size:10px; color:#aaa; margin-bottom:4px;">
                        Mask: ${layer.rootBoneName || 'Full Body'}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:10px; color:#aaa; width:40px;">W: ${(layer.weight || 0).toFixed(2)}</span>
                        <input type="range" class="animator-slider" min="0" max="1" step="0.01" value="${layer.weight || 0}" 
                            oninput="window.game.animator.setLayerWeight('${name}', parseFloat(this.value)); this.previousElementSibling.textContent='W: '+parseFloat(this.value).toFixed(2)"
                            style="flex:1; accent-color:var(--anim-accent);">
                    </div>
                </div>
            `;
        }
        return html;
    }

    _buildParams(animator) {
        if (!animator?.fsm) return '<div style="color:var(--anim-text-muted);font-style:italic;">No parameters.</div>';
        const data = animator.fsm.data;
        const keys = Object.keys(data);
        if (keys.length === 0) return '<div style="color:var(--anim-text-muted);font-style:italic;">No parameters.</div>';
        return keys.map(key => {
            const val = data[key];
            if (typeof val === 'boolean') {
                return `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;font-weight:600;">${key}</div><input type="checkbox" id="param-${key}" ${val ? 'checked' : ''} onchange="window.game.animator.setParameter('${key}',this.checked)" style="accent-color:var(--anim-primary);"></div>`;
            } else if (typeof val === 'number') {
                return `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;font-weight:600;">${key}</div><div style="display:flex;align-items:center;gap:10px;"><input type="range" id="param-${key}" min="0" max="10" step="0.1" value="${val}" style="flex:1;accent-color:var(--anim-primary);" oninput="window.game.animator.setParameter('${key}',parseFloat(this.value));document.getElementById('param-val-${key}').textContent=parseFloat(this.value).toFixed(2)"><span id="param-val-${key}" style="color:var(--anim-primary);font-family:monospace;">${val.toFixed(2)}</span></div></div>`;
            }
            return '';
        }).join('');
    }

    _buildClipUI(animator) {
        const clip = animator.currentAction.getClip();
        const time = animator.currentAction.time;
        return `<div style="background:var(--anim-surface);border:1px solid var(--anim-border);border-radius:4px;padding:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="color:var(--anim-text);">${clip.name}</span><span id="clip-time" style="color:var(--anim-text-secondary);font-family:monospace;">${time.toFixed(2)}s</span></div><input type="range" id="clip-scrubber" min="0" max="${clip.duration}" step="0.01" value="${time}" style="width:100%;accent-color:var(--anim-primary);" onmousedown="window.game.animator.isScrubbing=true;window.game.animator.pauseClip()" onmouseup="window.game.animator.isScrubbing=false;window.game.animator.resumeClip()" oninput="window.game.animator.scrubClip(parseFloat(this.value));document.getElementById('clip-time').textContent=parseFloat(this.value).toFixed(2)+'s'"></div>`;
    }

    buildPoseUI() {
        if (!this.editor.selectedEntity) return;
        const kfCount = this.editor.capturedPoses.length;
        const boneName = this.editor.selectedBone?.name || 'None';
        const boneScale = this.editor.boneScaleMultiplier || 1.0;
        const isPrev = this.editor.isPreviewing;

        const kfList = kfCount === 0 ? '<div style="font-size:12px;color:var(--anim-text-muted);text-align:center;padding:10px;">No keyframes</div>' : this.editor.capturedPoses.map((p, i) => `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid var(--anim-border);font-size:12px;"><span style="color:var(--anim-text-secondary);">Frame ${i}</span><span style="color:var(--anim-danger);cursor:pointer;" onclick="window.game.animator.deleteKeyframe(${i})">✖</span></div>`).join('');

        this.contentContainer.innerHTML = `
            <div class="animator-section" style="background:rgba(230,126,34,0.1);border:1px solid var(--anim-accent);border-radius:6px;padding:15px;">
                <div style="font-size:10px;text-transform:uppercase;color:var(--anim-accent);margin-bottom:5px;">Pose Mode</div>
                <div style="font-size:16px;font-weight:bold;color:var(--anim-text);">${this.editor.selectedEntity.name}</div>
            </div>
            
            <div class="animator-section">
                <div class="animator-section-title">Inverse Kinematics</div>
                 <div style="display: flex; flex-direction: column; gap: 5px;">
                     <button onclick="window.game.animator.createIKChain()" class="animator-btn" style="background: #8e44ad; border-color: #8e44ad; color: white;" ${this.editor.selectedBone ? '' : 'disabled'}>
                        Create IK Chain (2-Bone)
                     </button>
                     <button onclick="window.game.animator.toggleFootIK()" class="animator-btn" style="border: 1px solid #444; color: white;">
                        ${this.editor.footIK && this.editor.footIK.enabled ? 'Enabled: Foot IK' : 'Enable Foot IK (Beta)'}
                     </button>
                </div>
            </div>

            <div class="animator-section">
                <div class="animator-section-title">Tools</div>
                <div style="display:flex;gap:5px;margin-bottom:10px;">
                    <button onclick="window.game.animator.transformControls.setMode('translate')" class="animator-btn" style="flex:1;">Move (W)</button>
                    <button onclick="window.game.animator.transformControls.setMode('rotate')" class="animator-btn" style="flex:1;">Rotate (E)</button>
                </div>
                <div style="font-size:12px;color:var(--anim-text-secondary);">Selected Bone: <span style="color:var(--anim-text);">${boneName}</span></div>
                <div style="border-top:1px dashed var(--anim-border);padding-top:10px;margin-top:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;"><span>Bone Gizmo Size</span><span id="bone-scale-val">${boneScale.toFixed(2)}x</span></div>
                    <input type="range" min="0.01" max="5" step="0.01" value="${boneScale}" style="width:100%;accent-color:var(--anim-accent);" oninput="window.game.animator.setBoneScale(parseFloat(this.value));document.getElementById('bone-scale-val').textContent=parseFloat(this.value).toFixed(2)+'x'">
                </div>
            </div>
            <div class="animator-section" style="border-top:1px solid var(--anim-border);padding-top:15px;">
                <div class="animator-section-title">Keyframes: ${kfCount}</div>
                <button onclick="window.game.animator.captureKeyframe()" class="animator-btn success" style="width:100%;padding:12px;margin-bottom:10px;font-weight:bold;">📷 Capture Keyframe (S)</button>
                <div style="max-height:150px;overflow-y:auto;background:var(--anim-surface);margin-bottom:10px;border:1px solid var(--anim-border);border-radius:4px;">${kfList}</div>
                <div style="display:flex;gap:10px;">
                    <button onclick="window.game.animator.playPreview()" class="animator-btn ${isPrev ? 'danger' : 'primary'}" style="flex:1;font-weight:bold;">${isPrev ? '⏹ Stop' : '▶ Preview'}</button>
                    <button onclick="window.game.animator.exportAnimation()" class="animator-btn" style="flex:1;font-weight:bold;background:var(--anim-secondary);border-color:var(--anim-secondary);color:white;">💾 Export</button>
                </div>
            </div>
        `;
    }

    updatePoseModeButton(isPoseMode) {
        const btn = document.getElementById('btn-pose-mode');
        const txt = document.getElementById('txt-pose-mode');
        if (btn) { btn.style.background = isPoseMode ? 'var(--anim-accent)' : ''; btn.style.borderColor = isPoseMode ? 'var(--anim-accent)' : ''; }
        if (txt) txt.textContent = isPoseMode ? 'Exit Pose Mode' : 'Enter Pose Mode';
    }

    refresh() {
        if (this.selectedEvent) {
            this.buildEventUI();
            return;
        }

        if (this.editor.isPoseMode && this.editor.selectedEntity) this.buildPoseUI();
        else if (this.editor.selectedEntity) this.buildInspectUI();
        else this._buildEmptyState();
    }

    /**
     * Set the event to inspect
     * @param {AnimationEvent|null} event 
     */
    inspectEvent(event) {
        this.selectedEvent = event;
        this.refresh();
    }

    buildEventUI() {
        if (!this.selectedEvent) return;
        const e = this.selectedEvent;

        this.contentContainer.innerHTML = `
            <div class="animator-section" style="background:#f1c40f22; border:1px solid #f1c40f; border-radius:6px; padding:15px;">
                <div style="font-size:10px;text-transform:uppercase;color:#f1c40f;margin-bottom:5px;">Animation Event</div>
                <div style="font-size:16px;font-weight:bold;color:var(--anim-text);">Event Selection</div>
            </div>
            
            <div class="animator-section">
                <div class="animator-section-title">Properties</div>
                
                <!-- Time -->
                <div style="margin-bottom:10px;">
                    <div style="font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;">Time (s)</div>
                    <input type="number" step="0.01" value="${e.time.toFixed(3)}" 
                        onchange="if(window.game.animator.eventManager){ const ev = window.game.animator.eventManager.getEventById('${e.id}'); if(ev) { ev.time = parseFloat(this.value); window.game.animator.eventManager.sortEvents(); window.game.animator.refreshTimeline(); } }"
                        style="width:100%; padding:6px; background:#222; border:1px solid #444; color:#eee; border-radius:4px;">
                </div>

                <!-- Function Name -->
                <div style="margin-bottom:10px;">
                    <div style="font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;">Function Name</div>
                    <input type="text" value="${e.functionName}" 
                        onchange="if(window.game.animator.eventManager){ const ev = window.game.animator.eventManager.getEventById('${e.id}'); if(ev) { ev.functionName = this.value; } }"
                        style="width:100%; padding:6px; background:#222; border:1px solid #444; color:#eee; border-radius:4px;">
                </div>

                <!-- Parameters (JSON for now) -->
                <div style="margin-bottom:10px;">
                    <div style="font-size:11px;color:var(--anim-text-secondary);margin-bottom:4px;">Parameters (JSON)</div>
                    <textarea 
                        onchange="if(window.game.animator.eventManager){ const ev = window.game.animator.eventManager.getEventById('${e.id}'); if(ev) { try { ev.parameters = JSON.parse(this.value); } catch(err){ console.error('Invalid JSON'); } } }"
                        style="width:100%; height:80px; padding:6px; background:#222; border:1px solid #444; color:#eee; border-radius:4px; font-family:monospace;">${JSON.stringify(e.parameters, null, 2)}</textarea>
                </div>
            </div>

            <div class="animator-section">
                <button onclick="if(window.game.animator.eventManager){ const ev = window.game.animator.eventManager.getEventById('${e.id}'); if(ev){ window.game.animator.eventManager.removeEvent(ev); window.game.animator.deselectEvent(); } }" 
                    class="animator-btn danger" style="width:100%; font-weight:bold;">🗑️ Delete Event</button>
            </div>
            
            <div class="animator-section" style="margin-top:20px;">
                <button onclick="window.game.animator.deselectEvent()" 
                    class="animator-btn" style="width:100%;">← Back to Character</button>
            </div>
        `;
    }
}

export default InspectorPanel;
