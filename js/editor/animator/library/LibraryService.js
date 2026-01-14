/**
 * LibraryService.js
 * Animation Library System - Phase 5.1
 * 
 * Central service for library operations.
 * Handles caching, preview, and permanent import functionality.
 */

import * as THREE from 'three';
import { LibraryScanner } from './LibraryScanner.js';
import { AnimationImporter } from '../import/AnimationImporter.js';
import { Retargeter } from '../import/Retargeter.js';
import { HumanoidMapper } from '../import/HumanoidAvatar.js';
import { ClipConverter } from '../import/ClipConverter.js';

/**
 * LibraryService - Manages animation library operations
 */
export class LibraryService {
    /**
     * @param {Object} editor - Reference to AnimatorEditorController
     */
    constructor(editor) {
        this.editor = editor;
        this.scanner = new LibraryScanner();
        this.importer = new AnimationImporter();

        // Cache for loaded animations
        /** @type {Map<string, Object>} path -> { clips, skeleton, scene } */
        this.cache = new Map();

        // Current preview state
        this.previewState = {
            active: false,
            animationInfo: null,
            mixer: null,
            action: null,
            clips: null,
            originalPose: null
        };

        // Retargeter for current entity
        this.retargeter = null;
        this.targetMapping = null;

        // Event callbacks
        this.onPreviewStart = null;
        this.onPreviewStop = null;
        this.onAnimationApplied = null;
    }

    /**
     * Initialize the service and load the library manifest
     * @returns {Promise<boolean>}
     */
    async initialize() {
        const success = await this.scanner.loadManifest();
        if (success) {
            console.log('[LibraryService] Initialized successfully');
        }
        return success;
    }

    /**
     * Get the library scanner
     * @returns {LibraryScanner}
     */
    getScanner() {
        return this.scanner;
    }

    /**
     * Check if library is ready
     * @returns {boolean}
     */
    isReady() {
        return this.scanner.isLoaded();
    }

    /**
     * Preview an animation on the selected entity
     * @param {Object} animationInfo - Animation metadata from scanner
     * @returns {Promise<boolean>} Success status
     */
    async previewAnimation(animationInfo) {
        const entity = this.editor.selectedEntity;

        if (!entity) {
            console.warn('[LibraryService] No entity selected for preview');
            return false;
        }

        // Stop any existing preview
        this.stopPreview();

        try {
            // Load or get cached animation data
            const animData = await this._loadAnimation(animationInfo);

            if (!animData || !animData.clips || animData.clips.length === 0) {
                console.error('[LibraryService] No animation clips found');
                return false;
            }

            // Get target skeleton
            const targetSkeleton = this._getEntitySkeleton(entity);

            if (!targetSkeleton) {
                console.error('[LibraryService] Entity has no skeleton');
                return false;
            }

            // Setup retargeting
            const sourceSkeleton = animData.skeleton;

            if (sourceSkeleton) {
                // Auto-map source bones using static method
                const sourceMapping = HumanoidMapper.autoMap(sourceSkeleton.bones);

                // Auto-map target bones
                this.targetMapping = HumanoidMapper.autoMap(targetSkeleton.bones);

                // Create retargeter
                this.retargeter = new Retargeter(sourceSkeleton, targetSkeleton, sourceMapping);
                this.retargeter.setTargetMapping(this.targetMapping);
                this.retargeter.calibrate();
            }

            // Store original pose for restoration
            this.previewState.originalPose = this._captureEntityPose(entity);

            // Retarget the first clip
            let previewClip = animData.clips[0];

            if (this.retargeter) {
                previewClip = this.retargeter.retargetClip(previewClip, `preview_${animationInfo.name}`);
            }

            // Create mixer and play
            const mesh = entity.mesh || entity;
            this.previewState.mixer = new THREE.AnimationMixer(mesh);
            this.previewState.action = this.previewState.mixer.clipAction(previewClip);
            this.previewState.action.play();

            this.previewState.active = true;
            this.previewState.animationInfo = animationInfo;
            this.previewState.clips = animData.clips;

            console.log(`[LibraryService] Preview started: ${animationInfo.name}`);

            if (this.onPreviewStart) {
                this.onPreviewStart(animationInfo);
            }

            return true;
        } catch (error) {
            console.error('[LibraryService] Preview error:', error);
            return false;
        }
    }

    /**
     * Update preview animation (call each frame)
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.previewState.active && this.previewState.mixer) {
            this.previewState.mixer.update(dt);
        }
    }

    /**
     * Stop current preview and restore original pose
     */
    stopPreview() {
        if (!this.previewState.active) {
            return;
        }

        if (this.previewState.action) {
            this.previewState.action.stop();
        }

        if (this.previewState.mixer) {
            this.previewState.mixer.stopAllAction();
        }

        // Restore original pose
        if (this.previewState.originalPose && this.editor.selectedEntity) {
            this._restoreEntityPose(this.editor.selectedEntity, this.previewState.originalPose);
        }

        const animInfo = this.previewState.animationInfo;

        // Reset state
        this.previewState.active = false;
        this.previewState.animationInfo = null;
        this.previewState.mixer = null;
        this.previewState.action = null;
        this.previewState.clips = null;
        this.previewState.originalPose = null;

        console.log('[LibraryService] Preview stopped');

        if (this.onPreviewStop && animInfo) {
            this.onPreviewStop(animInfo);
        }
    }

