/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { COVER_STATES, MODULE_ID } from "./constants.js";
import { ensureAggregateCoverEffect, updateAggregateCoverMetaForState, updateReflexStealthAcrossCoverAggregates } from "./cover/aggregates.js";
import { dedupeCoverAggregates, reconcileCoverAggregatesAgainstMaps } from "./cover/batch.js";
import { runWithCoverEffectLock } from "./cover/utils.js";
import { getCoverBonusByState } from "./helpers/cover-helpers.js";

// cover lock moved to cover/utils.js

/**
 * Create an ephemeral effect for cover states
 * @param {Token} effectReceiverToken - The token who receives the cover effect
 * @param {Token} effectSourceToken - The token who is the source of the effect (the observer)
 * @param {string} coverState - The cover state ('lesser', 'standard', or 'greater')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
export async function createEphemeralCoverEffect(
  effectReceiverToken,
  effectSourceToken,
  coverState,
  options = {}
) {
  // Skip if no cover or invalid state
  if (!coverState || coverState === "none" || !COVER_STATES[coverState]) {
    return;
  }

  // Check if effect already exists to prevent duplicates
  const existingEffect = effectReceiverToken.actor.itemTypes.effect.find(
    (e) =>
      e.flags?.[MODULE_ID]?.isEphemeralCover &&
      e.flags?.[MODULE_ID]?.observerActorSignature ===
        effectSourceToken.actor.signature
  );

  if (existingEffect) {
    // If the same level, don't recreate
    if (existingEffect.flags[MODULE_ID].coverState === coverState) {
      return;
    }
    // Otherwise, remove the old one so we can create the new one
    try {
      if (effectReceiverToken.actor.items.get(existingEffect.id)) {
        await effectReceiverToken.actor.deleteEmbeddedDocuments("Item", [
          existingEffect.id,
        ]);
      }
    } catch (_) {
      // Ignore if it was already removed
    }
  }

  const stateConfig = COVER_STATES[coverState];
  const coverLabel = game.i18n.localize(stateConfig.label);

  // Pick a representative image per cover level
  const coverEffectImageByState = {
    lesser: "systems/pf2e/icons/equipment/shields/buckler.webp",
    standard: "systems/pf2e/icons/equipment/shields/steel-shield.webp",
    greater: "systems/pf2e/icons/equipment/shields/tower-shield.webp",
  };

  const effectImg =
    coverEffectImageByState[coverState] ||
    "systems/pf2e/icons/equipment/shields/steel-shield.webp";

  const ephemeralEffect = {
    name: `${coverLabel} against ${effectSourceToken.name}`,
    type: "effect",
    system: {
      description: {
        value: `<p>You have ${coverState} cover against ${effectSourceToken.name}, granting a +${stateConfig.bonusAC} circumstance bonus to AC.</p>`,
        gm: "",
      },
      rules: [
        {
          key: "RollOption",
          domain: "all",
          option: `cover-against:${effectSourceToken.id}`,
        },
        {
          key: "FlatModifier",
          selector: "ac",
          type: "circumstance",
          value: stateConfig.bonusAC,
          predicate: [
            `origin:signature:${effectSourceToken.actor.signature || effectSourceToken.actor.id}`,
            `cover-against:${effectSourceToken.id}`,
          ],
        },
      ],
      slug: null,
      traits: {
        otherTags: [],
        value: [],
      },
      level: {
        value: 1,
      },
      duration:
        options.durationRounds >= 0
          ? {
              value: options.durationRounds,
              unit: "rounds",
              expiry: "turn-start",
              sustained: false,
            }
          : {
              value: -1,
              unit: "unlimited",
              expiry: null,
              sustained: false,
            },
      tokenIcon: {
        show: false,
      },
      unidentified: true,
      start: {
        value: 0,
        initiative: options.initiative
          ? game.combat?.getCombatantByToken(effectReceiverToken?.id)
              ?.initiative
          : null,
      },
      badge: null,
    },
    img: effectImg,
    flags: {
      [MODULE_ID]: {
        isEphemeralCover: true,
        observerActorSignature: effectSourceToken.actor.signature,
        observerTokenId: effectSourceToken.id,
        coverState: coverState,
      },
      core: {},
    },
  };

  // Add reflex and stealth bonuses for standard and greater cover
  if (coverState === "standard" || coverState === "greater") {
    ephemeralEffect.system.rules.push(
      {
        key: "FlatModifier",
        selector: "reflex",
        type: "circumstance",
        value: stateConfig.bonusReflex,
        predicate: ["area-effect"],
      },
      {
        key: "FlatModifier",
        predicate: ["action:hide", "action:sneak", "avoid-detection"],
        selector: "stealth",
        type: "circumstance",
        value: stateConfig.bonusStealth,
      }
    );
  }

  try {
    await effectReceiverToken.actor.createEmbeddedDocuments("Item", [
      ephemeralEffect,
    ]);
  } catch (error) {
    console.error("Failed to create ephemeral cover effect:", error);
  }
}

function getMaxCoverStateFromRules(rules) {
  // Determine max by highest AC value present in rules
  let maxVal = 0;
  for (const r of rules) {
    if (
      r?.key === "FlatModifier" &&
      r.selector === "ac" &&
      typeof r.value === "number"
    ) {
      if (r.value > maxVal) maxVal = r.value;
    }
  }
  // Map back to state by matching bonus
  const entries = Object.entries(COVER_STATES);
  let maxState = "none";
  for (const [state, cfg] of entries) {
    if (cfg.bonusAC === maxVal) {
      maxState = state;
      break;
    }
  }
  return maxState;
}

// upsertReflexStealthForMaxCoverOnThisAggregate now in cover/aggregates

// updateReflexStealthAcrossCoverAggregates imported

// moved: dedupeCoverAggregates is imported from ./cover/batch.js

// moved helpers to scripts/helpers/cover-helpers.js

// moved: updateAggregateCoverMetaForState is imported from ./cover/aggregates.js

async function addObserverToCoverAggregate(
  effectReceiverToken,
  observerToken,
  coverState,
  options = {}
) {
  const aggregate = await ensureAggregateCoverEffect(
    effectReceiverToken,
    coverState,
    options
  );
  const rules = Array.isArray(aggregate.system.rules)
    ? [...aggregate.system.rules]
    : [];
  const signature = observerToken.actor.signature;
  const tokenId = observerToken.id;
  const bonus = getCoverBonusByState(coverState);

  // Remove any existing AC rule for this observer
  const withoutObserverAC = rules.filter(
    (r) =>
      !(
        r?.key === "FlatModifier" &&
        r.selector === "ac" &&
        Array.isArray(r.predicate) &&
        r.predicate.includes(`origin:signature:${signature}`)
      )
  );
  // Ensure RollOption for cover-against is present
  const hasRollOption = withoutObserverAC.some(
    (r) =>
      r?.key === "RollOption" &&
      r.domain === "all" &&
      r.option === `cover-against:${tokenId}`
  );
  if (!hasRollOption) {
    withoutObserverAC.push({
      key: "RollOption",
      domain: "all",
      option: `cover-against:${tokenId}`,
    });
  }
  // Add AC modifier for this observer
  withoutObserverAC.push({
    key: "FlatModifier",
    selector: "ac",
    type: "circumstance",
    value: bonus,
    predicate: [`origin:signature:${signature}`],
  });

  await aggregate.update({ "system.rules": withoutObserverAC });
  // Ensure this observer is not present in other aggregates of different states
  const otherAggregates = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) =>
      e.flags?.[MODULE_ID]?.aggregateCover === true &&
      e.flags?.[MODULE_ID]?.coverState !== coverState
  );
  for (const other of otherAggregates) {
    const otherRules = Array.isArray(other.system.rules)
      ? other.system.rules.filter((r) => {
          if (
            r?.key === "FlatModifier" &&
            r.selector === "ac" &&
            Array.isArray(r.predicate) &&
            r.predicate.includes(`origin:signature:${signature}`)
          )
            return false;
          if (
            r?.key === "RollOption" &&
            r.domain === "all" &&
            r.option === `cover-against:${tokenId}`
          )
            return false;
          return true;
        })
      : [];
    await other.update({ "system.rules": otherRules });
  }
  // Refresh reflex/stealth distribution so only the highest-present state grants them
  await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
  // Make sure meta (name/img) reflects this aggregate's state
  await updateAggregateCoverMetaForState(aggregate, coverState);
  // Dedupe/cleanup any legacy or duplicate aggregates
  await dedupeCoverAggregates(effectReceiverToken);
}

// moved: removeObserverFromCoverAggregate now lives in cover/aggregates.js

// moved: pruneEmptyCoverAggregates is in cover/cleanup.js or batch logic

/**
 * Reconcile cover aggregates of a target token against current observer→target cover maps.
 * - Removes AC and RollOption rules whose observer no longer grants this state's cover
 * - Collapses duplicate AC rules for the same observer signature
 */
