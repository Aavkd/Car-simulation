# Airborne Physics Technical Details

## Location
`js/physics/new_car_physics.js` - Lines 250-295 (approx)

## Detection
```javascript
this.isAirborne = (groundedCount === 0);
```

## Angular Damping
| State | Damping | Effect |
|-------|---------|--------|
| Airborne | `1.0` | No damping - full momentum preserved |
| Grounded | `0.98` | Normal damping to prevent spin |

## Weight Distribution (Nose-Down Effect)
```javascript
const weightBias = 2.0;
const nosePitch = this._forwardDir.y;  // +up, -down
const pitchCorrection = nosePitch * weightBias * 1.5;
```

Only applies when `upDotWorld > 0.2` (car not tumbling).

## Air Control Rates
```javascript
yawRate   = steer * airControlStrength * 3.0
pitchRate = -pitch * airControlStrength * 2.0
rollRate  = steer * airControlStrength * 1.5
```

Applied in local space, then transformed to world space.

## Flip Detection
Added in `_processWheel()` - suspension disabled when `upDotGround < 0.1`:
```javascript
if (upDotGround < 0.1) {
    this.wheelGrounded[wheelIndex] = false;
    return result;
}
```

## Tuning
Adjust in vehicle spec:
```javascript
airborne: {
    controlStrength: 0.3,  // 0-1, air control amount
    angularDamping: 0.9999,
    groundDamping: 0.98
}
```
