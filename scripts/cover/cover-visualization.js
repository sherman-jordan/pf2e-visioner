import { MODULE_ID } from "../constants.js";
import { detectCoverStateForAttack } from "./auto-cover.js";

/**
 * Cover field visualization system
 * Shows cover levels from cursor position to hovered token when hotkey is held
 * Each client sees only their own visualization (client-specific, not shared)
 */
class CoverVisualization {
  constructor() {
    this.isActive = false;
    this.currentTarget = null;
    this.overlayGraphics = null;
    this.keyPressed = false;
    this.visualizationTimeout = null;
    this.lastTargetId = null;
    
    this.init();
  }
  
  init() {
    // Bind event listeners
    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('keyup', this.onKeyUp.bind(this));
    
    // Hook into token hover events
    Hooks.on('hoverToken', this.onTokenHover.bind(this));
    Hooks.on('renderCanvas', this.onCanvasRender.bind(this));
  }
  
  onKeyDown(event) {
    // Check if this key matches the configured keybinding
    const keybindings = game.keybindings?.get?.(MODULE_ID, "holdCoverVisualization") || [];
    
    if (keybindings.length === 0) {
      // Fallback to Shift if no keybinding configured
      if (event.key === "Shift" && !this.keyPressed) {
        this.keyPressed = true;
        this.tryActivateVisualizationDebounced();
      }
      return;
    }
    
    const keybinding = keybindings[0]; // Use first keybinding
    
    // Check both the configured key and modifiers properly
    const keyMatches = event.code === keybinding.key;
    const ctrlMatches = event.ctrlKey === (keybinding.modifiers || []).includes("Control");
    const shiftMatches = event.shiftKey === (keybinding.modifiers || []).includes("Shift");
    const altMatches = event.altKey === (keybinding.modifiers || []).includes("Alt");
    const metaMatches = event.metaKey === (keybinding.modifiers || []).includes("Meta");
    
    const isCorrectKey = keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;
    
    if (isCorrectKey && !this.keyPressed) {
      this.keyPressed = true;
      this.tryActivateVisualizationDebounced();
    }
  }
  
  onKeyUp(event) {
    // Check if this key matches the configured keybinding
    const keybindings = game.keybindings?.get?.(MODULE_ID, "holdCoverVisualization") || [];
    
    if (keybindings.length === 0) {
      // Fallback to Shift if no keybinding configured
      if (event.key === "Shift") {
        this.keyPressed = false;
        this.deactivateVisualization();
      }
      return;
    }
    
    const keybinding = keybindings[0]; // Use first keybinding
    
    // Check both the configured key and modifiers properly
    const keyMatches = event.code === keybinding.key;
    const ctrlMatches = event.ctrlKey === (keybinding.modifiers || []).includes("Control");
    const shiftMatches = event.shiftKey === (keybinding.modifiers || []).includes("Shift");
    const altMatches = event.altKey === (keybinding.modifiers || []).includes("Alt");
    const metaMatches = event.metaKey === (keybinding.modifiers || []).includes("Meta");
    
    const wasCorrectKey = keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;
    
    if (wasCorrectKey) {
      this.keyPressed = false;
      this.deactivateVisualization();
    }
  }
  
  onTokenHover(token, hovered) {
    if (hovered && this.keyPressed) {
      this.currentTarget = token;
      this.tryActivateVisualizationDebounced();
    } else if (!hovered && this.currentTarget === token) {
      this.currentTarget = null;
      this.deactivateVisualization();
    }
  }
  
  onCanvasRender() {
    // Clean up graphics when canvas re-renders
    this.deactivateVisualization();
  }
  
  tryActivateVisualizationDebounced() {
    // Clear any pending visualization
    if (this.visualizationTimeout) {
      clearTimeout(this.visualizationTimeout);
    }
    
    // Don't recreate if it's the same target and already active
    if (this.isActive && this.currentTarget && this.lastTargetId === this.currentTarget.id) {
      return;
    }
    
    // Debounce the visualization creation
    this.visualizationTimeout = setTimeout(() => {
      this.tryActivateVisualization();
    }, 100); // 100ms delay to prevent flickering
  }
  
  tryActivateVisualization() {
    if (!this.keyPressed || !this.currentTarget) {
      return;
    }
    
    // Check if user has any controlled tokens
    const selectedTokens = canvas?.tokens?.controlled || [];
    if (selectedTokens.length === 0) {
      return;
    }
    
    // Allow all users to use visualization with their controlled tokens
    const selectedToken = selectedTokens[0];
    
    // Check if visualization should only work in encounters
    const visualizationOnlyInEncounter = game.settings?.get?.(MODULE_ID, "autoCoverVisualizationOnlyInEncounter");
    if (visualizationOnlyInEncounter) {
      // Check if we're in an active encounter
      const isInEncounter = game.combat?.started || false;
      if (!isInEncounter) {
        this.deactivateVisualization();
        return;
      }
    }
    
    this.activateVisualization(this.currentTarget);
  }
  
  activateVisualization(target) {
    if (this.isActive && this.lastTargetId === target.id) {
      // Already showing visualization for this target
      return;
    }
    
    if (this.isActive) {
      this.deactivateVisualization();
    }
    
    this.isActive = true;
    this.lastTargetId = target.id;
    this.createCoverOverlay(target);
  }
  
  deactivateVisualization() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.lastTargetId = null;
    
    // Clear any pending timeout
    if (this.visualizationTimeout) {
      clearTimeout(this.visualizationTimeout);
      this.visualizationTimeout = null;
    }
    
