# Deep Space Gravitational Attraction System

> **Feature Update**: Added realistic gravitational attraction from black holes and galaxies in the Deep Space level.

---

## Overview

The Deep Space level now features dynamic gravitational attraction from massive celestial objects. Players will experience orbital mechanics, gravitational slingshots, and the pull of black holes and galaxies as they fly through infinite space.

### Key Features

- **Newtonian Gravity**: Force calculated using `F = G * M / r²` formula
- **Dynamic Orbits**: Fly close to attractors to enter orbit or perform slingshot maneuvers  
- **Configurable Strength**: Easy `gravityScale` parameter for gameplay tuning
- **Performance Optimized**: Only the 3 closest attractors within range are calculated
- **Safety Caps**: Maximum acceleration limits prevent physics explosions

---

## Configuration

### Main Parameter

Located in `js/terrain/deep-space.js` (line ~29):

```javascript
gravityScale: 30  // Overall gravity strength multiplier
```

| Value | Effect |
|-------|--------|
| `1-10` | Very subtle, barely noticeable pull |
| `10-30` | Moderate attraction, good for exploration |
| `30-50` | Strong pull, orbital mechanics become important |
| `50-100` | Very strong, requires thrust to escape |
| `100+` | Extreme, black holes become death traps |

### Advanced Constants

Found in the constructor of `DeepSpaceGenerator`:

```javascript
this.GRAVITY_CONSTANT = 1.0;          // Simplified constant (combined with mass/scale)
this.BLACK_HOLE_MASS = 1.2e8;         // Black hole mass (strongest pull)
this.GALAXY_MASS = 6e6;               // Galaxy mass (gentle pull)
this.MAX_GRAVITY_DISTANCE = 70000;    // Range of gravitational effect
this.MIN_GRAVITY_DISTANCE = 800;      // Soft minimum (smooth falloff, not hard cutoff)
this.MAX_ATTRACTORS = 3;              // Max simultaneous attractors
```

---

## How It Works

### 1. Attractor Registration

When black holes and galaxies are generated, they register as gravitational attractors:

```javascript
this.gravityAttractors.push({
    position: pos.clone(),
    mass: this.BLACK_HOLE_MASS,  // or GALAXY_MASS
    type: 'blackhole',           // or 'galaxy'
    chunkKey: key
});
```

### 2. Force Calculation

Each frame, `getGravitationalForce(playerPos)` calculates the net gravitational pull:

1. Filter attractors within `MAX_GRAVITY_DISTANCE` and beyond `MIN_GRAVITY_DISTANCE`
2. Sort by distance, take closest `MAX_ATTRACTORS`
3. For each attractor: `acceleration = (G * M * gravityScale) / r²`
4. Cap acceleration at 50 m/s² (safety limit)
5. Sum all force vectors

### 3. Physics Integration

In `plane.js`, the gravitational force is applied alongside other physics:

```javascript
if (this.physicsProvider && this.physicsProvider.getGravitationalForce) {
    const gravAccel = this.physicsProvider.getGravitationalForce(this.mesh.position);
    forces.add(gravAccel.clone().multiplyScalar(this.MASS));
}
```

---

## Gameplay Tips

### Orbital Mechanics
- Approach attractors at an angle, not head-on
- Use lateral velocity to enter stable orbits
- Thrust against gravity to escape

### Slingshot Maneuvers
- Fly past an attractor at high speed
- Let gravity curve your trajectory
- Exit with boosted velocity in a new direction

### Black Holes vs Galaxies
- **Black Holes**: 100x stronger than galaxies - approach with caution!
- **Galaxies**: Gentle pull, good for navigation and subtle course corrections

---

## API Reference

### `DeepSpaceGenerator.getGravitationalForce(playerPos)`

Calculate net gravitational acceleration at a position.

**Parameters:**
- `playerPos` (THREE.Vector3): Player's current position

**Returns:**
- `THREE.Vector3`: Acceleration vector pointing toward attractors

### `DeepSpaceGenerator.getNearbyAttractors(playerPos)`

Get list of nearby attractors for UI/debugging.

**Parameters:**
- `playerPos` (THREE.Vector3): Player's current position

**Returns:**
- `Array<{type, distance, position}>`: Sorted list of up to 5 nearest attractors

---

## Files Modified

| File | Changes |
|------|---------|
| `js/terrain/deep-space.js` | Added attractor tracking, gravity calculation, `gravityScale` param |
| `js/core/plane.js` | Added gravitational force application in `_applyPhysics()` |

---

## Airbrake System

The Deep Space level includes an **Airbrake** control that allows players to:

1. **Halt Movement**: Rapidly reduce velocity along all axes (5% reduction per frame)
2. **Cancel Gravity**: While held, gravitational attraction from black holes and galaxies is nullified
3. **Anchor in Space**: Allows precise positioning near massive objects without being pulled in

### Controls

| Platform | Button |
|----------|--------|
| Keyboard | `B` |
| Gamepad | **Circle** (PS) / **B** (Xbox) |

### Usage Tips

- Use airbrake to stop orbiting and "hover" near an attractor
- Release to resume normal physics and re-engage gravity
- Combine with thrust to make precise positioning maneuvers around black holes
- In Deep Space, there is **no air drag** - you maintain momentum indefinitely until you use airbrake or thrust

### Flight Mode Toggle

Press **Square** (PS) or **X** (Xbox) to switch between two flight modes in Deep Space:

| Mode | Drag | Damping | Behavior |
|------|------|---------|----------|
| **Space Mode** (default) | OFF | OFF | True orbital mechanics, momentum preserved |
| **Atmosphere Mode** | ON | ON | Traditional flight physics with air resistance |

This allows you to choose your flight style:
- **Space Mode**: Perfect for orbiting, slingshot maneuvers, and realistic space physics
- **Atmosphere Mode**: Easier control, plane slows down when not thrusting

### Deep Space Physics

Unlike other levels, the Deep Space environment simulates a **vacuum**:
- No aerodynamic drag (velocity is preserved)
- No air friction damping
- Only gravitational forces from nearby objects affect your trajectory
- Use the airbrake to control your orbit and prevent being pulled into black holes

---

*Implementation Date: January 2026*
