/**
 * AnimationImporter.js
 * Animation Import System - Phase 1.1
 * 
 * Main entry point for importing external animations.
 * Handles file type detection and delegates to appropriate loaders.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';

/**
 * ImportResult - Standardized result from any import operation
 */
export class ImportResult {
    constructor() {
        this.success = false;
        this.error = null;
        this.fileName = '';
        this.format = '';

        // Extracted data
        this.clips = [];           // THREE.AnimationClip[]
        this.skeleton = null;      // THREE.Skeleton
        this.rootBone = null;      // THREE.Bone (root of hierarchy)
        this.scene = null;         // THREE.Object3D (full scene if available)

        // Metadata
        this.boneNames = [];       // string[] - all bone names
        this.clipInfo = [];        // { name, duration, trackCount }[]
    }
}

/**
 * AnimationImporter - Main importer class
 */
export class AnimationImporter {
    constructor() {
        // Initialize loaders
        this.gltfLoader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();
        this.bvhLoader = new BVHLoader();

        // Progress callbacks
        this.onProgress = null;
        this.onError = null;
    }

    /**
     * Import animation from a File object
     * @param {File} file - The file to import
     * @returns {Promise<ImportResult>}
     */
    async importFile(file) {
        const result = new ImportResult();
        result.fileName = file.name;

        try {
            // Detect format from extension
            const ext = file.name.split('.').pop().toLowerCase();
            result.format = ext;

            // Read file as appropriate type
            const url = URL.createObjectURL(file);

            try {
                switch (ext) {
                    case 'glb':
                    case 'gltf':
                        await this._importGLTF(url, result);
                        break;
                    case 'fbx':
                        await this._importFBX(url, result);
                        break;
                    case 'bvh':
                        await this._importBVH(url, result);
                        break;
                    default:
                        throw new Error(`Unsupported format: ${ext}`);
                }
            } finally {
                URL.revokeObjectURL(url);
            }

            result.success = true;
            console.log(`[AnimationImporter] Successfully imported ${file.name}:`, {
                clips: result.clips.length,
                bones: result.boneNames.length
            });

        } catch (error) {
            result.success = false;
            result.error = error.message;
            console.error('[AnimationImporter] Import failed:', error);
            if (this.onError) this.onError(error);
        }

        return result;
    }

    /**
     * Import from URL
     * @param {string} url - URL to the animation file
     * @param {string} format - File format (glb, fbx, bvh)
     * @returns {Promise<ImportResult>}
     */
    async importURL(url, format) {
        const result = new ImportResult();
        result.fileName = url.split('/').pop();
        result.format = format;

        try {
            switch (format.toLowerCase()) {
                case 'glb':
                case 'gltf':
                    await this._importGLTF(url, result);
                    break;
                case 'fbx':
                    await this._importFBX(url, result);
                    break;
                case 'bvh':
                    await this._importBVH(url, result);
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            result.success = true;

        } catch (error) {
            result.success = false;
            result.error = error.message;
            if (this.onError) this.onError(error);
        }

        return result;
    }

    /**
     * Import GLTF/GLB file
     * @private
     */
    async _importGLTF(url, result) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                url,
                (gltf) => {
                    result.scene = gltf.scene;
                    result.clips = gltf.animations || [];

                    // Extract skeleton
                    this._extractSkeleton(gltf.scene, result);

                    // Build clip info
                    result.clipInfo = result.clips.map(clip => ({
                        name: clip.name,
                        duration: clip.duration,
                        trackCount: clip.tracks.length
                    }));

                    resolve();
                },
                (progress) => {
                    if (this.onProgress) {
                        const pct = progress.total ? (progress.loaded / progress.total) : 0;
                        this.onProgress(pct, 'Loading GLTF...');
                    }
                },
                (error) => reject(error)
            );
        });
    }

    /**
     * Import FBX file
     * @private
     */
    async _importFBX(url, result) {
        return new Promise((resolve, reject) => {
            this.fbxLoader.load(
                url,
                (fbx) => {
                    result.scene = fbx;
                    result.clips = fbx.animations || [];

                    // Extract skeleton
                    this._extractSkeleton(fbx, result);

                    // Build clip info
                    result.clipInfo = result.clips.map(clip => ({
                        name: clip.name,
                        duration: clip.duration,
                        trackCount: clip.tracks.length
                    }));

                    resolve();
                },
                (progress) => {
                    if (this.onProgress) {
                        const pct = progress.total ? (progress.loaded / progress.total) : 0;
                        this.onProgress(pct, 'Loading FBX...');
                    }
                },
                (error) => reject(error)
            );
        });
    }

    /**
     * Import BVH file
     * @private
     */
    async _importBVH(url, result) {
        return new Promise((resolve, reject) => {
            this.bvhLoader.load(
                url,
                (bvhData) => {
                    // BVHLoader returns { skeleton, clip }
                    result.skeleton = bvhData.skeleton;
                    result.clips = [bvhData.clip];
                    result.rootBone = bvhData.skeleton.bones[0];

                    // Extract bone names
                    result.boneNames = bvhData.skeleton.bones.map(b => b.name);

                    // Build clip info
                    result.clipInfo = [{
                        name: bvhData.clip.name || 'BVH Motion',
                        duration: bvhData.clip.duration,
                        trackCount: bvhData.clip.tracks.length
                    }];

                    resolve();
                },
                (progress) => {
                    if (this.onProgress) {
                        const pct = progress.total ? (progress.loaded / progress.total) : 0;
                        this.onProgress(pct, 'Loading BVH...');
                    }
                },
                (error) => reject(error)
            );
        });
    }

    /**
     * Extract skeleton from a loaded scene
     * @private
     */
    _extractSkeleton(scene, result) {
        let skinnedMesh = null;

        // Find first SkinnedMesh
        scene.traverse(child => {
            if (child.isSkinnedMesh && !skinnedMesh) {
                skinnedMesh = child;
            }
        });

        if (skinnedMesh && skinnedMesh.skeleton) {
            result.skeleton = skinnedMesh.skeleton;
            result.boneNames = skinnedMesh.skeleton.bones.map(b => b.name);

            // Find root bone (the one without a parent bone)
            for (const bone of skinnedMesh.skeleton.bones) {
                if (!bone.parent || !bone.parent.isBone) {
                    result.rootBone = bone;
                    break;
                }
            }
        } else {
            // Try to find bones directly (for armature-only files)
            const bones = [];
            scene.traverse(child => {
                if (child.isBone) {
                    bones.push(child);
                }
            });

            if (bones.length > 0) {
                result.boneNames = bones.map(b => b.name);
                result.rootBone = bones[0]; // Assume first is root

                // Create a skeleton from bones
                result.skeleton = new THREE.Skeleton(bones);
            }
        }
    }

    /**
     * Get supported file extensions
     * @returns {string[]}
     */
    static getSupportedExtensions() {
        return ['glb', 'gltf', 'fbx', 'bvh'];
    }

    /**
     * Check if a file is supported
     * @param {string} filename
     * @returns {boolean}
     */
    static isSupported(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        return this.getSupportedExtensions().includes(ext);
    }
}

export default AnimationImporter;