// moved: reconcileCoverAggregatesAgainstMaps imported from ./cover/batch.js
/**
 * Clean up all ephemeral cover effects from all actors
 */
export { cleanupAllCoverEffects } from "./cover/cleanup.js";

/**
 * Clean up ephemeral cover effects for a specific observer
 * @param {Token} targetToken - The token with cover
 * @param {Token} observerToken - The observing token
 */
async function cleanupCoverEffectsForObserverUnlocked(
  targetToken,
  observerToken
) {
  if (!targetToken?.actor || !observerToken?.actor) return;

  try {
    // Get all ephemeral cover effects for this observer
    const ephemeralEffects = targetToken.actor.itemTypes.effect.filter(
      (e) =>
        e.flags?.[MODULE_ID]?.isEphemeralCover &&
        (e.flags?.[MODULE_ID]?.observerActorSignature ===
          observerToken.actor.signature ||
          e.flags?.[MODULE_ID]?.observerTokenId === observerToken.id)
    );

    // Get all cover aggregates
    const allCoverAggregates = targetToken.actor.itemTypes.effect.filter(
      (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
    );

    // Prepare operation collections
    const effectsToDelete = [];
    const effectsToUpdate = [];
    const signature = observerToken.actor.signature;
    const tokenId = observerToken.id;

    // Process individual ephemeral effects
    if (ephemeralEffects.length > 0) {
      const effectIds = ephemeralEffects
        .map((e) => e.id)
        .filter((id) => !!targetToken.actor.items.get(id));

      effectsToDelete.push(...effectIds);
    }

    // Process aggregates to remove this observer
    for (const aggregate of allCoverAggregates) {
      const rules = Array.isArray(aggregate.system.rules)
        ? aggregate.system.rules.filter((r) => {
            // Remove AC rules for this observer
            if (
              r?.key === "FlatModifier" &&
              r.selector === "ac" &&
              Array.isArray(r.predicate) &&
              r.predicate.includes(`origin:signature:${signature}`)
            ) {
              return false;
            }
            // Remove roll options for this observer
            if (
              r?.key === "RollOption" &&
              r.domain === "all" &&
              r.option === `cover-against:${tokenId}`
            ) {
              return false;
            }
            return true;
          })
        : [];

      if (rules.length === 0) {
        // Mark for deletion if no rules left
        effectsToDelete.push(aggregate.id);
      } else {
        // Otherwise update with filtered rules
        effectsToUpdate.push({
          _id: aggregate.id,
          "system.rules": rules,
        });
      }
    }

    // Execute all operations in bulk
    if (effectsToDelete.length > 0) {
      await targetToken.actor.deleteEmbeddedDocuments("Item", effectsToDelete);
    }

    if (effectsToUpdate.length > 0) {
      await targetToken.actor.updateEmbeddedDocuments("Item", effectsToUpdate);
    }

    // Handle reflex and stealth bonuses after all operations
    await updateReflexStealthAcrossCoverAggregates(targetToken);
  } catch (error) {
    console.error(
      `[${MODULE_ID}] Error cleaning up cover effects for observer:`,
      error
    );
  }
}

// covered by export above; keep wrapper for API compatibility
export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
  await runWithCoverEffectLock(targetToken.actor, async () => {
    const { cleanupCoverEffectsForObserver } = await import("./cover/cleanup.js");
    await cleanupCoverEffectsForObserver(targetToken, observerToken);
  });
}

