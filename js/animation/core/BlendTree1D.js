import * as THREE from 'three';

/**
 * BlendTree1D
 * Binds multiple animations to a single float parameter (e.g. Speed).
 * Linearly interpolates weights between thresholds.
 */
export class BlendTree1D {
    /**
     * @param {AnimationController} controller - The parent controller
     * @param {string} name - Name of this blend tree
     * @param {Array<{threshold: number, clip: string}>} points - Sorted list of thresholds
     */
    constructor(controller, name, points) {
        this.controller = controller;
        this.name = name;
        this.points = points.sort((a, b) => a.threshold - b.threshold);

        // Cache actions for checking existence
        this._actionsFallback = {};
    }

    /**
     * Update weights based on the parameter value.
     * @param {number} value - The input parameter (e.g. speed)
     */
    update(value) {
        // 1. Find the two points bounding the value
        let minIndex = 0;
        let maxIndex = this.points.length - 1;

        // Reset all weights to 0 initially
        this.points.forEach(p => {
            const action = this.controller.actions.get(p.clip);
            if (action) {
                // Determine if we need to force play them if they are not playing? 
                // The AnimationController generally expects us to manage playback if we are "playing" this tree.
                if (!action.isRunning()) action.play();

                // We will calculate correct weight below. 
                // However, we start at 0 to ensure non-active clips fade out or stay silent.
                action.setEffectiveWeight(0);
            }
        });

        if (value <= this.points[0].threshold) {
            // Below min: 100% first clip
            this._setWeight(0, 1.0);
        } else if (value >= this.points[maxIndex].threshold) {
            // Above max: 100% last clip
            this._setWeight(maxIndex, 1.0);
        } else {
            // In between
            for (let i = 0; i < maxIndex; i++) {
                const p1 = this.points[i];
                const p2 = this.points[i + 1];

                if (value >= p1.threshold && value <= p2.threshold) {
                    const range = p2.threshold - p1.threshold;
                    const factor = (value - p1.threshold) / range;

                    this._setWeight(i, 1.0 - factor);
                    this._setWeight(i + 1, factor);

                    this._syncPhase(i, i + 1);
                    break;
                }
            }
        }
    }

    _setWeight(index, weight) {
        const clipName = this.points[index].clip;
        const action = this.controller.actions.get(clipName);
        if (action) {
            action.setEffectiveWeight(weight);
        }
    }

    /**
     * Simple phase matching: Sync the time of the less weighted clip to the more weighted one
     * so feet hit the ground at the same relative time.
     * Assumes clips are loopable and have similar cycle structures (e.g. Walk & Run both start on left foot).
     */
    _syncPhase(indexA, indexB) {
        const nameA = this.points[indexA].clip;
        const nameB = this.points[indexB].clip;
        const actionA = this.controller.actions.get(nameA);
        const actionB = this.controller.actions.get(nameB);

        if (!actionA || !actionB) return;

        // Get effective weights
        const weightA = actionA.getEffectiveWeight();
        const weightB = actionB.getEffectiveWeight();

        // Sync the one with less weight to the one with more weight
        if (weightA > weightB) {
            // A is dominant
            const ratio = actionA.time / actionA.getClip().duration;
            actionB.time = ratio * actionB.getClip().duration;
        } else {
            // B is dominant
            const ratio = actionB.time / actionB.getClip().duration;
            actionA.time = ratio * actionA.getClip().duration;
        }
    }

    activate() {
        // Ensure all participating actions are playing (paused or weight 0, but 'enabled')
        this.points.forEach(p => {
            const action = this.controller.actions.get(p.clip);
            if (action) {
                action.reset();
                action.play();
                action.setEffectiveWeight(0);
            }
        });
    }

    deactivate() {
        // Stop all
        this.points.forEach(p => {
            const action = this.controller.actions.get(p.clip);
            if (action) {
                action.stop();
            }
        });
    }
}
