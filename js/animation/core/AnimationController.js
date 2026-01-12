import * as THREE from 'three';
import { StateMachine } from '../fsm/StateMachine.js';
import { IdleState } from '../fsm/states/IdleState.js';
import { MoveState } from '../fsm/states/MoveState.js';
import { AirState } from '../fsm/states/AirState.js';

/**
 * AnimationController
 * Wrapper around THREE.AnimationMixer to handle state transitions and clip playback.
 */
export class AnimationController {
    /**
     * @param {THREE.Object3D} mesh - The mesh scene graph to animate (must contain skin/bones)
     * @param {THREE.AnimationClip[]} animations - List of available clips
     */
    constructor(mesh, animations = []) {
        this.mesh = mesh;
        this.animations = animations;
        this.mixer = new THREE.AnimationMixer(mesh);

        // Map clip names to AnimationActions
        this.actions = new Map();
        this.currentAction = null;

        // Initialize State Machine
        this.fsm = new StateMachine(this);
        this._initializeFSM();

        this._initializeActions();
    }

    _initializeFSM() {
        this.fsm.addState('Idle', new IdleState());
        this.fsm.addState('Move', new MoveState());
        this.fsm.addState('Air', new AirState());

        // Default state
        this.fsm.setState('Idle');
        console.log('[AnimationController] FSM Initialized. Default state: Idle');
    }

    _initializeActions() {
        if (!this.animations || this.animations.length === 0) return;

        this.animations.forEach(clip => {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
        });

        console.log(`[AnimationController] Initialized with ${this.animations.length} clips:`, Array.from(this.actions.keys()));
    }

    /**
     * Link input data to the FSM (e.g. from PlayerController)
     * @param {string} key 
     * @param {any} value 
     */
    setInput(key, value) {
        this.fsm.setData(key, value);
    }

    /**
     * Play a specific animation clip
     * @param {string} clipName 
     * @param {boolean} loop 
     * @param {number} fadeTime 
     */
    play(clipName, loop = true, fadeTime = 0.2) {
        const action = this.actions.get(clipName);
        if (!action) {
            // Warn only once per clip to avoid spam, or just debug log
            // console.warn(`[AnimationController] Clip not found: ${clipName}`);
            return;
        }

        if (this.currentAction === action) return;

        // Setup new action
        if (loop) {
            action.setLoop(THREE.LoopRepeat);
        } else {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
        }

        action.reset();
        action.play();

        // Crossfade if there was a previous action
        if (this.currentAction) {
            this.currentAction.crossFadeTo(action, fadeTime, true);
        } else {
            action.fadeIn(fadeTime);
        }

        this.currentAction = action;
    }

    /**
     * Update the mixer and FSM
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
        if (this.fsm) {
            this.fsm.update(delta);
        }
    }

    /**
     * Stop all animations
     */
    stopAll() {
        this.mixer.stopAllAction();
        this.currentAction = null;
    }

    getClipNames() {
        return Array.from(this.actions.keys());
    }
}
