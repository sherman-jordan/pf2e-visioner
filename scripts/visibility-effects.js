/**
 * Visual effects and token appearance management
 */

import { MODULE_ID, VISIBILITY_STATES } from './constants.js';
import { createVisibilityIndicator, getVisibilityMap } from './utils.js';

/**
 * Apply persistent visibility effects based on all configured token relationships
 * This runs independent of token selection and maintains effects continuously
 */
let isUpdating = false;

export async function updateTokenVisuals() {
  if (isUpdating) {
    return;
  }
  
  isUpdating = true;
  
  try {
    // Apply persistent visibility effects for all users
    await applyPersistentVisibilityEffects();
  } finally {
    isUpdating = false;
  }
}

/**
 * Apply persistent visibility effects based on GM-configured relationships
 * Each token sees other tokens according to pre-configured visibility states
 */
async function applyPersistentVisibilityEffects() {
  // Reset all tokens to their base state first
  const resetPromises = canvas.tokens.placeables.map(token => resetTokenAppearance(token));
  await Promise.all(resetPromises);
  
  // Get all tokens on the canvas
  const allTokens = canvas.tokens.placeables;
  
  // For each potential observer token, apply its visibility relationships
  for (const observerToken of allTokens) {
    const visibilityMap = getVisibilityMap(observerToken);
    
    // Skip if this token has no configured visibility relationships
    if (!visibilityMap || Object.keys(visibilityMap).length === 0) {
      continue;
    }
    
    // Apply visibility effects for each target token based on this observer's settings
    for (const targetToken of allTokens) {
      if (targetToken === observerToken) continue; // Skip self
      
      const visibilityState = visibilityMap[targetToken.document.id];
      if (visibilityState && visibilityState !== 'observed') {
        // Apply the visibility effect to the target token
        // This creates the relationship: "observerToken sees targetToken as [state]"
        await applyTokenRelationshipEffect(targetToken, observerToken, visibilityState);
      }
    }
  }
}

/**
 * Apply visibility effect for a specific token relationship
 * @param {Token} targetToken - The token being observed
 * @param {Token} observerToken - The token that has the visibility perspective
 * @param {string} visibilityState - How the observer sees the target
 */
async function applyTokenRelationshipEffect(targetToken, observerToken, visibilityState) {
  // Store the relationship data on the target token for reference
  if (!targetToken._visibilityRelationships) {
    targetToken._visibilityRelationships = new Map();
  }
  
  targetToken._visibilityRelationships.set(observerToken.document.id, visibilityState);
  
  // Apply the most restrictive visibility state if multiple observers see this token differently
  const allStates = Array.from(targetToken._visibilityRelationships.values());
  const mostRestrictive = getMostRestrictiveVisibilityState(allStates);
  
  // Apply the visual effect
  await applyVisibilityState(targetToken, mostRestrictive);
}

/**
 * Determine the most restrictive visibility state from multiple relationships
 * @param {string[]} states - Array of visibility states
 * @returns {string} Most restrictive state
 */
function getMostRestrictiveVisibilityState(states) {
  const hierarchy = ['observed', 'concealed', 'hidden', 'undetected'];
  
  let mostRestrictive = 'observed';
  for (const state of states) {
    const currentIndex = hierarchy.indexOf(state);
    const mostRestrictiveIndex = hierarchy.indexOf(mostRestrictive);
    
    if (currentIndex > mostRestrictiveIndex) {
      mostRestrictive = state;
    }
  }
  
  return mostRestrictive;
}

// Removed observer-based visibility modification - focusing on proper PF2E condition application instead

/**
 * Apply a visibility state to a token
 * @param {Token} token - The token to modify
 * @param {string} state - The visibility state to apply
 */
