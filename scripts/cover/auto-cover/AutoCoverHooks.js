/**
 * AutoCoverHooks.js
 * Registers and manages hooks for the auto-cover system
 */

import { MODULE_ID } from '../../constants.js';
import autoCoverSystem from './AutoCoverSystem.js';
import coverUIManager from './CoverUIManager.js';
import templateManager from './TemplateManager.js';
import { AttackRollUseCase, SavingThrowUseCase, StealthCheckUseCase } from './usecases/index.js';

export class AutoCoverHooks {
    /**
     * Static flag to track if wrappers have been registered
     * Prevents duplicate registration errors
     * @static
     * @type {boolean}
     * @private
     */
    static _wrappersRegistered = false;

    constructor() {
        this.autoCoverSystem = autoCoverSystem;

        // Initialize use cases
        this.attackRollUseCase = new AttackRollUseCase(autoCoverSystem);
        this.savingThrowUseCase = new SavingThrowUseCase(autoCoverSystem);
        this.stealthCheckUseCase = new StealthCheckUseCase(autoCoverSystem);

        // Initialize UI manager
        this.coverUIManager = coverUIManager;
        this.templateManager = templateManager
    }

    /**
     * Get the CoverUIManager instance
     * @returns {CoverUIManager}
     */
    getCoverUIManager() {
        return this.coverUIManager;
    }

    /**
     * Track whether hooks have been registered
     * @private
     * @static
     */
    static _hooksRegistered = false;

    /**
     * Register all hooks for auto-cover functionality
     * @static
     */
    static registerHooks() {
        // Prevent duplicate registration
        if (AutoCoverHooks._hooksRegistered) {
            console.debug('PF2E Visioner | Auto-cover hooks already registered, skipping duplicate registration');
            return;
        }

        console.debug('PF2E Visioner | Registering auto-cover hooks');
        AutoCoverHooks._hooksRegistered = true;

        // Create an instance to handle hooks
        let autoCoverSystem = null;

        // Try to get the auto-cover system from the global namespace first
        if (window.pf2eVisioner?.systems?.autoCover) {
            autoCoverSystem = window.pf2eVisioner.systems.autoCover;
            initializeHooks(autoCoverSystem);
        }
        // Fall back to importing it directly if not found in global
        else {
            console.debug('PF2E Visioner | Auto-cover system not found in global scope, attempting to import directly');
            // Using dynamic import as this is an ES module
            import('./AutoCoverSystem.js').then(module => {
                autoCoverSystem = module.default;
                if (autoCoverSystem) {
                    initializeHooks(autoCoverSystem);
                } else {
                    console.error('PF2E Visioner | Failed to import auto-cover system: system not found in module');
                }
            }).catch(error => {
                console.error('PF2E Visioner | Failed to import auto-cover system:', error);
            });
        }

        // Helper function to set up hooks with an instance
        function initializeHooks(system) {
            if (!system) {
                console.error('PF2E Visioner | Failed to register hooks: Auto-cover system not found');
                return;
            }

            const instance = new AutoCoverHooks(system);

            // Store the instance globally for access by other components
            if (!window.pf2eVisionerAutoCoverHooks) {
                window.pf2eVisionerAutoCoverHooks = instance;
                console.debug('PF2E Visioner | AutoCoverHooks instance stored globally');
            }

            // Core message hooks
            Hooks.on('preCreateChatMessage', instance.onPreCreateChatMessage.bind(instance));

            // Test multiple hooks to see which ones fire for attack rolls
            Hooks.on('renderChatMessage', (message, html) => {
                const ctx = message?.flags?.pf2e?.context || {};
                if (ctx.type === 'attack-roll') {
                    return instance.onRenderChatMessage.bind(instance)(message, html);
                }
            });

            Hooks.on('renderChatMessageHTML', (message, html) => {
                return instance.onRenderChatMessage.bind(instance)(message, html);
            });

            // Also test createChatMessage to see if we should inject indicators there
            Hooks.on('createChatMessage', () => {
                // Hook for potential future use
            });

            // Dialog hooks
            Hooks.on('renderCheckModifiersDialog', instance.onRenderCheckModifiersDialog.bind(instance));

            // Debug hook to test if any dialog hooks are firing
            Hooks.on('renderApplication', (app) => {
                if (app.constructor.name.includes('Check') || app.constructor.name.includes('Dialog')) {
                    // Hook for potential debugging - currently unused
                }
            });

            // Token hooks
            Hooks.on('updateToken', instance.onUpdateToken.bind(instance));

            // Template hooks
            Hooks.on('createMeasuredTemplate', instance.onCreateMeasuredTemplate.bind(instance));
            Hooks.on('updateDocument', instance.onUpdateDocument.bind(instance));
            Hooks.on('deleteDocument', instance.onDeleteDocument.bind(instance));

            // System hooks
            Hooks.on('pf2e.systemReady', instance.onSystemReady.bind(instance));

            // Ready hook for any final initialization
            Hooks.once('ready', instance.onReady.bind(instance));

            console.debug('PF2E Visioner | Auto-cover hooks registered successfully');

            return instance;
        }
    }    /**
     * Handle preCreateChatMessage hook
     * @param {Object} doc - Chat message document
     * @param {Object} data - Chat message data
     * @returns {Promise}
     */
    async onPreCreateChatMessage(doc, data) {
        try {
            // Skip if auto-cover is disabled
            if (!this.autoCoverSystem.isEnabled()) return;

            // Get context info from message
            const ctx = data?.flags?.pf2e?.context || {};

            // Skip if no tokens canvas
            const tokens = canvas?.tokens;
            if (!tokens?.get) return;

            // Find the appropriate use case for this context
            const useCase = this._getUseCaseForContext(ctx);
            if (!useCase) return;

            // Handle the message with the appropriate use case
            await useCase.handlePreCreateChatMessage(data, doc);

        } catch (error) {
            console.error('PF2E Visioner | Error in onPreCreateChatMessage:', error);
        }
    }

