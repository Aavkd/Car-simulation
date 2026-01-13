/**
 * CurveEditor.js
 * Phase 3.3: Curve Editor
 * 
 * Visualizes and edits animation curves (Bezier) for bone properties.
 * Integrated with TimelinePanel.
 */

import * as THREE from 'three';
import { InterpolationType } from './KeyframeData.js';

export class CurveEditor {
    constructor(timelinePanel) {
        this.timeline = timelinePanel;

        // Selection state
        this.selectedBoneName = null;
        this.selectedProperty = 'rotation.x'; // 'rotation.x', 'rotation.y', 'rotation.z', 'rotation.w'

        // Interaction state
        this.selectedKeyIndex = -1;
        this.dragMode = null; // 'keyframe', 'handleIn', 'handleOut'
        this.dragStartIndex = -1;
        this.dragStartPos = new THREE.Vector2();
        this.dragStartValue = 0;
        this.dragStartTime = 0;

        // Visual settings
        this.valueScale = 50; // Pixels per unit value
        this.valueOffset = 0; // Vertical scroll offset (value space center)

        // Colors
        this.colors = {
            'rotation.x': '#ff6b6b',
            'rotation.y': '#4ecdc4',
            'rotation.z': '#45b7d1',
            'rotation.w': '#f7b731',
            grid: '#333',
            zeroLine: '#666',
            handle: '#fff',
            handleLine: '#888'
        };

        this.overlay = null;

        console.log('[CurveEditor] Initialized');
    }

    /**
     * Set the property to edit
     * @param {string} boneName 
     * @param {string} property 
     */
    setTarget(boneName, property) {
        this.selectedBoneName = boneName;
        this.selectedProperty = property;
        this.autoFit();
        this._updateOverlay();
    }

    /**
     * Auto-fit vertical scale to show all keys
     */
    autoFit() {
        if (!this.timeline.timelineData) return;

        let minCheck = Infinity;
        let maxCheck = -Infinity;
        let hasData = false;

        const keyframes = this.timeline.timelineData.keyframes;
        for (const kf of keyframes) {
            const bone = kf.getBone(this.selectedBoneName);
            if (bone) {
                const val = this._getValue(bone, this.selectedProperty);
                if (val < minCheck) minCheck = val;
                if (val > maxCheck) maxCheck = val;
                hasData = true;
            }
        }

        if (hasData) {
            const range = maxCheck - minCheck;
            const mid = (maxCheck + minCheck) / 2;
            const height = this.timeline.canvasHeight || 200;

            // Add some padding
            this.valueOffset = mid;
            this.valueScale = (height * 0.6) / (range > 0.1 ? range : 1.0); // Minimum range to prevent div by zero
        } else {
            this.valueOffset = 0;
            this.valueScale = 50;
        }
    }

    /**
     * Render the curves to the canvas
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} width 
     * @param {number} height 
     */
    render(ctx, width, height) {
        if (!this.selectedBoneName) {
            ctx.fillStyle = '#666';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select a bone property to view curves', width / 2, height / 2);
            return;
        }

        this._drawGrid(ctx, width, height);
        this._drawCurves(ctx, width, height);
        this._drawHandles(ctx, width, height);
    }

    _drawGrid(ctx, width, height) {
        const centerY = height / 2;

        // Zero line
        const zeroY = centerY + (this.valueOffset * this.valueScale);
        ctx.strokeStyle = this.colors.zeroLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(width, zeroY);
        ctx.stroke();

        ctx.lineWidth = 1;
        ctx.strokeStyle = this.colors.grid;

        // Horizontal lines (value steps)
        // Todo: adaptive steps
        const step = 0.5; // Every 0.5 units
        const stepsPositive = Math.ceil((height / 2) / (step * this.valueScale));

        for (let i = -stepsPositive; i <= stepsPositive; i++) {
            if (i === 0) continue;
            const val = -this.valueOffset + (i * step); // ?
            // Map value to Y
            const y = this._mapValueToY(i * step, height);

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText((i * step).toFixed(1), 5, y - 2);
        }
    }

