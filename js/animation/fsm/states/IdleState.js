import { State } from '../State.js';

export class IdleState extends State {
    constructor() {
        super('Idle');
    }

    enter(prevState) {
        // Play idle animation with a crossfade
        if (this.owner) {
            this.owner.play('Idle', true, 0.2);
        }
    }

    update(delta) {
        // Check transitions
        const speed = this.machine.getData('speed') || 0;
        const isGrounded = this.machine.getData('isGrounded');

        // To Move
        if (speed > 0.1) {
            this.machine.setState('Move');
            return;
        }

        // To Air (Falling/Jumping)
        // Default isGrounded to true if undefined to prevent falling on init
        if (isGrounded === false) {
            this.machine.setState('Air');
            return;
        }
    }
}
