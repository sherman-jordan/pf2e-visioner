/**
 * Hover tooltips for token visibility states
 */

import { MODULE_ID, VISIBILITY_STATES } from './constants.js';
import { getVisibilityMap } from './utils.js';


let currentHoveredToken = null;
let visibilityIndicators = new Map();
let tokenEventHandlers = new Map(); // Store references to our specific event handlers
let tooltipMode = 'target'; // 'target' (default) or 'observer'
let isShowingKeyTooltips = false; // Track if Alt key tooltips are active
let keyTooltipTokens = new Set(); // Track tokens showing key-based tooltips

/**
 * Set the tooltip mode
 * @param {string} mode - 'target' (default - how others see hovered token) or 'observer' (O key - how hovered token sees others)
 */
export function setTooltipMode(mode) {
  if (mode !== 'observer' && mode !== 'target') {
    console.warn('PF2E Visioner: Invalid tooltip mode:', mode);
    return;
  }
  
  const previousMode = tooltipMode;
  tooltipMode = mode;
  
  // If we have a currently hovered token, refresh the indicators
  if (currentHoveredToken) {
    showVisibilityIndicators(currentHoveredToken);
  }
}

/**
 * Initialize hover tooltip system (GM only)
 */
export function initializeHoverTooltips() {
  // Only initialize hover tooltips for GM
  if (!game.user.isGM) return;
  
  // Add event listeners to canvas for token hover
  canvas.tokens.placeables.forEach(token => {
    const overHandler = () => onTokenHover(token);
    const outHandler = () => onTokenHoverEnd(token);
    
    // Store handlers for later cleanup
    tokenEventHandlers.set(token.id, { overHandler, outHandler });
    
    token.on('pointerover', overHandler);
    token.on('pointerout', outHandler);
  });
  
  // Note: Alt key handled via highlightObjects hook registered in main hooks
  // O key event listeners added globally in registerHooks
}

/**
 * Handle token hover start
 * @param {Token} hoveredToken - The token being hovered
 */
function onTokenHover(hoveredToken) {
  // Only GM should see hover tooltips for visibility management
  if (!game.user.isGM) return;
  
  // Double check GM status for safety
  if (game.user.role < CONST.USER_ROLES.GAMEMASTER) return;
  
  if (currentHoveredToken === hoveredToken) return;
  
  currentHoveredToken = hoveredToken;
  showVisibilityIndicators(hoveredToken);
}

/**
 * Handle token hover end
 * @param {Token} token - The token that was hovered
 */
function onTokenHoverEnd(token) {
  if (currentHoveredToken === token) {
    currentHoveredToken = null;
    hideAllVisibilityIndicators();
  }
}

/**
 * Handle highlightObjects hook (triggered by Alt key)
 * @param {boolean} highlight - Whether objects should be highlighted
 */
export function onHighlightObjects(highlight) {
  if (!game.user.isGM) return;
  
  if (highlight) {
    // Alt key always uses target mode (how others see controlled tokens)
    // Note: Don't change global tooltipMode - Alt tooltips use forced target mode
    showControlledTokenVisibility();
  } else {
    hideKeyTooltips();
    // Note: Don't change global tooltipMode - let hover tooltips keep their current mode
  }
}

/**
 * Show visibility indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showVisibilityIndicators(hoveredToken) {
  // Clear any existing indicators
  hideAllVisibilityIndicators();
  
  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(t => 
    t !== hoveredToken && t.isVisible
  );
  
  if (otherTokens.length === 0) return;
  
  if (tooltipMode === 'observer') {
    // Observer mode (O key): Show how the hovered token sees others
    otherTokens.forEach(targetToken => {
      const visibilityMap = getVisibilityMap(hoveredToken);
      const visibilityState = visibilityMap[targetToken.document.id] || 'observed';
      
      if (visibilityState !== 'observed') {
        addVisibilityIndicator(targetToken, hoveredToken, visibilityState, 'observer');
      }
    });
  } else {
    // Target mode (default): Show how others see the hovered token
    otherTokens.forEach(observerToken => {
      const visibilityMap = getVisibilityMap(observerToken);
      const visibilityState = visibilityMap[hoveredToken.document.id] || 'observed';
      
      if (visibilityState !== 'observed') {
        addVisibilityIndicator(observerToken, observerToken, visibilityState, 'target');
      }
    });
  }
}

/**
 * Show visibility indicators for a specific token (without clearing existing ones)
 * @param {Token} observerToken - The token to show visibility indicators for
 * @param {string} forceMode - Optional mode to force ('observer' or 'target'), defaults to current tooltipMode
 */
