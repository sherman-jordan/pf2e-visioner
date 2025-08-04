/**
 * Advanced chat message automation for PF2E Visioner
 * Provides intelligent visibility resolution for Seek actions
 */

import { MODULE_TITLE, MODULE_ID } from './constants.js';
import { getVisibilityBetween, setVisibilityMap, getVisibilityMap } from './utils.js';
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
    
    // Use modern message detection approach - check for both Seek and Point Out
    const actionData = extractActionData(message);
    if (!actionData) return;
    
    // Prevent duplicate processing using cache
    if (processedMessages.has(message.id)) return;
    
    // Create and inject the automation interface
    injectAutomationUI(message, html, actionData);
}

/**
 * Modern approach to extract action data from chat messages
 * Supports both Seek and Point Out actions
 * @param {ChatMessage} message - The chat message to analyze
 * @returns {Object|null} Action data or null if not a supported action
 */
function extractActionData(message) {
    // Basic message validation
    if (!message) return null;
    
    // Check for PF2e origin flags (Point Out uses origin instead of context)
    const context = message.flags?.pf2e?.context;
    const origin = message.flags?.pf2e?.origin;
    
    // Point Out detection - check origin flags and content
    const isPointOutAction = origin?.rollOptions?.includes('origin:item:point-out') ||
                            origin?.rollOptions?.includes('origin:item:slug:point-out') ||
                            message.content?.includes('Point Out') ||
                            message.flavor?.toLowerCase().includes('point out');
    
    // Seek detection - check context for skill checks
    const isSeekAction = (context?.type === 'skill-check' && (
                        context.options?.includes('action:seek') || 
                        context.slug === 'seek'
                    )) || message.flavor?.toLowerCase().includes('seek');
    
    // Early return if neither action is detected
    if (!isSeekAction && !isPointOutAction) return null;
    
    // For Seek, we need rolls and token (check both token.object and speaker.token)
    if (isSeekAction && (!message.rolls?.length || (!message?.token?.object && !message?.speaker?.token))) return null;
    
    // For Point Out, we need token but not necessarily rolls
    if (isPointOutAction && !message?.token?.object && !message?.speaker?.token) return null;
    
    // For Point Out, we also need a specific target
    if (isPointOutAction) {
        const hasTarget = message.flags?.pf2e?.target?.actor || 
                         message.flags?.pf2e?.target?.token ||
                         message.content?.includes('target') ||
                         (game.user.targets && game.user.targets.size > 0);
        
        if (!hasTarget) {
            return null;
        }
    }
    
    // Set action type based on detection
    let actionType = null;
    if (isSeekAction) {
        actionType = 'seek';
    } else if (isPointOutAction) {
        actionType = 'point-out';
    } else {
        return null;
    }
    
    // Get the token - try multiple approaches
    let actorToken = null;
    if (message.token?.object) {
        actorToken = message.token.object;
    } else if (message.speaker?.token) {
        actorToken = canvas.tokens.get(message.speaker.token);
    }
    
    if (!actorToken) {
        console.warn(`${MODULE_TITLE}: Could not find actor token for ${actionType} action`);
        return null;
    }
    
    return {
        actionType,
        actor: actorToken,
        roll: message.rolls[0],
        context,
        messageId: message.id
    };
}

/**
 * Advanced UI injection system for action automation
 * Creates modern, accessible interface elements for Seek and Point Out
 * @param {ChatMessage} message - The chat message
 * @param {jQuery} html - The HTML container
 * @param {Object} actionData - Extracted action data
 */
function injectAutomationUI(message, html, actionData) {
    // Create modern automation panel
    const automationPanel = buildAutomationPanel(actionData);
    
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
    bindAutomationEvents(panel, message, actionData);
    
    // Mark as processed
    processedMessages.add(message.id);
}

/**
 * Modern automation panel builder with enhanced UX
 * Creates accessible, feature-rich interface for Seek and Point Out
 * @param {Object} actionData - The action data
 * @returns {string} Complete automation panel HTML
 */
