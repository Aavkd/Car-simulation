import * as THREE from 'three';

/**
 * AnimationLayer
 * Manages playback of animations on a specific subset of bones (Avatar Mask).
 */
export class AnimationLayer {
    /**
     * @param {AnimationController} controller - Parent controller
     * @param {string} name - Layer name (e.g. "UpperBody")
     * @param {string} rootBoneName - The root bone for this layer (e.g. "Spine"). 
     *                                All children of this bone are included.
     *                                If null, it's a full body layer.
     */
    constructor(controller, name, rootBoneName = null) {
        this.controller = controller;
        this.name = name;
        this.rootBoneName = rootBoneName;

        // Cache for generated sub-clips
        // Key: originalClipName, Value: subClipName
        this.clipCache = new Map();

        this.currentAction = null;
        this.weight = 1.0;
    }

    /**
     * Play an animation on this layer.
     * @param {string} clipName - Name of the original full-body clip
     * @param {boolean} loop 
     * @param {number} fadeTime 
     */
    play(clipName, loop = true, fadeTime = 0.2) {
        // 1. Get original clip
        const originalAction = this.controller.actions.get(clipName);
        if (!originalAction) {
            console.warn(`[AnimationLayer:${this.name}] Clip not found: ${clipName}`);
            return;
        }
        const originalClip = originalAction.getClip();

        // 2. Get or Create Sub-Clip
        let finalClip = originalClip;

        if (this.rootBoneName) {
            if (!this.clipCache.has(clipName)) {
                // Generate sub-clip
                const subClip = this._createSubClip(originalClip);
                this.clipCache.set(clipName, subClip);

                // We assume the Controller doesn't know about this new clip yet.
                // We assume we can create an action from it on the shared mixer.
            }
            finalClip = this.clipCache.get(clipName);
        }

        // 3. Play via Mixer
        // We can't use controller.play() because that assumes full body management.
        // We create a new action on the same mixer.

        const action = this.controller.mixer.clipAction(finalClip);

        if (this.currentAction === action) return;

        // Configure
        if (loop) {
            action.setLoop(THREE.LoopRepeat);
        } else {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
        }

        action.reset();
        action.play(); // This plays in parallel with other actions on the mixer

        // Crossfade
        if (this.currentAction) {
            this.currentAction.crossFadeTo(action, fadeTime, true);
        } else {
            action.fadeIn(fadeTime);
        }

        this.currentAction = action;
    }

    stop(fadeTime = 0.2) {
        if (this.currentAction) {
            this.currentAction.fadeOut(fadeTime);
            this.currentAction = null;
        }
    }

    /**
     * Create a new AnimationClip containing only tracks for the root bone and its descendants.
     * @param {THREE.AnimationClip} clip 
     */
    _createSubClip(clip) {
        const tracks = [];

        // Find relevant filtered track names
        // This requires traversing the mesh to find the hierarchy names, OR just filtering strings.
        // The tracks are usually named "BoneName.position", "BoneName.quaternion", etc.
        // If we know the Root Bone Name, we need to know all its children names too?
        // OR we can just check if the track name *contains* the root bone name? 
        // No, "Spine" doesn't contain "Head".

        // We need the concrete list of bones belonging to this mask.
        const maskBoneNames = this._getDescendantBoneNames(this.rootBoneName);

        clip.tracks.forEach(track => {
            // Track name is usually "BoneName.property"
            // We strip the property to get bone name
            // THREE.js sometimes uses UUIDs but GLTFLoader usually uses names.

            // Handle parsing track name:
            // "Hip.position" -> "Hip"
            const trackBoneName = track.name.split('.')[0];

            // Also sanitize: characters like special chars might be escaped.
            // But usually exact match works if loader was standard.

            if (maskBoneNames.has(trackBoneName)) {
                tracks.push(track);
            }
        });

        if (tracks.length === 0) {
            console.warn(`[AnimationLayer:${this.name}] Mask '${this.rootBoneName}' resulted in empty clip for ${clip.name}. Check bone names.`);
            // Return empty clip or original to avoid crash? Return original might be unexpected visual. 
            // Return empty clone.
            return new THREE.AnimationClip(clip.name + '_Mask_' + this.name, clip.duration, []);
        }

        // Create new clip
        return new THREE.AnimationClip(clip.name + '_Mask_' + this.name, clip.duration, tracks);
    }

    _getDescendantBoneNames(rootName) {
        const names = new Set();
        const root = this.controller._findBone(rootName);

        if (!root) {
            console.warn(`[AnimationLayer] Root bone '${rootName}' not found in mesh.`);
            return names;
        }

        root.traverse(child => {
            if (child.isBone) {
                names.add(child.name);
            }
        });

        return names;
    }
}
