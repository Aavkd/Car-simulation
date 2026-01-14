/**
 * Retargeter.js
 * Animation Import System - Phase 2.2
 * 
 * Core retargeting logic for transferring animations between skeletons.
 * Handles T-pose calibration, pose transfer, and root motion scaling.
 */

import * as THREE from 'three';

/**
 * Retargeter - Transfers animation from source to target skeleton
 */
export class Retargeter {
    /**
     * @param {THREE.Skeleton} sourceSkeleton - The imported skeleton
     * @param {THREE.Skeleton} targetSkeleton - The project character skeleton
     * @param {Object} boneMapping - { humanoidBone: sourceBoneName }
     */
    constructor(sourceSkeleton, targetSkeleton, boneMapping) {
        this.sourceSkeleton = sourceSkeleton;
        this.targetSkeleton = targetSkeleton;
        this.boneMapping = boneMapping;

        // Build reverse mapping: sourceBoneName -> humanoidBone
        this.reverseMapping = {};
        for (const [humanoid, source] of Object.entries(boneMapping)) {
            this.reverseMapping[source] = humanoid;
        }

        // Build target mapping: humanoidBone -> targetBoneName
        // This requires auto-mapping the target skeleton too
        this.targetMapping = {};

        // Store T-pose rest rotations
        this.sourceRestPose = new Map();  // sourceBoneName -> Quaternion
        this.targetRestPose = new Map();  // targetBoneName -> Quaternion

        // Calculated offsets
        this.offsets = new Map();  // humanoidBone -> Quaternion

        // Scale factor for root motion
        this.scaleFactor = 1.0;

        // Options
        this.removeRootMotion = false;
        this.preserveRootRotation = true;
    }

    /**
     * Set the target bone mapping
     * @param {Object} mapping - { humanoidBone: targetBoneName }
     */
    setTargetMapping(mapping) {
        this.targetMapping = mapping;
    }

    /**
     * Calibrate T-pose differences between skeletons
     * Must be called before retargeting
     */
    calibrate() {
        console.log('[Retargeter] Calibrating T-pose differences...');

        // Capture rest poses
        this._captureRestPose(this.sourceSkeleton, this.sourceRestPose);
        this._captureRestPose(this.targetSkeleton, this.targetRestPose);

        // Calculate rotational offsets for each mapped bone
        for (const [humanoidBone, sourceBoneName] of Object.entries(this.boneMapping)) {
            const targetBoneName = this.targetMapping[humanoidBone];
            if (!targetBoneName) continue;

            const sourceRest = this.sourceRestPose.get(sourceBoneName);
            const targetRest = this.targetRestPose.get(targetBoneName);

            if (sourceRest && targetRest) {
                // offset = inverse(sourceRest) * targetRest
                // When applied: finalRot = animRot * offset
                const offset = sourceRest.clone().invert().multiply(targetRest);
                this.offsets.set(humanoidBone, offset);
            }
        }

        // Calculate scale factor from hip height
        this._calculateScaleFactor();

        console.log(`[Retargeter] Calibration complete. ${this.offsets.size} bones calibrated, scale: ${this.scaleFactor.toFixed(3)}`);
    }

    /**
     * Retarget an animation clip
     * @param {THREE.AnimationClip} sourceClip - The animation to retarget
     * @param {string} newName - Name for the retargeted clip
     * @returns {THREE.AnimationClip} Retargeted clip for target skeleton
     */
    retargetClip(sourceClip, newName = null) {
        const clipName = newName || `retargeted_${sourceClip.name}`;
        const newTracks = [];

        // Process each track in the source clip
        for (const track of sourceClip.tracks) {
            const retargetedTrack = this._retargetTrack(track);
            if (retargetedTrack) {
                newTracks.push(retargetedTrack);
            }
        }

        // Create new clip
        const retargetedClip = new THREE.AnimationClip(
            clipName,
            sourceClip.duration,
            newTracks
        );

        console.log(`[Retargeter] Retargeted "${sourceClip.name}" -> "${clipName}" with ${newTracks.length} tracks`);

        return retargetedClip;
    }

    /**
     * Retarget multiple clips
     * @param {THREE.AnimationClip[]} clips - Clips to retarget
     * @param {string} prefix - Prefix for new clip names
     * @returns {THREE.AnimationClip[]}
     */
    retargetClips(clips, prefix = '') {
        return clips.map(clip => {
            const newName = prefix ? `${prefix}${clip.name}` : null;
            return this.retargetClip(clip, newName);
        });
    }

    /**
     * Retarget a single track
     * @private
     */
    _retargetTrack(track) {
        // Parse track name: "boneName.property" or "boneName.property[index]"
        const parsed = this._parseTrackName(track.name);
        if (!parsed) return null;

        const { boneName, property, propertyIndex } = parsed;

        // Get humanoid bone for this source bone
        const humanoidBone = this.reverseMapping[boneName];
        if (!humanoidBone) {
            // Not a mapped bone, skip
            return null;
        }

        // Get target bone name
        const targetBoneName = this.targetMapping[humanoidBone];
        if (!targetBoneName) {
            return null;
        }

        // Handle different property types
        if (property === 'quaternion') {
            return this._retargetRotationTrack(track, targetBoneName, humanoidBone);
        } else if (property === 'position') {
            // Only retarget root position (Hips)
            if (humanoidBone === 'Hips') {
                return this._retargetPositionTrack(track, targetBoneName);
            }
            return null;
        } else if (property === 'scale') {
            // Usually don't retarget scale, but copy it
            return this._copyTrack(track, targetBoneName);
        }

        return null;
    }

