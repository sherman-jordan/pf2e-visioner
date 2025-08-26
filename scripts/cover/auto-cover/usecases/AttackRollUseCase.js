/**
 * AttackRollUseCase.js
 * Handles attack roll contexts for auto-cover
 */

import { getCoverBonusByState, getCoverImageForState, getCoverLabel } from '../../../helpers/cover-helpers.js';
import { CoverUIManager } from '../CoverUIManager.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
export class AttackRollUseCase extends BaseAutoCoverUseCase {

    constructor(autoCoverSystem) {
        super(autoCoverSystem);
        this.coverUI = new CoverUIManager(this.autoCoverSystem);
    }

    /**
     * Handle a chat message context
     * @param {Object} data - Message data
     * @param {Object} doc - Message document (optional)
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handlePreCreateChatMessage(data, doc = null) {
        const speakerTokenId = this.normalizeTokenRef(data?.speaker?.token);
        const targetTokenId = this._resolveTargetTokenIdFromData(data);

        const tokens = canvas?.tokens;

        const attacker = tokens.get(speakerTokenId);

        const target = tokens.get(targetTokenId);

        // Determine base cover state (template origin preferred)
        let state = this._detectCover(attacker, target);

        // Preserve original detected state for override comparison
        const originalDetectedState = state;

        // Check for popup or dialog overrides and persist override metadata as needed
        const overrideResult = await this._extractAndApplyOverrides(doc, attacker, target, originalDetectedState);
        state = overrideResult.state;


    }


    /**
     * Handle a check modifiers dialog context
     * @param {Object} dialog - Dialog object
     * @param {Object} ctx - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckDialog(dialog, html) {

        const ctx = dialog?.context || {};

        let attacker = this._resolveAttackerFromCtx(ctx);
        let target = this._resolveTargetFromCtx(ctx);
        if (!attacker || !target) return;
        let state = this._detectCover(attacker, target);
        // Delegate dialog UI injection to CoverUIManager
        try {
            await this.coverUI.injectDialogCoverUI(dialog, html, state, target);
        } catch (e) {
            console.warn('PF2E Visioner | Failed to inject dialog cover UI via CoverUIManager:', e);
        }
    }

    async handleRenderChatMessage(message, html) {
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

        super.handleRenderChatMessage(message, html);

        // Only proceed if this user owns the attacking token or is the GM
        if (!attacker.isOwner && !game.user.isGM) return;

        const targetIds = targetId ? [targetId] : this.autoCoverSystem.consumePairs(attackerId);
        if (targetIds.length === 0) return;
        const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
        if (targets.length === 0) return;
        try {
            for (const target of targets) {
                await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
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

                const detected = this._detectCover(attacker, target);
                let chosen = null;
                try {
                    // Only show popup if keybind is held
                    const popupResult = await this.coverUI.showPopupAndApply(detected);
                    chosen = popupResult.chosen;
                } catch (e) {
                    console.warn('PF2E Visioner | Popup error (delegated):', e);
                }

                // If popup was used and a choice was made, use it; otherwise, use detected state
                const finalState = chosen !== null ? chosen : detected;

                // Store the override for onPreCreateChatMessage if popup was used
                if (chosen !== null) {
                    if (!window.pf2eVisionerPopupOverrides) window.pf2eVisionerPopupOverrides = new Map();
                    const overrideKey = `${attacker.id}-${target.id}`;
                    window.pf2eVisionerPopupOverrides.set(overrideKey, chosen);
                }

                // Apply effect/clone/stat logic for the final state
                await this._applyCoverEphemeralEffect(target, attacker, finalState, context);
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
     * Apply ephemeral cover effect and update DC/stat if needed.
     * @private
     */
    async _applyCoverEphemeralEffect(target, attacker, state, context) {
        if (!state || state === 'none') return;
        const bonus = getCoverBonusByState(state) || 0;
        if (bonus <= 0) return;
        const tgtActor = target.actor;
        let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
        // Remove any existing one-roll cover effects we may have added
        items = items.filter(
            (i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
        );
        const label = getCoverLabel(state);
        const img = getCoverImageForState(state);
        items.push({
            name: label,
            type: 'effect',
            system: {
                description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: '' },
                rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus }],
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
            const { getVisibilityBetween } = await import('../../../stores/visibility-map.js');
            const visState = getVisibilityBetween(target, attacker);
            if (['hidden', 'undetected'].includes(visState)) {
                const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                items.push({
                    name: `Off-Guard (${reason})`,
                    type: 'effect',
                    system: {
                        description: { value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`, gm: '' },
                        rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: -2 }],
                        traits: { otherTags: [], value: [] },
                        level: { value: 1 },
                        duration: { value: -1, unit: 'unlimited' },
                        tokenIcon: { show: false },
                        unidentified: false,
                        start: { value: 0 },
                        badge: null,
                    },
                    img: 'icons/svg/terror.svg',
                    flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true } },
                });
            }
        } catch (_) { }
        const clonedActor = tgtActor.clone({ items }, { keepId: true });
        const dcObj = context.dc;
        if (dcObj?.slug) {
            const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
            if (clonedStat) {
                dcObj.value = clonedStat.value;
                dcObj.statistic = clonedStat;
            }
        }
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
                    return this.normalizeTokenRef(first);
                }
            }
        } catch (_) { }
        // Fallback: pf2e-toolbelt target helper may carry targets for area damage
        try {
            const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
            if (Array.isArray(tbTargets) && tbTargets.length === 1) {
                return this.normalizeTokenRef(tbTargets[0]);
            }
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
        try {
            const tObj = ctx?.target?.token?.object || ctx?.target?.token;
            if (tObj?.id) return tObj;
            const targetIdRaw =
                typeof ctx?.target?.token === 'string'
                    ? ctx.target.token
                    : ctx?.target?.tokenId || ctx?.targetTokenId;
            const targetId = this.normalizeTokenRef(targetIdRaw);
            if (targetId) {
                const byCtx = canvas?.tokens?.get?.(targetId);
                if (byCtx) return byCtx;
            }
            const t =
                Array.from(game?.user?.targets ?? [])?.[0] || Array.from(canvas?.tokens?.targets ?? [])?.[0];
            return t || null;
        } catch (_) {
            return null;
        }
    }
}