    /**
     * Handle renderChatMessageHTML hook
     * @param {Object} message - Chat message
     * @returns {Promise}
     */
    async onRenderChatMessage(message, html) {
        try {
            // Skip if auto-cover is disabled
            if (!this.autoCoverSystem.isEnabled()) {
                return;
            }

            const data = message?.toObject?.() || {};

            // Find the appropriate use case for this context
            const ctx = data?.flags?.pf2e?.context || {};

            const useCase = this._getUseCaseForContext(ctx);

            if (!useCase) {
                return;
            }

            // Call the use case's render method
            await useCase.handleRenderChatMessage(message, html);
        } catch (error) {
            console.error('PF2E Visioner | Error in onRenderChatMessage:', error);
        }
    }

    /**
     * Handle renderCheckModifiersDialog hook
     * @param {Object} dialog - Check modifiers dialog
     * @param {Object} html - Dialog HTML
     * @returns {Promise}
     */
    async onRenderCheckModifiersDialog(dialog, html) {
        try {
            // Skip if auto-cover is disabled
            if (!this.autoCoverSystem.isEnabled()) {
                return;
            }

            const ctx = dialog?.context ?? {};

            // Find the appropriate use case for this context
            const useCase = this._getUseCaseForContext(ctx);

            if (!useCase) {
                return;
            }

            // Handle the dialog with the appropriate use case
            await useCase.handleCheckDialog(dialog, html);

        } catch (error) {
            console.error('PF2E Visioner | Error in onRenderCheckModifiersDialog:', error);
        }
    }

    /**
     * Handle updateToken hook
     * @param {Object} tokenDoc - Token document
     * @param {Object} changes - Changes made to the token
     * @returns {Promise}
     */
    async onUpdateToken(tokenDoc, changes) {
        try {
            // Skip if auto-cover is disabled
            if (!this.autoCoverSystem.isEnabled()) return;

            // Check if this is a position/size/rotation update
            if (!this._isPositionUpdate(changes)) return;

            const tokenId = tokenDoc?.id;
            if (!tokenId) return;

            // Clean up cover for token
            await this._cleanupCoverForMovedToken(tokenId);
        } catch (error) {
            console.error('PF2E Visioner | Error in onUpdateToken:', error);
        }
    }

    /**
     * Check if changes include position/size/rotation updates
     * @param {Object} changes - Changes object
     * @returns {boolean}
     * @private
     */
    _isPositionUpdate(changes) {
        return 'x' in changes ||
            'y' in changes ||
            'width' in changes ||
            'height' in changes ||
            'rotation' in changes;
    }