    /**
     * Retarget a rotation track
     * @private
     */
    _retargetRotationTrack(track, targetBoneName, humanoidBone) {
        const offset = this.offsets.get(humanoidBone);
        if (!offset) {
            // No calibration, just copy
            return this._copyTrack(track, targetBoneName);
        }

        // Clone values and apply offset
        const values = new Float32Array(track.values.length);
        const tempQuat = new THREE.Quaternion();

        for (let i = 0; i < track.values.length; i += 4) {
            // Read source quaternion
            tempQuat.set(
                track.values[i],
                track.values[i + 1],
                track.values[i + 2],
                track.values[i + 3]
            );

            // Apply offset: finalRot = sourceRot * offset
            tempQuat.multiply(offset);

            // Store result
            values[i] = tempQuat.x;
            values[i + 1] = tempQuat.y;
            values[i + 2] = tempQuat.z;
            values[i + 3] = tempQuat.w;
        }

        return new THREE.QuaternionKeyframeTrack(
            `${targetBoneName}.quaternion`,
            track.times.slice(),
            values
        );
    }

    /**
     * Retarget a position track (root motion)
     * @private
     */
    _retargetPositionTrack(track, targetBoneName) {
        if (this.removeRootMotion) {
            // Return static position at origin
            return new THREE.VectorKeyframeTrack(
                `${targetBoneName}.position`,
                [0],
                [0, 0, 0]
            );
        }

        // Scale the position values
        const values = new Float32Array(track.values.length);

        for (let i = 0; i < track.values.length; i += 3) {
            values[i] = track.values[i] * this.scaleFactor;
            values[i + 1] = track.values[i + 1] * this.scaleFactor;
            values[i + 2] = track.values[i + 2] * this.scaleFactor;
        }

        return new THREE.VectorKeyframeTrack(
            `${targetBoneName}.position`,
            track.times.slice(),
            values
        );
    }

    /**
     * Copy a track with renamed bone
     * @private
     */
    _copyTrack(track, targetBoneName) {
        const parsed = this._parseTrackName(track.name);
        if (!parsed) return null;

        const newName = `${targetBoneName}.${parsed.property}`;

        // Clone the track
        if (track instanceof THREE.QuaternionKeyframeTrack) {
            return new THREE.QuaternionKeyframeTrack(
                newName,
                track.times.slice(),
                track.values.slice()
            );
        } else if (track instanceof THREE.VectorKeyframeTrack) {
            return new THREE.VectorKeyframeTrack(
                newName,
                track.times.slice(),
                track.values.slice()
            );
        } else {
            return new THREE.KeyframeTrack(
                newName,
                track.times.slice(),
                track.values.slice()
            );
        }
    }

    /**
     * Parse a track name into components
     * @private
     */
    _parseTrackName(name) {
        // Format: "boneName.property" or "boneName.property[0]"
        const match = name.match(/^(.+)\.(\w+)(?:\[(\d+)\])?$/);
        if (!match) return null;

        return {
            boneName: match[1],
            property: match[2],
            propertyIndex: match[3] !== undefined ? parseInt(match[3]) : null
        };
    }

    /**
     * Capture rest pose rotations from a skeleton
     * @private
     */
    _captureRestPose(skeleton, storage) {
        for (const bone of skeleton.bones) {
            storage.set(bone.name, bone.quaternion.clone());
        }
    }

    /**
     * Calculate scale factor based on hip height
     * @private
     */
    _calculateScaleFactor() {
        // Get hip bones
        const sourceHipName = this.boneMapping['Hips'];
        const targetHipName = this.targetMapping['Hips'];

        if (!sourceHipName || !targetHipName) {
            this.scaleFactor = 1.0;
            return;
        }

        // Find hip bones
        const sourceHip = this.sourceSkeleton.bones.find(b => b.name === sourceHipName);
        const targetHip = this.targetSkeleton.bones.find(b => b.name === targetHipName);

        if (!sourceHip || !targetHip) {
            this.scaleFactor = 1.0;
            return;
        }

        // Get world positions (Y is typically height)
        const sourcePos = new THREE.Vector3();
        const targetPos = new THREE.Vector3();

        sourceHip.getWorldPosition(sourcePos);
        targetHip.getWorldPosition(targetPos);

        const sourceHeight = sourcePos.y;
        const targetHeight = targetPos.y;

        if (sourceHeight > 0.001) {
            this.scaleFactor = targetHeight / sourceHeight;
        } else {
            this.scaleFactor = 1.0;
        }

        // Clamp to reasonable range
        this.scaleFactor = Math.max(0.1, Math.min(10, this.scaleFactor));
    }

    /**
     * Get a bone by name from a skeleton
     * @param {THREE.Skeleton} skeleton
     * @param {string} name
     * @returns {THREE.Bone|null}
     */
    static getBoneByName(skeleton, name) {
        return skeleton.bones.find(b => b.name === name) || null;
    }
}

export default Retargeter;
