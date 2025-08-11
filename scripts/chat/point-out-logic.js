/**
 * Point Out action logic and automation
 * Handles Point Out-specific calculations, ally discovery, and result processing
 */

import { MODULE_ID, MODULE_TITLE } from "../constants.js";
import { getVisibilityBetween } from "../utils.js";
import { PointOutPreviewDialog } from "./point-out-preview-dialog.js";
import {
  calculateTokenDistance,
  extractStealthDC,
  isTokenInEncounter,
} from "./shared-utils.js";

/**
 * Get the actual target from Point Out action data
 * @param {Object} actionData - The Point Out action data
 * @returns {Token|null} The targeted token, or null if none found
 */
export function getPointOutTarget(actionData) {
  // Try to get target from various sources
  let targetToken = null;

  // Method 0: If explicit token id is provided in actionData, use it (from socket handoff)
  if (actionData.context?.target?.token) {
    const tokenFromContext = canvas.tokens.get(actionData.context.target.token);
    if (tokenFromContext) return tokenFromContext;
  }

  // Method 1: Use current user target when available (works for GM and players)
  if (game.user.targets && game.user.targets.size > 0) {
    targetToken = Array.from(game.user.targets)[0];
    return targetToken;
  }

  // Method 2: Check message/context flags for target data
  if (actionData.context?.target?.token) {
    const targetTokenId = actionData.context.target.token;
    targetToken = canvas.tokens.get(targetTokenId);
    if (targetToken) return targetToken;
  }
  if (actionData.context?.target?.actor) {
    const targetActorId = actionData.context.target.actor;
    targetToken = canvas.tokens.placeables.find(
      (t) => t.actor?.id === targetActorId
    );
    if (targetToken) return targetToken;
  }
  // Method 2b: Pull directly from the originating chat message flags if available (PF2e flags)
  if (actionData.messageId) {
    try {
      const msg = game.messages.get(actionData.messageId);
      const targetData = msg?.flags?.pf2e?.target;
      if (targetData?.token) {
        targetToken = canvas.tokens.get(targetData.token);
        if (targetToken) return targetToken;
      }
      if (targetData?.actor) {
        targetToken = canvas.tokens.placeables.find(
          (t) => t.actor?.id === targetData.actor
        );
        if (targetToken) return targetToken;
      }
      // Method 2c: Pull from module flags set by player → GM handoff
      const modulePointOut = msg?.flags?.[MODULE_ID]?.pointOut;
      if (modulePointOut?.targetTokenId) {
        const tokenFromModule = canvas.tokens.get(modulePointOut.targetTokenId);
        if (tokenFromModule) return tokenFromModule;
      }
    } catch (_) {}
  }

  // Method 3: Check for target in message content (fallback)
  // This is less reliable but might catch some cases
  return null;
}

/**
 * Find the best target for Point Out action (legacy function)
 * Looks for the closest enemy that the pointer can see but allies can't
 * @param {Token} pointerToken - The token performing the Point Out
 * @returns {Token|null} The best target to point out, or null if none found
 */
export function findBestPointOutTarget(pointerToken) {
  const potentialTargets = canvas.tokens.placeables.filter((token) => {
    // Skip self and allies
    if (
      token === pointerToken ||
      token.actor?.alliance === pointerToken.actor?.alliance
    )
      return false;

    // Must be an NPC or character
    if (token.actor?.type !== "npc" && token.actor?.type !== "character")
      return false;

    // Pointer must be able to see the target (can't point out what you can't see)
    // Only enforce when RAW is ON; when OFF, do not filter outcomes
    const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
    const pointerVisibility = getVisibilityBetween(pointerToken, token);
    if (enforceRAW && pointerVisibility === "undetected") return false;

    // Check if any allies can't see this target
    const allies = canvas.tokens.placeables.filter((ally) => {
      return (
        ally !== pointerToken &&
        ally.actor?.alliance === pointerToken.actor?.alliance &&
        ally.actor?.type === "character"
      );
    });

    // Target is good if at least one ally can't see it
    return allies.some((ally) => {
      const allyVisibility = getVisibilityBetween(ally, token);
      return allyVisibility === "undetected";
    });
  });

  if (potentialTargets.length === 0) return null;

  // Sort by distance and return closest
  potentialTargets.sort((a, b) => {
    const distA = calculateTokenDistance(pointerToken, a);
    const distB = calculateTokenDistance(pointerToken, b);
    return distA - distB;
  });

  return potentialTargets[0];
}

