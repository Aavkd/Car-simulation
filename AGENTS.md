# Agent Guide for Racing Project

This document outlines the development workflows, code standards, and architectural patterns for the Racing project. All agents must adhere to these guidelines to ensure consistency and stability.

## 1. Environment & Build

This is a **vanilla JavaScript** project using **ES Modules**. There is no compilation step (Webpack/Vite/Parcel) for the core logic. Code runs directly in the browser.

### Dependencies
- **Three.js**: Imported via CDN in `index.html` (Import Map).
  - Do NOT use `npm install` for runtime dependencies.
  - Do NOT import from `node_modules` in source files.
  - ALWAYS use `.js` extensions for local imports.
  - Example: `import * as THREE from 'three';` (mapped in index.html)

### Testing
There is no centralized test runner. Tests are standalone scripts located in the `tests/` directory.

- **Node.js Verification Scripts**:
  - Used for physics/logic verification without browser context.
  - **Physics/Ragdoll**: `node tests/ragdoll_verify.mjs`
  - **RPG System**: `node tests/rpg_verify.mjs`
  - **Procedural Gen**: `node tests/ragdoll_procedural_verify.mjs`
  - *Note*: These scripts often mock THREE.js objects (Vector3, Quaternion) internally to run in Node.

- **Browser Tests**:
  - HTML files used for visual verification.
  - Run method: Open `tests/ragdoll_phase1_test.html` or `tests/ragdoll_phase2_test.html` in a browser.

### Linting
- **Standard JS**: Use standard JavaScript linting rules.
- **Indentation**: 4 spaces.
- **Semicolons**: Always use semicolons.

## 2. Code Architecture

The codebase is organized by domain:
- **`js/core/`**: Main game loops, input handling, and entity controllers (Car, Player).
- **`js/physics/`**: Pure physics logic, separated from visualization.
- **`js/animation/`**: Animation states, blending, and IK systems.
- **`js/environment/`**: World objects (Sky, Terrain, Atmosphere).
- **`js/editor/`**: In-game level editor and object placement systems.
- **`js/rpg/`**: NPC interaction, dialogue systems, and quest logic.

### Core Patterns
1.  **Controller-Logic Separation**:
    - **Controller** (e.g., `CarPhysics` in `car.js`): Handles Three.js meshes, lights, particles, and inputs.
    - **Logic/Engine** (e.g., `NewCarPhysicsEngine` in `physics/new_car_physics.js`): Handles pure math and state updates.
    - *Rule*: Never put heavy rendering logic inside the Physics Engine classes.

2.  **Component System**:
    - Use strict class hierarchies.
    - Composition is preferred over deep inheritance for systems like Smoke, Exhaust, etc.

3.  **State Management**:
    - Use Finite State Machines (FSM) for complex entities (Animation, Player State).
    - See `js/animation/fsm/StateMachine.js` for reference implementation.

## 3. Code Style & Conventions

### Formatting
- **Indentation**: 4 spaces (NOT tabs).
- **Quotes**: Single quotes `'` for strings.
- **Braces**: K&R style (OTBS) - open brace on the same line.
- **Files**: One class per file is preferred, matching the filename.

### Naming
- **Classes**: PascalCase (e.g., `AnimationController`, `TireSmokeSystem`).
- **Methods/Variables**: camelCase (e.g., `updatePhysics`, `steeringAngle`).
- **Private/Protected**: Prefix with underscore (e.g., `_updateMesh`, `_calculateForces`).
  - *Note*: This is a soft convention; these methods are technically public but intended for internal use.
- **Constants**: UPPER_CASE (e.g., `GRAVITY`, `MAX_RPM`).

### Type Safety (JSDoc)
Since TypeScript is not used, rely heavily on JSDoc for type hinting.
```javascript
/**
 * Updates the physics state.
 * @param {number} deltaTime - Time in seconds
 * @param {Object} input - Input state object
 * @param {number} input.throttle - 0.0 to 1.0
 */
update(deltaTime, input) { ... }
```

### Imports
- **Explicit Extensions**: Always include `.js` at the end of local imports.
  - ✅ `import { Car } from './Car.js';`
  - ❌ `import { Car } from './Car';`
- **Group Imports**: Library imports first (THREE), then local modules.

### Error Handling
- Use `console.warn` for non-critical issues (missing assets, minor config errors).
- Use `console.error` for critical failures that stop the game loop.
- Avoid `try/catch` in the hot path (update loops) unless absolutely necessary.

### Math & Geometry
- **Vectors**: Reuse `THREE.Vector3` objects to avoid garbage collection spikes in the update loop.
  - Create temporary vectors as class properties if they are used every frame.
  - Example: `this._tempVec = new THREE.Vector3();`
- **Quaternions**: Prefer Quaternions over Euler angles for rotation logic to avoid gimbal lock.

## 4. Specific Workflows

### Adding a New Feature
1.  **Analyze**: Check existing systems in `js/core` or `js/systems` to see if a similar pattern exists.
2.  **Scaffold**: Create the file in the appropriate directory.
3.  **Integrate**: Import and instantiate in `js/main.js` or the parent controller.
4.  **Verify**: Creating a small verification script in `tests/` is highly recommended for logic-heavy features.

### Modifying Physics
1.  **Safety**: Physics code is sensitive. Run `node tests/ragdoll_verify.mjs` (or relevant physics test) before and after changes.
2.  **Mocking**: If writing a new test, you must mock THREE.Vector3/Quaternion if running in Node.js (copy mock setup from existing tests).

### Asset Management
- Assets are loaded in `js/main.js` or specific Loaders.
- Use `loadingManager` pattern if adding significant assets.
- Placeholders: Use Three.js primitives (BoxGeometry, SphereGeometry) when assets are missing.

## 5. Debugging & Common Pitfalls

### Debugging
- **Visual**: Use `THREE.BoxHelper` or `THREE.ArrowHelper` to visualize physics vectors and bounds in the browser.
- **Console**: Expose key objects to `window` temporarily for console inspection (e.g., `window.car = this.car`).
- **Performance**: Monitor the `stats.js` overlay (if enabled) for FPS drops; look for object creation in `update()` loops.

### Common Pitfalls
- **Missing Extensions**: Forgetting `.js` in imports is the #1 cause of "Module not found" errors.
- **Deep Nesting**: Avoid excessive callbacks; use `async/await` for asset loading sequences.
- **Global State**: Minimize global variables. Access shared state through the `Game` instance passed to controllers.
- **Circular Dependencies**: Be careful when importing between `core/` and `physics/`. Pass dependencies via constructor injection if needed.

## 6. Do Not
- Do NOT use `require()`. Use `import`.
- Do NOT introduce build tools (Babel, Webpack) unless explicitly asked.
- Do NOT change the directory structure (`js/`, `assets/`, `tests/`) without approval.
- Do NOT remove `import * as THREE` pattern; it is required for the Import Map to work.
