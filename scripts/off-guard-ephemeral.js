/**
 * Off-Guard Condition Handler using EphemeralEffect Rule Elements
 * This is a cleaner approach that uses PF2e's native EphemeralEffect system
 */

import { MODULE_ID } from './constants.js';

// Per-actor effect update lock to avoid concurrent update/delete races
const _effectLocks = new WeakMap();
const LOG_PREFIX = `[${MODULE_ID}] Ephemeral`;
async function runWithEffectLock(actor, taskFn) {
    if (!actor) return taskFn();
    const prev = _effectLocks.get(actor) || Promise.resolve();
    const next = prev.then(async () => {
        try { return await taskFn(); } catch (e) { console.warn(`${LOG_PREFIX}: task error`, e); return null; }
    });
    // Ensure chain continuity even on rejection
    _effectLocks.set(actor, next.catch(() => {}));
    return next;
}

/**
 * Ensure a single aggregated ephemeral effect exists on the receiver and return it
 * The effect will contain one EphemeralEffect rule per observer signature to reduce item spam
 */
async function ensureAggregateOffGuardEffect(effectReceiverToken, visibilityState, options = {}) {
    const effects = effectReceiverToken.actor.itemTypes.effect;
    let aggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
        && e.flags?.[MODULE_ID]?.visibilityState === visibilityState
        && e.flags?.[MODULE_ID]?.effectTarget === (options.effectTarget || 'subject'));

    if (!aggregate) {
        const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
        const base = {
            name: `${visibilityLabel}`,
            type: 'effect',
            system: {
                description: { value: `<p>Aggregated off-guard for ${visibilityState} vs multiple observers.</p>`, gm: '' },
                rules: [],
                slug: null,
                traits: { otherTags: [], value: [] },
                level: { value: 1 },
                duration: options.durationRounds >= 0 ? { value: options.durationRounds, unit: 'rounds', expiry: 'turn-end', sustained: false } : { value: -1, unit: 'unlimited', expiry: null, sustained: false },
                tokenIcon: { show: false },
                unidentified: true,
                start: { value: 0, initiative: options.initiative ? game.combat?.getCombatantByToken(effectReceiverToken.actor.id)?.initiative : null },
                badge: null, fromSpell: false
            },
            img: `systems/pf2e/icons/conditions/${visibilityState}.webp`,
            flags: { [MODULE_ID]: { aggregateOffGuard: true, visibilityState, effectTarget: (options.effectTarget || 'subject') } }
        };
        const [created] = await effectReceiverToken.actor.createEmbeddedDocuments('Item', [base]);
        aggregate = created;
    }
    return aggregate;
}

/**
 * Add an observer signature as a rule entry to the aggregate effect if missing
 */
async function addObserverToAggregate(effectReceiverToken, observerToken, visibilityState, options = {}) {
    const aggregate = await ensureAggregateOffGuardEffect(effectReceiverToken, visibilityState, options);
    const signature = observerToken.actor.signature;
    const rules = Array.isArray(aggregate.system.rules) ? [...aggregate.system.rules] : [];
    const exists = rules.some(r => r?.key === 'EphemeralEffect' && (Array.isArray(r.predicate) ? r.predicate.includes(`target:signature:${signature}`) : false));
    if (exists) return aggregate;
    rules.push({
        key: 'EphemeralEffect',
        predicate: [`target:signature:${signature}`],
        selectors: ['strike-attack-roll', 'spell-attack-roll', 'strike-damage', 'attack-spell-damage'],
        uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg'
    });
    // Verify the aggregate still exists before updating (it may have been deleted by another process)
    const aggId = aggregate?.id;
    if (!aggId || !effectReceiverToken?.actor?.items?.get?.(aggId)) {
        const again = await ensureAggregateOffGuardEffect(effectReceiverToken, visibilityState, options);
        const againId = again?.id;
        if (!againId || !effectReceiverToken?.actor?.items?.get?.(againId)) return again;
        await again.update({ 'system.rules': rules });
        return again;
    }
    await aggregate.update({ 'system.rules': rules });
    return aggregate;
}

