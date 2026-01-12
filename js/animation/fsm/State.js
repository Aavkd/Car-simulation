
/**
 * Base State class
 */
export class State {
    constructor(name) {
        this.name = name;
        this.machine = null; // Reference to the StateMachine holding this state
        this.owner = null;   // Reference to the object being animated (e.g. AnimationController)
    }

    /**
     * Called when state is entered
     * @param {State} prevState 
     */
    enter(prevState) {
        // Override me
    }

    /**
     * Called every frame
     * @param {number} delta 
     */
    update(delta) {
        // Override me
    }

    /**
     * Called when state is exited
     */
    exit() {
        // Override me
    }
}
