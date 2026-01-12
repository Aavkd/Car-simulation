
/**
 * Finite State Machine
 * Manages a set of states and transitions between them.
 */
export class StateMachine {
    constructor(owner) {
        this.owner = owner; // The object that this FSM controls (e.g., AnimationController)
        this.states = new Map();
        this.currentState = null;
        this.previousState = null;

        // Data blackboard for states to share information
        this.data = {};

        // Debug
        this.debug = true;
    }

    /**
     * Add a state to the machine
     * @param {string} name 
     * @param {State} stateInstance 
     */
    addState(name, stateInstance) {
        this.states.set(name, stateInstance);
        stateInstance.machine = this;
        stateInstance.owner = this.owner; // Provide direct access to owner
    }

    /**
     * Transition to a new state
     * @param {string} name 
     */
    setState(name) {
        const newState = this.states.get(name);

        if (!newState) {
            console.warn(`[StateMachine] Warning: State '${name}' does not exist.`);
            return;
        }

        if (this.currentState === newState) return;

        if (this.debug) {
            console.log(`[StateMachine] Transition: ${this.currentState ? this.currentState.name : 'null'} -> ${name}`);
        }

        this.previousState = this.currentState;

        if (this.currentState) {
            this.currentState.exit();
        }

        this.currentState = newState;
        this.currentState.enter(this.previousState);
    }

    /**
     * Update current state
     * @param {number} delta 
     */
    update(delta) {
        if (this.currentState) {
            this.currentState.update(delta);
        }
    }

    /**
     * Helper to set input data for states to read
     * @param {string} key 
     * @param {any} value 
     */
    setData(key, value) {
        this.data[key] = value;
    }

    /**
     * Helper to get input data
     * @param {string} key 
     */
    getData(key) {
        return this.data[key];
    }
}