function buildAutomationPanel(actionData) {
    const isSeek = actionData.actionType === 'seek';
    const isPointOut = actionData.actionType === 'point-out';
    
    let label, tooltip, title, icon, actionName;
    
    if (isSeek) {
        label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
        tooltip = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP');
        title = 'Seek Results Available';
        icon = 'fas fa-search';
        actionName = 'open-seek-results';
    } else if (isPointOut) {
        label = 'Open Point Out Results';
        tooltip = 'Preview and apply Point Out visibility changes';
        title = 'Point Out Results Available';
        icon = 'fas fa-hand-point-right';
        actionName = 'open-point-out-results';
    }
    
    return `
        <div class="pf2e-visioner-automation-panel" data-message-id="${actionData.messageId}" data-action-type="${actionData.actionType}">
            <div class="automation-header">
                <i class="fas fa-search-location"></i>
                <span class="automation-title">${title}</span>
            </div>
            <div class="automation-actions">
                <button type="button" 
                        class="visioner-btn visioner-btn-primary" 
                        data-action="${actionName}"
                        title="${tooltip}">
                    <i class="${icon}"></i> ${label}
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
 * @param {Object} actionData - The action data
 */
function bindAutomationEvents(panel, message, actionData) {
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
                    await previewActionResults(actionData);
                    break;
                case 'open-point-out-results':
                    await previewActionResults(actionData);
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
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
function hasActiveEncounter() {
    return !!(game.combat && game.combat.combatants.size > 0);
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
function isTokenInEncounter(token) {
    if (!hasActiveEncounter()) return false;
    
    return game.combat.combatants.some(combatant => 
        combatant.token?.id === token.document.id
    );
}

/**
 * Discover valid Seek targets (undetected tokens)
 * @param {Token} seekerToken - The token performing the Seek
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of target objects with token, DC, and visibility data
 */
function discoverSeekTargets(seekerToken, encounterOnly = false) {
    if (!seekerToken) return [];
    
    const targets = [];
    
    // Find all tokens that are hidden or undetected to the seeker
    for (const token of canvas.tokens.placeables) {
        if (token === seekerToken) continue;
        if (!token.actor) continue;
        
        // Check encounter filtering if requested
        if (encounterOnly && !isTokenInEncounter(token)) continue;
        
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
    
    // Validate roll object
    if (!roll || typeof roll.total !== 'number') {
        console.warn('Invalid roll data in analyzeSeekOutcome:', roll);
        return {
            token: target.token,
            currentVisibility: target.currentVisibility,
            newVisibility: target.currentVisibility,
            changed: false,
            outcome: 'failure',
            rollTotal: 0,
            dc: dc,
            margin: -dc
        };
    }
    
    // Use modern degree calculation approach - handle missing dice data
    const dieResult = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total ?? 10;
    const outcome = determineOutcome(roll.total, dieResult, dc);
    
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
 * Get the actual target from Point Out action data
 * @param {Object} actionData - The Point Out action data
 * @returns {Token|null} The targeted token, or null if none found
 */
function getPointOutTarget(actionData) {
    // Try to get target from various sources
    let targetToken = null;
    
    // Method 1: Check if there are current user targets
    if (game.user.targets && game.user.targets.size > 0) {
        targetToken = Array.from(game.user.targets)[0];
        return targetToken;
    }
    
    // Method 2: Check message flags for target data
    if (actionData.context?.target?.actor) {
        const targetActorId = actionData.context.target.actor;
        targetToken = canvas.tokens.placeables.find(t => t.actor?.id === targetActorId);
        if (targetToken) {
            return targetToken;
        }
    }
    
    // Method 3: Check for target in message content (fallback)
    // This is less reliable but might catch some cases
    return null;
}

/**
 * Find the best target for Point Out action (legacy function)
 * Looks for the closest enemy that the pointer can see but allies can't
 * @param {Token} pointerToken - The token performing the Point Out
 * @returns {Token|null} The best target to point out, or null if none found
 */
function findBestPointOutTarget(pointerToken) {
    if (!pointerToken) return null;
    
    const candidates = [];
    
    // Find all tokens that the pointer can see but at least one ally can't see
    for (const token of canvas.tokens.placeables) {
        if (token === pointerToken) continue;
        if (!token.actor) continue;
        
        // Check if pointer can see this target (requirement for Point Out)
        const pointerVisibility = getVisibilityBetween(pointerToken, token);
        if (pointerVisibility === 'undetected') continue; // Pointer must be able to see target
        
        // Check if at least one ally can't see this target
        let hasBlindAlly = false;
        for (const ally of canvas.tokens.placeables) {
            if (ally === pointerToken || ally === token) continue;
            if (!ally.actor) continue;
            
            // Check if this ally can't see the target
            const allyVisibility = getVisibilityBetween(ally, token);
            if (allyVisibility === 'undetected') {
                hasBlindAlly = true;
                break;
            }
        }
        
        if (hasBlindAlly) {
            candidates.push({
                token,
                distance: calculateTokenDistance(pointerToken, token)
            });
        }
    }
    
    // Return the closest candidate
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].token;
}

/**
 * Find allies who can't see the specified target and will benefit from Point Out
 * @param {Token} pointerToken - The token performing the Point Out
 * @param {Token} targetToken - The specific token being pointed out
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of ally data who can't see the target
 */
function discoverPointOutAllies(pointerToken, targetToken, encounterOnly = false) {
    if (!pointerToken || !targetToken) return [];
    
    const allies = [];
    
    // Find allies who can't see this target
    for (const ally of canvas.tokens.placeables) {
        if (ally === pointerToken || ally === targetToken) continue;
        if (!ally.actor) continue;
        
        // Check encounter filtering
        if (encounterOnly && !isTokenInEncounter(ally)) continue;
        
        // Check if this ally can't see the target
        const allyVisibility = getVisibilityBetween(ally, targetToken);
        if (allyVisibility === 'undetected') {
            const stealthDC = extractStealthDC(targetToken);
            if (stealthDC > 0) {
                allies.push({
                    token: ally, // The ally who can't see
                    targetToken: targetToken, // The token being pointed out
                    stealthDC,
                    currentVisibility: allyVisibility,
                    distance: calculateTokenDistance(pointerToken, ally)
                });
            }
        }
    }
    
    // Sort by distance (closest first)
    return allies.sort((a, b) => a.distance - b.distance);
}

/**
 * Legacy function for backward compatibility - now redirects to new logic
 * @param {Token} pointerToken - The token performing the Point Out
 * @param {Token} targetToken - The specific token being pointed out (optional, for targeted Point Out)
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of ally tokens who can't see the target
 */
function discoverPointOutTargets(pointerToken, targetToken = null, encounterOnly = false) {
    // Legacy function - redirect to new logic
    if (targetToken) {
        return discoverPointOutAllies(pointerToken, targetToken, encounterOnly);
    } else {
        // Find best target and return allies for that target
        const bestTarget = findBestPointOutTarget(pointerToken);
        if (!bestTarget) return [];
        return discoverPointOutAllies(pointerToken, bestTarget, encounterOnly);
    }
}

/**
 * Analyze Point Out outcome following official PF2e rules
 * Point Out makes undetected creatures hidden to specific allies
 * @param {Object} actionData - The Point Out action data
 * @param {Object} allyData - Data about the ally who can't see the target
 * @returns {Object} Detailed outcome analysis
 */
function analyzePointOutOutcome(actionData, allyData) {
    
    // Point Out doesn't use a roll - it automatically makes undetected creatures hidden to allies
    // The ally's visibility of the target changes from undetected to hidden
    
    if (!allyData.token) {
        console.error(`${MODULE_TITLE}: No token in allyData:`, allyData);
        return null;
    }
    
    if (!allyData.targetToken) {
        console.error(`${MODULE_TITLE}: No targetToken in allyData:`, allyData);
        return null;
    }
    
    let newVisibility = allyData.currentVisibility; // Default: no change
    
    if (allyData.currentVisibility === 'undetected') {
        // Point Out makes undetected creatures hidden to this ally
        newVisibility = 'hidden';
    }
    
    const result = {
        target: allyData.token, // The ally whose visibility is changing
        targetToken: allyData.targetToken, // The token being pointed out
        oldVisibility: allyData.currentVisibility,
        newVisibility,
        outcome: 'point-out', // Special outcome type for Point Out
        rollTotal: 0, // Point Out doesn't use a roll
        dc: allyData.stealthDC,
        margin: 0, // No roll means no margin
        changed: newVisibility !== allyData.currentVisibility,
        isPointOut: true // Flag to identify Point Out results
    };
    
    return result;
}

/**
 * Unified preview function for both Seek and Point Out results
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The action data
 */
async function previewActionResults(actionData) {
    if (actionData.actionType === 'seek') {
        return await previewSeekResults(actionData);
    } else if (actionData.actionType === 'point-out') {
        return await previewPointOutResults(actionData);
    }
}

/**
 * Preview Point Out results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Point Out action data
 */
async function previewPointOutResults(actionData) {
    // Validate actionData
    if (!actionData || !actionData.actor) {
        console.error('Invalid actionData provided to previewPointOutResults:', actionData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid Point Out data - cannot preview results`);
        return;
    }
    
    // Get the actual targeted token from the Point Out action
    const pointOutTarget = getPointOutTarget(actionData);
    
    if (!pointOutTarget) {
        ui.notifications.info(`${MODULE_TITLE}: No target found for Point Out action`);
        return;
    }
    
    // Find allies who can't see this target and will benefit from Point Out
    const allies = discoverPointOutAllies(actionData.actor, pointOutTarget);
    
    if (allies.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: No allies found who can't see ${pointOutTarget.name}`);
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = allies.map(allyData => analyzePointOutOutcome(actionData, allyData));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new PointOutPreviewDialog(actionData.actor, outcomes, changes, actionData);
    currentSeekDialog = previewDialog; // Store reference for action handlers
    previewDialog.render(true);
}

