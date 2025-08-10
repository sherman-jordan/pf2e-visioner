/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { COVER_STATES, MODULE_ID } from './constants.js';

// Per-actor cover effect update lock to avoid concurrent update/delete races
const _coverEffectLocks = new WeakMap();
async function runWithCoverEffectLock(actor, taskFn) {
    if (!actor) return taskFn();
    const prev = _coverEffectLocks.get(actor) || Promise.resolve();
    const next = prev.then(async () => {
        try { return await taskFn(); } catch (_) { return null; }
    });
    // Keep the chain even on rejection
    _coverEffectLocks.set(actor, next.catch(() => {}));
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
export async function createEphemeralCoverEffect(effectReceiverToken, effectSourceToken, coverState, options = {}) {
    // Skip if no cover or invalid state
    if (!coverState || coverState === 'none' || !COVER_STATES[coverState]) {
        return;
    }

    // Check if effect already exists to prevent duplicates
    const existingEffect = effectReceiverToken.actor.itemTypes.effect.find(e => 
        e.flags?.[MODULE_ID]?.isEphemeralCover &&
        e.flags?.[MODULE_ID]?.observerActorSignature === effectSourceToken.actor.signature
    );
    
    if (existingEffect) {
        // If the same level, don't recreate
        if (existingEffect.flags[MODULE_ID].coverState === coverState) {
            return;
        }
        // Otherwise, remove the old one so we can create the new one
        try {
            if (effectReceiverToken.actor.items.get(existingEffect.id)) {
                await effectReceiverToken.actor.deleteEmbeddedDocuments("Item", [existingEffect.id]);
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

    const effectImg = coverEffectImageByState[coverState] || "systems/pf2e/icons/equipment/shields/steel-shield.webp";

    const ephemeralEffect = {
        name: `${coverLabel} against ${effectSourceToken.name}`,
        type: 'effect',
        system: {
            description: {
                value: `<p>You have ${coverState} cover against ${effectSourceToken.name}, granting a +${stateConfig.bonusAC} circumstance bonus to AC.</p>`,
                gm: ''
            },
            rules: [
                {
                    key: "RollOption",
                    domain: "all",
                    option: `cover-against:${effectSourceToken.id}`
                },
                {
                    key: "FlatModifier",
                    selector: "ac",
                    type: "circumstance",
                    value: stateConfig.bonusAC,
                    predicate: [`origin:signature:${effectSourceToken.actor.signature}`]
                }
            ],
            slug: null,
            traits: {
                otherTags: [],
                value: []
            },
            level: {
                value: 1
            },
            duration: options.durationRounds >= 0 ? {
                "value": options.durationRounds,
                "unit": "rounds",
                "expiry": "turn-start",
                "sustained": false
            } : {
                "value": -1,
                "unit": "unlimited",
                "expiry": null,
                "sustained": false
            },
            tokenIcon: {
                show: false
            },
            unidentified: true,
            start: {
                value: 0,
                initiative: options.initiative 
                ? game.combat?.getCombatantByToken(effectReceiverToken?.id)?.initiative 
                : null
            },
            badge: null
        },
        img: effectImg,
                         flags: {
            [MODULE_ID]: {
                isEphemeralCover: true,
                observerActorSignature: effectSourceToken.actor.signature,
                observerTokenId: effectSourceToken.id,
                coverState: coverState
            },
            core: {}
        }
    };

    // Add reflex and stealth bonuses for standard and greater cover
    if (coverState === 'standard' || coverState === 'greater') {
        ephemeralEffect.system.rules.push(
            {
                key: "FlatModifier",
                selector: "reflex",
                type: "circumstance",
                value: stateConfig.bonusReflex,
                predicate: ["area-effect"]
            },
            {
                key: "FlatModifier",
                predicate: ["action:hide", "action:sneak", "avoid-detection"],
                selector: "stealth",
                type: "circumstance",
                value: stateConfig.bonusStealth
            }
        );
    }

    try {
        await effectReceiverToken.actor.createEmbeddedDocuments("Item", [ephemeralEffect]);
    } catch (error) {
        console.error('Failed to create ephemeral cover effect:', error);
    }
}

/**
 * Aggregated cover effect helpers
 */
async function ensureAggregateCoverEffect(effectReceiverToken, state, options = {}) {
    const effects = effectReceiverToken.actor.itemTypes.effect;
    let aggregate = effects.find(e => e.flags?.[MODULE_ID]?.aggregateCover === true && e.flags?.[MODULE_ID]?.coverState === state);
    if (!aggregate) {
        const label = getCoverLabel(state);
        const img = getCoverImageForState(state);
        const base = {
            name: label,
            type: 'effect',
            system: {
                description: { value: `<p>Aggregated ${label.toLowerCase()} cover vs multiple observers.</p>`, gm: '' },
                rules: [],
                slug: null,
                traits: { otherTags: [], value: [] },
                level: { value: 1 },
                duration: options.durationRounds >= 0 ? { value: options.durationRounds, unit: 'rounds', expiry: 'turn-start', sustained: false } : { value: -1, unit: 'unlimited', expiry: null, sustained: false },
                tokenIcon: { show: false },
                unidentified: true,
                start: { value: 0, initiative: options.initiative ? game.combat?.getCombatantByToken(effectReceiverToken?.id)?.initiative : null },
                badge: null
            },
            img,
            flags: { [MODULE_ID]: { aggregateCover: true, coverState: state } }
        };
        const [created] = await effectReceiverToken.actor.createEmbeddedDocuments('Item', [base]);
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
        if (r?.key === 'FlatModifier' && r.selector === 'ac' && typeof r.value === 'number') {
            if (r.value > maxVal) maxVal = r.value;
        }
    }
    // Map back to state by matching bonus
    const entries = Object.entries(COVER_STATES);
    let maxState = 'none';
    for (const [state, cfg] of entries) {
        if (cfg.bonusAC === maxVal) { maxState = state; break; }
    }
    return maxState;
}

async function upsertReflexStealthForMaxCoverOnThisAggregate(aggregate, maxState) {
    const rules = Array.isArray(aggregate.system.rules) ? [...aggregate.system.rules] : [];
    // Remove existing reflex/stealth aggregate rules first
    const filtered = rules.filter(r => !(r?.key === 'FlatModifier' && (r.selector === 'reflex' || r.selector === 'stealth')));
    const cfg = COVER_STATES[maxState];
    if (cfg && (maxState === 'standard' || maxState === 'greater')) {
        filtered.push({ key: 'FlatModifier', selector: 'reflex', type: 'circumstance', value: cfg.bonusReflex, predicate: ['area-effect'] });
        filtered.push({ key: 'FlatModifier', selector: 'stealth', type: 'circumstance', value: cfg.bonusStealth, predicate: ['action:hide', 'action:sneak', 'avoid-detection'] });
    }
    await aggregate.update({ 'system.rules': filtered });
}

async function updateReflexStealthAcrossCoverAggregates(effectReceiverToken) {
    const effects = effectReceiverToken.actor.itemTypes.effect.filter(e => e.flags?.[MODULE_ID]?.aggregateCover === true);
    if (effects.length === 0) return;
    // Determine highest state present across all aggregates by inspecting their AC rule values
    const order = { none: 0, lesser: 1, standard: 2, greater: 3 };
    let highestState = 'none';
    for (const agg of effects) {
        const state = agg.flags?.[MODULE_ID]?.coverState;
        const rules = Array.isArray(agg.system.rules) ? agg.system.rules : [];
        const presentState = getMaxCoverStateFromRules(rules);
        if (order[presentState] > order[highestState]) highestState = presentState;
    }
    // Remove reflex/stealth from all, then add only to the highest-state aggregate
    for (const agg of effects) {
        const rules = Array.isArray(agg.system.rules) ? [...agg.system.rules] : [];
        const withoutRS = rules.filter(r => !(r?.key === 'FlatModifier' && (r.selector === 'reflex' || r.selector === 'stealth')));
        await agg.update({ 'system.rules': withoutRS });
    }
    if (highestState !== 'none') {
        const targetAgg = effects.find(e => e.flags?.[MODULE_ID]?.coverState === highestState);
        if (targetAgg) await upsertReflexStealthForMaxCoverOnThisAggregate(targetAgg, highestState);
    }
    // After redistributing, prune any aggregates that now have no AC rules left
    await pruneEmptyCoverAggregates(effectReceiverToken);
}

async function dedupeCoverAggregates(effectReceiverToken) {
    const effects = effectReceiverToken.actor.itemTypes.effect.filter(e => e.flags?.[MODULE_ID]?.aggregateCover === true);
    if (effects.length === 0) return;
    // Remove legacy single-aggregate effects without coverState flag
    const legacy = effects.filter(e => !e.flags?.[MODULE_ID]?.coverState);
    if (legacy.length) {
        const ids = legacy.map(e => e.id).filter(id => !!effectReceiverToken.actor.items.get(id));
        if (ids.length) { try { await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', ids); } catch (_) {} }
    }
    // Group by coverState and merge duplicates
    const byState = new Map();
    for (const eff of effects.filter(e => e.flags?.[MODULE_ID]?.coverState)) {
        const state = eff.flags[MODULE_ID].coverState;
        if (!byState.has(state)) byState.set(state, []);
        byState.get(state).push(eff);
    }
    for (const [state, group] of byState.entries()) {
        if (group.length <= 1) continue;
        // Choose deterministic primary to reduce race risk
        const primary = [...group].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
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
            try { await primary.update({ 'system.rules': mergedRules }); } catch (_) {}
        }
        const toDelete = group
            .filter(e => e.id !== primary.id)
            .map(e => e.id)
            .filter(id => !!effectReceiverToken.actor.items.get(id));
        if (toDelete.length) { try { await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', toDelete); } catch (_) {} }
        await updateAggregateCoverMetaForState(primary, state);
    }
    await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
}

function getCoverLabel(state) {
    const entry = COVER_STATES[state];
    if (entry?.label) {
        try { return game.i18n.localize(entry.label); } catch (_) {}
    }
    return state ? (state.charAt(0).toUpperCase() + state.slice(1)) : 'None';
}

function getCoverImageForState(state) {
    switch (state) {
        case 'lesser':
            return 'systems/pf2e/icons/equipment/shields/buckler.webp';
        case 'greater':
            return 'systems/pf2e/icons/equipment/shields/tower-shield.webp';
        case 'standard':
        default:
            return 'systems/pf2e/icons/equipment/shields/steel-shield.webp';
    }
}

async function updateAggregateCoverMetaForState(aggregate, state) {
    const label = getCoverLabel(state);
    const desiredName = label;
    const desiredImg = getCoverImageForState(state);
    const update = {};
    if (aggregate?.name !== desiredName) update.name = desiredName;
    if (aggregate?.img !== desiredImg) update.img = desiredImg;
    if (Object.keys(update).length) {
        try { await aggregate.update(update); } catch (_) {}
    }
}

async function addObserverToCoverAggregate(effectReceiverToken, observerToken, coverState, options = {}) {
    const aggregate = await ensureAggregateCoverEffect(effectReceiverToken, coverState, options);
    const rules = Array.isArray(aggregate.system.rules) ? [...aggregate.system.rules] : [];
    const signature = observerToken.actor.signature;
    const tokenId = observerToken.id;
    const bonus = getCoverBonusByState(coverState);

    // Remove any existing AC rule for this observer
    const withoutObserverAC = rules.filter(r => !(r?.key === 'FlatModifier' && r.selector === 'ac' && Array.isArray(r.predicate) && r.predicate.includes(`origin:signature:${signature}`)));
    // Ensure RollOption for cover-against is present
    const hasRollOption = withoutObserverAC.some(r => r?.key === 'RollOption' && r.domain === 'all' && r.option === `cover-against:${tokenId}`);
    if (!hasRollOption) {
        withoutObserverAC.push({ key: 'RollOption', domain: 'all', option: `cover-against:${tokenId}` });
    }
    // Add AC modifier for this observer
    withoutObserverAC.push({ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus, predicate: [`origin:signature:${signature}`] });

    await aggregate.update({ 'system.rules': withoutObserverAC });
    // Ensure this observer is not present in other aggregates of different states
    const otherAggregates = effectReceiverToken.actor.itemTypes.effect.filter(e => e.flags?.[MODULE_ID]?.aggregateCover === true && e.flags?.[MODULE_ID]?.coverState !== coverState);
    for (const other of otherAggregates) {
        const otherRules = Array.isArray(other.system.rules) ? other.system.rules.filter(r => {
            if (r?.key === 'FlatModifier' && r.selector === 'ac' && Array.isArray(r.predicate) && r.predicate.includes(`origin:signature:${signature}`)) return false;
            if (r?.key === 'RollOption' && r.domain === 'all' && r.option === `cover-against:${tokenId}`) return false;
            return true;
        }) : [];
        await other.update({ 'system.rules': otherRules });
    }
    // Refresh reflex/stealth distribution so only the highest-present state grants them
    await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
    // Make sure meta (name/img) reflects this aggregate's state
    await updateAggregateCoverMetaForState(aggregate, coverState);
    // Dedupe/cleanup any legacy or duplicate aggregates
    await dedupeCoverAggregates(effectReceiverToken);
}

async function removeObserverFromCoverAggregate(effectReceiverToken, observerToken) {
    const effects = effectReceiverToken.actor.itemTypes.effect.filter(e => e.flags?.[MODULE_ID]?.aggregateCover === true);
    if (effects.length === 0) return;
    const signature = observerToken.actor.signature;
    const tokenId = observerToken.id;
    for (const aggregate of effects) {
        const rules = Array.isArray(aggregate.system.rules) ? aggregate.system.rules.filter(r => {
            if (r?.key === 'FlatModifier' && r.selector === 'ac' && Array.isArray(r.predicate) && r.predicate.includes(`origin:signature:${signature}`)) return false;
            if (r?.key === 'RollOption' && r.domain === 'all' && r.option === `cover-against:${tokenId}`) return false;
            return true;
        }) : [];
        if (rules.length === 0) {
            // Avoid immediate delete; rely on prune to remove empties
            try { await aggregate.update({ 'system.rules': [] }); } catch (_) {}
        } else {
            await aggregate.update({ 'system.rules': rules });
        }
    }
    await updateReflexStealthAcrossCoverAggregates(effectReceiverToken);
    await dedupeCoverAggregates(effectReceiverToken);
}

async function pruneEmptyCoverAggregates(effectReceiverToken) {
    try {
        const candidates = effectReceiverToken.actor.itemTypes.effect.filter(e => {
            if (e.flags?.[MODULE_ID]?.aggregateCover !== true) return false;
            const rules = Array.isArray(e.system?.rules) ? e.system.rules : [];
            // Count AC rules only; RollOption/reflex/stealth don't keep aggregates alive
            const acRules = rules.filter(r => r?.key === 'FlatModifier' && r.selector === 'ac');
            return acRules.length === 0;
        });
        // Further guard: don't delete if any observer map still claims cover for this target with this state
        const targetId = effectReceiverToken.id || effectReceiverToken.document?.id;
        const observers = (canvas?.tokens?.placeables ?? []).filter(t => t?.document && t !== effectReceiverToken);
        const empties = candidates.filter(eff => {
            const state = eff.flags?.[MODULE_ID]?.coverState;
            if (!state) return true; // legacy/no-state aggregates can be safely removed
            for (const obs of observers) {
                try {
                    const covMap = obs.document.getFlag(MODULE_ID, 'cover') || {};
                    const s = covMap?.[targetId];
                    if (s && s !== 'none' && s === state) return false; // still needed per map
                } catch (_) {}
            }
            return true;
        });
        if (empties.length) {
            const ids = empties.map(e => e.id).filter(id => !!effectReceiverToken.actor.items.get(id));
            if (ids.length) await effectReceiverToken.actor.deleteEmbeddedDocuments('Item', ids);
        }
    } catch (_) {}
}
/**
 * Clean up all ephemeral cover effects from all actors
 */
export async function cleanupAllCoverEffects() {
    try {
        for (const actor of game.actors) {
            const ephemeralEffects = actor.itemTypes.effect.filter(e => 
                e.flags?.[MODULE_ID]?.isEphemeralCover
            );
            
            if (ephemeralEffects.length > 0) {
                const effectIds = ephemeralEffects.map(e => e.id);
                // Guard against already-removed items
                const existingIds = effectIds.filter(id => !!actor.items.get(id));
                if (existingIds.length > 0) {
                    try {
                        await actor.deleteEmbeddedDocuments("Item", existingIds);
                    } catch (e) {
                        // As a last resort, delete one-by-one to skip missing
                        for (const id of existingIds) {
                            if (actor.items.get(id)) {
                                try { await actor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up ephemeral cover effects:', error);
    }
}

/**
 * Clean up ephemeral cover effects for a specific observer
 * @param {Token} targetToken - The token with cover
 * @param {Token} observerToken - The observing token
 */
async function cleanupCoverEffectsForObserverUnlocked(targetToken, observerToken) {
    const ephemeralEffects = targetToken.actor.itemTypes.effect.filter(e => 
        e.flags?.[MODULE_ID]?.isEphemeralCover && 
        (e.flags?.[MODULE_ID]?.observerActorSignature === observerToken.actor.signature ||
         e.flags?.[MODULE_ID]?.observerTokenId === observerToken.id)
    );

    if (ephemeralEffects.length > 0) {
            const effectIds = ephemeralEffects.map(e => e.id);
            const existingIds = effectIds.filter(id => !!targetToken.actor.items.get(id));
            if (existingIds.length > 0) {
                try {
                    const safe = existingIds.filter(id => !!targetToken.actor.items.get(id));
                    if (safe.length) await targetToken.actor.deleteEmbeddedDocuments("Item", safe);
                } catch (e) {
                    for (const id of existingIds) {
                        if (targetToken.actor.items.get(id)) {
                            try { await targetToken.actor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                        }
                    }
                }
            }
    }
    // Also remove from aggregate rules across all states
    await removeObserverFromCoverAggregate(targetToken, observerToken);
    await pruneEmptyCoverAggregates(targetToken);
    await dedupeCoverAggregates(targetToken);
}

export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
    try {
        if (!observerToken) return;
        await runWithCoverEffectLock(targetToken.actor, async () => {
            await cleanupCoverEffectsForObserverUnlocked(targetToken, observerToken);
        });
    } catch (error) {
        console.error('Error cleaning up ephemeral cover effects for observer:', error);
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
export async function updateEphemeralCoverEffects(targetToken, observerToken, coverState, options = {}) {
    if (!targetToken?.actor || !observerToken?.actor) {
        return;
    }
    
    await runWithCoverEffectLock(targetToken.actor, async () => {
        if (options.removeAllEffects || !coverState || coverState === 'none') {
            // Already inside lock: call unlocked variant to avoid deadlock
            await cleanupCoverEffectsForObserverUnlocked(targetToken, observerToken);
            await pruneEmptyCoverAggregates(targetToken);
            return;
        }
        // Aggregate mode: add/update observer rule for the given cover state
        await addObserverToCoverAggregate(targetToken, observerToken, coverState, options);
    });
}
