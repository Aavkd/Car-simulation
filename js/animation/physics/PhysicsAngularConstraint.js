import * as THREE from 'three';

/**
 * Angular constraint using swing-twist decomposition for anatomical joint limits.
 * 
 * Joint Model:
 * - Swing: Rotation around axes perpendicular to the bone (like a ball-socket)
 * - Twist: Rotation around the bone axis itself (like supination/pronation)
 * 
 * Constraint Chain: parent → pivot → child
 * Example: UpperArm → Elbow → Forearm
 * 
 * The constraint enforces that the angle between the parent→pivot and pivot→child
 * vectors stays within the configured limits.
 */
export class PhysicsAngularConstraint {
    /**
     * @param {PhysicsParticle} parent - Parent bone end (e.g., shoulder)
     * @param {PhysicsParticle} pivot - Joint particle (e.g., elbow)
     * @param {PhysicsParticle} child - Child bone end (e.g., wrist)
     * @param {Object} limits - Joint limit configuration
     */
    constructor(parent, pivot, child, limits = {}) {
        this.parent = parent;
        this.pivot = pivot;
        this.child = child;
        
        // Swing limits (angle deviation from parent axis)
        // For hinge joints: swingMin/Max define the bend range
        // For ball joints: swingMax defines the cone angle
        this.swingMin = limits.swingMin ?? -Math.PI / 4;   // -45° default
        this.swingMax = limits.swingMax ?? Math.PI / 4;     // +45° default
        
        // Twist limits (rotation around bone axis) - reserved for future use
        this.twistMin = limits.twistMin ?? -Math.PI / 6;   // -30°
        this.twistMax = limits.twistMax ?? Math.PI / 6;     // +30°
        
        // Stiffness of angular correction (0-1)
        // Higher = snappier constraint enforcement
        this.stiffness = limits.stiffness ?? 0.8;
        
        // Joint type affects how limits are interpreted
        // 'ball': Symmetric cone limit (shoulder, hip)
        // 'hinge': Asymmetric bend limit (elbow, knee)
        // 'saddle': Two-axis limit (wrist, ankle) - future
        this.type = limits.type ?? 'ball';
        
        // Reusable vectors to reduce GC pressure
        this._parentToPivot = new THREE.Vector3();
        this._pivotToChild = new THREE.Vector3();
        this._axis = new THREE.Vector3();
        this._correction = new THREE.Vector3();
        this._rotationQuat = new THREE.Quaternion();
    }
    
    /**
     * Resolve the angular constraint by adjusting child particle position
     */
    resolve() {
        // 1. Calculate bone directions
        this._parentToPivot
            .subVectors(this.pivot.position, this.parent.position);
        
        const parentLength = this._parentToPivot.length();
        if (parentLength < 0.0001) return; // Degenerate case
        
        this._parentToPivot.divideScalar(parentLength); // Normalize
        
        this._pivotToChild
            .subVectors(this.child.position, this.pivot.position);
        
        const childLength = this._pivotToChild.length();
        if (childLength < 0.0001) return; // Degenerate case
        
        this._pivotToChild.divideScalar(childLength); // Normalize
        
        // 2. Calculate current angle between bones
        // dot = cos(angle), so angle = acos(dot)
        // angle = 0° means bones point same direction (impossible for connected bones)
        // angle = 180° means bones are straight (fully extended)
        // angle = 90° means perpendicular
        const dot = THREE.MathUtils.clamp(
            this._parentToPivot.dot(this._pivotToChild), 
            -1, 
            1
        );
        const currentAngle = Math.acos(dot);
        
        // 3. Check limits based on joint type
        let targetAngle = currentAngle;
        let needsCorrection = false;
        
        if (this.type === 'hinge') {
            // Hinge joints (elbow, knee) have asymmetric limits
            // 
            // For a hinge:
            // - currentAngle = π (180°) means fully extended/straight
            // - currentAngle = π/6 (30°) means highly flexed
            // 
            // swingMin = 0 means no hyperextension allowed (angle cannot exceed π)
            // swingMax = π*0.85 (~150°) means max flexion
            // 
            // We convert swing limits to actual angle-between-bones limits:
            // minAngle = π - swingMax (minimum angle = maximum flexion)
            // maxAngle = π - swingMin (maximum angle = minimum flexion / hyperextension)
            
            const minAngle = Math.PI - this.swingMax; // e.g., π - 0.85π = 0.15π ≈ 27°
            const maxAngle = Math.PI - this.swingMin; // e.g., π - 0 = π = 180°
            
            if (currentAngle < minAngle) {
                // Over-flexed, need to straighten
                targetAngle = minAngle;
                needsCorrection = true;
            } else if (currentAngle > maxAngle) {
                // Hyperextended, need to bend
                targetAngle = maxAngle;
                needsCorrection = true;
            }
        } else {
            // Ball/saddle joints - symmetric cone limit
            // 
            // For a ball joint:
            // - currentAngle near π means child bone continues parent direction
            // - deviation from π is how far off-axis the child is
            // 
            // swingMax defines maximum deviation from the parent axis direction
            
            const deviation = Math.PI - currentAngle; // How far from straight
            const maxDeviation = this.swingMax;
            
            if (deviation > maxDeviation) {
                // Child is bending too far from parent axis
                targetAngle = Math.PI - maxDeviation;
                needsCorrection = true;
            }
            
            // Also check minimum (for joints that shouldn't go fully straight)
            const minDeviation = -this.swingMin; // swingMin is negative
            if (deviation < minDeviation && this.swingMin < 0) {
                targetAngle = Math.PI - minDeviation;
                needsCorrection = true;
            }
        }
        
        // 4. Apply correction if needed
        if (needsCorrection) {
            this._applySwingCorrection(currentAngle, targetAngle, childLength);
        }
    }
    
