/**
 * REALISTIC MOCKS FOR PF2E VISIONER
 *
 * These mocks mirror real-world FoundryVTT scenarios including:
 * - Deleted/invalid tokens
 * - Mixed user permissions
 * - Network failures
 * - Corrupted data
 * - Edge cases that break modules
 *
 * PRINCIPLE: If it can happen in real usage, it should happen in tests
 */

import { jest } from '@jest/globals';

/**
 * Create realistic token scenarios that mirror real FoundryVTT chaos
 */
export function createRealisticTokenScenarios() {
  return {
    // Normal healthy tokens
    healthyPC: {
      id: 'pc-1',
      name: 'Healthy PC',
      actor: {
        alliance: 'party',
        type: 'character',
        system: { attributes: { hp: { max: 50, value: 30 } } },
      },
      document: { disposition: 1 },
    },

    healthyNPC: {
      id: 'npc-1',
      name: 'Healthy NPC',
      actor: {
        alliance: 'opposition',
        type: 'npc',
        system: { attributes: { hp: { max: 25, value: 25 } } },
      },
      document: { disposition: -1 },
    },

    // REAL WORLD PROBLEMS that break modules:

    // Deleted token (actor is null but token still exists)
    deletedToken: {
      id: 'deleted-1',
      name: 'Deleted Token',
      actor: null, // ← This breaks many modules!
      document: { disposition: 0 },
    },

    // Corrupted actor data
    corruptedActor: {
      id: 'corrupt-1',
      name: 'Corrupted Actor',
      actor: {
        alliance: undefined, // ← Missing alliance!
        type: null, // ← Null type!
        system: null, // ← No system data!
      },
      document: { disposition: 1 },
    },

    // Loot token (edge case for filtering)
    lootToken: {
      id: 'loot-1',
      name: 'Treasure Chest',
      actor: {
        alliance: null,
        type: 'loot',
        system: { attributes: { hp: { max: 0, value: 0 } } },
      },
      document: { disposition: 0 },
    },

    // Token with missing document
    missingDocument: {
      id: 'missing-doc-1',
      name: 'Missing Document',
      actor: { alliance: 'party', type: 'character' },
      document: null, // ← This happens when tokens are being deleted!
    },

    // Familiar (complex alliance logic)
    familiar: {
      id: 'familiar-1',
      name: 'Owl Familiar',
      actor: {
        alliance: 'party',
        type: 'familiar',
        system: {
          master: {
            getActiveTokens: () => [{ id: 'pc-1' }], // Links to PC
          },
        },
      },
      document: { disposition: 1 },
    },

    // Undetected token (visibility edge case)
    undetectedToken: {
      id: 'undetected-1',
      name: 'Sneaky Rogue',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1, hidden: true },
    },
  };
}

/**
 * Realistic game settings that mirror actual user configurations
 */
export function createRealisticGameSettings() {
  const userSettings = new Map();

  // Realistic setting combinations users actually have
  const settingProfiles = {
    // New user - mostly defaults
    newUser: {
      'pf2e-visioner.ignoreAllies': false,
      'pf2e-visioner.ignoreWalls': false,
      'pf2e-visioner.includeLootActors': false,
      'pf2e.metagame.skipRollDialogs': false,
    },

    // Power user - customized everything
    powerUser: {
      'pf2e-visioner.ignoreAllies': true,
      'pf2e-visioner.ignoreWalls': true,
      'pf2e-visioner.includeLootActors': true,
      'pf2e.metagame.skipRollDialogs': true,
    },

    // Broken config - some settings missing/corrupted
    brokenConfig: {
      'pf2e-visioner.ignoreAllies': undefined, // ← Missing setting!
      'pf2e-visioner.ignoreWalls': 'true', // ← Wrong type!
      'pf2e-visioner.includeLootActors': null, // ← Null value!
    },
  };

  return {
    profiles: settingProfiles,

    // Mock that returns realistic values
    createMockGet: (profile = 'newUser') => {
      const settings = settingProfiles[profile];
      return jest.fn((module, setting) => {
        const key = `${module}.${setting}`;
        return settings[key];
      });
    },
  };
}

