import * as THREE from 'three';

/**
 * BlendTree1D
 * Binds multiple animations to a single float parameter (e.g. Speed).
 * Linearly interpolates weights between thresholds.
 * Supports smooth fading in/out via manual weight management.
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

        // Computed weights for accumulator
        this.computedWeights = new Map();

        // Fading system
        this.fadeWeight = 0.0;
        this.targetWeight = 0.0;
        this.fadeSpeed = 0.0;
        this.parameterValue = 0.0; // Cache last parameter
        this._isActive = false;
    }

    /**
     * Set the parameter value (e.g. speed) and recalculate weights
     * @param {number} value 
     */
    setParameter(value) {
        this.parameterValue = value;
        this._applyWeights();
    }

    /**
     * Update fade animation
     * @param {number} delta 
     */
    tick(delta) {
        if (this.fadeWeight !== this.targetWeight) {
            const diff = this.targetWeight - this.fadeWeight;
            const step = this.fadeSpeed * delta;

            if (Math.abs(diff) <= step) {
                this.fadeWeight = this.targetWeight;
            } else {
                this.fadeWeight += Math.sign(diff) * step;
            }

            // Re-apply weights with new fade factor
            this._applyWeights();
        }
    }

    _applyWeights() {
        const value = this.parameterValue;
        this.computedWeights.clear();

        // If tree is faded out completely, don't bother setting weights (ensure zero once)
        if (this.fadeWeight <= 0.001 && this.targetWeight <= 0.001) {
            if (this.fadeWeight === 0) return;
        }

        // 1. Find the two points bounding the value
        let minIndex = 0;
        let maxIndex = this.points.length - 1;

        // Reset all weights to 0 initially if they are not active?
        // Actually we iterate all points to ensure we control all participating clips
        this.points.forEach(p => {
            const action = this.controller.actions.get(p.clip);
            if (action) {
                // Ensure playing if we have any weight
                if (this.fadeWeight > 0.001 && !action.isRunning()) {
                    action.play();
                }

                // Speed Scaling: Adjust playback speed based on parameter
                if (p.threshold > 0.001) {
                    action.timeScale = value / p.threshold;
                } else {
                    action.timeScale = 1.0;
                }

                // We start assumption of 0 weight, overridden below
                // But we don't want to set 0 here if we are about to set it to something else
                // So we rely on _setWeight to set the final values
            }
        });

        // Calculate base weights (before fade)
        if (value <= this.points[0].threshold) {
            // Below min: 100% first clip
            this._setWeight(0, 1.0);
            this._zeroOthers(0);
        } else if (value >= this.points[maxIndex].threshold) {
            // Above max: 100% last clip
            this._setWeight(maxIndex, 1.0);
            this._zeroOthers(maxIndex);
        } else {
            // In between
            let found = false;
            for (let i = 0; i < maxIndex; i++) {
                const p1 = this.points[i];
                const p2 = this.points[i + 1];

                if (value >= p1.threshold && value <= p2.threshold) {
                    const range = p2.threshold - p1.threshold;
                    const factor = (value - p1.threshold) / range;

                    this._setWeight(i, 1.0 - factor);
                    this._setWeight(i + 1, factor);

                    // Zero out others
                    this._zeroOthers(i, i + 1);

                    // Sync phase
                    if (p1.threshold > 0.001) {
                        this._syncPhase(i, i + 1);
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                // Fallback (shouldn't happen)
                this._setWeight(0, 1.0);
            }
        }
    }

    /**
     * Set weight for a specific index, scaled by master fadeWeight
     */
    _setWeight(index, weight) {
        const clipName = this.points[index].clip;

        // Multiply by the tree's master fade weight
        const finalWeight = weight * this.fadeWeight;

        this.computedWeights.set(clipName, finalWeight);
    }

    /**
     * Set weight to 0 for all indices except the excluded ones
     */
    _zeroOthers(excludeIndex1, excludeIndex2 = -1) {
        for (let i = 0; i < this.points.length; i++) {
            if (i !== excludeIndex1 && i !== excludeIndex2) {
                this._setWeight(i, 0.0);
            }
        }
    }

    /**
     * Simple phase matching to prevent foot sliding transitions
     */
    _syncPhase(indexA, indexB) {
        const nameA = this.points[indexA].clip;
        const nameB = this.points[indexB].clip;
        const actionA = this.controller.actions.get(nameA);
        const actionB = this.controller.actions.get(nameB);

        if (!actionA || !actionB) return;

        // Sync the one with less weight to the one with more weight
        const weightA = actionA.getEffectiveWeight();
        const weightB = actionB.getEffectiveWeight();

        if (weightA > weightB) {
            const ratio = actionA.time / actionA.getClip().duration;
            actionB.time = ratio * actionB.getClip().duration;
        } else {
            const ratio = actionB.time / actionB.getClip().duration;
            actionA.time = ratio * actionA.getClip().duration;
        }
    }

    /**
     * Activate this blend tree with fade-in
     * @param {number} fadeTime - Time to fade in
     */
    activate(fadeTime = 0.2) {
        this.targetWeight = 1.0;
        this.fadeSpeed = 1.0 / Math.max(0.01, fadeTime);
        this._isActive = true;

        // If starting from 0, ensure actions are playing
        if (this.fadeWeight <= 0.001) {
            this.points.forEach(p => {
                const action = this.controller.actions.get(p.clip);
                if (action) {
                    if (!action.isRunning()) {
                        action.reset();
                        action.play();
                    }
                    // Weight will be applied by aggregator
                }
            });
        }
    }

    /**
     * Deactivate this blend tree with fade-out
     * @param {number} fadeTime - Time to fade out
     */
    deactivate(fadeTime = 0.2) {
        this.targetWeight = 0.0;
        this.fadeSpeed = 1.0 / Math.max(0.01, fadeTime);
        this._isActive = false;
    }
}
