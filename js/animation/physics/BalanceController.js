import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';

/**
 * BalanceController
 * 
 * Euphoria-style active balance simulation:
 * 1. Tracks Center of Mass (COM) relative to support polygon (feet)
 * 2. Calculates stability from COM projection onto support base
 * 3. Applies corrective motor forces to maintain upright posture
 * 4. Triggers stumble/fall when balance is irrecoverable
 * 
 * The key insight is that characters don't just "go ragdoll" - they actively
 * fight to maintain balance, creating natural-looking recovery attempts.
 */
export class BalanceController {
    /**
     * @param {THREE.SkinnedMesh} mesh - The character mesh with skeleton
     * @param {Object} options - Override default config options
     */
    constructor(mesh, options = {}) {
        this.mesh = mesh;
        this.enabled = true;

        // CRITICAL: Don't apply motor corrections during normal gameplay
        // Only activate when balance is actually disturbed
        this.isDisturbed = false;
        this.disturbedTime = 0;
        this.disturbedRecoveryTime = 1.0; // Seconds before returning to normal (increased for visibility)

        // Configuration (merge with defaults)
        this.config = { ...RagdollConfig.balance, ...options };

        // ==================== BONES ====================
        this.bones = {
            hips: null,
            spine: null,
            spine1: null,
            spine2: null,
            chest: null,
            head: null,
            neck: null,
            leftFoot: null,
            rightFoot: null,
            leftLeg: null,
            rightLeg: null,
            leftUpLeg: null,
            rightUpLeg: null,
        };

        this.boneRegistry = {
            hips: [],
            spine: [],
            spine1: [],
            spine2: [],
            chest: [],
            head: [],
            neck: [],
            leftFoot: [],
            rightFoot: [],
            leftLeg: [],
            rightLeg: [],
            leftUpLeg: [],
            rightUpLeg: [],
            leftArm: [],
            rightArm: [],
        };

        // ==================== STATE ====================
        this.centerOfMass = new THREE.Vector3();
        this.previousCOM = new THREE.Vector3();
        this.comVelocity = new THREE.Vector3();

        this.supportCenter = new THREE.Vector3();
        this.supportPolygon = []; // Array of foot positions

        this.balanceAngle = 0;              // Current tilt from vertical (degrees)
        this.balanceDirection = new THREE.Vector3(); // Direction of imbalance
        this.isStable = true;
        this.stabilityFactor = 1.0;         // 0 = falling, 1 = perfectly balanced

        // Angular momentum (for momentum-based stumbling)
        this.angularMomentum = new THREE.Vector3();
        this.linearMomentum = new THREE.Vector3();

        // Motor targets (desired bone orientations from rest pose)
        // NOTE: These are captured AFTER first animation frame, not in constructor
        this.motorTargets = new Map();
        this.motorStrengths = new Map();
        this.motorTargetsInitialized = false;

        // Recovery state
        this.isRecovering = false;
        this.recoveryProgress = 0;

        // Initialize bones only (motor targets captured later)
        this._findBones();
    }