    /**
     * Apply positional correction to child particle to enforce angle limit
     * @param {number} currentAngle - Current angle between bones
     * @param {number} targetAngle - Target angle to achieve
     * @param {number} childLength - Length of pivot→child segment
     */
    _applySwingCorrection(currentAngle, targetAngle, childLength) {
        // Calculate the rotation axis (perpendicular to both bone directions)
        this._axis.crossVectors(this._parentToPivot, this._pivotToChild);
        
        if (this._axis.lengthSq() < 0.0001) {
            // Bones are collinear (straight), pick an arbitrary perpendicular axis
            // This happens when the joint is fully extended
            this._axis.set(1, 0, 0);
            if (Math.abs(this._parentToPivot.x) > 0.9) {
                this._axis.set(0, 1, 0);
            }
            this._axis.crossVectors(this._axis, this._parentToPivot).normalize();
        } else {
            this._axis.normalize();
        }
        
        // Calculate how much we need to rotate
        const angleDelta = targetAngle - currentAngle;
        const correctionAngle = angleDelta * this.stiffness;
        
        // Get current pivot→child vector (not normalized, we need the length)
        this._correction
            .subVectors(this.child.position, this.pivot.position);
        
        // Create rotation quaternion around the axis
        this._rotationQuat.setFromAxisAngle(this._axis, correctionAngle);
        
        // Rotate the pivot→child vector
        this._correction.applyQuaternion(this._rotationQuat);
        
        // Preserve the original length (distance constraint will handle exact length)
        this._correction.normalize().multiplyScalar(childLength);
        
        // Move child to new position (only if not pinned)
        if (!this.child.isPinned) {
            this.child.position
                .copy(this.pivot.position)
                .add(this._correction);
        }
    }
    
    /**
     * Get debug info for visualization
     * @returns {Object} Debug data
     */
    getDebugInfo() {
        this._parentToPivot
            .subVectors(this.pivot.position, this.parent.position)
            .normalize();
        this._pivotToChild
            .subVectors(this.child.position, this.pivot.position)
            .normalize();
        
        const dot = THREE.MathUtils.clamp(
            this._parentToPivot.dot(this._pivotToChild), 
            -1, 
            1
        );
        const currentAngle = Math.acos(dot);
        
        return {
            type: this.type,
            currentAngle: THREE.MathUtils.radToDeg(currentAngle),
            swingMin: THREE.MathUtils.radToDeg(this.swingMin),
            swingMax: THREE.MathUtils.radToDeg(this.swingMax),
            isWithinLimits: this.type === 'hinge'
                ? currentAngle >= (Math.PI - this.swingMax) && currentAngle <= (Math.PI - this.swingMin)
                : (Math.PI - currentAngle) <= this.swingMax
        };
    }
}
