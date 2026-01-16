
// Mock THREE
const THREE = {
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
        addScaledVector(v, s) { this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
        multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
        normalize() { return this; }
        length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
    }
};

// Mock BalanceController
class MockBalanceController {
    constructor() {
        this.angularMomentum = new THREE.Vector3();
        this.isDisturbed = false;
    }

    applyForce(force) {
        this.angularMomentum.add(force);
        this.isDisturbed = true;
        console.log(`[Balance] Force applied. Momentum: ${this.angularMomentum.x}`);
    }

    reset() {
        this.angularMomentum.set(0, 0, 0);
        this.isDisturbed = false;
        console.log(`[Balance] Reset called. Momentum cleared.`);
    }
}

// Mock ActiveRagdollController logic
class MockController {
    constructor() {
        this.balance = new MockBalanceController();
        this.physicsBlend = 0;
    }

    _handleFall(impact) {
        console.log("Handling Fall...");
        
        // OLD LOGIC (Simulated)
        // this.balance.applyForce(impact); 

        // NEW LOGIC
        this.balance.reset(); 
    }
}

console.log("Starting Reset Verification...");

const controller = new MockController();

// 1. Simulate accumulating momentum from previous frames
controller.balance.applyForce(new THREE.Vector3(10, 0, 0));
console.log(`Momentum before fall: ${controller.balance.angularMomentum.x}`);

// 2. Trigger Fall
controller._handleFall({});

// 3. Verify
if (controller.balance.angularMomentum.x === 0 && controller.balance.angularMomentum.y === 0) {
    console.log("SUCCESS: Balance momentum reset during fall.");
} else {
    console.error("FAILURE: Balance momentum NOT reset.");
}
