# Level Editor & Selector Expansion - Roadmap

> **Last Updated:** January 7, 2026

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ **COMPLETE** | Core Refactoring |
| Phase 2 | ✅ **COMPLETE** | UI & Level Selector |
| Phase 3 | ✅ **COMPLETE** | New Terrain Types |
| Phase 4 | ⏳ Pending | Level Editor |
| Phase 5 | ⏳ Pending | Persistence |

---

## 1. System Architecture (Refactored)

### 1.1 Game State Management ✅
The application operates in three distinct states (implemented in `main.js`):

- **MENU**: Initial entry point. Renders the Level Selector UI overlay.
- **PLAY**: Standard gameplay loop (physics, car control, HUD).
- **EDITOR**: *(Planned)* Free-camera movement, object placement.

### 1.2 The LevelManager Abstraction ✅
`js/level-manager.js` - Factory class for different environment types:

```javascript
class LevelManager {
    loadLevel(config) {
        switch(config.type) {
            case 'procedural': return new TerrainGenerator(config.params);
            // Future: 'dunes', 'highway', 'city'
        }
    }
}
```

### 1.3 Physics Interface Standard ✅
`js/physics-provider.js` - All terrain types implement:

- `getHeightAt(x, z)` - Returns Y position
- `getNormalAt(x, z)` - Returns surface normal vector  
- `getSurfaceType(x, z)` - Returns friction/drag presets (Tarmac, Sand, Grass, etc.)

---

## 2. Feature: Level Selector ✅

### 2.1 UI Design (Implemented)
- **Location**: Overlay on main canvas (`#main-menu` in `index.html`)
- **Style**: Premium glassmorphism with animated title
- **Elements**:
  - Grid of level cards with icons and descriptions
  - Difficulty ratings (1-3 stars)
  - Hover animations with accent color borders

### 2.2 Supported Map Types
**Currently Available:**
| Map | Type | Status |
|-----|------|--------|
| Grasslands | `procedural` | ✅ Playable |

**Planned (Phase 3):**
| Map | Type | Description |
|-----|------|-------------|
| Desert Dunes | `dunes` | High drag, drift-focused physics |
| Highway | `highway` | Smooth tarmac for high-speed runs |
| City Streets | `city` | Urban grid with tight corners |

---

## 3. Feature: Level Editor *(Phase 4)*

### 3.1 Editor Camera (FlyCamera)
- WASD to move, Right-Click Drag to look
- Shift to move faster
- Physics paused while editing

### 3.2 Object Placement System
- Asset Library UI (Cone, Barrier, Ramp, Tree, etc.)
- Three.js TransformControls for Move/Rotate/Scale
- Snap to Ground functionality

### 3.3 Terrain Modification
Parameter-based editing (not vertex sculpting):
- Seed randomization
- Hill height slider
- Roughness control
- Water level

---

## 4. Technical Implementation Roadmap

### Phase 1: Core Refactoring ✅ COMPLETE
- [x] Extract terrain logic into PhysicsProvider interface
- [x] Add `getSurfaceType()` to TerrainGenerator
- [x] Implement GameState enum (MENU, PLAY, EDITOR)
- [x] Refactor Game class with state machine pattern
- [x] Defer physics/game loop until PLAY state

### Phase 2: UI & Selector ✅ COMPLETE
- [x] Create `#main-menu` overlay in index.html
- [x] Premium glassmorphism CSS styling
- [x] Create `js/level-data.js` with map presets
- [x] Create `js/level-manager.js` factory class
- [x] Wire menu to game state transitions

### Phase 3: New Terrain Types ✅ COMPLETE
- [x] Create `DunesGenerator` (5km island with sand dunes, ocean border)
- [x] Create `HighwayGenerator` (multi-lane road, grass terrain, lane markings)
- [x] Create `CityGenerator` (10km² area, 5 distinct districts, procedural buildings)

### Phase 4: The Editor ⏳ PENDING
- [ ] Implement FlyControls class
- [ ] Create SceneObjectManager
- [ ] Raycaster for 3D object selection
- [ ] Integrate Three.js TransformControls
- [ ] Editor toolbar UI

### Phase 5: Persistence ⏳ PENDING
- [ ] JSON serialization for level data
- [ ] LocalStorage save/load
- [ ] Level import/export

---

## 5. Data Schema (For Phase 5)

```json
{
  "version": 1.0,
  "meta": {
    "name": "My Custom Track",
    "author": "Player1",
    "baseType": "dunes"
  },
  "environment": {
    "seed": 9942,
    "timeOfDay": 0.5,
    "parameters": { "heightScale": 45.0 }
  },
  "objects": [
    {
      "id": "cone_01",
      "type": "traffic_cone",
      "position": { "x": 10, "y": 2, "z": 50 },
      "rotation": { "x": 0, "y": 1.57, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 }
    }
  ]
}
```

---

## 6. Technical Challenges & Solutions

### 6.1 Physics on Mesh-Based Levels
**Challenge**: `getHeightAt(x, z)` works for heightmaps but fails for bridges/tunnels.

**Solution**: Use Raycaster for complex meshes:
- Heightmaps (Dunes/Original): Keep math function
- Complex meshes (City/Circuit): Raycast down from wheel position

### 6.2 Performance with Many Objects
**Solution**: Use `THREE.InstancedMesh` for repeated static objects (trees, cones).

### 6.3 Editor UI Complexity
**Solution**: Use `lil-gui` for property inspector, keep custom HTML only for main menu.

---

## Files Created/Modified

### New Files (Phase 1, 2 & 3)
| File | Purpose |
|------|---------|
| `js/physics-provider.js` | Surface types and base physics interface |
| `js/level-data.js` | Level configuration presets |
| `js/level-manager.js` | Factory for terrain generators |
| `js/dunes.js` | Desert island terrain with sand dunes and ocean |
| `js/highway.js` | Highway road through rolling hills |
| `js/city.js` | Urban grid with 5 districts and procedural buildings |

### Modified Files
| File | Changes |
|------|---------|
| `js/main.js` | GameState enum, state machine, menu setup |
| `js/terrain.js` | Added `getSurfaceType()` method |
| `index.html` | Added `#main-menu` overlay |
| `styles.css` | Premium menu styling (180+ lines) |