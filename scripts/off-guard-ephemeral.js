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
    if (!effectReceiverToken?.actor?.itemTypes?.effect) return null;
    
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
        try {
            const [created] = await effectReceiverToken.actor.createEmbeddedDocuments('Item', [base]);
            aggregate = created;
        } catch (error) {
            console.error(`${LOG_PREFIX}: Failed to create aggregate effect:`, error);
            return null;
        }
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
    if (!effectReceiverToken?.actor?.itemTypes?.effect) return;
    
    try {
        const empties = effectReceiverToken.actor.itemTypes.effect.filter(e => {
            if (e.flags?.[MODULE_ID]?.aggregateOffGuard !== true) return false;
            const rules = Array.isArray(e.system?.rules) ? e.system.rules : [];
            const effCount = rules.filter(r => r?.key === 'EphemeralEffect').length;
            return effCount === 0;
        });
        
        if (empties.length) {
            const ids = empties.map(e => e?.id).filter(id => !!id && !!effectReceiverToken?.actor?.items?.get?.(id));
            if (ids.length) {
                try {
                    await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', ids);
                } catch (error) {
                    console.error(`${LOG_PREFIX}: Error pruning empty aggregates:`, error);
                }
            }
        }
    } catch (error) {
        console.error(`${LOG_PREFIX}: Error in pruneEmptyAggregates:`, error);
    }
}

/**
 * Clean up all ephemeral off-guard effects from all actors
 */
