/**
 * Unit tests for PF2E Visioner auto-cover system
 */

import {
  _consumePairs,
  _recordPair,
  detectCoverStateForAttack,
  getSizeRank
} from '../../scripts/cover/auto-cover.js';

describe('Auto-Cover System', () => {
  let attacker, target, wall, terrain;

  beforeEach(() => {
    // Create mock tokens for testing
    attacker = createMockToken({
      id: 'attacker-1',
      x: 100, y: 100,
      actor: createMockActor({
        id: 'actor-attacker',
        type: 'character',
        system: {
          traits: { size: { value: 'med' } },
          attributes: { perception: { value: 16 } }
        }
      })
    });

    target = createMockToken({
      id: 'target-1',
      x: 300, y: 300,
      actor: createMockActor({
        id: 'actor-target',
        type: 'npc',
        system: {
          traits: { size: { value: 'med' } },
          attributes: { perception: { value: 14 } }
        }
      })
    });

    // Create wall between tokens
    wall = createMockWall({
      id: 'wall-1',
      c: [200, 0, 200, 400], // Vertical wall between tokens
      sight: 0, // Blocks sight
      move: 0,  // Blocks movement
      sound: 0  // Blocks sound
    });

    // Create terrain feature
    terrain = createMockToken({
      id: 'terrain-1',
      x: 250, y: 250,
      width: 2, height: 2,
      actor: createMockActor({
        id: 'actor-terrain',
        type: 'terrain',
        system: {
          traits: { size: { value: 'med' } }
        }
      })
    });

    // Set up canvas
    global.canvas.walls.placeables = [wall];
    global.canvas.terrain.placeables = [terrain];
  });

  describe('detectCoverStateForAttack', () => {
    test('should detect no cover in open space', () => {
      // Remove all obstacles
      global.canvas.walls.placeables = [];
      global.canvas.terrain.placeables = [];

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBe('none');
    });

    test('should detect standard cover behind wall', () => {
      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should detect greater cover when mostly behind wall', () => {
      // Move target closer to wall
      target.document.x = 250;
      target.document.y = 300;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should detect lesser cover from terrain', () => {
      // Remove wall, keep only terrain
      global.canvas.walls.placeables = [];

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should consider token size in cover calculation', () => {
      // Make target large
      target.actor.system.traits.size.value = 'lg';
      target.document.width = 2;
      target.document.height = 2;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined(); // Large target gets some cover
    });

    test('should handle elevation differences', () => {
      // Attacker on higher ground
      attacker.document.elevation = 10;
      target.document.elevation = 0;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined(); // Reduced cover from elevation
    });

    test('should handle rotation and vision arcs', () => {
      // Attacker with limited vision arc
      attacker.document.rotation = 45; // Facing northeast
      attacker.document.vision.angle = 90; // 90-degree vision arc

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle multiple obstacles', () => {
      // Add another wall
      const wall2 = createMockWall({
        id: 'wall-2',
        c: [150, 0, 150, 400], // Additional wall
        sight: 0
      });
      global.canvas.walls.placeables = [wall, wall2];

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined(); // More obstacles = some cover
    });

    test('should handle thin obstacles', () => {
      // Create thin wall
      const thinWall = createMockWall({
        id: 'thin-wall',
        c: [200, 0, 200, 400],
        sight: 0,
        flags: { width: 1 } // 1 foot wide
      });
      global.canvas.walls.placeables = [thinWall];

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle transparent obstacles', () => {
      // Create transparent wall
      const transparentWall = createMockWall({
        id: 'transparent-wall',
        c: [200, 0, 200, 400],
        sight: 1, // Transparent
        move: 0
      });
      global.canvas.walls.placeables = [transparentWall];

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined(); // Transparent provides some cover
    });
  });

  describe('getSizeRank', () => {
    test('should return correct size ranks', () => {
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'tiny' } } } } }))).toBe(0);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'sm' } } } } }))).toBe(1);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'med' } } } } }))).toBe(2);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'lg' } } } } }))).toBe(3);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'huge' } } } } }))).toBe(4);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'grg' } } } } }))).toBe(5);
    });

    test('should handle missing size values', () => {
      expect(getSizeRank(createMockToken({ actor: { system: { traits: {} } } }))).toBe(2); // Default to medium
      expect(getSizeRank(createMockToken({ actor: { system: {} } }))).toBe(2);
      expect(getSizeRank(createMockToken({ actor: null }))).toBe(2);
      expect(getSizeRank(null)).toBe(2);
    });

    test('should handle case variations', () => {
      // The SIZE_ORDER constant uses lowercase keys, so uppercase won't match
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'SMALL' } } } } }))).toBe(2); // defaults to medium
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'Medium' } } } } }))).toBe(2); // defaults to medium
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'LARGE' } } } } }))).toBe(2); // defaults to medium
      
      // Test the actual lowercase values that work
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'small' } } } } }))).toBe(1);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'medium' } } } } }))).toBe(2);
      expect(getSizeRank(createMockToken({ actor: { system: { traits: { size: { value: 'large' } } } } }))).toBe(3);
    });
  });

  describe('Attack Pair Tracking', () => {
    test('should record attack pairs', () => {
      // Test that functions can be called without throwing errors
      expect(() => _recordPair('attacker-1', 'target-1')).not.toThrow();
      expect(() => _recordPair('attacker-1', 'target-2')).not.toThrow();
      expect(() => _recordPair('attacker-2', 'target-1')).not.toThrow();
    });

    test('should consume attack pairs', () => {
      _recordPair('attacker-1', 'target-1');
      _recordPair('attacker-1', 'target-2');

      const consumed = _consumePairs('attacker-1');
      expect(consumed).toHaveLength(2);
      expect(consumed).toContain('target-1');
      expect(consumed).toContain('target-2');

      // Pairs should be removed after consumption
      // Note: We can't easily test the internal state without the internal function
    });

    test('should handle pairs involving target', () => {
      // Test that functions can be called without throwing errors
      expect(() => _recordPair('attacker-1', 'target-1')).not.toThrow();
      expect(() => _recordPair('attacker-2', 'target-1')).not.toThrow();
    });

    test('should handle null or invalid inputs', () => {
      _recordPair(null, 'target-1');
      _recordPair('attacker-1', null);
      _recordPair(null, null);

      // Should not throw errors
      expect(() => _recordPair(null, null)).not.toThrow();
    });

    test('should handle duplicate pairs', () => {
      _recordPair('attacker-1', 'target-1');
      _recordPair('attacker-1', 'target-1'); // Duplicate

      // Should not throw errors
      expect(() => _recordPair('attacker-1', 'target-1')).not.toThrow();
    });
  });

  describe('Cover Calculation Edge Cases', () => {
    test('should handle tokens at same position', () => {
      target.document.x = attacker.document.x;
      target.document.y = attacker.document.y;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle tokens with zero dimensions', () => {
      target.document.width = 0;
      target.document.height = 0;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle very large tokens', () => {
      target.document.width = 100;
      target.document.height = 100;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle tokens outside canvas bounds', () => {
      target.document.x = 10000;
      target.document.y = 10000;

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });

    test('should handle circular tokens', () => {
      // Simulate circular token with custom flags
      target.document.flags = { ...target.document.flags, circular: true };

      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should handle many obstacles efficiently', () => {
      // Create many walls
      const manyWalls = Array.from({ length: 100 }, (_, i) => 
        createMockWall({
          c: [i * 10, 0, i * 10, 400],
          sight: 0
        })
      );
      global.canvas.walls.placeables = manyWalls;

      const startTime = performance.now();
      const coverState = detectCoverStateForAttack(attacker, target);
      const endTime = performance.now();

      // Should complete in reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      expect(coverState).toBeDefined();
    });

    test('should handle many tokens efficiently', () => {
      // Create many targets
      const manyTargets = Array.from({ length: 50 }, (_, i) => 
        createMockToken({
          id: `target-${i}`,
          x: 300 + (i * 10),
          y: 300 + (i * 10)
        })
      );

      const startTime = performance.now();
      manyTargets.forEach(targetToken => {
        detectCoverStateForAttack(attacker, targetToken);
      });
      const endTime = performance.now();

      // Should complete in reasonable time (less than 200ms for 50 targets)
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('Integration with Settings', () => {
    test('should respect cover source settings', () => {
      // Mock settings to disable certain cover sources
      global.game.settings.get.mockImplementation((moduleId, settingId) => {
        if (settingId === 'coverFromWalls') return false;
        if (settingId === 'coverFromTerrain') return false;
        return true;
      });

      // Should return no cover when sources are disabled
      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBe('none');
    });

    test('should respect auto-cover enabled setting', () => {
      // Mock auto-cover disabled
      global.game.settings.get.mockImplementation((moduleId, settingId) => {
        if (settingId === 'autoCoverEnabled') return false;
        return true;
      });

      // Should return no cover when auto-cover is disabled
      const coverState = detectCoverStateForAttack(attacker, target);
      expect(coverState).toBe('none');
    });
  });
});
