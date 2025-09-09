/**
 * AVS Override Service - Internal service for managing AVS overrides
 */

import { MODULE_ID } from '../constants.js';

/**
 * Set AVS kill switch for a token (disables AVS entirely for that token)
 * @param {Token} token - The token to set kill switch for
 * @param {boolean} disabled - Whether to disable AVS for this token
 */
export async function setAVSKillSwitch(token, disabled) {
  if (!token?.document) {
    throw new Error('Invalid token provided');
  }

  try {
    if (disabled) {
      await token.document.setFlag(MODULE_ID, 'avs', false);
      console.log(`${MODULE_ID} | AVS kill switch enabled for token: ${token.name}`);
    } else {
      await token.document.unsetFlag(MODULE_ID, 'avs');
      console.log(`${MODULE_ID} | AVS kill switch disabled for token: ${token.name}`);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Error setting AVS kill switch:`, error);
    throw error;
  }
}

/**
 * Get AVS kill switch status for a token
 * @param {Token} token - The token to check
 * @returns {boolean} True if AVS is disabled for this token
 */
export function getAVSKillSwitch(token) {
  if (!token?.document) return false;
  return token.document.getFlag(MODULE_ID, 'avs') === false;
}

/**
 * Set AVS override for a token pair (observer -> target)
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @param {string} visibilityState - The visibility state to override with
 */
export async function setAVSOverride(observer, target, visibilityState) {
  if (!observer?.document || !target?.document) {
    throw new Error('Invalid observer or target token provided');
  }

  if (!['observed', 'concealed', 'hidden', 'undetected'].includes(visibilityState)) {
    throw new Error(`Invalid visibility state: ${visibilityState}`);
  }

  try {
    const overrideKey = `${observer.document.id}->${target.document.id}`;
    const currentOverrides = observer.document.getFlag(MODULE_ID, 'avs-override') || {};

    currentOverrides[overrideKey] = {
      targetId: target.document.id,
      targetName: target.name,
      visibilityState: visibilityState,
      timestamp: Date.now(),
    };

    await observer.document.setFlag(MODULE_ID, 'avs-override', currentOverrides);
    console.log(
      `${MODULE_ID} | AVS override set: ${observer.name} → ${target.name} = ${visibilityState}`,
    );
  } catch (error) {
    console.error(`${MODULE_ID} | Error setting AVS override:`, error);
    throw error;
  }
}

/**
 * Remove AVS override for a token pair
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 */
export async function removeAVSOverride(observer, target) {
  if (!observer?.document || !target?.document) {
    throw new Error('Invalid observer or target token provided');
  }

  try {
    const overrideKey = `${observer.document.id}->${target.document.id}`;
    const currentOverrides = observer.document.getFlag(MODULE_ID, 'avs-override') || {};

    if (currentOverrides[overrideKey]) {
      delete currentOverrides[overrideKey];
      await observer.document.setFlag(MODULE_ID, 'avs-override', currentOverrides);
      console.log(`${MODULE_ID} | AVS override removed: ${observer.name} → ${target.name}`);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Error removing AVS override:`, error);
    throw error;
  }
}

/**
 * Get AVS override for a token pair
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @returns {string|null} The override visibility state or null if no override
 */
export function getAVSOverride(observer, target) {
  if (!observer?.document || !target?.document) return null;

  const overrideKey = `${observer.document.id}->${target.document.id}`;
  const currentOverrides = observer.document.getFlag(MODULE_ID, 'avs-override') || {};

  return currentOverrides[overrideKey]?.visibilityState || null;
}

/**
 * Get all AVS overrides for a token
 * @param {Token} token - The token to get overrides for
 * @returns {Object} Object containing all overrides for this token
 */
export function getAllAVSOverrides(token) {
  if (!token?.document) return {};
  return token.document.getFlag(MODULE_ID, 'avs-override') || {};
}

/**
 * Clear all AVS overrides for a token
 * @param {Token} token - The token to clear overrides for
 */
export async function clearAllAVSOverrides(token) {
  if (!token?.document) {
    throw new Error('Invalid token provided');
  }

  try {
    await token.document.unsetFlag(MODULE_ID, 'avs-override');
    console.log(`${MODULE_ID} | All AVS overrides cleared for token: ${token.name}`);
  } catch (error) {
    console.error(`${MODULE_ID} | Error clearing AVS overrides:`, error);
    throw error;
  }
}

/**
 * Check if AVS should be bypassed for a token pair
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @returns {boolean} True if AVS should be bypassed
 */
export function shouldBypassAVS(observer, target) {
  // Check if observer has kill switch enabled
  if (getAVSKillSwitch(observer)) {
    return true;
  }

  // Check if there's a specific override for this pair
  const override = getAVSOverride(observer, target);
  return override !== null;
}

/**
 * Get the effective visibility state considering AVS overrides
 * @param {Token} observer - The observing token
 * @param {Token} target - The target token
 * @param {string} calculatedState - The state calculated by AVS
 * @returns {string} The effective visibility state
 */
export function getEffectiveVisibilityState(observer, target, calculatedState) {
  // Check for kill switch first
  if (getAVSKillSwitch(observer)) {
    return calculatedState; // AVS is disabled, use calculated state
  }

  // Check for specific override
  const override = getAVSOverride(observer, target);
  if (override) {
    return override;
  }

  // No override, use calculated state
  return calculatedState;
}
