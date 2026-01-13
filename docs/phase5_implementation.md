# Phase 5: Animation Events System Implementation

This document details the implementation of the Animation Events System as part of the Deep Animator overhaul (Phase 5). This system allows animators to trigger gameplay logic at specific frames.

## 1. Overview

The Animation Events System consists of:
1.  **Backend Data**: `AnimationEvent` and `EventManager` to store and manage event data.
2.  **Timeline UI**: Visual markers on the timeline ruler to visualize and manipulate events.
3.  **Inspector UI**: A dedicated panel to edit event properties (function name, parameters).
4.  **Runtime Integration**: Hooks into the animation loop to trigger callbacks during playback.

## 2. Components

### 2.1 Animation Event Data (`AnimationEvent.js`)
A simple data structure representing a single event.
```javascript
class AnimationEvent {
    constructor(data) {
        this.id = UUID;
        this.time = float;          // Time in seconds
        this.functionName = string; // e.g., 'PlaySound'
        this.parameters = object;   // e.g., { id: 'footstep_grass' }
    }
}
```

### 2.2 Event Manager (`EventManager.js`)
Manages the collection of events and handles the triggering logic.
-   **Storage**: Maintains a sorted list of events.
-   **Update**: Called every frame with `currentTime` and `previousTime`.
-   **Triggering**: Checks for events falling within the `(prev, current]` time range and fires `onEventTriggered`.

### 2.3 Timeline Integration (`TimelinePanel.js`)
-   **Visuals**: Draws pentagon markers on a dedicated "Events" track below the time ruler.
-   **Interaction**:
    -   **Add**: Double-click on the ruler area.
    -   **Select**: Click on an event marker.
    -   **Move**: Drag markers to reschedule events (snaps to frame rate).

### 2.4 Inspector Integration (`InspectorPanel.js`)
When an event is selected, the Inspector Panel displays:
-   **Time**: Editable number field (updates event position).
-   **Function Name**: String input.
-   **Parameters**: JSON text area for defining payload data.
-   **Delete**: Button to remove the event.

## 3. Usage Guide

### adding an Event
1.  Move the mouse to the desired time on the **Timeline Ruler**.
2.  **Double-click** in the ruler/events track area.
3.  A generic event (default function: `OnEvent`) is created at that time.

### Editing an Event
1.  **Click** on the pentagon marker in the timeline.
2.  Look at the **Inspector Panel** on the left.
3.  Modify the `Function Name` (e.g., `Footstep`) and `Parameters`.

### Deleting an Event
1.  Select the event.
2.  Click the **Delete Event** button in the Inspector.

## 4. Technical Details

### Trigger Logic
Events are triggered based on the delta between frames.
`EventManager.update(currentTime, previousTime, isPlaying)`

-   If `currentTime > previousTime`: Triggers events `E` where `prev < E.time <= current`.
-   If `currentTime < previousTime` (Loop): Triggers events from `prev` to `Duration`, then `0` to `current`. *Implementation currently simplifies loop handling.*

### File Location
-   `js/editor/animator/events/AnimationEvent.js`
-   `js/editor/animator/events/EventManager.js`

## 5. Verification
-   **Unit Tests**: N/A (Manual testing performed).
-   **Integration**: Verified via `AnimatorEditorController` preview loop.
-   **Visuals**: Verified timeline rendering and marker selection.
