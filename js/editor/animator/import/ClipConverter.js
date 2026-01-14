/**
 * ClipConverter.js
 * Animation Import System - Phase 4.1
 * 
 * Converts THREE.AnimationClip to the editor's native keyframe format
 * and vice versa.
 */

import * as THREE from 'three';

/**
 * ClipConverter - Convert between AnimationClip and native keyframe format
 */
export class ClipConverter {
    /**
     * Convert a THREE.AnimationClip to the editor's native keyframe format
     * @param {THREE.AnimationClip} clip - The clip to convert
     * @param {Object} options - Conversion options
     * @param {number} options.fps - Frames per second for sampling (default: 30)
     * @param {boolean} options.optimize - Remove redundant keyframes (default: true)
     * @returns {Object} Native keyframe data
     */
    static toNativeFormat(clip, options = {}) {
        const fps = options.fps || 30;
        const optimize = options.optimize !== false;

        const duration = clip.duration;
        const frameCount = Math.ceil(duration * fps) + 1;
        const keyframes = [];

        // Sample the clip at regular intervals
        for (let frame = 0; frame < frameCount; frame++) {
            const time = frame / fps;
            const actualTime = Math.min(time, duration);

            const pose = {};

            // Sample each track at this time
            for (const track of clip.tracks) {
                const parsed = this._parseTrackName(track.name);
                if (!parsed) continue;

                const { boneName, property } = parsed;

                if (!pose[boneName]) {
                    pose[boneName] = {};
                }

                // Get interpolated value at this time
                const value = this._sampleTrack(track, actualTime);

                if (property === 'quaternion') {
                    pose[boneName].rotation = {
                        x: value[0],
                        y: value[1],
                        z: value[2],
                        w: value[3]
                    };
                } else if (property === 'position') {
                    pose[boneName].position = {
                        x: value[0],
                        y: value[1],
                        z: value[2]
                    };
                } else if (property === 'scale') {
                    pose[boneName].scale = {
                        x: value[0],
                        y: value[1],
                        z: value[2]
                    };
                }
            }

            keyframes.push({
                frame,
                time: actualTime,
                pose
            });
        }

        // Optimize if requested
        const finalKeyframes = optimize ? this._optimizeKeyframes(keyframes) : keyframes;

        return {
            name: clip.name,
            duration,
            fps,
            frameCount: finalKeyframes.length,
            keyframes: finalKeyframes,
            metadata: {
                originalTrackCount: clip.tracks.length,
                convertedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Convert native keyframe format back to THREE.AnimationClip
     * @param {Object} nativeData - Native keyframe data
     * @returns {THREE.AnimationClip}
     */
    static fromNativeFormat(nativeData) {
        const tracks = [];
        const boneData = new Map(); // boneName -> { times, rotations, positions, scales }

        // Collect data for each bone across all keyframes
        for (const keyframe of nativeData.keyframes) {
            for (const [boneName, boneValues] of Object.entries(keyframe.pose)) {
                if (!boneData.has(boneName)) {
                    boneData.set(boneName, {
                        times: [],
                        rotations: [],
                        positions: [],
                        scales: []
                    });
                }

                const data = boneData.get(boneName);
                const time = keyframe.time;

                // Check if this time already exists (avoid duplicates)
                const lastTime = data.times[data.times.length - 1];
                if (lastTime !== undefined && Math.abs(lastTime - time) < 0.0001) {
                    continue;
                }

                data.times.push(time);

                if (boneValues.rotation) {
                    const r = boneValues.rotation;
                    data.rotations.push(r.x, r.y, r.z, r.w);
                }

                if (boneValues.position) {
                    const p = boneValues.position;
                    data.positions.push(p.x, p.y, p.z);
                }

                if (boneValues.scale) {
                    const s = boneValues.scale;
                    data.scales.push(s.x, s.y, s.z);
                }
            }
        }

        // Create tracks for each bone
        for (const [boneName, data] of boneData) {
            if (data.rotations.length > 0) {
                tracks.push(new THREE.QuaternionKeyframeTrack(
                    `${boneName}.quaternion`,
                    data.times.slice(0, data.rotations.length / 4),
                    data.rotations
                ));
            }

            if (data.positions.length > 0) {
                tracks.push(new THREE.VectorKeyframeTrack(
                    `${boneName}.position`,
                    data.times.slice(0, data.positions.length / 3),
                    data.positions
                ));
            }

            if (data.scales.length > 0) {
                tracks.push(new THREE.VectorKeyframeTrack(
                    `${boneName}.scale`,
                    data.times.slice(0, data.scales.length / 3),
                    data.scales
                ));
            }
        }

        return new THREE.AnimationClip(
            nativeData.name,
            nativeData.duration,
            tracks
        );
    }

    /**
     * Export native format to JSON string
     * @param {Object} nativeData
     * @returns {string}
     */
    static toJSON(nativeData) {
        return JSON.stringify(nativeData, null, 2);
    }

    /**
     * Parse JSON string to native format
     * @param {string} json
     * @returns {Object}
     */
    static fromJSON(json) {
        return JSON.parse(json);
    }

    /**
     * Save to .anim.json file (creates a download)
     * @param {Object} nativeData
     * @param {string} fileName
     */
    static downloadAsFile(nativeData, fileName = null) {
        const name = fileName || `${nativeData.name}.anim.json`;
        const json = this.toJSON(nativeData);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Sample a track at a specific time
     * @private
     */
    static _sampleTrack(track, time) {
        const times = track.times;
        const values = track.values;
        const valueSize = track.getValueSize();

        // Find the two keyframes to interpolate between
        let idx = 0;
        while (idx < times.length - 1 && times[idx + 1] <= time) {
            idx++;
        }

        // If at or past the last keyframe, return last value
        if (idx >= times.length - 1) {
            const start = (times.length - 1) * valueSize;
            return Array.from(values.slice(start, start + valueSize));
        }

        // If before first keyframe, return first value
        if (time <= times[0]) {
            return Array.from(values.slice(0, valueSize));
        }

        // Interpolate
        const t0 = times[idx];
        const t1 = times[idx + 1];
        const alpha = (time - t0) / (t1 - t0);

        const start0 = idx * valueSize;
        const start1 = (idx + 1) * valueSize;

        const result = new Array(valueSize);

        // Different interpolation for quaternions
        if (valueSize === 4 && track instanceof THREE.QuaternionKeyframeTrack) {
            const q0 = new THREE.Quaternion(
                values[start0], values[start0 + 1],
                values[start0 + 2], values[start0 + 3]
            );
            const q1 = new THREE.Quaternion(
                values[start1], values[start1 + 1],
                values[start1 + 2], values[start1 + 3]
            );
            q0.slerp(q1, alpha);
            result[0] = q0.x;
            result[1] = q0.y;
            result[2] = q0.z;
            result[3] = q0.w;
        } else {
            // Linear interpolation for positions/scales
            for (let i = 0; i < valueSize; i++) {
                result[i] = values[start0 + i] * (1 - alpha) + values[start1 + i] * alpha;
            }
        }

        return result;
    }

    /**
     * Parse track name
     * @private
     */
    static _parseTrackName(name) {
        const match = name.match(/^(.+)\.(\w+)(?:\[(\d+)\])?$/);
        if (!match) return null;

        return {
            boneName: match[1],
            property: match[2],
            propertyIndex: match[3] !== undefined ? parseInt(match[3]) : null
        };
    }

    /**
     * Optimize keyframes by removing redundant ones
     * @private
     */
    static _optimizeKeyframes(keyframes) {
        if (keyframes.length <= 2) return keyframes;

        // Always keep first and last
        const result = [keyframes[0]];
        const threshold = 0.0001; // Rotation difference threshold

        for (let i = 1; i < keyframes.length - 1; i++) {
            const prev = keyframes[i - 1];
            const curr = keyframes[i];
            const next = keyframes[i + 1];

            // Check if current is significantly different from interpolation
            let isDifferent = false;

            for (const [boneName, currPose] of Object.entries(curr.pose)) {
                const prevPose = prev.pose[boneName];
                const nextPose = next.pose[boneName];

                if (!prevPose || !nextPose) {
                    isDifferent = true;
                    break;
                }

                // Check rotation difference
                if (currPose.rotation && prevPose.rotation && nextPose.rotation) {
                    const alpha = (curr.time - prev.time) / (next.time - prev.time);

                    // Interpolate prev to next
                    const q0 = new THREE.Quaternion(
                        prevPose.rotation.x, prevPose.rotation.y,
                        prevPose.rotation.z, prevPose.rotation.w
                    );
                    const q1 = new THREE.Quaternion(
                        nextPose.rotation.x, nextPose.rotation.y,
                        nextPose.rotation.z, nextPose.rotation.w
                    );
                    const expected = q0.clone().slerp(q1, alpha);

                    const actual = new THREE.Quaternion(
                        currPose.rotation.x, currPose.rotation.y,
                        currPose.rotation.z, currPose.rotation.w
                    );

                    // Compare
                    if (expected.angleTo(actual) > threshold) {
                        isDifferent = true;
                        break;
                    }
                }
            }

            if (isDifferent) {
                result.push(curr);
            }
        }

        // Always add last
        result.push(keyframes[keyframes.length - 1]);

        console.log(`[ClipConverter] Optimized ${keyframes.length} -> ${result.length} keyframes`);

        return result;
    }
}

export default ClipConverter;
