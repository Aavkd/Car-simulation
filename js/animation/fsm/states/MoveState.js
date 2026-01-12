import { State } from '../State.js';

export class MoveState extends State {
    constructor() {
        super('Move');
    }

    enter(prevState) {
        // For now, just play Run. 
        // In Phase 3, we'll use a BlendTree here to mix Walk/Run based on speed.
        if (this.owner) {
            // Check speed to decide if walking or running, simple discreet switch for now
            const speed = this.machine.getData('speed') || 0;
            const clip = speed > 5.0 ? 'Run' : 'Walk';

            // Fallback if 'Run'/'Walk' don't exist, just try 'Run' or whatever is available is handled by play() logs
            this.owner.play(clip, true, 0.2);
        }
    }

    update(delta) {
        const speed = this.machine.getData('speed') || 0;
        const isGrounded = this.machine.getData('isGrounded');

        // To Idle
        if (speed <= 0.1) {
            this.machine.setState('Idle');
            return;
        }

        // To Air
        if (isGrounded === false) {
            this.machine.setState('Air');
            return;
        }

        // Update animation speed based on movement speed? 
        // This would require accessing the Action and setting timeScale.
        // Deferred to Polish phase.
    }
}
