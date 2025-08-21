/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { COVER_STATES, MODULE_ID } from "../constants.js";
import { updateReflexStealthAcrossCoverAggregates } from "./aggregates.js";
import { dedupeCoverAggregates, reconcileCoverAggregatesAgainstMaps } from "./batch.js";
import { runWithCoverEffectLock } from "./utils.js";

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
        // Only GMs can delete effects
        if (game.user.isGM) {
          await effectReceiverToken.actor.deleteEmbeddedDocuments("Item", [
            existingEffect.id,
          ]);
        }
      }
    } catch (_) {
      // Ignore if it was already removed
    }
  }

  const stateConfig = COVER_STATES[coverState];

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
    name: `Cover against ${effectSourceToken.name}`,
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
        show: options.forThisRoll ? true : false,
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
        ...(options.forThisRoll && { forThisRoll: true, ephemeralCoverRoll: true }),
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
    console.log("PF2E Visioner | Creating ephemeral effect:", {
      receiver: effectReceiverToken.name,
      source: effectSourceToken.name,
      coverState,
      options,
      effectName: ephemeralEffect.name
    });
    await effectReceiverToken.actor.createEmbeddedDocuments("Item", [
      ephemeralEffect,
    ]);
    console.log("PF2E Visioner | Ephemeral effect created successfully on", effectReceiverToken.name);
  } catch (error) {
    console.error("Failed to create ephemeral cover effect:", error);
  }
}


// upsertReflexStealthForMaxCoverOnThisAggregate now in cover/aggregates

// updateReflexStealthAcrossCoverAggregates imported

// moved: dedupeCoverAggregates is imported from ./cover/batch.js

// moved helpers to scripts/helpers/cover-helpers.js

// moved: updateAggregateCoverMetaForState is imported from ./cover/aggregates.js


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
export { cleanupAllCoverEffects } from "./cleanup.js";


// covered by export above; keep wrapper for API compatibility
export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
  await runWithCoverEffectLock(targetToken.actor, async () => {
    const { cleanupCoverEffectsForObserver } = await import("./cleanup.js");
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
export { cleanupDeletedTokenCoverEffects } from "./cleanup.js";

export async function updateEphemeralCoverEffects(targetToken, observerToken, coverState, options = {}) {
  const { batchUpdateCoverEffects } = await import("./batch.js");
  return batchUpdateCoverEffects(observerToken, [{ target: targetToken, state: coverState }], options);
}

/**
 * Batch update cover effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export { batchUpdateCoverEffects } from "./batch.js";

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
