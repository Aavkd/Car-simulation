# Suspension Physics Fixes

## Issues Addressed
1. **Force Direction Error**: The suspension force was previously blended with the ground normal (`30% groundNormal, 70% localUp`). This caused "phantom" lateral forces when the car was tilted, as the ground normal would contribute a horizontal force component in the car's local space. This lateral force created destabilizing torque ("wrong direction force").
2. **Explosion on Steep Terrain**: When traversing steep slopes or polygon edges, the projected ground vertical velocity could approach infinity (as `groundNormal.y` approaches 0), causing massive damping force spikes that flung the car into the air.

## Changes Implemented
1. **Strict Force Alignment**: Changed `forceDirection` to strictly use `localUp`. A physical suspension strut can only exert force along its own axis (the car's local Up vector). This ensures the suspension provides pure support/damping without induced lateral instability.
2. **Velocity Clamping**: Added clamping to `groundVerticalVel` (max +/- 50 m/s) to prevent mathematical explosions on steep terrain edges.
3. **Slope Threshold**: Increased the safe slope threshold from `0.05` to `0.15` (approx 80 degrees) to avoid singularity calculations on vertical walls.

## Issue 7: Torque Coordinate Frame Mismatch (Oscillation Bug)

### Root Cause
The suspension and tire torques were calculated in **world space** (via cross products with world-space vectors), but then directly added to `angularVelocity` which operates in the **body-local frame**. When the car was tilted, this coordinate mismatch caused:
- Phantom roll/pitch moments that didn't align with the car's actual rotational axes
- Spurious forces that pushed the car in counterintuitive directions
- On uneven terrain, these phantom torques accumulated → oscillation → car launched into air

### Fix Applied
Transform all world-space torques to body-local space using the inverse car quaternion before accumulating:
```javascript
const carQuatInverse = carQuat.clone().invert();
const suspTorque = suspTorqueWorld.clone().applyQuaternion(carQuatInverse);
```

Applied to both:
1. **Suspension torque** (line ~737) - force at shock mount
2. **Tire torque** (line ~758) - friction forces at ground contact

## Issue 8: Suspension Forces When Inverted/At Extreme Angles

### Root Cause
When the car was upside down or at extreme angles (e.g., past 90° tilt), the suspension would still apply forces. Since the force direction is always `localUp` (car's local up vector), and when inverted `localUp` points downward toward the ground, the suspension force would push the car INTO the ground instead of away from it. This caused:
- Car being pushed/vibrating when on its roof
- Unstable behavior when the car approached or exceeded 90° tilt angles
- Forces being applied in the wrong direction relative to world space

### Fix Applied
Added a check before applying suspension forces to ensure the car's local up vector is pointing at least somewhat upward (`localUp.y > 0.1`):

```javascript
const canApplySuspension = localUp.y > 0.1;

if (distanceToGround < rayLength && ... && canApplySuspension) {
    // Apply suspension forces only when car is oriented correctly
}
```

The threshold of `0.1` allows suspension to work on slopes up to ~84° from horizontal, but disables suspension when:
- Car is on its roof
- Car is tilted past ~84° (nearly perpendicular to ground)
- Car is airborne while inverted

## Issue 9: Damper Force Causing Launch on Uneven Terrain

### Root Cause
When traversing uneven terrain (bumps, hills, terrain transitions), the damper force could create large UPWARD forces that launched the car into the air. This occurred because:

1. **Rebound damping was too strong** (0.7x multiplier): When a wheel dropped off a bump, the sudden extension created a large negative velocity, and the damper force actively pushed the car upward
2. **Bump stop damping was symmetric**: During rebound from bump stop, it added upward force instead of just resisting compression
3. **No final force direction check**: The suspension force could theoretically push in the wrong direction under edge cases

### Fix Applied

1. **Reduced rebound damping multiplier** from 0.7 to 0.5:
```javascript
const dampingMultiplier = wheel.velocity > 0 ? 1.0 : 0.5; // Much less rebound damping
```

2. **Bump stop damping now only resists compression**:
```javascript
const bumpDampForce = wheel.velocity > 0 ? wheel.velocity * bumpDamping : 0;
```

3. **Final safety check ensures force pushes UP in world space**:
```javascript
if (suspForceVec.y < 0) {
    suspForceVec.set(0, 0, 0);
    suspensionForce = 0;
}
```

### Physics Rationale
A real suspension can only PUSH (spring extension force), never PULL. The damper resists motion in both directions, but the net force must always push the car away from the ground. By limiting rebound forces and ensuring positive Y, we prevent the suspension from artificially launching the car.

## Verification
These changes ensure that:
- Traversing uneven terrain produces correct vertical damping without side-kicks.
- Tilting the car results in pure restoring vertical torque (stabilizing) rather than complex lateral twisting.
- Torque calculations respect proper coordinate frame transformations.
- Suspension forces are disabled when the car is inverted or at extreme angles, preventing forces from pushing the car into the ground.
- Damper forces during wheel rebound cannot launch the car into the air.