export async function applyVisibilityState(token, state) {
  const config = VISIBILITY_STATES[state];
  if (!config) {

    return;
  }

  // Store original appearance if not already stored
  if (!token._originalAppearance) {
    token._originalAppearance = {
      alpha: token.alpha,
      visible: token.visible
    };
  }

  // CRITICAL FIX: Always reset token appearance first to clear any previous state
  // This ensures undetected -> hidden transitions work properly

  await resetTokenToBaseState(token);

  // Apply visibility effects - use real PF2E conditions for proper mechanics

  
  // Apply the visual state based on visibility configuration
  if (state === 'undetected') {
    // GM gets full PF2E conditions, players get visual effects only
    if (game.user.isGM) {
      await applyUndetectedEffect(token);
    } else {
      applyUndetectedVisualFallback(token);
    }
  } else if (state === 'hidden') {
    // GM gets full PF2E conditions, players get visual effects only
    if (game.user.isGM) {
      await applyHiddenEffect(token);
    } else {
      applyHiddenVisualFallback(token);
    }
  } else if (state === 'concealed') {
    // GM gets full PF2E conditions, players get visual effects only
    if (game.user.isGM) {
      await applyConcealedEffect(token);
    } else {
      applyConcealedVisualFallback(token);
    }
  } else {
    // For visible state, use simple visual changes
    applySimpleVisualState(token, { visible: true });
  }
  


  // GM hints feature was removed - no visual indicators
}

/**
 * Apply token visibility effects based on the current observer
 * @param {Token} token - The token to modify
 * @param {string} state - The visibility state
 * @param {Object} config - The visibility configuration
 */
function applyTokenVisibilityEffect(token, state, config) {
  // Get the current controlled/observer token
  const controlled = canvas.tokens.controlled;
  const observer = controlled.length > 0 ? controlled[0] : null;
  
  if (!observer || observer === token) {
    // If no observer or observing self, show normally
    token.mesh.visible = true;
    token.visible = true;
    token.mesh.alpha = 1.0;
    token.alpha = 1.0;
    return;
  }
  
  // Apply state-specific visual effects based on observer relationship
  switch (state) {
    case 'hidden':
      applyHiddenEffect(token, observer);
      break;
    case 'concealed':
      applyConcealedEffect(token, observer);
      break;
    default:
      // Show normally for observed or unknown states
      token.mesh.visible = true;
      token.visible = true;
      token.mesh.alpha = 1.0;
      token.alpha = 1.0;
      break;
  }
}

/**
 * Apply PF2E Undetected condition for full mechanical effect
 * @param {Token} token - The target token
 */
async function applyUndetectedEffect(token) {
  if (!token.actor) {
    console.warn(`${MODULE_ID} | No actor found for token "${token.document.name}"`);
    applyUndetectedVisualFallback(token);
    return;
  }
  
  try {
    // Check if actor already has undetected condition from another source
    const existingUndetected = token.actor.itemTypes?.condition?.find?.(c => c.slug === 'undetected');
    if (existingUndetected && !existingUndetected.getFlag(MODULE_ID, 'moduleApplied')) {
      return;
    }
    
    // Remove any existing module-applied undetected condition first
    if (existingUndetected && existingUndetected.getFlag(MODULE_ID, 'moduleApplied')) {
      await existingUndetected.delete();
    }
    
    // Try to apply Undetected condition using PF2E system's proper method
    try {
      // Look for Undetected condition in the PF2E conditions compendium
      const undetectedCondition = game.pf2e?.ConditionManager?.getCondition('undetected') ||
                                  game.packs.get('pf2e.conditionitems')?.index?.find(i => i.name === 'Undetected') ||
                                  await fromUuid('Compendium.pf2e.conditionitems.Item.VRSef5y1LmL2Hkjf'); // fallback UUID
      
      if (undetectedCondition) {
        // Apply the condition using PF2E's system
        const conditionSource = undetectedCondition.toObject ? undetectedCondition.toObject() : undetectedCondition;
        conditionSource.flags = conditionSource.flags || {};
        conditionSource.flags[MODULE_ID] = { moduleApplied: true };
        
        await token.actor.createEmbeddedDocuments('Item', [conditionSource]);
      } else {
        throw new Error('Undetected condition not found in any method');
      }
    } catch (conditionError) {
      console.warn(`${MODULE_ID} | Failed to apply PF2E Undetected condition:`, conditionError);
      applyUndetectedVisualFallback(token);
      return;
    }
    
    // Apply visual hiding effect - undetected tokens should be completely hidden
    applyUndetectedVisualFallback(token);
    
  } catch (error) {
    console.error(`${MODULE_ID} | Error applying Undetected condition to "${token.document.name}":`, error);
    applyUndetectedVisualFallback(token);
  }
}

