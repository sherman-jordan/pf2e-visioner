/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { COVER_STATES, MODULE_ID } from "./constants.js";
import { getCoverMap } from "./utils.js";

// Debug helpers (guarded by module 'debug' setting)
function debugEnabled() {
  try {
    return Boolean(game?.settings?.get?.(MODULE_ID, "debug"));
  } catch (_) {
    return false;
  }
}
function coverDebug(...args) {
  if (debugEnabled()) console.debug(`[${MODULE_ID}][cover]`, ...args);
}

// Per-actor cover effect update lock to avoid concurrent update/delete races
const _coverEffectLocks = new WeakMap();
async function runWithCoverEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = _coverEffectLocks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (_) {
      return null;
    }
  });
  // Keep the chain even on rejection
  _coverEffectLocks.set(
    actor,
    next.catch(() => {})
  );
  return next;
}

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
          predicate: [`origin:signature:${effectSourceToken.actor.signature}`],
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

/**
 * Aggregated cover effect helpers
 */
async function ensureAggregateCoverEffect(
  effectReceiverToken,
  state,
  options = {}
) {
  const effects = effectReceiverToken.actor.itemTypes.effect;
  let aggregate = effects.find(
    (e) =>
      e.flags?.[MODULE_ID]?.aggregateCover === true &&
      e.flags?.[MODULE_ID]?.coverState === state
  );
  if (!aggregate) {
    const label = getCoverLabel(state);
    const img = getCoverImageForState(state);
    const base = {
      name: label,
      type: "effect",
      system: {
        description: {
          value: `<p>Aggregated ${label} vs multiple observers.</p>`,
          gm: "",
        },
        rules: [],
        slug: null,
        traits: { otherTags: [], value: [] },
        level: { value: 1 },
        duration:
          options.durationRounds >= 0
            ? {
                value: options.durationRounds,
                unit: "rounds",
                expiry: "turn-start",
                sustained: false,
              }
            : { value: -1, unit: "unlimited", expiry: null, sustained: false },
        tokenIcon: { show: false },
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
      img,
      flags: { [MODULE_ID]: { aggregateCover: true, coverState: state } },
    };
    const [created] = await effectReceiverToken.actor.createEmbeddedDocuments(
      "Item",
      [base]
    );
    aggregate = created;
  }
  return aggregate;
}

function getCoverBonusByState(state) {
  const cfg = COVER_STATES[state];
  return cfg ? cfg.bonusAC : 0;
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

async function upsertReflexStealthForMaxCoverOnThisAggregate(
  aggregate,
  maxState
) {
  const rules = Array.isArray(aggregate.system.rules)
    ? [...aggregate.system.rules]
    : [];
  // Remove existing reflex/stealth aggregate rules first
  const filtered = rules.filter(
    (r) =>
      !(
        r?.key === "FlatModifier" &&
        (r.selector === "reflex" || r.selector === "stealth")
      )
  );
  const cfg = COVER_STATES[maxState];
  if (cfg && (maxState === "standard" || maxState === "greater")) {
    filtered.push({
      key: "FlatModifier",
      selector: "reflex",
      type: "circumstance",
      value: cfg.bonusReflex,
      predicate: ["area-effect"],
    });
    filtered.push({
      key: "FlatModifier",
      selector: "stealth",
      type: "circumstance",
      value: cfg.bonusStealth,
      predicate: ["action:hide", "action:sneak", "avoid-detection"],
    });
  }
  await aggregate.update({ "system.rules": filtered });
}

async function updateReflexStealthAcrossCoverAggregates(effectReceiverToken) {
  const effects = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
  );
  if (effects.length === 0) return;
  // Determine highest state present across all aggregates by inspecting their AC rule values
  const order = { none: 0, lesser: 1, standard: 2, greater: 3 };
  let highestState = "none";
  for (const agg of effects) {
    const state = agg.flags?.[MODULE_ID]?.coverState;
    const rules = Array.isArray(agg.system.rules) ? agg.system.rules : [];
    const presentState = getMaxCoverStateFromRules(rules);
    if (order[presentState] > order[highestState]) highestState = presentState;
  }
  // Remove reflex/stealth from all, then add only to the highest-state aggregate
  for (const agg of effects) {
    const rules = Array.isArray(agg.system.rules) ? [...agg.system.rules] : [];
    const withoutRS = rules.filter(
      (r) =>
        !(
          r?.key === "FlatModifier" &&
          (r.selector === "reflex" || r.selector === "stealth")
        )
    );
    await agg.update({ "system.rules": withoutRS });
  }
  if (highestState !== "none") {
    const targetAgg = effects.find(
      (e) => e.flags?.[MODULE_ID]?.coverState === highestState
    );
    if (targetAgg)
      await upsertReflexStealthForMaxCoverOnThisAggregate(
        targetAgg,
        highestState
      );
  }
  // After redistributing, prune any aggregates that now have no AC rules left
  await pruneEmptyCoverAggregates(effectReceiverToken);
}

async function dedupeCoverAggregates(effectReceiverToken) {
  const effects = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
  );
  if (effects.length === 0) return;
  // Remove legacy single-aggregate effects without coverState flag
  const legacy = effects.filter((e) => !e.flags?.[MODULE_ID]?.coverState);
  if (legacy.length) {
    const ids = legacy
      .map((e) => e.id)
      .filter((id) => !!effectReceiverToken.actor.items.get(id));
    if (ids.length) {
      try {
        await effectReceiverToken.actor.deleteEmbeddedDocuments("Item", ids);
      } catch (_) {}
    }
  }
  // Group by coverState and merge duplicates
  const byState = new Map();
  for (const eff of effects.filter((e) => e.flags?.[MODULE_ID]?.coverState)) {
    const state = eff.flags[MODULE_ID].coverState;
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(eff);
  }
  for (const [state, group] of byState.entries()) {
    if (group.length <= 1) continue;
    // Choose deterministic primary to reduce race risk
    const primary = [...group].sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    )[0];
    const mergedRules = [];
    const seen = new Set();
    for (const g of group) {
      const rules = Array.isArray(g.system.rules) ? g.system.rules : [];
      for (const r of rules) {
        const sig = JSON.stringify(r);
        if (seen.has(sig)) continue;
        seen.add(sig);
        mergedRules.push(r);
      }
    }
    if (effectReceiverToken.actor.items.get(primary.id)) {
      try {
        await primary.update({ "system.rules": mergedRules });
      } catch (_) {}
    }
    const toDelete = group
      .filter((e) => e.id !== primary.id)
      .map((e) => e.id)
      .filter((id) => !!effectReceiverToken.actor.items.get(id));
    if (toDelete.length) {
      try {
        await effectReceiverToken.actor.deleteEmbeddedDocuments(
          "Item",
          toDelete
        );
      } catch (_) {}
    }
    await updateAggregateCoverMetaForState(primary, state);
  }
  await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
  await reconcileCoverAggregatesAgainstMaps(effectReceiverToken);
}

