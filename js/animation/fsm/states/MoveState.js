import { State } from '../State.js';

export class MoveState extends State {
    constructor() {
        super('Move');
    }

    enter(prevState) {
        if (this.owner) {
            // Use the Locomotion Blend Tree
            this.owner.playBlendTree('Locomotion');
        }
    }

    update(delta) {
        const speed = this.machine.getData('speed') || 0;
        const isGrounded = this.machine.getData('isGrounded');

        // Update Blend Tree Parameter
        if (this.owner) {
            this.owner.setBlendParameter(speed);
        }

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
    }
}
