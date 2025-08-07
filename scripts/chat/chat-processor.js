/**
 * Advanced chat message automation for PF2E Visioner
 * Provides intelligent visibility resolution for Seek actions
 */

import { MODULE_TITLE } from '../constants.js';
import { previewConsequencesResults } from './consequences-logic.js';
import { previewDiversionResults } from './create-a-diversion-logic.js';
import { previewHideResults } from './hide-logic.js';
import { previewPointOutResults } from './point-out-logic.js';
import { previewSeekResults } from './seek-logic.js';
import { previewSneakResults } from './sneak-logic.js';

// Cache for processed messages to prevent duplicate processing
const processedMessages = new Set();

/**
 * Enhanced chat message processor for Seek action automation
 * Uses modern FoundryVTT patterns and intelligent detection
 * @param {ChatMessage} message - The chat message document
 * @param {jQuery} html - The rendered HTML element
 */
export function onRenderChatMessage(message, html) {
    // Early returns for optimization
    if (!game.user.isGM) return;
    
    // Check if this is a damage roll
    const isDamageRoll = message.flags?.pf2e?.context?.type === 'damage-roll' || 
                        message.flags?.pf2e?.damageRoll || 
                        message.content?.includes('Damage Roll');
    
    // Use modern message detection approach - check for Seek, Point Out, Hide, and Sneak
    const actionData = extractActionData(message);
    if (!actionData) {
        return;
    }
        
    // Prevent duplicate processing using cache
    if (processedMessages.has(message.id)) {
        return;
    }
    
    // Create and inject the automation interface
    injectAutomationUI(message, html, actionData);
}

/**
 * Modern approach to extract action data from chat messages
 * Supports Seek, Point Out, Hide, Sneak, Create a Diversion, and damage rolls from hidden/undetected tokens
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
    
    // Create a Diversion detection - check context for skill checks with Create a Diversion action (check first to avoid conflicts)
    const isCreateADiversionAction = (context?.type === 'skill-check' && (
                        context.options?.some(option => option.startsWith('action:create-a-diversion')) || 
                        context.slug === 'create-a-diversion'
                    )) || message.flavor?.toLowerCase().includes('create a diversion');
    
    // Hide detection - check context for skill checks with Hide action (more specific to avoid false positives)
    const isHideAction = !isCreateADiversionAction && ((context?.type === 'skill-check' && (
                        context.options?.includes('action:hide') || 
                        context.slug === 'hide'
                    )) || (message.flavor?.toLowerCase().includes('hide') && !message.flavor?.toLowerCase().includes('create a diversion')));
    
    // Sneak detection - check context for skill checks with Sneak action
    // Exclude Avoid Notice which mentions Sneak but isn't a Sneak roll
    const isAvoidNoticeAction = origin?.rollOptions?.includes('origin:item:avoid-notice') ||
                               origin?.rollOptions?.includes('origin:item:slug:avoid-notice') ||
                               context?.options?.includes('action:avoid-notice') ||
                               message.content?.includes('Avoid Notice') ||
                               message.flavor?.toLowerCase().includes('avoid notice');
    
    const isSneakAction = !isCreateADiversionAction && !isAvoidNoticeAction && ((context?.type === 'skill-check' && (
                        context.options?.includes('action:sneak') || 
                        context.slug === 'sneak'
                    )) || (message.flavor?.toLowerCase().includes('sneak') && !message.flavor?.toLowerCase().includes('create a diversion')));
    
    // Damage roll from hidden/undetected token detection
    const isDamageRoll = context?.type === 'damage-roll' || 
                         message.flags?.pf2e?.damageRoll || 
                         message.content?.includes('Damage Roll');
    
    // Check if the token is hidden or undetected
    let isHiddenOrUndetectedToken = false;
    let actorToken = null;
    
    // Get the token - try multiple approaches
    if (message.token?.object) {
        actorToken = message.token.object;
    } else if (message.speaker?.token && canvas?.tokens?.get) {
        actorToken = canvas.tokens.get(message.speaker.token);
    }
    
    // Check for conditions first
    if (actorToken && actorToken.actor) {
        const conditions = actorToken.actor.conditions?.conditions || [];
        isHiddenOrUndetectedToken = conditions.some(c => 
            c.slug === 'hidden' || c.slug === 'undetected'
        );
    }
    
    // If no conditions found, check for effect flags in the message
    if (!isHiddenOrUndetectedToken && context?.options) {        
        // Look for any option that includes "effect:hidden" or "effect:undetected" or just "hidden-from"
        isHiddenOrUndetectedToken = context.options.some(option => 
            option.includes('effect:hidden-from') || 
            option.includes('effect:undetected-from') ||
            option.includes('hidden-from') ||
            option.includes('undetected-from')
        );
        
        // Also check origin rollOptions if available
        if (!isHiddenOrUndetectedToken && origin?.rollOptions) {            
            isHiddenOrUndetectedToken = origin.rollOptions.some(option => 
                option.includes('effect:hidden-from') || 
                option.includes('effect:undetected-from') ||
                option.includes('hidden-from') ||
                option.includes('undetected-from')
            );
        }
        
        // Check for self:effect:hidden patterns
        if (!isHiddenOrUndetectedToken && context.options) {
            isHiddenOrUndetectedToken = context.options.some(option => 
                option.includes('self:effect:hidden') || 
                option.includes('self:effect:undetected')
            );
        }
    }
    
    // Combine damage roll and hidden/undetected status
    const isConsequencesAction = isDamageRoll && isHiddenOrUndetectedToken;
    
    // Early return if no supported action is detected
    if (!isSeekAction && !isPointOutAction && !isHideAction && !isSneakAction && 
        !isCreateADiversionAction && !isConsequencesAction) {
        return null;
    }
    
    // For Seek, Hide, Sneak, Create a Diversion, and Consequences, we need rolls and token
    if ((isSeekAction || isHideAction || isSneakAction || isCreateADiversionAction || isConsequencesAction) && 
        (!message.rolls?.length || (!actorToken))) return null;
    
    // For Point Out, we need token but not necessarily rolls
    if (isPointOutAction && !actorToken) return null;
    
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
    } else if (isHideAction) {
        actionType = 'hide';
    } else if (isSneakAction) {
        actionType = 'sneak';
    } else if (isCreateADiversionAction) {
        actionType = 'create-a-diversion';
    } else if (isConsequencesAction) {
        actionType = 'consequences';
    } else {
        return null;
    }
    
    // Extract damage data for consequences
    let damageData = null;
    if (isConsequencesAction) {
        damageData = {
            formula: message.rolls?.[0]?.formula || '',
            total: message.rolls?.[0]?.total || 0,
            isCritical: message.flags?.pf2e?.context?.options?.includes('critical-hit') || false
        };
    }
    
    if (!actorToken) {
        console.warn(`${MODULE_TITLE}: Could not find actor token for ${actionType} action`);
        return null;
    }
    
    return {
        actionType,
        actor: actorToken,
        roll: message.rolls?.[0] || null,
        context,
        messageId: message.id,
        damageData
    };
}

/**
 * Extract DC from message content or flags
 * @param {ChatMessage} message - The chat message
 * @returns {number|null} The DC or null if not found
 */
