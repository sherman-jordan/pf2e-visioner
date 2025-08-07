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
// Initialize with default, will try to get from settings when available
let tooltipFontSize = 16;

/**
 * Check if tooltips are allowed for the current user and token
 * @param {string} [mode='target'] - The tooltip mode to check ('target' or 'observer')
 * @param {Token} [hoveredToken=null] - The token being hovered (optional)
 * @returns {boolean} True if tooltips should be shown
 */
function canShowTooltips(mode = 'target', hoveredToken = null) {  
  // Always allow GM to see tooltips if hover tooltips are enabled
  if (game.user.isGM) {
    const allowed = game.settings.get(MODULE_ID, 'enableHoverTooltips');
    return allowed;
  }
  
  // For players, first check if hover tooltips are enabled at all
  if (!game.settings.get(MODULE_ID, 'enableHoverTooltips')) {
    return false;
  }
  
  // For players, check if player tooltips are allowed
  if (!game.settings.get(MODULE_ID, 'allowPlayerTooltips')) {
    return false;
  }
  
  // Special case: Observer mode (O key) is ALWAYS allowed for players
  // regardless of blockPlayerTargetTooltips setting
  if (mode === 'observer') {
    return true;
  }
  
  // For target mode (normal hover), players should only see tooltips for tokens they own
  if (mode === 'target' && hoveredToken) {
    // If target tooltips are blocked for players, disallow
    if (game.settings.get(MODULE_ID, 'blockPlayerTargetTooltips')) {
      return false;
    }
    
    // Only allow tooltips for tokens the player owns
    const isOwned = hoveredToken.isOwner;
    return isOwned;
  }
  
  // If we got here and it's target mode but no token provided, allow (for Alt key)
  if (mode === 'target' && !hoveredToken) {
    return !game.settings.get(MODULE_ID, 'blockPlayerTargetTooltips');
  }
  
  // Default to allowed
  return true;
}

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
  
  // When switching from observer to target mode (key up), clean up all indicators first
  if (previousMode === 'observer' && mode === 'target') {
    hideAllVisibilityIndicators();
    
    // If we have a currently hovered token, refresh the indicators in target mode
    if (currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(currentHoveredToken);
      }, 50); // Small delay to ensure cleanup happens first
    }
    return;
  }
  
  // If we have a currently hovered token, refresh the indicators
  if (currentHoveredToken) {
    // Force refresh with the new mode - this is critical for O key functionality
    showVisibilityIndicators(currentHoveredToken);
  }
  
  // For observer mode, also check if we need to show indicators for controlled tokens
  if (mode === 'observer' && !currentHoveredToken && canvas.tokens.controlled.length > 0) {
    // If we're in observer mode with no hovered token but have controlled tokens,
    // show indicators for the first controlled token
    showVisibilityIndicatorsForToken(canvas.tokens.controlled[0], 'observer');
  }
}

/**
 * Initialize hover tooltip system
 */
export function initializeHoverTooltips() {
  // Only initialize hover tooltips if allowed for this user in any mode
  // Use 'observer' mode check since we want to initialize if any mode is allowed
  if (!canShowTooltips('observer')) return;
  
  // Set the CSS variable for tooltip font size
  try {
    tooltipFontSize = game.settings?.get?.(MODULE_ID, 'tooltipFontSize') || tooltipFontSize;
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-font-size', `${tooltipFontSize}px`);
  } catch (e) {
    console.warn('PF2E Visioner: Error setting tooltip font size CSS variable', e);
    document.documentElement.style.setProperty('--pf2e-visioner-tooltip-font-size', '16px');
  }
  
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
  // Only show hover tooltips if allowed for this user with current mode AND token
  if (!canShowTooltips(tooltipMode, hoveredToken)) {
    return;
  }
  
  if (currentHoveredToken === hoveredToken) {
    return;
  }
  
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
  // For GM, check if hover tooltips are enabled
  if (game.user.isGM && !game.settings.get(MODULE_ID, 'enableHoverTooltips')) {
    return;
  }
  
  // For players, check basic requirements
  if (!game.user.isGM) {
    // Basic requirements: both settings must be enabled
    if (!game.settings.get(MODULE_ID, 'enableHoverTooltips') || 
        !game.settings.get(MODULE_ID, 'allowPlayerTooltips')) {
      return;
    }
    
    // Alt key should always work even with blockPlayerTargetTooltips
    // No need to check blockPlayerTargetTooltips here
  }
  
  if (highlight) {    
    // Check if we should use observer mode for Alt key when target tooltips are blocked
    const useObserverMode = !game.user.isGM && 
                           game.settings.get(MODULE_ID, 'blockPlayerTargetTooltips');
    
    if (useObserverMode) {
      showControlledTokenVisibilityObserver();
    } else {
      showControlledTokenVisibility();
    }
  } else {    
    // First, force clean all tooltips
    hideAllVisibilityIndicators();
    
    // Then, if we have a currently hovered token, restore its tooltips after a short delay
    if (currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(currentHoveredToken);
      }, 100);
    }
  }
}

