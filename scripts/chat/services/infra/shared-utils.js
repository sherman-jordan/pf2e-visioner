/**
 * Shared utilities for chat automation
 * Common functions used by both Seek and Point Out logic
 */

import { MODULE_ID, MODULE_TITLE } from "../../../constants.js";
import { refreshEveryonesPerception } from "../../../socket.js";
import { setVisibilityBetween } from "../../../utils.js";
import { updateTokenVisuals } from "../../../visual-effects.js";

/**
 * Validate if a token is a valid Seek target
 * @param {Token} token - Potential target token
 * @param {Token} seeker - The seeking token
 * @returns {boolean} Whether the token is a valid target
 */
export function isValidSeekTarget(token, seeker) {
  if (!token || !seeker || token === seeker) return false;
  if (token.actor?.type !== "npc" && token.actor?.type !== "character")
    return false;
  if (token.actor?.alliance === seeker.actor?.alliance) return false;
  return true;
}

/**
 * Extract Stealth DC from token using the definite path
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Stealth DC or 0 if not found
 */
export function extractStealthDC(token) {
  if (!token?.actor) return 0;
  // Loot actors use token override or world default; others use actor stealth DC
  if (token.actor?.type === "loot") {
    const override =
      Number(token.document?.getFlag?.(MODULE_ID, "stealthDC")) ||
      Number(token.document?.flags?.[MODULE_ID]?.stealthDC);
    if (Number.isFinite(override) && override > 0) return override;
    const fallback = Number(game.settings.get(MODULE_ID, "lootStealthDC"));
    return Number.isFinite(fallback) ? fallback : 15;
  } else if (token.actor?.type === "hazard") {
    return token.actor.system.attributes.stealth.dc;
  } else {
    // For both PCs and NPCs: actor.system.skills.stealth.dc
    return token.actor.system?.skills?.stealth?.dc || 0;
  }
}

/**
 * Calculate distance between tokens for sorting
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in feet
 */
export function calculateTokenDistance(token1, token2) {
  // Try to use token's distanceTo method if available (PF2e system provides this)
  if (token1.distanceTo) {
    try {
      // Use token's direct distanceTo method
      return token1.distanceTo(token2);
    } catch (error) {
      console.error(
        `${MODULE_TITLE}: Error calculating distance between tokens, using fallback methods:`,
        error,
      );
    }
  }

  // Try to use PF2e system's distance calculation if available
  if (game.system.id === "pf2e" && game.pf2e?.utils?.distance) {
    try {
      // Use PF2e's distance calculation
      return game.pf2e.utils.distance.getDistance(token1, token2);
    } catch (error) {
      // Fall back to other methods if PF2e's function fails
    }
  }

  // Try using Foundry's built-in measurement
  if (canvas.grid && canvas.grid.measureDistance) {
    try {
      // Try to use Foundry's built-in distance calculation
      return canvas.grid.measureDistance(token1.center, token2.center);
    } catch (error) {
      // Fall back to manual calculation if the built-in one fails
    }
  }

  // Fallback manual calculation
  // Get the center points of each token
  const t1Center = {
    x: token1.x + (token1.width * canvas.grid.size) / 2,
    y: token1.y + (token1.height * canvas.grid.size) / 2,
  };

  const t2Center = {
    x: token2.x + (token2.width * canvas.grid.size) / 2,
    y: token2.y + (token2.height * canvas.grid.size) / 2,
  };

  // Calculate distance between centers in pixels
  const dx = t1Center.x - t2Center.x;
  const dy = t1Center.y - t2Center.y;
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);

  // Convert to feet (assuming 5ft grid)
  return (pixelDistance / canvas.grid.size) * 5;
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
  return game.combat?.started && game.combat?.combatants?.size > 0;
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
export function isTokenInEncounter(token) {
  if (!hasActiveEncounter()) return false;

  const combatant = game.combat.combatants.find((c) => c.tokenId === token.id);
  return !!combatant;
}

/**
 * Modern degree of success determination with natural 20/1 handling
 * @param {number} total - Roll total
 * @param {number} die - Natural die result
 * @param {number} dc - Difficulty class
 * @returns {string} Outcome string
 */
