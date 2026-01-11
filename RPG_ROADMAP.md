# 🗺️ RPG Implementation Roadmap

This document outlines the step-by-step plan to transform the Racing Simulator into a functional RPG. The goal is to integrate narrative elements, quests, and character interactions without compromising the core racing/flying experience.

---

## 🏗️ Phase 1: Foundation & Architecture

**Goal**: Establish the core file structure and basic state management systems.

- [x] **Directory Setup**: Ensure `js/rpg/` structure exists.
    - [x] `js/rpg/systems/`: Created (will contain logic classes).
    - [x] `js/rpg/data/`: Created (will contain JSON/JS data).
    - [x] `js/rpg/ui/`: Created (will contain UI controllers).

- [x] **Game State Extension**:
    - [x] Modify `js/main.js`: Imported and initialized `RPGManager`.
    - [x] Lifecycle Hook: Added `rpgManager.update()` to `_animate` loop under `PLAY` state.

- [x] **Save/Load System**:
    - [x] Created `js/rpg/RPGProfile.js`: 
        - Tracks XP, Level, Money, Reputation.
        - Implements `serialize()`/`deserialize()` for LocalStorage persistence.
    - [x] Created `js/rpg/systems/RPGManager.js`:
        - Singleton Architecture.
        - Initialization and Update loop stub ready for subsystems.

---

## 📜 Phase 2: Core RPG Systems

**Goal**: Implement the logic managers for quests and dialogues.

- [ ] **Dialogue System** (`js/rpg/systems/DialogueSystem.js`):
    - [ ] Design Node-based structure (Node ID, Text, Responses, NextNodeID).
    - [ ] Implement conditional options (requiring flag/item).
    - [ ] Implement triggers (start quest, give item).

- [ ] **Quest System** (`js/rpg/systems/QuestManager.js`):
    - [ ] Define Quest Structure (ID, Title, Description, Objectives, Rewards).
    - [ ] Implement Status Tracking (`START`, `UPDATE_OBJECTIVE`, `COMPLETE`, `FAIL`).
    - [ ] Create event bus for quest progression (e.g., `onAreaDiscover`, `onItemPickup`).

- [ ] **Inventory System** (`js/rpg/systems/InventoryManager.js`):
    - [ ] Define Item Types (Consumable, Key Item, Car Part).
    - [ ] Implement add/remove/check logic.

---

## 🗣️ Phase 3: Player Interaction & Entities

**Goal**: Allow the player to interact with the world and NPCs.

- [ ] **Interaction Raycaster**:
    - Modify `PlayerController.js`:
        - Add `interact()` method (triggered by 'E' key).
        - Cast ray forward to detect objects with `interactive` tag.

- [ ] **NPC Entity**:
    - Create `NPCEntity` class (extends or wraps generic `SceneObject`).
    - Properties: `name`, `dialogueRootId`, `behavior` (Idle, Walk, Patrol).
    - Integration with `SceneObjectManager` to allow placing NPCs in the Editor.

---

## 📝 Phase 4: Data & Content Pipeline

**Goal**: Populate the world with actual narrative content.

- [ ] **Data Definitions**:
    - [ ] `js/rpg/data/dialogues.js`: Database of all conversation trees.
    - [ ] `js/rpg/data/quests.js`: Database of missions.
    - [ ] `js/rpg/data/items.js`: Item catalog.
    - [ ] `js/rpg/data/npcs.js`: NPC definitions (mesh, default dialogue).

- [ ] **Editor Integration**:
    - Update `EditorController` to inspect/edit NPC properties (e.g., select Dialogue ID from a dropdown).

---

## 🖥️ Phase 5: UI Implementation

**Goal**: Visual feedback for the RPG elements.

- [ ] **Dialogue Overlay**:
    - Create generic HTML/CSS overlay for letterboxed cinematic view.
    - Typewriter effect for text.
    - Response buttons.

- [ ] **HUD Extensions**:
    - Mini-quest tracker (Top Left).
    - "Interact" Prompt (Center screen when looking at NPC).
    - Notification toasts ("Quest Accepted", "Item Received").

- [ ] **Menu Screens**:
    - "Journal" tab in the Pause Menu (Quest Log, Inventory).

---

## 🏁 Phase 6: Gameplay Loop & Verification

**Goal**: Tie it all together into a playable loop.

- [ ] **Verification Scenario**:
    1.  Spawn in world.
    2.  Walk to NPC "Mechanic Mike".
    3.  Press 'E' to talk -> Dialogue opens.
    4.  Accept Quest "Find the Lost Wrench".
    5.  Go to location -> Find Wrench (Item pickup).
    6.  Return to Mike -> Complete Quest.
    7.  Receive Reward (Money/XP).

- [ ] **Polish**:
    - Add sound effects (UI blips, specific NPC voice grunts).
    - Camera transitions (Cinema mode during dialogue).
