/**
 * Utility functions for PF2E Visioner Token Manager
 */

import { shouldFilterAlly } from './chat/shared-utils.js';
import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from './constants.js';
import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';

/**
 * Get the visibility map for a token
 * @param {Token} token - The token to get visibility data for
 * @returns {Object} Visibility map object
 */
export function getVisibilityMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'visibility') ?? {};
  return map;
}

/**
 * Set the visibility map for a token
 * @param {Token} token - The token to set visibility data for
 * @param {Object} visibilityMap - The visibility map to save
 * @returns {Promise} Promise that resolves when flag is set
 */
export async function setVisibilityMap(token, visibilityMap) {
  if (!token?.document) return;
  const path = `flags.${MODULE_ID}.visibility`;
  const result = await token.document.update({ [path]: visibilityMap }, { diff: false });
  return result;
}

/**
 * Get visibility state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @returns {string} Visibility state
 */
export function getVisibilityBetween(observer, target) {
  const visibilityMap = getVisibilityMap(observer);
  return visibilityMap[target.document.id] || 'observed';
}

/**
 * Set visibility state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @param {string} state - The visibility state to set
 * @param {Object} options - Additional options
 * @param {number} options.durationRounds - Duration of visibility change in rounds
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {boolean} options.skipEphemeralUpdate - Skip updating ephemeral effects (default: false)
 * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
 * @returns {Promise} Promise that resolves when visibility is set
 */
export async function setVisibilityBetween(observer, target, state, options = {skipEphemeralUpdate: false, direction: 'observer_to_target', skipCleanup: false}) {
  const visibilityMap = getVisibilityMap(observer);
  visibilityMap[target.document.id] = state;
  await setVisibilityMap(observer, visibilityMap);
  

  
  // Update off-guard effects using ephemeral approach
  try {
    if (!options.skipEphemeralUpdate) {
      // Direction is already set in the options with a default value
      await updateEphemeralEffectsForVisibility(observer, target, state, options);
    }
  } catch (error) {
    console.error('PF2E Visioner: Error updating off-guard effects:', error);
  }
}



/**
 * Create visibility indicator element
 * @param {string} state - The visibility state
 * @returns {HTMLElement} The indicator element
 */
export function createVisibilityIndicator(state) {
  if (state === 'observed') return null;

  const config = VISIBILITY_STATES[state];
  if (!config) return null;

  const indicator = document.createElement('div');
  indicator.className = 'visibility-indicator';
  indicator.innerHTML = `<i class="${config.icon}" style="color: ${config.color}"></i>`;
  indicator.style.cssText = `
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(0,0,0,0.8);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
    animation: visibilityPulse 2s ease-in-out infinite;
  `;

  return indicator;
}

/**
 * Show a notification to the user
 * @param {string} key - The localization key
 * @param {string} type - The notification type (info, warn, error)
 */
export function showNotification(key, type = 'info') {
  const message = game.i18n.localize(key);
  ui.notifications[type](message);
}

/**
 * Validate that a token is valid for visibility operations
 * @param {Token} token - The token to validate
 * @returns {boolean} Whether the token is valid
 */
export function isValidToken(token) {
  // Don't use token.isVisible as it excludes undetected tokens
  // Instead, check if the token exists and has a valid document
  if (!token || !token.document || !token.actor) {
    return false;
  }
  
  // Filter out irrelevant actor types that don't need visibility management
  const actorType = token.actor.type;
  
  // Exclude loot actors - they're just containers, not creatures
  if (actorType === 'loot') {
    return false;
  }
  
  // Exclude vehicles unless they have crew (vehicles are usually just objects)
  if (actorType === 'vehicle') {
    return false;
  }
  
  // Exclude party actors - they're organizational, not individual creatures
  if (actorType === 'party') {
    return false;
  }
  
  // Additional filtering based on actor properties
  const actor = token.actor;
  
  // Filter out tokens that are clearly non-creatures based on name patterns
  const name = token.document.name?.toLowerCase() || '';
  const excludePatterns = [
    /\b(loot|treasure|chest|container|barrel|crate|sack)\b/,
    /\b(door|gate|portal|entrance|exit)\b/,
    /\b(light|torch|lantern|candle|fire)\b/,
    /\b(trap|pressure.plate|trigger)\b/,
    /\b(furniture|table|chair|bed|altar)\b/,
    /\b(decoration|statue|pillar|column)\b/,
    /\b(marker|waypoint|location|area)\b/
  ];
  
  if (excludePatterns.some(pattern => pattern.test(name))) {
    return false;
  }
  
  // Include character and npc types (the main creature types)
  if (actorType === 'character' || actorType === 'npc' || actorType === 'hazard') {
    return true;
  }
  
  // For unknown actor types, be conservative and include them
  // but exclude if they have no HP (likely not a creature)
  if (actor.system?.attributes?.hp?.max === 0) {
    return false;
  }
  
  return true;
}

