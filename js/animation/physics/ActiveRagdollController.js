import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';
import { SkeletonRegistry } from './SkeletonRegistry.js';
import { BalanceController } from './BalanceController.js';
import { ImpactResponseSystem } from './ImpactResponseSystem.js';
import { ProceduralFallController } from './ProceduralFallController.js';
import { RagdollPhysics } from './RagdollPhysics.js';
import { PostureController } from './PostureController.js';

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

        // Initialize SkeletonRegistry FIRST (shared by controllers)
        // If options already has a registry, use it, otherwise create one
        this.registry = options.skeletonRegistry || new SkeletonRegistry(mesh);

        // Alias for internal usage (referencing the registry's storage directly)
        this.boneRegistry = this.registry.bones;
        this.skinnedMeshes = this.registry.skinnedMeshes;

        // Posture System (Arbitrates bone rotations)
        this.posture = new PostureController(this.registry);

        this.balance = new BalanceController(mesh, {
            ...options,
            skeletonRegistry: this.registry,
            postureController: this.posture
        });

        this.impact = new ImpactResponseSystem(this.entity, {
            onStumble: (impact) => this._handleStumble(impact),
            onStagger: (impact) => this._handleStagger(impact),
            onFall: (impact) => this._handleFall(impact),
            onKnockdown: (impact) => this._handleKnockdown(impact),
        });

        // Pass registry to ProceduralFallController
        this.fall = new ProceduralFallController(mesh, {
            characterHeight: options.characterHeight || 5.5,
            skeletonRegistry: this.registry,
            postureController: this.posture,
            onFallStart: (dir, intensity) => this._onFallStart(dir, intensity),
            onHitGround: (velocity) => this._onHitGround(velocity),
            onRecoveryStart: () => this._onRecoveryStart(),
            onRecoveryComplete: () => this._onRecoveryComplete(),
        });

        // ==================== PHYSICS SYSTEM ====================
        this.physics = new RagdollPhysics({
            terrain: this.terrain
        });
        this.physicsInitialized = false;

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

        // ==================== CALLBACKS ====================
        this.onStateChange = options.onStateChange || null;
        this.onImpact = options.onImpact || null;

        // Initialize physics after finding bones
        this._initPhysics();
    }

    /**
     * Initialize Verlet physics system
     * Create particles for key bones and constraints between them
     */
    _initPhysics() {
        if (this.physicsInitialized) return;

        // We need a connected skeleton graph.
        // boneRegistry gives us types, but we need the hierarchy.
        // We'll traverse from hips.

        if (this.boneRegistry.hips.length === 0) return;

        const hips = this.boneRegistry.hips[0]; // Main skeleton hips

        // Helper to add recursive bone chain
        const addChain = (bone, parentParticle = null) => {
            // Add particle for this bone
            const config = RagdollConfig.physics;
            let mass = config.mass.default;
            const name = bone.name.toLowerCase();

            if (name.includes('pelvis') || name.includes('hips')) mass = config.mass.hips;
            else if (name.includes('spine')) mass = config.mass.spine;
            else if (name.includes('head')) mass = config.mass.head;
            else if (name.includes('thigh') || name.includes('upleg')) mass = config.mass.thigh;
            else if (name.includes('calf') || name.includes('leg')) mass = config.mass.leg;
            else if (name.includes('arm')) mass = config.mass.arm;

            const particle = this.physics.addParticle(bone, mass);

            // Connect to parent
            if (parentParticle) {
                // Determine stiffness based on joint type
                let stiffness = config.stiffness.default;

                // Spine is more rigid
                if (name.includes('spine') || name.includes('head')) {
                    stiffness = config.stiffness.rigid;
                }

                this.physics.addConstraint(parentParticle, particle, stiffness);
            }

            // Recurse to children ONLY if they are relevant physical bones
            // (Standard UE4/Mixamo hierarchy)
            bone.children.forEach(child => {
                if (!child.isBone) return;
                const cName = child.name.toLowerCase();

                // Filter out twist bones, fingers, etc. for performance
                const relevant = [
                    'spine', 'neck', 'head',
                    'upperarm', 'lowerarm', 'hand',
                    'thigh', 'calf', 'foot'
                ];

                const isRelevant = relevant.some(k => cName.includes(k));
                if (isRelevant) {
                    addChain(child, particle);
                }
            });
        };

        addChain(hips);
        this.physicsInitialized = true;
        console.log(`[ActiveRagdollController] Physics initialized with ${this.physics.particles.length} particles`);
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

        // Pick a random leg to step with (0 = Left, 1 = Right)
        this.stumbleLegIndex = Math.random() > 0.5 ? 1 : 0;
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
        this.physics.matchAnimation();
    }

    /**
     * Apply stumble movement (recovery step)
     * Uses ADDITIVE rotation on top of animation
     */
    _applyStumble(delta) {
        const stumbleConfig = RagdollConfig.stumble;

        this.stumbleProgress += delta * stumbleConfig.stepSpeed;
        this.stumbleElapsed = (this.stumbleElapsed || 0) + delta;

        // Apply visual "Step" movement (Root Motion)
        if (this.stumbleProgress < 1.0) {
            const stepMove = delta * stumbleConfig.stepSpeed * stumbleConfig.stepDistance;
            const moveVec = this.stumbleDirection.clone().multiplyScalar(stepMove);
            this.mesh.position.add(moveVec);
        }

        // Calculate sway - Reduced intensity
        const appliedSway = Math.sin(this.stumbleProgress * Math.PI) * 0.4;

        // 1. Calculate the rotation axis in WORLD space
        const worldAxis = this.stumbleDirection.clone().cross(new THREE.Vector3(0, 1, 0));
        if (worldAxis.lengthSq() < 0.001) worldAxis.set(1, 0, 0);
        worldAxis.normalize();

        // 2. Create the world-space rotation quaternion
        const swayQuatWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, appliedSway);

        // 3. Apply to hips (Absolute modification of current frame)
        if (this.boneRegistry.hips.length > 0) {
            this.boneRegistry.hips.forEach(hipBone => {
                // Get parent world quaternion
                const parentQuatWorld = new THREE.Quaternion();
                if (hipBone.parent) {
                    hipBone.parent.getWorldQuaternion(parentQuatWorld);
                }

                // Convert World Sway to Local Delta
                // NewLocal = InvParent * (Sway * CurrentWorld)
                //          = InvParent * Sway * (Parent * CurrentLocal)

                // Optimized: calculate torque in local space
                const invParent = parentQuatWorld.clone().invert();
                // Phase 1.2: Fix quaternion mutation - use .copy() before .multiply() chain
                const localSway = new THREE.Quaternion()
                    .copy(invParent)
                    .multiply(swayQuatWorld)
                    .multiply(parentQuatWorld);

                // Apply to current animation pose via PostureController
                this.posture.request(hipBone, 'impulse', localSway, 1.0, 'additive');
            });

            this.mesh.updateMatrixWorld(true);

            // Apply smaller sway to spine
            if (this.boneRegistry.spine.length > 0) {
                const spineSwayWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, appliedSway * 0.5);
                this.boneRegistry.spine.forEach(spineBone => {
                    const parentQuatWorld = new THREE.Quaternion();
                    if (spineBone.parent) spineBone.parent.getWorldQuaternion(parentQuatWorld);
                    const invParent = parentQuatWorld.clone().invert();
                    // Phase 1.2b: Fix quaternion mutation - use .copy() before .multiply() chain
                    const localSway = new THREE.Quaternion()
                        .copy(invParent)
                        .multiply(spineSwayWorld)
                        .multiply(parentQuatWorld);
                    this.posture.request(spineBone, 'impulse', localSway, 1.0, 'additive');
                });
            }

            // Update skeletons
            this.skinnedMeshes.forEach(m => m.skeleton && m.skeleton.update());
            this.mesh.updateMatrixWorld(true);

            // 4. Procedural Leg Step
            const stepHeight = Math.sin(this.stumbleProgress * Math.PI);
            const stepAngle = stepHeight * 0.8;
            const kneeBend = stepHeight * 1.5;

            if (this.boneRegistry.leftUpLeg.length > 0 && this.boneRegistry.rightUpLeg.length > 0) {
                const leftUpLeg = this.boneRegistry.leftUpLeg[0];
                const rightUpLeg = this.boneRegistry.rightUpLeg[0];
                const leftLeg = this.boneRegistry.leftLeg[0];
                const rightLeg = this.boneRegistry.rightLeg[0];

                if (leftUpLeg && rightUpLeg) {
                    const isRightSwing = this.stumbleLegIndex === 1;
                    const swingThigh = isRightSwing ? rightUpLeg : leftUpLeg;
                    const swingCalf = isRightSwing ? rightLeg : leftLeg;

                    // Thigh Step
                    const thighQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, -stepAngle);

                    const parentQuatWorld = new THREE.Quaternion();
                    if (swingThigh.parent) swingThigh.parent.getWorldQuaternion(parentQuatWorld);
                    const invParent = parentQuatWorld.clone().invert();
                    // Fix quaternion mutation - use .copy() before .multiply() chain
                    const localStep = new THREE.Quaternion()
                        .copy(invParent)
                        .multiply(thighQuat)
                        .multiply(parentQuatWorld);
                    this.posture.request(swingThigh, 'impulse', localStep, 1.0, 'additive');

                    // Knee Bend (Local X axis usually)
                    const kneeAxis = new THREE.Vector3(1, 0, 0);
                    const kneeQuat = new THREE.Quaternion().setFromAxisAngle(kneeAxis, kneeBend);
                    if (swingCalf) {
                        this.posture.request(swingCalf, 'impulse', kneeQuat, 1.0, 'additive_local');
                    }
                }
            }
        }

        // Check recovery
        const minDuration = this.stumbleMinDuration || stumbleConfig.recoveryTime;
        if (this.stumbleElapsed >= minDuration && this.stumbleProgress >= 1) {
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

        // Apply drift movement (stumbling around)
        // Move later in the stagger to simulate losing ground
        const driftSpeed = 0.8 * (Math.sin(this.staggerTime * 5) * 0.5 + 1.0); // Variable speed
        const moveVec = this.balance.balanceDirection.clone().multiplyScalar(delta * driftSpeed);
        // Remove Y component to keep on ground (though physics/fall controller handles Y usually)
        moveVec.y = 0;
        this.mesh.position.add(moveVec);

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
                // Phase 1.2c: Fix quaternion mutation - use .copy() before .multiply() chain
                const localSway = new THREE.Quaternion()
                    .copy(invParent)
                    .multiply(swayQuatWorld)
                    .multiply(parentQuatWorld);
                this.posture.request(bone, 'impulse', localSway, 1.0, 'additive');
            });
        }

        // Flail arms
        const armFlail = Math.sin(this.staggerTime * staggerConfig.swaySpeed * 2 * Math.PI) * staggerConfig.armFlailIntensity;
        const leftFlail = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), armFlail + 0.3);
        const rightFlail = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -armFlail - 0.3);

        this.boneRegistry.leftArm.forEach(bone => this.posture.request(bone, 'impulse', leftFlail, 1.0, 'additive_local'));
        this.boneRegistry.rightArm.forEach(bone => this.posture.request(bone, 'impulse', rightFlail, 1.0, 'additive_local'));

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

        // ==================== STIFFNESS CONTROL ====================
        // Drive physics stiffness based on high-level intent
        let stiffness = 0.1; // Default loose/relaxed

        if (this.state === 'stumbling' || this.state === 'staggering') {
            stiffness = 0.6; // Firm up to regain balance
        } else if (this.fall && this.fall.isFalling()) {
            stiffness = this.fall.getBraceIntensity();
        }

        this.physics.setStiffnessMultiplier(stiffness);

        // Update velocity tracking
        this._updateVelocity(delta);

        // Reset posture modifications for this frame
        this.posture.reset();

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

                // physicsBlend of 1.0 means mostly physics control
                if (this.physicsBlend > 0.0) {
                    // 1. Update Physics
                    this.physics.update(delta);

                    // 2. Sync Visuals (Physics -> Bones)
                    // Only apply if blend is significant, otherwise we might just be starting
                    this._syncPhysicsToBones(this.physicsBlend);
                } else {
                    // Match animation positions so physics is ready
                    this.physics.matchAnimation();
                }
                break;

            case 'recovering':
                this.fall.update(delta);
                this.physicsBlend = this.fall.getPhysicsBlend();

                // In recovery, we want to blend FROM physics TO animation
                // physicsBlend goes 1 -> 0
                if (this.physicsBlend > 0) {
                    // Soft physics update (keep gravity working but drag towards animation)
                    this.physics.update(delta);
                    this._syncPhysicsToBones(this.physicsBlend);
                }
                break;
        }

        // Apply final posture to bones
        this.posture.apply();
    }

    /**
     * Apply simplified physics positions to bones
     * Iterative Forward Kinematics with World Space Unification
     */
    _syncPhysicsToBones(blendWeight) {
        if (!this.physicsInitialized) return;

        // 1. Set Root (Hips) Position directly
        const hips = this.boneRegistry.hips[0];
        const hipsParticle = this.physics.getParticlePosition(hips);

        if (hips && hipsParticle) {
            // PHASE 2: Root Anchoring (Drifting Fix)
            if (blendWeight > 0.5) {
                this.mesh.position.x = hipsParticle.x;
                this.mesh.position.z = hipsParticle.z;

                if (this.entity && this.entity.position) {
                    this.entity.position.x = hipsParticle.x;
                    this.entity.position.z = hipsParticle.z;
                }
                this.mesh.updateMatrixWorld(true);
            }

            // Lerp current position to physics position
            const localPos = this.mesh.worldToLocal(hipsParticle.clone());
            hips.position.lerp(localPos, blendWeight);
        }

        // 2. Build Constraint Map for fast lookup (Parent -> Compliance Constraint)
        const parentToConstraint = new Map();
        this.physics.constraints.forEach(c => {
            // Only care about bone-to-bone constraints
            if (!c.p1.bone || !c.p2.bone) return;

            // We want constraints where p1 is the parent of p2
            if (c.p2.bone.parent !== c.p1.bone) return;

            const parent = c.p1.bone;
            if (!parentToConstraint.has(parent)) {
                parentToConstraint.set(parent, []);
            }
            parentToConstraint.get(parent).push(c);
        });

        // 3. Recursive Forward Kinematics Solver
        // Starts at Hips and propagates calculated World Rotation down
        const solveHierarchy = (bone, parentWorldQuat) => {
            let currentWorldQuat = new THREE.Quaternion(); // This bone's calculated world rot
            let didRotate = false;

            // Check if this bone drives a physics constraint
            if (parentToConstraint.has(bone)) {
                const constraints = parentToConstraint.get(bone);

                // Select best child (prioritize Spine/Neck)
                let bestConstraint = constraints[0];
                let highestPriority = -1;

                constraints.forEach(c => {
                    const childName = c.p2.bone.name.toLowerCase();
                    let priority = 1;
                    if (childName.includes('spine') || childName.includes('pelvis')) priority = 4;
                    else if (childName.includes('neck') || childName.includes('head')) priority = 3;
                    else if (childName.includes('thigh') || childName.includes('calf')) priority = 2;

                    if (priority > highestPriority) {
                        highestPriority = priority;
                        bestConstraint = c;
                    }
                });

                // Calculate Rotation using the PASSED parentWorldQuat (Physics Truth),
                // NOT the scene graph (Frame N-1 Truth)
                const localRot = this._applySwingTwist(
                    bone,
                    bestConstraint.p2.bone,
                    bestConstraint.p1.position,
                    bestConstraint.p2.position,
                    blendWeight,
                    parentWorldQuat
                );

                // Calculate OUR World Rotation to pass to children
                // World = ParentWorld * Local
                currentWorldQuat.copy(parentWorldQuat).multiply(localRot);
                didRotate = true;
            } else {
                // Not physics driven, use animation rotation
                // World = ParentWorld * AnimationLocal
                currentWorldQuat.copy(parentWorldQuat).multiply(bone.quaternion);
            }

            // Recurse to children
            bone.children.forEach(child => {
                // Optimization: Only recurse if child is part of our known skeleton
                // or if it has children we care about. 
                // For safety, checking if it's a Bone type is good enough.
                if (child.isBone) {
                    solveHierarchy(child, currentWorldQuat);
                }
            });
        };

        // Start solver from Hips
        // Hips parent world rotation is the Mesh/Scene world rotation (usually Identity or mesh rotation)
        const meshWorldQuat = new THREE.Quaternion();
        this.mesh.getWorldQuaternion(meshWorldQuat);

        solveHierarchy(hips, meshWorldQuat);

        // Update matrices once at the end
        this.mesh.updateMatrixWorld(true);
    }

    /**
     * Apply Swing-Twist rotation to align bone with physics target
     * Returns the calculated Local Quaternion
     */
    _applySwingTwist(parentBone, childBone, parentPos, childPos, weight, parentWorldQuat) {
        // 1. Get Bone Axis (Rest Direction) - Local Space
        const axis = childBone.position.clone().normalize();

        // 2. Decompose Current Animation Rotation into Swing & Twist
        // Rotate axis by current quaternion to get where it points now
        const currentDir = axis.clone().applyQuaternion(parentBone.quaternion).normalize();

        // Animation Swing: Rotation from Rest Axis to Current Direction
        const animationSwing = new THREE.Quaternion().setFromUnitVectors(axis, currentDir);

        // Animation Twist: The residual rotation around the axis
        const animationTwist = animationSwing.clone().invert().multiply(parentBone.quaternion);

        // 3. Calculate Physics Swing
        // We need the TARGET direction in the PARENT'S LOCAL SPACE
        // LocalSpace = Inv(ParentWorld) * WorldSpace

        // Target World Direction (from particles)
        const targetDirWorld = new THREE.Vector3().subVectors(childPos, parentPos).normalize();

        // Inverse of the PRE-CALCULATED Parent World Rotation
        const invParentWorld = parentWorldQuat.clone().invert();

        // Target Local Direction
        const targetDirLocal = targetDirWorld.clone().applyQuaternion(invParentWorld);

        // Physics Swing: Rotation from Rest Axis to Target Direction
        const physicsSwing = new THREE.Quaternion().setFromUnitVectors(axis, targetDirLocal);

        // 4. Combine Physics Swing + Animation Twist
        const targetQuat = physicsSwing.multiply(animationTwist);

        // 5. Apply to Posture
        this.posture.request(parentBone, 'physics', targetQuat, weight, 'absolute');

        // Return the logic rotation so we can propagate it down the chain
        return targetQuat;
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