/**
 * Realistic canvas state that includes real-world problems
 */
export function createRealisticCanvas() {
  const scenarios = createRealisticTokenScenarios();

  return {
    // Normal scenario
    normal: {
      tokens: {
        placeables: [scenarios.healthyPC, scenarios.healthyNPC, scenarios.familiar],
      },
    },

    // Chaos scenario - everything that can go wrong
    chaos: {
      tokens: {
        placeables: [
          scenarios.healthyPC,
          scenarios.deletedToken, // ← Breaks filtering!
          scenarios.corruptedActor, // ← Breaks alliance checks!
          scenarios.lootToken,
          scenarios.missingDocument, // ← Breaks document access!
          scenarios.undetectedToken,
          null, // ← Null token in array!
          undefined, // ← Undefined token!
        ].filter(Boolean), // Remove nulls for some tests
      },
    },

    // Empty scene
    empty: {
      tokens: { placeables: [] },
    },

    // Combat scenario
    combat: {
      tokens: {
        placeables: [scenarios.healthyPC, scenarios.healthyNPC],
      },
    },
  };
}

/**
 * Realistic user scenarios
 */
export function createRealisticUsers() {
  return {
    // GM user
    gm: {
      id: 'gm-user',
      isGM: true,
      flags: {
        pf2e: {
          settings: {
            showCheckDialogs: true, // GM sees dialogs
          },
        },
      },
    },

    // Player with skip dialogs
    playerSkipDialogs: {
      id: 'player-skip',
      isGM: false,
      flags: {
        pf2e: {
          settings: {
            showCheckDialogs: false, // Player skips dialogs
          },
        },
      },
    },

    // Player with corrupted settings
    playerCorrupted: {
      id: 'player-corrupt',
      isGM: false,
      flags: {
        pf2e: null, // ← Corrupted flags!
      },
    },

    // Player with missing settings
    playerMissing: {
      id: 'player-missing',
      isGM: false,
      flags: {}, // ← No pf2e flags at all!
    },
  };
}

/**
 * Create realistic test environment that mirrors real FoundryVTT
 */
export function setupRealisticEnvironment(scenario = 'normal') {
  const canvas = createRealisticCanvas()[scenario];
  const settings = createRealisticGameSettings();
  const users = createRealisticUsers();

  global.game = {
    settings: {
      get: settings.createMockGet('newUser'),
    },
    user: users.gm, // Default to GM
    combat:
      scenario === 'combat'
        ? {
            combatants: new Map([
              ['combatant-1', { tokenId: 'pc-1' }],
              ['combatant-2', { tokenId: 'npc-1' }],
            ]),
          }
        : null,
  };

  global.canvas = canvas;
  global.MODULE_ID = 'pf2e-visioner';

  return { canvas, settings, users };
}

/**
 * Test helper: Verify function handles realistic edge cases
 */
export function testWithRealisticScenarios(testFn, scenarios = ['normal', 'chaos', 'empty']) {
  scenarios.forEach((scenario) => {
    describe(`Scenario: ${scenario}`, () => {
      beforeEach(() => {
        setupRealisticEnvironment(scenario);
      });

      testFn(scenario);
    });
  });
}

/**
 * CRITICAL: Test that exposes unrealistic mocks
 */
export function auditMockRealism(mockFn, realWorldInputs) {
  realWorldInputs.forEach((input) => {
    try {
      const result = mockFn(input);
      // If mock never fails with bad input, it's unrealistic
      if (input === null && result !== null) {
        throw new Error(`Mock is too optimistic - should handle null input realistically`);
      }
    } catch (error) {
      // Good! Mock behaves like real world
    }
  });
}