/**
 * Preview Seek results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Seek action data
 */
async function previewSeekResults(actionData) {
    // Validate actionData
    if (!actionData || !actionData.actor || !actionData.roll) {
        console.error('Invalid actionData provided to previewSeekResults:', actionData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid seek data - cannot preview results`);
        return;
    }
    
    const targets = discoverSeekTargets(actionData.actor);
    
    if (targets.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.NO_UNDETECTED_TOKENS', { name: actionData.actor.name })}`);
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = targets.map(target => analyzeSeekOutcome(actionData, target));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new SeekPreviewDialog(actionData.actor, outcomes, changes, actionData);
    currentSeekDialog = previewDialog; // Store reference for action handlers
    previewDialog.render(true);
}

/**
 * Seek Preview Dialog for Seek action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */
class SeekPreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['seek-preview-dialog'], // Keep same class for CSS compatibility
        window: {
            title: 'Action Results Preview', // Will be updated dynamically
            icon: 'fas fa-search', // Will be updated dynamically
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
            revertChange: SeekPreviewDialog._onRevertChange,
            toggleEncounterFilter: SeekPreviewDialog._onToggleEncounterFilter,
            overrideState: SeekPreviewDialog._onOverrideState
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/seek-preview.hbs'
        }
    };
    
    constructor(actorToken, outcomes, changes, actionData, options = {}) {
        // Update window title and icon based on action type
        if (actionData.actionType === 'seek') {
            options.window = {
                ...options.window,
                title: 'PF2E_VISIONER.SEEK_AUTOMATION.PREVIEW_TITLE',
                icon: 'fas fa-search'
            };
        } else if (actionData.actionType === 'point-out') {
            options.window = {
                ...options.window,
                title: 'Point Out Results Preview',
                icon: 'fas fa-hand-point-right'
            };
        }
        
        super(options);
        this.actorToken = actorToken; // Renamed for clarity
        this.outcomes = outcomes;
        this.changes = changes;
        this.actionData = actionData; // Store complete action data
        
        // Track bulk action states to prevent abuse
        this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'
        
        // Track encounter filtering state
        this.encounterOnly = false;
    }
    
    /**
     * Add hover functionality after rendering
     */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        this._addHoverListeners();
    }
    
    _onRender(context, options) {
        super._onRender?.(context, options);
        this._addHoverListeners();
    }
    
    _addHoverListeners() {
        // Add hover listeners to token images and rows
        const tokenRows = this.element.querySelectorAll('.token-row, tr[data-token-id]');
        
        tokenRows.forEach(row => {
            const tokenId = row.dataset.tokenId;
            if (!tokenId) return;
            
            // Remove existing listeners to prevent duplicates
            row.removeEventListener('mouseenter', row._hoverIn);
            row.removeEventListener('mouseleave', row._hoverOut);
            
            // Add new listeners
            row._hoverIn = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverIn(new Event('mouseenter'), { hoverOutOthers: true });
                }
            };
            
            row._hoverOut = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverOut(new Event('mouseleave'));
                }
            };
            
            row.addEventListener('mouseenter', row._hoverIn);
            row.addEventListener('mouseleave', row._hoverOut);
        });
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
            // Get current visibility state from the token
            const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
            
            // Prepare available states for override
            let availableStates;
            if (this.actionData.actionType === 'seek') {
                // Seek can result in hidden or observed
                availableStates = [
                    {
                        value: 'hidden',
                        ...visibilityStates.hidden,
                        selected: (outcome.overrideState || outcome.newVisibility) === 'hidden',
                        calculatedOutcome: outcome.newVisibility === 'hidden'
                    },
                    {
                        value: 'observed',
                        ...visibilityStates.observed,
                        selected: (outcome.overrideState || outcome.newVisibility) === 'observed',
                        calculatedOutcome: outcome.newVisibility === 'observed'
                    }
                ];
            } else if (this.actionData.actionType === 'point-out') {
                // Point Out only makes undetected become hidden
                availableStates = [
                    {
                        value: 'hidden',
                        ...visibilityStates.hidden,
                        selected: (outcome.overrideState || outcome.newVisibility) === 'hidden',
                        calculatedOutcome: outcome.newVisibility === 'hidden'
                    }
                ];
            }
            
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            // Check if there's an actionable change - either the outcome naturally changed OR user overrode the state
            const hasActionableChange = outcome.changed || (outcome.overrideState && outcome.overrideState !== outcome.oldVisibility);
            
            return {
                ...outcome,
                outcomeClass: this.getOutcomeClass(outcome.outcome),
                outcomeLabel: outcome.outcome === 'point-out' ? 'Pointed Out' : outcome.outcome.charAt(0).toUpperCase() + outcome.outcome.slice(1).replace('-', ' '),
                oldVisibilityState: visibilityStates[outcome.oldVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                marginText: outcome.margin >= 0 ? `+${outcome.margin}` : `${outcome.margin}`,
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src,
                availableStates: availableStates,
                overrideState: outcome.overrideState || outcome.newVisibility,
                hasActionableChange: hasActionableChange
            };
        });
        
        // Update original outcomes with hasActionableChange for Apply All button logic
        processedOutcomes.forEach((processedOutcome, index) => {
            if (this.outcomes[index]) {
                this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
            }
        });
        
        // Set actor context with appropriate label
        const actorLabel = this.actionData.actionType === 'seek' ? 'seeker' : 'pointer';
        context.seeker = {
            name: this.actorToken.name,
            image: this.actorToken.texture?.src || this.actorToken.document?.texture?.src,
            actionType: this.actionData.actionType,
            actionLabel: this.actionData.actionType === 'seek' ? 'Seek action results analysis' : 'Point Out action results analysis'
        };
        context.outcomes = processedOutcomes;
        context.changesCount = this.changes.length;
        context.totalCount = this.outcomes.length;
        
        // Add encounter filtering context - show checkbox whenever there's an active encounter
        context.showEncounterFilter = hasActiveEncounter();
        context.encounterOnly = this.encounterOnly;
        
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
            case 'point-out': return 'success'; // Point Out is always successful
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
     * Called after the application is rendered
     */
    _onRender(context, options) {
        super._onRender(context, options);
        
        // Set initial button states
        this.updateBulkActionButtons();
        
        // Add icon click handlers
        this.addIconClickHandlers();
    }
    
    /**
     * Apply all visibility changes
     */
    static async _onApplyAll(event, button) {
        
        const app = currentSeekDialog;
        
        if (!app) {
            return;
        }
        
        const actionableOutcomes = app.outcomes.filter(outcome => outcome.hasActionableChange);
        
        if (actionableOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No changes to apply`);
            return;
        }
        
        // Check if Apply All is allowed based on current state
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Create proper change objects using override state
        const changes = actionableOutcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        }));
        
        try {
            await app.applyVisibilityChanges(app.actorToken, changes);
            ui.notifications.info(`${MODULE_TITLE}: Applied ${changes.length} visibility changes. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show applied state
            app.updateRowButtonsToApplied(actionableOutcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'applied';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error applying changes.`);
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
            await app.applyVisibilityChanges(app.actorToken, revertChanges);
            ui.notifications.info(`${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show reverted state
            app.updateRowButtonsToReverted(app.outcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'reverted';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error reverting changes.`);
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
        
        if (!outcome || !outcome.hasActionableChange) {
            ui.notifications.warn(`${MODULE_TITLE}: No change to apply for this token`);
            return;
        }
        
        // Create proper change object using override state
        const change = {
            target: outcome.target,
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [change]);
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
            ui.notifications.error(`${MODULE_TITLE}: Error applying change.`);
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
            await app.applyVisibilityChanges(app.actorToken, [revertChange]);
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
            ui.notifications.error(`${MODULE_TITLE}: Error reverting change.`);
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
        
        const promises = changes.map(async (change) => {
            try {
                
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
                await updateEphemeralEffectsForVisibility(change.target, seeker, change.newVisibility);
                
            } catch (error) {
                ui.notifications.error(`${MODULE_TITLE}: Error applying changes.`);
            }
        });
        
        await Promise.all(promises);
        
        // Refresh token visuals to ensure all changes are displayed
        try {
            await updateTokenVisuals();
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error refreshing token visuals.`);
        }
    }
    
    /**
     * Update individual row buttons to show applied state
     */
    updateRowButtonsToApplied(outcomes) {
        outcomes.forEach(outcome => {
            if (outcome.hasActionableChange) {
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
            if (outcome.hasActionableChange) {
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
                    // Only Apply All available initially (nothing to revert yet)
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
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
     * Toggle encounter filtering and refresh results
     */
    static async _onToggleEncounterFilter(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        // Toggle the encounter filter state
        app.encounterOnly = !app.encounterOnly;
        
        // Re-discover targets with new filter setting
        let targets;
        if (app.actionData.actionType === 'seek') {
            targets = discoverSeekTargets(app.actorToken, app.encounterOnly);
        } else if (app.actionData.actionType === 'point-out') {
            targets = discoverPointOutTargets(app.actorToken, app.encounterOnly);
        }
        
        if (targets.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No ${app.encounterOnly ? 'encounter ' : ''}targets found for ${app.actionData.actionType} action`);
            // Reset to false if no targets found
            app.encounterOnly = false;
            return;
        }
        
        // Re-analyze outcomes with new targets
        let outcomes;
        if (app.actionData.actionType === 'seek') {
            outcomes = targets.map(target => analyzeSeekOutcome(app.actionData, target));
        } else if (app.actionData.actionType === 'point-out') {
            outcomes = targets.map(target => analyzePointOutOutcome(app.actionData, target));
        }
        const changes = outcomes.filter(outcome => outcome.changed);
        
        // Update dialog data
        app.outcomes = outcomes;
        app.changes = changes;
        
        // Reset bulk action state
        app.bulkActionState = 'initial';
        
        // Re-render the dialog
        app.render({ force: true });
    }
    
    /**
     * Add click handlers for state icon selection
     */
    addIconClickHandlers() {
        const stateIcons = this.element.querySelectorAll('.state-icon');
        stateIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const targetId = event.currentTarget.dataset.target;
                const newState = event.currentTarget.dataset.state;
                
                // Update the selection visually
                const overrideIcons = event.currentTarget.closest('.override-icons');
                const allIcons = overrideIcons.querySelectorAll('.state-icon');
                allIcons.forEach(i => i.classList.remove('selected'));
                event.currentTarget.classList.add('selected');
                
                // Update the hidden input
                const hiddenInput = overrideIcons.querySelector('input[type="hidden"]');
                if (hiddenInput) {
                    hiddenInput.value = newState;
                }
                
                // Update the outcome data
                const outcome = this.outcomes.find(o => o.target.id === targetId);
                if (outcome) {
                    outcome.overrideState = newState;
                    
                    // Get current visibility state to determine if there's an actionable change
                    const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
                    
                    // Update both changed status and actionable change status
                    outcome.changed = outcome.overrideState !== outcome.oldVisibility;
                    outcome.hasActionableChange = outcome.overrideState !== currentVisibility;
                    
                    // Update button visibility if needed
                    this.updateActionButtonsForToken(targetId, outcome.hasActionableChange);
                }
                
                // Update the changes array
                this.changes = this.outcomes.filter(outcome => outcome.changed);
            });
        });
    }
    
    /**
     * Update action buttons visibility for a specific token
     */
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) return;
        
        const actionsCell = row.querySelector('.actions');
        if (!actionsCell) return;
        
        if (hasActionableChange) {
            // Show buttons if there's an actionable change
            actionsCell.innerHTML = `
                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                    <i class="fas fa-check"></i>
                </button>
                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                    <i class="fas fa-undo"></i>
                </button>
            `;
        } else {
            // Show "No change" if there's no actionable change
            actionsCell.innerHTML = '<span class="no-action">No change</span>';
        }
    }
    
    /**
     * Handle state override action (for potential future use)
     */
    static async _onOverrideState(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const targetId = button.dataset.target;
        const newState = button.dataset.state;
        // This method is available for future enhancements if needed
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
 * Point Out Preview Dialog for Point Out action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */
class PointOutPreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['point-out-preview-dialog'],
        window: {
            title: 'Point Out Results Preview',
            icon: 'fas fa-hand-point-right',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            close: PointOutPreviewDialog._onClose,
            applyAll: PointOutPreviewDialog._onApplyAll,
            revertAll: PointOutPreviewDialog._onRevertAll,
            applyChange: PointOutPreviewDialog._onApplyChange,
            revertChange: PointOutPreviewDialog._onRevertChange,
            toggleEncounterFilter: PointOutPreviewDialog._onToggleEncounterFilter
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/point-out-preview.hbs'
        }
    };
    
    constructor(actorToken, outcomes, changes, actionData, options = {}) {
        super(options);
        this.actorToken = actorToken;
        this.outcomes = outcomes;
        this.changes = changes;
        this.actionData = actionData;
        this.bulkActionState = 'initial';
        this.encounterOnly = false;
    }
    
    /**
     * Add hover functionality after rendering
     */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        this._addHoverListeners();
    }
    
    _onRender(context, options) {
        super._onRender?.(context, options);
        this._addHoverListeners();
    }
    
    _addHoverListeners() {
        // Add hover listeners to token rows (Point Out template uses different structure)
        const tokenRows = this.element.querySelectorAll('tr[data-token-id]');
        
        tokenRows.forEach(row => {
            const tokenId = row.dataset.tokenId;
            if (!tokenId) return;
            
            // Remove existing listeners to prevent duplicates
            row.removeEventListener('mouseenter', row._hoverIn);
            row.removeEventListener('mouseleave', row._hoverOut);
            
            // Add new listeners
            row._hoverIn = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverIn(new Event('mouseenter'), { hoverOutOthers: true });
                }
            };
            
            row._hoverOut = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverOut(new Event('mouseleave'));
                }
            };
            
            row.addEventListener('mouseenter', row._hoverIn);
            row.addEventListener('mouseleave', row._hoverOut);
        });
    }
    
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        const visibilityStates = {
            'hidden': { icon: 'fas fa-eye-slash', color: '#ffc107', label: 'Hidden' },
            'undetected': { icon: 'fas fa-ghost', color: '#dc3545', label: 'Undetected' }
        };
        
        const processedOutcomes = this.outcomes.map(outcome => {
            const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
            const availableStates = {
                'hidden': {
                    ...visibilityStates.hidden,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'hidden'
                }
            };
            
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            // Check if there's an actionable change - either the outcome naturally changed OR user overrode the state
            const hasActionableChange = outcome.changed || (outcome.overrideState && outcome.overrideState !== outcome.oldVisibility);
            
            return {
                ...outcome,
                oldVisibilityState: visibilityStates[outcome.oldVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src,
                availableStates: availableStates,
                overrideState: outcome.overrideState || outcome.newVisibility,
                hasActionableChange: hasActionableChange
            };
        });
        
        // Update original outcomes with hasActionableChange for Apply All button logic
        processedOutcomes.forEach((processedOutcome, index) => {
            if (this.outcomes[index]) {
                this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
            }
        });
        
        context.actorName = this.actorToken.name;
        context.actorImage = this.actorToken.texture?.src || this.actorToken.document?.texture?.src;
        context.outcomes = processedOutcomes;
        context.changes = this.changes;
        context.showEncounterFilter = hasActiveEncounter();
        context.encounterOnly = this.encounterOnly;
        
        // Add target name and DC if all outcomes point to the same target
        if (processedOutcomes.length > 0) {
            const firstTarget = processedOutcomes[0].targetToken;
            const allSameTarget = processedOutcomes.every(outcome => outcome.targetToken?.id === firstTarget?.id);
            if (allSameTarget && firstTarget) {
                context.targetName = firstTarget.name;
                context.targetDC = processedOutcomes[0].dc;
            }
        }
        
        return context;
    }
    
    async _renderHTML(context, options) {
        return await renderTemplate(this.constructor.PARTS.content.template, context);
    }
    
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
        return content;
    }
    
    _onRender(context, options) {
        super._onRender(context, options);
        this.updateBulkActionButtons();
        this.addIconClickHandlers();
    }
    
    // Point Out specific action methods
    static async _onClose(event, button) {
        const app = currentSeekDialog;
        if (app) {
            app.close();
        }
    }
    
    static async _onApplyAll(event, button) {
        const app = currentSeekDialog;
        if (!app || app.bulkActionState === 'applied') {
            if (app.bulkActionState === 'applied') {
                ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            }
            return;
        }
        
        try {
            const changedOutcomes = app.changes.filter(change => change.hasActionableChange !== false);
            await app.applyVisibilityChanges(app.actorToken, changedOutcomes);
            
            app.bulkActionState = 'applied';
            app.updateBulkActionButtons();
            app.updateAllRowButtonsToApplied();
            
            ui.notifications.info(`${MODULE_TITLE}: Applied Point Out changes for ${changedOutcomes.length} allies. Dialog remains open for further adjustments.`);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying Point Out changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to apply Point Out changes`);
        }
    }
    
    static async _onRevertAll(event, button) {
        const app = currentSeekDialog;
        if (!app || app.bulkActionState === 'reverted') {
            if (app.bulkActionState === 'reverted') {
                ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            }
            return;
        }
        
        try {
            const changedOutcomes = app.changes.map(change => ({
                ...change,
                newVisibility: change.oldVisibility // Revert to original state
            }));
            await app.applyVisibilityChanges(app.actorToken, changedOutcomes);
            
            app.bulkActionState = 'reverted';
            app.updateBulkActionButtons();
            app.updateAllRowButtonsToReverted();
            
            ui.notifications.info(`${MODULE_TITLE}: Reverted Point Out changes for ${changedOutcomes.length} allies. Dialog remains open for further adjustments.`);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error reverting Point Out changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to revert Point Out changes`);
        }
    }
    
    static async _onApplyChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        if (!outcome) return;
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [outcome]);
            app.updateRowButtonsToApplied(tokenId);
            ui.notifications.info(`${MODULE_TITLE}: Applied Point Out change for ${outcome.target.name}`);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying Point Out change:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to apply Point Out change`);
        }
    }
    
    static async _onRevertChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        if (!outcome) return;
        
        try {
            const revertedOutcome = {
                ...outcome,
                newVisibility: outcome.oldVisibility // Revert to original state
            };
            await app.applyVisibilityChanges(app.actorToken, [revertedOutcome]);
            app.updateRowButtonsToReverted(tokenId);
            ui.notifications.info(`${MODULE_TITLE}: Reverted Point Out change for ${outcome.target.name}`);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error reverting Point Out change:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to revert Point Out change`);
        }
    }
    
    static async _onToggleEncounterFilter(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        app.encounterOnly = !app.encounterOnly;
        
        // Get the actual targeted token from the Point Out action
        const pointOutTarget = getPointOutTarget(app.actionData);
        if (!pointOutTarget) {
            ui.notifications.info(`${MODULE_TITLE}: No target found for Point Out action`);
            app.encounterOnly = false;
            return;
        }
        
        // Find allies who can't see this target
        let allies = discoverPointOutAllies(app.actorToken, pointOutTarget, app.encounterOnly);
        
        // If no encounter allies found, turn off filter and try again
        if (allies.length === 0 && app.encounterOnly) {
            ui.notifications.info(`${MODULE_TITLE}: No encounter allies found who can't see ${pointOutTarget.name} - showing all allies`);
            app.encounterOnly = false;
            allies = discoverPointOutAllies(app.actorToken, pointOutTarget, app.encounterOnly);
        }
        
        // If still no allies found, show message and return
        if (allies.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No allies found who can't see ${pointOutTarget.name}`);
            return;
        }
        
        const outcomes = allies.map(allyData => analyzePointOutOutcome(app.actionData, allyData));
        const changes = outcomes.filter(outcome => outcome.changed);
        
        app.outcomes = outcomes;
        app.changes = changes;
        app.bulkActionState = 'initial';
        app.render({ force: true });
    }
    
    close(options) {
        currentSeekDialog = null;
        return super.close(options);
    }
    
    async applyVisibilityChanges(actor, changes) {        
        const promises = changes.map(async (change) => {
            try {
                // For Point Out, the ally (change.target) gains visibility of the targetToken
                if (!change.target) {
                    console.error(`${MODULE_TITLE}: No target found in change:`, change);
                    return;
                }
                
                const allyActor = change.target?.actor;
                if (!allyActor) {
                    console.error(`${MODULE_TITLE}: No actor found for ally token ${change.target?.name || 'unknown'}`);
                    return;
                }
                
                if (!change.targetToken) {
                    console.error(`${MODULE_TITLE}: No target token found in change:`, change);
                    return;
                }
                
                
                // Use the ally token (not actor) for getVisibilityMap
                const allyToken = change.target;
                const visibilityMap = getVisibilityMap(allyToken);
                const targetId = change.targetToken.document.id;
                const oldVisibility = visibilityMap[targetId] || 'observed';
                
                
                visibilityMap[targetId] = change.newVisibility;
                await setVisibilityMap(allyToken, visibilityMap);
                
                
                // Update ephemeral effects: ally (observer) gains effects based on their visibility of the target
                await updateEphemeralEffectsForVisibility(allyToken, change.targetToken, change.newVisibility);
                
            } catch (error) {
                console.error(`${MODULE_TITLE}: Failed to apply visibility change for ${change.target.name}:`, error);
            }
        });
        
        await Promise.all(promises);
        try { 
            await updateTokenVisuals(); 
        } catch (error) { 
            console.warn(`${MODULE_TITLE}: Could not refresh token visuals:`, error); 
        }
    }
    
    updateAllRowButtonsToApplied() {
        const applyButtons = this.element.querySelectorAll('.row-action-btn.apply-change');
        const revertButtons = this.element.querySelectorAll('.row-action-btn.revert-change');
        
        applyButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('applied');
            btn.innerHTML = '<i class="fas fa-check-circle"></i>';
            btn.title = 'Applied';
        });
        
        revertButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('reverted');
            btn.innerHTML = '<i class="fas fa-undo"></i>';
            btn.title = 'Revert to original visibility';
        });
    }
    
    updateAllRowButtonsToReverted() {
        const applyButtons = this.element.querySelectorAll('.row-action-btn.apply-change');
        const revertButtons = this.element.querySelectorAll('.row-action-btn.revert-change');
        
        applyButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('applied');
            btn.innerHTML = '<i class="fas fa-check"></i>';
            btn.title = 'Apply visibility change';
        });
        
        revertButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('reverted');
            btn.innerHTML = '<i class="fas fa-undo-alt"></i>';
            btn.title = 'Reverted';
        });
    }
    
    updateRowButtonsToApplied(tokenId) {
        const applyButton = this.element.querySelector(`.row-action-btn.apply-change[data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`.row-action-btn.revert-change[data-token-id="${tokenId}"]`);
        
        if (applyButton) {
            applyButton.disabled = true;
            applyButton.classList.add('applied');
            applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
            applyButton.title = 'Applied';
        }
        
        if (revertButton) {
            revertButton.disabled = false;
            revertButton.classList.remove('reverted');
            revertButton.innerHTML = '<i class="fas fa-undo"></i>';
            revertButton.title = 'Revert to original visibility';
        }
    }
    
    updateRowButtonsToReverted(tokenId) {
        const applyButton = this.element.querySelector(`.row-action-btn.apply-change[data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`.row-action-btn.revert-change[data-token-id="${tokenId}"]`);
        
        if (applyButton) {
            applyButton.disabled = false;
            applyButton.classList.remove('applied');
            applyButton.innerHTML = '<i class="fas fa-check"></i>';
            applyButton.title = 'Apply visibility change';
        }
        
        if (revertButton) {
            revertButton.disabled = true;
            revertButton.classList.add('reverted');
            revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
            revertButton.title = 'Reverted';
        }
    }
    
    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('.point-out-preview-dialog-bulk-action-btn[data-action="applyAll"]');
        const revertAllButton = this.element.querySelector('.point-out-preview-dialog-bulk-action-btn[data-action="revertAll"]');
        
        if (applyAllButton && revertAllButton) {
            switch (this.bulkActionState) {
                case 'initial':
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                case 'applied':
                    applyAllButton.disabled = true;
                    revertAllButton.disabled = false;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                case 'reverted':
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Reverted';
                    break;
            }
        }
    }
    
    addIconClickHandlers() {
        const stateIcons = this.element.querySelectorAll('.state-icon');
        stateIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const targetId = event.currentTarget.dataset.target;
                const newState = event.currentTarget.dataset.state;
                
                const overrideIcons = event.currentTarget.closest('.override-icons');
                const allIcons = overrideIcons.querySelectorAll('.state-icon');
                allIcons.forEach(i => i.classList.remove('selected'));
                event.currentTarget.classList.add('selected');
                
                const hiddenInput = overrideIcons.querySelector('input[type="hidden"]');
                if (hiddenInput) hiddenInput.value = newState;
                
                const outcome = this.outcomes.find(o => o.target.id === targetId);
                if (outcome) {
                    outcome.overrideState = newState;
                    const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
                    outcome.changed = outcome.overrideState !== outcome.oldVisibility;
                    outcome.hasActionableChange = outcome.overrideState !== currentVisibility;
                    this.updateActionButtonsForToken(targetId, outcome.hasActionableChange);
                }
                
                this.changes = this.outcomes.filter(outcome => outcome.changed);
            });
        });
    }
    
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) return;
        
        const actionsCell = row.querySelector('.actions');
        if (!actionsCell) return;
        
        if (hasActionableChange) {
            actionsCell.innerHTML = `
                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                    <i class="fas fa-check"></i>
                </button>
                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                    <i class="fas fa-undo"></i>
                </button>
            `;
        } else {
            actionsCell.innerHTML = '<span class="no-action">No change</span>';
        }
    }
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
            margin-bottom: 4px;
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
        
        .seek-preview-dialog .encounter-filter-section {
            padding: 4px;
        }
        
        .seek-preview-dialog .encounter-filter-checkbox {
            display: flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
        }
        
        .seek-preview-dialog .encounter-filter-checkbox input[type="checkbox"] {
            margin-right: 8px;
            cursor: pointer;
        }
        
        .seek-preview-dialog .encounter-filter-label {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 14px;
            cursor: pointer;
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
        
        .point-out-preview-dialog .results-table th.token-name {
            width: 18%;
            text-align: left;
        }
        
        .point-out-preview-dialog .results-table th.target-name {
            width: 18%;
            text-align: left;
            color: #ff9800;
        }
        
        /* Point Out table column widths */
        .point-out-results-table th.token-image,
        .point-out-results-table td.token-image {
            width: 50px;
        }
        
        .point-out-results-table th.token-name,
        .point-out-results-table td.token-name {
            width: 40%;
        }
        
        .point-out-results-table th.visibility-change,
        .point-out-results-table td.visibility-change {
            width: 40%;
        }
        
        .point-out-results-table th.actions,
        .point-out-results-table td.actions {
            width: 20%;
        }
        
        /* Point Out visibility change styling */
        .point-out-results-table .visibility-change {
            text-align: center;
        }
        
        .point-out-results-table .visibility-change .state-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            margin: 0 2px;
        }
        
        .point-out-results-table .visibility-arrow {
            color: #ff9800;
            margin: 0 4px;
            font-size: 12px;
        }
        
        /* Point Out visibility state colors */
        .point-out-results-table .state-icon[data-state="undetected"] {
            color: #f44336;
            background: rgba(244, 67, 54, 0.1);
        }
        
        .point-out-results-table .state-icon[data-state="hidden"] {
            color: #ff6600;
            background: rgba(255, 102, 0, 0.1);
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
        
        .seek-results-table .point-out-indicator {
            font-weight: bold;
            color: #ff9800;
            text-transform: uppercase;
            font-size: 11px;
        }
        
        .seek-results-table .stealth-dc {
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
        
        /* Disabled bulk action buttons */
        .seek-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        .seek-preview-dialog-bulk-action-btn:disabled:hover {
            background: #cccccc !important;
            border-color: #cccccc !important;
            transform: none !important;
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
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        .row-action-btn:disabled:hover {
            background: #cccccc !important;
            border-color: #cccccc !important;
            transform: none !important;
        }
        
        .row-action-btn.applied {
            background: rgba(76, 175, 80, 0.3);
            border-color: #4caf50;
        }
        
        .row-action-btn.reverted {
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
        }
        
        .no-action {
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 11px;
        }
        
        /* Visibility Change with Override */
        .visibility-change-with-override {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
        }
        
        .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            margin-left: 2px;
        }
        
        /* Seek Dialog Icon Selection (scoped to prevent conflicts) */
        .seek-preview-dialog .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        .seek-preview-dialog .state-icon {
            background: transparent;
            border: 1px solid var(--color-border-light-primary);
            border-radius: 4px;
            padding: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
            min-width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            position: relative;
        }
        
        .seek-preview-dialog .state-icon:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.1);
            border-color: currentColor;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .seek-preview-dialog .state-icon.selected {
            opacity: 1;
            background: rgba(255, 255, 255, 0.2);
            border-color: currentColor;
            border-width: 2px;
            box-shadow: 0 0 8px rgba(255, 255, 255, 0.3),
              inset 0 0 4px rgba(255, 255, 255, 0.2);
            transform: scale(1.1);
        }
        
        .seek-preview-dialog .state-icon.selected::after {
            content: "";
            position: absolute;
            top: -2px;
            right: -2px;
            width: 6px;
            height: 6px;
            background: currentColor;
            border-radius: 50%;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
        }
        
        /* Seek Dialog State Icon Colors */
        .seek-preview-dialog .state-icon[data-state="observed"] {
            color: #4caf50;
        }
        
        .seek-preview-dialog .state-icon[data-state="concealed"] {
            color: #ffeb3b;
        }
        
        .seek-preview-dialog .state-icon[data-state="hidden"] {
            color: #ff6600;
        }
        
        .seek-preview-dialog .state-icon[data-state="undetected"] {
            color: #f44336;
        }
        
        /* Highlight calculated outcome */
        .seek-preview-dialog .state-icon.calculated-outcome {
            background: rgba(255, 255, 255, 0.15);
            border-color: currentColor;
            border-width: 2px;
            animation: pulse-subtle 2s infinite;
        }
        
        @keyframes pulse-subtle {
            0%, 100% { 
                opacity: 0.8;
            }
            50% { 
                opacity: 1;
            }
        }
        
        /* Hide the hidden input */
        .seek-preview-dialog .override-icons input[type="hidden"] {
            display: none;
        }
        
        /* Point Out Preview Dialog Styles */
        .point-out-preview-dialog {
            min-width: 350px;
            max-width: 450px;
            width: auto;
        }
        
        .point-out-preview-dialog .window-app {
            height: auto !important;
        }
        
        .point-out-preview-dialog .window-header {
            background: linear-gradient(135deg, #ff9800 0%, #e65100 100%);
            color: white;
        }
        
        .point-out-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .point-out-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        /* Compact bulk actions for Point Out */
        .point-out-preview-dialog .bulk-actions {
            padding: 8px 12px;
            background: var(--color-bg-option, rgba(255, 152, 0, 0.1));
            border-radius: 6px;
            border: 1px solid rgba(255, 152, 0, 0.3);
            margin-top: 8px;
        }
        
        .point-out-preview-dialog .bulk-actions-info {
            font-size: 13px;
            color: var(--color-text-primary, #f0f0f0);
            margin-bottom: 8px;
        }
        
        .point-out-preview-dialog .bulk-actions-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-start;
        }
        
        .actor-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 152, 0, 0.15));
            border-radius: 6px;
            border-left: 4px solid #ff9800;
        }
        
        .actor-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #ff9800;
            margin-right: 12px;
        }
        
        .actor-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .point-out-results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            table-layout: fixed;
        }
        
        .point-out-results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .point-out-results-table th {
            padding: 4px 2px;
            text-align: left;
            font-weight: bold;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            font-size: 10px;
        }
        
        .point-out-results-table td {
            padding: 3px 2px;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            font-size: 11px;
        }
        
        .point-out-results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        .point-out-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0 6px;
            min-width: 120px;
            justify-content: center;
        }
        
        .point-out-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        /* Apply All button - Green styling like Seek dialog */
        .point-out-preview-dialog-bulk-action-btn[data-action="applyAll"] {
            border-color: #4caf50;
            color: #4caf50;
        }
        
        .point-out-preview-dialog-bulk-action-btn[data-action="applyAll"]:hover:not(:disabled) {
            background: rgba(76, 175, 80, 0.2);
            border-color: #4caf50;
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }
        
        /* Revert All button - Orange styling */
        .point-out-preview-dialog-bulk-action-btn[data-action="revertAll"] {
            border-color: #ff9800;
            color: #ff9800;
        }
        
        .point-out-preview-dialog-bulk-action-btn[data-action="revertAll"]:hover:not(:disabled) {
            background: rgba(255, 152, 0, 0.2);
            border-color: #ff9800;
            box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
        }
        
        /* Point Out Dialog Bulk Actions Header */
        .point-out-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-radius: 6px;
            border-left: 4px solid #ff9800;
            margin-bottom: 16px;
        }
        
        .point-out-preview-dialog-bulk-actions-info {
            font-size: 14px;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .point-out-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .point-out-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        /* Point Out Dialog Icon Selection */
        .point-out-preview-dialog .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        .point-out-preview-dialog .state-icon {
            background: transparent;
            border: 1px solid var(--color-border-light-primary);
            border-radius: 4px;
            padding: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
            min-width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        
        .point-out-preview-dialog .state-icon:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: currentColor;
        }
        
        .point-out-preview-dialog .state-icon.selected {
            background: rgba(255, 255, 255, 0.2);
            border-color: currentColor;
            border-width: 2px;
            box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }
        
        .point-out-preview-dialog .state-icon[data-state="hidden"] {
            color: #ffc107;
        }
        
        /* Point Out Automation Panel Styles */
        .pf2e-visioner-automation-panel[data-action-type="point-out"] {
            border-color: #ff9800;
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary {
            background: linear-gradient(135deg, #ff9800, #e65100);
            border-color: #ff9800;
            color: white;
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary:hover {
            background: linear-gradient(135deg, #f57c00, #d84315);
            border-color: #f57c00;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
        }
    `;
    document.head.appendChild(style);
}
