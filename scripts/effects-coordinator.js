/**
 * Effects Coordinator
 * Rebuilds ephemeral effects (off-guard and cover) from stored per-token maps
 * and provides a compatibility wrapper for updating visuals.
 */

import { getCoverMap, getVisibilityMap } from './utils.js';
import { updateTokenVisuals as baseUpdateTokenVisuals } from './visual-effects.js';

// Serialize per-actor batch updates to avoid racing deletes/updates
const _actorLocks = new WeakMap();
async function runWithActorLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = _actorLocks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try { return await taskFn(); } catch (_) { return null; }
  });
  _actorLocks.set(actor, next.catch(() => {}));
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
  // Bulk, aggregate-based rebuild for startup performance
  if (!game?.user?.isGM) return;
  if (!canvas?.tokens) return;

  try {
    const tokens = canvas.tokens.placeables;
    const idToToken = new Map(tokens.map(t => [t.document.id, t]));

    // Precompute observers' maps and signatures
    const observerEntries = tokens.map(o => ({ token: o, vis: getVisibilityMap(o) || {}, cov: getCoverMap(o) || {}, signature: o.actor?.signature }));

    // For each target, collect visibility signatures and cover states per observer
    const perTarget = new Map(); // targetId -> { hidden:Set<string>, undetected:Set<string>, coverByObserver: Map<observerId, state> }
    for (const { token: observer, vis, cov } of observerEntries) {
      const observerId = observer.id;
      const signature = observer.actor?.signature;
      for (const [targetId, state] of Object.entries(vis)) {
        if (!perTarget.has(targetId)) perTarget.set(targetId, { hidden: new Set(), undetected: new Set(), coverByObserver: new Map() });
        if (!signature) continue; // Skip observers with no signature to avoid corrupt rules
        if (state === 'hidden') perTarget.get(targetId).hidden.add(signature);
        else if (state === 'undetected') perTarget.get(targetId).undetected.add(signature);
      }
      for (const [targetId, covState] of Object.entries(cov)) {
        if (!perTarget.has(targetId)) perTarget.set(targetId, { hidden: new Set(), undetected: new Set(), coverByObserver: new Map() });
        if (covState && covState !== 'none') perTarget.get(targetId).coverByObserver.set(observerId, covState);
      }
    }

    // Prepare per-actor bulk operations
    for (const [targetId, agg] of perTarget.entries()) {
      const target = idToToken.get(targetId);
      if (!target?.actor) continue;
      const actor = target.actor;
      const existing = actor.itemTypes?.effect || [];
      const toCreate = [];
      const toUpdate = [];
      const toDelete = [];

      // Visibility aggregates (hidden/undetected)
      for (const state of ['hidden', 'undetected']) {
        const signatures = Array.from(agg[state]);
        const eff = existing.find(e => e.flags?.['pf2e-visioner']?.aggregateOffGuard === true && e.flags?.['pf2e-visioner']?.visibilityState === state && e.flags?.['pf2e-visioner']?.effectTarget === 'subject');
        if (signatures.length === 0) {
          if (eff) toDelete.push(eff.id);
          continue;
        }
        const rules = signatures.map(sig => ({ key: 'EphemeralEffect', predicate: [`target:signature:${sig}`], selectors: ['strike-attack-roll', 'spell-attack-roll', 'strike-damage', 'attack-spell-damage'], uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg' }));
        if (eff) toUpdate.push({ _id: eff.id, 'system.rules': rules });
        else {
          toCreate.push({
            name: game.i18n.localize(`PF2E.condition.${state}.name`) || (state.charAt(0).toUpperCase() + state.slice(1)),
            type: 'effect',
            system: { description: { value: `<p>Aggregated off-guard for ${state} vs multiple observers.</p>`, gm: '' }, rules, slug: null, traits: { otherTags: [], value: [] }, level: { value: 1 }, duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false }, tokenIcon: { show: false }, unidentified: true },
            img: `systems/pf2e/icons/conditions/${state}.webp`,
            flags: { 'pf2e-visioner': { aggregateOffGuard: true, visibilityState: state, effectTarget: 'subject' } }
          });
        }
      }

      // Cover aggregate
      const covMap = agg.coverByObserver;
      const coverRules = [];
      let maxAC = 0;
      for (const [observerId, covState] of covMap.entries()) {
        const obs = canvas.tokens.get(observerId);
        if (!obs?.actor) continue;
        const sig = obs.actor.signature;
        const bonusByState = { lesser: 1, standard: 2, greater: 4 };
        const acVal = bonusByState[covState] || 0;
        if (!coverRules.some(r => r.key === 'RollOption' && r.option === `cover-against:${obs.id}`)) {
          coverRules.push({ key: 'RollOption', domain: 'all', option: `cover-against:${obs.id}` });
        }
        coverRules.push({ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: acVal, predicate: [`origin:signature:${sig}`] });
        if (acVal > maxAC) maxAC = acVal;
      }
      // Add reflex/stealth for standard/greater
      if (coverRules.length) {
        if (maxAC >= 2) coverRules.push({ key: 'FlatModifier', selector: 'reflex', type: 'circumstance', value: maxAC === 4 ? 4 : 2, predicate: ['area-effect'] });
        if (maxAC >= 2) coverRules.push({ key: 'FlatModifier', selector: 'stealth', type: 'circumstance', value: maxAC === 4 ? 4 : 2, predicate: ['action:hide', 'action:sneak', 'avoid-detection'] });
      }
      const covEffect = existing.find(e => e.flags?.['pf2e-visioner']?.aggregateCover === true);
      if (coverRules.length) {
        const img = maxAC === 4 ? 'systems/pf2e/icons/equipment/shields/tower-shield.webp' : maxAC === 2 ? 'systems/pf2e/icons/equipment/shields/steel-shield.webp' : 'systems/pf2e/icons/equipment/shields/buckler.webp';
        const name = `${maxAC === 4 ? 'Greater' : maxAC === 2 ? 'Standard' : 'Lesser'}`;
        if (covEffect) toUpdate.push({ _id: covEffect.id, 'system.rules': coverRules, name, img });
        else toCreate.push({ name, type: 'effect', system: { description: { value: '<p>Aggregated cover vs multiple observers.</p>', gm: '' }, rules: coverRules, slug: null, traits: { otherTags: [], value: [] }, level: { value: 1 }, duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false }, tokenIcon: { show: false }, unidentified: true }, img, flags: { 'pf2e-visioner': { aggregateCover: true } } });
      } else if (covEffect) {
        toDelete.push(covEffect.id);
      }

      // Apply batched ops under lock with existence guards
      await runWithActorLock(actor, async () => {
        try {
          if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate);
          const safeUpdates = toUpdate.filter(u => !!u?._id && !!actor?.items?.get?.(u._id));
          if (safeUpdates.length) await actor.updateEmbeddedDocuments('Item', safeUpdates);
          const safeDeletes = toDelete.filter(id => !!id && !!actor?.items?.get?.(id));
          if (safeDeletes.length) await actor.deleteEmbeddedDocuments('Item', safeDeletes);
        } catch (e) {
          console.warn('Visioner bulk effect rebuild (actor) encountered errors', e);
        }
      });
    }

    await baseUpdateTokenVisuals();
  } catch (error) {
    console.error('PF2E Visioner: Failed to rebuild ephemeral effects (bulk)', error);
  }
}

