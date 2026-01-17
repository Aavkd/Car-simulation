# Agent Guide for Racing Project

This is a **vanilla JavaScript** project using **ES Modules**. No build step - code runs directly in the browser.

## Quick Reference

### Run Tests (Single Test)
```bash
# Node.js verification scripts (run from project root)
node tests/ragdoll_verify.mjs           # Physics/Ragdoll
node tests/rpg_verify.mjs               # RPG System
node tests/ragdoll_procedural_verify.mjs # Procedural Gen
node tests/city_verify.mjs              # City terrain
node tests/rpg_verify_phase4.mjs        # RPG Phase 4
```

### Browser Tests
Open directly in browser:
- `tests/ragdoll_phase1_test.html`
- `tests/ragdoll_phase2_test.html`

### No Build Required
- No npm, Webpack, Vite, or Parcel
- Dependencies via CDN (Import Map in `index.html`)
- Just open `index.html` in browser to run

---

## Code Style

### Formatting
- **Indentation**: 4 spaces (NOT tabs)
- **Quotes**: Single quotes `'`
- **Braces**: K&R style (open brace on same line)
- **Semicolons**: Always required
- **Files**: One class per file, matching filename

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `AnimationController`, `TireSmokeSystem` |
| Methods/Variables | camelCase | `updatePhysics`, `steeringAngle` |
| Private members | Underscore prefix | `_updateMesh`, `_calculateForces` |
| Constants | UPPER_CASE | `GRAVITY`, `MAX_RPM` |

### Imports
```javascript
// ALWAYS include .js extension for local imports
import { Car } from './Car.js';           // Correct
import { Car } from './Car';              // WRONG - will fail

// THREE.js via import map (no extension)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Order: Libraries first, then local modules
import * as THREE from 'three';
import { StateMachine } from './fsm/StateMachine.js';
```

### Type Safety (JSDoc)
Use JSDoc extensively since TypeScript is not used:
```javascript
/**
 * Updates the physics state.
 * @param {number} deltaTime - Time in seconds
 * @param {Object} input - Input state object
 * @param {number} input.throttle - 0.0 to 1.0
 * @returns {THREE.Vector3} The new position
 */
update(deltaTime, input) { ... }
```

### Error Handling
- `console.warn()` - Non-critical issues (missing assets, config errors)
- `console.error()` - Critical failures that stop the game loop
- Avoid `try/catch` in hot paths (update loops) unless necessary

---

## Architecture

### Directory Structure
```
js/
  core/           # Game loops, input, entity controllers (Car, Player)
  physics/        # Pure physics logic (no visualization)
  animation/      # Animation states, blending, IK, FSM
  environment/    # World objects (Sky, Terrain, Atmosphere)
  editor/         # Level editor, object placement
  rpg/            # NPC interaction, dialogue, quests
tests/            # Standalone test scripts (.mjs for Node, .html for browser)
assets/           # Models, textures
```

### Core Patterns

**1. Controller-Logic Separation**
- **Controller** (e.g., `CarPhysics` in `car.js`): Handles meshes, lights, particles, inputs
- **Logic/Engine** (e.g., `NewCarPhysicsEngine` in `physics/new_car_physics.js`): Pure math, state updates
- Rule: Never put rendering logic inside Physics Engine classes

**2. Finite State Machines**
- Use for complex entities (Animation, Player State)
- Reference: `js/animation/fsm/StateMachine.js`

**3. Vector Reuse**
```javascript
// Avoid GC spikes - reuse vectors in update loops
class MyController {
    constructor() {
        this._tempVec = new THREE.Vector3();  // Reusable
    }
    update(dt) {
        this._tempVec.set(1, 2, 3);  // Reuse instead of new THREE.Vector3()
    }
}
```

---

## Testing

### Writing Node.js Tests
Node tests must mock THREE.js objects. Copy from existing tests:
```javascript
// Mock THREE (at top of test file)
const THREE = {
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        // Add other methods as needed
    }
};
```

### Before Modifying Physics
Always run verification before AND after changes:
```bash
node tests/ragdoll_verify.mjs
```

---

## Do NOT

- Use `require()` - use `import` only
- Import from `node_modules` - use CDN via import map
- Forget `.js` extensions on local imports
- Introduce build tools (Babel, Webpack) unless explicitly asked
- Change directory structure without approval
- Remove `import * as THREE` pattern (required for Import Map)
- Create heavy objects in update loops (causes GC spikes)

---

## Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| "Module not found" | Missing `.js` extension | Add `.js` to import path |
| FPS drops | Object creation in `update()` | Reuse objects as class properties |
| Circular deps | Cross-imports between core/physics | Use constructor injection |
| Gimbal lock | Using Euler angles | Use Quaternions for rotations |

---

## Debugging

- **Visual**: Use `THREE.BoxHelper` or `THREE.ArrowHelper` for physics visualization
- **Console**: Expose objects via `window.car = this.car` for inspection
- **Performance**: Check for object creation in update loops