/**
 * Get all valid scene targets for the observer token
 * @param {Token} observer - The observer token
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of target tokens
 */
export function getSceneTargets(observer, encounterOnly = false) {
  if (!observer) return [];
  
  // Get all tokens except the observer
  let allTokens = canvas.tokens.placeables.filter(token => {
    return token !== observer && 
           token.actor && 
           isValidToken(token);
  });
  
  // Apply ally filtering if enabled
  allTokens = allTokens.filter(token => {
    return !shouldFilterAlly(observer, token, 'enemies');
  });
  
  // Apply encounter filtering if requested
  if (!encounterOnly) {
    return allTokens;
  }
  
  // Filter to only tokens that are in the current encounter
  return allTokens.filter(token => {
    // Check if there's an active encounter
    if (!game.combat || !game.combat.combatants.size) {
      return true; // Don't filter if there isn't a meaningful encounter
    }
    
    // Check if this token's actor is in the encounter
    return game.combat.combatants.some(combatant => 
      combatant.token?.id === token.document.id
    );
  });
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
  return !!(game.combat && game.combat.combatants.size > 0);
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
export function isTokenInEncounter(token) {
  if (!hasActiveEncounter()) return false;
  
  return game.combat.combatants.some(combatant => 
    combatant.token?.id === token.document.id
  );
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get the cover map for a token
 * @param {Token} token - The token to get cover data for
 * @returns {Object} Cover map object
 */
export function getCoverMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'cover') ?? {};
  return map;
}

/**
 * Set the cover map for a token
 * @param {Token} token - The token to set cover data for
 * @param {Object} coverMap - The cover map to save
 * @returns {Promise} Promise that resolves when flag is set
 */
export async function setCoverMap(token, coverMap) {
  if (!token?.document) return;
  const path = `flags.${MODULE_ID}.cover`;
  const result = await token.document.update({ [path]: coverMap }, { diff: false });
  return result;
}

/**
 * Get cover state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @returns {string} Cover state
 */
export function getCoverBetween(observer, target) {
  const coverMap = getCoverMap(observer);
  return coverMap[target.document.id] || 'none';
}

/**
 * Set cover state between two tokens
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token being observed
 * @param {string} state - The cover state to set
 * @returns {Promise} Promise that resolves when cover is set
 */
export async function setCoverBetween(observer, target, state) {
  const coverMap = getCoverMap(observer);
  coverMap[target.document.id] = state;
  await setCoverMap(observer, coverMap);
  
  // Apply PF2E condition if applicable
  try {
    const { applyCoverCondition } = await import('./cover-effects.js');
    await applyCoverCondition(target, observer, state);
  } catch (error) {
    console.error('Error applying cover condition:', error);
  }
}

/**
 * Create cover indicator element
 * @param {string} state - The cover state
 * @returns {HTMLElement} The indicator element
 */
export function createCoverIndicator(state) {
  if (state === 'none') return null;

  const config = COVER_STATES[state];
  if (!config) return null;

  const indicator = document.createElement('div');
  indicator.className = 'cover-indicator';
  indicator.innerHTML = `<i class="${config.icon}" style="color: ${config.color}"></i>`;
  indicator.style.cssText = `
    position: absolute;
    top: 2px;
    left: 2px;
    background: rgba(0,0,0,0.8);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
  `;

  return indicator;
}

/**
 * Compute Perception DC for an actor with robust fallbacks
 * @param {Actor} actor
 * @returns {number|null}
 */
/**
 * Find the most recent chat roll total for an actor, optionally filtered by slug
 * @param {Actor} actor
 * @param {string|null} requiredSlug e.g., 'perception' | 'stealth'
 * @returns {number|null}
 */
export function getLastRollTotalForActor(actor, requiredSlug = null) {
  try {
    if (!actor || !game?.messages?.contents?.length) return null;
    const messages = game.messages.contents;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      try {
        const speakerActorId = msg.speaker?.actor || msg.actor?._id;
        if (speakerActorId !== actor.id) continue;
        // Check roll
        const total = msg.rolls?.[0]?.total;
        if (typeof total !== 'number') continue;
        if (requiredSlug) {
          const slug = msg.flags?.pf2e?.context?.slug || null;
          if (slug !== requiredSlug) continue;
        }
        return total;
      } catch (_) { /* ignore and continue */ }
    }
  } catch (_) {}
  return null;
}