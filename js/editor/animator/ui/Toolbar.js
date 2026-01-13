/**
 * Toolbar.js
 * Phase 1: Editor Foundation
 * 
 * Professional toolbar with tool buttons, playback controls,
 * frame navigation, and snap settings.
 */

/**
 * Toolbar - Main animator toolbar component
 */
export class Toolbar {
    constructor(uiManager, animatorEditor) {
        this.uiManager = uiManager;
        this.editor = animatorEditor;

        // State
        this.activeTransformMode = 'rotate';
        this.isPlaying = false;
        this.currentFrame = 0;
        this.totalFrames = 0;
        this.fps = 30;

        // Snap settings
        this.snapEnabled = false;
        this.rotationSnap = 15; // degrees
        this.positionSnap = 0.1; // units

        // Element references
        this.container = null;
        this.frameDisplay = null;
        this.playButton = null;

        console.log('[Toolbar] Initialized');
    }

    /**
     * Build and return the toolbar element
     * @returns {HTMLElement}
     */
    build() {
        this.container = document.createElement('div');
        this.container.className = 'animator-toolbar';
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 320px;
            right: 0;
            height: 50px;
            background: var(--anim-bg);
            border-bottom: 1px solid var(--anim-border);
            display: flex;
            align-items: center;
            padding: 0 15px;
            gap: 10px;
            pointer-events: auto;
            z-index: 100;
        `;

        // Build all groups
        this.container.appendChild(this._buildTransformGroup());
        this.container.appendChild(this._buildSeparator());
        this.container.appendChild(this._buildPlaybackGroup());
        this.container.appendChild(this._buildSeparator());
        this.container.appendChild(this._buildFrameNavigationGroup());
        this.container.appendChild(this._buildSeparator());
        this.container.appendChild(this._buildSnapGroup());
        this.container.appendChild(this._buildSpacer());
        this.container.appendChild(this._buildUndoRedoGroup());
        this.container.appendChild(this._buildSeparator());
        this.container.appendChild(this._buildViewGroup());

        return this.container;
    }

    /**
     * Build transform tools group (Move, Rotate, Scale)
     * @private
     */
    _buildTransformGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 4px;';

        const tools = [
            { id: 'translate', icon: '↔️', title: 'Move (W)', key: 'translate' },
            { id: 'rotate', icon: '🔄', title: 'Rotate (E)', key: 'rotate' },
            { id: 'scale', icon: '⤢', title: 'Scale (R)', key: 'scale' }
        ];

        tools.forEach(tool => {
            const btn = this._createToolButton(tool.icon, tool.title,
                () => this._setTransformMode(tool.key));
            btn.id = `tool-${tool.id}`;
            if (tool.key === this.activeTransformMode) {
                btn.classList.add('active');
            }
            group.appendChild(btn);
        });

        return group;
    }

    /**
     * Build playback controls group
     * @private
     */
    _buildPlaybackGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 4px; align-items: center;';

        // Go to Start
        group.appendChild(this._createToolButton('⏮', 'Go to Start (Home)',
            () => this._goToStart()));

        // Frame Back
        group.appendChild(this._createToolButton('⏪', 'Previous Frame (,)',
            () => this._frameBack()));

        // Play/Pause
        this.playButton = this._createToolButton('▶️', 'Play/Pause (Space)',
            () => this._togglePlay());
        this.playButton.id = 'btn-play';
        this.playButton.style.width = '40px';
        group.appendChild(this.playButton);

        // Frame Forward
        group.appendChild(this._createToolButton('⏩', 'Next Frame (.)',
            () => this._frameForward()));

        // Go to End
        group.appendChild(this._createToolButton('⏭', 'Go to End (End)',
            () => this._goToEnd()));

        return group;
    }

    /**
     * Build frame navigation/display group
     * @private
     */
    _buildFrameNavigationGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        // Current Frame Input
        const frameInput = document.createElement('input');
        frameInput.type = 'number';
        frameInput.className = 'animator-input';
        frameInput.style.cssText = 'width: 60px; text-align: center;';
        frameInput.value = '0';
        frameInput.min = '0';
        frameInput.onchange = (e) => this._goToFrame(parseInt(e.target.value));
        this.frameDisplay = frameInput;
        group.appendChild(frameInput);

        // Separator /
        const sep = document.createElement('span');
        sep.style.cssText = 'color: var(--anim-text-muted); font-size: 12px;';
        sep.textContent = '/';
        group.appendChild(sep);

        // Total Frames Display
        this.totalFramesDisplay = document.createElement('span');
        this.totalFramesDisplay.className = 'animator-status';
        this.totalFramesDisplay.style.minWidth = '30px';
        this.totalFramesDisplay.textContent = '0';
        group.appendChild(this.totalFramesDisplay);

        // Time Display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.className = 'animator-status';
        this.timeDisplay.style.cssText = 'margin-left: 10px; color: var(--anim-primary);';
        this.timeDisplay.textContent = '0.00s';
        group.appendChild(this.timeDisplay);

        return group;
    }

    /**
     * Build snap settings group
     * @private
     */
    _buildSnapGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 6px; align-items: center;';

        // Snap Toggle
        const snapBtn = this._createToolButton('🧲', 'Toggle Snap', () => {
            this.snapEnabled = !this.snapEnabled;
            snapBtn.classList.toggle('active', this.snapEnabled);
            this._updateSnapSettings();
        });
        snapBtn.id = 'btn-snap';
        group.appendChild(snapBtn);

        // Snap Value Input
        const snapLabel = document.createElement('span');
        snapLabel.style.cssText = 'font-size: 10px; color: var(--anim-text-muted);';
        snapLabel.textContent = 'Rot:';
        group.appendChild(snapLabel);

        const snapInput = document.createElement('input');
        snapInput.type = 'number';
        snapInput.className = 'animator-input';
        snapInput.style.cssText = 'width: 45px; text-align: center;';
        snapInput.value = this.rotationSnap;
        snapInput.min = '1';
        snapInput.max = '90';
        snapInput.step = '5';
        snapInput.onchange = (e) => {
            this.rotationSnap = parseInt(e.target.value);
            this._updateSnapSettings();
        };
        group.appendChild(snapInput);

        const degLabel = document.createElement('span');
        degLabel.style.cssText = 'font-size: 10px; color: var(--anim-text-muted);';
        degLabel.textContent = '°';
        group.appendChild(degLabel);

        return group;
    }

    /**
     * Build undo/redo group
     * @private
     */
    _buildUndoRedoGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 4px;';

        this.undoButton = this._createToolButton('↩️', 'Undo (Ctrl+Z)',
            () => this._undo());
        this.undoButton.id = 'btn-undo';
        group.appendChild(this.undoButton);

        this.redoButton = this._createToolButton('↪️', 'Redo (Ctrl+Shift+Z)',
            () => this._redo());
        this.redoButton.id = 'btn-redo';
        group.appendChild(this.redoButton);

        return group;
    }

    /**
     * Build view options group
     * @private
     */
    _buildViewGroup() {
        const group = document.createElement('div');
        group.className = 'animator-toolbar-group';
        group.style.cssText = 'display: flex; gap: 4px;';

        // Toggle Skeleton View
        const skeletonBtn = this._createToolButton('🦴', 'Toggle Skeleton',
            () => this._toggleSkeleton());
        skeletonBtn.id = 'btn-skeleton';
        group.appendChild(skeletonBtn);

        // Focus on Selected
        group.appendChild(this._createToolButton('🎯', 'Focus Selected (F)',
            () => this._focusSelected()));

        // Help
        group.appendChild(this._createToolButton('❓', 'Keyboard Shortcuts',
            () => this._showHelp()));

        return group;
    }

    /**
     * Create a tool button
     * @private
     */
    _createToolButton(icon, title, onClick) {
        const btn = document.createElement('button');
        btn.className = 'animator-tool-btn';
        btn.innerHTML = icon;
        btn.title = title;
        btn.onclick = onClick;
        return btn;
    }

    /**
     * Create a separator element
     * @private
     */
    _buildSeparator() {
        const sep = document.createElement('div');
        sep.style.cssText = 'width: 1px; height: 24px; background: var(--anim-border);';
        return sep;
    }

    /**
     * Create a spacer element (flex-grow)
     * @private
     */
    _buildSpacer() {
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        return spacer;
    }

    // ==================== Actions ====================

    _setTransformMode(mode) {
        this.activeTransformMode = mode;

        // Update button states
        ['translate', 'rotate', 'scale'].forEach(m => {
            const btn = document.getElementById(`tool-${m}`);
            if (btn) btn.classList.toggle('active', m === mode);
        });

        // Apply to transform controls
        if (this.editor.transformControls) {
            this.editor.transformControls.setMode(mode);
        }
    }

    _togglePlay() {
        if (this.editor.isPreviewing) {
            this.editor.stopPreview();
            this.isPlaying = false;
        } else {
            this.editor.playPreview();
            this.isPlaying = true;
        }
        this._updatePlayButton();
    }

    _updatePlayButton() {
        if (this.playButton) {
            this.playButton.innerHTML = this.isPlaying ? '⏸️' : '▶️';
            this.playButton.title = this.isPlaying ? 'Pause (Space)' : 'Play (Space)';
        }
    }

    _goToStart() {
        this.currentFrame = 0;
        this._applyFramePose();
        this._updateFrameDisplay();

        if (this.editor.isPreviewing) {
            this.editor.previewTime = 0;
        }
    }

    _goToEnd() {
        const maxFrame = Math.max(0, this.totalFrames - 1);
        this.currentFrame = maxFrame;
        this._applyFramePose();
        this._updateFrameDisplay();

        if (this.editor.isPreviewing && this.editor.previewDuration > 0) {
            this.editor.previewTime = this.editor.previewDuration - 0.001;
        }
    }

    _frameBack() {
        if (this.currentFrame > 0) {
            this.currentFrame--;
            this._applyFramePose();
            this._updateFrameDisplay();
        }
    }

    _frameForward() {
        if (this.currentFrame < this.totalFrames - 1) {
            this.currentFrame++;
            this._applyFramePose();
            this._updateFrameDisplay();
        }
    }

    _goToFrame(frame) {
        this.currentFrame = Math.max(0, Math.min(frame, Math.max(0, this.totalFrames - 1)));
        this._applyFramePose();
        this._updateFrameDisplay();

        if (this.editor.isPreviewing) {
            this.editor.previewTime = this.currentFrame; // 1 second per frame
        }
    }

    /**
     * Apply the pose at the current frame index to the model
     * @private
     */
    _applyFramePose() {
        if (!this.editor.capturedPoses || this.editor.capturedPoses.length === 0) {
            console.log('[Toolbar] No keyframes to apply');
            return;
        }

        const frameIndex = Math.min(this.currentFrame, this.editor.capturedPoses.length - 1);
        const pose = this.editor.capturedPoses[frameIndex];

        if (!pose || !pose.bones) {
            console.log('[Toolbar] Invalid pose at frame', frameIndex);
            return;
        }

        // Apply quaternions to bones
        for (const boneData of pose.bones) {
            const bone = this.editor.boneRefs.get(boneData.name);
            if (bone) {
                bone.quaternion.copy(boneData.rot);
            }
        }

        console.log(`[Toolbar] Applied pose at frame ${frameIndex}`);
    }

    _undo() {
        if (this.editor.undoManager) {
            this.editor.undoManager.undo();
            this.editor._buildUI();
        }
    }

    _redo() {
        if (this.editor.undoManager) {
            this.editor.undoManager.redo();
            this.editor._buildUI();
        }
    }

    _updateSnapSettings() {
        if (this.editor.transformControls) {
            if (this.snapEnabled) {
                this.editor.transformControls.setRotationSnap(
                    THREE.MathUtils.degToRad(this.rotationSnap)
                );
                this.editor.transformControls.setTranslationSnap(this.positionSnap);
            } else {
                this.editor.transformControls.setRotationSnap(null);
                this.editor.transformControls.setTranslationSnap(null);
            }
        }
    }

    _toggleSkeleton() {
        // Toggle skeleton helper visibility
        if (this.editor.skeletonHelper) {
            this.editor.skeletonHelper.visible = !this.editor.skeletonHelper.visible;
        }
    }

    _focusSelected() {
        // TODO: Focus camera on selected bone
        console.log('[Toolbar] Focus Selected');
    }

    _showHelp() {
        // TODO: Show keyboard shortcuts overlay
        console.log('[Toolbar] Show Help');
        if (this.editor.hotkeyManager) {
            const hotkeys = this.editor.hotkeyManager.getHotkeyList();
            console.table(hotkeys);
        }
    }

    /**
     * Update frame and time displays
     */
    _updateFrameDisplay() {
        if (this.frameDisplay) {
            this.frameDisplay.value = this.currentFrame;
        }
        if (this.timeDisplay) {
            const time = this.currentFrame / this.fps;
            this.timeDisplay.textContent = time.toFixed(2) + 's';
        }
    }

    /**
     * Set total frames based on keyframes
     * @param {number} count 
     */
    setTotalFrames(count) {
        this.totalFrames = count;
        if (this.totalFramesDisplay) {
            this.totalFramesDisplay.textContent = count.toString();
        }
    }

    /**
     * Update playback state from editor
     * @param {boolean} playing 
     * @param {number} time 
     */
    updatePlaybackState(playing, time) {
        this.isPlaying = playing;
        this._updatePlayButton();

        if (time !== undefined) {
            this.currentFrame = Math.floor(time * this.fps);
            this._updateFrameDisplay();
        }
    }

    /**
     * Update undo/redo button states
     * @param {Object} undoState - { canUndo, canRedo }
     */
    updateUndoState(undoState) {
        if (this.undoButton) {
            this.undoButton.disabled = !undoState.canUndo;
            this.undoButton.style.opacity = undoState.canUndo ? '1' : '0.5';
        }
        if (this.redoButton) {
            this.redoButton.disabled = !undoState.canRedo;
            this.redoButton.style.opacity = undoState.canRedo ? '1' : '0.5';
        }
    }
}

export default Toolbar;