function getCoverLabel(state) {
  const entry = COVER_STATES[state];
  if (entry?.label) {
    try {
      return game.i18n.localize(entry.label);
    } catch (_) {}
  }
  return state ? state.charAt(0).toUpperCase() + state.slice(1) : "No";
}

function getCoverImageForState(state) {
  switch (state) {
    case "lesser":
      return "systems/pf2e/icons/equipment/shields/buckler.webp";
    case "greater":
      return "systems/pf2e/icons/equipment/shields/tower-shield.webp";
    case "standard":
    default:
      return "systems/pf2e/icons/equipment/shields/steel-shield.webp";
  }
}

function isIgnoredActorTypeForCover(actorType) {
  return (
    actorType === "loot" || actorType === "vehicle" || actorType === "party"
  );
}

const ORIGIN_SIG_PREFIX = "origin:signature:";
function predicateHasSignature(predicate, signature) {
  try {
    const needle = `${ORIGIN_SIG_PREFIX}${signature}`;
    if (!predicate) return false;
    if (Array.isArray(predicate)) return predicate.includes(needle);
    if (typeof predicate === "string") {
      if (predicate.includes(needle)) return true;
      if (predicate.trim().startsWith("[")) {
        try {
          const arr = JSON.parse(predicate);
          if (Array.isArray(arr)) return arr.includes(needle);
        } catch (_) {}
      }
      return false;
    }
    if (typeof predicate === "object") {
      for (const key of Object.keys(predicate)) {
        const val = predicate[key];
        if (Array.isArray(val) && val.includes(needle)) return true;
      }
    }
  } catch (_) {}
  return false;
}

function extractSignaturesFromPredicate(predicate) {
  const results = new Set();
  const pushFrom = (arr) => {
    for (const p of arr) {
      const s = String(p);
      if (s.startsWith(ORIGIN_SIG_PREFIX)) {
        results.add(s.slice(ORIGIN_SIG_PREFIX.length));
      }
    }
  };
  try {
    if (!predicate) return [];
    if (Array.isArray(predicate)) {
      pushFrom(predicate);
    } else if (typeof predicate === "string") {
      if (predicate.trim().startsWith("[")) {
        try {
          const arr = JSON.parse(predicate);
          if (Array.isArray(arr)) pushFrom(arr);
        } catch (_) {}
      } else if (predicate.startsWith(ORIGIN_SIG_PREFIX)) {
        results.add(predicate.slice(ORIGIN_SIG_PREFIX.length));
      }
    } else if (typeof predicate === "object") {
      for (const key of Object.keys(predicate)) {
        const val = predicate[key];
        if (Array.isArray(val)) pushFrom(val);
      }
    }
  } catch (_) {}
  return [...results];
}

