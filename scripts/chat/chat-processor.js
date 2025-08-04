/**
 * Advanced chat message automation for PF2E Visioner
 * Provides intelligent visibility resolution for Seek actions
 */

import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { previewSeekResults } from './seek-logic.js';
import { previewPointOutResults } from './point-out-logic.js';

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
    } else if (message.speaker?.token && canvas?.tokens?.get) {
        actorToken = canvas.tokens.get(message.speaker.token);
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
        messageId: message.id
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

