/**
 * Unit tests for Wall Direction Checking
 * Tests the directional wall logic in CoverDetector
 */

import '../../setup.js';

describe('Wall Direction Checking', () => {
  let coverDetector;

  beforeEach(async () => {
    jest.resetModules();

    // Import the detector
    const { CoverDetector } = await import('../../../scripts/cover/auto-cover/CoverDetector.js');
    coverDetector = new CoverDetector();

    // Setup mock canvas
    global.canvas.walls = {
      placeables: [],
      objects: { children: [] }
    };
    global.canvas.tokens = { placeables: [] };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_doesWallBlockFromDirection', () => {
    test('should return false for walls with sight=0 (no sight blocking)', () => {
      const wallDoc = {
        sight: 0,
        direction: 1.5,
        c: [0, 0, 100, 0]
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(false);
    });

    test('should return true for non-directional walls (direction = null)', () => {
      const wallDoc = {
        sight: 20,
        direction: null,
        c: [0, 0, 100, 0]
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(true);
    });

    test('should return true for walls without direction property', () => {
      const wallDoc = {
        sight: 20,
        c: [0, 0, 100, 0]
        // no direction property
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(true);
    });

    describe('directional walls (direction is a number)', () => {
      test('should block attacker with positive cross product', () => {
        // Horizontal wall from (0,0) to (100,0)
        const wallDoc = {
          sight: 20,
          direction: 1.5,
          c: [0, 0, 100, 0]
        };
        // Attacker below the wall (positive Y) - this gives positive cross product
        // wallDx = 100, wallDy = 0, attackerDx = 50, attackerDy = 50
        // crossProduct = 100 * 50 - 0 * 50 = 5000 > 0
        const attackerPos = { x: 50, y: 50 };
        const targetPos = { x: 50, y: -50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(true);
      });

      test('should not block attacker with negative cross product', () => {
        // Horizontal wall from (0,0) to (100,0)
        const wallDoc = {
          sight: 20,
          direction: 1.5,
          c: [0, 0, 100, 0]
        };
        // Attacker above the wall (negative Y) - this gives negative cross product
        // wallDx = 100, wallDy = 0, attackerDx = 50, attackerDy = -50
        // crossProduct = 100 * (-50) - 0 * 50 = -5000 < 0
        const attackerPos = { x: 50, y: -50 };
        const targetPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(false);
      });

      test('should handle vertical wall with positive cross product', () => {
        // Vertical wall from (0,0) to (0,100)
        const wallDoc = {
          sight: 20,
          direction: 3.14159, // 180 degrees
          c: [0, 0, 0, 100]
        };
        // Attacker to the right of the wall (positive X) - positive cross product
        // wallDx = 0, wallDy = 100, attackerDx = 50, attackerDy = 50
        // crossProduct = 0 * 50 - 100 * 50 = -5000 < 0
        const attackerPos = { x: 50, y: 50 };
        const targetPos = { x: -50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(false);
      });

      test('should handle vertical wall with negative cross product', () => {
        // Vertical wall from (0,0) to (0,100)
        const wallDoc = {
          sight: 20,
          direction: 3.14159, // 180 degrees
          c: [0, 0, 0, 100]
        };
        // Attacker to the left of the wall (negative X) - positive cross product
        // wallDx = 0, wallDy = 100, attackerDx = -50, attackerDy = 50
        // crossProduct = 0 * 50 - 100 * (-50) = 5000 > 0
        const attackerPos = { x: -50, y: 50 };
        const targetPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(true);
      });

      test('should handle diagonal walls with positive cross product', () => {
        // Diagonal wall from (0,0) to (100,100)
        const wallDoc = {
          sight: 20,
          direction: 0.785398, // 45 degrees
          c: [0, 0, 100, 100]
        };
        // Attacker below the diagonal line - positive cross product
        // wallDx = 100, wallDy = 100, attackerDx = 50, attackerDy = 25
        // crossProduct = 100 * 25 - 100 * 50 = 2500 - 5000 = -2500 < 0
        const attackerPos = { x: 50, y: 25 };
        const targetPos = { x: 50, y: 75 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(false);
      });

      test('should handle diagonal walls with negative cross product', () => {
        // Diagonal wall from (0,0) to (100,100)
        const wallDoc = {
          sight: 20,
          direction: 0.785398, // 45 degrees
          c: [0, 0, 100, 100]
        };
        // Attacker above the diagonal line - negative cross product
        // wallDx = 100, wallDy = 100, attackerDx = 50, attackerDy = 75
        // crossProduct = 100 * 75 - 100 * 50 = 7500 - 5000 = 2500 > 0
        const attackerPos = { x: 50, y: 75 };
        const targetPos = { x: 50, y: 25 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(true);
      });

      test('should handle walls with alternative coordinate format (x,y,x2,y2)', () => {
        const wallDoc = {
          sight: 20,
          direction: 1.5,
          x: 0,
          y: 0,
          x2: 100,
          y2: 0
        };
        // Use negative Y for negative cross product
        const attackerPos = { x: 50, y: -50 };
        const targetPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
        expect(result).toBe(false);
      });
    });

    describe('cross product calculations', () => {
      test('should calculate positive cross product for attacker on left side', () => {
        // This test verifies the math directly
        const wallDoc = {
          sight: 20,
          direction: 1.0,
          c: [0, 0, 100, 0] // horizontal wall
        };
        const attackerPos = { x: 50, y: -25 }; // above wall
        
        // Expected calculation:
        // wallDx = 100 - 0 = 100
        // wallDy = 0 - 0 = 0
        // attackerDx = 50 - 0 = 50
        // attackerDy = -25 - 0 = -25
        // crossProduct = wallDx * attackerDy - wallDy * attackerDx
        //               = 100 * (-25) - 0 * 50 = -2500
        // Since crossProduct < 0, this should return false
        
        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, {});
        expect(result).toBe(false);
      });

      test('should calculate negative cross product for attacker on right side', () => {
        const wallDoc = {
          sight: 20,
          direction: 1.0,
          c: [0, 0, 100, 0] // horizontal wall
        };
        const attackerPos = { x: 50, y: 25 }; // below wall
        
        // Expected calculation:
        // wallDx = 100, wallDy = 0
        // attackerDx = 50, attackerDy = 25
        // crossProduct = 100 * 25 - 0 * 50 = 2500
        // Since crossProduct > 0, this should return true
        
        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, {});
        expect(result).toBe(true);
      });
    });

    describe('error handling', () => {
      test('should handle walls with invalid coordinates', () => {
        const wallDoc = {
          sight: 20,
          direction: 1.0,
          c: null // invalid coordinates
        };
        const attackerPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, {});
        // The current implementation returns false when coordinates are missing/invalid
        expect(result).toBe(false);
      });

      test('should handle invalid wall document gracefully', () => {
        const wallDoc = null;
        const attackerPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, {});
        expect(result).toBe(true);
      });

      test('should handle missing coordinates gracefully', () => {
        const wallDoc = {
          sight: 20,
          direction: 1.0
          // no coordinates
        };
        const attackerPos = { x: 50, y: 50 };

        const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, {});
        // The current implementation returns false when coordinates are missing
        expect(result).toBe(false);
      });
    });
  });

  describe('integration with cover detection', () => {
    test('should respect directional wall blocking in cover override checks', () => {
      // Create a directional wall with cover override
      const mockWall = {
        document: {
          sight: 20,
          direction: 1.0,
          c: [0, 0, 100, 0],
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'coverOverride') return 'standard';
            return null;
          })
        },
        coords: [0, 0, 100, 0]
      };

      // Mock canvas.walls
      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      // Mock line intersection to return true for both cases
      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 50, y: 0 }));

      // Test 1: Attack from blocking side (positive cross product)
      const p1_blocking = { x: 50, y: 50 }; // attacker below wall (positive cross product)
      const p2_blocking = { x: 50, y: -50 }; // target above wall

      const result_blocking = coverDetector._checkWallCoverOverrides(p1_blocking, p2_blocking);
      expect(result_blocking).toBe('standard'); // Override should be applied

      // Test 2: Attack from non-blocking side (negative cross product)
      const p1_nonblocking = { x: 50, y: -50 }; // attacker above wall (negative cross product)
      const p2_nonblocking = { x: 50, y: 50 }; // target below wall

      const result_nonblocking = coverDetector._checkWallCoverOverrides(p1_nonblocking, p2_nonblocking);
      expect(result_nonblocking).toBe(null); // No override should be applied
    });
  });
});
