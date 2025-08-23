/**
 * Visibility map store and helpers
 */

import { MODULE_ID } from '../constants.js';
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
  visibilityMap[target.document.id] = state;
  await setVisibilityMap(observer, visibilityMap);

  if (options.skipEphemeralUpdate) return;
  try {
    await updateEphemeralEffectsForVisibility(observer, target, state, options);
  } catch (error) {
    console.error('PF2E Visioner: Error updating off-guard effects:', error);
  }
}
