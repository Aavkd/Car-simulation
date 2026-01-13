Technical Specification: Scaled Vehicle Physics SystemVersion: 1.0Date: October 26, 2023Objective: Decouple vehicle configuration from physics logic to support multiple car types while correcting the physics scale to match the 3D world environments.1. System ArchitectureThe system will be split into two primary modules:VehiclePhysics.js: A generic, reusable physics engine. It handles integration, collision, suspension, and force calculations. It is agnostic of the specific car model.CarSpecs.js (e.g., ToyotaAE86.js): A data-driven configuration file containing real-world physical properties (mass, torque curves, dimensions) and visual offsets.The Scale Constant ($S$)To reconcile the "Perfect Visual Size" with "Real World Physics," we define a global scale factor.Visual Reality: The car is ~18.4 units long.Physical Reality: A real car is ~4.2 meters long.Scale Factor ($S$): $18.4 / 4.2 \approx 4.5$.Rule: All internal physics calculations (Gravity, Torque, Drag) must apply $S$ to translate real-world specs into game-world forces.2. Module 1: VehiclePhysics.js ( The Engine)This class accepts a CarSpec object during initialization.2.1 Core ResponsibilitiesWorld Scaling: Automatically applies $S=4.5$ to gravity and air density.Suspension: Raycast handling and spring-damper logic.Tire Model: Simplified Pacejka (Slip-based) friction model.Integration: Symplectic Euler or Verlet integration for position/velocity.2.2 Physics Math CorrectionsA. Gravity & MassFormula: $F_g = m \times (g_{earth} \times S)$Implementation: force.y -= mass * (9.81 * 4.5)Why: Objects must fall 4.5x faster to look "normal" in a world that is 4.5x bigger.B. AerodynamicsFormula: $\rho_{game} = \rho_{earth} / S^3$Implementation: airDensity = 1.225 / (4.5**3) // approx 0.013Why: The frontal area is $S^2$ larger, and velocity is $S$ higher. Drag scales by $v^2$, leading to $S^4$ excess drag. Reducing density by $S^3$ balances the equation ($S^4 / S^3 = S$, which matches the Force scale).C. Torque ApplicationFormula: $T_{game} = T_{real} \times S^2$Why: Torque is Force $\times$ Distance. Force scales by $S$, Distance (Radius) scales by $S$. Result is $S^2$.2.3 Pseudocode StructureJavaScriptexport class VehiclePhysics {
    constructor(mesh, terrain, carSpec) {
        this.SCALE = 4.5; 
        this.spec = carSpec; // The Toyota Config
        
        // Convert Real Specs to Game Specs immediately
        this.mass = this.spec.mass; // Mass is constant
        this.gravity = 9.81 * this.SCALE;
        this.airDensity = 1.225 / Math.pow(this.SCALE, 3);
        
        // Pre-calculate Game Torque (Real Torque * S^2)
        this.maxTorqueGame = this.spec.engine.maxTorque * Math.pow(this.SCALE, 2);
    }

    update(dt, input) {
        // 1. Suspension Raycasts
        // 2. Tire Force Calculation (Using Slip, not direct torque)
        // 3. Aerodynamics (Using scaled density)
        // 4. Integration (Velocity += Force/Mass * dt)
    }

    _calculateTireForces(wheel, groundVel) {
        // Use friction circle instead of direct force application
        // Force = NormalLoad * FrictionCoeff
        // Limits torque application to prevent infinite acceleration
    }
}
3. Module 2: ToyotaAE86.js (The Data)This file contains only real-world numbers. It should not contain game logic.3.1 Specification Data StructureJavaScriptexport const ToyotaAE86 = {
    // Identity
    name: "Toyota AE86 Trueno",
    
    // Real World Physics Properties (metric)
    mass: 950,              // kg
    dragCoefficient: 0.35,  
    frontalArea: 1.9,       // m^2
    
    // Dimensions (Visual scale is handled by the Physics Engine automatically?)
    // NO: We define the Game World dimensions here since the mesh is already baked
    dimensions: {
        wheelRadius: 1.35,  // Game Units
        trackWidth: 6.55,   // Game Units
        wheelBase: 10.55,   // Game Units
        cgHeight: 2.4       // Game Units (Center of Gravity)
    },

    // Suspension (Tuned for Game Scale)
    suspension: {
        restLength: 1.5,
        travel: 1.1,
        stiffness: 35000,   // Stiffer for high gravity
        damping: 3000
    },

    // Engine (Real World Numbers)
    engine: {
        idleRPM: 900,
        redlineRPM: 7800,
        maxTorque: 150,     // Nm (Real value!)
        powerCurve: [0.2, 0.4, 0.8, 1.0, 0.9] // Normalized torque curve
    },

    // Transmission
    transmission: {
        gears: [-3.5, 0, 3.6, 2.1, 1.4, 1.0, 0.8], // R, N, 1, 2, 3, 4, 5
        finalDrive: 4.3,
        shiftTime: 0.2
    },

    // Lights (Visual configuration)
    lights: {
        headlightPos: [{x: -2.2, y: 1.5, z: 9.2}, {x: 2.2, y: 1.5, z: 9.2}],
        taillightPos: [{x: -2.0, y: 3.0, z: -9.2}, {x: 2.0, y: 3.0, z: -9.2}]
    }
};
4. Implementation PlanPhase 1: File CreationCreate ToyotaAE86.js and copy the data structure above.Create PhysicsEngine.js (empty class).Phase 2: MigrationMove the update() loop from your current car.js to PhysicsEngine.js.Replace hardcoded values (this.specs.mass) with this.spec.mass.Inject the Scale Logic:Find where Gravity is applied: Change 20 to 9.81 * 4.5.Find where Drag is applied: Change density to 0.013.Remove the dead _integrate function and ensure the logic is inside update.Phase 3: The Tire Model FixReplace the Arcade Logic in PhysicsEngine.js:Old (Bad):Force = (Torque * Gear) / RadiusNew (Good):WheelAngularAccel = (DriveTorque - FrictionTorque) / InertiaWheelOmega += WheelAngularAccel * dtSlipRatio = (WheelOmega * Radius - CarSpeed) / CarSpeedFrictionForce = Curve(SlipRatio) * NormalLoadNote: The FrictionForce pushes the car forward AND slows the wheel spin (Newtons 3rd Law).