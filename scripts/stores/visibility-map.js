/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
import { autoVisibilitySystem } from '../visibility/auto-visibility/index.js';
import { updateEphemeralEffectsForVisibility } from '../visibility/ephemeral.js';

/**
 * Get the visibility map for a token
 * @param {Token} token
 * @returns {Record<string,string>}
 */
export function getVisibilityMap(token) {
  const map = token?.document.getFlag(MODULE_ID, 'visibility') ?? {};
  return map;
}

/**
 * Persist the visibility map for a token
 * @param {Token} token
 * @param {Record<string,string>} visibilityMap
 */
export async function setVisibilityMap(token, visibilityMap) {
  if (!token?.document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) return;

  const path = `flags.${MODULE_ID}.visibility`;
  const result = await token.document.update({ [path]: visibilityMap }, { diff: false });
  return result;
}

/**
 * Read visibility state between two tokens
 * @param {Token} observer
 * @param {Token} target
 */
export function getVisibilityBetween(observer, target) {
  const visibilityMap = getVisibilityMap(observer);
  return visibilityMap[target?.document?.id] || 'observed';
}

/**
 * Get manual override flags for a token
 * @param {Token} token
 * @returns {Record<string,boolean>}
 */
export function getManualOverrideFlags(token) {
  const flags = token?.document.getFlag(MODULE_ID, 'manualOverrides') ?? {};
  return flags;
}

/**
 * Set manual override flag for a specific token relationship
 * @param {Token} observer
 * @param {Token} target  
 * @param {boolean} isManual
 */
export async function setManualOverrideFlag(observer, target, isManual) {
  if (!observer?.document || !target?.document) return;
  // Only GMs can update token documents
  if (!game.user.isGM) return;

  const overrideFlags = getManualOverrideFlags(observer);
  if (isManual) {
    overrideFlags[target.document.id] = true;
  } else {
    delete overrideFlags[target.document.id];
  }

  const path = `flags.${MODULE_ID}.manualOverrides`;
  await observer.document.update({ [path]: overrideFlags }, { diff: false });
}

/**
 * Check if a visibility relationship has been manually overridden
 * @param {Token} observer
 * @param {Token} target
 * @returns {boolean}
 */
export function hasManualOverride(observer, target) {
  const overrideFlags = getManualOverrideFlags(observer);
  return !!overrideFlags[target?.document?.id];
}

/**
 * Write visibility state between two tokens and update ephemeral effects
 * @param {Token} observer
 * @param {Token} target
 * @param {string} state
 * @param {Object} options
 */
export async function setVisibilityBetween(
  observer,
  target,
  state,
  options = { skipEphemeralUpdate: false, direction: 'observer_to_target', skipCleanup: false },
) {
  if (!observer?.document?.id || !target?.document?.id) return;

  const visibilityMap = getVisibilityMap(observer);
  const currentState = visibilityMap[target.document.id];

  // Only update if state has changed
  if (currentState !== state) {
    visibilityMap[target.document.id] = state;
    await setVisibilityMap(observer, visibilityMap);

    // Track manual vs automatic changes
    if (!options.isAutomatic) {
      await setManualOverrideFlag(observer, target, true);
    }
  }

  if (options.skipEphemeralUpdate) return;
  try {
    // Debug logging for Hidden effect application
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode && state === 'hidden') {
      console.log(`${MODULE_ID} | 🎭 HIDDEN EFFECT: ${observer.name} → ${target.name}`);
    }

    // Set flag to prevent auto-visibility system from reacting to its own effect changes
    if (autoVisibilitySystem) {
      autoVisibilitySystem._setUpdatingEffects(true);
    }

    await updateEphemeralEffectsForVisibility(observer, target, state, options);
  } catch (error) {
    console.error('PF2E Visioner: Error updating off-guard effects:', error);
  } finally {
    // Always clear the flag, even if there was an error
    if (autoVisibilitySystem) {
      autoVisibilitySystem._setUpdatingEffects(false);
    }
  }
}

/**
 * Get visibility state between tokens with flexible parameter handling for compatibility
 * @param {Token|string} observer - Observer token or token ID
 * @param {Token|string} target - Target token or token ID 
 * @param {string} direction - Direction of visibility (observer_to_target or target_to_observer)
 * @returns {string} Visibility state
 */
export function getVisibility(observer, target, direction = 'observer_to_target') {
  try {
    // Resolve tokens if IDs are provided
    let observerToken = observer;
    let targetToken = target;

    if (typeof observer === 'string') {
      observerToken = canvas.tokens.get(observer);
      if (!observerToken) {
        console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    if (typeof target === 'string') {
      targetToken = canvas.tokens.get(target);
      if (!targetToken) {
        console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
        return 'observed'; // Default to observed if token not found
      }
    }

    // Handle direction (for bidirectional visibility systems)
    if (direction === 'target_to_observer') {
      // Swap observer and target for reverse direction lookup
      return getVisibilityBetween(targetToken, observerToken);
    }

    // Default: observer_to_target
    return getVisibilityBetween(observerToken, targetToken);
  } catch (error) {
    console.error('PF2E Visioner: Error in getVisibility function:', error);
    return 'observed'; // Default fallback value
  }
}
