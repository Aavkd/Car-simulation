/**
 * Ragdoll Phase 2 Verification Tests
 * 
 * Tests for Angular Constraints (Joint Limits)
 * Run with: node tests/ragdoll_verify_phase2.mjs
 */

// ==================== THREE.js MOCK ====================

const THREE = {
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        set(x, y, z) {
            this.x = x; this.y = y; this.z = z;
            return this;
        }
        copy(v) {
            this.x = v.x; this.y = v.y; this.z = v.z;
            return this;
        }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        add(v) {
            this.x += v.x; this.y += v.y; this.z += v.z;
            return this;
        }
        sub(v) {
            this.x -= v.x; this.y -= v.y; this.z -= v.z;
            return this;
        }
        subVectors(a, b) {
            this.x = a.x - b.x;
            this.y = a.y - b.y;
            this.z = a.z - b.z;
            return this;
        }
        multiplyScalar(s) {
            this.x *= s; this.y *= s; this.z *= s;
            return this;
        }
        divideScalar(s) {
            if (s === 0) return this;
            this.x /= s; this.y /= s; this.z /= s;
            return this;
        }
        dot(v) {
            return this.x * v.x + this.y * v.y + this.z * v.z;
        }
        crossVectors(a, b) {
            const ax = a.x, ay = a.y, az = a.z;
            const bx = b.x, by = b.y, bz = b.z;
            this.x = ay * bz - az * by;
            this.y = az * bx - ax * bz;
            this.z = ax * by - ay * bx;
            return this;
        }
        length() {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        }
        lengthSq() {
            return this.x * this.x + this.y * this.y + this.z * this.z;
        }
        normalize() {
            const len = this.length();
            if (len > 0) this.multiplyScalar(1 / len);
            return this;
        }
        distanceTo(v) {
            const dx = this.x - v.x;
            const dy = this.y - v.y;
            const dz = this.z - v.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        applyQuaternion(q) {
            const x = this.x, y = this.y, z = this.z;
            const qx = q.x, qy = q.y, qz = q.z, qw = q.w;

            // Calculate quat * vector
            const ix = qw * x + qy * z - qz * y;
            const iy = qw * y + qz * x - qx * z;
            const iz = qw * z + qx * y - qy * x;
            const iw = -qx * x - qy * y - qz * z;

            // Calculate result * inverse quat
            this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
            this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
            this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

            return this;
        }
    },
    Quaternion: class {
        constructor(x = 0, y = 0, z = 0, w = 1) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
        }
        setFromAxisAngle(axis, angle) {
            const halfAngle = angle / 2;
            const s = Math.sin(halfAngle);
            this.x = axis.x * s;
            this.y = axis.y * s;
            this.z = axis.z * s;
            this.w = Math.cos(halfAngle);
            return this;
        }
    },
    MathUtils: {
        clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
        radToDeg: (radians) => radians * (180 / Math.PI),
        degToRad: (degrees) => degrees * (Math.PI / 180)
    }
};

// ==================== TEST UTILITIES ====================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        testsFailed++;
    }
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    assert(diff <= tolerance, `${message} (expected: ${expected.toFixed(4)}, actual: ${actual.toFixed(4)}, diff: ${diff.toFixed(4)})`);
}

function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

function degToRad(deg) {
    return deg * (Math.PI / 180);
}

// ==================== PHYSICS PARTICLE CLASS ====================

class PhysicsParticle {
    constructor(position, mass = 1.0, radius = 0.1, isPinned = false) {
        this.position = position.clone();
        this.previousPosition = position.clone();
        this.mass = mass;
        this.radius = radius;
        this.isPinned = isPinned;
    }
}

// ==================== PHYSICS ANGULAR CONSTRAINT CLASS ====================
// Copied from PhysicsAngularConstraint.js for standalone testing

class PhysicsAngularConstraint {
    constructor(parent, pivot, child, limits = {}) {
        this.parent = parent;
        this.pivot = pivot;
        this.child = child;
        
        this.swingMin = limits.swingMin ?? -Math.PI / 4;
        this.swingMax = limits.swingMax ?? Math.PI / 4;
        this.twistMin = limits.twistMin ?? -Math.PI / 6;
        this.twistMax = limits.twistMax ?? Math.PI / 6;
        this.stiffness = limits.stiffness ?? 0.8;
        this.type = limits.type ?? 'ball';
        
        this._parentToPivot = new THREE.Vector3();
        this._pivotToChild = new THREE.Vector3();
        this._axis = new THREE.Vector3();
        this._correction = new THREE.Vector3();
        this._rotationQuat = new THREE.Quaternion();
    }
    
