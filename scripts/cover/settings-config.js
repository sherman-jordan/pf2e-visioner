/**
 * Settings & Configuration Module
 * Handles game settings retrieval and filter configuration for auto-cover
 */

import { MODULE_ID } from '../constants.js';

/**
 * Get the intersection mode setting
 * @returns {string} Intersection mode ('any', 'center', 'coverage', 'tactical', 'sampling3d')
 */
export function getIntersectionMode() {
  const mode = game.settings?.get?.(MODULE_ID, 'autoCoverTokenIntersectionMode');
  return mode || 'any';
}

/**
 * Get auto-cover filter settings based on game configuration
 * @param {Object} attacker - Attacker token object
 * @returns {Object} Filter settings object
 */
export function getAutoCoverFilterSettings(attacker) {
  const ignoreUndetected = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreUndetected');
  const ignoreDead = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreDead');
  const ignoreAllies = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreAllies');
  const respectIgnoreFlag = !!game.settings?.get?.(MODULE_ID, 'autoCoverRespectIgnoreFlag');
  const allowProneBlockers = !!game.settings?.get?.(MODULE_ID, 'autoCoverAllowProneBlockers');
  
  return {
    ignoreUndetected,
    ignoreDead,
    ignoreAllies,
    respectIgnoreFlag,
    allowProneBlockers,
    attackerAlliance: attacker?.actor?.alliance,
  };
}