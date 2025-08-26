/**
 * StealthCheckUseCase.js
 * Handles stealth check contexts for auto-cover
 */

import { getCoverStealthBonusByState } from '../../../helpers/cover-helpers.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';

export class StealthCheckUseCase extends BaseAutoCoverUseCase {
    /**
     * Check if this use case can handle the given context type
     * @param {string} ctxType - Context type
     * @returns {boolean} Whether this use case can handle the context type
     */
    canHandle(ctxType) {
        if (ctxType?.type === 'skill-check' && ctxType?.skill === 'stealth') return true;

        // Check domains
        if (Array.isArray(ctxType?.domains) && ctxType.domains.includes('stealth')) {
            return true;
        }

        return false;
    }

    /**
     * Handle a chat message context
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleChatMessage(data) {
        try {
            // Extract tokens from message
            const { stealther, observer } = await this._resolveTokensFromMessage(data);

            if (!stealther || !observer) return { success: false };

            // Only proceed if this user owns the stealther token or is the GM
            if (!stealther.isOwner && !game.user.isGM) return { success: false };

            // Detect cover state
            // For stealth, we're detecting cover that the stealther has from the observer's perspective
            const state = this._detectCover(observer, stealther);

            return {
                success: true,
                attacker: observer,  // For stealth, the observer is treated as the "attacker"
                target: stealther,   // The stealther is treated as the "target"
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | StealthCheckUseCase.handleChatMessage error:', error);
            return { success: false };
        }
    }

    /**
     * Handle a check modifiers dialog context
     * @param {Object} dialog - Dialog object
     * @param {Object} ctx - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckDialog(dialog, ctx) {
        try {
            // Resolve stealther and observer
            const stealther = this._resolveStealtherFromCtx(ctx);
            const observer = this._resolveObserverFromCtx(ctx);

            if (!stealther || !observer) return { success: false };

            // Check for a cover override from the dialog
            let state;

            // Get the HTML element from the dialog
            const html = dialog?.element;
            if (html) {
                const overrideState = html.data('coverOverride');

                console.warn('PF2E Visioner | StealthCheckUseCase: Checking for override in dialog', {
                    dialogElement: !!html,
                    hasData: !!html?.data,
                    overrideState: overrideState,
                    allData: html ? JSON.stringify(html.data()) : 'none'
                });

                if (overrideState) {
                    this._log('handleCheckDialog', 'Using cover override from dialog', {
                        overrideState,
                        detectedState: this._detectCover(observer, stealther)
                    });
                    state = overrideState;
                } else {
                    // Fall back to detected cover
                    state = this._detectCover(observer, stealther);
                }
            } else {
                // Check for global override first
                const globalOverride = window.PF2E_VISIONER_COVER_OVERRIDE;

                console.warn('PF2E Visioner | StealthCheckUseCase: Checking global override', {
                    hasGlobalOverride: !!globalOverride,
                    globalState: globalOverride?.state,
                    timestamp: globalOverride?.timestamp ? new Date(globalOverride.timestamp).toISOString() : null,
                    timeSinceOverride: globalOverride?.timestamp ? (Date.now() - globalOverride.timestamp) / 1000 + ' seconds' : 'n/a',
                    observerId: observer?.id,
                    stealtherId: stealther?.id,
                    overrideAttackerId: globalOverride?.attacker, // In global context, attacker=observer
                    overrideTargetId: globalOverride?.target     // In global context, target=stealther
                });

                // Use the global override if it's recent (within last 10 seconds) and matches the current tokens
                if (globalOverride &&
                    globalOverride.state &&
                    Date.now() - globalOverride.timestamp < 10000 &&
                    (!globalOverride.attacker || globalOverride.attacker === observer?.id) &&
                    (!globalOverride.target || globalOverride.target === stealther?.id)) {

                    this._log('handleCheckDialog', 'Using global cover override', {
                        overrideState: globalOverride.state,
                        detectedState: this._detectCover(observer, stealther)
                    });

                    state = globalOverride.state;
                } else {
                    // Detect cover that the stealther has from the observer's perspective
                    state = this._detectCover(observer, stealther);
                }
            }

            return {
                success: true,
                attacker: observer,  // For stealth, the observer is treated as the "attacker"
                target: stealther,   // The stealther is treated as the "target"
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | StealthCheckUseCase.handleCheckDialog error:', error);
            return { success: false };
        }
    }

    /**
     * Handle check roll context
     * @param {Object} check - Check object
     * @param {Object} context - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckRoll(check, context) {
        try {
            // Resolve stealther and observer
            const stealther = this._resolveStealtherFromCtx(context);
            const observer = this._resolveObserverFromCtx(context);

            if (!stealther || !observer) return { success: false };

            // First, check for override in the context (highest priority)
            if (context?.coverOverrideState) {
                this._log('handleRoll', 'Using cover override from context', {
                    overrideState: context.coverOverrideState,
                    detectedState: this._detectCover(observer, stealther)
                });

                return {
                    success: true,
                    attacker: observer,
                    target: stealther,
                    state: context.coverOverrideState
                };
            }

            // Next check for a cover override from the dialog
            let state;

            // Try to find the dialog in multiple ways
            let app = null;

            // Method 1: Try via check.options?.appId (original method)
            if (check.options?.appId) {
                app = ui.windows[check.options.appId];
            }

            // Method 2: Try to find the dialog by looking for CheckModifiersDialog
            if (!app) {
                for (const [, window] of Object.entries(ui.windows)) {
                    if (window.constructor.name === 'CheckModifiersDialog') {
                        app = window;
                        break;
                    }
                }
            }

            // Debug information to find the issue
            console.warn('PF2E Visioner | StealthCheckUseCase: Looking for dialog app', {
                hasOptions: !!check.options,
                appId: check.options?.appId,
                foundApp: !!app,
                appConstructor: app?.constructor?.name,
                windowKeys: Object.keys(ui.windows || {}),
                windowCount: Object.keys(ui.windows || {}).length,
                alternateMethodWorked: !!app && !check.options?.appId
            }); if (app) {
                const html = app.element;
                const overrideState = html.data('coverOverride');

                console.warn('PF2E Visioner | StealthCheckUseCase: Checking for override in dialog', {
                    dialogElement: !!html,
                    hasData: !!html?.data,
                    overrideState: overrideState,
                    allData: html ? JSON.stringify(html.data()) : 'none'
                });

                if (overrideState) {
                    this._log('handleRoll', 'Using cover override from dialog', {
                        overrideState,
                        detectedState: this._detectCover(observer, stealther)
                    });
                    state = overrideState;
                } else {
                    // Fall back to detected cover
                    state = this._detectCover(observer, stealther);
                }
            } else {
                // Check for global override first
                const globalOverride = window.PF2E_VISIONER_COVER_OVERRIDE;

                console.warn('PF2E Visioner | StealthCheckUseCase: Checking global override', {
                    hasGlobalOverride: !!globalOverride,
                    globalState: globalOverride?.state,
                    timestamp: globalOverride?.timestamp ? new Date(globalOverride.timestamp).toISOString() : null,
                    timeSinceOverride: globalOverride?.timestamp ? (Date.now() - globalOverride.timestamp) / 1000 + ' seconds' : 'n/a',
                    observerId: observer?.id,
                    stealtherId: stealther?.id,
                    overrideAttackerId: globalOverride?.attacker, // In global context, attacker=observer
                    overrideTargetId: globalOverride?.target     // In global context, target=stealther
                });

                // Use the global override if it's recent (within last 10 seconds) and matches the current tokens
                if (globalOverride &&
                    globalOverride.state &&
                    Date.now() - globalOverride.timestamp < 10000 &&
                    (!globalOverride.attacker || globalOverride.attacker === observer?.id) &&
                    (!globalOverride.target || globalOverride.target === stealther?.id)) {

                    this._log('handleRoll', 'Using global cover override', {
                        overrideState: globalOverride.state,
                        detectedState: this._detectCover(observer, stealther)
                    });

                    state = globalOverride.state;
                } else {
                    // Detect cover that the stealther has from the observer's perspective
                    state = this._detectCover(observer, stealther);
                }
            }

            // Add cover bonus to stealth check if needed
            if (check && state !== 'none') {
                // Get the bonus for the cover state (positive value for stealth check bonus)
                const bonus = getCoverStealthBonusByState(state);
                if (bonus !== 0) {
                    // Create the modifier
                    let coverModifier;
                    try {
                        const label = state === 'greater' ? 'Greater Cover' :
                            state === 'standard' ? 'Cover' : 'Lesser Cover';

                        if (game?.pf2e?.Modifier) {
                            coverModifier = new game.pf2e.Modifier({
                                slug: 'pf2e-visioner-cover',
                                label,
                                modifier: bonus,
                                type: 'circumstance'
                            });
                        } else {
                            coverModifier = {
                                slug: 'pf2e-visioner-cover',
                                label,
                                modifier: bonus,
                                type: 'circumstance',
                                enabled: true
                            };
                        }

                        // Add to the check modifiers
                        if (Array.isArray(check.modifiers)) {
                            // Remove any existing cover modifiers
                            check.modifiers = check.modifiers.filter(
                                m => m.slug !== 'pf2e-visioner-cover'
                            );

                            // Add the new modifier
                            check.modifiers.push(coverModifier);
                        }

                        // Ephemeral actor updates are handled in preCreateChatMessage via applyEphemeralCover
                    } catch (error) {
                        console.error('PF2E Visioner | Error adding cover bonus to stealth check:', error);
                    }
                }
            }

            return {
                success: true,
                attacker: observer,  // For stealth, the observer is treated as the "attacker"
                target: stealther,   // The stealther is treated as the "target"
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | StealthCheckUseCase.handleRoll error:', error);
            return { success: false };
        }
    }

    /**
     * Handle check roll context
     * @param {Object} context - Check context
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handleCheckRoll(context) {
        try {
            return await this.handleCheckDialog(null, context);
        } catch (error) {
            console.error('PF2E Visioner | StealthCheckUseCase.handleCheckRoll error:', error);
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
        if (!ctx || !canvas?.tokens?.get) return null;

        // The token making the stealth check is the stealther
        const tokenId = ctx.token?.id || ctx.actor?.token?.id;
        if (tokenId) {
            return canvas.tokens.get(tokenId);
        }

        // Fallback to controlled token
        if (canvas.tokens.controlled.length === 1) {
            return canvas.tokens.controlled[0];
        }

        // Fallback to user character
        if (game.user.character) {
            const tokens = game.user.character.getActiveTokens();
            if (tokens.length > 0) {
                return tokens[0];
            }
        }

        return null;
    }

    /**
     * Resolve observer token from stealth check context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveObserverFromCtx(ctx) {
        if (!ctx || !canvas?.tokens?.get) return null;

        // Observer is typically the target in a stealth context
        const targetTokenId = ctx.target?.token?.id;
        if (targetTokenId) {
            return canvas.tokens.get(targetTokenId);
        }

        // Fallback to current target
        if (game.user.targets.size === 1) {
            return game.user.targets.first();
        }

        // For stealth checks without a specific observer, 
        // use the nearest hostile creature as a reasonable default
        const stealther = this._resolveStealtherFromCtx(ctx);
        if (stealther) {
            return this._findBestObserver(stealther);
        }

        return null;
    }
}
