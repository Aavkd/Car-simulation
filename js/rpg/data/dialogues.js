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
    },
    // -------------------------------------------------------------------------
    // COSMIC ENTITY ENCOUNTER
    // -------------------------------------------------------------------------
    'cosmic_encounter': {
        id: 'cosmic_encounter',
        nodes: {
            // ACT 1: THE AWAKENING
            start: {
                text: "You return to the quiet place. Or perhaps you never left. Time folds upon itself here, like a map made of skin. Do you know where 'here' is, Struggler?",
                speaker: "The Observer",
                choices: [
                    { text: "It's inside my mind.", next: 'location_mind' },
                    { text: "It's the space between worlds.", next: 'location_void' },
                    { text: "It's the grave I crawled out of.", next: 'location_grave' }
                ]
            },
            location_mind: {
                text: "Your mind is a small room. This... this is the house it sits in. But the walls are made of memory.",
                speaker: "The Observer",
                next: 'loop_intro'
            },
            location_void: {
                text: "The Void is empty. This place is full. Full of echoes. Full of the dust of a billion mistakes.",
                speaker: "The Observer",
                next: 'loop_intro'
            },
            location_grave: {
                text: "A grave is a final punctuation. You are an ellipses. A sentence that refuses to end.",
                speaker: "The Observer",
                next: 'loop_intro'
            },

            // ACT 2: THE LOOP
            loop_intro: {
                text: "Look at your hands. How many times have they held a weapon? How many times have they turned to ash? The Loop tightens around your neck.",
                speaker: "The Observer",
                choices: [
                    { text: "I feel the weight of every death.", next: 'loop_burden' },
                    { text: "It's a gift. I can try again.", next: 'loop_gift' },
                    { text: "I don't care. I just want to win.", next: 'loop_pragmatist' }
                ]
            },
            loop_burden: {
                text: "Pain is data. It accumulates. Be careful you do not drown in the archives of your own suffering.",
                speaker: "The Observer",
                next: 'history_segues'
            },
            loop_gift: {
                text: "A gift? No. It is a loan. And the interest rate is your humanity. Every resurrection carves away a piece of what you were.",
                speaker: "The Observer",
                next: 'history_segues'
            },
            loop_pragmatist: {
                text: "Effective. Cold. You are becoming like the machines you fight. Perhaps that is necessary.",
                speaker: "The Observer",
                next: 'history_segues'
            },

            // ACT 3: THE HISTORY
            history_segues: {
                text: "You walk the Red Plains of Ares. Once, this was a garden. Humanity reached for the stars and burnt its fingers to the bone.",
                speaker: "The Observer",
                choices: [
                    { text: "Who destroyed it?", next: 'history_blame' },
                    { text: "Can it be restored?", next: 'history_hope' }
                ]
            },
            history_blame: {
                text: "Everyone. The Old Powers of Earth who pushed the button. The Colonists who turned on each other. The Aliens who watched and waited. Guilt is the only unlimited resource.",
                speaker: "The Observer",
                next: 'factions_intro'
            },
            history_hope: {
                text: "Restored? No. A broken glass can be glued, but it will never ring true again. But it can be... repurposed.",
                speaker: "The Observer",
                next: 'factions_intro'
            },

            // ACT 4: FACTIONS & PHILOSOPHY
            factions_intro: {
                text: "Now, the survivors cling to the wreckage. The Iron King builds walls of stone to hide from the future. The Technocrat builds walls of wire to hide from the past. Who is right?",
                speaker: "The Observer",
                choices: [
                    { text: "Aethelgard (The Iron King). Strength is honest.", setFlag: { key: 'ideology', value: 'traditional' }, next: 'faction_traditional' },
                    { text: "Solis (The Technocrat). Progress is survival.", setFlag: { key: 'ideology', value: 'technological' }, next: 'faction_tech' },
                    { text: "Neither. They are both blind.", setFlag: { key: 'ideology', value: 'neutral' }, next: 'faction_neutral' }
                ]
            },
            faction_traditional: {
                text: "Honest, yes. But brittle. Iron rusts. Flesh decays. To reject the tool is to die by the hand of those who wield it.",
                speaker: "The Observer",
                next: 'the_merging'
            },
            faction_tech: {
                text: "Survival, perhaps. But at what cost? Varia has replaced her heart with a pump. She survives, but does she live?",
                speaker: "The Observer",
                next: 'the_merging'
            },
            faction_neutral: {
                text: "Cynicism is a shield, not a sword. It protects you, but it conquers nothing. Eventually, you must choose a side, even if it is your own.",
                speaker: "The Observer",
                next: 'the_merging'
            },

            // ACT 5: THE MERGING & THE FALSE GOD
            the_merging: {
                text: "All their wars are children fighting in a sandbox while a tsunami approaches. The Merging. The Order of the Void calls it 'Unity'.",
                speaker: "The Observer",
                choices: [
                    { text: "What is the Merging?", next: 'merging_explanation' },
                    { text: "I will stop it.", next: 'merging_defiance' }
                ]
            },
            merging_explanation: {
                text: "The end of the 'I'. The beginning of the 'We'. A universe without conflict, because there is only One Will. It is peace. It is death.",
                speaker: "The Observer",
                next: 'final_advice'
            },
            merging_defiance: {
                text: "To stop the tide, you must become the rock. But the rock is worn away, grain by grain. Are you ready to be eroded?",
                speaker: "The Observer",
                next: 'final_advice'
            },

            // ACT 6: CONCLUSION
            final_advice: {
                text: "The False God waits. It wears the face of your desires. It will offer you perfection.",
                speaker: "The Observer",
                choices: [
                    { text: "What should I do?", next: 'advice_humanity' },
                    { text: "I need power.", next: 'advice_power' }
                ]
            },
            advice_humanity: {
                text: "Hold on to your flaws. Your fear, your anger, your love. They are the jagged edges that prevent you from fitting into their perfect puzzle. Stay broken. Stay free.",
                speaker: "The Observer",
                next: 'end_sequence'
            },
            advice_power: {
                text: "Then take it. But know that power fills the vessel by displacing what was there before. You may win the war, but lose the one who fought it.",
                speaker: "The Observer",
                next: 'end_sequence'
            },
            end_sequence: {
                text: "The conversation ends. The war continues. Wake up, Struggler.",
                speaker: "The Observer",
                choices: [
                    { text: "Wake up.", next: 'exit' }
                ]
            },
            exit: {
                text: "...",
                end: true
            }
        }
    },
};
