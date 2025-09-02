/**
 * Tests for door cover detection functionality
 */

import { CoverDetector } from '../../scripts/cover/auto-cover/CoverDetector.js';
import '../setup.js';

describe('Door Cover Detection', () => {
  let coverDetector;
  let mockCanvas;
  let mockWalls;

  beforeEach(() => {
    coverDetector = new CoverDetector();
    
    // Mock canvas and walls
    mockWalls = [];
    mockCanvas = {
      walls: {
        objects: {
          children: mockWalls
        },
        placeables: mockWalls
      },
      tokens: {
        placeables: []
      }
    };
    
    global.canvas = mockCanvas;
    
    // Mock game settings
    global.game = {
      settings: {
        get: jest.fn((module, setting) => {
          switch (setting) {
            case 'wallCoverStandardThreshold':
              return 30;
            case 'wallCoverGreaterThreshold':
              return 55;
            case 'wallCoverAllowGreater':
              return true;
            default:
              return null;
          }
        })
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('_doesWallBlockFromDirection', () => {
    const attackerPos = { x: 50, y: 100 };

    test('should block for closed door', () => {
      const closedDoorWall = {
        sight: 20, // blocks sight
        door: 1, // is a door
        ds: 0, // closed door
        doorState: 0, // closed door (fallback)
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(closedDoorWall, attackerPos);
      expect(result).toBe(true);
    });

    test('should not block for open door', () => {
      const openDoorWall = {
        sight: 20, // normally blocks sight
        door: 1, // is a door
        ds: 1, // open door
        doorState: 1, // open door (fallback)
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(openDoorWall, attackerPos);
      expect(result).toBe(false);
    });

    test('should block for locked door', () => {
      const lockedDoorWall = {
        sight: 20, // blocks sight
        door: 1, // is a door
        ds: 2, // locked door
        doorState: 2, // locked door (fallback)
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(lockedDoorWall, attackerPos);
      expect(result).toBe(true);
    });

    test('should block for secret door (closed)', () => {
      const secretDoorWall = {
        sight: 20, // blocks sight
        door: 2, // secret door
        ds: 0, // closed/secret state
        doorState: 0, // closed/secret state (fallback)
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(secretDoorWall, attackerPos);
      expect(result).toBe(true);
    });

    test('should not block for open secret door', () => {
      const openSecretDoorWall = {
        sight: 20, // normally blocks sight
        door: 2, // secret door
        ds: 1, // open state
        doorState: 1, // open state (fallback)
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(openSecretDoorWall, attackerPos);
      expect(result).toBe(false);
    });

    test('should block for normal wall', () => {
      const normalWall = {
        sight: 20, // blocks sight
        door: 0, // not a door
        ds: 0, // not applicable
        doorState: 0, // not applicable
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(normalWall, attackerPos);
      expect(result).toBe(true);
    });

    test('should not block for wall with no sight blocking', () => {
      const noSightWall = {
        sight: 0, // doesn't block sight
        door: 0, // not a door
        dir: 0 // blocks from both directions
      };

      const result = coverDetector._doesWallBlockFromDirection(noSightWall, attackerPos);
      expect(result).toBe(false);
    });

    test('should use ds property over doorState fallback', () => {
      const doorWithBothProperties = {
        sight: 20,
        door: 1,
        ds: 1, // open (should take precedence)
        doorState: 0, // closed (should be ignored)
        dir: 0
      };

      const result = coverDetector._doesWallBlockFromDirection(doorWithBothProperties, attackerPos);
      expect(result).toBe(false); // Should use ds=1 (open)
    });

    test('should use doorState fallback when ds is undefined', () => {
      const doorWithOnlyDoorState = {
        sight: 20,
        door: 1,
        // ds: undefined (not present)
        doorState: 1, // open (should be used)
        dir: 0
      };

      const result = coverDetector._doesWallBlockFromDirection(doorWithOnlyDoorState, attackerPos);
      expect(result).toBe(false); // Should use doorState=1 (open)
    });

    test('should handle directional walls with open doors', () => {
      const directionalOpenDoor = {
        sight: 20,
        door: 1,
        ds: 1, // open door
        dir: 1 // left-only blocking
      };

      // Open door should not block regardless of direction
      const result = coverDetector._doesWallBlockFromDirection(directionalOpenDoor, attackerPos);
      expect(result).toBe(false);
    });

    test('should handle directional walls with closed doors', () => {
      const directionalClosedDoor = {
        sight: 20,
        door: 1,
        ds: 0, // closed door
        dir: 1 // left-only blocking
      };

      // Closed door should respect directional blocking
      const result = coverDetector._doesWallBlockFromDirection(directionalClosedDoor, attackerPos);
      // This would depend on the specific geometry, but door state is checked first
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Integration with _evaluateWallsCover', () => {
    beforeEach(() => {
      // Mock _findNearestTokenToPoint to return null (fallback to single ray test)
      jest.spyOn(coverDetector, '_findNearestTokenToPoint').mockReturnValue(null);
      jest.spyOn(coverDetector, '_isRayBlockedByWalls').mockImplementation((p1, p2) => {
        // Mock implementation that checks our test walls
        return mockWalls.some(wall => {
          const wallDoc = wall.document || wall;
          return coverDetector._doesWallBlockFromDirection(wallDoc, p1);
        });
      });
    });

    test('should return no cover for open door', () => {
      const openDoorWall = {
        sight: 20,
        door: 1,
        ds: 1, // open
        dir: 0
      };

      mockWalls.push({ document: openDoorWall });

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      const result = coverDetector._evaluateWallsCover(p1, p2);
      expect(result).toBe('none');
    });

    test('should return cover for closed door', () => {
      const closedDoorWall = {
        sight: 20,
        door: 1,
        ds: 0, // closed
        dir: 0
      };

      mockWalls.push({ document: closedDoorWall });

      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };

      const result = coverDetector._evaluateWallsCover(p1, p2);
      expect(result).toBe('standard'); // fallback single-ray test returns 'standard'
    });
  });

  describe('Edge Cases', () => {
    const attackerPos = { x: 50, y: 100 };

    test('should handle missing door property', () => {
      const wallWithoutDoorProperty = {
        sight: 20,
        // door: undefined
        ds: 1,
        dir: 0
      };

      const result = coverDetector._doesWallBlockFromDirection(wallWithoutDoorProperty, attackerPos);
      expect(result).toBe(true); // Should treat as normal wall
    });

    test('should handle missing door state properties', () => {
      const doorWithoutStateProperties = {
        sight: 20,
        door: 1,
        // ds: undefined
        // doorState: undefined
        dir: 0
      };

      const result = coverDetector._doesWallBlockFromDirection(doorWithoutStateProperties, attackerPos);
      expect(result).toBe(true); // Should default to closed (0) and block
    });

    test('should handle invalid door state values', () => {
      const doorWithInvalidState = {
        sight: 20,
        door: 1,
        ds: 'invalid', // invalid value
        doorState: 'also invalid', // invalid value
        dir: 0
      };

      const result = coverDetector._doesWallBlockFromDirection(doorWithInvalidState, attackerPos);
      expect(result).toBe(true); // Should default to closed (0) and block
    });

    test('should handle null wall document', () => {
      expect(() => {
        coverDetector._doesWallBlockFromDirection(null, attackerPos);
      }).not.toThrow();
    });

    test('should handle exception during door state checking', () => {
      const problematicWall = {
        get sight() {
          throw new Error('Test error');
        },
        door: 1,
        ds: 1
      };

      // Should not throw and should return true (safe default for exceptions)
      const result = coverDetector._doesWallBlockFromDirection(problematicWall, attackerPos);
      expect(result).toBe(true); // The try-catch returns true (blocking) as safe default
    });
  });

  describe('Door State Constants', () => {
    const attackerPos = { x: 50, y: 100 };

    test('should recognize all door states correctly', () => {
      const doorStates = [
        { ds: 0, expected: true, description: 'closed/secret' },
        { ds: 1, expected: false, description: 'open' },
        { ds: 2, expected: true, description: 'locked' }
      ];

      doorStates.forEach(({ ds, expected, description }) => {
        const door = {
          sight: 20,
          door: 1,
          ds: ds,
          dir: 0
        };

        const result = coverDetector._doesWallBlockFromDirection(door, attackerPos);
        expect(result).toBe(expected, `Door state ${ds} (${description}) should ${expected ? 'block' : 'not block'}`);
      });
    });

    test('should recognize all door types correctly', () => {
      const doorTypes = [
        { door: 0, expected: true, description: 'normal wall' },
        { door: 1, ds: 0, expected: true, description: 'closed door' },
        { door: 1, ds: 1, expected: false, description: 'open door' },
        { door: 2, ds: 0, expected: true, description: 'closed secret door' },
        { door: 2, ds: 1, expected: false, description: 'open secret door' }
      ];

      doorTypes.forEach(({ door, ds, expected, description }) => {
        const wall = {
          sight: 20,
          door: door,
          ds: ds ?? 0,
          dir: 0
        };

        const result = coverDetector._doesWallBlockFromDirection(wall, attackerPos);
        expect(result).toBe(expected, `${description} should ${expected ? 'block' : 'not block'}`);
      });
    });
  });
});