/**
 * Find allies who can't see the specified target and will benefit from Point Out
 * @param {Token} pointerToken - The token performing the Point Out
 * @param {Token} targetToken - The specific token being pointed out
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of ally data who can't see the target
 */
export function discoverPointOutAllies(
  pointerToken,
  targetToken,
  encounterOnly = false
) {
  if (!pointerToken || !targetToken) return [];
  const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");

  // First, check if the pointer can see the target (must be observed, concealed, or hidden)
  const pointerVisibility = getVisibilityBetween(pointerToken, targetToken);
  // Only gate when enforcing RAW
  if (enforceRAW && pointerVisibility === "undetected") {
    return [];
  }

  const allies = [];

  // Find all tokens that are allies of the pointing token
  for (const token of canvas.tokens.placeables) {
    if (token === pointerToken) continue;
    if (!token.actor) continue;
    // Only allies should be considered in outcomes
    if (token.actor?.alliance !== pointerToken.actor?.alliance) continue;

    // Check encounter filtering (only when enforcing RAW)
    if (enforceRAW && encounterOnly && !isTokenInEncounter(token)) continue;

    // Check if this ally can't see the target
    const allyVisibility = getVisibilityBetween(token, targetToken);
    // Only restrict to allies that can't see when enforcing RAW
    if (!enforceRAW || allyVisibility === "undetected") {
      let stealthDC = extractStealthDC(targetToken);
      if (!enforceRAW && (!stealthDC || stealthDC <= 0)) {
        stealthDC = 10;
      }
      if (!enforceRAW || stealthDC > 0) {
        allies.push({
          token: token,
          targetToken: targetToken,
          stealthDC,
          currentVisibility: allyVisibility,
          distance: calculateTokenDistance(pointerToken, token),
        });
      }
    }
  }

  // Sort by distance (closest first)
  return allies.sort((a, b) => a.distance - b.distance);
}

/**
 * Legacy function for backward compatibility - now redirects to new logic
 * @param {Token} pointerToken - The token performing the Point Out
 * @param {Token} targetToken - The specific token being pointed out (optional, for targeted Point Out)
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of ally tokens who can't see the target
 */
export function discoverPointOutTargets(
  pointerToken,
  targetToken = null,
  encounterOnly = false
) {
  // If no specific target provided, find the best one
  if (!targetToken) {
    targetToken = findBestPointOutTarget(pointerToken);
    if (!targetToken) return [];
  }

  // Get allies who can't see the target
  const allies = discoverPointOutAllies(
    pointerToken,
    targetToken,
    encounterOnly
  );
  return allies.map((ally) => ally.token);
}

/**
 * Analyze Point Out outcome following official PF2e rules
 * Point Out makes undetected creatures hidden to specific allies
 * The pointer can see the target (observed, concealed, or hidden) and points it out to allies who can't see it
 * @param {Object} actionData - The Point Out action data
 * @param {Object} allyData - Data about the ally who can't see the target
 * @returns {Object} Detailed outcome analysis
 */