function showVisibilityIndicatorsForToken(observerToken, forceMode = null) {
  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(t => 
    t !== observerToken && t.isVisible
  );
  
  if (otherTokens.length === 0) return;
  
  // Use forced mode if provided, otherwise use current tooltipMode
  const modeToUse = forceMode || tooltipMode;
  
  if (modeToUse === 'observer') {
    // Default mode: Show how the observer token sees others
    otherTokens.forEach(targetToken => {
      const visibilityMap = getVisibilityMap(observerToken);
      const visibilityState = visibilityMap[targetToken.document.id] || 'observed';
      
      if (visibilityState !== 'observed') {
        addVisibilityIndicator(targetToken, observerToken, visibilityState, 'observer');
      }
    });
  } else {
    // Target mode: Show how others see the observer token
    otherTokens.forEach(otherToken => {
      const visibilityMap = getVisibilityMap(otherToken);
      const visibilityState = visibilityMap[observerToken.document.id] || 'observed';
      
      if (visibilityState !== 'observed') {
        // Show indicator on the OTHER token, from the perspective of that token seeing the observer
        addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target');
      }
    });
  }
}

/**
 * Show visibility indicators for controlled tokens (simulates hovering over controlled tokens)
 */
function showControlledTokenVisibility() {
  if (isShowingKeyTooltips) return;
  
  const controlledTokens = canvas.tokens.controlled;
  
  isShowingKeyTooltips = true;
  keyTooltipTokens.clear();
  
  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  
  // For each controlled token, show visibility indicators as if hovering over it
  controlledTokens.forEach(controlledToken => {
    keyTooltipTokens.add(controlledToken.id);
    
    // Use the existing showVisibilityIndicators logic, force target mode for Alt key
    showVisibilityIndicatorsForToken(controlledToken, 'target');
  });
}

/**
 * Hide key-based tooltips
 */
function hideKeyTooltips() {
  if (!isShowingKeyTooltips) return;
  
  isShowingKeyTooltips = false;
  keyTooltipTokens.clear();
  
  // Only hide indicators if we're not currently hovering a token
  if (!currentHoveredToken) {
    hideAllVisibilityIndicators();
  }
}

/**
 * Add a visibility indicator to a token
 * @param {Token} targetToken - The token to show the indicator on
 * @param {Token} observerToken - The token that has the visibility perspective  
 * @param {string} visibilityState - The visibility state
 * @param {string} mode - 'observer' or 'target' mode
 */
