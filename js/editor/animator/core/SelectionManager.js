/**
 * SelectionManager.js
 * Phase 1: Editor Foundation
 * 
 * Handles multi-bone selection, hierarchy selection, and selection groups.
 */

import * as THREE from 'three';

/**
 * SelectionManager - Manages bone and object selection
 */
export class SelectionManager {
    constructor(animatorEditor) {
        this.editor = animatorEditor;

        // Selection state
        this.selectedBones = new Set();
        this.primaryBone = null; // The "active" bone for transform controls

        // Selection groups (named sets of bones for quick access)
        this.selectionGroups = new Map();

        // Visual state
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.7,
            depthTest: false
        });

        this.selectionMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            depthTest: false
        });

        // Event callbacks
        this.onSelectionChange = null;

        console.log('[SelectionManager] Initialized');
    }

    /**
     * Select a single bone (clear previous selection)
     * @param {THREE.Bone} bone 
     */
    selectBone(bone) {
        this.clearSelection();
        this._addBoneToSelection(bone);
        this.primaryBone = bone;
        this._notifyChange();
    }

    /**
     * Add bone to current selection (multi-select)
     * @param {THREE.Bone} bone 
     */
    addToSelection(bone) {
        if (!this.selectedBones.has(bone)) {
            this._addBoneToSelection(bone);
            // First selected becomes primary, or last added
            if (!this.primaryBone) {
                this.primaryBone = bone;
            }
            this._notifyChange();
        }
    }

    /**
     * Toggle bone selection state
     * @param {THREE.Bone} bone 
     */
    toggleSelection(bone) {
        if (this.selectedBones.has(bone)) {
            this.removeFromSelection(bone);
        } else {
            this.addToSelection(bone);
        }
    }

    /**
     * Remove bone from selection
     * @param {THREE.Bone} bone 
     */
    removeFromSelection(bone) {
        if (this.selectedBones.has(bone)) {
            this.selectedBones.delete(bone);
            this._updateBoneVisual(bone, false);

            // Update primary bone if it was removed
            if (this.primaryBone === bone) {
                this.primaryBone = this.selectedBones.size > 0
                    ? Array.from(this.selectedBones)[0]
                    : null;
            }
            this._notifyChange();
        }
    }

    /**
     * Select bone and all its children (hierarchy selection)
     * @param {THREE.Bone} bone 
     * @param {boolean} addToExisting - Whether to add to existing selection
     */
    selectHierarchy(bone, addToExisting = false) {
        if (!addToExisting) {
            this.clearSelection();
        }

        this._selectBoneAndChildren(bone);
        this.primaryBone = bone;
        this._notifyChange();
    }

    /**
     * Select all bones in the current entity
     */
    selectAll() {
        if (!this.editor.selectedEntity || !this.editor.selectedEntity.mesh) return;

        const bones = this._getAllBones();
        this.clearSelection();

        bones.forEach(bone => {
            this._addBoneToSelection(bone);
        });

        if (bones.length > 0) {
            this.primaryBone = bones[0];
        }

        this._notifyChange();
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedBones.forEach(bone => {
            this._updateBoneVisual(bone, false);
        });
        this.selectedBones.clear();
        this.primaryBone = null;
        this._notifyChange();
    }

    /**
     * Invert current selection
     */
    invertSelection() {
        const allBones = this._getAllBones();
        const previouslySelected = new Set(this.selectedBones);

        this.clearSelection();

        allBones.forEach(bone => {
            if (!previouslySelected.has(bone)) {
                this._addBoneToSelection(bone);
            }
        });

        if (this.selectedBones.size > 0) {
            this.primaryBone = Array.from(this.selectedBones)[0];
        }

        this._notifyChange();
    }

    /**
     * Save current selection as a named group
     * @param {string} name 
     */
    saveSelectionGroup(name) {
        if (this.selectedBones.size === 0) {
            console.warn('[SelectionManager] No bones selected to save as group');
            return false;
        }

        const boneNames = Array.from(this.selectedBones).map(b => b.name);
        this.selectionGroups.set(name, boneNames);
        console.log(`[SelectionManager] Saved selection group "${name}" with ${boneNames.length} bones`);
        return true;
    }

    /**
     * Load a saved selection group
     * @param {string} name 
     * @param {boolean} addToExisting 
     */
    loadSelectionGroup(name, addToExisting = false) {
        const boneNames = this.selectionGroups.get(name);
        if (!boneNames) {
            console.warn(`[SelectionManager] Selection group "${name}" not found`);
            return false;
        }

        if (!addToExisting) {
            this.clearSelection();
        }

        const allBones = this._getAllBones();
        const boneMap = new Map(allBones.map(b => [b.name, b]));

        boneNames.forEach(boneName => {
            const bone = boneMap.get(boneName);
            if (bone) {
                this._addBoneToSelection(bone);
            }
        });

        if (this.selectedBones.size > 0) {
            this.primaryBone = Array.from(this.selectedBones)[0];
        }

        this._notifyChange();
        return true;
    }

    /**
     * Delete a saved selection group
     * @param {string} name 
     */
    deleteSelectionGroup(name) {
        return this.selectionGroups.delete(name);
    }

    /**
     * Get list of all saved selection groups
     * @returns {string[]}
     */
    getSelectionGroupNames() {
        return Array.from(this.selectionGroups.keys());
    }

    /**
     * Check if a bone is selected
     * @param {THREE.Bone} bone 
     * @returns {boolean}
     */
    isSelected(bone) {
        return this.selectedBones.has(bone);
    }

    /**
     * Get array of selected bones
     * @returns {THREE.Bone[]}
     */
    getSelectedBones() {
        return Array.from(this.selectedBones);
    }

    /**
     * Get selection count
     * @returns {number}
     */
    getSelectionCount() {
        return this.selectedBones.size;
    }

    /**
     * Box select bones within screen-space rectangle
     * @param {Object} rect - {x1, y1, x2, y2} in normalized device coordinates
     * @param {THREE.Camera} camera 
     * @param {boolean} addToExisting 
     */
    boxSelect(rect, camera, addToExisting = false) {
        if (!addToExisting) {
            this.clearSelection();
        }

        const allBones = this._getAllBones();
        const tempVec = new THREE.Vector3();

        allBones.forEach(bone => {
            bone.getWorldPosition(tempVec);
            tempVec.project(camera);

            // Check if bone is within selection rectangle
            if (tempVec.x >= rect.x1 && tempVec.x <= rect.x2 &&
                tempVec.y >= rect.y1 && tempVec.y <= rect.y2 &&
                tempVec.z >= -1 && tempVec.z <= 1) {
                this._addBoneToSelection(bone);
            }
        });

        if (this.selectedBones.size > 0 && !this.primaryBone) {
            this.primaryBone = Array.from(this.selectedBones)[0];
        }

        this._notifyChange();
    }

    /**
     * Get state for serialization/UI
     * @returns {Object}
     */
    getState() {
        return {
            count: this.selectedBones.size,
            primaryBoneName: this.primaryBone ? this.primaryBone.name : null,
            selectedBoneNames: Array.from(this.selectedBones).map(b => b.name),
            groups: Array.from(this.selectionGroups.keys())
        };
    }

    // ==================== Private Methods ====================

    /**
     * Internal method to add bone to selection set
     * @private
     */
    _addBoneToSelection(bone) {
        this.selectedBones.add(bone);
        this._updateBoneVisual(bone, true);
    }

    /**
     * Recursively select bone and its children
     * @private
     */
    _selectBoneAndChildren(bone) {
        this._addBoneToSelection(bone);

        bone.children.forEach(child => {
            if (child.isBone) {
                this._selectBoneAndChildren(child);
            }
        });
    }

    /**
     * Get all bones from current entity
     * @private
     * @returns {THREE.Bone[]}
     */
    _getAllBones() {
        const bones = [];
        if (!this.editor.selectedEntity || !this.editor.selectedEntity.mesh) return bones;

        const mesh = this.editor.selectedEntity.mesh;

        // Try skeleton first
        if (mesh.skeleton && mesh.skeleton.bones) {
            return mesh.skeleton.bones;
        }

        // Fallback to traversal
        mesh.traverse(child => {
            if (child.isBone) bones.push(child);
        });

        return bones;
    }

    /**
     * Update visual appearance of bone helper
     * @private
     */
    _updateBoneVisual(bone, isSelected) {
        if (!this.editor.boneHelpers) return;

        // Find the helper for this bone
        const helper = this.editor.boneHelpers.find(h => h.userData.bone === bone);
        if (helper) {
            if (isSelected) {
                if (bone === this.primaryBone) {
                    helper.material.color.setHex(0xffff00); // Yellow for primary
                } else {
                    helper.material.color.setHex(0x00ffff); // Cyan for secondary
                }
                helper.material.opacity = 0.7;
            } else {
                helper.material.color.setHex(0x00ff00); // Green default
                helper.material.opacity = 0.5;
            }
        }
    }

    /**
     * Notify listeners of selection change
     * @private
     */
    _notifyChange() {
        if (this.onSelectionChange) {
            this.onSelectionChange(this.getState());
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        this.highlightMaterial.dispose();
        this.selectionMaterial.dispose();
        this.selectedBones.clear();
        this.selectionGroups.clear();
    }
}

export default SelectionManager;