async function updateAggregateCoverMetaForState(aggregate, state) {
  const label = getCoverLabel(state);
  const desiredName = label;
  const desiredImg = getCoverImageForState(state);
  const update = {};
  if (aggregate?.name !== desiredName) update.name = desiredName;
  if (aggregate?.img !== desiredImg) update.img = desiredImg;
  if (Object.keys(update).length) {
    try {
      await aggregate.update(update);
    } catch (_) {}
  }
}

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

async function removeObserverFromCoverAggregate(
  effectReceiverToken,
  observerToken
) {
  const effects = effectReceiverToken.actor.itemTypes.effect.filter(
    (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
  );
  if (effects.length === 0) return;
  const signature = observerToken.actor.signature;
  const tokenId = observerToken.id;
  for (const aggregate of effects) {
    const rules = Array.isArray(aggregate.system.rules)
      ? aggregate.system.rules.filter((r) => {
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
    if (rules.length === 0) {
      // Avoid immediate delete; rely on prune to remove empties
      try {
        await aggregate.update({ "system.rules": [] });
      } catch (_) {}
    } else {
      await aggregate.update({ "system.rules": rules });
    }
  }
  await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
  await dedupeCoverAggregates(effectReceiverToken);
}

async function pruneEmptyCoverAggregates(effectReceiverToken) {
  try {
    const candidates = effectReceiverToken.actor.itemTypes.effect.filter(
      (e) => {
        if (e.flags?.[MODULE_ID]?.aggregateCover !== true) return false;
        const rules = Array.isArray(e.system?.rules) ? e.system.rules : [];
        // Count AC rules only; RollOption/reflex/stealth don't keep aggregates alive
        const acRules = rules.filter(
          (r) => r?.key === "FlatModifier" && r.selector === "ac"
        );
        return acRules.length === 0;
      }
    );
    // Further guard: don't delete if any observer map still claims cover for this target with this state
    const targetId = effectReceiverToken.id || effectReceiverToken.document?.id;
    const observers = (canvas?.tokens?.placeables ?? []).filter(
      (t) => t?.document && t !== effectReceiverToken
    );
    const empties = candidates.filter((eff) => {
      const state = eff.flags?.[MODULE_ID]?.coverState;
      if (!state) return true; // legacy/no-state aggregates can be safely removed
      for (const obs of observers) {
        try {
          const covMap = obs.document.getFlag(MODULE_ID, "cover") || {};
          const s = covMap?.[targetId];
          if (s && s !== "none" && s === state) return false; // still needed per map
        } catch (_) {}
      }
      return true;
    });
    if (empties.length) {
      const ids = empties
        .map((e) => e.id)
        .filter((id) => !!effectReceiverToken.actor.items.get(id));
      if (ids.length)
        await effectReceiverToken.actor.deleteEmbeddedDocuments("Item", ids);
    }
  } catch (_) {}
}

/**
 * Reconcile cover aggregates of a target token against current observer→target cover maps.
 * - Removes AC and RollOption rules whose observer no longer grants this state's cover
 * - Collapses duplicate AC rules for the same observer signature
 */
async function reconcileCoverAggregatesAgainstMaps(effectReceiverToken) {
  try {
    if (!effectReceiverToken?.actor) return;
    const targetId = effectReceiverToken.id || effectReceiverToken.document?.id;
    const observers = (canvas?.tokens?.placeables ?? []).filter(
      (t) =>
        t &&
        t !== effectReceiverToken &&
        t.actor &&
        !isIgnoredActorTypeForCover(t.actor?.type)
    );
    const aggregates = effectReceiverToken.actor.itemTypes.effect.filter(
      (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
    );

    coverDebug("reconcile start", {
      target: effectReceiverToken.name,
      aggregates: aggregates.map((a) => ({
        id: a.id,
        name: a.name,
        state: a.flags?.[MODULE_ID]?.coverState,
        rules: a.system?.rules?.length ?? 0,
      })),
    });

    for (const agg of aggregates) {
      const state = agg.flags?.[MODULE_ID]?.coverState || "none";
      let rules = Array.isArray(agg.system.rules) ? [...agg.system.rules] : [];

      const seenAC = new Set();
      const seenRO = new Set();

      coverDebug("checking aggregate", {
        target: effectReceiverToken.name,
        aggregate: { id: agg.id, name: agg.name, state, rules: rules.length },
      });

      const filtered = rules.filter((r) => {
        // Normalize AC rules; drop dupes and stale observers
        if (r?.key === "FlatModifier" && r.selector === "ac") {
          const signatures = extractSignaturesFromPredicate(r.predicate);
          const signature = signatures[0] ?? null;
          const acKey = `ac:${signature}:${r.value}`;
          if (seenAC.has(acKey)) return false; // duplicate within single aggregate
          seenAC.add(acKey);

          // If we cannot resolve a signature, keep the rule (defensive)
          if (!signature) return true;

          // Keep only if at least one live observer with this signature still maps this target to this state
          const candidates = observers.filter(
            (o) => o.actor?.signature === signature
          );
          if (candidates.length === 0) return false;
          const stillValid = candidates.some(
            (o) => (getCoverMap(o)?.[targetId] || "none") === state
          );
          coverDebug("AC rule check", {
            target: effectReceiverToken.name,
            aggregateState: state,
            signature,
            acValue: r.value,
            candidates: candidates.map((c) => c.name),
            stillValid,
          });
          return stillValid;
        }

        // Normalize RollOption rules; drop dupes and stale observer-token ids
        if (
          r?.key === "RollOption" &&
          r.domain === "all" &&
          typeof r.option === "string" &&
          r.option.startsWith("cover-against:")
        ) {
          const tokenId = r.option.slice("cover-against:".length);
          if (!tokenId) return false;
          if (seenRO.has(tokenId)) return false; // duplicate within single aggregate
          seenRO.add(tokenId);

          const token = observers.find((o) => o.id === tokenId);
          if (!token) return false;
          const s = getCoverMap(token)?.[targetId] || "none";
          const keep = s === state;
          coverDebug("RO rule check", {
            target: effectReceiverToken.name,
            aggregateState: state,
            token: token.name,
            mapState: s,
            keep,
          });
          return keep;
        }

        return true;
      });

      if (filtered.length !== rules.length) {
        coverDebug("aggregate filtered", {
          target: effectReceiverToken.name,
          aggregate: { id: agg.id, name: agg.name, state },
          before: rules.length,
          after: filtered.length,
        });
        try {
          await agg.update({ "system.rules": filtered });
        } catch (_) {}
      }
    }

    await pruneEmptyCoverAggregates(effectReceiverToken);
    coverDebug("reconcile end", { target: effectReceiverToken.name });
  } catch (_) {}
}
/**
 * Clean up all ephemeral cover effects from all actors
 */
export async function cleanupAllCoverEffects() {
  try {
    // Process actors in batches to avoid overwhelming the system
    const allActors = Array.from(game.actors || []);
    const batchSize = 10;

    for (let i = 0; i < allActors.length; i += batchSize) {
      const actorBatch = allActors.slice(i, i + batchSize);

      // Process each actor in the batch
      for (const actor of actorBatch) {
        if (!actor?.itemTypes?.effect) continue;

        const ephemeralEffects = actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.isEphemeralCover
        );

        if (ephemeralEffects.length > 0) {
          const effectIds = ephemeralEffects.map((e) => e.id);
          // Guard against already-removed items
          const existingIds = effectIds.filter((id) => !!actor.items.get(id));

          if (existingIds.length > 0) {
            try {
              // Delete all effects in a single bulk operation
              await actor.deleteEmbeddedDocuments("Item", existingIds);
            } catch (error) {
              console.error(
                `[${MODULE_ID}] Error bulk deleting cover effects:`,
                error
              );

              // As a last resort, delete one-by-one to skip missing
              for (const id of existingIds) {
                if (actor.items.get(id)) {
                  try {
                    await actor.deleteEmbeddedDocuments("Item", [id]);
                  } catch (_) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(
      `[${MODULE_ID}] Error cleaning up ephemeral cover effects:`,
      error
    );
  }
}

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

export async function cleanupCoverEffectsForObserver(
  targetToken,
  observerToken
) {
  try {
    if (!observerToken) return;
    await runWithCoverEffectLock(targetToken.actor, async () => {
      await cleanupCoverEffectsForObserverUnlocked(targetToken, observerToken);
    });
  } catch (error) {
    console.error(
      "Error cleaning up ephemeral cover effects for observer:",
      error
    );
  }
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
export async function cleanupDeletedTokenCoverEffects(tokenDoc) {
  if (!tokenDoc?.id || !tokenDoc?.actor?.id) return;

  try {
    const deletedToken = {
      id: tokenDoc.id,
      actor: {
        id: tokenDoc.actor.id,
        // Use the PF2e actor signature if available; fall back to actor ID
        signature: tokenDoc.actor?.signature || tokenDoc.actor.id,
      },
    };

    // Clean up from all tokens on the canvas
    const allTokens = canvas.tokens?.placeables || [];

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < allTokens.length; i += batchSize) {
      const batch = allTokens.slice(i, i + batchSize);

      for (const token of batch) {
        if (!token?.actor) continue;

        // Collect effects to delete and effects to update
        let effectsToDelete = [];
        let effectsToUpdate = [];
        const signature = deletedToken.actor.signature;
        const tokenId = deletedToken.id;

        // Find any aggregate effects that might reference the deleted token
        const effects = token.actor.itemTypes.effect || [];

        // First, check for effects where this token is the observer
        const observerEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.aggregateCover === true &&
            e.flags?.[MODULE_ID]?.observerToken === tokenId
        );

        if (observerEffects.length > 0) {
          console.log(
            `[${MODULE_ID}] Found ${observerEffects.length} cover effects where deleted token is the observer`
          );
          effectsToDelete.push(...observerEffects.map((e) => e.id));
          continue; // Skip to the next token, as we're deleting these effects entirely
        }

        // Then check for effects that might have rules referencing the deleted token
        const relevantEffects = effects.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
        );

        console.log(
          `[${MODULE_ID}] Found ${relevantEffects.length} aggregate cover effects on token ${token.name}`
        );

        // For each relevant effect, remove any rules that reference the deleted token
        for (const effect of relevantEffects) {
          const rules = Array.isArray(effect.system?.rules)
            ? [...effect.system.rules]
            : [];

          // Filter out rules that reference the deleted token in any way
          console.log(
            `[${MODULE_ID}] Checking ${rules.length} rules in cover effect ${effect.name}`
          );

          const newRules = rules.filter((r) => {
            // Convert the entire rule to a string for comprehensive checking
            const ruleString = JSON.stringify(r);

            // Check if the rule contains any reference to the deleted token
            if (
              ruleString.includes(signature) ||
              ruleString.includes(tokenId)
            ) {
              console.log(
                `[${MODULE_ID}] Found reference to deleted token in cover rule:`,
                r
              );
              return false;
            }

            return true;
          });

          // If rules were removed, update the effect
          if (newRules.length !== rules.length) {
            console.log(
              `[${MODULE_ID}] Cover rules changed: ${rules.length} -> ${newRules.length}`
            );

            if (newRules.length === 0) {
              // If no rules left, add to delete list
              effectsToDelete.push(effect.id);
              console.log(
                `[${MODULE_ID}] Marking cover effect ${effect.name} for deletion`
              );
            } else {
              // Otherwise add to update list
              effectsToUpdate.push({
                _id: effect.id,
                "system.rules": newRules,
              });
              console.log(
                `[${MODULE_ID}] Marking cover effect ${effect.name} for update with ${newRules.length} rules`
              );
            }
          } else {
            console.log(
              `[${MODULE_ID}] No rules changed for cover effect ${effect.name}`
            );
          }
        }

        // Also check for legacy cover effects that might reference the deleted token
        const legacyEffects = effects.filter(
          (e) =>
            e.flags?.[MODULE_ID]?.cover === true &&
            (e.flags?.[MODULE_ID]?.observerToken === tokenId ||
              e.flags?.[MODULE_ID]?.targetToken === tokenId)
        );

        if (legacyEffects.length > 0) {
          console.log(
            `[${MODULE_ID}] Found ${legacyEffects.length} legacy cover effects referencing deleted token`
          );
          effectsToDelete.push(...legacyEffects.map((e) => e.id));
        }

        console.log(
          `[${MODULE_ID}] Final counts for cover effects: ${effectsToDelete.length} to delete, ${effectsToUpdate.length} to update`
        );

        // Perform bulk operations
        try {
          // Delete effects in bulk if any
          if (effectsToDelete.length > 0) {
            console.log(
              `[${MODULE_ID}] Deleting ${effectsToDelete.length} cover effects for token ${token.name}`
            );
            await token.actor.deleteEmbeddedDocuments("Item", effectsToDelete);
            console.log(
              `[${MODULE_ID}] Successfully deleted ${effectsToDelete.length} cover effects`
            );
          }

          // Update effects in bulk if any
          if (effectsToUpdate.length > 0) {
            console.log(
              `[${MODULE_ID}] Updating ${effectsToUpdate.length} cover effects for token ${token.name}`
            );
            console.log(`[${MODULE_ID}] Cover update data:`, effectsToUpdate);
            await token.actor.updateEmbeddedDocuments("Item", effectsToUpdate);
            console.log(
              `[${MODULE_ID}] Successfully updated ${effectsToUpdate.length} cover effects`
            );
          }

          // Update reflex and stealth bonuses if any changes were made
          if (effectsToDelete.length > 0 || effectsToUpdate.length > 0) {
            await updateReflexStealthAcrossCoverAggregates(token);
          }
        } catch (error) {
          console.error(
            `${MODULE_ID}: Error updating cover effects for deleted token:`,
            error
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `${MODULE_ID}: Error cleaning up cover effects for deleted token:`,
      error
    );
  }
}

export async function updateEphemeralCoverEffects(
  targetToken,
  observerToken,
  coverState,
  options = {}
) {
  if (!targetToken?.actor || !observerToken?.actor) {
    return;
  }
  // Skip non-creature targets entirely (e.g., loot)
  if (isIgnoredActorTypeForCover(targetToken.actor?.type)) {
    coverDebug("skip update for ignored actor type", {
      target: targetToken.name,
      type: targetToken.actor?.type,
    });
    return;
  }

  await runWithCoverEffectLock(targetToken.actor, async () => {
    try {
      const signature = observerToken.actor.signature;
      const tokenId = observerToken.id;
      const isRemove =
        options.removeAllEffects || !coverState || coverState === "none";

      // Get all existing cover aggregates
      const allCoverAggregates = targetToken.actor.itemTypes.effect.filter(
        (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
      );

      // Prepare operation collections
      const effectsToCreate = [];
      const effectsToUpdate = [];
      const effectsToDelete = [];

      if (isRemove) {
        // Process all aggregates to remove this observer
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
      } else {
        // Adding/updating cover for this observer

        // Find the aggregate for this cover state
        let targetAggregate = allCoverAggregates.find(
          (e) => e.flags?.[MODULE_ID]?.coverState === coverState
        );

        if (!targetAggregate) {
          // Need to create a new aggregate
          const label = getCoverLabel(coverState);
          const img = getCoverImageForState(coverState);

          // Create new aggregate data
          effectsToCreate.push({
            name: label,
            type: "effect",
            system: {
              description: {
                value: `<p>Aggregated ${label} vs multiple observers.</p>`,
                gm: "",
              },
              rules: [
                // Add roll option
                {
                  key: "RollOption",
                  domain: "all",
                  option: `cover-against:${tokenId}`,
                },
                // Add AC modifier
                {
                  key: "FlatModifier",
                  selector: "ac",
                  type: "circumstance",
                  value: getCoverBonusByState(coverState),
                  predicate: [`origin:signature:${signature}`],
                },
              ],
              slug: null,
              traits: { otherTags: [], value: [] },
              level: { value: 1 },
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
              tokenIcon: { show: false },
              unidentified: true,
              start: {
                value: 0,
                initiative: options.initiative
                  ? game.combat?.getCombatantByToken(targetToken?.id)
                      ?.initiative
                  : null,
              },
              badge: null,
            },
            img,
            flags: { [MODULE_ID]: { aggregateCover: true, coverState } },
          });
        } else {
          // Update existing aggregate
          const rules = Array.isArray(targetAggregate.system.rules)
            ? [...targetAggregate.system.rules]
            : [];

          // Remove any existing rules for this observer
          const filteredRules = rules.filter((r) => {
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
          });

          // Check if rules already exist before adding to prevent duplicates
          const hasRollOption = filteredRules.some(
            (r) =>
              r?.key === "RollOption" &&
              r.domain === "all" &&
              r.option === `cover-against:${tokenId}`
          );
          const hasACModifier = filteredRules.some(
            (r) =>
              r?.key === "FlatModifier" &&
              r.selector === "ac" &&
              Array.isArray(r.predicate) &&
              r.predicate.includes(`origin:signature:${signature}`)
          );

          // Add new rules for this observer only if they don't exist
          if (!hasRollOption) {
            filteredRules.push({
              key: "RollOption",
              domain: "all",
              option: `cover-against:${tokenId}`,
            });
          }
          if (!hasACModifier) {
            filteredRules.push({
              key: "FlatModifier",
              selector: "ac",
              type: "circumstance",
              value: getCoverBonusByState(coverState),
              predicate: [`origin:signature:${signature}`],
            });
          }

          // Update the aggregate
          effectsToUpdate.push({
            _id: targetAggregate.id,
            "system.rules": filteredRules,
          });
        }

        // Remove this observer from other cover state aggregates
        for (const aggregate of allCoverAggregates) {
          if (aggregate.flags?.[MODULE_ID]?.coverState === coverState) continue;

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
            effectsToUpdate.push({
              _id: aggregate.id,
              "system.rules": rules,
            });
          }
        }
      }

      // Execute all operations in bulk
      if (effectsToDelete.length > 0) {
        await targetToken.actor.deleteEmbeddedDocuments(
          "Item",
          effectsToDelete
        );
      }

      if (effectsToUpdate.length > 0) {
        await targetToken.actor.updateEmbeddedDocuments(
          "Item",
          effectsToUpdate
        );
      }

      if (effectsToCreate.length > 0) {
        await targetToken.actor.createEmbeddedDocuments(
          "Item",
          effectsToCreate
        );
      }

      // Handle reflex/stealth and dedupe after operations
      if (!isRemove) {
        await updateReflexStealthAcrossCoverAggregates(targetToken);
        await dedupeCoverAggregates(targetToken);
        await reconcileCoverAggregatesAgainstMaps(targetToken);
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Error updating cover effects:`, error);
    }
  });
}

/**
 * Batch update cover effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export async function batchUpdateCoverEffects(
  observerToken,
  targetUpdates,
  options = {}
) {
  if (!observerToken?.actor || !targetUpdates?.length) return;

  // Group targets by their actor to minimize updates
  const updatesByTarget = new Map();

  for (const update of targetUpdates) {
    if (!update.target?.actor) continue;

    const targetId = update.target.actor.id;

    if (!updatesByTarget.has(targetId)) {
      updatesByTarget.set(targetId, {
        target: update.target,
        states: new Map(),
      });
    }

    // Group by cover state
    const targetData = updatesByTarget.get(targetId);
    const state = update.state || "none";

    if (!targetData.states.has(state)) {
      targetData.states.set(state, []);
    }

    targetData.states.get(state).push(observerToken);
  }

  // Process each target's batch
  for (const [targetId, data] of updatesByTarget.entries()) {
    const { target, states } = data;
    if (isIgnoredActorTypeForCover(target.actor?.type)) {
      coverDebug("skip batch for ignored actor type", {
        target: target.name,
        type: target.actor?.type,
      });
      continue;
    }

    await runWithCoverEffectLock(target.actor, async () => {
      try {
        coverDebug("batchUpdate begin", {
          target: target.name,
          states: Array.from(states.entries()).map(([k, v]) => ({
            state: k,
            observers: v.map((o) => o.name),
          })),
        });
        // Get all existing cover aggregates
        const allCoverAggregates = target.actor.itemTypes.effect.filter(
          (e) => e.flags?.[MODULE_ID]?.aggregateCover === true
        );

        // Create a map of cover state to aggregate
        const aggregatesByState = new Map();
        for (const agg of allCoverAggregates) {
          const state = agg.flags?.[MODULE_ID]?.coverState;
          if (state) {
            aggregatesByState.set(state, agg);
          }
        }

        // Track changes for each aggregate
        const rulesByState = new Map();
        for (const agg of allCoverAggregates) {
          const state = agg.flags?.[MODULE_ID]?.coverState;
          if (state) {
            rulesByState.set(
              state,
              Array.isArray(agg.system.rules) ? [...agg.system.rules] : []
            );
          }
        }

        const effectsToCreate = [];
        const effectsToUpdate = [];
        const effectsToDelete = [];

        // Process all updates by state
        for (const [coverState, observers] of states.entries()) {
          const isRemove = coverState === "none";

          if (isRemove) {
            // Remove these observers from all aggregates
            for (const [state, rules] of rulesByState.entries()) {
              const aggregate = aggregatesByState.get(state);
              if (!aggregate) continue;

              let modified = false;
              const filteredRules = [...rules];

              for (const observer of observers) {
                const signature = observer.actor.signature;
                const tokenId = observer.id;

                // Filter out rules for this observer
                const newRules = filteredRules.filter((r) => {
                  if (
                    r?.key === "FlatModifier" &&
                    r.selector === "ac" &&
                    Array.isArray(r.predicate) &&
                    r.predicate.includes(`origin:signature:${signature}`)
                  ) {
                    modified = true;
                    return false;
                  }
                  if (
                    r?.key === "RollOption" &&
                    r.domain === "all" &&
                    r.option === `cover-against:${tokenId}`
                  ) {
                    modified = true;
                    return false;
                  }
                  return true;
                });

                if (modified) {
                  filteredRules.splice(0, filteredRules.length, ...newRules);
                }
              }

              if (modified) {
                if (filteredRules.length === 0) {
                  effectsToDelete.push(aggregate.id);
                } else {
                  effectsToUpdate.push({
                    _id: aggregate.id,
                    "system.rules": filteredRules,
                  });
                }
              }
            }
          } else {
            // Add or update this cover state for these observers
            let targetAggregate = aggregatesByState.get(coverState);
            let rules = rulesByState.get(coverState) || [];
            let modified = false;

            for (const observer of observers) {
              const signature = observer.actor.signature;
              const tokenId = observer.id;

              // Remove any existing rules for this observer
              const filteredRules = rules.filter((r) => {
                if (
                  r?.key === "FlatModifier" &&
                  r.selector === "ac" &&
                  Array.isArray(r.predicate) &&
                  r.predicate.includes(`origin:signature:${signature}`)
                ) {
                  modified = true;
                  return false;
                }
                if (
                  r?.key === "RollOption" &&
                  r.domain === "all" &&
                  r.option === `cover-against:${tokenId}`
                ) {
                  modified = true;
                  return false;
                }
                return true;
              });

              // Add new rules for this observer
              filteredRules.push({
                key: "RollOption",
                domain: "all",
                option: `cover-against:${tokenId}`,
              });
              filteredRules.push({
                key: "FlatModifier",
                selector: "ac",
                type: "circumstance",
                value: getCoverBonusByState(coverState),
                predicate: [`origin:signature:${signature}`],
              });

              rules = filteredRules;
              modified = true;
            }

            if (modified) {
              if (targetAggregate) {
                // Update existing aggregate
                effectsToUpdate.push({
                  _id: targetAggregate.id,
                  "system.rules": rules,
                });
              } else {
                // Create new aggregate
                const label = getCoverLabel(coverState);
                const img = getCoverImageForState(coverState);

                effectsToCreate.push({
                  name: label,
                  type: "effect",
                  system: {
                    description: {
                      value: `<p>Aggregated ${label} vs multiple observers.</p>`,
                      gm: "",
                    },
                    rules: rules,
                    slug: null,
                    traits: { otherTags: [], value: [] },
                    level: { value: 1 },
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
                    tokenIcon: { show: false },
                    unidentified: true,
                    start: {
                      value: 0,
                      initiative: options.initiative
                        ? game.combat?.getCombatantByToken(target?.id)
                            ?.initiative
                        : null,
                    },
                    badge: null,
                  },
                  img,
                  flags: { [MODULE_ID]: { aggregateCover: true, coverState } },
                });
              }

              // Remove these observers from other cover state aggregates
              for (const [state, stateRules] of rulesByState.entries()) {
                if (state === coverState) continue;

                const aggregate = aggregatesByState.get(state);
                if (!aggregate) continue;

                let stateModified = false;
                let filteredRules = [...stateRules];

                for (const observer of observers) {
                  const signature = observer.actor.signature;
                  const tokenId = observer.id;

                  const newRules = filteredRules.filter((r) => {
                    if (
                      r?.key === "FlatModifier" &&
                      r.selector === "ac" &&
                      Array.isArray(r.predicate) &&
                      r.predicate.includes(`origin:signature:${signature}`)
                    ) {
                      stateModified = true;
                      return false;
                    }
                    if (
                      r?.key === "RollOption" &&
                      r.domain === "all" &&
                      r.option === `cover-against:${tokenId}`
                    ) {
                      stateModified = true;
                      return false;
                    }
                    return true;
                  });

                  if (stateModified) {
                    filteredRules = newRules;
                  }
                }

                if (stateModified) {
                  if (filteredRules.length === 0) {
                    effectsToDelete.push(aggregate.id);
                  } else {
                    effectsToUpdate.push({
                      _id: aggregate.id,
                      "system.rules": filteredRules,
                    });
                  }
                }
              }
            }
          }
        }

        // Execute all operations in bulk
        if (effectsToDelete.length > 0) {
          await target.actor.deleteEmbeddedDocuments("Item", effectsToDelete);
        }

        if (effectsToUpdate.length > 0) {
          await target.actor.updateEmbeddedDocuments("Item", effectsToUpdate);
        }

        if (effectsToCreate.length > 0) {
          await target.actor.createEmbeddedDocuments("Item", effectsToCreate);
        }

        // Handle reflex/stealth redistribution and prune empties after any change
        if (
          effectsToCreate.length > 0 ||
          effectsToUpdate.length > 0 ||
          effectsToDelete.length > 0
        ) {
          coverDebug("batchUpdate ops", {
            target: target.name,
            deletes: effectsToDelete.length,
            updates: effectsToUpdate.length,
            creates: effectsToCreate.length,
          });
          await updateReflexStealthAcrossCoverAggregates(target);
          await dedupeCoverAggregates(target);
          await reconcileCoverAggregatesAgainstMaps(target);
        }
      } catch (error) {
        console.error(`[${MODULE_ID}] Error in batch update cover:`, error);
      }
    });
  }
}

/**
 * Public helper: force a reconcile/cleanup of a target token's cover aggregates
 * against current observer→target cover maps, removing any stale entries
 * (including those from ignored actor types like loot).
 */
export async function reconcileCoverEffectsForTarget(targetToken) {
  if (!targetToken?.actor) return;
  await runWithCoverEffectLock(targetToken.actor, async () => {
    try {
      coverDebug("manual reconcile start", { target: targetToken.name });
      await updateReflexStealthAcrossCoverAggregates(targetToken);
      await dedupeCoverAggregates(targetToken);
      await reconcileCoverAggregatesAgainstMaps(targetToken);
      coverDebug("manual reconcile end", { target: targetToken.name });
    } catch (e) {
      console.warn(`[${MODULE_ID}] reconcileCoverEffectsForTarget error`, e);
    }
  });
}
