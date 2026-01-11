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

- [x] **Dialogue System** (`js/rpg/systems/DialogueSystem.js`):
    - [x] Design Node-based structure (Node ID, Text, Responses, NextNodeID).
    - [x] Implement conditional options (requiring flag/item).
    - [x] Implement triggers (start quest, give item).

- [x] **Quest System** (`js/rpg/systems/QuestManager.js`):
    - [x] Define Quest Structure (ID, Title, Description, Objectives, Rewards).
    - [x] Implement Status Tracking (`START`, `UPDATE_OBJECTIVE`, `COMPLETE`, `FAIL`).
    - [x] Create event bus for quest progression (e.g., `onAreaDiscover`, `onItemPickup`). (Partially integrated via Profile flags/updates)

- [x] **Inventory System** (`js/rpg/systems/InventoryManager.js`):
    - [x] Define Item Types (Consumable, Key Item, Car Part).
    - [x] Implement add/remove/check logic.

- [x] **Verification Script** (`tests/rpg_verify.mjs`):
    - [x] Created Node.js script to mock `localStorage` and `RPGManager` context.
    - [x] Verified all systems (Inventory, Quest, Dialogue) via terminal.

---

## 🗣️ Phase 3: Player Interaction & Entities

**Goal**: Allow the player to interact with the world and NPCs.

- [x] **Interaction Raycaster**:
    - [x] Modify `PlayerController.js`:
        - [x] Add `interact()` method (triggered by 'E' key).
        - [x] Cast ray forward to detect objects with `interactive` tag.

- [x] **NPC Entity**:
    - [x] Create `NPCEntity` class (extends or wraps generic `SceneObject`).
    - [x] Properties: `name`, `dialogueRootId`, `behavior` (Idle, Walk, Patrol).
    - [x] Integration with `SceneObjectManager` to allow placing NPCs in the Editor.

---

## 📝 Phase 4: Data & Content Pipeline

**Goal**: Populate the world with actual narrative content.

- [x] **Data Definitions**:
    - [x] `js/rpg/data/dialogues.js`: Database of all conversation trees.
    - [x] `js/rpg/data/quests.js`: Database of missions.
    - [x] `js/rpg/data/items.js`: Item catalog.
    - [x] `js/rpg/data/npcs.js`: NPC definitions (mesh, default dialogue).

- [ ] **Editor Integration**: (Moved to Phase 5)

---


---

## 🛠️ Phase 5: Advanced Editor Integration

**Goal**: Extend the Level Editor to be a full-featured RPG content creation tool.

- [x] **NPC Management Extension**:
    - [x] Extend `SceneObjectManager` to handle `NPCEntity` creation/deletion separate from generic objects.
    - [x] Implement visual gizmos for NPC patrol paths or interaction zones.

- [x] **Dedicated RPG Editor Panel**:
    - [x] Create a new "RPG Mode" or tab in the Editor UI.
    - [x] **NPC Details**:
        - [x] Edit name, model, starting dialogue ID.
        - [x] Configure behavior (Idle, Patrol, Trade).
    - [x] **Data Managers (CRUD)**:
        - [x] **Dialogues**: Visual node editor or structured form to create/edit conversation trees.
        - [x] **Quests**: Form to create quests, define steps, and set rewards.
        - [x] **Items**: Create custom items and add them to the global registry or specific loot tables.

- [x] **Scene Persistence**:
    - [x] Ensure RPG data created in Editor is saved correctly to `level-data.json` or a separate `rpg-data.json`.

---

## 🖥️ Phase 6: UI Implementation

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

## 🏁 Phase 7: Gameplay Loop & Verification

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
