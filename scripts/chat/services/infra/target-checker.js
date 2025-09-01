import { MODULE_ID } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { getCoverBetween, getVisibilityBetween } from '../../../utils.js';
// Debug logger removed
import { shouldFilterAlly } from './shared-utils.js';

export function checkForValidTargets(actionData) {
  // Guard: canvas or tokens not ready yet in early hook timings
  const tokenLayer = canvas?.tokens;
  const allTokens = tokenLayer?.placeables || [];
  if (!tokenLayer || !Array.isArray(allTokens)) return false;

  const potentialTargets = allTokens.filter((token) => {
    if (token === actionData.actor) return false;
    if (!token.actor) return false;
    if (
      token.actor.type !== 'character' &&
      token.actor.type !== 'npc' &&
      token.actor.type !== 'hazard'
    )
      return false;
    return true;
  });

  if (potentialTargets.length === 0) return false;

  switch (actionData.actionType) {
    case 'consequences':
      return checkConsequencesTargets(actionData, potentialTargets);
    case 'seek':
      return checkSeekTargets(actionData, potentialTargets);
    case 'point-out':
      return checkPointOutTargets(actionData, potentialTargets);
    case 'hide':
      return checkHideTargets(actionData, potentialTargets);
    case 'sneak':
      return checkSneakTargets(actionData, potentialTargets);
    case 'create-a-diversion':
      return checkDiversionTargets(actionData, potentialTargets);
    default:
      return true;
  }
}

function checkConsequencesTargets(actionData, potentialTargets) {
  const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');
  for (const target of potentialTargets) {
    if (
      enforceRAW &&
      shouldFilterAlly(actionData.actor, target, 'enemies', actionData?.ignoreAllies)
    )
      continue;
    let visibility = getVisibilityBetween(target, actionData.actor);
    try {
      const itemTypeConditions = actionData.actor?.actor?.itemTypes?.condition || [];
      const legacyConditions = actionData.actor?.actor?.conditions?.conditions || [];
      const actorIsConcealed =
        itemTypeConditions.some((c) => c?.slug === 'concealed') ||
        legacyConditions.some((c) => c?.slug === 'concealed');
      if (visibility === 'observed' && actorIsConcealed) visibility = 'concealed';
    } catch (_) { }
    if (visibility === 'hidden' || visibility === 'undetected') return true;
  }
  return false;
}

