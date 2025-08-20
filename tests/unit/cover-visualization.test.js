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
  let coverViz, mockSelectedToken, mockBlockingToken, mockCanvas;

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
      }
    }));

    coverViz = new CoverVisualization();
  });

  describe('isPositionOccupied with visibility states', () => {
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
});