/**
 * Remove an observer signature rule from the aggregate effect; delete effect if empty
 */
async function removeObserverFromAggregate(effectReceiverToken, observerToken, visibilityState, options = {}) {
    const effects = effectReceiverToken.actor.itemTypes.effect;
    const aggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
        && e.flags?.[MODULE_ID]?.visibilityState === visibilityState
        && e.flags?.[MODULE_ID]?.effectTarget === (options.effectTarget || 'subject'));
    if (!aggregate) return;
    const signature = observerToken.actor.signature;
    const rules = Array.isArray(aggregate.system.rules) ? aggregate.system.rules.filter(r => !(r?.key === 'EphemeralEffect' && Array.isArray(r.predicate) && r.predicate.includes(`target:signature:${signature}`))) : [];
    if (rules.length === 0) {
        // Last contributing rule removed: delete the aggregate effect immediately
        try {
            const id = aggregate?.id;
            if (id && effectReceiverToken?.actor?.items?.get?.(id)) {
                await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', [id]);
            } else {
                // Fallback: ensure it's empty to be picked by a later prune
                await aggregate.update({ 'system.rules': [] });
            }
        } catch (_) {}
        return;
    }
    try {
        const aggId2 = aggregate?.id;
        if (!aggId2 || !effectReceiverToken?.actor?.items?.get?.(aggId2)) return;
        await aggregate.update({ 'system.rules': rules });
    } catch (_) {}
}

/**
 * Remove any aggregate effects that have no rules left (safety sweep)
 */
async function pruneEmptyAggregates(effectReceiverToken) {
    try {
        const empties = effectReceiverToken.actor.itemTypes.effect.filter(e => {
            if (e.flags?.[MODULE_ID]?.aggregateOffGuard !== true) return false;
            const rules = Array.isArray(e.system?.rules) ? e.system.rules : [];
            const effCount = rules.filter(r => r?.key === 'EphemeralEffect').length;
            return effCount === 0;
        });
        if (empties.length) {
            const ids = empties.map(e => e?.id).filter(id => !!id && !!effectReceiverToken?.actor?.items?.get?.(id));
            if (ids.length) await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', ids);
        }
    } catch (_) {}
}

/**
 * Clean up all ephemeral off-guard effects from all actors
 */