function checkSeekTargets(actionData, potentialTargets) {
  // First check if there are any walls in the scene that could be seek targets
  try {
    const scene = canvas?.scene;
    if (scene) {
      // Check for walls in the walls collection
      const walls = canvas?.walls?.placeables || [];
      if (walls.length > 0) {
        // Found walls - these are always valid seek targets
        return true;
      }

      // Check for loot tokens (tokens without actors that might be loot)
      const allSceneTokens = canvas.tokens?.placeables || [];
      const lootTokens = allSceneTokens.filter(
        (token) =>
          token !== actionData.actor &&
          !token.actor &&
          (token.document?.getFlag?.(MODULE_ID, 'isLoot') ||
            token.document?.getFlag?.(MODULE_ID, 'minPerceptionRank')),
      );

      if (lootTokens.length > 0) {
        // Found loot - check if any meet perception requirements
        for (const lootToken of lootTokens) {
          const minRank = Number(
            lootToken.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0,
          );
          if (Number.isFinite(minRank) && minRank > 0) {
            const stat = actionData.actor?.actor?.getStatistic?.('perception');
            const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
            if (Number.isFinite(seekerRank) && seekerRank >= minRank) {
              return true; // Valid loot target found
            }
          } else {
            // No rank requirement, so this is a valid seek target
            return true;
          }
        }
      }
    }
  } catch (_) { }

  for (const target of potentialTargets) {
    // Check if target is a hazard/loot with a minimum perception rank
    try {
      if (target?.actor && (target.actor.type === 'hazard' || target.actor.type === 'loot')) {
        const minRank = Number(target.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
        if (Number.isFinite(minRank) && minRank > 0) {
          const stat = actionData.actor?.actor?.getStatistic?.('perception');
          const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
          if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
            // Not enough proficiency: indicate special row action state and skip as a valid seek target
            actionData._visionerSeekProficiencyBlocked = true;
            continue;
          }
        }
      }

      // Handle loot tokens and hidden walls that don't have actors
      if (!target.actor) {
        // Check if this is a loot token or hidden wall by looking at the token's properties
        const isLootOrHiddenWall =
          target.document?.getFlag?.(MODULE_ID, 'isLoot') ||
          target.document?.getFlag?.(MODULE_ID, 'isHiddenWall') ||
          target.document?.getFlag?.(MODULE_ID, 'minPerceptionRank');

        if (isLootOrHiddenWall) {
          // Check perception rank requirement if set
          const minRank = Number(target.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
          if (Number.isFinite(minRank) && minRank > 0) {
            const stat = actionData.actor?.actor?.getStatistic?.('perception');
            const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
            if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
              // Not enough proficiency: indicate special row action state and skip as a valid seek target
              actionData._visionerSeekProficiencyBlocked = true;
              continue;
            }
          }
          // If no rank requirement or requirement met, this is a valid seek target
          return true;
        }
      }
    } catch (_) { }

    const visibility = getVisibilityBetween(actionData.actor, target);
    if (['concealed', 'hidden', 'undetected'].includes(visibility)) return true;
    if (target.actor) {
      const conditions = target.actor.conditions?.conditions || [];
      const isHiddenOrUndetected = conditions.some((c) =>
        ['hidden', 'undetected', 'concealed'].includes(c.slug),
      );
      if (isHiddenOrUndetected) return true;
    }
    if (actionData.actor.actor?.getRollOptions) {
      const rollOptions = actionData.actor.actor.getRollOptions();
      const hasHiddenOrUndetected = rollOptions.some(
        (opt) =>
          opt.includes('target:concealed') ||
          opt.includes('target:hidden') ||
          opt.includes('target:undetected'),
      );
      if (hasHiddenOrUndetected) return true;
    }
  }
  return false;
}

function checkPointOutTargets(actionData, potentialTargets) {
  let hasAlly = false;
  let hasValidTarget = false;
  for (const token of potentialTargets) {
    if (!hasAlly && token.document.disposition === actionData.actor.document.disposition)
      hasAlly = true;
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
  const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');
  const autoCover = game.settings.get(MODULE_ID, 'autoCover');
  if (!enforceRAW) return potentialTargets.length > 0;

  // RAW prerequisite: at least one observed creature must either see the actor as concealed
  // OR the actor must have Standard or Greater Cover from at least one observed creature
  try {
    for (const observer of potentialTargets) {
      const vis = getVisibilityBetween(observer, actionData.actor);
      if (vis === 'concealed') {
        return true;
      }
      // Prefer fresh auto-cover detection; fallback to stored map if needed
      let cover = 'none';
      if (autoCover) {
        try {
          cover =
            autoCoverSystem.detectCoverBetweenTokens(observer, actionData.actor, { rawPrereq: true }) || 'none';
        } catch (_) { }
      }
      if (cover === 'none') {
        try {
          cover = getCoverBetween(observer, actionData.actor);
        } catch (_) {
          cover = 'none';
        }
      }
      if (cover === 'standard' || cover === 'greater') {
        return true;
      }
    }
  } catch (_) { }
  return false;
}

function checkSneakTargets(actionData, potentialTargets) {
  const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');
  if (!enforceRAW) return potentialTargets.length > 0;
  // RAW: You can attempt Sneak only against creatures you were Hidden or Undetected from at the start.
  try {
    const observers = potentialTargets.filter(
      (o) => !shouldFilterAlly(actionData.actor, o, 'enemies', actionData?.ignoreAllies),
    );
    return observers.some((o) => {
      const vis = getVisibilityBetween(o, actionData.actor);
      return vis === 'hidden' || vis === 'undetected';
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
  } catch (_) { }
  // Fallback to simple heuristic if dynamic import not cached
  return potentialTargets.length > 0;
}
