/**
 * Advanced chat message automation for PF2E Visioner
 * Provides intelligent visibility resolution for Seek actions
 */

import { MODULE_TITLE, MODULE_ID } from './constants.js';
import { getVisibilityBetween } from './utils.js';
import { updateTokenVisuals } from './visual-effects.js';
import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';

// Cache for processed messages to prevent duplicate processing
const processedMessages = new Set();

// Store reference to current seek dialog
let currentSeekDialog = null;

/**
 * Enhanced chat message processor for Seek action automation
 * Uses modern FoundryVTT patterns and intelligent detection
 * @param {ChatMessage} message - The chat message document
 * @param {jQuery} html - The rendered HTML element
 */
export function onRenderChatMessage(message, html) {
    // Early returns for optimization
    if (!game.user.isGM || !game.settings.get(MODULE_ID, 'enableSeekAutomation')) return;
    
    // Use modern message detection approach
    const seekData = extractSeekActionData(message);
    if (!seekData) return;
    
    // Prevent duplicate processing using cache
    if (processedMessages.has(message.id)) return;
    
    // Create and inject the automation interface
    injectSeekAutomationUI(message, html, seekData);
}

/**
 * Modern approach to extract Seek action data from chat messages
 * Uses robust detection patterns and data validation
 * @param {ChatMessage} message - The chat message to analyze
 * @returns {Object|null} Seek data or null if not a Seek action
 */
function extractSeekActionData(message) {
    // Validate message structure
    if (!message?.token?.object || !message.rolls?.length) return null;
    
    // Check for PF2e context using modern flag access
    const context = message.flags?.pf2e?.context;
    if (!context?.type === 'skill-check') return null;
    
    // Verify this is a Seek action using multiple detection methods
    const isSeekAction = context.options?.includes('action:seek') || 
                        context.slug === 'seek' ||
                        message.flavor?.toLowerCase().includes('seek');
    
    if (!isSeekAction) return null;
    
    // Get the token - try multiple approaches
    let seekerToken = null;
    if (message.token?.object) {
        seekerToken = message.token.object;
    } else if (message.speaker?.token) {
        seekerToken = canvas.tokens.get(message.speaker.token);
    }
    
    if (!seekerToken) {
        console.warn(`${MODULE_TITLE}: Could not find seeker token for Seek action`);
        return null;
    }
    
    return {
        actor: seekerToken,
        roll: message.rolls[0],
        context,
        messageId: message.id
    };
}

/**
 * Advanced UI injection system for Seek automation
 * Creates modern, accessible interface elements
 * @param {ChatMessage} message - The chat message
 * @param {jQuery} html - The HTML container
 * @param {Object} seekData - Extracted Seek data
 */
function injectSeekAutomationUI(message, html, seekData) {
    // Create modern automation panel
    const automationPanel = buildAutomationPanel(seekData);
    
    // Find optimal injection point - after the dice result but before flavor text
    let targetContainer = html.find('.dice-total').parent();
    if (!targetContainer.length) {
        targetContainer = html.find('.dice-result').last();
    }
    if (!targetContainer.length) {
        targetContainer = html.find('.message-content').first();
    }
    if (!targetContainer.length) return;
    
    // Inject after the dice result
    const panel = $(automationPanel);
    targetContainer.after(panel);
    
    // Bind modern event handlers
    bindAutomationEvents(panel, message, seekData);
    
    // Mark as processed
    processedMessages.add(message.id);
}

/**
 * Modern automation panel builder with enhanced UX
 * Creates accessible, feature-rich interface
 * @param {Object} seekData - The Seek action data
 * @returns {string} Complete automation panel HTML
 */
function buildAutomationPanel(seekData) {
    const label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
    const tooltip = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP');
    
    return `
        <div class="pf2e-visioner-automation-panel" data-message-id="${seekData.messageId}">
            <div class="automation-header">
                <i class="fas fa-search-location"></i>
                <span class="automation-title">Seek Results Available</span>
            </div>
            <div class="automation-actions">
                <button type="button" 
                        class="visioner-btn visioner-btn-primary" 
                        data-action="open-seek-results"
                        title="${tooltip}">
                    <i class="fas fa-search"></i> ${label}
                </button>
            </div>
        </div>
    `;
}