/**
 * Fallback visual effect for Undetected when PF2E condition fails
 * @param {Token} token - The target token
 */
function applyUndetectedVisualFallback(token) {
  // Completely hide the token for undetected
  token.mesh.visible = false;
  token.visible = false;
  
  // Update document source
  token.document._source.hidden = true;
}

/**
 * Apply PF2E Hidden condition for full mechanical effect
 * @param {Token} token - The target token
 * @param {Token} observer - The observing token
 */
async function applyHiddenEffect(token, observer) {
  if (!token.actor) {
    console.warn(`${MODULE_ID} | No actor found for token "${token.document.name}"`);
    applyHiddenVisualFallback(token);
    return;
  }
  
  try {
    // Check if actor already has hidden condition from another source
    const existingHidden = token.actor.itemTypes?.condition?.find?.(c => c.slug === 'hidden');
    if (existingHidden && !existingHidden.getFlag(MODULE_ID, 'moduleApplied')) {
      return;
    }
    
    // Remove any existing module-applied hidden condition first
    if (existingHidden && existingHidden.getFlag(MODULE_ID, 'moduleApplied')) {
      await existingHidden.delete();
    }
    
    // Try to apply Hidden condition using PF2E system's proper method
    try {
      // Look for Hidden condition in the PF2E conditions compendium
      const hiddenCondition = game.pf2e?.ConditionManager?.getCondition('hidden') ||
                              game.packs.get('pf2e.conditionitems')?.index?.find(i => i.name === 'Hidden') ||
                              game.packs.get('pf2e.conditionitems')?.get('ABfZLb-fJEyYhsNJ'); // fallback UUID
      
      if (hiddenCondition) {
        // Apply the condition using PF2E's system
        await token.actor.increaseCondition('hidden', { value: 1 });
        
        // Flag the applied condition as module-applied for tracking
        const appliedCondition = token.actor.itemTypes?.condition?.find?.(c => c.slug === 'hidden');
        if (appliedCondition) {
          await appliedCondition.setFlag(MODULE_ID, 'moduleApplied', true);
        }
        return;
      }
      
    } catch (conditionError) {
      console.warn(`${MODULE_ID} | PF2E condition application failed:`, conditionError);
    }
    
    // Fallback: Try using FoundryVTT's standard ActiveEffect approach  
    try {
      const hiddenEffect = {
        icon: "systems/pf2e/icons/conditions/hidden.webp",
        label: "Hidden",
        name: "Hidden",
        statuses: ["hidden"],
        flags: {
          [MODULE_ID]: {
            moduleApplied: true
          },
          core: {
            statusId: "hidden"
          }
        }
      };
      
      await token.actor.createEmbeddedDocuments("ActiveEffect", [hiddenEffect]);
      return;
      
    } catch (activeEffectError) {
      console.warn(`${MODULE_ID} | ActiveEffect condition application failed:`, activeEffectError);
    }
    
    // If all condition application methods failed, use visual fallback
    // console.warn(`${MODULE_ID} | Failed to apply PF2E Hidden condition, using visual fallback`);
    applyHiddenVisualFallback(token);
    
  } catch (error) {
    console.error(`${MODULE_ID} | Error in applyHiddenEffect:`, error);
    // Fallback to visual-only effect
    applyHiddenVisualFallback(token);
  }
}

