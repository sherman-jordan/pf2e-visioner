/**
 * Advanced chat message automation for PF2E Visioner
 * Provides intelligent visibility resolution for Seek actions
 */

import { MODULE_TITLE } from '../constants.js';
import { requestGMOpenPointOut, requestGMOpenSeekWithTemplate } from '../socket.js';
import { getVisibilityBetween } from '../utils.js';
import { previewConsequencesResults } from './consequences-logic.js';
import { discoverDiversionObservers, previewDiversionResults } from './create-a-diversion-logic.js';
import { discoverHideObservers, previewHideResults } from './hide-logic.js';
import { previewPointOutResults } from './point-out-logic.js';
import { discoverSeekTargets, previewSeekResults } from './seek-logic.js';
import { shouldFilterAlly } from './shared-utils.js';
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
    // Use modern message detection approach - check for Seek, Point Out, Hide, and Sneak
    const actionData = extractActionData(message);
    if (!actionData) return;

    // If there is a pending player-provided seek template for this message and the current user is GM,
    // allow re-processing even if this message was already processed earlier.
    const hasPendingSeekTemplateForGM = actionData.actionType === 'seek'
        && game.user.isGM
        && !!(message.flags?.['pf2e-visioner']?.seekTemplate);
    // Detect player-authored Point Out
    const isPlayerPointOutAuthor = !game.user.isGM
        && actionData.actionType === 'point-out'
        && message.user?.id === game.user.id;

    // If a player authored a Point Out, auto-forward to GM and render nothing for the player
    if (isPlayerPointOutAuthor) {
        try {
            // Determine target robustly: prefer player's current Target, then PF2e flags
            let targetId = null;
            if (game.user.targets?.size) {
                targetId = Array.from(game.user.targets)[0]?.id || null;
            }
            if (!targetId) {
                targetId = actionData.context?.target?.token || null;
            }
            if (!targetId) {
                const flg = message?.flags?.pf2e?.target;
                targetId = flg?.token || null;
            }
            requestGMOpenPointOut(actionData.actor.id, targetId, actionData.messageId);
        } catch (e) {
            console.warn(`${MODULE_TITLE}: Failed to auto-forward Point Out to GM:`, e);
        }
        processedMessages.add(message.id);
        return;
    }
    const hasPendingPointOutForGM = actionData.actionType === 'point-out'
        && game.user.isGM
        && !!(message.flags?.['pf2e-visioner']?.pointOut);

    // Allow GM always.
    // Allow players for:
    //  - Seek when template mode is enabled and they are the message author
    //  - Point Out when they are the message author (so we can forward their target to GM)
    const isSeekTemplatePlayer = !game.user.isGM
        && actionData.actionType === 'seek'
        && game.settings.get('pf2e-visioner', 'seekUseTemplate')
        && message.user?.id === game.user.id;
    // Players never see Point Out UI; only Seek template when allowed
    if (!game.user.isGM && !isSeekTemplatePlayer) return;

    // Prevent duplicate processing using cache, unless there is a pending seek template for the GM
    if (processedMessages.has(message.id)) {
        if (hasPendingSeekTemplateForGM || hasPendingPointOutForGM) {
            try { processedMessages.delete(message.id); } catch (_) {}
        } else {
            return;
        }
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

    // Damage roll from hidden/undetected token detection (robust)
    const firstRoll = message.rolls?.[0];
    const isDamageRoll = (context?.type === 'damage-roll') ||
        (message.flags?.pf2e?.damageRoll) ||
        (firstRoll && (firstRoll.isDamage === true ||
            (typeof DamageRoll !== 'undefined' && firstRoll instanceof DamageRoll) ||
            (typeof CONFIG?.Dice?.DamageRoll !== 'undefined' && firstRoll instanceof CONFIG.Dice.DamageRoll) ||
            (typeof firstRoll?.options?.type === 'string' && firstRoll.options.type.includes('damage')))) ||
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
    // Fallback: resolve from speaker.actor to an active token if none found above
    if (!actorToken && message.speaker?.actor) {
        try {
            const speakerActor = game.actors?.get?.(message.speaker.actor);
            const activeTokens = speakerActor?.getActiveTokens?.(true, true) || [];
            actorToken = activeTokens[0] || null;
        } catch (_) {}
    }
    // Fallback: resolve from PF2E origin uuid when available
    if (!actorToken && origin?.uuid && typeof fromUuidSync === 'function') {
        try {
            const originDoc = fromUuidSync(origin.uuid);
            const originActor = originDoc?.actor ?? originDoc?.parent?.actor ?? null;
            const activeTokens = originActor?.getActiveTokens?.(true, true) || [];
            actorToken = activeTokens[0] || null;
        } catch (_) {}
    }

    // Check for conditions first
    if (actorToken && actorToken.actor) {
        // Prefer v13 itemTypes.condition when available, fallback to legacy collection
        const itemTypeConditions = actorToken.actor.itemTypes?.condition || [];
        const legacyConditions = actorToken.actor.conditions?.conditions || [];
        isHiddenOrUndetectedToken = itemTypeConditions.some(c => c?.slug === 'hidden' || c?.slug === 'undetected')
            || legacyConditions.some(c => c?.slug === 'hidden' || c?.slug === 'undetected');
    }

    // If no conditions found, check for effect flags in the message
    if (!isHiddenOrUndetectedToken && context?.options) {
        // Look for any option that includes hidden/undetected indicators
        isHiddenOrUndetectedToken = context.options.some(option =>
            option.includes('effect:hidden-from') ||
            option.includes('effect:undetected-from') ||
            option.includes('hidden-from') ||
            option.includes('undetected-from') ||
            option.includes('self:hidden') ||
            option.includes('self:undetected')
        );

        // Also check origin rollOptions if available
        if (!isHiddenOrUndetectedToken && origin?.rollOptions) {
            isHiddenOrUndetectedToken = origin.rollOptions.some(option =>
                option.includes('effect:hidden-from') ||
                option.includes('effect:undetected-from') ||
                option.includes('hidden-from') ||
                option.includes('undetected-from') ||
                option.includes('self:hidden') ||
                option.includes('self:undetected')
            );
        }

        // Check for self hidden patterns
        if (!isHiddenOrUndetectedToken && context.options) {
            isHiddenOrUndetectedToken = context.options.some(option =>
                option.includes('self:effect:hidden') ||
                option.includes('self:effect:undetected') ||
                option.includes('self:hidden') ||
                option.includes('self:undetected')
            );
        }
    }

    // For consequences, any damage roll may qualify; later we verify hidden/undetected vs observers
    const isConsequencesAction = isDamageRoll;

    // Early return if no supported action is detected
    if (!isSeekAction && !isPointOutAction && !isHideAction && !isSneakAction &&
        !isCreateADiversionAction && !isConsequencesAction) {
        return null;
    }

    // For Seek, Hide, Sneak, and Create a Diversion, we need both a roll and a token
    if ((isSeekAction || isHideAction || isSneakAction || isCreateADiversionAction) &&
        (!message.rolls?.length || (!actorToken))) return null;
    // For Consequences, only a token is required; roll is optional
    if (isConsequencesAction && !actorToken) return null;

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
        // Derive hidden/undetected indicator from flags/options for fallback logic in the dialog
        const contextOptions = context?.options || [];
        const originOptions = origin?.rollOptions || [];
        const indicatesUndetected = [...contextOptions, ...originOptions].some(opt =>
            opt.includes('effect:undetected-from') || opt.includes('undetected-from') || opt.includes('self:undetected')
        );
        const indicatesHidden = (!indicatesUndetected) && [...contextOptions, ...originOptions].some(opt =>
            opt.includes('effect:hidden-from') || opt.includes('hidden-from') || opt.includes('self:hidden')
        );

        // Detect via actor conditions (v13 or legacy)
        let attackerConditionIndicator = null;
        try {
            const itemConds = actorToken.actor?.itemTypes?.condition || [];
            if (itemConds.some(c => c?.slug === 'undetected')) attackerConditionIndicator = 'undetected';
            else if (itemConds.some(c => c?.slug === 'hidden')) attackerConditionIndicator = 'hidden';
            else {
                const legacyConds = actorToken.actor?.conditions?.conditions || [];
                if (legacyConds.some(c => c?.slug === 'undetected')) attackerConditionIndicator = 'undetected';
                else if (legacyConds.some(c => c?.slug === 'hidden')) attackerConditionIndicator = 'hidden';
            }
        } catch (_) {}

        damageData = {
            formula: message.rolls?.[0]?.formula || '',
            total: message.rolls?.[0]?.total || 0,
            isCritical: message.flags?.pf2e?.context?.options?.includes('critical-hit') || false,
            hiddenIndicator: indicatesUndetected ? 'undetected' : (indicatesHidden ? 'hidden' : (attackerConditionIndicator || null))
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
 * Advanced UI injection system for action automation
 * Creates modern, accessible interface elements for Seek and Point Out
 * @param {ChatMessage} message - The chat message
 * @param {jQuery} html - The HTML container
 * @param {Object} actionData - Extracted action data
 */
function injectAutomationUI(message, html, actionData) {
    try {
        // If a player-provided Seek template exists on this message but contains no targets,
        // and the current user is GM, do not inject any actions at all.
        if (actionData.actionType === 'seek' && game.user.isGM) {
            const pending = message?.flags?.['pf2e-visioner']?.seekTemplate;
            if (pending && pending.hasTargets === false) {
                processedMessages.add(message.id);
                return;
            }
        }
        // Check if there are valid targets for this action
        const hasValidTargets = checkForValidTargets(actionData);

        // If no valid targets, still allow in special cases
        if (!hasValidTargets) {
            const pendingForGM = (actionData.actionType === 'seek' && game.user.isGM && !!(message.flags?.['pf2e-visioner']?.seekTemplate?.hasTargets))
                || (actionData.actionType === 'point-out' && game.user.isGM && !!(message.flags?.['pf2e-visioner']?.pointOut?.hasTargets));
            // For consequences, hide button when no valid targets, otherwise show as normal
            const allowConsequencesForGM = actionData.actionType === 'consequences' ? false : false;
            if (!pendingForGM && !allowConsequencesForGM) {
                // Mark as processed to avoid repeated checks
                processedMessages.add(message.id);
                return;
            }
        }

    // Create automation panel
    const panelHtml = buildAutomationPanel(actionData, message);
        const panel = $(panelHtml);

        // Find appropriate insertion point
        const messageContent = html.find('.message-content');
        if (messageContent.length === 0) return;

        // Insert panel after message content
        messageContent.after(panel);

        // Bind events to the panel (players will only have template setup available when allowed)
        bindAutomationEvents(panel, message, actionData);

        // Mark as processed
        processedMessages.add(message.id);

    } catch (error) {
        console.error(`${MODULE_TITLE}: Error injecting automation UI:`, error);
    }
}

/**
 * Check if there are valid targets for the given action
 * @param {Object} actionData - The action data
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkForValidTargets(actionData) {
    // Get all tokens on the canvas
    const allTokens = canvas.tokens.placeables;

    // Filter out tokens without actors and the actor's own token
    const potentialTargets = allTokens.filter(token => {
        // Skip the actor's own token
        if (token === actionData.actor) return false;

        // Skip tokens without actors
        if (!token.actor) return false;

        // Only include character and npc type tokens
        if (token.actor.type !== 'character' && token.actor.type !== 'npc' && token.actor.type !== 'hazard') return false;

        return true;
    });

    // If no potential targets, no need to continue
    if (potentialTargets.length === 0) return false;

    // Handle each action type differently
    switch (actionData.actionType) {
        case 'consequences':
            return checkConsequencesTargets(actionData, potentialTargets);

        case 'seek':
            return checkSeekTargets(actionData, potentialTargets);

        case 'point-out':
            return checkPointOutTargets(actionData, potentialTargets);

        case 'hide':
            return checkHideTargets(actionData, potentialTargets);

        case 'sneak':
            return checkSneakTargets(actionData, potentialTargets);

        case 'create-a-diversion':
            return checkDiversionTargets(actionData, potentialTargets);

        default:
            // For unknown action types, assume there are valid targets
            return true;
    }
}

/**
 * Check if there are valid targets for the consequences action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkConsequencesTargets(actionData, potentialTargets) {
    // For consequences, check if any tokens see the attacker as hidden/undetected
    for (const target of potentialTargets) {
        // Respect ally-filter setting instead of raw disposition
        if (shouldFilterAlly(actionData.actor, target, 'enemies')) continue;

        // Use the module's per-token visibility map directly
        let visibility = getVisibilityBetween(target, actionData.actor);
        // Accept concealed from actor condition as well
        try {
            const itemTypeConditions = actionData.actor?.actor?.itemTypes?.condition || [];
            const legacyConditions = actionData.actor?.actor?.conditions?.conditions || [];
            const actorIsConcealed = itemTypeConditions.some(c => c?.slug === 'concealed') || legacyConditions.some(c => c?.slug === 'concealed');
            if (visibility === 'observed' && actorIsConcealed) {
                visibility = 'concealed';
            }
        } catch (_) {}
        if (visibility === 'hidden' || visibility === 'undetected') {
            return true;
        }
    }

    // No valid targets found
    return false;
}

/**
 * Check if there are valid targets for the seek action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkSeekTargets(actionData, potentialTargets) {
    // For seek, check if any tokens are concealed, hidden, or undetected from the actor
    for (const target of potentialTargets) {
        // Use the module's getVisibilityBetween function directly
        const visibility = getVisibilityBetween(actionData.actor, target);
        if (visibility === 'concealed' || visibility === 'hidden' || visibility === 'undetected') {
            return true;
        }

        // Check conditions on the target
        if (target.actor) {
            const conditions = target.actor.conditions?.conditions || [];
            const isHiddenOrUndetected = conditions.some(c =>
                c.slug === 'hidden' || c.slug === 'undetected' || c.slug === 'concealed'
            );
            if (isHiddenOrUndetected) return true;
        }

        // Check roll options on the actor
        if (actionData.actor.actor?.getRollOptions) {
            const rollOptions = actionData.actor.actor.getRollOptions();
            const hasHiddenOrUndetected = rollOptions.some(option =>
                option.includes('target:concealed') ||
                option.includes('target:hidden') ||
                option.includes('target:undetected')
            );
            if (hasHiddenOrUndetected) return true;
        }
    }

    // No valid targets found
    return false;
}

/**
 * Check if there are valid targets for the point-out action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkPointOutTargets(actionData, potentialTargets) {
    // For point-out, check if there's at least one ally and one valid target
    let hasAlly = false;
    let hasValidTarget = false;
    
    // Check for allies (different tokens with same disposition)
    for (const token of potentialTargets) {
        // Check for ally (same disposition, not the actor themselves)
        if (!hasAlly && token.document.disposition === actionData.actor.document.disposition) {
            hasAlly = true;
        }
        // Check for valid target (different disposition, pointer can see them)
        if (
            !hasValidTarget &&
            token.document.disposition !== actionData.actor.document.disposition
        ) {
            const visibility = getVisibilityBetween(actionData.actor, token);
            if (visibility !== 'undetected') {
                hasValidTarget = true;
            }
        }
        // If both found, no need to continue
        if (hasAlly && hasValidTarget) break;
    }
    
    // Need both an ally and a valid target for point-out to be useful
    return hasAlly && hasValidTarget;
}

/**
 * Check if there are valid targets for the hide action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkHideTargets(actionData, potentialTargets) {
    // Use same discovery logic as the Hide preview to avoid mismatches.
    const observers = discoverHideObservers(actionData.actor, false, false);
    return observers.length > 0;
}

/**
 * Check if there are valid targets for the sneak action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkSneakTargets(actionData, potentialTargets) {
    // For sneak, check if there are any tokens that the sneaking token is currently hidden or undetected from
    for (const target of potentialTargets) {
        // Get current visibility - how this observer sees the sneaking token
        const currentVisibility = getVisibilityBetween(target, actionData.actor);

        // Only include tokens that the sneaking token is currently hidden or undetected from
        // Sneak action is used to maintain or improve stealth against these tokens
        if (currentVisibility === 'hidden' || currentVisibility === 'undetected') {
            return true;
        }
    }

    // No valid targets found
    return false;
}

/**
 * Check if there are valid targets for the create-a-diversion action
 * @param {Object} actionData - The action data
 * @param {Array} potentialTargets - Array of potential target tokens
 * @returns {boolean} True if there are valid targets, false otherwise
 */
function checkDiversionTargets(actionData, potentialTargets) {
    // Use same discovery logic as the Diversion preview to avoid mismatches
    const observers = discoverDiversionObservers(actionData.actor);
    return observers.length > 0;
}

/**
 * Modern automation panel builder with enhanced UX
 * Creates accessible, feature-rich interface for all supported actions
 * @param {Object} actionData - The action data
 * @returns {string} Complete automation panel HTML
 */
function buildAutomationPanel(actionData, message) {
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
        title = 'Seek Results';
        icon = 'fas fa-search';
        actionName = 'open-seek-results';
        buttonClass = 'visioner-btn-seek';
        panelClass = 'seek-panel';
    } else if (isPointOut) {
        // Only show Point Out button to GM; players don't see this and GM uses player's target implicitly
        label = 'Open Point Out Results';
        tooltip = 'Preview and apply Point Out visibility changes';
        title = 'Point Out Results';
        icon = 'fas fa-hand-point-right';
        actionName = 'open-point-out-results';
        buttonClass = 'visioner-btn-point-out';
        panelClass = 'point-out-panel';
    } else if (isHide) {
        label = 'Open Hide Results';
        tooltip = 'Preview and apply Hide visibility changes';
        title = 'Hide Results';
        icon = 'fas fa-eye-slash';
        actionName = 'open-hide-results';
        buttonClass = 'visioner-btn-hide';
        panelClass = 'hide-panel';
    } else if (isSneak) {
        label = 'Open Sneak Results';
        tooltip = 'Preview and apply Sneak visibility changes';
        title = 'Sneak Results';
        icon = 'fas fa-user-ninja';
        actionName = 'open-sneak-results';
        buttonClass = 'visioner-btn-sneak';
        panelClass = 'sneak-panel';
    } else if (isCreateADiversion) {
        label = 'Open Diversion Results';
        tooltip = 'Preview and apply Create a Diversion visibility changes';
        title = 'Create a Diversion Results';
        icon = 'fas fa-theater-masks';
        actionName = 'open-diversion-results';
        buttonClass = 'visioner-btn-create-a-diversion';
        panelClass = 'create-a-diversion-panel';
    } else if (isConsequences) {
        label = 'Open Damage Consequences';
        tooltip = 'Preview and apply visibility changes after damage from hidden/undetected attacker';
        title = 'Damage Consequences';
        icon = 'fas fa-skull';
        actionName = 'open-consequences-results';
        buttonClass = 'visioner-btn-consequences';
        panelClass = 'consequences-panel';
    }

    const isSeekWithTemplateOption = isSeek && game.settings.get('pf2e-visioner', 'seekUseTemplate');
    // Prefer the provided message (fresh render) when available
    const msgForPanel = isSeek ? (message || game.messages.get(actionData.messageId)) : null;
    const hasPendingTemplateFromPlayer = isSeek && !!(msgForPanel?.flags?.['pf2e-visioner']?.seekTemplate) && game.user.isGM;
    const pendingHasTargets = !!(msgForPanel?.flags?.['pf2e-visioner']?.seekTemplate?.hasTargets);
    const hasPendingPointOutFromPlayer = isPointOut && !!(msgForPanel?.flags?.['pf2e-visioner']?.pointOut) && game.user.isGM;
    const pendingPointOutHasTargets = !!(msgForPanel?.flags?.['pf2e-visioner']?.pointOut?.hasTargets);
    const hasExistingTemplate = isSeekWithTemplateOption && !!(canvas?.scene?.templates?.find?.(t => {
        const f = t?.flags?.['pf2e-visioner'];
        return f?.seekPreviewManual && f?.messageId === actionData.messageId && f?.actorTokenId === actionData.actor.id && t?.user?.id === game.userId;
    }));

    // Precompute action buttons HTML to avoid complex nested template expressions
    let actionButtonsHtml = '';
    if (isSeek) {
        if (hasPendingTemplateFromPlayer) {
            if (pendingHasTargets) {
                actionButtonsHtml = `
                    <button type=\"button\" 
                            class=\"visioner-btn ${buttonClass}\" 
                            data-action=\"open-seek-results\"
                            title=\"${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP')}\">\n                        <i class=\"${icon}\"></i> ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS')}\n                    </button>`;
            } else {
                // Pending template from player has no targets: show nothing at all
                actionButtonsHtml = '';
            }
        } else if (isSeekWithTemplateOption) {
            actionButtonsHtml = `
                <button type=\"button\"
                        class=\"visioner-btn ${buttonClass} setup-template\"
                        data-action=\"${hasExistingTemplate ? 'remove-seek-template' : 'setup-seek-template'}\"
                        title=\"${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP')}\">\n                    <i class=\"fas fa-bullseye\"></i> ${hasExistingTemplate ? game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE') : game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE')}\n                </button>`;
        } else if (game.user.isGM) {
            actionButtonsHtml = `
                <button type="button" 
                        class="visioner-btn ${buttonClass}" 
                        data-action="${actionName}"
                        title="${tooltip}">
                    <i class="${icon}"></i> ${label}
                </button>`;
        }
    } else if (isPointOut) {
        if (hasPendingPointOutFromPlayer) {
            if (pendingPointOutHasTargets) {
                actionButtonsHtml = `
                    <button type="button" 
                            class="visioner-btn ${buttonClass}" 
                            data-action="open-point-out-results"
                            title="Preview and apply Point Out visibility changes">
                        <i class="fas fa-hand-point-right"></i> Open Point Out Results
                    </button>`;
            } else {
                actionButtonsHtml = '';
            }
        } else if (game.user.isGM) {
            actionButtonsHtml = `
                <button type="button" 
                        class="visioner-btn ${buttonClass}" 
                        data-action="${actionName}"
                        title="${tooltip}">
                    <i class="${icon}"></i> ${label}
                </button>`;
        }
    } else {
        if (game.user.isGM) {
            actionButtonsHtml = `
                <button type="button" 
                        class="visioner-btn ${buttonClass}" 
                        data-action="${actionName}"
                        title="${tooltip}">
                    <i class="${icon}"></i> ${label}
                </button>`;
        }
    }
    return `
        <div class="pf2e-visioner-automation-panel ${panelClass}" data-message-id="${actionData.messageId}" data-action-type="${actionData.actionType}">
            <div class="automation-header">
                <i class="${icon}"></i>
                <span class="automation-title">${title}</span>
            </div>
            <div class="automation-actions">
                ${actionButtonsHtml}
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
            if (action === 'setup-seek-template' && actionData.actionType === 'seek') {
                await setupSeekTemplate(actionData);
            } else if (action === 'remove-seek-template' && actionData.actionType === 'seek') {
                await removeSeekTemplate(actionData);
                // Re-render panel back to Setup state
                try {
                    const parent = button.closest('.pf2e-visioner-automation-panel');
                    if (parent?.length) {
                        const messageId = parent.data('message-id');
                        const message = game.messages.get(messageId);
                        if (message) {
                            const html = $(message.element);
                            parent.remove();
                            injectAutomationUI(message, html, actionData);
                        }
                    }
                } catch (_) {}
            } else if (action === 'open-seek-results' && actionData.actionType === 'seek') {
                // If a player provided a template, the GM should have pending flags on the message
                const msg = game.messages.get(actionData.messageId);
                const pending = msg?.flags?.['pf2e-visioner']?.seekTemplate;
                if (pending && game.user.isGM) {
                    // Use the pending template data to open results
                    actionData.seekTemplateCenter = pending.center;
                    actionData.seekTemplateRadiusFeet = pending.radiusFeet;
                    // Reconstruct a minimal roll if present
                    if (typeof pending.rollTotal === 'number') {
                        actionData.roll = { total: pending.rollTotal, dice: [{ total: typeof pending.dieResult === 'number' ? pending.dieResult : undefined }] };
                    }
                }
                await previewActionResults(actionData);
            } else if (action === 'open-point-out-results' && actionData.actionType === 'point-out') {
                // If a player requested Point Out, ensure GM uses stored flags for the target
                if (game.user.isGM) {
                    try {
                        const msg = game.messages.get(actionData.messageId);
                        const modulePointOut = msg?.flags?.['pf2e-visioner']?.pointOut;
                        if (modulePointOut?.targetTokenId) {
                            actionData.context = actionData.context || {};
                            actionData.context.target = { token: modulePointOut.targetTokenId };
                        } else if (msg?.flags?.pf2e?.target?.token) {
                            actionData.context = actionData.context || {};
                            actionData.context.target = { token: msg.flags.pf2e.target.token };
                        } else if (!actionData.context?.target?.token) {
                            // As a last resort, resolve based on the pointer's best target
                            const pointerId = modulePointOut?.pointerTokenId || actionData.actor?.id;
                            const pointerToken = pointerId ? canvas.tokens.get(pointerId) : null;
                            if (pointerToken) {
                                const { findBestPointOutTarget } = await import('./point-out-logic.js');
                                const best = findBestPointOutTarget(pointerToken);
                                if (best) {
                                    actionData.context = actionData.context || {};
                                    actionData.context.target = { token: best.id };
                                }
                            }
                        }

                        // Ping target for clarity ONLY if this is a GM-initiated Point Out (no player handoff present)
                        try {
                            if (!modulePointOut) {
                                const targetId = actionData.context?.target?.token;
                                if (targetId) {
                                    const tok = canvas.tokens.get(targetId);
                                    if (tok) {
                                        const point = tok.center || { x: tok.x + (tok.w ?? (tok.width * canvas.grid.size)) / 2, y: tok.y + (tok.h ?? (tok.height * canvas.grid.size)) / 2 };
                                        if (typeof canvas.ping === 'function') {
                                            canvas.ping(point, { color: game.user?.color, name: 'Point Out' });
                                        } else if (canvas?.pings?.create) {
                                            canvas.pings.create({ ...point, user: game.user });
                                        }
                                    }
                                }
                            }
                        } catch (_) {}
                    } catch (_) {}
                }
                await previewActionResults(actionData);
            } else if (
                (action === 'open-hide-results' && actionData.actionType === 'hide') ||
                (action === 'open-sneak-results' && actionData.actionType === 'sneak') ||
                (action === 'open-diversion-results' && actionData.actionType === 'create-a-diversion') ||
                (action === 'open-consequences-results' && actionData.actionType === 'consequences')
            ) {
                // Directly delegate to unified preview handler for these actions
                await previewActionResults(actionData);
            } else if (typeof action === 'string' && action.startsWith('open-')) {
                // Future-proof: any other open-* actions fall back to unified preview
                await previewActionResults(actionData);
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
 * Unified preview function for all supported actions
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The action data
 */
async function previewActionResults(actionData) {

    if (actionData.actionType === 'seek') {
        return await previewSeekResults(actionData);
    } else if (actionData.actionType === 'point-out') {
        if (game.user.isGM) {
            // Ensure target is present for GM by enriching from message flags if missing
            try {
                if (!actionData.context) actionData.context = {};
                let hasTarget = actionData.context?.target?.actor || actionData.context?.target?.token;
                if (!hasTarget && actionData.messageId) {
                    const msg = game.messages.get(actionData.messageId);
                    const targetData = msg?.flags?.pf2e?.target;
                    if (targetData) {
                        actionData.context.target = { ...targetData };
                        hasTarget = true;
                    }
                    // Fallback to module flags from player→GM handoff
                    if (!hasTarget) {
                        const modulePO = msg?.flags?.['pf2e-visioner']?.pointOut;
                        if (modulePO?.targetTokenId) {
                            actionData.context.target = { token: modulePO.targetTokenId };
                            hasTarget = true;
                        }
                    }
                }
            } catch (_) {}
            return await previewPointOutResults(actionData);
        } else {
            // Determine target robustly: prefer player's current Target, then PF2e flags
            let targetId = null;
            if (game.user.targets?.size) {
                targetId = Array.from(game.user.targets)[0]?.id || null;
            }
            if (!targetId) {
                targetId = actionData.context?.target?.token || null;
            }
            if (!targetId) {
                const msg = game.messages.get(actionData.messageId);
                const flg = msg?.flags?.pf2e?.target;
                targetId = flg?.token || null;
            }
            requestGMOpenPointOut(actionData.actor.id, targetId, actionData.messageId);
            return;
        }
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

/**
 * Update the Seek template button state (Setup ↔ Remove) in-place
 */
function updateSeekTemplateButton(actionData, hasTemplate) {
    try {
        const panel = $(`.pf2e-visioner-automation-panel[data-message-id="${actionData.messageId}"]`);
        if (!panel?.length) return;
        const btn = panel.find('button.setup-template');
        if (!btn?.length) return;
        if (hasTemplate) {
            btn.attr('data-action', 'remove-seek-template');
            btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
            btn.html(`<i class="fas fa-bullseye"></i> ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE')}`);
        } else {
            btn.attr('data-action', 'setup-seek-template');
            btn.attr('title', game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP'));
            btn.html(`<i class="fas fa-bullseye"></i> ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE')}`);
        }
    } catch (_) {}
}