    /**
     * Find and cache bone references
     * Supports Unreal Engine skeleton naming (pelvis, spine_01, thigh_l, etc.)
     */
    /**
     * Find and cache bone references
     */
    _findBones() {
        // Reset registry
        Object.keys(this.boneRegistry).forEach(key => this.boneRegistry[key] = []);

        this.mesh.traverse(child => {
            if (!child.isBone) return;
            const name = child.name.toLowerCase();

            // Pelvis / Hips
            if (name === 'pelvis' || name.includes('hips')) {
                if (!this.bones.hips) this.bones.hips = child;
                this.boneRegistry.hips.push(child);
            }

            // Spine chain
            if (name === 'spine_01' || (name === 'spine' && !name.includes('_'))) {
                if (!this.bones.spine) this.bones.spine = child;
                this.boneRegistry.spine.push(child);
            }
            if (name === 'spine_02' || name === 'spine1') {
                if (!this.bones.spine1) this.bones.spine1 = child;
                this.boneRegistry.spine1.push(child);
            }
            if (name === 'spine_03' || name === 'spine_04' || name === 'spine2') {
                if (!this.bones.spine2) this.bones.spine2 = child;
                if (!this.bones.chest) this.bones.chest = child;
                this.boneRegistry.spine2.push(child);
                this.boneRegistry.chest.push(child);
            }

            // Head and neck
            if (name === 'head') {
                if (!this.bones.head) this.bones.head = child;
                this.boneRegistry.head.push(child);
            }
            if (name === 'neck_01' || name === 'neck') {
                if (!this.bones.neck) this.bones.neck = child;
                this.boneRegistry.neck.push(child);
            }

            // Feet
            if (name === 'foot_l' || name.includes('leftfoot')) {
                if (!this.bones.leftFoot) this.bones.leftFoot = child;
                this.boneRegistry.leftFoot.push(child);
            }
            if (name === 'foot_r' || name.includes('rightfoot')) {
                if (!this.bones.rightFoot) this.bones.rightFoot = child;
                this.boneRegistry.rightFoot.push(child);
            }

            // Lower legs
            if (name === 'calf_l' || (name.includes('leftleg') && !name.includes('upleg'))) {
                if (!this.bones.leftLeg) this.bones.leftLeg = child;
                this.boneRegistry.leftLeg.push(child);
            }
            if (name === 'calf_r' || (name.includes('rightleg') && !name.includes('upleg'))) {
                if (!this.bones.rightLeg) this.bones.rightLeg = child;
                this.boneRegistry.rightLeg.push(child);
            }

            // Upper legs
            if (name === 'thigh_l' || name.includes('leftupleg') || name.includes('leftthigh')) {
                if (!this.bones.leftUpLeg) this.bones.leftUpLeg = child;
                this.boneRegistry.leftUpLeg.push(child);
            }
            if (name === 'thigh_r' || name.includes('rightupleg') || name.includes('rightthigh')) {
                if (!this.bones.rightUpLeg) this.bones.rightUpLeg = child;
                this.boneRegistry.rightUpLeg.push(child);
            }

            // Arms
            if (name.includes('upperarm_l') || name.includes('leftarm')) this.boneRegistry.leftArm.push(child);
            if (name.includes('upperarm_r') || name.includes('rightarm')) this.boneRegistry.rightArm.push(child);
        });

        const foundBones = Object.keys(this.bones).filter(k => this.bones[k]);
        console.log(`[BalanceController] Found ${foundBones.length} primary bones. Registry: ${this.boneRegistry.hips.length} skeletons.`);

        if (!this.bones.hips) console.warn('[BalanceController] CRITICAL: Hips/Pelvis not found!');
    }

    /**
     * Store rest pose orientations as motor targets
     * Called once after first animation frame to capture correct poses
     */
    /**
     * Store rest pose orientations as motor targets
     * Called once after first animation frame to capture correct poses
     */
    _initializeMotorTargets() {
        if (this.motorTargetsInitialized) return;
        const motors = RagdollConfig.motors;

        // Populate targets for ALL registered bones
        Object.keys(this.boneRegistry).forEach(key => {
            const boneArray = this.boneRegistry[key];
            boneArray.forEach(bone => {
                this.motorTargets.set(bone, bone.quaternion.clone());

                // Set strength based on type
                if (key === 'hips') this.motorStrengths.set(bone, motors.spineStrength);
                else if (key.includes('spine') || key === 'chest') this.motorStrengths.set(bone, motors.spineStrength);
                else if (key.includes('head') || key.includes('neck')) this.motorStrengths.set(bone, motors.headStrength);
                else if (key.includes('Leg') || key.includes('Foot')) this.motorStrengths.set(bone, motors.legStrength);
                else if (key.includes('Arm')) this.motorStrengths.set(bone, motors.armStrength);
                else this.motorStrengths.set(bone, 0.3); // Default
            });
        });

        this.motorTargetsInitialized = true;
        console.log(`[BalanceController] Motor targets initialized for ${this.motorTargets.size} bones`);
    }

    /**
     * Calculate Center of Mass from weighted bone positions
     * Uses anatomically-inspired weight distribution
     */
    _calculateCenterOfMass() {
        // Store previous for velocity calculation
        this.previousCOM.copy(this.centerOfMass);

        // Weight distribution (approximate human body)
        const weights = {
            hips: 0.35,      // Pelvis is heavy
            spine2: 0.20,    // Torso
            head: 0.08,      // Head
            leftUpLeg: 0.10, // Upper legs
            rightUpLeg: 0.10,
            leftLeg: 0.05,   // Lower legs  
            rightLeg: 0.05,
            leftFoot: 0.035,
            rightFoot: 0.035,
        };

        const com = new THREE.Vector3();
        let totalWeight = 0;

        Object.entries(weights).forEach(([boneName, weight]) => {
            const bone = this.bones[boneName];
            if (!bone) return;

            const pos = new THREE.Vector3();
            bone.getWorldPosition(pos);
            com.addScaledVector(pos, weight);
            totalWeight += weight;
        });

        if (totalWeight > 0) {
            com.divideScalar(totalWeight);
        }

        this.centerOfMass.copy(com);
    }

