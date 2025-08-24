/**
 * Token Filtering Module
 * Handles token eligibility filtering and blocker token selection
 */

import { MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';

/**
 * Get eligible blocking tokens based on filter settings
 * @param {Object} attacker - Attacker token object
 * @param {Object} target - Target token object
 * @param {Object} filters - Filter settings object (from getAutoCoverFilterSettings)
 * @returns {Array} Array of eligible blocking tokens
 */
export function getEligibleBlockingTokens(attacker, target, filters) {
  const out = [];

  for (const blocker of canvas.tokens.placeables) {
    if (!blocker?.actor) continue;
    if (blocker === attacker || blocker === target) continue;

    // Exclude controlled/selected tokens from being blockers
    if (
      canvas.tokens.controlled.includes(blocker) ||
      blocker.id === attacker.id ||
      blocker.id === target.id
    )
      continue;

    const type = blocker.actor?.type;
    if (type === 'loot' || type === 'hazard') continue;
    if (filters.respectIgnoreFlag && blocker.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover')) {
      continue;
    }
    // Always ignore Foundry hidden tokens
    if (blocker.document.hidden) {
      continue;
    }

    // Check PF2e undetected tokens only if the setting is enabled
    if (filters.ignoreUndetected) {
      try {
        // Use custom visibility perspective if provided, otherwise use attacker
        const perspectiveToken = filters.visibilityPerspective || attacker;
        const vis = getVisibilityBetween(perspectiveToken, blocker);
        if (vis === 'undetected') {
          continue;
        }
      } catch (_) {}
    }
    if (filters.ignoreDead && blocker.actor?.hitPoints?.value === 0) {
      continue;
    }
    if (!filters.allowProneBlockers) {
      try {
        const itemConditions = blocker.actor?.itemTypes?.condition || [];
        const legacyConditions =
          blocker.actor?.conditions?.conditions || blocker.actor?.conditions || [];
        const isProne =
          itemConditions.some((c) => c?.slug === 'prone') ||
          legacyConditions.some((c) => c?.slug === 'prone');
        if (isProne) {
          continue;
        }
      } catch (_) {}
    }
    if (filters.ignoreAllies && blocker.actor?.alliance === filters.attackerAlliance) {
      continue;
    }

    out.push(blocker);
  }

  return out;
}