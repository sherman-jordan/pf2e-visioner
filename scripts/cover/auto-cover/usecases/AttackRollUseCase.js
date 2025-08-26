/**
 * AttackRollUseCase.js
 * Handles attack roll contexts for auto-cover
 */

import { COVER_STATES, MODULE_ID } from '../../../constants.js';
import { getCoverBonusByState, getCoverImageForState, getCoverLabel } from '../../../helpers/cover-helpers.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
export class AttackRollUseCase extends BaseAutoCoverUseCase {
    /**
     * Handle a chat message context
     * @param {Object} data - Message data
     * @param {Object} doc - Message document (optional)
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handlePreCreateChatMessage(data, doc = null) {
        try {
            if (!game.settings.get('pf2e-visioner', 'autoCover')) return;

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

            // Determine attacker differently for saving throws: the speaker is the defender
            let attackerSource = 'speaker';
            let attackerTokenId = speakerTokenId;

            let attacker = tokens.get(attackerTokenId);
            if (!attacker) return;
            try {
                console.debug('PF2E Visioner | onPreCreateChatMessage: speaker/target/attacker ids', {
                    speakerTokenId,
                    targetTokenId,
                    attackerTokenId,
                    attackerSource,
                });
            } catch (_) { }

            // Handle area damage with multiple targets (no single target in PF2E flags)
            if (!targetTokenId && ctxType === 'damage-roll') {
                let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
                // If toolbelt didn't attach targets yet, try our recent cache from template placement
                if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
                    try {
                        const out = [];
                        for (const k of (window?.pf2eVisionerTemplateCoverByTarget || new Map()).keys()) {
                            const [attId, tgtId] = String(k).split('-');
                            if (attId === attacker.id && tgtId) out.push(tgtId);
                        }
                        if (out.length > 0) tbTargets = out;
                    } catch (_) { }
                }
                if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
                    console.debug('PF2E Visioner | damage-roll: no targets found (pf2e/pf2e-toolbelt/cache)');
                    return;
                }
                console.debug('PF2E Visioner | damage-roll: applying cover for multiple targets', {
                    count: tbTargets.length,
                });
                let originPoint = null;
                try {
                    const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
                    if (originRec) {
                        originPoint = originRec.point;
                        console.debug('PF2E Visioner | damage-roll: found recent template origin', {
                            origin: originPoint,
                            tsAgeMs: Date.now() - (originRec?.ts || 0),
                        });
                    }
                } catch (_) { }
                for (const tRef of tbTargets) {
                    const tid = this.normalizeTokenRef(tRef);
                    const tgt = tid ? tokens.get(tid) : null;
                    if (!tgt) continue;
                    let state;
                    // Prefer cached placement cover state if available
                    try {
                        const key = `${attacker.id}-${tgt.id}`;
                        const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
                        if (rec?.state) {
                            state = rec.state;
                            console.debug('PF2E Visioner | damage-roll: using cached placement cover', { targetId: tgt.id, state, bonus: rec?.bonus, origin: rec?.origin });
                        }
                    } catch (_) { }
                    // Fallback: compute from stored origin or attacker center
                    if (!state) {
                        try {
                            if (originPoint) {
                                console.debug('PF2E Visioner | damage-roll: using template origin for target', {
                                    targetId: tgt.id,
                                    origin: originPoint,
                                });
                                state = this._detectCover(originPoint, tgt);
                            }
                        } catch (_) { }
                    }
                    if (!state) state = this._detectCover(attacker, tgt);
                    // Log computed cover with bonus
                    try {
                        const { getCoverBonusByState } = await import('../../../helpers/cover-helpers.js');
                        const bonus = getCoverBonusByState(state) || 0;
                        console.debug('PF2E Visioner | damage-roll: computed cover', {
                            targetId: tgt.id,
                            state,
                            bonus,
                        });
                    } catch (_) { }
                    // Apply without ephemeral update; damage messages are not attack checks
                    try {
                        await this.autoCoverSystem.setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
                        console.debug('PF2E Visioner | damage-roll: setCoverBetween applied', {
                            attackerId: attacker.id,
                            targetId: tgt.id,
                            state,
                        });
                        try {
                            Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                                observerId: attacker.id,
                                targetId: tgt.id,
                                state,
                            });
                        } catch (_) { }
                    } catch (e) {
                        console.warn('PF2E Visioner | damage-roll: failed to set cover for target', tgt?.id, e);
                    }
                }
                // We handled multi-target damage here; stop further single-target flow
                return;
            }

            // Handle saving-throw with multiple targets (pf2e-toolbelt group save buttons)

            const target = tokens.get(targetTokenId);
            if (!target) return;
            console.debug('PF2E Visioner | onPreCreateChatMessage: attacker/target resolved', {
                attackerId: attacker?.id,
                targetId: target?.id,
            });


            // Only proceed if this user owns the attacking token or is the GM
            if (!attacker.isOwner && !game.user.isGM) {
                console.debug('PF2E Visioner | onPreCreateChatMessage: skipped (no ownership and not GM)', {
                    attackerId: attacker.id,
                    userIsGM: game.user.isGM,
                });
                return;
            }

            // Detect base cover state
            let state;

            // For saving throws, first check our dedicated template data map (preferred source)

            // If a stored template origin was recorded for this attacker, prefer using that point
            try {
                const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
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
                    const current = this.autoCoverSystem.getCoverBetween?.(attacker, target);
                    console.debug('PF2E Visioner | onPreCreateChatMessage: current stored cover before compute', { current });
                } catch (_) { }
                state = this._detectCover(attacker, target);
                try {
                    console.debug('PF2E Visioner | onPreCreateChatMessage: computed state via detectCoverStateForAttack', { state });
                } catch (_) { }
            }

            // Reflex save chat-message injection no longer needed; handled by roll wrapper
            // Intentionally left blank here to avoid duplication in message flags

            try {
                const { getCoverBonusByState } = await import('../../../helpers/cover-helpers.js');
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
                    const overrideKey = `${attacker.id}-${target.id}`;
                    const popupOverride = window.pf2eVisionerPopupOverrides.get(overrideKey);
                    if (popupOverride !== undefined) {
                        if (popupOverride !== originalDetectedState) {
                            wasOverridden = true;
                            overrideSource = 'popup';
                        }
                        state = popupOverride;
                        // Clear the override after use
                        window.pf2eVisionerPopupOverrides.delete(overrideKey);
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | Failed to check popup override:', e);
            }

            // Check for roll dialog override (from renderCheckModifiersDialog)
            try {
                if (window.pf2eVisionerDialogOverrides) {
                    // Try multiple key formats to handle different contexts
                    const possibleKeys = [
                        `${attacker.actor.id}-${target.id}`, // actor ID - token ID
                        `${attacker.id}-${target.id}`, // token ID - token ID
                        `${attacker.actor.id}-${target.actor.id}`, // actor ID - actor ID
                        `${attacker.actor.uuid}-${target.id}`, // actor UUID - token ID
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
            if (wasOverridden) {
                try {
                    if (!data.flags) data.flags = {};
                    if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
                    const overrideData = {
                        originalDetected: originalDetectedState,
                        finalState: state,
                        overrideSource: overrideSource,
                        attackerName: attacker.name,
                        targetName: target.name,
                    };
                    data.flags['pf2e-visioner'].coverOverride = overrideData;

                    // Store in temporary map as backup in case flags don't persist
                    const tempKey = `${attacker.id}-${target.id}-${Date.now()}`;
                    this.autoCoverSystem.storeOverride(tempKey, {
                        ...overrideData,
                        attackerId: attacker.id,
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
                await this.autoCoverSystem.setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
                try {
                    Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                        observerId: attacker.id,
                        targetId: target.id,
                        state,
                    });
                } catch (_) { }
                this.autoCoverSystem.recordPair(attacker.id, target.id);
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

        const ctx = dialog?.context || {};

        let attacker = null;
        let target = null;
        let state = 'none';

        // Original attack logic
        attacker = this._resolveAttackerFromCtx(ctx);
        target = this._resolveTargetFromCtx(ctx);
        if (!attacker || !target) return;
        state = this._detectCover(attacker, target);


        // Apply cover state between tokens (for both attacks and saves)
        if (attacker && target && state !== 'none') {
            await this.autoCoverSystem.setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
            try {
                Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                    observerId: attacker.id,
                    targetId: target.id,
                    state,
                });
            } catch (_) { }
            this.autoCoverSystem.recordPair(attacker.id, target.id);
        }

        // Inject cover override UI (GM-only): buttons for None/Lesser/Standard/Greater with icons
        try {
            if (html?.find?.('.pv-cover-override').length === 0) {
                const current = dialog?._pvCoverOverride ?? state ?? 'none';
                const container = $(`
                  <div class="pv-cover-override" style="margin: 6px 0 8px 0;">
                    <div class="pv-cover-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                      <div class="pv-cover-title" style="font-weight:600;">${game.i18n?.localize?.('PF2E_VISIONER.UI.COVER_OVERRIDE') ?? 'Cover'}</div>
                      <div class="pv-cover-buttons" style="display:flex; gap:6px;"></div>
                    </div>
                  </div>
                `);
                const btns = container.find('.pv-cover-buttons');
                const states = ['none', 'lesser', 'standard', 'greater'];
                for (const s of states) {
                    const label = getCoverLabel(s);
                    // Use appropriate bonus function based on context
                    const bonus =
                        getCoverBonusByState(s);
                    const isActive = s === current;
                    const cfg = COVER_STATES?.[s] || {};
                    const iconClass =
                        cfg.icon ||
                        (s === 'none'
                            ? 'fas fa-shield-slash'
                            : s === 'lesser'
                                ? 'fa-regular fa-shield'
                                : s === 'standard'
                                    ? 'fas fa-shield-alt'
                                    : 'fas fa-shield');
                    const color = cfg.color || 'inherit';
                    const tooltip = `${label}${bonus > 0 ? ` (+${bonus})` : ''}`;
                    const btn = $(`
                    <button type="button" class="pv-cover-btn" data-state="${s}" title="${tooltip}" data-tooltip="${tooltip}" data-tooltip-direction="UP" aria-label="${tooltip}" style="width:28px; height:28px; padding:0; line-height:0; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:${isActive ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))' : 'transparent'}; color:inherit; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
                      <i class="${iconClass}" style="color:${color}; display:block; width:18px; height:18px; line-height:18px; text-align:center; font-size:16px; margin:0;"></i>
                    </button>
                  `);
                    if (isActive) btn.addClass('active');
                    btns.append(btn);
                }

                const anchor = html.find('.roll-mode-panel');
                if (anchor.length > 0) anchor.before(container);
                else html.find('.dialog-buttons').before(container);
                dialog.setPosition();
                container.on('click', '.pv-cover-btn', (ev) => {
                    try {
                        const btn = ev.currentTarget;
                        const sel = btn?.dataset?.state || 'none';
                        const oldOverride = dialog._pvCoverOverride;
                        dialog._pvCoverOverride = sel;

                        console.debug('PF2E Visioner | Cover override button clicked:', {
                            selectedState: sel,
                            oldOverride,
                            newOverride: dialog._pvCoverOverride,
                            dialogId: dialog.id,
                            dialogTitle: dialog.title
                        });

                        container.find('.pv-cover-btn').each((_, el) => {
                            const active = el.dataset?.state === sel;
                            el.classList.toggle('active', active);
                            el.style.background = active
                                ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))'
                                : 'transparent';
                        });
                    } catch (e) {
                        console.error('PF2E Visioner | Error in cover override button click:', e);
                    }
                });
            }
        } catch (_) { }

        // Ensure current roll uses selected (or auto) cover via dialog injection
        try {
            const rollBtnEl = html?.find?.('button.roll')?.[0];
            console.debug('PF2E Visioner | Looking for roll button:', {
                foundButton: !!rollBtnEl,
                buttonId: rollBtnEl?.id,
                alreadyBound: rollBtnEl?.dataset?.pvCoverBind,
                dialogId: dialog.id,
            });

            if (rollBtnEl && !rollBtnEl.dataset?.pvCoverBind) {
                rollBtnEl.dataset.pvCoverBind = '1';
                rollBtnEl.addEventListener(
                    'click',
                    () => {
                        try {
                            const dctx = dialog?.context || {};
                            const tgt = dctx?.target;
                            const tgtActor = tgt?.actor;
                            if (!tgtActor) return;
                            const chosen = dialog?._pvCoverOverride ?? state ?? 'none';

                            console.debug('PF2E Visioner | Roll button clicked with override:', {
                                chosen,
                                dialogOverride: dialog?._pvCoverOverride,
                                dialogId: dialog.id
                            });

                            // Store the dialog override for onPreCreateChatMessage to use
                            // We'll store it in a temporary global that gets picked up by the message creation
                            if (!window.pf2eVisionerDialogOverrides)
                                window.pf2eVisionerDialogOverrides = new Map();
                            const attacker = dctx?.actor;
                            if (attacker && tgt) {
                                // Get the proper target token ID - try multiple sources
                                const targetTokenId = tgt.id || tgt.token?.id || target?.id;

                                if (targetTokenId) {
                                    // Use multiple key formats to ensure compatibility
                                    const overrideKeys = [
                                        `${attacker.id}-${targetTokenId}`, // actor ID - token ID
                                        `${attacker.uuid}-${targetTokenId}`, // actor UUID - token ID (fallback)
                                    ];

                                    for (const overrideKey of overrideKeys) {
                                        window.pf2eVisionerDialogOverrides.set(overrideKey, chosen);
                                        console.debug('PF2E Visioner | Stored dialog override:', {
                                            key: overrideKey,
                                            value: chosen,
                                        });
                                    }
                                } else {
                                    console.warn(
                                        'PF2E Visioner | Could not resolve target token ID for dialog override',
                                    );
                                }
                            }

                            // For stealth checks, also store a direct override for the hide action


                            const bonus =
                                getCoverBonusByState(chosen) || 0;
                            let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                            // Always remove any previous Visioner one-shot cover effect to ensure override takes precedence
                            items = items.filter(
                                (i) =>
                                    !(
                                        i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                                    ),
                            );
                            if (bonus > 0) {
                                const label = getCoverLabel(chosen);
                                const img = getCoverImageForState(chosen);

                                // Create appropriate effect based on context
                                const effectRules = [];

                                // For attack/reflex contexts, add AC and reflex bonuses
                                effectRules.push(
                                    {
                                        key: 'FlatModifier',
                                        selector: 'ac',
                                        type: 'circumstance',
                                        value: bonus,
                                    }
                                );


                                const description =
                                    `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`;

                                items.push({
                                    name: label,
                                    type: 'effect',
                                    system: {
                                        description: {
                                            value: description,
                                            gm: '',
                                        },
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
                            tgt.actor = tgtActor.clone({ items }, { keepId: true });
                            const dcObj = dctx.dc;
                            if (dcObj?.slug) {
                                const st = tgt.actor.getStatistic(dcObj.slug)?.dc;
                                if (st) {
                                    dcObj.value = st.value;
                                    dcObj.statistic = st;
                                }
                            }
                        } catch (_) { }
                    },
                    true,
                );
            }
        } catch (e) {
            // Add more detailed error logging for better troubleshooting
            // This is a fix for the missing catch/finally error
            console.error('PF2E Visioner | Error in dialog roll button handler:', e);
        }
    }

    async handleRenderChatMessage(message) {
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

        // Post-create handling for damage rolls: toolbelt targets are available now
        try {
            const ctxType = data?.flags?.pf2e?.context?.type || '';
            if (!targetId && ctxType === 'damage-roll') {
                let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
                if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
                    try {
                        const out = [];
                        for (const k of (window?.pf2eVisionerTemplateCoverByTarget || new Map()).keys()) {
                            const [attId, tgtId] = String(k).split('-');
                            if (attId === attacker.id && tgtId) out.push(tgtId);
                        }
                        if (out.length > 0) tbTargets = out;
                    } catch (_) { }
                }
                if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
                    console.debug('PF2E Visioner | onRenderChatMessage damage-roll: no targets (pf2e/pf2e-toolbelt/cache)');
                    return;
                }
                console.debug('PF2E Visioner | onRenderChatMessage damage-roll: applying cover for multiple targets', {
                    count: tbTargets.length,
                });
                let originPoint = null;
                try {
                    const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
                    if (originRec) originPoint = originRec.point;
                } catch (_) { }
                for (const tRef of tbTargets) {
                    const tid = this.normalizeTokenRef(tRef);
                    const tgt = tid ? tokens.get(tid) : null;
                    if (!tgt) continue;
                    let state;
                    try {
                        const key = `${attacker.id}-${tgt.id}`;
                        const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
                        if (rec?.state) {
                            state = rec.state;
                            console.debug('PF2E Visioner | onRenderChatMessage damage-roll: using cached placement cover', {
                                targetId: tgt.id,
                                state,
                            });
                        }
                    } catch (_) { }
                    if (!state) {
                        try {
                            if (originPoint) {
                                state = this._detectCover(originPoint, tgt);
                            }
                        } catch (_) { }
                    }
                    if (!state) state = this._detectCover(attacker, tgt);
                    try {
                        const bonus = getCoverBonusByState(state) || 0;
                        console.debug('PF2E Visioner | onRenderChatMessage damage-roll: computed cover', {
                            targetId: tgt.id,
                            state,
                            bonus,
                        });
                    } catch (_) { }
                    try {
                        await this.autoCoverSystem.setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
                        try {
                            Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                                observerId: attacker.id,
                                targetId: tgt.id,
                                state,
                            });
                        } catch (_) { }
                    } catch (e) {
                        console.warn('PF2E Visioner | onRenderChatMessage damage-roll: failed to set cover for target', tgt?.id, e);
                    }
                }
                // We've applied cover for all damage targets; skip the generic cleanup block
                return;
            }
        } catch (_) { }


        // Only proceed if this user owns the attacking token or is the GM
        if (!attacker.isOwner && !game.user.isGM) return;

        const targetIds = targetId ? [targetId] : this.autoCoverSystem.consumePairs(attackerId);
        if (targetIds.length === 0) return;
        const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
        if (targets.length === 0) return;
        try {
            for (const target of targets) {
                await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
                try {
                    Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                        observerId: attacker.id,
                        targetId: target.id,
                        state: 'none',
                    });
                } catch (_) { }
                // Remove ephemeral cover effects for this specific attacker
                try {
                    this.autoCoverSystem.cleanupCover(target, attacker);
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
            // CRITICAL DEBUG: Always log entry to verify wrapper is executing
            console.debug('PF2E Visioner | 🔧 POPUP WRAPPER ENTRY', {
                contextType: context?.type,
                contextStatistic: context?.statistic,
                contextDomains: context?.domains,
                contextActor: context?.actor?.name,
                hasCheck: !!check,
                autoCoverEnabled: game?.settings?.get?.(MODULE_ID, 'autoCover')
            });

            try {
                // Handle both attack contexts AND reflex save contexts

                console.debug('PF2E Visioner | 🎯 CONTEXT ANALYSIS', {

                    contextType: context?.type,
                    contextStatistic: context?.statistic,
                    contextDomains: context?.domains,
                });

                // CRITICAL: Handle reflex saves FIRST since they can also be detected as attack contexts
                console.debug('PF2E Visioner | 🎯 HANDLING ATTACK CONTEXT');
                const attacker = this._resolveAttackerFromCtx(context);
                const target = this._resolveTargetFromCtx(context);

                if (attacker && target && (attacker.isOwner || game.user.isGM)) {
                    // Ensure visibility-driven off-guard ephemerals are up-to-date on defender before any DC calculation
                    try {
                        const { getVisibilityBetween, setVisibilityBetween } = await import(
                            '../../../utils.js'
                        );
                        const currentVisEarly = getVisibilityBetween(attacker, target);
                        await setVisibilityBetween(attacker, target, currentVisEarly, {
                            skipEphemeralUpdate: false,
                            direction: 'observer_to_target',
                        });
                    } catch (_) { }
                    // Check for custom keybind - ONLY show popup when keybind is held
                    const isHoldingCoverOverrideKey = () => {
                        try {
                            const keybinding = game.keybindings.get(MODULE_ID, 'holdCoverOverride');
                            if (!keybinding?.[0]) {
                                return false;
                            }

                            const binding = keybinding[0];

                            // Check current keyboard state using game.keyboard
                            const keyboard = game.keyboard;
                            if (!keyboard) {
                                return false;
                            }

                            // Convert key code to the format used by keyboard manager
                            let keyCode = binding.key;
                            if (keyCode.startsWith('Key')) {
                                keyCode = keyCode.replace('Key', ''); // 'KeyX' -> 'X'
                            }

                            const isKeyPressed =
                                keyboard.downKeys.has(keyCode) || keyboard.downKeys.has(binding.key);
                            const isCtrlPressed =
                                keyboard.downKeys.has('Control') ||
                                keyboard.downKeys.has('ControlLeft') ||
                                keyboard.downKeys.has('ControlRight');
                            const isAltPressed =
                                keyboard.downKeys.has('Alt') ||
                                keyboard.downKeys.has('AltLeft') ||
                                keyboard.downKeys.has('AltRight');
                            const isShiftPressed =
                                keyboard.downKeys.has('Shift') ||
                                keyboard.downKeys.has('ShiftLeft') ||
                                keyboard.downKeys.has('ShiftRight');
                            const isMetaPressed =
                                keyboard.downKeys.has('Meta') ||
                                keyboard.downKeys.has('MetaLeft') ||
                                keyboard.downKeys.has('MetaRight');

                            const keyMatch = isKeyPressed;
                            const ctrlMatch =
                                isCtrlPressed === (binding.modifiers?.includes('Control') || false);
                            const altMatch = isAltPressed === (binding.modifiers?.includes('Alt') || false);
                            const shiftMatch =
                                isShiftPressed === (binding.modifiers?.includes('Shift') || false);
                            const metaMatch =
                                isMetaPressed === (binding.modifiers?.includes('Meta') || false);

                            const matches = keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;

                            return matches;
                        } catch (e) {
                            console.warn('PF2E Visioner | Error checking keybind:', e);
                            return false;
                        }
                    };

                    const isHoldingOverrideKey = isHoldingCoverOverrideKey();
                    const shouldShowPopup = isHoldingOverrideKey; // Only show popup when keybind is held

                    if (shouldShowPopup) {
                        const state = this._detectCover(attacker, target);
                        try {
                            const { openCoverQuickOverrideDialog } = await import(
                                '../cover/quick-override-dialog.js'
                            );
                            const chosen = await openCoverQuickOverrideDialog(state);

                            if (chosen !== null) {
                                // Store the override for onPreCreateChatMessage
                                if (!window.pf2eVisionerPopupOverrides)
                                    window.pf2eVisionerPopupOverrides = new Map();
                                const overrideKey = `${attacker.id}-${target.id}`;
                                window.pf2eVisionerPopupOverrides.set(overrideKey, chosen);

                                // Apply the cover effect to the target actor NOW (before roll calculation)
                                const bonus = getCoverBonusByState(chosen) || 0;

                                if (bonus > 0) {
                                    // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                                    const tgtActor = target.actor;
                                    const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                                    // Remove any existing one-roll cover effects we may have added
                                    const filteredItems = items.filter(
                                        (i) =>
                                            !(
                                                i?.type === 'effect' &&
                                                i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                                            ),
                                    );
                                    const { getCoverLabel, getCoverImageForState } = await import(
                                        '../../../helpers/cover-helpers.js'
                                    );
                                    const label = getCoverLabel(chosen);
                                    const img = getCoverImageForState(chosen);
                                    filteredItems.push({
                                        name: label,
                                        type: 'effect',
                                        system: {
                                            description: {
                                                value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                                                gm: '',
                                            },
                                            rules: [
                                                {
                                                    key: 'FlatModifier',
                                                    selector: 'ac',
                                                    type: 'circumstance',
                                                    value: bonus,
                                                }
                                            ],
                                            traits: { otherTags: [], value: [] },
                                            level: { value: 1 },
                                            duration: { value: -1, unit: 'unlimited' },
                                            tokenIcon: { show: false },
                                            unidentified: false,
                                            start: { value: 0 },
                                            badge: null,
                                        },
                                        img,
                                        flags: {
                                            'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true },
                                        },
                                    });
                                    // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                                    try {
                                        const { getVisibilityBetween } = await import(
                                            '../../../stores/visibility-map.js'
                                        );
                                        const visState = getVisibilityBetween(target, attacker);
                                        if (['hidden', 'undetected'].includes(visState)) {
                                            const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                                            filteredItems.push({
                                                name: `Off-Guard (${reason})`,
                                                type: 'effect',
                                                system: {
                                                    description: {
                                                        value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                                        gm: '',
                                                    },
                                                    rules: [
                                                        {
                                                            key: 'FlatModifier',
                                                            selector: 'ac',
                                                            type: 'circumstance',
                                                            value: -2,
                                                        },
                                                    ],
                                                    traits: { otherTags: [], value: [] },
                                                    level: { value: 1 },
                                                    duration: { value: -1, unit: 'unlimited' },
                                                    tokenIcon: { show: false },
                                                    unidentified: false,
                                                    start: { value: 0 },
                                                    badge: null,
                                                },
                                                img: 'icons/svg/terror.svg',
                                                flags: {
                                                    'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                                                },
                                            });
                                        }
                                    } catch (_) { }
                                    const clonedActor = tgtActor.clone(
                                        { items: filteredItems },
                                        { keepId: true },
                                    );
                                    const dcObj = context.dc;
                                    if (dcObj?.slug) {
                                        const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                                        if (clonedStat) {
                                            dcObj.value = clonedStat.value;
                                            dcObj.statistic = clonedStat;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('PF2E Visioner | Popup error:', e);
                        }
                    } else {
                        // No popup - apply automatic cover detection
                        const state = this._detectCover(attacker, target);

                        if (state !== 'none') {
                            // Apply the cover effect automatically
                            const bonus = getCoverBonusByState(state) || 0;

                            if (bonus > 0) {
                                // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                                const tgtActor = target.actor;
                                const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                                // Remove any existing one-roll cover effects we may have added
                                const filteredItems = items.filter(
                                    (i) =>
                                        !(
                                            i?.type === 'effect' &&
                                            i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                                        ),
                                );
                                const { getCoverLabel, getCoverImageForState } = await import(
                                    '../../../helpers/cover-helpers.js'
                                );
                                const label = getCoverLabel(state);
                                const img = getCoverImageForState(state);
                                filteredItems.push({
                                    name: label,
                                    type: 'effect',
                                    system: {
                                        description: {
                                            value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                                            gm: '',
                                        },
                                        rules: [
                                            {
                                                key: 'FlatModifier',
                                                selector: 'ac',
                                                type: 'circumstance',
                                                value: bonus,
                                            }
                                        ],
                                        traits: { otherTags: [], value: [] },
                                        level: { value: 1 },
                                        duration: { value: -1, unit: 'unlimited' },
                                        tokenIcon: { show: false },
                                        unidentified: false,
                                        start: { value: 0 },
                                        badge: null,
                                    },
                                    img,
                                    flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
                                });
                                // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                                try {
                                    const { getVisibilityBetween } = await import(
                                        '../stores/visibility-map.js'
                                    );
                                    const visState = getVisibilityBetween(target, attacker);
                                    if (['hidden', 'undetected'].includes(visState)) {
                                        const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                                        filteredItems.push({
                                            name: `Off-Guard (${reason})`,
                                            type: 'effect',
                                            system: {
                                                description: {
                                                    value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                                    gm: '',
                                                },
                                                rules: [
                                                    {
                                                        key: 'FlatModifier',
                                                        selector: 'ac',
                                                        type: 'circumstance',
                                                        value: -2,
                                                    },
                                                ],
                                                traits: { otherTags: [], value: [] },
                                                level: { value: 1 },
                                                duration: { value: -1, unit: 'unlimited' },
                                                tokenIcon: { show: false },
                                                unidentified: false,
                                                start: { value: 0 },
                                                badge: null,
                                            },
                                            img: 'icons/svg/terror.svg',
                                            flags: {
                                                'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                                            },
                                        });
                                    }
                                } catch (_) { }
                                const clonedActor = tgtActor.clone(
                                    { items: filteredItems },
                                    { keepId: true },
                                );
                                const dcObj = context.dc;
                                if (dcObj?.slug) {
                                    const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                                    if (clonedStat) {
                                        dcObj.value = clonedStat.value;
                                        dcObj.statistic = clonedStat;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('PF2E Visioner | ❌ Error in popup wrapper:', e);
            }

            console.debug('PF2E Visioner | 🏁 POPUP WRAPPER CALLING ORIGINAL', {
                contextType: context?.type,
                finalContextActor: context?.actor?.name
            });

            // Diagnostic: dump the cover override state and any modifiers attached to the Check
            try {
                console.debug('PF2E Visioner | POPUP WRAPPER DIAGNOSTIC', {
                    coverOverrideState: context?.coverOverrideState,
                    checkModifiers: Array.isArray(check?.modifiers) ? check.modifiers.map(m => ({ label: m?.label || m?.name || null, modifier: m?.modifier ?? m?.value ?? null })) : check?.modifiers
                });
            } catch (diagErr) {
                console.debug('PF2E Visioner | POPUP WRAPPER DIAGNOSTIC: failed to print modifiers', diagErr);
            }
            return {
                success: true,
            };
        } catch (error) {
            this._log('handleRoll', 'Error processing attack roll', { error }, 'error');
            return { success: false };
        }
    }


    /**
     * Update cover effects for an override
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {string} overrideState - Override cover state
     * @returns {Promise<boolean>} Success status
     */
    async updateCoverForOverride(attacker, target, overrideState) {
        this._log('updateCoverForOverride', 'Updating cover effects for override', {
            attacker: attacker.name,
            target: target.name,
            overrideState
        });

        return await this._applyCoverEffects(target, overrideState, 'override');
    }
    /**
     * Resolve target token ID from message data
     * @param {Object} data - Message data
     * @returns {string|null}
     * @private
     */
    _resolveTargetTokenIdFromData(data) {
        try {
            const pf2eTarget = data?.flags?.pf2e?.context?.target?.token ?? data?.flags?.pf2e?.target?.token;
            if (pf2eTarget) {
                try {
                    console.debug('PF2E Visioner | target-resolve: pf2e.context.target.token', { value: pf2eTarget });
                } catch (_) { }
                return this.normalizeTokenRef(pf2eTarget);
            }
        } catch (_) { }
        try {
            const context = data?.flags?.pf2e?.context;
            if (context?.target?.token) return this.normalizeTokenRef(context.target.token);
            if (context?.target?.actor) {
                const first = Array.from(canvas?.tokens?.placeables || [])
                    .find((t) => t.actor?.id === context.target.actor)?.id;
                if (typeof first === 'string') {
                    try {
                        console.debug('PF2E Visioner | target-resolve: matched token by context.target.actor', { actorId: context.target.actor, tokenId: first });
                    } catch (_) { }
                    return this.normalizeTokenRef(first);
                }
            }
        } catch (_) { }
        // Fallback: pf2e-toolbelt target helper may carry targets for area damage
        try {
            const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
            if (Array.isArray(tbTargets) && tbTargets.length === 1) {
                try {
                    console.debug('PF2E Visioner | target-resolve: pf2e-toolbelt single target', { value: tbTargets[0] });
                } catch (_) { }
                return this.normalizeTokenRef(tbTargets[0]);
            }
        } catch (_) { }
        try {
            console.debug('PF2E Visioner | target-resolve: no target found in pf2e flags or toolbelt');
        } catch (_) { }
    }

