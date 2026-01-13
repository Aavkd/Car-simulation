/**
 * AnimationEvent.js
 * Represents a single event that triggers at a specific time in the animation.
 */
import * as THREE from 'three';

export class AnimationEvent {
    constructor(data = {}) {
        this.id = data.id || THREE.MathUtils.generateUUID();
        this.time = data.time || 0;
        this.functionName = data.functionName || '';
        this.parameters = data.parameters || {}; // e.g. { float: 0.0, int: 0, string: '', object: null }
        this.selected = false;
    }

    /**
     * Create a clone of this event
     */
    clone() {
        return new AnimationEvent({
            time: this.time,
            functionName: this.functionName,
            parameters: JSON.parse(JSON.stringify(this.parameters)) // Deep copy simple params
        });
    }

    /**
     * Export to JSON
     */
    toJSON() {
        return {
            time: this.time,
            functionName: this.functionName,
            parameters: this.parameters
        };
    }
}