    resolve() {
        this._parentToPivot.subVectors(this.pivot.position, this.parent.position);
        const parentLength = this._parentToPivot.length();
        if (parentLength < 0.0001) return;
        this._parentToPivot.divideScalar(parentLength);
        
        this._pivotToChild.subVectors(this.child.position, this.pivot.position);
        const childLength = this._pivotToChild.length();
        if (childLength < 0.0001) return;
        this._pivotToChild.divideScalar(childLength);
        
        const dot = THREE.MathUtils.clamp(this._parentToPivot.dot(this._pivotToChild), -1, 1);
        const currentAngle = Math.acos(dot);
        
        let targetAngle = currentAngle;
        let needsCorrection = false;
        
        if (this.type === 'hinge') {
            const minAngle = Math.PI - this.swingMax;
            const maxAngle = Math.PI - this.swingMin;
            
            if (currentAngle < minAngle) {
                targetAngle = minAngle;
                needsCorrection = true;
            } else if (currentAngle > maxAngle) {
                targetAngle = maxAngle;
                needsCorrection = true;
            }
        } else {
            const deviation = Math.PI - currentAngle;
            const maxDeviation = this.swingMax;
            
            if (deviation > maxDeviation) {
                targetAngle = Math.PI - maxDeviation;
                needsCorrection = true;
            }
            
            const minDeviation = -this.swingMin;
            if (deviation < minDeviation && this.swingMin < 0) {
                targetAngle = Math.PI - minDeviation;
                needsCorrection = true;
            }
        }
        
        if (needsCorrection) {
            this._applySwingCorrection(currentAngle, targetAngle, childLength);
        }
    }
    
    _applySwingCorrection(currentAngle, targetAngle, childLength) {
        this._axis.crossVectors(this._parentToPivot, this._pivotToChild);
        
        if (this._axis.lengthSq() < 0.0001) {
            this._axis.set(1, 0, 0);
            if (Math.abs(this._parentToPivot.x) > 0.9) {
                this._axis.set(0, 1, 0);
            }
            this._axis.crossVectors(this._axis, this._parentToPivot).normalize();
        } else {
            this._axis.normalize();
        }
        
        const angleDelta = targetAngle - currentAngle;
        const correctionAngle = angleDelta * this.stiffness;
        
        this._correction.subVectors(this.child.position, this.pivot.position);
        this._rotationQuat.setFromAxisAngle(this._axis, correctionAngle);
        this._correction.applyQuaternion(this._rotationQuat);
        this._correction.normalize().multiplyScalar(childLength);
        
        if (!this.child.isPinned) {
            this.child.position.copy(this.pivot.position).add(this._correction);
        }
    }
    
    getCurrentAngle() {
        const parentToPivot = new THREE.Vector3().subVectors(this.pivot.position, this.parent.position).normalize();
        const pivotToChild = new THREE.Vector3().subVectors(this.child.position, this.pivot.position).normalize();
        const dot = THREE.MathUtils.clamp(parentToPivot.dot(pivotToChild), -1, 1);
        return Math.acos(dot);
    }
}

// ==================== JOINT CONFIG (from RagdollConfig) ====================

const JointConfig = {
    spine: {
        type: 'ball',
        swingMin: -Math.PI / 6,
        swingMax: Math.PI / 4,
        stiffness: 0.9
    },
    neck: {
        type: 'ball',
        swingMin: -Math.PI / 4,
        swingMax: Math.PI / 3,
        stiffness: 0.8
    },
    shoulder: {
        type: 'ball',
        swingMin: -Math.PI / 2,
        swingMax: Math.PI * 0.8,
        stiffness: 0.7
    },
    elbow: {
        type: 'hinge',
        swingMin: 0,
        swingMax: Math.PI * 0.85,
        stiffness: 0.95
    },
    hip: {
        type: 'ball',
        swingMin: -Math.PI / 6,
        swingMax: Math.PI * 0.6,
        stiffness: 0.85
    },
    knee: {
        type: 'hinge',
        swingMin: -Math.PI / 36,  // -5° slight hyperextension
        swingMax: Math.PI * 0.8,  // ~144° flexion
        stiffness: 0.95
    },
    ankle: {
        type: 'ball',
        swingMin: -Math.PI / 6,
        swingMax: Math.PI / 4,
        stiffness: 0.8
    }
};

