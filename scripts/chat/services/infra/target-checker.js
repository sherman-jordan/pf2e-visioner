import { getCoverBetween, getVisibilityBetween } from "../../../utils.js";
import { shouldFilterAlly } from "./shared-utils.js";

export function checkForValidTargets(actionData) {
  // Guard: canvas or tokens not ready yet in early hook timings
  const tokenLayer = canvas?.tokens;
  const allTokens = tokenLayer?.placeables || [];
  if (!tokenLayer || !Array.isArray(allTokens)) return false;

  const potentialTargets = allTokens.filter((token) => {
    if (token === actionData.actor) return false;
    if (!token.actor) return false;
    if (token.actor.type !== "character" && token.actor.type !== "npc" && token.actor.type !== "hazard") return false;
    return true;
  });

  if (potentialTargets.length === 0) return false;

  switch (actionData.actionType) {
    case "consequences":
      return checkConsequencesTargets(actionData, potentialTargets);
    case "seek":
      return checkSeekTargets(actionData, potentialTargets);
    case "point-out":
      return checkPointOutTargets(actionData, potentialTargets);
    case "hide":
      return checkHideTargets(actionData, potentialTargets);
    case "sneak":
      return checkSneakTargets(actionData, potentialTargets);
    case "create-a-diversion":
      return checkDiversionTargets(actionData, potentialTargets);
    default:
      return true;
  }
}

function checkConsequencesTargets(actionData, potentialTargets) {
  const enforceRAW = game.settings.get("pf2e-visioner", "enforceRawRequirements");
  for (const target of potentialTargets) {
    if (enforceRAW && shouldFilterAlly(actionData.actor, target, "enemies")) continue;
    let visibility = getVisibilityBetween(target, actionData.actor);
    try {
      const itemTypeConditions = actionData.actor?.actor?.itemTypes?.condition || [];
      const legacyConditions = actionData.actor?.actor?.conditions?.conditions || [];
      const actorIsConcealed =
        itemTypeConditions.some((c) => c?.slug === "concealed") ||
        legacyConditions.some((c) => c?.slug === "concealed");
      if (visibility === "observed" && actorIsConcealed) visibility = "concealed";
    } catch (_) {}
    if (visibility === "hidden" || visibility === "undetected") return true;
  }
  return false;
}

function checkSeekTargets(actionData, potentialTargets) {
  for (const target of potentialTargets) {
    const visibility = getVisibilityBetween(actionData.actor, target);
    if (["concealed", "hidden", "undetected"].includes(visibility)) return true;
    if (target.actor) {
      const conditions = target.actor.conditions?.conditions || [];
      const isHiddenOrUndetected = conditions.some((c) => ["hidden", "undetected", "concealed"].includes(c.slug));
      if (isHiddenOrUndetected) return true;
    }
    if (actionData.actor.actor?.getRollOptions) {
      const rollOptions = actionData.actor.actor.getRollOptions();
      const hasHiddenOrUndetected = rollOptions.some((opt) => opt.includes("target:concealed") || opt.includes("target:hidden") || opt.includes("target:undetected"));
      if (hasHiddenOrUndetected) return true;
    }
  }
  return false;
}

function checkPointOutTargets(actionData, potentialTargets) {
  let hasAlly = false;
  let hasValidTarget = false;
  for (const token of potentialTargets) {
    if (!hasAlly && token.document.disposition === actionData.actor.document.disposition) hasAlly = true;
  }
  for (const token of potentialTargets) {
    if (token.document.disposition !== actionData.actor.document.disposition) {
      hasValidTarget = true;
      break;
    }
  }
  return hasAlly && hasValidTarget;
}

function checkHideTargets(actionData, potentialTargets) {
  const enforceRAW = game.settings.get("pf2e-visioner", "enforceRawRequirements");
  if (!enforceRAW) return potentialTargets.length > 0;

  // RAW prerequisite: at least one observed creature must either see the actor as concealed
  // OR the actor must have Standard or Greater Cover from at least one observed creature
  try {
    for (const observer of potentialTargets) {
      const vis = getVisibilityBetween(observer, actionData.actor);
      if (vis === "concealed") return true;
      if (vis === "observed") {
        try {
          const cover = getCoverBetween(observer, actionData.actor);
          if (cover === "standard" || cover === "greater") return true;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return false;
}

function checkSneakTargets(actionData, potentialTargets) {
  const enforceRAW = game.settings.get("pf2e-visioner", "enforceRawRequirements");
  if (!enforceRAW) return potentialTargets.length > 0;
  // RAW: You can attempt Sneak only against creatures you were Hidden or Undetected from at the start.
  try {
    const observers = potentialTargets.filter((o) => !shouldFilterAlly(actionData.actor, o, "enemies"));
    return observers.some((o) => {
      const vis = getVisibilityBetween(o, actionData.actor);
      return vis === "hidden" || vis === "undetected";
    });
  } catch (_) {
    return false;
  }
}

function checkDiversionTargets(actionData, potentialTargets) {
  const { discoverDiversionObservers } = game.pf2eVisionerCache?.createADiversion || {};
  try {
    if (discoverDiversionObservers) {
      const observers = discoverDiversionObservers(actionData.actor);
      return observers.length > 0;
    }
  } catch (_) {}
  // Fallback to simple heuristic if dynamic import not cached
  return potentialTargets.length > 0;
}