/**
 * Apply PF2E Concealed condition for full mechanical effect
 * @param {Token} token - The target token
 * @param {Token} observer - The observing token
 */
async function applyConcealedEffect(token, observer) {
  if (!token.actor) {
    console.warn(`${MODULE_ID} | No actor found for token "${token.document.name}"`);
    applyConcealedVisualFallback(token);
    return;
  }
  
  try {
    // Check if actor already has concealed condition from another source
    const existingConcealed = token.actor.itemTypes?.condition?.find?.(c => c.slug === 'concealed');
    if (existingConcealed && !existingConcealed.getFlag(MODULE_ID, 'moduleApplied')) {
      return;
    }
    
    // Remove any existing module-applied concealed condition first
    if (existingConcealed && existingConcealed.getFlag(MODULE_ID, 'moduleApplied')) {
      await existingConcealed.delete();
    }
    
    // Try to apply Concealed condition using PF2E system's proper method
    try {
      // Look for Concealed condition in the PF2E conditions compendium
      const concealedCondition = game.pf2e?.ConditionManager?.getCondition('concealed') ||
                                 game.packs.get('pf2e.conditionitems')?.index?.find(i => i.name === 'Concealed') ||
                                 game.packs.get('pf2e.conditionitems')?.get('DmAIPqOBomZ7H95W'); // fallback UUID
      
      if (concealedCondition) {
        // Apply the condition using PF2E's system
        await token.actor.increaseCondition('concealed', { value: 1 });
        
        // Flag the applied condition as module-applied for tracking
        const appliedCondition = token.actor.itemTypes?.condition?.find?.(c => c.slug === 'concealed');
        if (appliedCondition) {
          await appliedCondition.setFlag(MODULE_ID, 'moduleApplied', true);
        }
        return;
      }
      
    } catch (conditionError) {
      console.warn(`${MODULE_ID} | PF2E condition application failed:`, conditionError);
    }
    
    // Fallback: Try using FoundryVTT's standard ActiveEffect approach
    try {
      const concealedEffect = {
        icon: "systems/pf2e/icons/conditions/concealed.webp", 
        label: "Concealed",
        name: "Concealed",
        statuses: ["concealed"],
        flags: {
          [MODULE_ID]: {
            moduleApplied: true
          },
          core: {
            statusId: "concealed"
          }
        }
      };
      
      await token.actor.createEmbeddedDocuments("ActiveEffect", [concealedEffect]);
      return;
      
    } catch (activeEffectError) {
      console.warn(`${MODULE_ID} | ActiveEffect condition application failed:`, activeEffectError);
    }
    
    // If all condition application methods failed, use visual fallback
    console.warn(`${MODULE_ID} | Failed to apply PF2E Concealed condition, using visual fallback`);
    applyConcealedVisualFallback(token);
    
  } catch (error) {
    console.error(`${MODULE_ID} | Error in applyConcealedEffect:`, error);
    // Fallback to visual-only effect
    applyConcealedVisualFallback(token);
  }
}

/**
 * Apply simple visual state changes
 * @param {Token} token - The token to modify
 * @param {Object} config - The visibility configuration
 */
function applySimpleVisualState(token, config) {
  // Use direct mesh manipulation for immediate visual changes
  if (config.visible === false) {
    // For undetected tokens - hide completely
    token.mesh.visible = false;
    token.visible = false;
    token.document._source.hidden = true;
  } else {
    // For visible tokens - show normally, let PF2E conditions handle effects
    token.mesh.visible = true;
    token.visible = true;
    token.mesh.alpha = 1.0; // No alpha changes
    token.alpha = 1.0;
    token.document._source.alpha = 1.0;
    token.document._source.hidden = false;
  }
}

/**
 * Fallback visual effect for hidden state (if PF2E conditions fail)
 * Creates a visual effect similar to PF2E's native Hidden condition
 * @param {Token} token - The token to modify
 */