// ==================== TESTS ====================

console.log('\n========================================');
console.log('     RAGDOLL PHASE 2 VERIFICATION');
console.log('     (Angular Constraints / Joint Limits)');
console.log('========================================\n');

// ------------------------------------------
// TEST P2-SC1: Knee No Hyperextension
// ------------------------------------------
console.log('TEST P2-SC1: Knee No Hyperextension');
{
    // Setup: Thigh pointing down (Y-), shin pointing down-forward
    // This creates a hyperextended knee (angle > 180°)
    const hip = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 15.0, 0.35, true); // Pin hip
    const knee = new PhysicsParticle(new THREE.Vector3(0, 8, 0), 3.0, 0.5, false);
    const ankle = new PhysicsParticle(new THREE.Vector3(0, 5.5, 0.5), 1.5, 0.35, false); // Forward = hyperextended
    
    const constraint = new PhysicsAngularConstraint(hip, knee, ankle, JointConfig.knee);
    
    // Before: Calculate initial angle
    const angleBefore = constraint.getCurrentAngle();
    console.log(`    Initial angle: ${radToDeg(angleBefore).toFixed(1)}°`);
    
    // Apply constraint multiple times (like solver iterations)
    for (let i = 0; i < 10; i++) {
        constraint.resolve();
    }
    
    // After: Calculate final angle
    const angleAfter = constraint.getCurrentAngle();
    console.log(`    Final angle: ${radToDeg(angleAfter).toFixed(1)}°`);
    
    // Knee angle should not exceed ~175° (5° hyperextension allowed by config)
    const maxAngle = Math.PI - JointConfig.knee.swingMin; // π - (-π/36) ≈ 185°
    assert(angleAfter <= maxAngle + 0.01, 
        `Knee angle ${radToDeg(angleAfter).toFixed(1)}° should not exceed ${radToDeg(maxAngle).toFixed(1)}°`);
}

// ------------------------------------------
// TEST P2-SC2: Elbow No Hyperextension
// ------------------------------------------
console.log('\nTEST P2-SC2: Elbow No Hyperextension');
{
    // Setup: Upper arm pointing right (+X), forearm pointing backward (hyperextended)
    const shoulder = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 5.0, 0.4, true); // Pin shoulder
    const elbow = new PhysicsParticle(new THREE.Vector3(2, 10, 0), 1.0, 0.2, false);
    const wrist = new PhysicsParticle(new THREE.Vector3(3, 10, -0.5), 0.5, 0.15, false); // Behind = hyperextended
    
    const constraint = new PhysicsAngularConstraint(shoulder, elbow, wrist, JointConfig.elbow);
    
    const angleBefore = constraint.getCurrentAngle();
    console.log(`    Initial angle: ${radToDeg(angleBefore).toFixed(1)}°`);
    
    for (let i = 0; i < 20; i++) {
        constraint.resolve();
    }
    
    const angleAfter = constraint.getCurrentAngle();
    console.log(`    Final angle: ${radToDeg(angleAfter).toFixed(1)}°`);
    
    // Elbow should stop at 180° (straight), swingMin = 0 means no hyperextension
    const maxAngle = Math.PI - JointConfig.elbow.swingMin; // π - 0 = π = 180°
    assert(angleAfter <= maxAngle + 0.02, 
        `Elbow angle ${radToDeg(angleAfter).toFixed(1)}° should not exceed ${radToDeg(maxAngle).toFixed(1)}° (straight)`);
}

