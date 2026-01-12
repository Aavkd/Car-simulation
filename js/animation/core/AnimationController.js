import * as THREE from 'three';
import { StateMachine } from '../fsm/StateMachine.js';
import { IdleState } from '../fsm/states/IdleState.js';
import { MoveState } from '../fsm/states/MoveState.js';
import { AirState } from '../fsm/states/AirState.js';
import { BlendTree1D } from './BlendTree1D.js';
import { AnimationLayer } from './AnimationLayer.js';


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



        this.blendTrees = new Map();
        this.activeBlendTree = null;

        this.proceduralLayers = [];

        // Animation Layers (Masked)
        this.layers = new Map();

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
    /**
     * Stop all animations
     */
    stopAll() {
        this.mixer.stopAllAction();
        this.currentAction = null;
        if (this.activeBlendTree) {
            this.activeBlendTree.deactivate();
            this.activeBlendTree = null;
        }
    }

    /**
     * Define a new Blend Tree
     * @param {string} name 
     * @param {Array<{threshold: number, clip: string}>} thresholds 
     */
    addBlendTree(name, thresholds) {
        const tree = new BlendTree1D(this, name, thresholds);
        this.blendTrees.set(name, tree);
    }

    /**
     * Activate a Blend Tree
     * @param {string} name 
     */
    playBlendTree(name) {
        const tree = this.blendTrees.get(name);
        if (!tree) return;

        if (this.activeBlendTree === tree) return;

        // Stop current single action if any
        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
            this.currentAction = null;
        }

        // Deactivate old tree
        if (this.activeBlendTree) {
            this.activeBlendTree.deactivate();
        }

        this.activeBlendTree = tree;
        this.activeBlendTree.activate();
    }

    /**
     * Update a parameter on the active blend tree
     * @param {number} value 
     */
    setBlendParameter(value) {
        if (this.activeBlendTree) {
            this.activeBlendTree.update(value);
        }
    }

    getClipNames() {
        return Array.from(this.actions.keys());
    }

    /**
     * Add a masked animation layer
     * @param {string} name 
     * @param {string} rootBoneName 
     */
    addLayer(name, rootBoneName) {
        const layer = new AnimationLayer(this, name, rootBoneName);
        this.layers.set(name, layer);
    }

    /**
     * Play a clip on a specific layer
     * @param {string} layerName 
     * @param {string} clipName 
     */
    playLayer(layerName, clipName) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.play(clipName);
        }
    }

    /**
     * Stop a layer
     * @param {string} layerName 
     */
    stopLayer(layerName) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.stop();
        }
    }

    /**
     * Helper to find a bone by partial name
     * @param {string} name 
     */
    _findBone(name) {
        let bone = null;
        if (!this.mesh) return null;

        this.mesh.traverse(child => {
            if (child.isBone && child.name.includes(name)) {
                // Return the first match. 
                // Warning: might be vague if "Spine" matches "Spine1", "Spine2". 
                // Usually we want the parent-most one, which traverse order (Top-Down) usually gives?
                // Actually traverse goes children first? No, default is pre-order (root first).
                // So the first one we hit is likely the parent.
                if (!bone) bone = child;
            }
        });
        return bone;
    }

    /**
     * Add a procedural animation layer (e.g. HeadLook, FootIK)
     * @param {Object} layer - Must have update(delta) method
     */
    addProceduralLayer(layer) {
        this.proceduralLayers.push(layer);
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

        // Update procedural layers AFTER mixer to override bone transforms
        this.proceduralLayers.forEach(layer => {
            if (layer.update) {
                layer.update(delta);
            }
        });
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
