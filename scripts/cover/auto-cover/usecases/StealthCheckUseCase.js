/**
 * StealthCheckUseCase.js
 * Handles stealth check contexts for auto-cover
 */

import { COVER_STATES } from '../../../constants.js';
import { getCoverImageForState, getCoverLabel, getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

export class StealthCheckUseCase extends BaseAutoCoverUseCase {

    /**
     * Handle a chat message context
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handlePreCreateChatMessage(data, doc = null) {
        try {
            // CRITICAL: Check if this message was already handled by popup wrapper
            const ctx = data?.flags?.pf2e?.context || {};
            const ctxType = ctx?.type || '';

            const speakerTokenId = this.normalizeTokenRef(data?.speaker?.token);
            const targetTokenId = this._resolveTargetTokenIdFromData(data);
            try {
                const ctx = data?.flags?.pf2e?.context || {};
                console.debug('PF2E Visioner | onPreCreateChatMessage: context', {
                    type: ctxType,
                    statistic: ctx?.statistic,
                    saveType: ctx?.save?.type,
                    saveStat: ctx?.save?.statistic,
                    traits: ctx?.traits,
                    options: ctx?.options,
                });
            } catch (_) { }

            const tokens = canvas?.tokens;
            if (!tokens?.get) return;

            let hiderTokenId = speakerTokenId;

            let hider = tokens.get(hiderTokenId);
            if (!hider) return;
            const target = tokens.get(targetTokenId);
            if (!target) return;

            // Only proceed if this user owns the hiding token or is the GM
            if (!hider.isOwner && !game.user.isGM) {
                return;
            }

            // Detect base cover state
            let state;

            // For saving throws, first check our dedicated template data map (preferred source)

            // If a stored template origin was recorded for this attacker, prefer using that point
            try {
                const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(hider.id);
                if (originRec && !state) { // Only use this if we haven't already determined state from template data
                    state = this._detectCover(originRec.point, target);
                }
            } catch (_) { }

            if (!state) {
                state = this._detectCover(hider, target);
            }

            const originalDetectedState = state;
            let wasOverridden = false;
            let overrideSource = null;
            try {
                const overrideData = this.autoCoverSystem.consumeCoverOverride(hider, target, null, false);
                if (overrideData) {
                    if (overrideData.state !== originalDetectedState) {
                        wasOverridden = true;
                        overrideSource = overrideData.source;
                    }
                    state = overrideData.state;
                }
            } catch (e) {
                console.warn('PF2E Visioner | Failed to check override manager:', e);
            }

            // Store override information in chat message flags for later display
            if (wasOverridden) {
                try {
                    if (!data.flags) data.flags = {};
                    if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
                    const overrideData = {
                        originalDetected: originalDetectedState,
                        finalState: state,
                        overrideSource: overrideSource,
                        hiderName: hider.name,
                        targetName: target.name,
                    };
                    data.flags['pf2e-visioner'].coverOverride = overrideData;

                    // Store in temporary map as backup in case flags don't persist
                    const tempKey = `${hider.id}-${target.id}-${Date.now()}`;
                    this.autoCoverSystem.setOverride(tempKey, {
                        ...overrideData,
                        hiderId: hider.id,
                        targetId: target.id,
                        timestamp: Date.now(),
                    });

                    // Also try to update the document directly if it exists
                    if (doc && doc.updateSource) {
                        try {
                            doc.updateSource({ 'flags.pf2e-visioner.coverOverride': overrideData });
                        } catch (e) {
                            console.warn('PF2E Visioner | Failed to update document source:', e);
                        }
                    }
                } catch (e) {
                    console.warn('PF2E Visioner | Failed to store override info in message flags:', e);
                }
            }

            // Apply cover if any
            if (state !== 'none') {
                await this.autoCoverSystem.setCoverBetween(hider, target, state, { skipEphemeralUpdate: true });
                this.autoCoverSystem.recordPair(hider.id, target.id);
            }
        } catch (e) {
            console.warn('PF2E Visioner | Error in onPreCreateChatMessage:', e);
        }
    }

    /**
     * Handle a check modifiers dialog context
     * @param {Object} dialog - Dialog object
     * @param {Object} ctx - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckDialog(dialog, html) {
        try {
            const ctx = dialog?.context ?? {};

            let target = null;
            let state = 'none';

            // Resolve hider (actor making the stealth check)
            const hider = ctx?.actor?.getActiveTokens?.()?.[0] || ctx?.token?.object;
            if (!hider) {
                return;
            }

            // Find the first observer the hider has cover from
            let bestObserver = null;
            let bestState = 'none';
            let coverOverride = false;

            // 2. Check override manager for existing overrides
            
            try {
                const observers = (canvas?.tokens?.placeables || [])
                    .filter((t) => t && t.actor && t.id !== hider.id);

                for (const obs of observers) {
                    const overrideData = this.autoCoverSystem.consumeCoverOverride(hider, obs, null, true);
                    if (overrideData) {
                        bestState = overrideData.state;
                        bestObserver = obs;
                        coverOverride = true;
                        break;
                    }
                }
            } catch (_) { }
            

            // If no override found, calculate cover automatically
            if (!coverOverride) {
                try {
                    const observers = (canvas?.tokens?.placeables || [])
                        .filter((t) => t && t.actor && t.id !== hider.id);
                    for (const obs of observers) {
                        const s = this._detectCover(hider, obs);
                        if (s && s !== 'none') {
                            bestObserver = obs;
                            bestState = s;
                            break; // first observer with cover
                        }
                    }
                } catch (_) { }
            }

            target = bestObserver;
            state = bestState;

            if (state !== 'none') {
                const bonus = getCoverStealthBonusByState(state) || 0;
                if (bonus > 1) {
                    // Check if cover modifier already exists in the dialog
                    const existingMods = dialog?.check?.modifiers || [];
                    const hasExistingCover = existingMods.some(m => m?.slug === 'pf2e-visioner-cover');

                    if (!hasExistingCover || hasExistingCover && coverOverride) {
                        // Create and inject the cover modifier directly into the dialog's check object
                        let coverModifier;
                        try {
                            if (game?.pf2e?.Modifier) {
                                coverModifier = new game.pf2e.Modifier({
                                    slug: 'pf2e-visioner-cover',
                                    label: getCoverLabel(state),
                                    modifier: bonus,
                                    type: 'circumstance'
                                });
                            } else {
                                coverModifier = {
                                    slug: 'pf2e-visioner-cover',
                                    label: getCoverLabel(state),
                                    modifier: bonus,
                                    type: 'circumstance'
                                };
                            }

                            // Add/update/remove the dialog's check modifier without reassigning the getter property
                            if (dialog.check && Array.isArray(dialog.check.modifiers)) {
                                const mods = dialog.check.modifiers;
                                const existing = mods.find(m => m?.slug === 'pf2e-visioner-cover');

                                // Only keep a modifier for standard/greater (bonus > 1)
                                if (bonus > 1) {
                                    const label = getCoverLabel(state);
                                    if (existing) {
                                        try { if ('modifier' in existing) existing.modifier = bonus; } catch (_) { }
                                        try { if ('value' in existing) existing.value = bonus; } catch (_) { }
                                        try { if ('label' in existing) existing.label = label; } catch (_) { }
                                        try { if ('name' in existing) existing.name = label; } catch (_) { }
                                        try { existing.enabled = true; } catch (_) { }
                                    } else {
                                        if (typeof dialog.check.push === 'function') {
                                            dialog.check.push(coverModifier);
                                        } else {
                                            mods.push(coverModifier);
                                        }
                                    }
                                } else if (existing) {
                                    const idx = mods.indexOf(existing);
                                    if (idx >= 0) mods.splice(idx, 1);
                                }

                                // Recalculate the total
                                if (typeof dialog.check.calculateTotal === 'function') {
                                    dialog.check.calculateTotal();
                                }

                                // Force the dialog to re-render to show the new modifier
                                try {
                                    dialog.render(false);
                                } catch (e) {
                                    console.warn('PF2E Visioner | Dialog re-render failed:', e);
                                }
                            }
                        } catch (e) {
                            console.warn('PF2E Visioner | Failed to inject cover modifier into dialog:', e);
                        }
                    } else {
                        console.warn('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier already exists in dialog');
                    }
                }
            }



            // Apply cover state between tokens (for both attacks and saves)
            if (hider && target && state !== 'none') {
                await this.autoCoverSystem.setCoverBetween(hider, target, state, { skipEphemeralUpdate: true });
                this.autoCoverSystem.recordPair(hider.id, target.id);
            }

            // Inject cover override UI, using a callback to apply stealth-specific behavior on chosen state
            try {
                await this.coverUIManager.injectDialogCoverUI(dialog, html, state, target, async ({ chosen, dctx, subject: hider, target: tgt, targetActor: tgtActor, originalState }) => {
                    try {
                        if (!tgtActor) return;

                        // Only store as override if the user actually changed the state
                        const wasChanged = chosen !== (originalState || state);
                        
                        if (wasChanged) {
                            // Store dialog override for this specific hider->observer pair
                            if (hider && tgt) {
                                const targetTokenId = tgt.id || tgt.token?.id || null;
                                if (targetTokenId) {
                                    this.autoCoverSystem.setDialogOverride(hider, tgt, chosen, originalState || state);
                                } else {
                                    console.warn('PF2E Visioner | Could not resolve target token ID for dialog override');
                                }
                            }

                            // Additionally store overrides for Hide/Sneak across all observers
                            if (chosen !== 'none') {
                                const observers = (canvas?.tokens?.placeables || [])
                                    .filter((t) => t && t.actor && t.id !== hider?.getActiveTokens?.()?.[0]?.id);
                                for (const obs of observers) {
                                    this.autoCoverSystem.setDialogOverride(hider?.getActiveTokens?.()?.[0], obs, chosen, originalState || state);
                                }
                            }
                        }

                        // Calculate the new bonus for the chosen state
                        const newBonus = getCoverStealthBonusByState(chosen) || 0;
                        
                        // Update the current dialog's modifiers immediately
                        if (dialog?.check?.modifiers && Array.isArray(dialog.check.modifiers)) {
                            const mods = dialog.check.modifiers;
                            const existing = mods.find(m => m?.slug === 'pf2e-visioner-cover');

                            if (newBonus > 1 || newBonus === 0) {
                                // Add or update the cover modifier
                                const label = getCoverLabel(chosen);
                                if (existing) {
                                    // Update existing modifier
                                    try { if ('modifier' in existing) existing.modifier = newBonus; } catch (_) { }
                                    try { if ('value' in existing) existing.value = newBonus; } catch (_) { }
                                    try { if ('label' in existing) existing.label = label; } catch (_) { }
                                    try { if ('name' in existing) existing.name = label; } catch (_) { }
                                    try { existing.enabled = true; } catch (_) { }
                                } else {
                                    // Add new modifier
                                    let coverModifier;
                                    try {
                                        if (game?.pf2e?.Modifier) {
                                            coverModifier = new game.pf2e.Modifier({
                                                slug: 'pf2e-visioner-cover',
                                                label: label,
                                                modifier: newBonus,
                                                type: 'circumstance'
                                            });
                                        } else {
                                            coverModifier = {
                                                slug: 'pf2e-visioner-cover',
                                                label: label,
                                                modifier: newBonus,
                                                type: 'circumstance'
                                            };
                                        }
                                        mods.push(coverModifier);
                                    } catch (e) {
                                        console.warn('PF2E Visioner | Failed to create cover modifier:', e);
                                    }
                                }
                            } else if (existing) {
                                // Remove existing modifier if bonus is 0 (none state)
                                const idx = mods.indexOf(existing);
                                if (idx >= 0) mods.splice(idx, 1);
                            }

                            // Recalculate the total
                            try {
                                if (typeof dialog.check.calculateTotal === 'function') {
                                    dialog.check.calculateTotal();
                                }
                            } catch (e) {
                                console.warn('PF2E Visioner | Failed to recalculate dialog total:', e);
                            }

                            // Force the dialog to re-render to show the new modifier
                            try {
                                dialog.render(false);
                            } catch (e) {
                                console.warn('PF2E Visioner | Dialog re-render failed:', e);
                            }
                        }

                        // Continue with the original ephemeral effect creation for the actor
                        const bonus = getCoverStealthBonusByState(chosen) || 0;
                        let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        items = items.filter(
                            (i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
                        );
                        let clonedActor = tgtActor;
                        if (bonus > 0) {
                            const label = getCoverLabel(chosen);
                            const img = getCoverImageForState(chosen);
                            const effectRules = [
                                { key: 'FlatModifier', selector: 'stealth', type: 'circumstance', value: bonus },
                            ];
                            const description = `<p>${label}: +${bonus} circumstance bonus to Stealth for this roll.</p>`;
                            items.push({
                                name: label,
                                type: 'effect',
                                system: {
                                    description: { value: description, gm: '' },
                                    rules: effectRules,
                                    traits: { otherTags: [], value: [] },
                                    level: { value: 1 },
                                    duration: { value: -1, unit: 'unlimited' },
                                    tokenIcon: { show: false },
                                    unidentified: true,
                                    start: { value: 0 },
                                    badge: null,
                                },
                                img,
                                flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
                            });
                        }
                        if (bonus > 0) {
                            clonedActor = tgtActor.clone({ items }, { keepId: true });
                        }
                        const dcObj = dctx?.dc;
                        if (dcObj?.slug) {
                            const st = (clonedActor || tgtActor).getStatistic(dcObj.slug)?.dc;
                            if (st) {
                                dcObj.value = st.value;
                                dcObj.statistic = st;
                            }
                        }
                    } catch (cbErr) {
                        console.error('PF2E Visioner | Stealth onChosen callback error:', cbErr);
                    }
                });
            } catch (e) { }
        } catch (_) { }
    }


    async onRenderChatMessage(message) {
        const data = message?.toObject?.() || {};
        const attackerIdRaw =
            data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
        const attackerId = this.normalizeTokenRef(attackerIdRaw);
        const targetId = this._resolveTargetTokenIdFromData(data);
        if (!attackerId) return;
        const tokens = canvas?.tokens;
        if (!tokens?.get) return;
        const attacker = tokens.get(attackerId);
        if (!attacker) return;

        // Only proceed if this user owns the attacking token or is the GM
        if (!attacker.isOwner && !game.user.isGM) return;

        const targetIds = targetId ? [targetId] : this.consumePairs(attackerId);
        if (targetIds.length === 0) return;
        const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
        if (targets.length === 0) return;
        try {
            for (const target of targets) {
                await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
                try {
                    await this.autoCoverSystem.cleanupCover(target, attacker);
                } catch (e) {
                    console.warn('PF2E Visioner | Failed to cleanup ephemeral cover effects:', e);
                }
            }
        } catch (_) { }
    }

    /**
     * Handle check roll context
     * @param {Object} check - Check object
     * @param {Object} context - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckRoll(check, context) {
        try {
            try {
                // Resolve the hider (actor making the stealth check)
                let hider = context?.actor?.getActiveTokens?.()?.[0] || context?.token?.object || null;
                if (!hider) hider = this._resolveStealtherFromCtx(context);
                if (hider && (hider.isOwner || game.user.isGM)) {
                    try {
                        // Check for a manual override set by the Check Modifiers dialog
                        let state = null;
                        let isOverride = false;
                        try {
                            const stealthDialog = Object.values(ui.windows).find(
                                (w) => w?.constructor?.name === 'CheckModifiersDialog',
                            );
                            if (stealthDialog?._pvCoverOverride) {
                                state = stealthDialog._pvCoverOverride;
                                isOverride = true;
                            }
                        } catch (_) { }


                        // If not overridden, evaluate cover against all other tokens and pick the best (highest stealth bonus)
                        let candidateStates = [];
                        const observers = (canvas?.tokens?.placeables || [])
                            .filter((t) => t && t.actor && t.id !== hider.id);
                        if (!state) {
                            try {
                                for (const obs of observers) {
                                    try {
                                        const s = this._detectCover(hider, obs);
                                        if (s) {
                                            candidateStates.push(s)
                                            break;
                                        };
                                    } catch (_) { }
                                }
                            } catch (_) { }
                            state = candidateStates[0];
                        }

                        try {
                            const originalState = state;
                            const popupResult = await this.coverUIManager.showPopupAndApply(state);
                            if (popupResult.chosen) {
                                state = popupResult.chosen;
                                // Only store as override if it actually changed
                                if (state !== originalState) {
                                    observers.map(obs => this.autoCoverSystem.setPopupOverride(hider, obs, state, originalState));
                                    isOverride = true;
                                }
                            };
                        } catch (e) {
                            console.warn('PF2E Visioner | Popup error (delegated):', e);
                        }
                        const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);
                        try { context._visionerStealth = { state, bonus, isOverride, source: isOverride ? 'override' : 'automatic' }; } catch (_) { }
                    } catch (e) {
                        console.warn('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | ❌ Error in popup wrapper:', e);
            }

            const coverInfo = context?._visionerStealth;
            const bonus = Number(coverInfo?.bonus) || 0;
            if (bonus > 1) {
                const state = coverInfo?.state ?? 'standard';
                // Ensure predicate support
                const optSet = new Set(Array.isArray(context.options) ? context.options : []);
                optSet.add('area-effect');
                context.options = Array.from(optSet);

                const label = getCoverLabel(state);
                let pf2eMod;
                try {
                    pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                        slug: 'pf2e-visioner-cover',
                        label,
                        modifier: bonus,
                        type: 'circumstance',
                    }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };

                } catch (_) {
                    pf2eMod = { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                }

                const already = !!(check?.modifiers && typeof check.modifiers.some === 'function' && check.modifiers.some(m => m?.slug === 'pf2e-visioner-cover'));
                if (!already && check && typeof check.push === 'function') {
                    check.push(pf2eMod);
                }
            }

            return {
                success: true,
            };
        } catch (error) {
            console.error('PF2E Visioner | StealthCheckUseCase.handleRoll error:', error);
            return { success: false };
        }
    }

    /**
     * Resolve tokens from message data
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Result with stealther and observer
     * @protected
     */
    async _resolveTokensFromMessage(data) {
        // The speaker is the stealther (token making the stealth check)
        const stealtherTokenId = this._normalizeTokenRef(data?.speaker?.token);
        const stealther = this._getToken(stealtherTokenId);

        if (!stealther) return { stealther: null, observer: null };

        // Try to determine the observer from the message data
        const observerTokenId = this._resolveObserverTokenIdFromData(data);
        const observer = observerTokenId ? this._getToken(observerTokenId) : this._findBestObserver(stealther);

        return { stealther, observer };
    }

    /**
     * Resolve observer token ID from message data
     * @param {Object} data - Message data
     * @returns {string|null}
     * @private
     */
    _resolveObserverTokenIdFromData(data) {
        if (!data) return null;

        // First, try to get target from PF2e context
        const ctx = data?.flags?.pf2e?.context || {};
        if (ctx.target?.token?.id) {
            return ctx.target.token.id;
        }

        // Next, try PF2e-toolbelt target helper
        const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
        if (Array.isArray(tbTargets) && tbTargets.length === 1) {
            return this._normalizeTokenRef(tbTargets[0]);
        }

        return null;
    }

    /**
     * Find the best observer for a stealther
     * @param {Object} stealther - Stealther token
     * @returns {Object|null} Observer token
     * @private
     */
    _findBestObserver(stealther) {
        if (!stealther || !canvas?.tokens?.placeables) return null;

        // First check if there's a currently targeted token
        if (game.user.targets.size === 1) {
            return game.user.targets.first();
        }

        // Otherwise, find the nearest hostile token
        const hostiles = canvas.tokens.placeables.filter(t =>
            t.id !== stealther.id &&
            t.actor &&
            t.document.disposition !== stealther.document.disposition
        );

        if (hostiles.length === 0) return null;

        // Find the closest hostile
        const stealtherCenter = stealther.center ?? stealther.getCenter();
        let closestToken = null;
        let closestDistance = Infinity;

        for (const token of hostiles) {
            const tokenCenter = token.center ?? token.getCenter();
            const dx = tokenCenter.x - stealtherCenter.x;
            const dy = tokenCenter.y - stealtherCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestToken = token;
            }
        }

        return closestToken;
    }

    /**
     * Resolve stealther token from stealth check context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveStealtherFromCtx(ctx) {
        try {
            const tokenObj = ctx?.token?.object || ctx?.token;
            if (tokenObj?.id) return tokenObj;
            if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
            // Try a variety of sources, including origin.token (UUID like Scene.X.Token.Y)
            const tokenIdRaw =
                ctx?.token?.id ||
                ctx?.tokenId ||
                ctx?.origin?.tokenId ||
                ctx?.origin?.token ||
                ctx?.actor?.getActiveTokens?.()?.[0]?.id;
            const tokenId = this.normalizeTokenRef(tokenIdRaw);
            return tokenId ? canvas?.tokens?.get?.(tokenId) || null : null;
        } catch (_) {
            return null;
        }
    }
}
