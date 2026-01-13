/**
 * DopeSheet.js
 * Phase 3: Professional Timeline & Dope Sheet
 * 
 * Hierarchical bone list with keyframe diamond markers.
 * Provides visual keyframe editing and batch operations.
 */

/**
 * DopeSheet - Keyframe visualization and editing component
 * Works in conjunction with TimelinePanel for full timeline functionality.
 */
export class DopeSheet {
    constructor(timelinePanel) {
        this.timeline = timelinePanel;

        // Selection state
        this.selectedKeyframes = new Map();  // boneIndex -> Set of keyframe indices
        this.isBoxSelecting = false;
        this.boxSelectStart = null;
        this.boxSelectEnd = null;

        // Clipboard
        this.clipboard = [];

        // Hierarchy state
        this.expandedGroups = new Set();
        this.boneHierarchy = [];            // Organized bone structure

        console.log('[DopeSheet] Initialized');
    }

    /**
     * Build bone hierarchy from flat bone list
     * @param {Set<string>} boneNames 
     */
    buildHierarchy(boneNames) {
        this.boneHierarchy = [];
        const nameArray = Array.from(boneNames);

        // Group bones by common prefixes/patterns
        // Common patterns: mixamorig:Hips, mixamorig:Spine, etc.
        const groups = new Map();

        for (const name of nameArray) {
            // Try to extract group from bone name
            let group = 'Root';

            if (name.includes(':')) {
                const parts = name.split(':');
                if (parts.length > 1) {
                    // Use parent bone pattern
                    const bonePart = parts[1];
                    if (bonePart.startsWith('Left')) group = 'Left';
                    else if (bonePart.startsWith('Right')) group = 'Right';
                    else if (bonePart.includes('Spine') || bonePart.includes('Chest')) group = 'Spine';
                    else if (bonePart.includes('Head') || bonePart.includes('Neck')) group = 'Head';
                    else if (bonePart.includes('Arm') || bonePart.includes('Hand') || bonePart.includes('Shoulder')) {
                        group = bonePart.startsWith('Left') ? 'Left Arm' : bonePart.startsWith('Right') ? 'Right Arm' : 'Arms';
                    }
                    else if (bonePart.includes('Leg') || bonePart.includes('Foot') || bonePart.includes('Toe')) {
                        group = bonePart.startsWith('Left') ? 'Left Leg' : bonePart.startsWith('Right') ? 'Right Leg' : 'Legs';
                    }
                    else group = 'Core';
                }
            }

            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group).push(name);
        }

