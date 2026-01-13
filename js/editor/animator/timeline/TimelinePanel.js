/**
 * TimelinePanel.js
 * Phase 3: Professional Timeline & Dope Sheet
 * 
 * Main timeline container with time ruler, playhead, and zoom controls.
 * Follows patterns from GraphEditor.js for canvas rendering.
 */

import { TimelineData } from './KeyframeData.js';
import { DopeSheet } from './DopeSheet.js';

/**
 * TimelinePanel - Professional timeline editor component
 */
export class TimelinePanel {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;

        // Data
        this.timelineData = new TimelineData();
        this.dopeSheet = new DopeSheet(this);

        // View state
        this.zoom = 100;                    // Pixels per second
        this.viewOffset = 0;                // Horizontal scroll offset in pixels
        this.playheadTime = 0;              // Current playhead position in seconds

        // Dimensions
        this.headerHeight = 30;             // Time ruler height
        this.trackHeight = 24;              // Height per bone track
        this.leftPanelWidth = 180;          // Bone list panel width

        // Interaction state
        this.isDraggingPlayhead = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartOffset = 0;
        this.isResizing = false;
        this.resizeStartY = 0;
        this.startHeight = 0;

        // Display mode
        this.showSeconds = true;            // true = seconds, false = frames
        this.fps = 30;

        // DOM elements
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.boneListContainer = null;

        // Animation frame
        this.animationFrameId = null;

        // Expanded bone groups
        this.expandedBones = new Set();