/**
 * Modern event binding system for automation panel
 * Uses delegation and modern async patterns
 * @param {jQuery} panel - The automation panel element
 * @param {ChatMessage} message - The chat message
 * @param {Object} seekData - The Seek action data
 */
function bindAutomationEvents(panel, message, seekData) {
    // Use event delegation for better performance
    panel.on('click', '[data-action]', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const action = event.currentTarget.dataset.action;
        const button = $(event.currentTarget);
        
        // Prevent double-clicks
        if (button.hasClass('processing')) return;
        
        try {
            button.addClass('processing').prop('disabled', true);
            
            switch (action) {
                case 'open-seek-results':
                    await previewSeekResults(seekData);
                    break;
            }
        } catch (error) {
            console.error(`${MODULE_TITLE}: Automation error:`, error);
            ui.notifications.error(`${MODULE_TITLE}: ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.ERROR_PROCESSING')}`);
        } finally {
            button.removeClass('processing').prop('disabled', false);
        }
    });
}



/**
 * Validate if a token is a valid Seek target
 * @param {Token} token - Potential target token
 * @param {Token} seeker - The seeking token
 * @returns {boolean} Whether the token is a valid target
 */
function isValidSeekTarget(token, seeker) {
    return token !== seeker && 
           token.actor && 
           token.document.disposition !== seeker.document.disposition &&
           !token.document.hidden;
}

/**
 * Extract Stealth DC from token using modern PF2e patterns
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Stealth DC or 0 if not found
 */
function extractStealthDC(token) {
    // Use modern optional chaining and fallbacks
    return token.actor?.skills?.stealth?.dc?.value ?? 
           token.actor?.system?.skills?.stealth?.dc?.value ?? 0;
}

/**
 * Calculate distance between tokens for sorting
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in grid units
 */
function calculateTokenDistance(token1, token2) {
    const ray = new Ray(token1.center, token2.center);
    return canvas.grid.measureDistances([{ ray }], { gridSpaces: true })[0];
}

/**
 * Discover valid Seek targets (undetected tokens)
 * @param {Token} seekerToken - The token performing the Seek
 * @returns {Array} Array of target objects with token, DC, and visibility data
 */
function discoverSeekTargets(seekerToken) {
    if (!seekerToken) return [];
    
    const targets = [];
    
    // Find all tokens that are hidden or undetected to the seeker
    for (const token of canvas.tokens.placeables) {
        if (token === seekerToken) continue;
        if (!token.actor) continue;
        
        // Check current visibility state
        const currentVisibility = getVisibilityBetween(seekerToken, token);
        if (currentVisibility !== 'undetected' && currentVisibility !== 'hidden') continue;
        
        // Extract Stealth DC
        const stealthDC = extractStealthDC(token);
        if (stealthDC <= 0) continue;
        
        targets.push({
            token,
            stealthDC,
            currentVisibility,
            distance: calculateTokenDistance(seekerToken, token)
        });
    }
    
    // Sort by distance (closest first)
    return targets.sort((a, b) => a.distance - b.distance);
}

/**
 * Advanced Seek outcome calculator following official PF2e rules
 * Critical Success: Any Undetected or Hidden → Observed
 * Success: Undetected → Hidden, Hidden → Observed
 * Failure/Critical Failure: No change
 * @param {Object} seekData - The Seek action data
 * @param {Object} target - Target data with token and DC
 * @returns {Object} Detailed outcome analysis
 */
function analyzeSeekOutcome(seekData, target) {
    const roll = seekData.roll;
    const dc = target.stealthDC;
    
    // Use modern degree calculation approach
    const outcome = determineOutcome(roll.total, roll.dice[0]?.total ?? 10, dc);
    
    // Apply official PF2e Seek rules based on current visibility and outcome
    let newVisibility = target.currentVisibility; // Default: no change
    
    if (outcome === 'critical-success') {
        // Critical Success: Any Undetected or Hidden creature becomes Observed
        if (target.currentVisibility === 'undetected' || target.currentVisibility === 'hidden') {
            newVisibility = 'observed';
        }
    } else if (outcome === 'success') {
        // Success: Any Undetected becomes Hidden, Hidden becomes Observed
        if (target.currentVisibility === 'undetected') {
            newVisibility = 'hidden';
        } else if (target.currentVisibility === 'hidden') {
            newVisibility = 'observed';
        }
    }
    // Failure/Critical Failure: No change (stays the same)
    
    return {
        target: target.token,
        oldVisibility: target.currentVisibility,
        newVisibility,
        outcome,
        rollTotal: roll.total,
        dc,
        margin: roll.total - dc,
        changed: newVisibility !== target.currentVisibility
    };
}