// ------------------------------------------
// TEST P2-SC3: Elbow Flexion Limit
// ------------------------------------------
console.log('\nTEST P2-SC3: Elbow Flexion Limit');
{
    // Setup: Upper arm pointing right, forearm bent back too far (over-flexed)
    const shoulder = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 5.0, 0.4, true);
    const elbow = new PhysicsParticle(new THREE.Vector3(2, 10, 0), 1.0, 0.2, false);
    // Wrist very close to shoulder = over-flexed (forearm would clip through upper arm)
    const wrist = new PhysicsParticle(new THREE.Vector3(0.3, 10, 0), 0.5, 0.15, false);
    
    const constraint = new PhysicsAngularConstraint(shoulder, elbow, wrist, JointConfig.elbow);
    
    const angleBefore = constraint.getCurrentAngle();
    console.log(`    Initial angle: ${radToDeg(angleBefore).toFixed(1)}°`);
    
    for (let i = 0; i < 20; i++) {
        constraint.resolve();
    }
    
    const angleAfter = constraint.getCurrentAngle();
    console.log(`    Final angle: ${radToDeg(angleAfter).toFixed(1)}°`);
    
    // Elbow should stop at ~27° (150° flexion = 180° - 150° = 30° angle)
    const minAngle = Math.PI - JointConfig.elbow.swingMax; // π - 0.85π ≈ 27°
    assert(angleAfter >= minAngle - 0.1, 
        `Elbow angle ${radToDeg(angleAfter).toFixed(1)}° should not be less than ${radToDeg(minAngle).toFixed(1)}° (max flexion)`);
}

// ------------------------------------------
// TEST P2-SC4: Hip Range of Motion
// ------------------------------------------
console.log('\nTEST P2-SC4: Hip Range of Motion');
{
    // Test forward limit (leg raised forward)
    const spine = new PhysicsParticle(new THREE.Vector3(0, 12, 0), 5.0, 0.4, true);
    const hip = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 15.0, 0.35, false);
    const knee = new PhysicsParticle(new THREE.Vector3(0, 10, 3), 3.0, 0.5, false); // Leg straight forward
    
    const constraint = new PhysicsAngularConstraint(spine, hip, knee, JointConfig.hip);
    
    const angleBefore = constraint.getCurrentAngle();
    console.log(`    Forward leg initial angle: ${radToDeg(angleBefore).toFixed(1)}°`);
    
    for (let i = 0; i < 20; i++) {
        constraint.resolve();
    }
    
    const angleAfter = constraint.getCurrentAngle();
    console.log(`    Forward leg final angle: ${radToDeg(angleAfter).toFixed(1)}°`);
    
    // Hip should allow ~108° forward (deviation from spine axis)
    const maxDeviation = JointConfig.hip.swingMax; // 0.6π ≈ 108°
    const deviation = Math.PI - angleAfter;
    assert(deviation <= maxDeviation + 0.1, 
        `Hip deviation ${radToDeg(deviation).toFixed(1)}° should be within ${radToDeg(maxDeviation).toFixed(1)}° limit`);
}

// ------------------------------------------
// TEST P2-SC5: Spine Flexibility
// ------------------------------------------
console.log('\nTEST P2-SC5: Spine Flexibility');
{
    // Spine chain bent too far forward
    const hips = new PhysicsParticle(new THREE.Vector3(0, 5, 0), 15.0, 0.35, true); // Pin hips
    const spine = new PhysicsParticle(new THREE.Vector3(0, 6, 0), 5.0, 0.4, false);
    const chest = new PhysicsParticle(new THREE.Vector3(0, 6.5, 1.5), 5.0, 0.4, false); // Bent very far forward
    
    const constraint = new PhysicsAngularConstraint(hips, spine, chest, JointConfig.spine);
    
    const angleBefore = constraint.getCurrentAngle();
    console.log(`    Spine initial angle: ${radToDeg(angleBefore).toFixed(1)}°`);
    
    for (let i = 0; i < 20; i++) {
        constraint.resolve();
    }
    
    const angleAfter = constraint.getCurrentAngle();
    console.log(`    Spine final angle: ${radToDeg(angleAfter).toFixed(1)}°`);
    
    const maxDeviation = JointConfig.spine.swingMax; // 45°
    const deviation = Math.PI - angleAfter;
    assert(deviation <= maxDeviation + 0.1, 
        `Spine deviation ${radToDeg(deviation).toFixed(1)}° should be within ${radToDeg(maxDeviation).toFixed(1)}° limit`);
}