function applyHiddenVisualFallback(token) {
  // Show the token but with distinct visual effects
  token.mesh.visible = true;
  token.visible = true;
  
  // Apply visual effects to simulate Hidden condition
  if (token.mesh) {
    // Create a desaturated, darkened effect
    token.mesh.alpha = 0.75;
    token.alpha = 0.75;
    
    // Apply filters for a more authentic hidden effect
    if (!token.mesh.filters) {
      token.mesh.filters = [];
    }
    
    // Clear any existing module filters
    token.mesh.filters = token.mesh.filters.filter(f => !f._moduleFilter);
    
    // Create a desaturation effect (grayscale)
    const desaturateFilter = new PIXI.filters.ColorMatrixFilter();
    desaturateFilter.desaturate();
    desaturateFilter.alpha = 0.7; // Partial desaturation
    desaturateFilter._moduleFilter = true; // Mark as our filter
    
    // Create a subtle glow/outline effect using ColorMatrixFilter
    const glowFilter = new PIXI.filters.ColorMatrixFilter();
    glowFilter.matrix = [
      0.7, 0.7, 0.0, 0.0, 0.1,  // Red channel - yellow tint
      0.7, 0.7, 0.0, 0.0, 0.1,  // Green channel - yellow tint
      0.3, 0.3, 0.3, 0.0, 0.0,  // Blue channel - reduced
      0.0, 0.0, 0.0, 1.0, 0.0   // Alpha channel - unchanged
    ];
    glowFilter._moduleFilter = true; // Mark as our filter
    
    // Apply the filters
    token.mesh.filters.push(desaturateFilter, glowFilter);
  }
  
}

/**
 * Fallback visual effect for concealed state (if PF2E conditions fail)
 * Creates a visual effect similar to PF2E's native Concealed condition
 * @param {Token} token - The token to modify
 */
function applyConcealedVisualFallback(token) {
  // Show the token with a "hazy" effect
  token.mesh.visible = true;
  token.visible = true;
  
  // Apply visual effects to simulate Concealed condition
  if (token.mesh) {
    // Reduce alpha for the "harder to see" effect
    token.mesh.alpha = 0.65;
    token.alpha = 0.65;
    
    // Apply filters for a more authentic concealed effect
    if (!token.mesh.filters) {
      token.mesh.filters = [];
    }
    
    // Clear any existing module filters
    token.mesh.filters = token.mesh.filters.filter(f => !f._moduleFilter);
    
    // Create a blur effect to simulate concealment
    const blurFilter = new PIXI.filters.BlurFilter();
    blurFilter.blur = 2; // Subtle blur
    blurFilter.quality = 1; // Low quality for performance
    blurFilter._moduleFilter = true; // Mark as our filter
    
    // Create a slight brightness reduction
    const brightnessFilter = new PIXI.filters.ColorMatrixFilter();
    brightnessFilter.brightness(0.85, false); // Slightly darker
    brightnessFilter._moduleFilter = true; // Mark as our filter
    
    // Apply the filters
    token.mesh.filters.push(blurFilter, brightnessFilter);
  }
  
}



/**
 * Reset token to base state without clearing original appearance storage
 * Used internally when transitioning between visibility states
 * @param {Token} token - The token to reset
 */
async function resetTokenToBaseState(token) {
  // Remove module-applied PF2E conditions first (GM only)
  if (game.user.isGM) {
    await removeModuleConditions(token);
  }
  
  // Reset visual appearance to base state without clearing _originalAppearance
  token.mesh.alpha = 1.0;
  token.mesh.visible = true;
  token.alpha = 1.0;
  token.visible = true;
  
  // Update document source
  token.document._source.alpha = 1.0;
  token.document._source.hidden = false;

  // Clear any applied filters and tints
  if (token.mesh) {
    if (token.mesh.filters) {
      token.mesh.filters = token.mesh.filters.filter(f => !f._moduleFilter);
    }
    // Reset tint to white (normal)
    token.mesh.tint = 0xFFFFFF;
  }

  removeVisibilityIndicator(token);
}