/**
 * Reconcile only visibility aggregates (hidden/undetected) for a list of target tokens
 * Ensures no leftover aggregate effects remain when predicates are empty
 * @param {Token[]} targets
 */
export async function reconcileVisibilityAggregatesForTargets(targets) {
  try {
    if (!Array.isArray(targets) || targets.length === 0) return;
    const tokens = canvas?.tokens?.placeables || [];
    const observerEntries = tokens.map(o => ({ token: o, vis: getVisibilityMap(o) || {}, signature: o.actor?.signature }));
    for (const target of targets) {
      if (!target?.actor) continue;
      const tId = target.id || target.document?.id;
      // Collect sets
      const hidden = new Set();
      const undetected = new Set();
      for (const { token: observer, vis, signature } of observerEntries) {
        if (!signature) continue;
        const state = vis?.[tId];
        if (state === 'hidden') hidden.add(signature);
        else if (state === 'undetected') undetected.add(signature);
      }
      // Apply to target's aggregates
      const actor = target.actor;
      const effects = actor.itemTypes?.effect || [];
      for (const state of ['hidden', 'undetected']) {
        const signatures = Array.from(state === 'hidden' ? hidden : undetected);
        const eff = effects.find(e => e.flags?.['pf2e-visioner']?.aggregateOffGuard === true && e.flags?.['pf2e-visioner']?.visibilityState === state && e.flags?.['pf2e-visioner']?.effectTarget === 'subject');
        await runWithActorLock(actor, async () => {
          if (signatures.length === 0) {
            if (eff && actor.items.get(eff.id)) { try { await actor.deleteEmbeddedDocuments('Item', [eff.id]); } catch (_) {} }
            return;
          }
          const rules = signatures.map(sig => ({ key: 'EphemeralEffect', predicate: [`target:signature:${sig}`], selectors: ['strike-attack-roll', 'spell-attack-roll', 'strike-damage', 'attack-spell-damage'], uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg' }));
          if (eff) {
            try { if (actor.items.get(eff.id)) { await actor.updateEmbeddedDocuments('Item', [{ _id: eff.id, 'system.rules': rules }]); } } catch (_) {}
          } else {
            try {
              const name = game.i18n.localize(`PF2E.condition.${state}.name`) || (state.charAt(0).toUpperCase() + state.slice(1));
              await actor.createEmbeddedDocuments('Item', [{ name, type: 'effect', system: { description: { value: `<p>Aggregated off-guard for ${state} vs multiple observers.</p>`, gm: '' }, rules, slug: null, traits: { otherTags: [], value: [] }, level: { value: 1 }, duration: { value: -1, unit: 'unlimited', expiry: null, sustained: false }, tokenIcon: { show: false }, unidentified: true }, img: `systems/pf2e/icons/conditions/${state}.webp`, flags: { 'pf2e-visioner': { aggregateOffGuard: true, visibilityState: state, effectTarget: 'subject' } } }]);
            } catch (_) {}
          }
        });
      }
    }
  } catch (e) {
    console.warn('Visioner: reconcileVisibilityAggregatesForTargets error', e);
  }
}

// (Deprecated coordinator functions removed; compatibility wrapper provided above.)