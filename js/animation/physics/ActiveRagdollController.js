import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';
import { BalanceController } from './BalanceController.js';
import { ImpactResponseSystem } from './ImpactResponseSystem.js';
import { ProceduralFallController } from './ProceduralFallController.js';

/**
 * ActiveRagdollController
 * 
 * Main orchestrator for the Euphoria-style active ragdoll system.
 * Coordinates between:
 * - BalanceController: Tracks stability and applies corrective forces
 * - ImpactResponseSystem: Detects and categorizes impacts
 * - ProceduralFallController: Manages falling behaviors
 * 
 * This controller handles the state machine for character physical responses,
 * from absorbing light touches to full ragdoll knockdowns.
 * 
 * States:
 * - normal: Standard gameplay, balance active
 * - stumbling: Light recovery (1-2 steps)
 * - staggering: Medium recovery (multiple steps, arm flailing)
 * - falling: Lost balance, transitioning to ground
 * - ragdoll: Full physics control
 * - recovering: Blending back to animation
 */
export class ActiveRagdollController {
    /**
     * @param {THREE.SkinnedMesh} mesh - The character mesh
     * @param {Object} options - Configuration options
     */
    constructor(mesh, options = {}) {
        this.mesh = mesh;
        this.enabled = true;

        // ==================== CONFIGURATION ====================
        this.terrain = options.terrain || null;
        this.entity = options.entity || null; // Reference to PlayerController or NPC

        // ==================== SUB-CONTROLLERS ====================
        this.balance = new BalanceController(mesh);

        this.impact = new ImpactResponseSystem(this.entity, {
            onStumble: (impact) => this._handleStumble(impact),
            onStagger: (impact) => this._handleStagger(impact),
            onFall: (impact) => this._handleFall(impact),
            onKnockdown: (impact) => this._handleKnockdown(impact),
        });

        this.fall = new ProceduralFallController(mesh, {
            characterHeight: options.characterHeight || 5.5,
            onFallStart: (dir, intensity) => this._onFallStart(dir, intensity),
            onHitGround: (velocity) => this._onHitGround(velocity),
            onRecoveryStart: () => this._onRecoveryStart(),
            onRecoveryComplete: () => this._onRecoveryComplete(),
        });

        // ==================== STATE ====================
        this.state = 'normal'; // normal, stumbling, staggering, falling, ragdoll, recovering
        this.previousState = 'normal';

        // Stumble state
        this.stumbleDirection = new THREE.Vector3();
        this.stumbleSteps = 0;
        this.stumbleProgress = 0;
        this.maxStumbleSteps = RagdollConfig.stumble.maxSteps;

        // Stagger state
        this.staggerTime = 0;
        this.staggerDuration = 0;
        this.staggerSway = 0;

        // Physics blend (0 = animation, 1 = physics)
        this.physicsBlend = 0;

        // Velocity tracking (for fall impact calculation)
        this.previousPosition = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        // ==================== BONES FOR STUMBLE/STAGGER ====================
        // Registry maps bone types to ARRAYS of bone objects (one per skeleton)
        this.boneRegistry = {
            hips: [],
            spine: [],
            leftArm: [],
            rightArm: [],
        };

        // Store all SkinnedMesh children for skeleton updates
        this.skinnedMeshes = [];
        this._findBones();

        // ==================== CALLBACKS ====================
        this.onStateChange = options.onStateChange || null;
        this.onImpact = options.onImpact || null;
    }

