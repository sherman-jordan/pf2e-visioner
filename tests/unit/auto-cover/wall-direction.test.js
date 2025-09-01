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
        dir: 1.5,
        c: [0, 0, 100, 0]
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(false);
    });

    test('should return true for non-directional walls (dir = null)', () => {
      const wallDoc = {
        sight: 20,
        dir: null,
        c: [0, 0, 100, 0]
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(true);
    });

    test('should return true for walls without dir property', () => {
      const wallDoc = {
        sight: 20,
        c: [0, 0, 100, 0]
        // no dir property
      };
      const attackerPos = { x: 50, y: -50 };
      const targetPos = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerPos, targetPos);
      expect(result).toBe(true);
    });

    describe('directional walls (dir is a number)', () => {
      test('should block attacker with positive cross product', () => {
        // Horizontal wall from (0,0) to (100,0)
        const wallDoc = {
          sight: 20,
          dir: 1.5,
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
          dir: 1.5,
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
          dir: 3.14159, // 180 degrees
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
          dir: 3.14159, // 180 degrees
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
          dir: 0.785398, // 45 degrees
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
          dir: 0.785398, // 45 degrees
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
          dir: 1.5,
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
          dir: 1.0,
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
          dir: 1.0,
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
          dir: 1.0,
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
          dir: 1.0
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
          dir: 1.0,
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

  describe('_isRayBlockedByWalls with directional logic', () => {
    test('should respect directional walls when checking ray blocking', () => {
      const mockWall = {
        document: {
          sight: 20,
          dir: 1.0,
          c: [0, 0, 100, 0]
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      // Mock line intersection to return an intersection point
      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 50, y: 0 }));

      // Test 1: Attack from blocking side (should be blocked)
      const a_blocking = { x: 50, y: 50 }; // Below wall (positive cross product)
      const b_blocking = { x: 50, y: -50 }; // Above wall

      const result_blocking = coverDetector._isRayBlockedByWalls(a_blocking, b_blocking);
      expect(result_blocking).toBe(true);

      // Test 2: Attack from non-blocking side (should pass through)
      const a_nonblocking = { x: 50, y: -50 }; // Above wall (negative cross product)
      const b_nonblocking = { x: 50, y: 50 }; // Below wall

      const result_nonblocking = coverDetector._isRayBlockedByWalls(a_nonblocking, b_nonblocking);
      expect(result_nonblocking).toBe(false);
    });

    test('should handle non-directional walls (always block)', () => {
      const mockWall = {
        document: {
          sight: 20,
          dir: null, // Non-directional
          c: [0, 0, 100, 0]
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 50, y: 0 }));

      // Both directions should be blocked
      const a1 = { x: 50, y: 50 };
      const b1 = { x: 50, y: -50 };
      expect(coverDetector._isRayBlockedByWalls(a1, b1)).toBe(true);

      const a2 = { x: 50, y: -50 };
      const b2 = { x: 50, y: 50 };
      expect(coverDetector._isRayBlockedByWalls(a2, b2)).toBe(true);
    });

    test('should skip walls that do not intersect the ray', () => {
      const mockWall = {
        document: {
          sight: 20,
          dir: 1.0,
          c: [0, 0, 100, 0]
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      // No intersection
      coverDetector._lineIntersectionPoint = jest.fn(() => null);

      const a = { x: 50, y: 50 };
      const b = { x: 50, y: -50 };

      const result = coverDetector._isRayBlockedByWalls(a, b);
      expect(result).toBe(false);
    });

    test('should handle empty walls array', () => {
      global.canvas.walls = {
        objects: { children: [] }
      };

      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 100 };

      const result = coverDetector._isRayBlockedByWalls(a, b);
      expect(result).toBe(false);
    });
  });

  describe('_evaluateWallsCover with directional logic', () => {
    test('should consider directional walls in cover evaluation', () => {
      const mockWall = {
        document: {
          sight: 20,
          dir: 1.0,
          c: [0, 0, 100, 0],
          getFlag: jest.fn(() => null) // No cover override
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      // Mock the ray blocking method
      coverDetector._isRayBlockedByWalls = jest.fn()
        .mockReturnValueOnce(true)  // First call: blocking side
        .mockReturnValueOnce(false); // Second call: non-blocking side

      // Test 1: Attack from blocking side
      const p1_blocking = { x: 50, y: 50 };
      const p2_blocking = { x: 50, y: -50 };

      const result_blocking = coverDetector._evaluateWallsCover(p1_blocking, p2_blocking);
      expect(result_blocking).toBe('standard'); // Should provide cover

      // Test 2: Attack from non-blocking side  
      const p1_nonblocking = { x: 50, y: -50 };
      const p2_nonblocking = { x: 50, y: 50 };

      const result_nonblocking = coverDetector._evaluateWallsCover(p1_nonblocking, p2_nonblocking);
      expect(result_nonblocking).toBe('none'); // Should not provide cover
    });

    test('should respect wall cover overrides with directional logic', () => {
      const mockWall = {
        document: {
          sight: 20,
          dir: 1.0,
          c: [0, 0, 100, 0],
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'coverOverride') return 'greater';
            return null;
          })
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [mockWall] }
      };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 50, y: 0 }));
      
      // Mock settings to control the fallback calculation
      global.game.settings.get = jest.fn((module, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 30;
        if (setting === 'wallCoverGreaterThreshold') return 55;
        if (setting === 'wallCoverAllowGreater') return true;
        return null;
      });

      // Test 1: Attack from blocking side
      // The wall override check will return 'greater', and the fallback will return 'standard'
      // Since override acts as a ceiling, _evaluateWallsCover returns the LOWER of the two
      const p1_blocking = { x: 50, y: 50 };
      const p2_blocking = { x: 50, y: -50 };

      const result_blocking = coverDetector._evaluateWallsCover(p1_blocking, p2_blocking);
      expect(result_blocking).toBe('standard'); // Returns calculated cover since it's lower than override ceiling

      // Test 2: Attack from non-blocking side (should ignore override)
      const p1_nonblocking = { x: 50, y: -50 };
      const p2_nonblocking = { x: 50, y: 50 };

      const result_nonblocking = coverDetector._evaluateWallsCover(p1_nonblocking, p2_nonblocking);
      expect(result_nonblocking).toBe('none'); // Should ignore override and return 'none'
    });

    test('should handle wall override ceiling behavior correctly', () => {
      // Create a wall with 'none' override - this should always override calculated cover
      const noneOverrideWall = {
        document: {
          sight: 20,
          dir: null, // Non-directional for simplicity
          c: [0, 0, 100, 0],
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'coverOverride') return 'none';
            return null;
          })
        },
        coords: [0, 0, 100, 0]
      };

      global.canvas.walls = {
        objects: { children: [noneOverrideWall] }
      };

      coverDetector._lineIntersectionPoint = jest.fn(() => ({ x: 50, y: 0 }));
      
      global.game.settings.get = jest.fn((module, setting) => {
        if (setting === 'wallCoverStandardThreshold') return 50;
        if (setting === 'wallCoverGreaterThreshold') return 70;
        if (setting === 'wallCoverAllowGreater') return true;
        return null;
      });

      const p1 = { x: 50, y: 50 };
      const p2 = { x: 50, y: -50 };

      // 'none' override should force result to 'none' even if wall would normally block
      const result = coverDetector._evaluateWallsCover(p1, p2);
      expect(result).toBe('none'); // Override forces 'none'
    });
  });

  describe('real-world directional wall scenarios', () => {
    test('should handle "Left only" wall scenario from user testing', () => {
      // Reproduce the user's test case: wall with "left only" direction
      const wallDoc = {
        sight: 20,
        dir: 4.71238898038469, // 270 degrees (pointing left)
        c: [4163, 1075, 4163, 1263] // Vertical wall
      };

      // Attack from left side (should be blocked)
      const attackerLeft = { x: 4100, y: 1100 }; // Left of wall
      const targetRight = { x: 4300, y: 1100 }; // Right of wall

      const resultLeft = coverDetector._doesWallBlockFromDirection(wallDoc, attackerLeft, targetRight);
      expect(resultLeft).toBe(true); // Should block

      // Attack from right side (should not be blocked)
      const attackerRight = { x: 4300, y: 1100 }; // Right of wall  
      const targetLeft = { x: 4100, y: 1100 }; // Left of wall

      const resultRight = coverDetector._doesWallBlockFromDirection(wallDoc, attackerRight, targetLeft);
      expect(resultRight).toBe(false); // Should not block
    });

    test('should handle multiple directional walls in sequence', () => {
      const wallLeft = {
        document: {
          sight: 20,
          dir: 1.5, // Left-blocking
          c: [0, 0, 100, 0],
          getFlag: jest.fn(() => null)
        },
        coords: [0, 0, 100, 0]
      };

      const wallRight = {
        document: {
          sight: 20,
          dir: 4.7, // Right-blocking  
          c: [200, 0, 300, 0],
          getFlag: jest.fn(() => null)
        },
        coords: [200, 0, 300, 0]
      };

      global.canvas.walls = {
        objects: { children: [wallLeft, wallRight] }
      };

      // Mock intersections
      coverDetector._lineIntersectionPoint = jest.fn()
        .mockReturnValueOnce({ x: 50, y: 0 })   // First wall intersects
        .mockReturnValueOnce({ x: 250, y: 0 }); // Second wall intersects

      // Attack that should be blocked by first wall but not second
      const a = { x: 50, y: 50 }; // Below first wall
      const b = { x: 250, y: -50 }; // Above second wall

      const result = coverDetector._isRayBlockedByWalls(a, b);
      expect(result).toBe(true); // Should be blocked by first wall
    });

    test('should handle edge case: attacker exactly on wall line', () => {
      const wallDoc = {
        sight: 20,
        dir: 1.0,
        c: [0, 0, 100, 0] // Horizontal wall
      };

      // Attacker exactly on the wall line (cross product = 0)
      const attackerOnWall = { x: 50, y: 0 };
      const target = { x: 50, y: 50 };

      const result = coverDetector._doesWallBlockFromDirection(wallDoc, attackerOnWall, target);
      // Cross product = 0, so crossProduct > 0 is false
      expect(result).toBe(false);
    });
  });
});
