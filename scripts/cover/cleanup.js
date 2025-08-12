/**
 * Cleanup utilities for cover ephemeral effects
 */

import { MODULE_ID } from "../constants.js";
import { updateReflexStealthAcrossCoverAggregates } from "./aggregates.js";

export async function cleanupAllCoverEffects() {
  try {
    const allActors = Array.from(game.actors || []);
    const batchSize = 10;
    for (let i = 0; i < allActors.length; i += batchSize) {
      const actorBatch = allActors.slice(i, i + batchSize);
      for (const actor of actorBatch) {
        if (!actor?.itemTypes?.effect) continue;
        const ephemeralEffects = actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.isEphemeralCover,
        );
        if (ephemeralEffects.length > 0) {
          const effectIds = ephemeralEffects.map((e) => e.id);
          const existingIds = effectIds.filter((id) => !!actor.items.get(id));
          if (existingIds.length > 0) {
            try {
              await actor.deleteEmbeddedDocuments("Item", existingIds);
            } catch (error) {
              console.error(`[${MODULE_ID}] Error bulk deleting cover effects:`, error);
              for (const id of existingIds) {
                if (actor.items.get(id)) {
                  try { await actor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Error cleaning up ephemeral cover effects:`, error);
  }
}

export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
  try {
    if (!observerToken) return;
    await (async () => {
      if (!targetToken?.actor || !observerToken?.actor) return;
      try {
        const ephemeralEffects = targetToken.actor.itemTypes.effect.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.isEphemeralCover &&
            (e.flags?.[MODULE_ID]?.observerActorSignature === observerToken.actor.signature ||
              e.flags?.[MODULE_ID]?.observerTokenId === observerToken.id),
        );
        const allCoverAggregates = targetToken.actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true,
        );
        const effectsToDelete = [];
        const effectsToUpdate = [];
        const signature = observerToken.actor.signature;
        const tokenId = observerToken.id;
        if (ephemeralEffects.length > 0) {
          const effectIds = ephemeralEffects.map((e) => e.id).filter((id) => !!targetToken.actor.items.get(id));
          effectsToDelete.push(...effectIds);
        }
        for (const aggregate of allCoverAggregates) {
          const rules = Array.isArray(aggregate.system.rules)
            ? aggregate.system.rules.filter((r) => {
                if (
                  r?.key === "FlatModifier" &&
                  r.selector === "ac" &&
                  Array.isArray(r.predicate) &&
                  r.predicate.includes(`origin:signature:${signature}`)
                ) {
                  return false;
                }
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
            effectsToDelete.push(aggregate.id);
          } else {
            effectsToUpdate.push({ _id: aggregate.id, "system.rules": rules });
          }
        }
        if (effectsToDelete.length > 0) {
          await targetToken.actor.deleteEmbeddedDocuments("Item", effectsToDelete);
        }
        if (effectsToUpdate.length > 0) {
          await targetToken.actor.updateEmbeddedDocuments("Item", effectsToUpdate);
        }
        await updateReflexStealthAcrossCoverAggregates(targetToken);
      } catch (error) {
        console.error(`[${MODULE_ID}] Error cleaning up cover effects for observer:`, error);
      }
    })();
  } catch (error) {
    console.error("Error cleaning up ephemeral cover effects for observer:", error);
  }
}

export async function cleanupDeletedTokenCoverEffects(tokenDoc) {
  if (!tokenDoc?.id || !tokenDoc?.actor?.id) return;
  try {
    const deletedToken = {
      id: tokenDoc.id,
      actor: {
        id: tokenDoc.actor.id,
        signature: tokenDoc.actor?.signature || tokenDoc.actor.id,
      },
    };
    const allTokens = canvas.tokens?.placeables || [];
    const batchSize = 10;
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);
      for (const token of batch) {
        if (!token?.actor) continue;
        let effectsToDelete = [];
        let effectsToUpdate = [];
        const signature = deletedToken.actor.signature;
        const tokenId = deletedToken.id;
        const effects = token.actor.itemTypes.effect || [];
        const observerEffects = effects.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true && e.flags?.[MODULE_ID]?.observerToken === tokenId,
        );
        if (observerEffects.length > 0) {
          effectsToDelete.push(...observerEffects.map((e) => e.id));
          continue;
        }
        const relevantEffects = effects.filter((e) => e.flags?.[MODULE_ID]?.aggregateCover === true);
        for (const effect of relevantEffects) {
          const rules = Array.isArray(effect.system?.rules) ? [...effect.system.rules] : [];
          const newRules = rules.filter((r) => {
            const ruleString = JSON.stringify(r);
            if (ruleString.includes(signature) || ruleString.includes(tokenId)) {
              return false;
            }
            return true;
          });
          if (newRules.length !== rules.length) {
            if (newRules.length === 0) {
              effectsToDelete.push(effect.id);
            } else {
              effectsToUpdate.push({ _id: effect.id, "system.rules": newRules });
            }
          }
        }
        const legacyEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.cover === true &&
            (e.flags?.[MODULE_ID]?.observerToken === tokenId || e.flags?.[MODULE_ID]?.targetToken === tokenId),
        );
        if (legacyEffects.length > 0) {
          effectsToDelete.push(...legacyEffects.map((e) => e.id));
        }
        try {
          if (effectsToDelete.length > 0) {
            await token.actor.deleteEmbeddedDocuments("Item", effectsToDelete);
          }
          if (effectsToUpdate.length > 0) {
            await token.actor.updateEmbeddedDocuments("Item", effectsToUpdate);
          }
          if (effectsToDelete.length > 0 || effectsToUpdate.length > 0) {
            await updateReflexStealthAcrossCoverAggregates(token);
          }
        } catch (error) {
          console.error(`${MODULE_ID}: Error updating cover effects for deleted token:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`${MODULE_ID}: Error cleaning up cover effects for deleted token:`, error);
  }
}