/**
 * Update ephemeral cover effects
 * @param {Token} targetToken - The token with cover
 * @param {Token} observerToken - The observer token
 * @param {string} coverState - The cover state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
/**
 * Clean up all cover effects related to a deleted token
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
export { cleanupDeletedTokenCoverEffects } from "./cover/cleanup.js";

export async function updateEphemeralCoverEffects(targetToken, observerToken, coverState, options = {}) {
  const { batchUpdateCoverEffects } = await import("./cover/batch.js");
  return batchUpdateCoverEffects(observerToken, [{ target: targetToken, state: coverState }], options);
}

/**
 * Batch update cover effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export { batchUpdateCoverEffects } from "./cover/batch.js";

/**
 * Public helper: force a reconcile/cleanup of a target token's cover aggregates
 * against current observer→target cover maps, removing any stale entries
 * (including those from ignored actor types like loot).
 */
export async function reconcileCoverEffectsForTarget(targetToken) {
  if (!targetToken?.actor) return;
  await runWithCoverEffectLock(targetToken.actor, async () => {
    try {
      await updateReflexStealthAcrossCoverAggregates(targetToken);
      await dedupeCoverAggregates(targetToken);
      await reconcileCoverAggregatesAgainstMaps(targetToken);
    } catch (e) {
      console.warn(`[${MODULE_ID}] reconcileCoverEffectsForTarget error`, e);
    }
  });
}
