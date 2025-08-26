/**
 * CoverUIManager.js
 * Manages UI elements for auto-cover functionality
 */
import { COVER_STATES } from '../../constants.js';
import { getCoverBonusByState, getCoverLabel, getCoverStealthBonusByState } from '../../helpers/cover-helpers.js';

export class CoverUIManager {
    /**
     * Constructor
     * @param {Object} autoCoverSystem - The auto-cover system instance
     */
    constructor(autoCoverSystem) {
        this.autoCoverSystem = autoCoverSystem;
    }

    /**
     * Initialize the UI manager
     * This is called when the system is ready
     */
    initialize() {
        console.debug('PF2E Visioner | Cover UI Manager initialized');

        // Register a hook to inject cover UI into check modifiers dialog
        Hooks.on('renderCheckModifiersDialog', (dialog, html, data) => {
            console.debug('PF2E Visioner | CoverUIManager: renderCheckModifiersDialog fired', {
                dialog: dialog.constructor.name,
                hasData: !!data
            });

            // Only proceed if we don't already have cover UI (prevents duplicates)
            if (html.find('.pv-cover-override, .auto-cover-override').length > 0) {
                console.debug('PF2E Visioner | Cover override UI already exists in dialog, skipping injection');
                return;
            }

            // Get context from the dialog
            const ctx = dialog?.context || dialog?.options?.context || {};

            // Check if this is an attack roll dialog
            if (ctx.type === 'attack-roll' || ctx.domains?.includes('attack-roll')) {
                console.debug('PF2E Visioner | This is an attack roll dialog, injecting cover UI');

                // Attempt to determine attacker and target
                try {
                    const attacker = this._resolveAttackerFromCtx(ctx);
                    const target = this._resolveTargetFromCtx(ctx);

                    if (attacker && target) {
                        console.debug('PF2E Visioner | Resolved attacker and target for attack roll dialog', {
                            attacker: attacker.name,
                            target: target.name
                        });

                        // Detect cover state
                        const state = this.autoCoverSystem.detectCoverForAttack(attacker, target);

                        // Inject UI
                        this.injectCoverOverrideUI(html, state);
                        this.bindRollButton(html, dialog, attacker, target);
                    } else {
                        console.debug('PF2E Visioner | Could not resolve attacker or target for attack roll dialog');
                    }
                } catch (error) {
                    console.warn('PF2E Visioner | Error resolving tokens for dialog:', error);
                }
            }
        });
    }