export function analyzePointOutOutcome(actionData, allyData) {
  // Point Out doesn't use a roll - it automatically makes undetected creatures hidden to allies
  // The ally's visibility of the target changes from undetected to hidden

  if (!allyData.token) {
    console.error(`${MODULE_TITLE}: No token in allyData:`, allyData);
    return null;
  }

  if (!allyData.targetToken) {
    console.error(`${MODULE_TITLE}: No targetToken in allyData:`, allyData);
    return null;
  }

  let newVisibility = allyData.currentVisibility; // Default: no change

  if (allyData.currentVisibility === "undetected") {
    // Point Out makes undetected creatures hidden to this ally
    newVisibility = "hidden";
  }

  const result = {
    target: allyData.token, // The ally whose visibility is changing
    targetToken: allyData.targetToken, // The token being pointed out
    oldVisibility: allyData.currentVisibility,
    newVisibility,
    outcome: "point-out", // Special outcome type for Point Out
    rollTotal: 0, // Point Out doesn't use a roll
    dc: allyData.stealthDC,
    margin: 0, // No roll means no margin
    changed: newVisibility !== allyData.currentVisibility,
    isPointOut: true, // Flag to identify Point Out results
  };

  return result;
}

/**
 * Preview Point Out results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Point Out action data
 */
export async function previewPointOutResults(actionData) {
  // Validate actionData
  if (!actionData || !actionData.actor) {
    console.error(
      "Invalid actionData provided to previewPointOutResults:",
      actionData
    );
    ui.notifications.error(
      `${MODULE_TITLE}: Invalid Point Out data - cannot preview results`
    );
    return;
  }

  // Get the actual targeted token from the Point Out action
  let pointOutTarget = getPointOutTarget(actionData);

  if (!pointOutTarget) {
    // Fallback: try to pick a reasonable target from the pointer token context
    try {
      const msg = actionData.messageId
        ? game.messages.get(actionData.messageId)
        : null;
      const modulePO = msg?.flags?.[MODULE_ID]?.pointOut;
      const pointerTokenId = modulePO?.pointerTokenId || actionData.actor?.id;
      const pointerToken = pointerTokenId
        ? canvas.tokens.get(pointerTokenId)
        : null;
      if (pointerToken) {
        const best = findBestPointOutTarget(pointerToken);
        if (best) {
          pointOutTarget = best;
          // Ensure context carries the resolved target for downstream
          actionData.context = actionData.context || {};
          actionData.context.target = { token: best.id };
        }
      }
    } catch (_) {}

    if (!pointOutTarget) {
      const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
      if (enforceRAW) {
        ui.notifications.info(
          `${MODULE_TITLE}: No target found for Point Out action`
        );
        return;
      }
      // Proceed with no target; dialog will open empty
    }
  }

  // If GM, ping the pointed-out target for visibility
  try {
    if (game.user.isGM && pointOutTarget) {
      const point = pointOutTarget.center || {
        x:
          pointOutTarget.x +
          (pointOutTarget.w ?? pointOutTarget.width * canvas.grid.size) / 2,
        y:
          pointOutTarget.y +
          (pointOutTarget.h ?? pointOutTarget.height * canvas.grid.size) / 2,
      };
      if (typeof canvas.ping === "function") {
        canvas.ping(point, {
          color: game.user?.color,
          name: game.user?.name || "Point Out",
        });
      } else if (canvas?.pings?.create) {
        canvas.pings.create({ ...point, user: game.user });
      }
    }
  } catch (_) {}

  // Find allies who can't see this target and will benefit from Point Out
  const allies = pointOutTarget
    ? discoverPointOutAllies(actionData.actor, pointOutTarget)
    : [];

  if (allies.length === 0) {
    const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
    if (enforceRAW) {
      ui.notifications.info(`${MODULE_TITLE}: No allies to point out to`);
      return;
    }
    // Continue to open dialog empty when enforcement is off
  }

  // Analyze all potential outcomes
  const outcomes = allies.map((allyData) =>
    analyzePointOutOutcome(actionData, allyData)
  );
  const changes = outcomes.filter((outcome) => outcome.changed);

  // Create and show ApplicationV2-based preview dialog
  const previewDialog = new PointOutPreviewDialog(
    actionData.actor,
    outcomes,
    changes,
    actionData
  );
  previewDialog.render(true);
}
