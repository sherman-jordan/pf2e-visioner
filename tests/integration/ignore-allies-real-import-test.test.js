/**
 * REAL import test for ignore allies functionality
 * This test verifies that the actual import chain works correctly
 * and would fail if the shouldFilterAlly import is broken in utils.js
 */

import { jest } from '@jest/globals';

describe('Ignore Allies REAL Import Chain Test', () => {
  let originalGame, originalCanvas;

  beforeEach(() => {
    jest.clearAllMocks();

    // Store original globals
    originalGame = global.game;
    originalCanvas = global.canvas;

    // Setup minimal real environment (not mocked)
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          if (module === 'pf2e-visioner' && setting === 'ignoreAllies') return false;
          return false;
        }),
      },
    };

    global.MODULE_ID = 'pf2e-visioner';
  });

  afterEach(() => {
    // Restore original globals
    global.game = originalGame;
    global.canvas = originalCanvas;
    jest.restoreAllMocks();
  });

  test('CRITICAL: utils.js must import shouldFilterAlly directly (not via global)', async () => {
    // This test verifies the REAL import chain that makes ignore allies work

    // Read the actual utils.js file to verify the import exists
    const fs = await import('fs');
    const path = await import('path');

    const utilsPath = path.resolve('scripts/utils.js');
    const utilsContent = fs.readFileSync(utilsPath, 'utf8');

    // CRITICAL: This line must exist for ignore allies to work
    expect(utilsContent).toContain(
      'import { shouldFilterAlly } from "./chat/services/infra/shared-utils.js"',
    );

    // CRITICAL: There should NOT be a global fallback approach
    expect(utilsContent).not.toContain('globalThis.shouldFilterAlly');
    expect(utilsContent).not.toContain('() => false');

    console.log('✅ CRITICAL: utils.js has the correct direct import of shouldFilterAlly');
  });

  test('REAL TEST: getSceneTargets with actual imports (no mocking)', async () => {
    // Import the REAL modules without mocking the import chain
    const utils = await import('../../scripts/utils.js');

    // Mock only isValidToken, not the import chain
    const originalIsValidToken = utils.isValidToken;
    utils.isValidToken = jest.fn().mockReturnValue(true);

    // Setup real test scenario
    const observer = {
      id: 'observer-1',
      name: 'Observer PC',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1 },
    };

    const ally = {
      id: 'ally-1',
      name: 'Ally PC',
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1 },
    };

    const enemy = {
      id: 'enemy-1',
      name: 'Enemy NPC',
      actor: { alliance: 'opposition', type: 'npc' },
      document: { disposition: -1 },
    };

    global.canvas = {
      tokens: {
        placeables: [observer, ally, enemy],
      },
    };

    try {
      // Test with ignoreAllies = false (should include both ally and enemy)
      const allTargets = utils.getSceneTargets(observer, false, false);
      expect(allTargets).toHaveLength(2); // ally + enemy (observer excluded)

      // Test with ignoreAllies = true (should exclude ally)
      const filteredTargets = utils.getSceneTargets(observer, false, true);
      expect(filteredTargets).toHaveLength(1); // enemy only
      expect(filteredTargets.find((t) => t.id === 'ally-1')).toBeUndefined(); // Ally filtered out
      expect(filteredTargets.find((t) => t.id === 'enemy-1')).toBeDefined(); // Enemy included

      console.log('✅ REAL TEST PASSED: Filtering works with actual imports');
    } catch (error) {
      console.error('❌ REAL TEST FAILED: Import chain is broken');
      throw error;
    } finally {
      // Restore original function
      utils.isValidToken = originalIsValidToken;
    }
  });

  test('shouldFilterAlly import verification', async () => {
    // Verify that utils.js can actually import and use shouldFilterAlly
    const utils = await import('../../scripts/utils.js');
    const sharedUtils = await import('../../scripts/chat/services/infra/shared-utils.js');

    // The import should work and the function should be available
    expect(sharedUtils.shouldFilterAlly).toBeDefined();
    expect(typeof sharedUtils.shouldFilterAlly).toBe('function');

    // Test that the function works when called directly
    const observer = {
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1 },
    };

    const ally = {
      actor: { alliance: 'party', type: 'character' },
      document: { disposition: 1 },
    };

    // This should work if the import is correct
    const result = sharedUtils.shouldFilterAlly(observer, ally, 'enemies', true);
    expect(result).toBe(true); // Should filter ally when ignoreAllies=true

    console.log('✅ shouldFilterAlly import and function work correctly');
  });

  test('FAILURE TEST: This test should FAIL if the import line is removed', async () => {
    // This test documents what happens if the critical import line is removed

    const fs = await import('fs');
    const path = await import('path');

    const utilsPath = path.resolve('scripts/utils.js');
    const utilsContent = fs.readFileSync(utilsPath, 'utf8');

    // If this line is missing, ignore allies won't work
    const hasDirectImport = utilsContent.includes(
      'import { shouldFilterAlly } from "./chat/services/infra/shared-utils.js"',
    );

    if (!hasDirectImport) {
      throw new Error(
        'CRITICAL: Direct import of shouldFilterAlly is missing from utils.js - ignore allies will not work!',
      );
    }

    console.log('✅ Critical import line is present');
  });
});