    /**
     * Inject cover override UI into dialog
     * @param {Object} html - Dialog HTML
     * @param {string} state - Current cover state
     */
    injectCoverOverrideUI(html, state) {
        try {
            // Do NOT set an initial cover override state - only set it when user explicitly clicks a button
            // This prevents auto-detected states from being treated as user overrides
            // html.data('coverOverride', state || 'none'); // REMOVED - this was the cause of persistence

            console.warn('PF2E Visioner | Injecting cover override UI', {
                currentState: state,
                isGM: game.user.isGM,
                noInitialOverride: true // Changed to indicate we're not setting initial override
            });

            // Allow both GMs and players to see the UI, but only GMs can modify it
            const isGM = game.user.isGM;
            const readOnly = !isGM;

            // Check if the injected UI already exists - checking for both old and new UI classes
            if (html.find('.auto-cover-override, .pv-cover-override').length > 0) {
                console.debug('PF2E Visioner | Cover override UI already exists, skipping injection');
                return;
            }

            // Create the cover override UI using template helper
            const coverOverrideHTML = this._createCoverOverrideTemplate(state, readOnly);

            // Try different potential insertion points in order of preference based on the provided HTML structure
            let injected = false;

            // First priority: Find the last HR element in the form and insert after it
            // This would place it right before the roll button but after roll mode panel
            const lastHr = html.find('form hr').last();
            if (lastHr.length > 0) {
                lastHr.after(coverOverrideHTML);
                injected = true;
                console.debug('PF2E Visioner | Injected cover UI after last HR element');
            }

            // Second priority: Try to find the roll mode panel
            if (!injected) {
                const rollModePanel = html.find('.roll-mode-panel');
                if (rollModePanel.length > 0) {
                    // Insert after the roll mode panel
                    rollModePanel.after(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI after roll-mode-panel');
                }
            }

            // Check for roll mode selector specifically
            if (!injected) {
                const rollModeSelect = html.find('select[name="rollmode"]');
                if (rollModeSelect.length > 0) {
                    // Find the parent element containing the roll mode (often a div or label)
                    const rollModeParent = rollModeSelect.closest('.roll-mode, .roll-mode-panel, div, label');
                    if (rollModeParent.length > 0) {
                        // Insert after the roll mode parent
                        rollModeParent.after(coverOverrideHTML);
                        injected = true;
                        console.debug('PF2E Visioner | Injected cover UI after roll mode select parent');
                    } else {
                        // If we can't find a parent, just insert after the HR following the select
                        const nextHr = rollModeSelect.closest('div, label').nextAll('hr').first();
                        if (nextHr.length > 0) {
                            nextHr.after(coverOverrideHTML);
                            injected = true;
                            console.debug('PF2E Visioner | Injected cover UI after HR following roll mode');
                        }
                    }
                }
            }

            // Try to find the roll button and insert before it
            if (!injected) {
                const rollButton = html.find('button.roll, button[type="button"].roll');
                if (rollButton.length > 0) {
                    rollButton.before(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI before roll button');
                }
            }

            // Try dialog-buttons as fallback
            if (!injected) {
                const dialogButtons = html.find('.dialog-buttons');
                if (dialogButtons.length > 0) {
                    dialogButtons.before(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI before dialog-buttons');
                }
            }

            // Form content as another fallback
            if (!injected) {
                const form = html.find('form');
                if (form.length > 0) {
                    form.append(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI at end of form');
                }
            }

            // Last resort: append to dialog content or root
            if (!injected) {
                const content = html.find('.dialog-content, .window-content');
                if (content.length > 0) {
                    content.append(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI at end of dialog-content');
                } else {
                    // Just append to the dialog root as last resort
                    html.append(coverOverrideHTML);
                    injected = true;
                    console.debug('PF2E Visioner | Injected cover UI at end of dialog root');
                }
            }

            // Tag with correlation id if one exists on the dialog element already
            try {
                const cid = html.data('coverCorrelationId');
                if (cid) {
                    html.attr('data-pv-correlation-id', cid);
                }
            } catch { }

            // Add event listener to radio buttons
            this._bindCoverOverrideEvents(html);

            // Add some CSS to make sure it displays properly
            this._addCoverOverrideStyles(html);

            console.debug('PF2E Visioner | Cover override UI injection complete', { injected });
        } catch (error) {
            console.error('PF2E Visioner | Error injecting cover override UI:', error);
        }
    }

    /**
     * Create HTML template for cover override UI
     * @param {string} state - Current cover state
     * @param {boolean} readOnly - Whether the UI should be read-only (for players)
     * @returns {string} - HTML template
     * @private
     */
    _createCoverOverrideTemplate(state, readOnly = false) {
        // Helper functions are imported at the top of the file via ES modules
        const current = state || 'none';
        const isStealthCheck = false; // Determine if this is a stealth check (might need context)

        // For readonly mode, show text label instead of radio buttons
        if (readOnly) {
            const coverLabel = getCoverLabel(state);
            return `
            <div class="auto-cover-override">
              <h3>Cover Detection</h3>
              <div class="cover-display">
                <span class="cover-value ${state}">${coverLabel}</span>
              </div>
            </div>`;
        }

        // For GMs, use the exact UI structure from the HTML sample
        const container = $(`
          <div class="pv-cover-override" style="margin: 6px 0 8px 0;">
            <div class="pv-cover-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <div class="pv-cover-title" style="font-weight:600;">${game.i18n?.localize?.('PF2E_VISIONER.UI.COVER_OVERRIDE') ?? 'Cover Override'}</div>
              <div class="pv-cover-buttons" style="display:flex; gap:6px;"></div>
            </div>
          </div>
        `);
        // Store suggested/detected state on the container for styling/tools if needed
        try { container.attr('data-suggested-state', current); } catch { }
        const btns = container.find('.pv-cover-buttons');
        const states = ['none', 'lesser', 'standard', 'greater'];
        for (const s of states) {
            const label = getCoverLabel(s);
            // Use appropriate bonus function based on context
            const bonus = isStealthCheck ?
                getCoverStealthBonusByState(s) :
                getCoverBonusByState(s);
            // Do NOT mark any button as active by default; active now strictly means "user-selected override"
            const isActive = false;
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
            <button type="button" class="pv-cover-btn${isActive ? ' active' : ''}" data-state="${s}" title="${tooltip}" data-tooltip="${tooltip}" data-tooltip-direction="UP" aria-label="${tooltip}" style="width:28px; height:28px; padding:0; line-height:0; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:${isActive ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))' : 'transparent'}; color:inherit; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
              <i class="${iconClass}" style="color:var(--cover-${s}, ${color}); display:block; width:18px; height:18px; line-height:18px; text-align:center; font-size:16px; margin:0;"></i>
            </button>
          `);

            // No longer adding event listener here since we're doing it in _bindCoverOverrideEvents
            btns.append(btn);
        }

        // Return the HTML string
        return container.prop('outerHTML');
    }

    /**
     * Add CSS styles for the cover override UI
     * @param {Object} html - Dialog HTML
     * @private
     */
    _addCoverOverrideStyles(html) {
        // Add styles directly to ensure they apply correctly
        const styles = `
        <style>
          .auto-cover-override {
            margin-top: 10px;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background: rgba(0, 0, 0, 0.05);
          }
          .auto-cover-override h3 {
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #222;
          }
          .cover-display {
            text-align: center;
            padding: 5px;
          }
          .cover-display .cover-value {
            font-weight: bold;
          }
          .cover-display .none { color: #777; }
          .cover-display .lesser { color: #4b8e3a; }
          .cover-display .standard { color: #d97706; }
          .cover-display .greater { color: #b91c1c; }
          
          /* Styles for the new UI */
          .pv-cover-override {
            margin: 6px 0 8px 0;
          }
          .pv-cover-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }
          .pv-cover-title {
            font-weight: 600;
          }
          .pv-cover-buttons {
            display: flex;
            gap: 6px;
          }
          .pv-cover-btn {
            width: 28px;
            height: 28px;
            padding: 0;
            line-height: 0;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 6px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
          }
          .pv-cover-btn:hover {
            background: rgba(0,0,0,0.1);
          }
          .pv-cover-btn.active {
            background: var(--color-bg-tertiary, rgba(0,0,0,0.2));
            box-shadow: 0 0 3px rgba(0,0,0,0.3) inset;
          }
        </style>
        `;

        html.append(styles);
    }

    /**
     * Bind event listeners to cover override UI
     * @param {Object} html - Dialog HTML
     * @private
     */
    _bindCoverOverrideEvents(html) {
        // Log initial binding attempt
        console.warn('PF2E Visioner | Binding cover override events', {
            oldUIElements: html.find('input[name="cover-override"]').length,
            newUIElements: html.find('.pv-cover-btn').length
        });

        // For the old UI
        html.find('input[name="cover-override"]').on('change', (event) => {
            const newState = event.currentTarget.value;
            console.warn('PF2E Visioner | Cover state override (old UI):', newState);
            // Store the override value for use when the roll button is clicked
            html.data('coverOverride', newState);

            // Carry forward correlation id
            const correlationId = html.data('coverCorrelationId') || html.attr('data-pv-correlation-id') || null;
            if (correlationId) html.data('coverCorrelationId', correlationId);

            // Add notification for visibility
            ui.notifications?.info?.(`Cover Override: ${newState}`);

            // Also store the override at the window level for better access
            window.PF2E_VISIONER_COVER_OVERRIDE = {
                state: newState,
                timestamp: Date.now(),
                attacker: html.data('coverAttacker')?.id,
                target: html.data('coverTarget')?.id,
                correlationId
            };

            console.warn('PF2E Visioner | Stored cover override in window object', window.PF2E_VISIONER_COVER_OVERRIDE);
        });

        // For the new UI (buttons are already bound in the template)
        html.find('.pv-cover-btn').on('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const btn = $(event.currentTarget);
            const newState = btn.data('state');
            console.warn('PF2E Visioner | Cover state override (new UI):', newState);

            // Update UI
            html.find('.pv-cover-btn').removeClass('active');
            btn.addClass('active');

            // Store the override value
            html.data('coverOverride', newState);

            // Carry forward correlation id
            const correlationId = html.data('coverCorrelationId') || html.attr('data-pv-correlation-id') || null;
            if (correlationId) html.data('coverCorrelationId', correlationId);

            // Add notification for visibility
            ui.notifications?.info?.(`Cover Override: ${newState}`);

            // Also store the override at the window level for better access
            window.PF2E_VISIONER_COVER_OVERRIDE = {
                state: newState,
                timestamp: Date.now(),
                attacker: html.data('coverAttacker')?.id,
                target: html.data('coverTarget')?.id,
                correlationId
            };

            console.warn('PF2E Visioner | Stored cover override in window object', window.PF2E_VISIONER_COVER_OVERRIDE);

            return false;
        });
    }

    /**
     * Bind roll button to ensure cover is applied
     * @param {Object} html - Dialog HTML
     * @param {Object} dialog - Dialog object
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     */
    bindRollButton(html, dialog, attacker, target) {
        try {
            if (!attacker || !target) return;

            // Store the tokens in the dialog data (used elsewhere)
            html.data('coverAttacker', attacker);
            html.data('coverTarget', target);

            // Find the roll button (PF2E v5 renamed classes; cover common cases)
            const rollButton = html.find('button.roll, button[data-action="roll"], footer .dialog-buttons .roll, footer .dialog-buttons button[type="submit"]');
            if (rollButton.length === 0) {
                console.warn('PF2E Visioner | Roll button not found');
                return;
            }

            // Pre-inject override as early as possible (capture phase) so PF2E listeners see it
            try {
                const preInject = () => {
                    try {
                        const overrideState = html.data('coverOverride');
                        if (!overrideState) return;
                        // Mark that we've pre-injected to avoid duplicate work in fallback handler
                        html.data('pvPreInjected', true);

                        // Maintain correlation id
                        const correlationId = html.data('coverCorrelationId') || html.attr('data-pv-correlation-id') || dialog?.context?.coverCorrelationId || dialog?.check?.context?.coverCorrelationId || null;
                        if (correlationId) {
                            html.data('coverCorrelationId', correlationId);
                            dialog.context = dialog.context || {};
                            dialog.context.coverCorrelationId = correlationId;
                            if (dialog?.check?.context) dialog.check.context.coverCorrelationId = correlationId;
                        }

                        // Inject into dialog for downstream consumers
                        if (dialog?.check) {
                            dialog.check.context ??= {};
                            dialog.check.context.coverOverrideState = overrideState;
                            if (correlationId) dialog.check.context.coverCorrelationId = correlationId;
                        }
                        if (dialog?.check?.options) {
                            dialog.check.options.coverOverrideState = overrideState;
                        }
                        dialog.element?.data?.('coverOverride', overrideState);

                        // Global + old-style stores for maximum compatibility
                        window.PF2E_VISIONER_COVER_OVERRIDE = {
                            state: overrideState,
                            timestamp: Date.now(),
                            attacker: html.data('coverAttacker')?.id,
                            target: html.data('coverTarget')?.id,
                            correlationId
                        };

                        if (!window.pf2eVisionerDialogOverrides) {
                            window.pf2eVisionerDialogOverrides = new Map();
                        }
                        if (!window.pf2eVisionerDialogOverridesByCorrelation) {
                            window.pf2eVisionerDialogOverridesByCorrelation = new Map();
                        }
                        const attackerToken = html.data('coverAttacker');
                        const targetToken = html.data('coverTarget');
                        if (attackerToken && targetToken) {
                            // Clear any previous overrides for this target to avoid stale carry-over
                            try {
                                for (const key of window.pf2eVisionerDialogOverrides.keys()) {
                                    if (key.endsWith(`-${targetToken.id}`)) {
                                        window.pf2eVisionerDialogOverrides.delete(key);
                                    }
                                }
                            } catch { /* ignore */ }
                            // Store only the most specific and stable key: attackerTokenId-targetTokenId
                            const key = `${attackerToken.id}-${targetToken.id}`;
                            window.pf2eVisionerDialogOverrides.set(key, overrideState);
                            // Also store by correlation id for strongest scoping
                            if (correlationId) {
                                window.pf2eVisionerDialogOverridesByCorrelation.set(correlationId, overrideState);
                            }
                        }
                        console.debug('PF2E Visioner | Pre-injected override before roll (capture)', { overrideState });
                    } catch { }
                };
                // Add capture-phase listener first to run before PF2E handlers
                if (rollButton[0]?.addEventListener) {
                    rollButton[0].addEventListener('click', preInject, true);
                }
            } catch { }

            // Replace the click handler with our enhanced version (fallback)
            this._replaceRollButtonHandler(rollButton, html, dialog, attacker, target);
        } catch (error) {
            console.error('PF2E Visioner | Error binding roll button:', error);
        }
    }

    /**
     * Replace roll button click handler
     * @param {Object} rollButton - jQuery roll button element
     * @param {Object} html - Dialog HTML
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @private
     */
    _replaceRollButtonHandler(rollButton, html, dialog, attacker, target) {
        // Store original inline onclick if present
        const originalClickHandler = rollButton[0].onclick;

        console.debug('PF2E Visioner | Replacing roll button handler', {
            hasOriginalHandler: !!originalClickHandler,
            attackerName: attacker?.name,
            targetName: target?.name
        });

        rollButton[0].onclick = async (event) => {
            try {
                // Read current override from dialog html (set by our buttons)
                const overrideState = html.data('coverOverride');
                if (overrideState && !html.data('pvPreInjected')) {
                    const correlationId = html.data('coverCorrelationId') || html.attr('data-pv-correlation-id') || dialog?.context?.coverCorrelationId || dialog?.check?.context?.coverCorrelationId || null;
                    if (correlationId) {
                        html.data('coverCorrelationId', correlationId);
                        dialog.context = dialog.context || {};
                        dialog.context.coverCorrelationId = correlationId;
                        if (dialog?.check?.context) dialog.check.context.coverCorrelationId = correlationId;
                    }
                    // Inject override into the roll context so AttackRollUseCase can read it
                    if (dialog?.check) {
                        dialog.check.context ??= {};
                        dialog.check.context.coverOverrideState = overrideState;
                        if (correlationId) dialog.check.context.coverCorrelationId = correlationId;
                        console.debug('PF2E Visioner | Injected override into dialog.check.context', {
                            overrideState,
                            contextKeys: Object.keys(dialog.check.context)
                        });
                    }

                    // Also try injecting directly into the check object if it exists
                    if (dialog?.check?.options) {
                        dialog.check.options.coverOverrideState = overrideState;
                        console.debug('PF2E Visioner | Injected override into dialog.check.options', {
                            overrideState
                        });
                    }

                    // Also stash in the dialog instance for any other consumers
                    dialog.element?.data?.('coverOverride', overrideState);

                    // Set global override with a more recent timestamp to ensure it's found
                    window.PF2E_VISIONER_COVER_OVERRIDE = {
                        state: overrideState,
                        timestamp: Date.now(),
                        attacker: html.data('coverAttacker')?.id,
                        target: html.data('coverTarget')?.id,
                        correlationId
                    };

                    // ALSO set in the old-style system that the working code uses
                    if (!window.pf2eVisionerDialogOverrides) {
                        window.pf2eVisionerDialogOverrides = new Map();
                    }
                    if (!window.pf2eVisionerDialogOverridesByCorrelation) {
                        window.pf2eVisionerDialogOverridesByCorrelation = new Map();
                    }

                    const attackerToken = html.data('coverAttacker');
                    const targetToken = html.data('coverTarget');

                    if (attackerToken && targetToken) {
                        // Remove any existing overrides for this target to prevent stale selections
                        try {
                            for (const key of window.pf2eVisionerDialogOverrides.keys()) {
                                if (key.endsWith(`-${targetToken.id}`)) {
                                    window.pf2eVisionerDialogOverrides.delete(key);
                                }
                            }
                        } catch { /* ignore */ }

                        const overrideKey = `${attackerToken.id}-${targetToken.id}`;
                        window.pf2eVisionerDialogOverrides.set(overrideKey, overrideState);
                        if (correlationId) {
                            window.pf2eVisionerDialogOverridesByCorrelation.set(correlationId, overrideState);
                        }
                        console.debug('PF2E Visioner | Stored old-style dialog override:', {
                            key: overrideKey,
                            value: overrideState
                        });
                    }

                    console.debug('PF2E Visioner | Set fresh global override before roll', {
                        overrideState,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.error('PF2E Visioner | Error injecting cover override state before roll:', e);
            }            // Let PF2E proceed with the original click handler if present
            if (originalClickHandler) {
                return originalClickHandler.call(rollButton[0], event);
            }
            // If there's no inline onclick, allow other listeners to run
            // (we didn't call preventDefault, so bubbling listeners will still execute)
        };
    }

    /**
     * Handle roll button click
     * @param {Object} html - Dialog HTML
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @returns {Promise}
     * @private
     */
    async _handleRollButtonClick(html, attacker, target) {
        // Get the override state if any
        const overrideState = html.data('coverOverride');

        console.warn('PF2E Visioner | Handling roll button click', {
            hasOverride: !!overrideState,
            overrideState,
            isGM: game.user.isGM,
            attackerId: attacker?.id,
            targetId: target?.id,
            htmlHasData: !!html.data()
        });

        // If GM has set an override, use that
        if (overrideState) {
            console.warn('PF2E Visioner | Applying cover override', {
                state: overrideState,
                attackerName: attacker?.name,
                targetName: target?.name
            });

            // Notify about the applied override
            ui.notifications?.info?.(`Applying cover override: ${overrideState}`);

            await this.autoCoverSystem.setCoverBetween(attacker, target, overrideState);
            this.autoCoverSystem.recordPair(attacker.id, target.id);
        } else {
            console.warn('PF2E Visioner | No cover override found in dialog data');
        }
    }

    /**
     * Resolve attacker from context
     * @param {Object} ctx - Context object
     * @returns {Object|null}
     * @private
     */
    _resolveAttackerFromCtx(ctx) {
        if (!ctx || !canvas?.tokens?.get) return null;

        // Method 1: Try to get token from context token.id (old format)
        const tokenId = ctx.token?.id;
        if (tokenId) {
            const token = canvas.tokens.get(tokenId);
            if (token) {
                console.debug('PF2E Visioner | CoverUIManager: Found attacker using token.id', { attackerId: token.id });
                return token;
            }
        }

        // Method 2: Try context.actor.token.id
        const actorTokenId = ctx.actor?.token?.id;
        if (actorTokenId) {
            const token = canvas.tokens.get(actorTokenId);
            if (token) {
                console.debug('PF2E Visioner | CoverUIManager: Found attacker using actor.token.id', { attackerId: token.id });
                return token;
            }
        }

        // Method 3: Try actor.getActiveTokens() for the actor in context
        if (ctx.actor?.getActiveTokens) {
            const tokens = ctx.actor.getActiveTokens();
            if (tokens.length > 0) {
                console.debug('PF2E Visioner | CoverUIManager: Found attacker using actor.getActiveTokens', { attackerId: tokens[0].id });
                return tokens[0];
            }
        }

        // Method 4: Fallback to controlled token
        if (canvas.tokens.controlled.length === 1) {
            console.debug('PF2E Visioner | CoverUIManager: Using controlled token as attacker', { attackerId: canvas.tokens.controlled[0].id });
            return canvas.tokens.controlled[0];
        }

        // Method 5: Fallback to user character
        if (game.user.character) {
            const tokens = game.user.character.getActiveTokens();
            if (tokens.length > 0) {
                console.debug('PF2E Visioner | CoverUIManager: Using user character token as attacker', { attackerId: tokens[0].id });
                return tokens[0];
            }
        }

        console.debug('PF2E Visioner | CoverUIManager: Could not resolve attacker from context');
        return null;
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
                console.debug('PF2E Visioner | CoverUIManager: Found target using target.token.id', { targetId: token.id });
                return token;
            }
        }

        // Method 2: Try direct target.id (newer format)
        const directTargetId = ctx.target?.id;
        if (directTargetId) {
            const token = canvas.tokens.get(directTargetId);
            if (token) {
                console.debug('PF2E Visioner | CoverUIManager: Found target using target.id', { targetId: token.id });
                return token;
            }
        }

        // Method 3: Check for targets array (first item only)
        if (Array.isArray(ctx.targets) && ctx.targets.length > 0) {
            const targetId = this._normalizeTokenRef(ctx.targets[0]);
            if (targetId) {
                const token = canvas.tokens.get(targetId);
                if (token) {
                    console.debug('PF2E Visioner | CoverUIManager: Found target using targets array', { targetId: token.id });
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
                    console.debug('PF2E Visioner | CoverUIManager: Found target using options.targets array', { targetId: token.id });
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
                        console.debug('PF2E Visioner | CoverUIManager: Found target using target.uuid', { targetId: token.id });
                        return token;
                    }
                }
            } catch (e) {
                console.debug('PF2E Visioner | Error parsing target UUID:', e);
            }
        }

        // Method 6: Check for DC object
        if (ctx.dc?.token) {
            const tokenId = ctx.dc.token.id || ctx.dc.token;
            if (tokenId) {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    console.debug('PF2E Visioner | CoverUIManager: Found target using dc.token', { targetId: token.id });
                    return token;
                }
            }
        }

        // Method 7: Fallback to current target
        if (game.user.targets.size === 1) {
            const token = game.user.targets.first();
            console.debug('PF2E Visioner | CoverUIManager: Using current user target as fallback', { targetId: token.id });
            return token;
        }

        console.debug('PF2E Visioner | CoverUIManager: Could not resolve target from context');
        return null;
    }

    /**
     * Normalize token reference
     * @param {string|Object} ref - Token reference
     * @returns {string|null} - Normalized token ID
     * @private
     */
    _normalizeTokenRef(ref) {
        if (!ref) return null;
        if (typeof ref === 'string') return ref;
        return ref.id || null;
    }
}