async function cleanupEphemeralEffects() {
    try {
        for (const actor of game.actors) {
            const ephemeralEffects = actor.itemTypes.effect.filter(e => 
                e.flags?.[MODULE_ID]?.isEphemeralOffGuard
            );
            
            if (ephemeralEffects.length > 0) {
                            const effectIds = ephemeralEffects.map(e => e?.id).filter(id => !!id);
            const existingIds = effectIds.filter(id => !!actor?.items?.get?.(id));
            if (existingIds.length > 0) {
                    try {
                        await actor.deleteEmbeddedDocuments("Item", existingIds);
                    } catch (e) {
                        for (const id of existingIds) {
                            if (!!id && !!actor?.items?.get?.(id)) {
                                try { await actor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up ephemeral effects:', error);
    }
}

/**
 * Clean up ephemeral effects for a specific target when visibility changes
 * @param {Token} observerToken - The observing token (who has the effect)
 * @param {Token} hiddenToken - The hidden token (who is targeted by the effect)
 */
export async function cleanupEphemeralEffectsForTarget(observerToken, hiddenToken) {
    try {
        // Legacy per-observer effects stored on the OBSERVER actor pointing to hiddenToken
        const ephemeralEffects = observerToken.actor.itemTypes.effect.filter(e => 
            e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
            e.flags?.[MODULE_ID]?.hiddenActorSignature === hiddenToken.actor.signature
        );
        
        if (ephemeralEffects.length > 0) {
            const effectIds = ephemeralEffects.map(e => e?.id).filter(id => !!id);
            const existingIds = effectIds.filter(id => !!observerToken?.actor?.items?.get?.(id));
            if (existingIds.length > 0) {
        try {
            const safe = existingIds.filter(id => !!observerToken.actor.items.get(id));
            if (safe.length) {
                await observerToken.actor.deleteEmbeddedDocuments("Item", safe);
            }
        } catch (e) {
            for (const id of existingIds) {
                                            if (!!id && !!observerToken?.actor?.items?.get?.(id)) {
                    try {
                        await observerToken.actor.deleteEmbeddedDocuments("Item", [id]);
                    } catch (_) {}
                }
            }
        }
            }

        }

        // Legacy per-observer effects stored on the TARGET actor pointing back to observer
        try {
            const legacyOnTarget = hiddenToken.actor.itemTypes.effect.filter(e =>
                e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
                e.flags?.[MODULE_ID]?.hiddenActorSignature === observerToken.actor.signature
            );
            if (legacyOnTarget.length) {
                const ids = legacyOnTarget.map(e => e.id).filter(id => !!hiddenToken.actor.items.get(id));
                if (ids.length) {
                    try {
                        if (game.settings?.get?.('pf2e-visioner','debug')) console.warn('[Visioner-debug] Bulk delete legacy off-guard on target', { target: hiddenToken.name, ids });
                        const safeIds = ids.filter(id => !!id && !!hiddenToken?.actor?.items?.get?.(id));
                        if (safeIds.length) await hiddenToken.actor.deleteEmbeddedDocuments('Item', safeIds);
                    } catch (e) {
                        console.error('Error deleting legacy off-guard effects:', e);
                    }
                }
            }
        } catch (_) {}

        // Also remove from any aggregate effects (both hidden and undetected aggregates) on the TARGET
        try {
            await removeObserverFromAggregate(hiddenToken, observerToken, 'hidden');
            await removeObserverFromAggregate(hiddenToken, observerToken, 'undetected');
        } catch (_) {}

        // Final sweep: delete any aggregate effects that are now empty
        try { await pruneEmptyAggregates(hiddenToken); } catch (_) {}
    } catch (error) {
        console.error('Error cleaning up ephemeral effects for target:', error);
    }
}

/**
 * Update ephemeral effects when visibility changes
 * @param {Token} observerToken - The observing token
 * @param {Token} targetToken - The target token  
 * @param {string} newVisibilityState - The new visibility state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 * @param {string} options.effectTarget - Which token gets the effect ('observer' or 'subject')
 */
export async function updateEphemeralEffectsForVisibility(observerToken, targetToken, newVisibilityState, options = {}) {
    // Centralize embedded Item mutations to the GM to avoid cross-client races
    if (!observerToken?.actor || !targetToken?.actor) {
        console.warn(`${LOG_PREFIX}: missing actor(s)`, { observer: observerToken?.id, target: targetToken?.id });
        return;
    }
        
    // Determine which token gets the effect
    let effectReceiverToken, effectSourceToken;
    
    // Resolve effect target
    if (!options.effectTarget) {
        if (options.direction === 'target_to_observer') {
            options.effectTarget = 'observer';
        } else {
            // Treat missing or 'observer_to_target' as subject by default
            options.effectTarget = 'subject';
        }
    }
    
    const effectTarget = options.effectTarget;
    
    if (effectTarget === 'observer') {
        effectReceiverToken = observerToken;
        effectSourceToken = targetToken;
    } else {
        effectReceiverToken = targetToken;
        effectSourceToken = observerToken;
    }
    
    // For performance and race-safety, serialize per receiver
    await runWithEffectLock(effectReceiverToken.actor, async () => {
        if (options.removeAllEffects) {
            try {
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'hidden', options);
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'undetected', options);
            } catch (_) {}
            await pruneEmptyAggregates(effectReceiverToken);
            return;
        }
        try {
            if (newVisibilityState === 'hidden') {
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'undetected', options);
                await addObserverToAggregate(effectReceiverToken, effectSourceToken, 'hidden', options);
            } else if (newVisibilityState === 'undetected') {
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'hidden', options);
                await addObserverToAggregate(effectReceiverToken, effectSourceToken, 'undetected', options);
            } else {
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'hidden', options);
                await removeObserverFromAggregate(effectReceiverToken, effectSourceToken, 'undetected', options);
            }
        } catch (_) {}
    });
}