        console.log('[TimelinePanel] Initialized');
    }

    /**
     * Build the timeline panel UI
     * @returns {HTMLElement}
     */
    build() {
        this.container = document.createElement('div');
        this.container.id = 'timeline-panel';
        this.container.className = 'animator-panel timeline-panel';
        this.container.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 320px;
            right: 0;
            height: 250px;
            background: var(--anim-bg);
            border-top: 1px solid var(--anim-border);
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            z-index: 100;
        `;

        // Build header toolbar
        this.container.appendChild(this._buildToolbar());

        // Build main content area (bone list + canvas)
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

        // Left panel - bone hierarchy
        this.boneListContainer = this._buildBoneList();
        content.appendChild(this.boneListContainer);

        // Right panel - timeline canvas
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            flex: 1;
            position: relative;
            overflow: hidden;
        `;

        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;
        canvasContainer.appendChild(this.canvas);
        content.appendChild(canvasContainer);

        this.container.appendChild(content);

        // Get context and setup
        this.ctx = this.canvas.getContext('2d');
        this._setupEventListeners();
        this._setupResizeHandle();
        this._startRenderLoop();

        return this.container;
    }

    /**
     * Build the toolbar section
     * @private
     */
    _buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'timeline-toolbar';
        toolbar.style.cssText = `
            height: 36px;
            display: flex;
            align-items: center;
            padding: 0 10px;
            gap: 10px;
            border-bottom: 1px solid var(--anim-border);
            background: var(--anim-bg-secondary);
        `;

        // Title
        const title = document.createElement('span');
        title.textContent = '🎬 Timeline';
        title.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--anim-text-secondary);';
        toolbar.appendChild(title);

        // Separator
        toolbar.appendChild(this._createSeparator());

        // Time/Frame toggle
        this.timeToggle = document.createElement('button');
        this.timeToggle.className = 'animator-tool-btn';
        this.timeToggle.innerHTML = '⏱️';
        this.timeToggle.title = 'Toggle Seconds/Frames';
        this.timeToggle.onclick = () => {
            this.showSeconds = !this.showSeconds;
            this._updateTimeDisplay();
        };
        toolbar.appendChild(this.timeToggle);

        // Current time display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.style.cssText = `
            font-family: monospace;
            font-size: 12px;
            color: var(--anim-primary);
            min-width: 80px;
        `;
        this.timeDisplay.textContent = '0.00s';
        toolbar.appendChild(this.timeDisplay);

        // Separator
        toolbar.appendChild(this._createSeparator());

        // Zoom controls
        const zoomOut = document.createElement('button');
        zoomOut.className = 'animator-tool-btn';
        zoomOut.innerHTML = '➖';
        zoomOut.title = 'Zoom Out';
        zoomOut.onclick = () => this.setZoom(this.zoom * 0.8);
        toolbar.appendChild(zoomOut);

        this.zoomDisplay = document.createElement('span');
        this.zoomDisplay.style.cssText = 'font-size: 11px; color: var(--anim-text-muted); min-width: 40px; text-align: center;';
        this.zoomDisplay.textContent = '100%';
        toolbar.appendChild(this.zoomDisplay);

        const zoomIn = document.createElement('button');
        zoomIn.className = 'animator-tool-btn';
        zoomIn.innerHTML = '➕';
        zoomIn.title = 'Zoom In';
        zoomIn.onclick = () => this.setZoom(this.zoom * 1.25);
        toolbar.appendChild(zoomIn);

        const fitView = document.createElement('button');
        fitView.className = 'animator-tool-btn';
        fitView.innerHTML = '⊞';
        fitView.title = 'Fit to View';
        fitView.onclick = () => this.fitToView();
        toolbar.appendChild(fitView);

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        toolbar.appendChild(spacer);

        // Playback speed
        const speedLabel = document.createElement('span');
        speedLabel.style.cssText = 'font-size: 11px; color: var(--anim-text-muted);';
        speedLabel.textContent = 'Speed:';
        toolbar.appendChild(speedLabel);

        this.speedSelect = document.createElement('select');
        this.speedSelect.className = 'animator-input';
        this.speedSelect.style.cssText = 'width: 70px; padding: 2px 4px;';
        [0.25, 0.5, 1, 1.5, 2, 4].forEach(speed => {
            const option = document.createElement('option');
            option.value = speed;
            option.textContent = `${speed}x`;
            if (speed === 1) option.selected = true;
            this.speedSelect.appendChild(option);
        });
        this.speedSelect.onchange = () => {
            this.timelineData.playbackSpeed = parseFloat(this.speedSelect.value);
        };
        toolbar.appendChild(this.speedSelect);

        return toolbar;
    }

    /**
     * Build the bone list panel
     * @private
     */
    _buildBoneList() {
        const container = document.createElement('div');
        container.className = 'timeline-bone-list';
        container.style.cssText = `
            width: ${this.leftPanelWidth}px;
            border-right: 1px solid var(--anim-border);
            overflow-y: auto;
            background: var(--anim-bg);
        `;

        // Header row (matches time ruler height)
        const header = document.createElement('div');
        header.style.cssText = `
            height: ${this.headerHeight}px;
            display: flex;
            align-items: center;
            padding: 0 10px;
            border-bottom: 1px solid var(--anim-border);
            font-size: 11px;
            color: var(--anim-text-muted);
            background: var(--anim-bg-secondary);
        `;
        header.textContent = 'Bones';
        container.appendChild(header);

        // Bone list content
        this.boneListContent = document.createElement('div');
        this.boneListContent.className = 'bone-list-content';
        container.appendChild(this.boneListContent);

        return container;
    }

    /**
     * Create a separator element
     * @private
     */
    _createSeparator() {
        const sep = document.createElement('div');
        sep.style.cssText = 'width: 1px; height: 20px; background: var(--anim-border);';
        return sep;
    }

    /**
     * Setup canvas event listeners
     * @private
     */
    _setupEventListeners() {
        // Mouse events for canvas
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this._onMouseUp());
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));

        // Double click to add keyframe
        this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));

        this.resizeObserver = new ResizeObserver(() => this._resizeCanvas());
        this.resizeObserver.observe(this.canvas.parentElement);
    }

    /**
     * Setup resize handle for the panel
     * @private
     */
    _setupResizeHandle() {
        const handle = document.createElement('div');
        handle.style.cssText = `
            position: absolute;
            top: -5px;
            left: 0;
            right: 0;
            height: 10px;
            cursor: ns-resize;
            z-index: 1000;
            background: transparent;
        `;

        // Visual indicator on hover
        handle.onmouseenter = () => handle.style.background = 'rgba(255, 255, 255, 0.1)';
        handle.onmouseleave = () => handle.style.background = 'transparent';

        this.container.appendChild(handle);

        const onMouseMove = (e) => {
            if (!this.isResizing) return;

            e.preventDefault();
            const newHeight = window.innerHeight - e.clientY;
            // Clamp height (min 100px, max 80% screen height)
            const clampedHeight = Math.max(100, Math.min(window.innerHeight * 0.8, newHeight));
            this.container.style.height = `${clampedHeight}px`;

            // Trigger canva resize
            this._resizeCanvas();
        };

        const onMouseUp = () => {
            this.isResizing = false;
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            document.body.style.cursor = 'ns-resize';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.preventDefault(); // Prevent text selection
        });
    }

    /**
     * Resize canvas to match container
     * @private
     */
    _resizeCanvas() {
        if (!this.canvas || !this.canvas.parentElement) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.parentElement.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    /**
     * Start the render loop
     * @private
     */
    _startRenderLoop() {
        const render = () => {
            this._render();
            this.animationFrameId = requestAnimationFrame(render);
        };
        render();
    }

    /**
     * Main render function
     * @private
     */
    _render() {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvasWidth || this.canvas.width;
        const height = this.canvasHeight || this.canvas.height;

        // Clear
        ctx.fillStyle = '#1a1a1f';
        ctx.fillRect(0, 0, width, height);

        // Draw time ruler
        this._drawTimeRuler(ctx, width);

        // Draw grid lines
        this._drawGrid(ctx, width, height);

        // Draw keyframe markers
        this._drawKeyframes(ctx, width, height);

        // Draw playhead
        this._drawPlayhead(ctx, height);
    }

    /**
     * Draw the time ruler at the top
     * @private
     */
    _drawTimeRuler(ctx, width) {
        const rulerHeight = this.headerHeight;

        // Background
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, width, rulerHeight);

        // Calculate time markers
        const pixelsPerSecond = this.zoom;
        const startTime = this.viewOffset / pixelsPerSecond;
        const endTime = startTime + (width / pixelsPerSecond);

        // Determine step size based on zoom
        let majorStep = 1;      // seconds
        let minorDivisions = 4;

        if (pixelsPerSecond < 30) {
            majorStep = 5;
            minorDivisions = 5;
        } else if (pixelsPerSecond < 60) {
            majorStep = 2;
            minorDivisions = 4;
        } else if (pixelsPerSecond > 200) {
            majorStep = 0.5;
            minorDivisions = 5;
        }

        const minorStep = majorStep / minorDivisions;

        // Draw markers
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = '10px monospace';

        let time = Math.floor(startTime / majorStep) * majorStep;
        while (time <= endTime) {
            const x = (time * pixelsPerSecond) - this.viewOffset;

            // Major tick
            ctx.strokeStyle = '#555';
            ctx.beginPath();
            ctx.moveTo(x, rulerHeight - 10);
            ctx.lineTo(x, rulerHeight);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#888';
            const label = this.showSeconds ? `${time.toFixed(1)}s` : `${Math.round(time * this.fps)}f`;
            ctx.fillText(label, x, rulerHeight - 12);

            // Minor ticks
            for (let i = 1; i < minorDivisions; i++) {
                const minorTime = time + (i * minorStep);
                const minorX = (minorTime * pixelsPerSecond) - this.viewOffset;

                ctx.strokeStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(minorX, rulerHeight - 5);
                ctx.lineTo(minorX, rulerHeight);
                ctx.stroke();
            }

            time += majorStep;
        }

        // Bottom border
        ctx.strokeStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(0, rulerHeight);
        ctx.lineTo(width, rulerHeight);
        ctx.stroke();
    }

    /**
     * Draw grid lines
     * @private
     */
    _drawGrid(ctx, width, height) {
        const startY = this.headerHeight;

        // Horizontal track lines
        const boneNames = this.dopeSheet.getVisibleBones();
        for (let i = 0; i <= boneNames.length; i++) {
            const y = startY + (i * this.trackHeight);
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Vertical time grid (every second)
        const pixelsPerSecond = this.zoom;
        const startTime = Math.floor(this.viewOffset / pixelsPerSecond);
        const endTime = startTime + Math.ceil(width / pixelsPerSecond) + 1;

        for (let time = startTime; time <= endTime; time++) {
            const x = (time * pixelsPerSecond) - this.viewOffset;
            ctx.strokeStyle = '#282828';
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    /**
     * Draw keyframe markers
     * @private
     */
    _drawKeyframes(ctx, width, height) {
        const startY = this.headerHeight;
        const boneNames = this.dopeSheet.getVisibleBones();
        const pixelsPerSecond = this.zoom;

        for (let keyframeIndex = 0; keyframeIndex < this.timelineData.keyframes.length; keyframeIndex++) {
            const keyframe = this.timelineData.keyframes[keyframeIndex];
            const x = (keyframe.time * pixelsPerSecond) - this.viewOffset;

            // Skip if off screen
            if (x < -20 || x > width + 20) continue;

            // Draw marker for each bone
            for (let boneIndex = 0; boneIndex < boneNames.length; boneIndex++) {
                const boneName = boneNames[boneIndex];
                const hasBone = keyframe.bones.some(b => b.name === boneName);

                // Check if selected in DopeSheet
                const isSelected = this.dopeSheet.selectedKeyframes.has(boneIndex) &&
                    this.dopeSheet.selectedKeyframes.get(boneIndex).has(keyframeIndex);

                if (hasBone) {
                    const y = startY + (boneIndex * this.trackHeight) + (this.trackHeight / 2);
                    this._drawDiamond(ctx, x, y, isSelected || keyframe.selected);
                }
            }

            // Also draw on the "all bones" row at the top
            const allY = startY + (this.trackHeight / 2) - this.trackHeight;
            // Skip if no bones in this keyframe
        }
    }

    /**
     * Draw a diamond-shaped keyframe marker
     * @private
     */
    _drawDiamond(ctx, x, y, selected = false) {
        const size = 5;

        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();

        // Fill
        ctx.fillStyle = selected ? '#3498db' : '#e74c3c';
        ctx.fill();

        // Stroke
        ctx.strokeStyle = selected ? '#87ceeb' : '#ff6b6b';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /**
     * Draw the playhead indicator
     * @private
     */
    _drawPlayhead(ctx, height) {
        const x = (this.playheadTime * this.zoom) - this.viewOffset;

        if (x < 0 || x > this.canvasWidth) return;

        // Line
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Head triangle
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.moveTo(x - 6, 0);
        ctx.lineTo(x + 6, 0);
        ctx.lineTo(x, 10);
        ctx.closePath();
        ctx.fill();

        ctx.lineWidth = 1;
    }

    /**
     * Handle mouse down
     * @private
     */
    _onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Click in ruler area - set playhead
        if (y < this.headerHeight) {
            this.isDraggingPlayhead = true;
            this._setPlayheadFromX(x);
            return;
        }

        // Middle click - start panning
        if (e.button === 1) {
            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartOffset = this.viewOffset;
            e.preventDefault();
            return;
        }

        // Left click - select keyframe
        this._handleKeyframeClick(x, y, e.shiftKey);
    }

    /**
     * Handle mouse move
     * @private
     */
    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        if (this.isDraggingPlayhead) {
            this._setPlayheadFromX(x);
        }

        if (this.isPanning) {
            const dx = e.clientX - this.panStartX;
            this.viewOffset = Math.max(0, this.panStartOffset - dx);
        }
    }

    /**
     * Handle mouse up
     * @private
     */
    _onMouseUp() {
        this.isDraggingPlayhead = false;
        this.isPanning = false;
    }

    /**
     * Handle mouse wheel for zoom
     * @private
     */
    _onWheel(e) {
        e.preventDefault();

        if (e.ctrlKey) {
            // Zoom
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const timeAtMouse = (mouseX + this.viewOffset) / this.zoom;

            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            this.setZoom(this.zoom * zoomDelta);

            // Adjust offset to keep time under mouse
            this.viewOffset = (timeAtMouse * this.zoom) - mouseX;
            this.viewOffset = Math.max(0, this.viewOffset);
        } else {
            // Pan
            this.viewOffset = Math.max(0, this.viewOffset + e.deltaY);
        }
    }

    /**
     * Handle double click to add keyframe
     * @private
     */
    _onDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (y > this.headerHeight) {
            const time = (x + this.viewOffset) / this.zoom;
            console.log(`[TimelinePanel] Double-click at time: ${time.toFixed(2)}s`);
            // TODO: Trigger keyframe capture at this time
        }
    }

    /**
     * Handle keyframe selection
     * @private
     */
    /**
     * Handle keyframe selection
     * @private
     */
    _handleKeyframeClick(x, y, addToSelection) {
        const pixelsPerSecond = this.zoom;
        const clickTime = (x + this.viewOffset) / pixelsPerSecond;
        const clickTolerance = 10 / pixelsPerSecond; // 10 pixels in time

        // Calculate bone index from Y coordinate
        let boneIndex = -1;
        if (y > this.headerHeight) {
            boneIndex = Math.floor((y - this.headerHeight) / this.trackHeight);
        }

        const visibleBones = this.dopeSheet.getVisibleBones();

        for (let i = 0; i < this.timelineData.keyframes.length; i++) {
            const keyframe = this.timelineData.keyframes[i];
            if (Math.abs(keyframe.time - clickTime) < clickTolerance) {

                // If clicked on a specific bone row
                if (boneIndex >= 0 && boneIndex < visibleBones.length) {
                    const boneName = visibleBones[boneIndex];
                    // Check if this keyframe has this bone
                    if (keyframe.bones.some(b => b.name === boneName)) {
                        this.dopeSheet.selectKeyframe(boneIndex, i, addToSelection);
                        console.log(`[TimelinePanel] Selected bone ${boneName} at frame ${i}`);
                        return;
                    }
                }
                // If clicked outside specific track or summary (future), select whole keyframe
                else if (boneIndex < 0) {
                    this.timelineData.selectKeyframe(i, addToSelection);
                    console.log(`[TimelinePanel] Selected full keyframe ${i}`);
                    return;
                }
            }
        }

        // Clicked empty space - clear selection
        if (!addToSelection) {
            this.timelineData.clearSelection();
            this.dopeSheet.clearSelection();
        }
    }

    /**
     * Set playhead position from x coordinate
     * @private
     */
    _setPlayheadFromX(x) {
        const time = Math.max(0, (x + this.viewOffset) / this.zoom);
        this.setPlayheadTime(time);
    }

    // ==================== Public API ====================

    /**
     * Set playhead time and update display
     * @param {number} time 
     */
    setPlayheadTime(time) {
        this.playheadTime = Math.max(0, time);
        this._updateTimeDisplay();

        // Notify editor to update pose
        if (this.editor && this.editor.isPoseMode) {
            this._applyPoseAtTime(time);
        }
    }

    /**
     * Apply pose at given time using interpolation
     * @private
     */
    _applyPoseAtTime(time) {
        if (this.timelineData.keyframes.length === 0) return;

        // Find surrounding keyframes
        let prevKeyframe = null;
        let nextKeyframe = null;

        for (const keyframe of this.timelineData.keyframes) {
            if (keyframe.time <= time) {
                prevKeyframe = keyframe;
            }
            if (keyframe.time > time && !nextKeyframe) {
                nextKeyframe = keyframe;
            }
        }

        if (!prevKeyframe) {
            prevKeyframe = this.timelineData.keyframes[0];
        }
        if (!nextKeyframe) {
            nextKeyframe = prevKeyframe;
        }

        // Calculate blend factor
        const duration = nextKeyframe.time - prevKeyframe.time;
        const alpha = duration > 0 ? (time - prevKeyframe.time) / duration : 0;

        // Apply interpolated pose
        for (const boneData of prevKeyframe.bones) {
            const bone = this.editor.boneRefs.get(boneData.name);
            if (!bone) continue;

            const nextBone = nextKeyframe.bones.find(b => b.name === boneData.name);
            if (nextBone) {
                bone.quaternion.slerpQuaternions(boneData.rot, nextBone.rot, alpha);
            } else {
                bone.quaternion.copy(boneData.rot);
            }
        }
    }

    /**
     * Update time display
     * @private
     */
    _updateTimeDisplay() {
        if (this.timeDisplay) {
            if (this.showSeconds) {
                this.timeDisplay.textContent = `${this.playheadTime.toFixed(2)}s`;
            } else {
                this.timeDisplay.textContent = `${Math.round(this.playheadTime * this.fps)}f`;
            }
        }
    }

    /**
     * Set zoom level
     * @param {number} zoom - Pixels per second
     */
    setZoom(zoom) {
        this.zoom = Math.max(20, Math.min(500, zoom));
        if (this.zoomDisplay) {
            this.zoomDisplay.textContent = `${Math.round(this.zoom)}%`;
        }
    }

    /**
     * Fit timeline to show all keyframes
     */
    fitToView() {
        if (this.timelineData.duration <= 0 || !this.canvasWidth) return;

        this.zoom = (this.canvasWidth - 40) / this.timelineData.duration;
        this.zoom = Math.max(20, Math.min(500, this.zoom));
        this.viewOffset = 0;

        if (this.zoomDisplay) {
            this.zoomDisplay.textContent = `${Math.round(this.zoom)}%`;
        }
    }

    /**
     * Load keyframes from editor's captured poses
     * @param {Array} capturedPoses 
     * @param {number} currentFrame 
     */
    loadKeyframes(capturedPoses, currentFrame = 0) {
        this.timelineData.loadFromLegacy(capturedPoses, 1.0);
        this.playheadTime = currentFrame;

        // Build hierarchy in DopeSheet
        this.dopeSheet.buildHierarchy(this.timelineData.getBoneNames());

        this._updateBoneList();
        this._updateTimeDisplay();
    }

    /**
     * Update the bone list UI
     * @private
     */
    _updateBoneList() {
        if (!this.boneListContent) return;

        this.boneListContent.innerHTML = '';
        const hierarchy = this.dopeSheet.boneHierarchy;

        const renderItem = (item, level = 0) => {
            const row = document.createElement('div');
            row.style.cssText = `
                height: ${this.trackHeight}px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                padding-left: ${10 + (level * 15)}px;
                font-size: 11px;
                color: var(--anim-text);
                border-bottom: 1px solid var(--anim-border);
                cursor: pointer;
                overflow: hidden;
                white-space: nowrap;
                background: ${item.isGroup ? 'var(--anim-surface)' : 'transparent'};
            `;

            if (item.isGroup) {
                row.innerHTML = `<span style="margin-right:5px; font-size:9px;">${item.expanded ? '▼' : '▶'}</span> <b>${item.name}</b>`;
                row.onclick = () => {
                    this.dopeSheet.toggleGroup(item.name);
                    this._updateBoneList();
                };
            } else {
                row.textContent = item.name;
                row.title = item.name;
                row.onmouseenter = () => row.style.background = 'var(--anim-surface-hover)';
                row.onmouseleave = () => row.style.background = '';
            }

            this.boneListContent.appendChild(row);

            if (item.isGroup && item.expanded) {
                item.children.forEach(child => renderItem(child, level + 1));
            }
        };

        hierarchy.forEach(item => renderItem(item));

        // Also render flat items if any (fallback)
        if (hierarchy.length === 0) {
            const boneNames = Array.from(this.timelineData.getBoneNames());
            boneNames.forEach(name => {
                const item = { name: name, isGroup: false };
                renderItem(item);
            });
        }
    }

    /**
     * Show the timeline panel
     */
    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            this._resizeCanvas();

            // Bind keyboard for dope sheet operations
            this._onKeyDownBound = (e) => this.dopeSheet.handleKeyboard(e);
            window.addEventListener('keydown', this._onKeyDownBound);
        }
    }

    /**
     * Hide the timeline panel
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';

            // Unbind keyboard
            if (this._onKeyDownBound) {
                window.removeEventListener('keydown', this._onKeyDownBound);
                this._onKeyDownBound = null;
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
     * Cleanup
     */
    dispose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.container) {
            this.container.remove();
        }
    }
}

export default TimelinePanel;