    if (this.overlayGraphics) {
      this.overlayGraphics.destroy();
      this.overlayGraphics = null;
    }
  }
  
  isPositionOccupied(worldX, worldY, selectedToken, canvas) {
    const gridSize = canvas.grid.size;
    
    // Check all tokens on the scene
    for (const token of canvas.tokens.placeables) {
      if (!token?.actor) continue;
      if (token.id === selectedToken.id) continue; // Skip the selected token itself
      
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
  
  createCoverOverlay(hoveredToken) {
    const canvas = game.canvas;
    if (!canvas?.stage) return;
    
    // Get the selected token as the potential attacker
    const selectedTokens = canvas.tokens.controlled;
    if (selectedTokens.length === 0) {
      return;
    }
    
    const selectedToken = selectedTokens[0]; // Use first selected token
    
    // Allow visualization for all users
    
    // Create graphics container on the interface layer to be client-specific
    // This ensures each client only sees their own visualization
    this.overlayGraphics = new PIXI.Graphics();
    canvas.interface.addChild(this.overlayGraphics);
        
    // Sample grid positions around the selected token's current position
    const gridSize = canvas.grid.size;
    const selectedCenter = selectedToken.center ?? selectedToken.getCenter();
    
    // Calculate dynamic range based on furthest token from selected token
    let maxDistance = 8; // Minimum range
    for (const token of canvas.tokens.placeables) {
      if (!token?.actor || token.id === selectedToken.id) continue;
      
      const tokenCenter = token.center ?? token.getCenter();
      const distance = Math.sqrt(
        Math.pow(tokenCenter.x - selectedCenter.x, 2) + 
        Math.pow(tokenCenter.y - selectedCenter.y, 2)
      );
      const gridDistance = Math.ceil(distance / gridSize);
      maxDistance = Math.max(maxDistance, gridDistance);
    }
    
    // Add some padding around the furthest token
    const range = maxDistance + 3;
    
    let totalSquares = 0;
    let occupiedSquares = 0;
    let coloredSquares = 0;
    
    for (let x = -range; x <= range; x++) {
      for (let y = -range; y <= range; y++) {
        totalSquares++;
        const worldX = selectedCenter.x + (x * gridSize);
        const worldY = selectedCenter.y + (y * gridSize);
        
        // Check if this position is occupied by any token (except tiny creatures can share)
        const isOccupied = this.isPositionOccupied(worldX, worldY, selectedToken, canvas);
        if (isOccupied) {
          // Skip coloring occupied squares - tokens can't move there
          occupiedSquares++;
          continue;
        }
        
        // Create a temporary position for the selected token
        // Copy all properties from the real token but override position
        const tempAttacker = {
          ...selectedToken,
          center: { x: worldX, y: worldY },
          getCenter: () => ({ x: worldX, y: worldY }),
          id: selectedToken.id + "-temp-pos",
          document: {
            ...selectedToken.document,
            x: worldX - (selectedToken.document.width * canvas.grid.size) / 2,
            y: worldY - (selectedToken.document.height * canvas.grid.size) / 2
          }
        };
        
        // Calculate what cover the selected token would have at this position from the hovered token
        const coverLevel = detectCoverStateForAttack(hoveredToken, tempAttacker);
                
        // Draw colored square based on cover level
        this.drawCoverSquare(worldX, worldY, gridSize, coverLevel);
        coloredSquares++;
      }
    }

    // Highlight the selected token's current position
    this.drawCurrentPosition(selectedToken);
    
    // Info panel removed - colors are self-explanatory
  }
  
  drawCoverSquare(x, y, size, coverLevel) {
    if (!this.overlayGraphics) return;
    
    // Define colors for each cover level
    const colors = {
      none: 0x4CAF50,     // Green - no cover
      lesser: 0xFFC107,   // Yellow - lesser cover  
      standard: 0xFF6600, // Orange - standard cover
      greater: 0xFF0000   // Red - greater cover
    };
    
    const alpha = 0.4; // Semi-transparent
    const color = colors[coverLevel] || colors.none;
    
    this.overlayGraphics.beginFill(color, alpha);
    this.overlayGraphics.drawRect(
      x - size/2, 
      y - size/2, 
      size, 
      size
    );
    this.overlayGraphics.endFill();
    
    // Add a subtle border
    this.overlayGraphics.lineStyle(1, color, 0.8);
    this.overlayGraphics.drawRect(
      x - size/2, 
      y - size/2, 
      size, 
      size
    );
  }
  
  drawCurrentPosition(selectedToken) {
    if (!this.overlayGraphics) return;
    
    const center = selectedToken.center ?? selectedToken.getCenter();
    const gridSize = game.canvas.grid.size;
    
    // Draw a bright white border to show current position
    this.overlayGraphics.lineStyle(4, 0xFFFFFF, 1.0);
    this.overlayGraphics.drawRect(
      center.x - gridSize/2, 
      center.y - gridSize/2, 
      gridSize, 
      gridSize
    );
    
    // Add a subtle white fill
    this.overlayGraphics.beginFill(0xFFFFFF, 0.2);
    this.overlayGraphics.drawRect(
      center.x - gridSize/2, 
      center.y - gridSize/2, 
      gridSize, 
      gridSize
    );
    this.overlayGraphics.endFill();
  }
  

  

}

// Initialize the visualization system for the current client
export let coverVisualization = null;

export function initCoverVisualization() {
  if (!coverVisualization) {
    coverVisualization = new CoverVisualization();
  }
}

export function destroyCoverVisualization() {
  if (coverVisualization) {
    coverVisualization.deactivateVisualization();
    coverVisualization = null;
  }
}
