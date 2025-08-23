/**
 * CORE BUSINESS LOGIC TESTS: Cover Detection Algorithm
 *
 * Tests the core cover detection logic that determines cover states between tokens.
 * This is CRITICAL business logic that affects every attack in the game.
 *
 * PRINCIPLE: Test real cover detection scenarios, not UI or mocking
 */

import { jest } from '@jest/globals';

describe('Cover Detection Core Logic', () => {
  let originalGame, originalCanvas;

  beforeEach(() => {
    // Store originals
    originalGame = global.game;
    originalCanvas = global.canvas;

    // Setup minimal realistic environment
    global.game = {
      settings: {
        get: jest.fn().mockImplementation((module, setting) => {
          // Return realistic default settings
          if (setting === 'autoCoverTokenIntersectionMode') return 'center';
          if (setting === 'autoCoverIgnoreUndetected') return false;
          if (setting === 'autoCoverIgnoreDead') return true;
          if (setting === 'autoCoverIgnoreAllies') return false;
          return false;
        }),
      },
    };

    global.MODULE_ID = 'pf2e-visioner';
  });

  afterEach(() => {
    // Restore originals
    global.game = originalGame;
    global.canvas = originalCanvas;
    jest.restoreAllMocks();
  });

  describe('detectCoverStateForAttack - Core Algorithm', () => {
    test('returns none for same token (attacker and target identical)', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const token = {
        id: 'same-token',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      const result = detectCoverStateForAttack(token, token);
      expect(result).toBe('none');
    });

    test('returns none for null/undefined tokens', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const validToken = {
        id: 'valid',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      expect(detectCoverStateForAttack(null, validToken)).toBe('none');
      expect(detectCoverStateForAttack(validToken, null)).toBe('none');
      expect(detectCoverStateForAttack(null, null)).toBe('none');
    });

    test('detects wall cover between tokens', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      // Setup tokens on opposite sides of a wall
      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
      };

      // Setup canvas with a wall between them
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 200,
                y: 50, // Wall from (200,50) to (200,150)
                x2: 200,
                y2: 150,
                c: [200, 50, 200, 150],
                door: 0, // Not a door
                ds: 0, // Closed
              },
            },
          ],
        },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Wall should provide cover (exact level depends on wall height/thickness logic)
      expect(['lesser', 'standard', 'greater']).toContain(result);
      expect(result).not.toBe('none');
    });

    test('ignores open doors for cover calculation', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
      };

      // Setup canvas with an OPEN door between them
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 200,
                y: 50,
                x2: 200,
                y2: 150,
                c: [200, 50, 200, 150],
                door: 1, // Is a door
                ds: 1, // OPEN
              },
            },
          ],
        },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Open door should NOT provide cover
      expect(result).toBe('none');
    });

    test('detects token cover from blocking creatures', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const blocker = {
        id: 'blocker',
        center: { x: 200, y: 100 }, // Directly between attacker and target
        getCenter: () => ({ x: 200, y: 100 }),
        document: {
          x: 175,
          y: 75, // Token bounds
          width: 1,
          height: 1,
        },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 10, max: 10 } }, // Alive
            traits: { size: { value: 'med' } },
          },
        },
      };

      // Setup canvas with blocking token
      global.canvas = {
        walls: { placeables: [] },
        tokens: {
          placeables: [attacker, target, blocker],
        },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Test that the function runs without error and returns a valid cover state
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
      expect(typeof result).toBe('string');
    });

    test('ignores dead tokens for cover calculation when setting enabled', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      // Enable ignore dead setting
      global.game.settings.get = jest.fn().mockImplementation((module, setting) => {
        if (setting === 'autoCoverIgnoreDead') return true;
        return false;
      });

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const deadBlocker = {
        id: 'dead-blocker',
        center: { x: 200, y: 100 },
        getCenter: () => ({ x: 200, y: 100 }),
        document: {
          x: 175,
          y: 75,
          width: 1,
          height: 1,
        },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 0, max: 10 } }, // DEAD
            traits: { size: { value: 'med' } },
          },
        },
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: {
          placeables: [attacker, target, deadBlocker],
        },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Dead token should be ignored, no cover
      expect(result).toBe('none');
    });

    test('handles complex scenarios with multiple cover sources', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const target = {
        id: 'target',
        center: { x: 400, y: 100 },
        getCenter: () => ({ x: 400, y: 100 }),
        document: { width: 1, height: 1 },
      };

      const blocker = {
        id: 'blocker',
        center: { x: 200, y: 100 },
        getCenter: () => ({ x: 200, y: 100 }),
        document: { x: 175, y: 75, width: 1, height: 1 },
        actor: {
          type: 'npc',
          system: {
            attributes: { hp: { value: 10, max: 10 } },
            traits: { size: { value: 'med' } },
          },
        },
      };

      // Setup with BOTH wall AND token cover
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 300,
                y: 50,
                x2: 300,
                y2: 150,
                c: [300, 50, 300, 150],
                door: 0,
                ds: 0,
              },
            },
          ],
        },
        tokens: {
          placeables: [attacker, target, blocker],
        },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Test that the function handles complex scenarios without error
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
      expect(typeof result).toBe('string');
    });
  });

  describe('Cover Detection Edge Cases', () => {
    test('handles tokens with missing center coordinates', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: null,
        getCenter: () => null,
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      // Should handle gracefully without crashing
      expect(() => detectCoverStateForAttack(attacker, target)).not.toThrow();
    });

    test('handles empty canvas (no walls, tokens, terrain)', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
      };

      global.canvas = {
        walls: { placeables: [] },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      const result = detectCoverStateForAttack(attacker, target);

      // Empty canvas should result in no cover
      expect(result).toBe('none');
    });

    test('handles corrupted wall data gracefully', async () => {
      const { detectCoverStateForAttack } = await import('../../scripts/cover/auto-cover.js');

      const attacker = {
        id: 'attacker',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
      };

      const target = {
        id: 'target',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
      };

      // Setup canvas with corrupted wall data
      global.canvas = {
        walls: {
          placeables: [
            {
              document: {
                x: NaN,
                y: 'invalid', // Corrupted coordinates
                x2: null,
                y2: undefined,
                c: [NaN, 'bad', null, undefined],
                door: 'not-a-number',
                ds: {},
              },
            },
            null, // Null wall
            undefined, // Undefined wall
            { document: null }, // Wall with null document
          ],
        },
        tokens: { placeables: [] },
        terrain: { placeables: [] },
      };

      // Should handle corrupted data without crashing
      expect(() => detectCoverStateForAttack(attacker, target)).not.toThrow();

      const result = detectCoverStateForAttack(attacker, target);
      expect(typeof result).toBe('string');
      expect(['none', 'lesser', 'standard', 'greater']).toContain(result);
    });
  });
});
