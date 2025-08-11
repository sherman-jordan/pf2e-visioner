/**
 * Effects Coordinator
 * Rebuilds ephemeral effects (off-guard and cover) from stored per-token maps
 * and provides a compatibility wrapper for updating visuals.
 */

import { getCoverMap, getVisibilityMap } from "./utils.js";
import { updateTokenVisuals as baseUpdateTokenVisuals } from "./visual-effects.js";

// Serialize per-actor batch updates to avoid racing deletes/updates
const _actorLocks = new WeakMap();
async function runWithActorLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = _actorLocks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (_) {
      return null;
    }
  });
  _actorLocks.set(
    actor,
    next.catch(() => {})
  );
  return next;
}

/**
 * Compatibility export: delegate to the visuals module
 */
export async function updateTokenVisuals() {
  await baseUpdateTokenVisuals();
}

/**
 * Rebuild all ephemeral effects from current maps for all observer→target pairs
 * Only the GM should run this since it creates/removes items on actors
 */
export async function rebuildAllEphemeralEffects() {
  // Bulk rebuild using the same cover paths as token manager/auto-cover
  if (!game?.user?.isGM) return;
  if (!canvas?.tokens) return;

  try {
    const tokens = canvas.tokens.placeables;

    // 1) Rebuild cover using batch per-observer updates so we also clean up
    // observers that no longer have entries (state 'none').
    const { batchUpdateCoverEffects } = await import("./cover-ephemeral.js");

    for (const observer of tokens) {
      try {
        const t = observer.actor?.type;
        if (t === "loot" || t === "vehicle" || t === "party") continue;
      } catch (_) {}
      if (!observer?.actor) continue;
      const coverMap = getCoverMap(observer) || {};

      // Build updates for all potential targets so missing entries become 'none'
      const updates = [];
      for (const target of tokens) {
        if (!target?.actor || target === observer) continue;
        // Skip non-creatures (loot/vehicle/party) to match prior behavior
        const tType = target.actor?.type;
        if (tType === "loot" || tType === "vehicle" || tType === "party")
          continue;
        const state = coverMap[target.document.id] || "none";
        updates.push({ target, state });
      }
      if (updates.length) {
        await batchUpdateCoverEffects(observer, updates, {});
      }
    }

    // 2) Rebuild visibility aggregates (hidden/undetected) as before
    const idToToken = new Map(tokens.map((t) => [t.document.id, t]));
    const observerEntries = tokens.map((o) => ({
      token: o,
      vis: getVisibilityMap(o) || {},
      signature: o.actor?.signature,
    }));

    for (const [targetId] of new Map(
      observerEntries.flatMap(({ vis }) => Object.keys(vis)).map((id) => [id])
    ).entries()) {
      const target = idToToken.get(targetId);
      if (!target?.actor) continue;
      try {
        const t = target.actor?.type;
        if (t === "loot" || t === "vehicle" || t === "party") continue;
      } catch (_) {}
      const targetType = target.actor?.type;
      const skip =
        targetType === "loot" ||
        targetType === "vehicle" ||
        targetType === "party";
      if (skip) continue;

      const hidden = new Set();
      const undetected = new Set();
      for (const { token: observer, vis, signature } of observerEntries) {
        if (!signature) continue;
        const state = vis?.[targetId];
        if (state === "hidden") hidden.add(signature);
        else if (state === "undetected") undetected.add(signature);
      }

      const actor = target.actor;
      const existing = actor.itemTypes?.effect || [];
      const toCreate = [];
      const toUpdate = [];
      const toDelete = [];

      for (const state of ["hidden", "undetected"]) {
        const signatures = Array.from(state === "hidden" ? hidden : undetected);
        const eff = existing.find(
          (e) =>
            e.flags?.["pf2e-visioner"]?.aggregateOffGuard === true &&
            e.flags?.["pf2e-visioner"]?.visibilityState === state &&
            e.flags?.["pf2e-visioner"]?.effectTarget === "subject"
        );
        if (signatures.length === 0) {
          if (eff) toDelete.push(eff.id);
          continue;
        }
        const rules = signatures.map((sig) => ({
          key: "EphemeralEffect",
          predicate: [`target:signature:${sig}`],
          selectors: [
            "strike-attack-roll",
            "spell-attack-roll",
            "strike-damage",
            "attack-spell-damage",
          ],
          uuid: "Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg",
        }));
        if (eff) toUpdate.push({ _id: eff.id, "system.rules": rules });
        else {
          toCreate.push({
            name:
              game.i18n.localize(`PF2E.condition.${state}.name`) ||
              state.charAt(0).toUpperCase() + state.slice(1),
            type: "effect",
            system: {
              description: {
                value: `<p>Aggregated off-guard for ${state} vs multiple observers.</p>`,
                gm: "",
              },
              rules,
              slug: null,
              traits: { otherTags: [], value: [] },
              level: { value: 1 },
              duration: {
                value: -1,
                unit: "unlimited",
                expiry: null,
                sustained: false,
              },
              tokenIcon: { show: false },
              unidentified: true,
            },
            img: `systems/pf2e/icons/conditions/${state}.webp`,
            flags: {
              "pf2e-visioner": {
                aggregateOffGuard: true,
                visibilityState: state,
                effectTarget: "subject",
              },
            },
          });
        }
      }

      await runWithActorLock(actor, async () => {
        try {
          if (toCreate.length)
            await actor.createEmbeddedDocuments("Item", toCreate);
          const safeUpdates = toUpdate.filter(
            (u) => !!u?._id && !!actor?.items?.get?.(u._id)
          );
          if (safeUpdates.length)
            await actor.updateEmbeddedDocuments("Item", safeUpdates);
          const safeDeletes = toDelete.filter(
            (id) => !!id && !!actor?.items?.get?.(id)
          );
          if (safeDeletes.length)
            await actor.deleteEmbeddedDocuments("Item", safeDeletes);
        } catch (e) {
          console.warn(
            "Visioner bulk visibility rebuild (actor) encountered errors",
            e
          );
        }
      });
    }

    await baseUpdateTokenVisuals();
  } catch (error) {
    console.error(
      "PF2E Visioner: Failed to rebuild ephemeral effects (bulk)",
      error
    );
  }
}

