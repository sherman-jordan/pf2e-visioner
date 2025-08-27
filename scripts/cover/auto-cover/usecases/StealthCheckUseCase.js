/**
 * StealthCheckUseCase.js
 * Handles stealth check contexts for auto-cover
 */

import { COVER_STATES } from '../../../constants.js';
import { getCoverBonusByState, getCoverImageForState, getCoverLabel, getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { CoverUIManager } from '../CoverUIManager.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

export class StealthCheckUseCase extends BaseAutoCoverUseCase {

    constructor(autoCoverSystem) {
        super(autoCoverSystem);
        this.coverUI = new CoverUIManager(this.autoCoverSystem);
    }

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
            try {
                console.debug('PF2E Visioner | onPreCreateChatMessage: speaker/target/hider ids', {
                    speakerTokenId,
                    targetTokenId,
                    hiderTokenId,
                });
            } catch (_) { }

            // Handle area damage with multiple targets (no single target in PF2E flags)

            // Handle saving-throw with multiple targets (pf2e-toolbelt group save buttons)

            const target = tokens.get(targetTokenId);
            if (!target) return;
            console.debug('PF2E Visioner | onPreCreateChatMessage: hider/target resolved', {
                hiderId: hider?.id,
                targetId: target?.id,
            });

            // Only proceed if this user owns the hiding token or is the GM
            if (!hider.isOwner && !game.user.isGM) {
                console.debug('PF2E Visioner | onPreCreateChatMessage: skipped (no ownership and not GM)', {
                    hiderId: hider.id,
                    userIsGM: game.user.isGM,
                });
                return;
            }

            // Detect base cover state
            let state;

            // For saving throws, first check our dedicated template data map (preferred source)

            // If a stored template origin was recorded for this attacker, prefer using that point
            try {
                const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(hider.id);
                if (originRec && !state) { // Only use this if we haven't already determined state from template data
                    console.debug('PF2E Visioner | onPreCreateChatMessage: using template origin', {
                        origin: originRec.point,
                    });
                    state = this._detectCover(originRec.point, target);
                }
            } catch (_) { }

            if (!state) {
                console.debug('PF2E Visioner | onPreCreateChatMessage: using attacker center for cover');
                try {
                    const current = this.autoCoverSystem.getCoverBetween?.(hider, target);
                    console.debug('PF2E Visioner | onPreCreateChatMessage: current stored cover before compute', { current });
                } catch (_) { }
                state = this._detectCover(hider, target);
                try {
                    console.debug('PF2E Visioner | onPreCreateChatMessage: computed state via detectCoverStateForAttack', { state });
                } catch (_) { }
            }

            try {
                const bonus = getCoverBonusByState(state) || 0;
                console.debug('PF2E Visioner | onPreCreateChatMessage: computed cover', {
                    state,
                    bonus,
                });
            } catch (_) { }
            const originalDetectedState = state;
            let wasOverridden = false;
            let overrideSource = null;

            // Check for popup override first (stored in global by popup wrapper)
            try {
                if (window.pf2eVisionerPopupOverrides) {
                    debugger;
                    const overrideKey = `${hider.id}-${target.id}`;
                    const popupOverride = window.pf2eVisionerPopupOverrides.get(overrideKey);
                    if (popupOverride !== undefined) {
                        if (popupOverride !== originalDetectedState) {
                            wasOverridden = true;
                            overrideSource = 'popup';
                        }
                        state = popupOverride;
                        // Clear the override after use
                        // window.pf2eVisionerPopupOverrides.delete(overrideKey);
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | Failed to check popup override:', e);
            }

            // Check for roll dialog override (from renderCheckModifiersDialog)
            try {
                if (window.pf2eVisionerDialogOverrides) {
                    debugger;
                    // Try multiple key formats to handle different contexts
                    const possibleKeys = [
                        `${hider.actor.id}-${target.id}`, // actor ID - token ID
                        `${hider.id}-${target.id}`, // token ID - token ID
                        `${hider.actor.id}-${target.actor.id}`, // actor ID - actor ID
                        `${hider.actor.uuid}-${target.id}`, // actor UUID - token ID
                    ];

                    let dialogOverride = undefined;
                    let usedKey = null;

                    for (const key of possibleKeys) {
                        if (window.pf2eVisionerDialogOverrides.has(key)) {
                            dialogOverride = window.pf2eVisionerDialogOverrides.get(key);
                            usedKey = key;
                            break;
                        }
                    }

                    if (dialogOverride !== undefined) {
                        if (dialogOverride !== originalDetectedState) {
                            wasOverridden = true;
                            overrideSource = 'dialog';
                        }
                        state = dialogOverride;
                        // Clear the override after use
                        window.pf2eVisionerDialogOverrides.delete(usedKey);
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | Failed to check dialog override:', e);
            }

            // Store override information in chat message flags for later display
            debugger;
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
            debugger;
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

            // NEW: Handle stealth check contexts
            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: stealth check context detected', {
                type: ctx.type,
                statistic: ctx.statistic,
                domains: ctx.domains,
                actor: ctx.actor?.name
            });

            // Resolve hider (actor making the stealth check)
            const hider = ctx?.actor?.getActiveTokens?.()?.[0] || ctx?.token?.object;
            if (!hider) {
                console.debug('PF2E Visioner | onRenderCheckModifiersDialog: no hider token found for stealth check');
                return;
            }

            // Find the first observer the hider has cover from
            let bestObserver = null;
            let bestState = 'none';
            let coverOverride = false;

            // Check for cover overrides first (similar to hide action)
            // 1. Roll dialog override (highest priority)
            if (dialog?._pvCoverOverride) {
                debugger;
                bestState = dialog._pvCoverOverride;
                coverOverride = true;
                console.debug('PF2E Visioner | Stealth dialog: Found roll dialog override:', {
                    coverState: bestState,
                    dialogOverride: dialog._pvCoverOverride
                });
            }
            // 2. Global popup/dialog overrides
            else {
                try {
                    const observers = (canvas?.tokens?.placeables || [])
                        .filter((t) => t && t.actor && t.id !== hider.id);

                    for (const obs of observers) {
                        const overrideKey = `${hider.id}-${obs.id}`;

                        // Check popup override
                        if (window.pf2eVisionerPopupOverrides?.has(overrideKey)) {
                            debugger;
                            bestState = window.pf2eVisionerPopupOverrides.get(overrideKey);
                            bestObserver = obs;
                            coverOverride = true;
                            console.debug('PF2E Visioner | Stealth dialog: Found popup override:', {
                                overrideKey,
                                coverState: bestState
                            });
                            // window.pf2eVisionerPopupOverrides?.delete(overrideKey);
                            break;
                        }
                        // Check global dialog override
                        else if (window.pf2eVisionerDialogOverrides?.has(overrideKey)) {
                            debugger;
                            bestState = window.pf2eVisionerDialogOverrides.get(overrideKey);
                            bestObserver = obs;
                            coverOverride = true;
                            console.debug('PF2E Visioner | Stealth dialog: Found global dialog override:', {
                                overrideKey,
                                coverState: bestState
                            });
                            window.pf2eVisionerDialogOverrides.delete(overrideKey);
                            break;
                        }
                    }
                } catch (_) { }
            }

            // If no override found, calculate cover automatically
            debugger;
            if (!coverOverride) {
                try {
                    const observers = (canvas?.tokens?.placeables || [])
                        .filter((t) => t && t.actor && t.id !== hider.id);
                    for (const obs of observers) {
                        const s = this._detectCover(hider, obs);
                        debugger;
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

            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: stealth tokens resolved', {
                hiderId: hider?.id,
                observerId: target?.id,
                state
            });

            debugger;
            if (state !== 'none') {
                const bonus = getCoverStealthBonusByState(state) || 0;
                if (bonus > 1) {
                    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: injecting cover modifier for stealth check', {
                        state,
                        bonus
                    });
                    // Persist for downstream Hide outcome adjustments
                    try {
                        if (typeof window !== 'undefined') {
                            window.pf2eVisionerStealthLast = { state, bonus, ts: Date.now(), source: 'dialog' };
                        }
                    } catch (_) { }

                    // Check if cover modifier already exists in the dialog
                    const existingMods = dialog?.check?.modifiers || [];
                    const hasExistingCover = existingMods.some(m => m?.slug === 'pf2e-visioner-cover');

                    debugger;
                    if (!hasExistingCover || hasExistingCover && coverOverride) {
                        // Create and inject the cover modifier directly into the dialog's check object
                        let coverModifier;
                        try {
                            if (game?.pf2e?.Modifier) {
                                debugger;
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
                            debugger;
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

                                console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier injected into dialog check', {
                                    modifier: coverModifier,
                                    totalModifiers: dialog.check.modifiers.length,
                                    newTotal: dialog.check.totalModifier
                                });

                                // Force the dialog to re-render to show the new modifier
                                try {
                                    dialog.render(false);
                                    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: dialog re-rendered with cover modifier');
                                } catch (e) {
                                    console.debug('PF2E Visioner | Dialog re-render failed:', e);
                                }
                            }
                        } catch (e) {
                            console.warn('PF2E Visioner | Failed to inject cover modifier into dialog:', e);
                        }
                    } else {
                        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier already exists in dialog');
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
                await this.coverUI.injectDialogCoverUI(dialog, html, state, target, async ({ chosen, dctx, subject: hider, target: tgt, targetActor: tgtActor }) => {
                    try {
                        if (!tgtActor) return;

                        // Persist dialog override for this specific hider->observer pair
                        if (!window.pf2eVisionerDialogOverrides)
                            window.pf2eVisionerDialogOverrides = new Map();
                        debugger;
                        if (hider && tgt) {
                            const targetTokenId = tgt.id || tgt.token?.id || null;
                            if (targetTokenId) {
                                const overrideKeys = [
                                    `${hider.id}-${targetTokenId}`,
                                    `${hider.uuid}-${targetTokenId}`,
                                ];
                                for (const overrideKey of overrideKeys) {
                                    window.pf2eVisionerDialogOverrides.set(overrideKey, chosen);
                                }
                            } else {
                                console.warn('PF2E Visioner | Could not resolve target token ID for dialog override');
                            }
                        }


                        // Additionally store overrides for Hide/Sneak across all observers
                        if (chosen !== 'none') {
                            const observers = (canvas?.tokens?.placeables || [])
                                .filter((t) => t && t.actor && t.id !== hider?.getActiveTokens?.()?.[0]?.id);
                            for (const obs of observers) {
                                const hideActionKey = `${hider?.getActiveTokens?.()?.[0]?.id}-${obs.id}`;
                                window.pf2eVisionerDialogOverrides.set(hideActionKey, chosen);
                            }
                        }

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
        // Allow all users to clean up their own effects
        // GM can clean up any effects

        if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
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
                // Remove ephemeral cover effects for this specific attacker
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
                                console.debug('PF2E Visioner | Stealth cover candidates', candidateStates);
                            } catch (_) { }
                            state = candidateStates[0];
                        }

                        try {
                            // Only show popup if keybind is held
                            const popupResult = await this.coverUI.showPopupAndApply(state);
                            if (popupResult.chosen) {
                                state = popupResult.chosen
                                if (!window.pf2eVisionerPopupOverrides) {
                                    window.pf2eVisionerPopupOverrides = new Map();
                                }
                                observers.map(obs => window.pf2eVisionerPopupOverrides.set(`${hider.id}-${obs.id}`, state));

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