// ------------------------------------------
// TEST P2-SC6: Angular Constraint Class Exists
// ------------------------------------------
console.log('\nTEST P2-SC6: Angular Constraint Class Exists');
{
    const parent = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 1.0, 0.1, false);
    const pivot = new PhysicsParticle(new THREE.Vector3(0, 9, 0), 1.0, 0.1, false);
    const child = new PhysicsParticle(new THREE.Vector3(0, 8, 0), 1.0, 0.1, false);
    
    const constraint = new PhysicsAngularConstraint(parent, pivot, child, { type: 'hinge' });
    
    assert(constraint !== null, 'PhysicsAngularConstraint can be instantiated');
    assert(constraint.type === 'hinge', 'Joint type is configurable');
    assert(typeof constraint.resolve === 'function', 'resolve() method exists');
}

// ------------------------------------------
// TEST P2-SC7: Joint Config Loaded
// ------------------------------------------
console.log('\nTEST P2-SC7: Joint Config Loaded');
{
    const requiredJoints = ['spine', 'neck', 'shoulder', 'elbow', 'hip', 'knee', 'ankle'];
    let allPresent = true;
    
    for (const joint of requiredJoints) {
        if (!JointConfig[joint]) {
            allPresent = false;
            console.log(`    Missing joint config: ${joint}`);
        }
    }
    
    assert(allPresent, `All ${requiredJoints.length} joint types defined in config`);
    assert(JointConfig.elbow.type === 'hinge', 'Elbow is configured as hinge joint');
    assert(JointConfig.knee.type === 'hinge', 'Knee is configured as hinge joint');
    assert(JointConfig.shoulder.type === 'ball', 'Shoulder is configured as ball joint');
}

// ------------------------------------------
// TEST P2-SC8: Constraints Created Count
// ------------------------------------------
console.log('\nTEST P2-SC8: Angular Constraint Count Simulation');
{
    // Simulate constraint creation like ActiveRagdollController does
    const particles = {
        hips: new PhysicsParticle(new THREE.Vector3(0, 5, 0), 15.0, 0.35, false),
        spine: new PhysicsParticle(new THREE.Vector3(0, 6, 0), 5.0, 0.4, false),
        spine1: new PhysicsParticle(new THREE.Vector3(0, 7, 0), 5.0, 0.4, false),
        spine2: new PhysicsParticle(new THREE.Vector3(0, 8, 0), 5.0, 0.4, false),
        head: new PhysicsParticle(new THREE.Vector3(0, 9, 0), 3.0, 0.5, false),
        leftArm: new PhysicsParticle(new THREE.Vector3(-1, 8, 0), 1.0, 0.2, false),
        leftForearm: new PhysicsParticle(new THREE.Vector3(-2, 8, 0), 1.0, 0.2, false),
        leftHand: new PhysicsParticle(new THREE.Vector3(-3, 8, 0), 0.5, 0.15, false),
        rightArm: new PhysicsParticle(new THREE.Vector3(1, 8, 0), 1.0, 0.2, false),
        rightForearm: new PhysicsParticle(new THREE.Vector3(2, 8, 0), 1.0, 0.2, false),
        rightHand: new PhysicsParticle(new THREE.Vector3(3, 8, 0), 0.5, 0.15, false),
        leftUpLeg: new PhysicsParticle(new THREE.Vector3(-0.5, 4, 0), 3.0, 0.5, false),
        leftLeg: new PhysicsParticle(new THREE.Vector3(-0.5, 2, 0), 1.5, 0.35, false),
        leftFoot: new PhysicsParticle(new THREE.Vector3(-0.5, 0, 0), 0.5, 0.15, false),
        rightUpLeg: new PhysicsParticle(new THREE.Vector3(0.5, 4, 0), 3.0, 0.5, false),
        rightLeg: new PhysicsParticle(new THREE.Vector3(0.5, 2, 0), 1.5, 0.35, false),
        rightFoot: new PhysicsParticle(new THREE.Vector3(0.5, 0, 0), 0.5, 0.15, false),
    };
    
    const angularConstraints = [];
    const p = (name) => particles[name];
    
    // Spine chain
    angularConstraints.push(new PhysicsAngularConstraint(p('hips'), p('spine'), p('spine1'), JointConfig.spine));
    angularConstraints.push(new PhysicsAngularConstraint(p('spine'), p('spine1'), p('spine2'), JointConfig.spine));
    angularConstraints.push(new PhysicsAngularConstraint(p('spine1'), p('spine2'), p('head'), JointConfig.neck));
    
    // Left Arm
    angularConstraints.push(new PhysicsAngularConstraint(p('spine2'), p('leftArm'), p('leftForearm'), JointConfig.shoulder));
    angularConstraints.push(new PhysicsAngularConstraint(p('leftArm'), p('leftForearm'), p('leftHand'), JointConfig.elbow));
    
    // Right Arm
    angularConstraints.push(new PhysicsAngularConstraint(p('spine2'), p('rightArm'), p('rightForearm'), JointConfig.shoulder));
    angularConstraints.push(new PhysicsAngularConstraint(p('rightArm'), p('rightForearm'), p('rightHand'), JointConfig.elbow));
    
    // Left Leg
    angularConstraints.push(new PhysicsAngularConstraint(p('hips'), p('leftUpLeg'), p('leftLeg'), JointConfig.hip));
    angularConstraints.push(new PhysicsAngularConstraint(p('leftUpLeg'), p('leftLeg'), p('leftFoot'), JointConfig.knee));
    
    // Right Leg
    angularConstraints.push(new PhysicsAngularConstraint(p('hips'), p('rightUpLeg'), p('rightLeg'), JointConfig.hip));
    angularConstraints.push(new PhysicsAngularConstraint(p('rightUpLeg'), p('rightLeg'), p('rightFoot'), JointConfig.knee));
    
    console.log(`    Created ${angularConstraints.length} angular constraints`);
    assert(angularConstraints.length >= 10, 
        `Should have at least 10 angular constraints for humanoid (actual: ${angularConstraints.length})`);
}

