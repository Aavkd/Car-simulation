/**
 * NPC Database
 * Defines entities to be spawned in the world.
 */

export const NPCS = [
    // -------------------------------------------------------------------------
    // AETHELGARD
    // -------------------------------------------------------------------------
    {
        id: 'npc_kaelen',
        name: 'Baron Kaelen',
        type: 'npc',
        role: 'commander', // Custom role
        dialogueId: 'kaelen_intro',
        position: { x: 100, y: 0, z: 50 }, // Placeholder coords
        visual: {
            modelPath: 'assets/models/characters/knight_commander.glb',
            color: 0x882222, // Red for Aethelgard
            scale: 1.2
        },
        stats: {
            hp: 500,
            level: 15,
            attributes: { strength: 20, vitality: 18 }
        },
        flags: {
            faction: 'aethelgard',
            essential: true
        }
    },
    {
        id: 'npc_elara',
        name: 'Elara',
        type: 'npc',
        role: 'merchant',
        dialogueId: 'elara_shop', // To be implemented
        position: { x: 120, y: 0, z: 60 },
        visual: {
            modelPath: 'assets/models/characters/healer.glb',
            color: 0x228822,
            scale: 1.0
        },
        flags: {
            faction: 'aethelgard',
            shopId: 'elara_herbs'
        }
    },

    // -------------------------------------------------------------------------
    // SOLIS
    // -------------------------------------------------------------------------
    {
        id: 'npc_tybalt',
        name: 'Engineer Tybalt',
        type: 'npc',
        role: 'engineer',
        dialogueId: 'tybalt_intro',
        position: { x: -500, y: 10, z: -200 },
        visual: {
            modelPath: 'assets/models/characters/engineer.glb',
            color: 0x222288,
            scale: 0.9
        },
        stats: {
            hp: 50,
            level: 5,
            attributes: { intelligence: 20 }
        },
        flags: {
            faction: 'solis'
        }
    },
    {
        id: 'enemy_solis_scout',
        name: 'Solis Scout',
        type: 'enemy',
        dialogueId: null,
        visual: {
            modelPath: 'assets/models/characters/trooper.glb',
            color: 0x444444,
            scale: 1.0
        },
        stats: {
            hp: 100,
            level: 3,
            attributes: { dexterity: 12 }
        },
        behavior: {
            type: 'patrol',
            radius: 20
        }
    }
];