/**
 * Modern degree of success determination with natural 20/1 handling
 * @param {number} total - Roll total
 * @param {number} die - Natural die result
 * @param {number} dc - Difficulty class
 * @returns {string} Outcome string
 */
function determineOutcome(total, die, dc) {
    let baseOutcome;
    const margin = total - dc;
    
    // Determine base outcome
    if (margin >= 10) baseOutcome = 'critical-success';
    else if (margin >= 0) baseOutcome = 'success';
    else if (margin >= -10) baseOutcome = 'failure';
    else baseOutcome = 'critical-failure';
    
    // Apply natural 20/1 adjustments
    if (die === 20 && baseOutcome === 'success') return 'critical-success';
    if (die === 1 && baseOutcome === 'failure') return 'critical-failure';
    
    return baseOutcome;
}

/**
 * Preview Seek results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} seekData - The Seek action data
 */
async function previewSeekResults(seekData) {
    const targets = discoverSeekTargets(seekData.actor);
    
    if (targets.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.NO_UNDETECTED_TOKENS', { name: seekData.actor.name })}`);
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = targets.map(target => analyzeSeekOutcome(seekData, target));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new SeekPreviewDialog(seekData.actor, outcomes, changes);
    currentSeekDialog = previewDialog; // Store reference for action handlers
    previewDialog.render(true);
}

/**
 * ApplicationV2-based Seek Preview Dialog
 * Matches the visibility manager's design and functionality
 */
class SeekPreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['seek-preview-dialog'],
        window: {
            title: 'PF2E_VISIONER.SEEK_AUTOMATION.PREVIEW_TITLE',
            icon: 'fas fa-search',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            close: SeekPreviewDialog._onClose,
            applyAll: SeekPreviewDialog._onApplyAll,
            revertAll: SeekPreviewDialog._onRevertAll,
            applyChange: SeekPreviewDialog._onApplyChange,
            revertChange: SeekPreviewDialog._onRevertChange
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/seek-preview.hbs'
        }
    };
    
    constructor(seekerToken, outcomes, changes, options = {}) {
        super(options);
        this.seekerToken = seekerToken;
        this.outcomes = outcomes;
        this.changes = changes;
        
        // Track bulk action states to prevent abuse
        this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'
    }
    
    /**
     * Prepare context data for the template
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Prepare visibility states for icons
        const visibilityStates = {
            'observed': { icon: 'fas fa-eye', color: '#28a745', label: 'Observed' },
            'hidden': { icon: 'fas fa-eye-slash', color: '#ffc107', label: 'Hidden' },
            'undetected': { icon: 'fas fa-ghost', color: '#dc3545', label: 'Undetected' },
            'concealed': { icon: 'fas fa-cloud', color: '#6c757d', label: 'Concealed' }
        };
        
        // Prepare outcomes for template
        const processedOutcomes = this.outcomes.map(outcome => {
            const outcomeClass = this.getOutcomeClass(outcome.outcome);
            const outcomeLabel = outcome.outcome.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return {
                ...outcome,
                outcomeClass,
                outcomeLabel,
                oldVisibilityState: visibilityStates[outcome.oldVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                marginText: outcome.margin >= 0 ? `+${outcome.margin}` : `${outcome.margin}`,
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src
            };
        });
        
        context.seeker = {
            name: this.seekerToken.name,
            image: this.seekerToken.texture?.src || this.seekerToken.document?.texture?.src
        };
        context.outcomes = processedOutcomes;
        context.changesCount = this.changes.length;
        context.totalCount = this.outcomes.length;
        
        return context;
    }
    
    /**
     * Get CSS class for outcome type
     */
    getOutcomeClass(outcome) {
        switch(outcome) {
            case 'critical-success': return 'critical-success';
            case 'success': return 'success';
            case 'failure': return 'failure';
            case 'critical-failure': return 'critical-failure';
            default: return '';
        }
    }
    
    /**
     * Render the HTML for the application
     */
    async _renderHTML(context, options) {
        const html = await renderTemplate(this.constructor.PARTS.content.template, context);
        return html;
    }
    
    /**
     * Replace the HTML content of the application
     */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
        return content;
    }
    
    /**
     * Apply all visibility changes
     */
    static async _onApplyAll(event, button) {
        console.log(`${MODULE_TITLE}: Apply All button clicked`);
        
        const app = currentSeekDialog;
        console.log(`${MODULE_TITLE}: Using stored dialog reference:`, app);
        
        if (!app) {
            console.warn(`${MODULE_TITLE}: No dialog reference found`);
            return;
        }
        
        console.log(`${MODULE_TITLE}: App outcomes:`, app.outcomes);
        const changedOutcomes = app.outcomes.filter(outcome => outcome.changed);
        console.log(`${MODULE_TITLE}: Changed outcomes:`, changedOutcomes);
        
        if (changedOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No changes to apply`);
            return;
        }
        
        // Check if Apply All is allowed based on current state
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Create proper change objects
        const changes = changedOutcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.newVisibility,
            changed: true
        }));
        
        console.log(`${MODULE_TITLE}: Changes to apply:`, changes);
        
        try {
            await app.applyVisibilityChanges(app.seekerToken, changes);
            ui.notifications.info(`${MODULE_TITLE}: Applied ${changes.length} visibility changes. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show applied state
            app.updateRowButtonsToApplied(changedOutcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'applied';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying all changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Error applying changes. Check console for details.`);
        }
    }
    
    /**
     * Revert all changes to original state
     */
    static async _onRevertAll(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        // Check if Revert All is allowed based on current state
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }
        
        const revertChanges = app.outcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.oldVisibility,
            changed: true
        }));
        
        try {
            await app.applyVisibilityChanges(app.seekerToken, revertChanges);
            ui.notifications.info(`${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show reverted state
            app.updateRowButtonsToReverted(app.outcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'reverted';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error reverting changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Error reverting changes. Check console for details.`);
        }
    }
    
    /**
     * Apply individual visibility change
     */
    static async _onApplyChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome || !outcome.changed) {
            ui.notifications.warn(`${MODULE_TITLE}: No change to apply for this token`);
            return;
        }
        
        // Create proper change object
        const change = {
            target: outcome.target,
            newVisibility: outcome.newVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.seekerToken, [change]);
            ui.notifications.info(`${MODULE_TITLE}: Applied visibility change for ${outcome.target.name}`);
            
            // Update button states to show applied and enable revert
            const tokenId = outcome.target.id;
            const applyButton = app.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
            const revertButton = app.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
            
            if (applyButton) {
                applyButton.disabled = true;
                applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
                applyButton.classList.add('applied');
                applyButton.title = 'Applied';
            }
            
            if (revertButton) {
                revertButton.disabled = false;
                revertButton.innerHTML = '<i class="fas fa-undo"></i>';
                revertButton.classList.remove('reverted');
                revertButton.title = 'Revert to original visibility';
            }
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying change:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Error applying change. Check console for details.`);
        }
    }
    
    /**
     * Revert individual token to original state
     */
    static async _onRevertChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) {
            ui.notifications.warn(`${MODULE_TITLE}: Token not found`);
            return;
        }
        
        const revertChange = {
            target: outcome.target,
            newVisibility: outcome.oldVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.seekerToken, [revertChange]);
            ui.notifications.info(`${MODULE_TITLE}: Reverted ${outcome.target.name} to original visibility`);
            
            // Update button states to show reverted and enable apply
            const tokenId = outcome.target.id;
            const applyButton = app.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
            const revertButton = app.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
            
            if (revertButton) {
                revertButton.disabled = true;
                revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
                revertButton.classList.add('reverted');
                revertButton.title = 'Reverted';
            }
            
            if (applyButton) {
                applyButton.disabled = false;
                applyButton.innerHTML = '<i class="fas fa-check"></i>';
                applyButton.classList.remove('applied');
                applyButton.title = 'Apply visibility change';
            }
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error reverting change:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Error reverting change. Check console for details.`);
        }
    }
    
    /**
     * Override close to clear global reference
     */
    close(options) {
        currentSeekDialog = null;
        return super.close(options);
    }
    
    /**
     * Apply visibility changes using the existing utility function
     */
    async applyVisibilityChanges(seeker, changes) {
        console.log(`${MODULE_TITLE}: applyVisibilityChanges called with:`, { seeker, changes });
        
        const promises = changes.map(async (change) => {
            try {
                console.log(`${MODULE_TITLE}: Applying change:`, change);
                
                // Update the visibility relationship in the visibility map
                // Note: We don't use setVisibilityBetween here because it would apply effects to the seeker
                // Instead, we handle visibility map and effects separately for proper seek automation
                const { setVisibilityMap, getVisibilityMap } = await import('./utils.js');
                const visibilityMap = getVisibilityMap(seeker);
                visibilityMap[change.target.document.id] = change.newVisibility;
                await setVisibilityMap(seeker, visibilityMap);
                
                // Apply ephemeral effects to the target token (like in visibility manager's Observer Mode)
                // Target token gets the ephemeral effect that applies when targeting the seeker
                // NOTE: We only manage ephemeral effects, not PF2E conditions - those should remain as originally set
                console.log(`${MODULE_TITLE}: Applying ephemeral effects to ${change.target.name}`);
                await updateEphemeralEffectsForVisibility(change.target, seeker, change.newVisibility);
                
                console.log(`${MODULE_TITLE}: Successfully applied change for ${change.target.name}`);
            } catch (error) {
                console.error(`${MODULE_TITLE}: Failed to apply visibility change for ${change.target.name}:`, error);
            }
        });
        
        await Promise.all(promises);
        
        // Refresh token visuals to ensure all changes are displayed
        try {
            console.log(`${MODULE_TITLE}: Refreshing token visuals...`);
            await updateTokenVisuals();
            console.log(`${MODULE_TITLE}: Token visuals refreshed successfully`);
        } catch (error) {
            console.warn(`${MODULE_TITLE}: Could not refresh token visuals:`, error);
        }
    }
    
    /**
     * Update individual row buttons to show applied state
     */
    updateRowButtonsToApplied(outcomes) {
        outcomes.forEach(outcome => {
            if (outcome.changed) {
                const tokenId = outcome.target.id;
                const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
                const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
                
                if (applyButton) {
                    applyButton.disabled = true;
                    applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
                    applyButton.classList.add('applied');
                    applyButton.title = 'Applied';
                }
                
                if (revertButton) {
                    revertButton.disabled = false;
                    revertButton.innerHTML = '<i class="fas fa-undo"></i>';
                    revertButton.classList.remove('reverted');
                    revertButton.title = 'Revert to original visibility';
                }
            }
        });
    }
    
    /**
     * Update individual row buttons to show reverted state
     */
    updateRowButtonsToReverted(outcomes) {
        outcomes.forEach(outcome => {
            if (outcome.changed) {
                const tokenId = outcome.target.id;
                const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
                const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
                
                if (revertButton) {
                    revertButton.disabled = true;
                    revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
                    revertButton.classList.add('reverted');
                    revertButton.title = 'Reverted';
                }
                
                if (applyButton) {
                    applyButton.disabled = false;
                    applyButton.innerHTML = '<i class="fas fa-check"></i>';
                    applyButton.classList.remove('applied');
                    applyButton.title = 'Apply visibility change';
                }
            }
        });
    }
    
    /**
     * Update bulk action button states based on current bulk action state
     */
    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('.seek-preview-dialog-bulk-action-btn[data-action="applyAll"]');
        const revertAllButton = this.element.querySelector('.seek-preview-dialog-bulk-action-btn[data-action="revertAll"]');
        
        if (applyAllButton && revertAllButton) {
            switch (this.bulkActionState) {
                case 'initial':
                    // Both buttons available initially
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = false;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                    
                case 'applied':
                    // Only Revert All available after Apply All
                    applyAllButton.disabled = true;
                    revertAllButton.disabled = false;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                    
                case 'reverted':
                    // Only Apply All available after Revert All
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Reverted';
                    break;
            }
        }
    }
    
    /**
     * Handle close action
     */
    static _onClose(event, button) {
        const app = currentSeekDialog;
        if (app) {
            app.close();
            currentSeekDialog = null; // Clear reference when closing
        }
    }
}

/**
 * Execute Seek resolution with full automation
 * @param {ChatMessage} message - The chat message
 * @param {Object} seekData - The Seek action data
 * @param {jQuery} panel - The automation panel
 */
async function executeSeekResolution(message, seekData, panel) {
    const targets = discoverSeekTargets(seekData.actor);
    
    if (targets.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.NO_UNDETECTED_TOKENS', { name: seekData.actor.name })}`);
        return;
    }
    
    // Process all outcomes
    const outcomes = targets.map(target => analyzeSeekOutcome(seekData, target));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    if (changes.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.NO_CHANGES', { name: seekData.actor.name })}`);
        return;
    }
    
    // Apply all visibility changes atomically
    await applyVisibilityChanges(seekData.actor, changes);
    
    // Update panel to show completion
    markPanelComplete(panel, changes);
    
    // Show success notification
    const changeText = changes.map(c => `${c.target.name}: ${c.oldVisibility} → ${c.newVisibility}`).join(', ');
    ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.RESULTS_APPLIED', { changes: changeText })}`);
}