function extractDCFromMessage(message) {
    // Try to extract from PF2e context
    const context = message.flags?.pf2e?.context;
    if (context?.dc?.value) {
        return context.dc.value;
    }
    
    // Try to extract from message content
    const dcMatch = message.content?.match(/DC\s*(\d+)/i);
    if (dcMatch) {
        return parseInt(dcMatch[1]);
    }
    
    return null;
}

/**
 * Extract target from message flags or current targets
 * @param {ChatMessage} message - The chat message
 * @returns {Token|null} The target token or null if not found
 */
function extractTargetFromMessage(message) {
    // Try to get from PF2e flags
    const targetData = message.flags?.pf2e?.target;
    if (targetData?.token) {
        const targetToken = canvas.tokens.get(targetData.token);
        if (targetToken) return targetToken;
    }
    
    // Try to get from current user targets
    if (game.user.targets && game.user.targets.size > 0) {
        return Array.from(game.user.targets)[0];
    }
    
    return null;
}

/**
 * Advanced UI injection system for action automation
 * Creates modern, accessible interface elements for Seek and Point Out
 * @param {ChatMessage} message - The chat message
 * @param {jQuery} html - The HTML container
 * @param {Object} actionData - Extracted action data
 */
function injectAutomationUI(message, html, actionData) {
    try {
        // Create automation panel
        const panelHtml = buildAutomationPanel(actionData);
        const panel = $(panelHtml);
        
        // Find appropriate insertion point
        const messageContent = html.find('.message-content');
        if (messageContent.length === 0) return;
        
        // Insert panel after message content
        messageContent.after(panel);
        
        // Bind events to the panel
        bindAutomationEvents(panel, message, actionData);
        
        // Mark as processed
        processedMessages.add(message.id);
        
    } catch (error) {
        console.error(`${MODULE_TITLE}: Error injecting automation UI:`, error);
    }
}