    _drawCurves(ctx, width, height) {
        const keyframes = this.timeline.timelineData.keyframes;
        if (keyframes.length < 2) return;

        const propColor = this.colors[this.selectedProperty] || '#fff';
        ctx.strokeStyle = propColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;

        for (let i = 0; i < keyframes.length - 1; i++) {
            const kf1 = keyframes[i];
            const kf2 = keyframes[i + 1];

            const bone1 = kf1.getBone(this.selectedBoneName);
            const bone2 = kf2.getBone(this.selectedBoneName);

            if (!bone1 || !bone2) continue;

            const t1 = kf1.time;
            const t2 = kf2.time;
            const v1 = this._getValue(bone1, this.selectedProperty);
            const v2 = this._getValue(bone2, this.selectedProperty);

            const x1 = this._mapTimeToX(t1);
            const y1 = this._mapValueToY(v1, height);
            const x2 = this._mapTimeToX(t2);
            const y2 = this._mapValueToY(v2, height);

            if (!started) {
                ctx.moveTo(x1, y1);
                started = true;
            }

            // Interpolation Type Logic
            const type = (bone1.tangentOut) ? bone1.tangentOut.type : InterpolationType.SMOOTH;

            if (type === InterpolationType.STEPPED) {
                ctx.lineTo(x2, y1);
                ctx.lineTo(x2, y2);
            } else if (type === InterpolationType.LINEAR) {
                ctx.lineTo(x2, y2);
            } else {
                // Bezier
                const dt = (x2 - x1) / 3;
                const cp1x = x1 + dt;
                const cp1y = y1;
                const cp2x = x2 - dt;
                const cp2y = y2;

                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
            }
        }
        ctx.stroke();
    }

