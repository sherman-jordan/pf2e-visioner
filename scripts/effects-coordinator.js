/**
 * Effects Coordinator
 * Rebuilds ephemeral effects (off-guard and cover) from stored per-token maps
 * and provides a compatibility wrapper for updating visuals.
 */

import { getCoverMap, getVisibilityMap } from "./utils.js";
import { updateTokenVisuals as baseUpdateTokenVisuals } from "./visual-effects.js";

/**
 * Class-based coordinator to centralize effect rebuilds/updates and actor locks.
 */
class EffectsCoordinator {
  constructor() {
    this._actorLocks = new WeakMap();
  }

  async runWithActorLock(actor, taskFn) {
    if (!actor) return taskFn();
    const prev = this._actorLocks.get(actor) || Promise.resolve();
    const next = prev
      .then(async () => {
        try {
          return await taskFn();
        } catch (_) {
          return null;
        }
      })
      .catch(() => null);
    this._actorLocks.set(actor, next.catch(() => {}));
    return next;
  }

  async updateTokenVisuals() {
    await baseUpdateTokenVisuals();
  }

  async rebuildAllEphemeralEffects() {
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

      // 2) Rebuild visibility aggregates (hidden/undetected) using batch updates
      const { batchUpdateVisibilityEffects } = await import(
        "./off-guard-ephemeral.js"
      );
      for (const observer of tokens) {
        if (!observer?.actor) continue;
        try {
          const t = observer.actor?.type;
          if (t === "loot" || t === "vehicle" || t === "party") continue;
        } catch (_) {}
        const visMap = getVisibilityMap(observer) || {};
        const updates = [];
        for (const target of tokens) {
          if (!target?.actor || target === observer) continue;
          try {
            const tt = target.actor?.type;
            if (tt === "loot" || tt === "vehicle" || tt === "party")
              continue;
          } catch (_) {}
          const state = visMap[target.document.id] || "observed";
          updates.push({ target, state });
        }
        if (updates.length) {
          await batchUpdateVisibilityEffects(observer, updates, {
            direction: "observer_to_target",
            effectTarget: "subject",
          });
        }
      }

      await baseUpdateTokenVisuals();
    } catch (error) {
      console.error(
        "PF2E Visioner: Failed to rebuild ephemeral effects (bulk)",
        error
      );
    }
  }

  async reconcileVisibilityAggregatesForTargets(targets) {
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
          await this.runWithActorLock(actor, async () => {
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
      console.warn(
        "Visioner: reconcileVisibilityAggregatesForTargets error",
        e
      );
    }
  }
}

// Singleton instance
const effectsCoordinator = new EffectsCoordinator();

// Maintain backwards-compatible helpers
async function runWithActorLock(actor, taskFn) {
  return effectsCoordinator.runWithActorLock(actor, taskFn);
}

/**
 * Compatibility export: delegate to the visuals module
 */
export async function updateTokenVisuals() {
  await effectsCoordinator.updateTokenVisuals();
}

/**
 * Rebuild all ephemeral effects from current maps for all observer→target pairs
 * Only the GM should run this since it creates/removes items on actors
 */
export async function rebuildAllEphemeralEffects() {
  await effectsCoordinator.rebuildAllEphemeralEffects();
}

/**
 * Reconcile only visibility aggregates (hidden/undetected) for a list of target tokens
 * Ensures no leftover aggregate effects remain when predicates are empty
 * @param {Token[]} targets
 */
// Removed unused: reconcileVisibilityAggregatesForTargets
export async function reconcileVisibilityAggregatesForTargets(targets) {
  await effectsCoordinator.reconcileVisibilityAggregatesForTargets(targets);
}

// (Deprecated coordinator functions removed; compatibility wrapper provided above.)