    /**
     * Check if preview is active
     * @returns {boolean}
     */
    isPreviewActive() {
        return this.previewState.active;
    }

    /**
     * Get current preview info
     * @returns {Object|null}
     */
    getCurrentPreview() {
        return this.previewState.animationInfo;
    }

    /**
     * Apply the current preview animation permanently
     * @returns {Promise<boolean>} Success status
     */
    async applyAnimation() {
        if (!this.previewState.active || !this.previewState.animationInfo) {
            console.warn('[LibraryService] No active preview to apply');
            return false;
        }

        const entity = this.editor.selectedEntity;

        if (!entity) {
            console.warn('[LibraryService] No entity selected');
            return false;
        }

        try {
            const animInfo = this.previewState.animationInfo;
            const animData = await this._loadAnimation(animInfo);

            // Convert clips to native format
            const converter = new ClipConverter();
            const convertedClips = [];

            for (const sourceClip of animData.clips) {
                let clip = sourceClip;

                // Retarget if we have a retargeter
                if (this.retargeter) {
                    clip = this.retargeter.retargetClip(sourceClip, sourceClip.name);
                }

                // Convert to native format
                const nativeClip = converter.toNativeFormat(clip);
                convertedClips.push(nativeClip);
            }

            // Stop preview
            this.stopPreview();

            // Add clips to entity's animator
            const animator = entity.animator;

            if (animator && animator.controller) {
                for (const clip of convertedClips) {
                    // Add action to mixer
                    const threeClip = converter.toThreeClip(clip);
                    animator.controller.actions.set(clip.name, {
                        clip: threeClip,
                        action: animator.mixer.clipAction(threeClip)
                    });
                }
            }

            console.log(`[LibraryService] Applied ${convertedClips.length} clip(s) from: ${animInfo.name}`);

            if (this.onAnimationApplied) {
                this.onAnimationApplied(animInfo, convertedClips);
            }

            return true;
        } catch (error) {
            console.error('[LibraryService] Apply error:', error);
            return false;
        }
    }

    /**
     * Load animation data (or get from cache)
     * @private
     * @param {Object} animationInfo 
     * @returns {Promise<Object>} { clips, skeleton, scene }
     */
    async _loadAnimation(animationInfo) {
        const path = animationInfo.path;

        // Check cache
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        // Determine format from filename
        const ext = path.split('.').pop().toLowerCase();

        // Load using importer
        const result = await this.importer.importURL(path, ext);

        if (!result.success) {
            throw new Error(result.error || 'Failed to load animation');
        }

        const animData = {
            clips: result.clips || [],
            skeleton: result.skeleton || null,
            scene: result.scene || null
        };

        // Cache the result
        this.cache.set(path, animData);

        return animData;
    }

    /**
     * Get skeleton from entity
     * @private
     * @param {Object} entity 
     * @returns {THREE.Skeleton|null}
     */
    _getEntitySkeleton(entity) {
        const mesh = entity.mesh || entity;
        let skeleton = null;

        mesh.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
            }
        });

        return skeleton;
    }

    /**
     * Capture current bone poses
     * @private
     * @param {Object} entity 
     * @returns {Map<string, Object>}
     */
    _captureEntityPose(entity) {
        const pose = new Map();
        const skeleton = this._getEntitySkeleton(entity);

        if (skeleton) {
            // Robust capture from skeleton bones
            for (const bone of skeleton.bones) {
                pose.set(bone.name, {
                    position: bone.position.clone(),
                    quaternion: bone.quaternion.clone(),
                    scale: bone.scale.clone()
                });
            }
        } else {
            // Fallback for non-skinned hierarchies
            const mesh = entity.mesh || entity;
            mesh.traverse((child) => {
                if (child.isBone) {
                    pose.set(child.name, {
                        position: child.position.clone(),
                        quaternion: child.quaternion.clone(),
                        scale: child.scale.clone()
                    });
                }
            });
        }

        return pose;
    }

    /**
     * Restore bone poses from snapshot
     * @private
     * @param {Object} entity 
     * @param {Map<string, Object>} pose 
     */
    _restoreEntityPose(entity, pose) {
        const skeleton = this._getEntitySkeleton(entity);
        const mesh = entity.mesh || entity;

        if (skeleton) {
            for (const bone of skeleton.bones) {
                if (pose.has(bone.name)) {
                    const saved = pose.get(bone.name);
                    bone.position.copy(saved.position);
                    bone.quaternion.copy(saved.quaternion);
                    bone.scale.copy(saved.scale);
                }
            }
        } else {
            // Fallback traversal
            mesh.traverse((child) => {
                if (child.isBone && pose.has(child.name)) {
                    const saved = pose.get(child.name);
                    child.position.copy(saved.position);
                    child.quaternion.copy(saved.quaternion);
                    child.scale.copy(saved.scale);
                }
            });
        }

        // Force update world matrices after restoring bone transforms
        mesh.updateMatrixWorld(true);

        // Update skeleton bone matrices for proper GPU skinning
        if (skeleton) {
            skeleton.update();
        } else {
            // Fallback if we couldn't find skeleton via helper but it might be there
            mesh.traverse((child) => {
                if (child.isSkinnedMesh && child.skeleton) {
                    child.skeleton.update();
                }
            });
        }
    }

    /**
     * Clear animation cache
     */
    clearCache() {
        this.cache.clear();
        console.log('[LibraryService] Cache cleared');
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.stopPreview();
        this.clearCache();
        this.retargeter = null;
    }
}

export default LibraryService;
