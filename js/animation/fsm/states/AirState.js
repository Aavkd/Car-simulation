import { State } from '../State.js';

export class AirState extends State {
    constructor() {
        super('Air');
    }

    enter(prevState) {
        if (this.owner) {
            // If we have vertical velocity upwards, play Jump. Else Fall.
            // For simplicity now, we'll try 'Jump' or fallback to a static pose.
            // Note: Standard Mixamo Jump often has 3 parts: Start, Loop, End.
            // We'll assume a 'Floating' or 'Falling' loop or just 'Jump'.

            this.owner.play('Jump', false, 0.2);
            // Note: Loop = false for Jump usually, but if it's a "Falling" loop, it should be true.
            // We'll refine this when we have specific assets.
        }
    }

    update(delta) {
        const isGrounded = this.machine.getData('isGrounded');

        // Back to ground
        if (isGrounded === true) {
            // Could transition to Land state first, then Idle/Move
            // For now, go straight to Move (which will go to Idle if speed is 0)
            this.machine.setState('Move');
            return;
        }
    }
}
