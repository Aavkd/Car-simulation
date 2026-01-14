# Deep Space Physics Update - January 2026

## New Features

### 🚀 Zero-Drag Physics (Space Mode)
Deep Space level now simulates a true vacuum:
- No aerodynamic drag
- No air friction damping
- Momentum preserved indefinitely
- Enables realistic orbital mechanics

### 🛑 Airbrake System
New control to halt movement and resist gravity:
- **Keyboard**: `B`
- **Gamepad**: Square (PS) / X (Xbox)
- Reduces velocity rapidly
- Cancels gravitational attraction while held
- Perfect for precision positioning near black holes

### 🔄 Flight Mode Toggle
Switch between physics modes in Deep Space:
- **Keyboard**: `O`
- **Gamepad**: Circle (PS) / B (Xbox)

| Mode | Behavior |
|------|----------|
| **Space** (default) | Zero drag, orbital mechanics |
| **Atmosphere** | Traditional flight with air resistance |

---

## Files Modified

- `js/core/input.js` - Added airbrake and flight mode toggle inputs
- `js/core/plane.js` - Added space/atmosphere physics modes
- `js/main.js` - Wired up toggle callbacks
- `gravity_update.md` - Updated documentation
- `README.md` - Added new controls to table