/**
 * Reconcile only visibility aggregates (hidden/undetected) for a list of target tokens
 * Ensures no leftover aggregate effects remain when predicates are empty
 * @param {Token[]} targets
 */
// Removed unused: reconcileVisibilityAggregatesForTargets
export async function reconcileVisibilityAggregatesForTargets(targets) {
  try {
    if (!Array.isArray(targets) || targets.length === 0) return;
    const tokens = canvas?.tokens?.placeables || [];
    const observerEntries = tokens.map((o) => ({
      token: o,
      vis: getVisibilityMap(o) || {},
      signature: o.actor?.signature,
    }));
    for (const target of targets) {
      if (!target?.actor) continue;
      const tId = target.id || target.document?.id;
      // Collect sets
      const hidden = new Set();
      const undetected = new Set();
      for (const { token: observer, vis, signature } of observerEntries) {
        if (!signature) continue;
        const state = vis?.[tId];
        if (state === "hidden") hidden.add(signature);
        else if (state === "undetected") undetected.add(signature);
      }
      // Apply to target's aggregates
      const actor = target.actor;
      const effects = actor.itemTypes?.effect || [];
      for (const state of ["hidden", "undetected"]) {
        const signatures = Array.from(state === "hidden" ? hidden : undetected);
        const eff = effects.find(
          (e) =>
            e.flags?.["pf2e-visioner"]?.aggregateOffGuard === true &&
            e.flags?.["pf2e-visioner"]?.visibilityState === state &&
            e.flags?.["pf2e-visioner"]?.effectTarget === "subject"
        );
        await runWithActorLock(actor, async () => {
          if (signatures.length === 0) {
            if (eff && actor.items.get(eff.id)) {
              try {
                await actor.deleteEmbeddedDocuments("Item", [eff.id]);
              } catch (_) {}
            }
            return;
          }
          const rules = signatures.map((sig) => ({
            key: "EphemeralEffect",
            predicate: [`target:signature:${sig}`],
            selectors: [
              "strike-attack-roll",
              "spell-attack-roll",
              "strike-damage",
              "attack-spell-damage",
            ],
            uuid: "Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg",
          }));
          if (eff) {
            try {
              if (actor.items.get(eff.id)) {
                await actor.updateEmbeddedDocuments("Item", [
                  { _id: eff.id, "system.rules": rules },
                ]);
              }
            } catch (_) {}
          } else {
            try {
              const name =
                game.i18n.localize(`PF2E.condition.${state}.name`) ||
                state.charAt(0).toUpperCase() + state.slice(1);
              await actor.createEmbeddedDocuments("Item", [
                {
                  name,
                  type: "effect",
                  system: {
                    description: {
                      value: `<p>Aggregated off-guard for ${state} vs multiple observers.</p>`,
                      gm: "",
                    },
                    rules,
                    slug: null,
                    traits: { otherTags: [], value: [] },
                    level: { value: 1 },
                    duration: {
                      value: -1,
                      unit: "unlimited",
                      expiry: null,
                      sustained: false,
                    },
                    tokenIcon: { show: false },
                    unidentified: true,
                  },
                  img: `systems/pf2e/icons/conditions/${state}.webp`,
                  flags: {
                    "pf2e-visioner": {
                      aggregateOffGuard: true,
                      visibilityState: state,
                      effectTarget: "subject",
                    },
                  },
                },
              ]);
            } catch (_) {}
          }
        });
      }
    }
  } catch (e) {
    console.warn("Visioner: reconcileVisibilityAggregatesForTargets error", e);
  }
}

// (Deprecated coordinator functions removed; compatibility wrapper provided above.)