function addVisibilityIndicator(targetToken, observerToken, visibilityState, mode = 'observer') {
  const config = VISIBILITY_STATES[visibilityState];
  if (!config) return;
  
  // Create a PIXI Graphics object for the indicator
  const indicator = new PIXI.Container();
  indicator.interactive = true;
  indicator.buttonMode = true;
  
  // Create outer glow effect
  const glow = new PIXI.Graphics();
  glow.beginFill(parseInt(config.color.replace('#', ''), 16), 0.3);
  glow.drawCircle(0, 0, 18);
  glow.endFill();
  
  // Create background circle with gradient-like effect
  const background = new PIXI.Graphics();
  background.beginFill(0x000000, 0.9);
  background.lineStyle(3, parseInt(config.color.replace('#', ''), 16), 1);
  background.drawCircle(0, 0, 14);
  background.endFill();
  
  // Create inner highlight
  const highlight = new PIXI.Graphics();
  highlight.beginFill(0xFFFFFF, 0.2);
  highlight.drawCircle(-3, -3, 6);
  highlight.endFill();
  
  // Use clear text labels for each visibility state
  const stateLabels = {
    'observed': 'Observed',
    'hidden': 'Hidden', 
    'concealed': 'Concealed',
    'undetected': 'Undetected'
  };
  
  const iconText = new PIXI.Text(stateLabels[visibilityState] || 'Observed', {
    fontFamily: 'Arial, sans-serif',
    fontSize: 24,
    fill: 0xFFFFFF,
    align: 'center',
    fontWeight: 'bold'
  });
  iconText.anchor.set(0.5);
  
  // Calculate text dimensions for proper border sizing
  const textWidth = iconText.width;
  const textHeight = iconText.height;
  const paddingX = 8;
  const paddingY = 4;
  const borderWidth = textWidth + paddingX * 2;
  const borderHeight = textHeight + paddingY * 2;
  
  // Recreate glow with proper dimensions
  glow.clear();
  glow.beginFill(parseInt(config.color.replace('#', ''), 16), 0.3);
  glow.drawRoundedRect(-borderWidth/2 - 2, -borderHeight/2 - 2, borderWidth + 4, borderHeight + 4, 8);
  glow.endFill();
  
  // Recreate background with proper dimensions
  background.clear();
  background.beginFill(0x000000, 0.9);
  background.lineStyle(2, parseInt(config.color.replace('#', ''), 16), 1);
  background.drawRoundedRect(-borderWidth/2, -borderHeight/2, borderWidth, borderHeight, 6);
  background.endFill();
  
  // Recreate highlight with proper dimensions
  highlight.clear();
  highlight.beginFill(0xFFFFFF, 0.2);
  highlight.drawRoundedRect(-borderWidth/2 + 2, -borderHeight/2 + 2, borderWidth - 4, borderHeight - 4, 4);
  highlight.endFill();
  
  indicator.addChild(glow);
  indicator.addChild(background);
  indicator.addChild(highlight);
  indicator.addChild(iconText);
  
  // Position centered above the token
  const tokenSize = targetToken.document.width * canvas.grid.size;
  indicator.x = targetToken.x + (tokenSize / 2); // Center horizontally
  indicator.y = targetToken.y - borderHeight / 2 - 8; // Above the token with some spacing
  
  // Static indicator - no animation
  indicator.alpha = 1.0;
  indicator.scale.set(1.0);
  glow.alpha = 0.3;
  
  // Add hover tooltip functionality using Foundry's built-in tooltip system
  let tooltipText;
  if (mode === 'observer') {
    // Observer mode: "How [hovered token] sees [this token]"
    tooltipText = `<div style="color: ${config.color}; font-weight: bold; margin-bottom: 4px; font-size: 16px;">
      <i class="${config.icon}"></i> ${game.i18n.localize(config.label)}
    </div>
    <div style="font-size: 14px; color: #ccc;">
      ${observerToken.document.name} sees ${targetToken.document.name} as ${game.i18n.localize(config.label).toLowerCase()}
    </div>`;
  } else {
    // Target mode: "How [this token] sees [hovered token]"
    tooltipText = `<div style="color: ${config.color}; font-weight: bold; margin-bottom: 4px; font-size: 16px;">
      <i class="${config.icon}"></i> ${game.i18n.localize(config.label)}
    </div>
    <div style="font-size: 14px; color: #ccc;">
      ${targetToken.document.name} sees ${observerToken.document.name} as ${game.i18n.localize(config.label).toLowerCase()}
    </div>`;
  }
  
  indicator.on('pointerover', () => {
    indicator.scale.set(1.2);
    
    // Get indicator position relative to screen
    const bounds = indicator.getBounds();
    const canvasRect = canvas.app.view.getBoundingClientRect();
    
    // Create a temporary anchor element for the tooltip
    const anchor = document.createElement('div');
    anchor.style.cssText = `
      position: fixed;
      left: ${canvasRect.left + bounds.x + bounds.width/2}px;
      top: ${canvasRect.top + bounds.y}px;
      width: 1px;
      height: 1px;
      pointer-events: none;
      z-index: -1;
    `;
    document.body.appendChild(anchor);
    
    // Store anchor reference for cleanup
    indicator._tooltipAnchor = anchor;
    
    // Activate Foundry's tooltip system
    game.tooltip.activate(anchor, {
      content: tooltipText,
      direction: game.tooltip.constructor.TOOLTIP_DIRECTIONS.UP,
      cssClass: 'pf2e-visioner-tooltip'
    });
  });
  
  indicator.on('pointerout', () => {
    indicator.scale.set(1.0);
    
    // Deactivate tooltip and cleanup anchor
    game.tooltip.deactivate();
    if (indicator._tooltipAnchor) {
      indicator._tooltipAnchor.remove();
      delete indicator._tooltipAnchor;
    }
  });
  
  // Add to canvas with proper layering
  canvas.tokens.addChild(indicator);
  
  // Store reference for cleanup
  visibilityIndicators.set(targetToken.id, indicator);
}





/**
 * Hide all visibility indicators
 */
function hideAllVisibilityIndicators() {
  // Deactivate any active tooltips
  game.tooltip.deactivate();
  
  visibilityIndicators.forEach(indicator => {
    // Clean up tooltip anchor if it exists
    if (indicator._tooltipAnchor) {
      indicator._tooltipAnchor.remove();
      delete indicator._tooltipAnchor;
    }
    
    if (indicator.parent) {
      indicator.parent.removeChild(indicator);
    }
    indicator.destroy();
  });
  visibilityIndicators.clear();
}

/**
 * Cleanup hover tooltips
 */
export function cleanupHoverTooltips() {
  hideAllVisibilityIndicators();
  currentHoveredToken = null;
  isShowingKeyTooltips = false;
  keyTooltipTokens.clear();
  
  // Reset tooltip mode to default
  setTooltipMode('target');
  
  // Remove only our specific event listeners from tokens
  tokenEventHandlers.forEach((handlers, tokenId) => {
    const token = canvas.tokens.get(tokenId);
    if (token) {
      token.off('pointerover', handlers.overHandler);
      token.off('pointerout', handlers.outHandler);
    }
  });
  
  // Clear the handlers map
  tokenEventHandlers.clear();
  
  // Note: O key event listeners are managed globally in hooks.js
}