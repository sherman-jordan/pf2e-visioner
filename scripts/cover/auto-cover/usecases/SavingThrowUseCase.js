/**
 * SavingThrowUseCase.js
 * Handles saving throw contexts for auto-cover
 */

import { BaseAutoCoverUseCase } from './BaseUseCase.js';

export class SavingThrowUseCase extends BaseAutoCoverUseCase {
    /**
     * Check if this use case can handle the given context type
     * @param {string} ctxType - Context type
     * @returns {boolean} Whether this use case can handle the context type
     */
    canHandle(ctxType) {
        if (ctxType === 'saving-throw') return true;

        // Check for specific save types
        if (ctxType?.statistic === 'reflex') return true;

        // Check domains
        if (Array.isArray(ctxType?.domains) && ctxType.domains.includes('reflex')) {
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
            const { attacker, target, isMultiTarget } = await this._resolveTokensFromMessage(data);

            if (!attacker) return { success: false };

            // For multi-target messages, handle differently
            if (isMultiTarget) {
                return await this._handleMultiTargetMessage(attacker, data);
            }

            // Handle single target case
            if (!target) return { success: false };

            // Only proceed if this user owns the attacking token or is the GM
            if (!attacker.isOwner && !game.user.isGM) return { success: false };

            // Detect cover state
            const state = this._detectCover(attacker, target);

            return {
                success: true,
                attacker,
                target,
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | SavingThrowUseCase.handleChatMessage error:', error);
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
            // For saving throws, the "attacker" is the caster and the "target" is the defender
            const attacker = this._resolveCasterFromSaveCtx(ctx);
            const target = this._resolveDefenderFromSaveCtx(ctx);

            if (!attacker || !target) return { success: false };

            // Check for a cover override from the dialog
            let state;

            // Get the HTML element from the dialog
            const html = dialog?.element;
            if (html) {
                const overrideState = html.data('coverOverride');

                console.warn('PF2E Visioner | SavingThrowUseCase: Checking for override in dialog', {
                    dialogElement: !!html,
                    hasData: !!html?.data,
                    overrideState: overrideState,
                    allData: html ? JSON.stringify(html.data()) : 'none'
                });

                if (overrideState) {
                    this._log('handleCheckDialog', 'Using cover override from dialog', {
                        overrideState,
                        detectedState: this._detectCover(attacker, target)
                    });
                    state = overrideState;
                } else {
                    // Fall back to template data or detected cover
                    // Check template data first for cached cover
                    const templateManager = this.autoCoverSystem.getTemplateManager();
                    const savedTemplateData = templateManager.getTemplateData(attacker.id);

                    if (savedTemplateData && target) {
                        const targetData = savedTemplateData.targets[target.id];
                        if (targetData) {
                            state = targetData.state;
                        }
                    }

                    // If no state from template, detect cover normally
                    if (!state || state === 'none') {
                        state = this._detectCover(attacker, target);
                    }
                }
            } else {
                // Check for global override first
                const globalOverride = window.PF2E_VISIONER_COVER_OVERRIDE;

                console.warn('PF2E Visioner | SavingThrowUseCase: Checking global override', {
                    hasGlobalOverride: !!globalOverride,
                    globalState: globalOverride?.state,
                    timestamp: globalOverride?.timestamp ? new Date(globalOverride.timestamp).toISOString() : null,
                    timeSinceOverride: globalOverride?.timestamp ? (Date.now() - globalOverride.timestamp) / 1000 + ' seconds' : 'n/a',
                    attackerId: attacker?.id,
                    targetId: target?.id,
                    overrideAttackerId: globalOverride?.attacker,
                    overrideTargetId: globalOverride?.target
                });

                // Use the global override if it's recent (within last 10 seconds) and matches the current tokens
                if (globalOverride &&
                    globalOverride.state &&
                    Date.now() - globalOverride.timestamp < 10000 &&
                    (!globalOverride.attacker || globalOverride.attacker === attacker?.id) &&
                    (!globalOverride.target || globalOverride.target === target?.id)) {

                    this._log('handleCheckDialog', 'Using global cover override', {
                        overrideState: globalOverride.state,
                        detectedState: this._detectCover(attacker, target)
                    });

                    state = globalOverride.state;
                } else {
                    // Fall back to template data or detected cover
                    // Check template data first for cached cover
                    const templateManager = this.autoCoverSystem.getTemplateManager();
                    const savedTemplateData = templateManager.getTemplateData(attacker.id);

                    if (savedTemplateData && target) {
                        const targetData = savedTemplateData.targets[target.id];
                        if (targetData) {
                            state = targetData.state;
                        }
                    }

                    // If no state from template, detect cover normally
                    if (!state || state === 'none') {
                        state = this._detectCover(attacker, target);
                    }
                }
            }

            return {
                success: true,
                attacker,
                target,
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | SavingThrowUseCase.handleCheckDialog error:', error);
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
            // For saving throws, the "attacker" is the caster and the "target" is the defender
            const attacker = this._resolveCasterFromSaveCtx(context);
            const target = this._resolveDefenderFromSaveCtx(context);

            if (!attacker || !target) return { success: false };

            // First, check for override in the context (highest priority)
            if (context?.coverOverrideState) {
                this._log('handleRoll', 'Using cover override from context', {
                    overrideState: context.coverOverrideState,
                    detectedState: this._detectCover(attacker, target)
                });

                return {
                    success: true,
                    attacker,
                    target,
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
            console.warn('PF2E Visioner | SavingThrowUseCase: Looking for dialog app', {
                hasOptions: !!check.options,
                appId: check.options?.appId,
                foundApp: !!app,
                appConstructor: app?.constructor?.name,
                windowKeys: Object.keys(ui.windows || {}),
                windowCount: Object.keys(ui.windows || {}).length,
                alternateMethodWorked: !!app && !check.options?.appId
            });

            if (app) {
                const html = app.element;
                const overrideState = html.data('coverOverride');

                console.warn('PF2E Visioner | SavingThrowUseCase: Checking for override in dialog', {
                    dialogElement: !!html,
                    hasData: !!html?.data,
                    overrideState: overrideState,
                    allData: html ? JSON.stringify(html.data()) : 'none'
                });

                if (overrideState) {
                    this._log('handleRoll', 'Using cover override from dialog', {
                        overrideState,
                        detectedState: this._detectCover(attacker, target)
                    });
                    state = overrideState;
                } else {
                    // Check template data first for cached cover
                    const templateManager = this.autoCoverSystem.getTemplateManager();
                    const savedTemplateData = templateManager.getTemplateData(attacker.id);

                    if (savedTemplateData && target) {
                        const targetData = savedTemplateData.targets[target.id];
                        if (targetData) {
                            state = targetData.state;
                        }
                    }

                    // If no state from template, detect cover normally
                    if (!state || state === 'none') {
                        state = this._detectCover(attacker, target);
                    }
                }
            } else {
                // Check for global override first
                const globalOverride = window.PF2E_VISIONER_COVER_OVERRIDE;

                console.warn('PF2E Visioner | SavingThrowUseCase: Checking global override', {
                    hasGlobalOverride: !!globalOverride,
                    globalState: globalOverride?.state,
                    timestamp: globalOverride?.timestamp ? new Date(globalOverride.timestamp).toISOString() : null,
                    timeSinceOverride: globalOverride?.timestamp ? (Date.now() - globalOverride.timestamp) / 1000 + ' seconds' : 'n/a',
                    attackerId: attacker?.id,
                    targetId: target?.id,
                    overrideAttackerId: globalOverride?.attacker,
                    overrideTargetId: globalOverride?.target
                });

                // Use the global override if it's recent (within last 10 seconds) and matches the current tokens
                if (globalOverride &&
                    globalOverride.state &&
                    Date.now() - globalOverride.timestamp < 10000 &&
                    (!globalOverride.attacker || globalOverride.attacker === attacker?.id) &&
                    (!globalOverride.target || globalOverride.target === target?.id)) {

                    this._log('handleRoll', 'Using global cover override', {
                        overrideState: globalOverride.state,
                        detectedState: this._detectCover(attacker, target)
                    });

                    state = globalOverride.state;
                } else {
                    // Check template data first for cached cover
                    const templateManager = this.autoCoverSystem.getTemplateManager();
                    const savedTemplateData = templateManager.getTemplateData(attacker.id);

                    if (savedTemplateData && target) {
                        const targetData = savedTemplateData.targets[target.id];
                        if (targetData) {
                            state = targetData.state;
                        }
                    }

                    // If no state from template, detect cover normally
                    if (!state || state === 'none') {
                        state = this._detectCover(attacker, target);
                    }
                }
            }

            // Add cover bonus to saving throw if needed
            if (check && state !== 'none') {
                // Get the bonus for the cover state (positive value for saving throw bonus)
                const bonus = this._getCoverBonus(state);
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

                        // Also create an ephemeral effect on the target
                        // Ephemeral actor updates are handled in preCreateChatMessage via applyEphemeralCover
                    } catch (error) {
                        console.error('PF2E Visioner | Error adding cover bonus to saving throw:', error);
                    }
                }
            }

            return {
                success: true,
                attacker,
                target,
                state
            };
        } catch (error) {
            console.error('PF2E Visioner | SavingThrowUseCase.handleRoll error:', error);
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
            console.error('PF2E Visioner | SavingThrowUseCase.handleCheckRoll error:', error);
            return { success: false };
        }
    }

    /**
     * Resolve tokens from message data
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Result with attacker, target, and isMultiTarget flag
     * @protected
     */
    async _resolveTokensFromMessage(data) {
        const speakerTokenId = this._normalizeTokenRef(data?.speaker?.token);
        const targetTokenId = this._resolveTargetTokenIdFromData(data);

        // For saving throws, the speaker is the defender (target)
        // Try to determine the real attacker (origin) from context
        const attackerTokenId = this._determineAttackerForSavingThrow(data, speakerTokenId);

        const attacker = this._getToken(attackerTokenId);
        if (!attacker) return { attacker: null, target: null, isMultiTarget: false };

        const target = this._getToken(speakerTokenId);
        const isMultiTarget = !targetTokenId;

        return { attacker, target, isMultiTarget };
    }

    /**
     * Determine attacker for saving throw
     * @param {Object} data - Message data
     * @param {string} speakerTokenId - Speaker token ID
     * @returns {string} Attacker token ID
     * @private
     */
    _determineAttackerForSavingThrow(data, speakerTokenId) {
        if (!data) return speakerTokenId;

        // Try to get origin actor from context
        const ctx = data?.flags?.pf2e?.context || {};
        const originActor = ctx.origin?.actor || ctx.sourceActor || {};
        const originActorId = originActor.id || ctx.actor?.id;

        if (originActorId) {
            // Try to find a token for this actor
            const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === originActorId);
            if (tokens.length > 0) {
                return tokens[0].id;
            }
        }

        // Try to determine from template
        const templateManager = this.autoCoverSystem.getTemplateManager();
        const originTemplates = [...templateManager._templateData.values()]
            .filter(t => t.targets && t.targets[speakerTokenId])
            .sort((a, b) => b.timestamp - a.timestamp);

        if (originTemplates.length > 0) {
            return originTemplates[0].creatorId || speakerTokenId;
        }

        return speakerTokenId;
    }

    /**
     * Resolve target token ID from message data
     * @param {Object} data - Message data
     * @returns {string|null}
     * @private
     */
    _resolveTargetTokenIdFromData(data) {
        if (!data) return null;

        // For saving throws, the primary target is in the speaker
        // For multi-target templates, we won't have a specific target
        const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
        if (Array.isArray(tbTargets) && tbTargets.length > 0) {
            // Multi-target case
            return null;
        }

        // Single target case - speaker is the target
        return this._normalizeTokenRef(data?.speaker?.token);
    }

    /**
     * Handle multi-target messages
     * @param {Object} attacker - Attacker token
     * @param {Object} data - Message data
     * @returns {Promise<Object>} Result with tokens and cover states
     * @private
     */
    async _handleMultiTargetMessage(attacker, data) {
        try {
            // Get targets
            const targets = this._resolveMultiTargets(attacker, data);

            if (!targets || targets.length === 0) {
                return { success: false };
            }

            console.debug(`PF2E Visioner | Saving throw: applying cover for multiple targets`, {
                count: targets.length
            });

            // Try to get template origin if available
            const originPoint = this._resolveOriginPoint(attacker);

            // Apply cover to each target and collect results
            const results = [];
            for (const target of targets) {
                // For saving throws, check template data first
                const templateManager = this.autoCoverSystem.getTemplateManager();
                const savedTemplateData = templateManager.getTemplateData(attacker.id);

                let state = 'none';

                if (savedTemplateData && savedTemplateData.targets[target.id]) {
                    state = savedTemplateData.targets[target.id].state;
                } else if (originPoint) {
                    state = this.autoCoverSystem.detectCoverFromPoint(originPoint, target);
                } else {
                    state = this.autoCoverSystem.detectCoverForAttack(attacker, target);
                }

                results.push({ target, state });
            }

            return {
                success: true,
                attacker,
                multiTarget: true,
                results
            };
        } catch (error) {
            console.error('PF2E Visioner | Error handling multi-target saving throw:', error);
            return { success: false };
        }
    }

    /**
     * Resolve multiple targets from data
     * @param {Object} attacker - Attacker token
     * @param {Object} data - Message data
     * @returns {Array<Object>} - Array of target tokens
     * @private
     */
    _resolveMultiTargets(attacker, data) {
        // Get targets from pf2e-toolbelt or our template cache
        let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;

        if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
            // Try to get targets from template manager
            const templateManager = this.autoCoverSystem.getTemplateManager();
            const templateData = templateManager.getTemplateData(attacker.id);
            if (templateData) {
                tbTargets = templateData.tokenIds.map(id => ({ id }));
            }
        }

        if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
            return [];
        }

