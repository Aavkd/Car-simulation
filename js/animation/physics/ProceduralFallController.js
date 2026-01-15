import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';

/**
 * ProceduralFallController
 * 
 * Manages realistic falling with protective behaviors:
 * 1. Arms extend to break fall (bracing)
 * 2. Head tucks to protect
 * 3. Body rotates to distribute impact
 * 4. Smooth transition to get-up animation
 * 
 * States:
 * - idle: Normal gameplay, no fall active
 * - bracing: Arms extending, preparing for impact
 * - falling: In the air, physics taking over
 * - onGround: Hit the ground, waiting to recover
 * - recovering: Blending back to animation control
 */
export class ProceduralFallController {
    /**
     * @param {THREE.SkinnedMesh} mesh - The character mesh
     * @param {Object} options - Configuration options
     */
    constructor(mesh, options = {}) {
        this.mesh = mesh;
        this.enabled = true;

        // Configuration
        this.config = { ...RagdollConfig.falling, ...options };

        // ==================== STATE ====================
        this.state = 'idle'; // idle, bracing, falling, onGround, recovering
        this.previousState = 'idle';

        this.fallDirection = new THREE.Vector3(0, 0, -1);
        this.fallTime = 0;
        this.groundTime = 0;
        this.recoveryProgress = 0;

        // Physics blend (0 = full animation, 1 = full physics/procedural)
        this.physicsBlend = 0;

        // Ground detection
        this.groundHeight = 0;
        this.characterHeight = options.characterHeight || 5.5;

        // ==================== BONES ====================
        this.bones = {
            hips: null,
            spine: null,
            spine1: null,
            spine2: null,
            chest: null,
            neck: null,
            head: null,
            leftArm: null,
            rightArm: null,
            leftForearm: null,
            rightForearm: null,
            leftHand: null,
            rightHand: null,
            leftUpLeg: null,
            rightUpLeg: null,
            leftLeg: null,
            rightLeg: null,
        };

        // Rest pose storage (for recovery blending)
        this.restPoses = new Map();

        // Callbacks
        this.onFallStart = options.onFallStart || null;
        this.onHitGround = options.onHitGround || null;
        this.onRecoveryStart = options.onRecoveryStart || null;
        this.onRecoveryComplete = options.onRecoveryComplete || null;

        this._findBones();
    }

    /**
     * Find and cache bone references
     * Supports Unreal Engine skeleton naming (pelvis, spine_01, upperarm_l, etc.)
     */
    _findBones() {
        this.mesh.traverse(child => {
            if (!child.isBone) return;
            const name = child.name.toLowerCase();

            // Core (UE4: pelvis, spine_01-05)
            if (name === 'pelvis' || name.includes('hips')) this.bones.hips = child;
            if (name === 'spine_01') this.bones.spine = child;
            if (name === 'spine_02') this.bones.spine1 = child;
            if (name === 'spine_03' || name === 'spine_04') {
                this.bones.spine2 = child;
                this.bones.chest = child;
            }
            if (name === 'neck_01' || name === 'neck') this.bones.neck = child;
            if (name === 'head') this.bones.head = child;

            // Arms (UE4: upperarm_l/r, lowerarm_l/r, hand_l/r)
            if (name === 'upperarm_l') this.bones.leftArm = child;
            if (name === 'upperarm_r') this.bones.rightArm = child;
            if (name === 'lowerarm_l') this.bones.leftForearm = child;
            if (name === 'lowerarm_r') this.bones.rightForearm = child;
            if (name === 'hand_l') this.bones.leftHand = child;
            if (name === 'hand_r') this.bones.rightHand = child;

            // Legs (UE4: thigh_l/r, calf_l/r)
            if (name === 'thigh_l') this.bones.leftUpLeg = child;
            if (name === 'thigh_r') this.bones.rightUpLeg = child;
            if (name === 'calf_l') this.bones.leftLeg = child;
            if (name === 'calf_r') this.bones.rightLeg = child;
        });

        const found = Object.keys(this.bones).filter(k => this.bones[k]);
        console.log(`[ProceduralFallController] Found ${found.length} bones:`, found);
    }

    /**
     * Store current bone poses as rest poses (for recovery blending)
     */
    _captureRestPoses() {
        Object.values(this.bones).forEach(bone => {
            if (bone) {
                this.restPoses.set(bone, {
                    quaternion: bone.quaternion.clone(),
                    position: bone.position.clone()
                });
            }
        });
    }

    /**
     * Start a fall in a specific direction
     * @param {THREE.Vector3} direction - Direction of fall (normalized)
     * @param {string} [intensity] - 'light', 'medium', 'heavy' (affects fall speed)
     */
    startFall(direction, intensity = 'medium') {
        if (this.state !== 'idle') return; // Already falling

        this._captureRestPoses();

        this.state = 'bracing';
        this.previousState = 'idle';
        this.fallDirection.copy(direction).normalize();
        this.fallTime = 0;
        this.physicsBlend = 0;

        // Set physics blend target based on intensity
        this._fallIntensity = intensity;

        if (RagdollConfig.debug.logStateChanges) {
            console.log(`[ProceduralFallController] Fall started, direction: ${this.fallDirection.toArray().map(v => v.toFixed(2))}, intensity: ${intensity}`);
        }

        if (this.onFallStart) {
            this.onFallStart(direction, intensity);
        }
    }