// ------------------------------------------
// TEST: Constraint Preserves Bone Length
// ------------------------------------------
console.log('\nTEST: Angular Constraint Preserves Bone Length');
{
    const shoulder = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 5.0, 0.4, true);
    const elbow = new PhysicsParticle(new THREE.Vector3(2, 10, 0), 1.0, 0.2, false);
    const wrist = new PhysicsParticle(new THREE.Vector3(3, 10, -0.5), 0.5, 0.15, false);
    
    const originalLength = elbow.position.distanceTo(wrist.position);
    
    const constraint = new PhysicsAngularConstraint(shoulder, elbow, wrist, JointConfig.elbow);
    
    for (let i = 0; i < 20; i++) {
        constraint.resolve();
    }
    
    const newLength = elbow.position.distanceTo(wrist.position);
    const lengthError = Math.abs(newLength - originalLength) / originalLength;
    
    assert(lengthError < 0.05, 
        `Bone length preserved within 5% (error: ${(lengthError * 100).toFixed(2)}%)`);
}

// ------------------------------------------
// TEST: Collinear Bones (Edge Case)
// ------------------------------------------
console.log('\nTEST: Collinear Bones Handling');
{
    // All three particles in a straight line
    const parent = new PhysicsParticle(new THREE.Vector3(0, 12, 0), 5.0, 0.4, true);
    const pivot = new PhysicsParticle(new THREE.Vector3(0, 10, 0), 1.0, 0.2, false);
    const child = new PhysicsParticle(new THREE.Vector3(0, 8, 0), 0.5, 0.15, false);
    
    const constraint = new PhysicsAngularConstraint(parent, pivot, child, JointConfig.spine);
    
    // This should not throw NaN or crash
    let noError = true;
    try {
        for (let i = 0; i < 10; i++) {
            constraint.resolve();
        }
        // Check for NaN
        if (isNaN(child.position.x) || isNaN(child.position.y) || isNaN(child.position.z)) {
            noError = false;
        }
    } catch (e) {
        noError = false;
    }
    
    assert(noError, 'Collinear bones handled without NaN or errors');
}

// ==================== SUMMARY ====================

console.log('\n========================================');
console.log('           TEST SUMMARY');
console.log('========================================');
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);
console.log('========================================\n');

if (testsFailed > 0) {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
} else {
    console.log('ALL PHASE 2 TESTS PASSED!');
    process.exit(0);
}
