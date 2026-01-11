/**
 * Quest Database
 * Defines structure for quests, objectives, and rewards.
 */

export const QUESTS = [
    // -------------------------------------------------------------------------
    // ACT 1: THE AWAKENING
    // -------------------------------------------------------------------------
    {
        id: 'awakening',
        title: 'The Awakening',
        description: 'You have risen from the dead. Find out where you are and seek civilization.',
        type: 'main',
        objectives: [
            { id: 'obj_find_weapon', text: 'Find a weapon', type: 'interact', target: 'rusty_sword_pile', count: 1 },
            { id: 'obj_reach_outpost', text: 'Reach the Aethelgard Outpost', type: 'reach', target: 'outpost_entrance', count: 1 },
            { id: 'obj_talk_kaelen', text: 'Speak to the Commander', type: 'talk', target: 'npc_kaelen', count: 1 }
        ],
        rewards: {
            xp: 100,
            gold: 0,
            items: []
        }
    },

    // -------------------------------------------------------------------------
    // AETHELGARD QUESTS
    // -------------------------------------------------------------------------
    {
        id: 'scout_mission',
        title: 'Eyes on the Enemy',
        description: 'Baron Kaelen needs you to scout a Solis raiding camp near the Northern Ridge.',
        type: 'side',
        objectives: [
            { id: 'obj_scout_camp', text: 'Scout the Solis Camp', type: 'reach', target: 'solis_camp_marker', count: 1 },
            { id: 'obj_defeat_scouts', text: 'Defeat Solis Scouts (Optional)', type: 'kill', target: 'enemy_solis_scout', count: 3, optional: true },
            { id: 'obj_report_kaelen', text: 'Report back to Kaelen', type: 'talk', target: 'npc_kaelen', count: 1 }
        ],
        rewards: {
            xp: 250,
            gold: 50,
            items: ['item_potion_health']
        },
        prerequisites: {
            quests: ['awakening']
        }
    },
    {
        id: 'herbal_remedy',
        title: 'Roots of the Past',
        description: 'Elara needs Red Moss from the irradiated zone to treat wounded soldiers.',
        type: 'side',
        objectives: [
            { id: 'obj_collect_moss', text: 'Collect Red Moss', type: 'interact', target: 'resource_red_moss', count: 5 },
            { id: 'obj_return_elara', text: 'Return to Elara', type: 'talk', target: 'npc_elara', count: 1 }
        ],
        rewards: {
            xp: 150,
            gold: 25,
            items: ['item_medkit_basic']
        }
    },

    // -------------------------------------------------------------------------
    // SOLIS QUESTS
    // -------------------------------------------------------------------------
    {
        id: 'retrieve_core',
        title: 'Power Down',
        description: 'Engineer Tybalt needs a fusion core from the mutant-infested Ruins of Sector 7.',
        type: 'side',
        objectives: [
            { id: 'obj_enter_ruins', text: 'Enter Sector 7 Ruins', type: 'reach', target: 'sector7_entrance', count: 1 },
            { id: 'obj_find_core', text: 'Find the Fusion Core', type: 'interact', target: 'item_fusion_core', count: 1 },
            { id: 'obj_return_tybalt', text: 'Deliver Core to Tybalt', type: 'talk', target: 'npc_tybalt', count: 1 }
        ],
        rewards: {
            xp: 400,
            gold: 200,
            items: ['item_tech_scrap_rare']
        }
    }
];