        // Convert to hierarchy array
        for (const [groupName, bones] of groups) {
            this.boneHierarchy.push({
                name: groupName,
                isGroup: true,
                expanded: true,
                children: bones.map(name => ({
                    name: name,
                    isGroup: false
                }))
            });
        }
    }

    /**
     * Get flat list of visible bones (considering collapsed groups)
     * @returns {Array<string>}
     */
    getVisibleBones() {
        const visible = [];

        for (const group of this.boneHierarchy) {
            if (group.expanded) {
                for (const bone of group.children) {
                    visible.push(bone.name);
                }
            }
        }

        // Fallback to flat list if no hierarchy
        if (visible.length === 0 && this.timeline.timelineData) {
            return Array.from(this.timeline.timelineData.getBoneNames());
        }

        return visible;
    }

    /**
     * Toggle group expansion
     * @param {string} groupName 
     */
    toggleGroup(groupName) {
        const group = this.boneHierarchy.find(g => g.name === groupName);
        if (group) {
            group.expanded = !group.expanded;
        }
    }

    /**
     * Select keyframe(s)
     * @param {number} boneIndex 
     * @param {number} keyframeIndex 
     * @param {boolean} additive 
     */
    selectKeyframe(boneIndex, keyframeIndex, additive = false) {
        if (!additive) {
            this.clearSelection();
        }

        if (!this.selectedKeyframes.has(boneIndex)) {
            this.selectedKeyframes.set(boneIndex, new Set());
        }
        this.selectedKeyframes.get(boneIndex).add(keyframeIndex);
    }

    /**
     * Clear all keyframe selections
     */
    clearSelection() {
        this.selectedKeyframes.clear();
        if (this.timeline.timelineData) {
            this.timeline.timelineData.clearSelection();
        }
    }

    /**
     * Get all selected keyframe indices
     * @returns {Array<{boneIndex: number, keyframeIndex: number}>}
     */
    getSelectedKeyframes() {
        const selected = [];
        for (const [boneIndex, keyframes] of this.selectedKeyframes) {
            for (const keyframeIndex of keyframes) {
                selected.push({ boneIndex, keyframeIndex });
            }
        }
        return selected;
    }

    /**
     * Copy selected keyframes to clipboard
     */
    copySelected() {
        this.clipboard = [];

        const timelineData = this.timeline.timelineData;
        if (!timelineData) return;

        const visibleBones = this.getVisibleBones();

        for (const [boneIndex, keyframes] of this.selectedKeyframes) {
            const boneName = visibleBones[boneIndex];
            if (!boneName) continue;

            for (const keyframeIndex of keyframes) {
                const keyframe = timelineData.getKeyframe(keyframeIndex);
                if (keyframe) {
                    const boneData = keyframe.getBone ? keyframe.getBone(boneName) :
                        keyframe.bones.find(b => b.name === boneName);
                    if (boneData) {
                        this.clipboard.push({
                            boneName: boneName,
                            time: keyframe.time,
                            rot: boneData.rot.clone ? boneData.rot.clone() : { ...boneData.rot }
                        });
                    }
                }
            }
        }

        console.log(`[DopeSheet] Copied ${this.clipboard.length} keyframe(s)`);
    }

    /**
     * Paste keyframes from clipboard at playhead position
     */
    pasteAtPlayhead() {
        if (this.clipboard.length === 0) return;

        const pasteTime = this.timeline.playheadTime;
        const timeOffset = pasteTime - this.clipboard[0].time;

        // TODO: Implement paste logic that adds bone data to existing keyframes
        // or creates new keyframes at the adjusted time
        console.log(`[DopeSheet] Paste ${this.clipboard.length} keyframe(s) at ${pasteTime}s (offset: ${timeOffset}s)`);
    }

    /**
     * Delete selected keyframes
     */
    deleteSelected() {
        const timelineData = this.timeline.timelineData;
        if (!timelineData) return;

        // Get unique keyframe indices
        const indices = new Set();
        for (const keyframes of this.selectedKeyframes.values()) {
            for (const index of keyframes) {
                indices.add(index);
            }
        }

        // Delete in reverse order
        const sortedIndices = Array.from(indices).sort((a, b) => b - a);
        for (const index of sortedIndices) {
            timelineData.removeKeyframe(index);
        }

        this.clearSelection();
        console.log(`[DopeSheet] Deleted ${sortedIndices.length} keyframe(s)`);
    }

    /**
     * Duplicate selected keyframes at an offset
     * @param {number} timeOffset 
     */
    duplicateSelected(timeOffset = 0.1) {
        // First copy
        this.copySelected();

        // Then paste with offset
        if (this.clipboard.length > 0) {
            const baseTime = this.clipboard[0].time;
            this.timeline.playheadTime = baseTime + timeOffset;
            this.pasteAtPlayhead();
        }
    }

    /**
     * Handle context menu actions
     * @param {number} x 
     * @param {number} y 
     */
    showContextMenu(x, y) {
        // Remove existing menu
        const existing = document.getElementById('dopesheet-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'dopesheet-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: var(--anim-bg, #1a1a1f);
            border: 1px solid var(--anim-border, #444);
            border-radius: 4px;
            padding: 4px 0;
            min-width: 150px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `;

        const items = [
            { label: 'Copy', shortcut: 'Ctrl+C', action: () => this.copySelected() },
            { label: 'Paste', shortcut: 'Ctrl+V', action: () => this.pasteAtPlayhead() },
            { label: 'Delete', shortcut: 'Del', action: () => this.deleteSelected() },
            { type: 'separator' },
            { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => this.duplicateSelected() },
            { type: 'separator' },
            { label: 'Select All', shortcut: 'Ctrl+A', action: () => this.selectAll() },
        ];

        for (const item of items) {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background: var(--anim-border, #444); margin: 4px 0;';
                menu.appendChild(sep);
            } else {
                const menuItem = document.createElement('div');
                menuItem.style.cssText = `
                    padding: 6px 12px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: var(--anim-text, #eee);
                `;
                menuItem.innerHTML = `
                    <span>${item.label}</span>
                    <span style="color: var(--anim-text-muted, #666); font-size: 11px;">${item.shortcut}</span>
                `;
                menuItem.onmouseenter = () => menuItem.style.background = 'var(--anim-surface-hover, #333)';
                menuItem.onmouseleave = () => menuItem.style.background = '';
                menuItem.onclick = () => {
                    item.action();
                    menu.remove();
                };
                menu.appendChild(menuItem);
            }
        }

        document.body.appendChild(menu);

        // Close on click outside
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
    }

    /**
     * Select all keyframes
     */
    selectAll() {
        const timelineData = this.timeline.timelineData;
        if (!timelineData) return;

        const visibleBones = this.getVisibleBones();

        for (let ki = 0; ki < timelineData.keyframes.length; ki++) {
            for (let bi = 0; bi < visibleBones.length; bi++) {
                this.selectKeyframe(bi, ki, true);
            }
            timelineData.selectKeyframe(ki, true);
        }
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} e 
     * @returns {boolean} - True if handled
     */
    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'c':
                    this.copySelected();
                    return true;
                case 'v':
                    this.pasteAtPlayhead();
                    return true;
                case 'd':
                    this.duplicateSelected();
                    return true;
                case 'a':
                    this.selectAll();
                    return true;
            }
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            this.deleteSelected();
            return true;
        }

        return false;
    }
}

export default DopeSheet;