async function cleanupEphemeralEffects() {
    try {
        // Process actors in batches to avoid overwhelming the system
        const allActors = Array.from(game.actors || []);
        const batchSize = 10;
        
        for (let i = 0; i < allActors.length; i += batchSize) {
            const actorBatch = allActors.slice(i, i + batchSize);
            
            for (const actor of actorBatch) {
                if (!actor?.itemTypes?.effect) continue;
                
                const ephemeralEffects = actor.itemTypes.effect.filter(e => 
                    e.flags?.[MODULE_ID]?.isEphemeralOffGuard
                );
                
                if (ephemeralEffects.length > 0) {
                    const effectIds = ephemeralEffects.map(e => e?.id).filter(id => !!id);
                    const existingIds = effectIds.filter(id => !!actor?.items?.get?.(id));
                    
                    if (existingIds.length > 0) {
                        try {
                            // Delete all effects in a single bulk operation
                            await actor.deleteEmbeddedDocuments("Item", existingIds);
                        } catch (error) {
                            console.error(`${LOG_PREFIX}: Error bulk deleting ephemeral effects:`, error);
                            
                            // Fallback: Try deleting individually if bulk delete fails
                            for (const id of existingIds) {
                                if (!!id && !!actor?.items?.get?.(id)) {
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
        console.error(`${LOG_PREFIX}: Error cleaning up ephemeral effects:`, error);
    }
}

/**
 * Clean up ephemeral effects for a specific target when visibility changes
 * @param {Token} observerToken - The observing token (who has the effect)
 * @param {Token} hiddenToken - The hidden token (who is targeted by the effect)
 */
export async function cleanupEphemeralEffectsForTarget(observerToken, hiddenToken) {
    if (!observerToken?.actor || !hiddenToken?.actor) return;
    
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
                    // Delete all effects in a single bulk operation
                    await observerToken.actor.deleteEmbeddedDocuments("Item", existingIds);
                } catch (error) {
                    console.error(`${LOG_PREFIX}: Error bulk deleting observer effects:`, error);
                    
                    // Fallback: Try deleting individually if bulk delete fails
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
                        // Delete all effects in a single bulk operation
                        if (game.settings?.get?.('pf2e-visioner','debug')) {
                            console.warn('[Visioner-debug] Bulk delete legacy off-guard on target', { target: hiddenToken.name, ids });
                        }
                        await hiddenToken.actor.deleteEmbeddedDocuments('Item', ids);
                    } catch (error) {
                        console.error(`${LOG_PREFIX}: Error deleting legacy off-guard effects:`, error);
                    }
                }
            }
        } catch (error) {
            console.error(`${LOG_PREFIX}: Error processing legacy target effects:`, error);
        }

        // Also remove from any aggregate effects (both hidden and undetected aggregates) on the TARGET
        try {
            // Update both hidden and undetected states in a single operation
            await Promise.all([
                removeObserverFromAggregate(hiddenToken, observerToken, 'hidden'),
                removeObserverFromAggregate(hiddenToken, observerToken, 'undetected')
            ]);
            
            // Final sweep: delete any aggregate effects that are now empty
            await pruneEmptyAggregates(hiddenToken);
        } catch (error) {
            console.error(`${LOG_PREFIX}: Error removing observer from aggregates:`, error);
        }
    } catch (error) {
        console.error(`${LOG_PREFIX}: Error cleaning up ephemeral effects for target:`, error);
    }
}

/**
 * Clean up all effects related to a deleted token
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
export async function cleanupDeletedTokenEffects(tokenDoc) {
    if (!tokenDoc?.id || !tokenDoc?.actor?.id) return;
    
    console.log(`[${MODULE_ID}] Cleaning up effects for deleted token:`, tokenDoc.name, tokenDoc.id);
    
    try {
        const deletedToken = {
            id: tokenDoc.id,
            actor: {
                id: tokenDoc.actor.id,
                signature: tokenDoc.actor.id // Use actor ID as signature for deleted tokens
            }
        };
        
        // Clean up from all tokens on the canvas
        const allTokens = canvas.tokens?.placeables || [];
        console.log(`[${MODULE_ID}] Checking ${allTokens.length} tokens for effects referencing deleted token`);
        
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
                const observerEffects = effects.filter(e => 
                    e.flags?.[MODULE_ID]?.aggregateOffGuard === true && 
                    e.flags?.[MODULE_ID]?.observerToken === tokenId
                );
                
                if (observerEffects.length > 0) {
                    console.log(`[${MODULE_ID}] Found ${observerEffects.length} effects where deleted token is the observer`);
                    effectsToDelete.push(...observerEffects.map(e => e.id));
                    continue; // Skip to the next token, as we're deleting these effects entirely
                }
                
                // Then check for effects that might have rules referencing the deleted token
                const relevantEffects = effects.filter(e => 
                    e.flags?.[MODULE_ID]?.aggregateOffGuard === true
                );
                
                console.log(`[${MODULE_ID}] Found ${relevantEffects.length} aggregate effects on token ${token.name}`);
                
                // For each relevant effect, remove any rules that reference the deleted token
                for (const effect of relevantEffects) {
                    const rules = Array.isArray(effect.system?.rules) ? [...effect.system.rules] : [];
                    
                    // Filter out rules that reference the deleted token in any way
                    console.log(`[${MODULE_ID}] Checking ${rules.length} rules in effect ${effect.name}`);
                    
                    const newRules = rules.filter(r => {
                        // Convert the entire rule to a string for comprehensive checking
                        const ruleString = JSON.stringify(r);
                        
                        // Check if the rule contains any reference to the deleted token
                        if (ruleString.includes(signature) || ruleString.includes(tokenId)) {
                            console.log(`[${MODULE_ID}] Found reference to deleted token in rule:`, r);
                            return false;
                        }
                        
                        return true;
                    });
                    
                    // If rules were removed, update the effect
                    if (newRules.length !== rules.length) {
                        console.log(`[${MODULE_ID}] Rules changed: ${rules.length} -> ${newRules.length}`);
                        
                        if (newRules.length === 0) {
                            // If no rules left, add to delete list
                            effectsToDelete.push(effect.id);
                            console.log(`[${MODULE_ID}] Marking effect ${effect.name} for deletion`);
                        } else {
                            // Otherwise add to update list
                            effectsToUpdate.push({
                                _id: effect.id,
                                'system.rules': newRules
                            });
                            console.log(`[${MODULE_ID}] Marking effect ${effect.name} for update with ${newRules.length} rules`);
                        }
                    } else {
                        console.log(`[${MODULE_ID}] No rules changed for effect ${effect.name}`);
                    }
                }
                
                // Also check for legacy effects that might reference the deleted token
                const legacyEffects = effects.filter(e => 
                    e.flags?.[MODULE_ID]?.offGuard === true &&
                    (e.flags?.[MODULE_ID]?.observerToken === tokenId || e.flags?.[MODULE_ID]?.targetToken === tokenId)
                );
                
                if (legacyEffects.length > 0) {
                    console.log(`[${MODULE_ID}] Found ${legacyEffects.length} legacy effects referencing deleted token`);
                    effectsToDelete.push(...legacyEffects.map(e => e.id));
                }
                
                console.log(`[${MODULE_ID}] Final counts: ${effectsToDelete.length} to delete, ${effectsToUpdate.length} to update`);
                
                // Perform bulk operations
                try {
                    // Delete effects in bulk if any
                    if (effectsToDelete.length > 0) {
                        console.log(`[${MODULE_ID}] Deleting ${effectsToDelete.length} effects for token ${token.name}`);
                        await token.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
                        console.log(`[${MODULE_ID}] Successfully deleted ${effectsToDelete.length} effects`);
                    }
                    
                    // Update effects in bulk if any
                    if (effectsToUpdate.length > 0) {
                        console.log(`[${MODULE_ID}] Updating ${effectsToUpdate.length} effects for token ${token.name}`);
                        console.log(`[${MODULE_ID}] Update data:`, effectsToUpdate);
                        await token.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
                        console.log(`[${MODULE_ID}] Successfully updated ${effectsToUpdate.length} effects`);
                    }
                } catch (error) {
                    console.error(`${LOG_PREFIX}: Error updating effects for deleted token:`, error);
                }
            }
        }
    } catch (error) {
        console.error(`${LOG_PREFIX}: Error cleaning up effects for deleted token:`, error);
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
        // Collect all operations to perform in a single batch
        const operations = {
            hidden: { add: false, remove: false },
            undetected: { add: false, remove: false }
        };
        
        if (options.removeAllEffects) {
            // Remove all effects
            operations.hidden.remove = true;
            operations.undetected.remove = true;
        } else if (newVisibilityState === 'hidden') {
            // Add hidden, remove undetected
            operations.hidden.add = true;
            operations.undetected.remove = true;
        } else if (newVisibilityState === 'undetected') {
            // Add undetected, remove hidden
            operations.hidden.remove = true;
            operations.undetected.add = true;
        } else {
            // Remove both
            operations.hidden.remove = true;
            operations.undetected.remove = true;
        }
        
        try {
            // Get all existing effects
            const effects = effectReceiverToken.actor.itemTypes.effect;
            const hiddenAggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
                && e.flags?.[MODULE_ID]?.visibilityState === 'hidden'
                && e.flags?.[MODULE_ID]?.effectTarget === effectTarget);
                
            const undetectedAggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
                && e.flags?.[MODULE_ID]?.visibilityState === 'undetected'
                && e.flags?.[MODULE_ID]?.effectTarget === effectTarget);
            
            const signature = effectSourceToken.actor.signature;
            const effectsToCreate = [];
            const effectsToUpdate = [];
            const effectsToDelete = [];
            
            // Process hidden state
            if (operations.hidden.remove && hiddenAggregate) {
                const rules = Array.isArray(hiddenAggregate.system.rules) ? 
                    hiddenAggregate.system.rules.filter(r => 
                        !(r?.key === 'EphemeralEffect' && 
                        Array.isArray(r.predicate) && 
                        r.predicate.includes(`target:signature:${signature}`))
                    ) : [];
                
                if (rules.length === 0) {
                    effectsToDelete.push(hiddenAggregate.id);
                } else {
                    effectsToUpdate.push({
                        _id: hiddenAggregate.id,
                        'system.rules': rules
                    });
                }
            }
            
            // Process undetected state
            if (operations.undetected.remove && undetectedAggregate) {
                const rules = Array.isArray(undetectedAggregate.system.rules) ? 
                    undetectedAggregate.system.rules.filter(r => 
                        !(r?.key === 'EphemeralEffect' && 
                        Array.isArray(r.predicate) && 
                        r.predicate.includes(`target:signature:${signature}`))
                    ) : [];
                
                if (rules.length === 0) {
                    effectsToDelete.push(undetectedAggregate.id);
                } else {
                    effectsToUpdate.push({
                        _id: undetectedAggregate.id,
                        'system.rules': rules
                    });
                }
            }
            
            // Process additions
            if (operations.hidden.add) {
                if (!hiddenAggregate) {
                    // Create new aggregate
                    effectsToCreate.push(createAggregateEffectData('hidden', signature, {...options, receiverId: effectReceiverToken.actor.id}));
                } else {
                    // Update existing aggregate
                    const rules = Array.isArray(hiddenAggregate.system.rules) ? [...hiddenAggregate.system.rules] : [];
                    const exists = rules.some(r => 
                        r?.key === 'EphemeralEffect' && 
                        Array.isArray(r.predicate) && 
                        r.predicate.includes(`target:signature:${signature}`)
                    );
                    
                    if (!exists) {
                        rules.push(createEphemeralEffectRule(signature));
                        effectsToUpdate.push({
                            _id: hiddenAggregate.id,
                            'system.rules': rules
                        });
                    }
                }
            }
            
            if (operations.undetected.add) {
                if (!undetectedAggregate) {
                    // Create new aggregate
                    effectsToCreate.push(createAggregateEffectData('undetected', signature, {...options, receiverId: effectReceiverToken.actor.id}));
                } else {
                    // Update existing aggregate
                    const rules = Array.isArray(undetectedAggregate.system.rules) ? [...undetectedAggregate.system.rules] : [];
                    const exists = rules.some(r => 
                        r?.key === 'EphemeralEffect' && 
                        Array.isArray(r.predicate) && 
                        r.predicate.includes(`target:signature:${signature}`)
                    );
                    
                    if (!exists) {
                        rules.push(createEphemeralEffectRule(signature));
                        effectsToUpdate.push({
                            _id: undetectedAggregate.id,
                            'system.rules': rules
                        });
                    }
                }
            }
            
            // Execute all operations in bulk
            if (effectsToDelete.length > 0) {
                await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
            }
            
            if (effectsToUpdate.length > 0) {
                await effectReceiverToken.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
            }
            
            if (effectsToCreate.length > 0) {
                await effectReceiverToken.actor.createEmbeddedDocuments('Item', effectsToCreate);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX}: Error updating ephemeral effects:`, error);
        }
    });
}

/**
 * Batch update visibility effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export async function batchUpdateVisibilityEffects(observerToken, targetUpdates, options = {}) {
    if (!observerToken?.actor || !targetUpdates?.length) return;
    
    // Resolve effect target
    if (!options.effectTarget) {
        if (options.direction === 'target_to_observer') {
            options.effectTarget = 'observer';
        } else {
            options.effectTarget = 'subject';
        }
    }
    
    const effectTarget = options.effectTarget;
    let effectReceiverToken;
    
    // Group targets by receiver to minimize actor updates
    const updatesByReceiver = new Map();
    
    for (const update of targetUpdates) {
        if (!update.target?.actor) continue;
        
        if (effectTarget === 'observer') {
            effectReceiverToken = observerToken;
        } else {
            effectReceiverToken = update.target;
        }
        
        const receiverId = effectReceiverToken.actor.id;
        
        if (!updatesByReceiver.has(receiverId)) {
            updatesByReceiver.set(receiverId, {
                receiver: effectReceiverToken,
                updates: []
            });
        }
        
        updatesByReceiver.get(receiverId).updates.push({
            source: effectTarget === 'observer' ? update.target : observerToken,
            state: update.state
        });
    }
    
    // Process each receiver's batch
    for (const [receiverId, data] of updatesByReceiver.entries()) {
        const { receiver, updates } = data;
        
        await runWithEffectLock(receiver.actor, async () => {
            try {
                // Get all existing effects
                const effects = receiver.actor.itemTypes.effect;
                const hiddenAggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
                    && e.flags?.[MODULE_ID]?.visibilityState === 'hidden'
                    && e.flags?.[MODULE_ID]?.effectTarget === effectTarget);
                    
                const undetectedAggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateOffGuard === true
                    && e.flags?.[MODULE_ID]?.visibilityState === 'undetected'
                    && e.flags?.[MODULE_ID]?.effectTarget === effectTarget);
                
                // Track changes for each state
                const hiddenRules = hiddenAggregate ? 
                    Array.isArray(hiddenAggregate.system.rules) ? [...hiddenAggregate.system.rules] : [] : [];
                const undetectedRules = undetectedAggregate ? 
                    Array.isArray(undetectedAggregate.system.rules) ? [...undetectedAggregate.system.rules] : [] : [];
                
                const effectsToCreate = [];
                const effectsToUpdate = [];
                const effectsToDelete = [];
                
                // Process all updates
                for (const { source, state } of updates) {
                    const signature = source.actor.signature;
                    
                    // Determine operations based on state
                    const operations = {
                        hidden: { add: false, remove: false },
                        undetected: { add: false, remove: false }
                    };
                    
                    if (options.removeAllEffects || state === 'observed' || state === 'concealed') {
                        operations.hidden.remove = true;
                        operations.undetected.remove = true;
                    } else if (state === 'hidden') {
                        operations.hidden.add = true;
                        operations.undetected.remove = true;
                    } else if (state === 'undetected') {
                        operations.hidden.remove = true;
                        operations.undetected.add = true;
                    }
                    
                    // Apply operations to rule collections
                    if (operations.hidden.remove) {
                        const filteredRules = hiddenRules.filter(r => 
                            !(r?.key === 'EphemeralEffect' && 
                            Array.isArray(r.predicate) && 
                            r.predicate.includes(`target:signature:${signature}`))
                        );
                        hiddenRules.splice(0, hiddenRules.length, ...filteredRules);
                    }
                    
                    if (operations.undetected.remove) {
                        const filteredRules = undetectedRules.filter(r => 
                            !(r?.key === 'EphemeralEffect' && 
                            Array.isArray(r.predicate) && 
                            r.predicate.includes(`target:signature:${signature}`))
                        );
                        undetectedRules.splice(0, undetectedRules.length, ...filteredRules);
                    }
                    
                    if (operations.hidden.add) {
                        const exists = hiddenRules.some(r => 
                            r?.key === 'EphemeralEffect' && 
                            Array.isArray(r.predicate) && 
                            r.predicate.includes(`target:signature:${signature}`)
                        );
                        
                        if (!exists) {
                            hiddenRules.push(createEphemeralEffectRule(signature));
                        }
                    }
                    
                    if (operations.undetected.add) {
                        const exists = undetectedRules.some(r => 
                            r?.key === 'EphemeralEffect' && 
                            Array.isArray(r.predicate) && 
                            r.predicate.includes(`target:signature:${signature}`)
                        );
                        
                        if (!exists) {
                            undetectedRules.push(createEphemeralEffectRule(signature));
                        }
                    }
                }
                
                // Prepare final operations
                if (hiddenAggregate) {
                    if (hiddenRules.length === 0) {
                        effectsToDelete.push(hiddenAggregate.id);
                    } else {
                        effectsToUpdate.push({
                            _id: hiddenAggregate.id,
                            'system.rules': hiddenRules
                        });
                    }
                } else if (hiddenRules.length > 0) {
                    effectsToCreate.push(createAggregateEffectData('hidden', 'batch', {
                        ...options, 
                        receiverId: receiver.actor.id,
                        existingRules: hiddenRules
                    }));
                }
                
                if (undetectedAggregate) {
                    if (undetectedRules.length === 0) {
                        effectsToDelete.push(undetectedAggregate.id);
                    } else {
                        effectsToUpdate.push({
                            _id: undetectedAggregate.id,
                            'system.rules': undetectedRules
                        });
                    }
                } else if (undetectedRules.length > 0) {
                    effectsToCreate.push(createAggregateEffectData('undetected', 'batch', {
                        ...options, 
                        receiverId: receiver.actor.id,
                        existingRules: undetectedRules
                    }));
                }
                
                // Execute all operations in bulk
                if (effectsToDelete.length > 0) {
                    await receiver.actor.deleteEmbeddedDocuments('Item', effectsToDelete);
                }
                
                if (effectsToUpdate.length > 0) {
                    await receiver.actor.updateEmbeddedDocuments('Item', effectsToUpdate);
                }
                
                if (effectsToCreate.length > 0) {
                    await receiver.actor.createEmbeddedDocuments('Item', effectsToCreate);
                }
            } catch (error) {
                console.error(`${LOG_PREFIX}: Error in batch update:`, error);
            }
        });
    }
}

/**
 * Create an ephemeral effect rule for a specific observer signature
 * @param {string} signature - The observer's signature
 * @returns {Object} The rule object
 */
function createEphemeralEffectRule(signature) {
    return {
        key: 'EphemeralEffect',
        predicate: [`target:signature:${signature}`],
        selectors: ['strike-attack-roll', 'spell-attack-roll', 'strike-damage', 'attack-spell-damage'],
        uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg'
    };
}

/**
 * Create data for a new aggregate effect
 * @param {string} visibilityState - The visibility state ('hidden' or 'undetected')
 * @param {string} signature - The observer's signature or 'batch' for batch operations
 * @param {Object} options - Options for the effect
 * @returns {Object} The effect data object
 */
function createAggregateEffectData(visibilityState, signature, options = {}) {
    const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
    const effectTarget = options.effectTarget || 'subject';
    
    // Use existing rules if provided (for batch operations)
    let rules = options.existingRules || [];
    
    // If no existing rules and not a batch operation, create a rule for the signature
    if (rules.length === 0 && signature !== 'batch') {
        rules = [createEphemeralEffectRule(signature)];
    }
    
    return {
        name: `${visibilityLabel}`,
        type: 'effect',
        system: {
            description: { value: `<p>Aggregated off-guard for ${visibilityState} vs multiple observers.</p>`, gm: '' },
            rules: rules,
            slug: null,
            traits: { otherTags: [], value: [] },
            level: { value: 1 },
            duration: options.durationRounds >= 0 ? 
                { value: options.durationRounds, unit: 'rounds', expiry: 'turn-end', sustained: false } : 
                { value: -1, unit: 'unlimited', expiry: null, sustained: false },
            tokenIcon: { show: false },
            unidentified: true,
            start: { 
                value: 0, 
                initiative: options.initiative ? 
                    game.combat?.getCombatantByToken(options.receiverId)?.initiative : null 
            },
            badge: null, 
            fromSpell: false
        },
        img: `systems/pf2e/icons/conditions/${visibilityState}.webp`,
        flags: { 
            [MODULE_ID]: { 
                aggregateOffGuard: true, 
                visibilityState, 
                effectTarget 
            } 
        }
    };
}

