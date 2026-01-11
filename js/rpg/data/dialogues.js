/**
 * Dialogue Database for RPG System
 * Structure:
 * {
 *   id: string,
 *   nodes: {
 *     nodeId: { text: string, audio?: string, choices: [...] }
 *   }
 * }
 */

export const DIALOGUES = {
    // -------------------------------------------------------------------------
    // SYSTEM / METAPHYSICAL
    // -------------------------------------------------------------------------
    'intro_awakening': {
        id: 'intro_awakening',
        nodes: {
            start: {
                text: "Wake up. The dust has not claimed you yet.",
                speaker: "???",
                choices: [
                    { text: "Where... where am I?", next: 'location' },
                    { text: "Who are you?", next: 'identity' },
                    { text: "(Struggle to stand)", next: 'struggle' }
                ]
            },
            location: {
                text: "You are on the Red Plains of Ares. A grave, until a moment ago. Now... a cradle.",
                speaker: "The Voice",
                next: 'purpose'
            },
            identity: {
                text: "I am the Architecture. The Weaver. You may call me... guidance.",
                speaker: "The Voice",
                next: 'purpose'
            },
            struggle: {
                text: "Your body is broken. Your will holds it together. Accept the gift, and rise.",
                speaker: "The Voice",
                next: 'purpose'
            },
            purpose: {
                text: "Look at the horizon. Chaos burns the world. Will you be the water that soothes it, or the wind that spreads the fire?",
                speaker: "The Voice",
                choices: [
                    { text: "I just want to survive.", setFlag: { key: 'philosophy', value: 'chaos' }, next: 'end_survival' },
                    { text: "I will bring order to this mess.", setFlag: { key: 'philosophy', value: 'order' }, next: 'end_order' },
                    { text: "I... I don't know.", next: 'end_confused' }
                ]
            },
            end_survival: {
                text: "Then fight. The sword at your feet is real enough.",
                end: true
            },
            end_order: {
                text: "Good. The Thread is visible to you. Follow it.",
                end: true
            },
            end_confused: {
                text: "Uncertainty is potential. Go. Find your shape.",
                end: true
            }
        }
    },

    // -------------------------------------------------------------------------
    // KINGDOM OF AETHELGARD
    // -------------------------------------------------------------------------
    'kaelen_intro': {
        id: 'kaelen_intro',
        nodes: {
            start: {
                text: "Halt! You look like death warmed over, stranger. Identify yourself.",
                speaker: "Baron Kaelen",
                choices: [
                    { text: "I am a traveler. I mean no harm.", next: 'diplomatic' },
                    { text: "Get out of my way, old man.", condition: { stat: 'strength', min: 12 }, next: 'aggressive' },
                    { text: "I don't remember who I am.", next: 'amnesiac' }
                ]
            },
            diplomatic: {
                text: "Travelers don't survive long here without a blade. We need strong arms at the fort. Interested in work?",
                speaker: "Baron Kaelen",
                choices: [
                    { text: "What kind of work?", next: 'quest_offer' },
                    { text: "Not interested.", next: 'leave' }
                ]
            },
            aggressive: {
                text: "Hah! You've got fire. I like that. We could use a fighter like you against the Technocrats.",
                speaker: "Baron Kaelen",
                next: 'quest_offer'
            },
            amnesiac: {
                text: "Another lost soul? The Wastes take many minds. If you can swing a sword, we have a place for you.",
                speaker: "Baron Kaelen",
                next: 'quest_offer'
            },
            quest_offer: {
                text: "Solis raiders are probing our defenses to the North. I need someone disposable—err, capable—to scout their forward camp. Pay is 50 Credits.",
                speaker: "Baron Kaelen",
                choices: [
                    {
                        text: "I'll do it.",
                        setFlag: { key: 'quest_scout_accepted', value: true },
                        action: 'acceptQuest:scout_mission',
                        next: 'accept'
                    },
                    { text: "Too dangerous for me.", next: 'refuse' }
                ]
            },
            accept: {
                text: "Good. Report back when it's done. And try not to die again.",
                end: true
            },
            refuse: {
                text: "Suit yourself. The desert isn't kind to freeloaders.",
                end: true
            },
            leave: {
                text: "Move along then.",
                end: true
            }
        }
    },

    // -------------------------------------------------------------------------
    // TECHNOCRACY OF SOLIS
    // -------------------------------------------------------------------------
    'tybalt_intro': {
        id: 'tybalt_intro',
        nodes: {
            start: {
                text: "(Muttering) ...readings are off by 0.4%... useless capacitors...",
                speaker: "Engineer Tybalt",
                choices: [
                    { text: "(Clear throat)", next: 'notice' },
                    { text: "Hey! You the mechanic?", next: 'notice' }
                ]
            },
            notice: {
                text: "Gah! Don't sneak up on a—oh, you're not a droid. Organic. Biological. Dirty.",
                speaker: "Engineer Tybalt",
                next: 'intro'
            },
            intro: {
                text: "I am Tybalt. Chief Engineer of... this scrap heap. Unless you have a pristine fusion core in your pocket, I'm busy.",
                speaker: "Engineer Tybalt",
                choices: [
                    { text: "I might be able to find one.", next: 'quest_prompt' },
                    { text: "Just looking to trade.", next: 'trade' }
                ]
            },
            quest_prompt: {
                text: "Really? The Ruined Sector 7 reportedly has a functional core. But it's full of... things. Mutants. Horrible biological messes.",
                speaker: "Engineer Tybalt",
                choices: [
                    {
                        text: "I'll retrieve it for you.",
                        setFlag: { key: 'quest_core_accepted', value: true },
                        action: 'acceptQuest:retrieve_core',
                        next: 'thank_god'
                    },
                    { text: "Sounds too risky.", next: 'dismiss' }
                ]
            },
            thank_god: {
                text: "Excellent! I'll prepare the containment unit. Don't drop it!",
                end: true
            },
            trade: {
                text: "Fine. Be quick. My time is efficient, yours is... finite.",
                action: 'openShop:tybalt_scrap',
                end: true
            },
            dismiss: {
                text: "Then leave me to my calculations.",
                end: true
            }
        }
    }
};