    /**
     * Signal that character has hit the ground
     * @param {number} [impactVelocity] - Vertical velocity at impact (for reaction intensity)
     */
    hitGround(impactVelocity = 0) {
        if (this.state === 'falling' || this.state === 'bracing') {
            this.previousState = this.state;
            this.state = 'onGround';
            this.groundTime = 0;

            // Store impact velocity for reaction scaling
            this._impactVelocity = Math.abs(impactVelocity);

            if (RagdollConfig.debug.logStateChanges) {
                console.log(`[ProceduralFallController] Hit ground, impact velocity: ${impactVelocity.toFixed(2)}`);
            }

            if (this.onHitGround) {
                this.onHitGround(impactVelocity);
            }
        }
    }

    /**
     * Begin recovery animation / blend back to animation control
     */
    startRecovery() {
        if (this.state !== 'onGround') return;

        this.previousState = this.state;
        this.state = 'recovering';
        this.recoveryProgress = 0;

        if (RagdollConfig.debug.logStateChanges) {
            console.log('[ProceduralFallController] Recovery started');
        }

        if (this.onRecoveryStart) {
            this.onRecoveryStart();
        }
    }

    /**
     * Force complete recovery (skip animation)
     */
    forceRecovery() {
        this.state = 'idle';
        this.physicsBlend = 0;
        this.recoveryProgress = 0;
        this.fallTime = 0;

        if (RagdollConfig.debug.logStateChanges) {
            console.log('[ProceduralFallController] Recovery forced');
        }

        if (this.onRecoveryComplete) {
            this.onRecoveryComplete();
        }
    }

