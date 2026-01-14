/**
 * SkeletonViewer.js
 * Animation Import System - Phase 1.2
 * 
 * Utility to visualize skeletons from imported files.
 * Provides color-coded visualization for source vs target skeletons.
 */

import * as THREE from 'three';

/**
 * Color scheme for skeleton visualization
 */
export const SKELETON_COLORS = {
    source: 0x00ffff,       // Cyan - imported skeleton
    target: 0x00ff00,       // Green - project skeleton
    mapped: 0xffff00,       // Yellow - successfully mapped bone
    unmapped: 0xff0000,     // Red - unmapped bone
    selected: 0xff00ff,     // Magenta - currently selected
    highlight: 0xffffff     // White - hover highlight
};

/**
 * SkeletonViewer - Visualize and compare skeletons
 */
export class SkeletonViewer {
    /**
     * @param {THREE.Scene} scene - Scene to add visualization to
     */
    constructor(scene) {
        this.scene = scene;

        // Visualization groups
        this.sourceGroup = new THREE.Group();
        this.sourceGroup.name = 'SkeletonViewer_Source';

        this.targetGroup = new THREE.Group();
        this.targetGroup.name = 'SkeletonViewer_Target';

        // Bone visualizations
        this.sourceBoneHelpers = new Map(); // boneName -> { sphere, line }
        this.targetBoneHelpers = new Map();

        // State
        this.sourceVisible = true;
        this.targetVisible = true;
        this.boneScale = 0.02;

        // Add to scene
        this.scene.add(this.sourceGroup);
        this.scene.add(this.targetGroup);
    }

    /**
     * Set the source skeleton (imported)
     * @param {THREE.Skeleton|THREE.Bone} skeleton - Skeleton or root bone
     * @param {THREE.Vector3} offset - Position offset for display
     */
    setSourceSkeleton(skeleton, offset = new THREE.Vector3(-1, 0, 0)) {
        this.clearSource();

        const bones = skeleton.bones || this._getBoneHierarchy(skeleton);
        this._createBoneVisuals(bones, this.sourceGroup, this.sourceBoneHelpers, SKELETON_COLORS.source, offset);
    }

    /**
     * Set the target skeleton (project character)
     * @param {THREE.Skeleton|THREE.Bone} skeleton - Skeleton or root bone
     * @param {THREE.Vector3} offset - Position offset for display
     */
    setTargetSkeleton(skeleton, offset = new THREE.Vector3(1, 0, 0)) {
        this.clearTarget();

        const bones = skeleton.bones || this._getBoneHierarchy(skeleton);
        this._createBoneVisuals(bones, this.targetGroup, this.targetBoneHelpers, SKELETON_COLORS.target, offset);
    }

    /**
     * Update bone colors based on mapping status
     * @param {Object} mapping - { humanoidBone: sourceBoneName }
     */
    updateMappingVisualization(mapping) {
        const mappedSourceBones = new Set(Object.values(mapping));

        // Update source bones
        for (const [boneName, helper] of this.sourceBoneHelpers) {
            const isMapped = mappedSourceBones.has(boneName);
            const color = isMapped ? SKELETON_COLORS.mapped : SKELETON_COLORS.unmapped;
            helper.sphere.material.color.setHex(color);
            helper.line.material.color.setHex(color);
        }
    }

    /**
     * Highlight a specific bone
     * @param {string} boneName - Name of bone to highlight
     * @param {boolean} isSource - Whether it's in source or target skeleton
     */
    highlightBone(boneName, isSource = true) {
        const helpers = isSource ? this.sourceBoneHelpers : this.targetBoneHelpers;
        const helper = helpers.get(boneName);

        if (helper) {
            helper.sphere.material.emissive.setHex(SKELETON_COLORS.highlight);
            helper.sphere.scale.setScalar(1.5);
        }
    }

    /**
     * Clear highlight from a bone
     * @param {string} boneName
     * @param {boolean} isSource
     */
    clearHighlight(boneName, isSource = true) {
        const helpers = isSource ? this.sourceBoneHelpers : this.targetBoneHelpers;
        const helper = helpers.get(boneName);

        if (helper) {
            helper.sphere.material.emissive.setHex(0x000000);
            helper.sphere.scale.setScalar(1);
        }
    }