    /**
     * Calculate support polygon (convex hull of grounded feet)
     */
    _calculateSupportBase() {
        this.supportPolygon = [];

        const leftPos = new THREE.Vector3();
        const rightPos = new THREE.Vector3();

        if (this.bones.leftFoot) {
            this.bones.leftFoot.getWorldPosition(leftPos);
            this.supportPolygon.push(leftPos.clone());
        }

        if (this.bones.rightFoot) {
            this.bones.rightFoot.getWorldPosition(rightPos);
            this.supportPolygon.push(rightPos.clone());
        }

        // Calculate center of support
        if (this.supportPolygon.length >= 2) {
            this.supportCenter.set(
                (leftPos.x + rightPos.x) / 2,
                Math.min(leftPos.y, rightPos.y), // Ground level
                (leftPos.z + rightPos.z) / 2
            );
        } else if (this.supportPolygon.length === 1) {
            this.supportCenter.copy(this.supportPolygon[0]);
        }
    }

    /**
     * Calculate balance angle - the tilt of COM from vertical above support
     * @returns {number} Angle in degrees
     */
    _calculateBalanceAngle() {
        // Project COM onto support plane (XZ at support height)
        const comProjected = this.centerOfMass.clone();
        comProjected.y = this.supportCenter.y;

        // Vector from support center to COM projection
        const offset = comProjected.clone().sub(this.supportCenter);
        this.balanceDirection.copy(offset).normalize();

        // Height of COM above support
        const height = this.centerOfMass.y - this.supportCenter.y;

        if (height <= 0.1) {
            // On or below ground - very unstable
            this.balanceAngle = 90;
            return 90;
        }

        // Angle = atan(horizontal_offset / height)
        const horizontalDist = offset.length();
        this.balanceAngle = Math.atan2(horizontalDist, height) * (180 / Math.PI);

        return this.balanceAngle;
    }

    /**
     * Update stability factor (0-1) based on balance angle
     */
    _updateStability() {
        const stable = this.config.stabilityConeAngle;
        const critical = this.config.criticalAngle;

        if (this.balanceAngle <= stable) {
            // Perfectly stable zone
            this.stabilityFactor = 1.0;
            this.isStable = true;
        } else if (this.balanceAngle >= critical) {
            // Past point of no return
            this.stabilityFactor = 0.0;
            this.isStable = false;
        } else {
            // Transition zone - can still recover
            this.stabilityFactor = 1.0 - (this.balanceAngle - stable) / (critical - stable);
            // Consider stable if above 30% stability
            this.isStable = this.stabilityFactor > 0.3;
        }
    }

    /**
     * Apply motor forces to correct posture
     * Motors try to return bones to their rest orientation
     */
    _applyMotorCorrections(delta) {
        if (this.stabilityFactor <= 0) return; // Don't fight when completely fallen

        const correctionSpeed = RagdollConfig.motors.correctionSpeed;
        const damping = RagdollConfig.motors.dampingFactor;

        this.motorTargets.forEach((targetQuat, bone) => {
            if (!bone) return;

            const strength = this.motorStrengths.get(bone) || 0.5;
            const effectiveStrength = strength * this.stabilityFactor;

            // Calculate correction blend factor
            const blendFactor = Math.min(delta * correctionSpeed * effectiveStrength, 1);

            // Slerp current orientation towards target
            bone.quaternion.slerp(targetQuat, blendFactor);
        });
    }

    /**
     * Apply momentum effects (tilts character based on accumulated forces)
     */
    _applyMomentum(delta) {
        // Angular momentum causes rotation
        if (this.angularMomentum.lengthSq() > 0.0001) {

            const rotationAxis = this.angularMomentum.clone();

            if (rotationAxis.lengthSq() > 0.0001) {
                rotationAxis.normalize();

                const rotationAmount = this.angularMomentum.length() * delta;
                const rotQuatWorld = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAmount);

                const applyToBone = (bone) => {
                    // Transform World Rotation to Local Space
                    // We want: WorldRot_New = RotWorld * WorldRot_Old
                    // Local_New = (InvParentWorld * RotWorld * ParentWorld) * Local_Old

                    if (!bone) return;

                    const parentQuatWorld = new THREE.Quaternion();
                    if (bone.parent) {
                        bone.parent.getWorldQuaternion(parentQuatWorld);
                    }

                    const invParent = parentQuatWorld.clone().invert();
                    const localDelta = invParent.multiply(rotQuatWorld).multiply(parentQuatWorld);

                    // Apply delta
                    bone.quaternion.premultiply(localDelta);
                };

                // Apply to ALL hips
                if (this.boneRegistry && this.boneRegistry.hips) {
                    this.boneRegistry.hips.forEach(applyToBone);
                } else if (this.bones.hips) {
                    applyToBone(this.bones.hips);
                }
            }
        }