/**
 * Allow the GM to place a 30 ft template anywhere for Seek, then open results using that area
 * @param {Object} actionData
 */
async function setupSeekTemplate(actionData) {
    if (!canvas?.scene) return;
    try {
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP')}`);
        const distance = 30;

        // If GM, allow full measured-template placement and capture via create hook
        if (game.user.isGM) {
            const tplData = {
                t: 'circle',
                user: game.userId,
                distance,
                fillColor: game.user?.color || '#ff9800',
                borderColor: game.user?.color || '#ff9800',
                texture: null,
                flags: { 'pf2e-visioner': { seekPreviewManual: true, messageId: actionData.messageId, actorTokenId: actionData.actor.id } }
            };

            let dispatched = false;
            await new Promise((resolve) => {
                const createHookId = Hooks.on('createMeasuredTemplate', async (doc) => {
                    if (!doc || doc.user?.id !== game.userId) return;
                    try {
                        Hooks.off('createMeasuredTemplate', createHookId);
                        try { await doc.update({ [`flags.pf2e-visioner.seekPreviewManual`]: true, [`flags.pf2e-visioner.messageId`]: actionData.messageId, [`flags.pf2e-visioner.actorTokenId`]: actionData.actor.id }); } catch (_) {}
                        actionData.seekTemplateCenter = { x: doc.x, y: doc.y };
                        actionData.seekTemplateRadiusFeet = Number(doc.distance) || distance;
                        const targets = discoverSeekTargets(actionData.actor, false, actionData.seekTemplateRadiusFeet, actionData.seekTemplateCenter);
                        if (!dispatched && targets.length > 0) {
                            dispatched = true;
                            await previewSeekResults(actionData);
                        }
                        updateSeekTemplateButton(actionData, true);
                    } finally {
                        resolve();
                    }
                });

                const layer = canvas?.templates;
                if (typeof layer?.createPreview === 'function') {
                    layer.createPreview(tplData);
                } else if (typeof MeasuredTemplate?.createPreview === 'function') {
                    MeasuredTemplate.createPreview(tplData);
                } else {
                    // GM fallback: single click to create template
                    const pointerHandler = async (event) => {
                        canvas.stage.off('pointerdown', pointerHandler);
                        try {
                            const local = event.data.getLocalPosition(canvas.stage);
                            const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || { x: local.x, y: local.y };
                            const [created] = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [{ ...tplData, x: snapped.x, y: snapped.y }]);
                            if (created) {
                                try { await canvas.scene.updateEmbeddedDocuments('MeasuredTemplate', [{ _id: created.id, [`flags.pf2e-visioner.seekPreviewManual`]: true, [`flags.pf2e-visioner.messageId`]: actionData.messageId, [`flags.pf2e-visioner.actorTokenId`]: actionData.actor.id }]); } catch (_) {}
                                actionData.seekTemplateCenter = { x: created.x, y: created.y };
                                actionData.seekTemplateRadiusFeet = Number(created.distance) || distance;
                                const targets = discoverSeekTargets(actionData.actor, false, actionData.seekTemplateRadiusFeet, actionData.seekTemplateCenter);
                                if (targets.length > 0) {
                                    await previewSeekResults(actionData);
                                }
                                updateSeekTemplateButton(actionData, true);
                            }
                        } finally {
                            resolve();
                        }
                    };
                    canvas.stage.on('pointerdown', pointerHandler, { once: true });
                }
            });
            return;
        }

        // PLAYER PATH: try full measured-template placement like GM; fallback to single-click if not permitted
        const tplData = {
            t: 'circle',
            user: game.userId,
            distance,
            fillColor: game.user?.color || '#ff9800',
            borderColor: game.user?.color || '#ff9800',
            texture: null
        };

        let usedPreview = false;
        await new Promise((resolve) => {
            const createHookId = Hooks.on('createMeasuredTemplate', async (doc) => {
                if (!doc || doc.user?.id !== game.userId) return;
                try {
                    Hooks.off('createMeasuredTemplate', createHookId);
                    usedPreview = true;
                    const center = { x: doc.x, y: doc.y };
                    const radius = Number(doc.distance) || distance;
                    actionData.seekTemplateCenter = center;
                    actionData.seekTemplateRadiusFeet = radius;
                    // Clean up the player's helper template to avoid clutter
                    try { await doc.delete(); } catch (_) {}
                    const targets = discoverSeekTargets(actionData.actor, false, radius, center);
                    const roll = actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
                    const rollTotal = roll?.total ?? null;
                    const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
                    // Always inform the GM, even when there are no targets, so the GM panel can hide actions
                    requestGMOpenSeekWithTemplate(actionData.actor.id, center, radius, actionData.messageId, rollTotal, dieResult);
                } finally {
                    resolve();
                }
            });

            const layer = canvas?.templates;
            if (typeof layer?.createPreview === 'function') {
                layer.createPreview(tplData);
            } else if (typeof MeasuredTemplate?.createPreview === 'function') {
                MeasuredTemplate.createPreview(tplData);
            } else {
                resolve();
            }
        });

        if (!usedPreview) {
            // Fallback: single-click choose center
            await new Promise((resolve) => {
                const pointerHandler = async (event) => {
                    canvas.stage.off('pointerdown', pointerHandler);
                    try {
                        const local = event.data.getLocalPosition(canvas.stage);
                        const snapped = canvas.grid?.getSnappedPosition?.(local.x, local.y, 2) || { x: local.x, y: local.y };
                        actionData.seekTemplateCenter = { x: snapped.x, y: snapped.y };
                        actionData.seekTemplateRadiusFeet = distance;
                        const targets = discoverSeekTargets(actionData.actor, false, actionData.seekTemplateRadiusFeet, actionData.seekTemplateCenter);
                        const roll = actionData.roll || game.messages.get(actionData.messageId)?.rolls?.[0] || null;
                        const rollTotal = roll?.total ?? null;
                        const dieResult = roll?.dice?.[0]?.total ?? roll?.terms?.[0]?.total ?? null;
                        // Always inform the GM, even when there are no targets
                        requestGMOpenSeekWithTemplate(actionData.actor.id, actionData.seekTemplateCenter, actionData.seekTemplateRadiusFeet, actionData.messageId, rollTotal, dieResult);
                        if (targets.length === 0) {
                            ui.notifications.info(`${MODULE_TITLE}: No valid targets within template`);
                        }
                    } finally {
                        resolve();
                    }
                };
                canvas.stage.on('pointerdown', pointerHandler, { once: true });
            });
        }
    } catch (error) {
        console.error(`${MODULE_TITLE}: Failed to setup Seek template:`, error);
    }
}

async function removeSeekTemplate(actionData) {
    if (!canvas?.scene?.templates) return;
    try {
        const toRemove = canvas.scene.templates
            .filter(t => t?.flags?.['pf2e-visioner']?.seekPreviewManual && t?.flags?.['pf2e-visioner']?.messageId === actionData.messageId && t?.flags?.['pf2e-visioner']?.actorTokenId === actionData.actor.id && t?.user?.id === game.userId)
            .map(t => t.id);
        if (toRemove.length) {
            await canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', toRemove);
        }
        delete actionData.seekTemplateCenter;
        delete actionData.seekTemplateRadiusFeet;
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE')}`);
        // Update button to Setup state in-place
        updateSeekTemplateButton(actionData, false);
    } catch (error) {
        console.error(`${MODULE_TITLE}: Failed to remove Seek template:`, error);
    }
}