    /**
     * Clean up cover for a moved token
     * @param {string} tokenId - Token ID
     * @returns {Promise}
     * @private
     */
    async _cleanupCoverForMovedToken(tokenId) {
        // Get all active pairs involving this token
        const pairs = this.autoCoverSystem.getActivePairsInvolving(tokenId);
        if (pairs.length === 0) return;

        const tokens = canvas?.tokens;
        if (!tokens?.get) return;

        // Clear cover for all active pairs
        for (const pair of pairs) {
            const attacker = tokens.get(pair.attackerId);
            const target = tokens.get(pair.targetId);
            if (!attacker || !target) continue;

            // Movement should clear any pre-applied cover
            await this.autoCoverSystem.cleanupCover(attacker, target);
        }
    }

    /**
     * Handle createMeasuredTemplate hook
     * @param {Object} document - Template document
     * @param {Object} options - Creation options
     * @param {string} userId - User ID who created the template
     * @returns {Promise}
     */
    async onCreateMeasuredTemplate(document, options, userId) {
        try {
            this.templateManager.onCreateMeasuredTemplate(document, options, userId);
        } catch (error) {
            console.error('PF2E Visioner | Error in onCreateMeasuredTemplate:', error);
        }
    }

    /**
     * Handle updateDocument hook
     * @param {Object} document - Updated document
     * @param {Object} changes - Changes made
     */
    async onUpdateDocument(document, changes) {
        try {
            this.autoCoverSystem.onUpdateDocument(document, changes);
            this.templateManager.onUpdateDocument(document, changes);
        } catch (error) {
            console.error('PF2E Visioner | Error in onUpdateDocument:', error);
        }
    }

    /**
     * Handle deleteDocument hook
     * @param {Object} document - Deleted document
     */
    async onDeleteDocument(document) {
        try {
            this.autoCoverSystem.onDeleteDocument(document);
            this.templateManager.onDeleteDocument(document);
        } catch (error) {
            console.error('PF2E Visioner | Error in onDeleteDocument:', error);
        }
    }

    /**
     * Handle systemReady hook
     */
    async onSystemReady() {
        try {
            // Register libWrapper if available - this has been moved to avoid duplicate registrations
            // We're now using a static flag to track if wrappers have been registered already
            if (!AutoCoverHooks._wrappersRegistered &&
                game.modules.get('lib-wrapper')?.active &&
                typeof libWrapper?.register === 'function') {

                try {
                    // Register wrapper for Check.roll
                    libWrapper.register(
                        MODULE_ID,
                        'game.pf2e.Check.roll',
                        this._wrapCheckRoll.bind(this),
                        'WRAPPER'
                    );

                    console.debug('PF2E Visioner | Successfully registered Check.roll wrapper');

                    // Mark wrappers as registered
                    AutoCoverHooks._wrappersRegistered = true;
                } catch (error) {
                    console.warn('PF2E Visioner | Error registering Check.roll wrapper:', error);
                }

                /* 
                 * Removed template preview wrapper as it's no longer compatible with Foundry v13.
                 * The MeasuredTemplate.createPreview method may have changed or been removed.
                 * 
                 * This functionality would need to be updated for the new Foundry version.
                 */
            }
        } catch (error) {
            console.error('PF2E Visioner | Error in onSystemReady:', error);
        }
    }

    /**
     * Handle ready hook
     */
    async onReady() {
        try {
            // Perform any additional initialization required after ready
            if (this.autoCoverSystem && typeof this.autoCoverSystem.onReady === 'function') {
                this.autoCoverSystem.onReady();
                console.debug('PF2E Visioner | Auto-cover system initialized');
            } else {
                console.debug('PF2E Visioner | AutoCoverSystem.onReady not found, skipping system initialization');
            }
        } catch (error) {
            console.error('PF2E Visioner | Error in onReady:', error);
        }
    }