        // Convert target references to actual tokens
        return tbTargets
            .map(tRef => {
                const tid = this._normalizeTokenRef(tRef);
                return tid ? this._getToken(tid) : null;
            })
            .filter(t => !!t);
    }

    /**
     * Resolve the origin point for cover detection
     * @param {Object} attacker - Attacker token
     * @returns {Object|null} - Origin point or null
     * @private
     */
    _resolveOriginPoint(attacker) {
        if (!attacker) return null;

        const templateManager = this.autoCoverSystem.getTemplateManager();
        const originRec = templateManager.getTemplateOrigin(attacker.id);

        return originRec ? originRec.point : null;
    }

    /**
     * Resolve caster token from saving throw context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveCasterFromSaveCtx(ctx) {
        if (!ctx || !canvas?.tokens?.get) return null;

        // Try to get origin actor from context
        const originActorId = ctx.origin?.actor?.id || ctx.origin?.actorId || ctx.sourceActor?.id;
        if (originActorId) {
            // Try to find a token for this actor
            const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === originActorId);
            if (tokens.length > 0) {
                return tokens[0];
            }
        }

        // Check for spell source token
        const sourceTokenId = ctx.source?.token?.id || ctx.origin?.token?.id;
        if (sourceTokenId) {
            return canvas.tokens.get(sourceTokenId);
        }

        // Check for template manager data
        const templateManager = this.autoCoverSystem.getTemplateManager();
        if (templateManager) {
            // Find templates that might be associated with this save
            const originTemplates = [...templateManager._templateData.values()]
                .sort((a, b) => b.timestamp - a.timestamp);

            if (originTemplates.length > 0 && originTemplates[0].creatorId) {
                return canvas.tokens.get(originTemplates[0].creatorId);
            }
        }

        // Fallback to controlled token (likely the GM forcing a save)
        if (canvas.tokens.controlled.length === 1) {
            return canvas.tokens.controlled[0];
        }

        return null;
    }

    /**
     * Resolve defender token from saving throw context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveDefenderFromSaveCtx(ctx) {
        if (!ctx || !canvas?.tokens?.get) return null;

        // Try to get the defending token from context
        const tokenId = ctx.token?.id || ctx.actor?.token?.id;
        if (tokenId) {
            return canvas.tokens.get(tokenId);
        }

        // Fallback to current target
        if (game.user.targets.size === 1) {
            return game.user.targets.first();
        }

        return null;
    }

    /**
     * Get the bonus value for a cover state
     * @param {string} state - Cover state
     * @returns {number} Bonus value
     * @private
     */
    _getCoverBonus(state) {
        // For saving throws, cover provides a bonus (opposite of attack penalty)
        switch (state) {
            case 'lesser':
                return 1;
            case 'standard':
                return 2;
            case 'greater':
                return 4;
            default:
                return 0;
        }
    }
}