        // Decay momentum (air resistance / friction)
        const decayRate = 1 - delta * 3;
        this.angularMomentum.multiplyScalar(Math.max(decayRate, 0));
        this.linearMomentum.multiplyScalar(Math.max(decayRate, 0));
    }

    /**
     * Apply external force that disturbs balance
     * @param {THREE.Vector3} force - Force vector in world space
     * @param {THREE.Vector3} point - Application point (optional, defaults to COM)
     * @returns {string} Response type: 'absorbed', 'stumble', 'stagger', 'fall', 'knockdown'
     */
    applyForce(force, point = null) {
        const magnitude = force.length();
        const thresholds = RagdollConfig.impact;

        // Calculate torque from force applied at point
        // Calculate torque from force applied at point
        if (point) {
            const lever = point.clone().sub(this.centerOfMass);
            const torque = new THREE.Vector3().crossVectors(lever, force);
            this.angularMomentum.add(torque.multiplyScalar(0.01));
        } else {
            // Direct force adds to angular momentum based on direction
            const torqueDir = new THREE.Vector3(force.z, 0, -force.x).normalize();
            // Sensitivity: 0.025 provides visible reaction without spinning
            this.angularMomentum.addScaledVector(torqueDir, magnitude * 0.025);
        }

        // Add to linear momentum
        this.linearMomentum.add(force.clone().multiplyScalar(0.05));

        // Determine response based on magnitude
        let response;
        if (magnitude < thresholds.stumbleThreshold) {
            response = 'absorbed';
        } else if (magnitude < thresholds.staggerThreshold) {
            response = 'stumble';
        } else if (magnitude < thresholds.fallThreshold) {
            response = 'stagger';
        } else if (magnitude < thresholds.knockdownThreshold) {
            response = 'fall';
        } else {
            response = 'knockdown';
        }

        // Activate physics mode when force is significant
        if (response !== 'absorbed') {
            this.isDisturbed = true;
            this.disturbedTime = 0;
        }

        if (RagdollConfig.debug.logStateChanges && response !== 'absorbed') {
            console.log(`[BalanceController] Force applied: ${magnitude.toFixed(1)}, response: ${response}`);
        }

        return response;
    }

    /**
     * Main update loop
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (!this.enabled || !this.bones.hips) return;

        // CRITICAL: Only process physics when actually disturbed
        // This prevents fighting with normal animation
        if (!this.isDisturbed) {
            // Just track state, don't apply any forces
            this._calculateCenterOfMass();
            this._calculateSupportBase();
            return;
        }

        // Initialize motor targets on first disturbed frame (captures animation pose)
        if (!this.motorTargetsInitialized) {
            this._initializeMotorTargets();
        }

        // 1. Calculate current state
        this._calculateCenterOfMass();
        this._calculateSupportBase();
        this._calculateBalanceAngle();
        this._updateStability();

        // 2. Calculate COM velocity (for momentum tracking)
        this.comVelocity.subVectors(this.centerOfMass, this.previousCOM).divideScalar(delta);

        // 3. Apply momentum effects (only when disturbed)
        this._applyMomentum(delta);

        // 4. Apply corrective motor forces (only if stable enough)
        if (this.isStable) {
            this._applyMotorCorrections(delta);
        }

        // 5. Track disturbed time and auto-recover
        // NOTE: Don't recover if still in an active ragdoll state (stumbling/staggering)
        this.disturbedTime += delta;

        // DEBUG: Log recovery check values
        if (this.disturbedTime > 0.9) {
            console.log(`[BalanceController] Recovery check: time=${this.disturbedTime.toFixed(2)}, recoveryTime=${this.disturbedRecoveryTime}, isStable=${this.isStable}, momentum=${this.angularMomentum.length().toFixed(3)}`);
        }

        if (this.disturbedTime > this.disturbedRecoveryTime && this.isStable && this.angularMomentum.length() < 0.01) {
            // Recovered from disturbance
            this.isDisturbed = false;
            this.disturbedTime = 0;
            console.log('[BalanceController] Recovered from disturbance');
        }
    }

    /**
     * Get current balance state for external systems
     * @returns {Object} Current balance state
     */
    getState() {
        return {
            isStable: this.isStable,
            stabilityFactor: this.stabilityFactor,
            balanceAngle: this.balanceAngle,
            balanceDirection: this.balanceDirection.clone(),
            centerOfMass: this.centerOfMass.clone(),
            supportCenter: this.supportCenter.clone(),
            angularMomentum: this.angularMomentum.clone(),
        };
    }

    /**
     * Reset balance state to neutral
     */
    reset() {
        this.angularMomentum.set(0, 0, 0);
        this.linearMomentum.set(0, 0, 0);
        this.stabilityFactor = 1.0;
        this.isStable = true;
        this.balanceAngle = 0;
        this.isDisturbed = false;
        this.disturbedTime = 0;

        // Clear motor targets so they can be recaptured
        this.motorTargets.clear();
        this.motorStrengths.clear();
        this.motorTargetsInitialized = false;
    }

    /**
     * Enable/disable the balance controller
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.reset();
        }
    }
}
