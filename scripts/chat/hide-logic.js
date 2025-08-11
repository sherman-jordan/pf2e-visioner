/**
 * Hide action logic and automation
 * Handles Hide-specific calculations, target discovery, and result processing
 */

import { MODULE_ID, MODULE_TITLE } from "../constants.js";
import { getCoverBetween, getVisibilityBetween } from "../utils.js";
import { HidePreviewDialog } from "./hide-preview-dialog.js";
import {
  calculateTokenDistance,
  determineOutcome,
  extractPerceptionDC,
  hasConcealedCondition,
  isTokenInEncounter,
  shouldFilterAlly,
} from "./shared-utils.js";

/**
 * Discover valid Hide observers (tokens that can see the hiding token)
 * @param {Token} hidingToken - The token performing the Hide
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @param {boolean} applyAllyFilter - Whether to apply ally filtering (default: true)
 * @returns {Array} Array of observer objects with token, DC, and visibility data
 */
export function discoverHideObservers(
  hidingToken,
  encounterOnly = false,
  applyAllyFilter = true,
) {
  if (!hidingToken) return [];

  const observers = [];
  const integrate = game.settings.get(MODULE_ID, "integrateCoverVisibility");
  const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");

  // Find all tokens on the canvas as potential observers
  for (const token of canvas.tokens.placeables) {
    if (token === hidingToken) continue;
    if (!token.actor) {
      continue;
    }

    // Apply ally filtering if requested and enforcing RAW
    if (
      applyAllyFilter &&
      enforceRAW &&
      shouldFilterAlly(hidingToken, token, "enemies")
    )
      continue;

    // Check encounter filtering if requested (only when enforcing RAW)
    if (enforceRAW && encounterOnly && !isTokenInEncounter(token)) {
      continue;
    }

    // Determine current visibility state
    let currentVisibility = getVisibilityBetween(token, hidingToken);
    // If map says observed but the actor is concealed, treat as concealed for gating
    if (
      currentVisibility === "observed" &&
      hasConcealedCondition(hidingToken)
    ) {
      currentVisibility = "concealed";
    }

    // For Hide, only skip hidden/undetected observers when enforcing RAW
    if (
      enforceRAW &&
      (currentVisibility === "hidden" || currentVisibility === "undetected")
    ) {
      continue;
    }

    // Apply observer inclusion gating (cover/concealment) only when enforcing RAW
    if (enforceRAW) {
      // With integration ON: allow Hide if you either have Standard/Greater cover OR are Concealed
      // With integration OFF: only allow Hide if Concealed (ignore cover entirely)
      if (integrate) {
        const cover = getCoverBetween(token, hidingToken);
        if (
          !(
            cover === "standard" ||
            cover === "greater" ||
            currentVisibility === "concealed"
          )
        ) {
          continue;
        }
      } else {
        if (currentVisibility !== "concealed") {
          continue;
        }
      }
    }

    // Get the observer's Perception DC; when RAW is OFF, tolerate missing DC
    let perceptionDC = extractPerceptionDC(token);
    if (!enforceRAW && (!perceptionDC || perceptionDC <= 0)) {
      perceptionDC = 10;
    }
    if (enforceRAW && perceptionDC <= 0) continue;

    observers.push({
      token,
      perceptionDC,
      currentVisibility,
      distance: calculateTokenDistance(hidingToken, token),
    });
  }

  return observers.sort((a, b) => a.distance - b.distance);
}

/**
 * Advanced Hide outcome calculator following official PF2e rules
 * Success: If the creature could see you, you're now Hidden from it instead of observed.
 *          If you were Hidden from or Undetected by the creature, you retain that condition.
 * Failure: No change in visibility
 * @param {Object} hideData - The Hide action data
 * @param {Object} observer - Observer data with token and DC
 * @returns {Object} Detailed outcome analysis
 */
export function analyzeHideOutcome(hideData, observer) {
  const roll = hideData.roll;
  const dc = observer.perceptionDC;

  // Validate roll object
  if (!roll || typeof roll.total !== "number") {
    console.warn("Invalid roll data in analyzeHideOutcome:", roll);
    return {
      token: observer.token,
      currentVisibility: observer.currentVisibility,
      newVisibility: observer.currentVisibility,
      changed: false,
      outcome: "failure",
      rollTotal: 0,
      dc: dc,
      margin: -dc,
    };
  }

  // Use modern degree calculation approach - handle missing dice data
  const dieResult = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total ?? 10;
  const outcome = determineOutcome(roll.total, dieResult, dc);

  // Apply official PF2e Hide rules based on current visibility and outcome
  let newVisibility = observer.currentVisibility; // Default: no change

  if (outcome === "success" || outcome === "critical-success") {
    // Success: If the creature could see you, you're now Hidden from it instead of observed
    if (observer.currentVisibility === "observed") {
      newVisibility = "hidden";
    } else if (observer.currentVisibility === "concealed") {
      // If you were concealed, you become hidden
      newVisibility = "hidden";
    }
  }

  return {
    target: observer.token,
    oldVisibility: observer.currentVisibility,
    newVisibility,
    outcome,
    rollTotal: roll.total,
    dc,
    margin: roll.total - dc,
    changed: newVisibility !== observer.currentVisibility,
  };
}

/**
 * Preview Hide results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Hide action data
 */
export async function previewHideResults(actionData) {
  // Validate actionData
  if (!actionData || !actionData.actor || !actionData.roll) {
    console.error(
      "Invalid actionData provided to previewHideResults:",
      actionData,
    );
    ui.notifications.error(
      `${MODULE_TITLE}: Invalid hide data - cannot preview results`,
    );
    return;
  }

  // Actor-level RAW gating: only when enforcement is ON
  const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
  if (enforceRAW) {
    const actorToken = actionData.actor;
    const isConcealed = hasConcealedCondition(actorToken);
    const hasStdCover = hasStandardCoverFromAnyObserver(actorToken);
    if (!isConcealed && !hasStdCover) {
      ui.notifications.info(
        `${MODULE_TITLE}: Hide requires being Concealed or having Standard Cover from an observer.`,
      );
      return;
    }
  }

  const observers = discoverHideObservers(actionData.actor, false, false);

  // Do not gate dialog on number of observers; gating is actor-only

  // Analyze all potential outcomes
  const outcomes = observers.map((observer) =>
    analyzeHideOutcome(actionData, observer),
  );
  const changes = outcomes.filter((outcome) => outcome.changed);

  // Create and show ApplicationV2-based preview dialog
  const previewDialog = new HidePreviewDialog(
    actionData.actor,
    outcomes,
    changes,
    actionData,
  );
  previewDialog.render(true);
}

/**
 * Checks if the acting token has at least Standard Cover from any valid observer
 * This is a lightweight actor-centric prerequisite (does not depend on outcomes)
 * @param {Token} actorToken
 * @returns {boolean}
 */
function hasStandardCoverFromAnyObserver(actorToken) {
  try {
    const tokens = canvas?.tokens?.placeables || [];
    for (const t of tokens) {
      if (t === actorToken) continue;
      if (!t.actor) continue;
      // Apply ally filter only when enforcing RAW
      const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
      if (enforceRAW && shouldFilterAlly(actorToken, t, "enemies")) continue;
      const cover = getCoverBetween(t, actorToken);
      if (cover === "standard" || cover === "greater") return true;
    }
  } catch (_) {
    /* noop */
  }
  return false;
}
