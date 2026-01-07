# 🚗 AE86 Freeroam

> A browser-based 3D freeroam racing game featuring the iconic Toyota AE86, built with Three.js.

![Three.js](https://img.shields.io/badge/Three.js-0.160.0-black?logo=three.js)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?logo=javascript)
![Status](https://img.shields.io/badge/Status-In_Development-blue)

---

## ✨ Features

### 🏎️ Realistic Car Physics
- **Raycast suspension system** with proper weight transfer
- **Tire slip model** with simplified Pacejka-like friction curves
- **Engine & gearbox simulation** with manual/automatic transmission
- **Surface-aware physics** - different friction for tarmac, grass, sand, etc.

### 🗺️ Multiple Terrain Types
| Level | Description |
|-------|-------------|
| **Grasslands** | Procedural rolling hills with grass terrain |
| **Desert Dunes** | 5km island with sand dunes and ocean border |
| **Highway** | Multi-lane road through rolling hills with lane markings |
| **City Streets** | 10km² urban grid with 5 districts and procedural buildings |
| **The Everest** | 10km² snow mountain with 800m peak - start at the summit! |

### 🎮 Controls

#### Keyboard
| Action | Key |
|--------|-----|
| Accelerate | `W` / `↑` |
| Brake/Reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake | `SPACE` |
| Enter/Exit Vehicle | `F` |
| Sprint (on foot) | `SHIFT` |
| Change Camera | `C` |
| Toggle Headlights | `H` |
| Toggle Vintage Filter | `F4` |
| Pause Time | `T` |
| Time -/+ | `[` `]` |
| Time Presets | `1-4` |

#### DualShock 5 / Gamepad
| Action | Input |
|--------|-------|
| Throttle | `R2` |
| Brake | `L2` |
| Steering | Left Stick |
| Camera Control | Right Stick |
| Gear Up | `R1` |
| Gear Down | `L1` |

### 📷 Camera Modes
- **Third-person chase camera** with orbit controls
- **First-person cockpit view** with dashboard overlay
- **First-person on-foot** when exiting the vehicle

### 🌅 Dynamic Sky & Atmosphere
- Full day/night cycle with real-time lighting
- Starfield and sky gradients
- Automatic headlight activation at night

### 🎨 Visual Effects
- Vintage 16-bit retro filter (toggleable)
- Post-processing with scanlines
- Premium glassmorphism UI

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser with WebGL support
- A local web server (for ES modules)

### Running Locally

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Racing
   ```

2. **Start a local server**
   
   Using npx:
   ```bash
   npx -y serve .
   ```
   
   Or using Python:
   ```bash
   python -m http.server 8080
   ```

3. **Open in browser**
   
   Navigate to `http://localhost:3000` (or the port shown by your server)

---

## 📁 Project Structure

```
Racing/
├── index.html              # Main HTML entry point
├── styles.css              # UI styling (glassmorphism, HUD)
├── js/
│   ├── main.js             # Game entry point, state machine
│   ├── car.js              # Physics engine (suspension, tires, drivetrain)
│   ├── camera.js           # Camera controller (orbit, cockpit, on-foot)
│   ├── input.js            # Keyboard & gamepad input handling
│   ├── player.js           # On-foot player controller
│   ├── terrain.js          # Procedural terrain generator (Grasslands)
│   ├── dunes.js            # Desert island terrain generator
│   ├── highway.js          # Highway road generator
│   ├── city.js             # Urban grid generator
│   ├── everest.js          # Snow mountain terrain generator
│   ├── level-manager.js    # Factory for terrain types
│   ├── level-data.js       # Level configuration presets
│   ├── physics-provider.js # Surface type definitions
│   ├── sky.js              # Day/night sky system
│   └── starfield.js        # Night sky star rendering
├── assets/
│   ├── models/
│   │   ├── Toyota AE86.glb # Main vehicle model
│   │   └── BMW.glb         # Additional vehicle model
│   └── car-cockpit.png     # First-person dashboard overlay
└── levels_roadmap.md       # Development roadmap
```

---

## 🛣️ Development Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core Refactoring (Physics interface, state machine) |
| Phase 2 | ✅ Complete | UI & Level Selector (Menu, level cards) |
| Phase 3 | ✅ Complete | New Terrain Types (Dunes, Highway, City) |
| Phase 4 | ⏳ Pending | Level Editor (FlyCamera, object placement) |
| Phase 5 | ⏳ Pending | Persistence (Save/load, import/export) |

See [levels_roadmap.md](levels_roadmap.md) for detailed implementation plans.

---

## 🔧 Technical Details

### Physics System
The car physics use a raycast suspension model where each wheel:
1. Casts a ray downward to detect ground contact
2. Calculates spring/damper forces based on compression
3. Applies tire friction using slip angles and load transfer

### Surface Types
```javascript
TARMAC  // High grip, low drag
GRASS   // Medium grip, medium drag
SAND    // Low grip, high drag
DIRT    // Medium grip, some drag
SNOW    // Very low grip, high drag
ICE     // Ultra low grip
```

### State Machine
The game operates in three states:
- **MENU** - Level selection overlay
- **PLAY** - Active gameplay with physics
- **EDITOR** - (Planned) Level editing mode

---

## 📝 License

This project is for educational and personal use.

---

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) - 3D graphics library
- Toyota AE86 model from the community