    /**
     * Resolve attacker from context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveAttackerFromCtx(ctx) {
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

    /**
     * Resolve target from context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveTargetFromCtx(ctx) {
        if (!ctx || !canvas?.tokens?.get) return null;

        // Method 1: Try to get token from context target.token.id (old format)
        const targetTokenId = ctx.target?.token?.id;
        if (targetTokenId) {
            const token = canvas.tokens.get(targetTokenId);
            if (token) {
                this._log('_resolveTargetFromCtx', 'Found target using target.token.id', { targetId: token.id });
                return token;
            }
        }

        // Method 2: Try direct target.id (newer format)
        const directTargetId = ctx.target?.id;
        if (directTargetId) {
            const token = canvas.tokens.get(directTargetId);
            if (token) {
                this._log('_resolveTargetFromCtx', 'Found target using target.id', { targetId: token.id });
                return token;
            }
        }

        // Method 3: Check for targets array (first item only)
        if (Array.isArray(ctx.targets) && ctx.targets.length > 0) {
            const targetId = this._normalizeTokenRef(ctx.targets[0]);
            if (targetId) {
                const token = canvas.tokens.get(targetId);
                if (token) {
                    this._log('_resolveTargetFromCtx', 'Found target using targets array', { targetId: token.id });
                    return token;
                }
            }
        }

        // Method 4: Check for options.targets array (first item only)
        if (Array.isArray(ctx.options?.targets) && ctx.options.targets.length > 0) {
            const targetId = this._normalizeTokenRef(ctx.options.targets[0]);
            if (targetId) {
                const token = canvas.tokens.get(targetId);
                if (token) {
                    this._log('_resolveTargetFromCtx', 'Found target using options.targets array', { targetId: token.id });
                    return token;
                }
            }
        }

        // Method 5: Check for target UUID
        if (ctx.target?.uuid) {
            try {
                // fromUuid is async but we need a sync method, so we'll do some parsing instead
                const parts = ctx.target.uuid.split('.');
                if (parts.includes('Token')) {
                    const tokenId = parts[parts.length - 1];
                    const token = canvas.tokens.get(tokenId);
                    if (token) {
                        this._log('_resolveTargetFromCtx', 'Found target using target.uuid', { targetId: token.id });
                        return token;
                    }
                }
            } catch (e) {
                console.debug('PF2E Visioner | Error parsing target UUID:', e);
            }
        }

        // Method 6: Fallback to current target
        if (game.user.targets.size === 1) {
            const token = game.user.targets.first();
            this._log('_resolveTargetFromCtx', 'Using current user target as fallback', { targetId: token.id });
            return token;
        }

        this._log('_resolveTargetFromCtx', 'No target found in context', {}, 'warn');
        return null;
    }

}