    /**
     * Apply bracing pose (arms extend toward ground)
     */
    _applyBracingPose(delta) {
        const braceProgress = Math.min(this.fallTime / this.config.armBraceDelay, 1);
        const braceIntensity = this.config.armBraceIntensity || 0.8;

        // Arms extend forward/down toward fall direction
        const armAngle = braceProgress * braceIntensity * (Math.PI / 2.5); // ~70 degrees

        // Left arm
        if (this.bones.leftArm) {
            const armQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0.3).normalize(),
                armAngle
            );
            this.bones.leftArm.quaternion.slerp(armQuat, delta * 10);
        }

        // Right arm
        if (this.bones.rightArm) {
            const armQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, -0.3).normalize(),
                armAngle
            );
            this.bones.rightArm.quaternion.slerp(armQuat, delta * 10);
        }

        // Forearms extend
        const forearmAngle = braceProgress * braceIntensity * (Math.PI / 4); // 45 degrees

        if (this.bones.leftForearm) {
            const forearmQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                -forearmAngle
            );
            this.bones.leftForearm.quaternion.slerp(forearmQuat, delta * 10);
        }

        if (this.bones.rightForearm) {
            const forearmQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                -forearmAngle
            );
            this.bones.rightForearm.quaternion.slerp(forearmQuat, delta * 10);
        }

        // Head tucks for protection
        if (this.bones.neck || this.bones.head) {
            const headTuck = braceProgress * this.config.headProtectionAngle * (Math.PI / 180);
            const tuckQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                headTuck
            );

            if (this.bones.neck) {
                this.bones.neck.quaternion.slerp(tuckQuat, delta * 8);
            }
            if (this.bones.head) {
                this.bones.head.quaternion.slerp(tuckQuat, delta * 6);
            }
        }
    }

    /**
     * Apply falling physics (body rotation, physics blend)
     */
    _applyFallingPhysics(delta) {
        const blending = RagdollConfig.blending;

        // Increase physics blend over time
        this.physicsBlend = Math.min(
            this.physicsBlend + delta * blending.physicsBlendSpeed,
            1.0
        );

        // Rotate body in fall direction
        if (this.bones.hips) {
            // Calculate rotation to face fall direction
            const fallRotationY = Math.atan2(this.fallDirection.x, this.fallDirection.z);

            // Tilt forward in fall direction (up to 60 degrees based on intensity)
            const maxTilt = this._fallIntensity === 'heavy' ? Math.PI / 3 :
                this._fallIntensity === 'light' ? Math.PI / 6 : Math.PI / 4;
            const tiltAngle = this.physicsBlend * maxTilt;

            // Create combined rotation
            const yawQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                fallRotationY
            );

            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                tiltAngle
            );

            const targetQuat = yawQuat.multiply(pitchQuat);

            this.bones.hips.quaternion.slerp(targetQuat, delta * this.config.bodyRotationSpeed);
        }

        // Spine curves slightly to absorb impact
        if (this.bones.spine) {
            const curveAngle = this.physicsBlend * 0.15;
            const curveQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                curveAngle
            );
            this.bones.spine.quaternion.multiply(curveQuat);
        }

        // Legs spread slightly for stability
        if (this.bones.leftUpLeg) {
            const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                this.physicsBlend * 0.2
            );
            this.bones.leftUpLeg.quaternion.multiply(spreadQuat);
        }

        if (this.bones.rightUpLeg) {
            const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                -this.physicsBlend * 0.2
            );
            this.bones.rightUpLeg.quaternion.multiply(spreadQuat);
        }
    }

    /**
     * Apply on-ground pose (character lying on ground)
     */
    _applyGroundPose(delta) {
        // Keep physics blend high but start slight decay
        this.physicsBlend = Math.max(
            this.physicsBlend - delta * 0.5,
            0.7
        );

        // Arms move to push-up position
        if (this.bones.leftArm && this.bones.rightArm) {
            const pushupAngle = Math.PI / 3; // 60 degrees
            const leftQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                pushupAngle
            );
            const rightQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                -pushupAngle
            );

            this.bones.leftArm.quaternion.slerp(leftQuat, delta * 3);
            this.bones.rightArm.quaternion.slerp(rightQuat, delta * 3);
        }
    }

    /**
     * Apply recovery blending (smoothly return to animation)
     */
    _applyRecovery(delta) {
        const recoverySpeed = RagdollConfig.blending.animationRecoverySpeed;

        // Decrease physics blend
        this.physicsBlend = Math.max(
            this.physicsBlend - delta * recoverySpeed,
            0
        );

        // Track recovery progress
        this.recoveryProgress = 1 - this.physicsBlend;

        // Blend bones back to rest poses
        this.restPoses.forEach((restPose, bone) => {
            if (!bone) return;

            // Slerp quaternion
            bone.quaternion.slerp(restPose.quaternion, delta * recoverySpeed);

            // Lerp position (if stored)
            bone.position.lerp(restPose.position, delta * recoverySpeed);
        });

        // Check if recovery complete
        if (this.physicsBlend <= 0.01) {
            this._completeRecovery();
        }
    }

    /**
     * Complete recovery, return to idle state
     */
    _completeRecovery() {
        this.previousState = this.state;
        this.state = 'idle';
        this.physicsBlend = 0;
        this.recoveryProgress = 0;
        this.fallTime = 0;

        if (RagdollConfig.debug.logStateChanges) {
            console.log('[ProceduralFallController] Recovery complete');
        }

        if (this.onRecoveryComplete) {
            this.onRecoveryComplete();
        }
    }

    /**
     * Main update loop
     * @param {number} delta - Time delta in seconds
     * @param {number} [groundHeight] - Current ground height at character position
     */
    update(delta, groundHeight = 0) {
        if (!this.enabled || this.state === 'idle') return;

        this.groundHeight = groundHeight;
        this.fallTime += delta;

        switch (this.state) {
            case 'bracing':
                this._applyBracingPose(delta);

                // Transition to falling after brace delay
                if (this.fallTime > this.config.armBraceDelay) {
                    this.previousState = this.state;
                    this.state = 'falling';
                }
                break;

            case 'falling':
                this._applyBracingPose(delta); // Keep bracing pose
                this._applyFallingPhysics(delta);
                break;

            case 'onGround':
                this.groundTime += delta;
                this._applyGroundPose(delta);

                // Auto-start recovery after delay
                if (this.groundTime > this.config.recoveryDelay) {
                    this.startRecovery();
                }
                break;

            case 'recovering':
                this._applyRecovery(delta);
                break;
        }
    }

    /**
     * Get current physics blend factor (for external blending systems)
     * @returns {number} Blend factor 0-1
     */
    getPhysicsBlend() {
        return this.physicsBlend;
    }

    /**
     * Check if currently in any fall state
     * @returns {boolean} True if falling/on ground/recovering
     */
    isFalling() {
        return this.state !== 'idle';
    }

    /**
     * Check if actively in the air
     * @returns {boolean} True if bracing or falling
     */
    isAirborne() {
        return this.state === 'bracing' || this.state === 'falling';
    }

    /**
     * Check if on ground (hit ground but not yet recovered)
     * @returns {boolean} True if on ground
     */
    isOnGround() {
        return this.state === 'onGround';
    }

    /**
     * Check if recovering from fall
     * @returns {boolean} True if recovering
     */
    isRecovering() {
        return this.state === 'recovering';
    }

    /**
     * Get current state for debugging/UI
     */
    getState() {
        return {
            state: this.state,
            fallTime: this.fallTime,
            groundTime: this.groundTime,
            physicsBlend: this.physicsBlend,
            recoveryProgress: this.recoveryProgress,
            fallDirection: this.fallDirection.clone(),
        };
    }

    /**
     * Enable/disable the controller
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled && this.state !== 'idle') {
            this.forceRecovery();
        }
    }

    /**
     * Reset to idle state
     */
    reset() {
        this.state = 'idle';
        this.previousState = 'idle';
        this.physicsBlend = 0;
        this.fallTime = 0;
        this.groundTime = 0;
        this.recoveryProgress = 0;
        this.restPoses.clear();
    }
}
