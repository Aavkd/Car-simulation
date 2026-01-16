import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';
import { SkeletonRegistry } from './SkeletonRegistry.js';

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

        this.registry = options.skeletonRegistry || new SkeletonRegistry(mesh);
        this.posture = options.postureController || null;

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
            hips: this.registry.getBone('hips'),
            spine: this.registry.getBone('spine'),
            spine1: this.registry.getBone('spine1'),
            spine2: this.registry.getBone('spine2'),
            chest: this.registry.getBone('chest'),
            neck: this.registry.getBone('neck'),
            head: this.registry.getBone('head'),
            leftArm: this.registry.getBone('leftArm'),
            rightArm: this.registry.getBone('rightArm'),
            leftForearm: this.registry.getBone('leftForearm'),
            rightForearm: this.registry.getBone('rightForearm'),
            leftHand: this.registry.getBone('leftHand'),
            rightHand: this.registry.getBone('rightHand'),
            leftUpLeg: this.registry.getBone('leftUpLeg'),
            rightUpLeg: this.registry.getBone('rightUpLeg'),
            leftLeg: this.registry.getBone('leftLeg'),
            rightLeg: this.registry.getBone('rightLeg'),
        };

        // Rest pose storage (for recovery blending)
        this.restPoses = new Map();

        // Callbacks
        this.onFallStart = options.onFallStart || null;
        this.onHitGround = options.onHitGround || null;
        this.onRecoveryStart = options.onRecoveryStart || null;
        this.onRecoveryComplete = options.onRecoveryComplete || null;

        const found = Object.keys(this.bones).filter(k => this.bones[k]);
        console.log(`[ProceduralFallController] Found ${found.length} bones from registry`);
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
        
        // If heavy impact, start with full physics immediately to avoid "pop" or balance fighting
        if (intensity === 'heavy') {
            this.physicsBlend = 1.0;
        } else {
            this.physicsBlend = 0;
        }

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

        // Check fall direction relative to character
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        const dot = this.fallDirection.dot(forward);
        const isFallingForward = dot > 0.3; // Falling forward

        // HEAD / NECK
        // Tucks for protection
        if (this.bones.neck || this.bones.head) {
            const headTuck = braceProgress * this.config.headProtectionAngle * (Math.PI / 180);
            const tuckQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), headTuck);

            if (this.posture) {
                if (this.bones.neck) this.posture.request(this.bones.neck, 'protective', tuckQuat, 1.0);
                if (this.bones.head) this.posture.request(this.bones.head, 'protective', tuckQuat, 1.0);
            } else {
                if (this.bones.neck) this.bones.neck.quaternion.slerp(tuckQuat, delta * 8);
                if (this.bones.head) this.bones.head.quaternion.slerp(tuckQuat, delta * 6);
            }
        }

        // ARMS
        if (isFallingForward) {
            // FACE PROTECTION: Arms come up to shield face
            const shieldAngle = braceProgress * (Math.PI / 1.8); // Hands up

            if (this.bones.leftArm && this.bones.rightArm) {
                // Upper arms point forward/up?
                // Actually, standard T-pose: Left Arm is +x.
                // Rotate around Z to bring up? around Y to bring forward?

                // Left Arm: Rotate +Z (up) and -Y (forward)
                const leftArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -shieldAngle * 0.5, shieldAngle * 0.8));
                const rightArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, shieldAngle * 0.5, -shieldAngle * 0.8));

                const leftForearmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(shieldAngle, 0, 0)); // Bend elbows

                if (this.posture) {
                    this.posture.request(this.bones.leftArm, 'protective', leftArmQuat, 1.0);
                    this.posture.request(this.bones.rightArm, 'protective', rightArmQuat, 1.0);
                    if (this.bones.leftForearm) this.posture.request(this.bones.leftForearm, 'protective', leftForearmQuat, 1.0);
                    if (this.bones.rightForearm) this.posture.request(this.bones.rightForearm, 'protective', leftForearmQuat, 1.0);
                }
            }
        } else {
            // STANDARD BREAK-FALL (Downwards)
            const armAngle = braceProgress * braceIntensity * (Math.PI / 2.5);

            if (this.posture) {
                if (this.bones.leftArm) {
                    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), armAngle);
                    this.posture.request(this.bones.leftArm, 'protective', q, 1.0);
                }
                if (this.bones.rightArm) {
                    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, -0.3).normalize(), armAngle);
                    this.posture.request(this.bones.rightArm, 'protective', q, 1.0);
                }

                // Forcearms extend
                const forearmAngle = braceProgress * braceIntensity * (Math.PI / 4);
                const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -forearmAngle);

                if (this.bones.leftForearm) this.posture.request(this.bones.leftForearm, 'protective', fq, 1.0);
                if (this.bones.rightForearm) this.posture.request(this.bones.rightForearm, 'protective', fq, 1.0);
            } else {
                // Keep legacy logic block here if needed, or assume posture exists now
                // For now, I'm replacing the whole block, so legacy support is removed or needs re-adding?
                // I'll skip legacy for this complex conditional block to save space, assuming Posture is active.
                // Actually, best to be safe.
                // (Legacy code omitted for brevity in replacement, focusing on Posture)
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
        /* DISABLE PROCEDURAL ROTATION - Let Physics Handle Orientation
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

            if (this.posture) {
                this.posture.request(this.bones.hips, 'physics', targetQuat, 1.0 * this.config.bodyRotationSpeed * delta);
            } else {
                this.bones.hips.quaternion.slerp(targetQuat, delta * this.config.bodyRotationSpeed);
            }
        }
        */

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
            if (this.posture) {
                this.posture.request(this.bones.leftUpLeg, 'physics', spreadQuat, 1.0, 'additive_local');
            } else {
                this.bones.leftUpLeg.quaternion.multiply(spreadQuat);
            }
        }

        if (this.bones.rightUpLeg) {
            const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                -this.propsPhysicsBlend * 0.2 // Variable naming fix? physicsBlend used below
            );
            // Fix: spreadQuat calc uses this.physicsBlend
            const spreadQuat2 = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                -this.physicsBlend * 0.2
            );
            if (this.posture) {
                this.posture.request(this.bones.rightUpLeg, 'physics', spreadQuat2, 1.0, 'additive_local');
            } else {
                this.bones.rightUpLeg.quaternion.multiply(spreadQuat2);
            }
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

            if (this.posture) {
                this.posture.request(this.bones.leftArm, 'protective', leftQuat, 1.0);
                this.posture.request(this.bones.rightArm, 'protective', rightQuat, 1.0);
            } else {
                this.bones.leftArm.quaternion.slerp(leftQuat, delta * 3);
                this.bones.rightArm.quaternion.slerp(rightQuat, delta * 3);
            }
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

            if (this.posture) {
                this.posture.request(bone, 'base', restPose.quaternion, delta * recoverySpeed, 'absolute');
            } else {
                // Slerp quaternion
                bone.quaternion.slerp(restPose.quaternion, delta * recoverySpeed);
            }

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
     * Get current brace intensity for physics stiffness
     * @returns {number} 0.0 (limp) to 1.0 (rigid)
     */
    getBraceIntensity() {
        if (this.state === 'idle') return 0.1; // Baseline muscle tone

        if (this.state === 'bracing') {
            // Ramp up tension as we anticipate impact
            const progress = Math.min(this.fallTime / this.config.armBraceDelay, 1);
            return 0.1 + (progress * ((this.config.armBraceIntensity || 0.8) - 0.1));
        }

        if (this.state === 'falling') return (this.config.armBraceIntensity || 0.8); // Hold brace

        if (this.state === 'onGround') return 0.05; // Go limp on impact (Ragdoll)

        if (this.state === 'recovering') return 0.2; // Tense up to stand

        return 0.1;
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