export function determineOutcome(total, die, dc) {
  let baseOutcome;
  const margin = total - dc;

  // Determine base outcome
  if (margin >= 10) baseOutcome = "critical-success";
  else if (margin >= 0) baseOutcome = "success";
  else if (margin >= -10) baseOutcome = "failure";
  else baseOutcome = "critical-failure";

  // Apply natural 20/1 adjustments
  if (die === 20 && baseOutcome === "success") return "critical-success";
  if (die === 1 && baseOutcome === "failure") return "critical-failure";

  return baseOutcome;
}

/**
 * Apply visibility changes atomically with error handling
 * This is a unified function that replaces individual dialog-specific implementations
 * @param {Token} observer - The observer token (usually the seeker, pointer, etc.)
 * @param {Array} changes - Array of change objects
 * @param {Object} options - Additional options
 * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
 * @param {boolean} options.updateVisuals - Whether to update token visuals (default: true)
 * @param {boolean} options.refreshPerception - Whether to refresh everyone's perception (default: true)
 * @param {number} options.durationRounds - Duration in rounds (default: undefined)
 * @param {boolean} options.initiative - Whether to use initiative (default: undefined)
 * @returns {Promise} Promise that resolves when all changes are applied
 */
export async function applyVisibilityChanges(observer, changes, options = {}) {
  if (!changes || changes.length === 0 || !observer) return;

  // Default options
  const direction = options.direction || "observer_to_target";

  try {
    // Group changes by target to reduce map updates
    const changesByTarget = new Map();

    // Process and group changes
    for (const change of changes) {
      if (!change?.target) continue;

      // Get the effective new visibility state
      const effectiveNewState = change.overrideState || change.newVisibility;
      if (!effectiveNewState) continue;

      // Handle special case for Point Out where target might be in change.targetToken
      let targetToken = change.target;
      if (change.targetToken) {
        targetToken = change.targetToken;
      }

      // Store in map with target ID as key
      if (targetToken?.document?.id) {
        changesByTarget.set(targetToken.document.id, {
          target: targetToken,
          state: effectiveNewState,
        });
      }
    }

    // Process changes in batches to avoid overwhelming the system
    const batchSize = 5;
    const targetIds = Array.from(changesByTarget.keys());

    for (let i = 0; i < targetIds.length; i += batchSize) {
      const batchIds = targetIds.slice(i, i + batchSize);
      await Promise.all(
        batchIds.map(async (targetId) => {
          const changeData = changesByTarget.get(targetId);
          if (!changeData) return;

          try {
            await setVisibilityBetween(
              observer,
              changeData.target,
              changeData.state,
              {
                direction: direction,
                durationRounds: options.durationRounds,
                initiative: options.initiative,
                skipEphemeralUpdate: options.skipEphemeralUpdate,
                skipCleanup: options.skipCleanup,
              },
            );
          } catch (error) {
            console.error(
              `${MODULE_TITLE}: Error applying visibility change:`,
              error,
            );
          }
        }),
      );
    }

    // Update token visuals if requested
    try {
      // Update observer visuals once
      await updateTokenVisuals(observer);

      // Update target visuals in batches
      const uniqueTargets = new Set();
      for (const change of changes) {
        if (change?.target?.id) {
          uniqueTargets.add(change.target);
        }
      }

      const targetsArray = Array.from(uniqueTargets);
      for (let i = 0; i < targetsArray.length; i += batchSize) {
        const batchTargets = targetsArray.slice(i, i + batchSize);
        await Promise.all(
          batchTargets.map((target) => updateTokenVisuals(target)),
        );
      }
    } catch (error) {
      console.warn(`${MODULE_TITLE}: Error updating token visuals:`, error);
    }

    // Refresh everyone's perception if requested
    refreshEveryonesPerception();
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error applying visibility changes:`, error);
    ui.notifications.error(
      `${MODULE_TITLE}: Failed to apply visibility changes - ${error.message}`,
    );
  }
}

/**
 * Mark automation panel as complete
 * @param {jQuery} panel - The automation panel
 * @param {Array} changes - Applied changes
 */
export function markPanelComplete(panel, changes) {
  if (!panel || !panel.length) return;

  try {
    // Update panel appearance
    panel.addClass("completed");

    // Update button text and disable
    const button = panel.find(".preview-results");
    if (button.length) {
      button
        .prop("disabled", true)
        .html('<i class="fas fa-check"></i> Changes Applied')
        .removeClass("visioner-btn-primary")
        .addClass("visioner-btn-success");
    }

    // Add completion message
    const completionMsg = `
            <div class="automation-completion">
                <i class="fas fa-check-circle"></i>
                <span>Applied ${changes.length} visibility change${
                  changes.length !== 1 ? "s" : ""
                }</span>
            </div>
        `;

    panel.find(".automation-actions").after(completionMsg);
  } catch (error) {
    console.error(`${MODULE_TITLE}: Error marking panel complete:`, error);
  }
}

/**
 * Check if a token should be filtered based on ally filtering settings
 * @param {Token} actingToken - The token performing the action
 * @param {Token} targetToken - The token being evaluated
 * @param {string} filterType - Type of filtering: 'enemies' (default), 'allies'
 * @returns {boolean} True if the token should be filtered out (excluded)
 */
export function shouldFilterAlly(
  actingToken,
  targetToken,
  filterType = "enemies",
) {
  const ignoreAllies = game.settings.get(MODULE_ID, "ignoreAllies");
  if (!ignoreAllies) return false;

  const actingTokenIsPC =
    actingToken.actor?.hasPlayerOwner ||
    actingToken.actor?.type === "character";
  const targetTokenIsPC =
    targetToken.actor?.hasPlayerOwner ||
    targetToken.actor?.type === "character";

  if (filterType === "enemies") {
    // For enemy interactions (seek, hide, sneak, diversion): PCs target NPCs, NPCs target PCs
    return actingTokenIsPC === targetTokenIsPC;
  } else if (filterType === "allies") {
    // For ally interactions (point out): PCs help PCs, NPCs help NPCs
    return actingTokenIsPC !== targetTokenIsPC;
  }

  return false;
}

/**
 * Extract Perception DC from token using the definite path
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Perception DC or 0 if not found
 */
export function extractPerceptionDC(token) {
  if (!token.actor) return 0;
  // Per-token override
  const override = Number(token.document?.getFlag?.(MODULE_ID, "perceptionDC"));
  if (Number.isFinite(override) && override > 0) return override;
  // For both PCs and NPCs: actor.system.perception.dc
  return token.actor.system?.perception?.dc || 0;
}

/**
 * Check if a token has the 'concealed' condition on its actor
 * Works for both v13 itemTypes.condition and legacy collections
 * @param {Token} token
 * @returns {boolean}
 */
export function hasConcealedCondition(token) {
  try {
    const itemTypeConditions = token?.actor?.itemTypes?.condition || [];
    if (itemTypeConditions.some((c) => c?.slug === "concealed")) return true;
    const legacyConditions = token?.actor?.conditions?.conditions || [];
    return legacyConditions.some((c) => c?.slug === "concealed");
  } catch (_) {
    return false;
  }
}

/**
 * Filter outcomes based on encounter filter setting
 * @param {Array} outcomes - Array of outcomes to filter
 * @param {boolean} encounterOnly - Whether to filter for encounter only
 * @param {string} tokenProperty - The property name to check for token (e.g., 'target', 'token')
 * @returns {Array} Filtered outcomes
 */
export function filterOutcomesByEncounter(
  outcomes,
  encounterOnly,
  tokenProperty = "target",
) {
  // If encounter filtering is not enabled or there's no active encounter, return all outcomes
  if (!encounterOnly || !hasActiveEncounter()) {
    return outcomes;
  }

  // Filter outcomes to only include tokens in the current encounter
  return outcomes.filter((outcome) => {
    const token = outcome[tokenProperty];
    return isTokenInEncounter(token);
  });
}



