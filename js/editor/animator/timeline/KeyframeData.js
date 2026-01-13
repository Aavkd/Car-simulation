/**
 * KeyframeData.js
 * Phase 3: Professional Timeline & Dope Sheet
 * 
 * Enhanced keyframe data structure with interpolation support.
 */

/**
 * Interpolation types for keyframe tangents
 */
export const InterpolationType = {
    SMOOTH: 'smooth',       // Auto-calculated bezier tangents
    LINEAR: 'linear',       // Straight line between keyframes
    STEPPED: 'stepped',     // Hold value until next keyframe
    BEZIER: 'bezier',       // Custom bezier tangents
    BOUNCE: 'bounce',       // Bouncing effect
    ELASTIC: 'elastic'      // Elastic effect
};

/**
 * Represents a single keyframe for a bone
 */
export class BoneKeyframe {
    constructor(boneName, rotation, time = 0) {
        this.name = boneName;
        this.rot = rotation.clone();
        this.time = time;

        // Interpolation settings
        this.tangentIn = { type: InterpolationType.SMOOTH };
        this.tangentOut = { type: InterpolationType.SMOOTH };

        // Selection state (for UI)
        this.selected = false;
    }

    /**
     * Copy from another BoneKeyframe
     * @param {BoneKeyframe} other 
     */
    copy(other) {
        this.name = other.name;
        this.rot.copy(other.rot);
        this.time = other.time;
        this.tangentIn = { ...other.tangentIn };
        this.tangentOut = { ...other.tangentOut };
        return this;
    }

    /**
     * Clone this keyframe
     * @returns {BoneKeyframe}
     */
    clone() {
        const clone = new BoneKeyframe(this.name, this.rot, this.time);
        clone.tangentIn = { ...this.tangentIn };
        clone.tangentOut = { ...this.tangentOut };
        return clone;
    }
}

/**
 * Represents a complete pose at a point in time
 */
export class PoseKeyframe {
    constructor(time = 0) {
        this.id = Date.now();
        this.time = time;
        this.bones = [];    // Array of { name, rot } (backwards compatible)
        this.selected = false;
    }

    /**
     * Add a bone's rotation to this pose
     * @param {string} boneName 
     * @param {THREE.Quaternion} rotation 
     */
    addBone(boneName, rotation) {
        this.bones.push({
            name: boneName,
            rot: rotation.clone(),
            tangentIn: { type: InterpolationType.SMOOTH },
            tangentOut: { type: InterpolationType.SMOOTH }
        });
    }

    /**
     * Get bone data by name
     * @param {string} boneName 
     * @returns {Object|null}
     */
    getBone(boneName) {
        return this.bones.find(b => b.name === boneName) || null;
    }

    /**
     * Create from legacy pose format
     * @param {Object} legacyPose - { id, bones: [{ name, rot }] }
     * @param {number} time 
     * @returns {PoseKeyframe}
     */
    static fromLegacy(legacyPose, time = 0) {
        const pose = new PoseKeyframe(time);
        pose.id = legacyPose.id;
        pose.bones = legacyPose.bones.map(b => ({
            name: b.name,
            rot: b.rot.clone ? b.rot.clone() : b.rot,
            tangentIn: b.tangentIn || { type: InterpolationType.SMOOTH },
            tangentOut: b.tangentOut || { type: InterpolationType.SMOOTH }
        }));
        return pose;
    }
}

/**
 * Timeline data manager
 * Handles keyframe storage, selection, and operations
 */
export class TimelineData {
    constructor() {
        this.keyframes = [];            // Array of PoseKeyframe
        this.selectedKeyframes = [];    // Array of indices
        this.fps = 30;
        this.duration = 0;              // Auto-calculated from keyframes

        // Loop region
        this.loopEnabled = false;
        this.loopIn = 0;
        this.loopOut = 1;

        // Playback
        this.playbackSpeed = 1.0;
    }

