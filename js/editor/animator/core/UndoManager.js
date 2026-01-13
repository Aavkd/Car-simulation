/**
 * UndoManager.js
 * Phase 1: Editor Foundation
 * 
 * Command pattern implementation for undo/redo functionality.
 * Manages a history stack with configurable depth.
 */

/**
 * Abstract Command class - all undoable actions should extend this
 */
export class Command {
    constructor(name = 'Unknown Command') {
        this.name = name;
        this.timestamp = Date.now();
    }

    /**
     * Execute the command
     * @returns {void}
     */
    execute() {
        throw new Error('Command.execute() must be implemented by subclass');
    }

    /**
     * Undo the command
     * @returns {void}
     */
    undo() {
        throw new Error('Command.undo() must be implemented by subclass');
    }

    /**
     * Redo the command (usually same as execute)
     * @returns {void}
     */
    redo() {
        this.execute();
    }
}

/**
 * Bone Rotation Command - stores before/after quaternion states
 */
export class BoneRotationCommand extends Command {
    constructor(bone, previousQuaternion, newQuaternion) {
        super(`Rotate ${bone.name}`);
        this.bone = bone;
        this.previousQuaternion = previousQuaternion.clone();
        this.newQuaternion = newQuaternion.clone();
    }

    execute() {
        this.bone.quaternion.copy(this.newQuaternion);
    }

    undo() {
        this.bone.quaternion.copy(this.previousQuaternion);
    }
}

/**
 * Bone Position Command - stores before/after position states
 */
export class BonePositionCommand extends Command {
    constructor(bone, previousPosition, newPosition) {
        super(`Move ${bone.name}`);
        this.bone = bone;
        this.previousPosition = previousPosition.clone();
        this.newPosition = newPosition.clone();
    }

    execute() {
        this.bone.position.copy(this.newPosition);
    }

    undo() {
        this.bone.position.copy(this.previousPosition);
    }
}

/**
 * Keyframe Add Command
 */
export class KeyframeAddCommand extends Command {
    constructor(capturedPoses, keyframeData, index = -1) {
        super('Add Keyframe');
        this.capturedPoses = capturedPoses; // Reference to the array
        this.keyframeData = keyframeData;
        this.index = index === -1 ? capturedPoses.length : index;
    }

    execute() {
        this.capturedPoses.splice(this.index, 0, this.keyframeData);
    }

    undo() {
        this.capturedPoses.splice(this.index, 1);
    }
}

/**
 * Keyframe Delete Command
 */
export class KeyframeDeleteCommand extends Command {
    constructor(capturedPoses, index) {
        super('Delete Keyframe');
        this.capturedPoses = capturedPoses;
        this.index = index;
        this.keyframeData = capturedPoses[index]; // Store for undo
    }

    execute() {
        this.capturedPoses.splice(this.index, 1);
    }

    undo() {
        this.capturedPoses.splice(this.index, 0, this.keyframeData);
    }
}

/**
 * Composite Command - groups multiple commands as one undoable action
 */
export class CompositeCommand extends Command {
    constructor(name, commands = []) {
        super(name);
        this.commands = commands;
    }

    addCommand(command) {
        this.commands.push(command);
    }

    execute() {
        for (const cmd of this.commands) {
            cmd.execute();
        }
    }

    undo() {
        // Undo in reverse order
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}

/**
 * UndoManager - Central manager for undo/redo operations
 */
export class UndoManager {
    constructor(maxHistoryDepth = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistoryDepth = maxHistoryDepth;

        // Event callbacks
        this.onHistoryChange = null;

        console.log(`[UndoManager] Initialized with max depth: ${maxHistoryDepth}`);
    }

    /**
     * Execute a command and add it to the undo stack
     * @param {Command} command 
     */
    executeCommand(command) {
        command.execute();
        this.undoStack.push(command);

        // Clear redo stack when new action is performed
        this.redoStack = [];

        // Enforce max history depth
        if (this.undoStack.length > this.maxHistoryDepth) {
            this.undoStack.shift();
        }

        this._notifyChange();
    }

    /**
     * Add a command to history without executing it
     * (For when the action was already performed, like bone drag)
     * @param {Command} command 
     */
    addToHistory(command) {
        this.undoStack.push(command);
        this.redoStack = [];

        if (this.undoStack.length > this.maxHistoryDepth) {
            this.undoStack.shift();
        }

        this._notifyChange();
    }

    /**
     * Undo the last command
     * @returns {boolean} Whether undo was performed
     */
    undo() {
        if (!this.canUndo()) return false;

        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);

        console.log(`[UndoManager] Undo: ${command.name}`);
        this._notifyChange();
        return true;
    }

    /**
     * Redo the last undone command
     * @returns {boolean} Whether redo was performed
     */
    redo() {
        if (!this.canRedo()) return false;

        const command = this.redoStack.pop();
        command.redo();
        this.undoStack.push(command);

        console.log(`[UndoManager] Redo: ${command.name}`);
        this._notifyChange();
        return true;
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Get the name of the next undo action
     * @returns {string|null}
     */
    getUndoName() {
        if (!this.canUndo()) return null;
        return this.undoStack[this.undoStack.length - 1].name;
    }

    /**
     * Get the name of the next redo action
     * @returns {string|null}
     */
    getRedoName() {
        if (!this.canRedo()) return null;
        return this.redoStack[this.redoStack.length - 1].name;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._notifyChange();
    }

    /**
     * Get current history state for UI display
     * @returns {Object}
     */
    getState() {
        return {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoName: this.getUndoName(),
            redoName: this.getRedoName(),
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length
        };
    }

    /**
     * Notify listeners of history change
     * @private
     */
    _notifyChange() {
        if (this.onHistoryChange) {
            this.onHistoryChange(this.getState());
        }
    }
}

export default UndoManager;