/**
 * Modern automation panel builder with enhanced UX
 * Creates accessible, feature-rich interface for all supported actions
 * @param {Object} actionData - The action data
 * @returns {string} Complete automation panel HTML
 */
function buildAutomationPanel(actionData) {
    const isSeek = actionData.actionType === 'seek';
    const isPointOut = actionData.actionType === 'point-out';
    const isHide = actionData.actionType === 'hide';
    const isSneak = actionData.actionType === 'sneak';
    const isCreateADiversion = actionData.actionType === 'create-a-diversion';
    const isConsequences = actionData.actionType === 'consequences';
    
    let label, tooltip, title, icon, actionName, buttonClass, panelClass;
    
    if (isSeek) {
        label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
        tooltip = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP');
        title = 'Seek Results Available';
        icon = 'fas fa-search';
        actionName = 'open-seek-results';
        buttonClass = 'visioner-btn-seek';
        panelClass = 'seek-panel';
    } else if (isPointOut) {
        label = 'Open Point Out Results';
        tooltip = 'Preview and apply Point Out visibility changes';
        title = 'Point Out Results Available';
        icon = 'fas fa-hand-point-right';
        actionName = 'open-point-out-results';
        buttonClass = 'visioner-btn-point-out';
        panelClass = 'point-out-panel';
    } else if (isHide) {
        label = 'Open Hide Results';
        tooltip = 'Preview and apply Hide visibility changes';
        title = 'Hide Results Available';
        icon = 'fas fa-eye-slash';
        actionName = 'open-hide-results';
        buttonClass = 'visioner-btn-hide';
        panelClass = 'hide-panel';
    } else if (isSneak) {
        label = 'Open Sneak Results';
        tooltip = 'Preview and apply Sneak visibility changes';
        title = 'Sneak Results Available';
        icon = 'fas fa-user-ninja';
        actionName = 'open-sneak-results';
        buttonClass = 'visioner-btn-sneak';
        panelClass = 'sneak-panel';
    } else if (isCreateADiversion) {
        label = 'Open Diversion Results';
        tooltip = 'Preview and apply Create a Diversion visibility changes';
        title = 'Create a Diversion Results Available';
        icon = 'fas fa-theater-masks';
        actionName = 'open-diversion-results';
        buttonClass = 'visioner-btn-create-a-diversion';
        panelClass = 'create-a-diversion-panel';
    } else if (isConsequences) {
        label = 'Open Damage Consequences';
        tooltip = 'Preview and apply visibility changes after damage from hidden/undetected attacker';
        title = 'Damage Consequences Available';
        icon = 'fas fa-skull';
        actionName = 'open-consequences-results';
        buttonClass = 'visioner-btn-consequences';
        panelClass = 'consequences-panel';
    }
    
    return `
        <div class="pf2e-visioner-automation-panel ${panelClass}" data-message-id="${actionData.messageId}" data-action-type="${actionData.actionType}">
            <div class="automation-header">
                <i class="${icon}"></i>
                <span class="automation-title">${title}</span>
            </div>
            <div class="automation-actions">
                <button type="button" 
                        class="visioner-btn ${buttonClass}" 
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
        if (button.hasClass('processing')) {
            return;
        }
        
        try {
            button.addClass('processing').prop('disabled', true);
            await previewActionResults(actionData);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Automation error:`, error);
            ui.notifications.error(`${MODULE_TITLE}: ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.ERROR_PROCESSING')}`);
        } finally {
            button.removeClass('processing').prop('disabled', false);
        }
    });
}

/**
 * Unified preview function for all supported actions
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The action data
 */
async function previewActionResults(actionData) {
    
    if (actionData.actionType === 'seek') {
        return await previewSeekResults(actionData);
    } else if (actionData.actionType === 'point-out') {
        return await previewPointOutResults(actionData);
    } else if (actionData.actionType === 'hide') {
        return await previewHideResults(actionData);
    } else if (actionData.actionType === 'sneak') {
        return await previewSneakResults(actionData);
    } else if (actionData.actionType === 'create-a-diversion') {
        return await previewDiversionResults(actionData);
    } else if (actionData.actionType === 'consequences') {
        return await previewConsequencesResults(actionData);
    } else {
        console.warn('[Chat Processor] Unknown action type:', actionData.actionType);
    }
}