/**
 * Show visibility indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showVisibilityIndicators(hoveredToken) {
  
  // Check if tooltips are allowed for the current mode and token
  const tooltipsAllowed = canShowTooltips(tooltipMode, hoveredToken);
  
  if (!tooltipsAllowed) return;
  
  // Clear any existing indicators
  hideAllVisibilityIndicators();
  
  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(t => 
    t !== hoveredToken && t.isVisible
  );
  
  if (otherTokens.length === 0) return;
  
  if (tooltipMode === 'observer') {
    // Observer mode (O key): Show how the hovered token sees others
    // For players, only allow if they control the hovered token
    if (!game.user.isGM && !hoveredToken.isOwner) {
      return;
    }
        
    otherTokens.forEach(targetToken => {
      const visibilityMap = getVisibilityMap(hoveredToken);
      const visibilityState = visibilityMap[targetToken.document.id] || 'observed';
      
      if (visibilityState !== 'observed') {
        addVisibilityIndicator(targetToken, hoveredToken, visibilityState, 'observer');
      }
    });
  } else {
    // Target mode (default): Show how others see the hovered token
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {
      
      // For players hovering over their own token, we need to show how OTHER tokens see it
      if (hoveredToken.isOwner) {
        // Get all other tokens in the scene (not just controlled ones)
        const nonPlayerTokens = canvas.tokens.placeables.filter(t => 
          t !== hoveredToken && t.isVisible
        );
        
        // Show how each other token sees the player's token
        nonPlayerTokens.forEach(otherToken => {
          const visibilityMap = getVisibilityMap(otherToken);
          const visibilityState = visibilityMap[hoveredToken.document.id] || 'observed';
          
          if (visibilityState !== 'observed') {
            // Show indicator on the OTHER token to show how it sees the player's token
            addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target');
          }
        });
      }
    } else {
      // GM sees all perspectives
      
      otherTokens.forEach(observerToken => {
        const visibilityMap = getVisibilityMap(observerToken);
        const visibilityState = visibilityMap[hoveredToken.document.id] || 'observed';
        
        if (visibilityState !== 'observed') {
          // Show indicator on the observer token
          addVisibilityIndicator(observerToken, observerToken, visibilityState, 'target');
        }
      });
    }
  }
}

/**
 * Show visibility indicators for a specific token (without clearing existing ones)
 * @param {Token} observerToken - The token to show visibility indicators for
 * @param {string} forceMode - Optional mode to force ('observer' or 'target'), defaults to current tooltipMode
 */
function showVisibilityIndicatorsForToken(observerToken, forceMode = null) {
  // Use forced mode if provided, otherwise use current tooltipMode
  const effectiveMode = forceMode || tooltipMode;
  
  // Check if tooltips are allowed for the current mode
  if (!canShowTooltips(effectiveMode)) {
    // Special case: Alt key (forceMode = 'target') should always be allowed
    if (!forceMode) {
      return;
    }
  }
  
  // For players, only allow if they control the observer token
  if (!game.user.isGM && !observerToken.isOwner) {
    return;
  }
  
  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(t => 
    t !== observerToken && t.isVisible
  );
  
  if (otherTokens.length === 0) return;
  
  if (effectiveMode === 'observer') {
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
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {      
      // Get all other tokens in the scene
      const otherTokensForPlayer = canvas.tokens.placeables.filter(t => 
        t !== observerToken && t.isVisible
      );
      
      otherTokensForPlayer.forEach(otherToken => {
        const visibilityMap = getVisibilityMap(otherToken);
        const visibilityState = visibilityMap[observerToken.document.id] || 'observed';
        
        if (visibilityState !== 'observed') {
          // Show indicator on the OTHER token
          addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target');
        }
      });
    } else {
      // GM sees all perspectives
      
      otherTokens.forEach(otherToken => {
        const visibilityMap = getVisibilityMap(otherToken);
        const visibilityState = visibilityMap[observerToken.document.id] || 'observed';
        
        if (visibilityState !== 'observed') {
          // Show indicator on the OTHER token
          addVisibilityIndicator(otherToken, otherToken, visibilityState, 'target');
        }
      });
    }
  }
}

/**
 * Show visibility indicators for controlled tokens (simulates hovering over controlled tokens)
 * Uses target mode - how others see the controlled tokens
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
 * Show visibility indicators for controlled tokens in observer mode
 * Uses observer mode - how controlled tokens see others
 */
