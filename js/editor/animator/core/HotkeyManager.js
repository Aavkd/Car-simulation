/**
 * HotkeyManager.js
 * Phase 1: Editor Foundation
 * 
 * Centralized keyboard shortcut management for the animator editor.
 */

/**
 * HotkeyManager - Manages keyboard shortcuts
 */
export class HotkeyManager {
    constructor(animatorEditor) {
        this.editor = animatorEditor;

        // Hotkey registrations: key -> { action, description, requiresModifier }
        this.hotkeys = new Map();

        // Bound event handler
        this._onKeyDownBound = this._onKeyDown.bind(this);

        // State
        this.enabled = false;

        this._registerDefaultHotkeys();

        console.log('[HotkeyManager] Initialized');
    }

    /**
     * Register default animator hotkeys
     * @private
     */
    _registerDefaultHotkeys() {
        // Playback
        this.register('Space', () => this._togglePlayPause(), 'Play/Pause');
        this.register('.', () => this._frameForward(), 'Frame Forward');
        this.register(',', () => this._frameBackward(), 'Frame Backward');
        this.register('Home', () => this._goToStart(), 'Go to Start');
        this.register('End', () => this._goToEnd(), 'Go to End');

        // Transform Tools
        this.register('w', () => this._setTransformMode('translate'), 'Move Tool');
        this.register('e', () => this._setTransformMode('rotate'), 'Rotate Tool');
        this.register('r', () => this._setTransformMode('scale'), 'Scale Tool');

        // Selection
        this.register('a', () => this._selectAll(), 'Select All Bones');
        this.register('a', () => this._deselectAll(), 'Deselect All', { alt: true });
        this.register('i', () => this._invertSelection(), 'Invert Selection', { ctrl: true });

        // Keyframing
        this.register('s', () => this._captureKeyframe(), 'Set Keyframe');
        this.register('Delete', () => this._deleteKeyframe(), 'Delete Keyframe');

        // Undo/Redo
        this.register('z', () => this._undo(), 'Undo', { ctrl: true });
        this.register('z', () => this._redo(), 'Redo', { ctrl: true, shift: true });
        this.register('y', () => this._redo(), 'Redo (Alt)', { ctrl: true });

        // View
        this.register('f', () => this._focusSelected(), 'Focus on Selected');
        this.register('Numpad0', () => this._resetCamera(), 'Reset Camera');

        // Phase 2: Graph View
        this.register('g', () => this._toggleGraphView(), 'Toggle State Machine Graph');

        // Phase 3: Timeline
        this.register('t', () => this._toggleTimelineView(), 'Toggle Timeline');
        this.register('i', () => this._setLoopInPoint(), 'Set Loop In Point');
        this.register('o', () => this._setLoopOutPoint(), 'Set Loop Out Point');

        // Phase 6: Animation Import
        this.register('i', () => this._showImportDialog(), 'Import Animation', { shift: true });
    }

    /**
     * Register a hotkey
     * @param {string} key - The key code
     * @param {Function} action - The function to execute
     * @param {string} description - Human-readable description
     * @param {Object} modifiers - { ctrl, shift, alt }
     */
    register(key, action, description, modifiers = {}) {
        const keyId = this._getKeyId(key, modifiers);
        this.hotkeys.set(keyId, {
            key,
            action,
            description,
            modifiers
        });
    }

    /**
     * Unregister a hotkey
     * @param {string} key 
     * @param {Object} modifiers 
     */
    unregister(key, modifiers = {}) {
        const keyId = this._getKeyId(key, modifiers);
        this.hotkeys.delete(keyId);
    }

    /**
     * Enable hotkey listening
     */
    enable() {
        if (this.enabled) return;
        window.addEventListener('keydown', this._onKeyDownBound);
        this.enabled = true;
    }

    /**
     * Disable hotkey listening
     */
    disable() {
        if (!this.enabled) return;
        window.removeEventListener('keydown', this._onKeyDownBound);
        this.enabled = false;
    }

    /**
     * Get all registered hotkeys for help display
     * @returns {Array<{key: string, description: string, modifiers: Object}>}
     */
    getHotkeyList() {
        const list = [];
        this.hotkeys.forEach((value, key) => {
            list.push({
                keyCombo: this._formatKeyCombo(value.key, value.modifiers),
                description: value.description
            });
        });
        return list;
    }

