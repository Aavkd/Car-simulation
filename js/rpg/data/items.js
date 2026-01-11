/**
 * Item Database
 * Defines all items in the game.
 */

export const ITEMS = {
    // -------------------------------------------------------------------------
    // CONSUMABLES
    // -------------------------------------------------------------------------
    'item_potion_health': {
        id: 'item_potion_health',
        name: 'Stimpak (Old)',
        type: 'consumable',
        description: 'A rusty needle containing questionable healing fluids.',
        value: 10,
        effects: {
            heal: 50
        },
        icon: 'assets/ui/icons/potion_red.png'
    },
    'item_ration': {
        id: 'item_ration',
        name: 'Dried Moss Ration',
        type: 'consumable',
        description: 'Tastes like dirt. Sustains life, barely.',
        value: 5,
        effects: {
            heal: 10,
            stamina: 20
        }
    },

    // -------------------------------------------------------------------------
    // WEAPONS
    // -------------------------------------------------------------------------
    'weapon_rusty_sword': {
        id: 'weapon_rusty_sword',
        name: 'Scrap Blade',
        type: 'equipment',
        slot: 'weapon',
        description: 'A sharpened piece of hull plating wrapped in leather.',
        value: 15,
        stats: {
            attack: 10
        }
    },
    'weapon_shock_baton': {
        id: 'weapon_shock_baton',
        name: 'Solis Baton',
        type: 'equipment',
        slot: 'weapon',
        description: 'Standard issue police baton with a failing battery.',
        value: 150,
        stats: {
            attack: 15,
            magic: 5 // Shock damage
        }
    },

    // -------------------------------------------------------------------------
    // ARMOR
    // -------------------------------------------------------------------------
    'armor_plate_vest': {
        id: 'armor_plate_vest',
        name: 'Plastrasteel Vest',
        type: 'equipment',
        slot: 'body',
        description: 'Heavy ceremonial armor from Aethelgard.',
        value: 100,
        stats: {
            defense: 15,
            speed: -5
        }
    },
    'armor_tech_suit': {
        id: 'armor_tech_suit',
        name: 'Scavenger Suit',
        type: 'equipment',
        slot: 'body',
        description: 'Lightweight suit with radiation shielding.',
        value: 200,
        stats: {
            defense: 8,
            speed: 5
        }
    },

    // -------------------------------------------------------------------------
    // QUEST / MISC
    // -------------------------------------------------------------------------
    'resource_red_moss': {
        id: 'resource_red_moss',
        name: 'Red Moss',
        type: 'key',
        description: 'Glowing red fungus. Used for healing.',
        value: 0
    },
    'item_fusion_core': {
        id: 'item_fusion_core',
        name: 'Unstable Core',
        type: 'key',
        description: 'Humming with dangerous energy. Warm to the touch.',
        value: 500
    },
    'item_tech_scrap_rare': {
        id: 'item_tech_scrap_rare',
        name: 'Processor Chip',
        type: 'material',
        description: 'Ancient silicon. Worth a fortune to Solis.',
        value: 300
    }
};