    /**
     * Find bones for stumble/stagger effects
     * Gets bones from the actual skeleton of SkinnedMesh children
     * to ensure modifications affect the rendered mesh
     */
    _findBones() {
        // First, collect all SkinnedMesh children
        this.skinnedMeshes = [];
        const uniqueSkeletons = new Set();

        this.mesh.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton) {
                this.skinnedMeshes.push(child);
                uniqueSkeletons.add(child.skeleton);
            }
        });

        console.log(`[ActiveRagdollController] Found ${this.skinnedMeshes.length} SkinnedMesh children and ${uniqueSkeletons.size} unique skeletons`);

        if (uniqueSkeletons.size === 0) {
            console.error('[ActiveRagdollController] No skeletons found in mesh!');
            return;
        }

        // Iterate ALL skeletons to find bones
        // This ensures multi-part meshes (head, body, clothes) all move together
        uniqueSkeletons.forEach(skeleton => {
            skeleton.bones.forEach(bone => {
                const name = bone.name.toLowerCase();

                // Pelvis / Hips (UE4: pelvis, Mixamo: hips)
                if (name === 'pelvis' || name.includes('hips')) {
                    if (!this.boneRegistry.hips.includes(bone)) this.boneRegistry.hips.push(bone);
                }

                // Spine (UE4: spine_01, spine_02... Mixamo: spine)
                if (name === 'spine_01' || name === 'spine_02' || name === 'spine') {
                    if (!this.boneRegistry.spine.includes(bone)) this.boneRegistry.spine.push(bone);
                }

                // Upper arms (UE4: upperarm_l, upperarm_r)
                if (name === 'upperarm_l' || (name.includes('leftarm') && !name.includes('lower') && !name.includes('fore'))) {
                    if (!this.boneRegistry.leftArm.includes(bone)) this.boneRegistry.leftArm.push(bone);
                }
                if (name === 'upperarm_r' || (name.includes('rightarm') && !name.includes('lower') && !name.includes('fore'))) {
                    if (!this.boneRegistry.rightArm.includes(bone)) this.boneRegistry.rightArm.push(bone);
                }
            });
        });

        // Debug output
        Object.keys(this.boneRegistry).forEach(key => {
            console.log(`[ActiveRagdollController] Bones for '${key}': ${this.boneRegistry[key].length}`);
        });

        if (this.boneRegistry.hips.length === 0) console.warn('[ActiveRagdollController] CRITICAL: Pelvis not found in ANY skeleton!');
    }

    /**
     * Change state with logging and callback
     */
    _setState(newState) {
        if (this.state === newState) return;

        this.previousState = this.state;
        this.state = newState;

        if (RagdollConfig.debug.logStateChanges) {
            console.log(`[ActiveRagdollController] State: ${this.previousState} → ${newState}`);
        }

        if (this.onStateChange) {
            this.onStateChange(newState, this.previousState);
        }
    }

    /**
     * Handle stumble response (light impact)
     */
    _handleStumble(impact) {
        if (this.state !== 'normal') return;

        this._setState('stumbling');

        this.stumbleDirection.copy(impact.force).normalize();
        this.stumbleDirection.y = 0;
        if (this.stumbleDirection.lengthSq() < 0.001) {
            this.stumbleDirection.set(0, 0, -1);
        }
        this.stumbleDirection.normalize();

        this.stumbleSteps = 1;
        this.stumbleProgress = 0;
        this.stumbleMinDuration = RagdollConfig.stumble.recoveryTime; // minimum time before recovery check
        this.stumbleElapsed = 0; // track elapsed time

        // Apply force to balance controller and force instability
        this.balance.applyForce(impact.force, impact.point);
        this.balance.isStable = false; // Force unstable during stumble
        this.balance.stabilityFactor = 0.6; // Reduce stability factor
    }

    /**
     * Handle stagger response (medium impact)
     */
    _handleStagger(impact) {
        if (this.state === 'falling' || this.state === 'ragdoll') return;

        this._setState('staggering');

        // Calculate stagger duration based on impact magnitude
        const magnitudeNormalized = THREE.MathUtils.clamp(
            impact.magnitude / RagdollConfig.impact.fallThreshold,
            0, 1
        );

        this.staggerDuration = THREE.MathUtils.lerp(
            RagdollConfig.stagger.durationMin,
            RagdollConfig.stagger.durationMax,
            magnitudeNormalized
        );

        this.staggerTime = 0;
        this.staggerSway = 0;

        // Apply force to balance controller
        this.balance.applyForce(impact.force, impact.point);
    }

    /**
     * Handle fall response (heavy impact)
     */
    _handleFall(impact) {
        if (this.state === 'ragdoll') return;

        this._setState('falling');

        // Get direction and start fall
        const fallDir = this.impact.getHorizontalImpactDirection();
        this.fall.startFall(fallDir, 'medium');

        // Apply force to balance
        this.balance.applyForce(impact.force, impact.point);
    }

    /**
     * Handle knockdown response (massive impact)
     */
    _handleKnockdown(impact) {
        this._setState('ragdoll');

        // Immediate ragdoll - max physics blend
        this.physicsBlend = 1.0;

        // Get direction and start heavy fall
        const fallDir = this.impact.getHorizontalImpactDirection();
        this.fall.startFall(fallDir, 'heavy');

        // Apply large force to balance
        this.balance.applyForce(impact.force, impact.point);
    }

    /**
     * Callback: Fall started
     */
    _onFallStart(direction, intensity) {
        // Nothing special needed - fall controller handles it
    }

    /**
     * Callback: Hit ground
     */
    _onHitGround(velocity) {
        // Play impact sound/effect here
        if (this.onImpact) {
            this.onImpact('ground', velocity);
        }
    }

    /**
     * Callback: Recovery started
     */
    _onRecoveryStart() {
        this._setState('recovering');
    }

    /**
     * Callback: Recovery complete
     */
    _onRecoveryComplete() {
        this._setState('normal');
        this.physicsBlend = 0;
        this.balance.reset();
    }

    /**
     * Apply stumble movement (recovery step)
     * Uses ADDITIVE rotation on top of animation
     */
    _applyStumble(delta) {
        const stumbleConfig = RagdollConfig.stumble;

        this.stumbleProgress += delta * stumbleConfig.stepSpeed;
        this.stumbleElapsed = (this.stumbleElapsed || 0) + delta;

        // Calculate sway - Reduced intensity (0.8 -> 0.4)
        const swayAmount = Math.sin(this.stumbleProgress * Math.PI) * 0.4;

        // 1. Calculate the rotation axis in WORLD space
        // This is perpendicular to both the stumble direction and UP vector
        const worldAxis = this.stumbleDirection.clone().cross(new THREE.Vector3(0, 1, 0));

        if (worldAxis.lengthSq() < 0.001) {
            worldAxis.set(1, 0, 0); // Fallback
        }
        worldAxis.normalize();

        // 2. Create the world-space rotation quaternion
        const swayQuatWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, swayAmount);

        // 3. Apply to all registered hips
        if (this.boneRegistry.hips.length > 0) {

            this.boneRegistry.hips.forEach(hipBone => {
                // To apply a WORLD rotation to a local child, we need to transform it:
                // NewLocal = InvParentWorld * RotationWorld * ParentWorld * OldLocal
                // But simplified for additive sway:
                // We want: WorldRotation_New = SwayWorld * WorldRotation_Old
                // Local_New = InvParentWorld * WorldRotation_New

                // Get parent world quaternion
                const parentQuatWorld = new THREE.Quaternion();
                if (hipBone.parent) {
                    hipBone.parent.getWorldQuaternion(parentQuatWorld);
                }

                // Convert World Sway to Local Delta
                // DeltaLocal = InvParentWorld * SwayWorld * ParentWorld
                const invParent = parentQuatWorld.clone().invert();
                const localSway = invParent.multiply(swayQuatWorld).multiply(parentQuatWorld);

                // Apply local delta (premultiply to apply "after" parent transform? No, multiply puts it on right)
                // L_new = L_old * localSway (intrinsic rotation)
                hipBone.quaternion.premultiply(localSway);
            });

            // Apply smaller sway to spine for flexibility
            if (this.boneRegistry.spine.length > 0) {
                const spineSwayWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, swayAmount * 0.5);

                this.boneRegistry.spine.forEach(spineBone => {
                    const parentQuatWorld = new THREE.Quaternion();
                    if (spineBone.parent) spineBone.parent.getWorldQuaternion(parentQuatWorld);

                    const invParent = parentQuatWorld.clone().invert();
                    const localSway = invParent.multiply(spineSwayWorld).multiply(parentQuatWorld);

                    spineBone.quaternion.premultiply(localSway);
                });
            }

            // Update all skeletons
            this.skinnedMeshes.forEach(skinnedMesh => {
                if (skinnedMesh.skeleton) {
                    skinnedMesh.skeleton.update();
                }
            });

            this.mesh.updateMatrixWorld(true);
        }

        // Check recovery timing
        const minDuration = this.stumbleMinDuration || stumbleConfig.recoveryTime;
        if (this.stumbleElapsed < minDuration) return;

        // Check completion
        if (this.stumbleProgress >= 1) {
            if (!this.balance.isStable && this.stumbleSteps < this.maxStumbleSteps) {
                this.stumbleSteps++;
                this.stumbleProgress = 0;
            } else {
                this._setState('normal');
                this.balance.isStable = true;
                this.balance.stabilityFactor = 1.0;
            }
        }
    }

    /**
     * Apply stagger movement (recovery struggle)
     */
    _applyStagger(delta) {
        const staggerConfig = RagdollConfig.stagger;

        this.staggerTime += delta;

        // Oscillating sway
        this.staggerSway = Math.sin(this.staggerTime * staggerConfig.swaySpeed * Math.PI * 2);
        const swayAmount = this.staggerSway * staggerConfig.swayAmount;

        // Use Character Forward axis for side-to-side sway
        const forward = new THREE.Vector3();
        this.mesh.getWorldDirection(forward);
        const swayQuatWorld = new THREE.Quaternion().setFromAxisAngle(forward, swayAmount * 0.8);

        // Apply world sway to spine
        if (this.boneRegistry.spine.length > 0) {
            this.boneRegistry.spine.forEach(bone => {
                const parentQuatWorld = new THREE.Quaternion();
                if (bone.parent) bone.parent.getWorldQuaternion(parentQuatWorld);
                const invParent = parentQuatWorld.clone().invert();
                const localSway = invParent.multiply(swayQuatWorld).multiply(parentQuatWorld);
                bone.quaternion.premultiply(localSway);
            });
        }

        // Flail arms
        const armFlail = Math.sin(this.staggerTime * staggerConfig.swaySpeed * 2 * Math.PI) * staggerConfig.armFlailIntensity;
        const leftFlail = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), armFlail + 0.3);
        const rightFlail = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -armFlail - 0.3);

        this.boneRegistry.leftArm.forEach(bone => bone.quaternion.multiply(leftFlail));
        this.boneRegistry.rightArm.forEach(bone => bone.quaternion.multiply(rightFlail));

        // Update skeletons
        this.skinnedMeshes.forEach(skinnedMesh => {
            if (skinnedMesh.skeleton) {
                skinnedMesh.skeleton.update();
            }
        });
        this.mesh.updateMatrixWorld(true);

        // Check if stagger complete
        if (this.staggerTime >= this.staggerDuration) {
            if (this.balance.isStable) {
                this._setState('normal');
            } else {
                // Fall
                const fallDir = this.balance.balanceDirection.clone();
                this._handleFall({
                    force: fallDir.multiplyScalar(RagdollConfig.impact.fallThreshold),
                    point: null,
                    source: 'stagger_fail'
                });
            }
        }
    }

    /**
     * Update velocity tracking
     */
    _updateVelocity(delta) {
        if (!this.mesh) return;

        const currentPos = new THREE.Vector3();
        this.mesh.getWorldPosition(currentPos);

        if (this.previousPosition.lengthSq() > 0) {
            this.velocity.subVectors(currentPos, this.previousPosition).divideScalar(delta);
        }

        this.previousPosition.copy(currentPos);
    }

    /**
     * Check for ground collision during fall
     */
    _checkGroundCollision() {
        if (!this.terrain || !this.fall.isAirborne()) return;

        const meshPos = new THREE.Vector3();
        this.mesh.getWorldPosition(meshPos);

        // Get ground height at current position
        const groundHeight = this.terrain.getHeightAt(meshPos.x, meshPos.z);

        // Character "foot" level
        const footHeight = meshPos.y;

        // Check if close to ground
        if (footHeight <= groundHeight + 0.3) {
            this.fall.hitGround(this.velocity.y);
        }
    }

    // ==================== PUBLIC API ====================

    /**
     * Apply an impact force to the character
     * @param {THREE.Vector3} force - Force vector
     * @param {THREE.Vector3} [point] - World position of impact
     * @param {string} [source] - Source identifier
     * @returns {string} Response type
     */
    applyImpact(force, point = null, source = 'unknown') {
        if (!this.enabled) return 'absorbed';

        const response = this.impact.registerImpact({ force, point, source });

        if (this.onImpact) {
            this.onImpact(source, force.length());
        }

        return response;
    }

    /**
     * Apply continuous force (e.g., wind, pushing against wall)
     * @param {THREE.Vector3} force - Force vector (will be scaled by delta)
     */
    applyContinuousForce(force) {
        if (!this.enabled) return;

        // Apply to balance controller directly (bypass impact thresholds)
        this.balance.applyForce(force.clone().multiplyScalar(0.1), null);
    }

    /**
     * Force a fall in a direction (for scripted events)
     * @param {THREE.Vector3} direction - Fall direction
     * @param {string} [intensity] - 'light', 'medium', 'heavy'
     */
    forceFall(direction, intensity = 'medium') {
        if (this.state === 'ragdoll') return;

        this._setState('falling');
        this.fall.startFall(direction, intensity);
    }

    /**
     * Force recovery (skip to standing)
     */
    forceRecovery() {
        this.fall.forceRecovery();
        this._setState('normal');
        this.physicsBlend = 0;
        this.balance.reset();
    }

    /**
     * Main update loop
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (!this.enabled) return;

        // Update velocity tracking
        this._updateVelocity(delta);

        // Update sub-controllers
        this.impact.update(delta);
        this.balance.update(delta);

        // State-specific updates
        switch (this.state) {
            case 'normal':
                // Check if balance is becoming unstable
                if (!this.balance.isStable && this.balance.stabilityFactor < 0.5) {
                    this._handleStagger({
                        // Reduced force to prevent spin/explosion (was staggerThreshold=150)
                        force: this.balance.balanceDirection.clone()
                            .multiplyScalar(60),
                        point: null,
                        source: 'balance_loss'
                    });
                }
                break;

            case 'stumbling':
                this._applyStumble(delta);
                break;

            case 'staggering':
                this._applyStagger(delta);
                break;

            case 'falling':
            case 'ragdoll':
                // Check for ground collision
                this._checkGroundCollision();

                // Update fall controller
                const groundHeight = this.terrain ?
                    this.terrain.getHeightAt(this.mesh.position.x, this.mesh.position.z) : 0;
                this.fall.update(delta, groundHeight);

                // Sync physics blend
                this.physicsBlend = this.fall.getPhysicsBlend();
                break;

            case 'recovering':
                this.fall.update(delta);
                this.physicsBlend = this.fall.getPhysicsBlend();
                break;
        }
    }

    /**
     * Get current physics blend factor
     * @returns {number} 0 = animation, 1 = physics
     */
    getPhysicsBlend() {
        return this.physicsBlend;
    }

    /**
     * Check if character is in any active physics state
     * @returns {boolean} True if not in normal state
     */
    isPhysicsActive() {
        return this.state !== 'normal';
    }

    /**
     * Check if character can be controlled by player
     * @returns {boolean} True if player has control
     */
    hasControl() {
        return this.state === 'normal' || this.state === 'stumbling';
    }

    /**
     * Get current state for debugging/UI
     */
    getState() {
        return {
            state: this.state,
            physicsBlend: this.physicsBlend,
            balance: this.balance.getState(),
            impact: this.impact.getState(),
            fall: this.fall.getState(),
        };
    }

    /**
     * Enable/disable the entire system
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.balance.setEnabled(enabled);
        this.impact.setEnabled(enabled);
        this.fall.setEnabled(enabled);

        if (!enabled) {
            this._setState('normal');
            this.physicsBlend = 0;
        }
    }

    /**
     * Reset all state
     */
    reset() {
        this._setState('normal');
        this.physicsBlend = 0;
        this.stumbleSteps = 0;
        this.stumbleProgress = 0;
        this.staggerTime = 0;

        this.balance.reset();
        this.impact.clearImpacts();
        this.fall.reset();
    }

    /**
     * Dispose and clean up
     */
    dispose() {
        this.enabled = false;
        this.balance = null;
        this.impact = null;
        this.fall = null;
    }
}
