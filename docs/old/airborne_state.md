# Airborne State Implementation

## Summary
Realistic airborne physics for the car. When in the air, the car preserves angular momentum and naturally pitches nose-down due to weight distribution.

## State Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `isAirborne` | `false` | True when no wheels touch ground |
| `airborneTime` | `0` | Seconds spent in air |
| `airControlStrength` | `0.3` | Player air control (0 = none) |

## Physics Behavior

### Momentum Preservation
- **No angular damping in air** (`multiplyScalar(1.0)`)
- Car continues rotating with whatever spin it had when leaving ground

### Weight Distribution Effect
- Causes natural nose-down tendency when airborne
- Only active when car is somewhat upright (`upDotWorld > 0.2`)
- Strength: `weightBias = 2.0`, `multiplier = 1.5`

### Air Control
Player can adjust rotation while airborne:
- **Steering** → Yaw (turn) + Roll (bank)
- **Throttle** → Pitch nose up
- **Brake** → Pitch nose down

## Accessor Methods
- `getIsAirborne()` - Check if fully airborne
- `getAirborneTime()` - Seconds in air (for effects/audio)