    /**
     * Handle keydown event
     * @private
     */
    _onKeyDown(event) {
        // Don't trigger if typing in an input
        if (event.target.tagName === 'INPUT' ||
            event.target.tagName === 'TEXTAREA' ||
            event.target.isContentEditable) {
            return;
        }

        const modifiers = {
            ctrl: event.ctrlKey || event.metaKey,
            shift: event.shiftKey,
            alt: event.altKey
        };

        const keyId = this._getKeyId(event.key, modifiers);
        const hotkey = this.hotkeys.get(keyId);

        if (hotkey) {
            event.preventDefault();
            event.stopPropagation();
            hotkey.action();
        }
    }

    /**
     * Generate unique key ID from key and modifiers
     * @private
     */
    _getKeyId(key, modifiers = {}) {
        const parts = [];
        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.shift) parts.push('Shift');
        if (modifiers.alt) parts.push('Alt');
        parts.push(key.toLowerCase());
        return parts.join('+');
    }

    /**
     * Format key combo for display
     * @private
     */
    _formatKeyCombo(key, modifiers = {}) {
        const parts = [];
        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.shift) parts.push('Shift');
        if (modifiers.alt) parts.push('Alt');
        parts.push(key.toUpperCase());
        return parts.join(' + ');
    }

    // ==================== Action Implementations ====================

    _togglePlayPause() {
        if (this.editor.isPreviewing) {
            this.editor.stopPreview();
        } else {
            this.editor.playPreview();
        }
    }

    _frameForward() {
        // Phase 3: Use toolbar for frame stepping if available
        if (this.editor.toolbar) {
            this.editor.toolbar._frameForward();
        } else {
            console.log('[Hotkey] Frame Forward');
        }
    }

    _frameBackward() {
        // Phase 3: Use toolbar for frame stepping if available
        if (this.editor.toolbar) {
            this.editor.toolbar._frameBack();
        } else {
            console.log('[Hotkey] Frame Backward');
        }
    }

    _goToStart() {
        if (this.editor.isPreviewing) {
            this.editor.previewTime = 0;
        }
    }

    _goToEnd() {
        if (this.editor.isPreviewing && this.editor.previewDuration > 0) {
            this.editor.previewTime = this.editor.previewDuration - 0.001;
        }
    }

    _setTransformMode(mode) {
        if (this.editor.transformControls) {
            this.editor.transformControls.setMode(mode);
        }
    }

    _selectAll() {
        if (this.editor.selectionManager) {
            this.editor.selectionManager.selectAll();
        }
    }

    _deselectAll() {
        if (this.editor.selectionManager) {
            this.editor.selectionManager.clearSelection();
        }
    }

    _invertSelection() {
        if (this.editor.selectionManager) {
            this.editor.selectionManager.invertSelection();
        }
    }

    _captureKeyframe() {
        if (this.editor.isPoseMode) {
            this.editor.captureKeyframe();
        }
    }

    _deleteKeyframe() {
        // TODO: Delete selected keyframe
        console.log('[Hotkey] Delete Keyframe');
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

    _focusSelected() {
        // TODO: Focus camera on selected bone/entity
        console.log('[Hotkey] Focus Selected');
    }

    _resetCamera() {
        // TODO: Reset camera to default view
        console.log('[Hotkey] Reset Camera');
    }

    _toggleGraphView() {
        // Phase 2: Toggle state machine graph visibility
        if (this.editor.toolbar) {
            this.editor.toolbar._toggleGraphView();
        }
    }

    _toggleTimelineView() {
        // Phase 3: Toggle timeline visibility
        if (this.editor.timelinePanel) {
            if (this.editor.isTimelineVisible) {
                this.editor.timelinePanel.hide();
                this.editor.isTimelineVisible = false;
            } else {
                this.editor.timelinePanel.show();
                this.editor.isTimelineVisible = true;
                // Load current keyframes
                if (this.editor.isPoseMode) {
                    this.editor.timelinePanel.loadKeyframes(this.editor.capturedPoses, 0);
                }
            }
        }
    }

    _setLoopInPoint() {
        // Phase 3: Set loop in point
        if (this.editor.timelinePanel) {
            const time = this.editor.timelinePanel.playheadTime;
            this.editor.timelinePanel.timelineData.loopIn = time;
            console.log(`[Hotkey] Loop In Point set to ${time.toFixed(2)}s`);
        }
    }

    _setLoopOutPoint() {
        // Phase 3: Set loop out point
        if (this.editor.timelinePanel) {
            const time = this.editor.timelinePanel.playheadTime;
            this.editor.timelinePanel.timelineData.loopOut = time;
            console.log(`[Hotkey] Loop Out Point set to ${time.toFixed(2)}s`);
        }
    }

    _showImportDialog() {
        // Phase 6: Show animation import dialog
        if (this.editor.importDialog) {
            this.editor.importDialog.show();
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this.disable();
        this.hotkeys.clear();
    }
}

export default HotkeyManager;