    _drawHandles(ctx, width, height) {
        const keyframes = this.timeline.timelineData.keyframes;

        for (let i = 0; i < keyframes.length; i++) {
            const kf = keyframes[i];
            const bone = kf.getBone(this.selectedBoneName);
            if (!bone) continue;

            const x = this._mapTimeToX(kf.time);
            const y = this._mapValueToY(this._getValue(bone, this.selectedProperty), height);

            // Draw keyframe point
            ctx.fillStyle = (i === this.selectedKeyIndex) ? '#fff' : this.colors[this.selectedProperty];
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.stroke(); // Outline

            // Handles (only if selected)
            if (i === this.selectedKeyIndex) {
                // In Handle
                if (i > 0 && bone.tangentIn && (bone.tangentIn.type === InterpolationType.BEZIER || bone.tangentIn.type === InterpolationType.SMOOTH)) {
                    const tx = bone.tangentIn.x || -1;
                    const ty = bone.tangentIn.y || 0;

                    const hx = this._mapTimeToX(kf.time + (tx * 0.33));
                    const hy = this._mapValueToY(this._getValue(bone, this.selectedProperty) + ty, height);

                    ctx.strokeStyle = this.colors.handleLine;
                    ctx.beginPath();
                    ctx.moveTo(hx, hy);
                    ctx.lineTo(x, y);
                    ctx.stroke();

                    ctx.fillStyle = this.colors.handle;
                    ctx.beginPath();
                    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Out Handle
                if (i < keyframes.length - 1 && bone.tangentOut && (bone.tangentOut.type === InterpolationType.BEZIER || bone.tangentOut.type === InterpolationType.SMOOTH)) {
                    const tx = bone.tangentOut.x || 1;
                    const ty = bone.tangentOut.y || 0;

                    const hx = this._mapTimeToX(kf.time + (tx * 0.33));
                    const hy = this._mapValueToY(this._getValue(bone, this.selectedProperty) + ty, height);

                    ctx.strokeStyle = this.colors.handleLine;
                    ctx.beginPath();
                    ctx.moveTo(hx, hy);
                    ctx.lineTo(x, y);
                    ctx.stroke();

                    ctx.fillStyle = this.colors.handle;
                    ctx.beginPath();
                    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    _mapTimeToX(time) {
        return (time * this.timeline.zoom) - this.timeline.viewOffset;
    }

    _mapValueToY(val, height) {
        const centerY = height / 2;
        // Y grows down, Value grows up -> invert
        return centerY - ((val - this.valueOffset) * this.valueScale);
    }

    _mapYToValue(y, height) {
        const centerY = height / 2;
        return this.valueOffset - ((y - centerY) / this.valueScale);
    }

    _getValue(boneData, property) {
        if (property === 'rotation.x') return boneData.rot.x;
        if (property === 'rotation.y') return boneData.rot.y;
        if (property === 'rotation.z') return boneData.rot.z;
        if (property === 'rotation.w') return boneData.rot.w;
        return 0;
    }

    // --- Interaction ---

    onMouseDown(e, x, y) {
        const keyframes = this.timeline.timelineData.keyframes;
        const width = this.timeline.canvasWidth;
        const height = this.timeline.canvasHeight;

        let hitFound = false;

        // Hit test keyframes
        for (let i = 0; i < keyframes.length; i++) {
            const kf = keyframes[i];
            const bone = kf.getBone(this.selectedBoneName);
            if (!bone) continue;

            const kx = this._mapTimeToX(kf.time);
            const ky = this._mapValueToY(this._getValue(bone, this.selectedProperty), height);

            if (Math.abs(x - kx) < 8 && Math.abs(y - ky) < 8) {
                this.selectedKeyIndex = i;
                this.dragMode = 'keyframe';
                this.dragStartIndex = i;
                this.dragStartPos.set(x, y);
                this.dragStartTime = kf.time;
                this.dragStartValue = this._getValue(bone, this.selectedProperty);
                hitFound = true;
                this._updateOverlay();
                break;
            }
        }

        // Hit test handles (if keyframe selected)
        if (this.selectedKeyIndex !== -1 && !hitFound && this.selectedKeyIndex < keyframes.length) {
            const kf = keyframes[this.selectedKeyIndex];
            const bone = kf.getBone(this.selectedBoneName);
            if (bone) {
                const kx = this._mapTimeToX(kf.time);
                const ky = this._mapValueToY(this._getValue(bone, this.selectedProperty), height);

                // In Handle
                if (this.selectedKeyIndex > 0 && bone.tangentIn) {
                    const tx = bone.tangentIn.x || -1;
                    const ty = bone.tangentIn.y || 0;
                    const hx = this._mapTimeToX(kf.time + (tx * 0.33));
                    const hy = this._mapValueToY(this._getValue(bone, this.selectedProperty) + ty, height);

                    if (Math.abs(x - hx) < 8 && Math.abs(y - hy) < 8) {
                        this.dragMode = 'handleIn';
                        this.dragStartIndex = this.selectedKeyIndex;
                        this.dragStartPos.set(x, y);
                        // Store initial tangent
                        this.dragStartValue = { x: tx, y: ty };
                        hitFound = true;
                    }
                }

                // Out Handle
                if (!hitFound && this.selectedKeyIndex < keyframes.length - 1 && bone.tangentOut) {
                    const tx = bone.tangentOut.x || 1;
                    const ty = bone.tangentOut.y || 0;
                    const hx = this._mapTimeToX(kf.time + (tx * 0.33));
                    const hy = this._mapValueToY(this._getValue(bone, this.selectedProperty) + ty, height);

                    if (Math.abs(x - hx) < 8 && Math.abs(y - hy) < 8) {
                        this.dragMode = 'handleOut';
                        this.dragStartIndex = this.selectedKeyIndex;
                        this.dragStartPos.set(x, y);
                        // Store initial tangent
                        this.dragStartValue = { x: tx, y: ty };
                        hitFound = true;
                    }
                }
            }
        }

        if (!hitFound) {
            this.selectedKeyIndex = -1;
            this._updateOverlay();

            // Pan with right click or middle click
            if (e.button === 1 || e.button === 2) {
                // Let TimelinePanel handle it
                return false;
            }
        }

        return hitFound;
    }

    onMouseMove(e, x, y) {
        if (this.dragMode === 'keyframe' && this.selectedKeyIndex !== -1) {
            const kf = this.timeline.timelineData.keyframes[this.selectedKeyIndex];
            const bone = kf.getBone(this.selectedBoneName);

            // Calc deltas
            const timeDelta = (x - this.dragStartPos.x) / this.timeline.zoom;
            const valDelta = - (y - this.dragStartPos.y) / this.valueScale; // Y inverted

            // Apply
            kf.time = Math.max(0, this.dragStartTime + timeDelta);

            const newVal = this.dragStartValue + valDelta;

            // Update bone rot component
            if (this.selectedProperty === 'rotation.x') bone.rot.x = newVal;
            if (this.selectedProperty === 'rotation.y') bone.rot.y = newVal;
            if (this.selectedProperty === 'rotation.z') bone.rot.z = newVal;
            if (this.selectedProperty === 'rotation.w') bone.rot.w = newVal;

            this._updateOverlay();
        } else if ((this.dragMode === 'handleIn' || this.dragMode === 'handleOut') && this.selectedKeyIndex !== -1) {
            const kf = this.timeline.timelineData.keyframes[this.selectedKeyIndex];
            const bone = kf.getBone(this.selectedBoneName);

            // Calculate new vector relative to key center
            const kx = this._mapTimeToX(kf.time);
            const ky = this._mapValueToY(this._getValue(bone, this.selectedProperty), this.timeline.canvasHeight);

            // Raw mouse delta from key center
            const dxPixels = x - kx;
            const dyPixels = y - ky;

            // Convert to Time/Value units
            // Visual handle length is 0.33 * tangent so we reverse that
            let dt = (dxPixels / this.timeline.zoom) * 3.0;
            let dv = -(dyPixels / this.valueScale); // * 1.0 (tangent y is just value diff)

            if (this.dragMode === 'handleIn') {
                // Clamp In handle to be negative time
                dt = Math.min(-0.001, dt);
                if (!bone.tangentIn) bone.tangentIn = { type: InterpolationType.BEZIER };
                bone.tangentIn.type = InterpolationType.BEZIER;
                bone.tangentIn.x = dt;
                bone.tangentIn.y = dv;
            } else {
                // Clamp Out handle to be positive time
                dt = Math.max(0.001, dt);
                if (!bone.tangentOut) bone.tangentOut = { type: InterpolationType.BEZIER };
                bone.tangentOut.type = InterpolationType.BEZIER;
                bone.tangentOut.x = dt;
                bone.tangentOut.y = dv;
            }
        }
    }

    onMouseUp(e) {
        this.dragMode = null;
    }

    // --- Overlay UI ---

    _updateOverlay() {
        if (!this.timeline.container) return;

        // Create if needed
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'curve-editor-overlay';
            this.overlay.style.cssText = `
                position: absolute;
                top: 40px;
                right: 10px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid #444;
                padding: 10px;
                border-radius: 4px;
                color: #fff;
                font-size: 11px;
                z-index: 200;
                display: none;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                width: 140px;
            `;
            this.timeline.container.appendChild(this.overlay);
        }

        if (this.selectedKeyIndex === -1 || !this.selectedBoneName) {
            this.overlay.style.display = 'none';
            return;
        }

        const kf = this.timeline.timelineData.keyframes[this.selectedKeyIndex];
        const bone = kf.getBone(this.selectedBoneName);
        const val = this._getValue(bone, this.selectedProperty);
        const interp = (bone.tangentOut && bone.tangentOut.type) ? bone.tangentOut.type : 'smooth';

        this.overlay.innerHTML = `
            <div style="font-weight:bold; margin-bottom:10px; border-bottom:1px solid #555; padding-bottom:5px; color:#3498db;">Keyframe Editor</div>
            
            <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <label style="color:#aaa;">Time</label>
                <input type="number" step="0.01" value="${kf.time.toFixed(3)}" 
                    style="width:60px; background:#222; border:1px solid #444; color:#fff; padding:2px; border-radius:2px;"
                    onchange="window.game.animator.timelinePanel.curveEditor.updateKeyTime(${this.selectedKeyIndex}, parseFloat(this.value))">
            </div>
            
            <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <label style="color:#aaa;">Value</label>
                <input type="number" step="0.01" value="${val.toFixed(3)}" 
                   style="width:60px; background:#222; border:1px solid #444; color:#fff; padding:2px; border-radius:2px;"
                   onchange="window.game.animator.timelinePanel.curveEditor.updateKeyValue(${this.selectedKeyIndex}, parseFloat(this.value))">
            </div>

            <div style="margin-top:5px; border-top:1px dashed #444; padding-top:10px;">
                <div style="margin-bottom:8px; color:#aaa;">Interpolation</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('smooth')" style="cursor:pointer; background:${interp === 'smooth' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Smooth</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('linear')" style="cursor:pointer; background:${interp === 'linear' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Linear</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('stepped')" style="cursor:pointer; background:${interp === 'stepped' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px; grid-column:span 2;">Stepped</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('easeIn')" style="cursor:pointer; background:${interp === 'bezier' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Ease In</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('easeOut')" style="cursor:pointer; background:${interp === 'bezier' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Ease Out</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('bounce')" style="cursor:pointer; background:${interp === 'bounce' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Bounce</button>
                    <button onclick="window.game.animator.timelinePanel.curveEditor.applyPreset('elastic')" style="cursor:pointer; background:${interp === 'elastic' ? '#3498db' : '#333'}; border:none; color:white; padding:4px; border-radius:3px;">Elastic</button>
                </div>
            </div>
        `;
        this.overlay.style.display = 'block';
    }

    updateKeyTime(index, time) {
        const kf = this.timeline.timelineData.keyframes[index];
        if (kf) {
            kf.time = Math.max(0, time);
            this._updateOverlay();
        }
    }

    updateKeyValue(index, value) {
        const kf = this.timeline.timelineData.keyframes[index];
        if (kf) {
            const bone = kf.getBone(this.selectedBoneName);
            if (bone) {
                if (this.selectedProperty === 'rotation.x') bone.rot.x = value;
                if (this.selectedProperty === 'rotation.y') bone.rot.y = value;
                if (this.selectedProperty === 'rotation.z') bone.rot.z = value;
                if (this.selectedProperty === 'rotation.w') bone.rot.w = value;
            }
            this._updateOverlay();
        }
    }

    applyPreset(type) {
        const kf = this.timeline.timelineData.keyframes[this.selectedKeyIndex];
        if (!kf || !this.selectedBoneName) return;

        const bone = kf.getBone(this.selectedBoneName);
        if (!bone) return;

        let interpType = InterpolationType.SMOOTH;
        if (type === 'linear') interpType = InterpolationType.LINEAR;
        if (type === 'stepped') interpType = InterpolationType.STEPPED;
        if (type === 'bounce') interpType = InterpolationType.BOUNCE;
        if (type === 'elastic') interpType = InterpolationType.ELASTIC;

        if (bone.tangentIn) bone.tangentIn.type = interpType;
        if (bone.tangentOut) bone.tangentOut.type = interpType;

        // Special Presets
        if (type === 'easeIn') {
            bone.tangentIn = { type: InterpolationType.BEZIER, x: -1, y: 0 }; // Flat in
            if (bone.tangentOut) bone.tangentOut.type = InterpolationType.SMOOTH;
        }
        if (type === 'easeOut') {
            bone.tangentOut = { type: InterpolationType.BEZIER, x: 1, y: 0 }; // Flat out
            if (bone.tangentIn) bone.tangentIn.type = InterpolationType.SMOOTH;
        }

        this._updateOverlay();
        console.log(`[CurveEditor] Applied ${type} preset to Key ${this.selectedKeyIndex}`);
    }
}