    /**
     * Clear all highlights
     */
    clearAllHighlights() {
        for (const [name] of this.sourceBoneHelpers) {
            this.clearHighlight(name, true);
        }
        for (const [name] of this.targetBoneHelpers) {
            this.clearHighlight(name, false);
        }
    }

    /**
     * Set visibility of source skeleton
     * @param {boolean} visible
     */
    setSourceVisible(visible) {
        this.sourceVisible = visible;
        this.sourceGroup.visible = visible;
    }

    /**
     * Set visibility of target skeleton
     * @param {boolean} visible
     */
    setTargetVisible(visible) {
        this.targetVisible = visible;
        this.targetGroup.visible = visible;
    }

    /**
     * Update the viewer (call each frame for animated preview)
     */
    update() {
        // Update bone positions from their source bones
        this._updateBonePositions(this.sourceBoneHelpers);
        this._updateBonePositions(this.targetBoneHelpers);
    }

    /**
     * Clear source skeleton visualization
     */
    clearSource() {
        this._clearGroup(this.sourceGroup);
        this.sourceBoneHelpers.clear();
    }

    /**
     * Clear target skeleton visualization
     */
    clearTarget() {
        this._clearGroup(this.targetGroup);
        this.targetBoneHelpers.clear();
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.clearSource();
        this.clearTarget();

        if (this.sourceGroup.parent) {
            this.sourceGroup.parent.remove(this.sourceGroup);
        }
        if (this.targetGroup.parent) {
            this.targetGroup.parent.remove(this.targetGroup);
        }
    }

    /**
     * Create bone visualization objects
     * @private
     */
    _createBoneVisuals(bones, group, helpersMap, color, offset) {
        const sphereGeo = new THREE.SphereGeometry(this.boneScale, 8, 6);
        const lineMaterial = new THREE.LineBasicMaterial({ color });

        for (const bone of bones) {
            // Create joint sphere
            const sphereMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.name = `BoneHelper_${bone.name}`;
            sphere.userData.boneName = bone.name;
            sphere.userData.bone = bone;

            // Position at bone's world position
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            sphere.position.copy(worldPos).add(offset);

            group.add(sphere);

            // Create line to parent
            let line = null;
            if (bone.parent && bone.parent.isBone) {
                const parentPos = new THREE.Vector3();
                bone.parent.getWorldPosition(parentPos);
                parentPos.add(offset);

                const points = [sphere.position.clone(), parentPos];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                line = new THREE.Line(lineGeo, lineMaterial.clone());
                line.name = `BoneLine_${bone.name}`;
                line.userData.bone = bone;
                line.userData.parentBone = bone.parent;

                group.add(line);
            }

            helpersMap.set(bone.name, { sphere, line, bone, offset });
        }
    }

    /**
     * Update bone helper positions (for animation)
     * @private
     */
    _updateBonePositions(helpersMap) {
        for (const [_, helper] of helpersMap) {
            const { sphere, line, bone, offset } = helper;

            // Update sphere position
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            sphere.position.copy(worldPos).add(offset);

            // Update line
            if (line && bone.parent && bone.parent.isBone) {
                const parentPos = new THREE.Vector3();
                bone.parent.getWorldPosition(parentPos);
                parentPos.add(offset);

                const positions = line.geometry.attributes.position.array;
                positions[0] = sphere.position.x;
                positions[1] = sphere.position.y;
                positions[2] = sphere.position.z;
                positions[3] = parentPos.x;
                positions[4] = parentPos.y;
                positions[5] = parentPos.z;
                line.geometry.attributes.position.needsUpdate = true;
            }
        }
    }

    /**
     * Get bone hierarchy from a root bone
     * @private
     */
    _getBoneHierarchy(rootBone) {
        const bones = [];
        const traverse = (bone) => {
            if (bone.isBone) {
                bones.push(bone);
                for (const child of bone.children) {
                    traverse(child);
                }
            }
        };
        traverse(rootBone);
        return bones;
    }

    /**
     * Clear all children from a group
     * @private
     */
    _clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            group.remove(child);
        }
    }
}

export default SkeletonViewer;