/**
 * Reset token to original appearance and remove module-applied conditions
 * @param {Token} token - The token to reset
 */
export async function resetTokenAppearance(token) {
  // Remove module-applied PF2E conditions first (GM only)
  if (game.user.isGM) {
    await removeModuleConditions(token);
  }
  
  // Clear visibility relationships for this token
  if (token._visibilityRelationships) {
    token._visibilityRelationships.clear();
  }
  
  // Reset visual appearance
  if (token._originalAppearance) {
    // Restore original appearance using mesh manipulation
    token.mesh.alpha = 1.0; // Always reset to full visibility
    token.mesh.visible = true;
    token.alpha = 1.0;
    token.visible = true;
    
    // Update document source
    token.document._source.alpha = 1.0;
    token.document._source.hidden = false;
    
    delete token._originalAppearance;
  } else {
    // Reset to default appearance
    token.mesh.alpha = 1.0;
    token.mesh.visible = true;
    token.alpha = 1.0;
    token.visible = true;
    
    // Update document source
    token.document._source.alpha = 1.0;
    token.document._source.hidden = false;
  }

  // Clear any applied filters and tints
  if (token.mesh) {
    if (token.mesh.filters) {
      token.mesh.filters = token.mesh.filters.filter(f => !f._moduleFilter);
    }
    // Reset tint to white (normal)
    token.mesh.tint = 0xFFFFFF;
  }

  removeVisibilityIndicator(token);
}

/**
 * Remove conditions that were applied by this module
 * @param {Token} token - The token to clean up
 */
async function removeModuleConditions(token) {
  if (!token.actor) {
    return;
  }
  
  try {
    // Find and remove module-applied ActiveEffect conditions  
    const moduleEffects = token.actor.effects.filter(effect => 
      effect.getFlag(MODULE_ID, 'moduleApplied') && 
      (effect.statuses.has('hidden') || effect.statuses.has('concealed') || effect.statuses.has('undetected'))
    );
    
    for (const effect of moduleEffects) {
      await effect.delete();
    }
    
    // Check for PF2E condition items and remove them properly
    if (token.actor.itemTypes?.condition) {
      const moduleConditions = token.actor.itemTypes.condition.filter(c => 
        c.getFlag(MODULE_ID, 'moduleApplied') && (c.slug === 'hidden' || c.slug === 'concealed' || c.slug === 'undetected')
      );
      
      for (const condition of moduleConditions) {
        // Try to remove using PF2E system methods first
        try {
          const conditionSlug = condition.slug;
          if (token.actor.decreaseCondition && ['hidden', 'concealed'].includes(conditionSlug)) {
            await token.actor.decreaseCondition(conditionSlug);
          } else {
            // Fallback to direct deletion
            await condition.delete();
          }
        } catch (removalError) {
          console.warn(`${MODULE_ID} | Failed to remove condition ${condition.name}, trying direct deletion:`, removalError);
          try {
            await condition.delete();
          } catch (fallbackError) {
            console.error(`${MODULE_ID} | Complete failure to remove condition ${condition.name}:`, fallbackError);
          }
        }
      }
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to remove module conditions:`, error);
  }
}



/**
 * Add visibility indicator to token
 * @param {Token} token - The token to add indicator to
 * @param {string} state - The visibility state
 */
export function addVisibilityIndicator(token, state) {
  removeVisibilityIndicator(token); // Remove existing indicator

  const indicator = createVisibilityIndicator(state);
  if (!indicator || !token.element) return;

  try {
    token.element.appendChild(indicator);
    token._visibilityIndicator = indicator;
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to add visibility indicator:`, error);
  }
}

/**
 * Remove visibility indicator from token
 * @param {Token} token - The token to remove indicator from
 */
export function removeVisibilityIndicator(token) {
  if (token._visibilityIndicator) {
    token._visibilityIndicator.remove();
    delete token._visibilityIndicator;
  }
}