/**
 * Apply visibility changes atomically with error handling
 * @param {Token} seeker - The seeking token
 * @param {Array} changes - Array of change objects
 */
async function applyVisibilityChanges(seeker, changes) {
    const promises = changes.map(async (change) => {
        try {
            await setVisibilityBetween(seeker, change.target, change.newVisibility);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Failed to apply visibility change for ${change.target.name}:`, error);
        }
    });
    
    await Promise.all(promises);
    
    // Update token visuals after changes
    try {
        await updateTokenVisuals();
    } catch (error) {
        console.warn(`${MODULE_TITLE}: Could not update token visuals:`, error);
        // Continue without failing - visibility changes were still applied
    }
}

/**
 * Mark automation panel as complete
 * @param {jQuery} panel - The automation panel
 * @param {Array} changes - Applied changes
 */
function markPanelComplete(panel, changes) {
    panel.addClass('completed');
    panel.find('.automation-actions').html(`
        <div class="completion-status">
            <i class="fas fa-check-circle"></i>
            <span>Applied ${changes.length} visibility changes</span>
        </div>
    `);
}

/**
 * Modern CSS styles for the automation system
 */
export function addSeekButtonStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .pf2e-visioner-automation-panel {
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border: 2px solid #007bff;
            border-radius: 8px;
            margin: 12px 0 8px 0;
            padding: 12px;
            box-shadow: 0 4px 8px rgba(0,123,255,0.15);
            position: relative;
            z-index: 10;
        }
        
        .automation-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
        }
        
        .automation-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        
        .visioner-btn {
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 36px;
            text-decoration: none;
            user-select: none;
        }
        
        .visioner-btn-primary {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
        }
        
        .visioner-btn-preview {
            background: linear-gradient(135deg, #6c757d, #495057);
            color: white;
        }
        
        .visioner-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .visioner-btn.processing {
            opacity: 0.7;
            cursor: wait;
        }
        
        .pf2e-visioner-automation-panel.completed {
            background: linear-gradient(135deg, #d4edda, #c3e6cb);
            border-color: #28a745;
        }
        
        .completion-status {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #155724;
            font-weight: 600;
        }
        
        .seek-preview table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
        }
        
        .seek-preview th,
        .seek-preview td {
            padding: 6px 8px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }
        
        .seek-preview th {
            background: #f8f9fa;
            font-weight: 600;
        }
        
        .outcome-success {
            background: rgba(40, 167, 69, 0.1);
        }
        
        .outcome-neutral {
            background: rgba(108, 117, 125, 0.1);
        }
        
        /* Seek Preview Dialog Styles - Dark Theme */
        .seek-preview-dialog {
            min-width: 600px;
        }
        
        .seek-preview-dialog .window-header {
            background: linear-gradient(135deg, #2c5aa0 0%, #1e3a5f 100%);
            color: white;
        }
        
        .seek-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seeker-info {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            padding: 12px;
            background: var(--color-bg-option, rgba(44, 90, 160, 0.15));
            border-radius: 6px;
            border-left: 4px solid #2c5aa0;
        }
        
        .seeker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #2c5aa0;
            margin-right: 12px;
        }
        
        .seeker-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .hint {
            margin: 0;
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 12px;
        }
        
        .results-table-container {
            margin-bottom: 16px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            overflow: hidden;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        .seek-results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table th {
            padding: 8px 6px;
            text-align: left;
            font-weight: bold;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table td {
            padding: 6px;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        .seek-results-table .token-image {
            width: 40px;
            text-align: center;
        }
        
        .seek-results-table .token-image img {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid var(--color-border-light-primary, #555);
        }
        
        .seek-results-table .token-name {
            min-width: 120px;
        }
        
        .seek-results-table .roll-result {
            text-align: center;
            min-width: 80px;
        }
        
        .seek-results-table .roll-total {
            font-weight: bold;
            color: #4fc3f7;
        }
        
        .seek-results-table .dc-value {
            font-weight: bold;
            color: #f48fb1;
        }
        
        .seek-results-table .margin {
            color: var(--color-text-secondary, #b0b0b0);
        }
        
        .seek-results-table .outcome {
            text-align: center;
            font-weight: bold;
            text-transform: capitalize;
            min-width: 100px;
        }
        
        .seek-results-table .outcome.critical-success {
            color: #4caf50;
        }
        
        .seek-results-table .outcome.success {
            color: #29b6f6;
        }
        
        .seek-results-table .outcome.failure {
            color: #ffb74d;
        }
        
        .seek-results-table .outcome.critical-failure {
            color: #e57373;
        }
        
        .seek-results-table .visibility-change {
            text-align: center;
            min-width: 120px;
        }
        
        .seek-results-table .visibility-change i {
            margin: 0 2px;
        }
        
        .results-summary {
            padding: 12px;
            background: var(--color-bg-option, rgba(76, 175, 80, 0.15));
            border-radius: 6px;
            border-left: 4px solid #4caf50;
            text-align: center;
        }
        
        .summary-stats {
            font-size: 14px;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .changes-count {
            font-weight: bold;
            color: #4caf50;
            font-size: 16px;
        }
        
        .total-count {
            font-weight: bold;
            color: #4fc3f7;
        }
        
        /* Bulk Actions Header */
        .seek-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-radius: 6px;
            border-left: 4px solid #4fc3f7;
            margin-bottom: 16px;
        }
        
        .seek-preview-dialog-bulk-actions-info {
            font-size: 14px;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .seek-preview-dialog-bulk-action-btn {
            padding: 6px 12px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .seek-preview-dialog-bulk-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #ff6400);
            transform: translateY(-1px);
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all {
            border-color: #4caf50;
            color: #4caf50;
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all:hover {
            background: rgba(76, 175, 80, 0.2);
            border-color: #4caf50;
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all {
            border-color: #ff9800;
            color: #ff9800;
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all:hover {
            background: rgba(255, 152, 0, 0.2);
            border-color: #ff9800;
        }
        
        /* Table Actions Column */
        .seek-results-table .actions {
            width: 100px;
            text-align: center;
        }
        
        .row-action-btn {
            padding: 3px 6px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 3px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 10px;
            margin: 0 2px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 20px;
        }
        
        .row-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .row-action-btn.apply-change {
            border-color: #4caf50;
            color: #4caf50;
        }
        
        .row-action-btn.apply-change:hover {
            background: rgba(76, 175, 80, 0.2);
            border-color: #4caf50;
        }
        
        .row-action-btn.revert-change {
            border-color: #ff9800;
            color: #ff9800;
        }
        
        .row-action-btn.revert-change:hover {
            background: rgba(255, 152, 0, 0.2);
            border-color: #ff9800;
        }
        
        .row-action-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .row-action-btn.applied {
            background: rgba(76, 175, 80, 0.3);
            border-color: #4caf50;
        }
        
        .row-action-btn.reverted {
            background: rgba(255, 152, 0, 0.3);
            border-color: #ff9800;
        }
        
        .no-action {
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 11px;
        }
    `;
    document.head.appendChild(style);
}