    /**
     * Wrapper for Check.roll
     * @param {Function} wrapped - Original function
     * @param {Object} check - Check object
     * @param {Object} context - Context object
     * @param {Event} event - Event object
     * @param {Function} callback - Callback function
     * @returns {Promise}
     * @private
     */
    async _wrapCheckRoll(wrapped, check, context = {}, event = null, callback) {
        console.debug('PF2E Visioner | Check.roll wrapper entered', {
            contextType: context?.type,
            skill: context?.skill,
            domains: context?.domains,
            checkType: check?.type,
            statistic: context?.statistic,
            token: context?.token?.id
        });

        try {
            // Skip if auto-cover is disabled
            if (!this.autoCoverSystem.isEnabled()) {
                console.debug('PF2E Visioner | Auto-cover is disabled, skipping cover detection');
                return await wrapped(check, context, event, callback);
            }

            // Get the appropriate use case for this context
            const useCase = this._getUseCaseForContext(context);
            if (!useCase) {
                console.debug('PF2E Visioner | No suitable use case found for context', {
                    contextType: context?.type,
                    domains: context?.domains
                });
                return await wrapped(check, context, event, callback);
            }

            console.debug('PF2E Visioner | Found use case for check roll', {
                useCaseType: useCase.constructor.name,
                contextType: context?.type
            });

            console.warn('PF2E Visioner | About to call useCase.handleRoll with context.coverOverrideState', {
                coverOverrideState: context.coverOverrideState,
                globalOverrideAtTime: window.PF2E_VISIONER_COVER_OVERRIDE
            });
            // Handle the roll with the appropriate use case
            await useCase.handleCheckRoll(check, context);

        } catch (error) {
            console.warn('PF2E Visioner | Error in Check.roll wrapper:', error);
        }

        // Call original function
        return await wrapped(check, context, event, callback);
    }

    // _wrapTemplatePreview method removed - no longer compatible with Foundry v13

    /**
     * Check if data is from an attack-like message
     * @param {Object} data - Message data
     * @returns {boolean}
     * @private
     */
    _isAttackLikeMessageData(data) {
        if (!data) return false;

        // Check for PF2e context
        const ctx = data?.flags?.pf2e?.context || {};
        if (!ctx) return false;

        // Check for specific types
        const ctxType = ctx.type || '';
        if (['attack-roll', 'saving-throw', 'damage-roll'].includes(ctxType)) {
            return true;
        }

        // Check for skill checks that might include cover
        if (ctxType === 'skill-check' && ctx.skill === 'stealth') {
            return true;
        }

        return false;
    }

    /**
     * Get the bonus value for a cover state
     * @param {string} state - Cover state ('none', 'lesser', 'standard', 'greater')
     * @returns {number} - Bonus value (negative for AC penalties)
     * @private
     */
    _getCoverBonus(state) {
        switch (state) {
            case 'lesser':
                return -1;
            case 'standard':
                return -2;
            case 'greater':
                return -4;
            default:
                return 0;
        }
    }

    /**
     * Normalize token reference
     * @param {string|Object} ref - Token reference
     * @returns {string|null}
     * @private
     */
    _normalizeTokenRef(ref) {
        if (!ref) return null;
        if (typeof ref === 'string') return ref;
        return ref.id || null;
    }

    /**
     * Get the appropriate use case for a given context
     * @param {Object} ctx - Context object
     * @returns {Object|null} - Use case object or null
     * @private
     */
    _getUseCaseForContext(ctx) {
        if (!ctx) {
            console.debug('PF2E Visioner | No context provided for use case resolution');
            return null;
        }

        console.debug('PF2E Visioner | Finding use case for context', {
            contextType: ctx.type,
            skill: ctx.skill,
            domains: ctx.domains,
            action: ctx.action
        });

        // Check for attack context
        if (this._isAttackContext(ctx)) {
            console.debug('PF2E Visioner | Resolved attack use case');
            return this.attackRollUseCase;
        }

        // Check for saving throw context
        if (ctx.type === 'saving-throw') {
            console.debug('PF2E Visioner | Resolved saving throw use case');
            return this.savingThrowUseCase;
        }

        // Check for stealth context
        if (ctx.type === 'skill-check' &&
            (Array.isArray(ctx.domains) && ctx.domains.includes('stealth'))) {
            console.debug('PF2E Visioner | Resolved stealth use case');
            return this.stealthCheckUseCase;
        }

        console.debug('PF2E Visioner | No matching use case found for context', {
            contextType: ctx.type
        });
        return null;
    }

    /**
     * Check if context is an attack context
     * @param {Object} ctx - Context object
     * @returns {boolean}
     * @private
     */
    _isAttackContext(ctx) {
        if (!ctx) return false;

        // Direct attack roll
        if (ctx.type === 'attack-roll') return true;

        // Attack action
        if (ctx.type === 'action-check' && ctx.action === 'attack') return true;

        // Strike with attack trait
        if (ctx.type === 'strike-attack-roll') return true;

        // Check domains for attack
        if (Array.isArray(ctx.domains) &&
            (ctx.domains.includes('attack') || ctx.domains.includes('attack-roll'))) {
            return true;
        }

        return false;
    }
}