function showControlledTokenVisibilityObserver() {
  if (isShowingKeyTooltips) return;
  
  const controlledTokens = canvas.tokens.controlled;
  
  isShowingKeyTooltips = true;
  keyTooltipTokens.clear();
  
  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  
  // For each controlled token, show visibility indicators as if hovering over it
  controlledTokens.forEach(controlledToken => {
    keyTooltipTokens.add(controlledToken.id);
    
    // Use observer mode instead of target mode
    showVisibilityIndicatorsForToken(controlledToken, 'observer');
  });
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
  indicator.interactiveChildren = false; // Prevent child elements from being interactive
  
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
  
  // Get the font size from settings and scale appropriately for the icon text
  try {
    tooltipFontSize = game.settings?.get?.(MODULE_ID, 'tooltipFontSize') || tooltipFontSize;
  } catch (e) {
    console.warn('PF2E Visioner: Error getting tooltip font size setting', e);
    // Keep using default value
  }
  const iconFontSize = Math.round(tooltipFontSize * 1.5); // Scale up for the icon text
  
  const iconText = new PIXI.Text(stateLabels[visibilityState] || 'Observed', {
    fontFamily: 'Arial, sans-serif',
    fontSize: iconFontSize,
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
  try {
    tooltipFontSize = game.settings?.get?.(MODULE_ID, 'tooltipFontSize') || tooltipFontSize;
  } catch (e) {
    console.warn('PF2E Visioner: Error getting tooltip font size setting', e);
    // Keep using default value
  }
  const detailFontSize = Math.max(12, tooltipFontSize - 2); // Slightly smaller font for details
  
  let tooltipText;
  if (mode === 'observer') {
    // Observer mode: "How [hovered token] sees [this token]"
    tooltipText = `<div style="color: ${config.color}; font-weight: bold; margin-bottom: 4px; font-size: ${tooltipFontSize}px;">
      <i class="${config.icon}"></i> ${game.i18n.localize(config.label)}
    </div>
    <div style="font-size: ${detailFontSize}px; color: #ccc;">
      ${observerToken.document.name} sees ${targetToken.document.name} as ${game.i18n.localize(config.label).toLowerCase()}
    </div>`;
  } else {
    // Target mode: "How [this token] sees [hovered token]"
    tooltipText = `<div style="color: ${config.color}; font-weight: bold; margin-bottom: 4px; font-size: ${tooltipFontSize}px;">
      <i class="${config.icon}"></i> ${game.i18n.localize(config.label)}
    </div>
    <div style="font-size: ${detailFontSize}px; color: #ccc;">
      ${targetToken.document.name} sees ${observerToken.document.name} as ${game.i18n.localize(config.label).toLowerCase()}
    </div>`;
  }
  
  indicator.on('pointerover', (event) => {
    // Stop event propagation to prevent interference with token events
    event.stopPropagation();
    
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
    
    // Activate Foundry's tooltip system with error handling
    try {
      game.tooltip.activate(anchor, {
        content: tooltipText,
        direction: game.tooltip.constructor.TOOLTIP_DIRECTIONS.UP,
        cssClass: 'pf2e-visioner-tooltip'
      });
    } catch (error) {
      console.warn('PF2E Visioner: Error activating tooltip:', error);
      // Clean up anchor if tooltip activation fails
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
      delete indicator._tooltipAnchor;
    }
  });
  
  indicator.on('pointerout', (event) => {
    // Stop event propagation to prevent interference with token events
    event.stopPropagation();
    
    indicator.scale.set(1.0);
    
    // Deactivate tooltip and cleanup anchor with error handling
    try {
      game.tooltip.deactivate();
    } catch (error) {
      console.warn('PF2E Visioner: Error deactivating tooltip:', error);
    }
    
    if (indicator._tooltipAnchor) {
      try {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(indicator._tooltipAnchor);
        }
      } catch (error) {
        console.warn('PF2E Visioner: Error removing tooltip anchor:', error);
      }
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
  try {
    game.tooltip.deactivate();
  } catch (e) {
    console.warn('PF2E Visioner: Error deactivating tooltips', e);
  }
  
  // Clean up all indicators
  visibilityIndicators.forEach((indicator, tokenId) => {
    try {
      // Clean up tooltip anchor if it exists
      if (indicator._tooltipAnchor) {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(indicator._tooltipAnchor);
        }
        delete indicator._tooltipAnchor;
      }
      
      // Remove from parent
      if (indicator.parent) {
        indicator.parent.removeChild(indicator);
      }
      
      // Destroy the indicator
      indicator.destroy({ children: true, texture: true, baseTexture: true });
    } catch (e) {
      console.warn('PF2E Visioner: Error cleaning up indicator', e);
    }
  });
  
  // Clear the map
  visibilityIndicators.clear();
  
  // Reset tracking variables to ensure clean state
  isShowingKeyTooltips = false;
  keyTooltipTokens.clear();
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