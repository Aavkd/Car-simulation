/**
 * EventManager.js
 * Manages animation events and handles their triggering during playback.
 */
import { AnimationEvent } from './AnimationEvent.js';

export class EventManager {
    constructor(editor) {
        this.editor = editor;
        this.events = []; // List of AnimationEvent objects

        // Callback for when an event triggers
        // The editor/game can bind to this to handle the actual logic
        this.onEventTriggered = null;
    }

    /**
     * Add a new event
     * @param {number} time Time in seconds
     * @param {string} functionName Name of function to call
     */
    addEvent(time, functionName = 'OnEvent') {
        const event = new AnimationEvent({ time, functionName });
        this.events.push(event);
        this.sortEvents();
        return event;
    }

    /**
     * Remove an event
     * @param {AnimationEvent} event 
     */
    removeEvent(event) {
        const index = this.events.indexOf(event);
        if (index !== -1) {
            this.events.splice(index, 1);
        }
    }

    /**
     * Sort events by time
     */
    sortEvents() {
        this.events.sort((a, b) => a.time - b.time);
    }

    /**
     * Update loop to check for events
     * @param {number} currentTime Current playback time
     * @param {number} previousTime Previous frame time
     * @param {boolean} isPlaying Whether playback is active
     */
    update(currentTime, previousTime, isPlaying) {
        if (!isPlaying || this.events.length === 0) return;

        // Handle looping wrap-around
        if (currentTime < previousTime) {
            // Check from previousTime to End, then Start to currentTime
            // Simplified: just check from 0 to currentTime for now if wrapped
            this._checkRange(0, currentTime);
        } else {
            this._checkRange(previousTime, currentTime);
        }
    }

    /**
     * Check for events in a time range (exclusive start, inclusive end)
     * @private
     */
    _checkRange(startTime, endTime) {
        for (const event of this.events) {
            if (event.time > startTime && event.time <= endTime) {
                this.trigger(event);
            }
        }
    }

    /**
     * Fire the event
     */
    trigger(event) {
        console.log(`[EventManager] Event triggered: ${event.functionName} at ${event.time.toFixed(3)}s`);

        // Visual feedback (emit signal to UI)
        if (this.editor) {
            // potentially highlight the event marker
        }

        if (this.onEventTriggered) {
            this.onEventTriggered(event);
        }
    }

    /**
     * Serialize all events
     */
    toJSON() {
        return this.events.map(e => e.toJSON());
    }

    /**
     * Load events from JSON
     */
    fromJSON(jsonArray) {
        this.events = [];
        if (Array.isArray(jsonArray)) {
            jsonArray.forEach(data => {
                this.events.push(new AnimationEvent(data));
            });
            this.sortEvents();
        }
    }

    /**
     * Get event by ID
     */
    getEventById(id) {
        return this.events.find(e => e.id === id);
    }
}