    /**
     * Load from legacy capturedPoses array
     * @param {Array} capturedPoses 
     * @param {number} durationPerPose - Seconds between poses
     */
    loadFromLegacy(capturedPoses, durationPerPose = 1.0) {
        this.keyframes = [];
        capturedPoses.forEach((pose, index) => {
            const poseKeyframe = PoseKeyframe.fromLegacy(pose, index * durationPerPose);
            this.keyframes.push(poseKeyframe);
        });
        this._updateDuration();
        console.log(`[TimelineData] Loaded ${this.keyframes.length} keyframes`);
    }

    /**
     * Add a keyframe at specified time
     * @param {PoseKeyframe} poseKeyframe 
     */
    addKeyframe(poseKeyframe) {
        // Insert in sorted order by time
        const insertIndex = this.keyframes.findIndex(k => k.time > poseKeyframe.time);
        if (insertIndex === -1) {
            this.keyframes.push(poseKeyframe);
        } else {
            this.keyframes.splice(insertIndex, 0, poseKeyframe);
        }
        this._updateDuration();
    }

    /**
     * Remove keyframe at index
     * @param {number} index 
     */
    removeKeyframe(index) {
        if (index >= 0 && index < this.keyframes.length) {
            this.keyframes.splice(index, 1);
            this._updateDuration();
        }
    }

    /**
     * Get keyframe at index
     * @param {number} index 
     * @returns {PoseKeyframe|null}
     */
    getKeyframe(index) {
        return this.keyframes[index] || null;
    }

    /**
     * Get keyframes within a time range
     * @param {number} startTime 
     * @param {number} endTime 
     * @returns {Array}
     */
    getKeyframesInRange(startTime, endTime) {
        return this.keyframes.filter(k => k.time >= startTime && k.time <= endTime);
    }

    /**
     * Select keyframe at index
     * @param {number} index 
     * @param {boolean} addToSelection - Whether to add or replace selection
     */
    selectKeyframe(index, addToSelection = false) {
        if (!addToSelection) {
            this.clearSelection();
        }
        if (index >= 0 && index < this.keyframes.length) {
            this.keyframes[index].selected = true;
            if (!this.selectedKeyframes.includes(index)) {
                this.selectedKeyframes.push(index);
            }
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        this.keyframes.forEach(k => k.selected = false);
        this.selectedKeyframes = [];
    }

    /**
     * Delete selected keyframes
     * @returns {Array} Removed keyframes
     */
    deleteSelected() {
        const removed = [];
        // Sort in reverse order to delete from end first
        const sortedIndices = [...this.selectedKeyframes].sort((a, b) => b - a);
        for (const index of sortedIndices) {
            if (index >= 0 && index < this.keyframes.length) {
                removed.push(this.keyframes.splice(index, 1)[0]);
            }
        }
        this.selectedKeyframes = [];
        this._updateDuration();
        return removed;
    }

    /**
     * Move selected keyframes by time offset
     * @param {number} timeOffset 
     */
    moveSelectedKeyframes(timeOffset) {
        for (const index of this.selectedKeyframes) {
            const keyframe = this.keyframes[index];
            if (keyframe) {
                keyframe.time = Math.max(0, keyframe.time + timeOffset);
            }
        }
        // Re-sort keyframes
        this.keyframes.sort((a, b) => a.time - b.time);
        this._updateDuration();
    }

    /**
     * Get total keyframe count
     * @returns {number}
     */
    get count() {
        return this.keyframes.length;
    }

    /**
     * Update duration based on keyframes
     * @private
     */
    _updateDuration() {
        if (this.keyframes.length === 0) {
            this.duration = 0;
        } else {
            this.duration = Math.max(...this.keyframes.map(k => k.time)) + 1;
        }
    }

    /**
     * Export to legacy format (for compatibility with existing export)
     * @returns {Array}
     */
    toLegacy() {
        return this.keyframes.map(k => ({
            id: k.id,
            bones: k.bones
        }));
    }

    /**
     * Get bones that have keyframes (for dope sheet display)
     * @returns {Set<string>}
     */
    getBoneNames() {
        const names = new Set();
        for (const keyframe of this.keyframes) {
            for (const bone of keyframe.bones) {
                names.add(bone.name);
            }
        }
        return names;
    }
}

export default TimelineData;
