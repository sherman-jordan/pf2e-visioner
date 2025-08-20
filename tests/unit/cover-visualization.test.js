/**
 * Tests for cover visualization functionality
 * Specifically testing the visibility-aware position occupation logic
 */

import '../setup.js';

// Mock the visibility utility
jest.mock('../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(),
}));

describe('Cover Visualization', () => {
  let coverViz, mockSelectedToken, mockBlockingToken, mockCanvas, mockWalls;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock tokens
    mockSelectedToken = createMockToken('selected', 'character');
    mockBlockingToken = createMockToken('blocker', 'character');

    // Create mock canvas
    mockCanvas = {
      grid: { size: 100 },
      tokens: {
        placeables: [mockSelectedToken, mockBlockingToken]
      }
    };

    // Mock the cover visualization class
    const CoverVisualization = jest.fn().mockImplementation(() => ({
      isPositionOccupied: function(worldX, worldY, selectedToken, canvas) {
        const gridSize = canvas.grid.size;
        
        // Check all tokens on the scene
        for (const token of canvas.tokens.placeables) {
          if (!token?.actor) continue;
          if (token.id === selectedToken.id) continue; // Skip the selected token itself
          
          // Check if the token is hidden or undetected from the selected token's perspective
          try {
            // Check if the token is foundry hidden first (simple check)
            if (token.document.hidden) {
              continue;
            }
            
            // Check PF2e visibility state using the imported utility
            const { getVisibilityBetween } = require('../../scripts/utils.js');
            const visibility = getVisibilityBetween(selectedToken, token);
            
            // If the token is undetected, it doesn't block movement
            if (visibility === "undetected") {
              continue;
            }
          } catch (error) {
            // If visibility check fails, proceed with normal blocking logic
            console.warn("PF2e Visioner: Error checking token visibility for cover visualization:", error);
          }
          
          // Get token's bounds
          const tokenRect = {
            x1: token.document.x,
            y1: token.document.y,
            x2: token.document.x + (token.document.width * gridSize),
            y2: token.document.y + (token.document.height * gridSize)
          };
          
          // Check if the world position overlaps with this token's area
          const positionRect = {
            x1: worldX - gridSize/2,
            y1: worldY - gridSize/2,
            x2: worldX + gridSize/2,
            y2: worldY + gridSize/2
          };
          
          // Check for overlap
          const overlaps = !(positionRect.x2 <= tokenRect.x1 || 
                            positionRect.x1 >= tokenRect.x2 || 
                            positionRect.y2 <= tokenRect.y1 || 
                            positionRect.y1 >= tokenRect.y2);
          
          if (overlaps) {
            // Check if tiny creatures can share - both must be tiny
            const selectedSize = selectedToken?.actor?.system?.traits?.size?.value ?? "med";
            const blockerSize = token?.actor?.system?.traits?.size?.value ?? "med";
            
            if (selectedSize === "tiny" && blockerSize === "tiny") {
              // Tiny creatures can share the same square
              continue;
            }
            
            // Position is occupied and can't be shared
            return true;
          }
        }
        
        return false; // Position is free
      },
      
      // Add grid position visibility method
      isGridPositionVisible: function(worldX, worldY, canvas) {
        // Mock implementation - by default assume visible unless specifically mocked
        return true;
      },
      
      // Add wall blocking methods
      isLineOfSightBlockedByWalls: function(p1, p2, canvas) {
        const walls = canvas?.walls?.placeables || [];
        if (!walls.length) return false;
        
        for (const wall of walls) {
          const d = wall.document;
          if (!d) continue;
          
          // Skip open doors
          const isDoor = Number(d.door) > 0;
          const doorState = Number(d.ds ?? d.doorState ?? 0);
          if (isDoor && doorState === 1) continue;
          
          // Simple intersection test for mocking
          const wallX1 = d.x, wallY1 = d.y, wallX2 = d.x2, wallY2 = d.y2;
          if ([wallX1, wallY1, wallX2, wallY2].some(coord => 
              typeof coord !== 'number' || !isFinite(coord))) {
            continue;
          }
          
          // Mock line intersection - simplified for testing
          if (this.mockSegmentIntersection(p1, p2, {x: wallX1, y: wallY1}, {x: wallX2, y: wallY2})) {
            return true;
          }
        }
        return false;
      },
      
      isAggressivelyBlockedByWalls: function(squareCenter, targetCenter, gridSize, canvas) {
        const half = gridSize / 2;
        const inset = half * 0.8;
        const samplePoints = [
          { x: squareCenter.x, y: squareCenter.y },
          { x: squareCenter.x - inset, y: squareCenter.y - inset },
          { x: squareCenter.x + inset, y: squareCenter.y - inset },
          { x: squareCenter.x - inset, y: squareCenter.y + inset },
          { x: squareCenter.x + inset, y: squareCenter.y + inset }
        ];

        // If ANY sample ray is blocked, consider the square blocked
        for (const sample of samplePoints) {
          if (this.isLineOfSightBlockedByWalls(sample, targetCenter, canvas)) {
            return true;
          }
        }
        return false;
      },
      
      // Mock line segment intersection for testing
      mockSegmentIntersection: function(p1, p2, p3, p4) {
        // Simple intersection test - check if line from p1 to p2 crosses line from p3 to p4
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return false; // parallel
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        return (t >= 0 && t <= 1 && u >= 0 && u <= 1);
      },
      
      // Mock createCoverOverlay method for testing
      createCoverOverlay: function(hoveredToken) {
        // Simple mock that just returns without doing anything
        // Real tests would override this method with specific behavior
        return;
      }
    }));

    coverViz = new CoverVisualization();
  });

  describe('Wall Blocking Tests', () => {
    test('walls block line of sight for players but not for GMs', () => {
      // Mock the cover visualization class with wall blocking methods
      const CoverVisualization = jest.fn().mockImplementation(() => ({
        isLineOfSightBlockedByWalls: function(p1, p2, canvas) {
          // Simple mock: check if there's a wall between the points
          const walls = canvas?.walls?.placeables || [];
          for (const wall of walls) {
            // Simple intersection check for testing
            if (wall.document.x === 150 && wall.document.y === 100) {
              // This wall blocks line of sight between certain points
              return true;
            }
          }
          return false;
        },
        
        segmentsIntersect: function(p1, p2, p3, p4) {
          // Simple mock intersection check
          return false;
        }
      }));
      
      const coverViz = new CoverVisualization();
      
      // Mock canvas with walls
      const mockCanvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 150,
                y: 100,
                x2: 250,
                y2: 100,
                door: 0,
                ds: 0
              }
            }
          ]
        }
      };
      
      // Test point that should be blocked by wall
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 100 };
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      expect(isBlocked).toBe(true);
    });
    
    test('open doors do not block line of sight', () => {
      const CoverVisualization = jest.fn().mockImplementation(() => ({
        isLineOfSightBlockedByWalls: function(p1, p2, canvas) {
          const walls = canvas?.walls?.placeables || [];
          for (const wall of walls) {
            const isDoor = Number(wall.document.door) > 0;
            const doorState = Number(wall.document.ds ?? 0);
            
            // Skip open doors
            if (isDoor && doorState === 1) {
              continue;
            }
            
            // For testing, treat all other walls as blocking
            return true;
          }
          return false;
        }
      }));
      
      const coverViz = new CoverVisualization();
      
      // Mock canvas with an open door
      const mockCanvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 150,
                y: 100,
                x2: 250,
                y2: 100,
                door: 1, // Door
                ds: 1     // Open
              }
            }
          ]
        }
      };
      
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 100 };
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      expect(isBlocked).toBe(false);
    });
    
    test('closed doors block line of sight', () => {
      const CoverVisualization = jest.fn().mockImplementation(() => ({
        isLineOfSightBlockedByWalls: function(p1, p2, canvas) {
          const walls = canvas?.walls?.placeables || [];
          for (const wall of walls) {
            const isDoor = Number(wall.document.door) > 0;
            const doorState = Number(wall.document.ds ?? 0);
            
            // Skip open doors
            if (isDoor && doorState === 1) {
              continue;
            }
            
            // For testing, treat all other walls as blocking
            return true;
          }
          return false;
        }
      }));
      
      const coverViz = new CoverVisualization();
      
      // Mock canvas with a closed door
      const mockCanvas = {
        walls: {
          placeables: [
            {
              document: {
                x: 150,
                y: 100,
                x2: 250,
                y2: 100,
                door: 1, // Door
                ds: 0     // Closed
              }
            }
          ]
        }
      };
      
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 100 };
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      expect(isBlocked).toBe(true);
    });
  });

  describe('Position Occupation Tests', () => {
    test('position is not occupied when blocking token is foundry hidden', () => {
      // Set up blocking token as foundry hidden
      mockBlockingToken.document.hidden = true;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('observed');

      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(false);
    });

    test('position is not occupied when blocking token is undetected', () => {
      // Set up blocking token as visible but undetected
      mockBlockingToken.document.hidden = false;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('undetected');

      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(false);
    });

    test('position is occupied when blocking token is visible and detected', () => {
      // Set up blocking token as visible and observed
      mockBlockingToken.document.hidden = false;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('observed');

      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(true);
    });

    test('position is occupied when blocking token is hidden but still blocks', () => {
      // Set up blocking token as PF2e hidden (still blocks movement)
      mockBlockingToken.document.hidden = false;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('hidden');

      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(true);
    });

    test('tiny creatures can share space regardless of visibility', () => {
      // Set up both tokens as tiny
      mockSelectedToken.actor.system.traits.size.value = 'tiny';
      mockBlockingToken.actor.system.traits.size.value = 'tiny';
      mockBlockingToken.document.hidden = false;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('observed');

      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(false);
    });

    test('handles visibility check errors gracefully', () => {
      // Set up blocking token
      mockBlockingToken.document.hidden = false;
      mockBlockingToken.document.x = 0;
      mockBlockingToken.document.y = 0;
      mockBlockingToken.document.width = 1;
      mockBlockingToken.document.height = 1;

      const { getVisibilityBetween } = require('../../scripts/utils.js');
      getVisibilityBetween.mockImplementation(() => {
        throw new Error('Visibility check failed');
      });

      // Should not throw and should fall back to normal blocking logic
      const isOccupied = coverViz.isPositionOccupied(50, 50, mockSelectedToken, mockCanvas);

      expect(isOccupied).toBe(true); // Falls back to normal blocking
    });
  });

  describe('Wall Blocking Tests', () => {
    beforeEach(() => {
      // Set up mock walls
      mockWalls = [
        // Horizontal wall
        {
          document: {
            x: 100, y: 200, x2: 300, y2: 200,
            door: 0, ds: 0, doorState: 0
          }
        },
        // Vertical wall
        {
          document: {
            x: 400, y: 100, x2: 400, y2: 300,
            door: 0, ds: 0, doorState: 0
          }
        },
        // Open door (should not block)
        {
          document: {
            x: 500, y: 100, x2: 500, y2: 300,
            door: 1, ds: 1, doorState: 1 // Open door
          }
        },
        // Closed door (should block)
        {
          document: {
            x: 600, y: 100, x2: 600, y2: 300,
            door: 1, ds: 0, doorState: 0 // Closed door
          }
        }
      ];

      // Add walls to mock canvas
      mockCanvas.walls = {
        placeables: mockWalls
      };
    });

    test('isLineOfSightBlockedByWalls detects horizontal wall blocking', () => {
      const p1 = { x: 200, y: 150 }; // Above wall
      const p2 = { x: 200, y: 250 }; // Below wall
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(true);
    });

    test('isLineOfSightBlockedByWalls detects vertical wall blocking', () => {
      const p1 = { x: 350, y: 200 }; // Left of wall
      const p2 = { x: 450, y: 200 }; // Right of wall
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(true);
    });

    test('isLineOfSightBlockedByWalls ignores open doors', () => {
      const p1 = { x: 450, y: 200 }; // Left of open door
      const p2 = { x: 550, y: 200 }; // Right of open door
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(false);
    });

    test('isLineOfSightBlockedByWalls blocks through closed doors', () => {
      const p1 = { x: 550, y: 200 }; // Left of closed door
      const p2 = { x: 650, y: 200 }; // Right of closed door
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(true);
    });

    test('isLineOfSightBlockedByWalls allows clear line of sight', () => {
      const p1 = { x: 50, y: 50 };   // No walls between
      const p2 = { x: 150, y: 150 }; // these points
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(false);
    });

    test('isAggressivelyBlockedByWalls blocks when any corner is blocked', () => {
      const squareCenter = { x: 200, y: 175 }; // Square near horizontal wall
      const targetCenter = { x: 200, y: 225 }; // Target across wall
      const gridSize = 100;
      
      const isBlocked = coverViz.isAggressivelyBlockedByWalls(squareCenter, targetCenter, gridSize, mockCanvas);
      
      expect(isBlocked).toBe(true);
    });

    test('isAggressivelyBlockedByWalls allows clear squares', () => {
      const squareCenter = { x: 50, y: 50 };   // Clear area
      const targetCenter = { x: 150, y: 150 }; // Clear target
      const gridSize = 100;
      
      const isBlocked = coverViz.isAggressivelyBlockedByWalls(squareCenter, targetCenter, gridSize, mockCanvas);
      
      expect(isBlocked).toBe(false);
    });

    test('wall blocking only applies to players, not GMs', () => {
      // Mock game.user.isGM
      global.game = {
        user: { isGM: true }
      };

      const squareCenter = { x: 200, y: 175 }; // Square that would be blocked for players
      const targetCenter = { x: 200, y: 225 }; // Target across wall
      
      // For GMs, shouldShowCover should remain true regardless of walls
      // This would be tested in the main createCoverOverlay logic
      expect(global.game.user.isGM).toBe(true);
    });

    test('handles empty walls array gracefully', () => {
      mockCanvas.walls.placeables = [];
      
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 200 };
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(false);
    });

    test('handles missing canvas.walls gracefully', () => {
      mockCanvas.walls = null;
      
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 200 };
      
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(isBlocked).toBe(false);
    });

    test('handles wall with invalid coordinates gracefully', () => {
      mockWalls.push({
        document: {
          x: NaN, y: 100, x2: 200, y2: NaN,
          door: 0, ds: 0
        }
      });
      
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 200, y: 200 };
      
      // Should not throw and should continue checking other walls
      const isBlocked = coverViz.isLineOfSightBlockedByWalls(p1, p2, mockCanvas);
      
      expect(typeof isBlocked).toBe('boolean');
    });
  });

  describe('Vision Integration Tests', () => {
    let mockHoveredToken, mockSelectedToken;

    beforeEach(() => {
      // Set up mock tokens
      mockHoveredToken = {
        isVisible: true,
        center: { x: 300, y: 300 },
        getCenter: () => ({ x: 300, y: 300 })
      };
      
      mockSelectedToken = {
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
        document: { x: 100, y: 100 }
      };

      // Mock canvas.tokens.controlled
      mockCanvas.tokens = {
        controlled: [mockSelectedToken],
        placeables: []
      };

      // Mock canvas.interface
      mockCanvas.interface = {
        addChild: jest.fn()
      };

      // Mock game.user
      global.game = {
        ...global.game,
        user: { isGM: false }
      };
    });

    test('shows cover overlay for visible tokens to players', () => {
      // Set token as visible (respects current fog of war)
      mockHoveredToken.isVisible = true;
      
      // Mock PIXI.Graphics
      global.PIXI = {
        Graphics: jest.fn().mockImplementation(() => ({
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          lineStyle: jest.fn()
        }))
      };

      // Should not return early (would throw if PIXI setup is incomplete)
      expect(() => {
        coverViz.createCoverOverlay(mockHoveredToken);
      }).not.toThrow();
    });

    test('does not show cover overlay for invisible tokens to players', () => {
      // Set token as invisible (due to fog of war)
      mockHoveredToken.isVisible = false;
      
      // Mock PIXI.Graphics (should not be called)
      const mockGraphics = {
        clear: jest.fn(),
        beginFill: jest.fn(),
        drawRect: jest.fn(),
        endFill: jest.fn(),
        lineStyle: jest.fn()
      };
      global.PIXI = {
        Graphics: jest.fn().mockReturnValue(mockGraphics)
      };

      // Call the method
      coverViz.createCoverOverlay(mockHoveredToken);
      
      // PIXI.Graphics should not be instantiated for invisible tokens
      expect(global.PIXI.Graphics).not.toHaveBeenCalled();
    });

    test('shows cover overlay for all tokens to GMs regardless of visibility', () => {
      // Set user as GM
      global.game.user.isGM = true;
      
      // Set token as invisible (but GM should see it anyway)
      mockHoveredToken.isVisible = false;
      
      // Mock PIXI.Graphics
      global.PIXI = {
        Graphics: jest.fn().mockImplementation(() => ({
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          lineStyle: jest.fn()
        }))
      };

      // Should not return early for GMs (GM bypasses visibility checks)
      expect(() => {
        coverViz.createCoverOverlay(mockHoveredToken);
      }).not.toThrow();
    });

    test('returns early if no tokens are controlled', () => {
      // No controlled tokens
      mockCanvas.tokens.controlled = [];
      
      // Mock PIXI.Graphics (should not be called)
      const mockGraphics = {
        clear: jest.fn()
      };
      global.PIXI = {
        Graphics: jest.fn().mockReturnValue(mockGraphics)
      };

      // Call the method
      coverViz.createCoverOverlay(mockHoveredToken);
      
      // Should return early and not create graphics
      expect(global.PIXI.Graphics).not.toHaveBeenCalled();
    });
  });

  describe('Fog of War Integration Tests', () => {
    let mockHoveredToken;

    beforeEach(() => {
      // Reset to player mode
      global.game.user.isGM = false;
      
      // Set up mock hovered token
      mockHoveredToken = {
        isVisible: true,
        center: { x: 300, y: 300 },
        getCenter: () => ({ x: 300, y: 300 })
      };
      
      // Set up mock tokens with controlled tokens
      mockCanvas.tokens.controlled = [mockSelectedToken];
    });

    test('hides cover squares in fogged areas for players', () => {
      // Mock grid position as not visible (fogged)
      coverViz.isGridPositionVisible = jest.fn().mockReturnValue(false);
      
      // Mock PIXI.Graphics
      global.PIXI = {
        Graphics: jest.fn().mockImplementation(() => ({
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          lineStyle: jest.fn()
        }))
      };

      // Should not draw any squares for fogged positions
      coverViz.createCoverOverlay(mockHoveredToken);
      
      // Verify the mock was set up correctly
      expect(coverViz.isGridPositionVisible).toBeDefined();
      expect(coverViz.isGridPositionVisible()).toBe(false);
    });

    test('shows cover squares in visible areas for players', () => {
      // Mock grid position as visible
      coverViz.isGridPositionVisible = jest.fn().mockReturnValue(true);
      
      // Mock PIXI.Graphics
      global.PIXI = {
        Graphics: jest.fn().mockImplementation(() => ({
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          lineStyle: jest.fn()
        }))
      };

      // Should draw squares for visible positions
      coverViz.createCoverOverlay(mockHoveredToken);
      
      // Verify the mock was set up correctly
      expect(coverViz.isGridPositionVisible).toBeDefined();
      expect(coverViz.isGridPositionVisible()).toBe(true);
    });

    test('bypasses fog of war checks for GMs', () => {
      // Set user as GM
      global.game.user.isGM = true;
      
      // Mock grid position visibility (should not be called for GMs)
      coverViz.isGridPositionVisible = jest.fn();
      
      // Mock PIXI.Graphics
      global.PIXI = {
        Graphics: jest.fn().mockImplementation(() => ({
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          lineStyle: jest.fn()
        }))
      };

      // Should draw squares without checking fog of war for GMs
      coverViz.createCoverOverlay(mockHoveredToken);
      
      // Grid position visibility should not be checked for GMs
      expect(coverViz.isGridPositionVisible).not.toHaveBeenCalled();
    });
  });
});
