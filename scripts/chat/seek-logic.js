/**
 * Seek action logic and automation
 * Handles Seek-specific calculations, target discovery, and result processing
 */

import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { SeekPreviewDialog } from './seek-preview-dialog.js';
import {
    calculateTokenDistance,
    determineOutcome,
    extractStealthDC,
    hasActiveEncounter,
    isTokenInEncounter,
    shouldFilterAlly
} from './shared-utils.js';

/**
 * Discover valid Seek targets (hidden and undetected tokens)
 * @param {Token} seekerToken - The token performing the Seek
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of target objects with token, DC, and visibility data
 */
export function discoverSeekTargets(seekerToken, encounterOnly = false, templateRadiusFeet = null, templateCenter = null) {
    if (!seekerToken) return [];
    const targets = [];
    const isInCombat = hasActiveEncounter();
    const limitRangeInCombat = game.settings.get(MODULE_ID, 'limitSeekRangeInCombat');
    const limitRangeOutOfCombat = game.settings.get(MODULE_ID, 'limitSeekRangeOutOfCombat');
    const customSeekDistance = game.settings.get(MODULE_ID, 'customSeekDistance');
    const customSeekDistanceOOC = game.settings.get(MODULE_ID, 'customSeekDistanceOutOfCombat');
    const maxSeekRange = isInCombat ? customSeekDistance : customSeekDistanceOOC; // Use appropriate distance
        
    // Find all tokens that are hidden or undetected to the seeker
    for (const token of canvas.tokens.placeables) {
        if (token === seekerToken) continue;
        if (!token.actor) continue;
        
        // Apply ally filtering if enabled
        if (shouldFilterAlly(seekerToken, token, 'enemies')) continue;
        
        // Check encounter filtering if requested
        if (encounterOnly && !isTokenInEncounter(token)) continue;
        
        // Calculate distance early for range/template limiting
        let distance = calculateTokenDistance(seekerToken, token);

        // If a template radius is provided, restrict to tokens inside the template radius
        if (templateRadiusFeet != null && Number.isFinite(templateRadiusFeet)) {
            // If a template center was provided, calculate distance from template center to token
            if (templateCenter && Number.isFinite(templateCenter.x) && Number.isFinite(templateCenter.y)) {
                try {
                    // Compute pixel distance from center point to token center
                    const tokenCenter = token.center;
                    const dx = (templateCenter.x - tokenCenter.x);
                    const dy = (templateCenter.y - tokenCenter.y);
                    const pixelDistance = Math.hypot(dx, dy);
                    const feetPerSquare = canvas.grid?.distance ?? 5;
                    const pixelsPerSquare = canvas.grid?.size ?? 100;
                    distance = (pixelDistance / pixelsPerSquare) * feetPerSquare;
                } catch (e) {
                    // Fallback to seeker distance if any error
                }
            }
            // Include tokens whose footprint intersects the circle by expanding radius by half token size
            const feetPerSquare = canvas.grid?.distance ?? 5;
            const tokenRadiusFeet = ((token.document?.width ?? 1) * feetPerSquare) / 2;
            if (distance > (templateRadiusFeet + tokenRadiusFeet)) continue;
        }
        
        // Apply range limitation based on context and settings
        const usingTemplateArea = templateRadiusFeet != null && Number.isFinite(templateRadiusFeet);
        const isRangeLimited = !usingTemplateArea && ((isInCombat && limitRangeInCombat) || (!isInCombat && limitRangeOutOfCombat));
        if (isRangeLimited && distance > maxSeekRange) {
            // Skip this token as it's out of range
            continue;
        }
        
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
            distance
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
export function analyzeSeekOutcome(seekData, target) {
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
 * Preview Seek results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Seek action data
 */
export async function previewSeekResults(actionData) {
    
    // Validate actionData
    if (!actionData || !actionData.actor || !actionData.roll) {
        console.error('Invalid actionData provided to previewSeekResults:', actionData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid seek data - cannot preview results`);
        return;
    }
    
    // Check if range limitation is active
    const isInCombat = hasActiveEncounter();
    const limitRangeInCombat = game.settings.get(MODULE_ID, 'limitSeekRangeInCombat');
    const limitRangeOutOfCombat = game.settings.get(MODULE_ID, 'limitSeekRangeOutOfCombat');
    const useTemplate = game.settings.get(MODULE_ID, 'seekUseTemplate');
    // If template is being used (setting on) or an explicit template center was provided, disable range restriction
    const hasExplicitTemplate = !!(actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet);
    const effectiveUseTemplate = useTemplate || hasExplicitTemplate;
    const rangeRestricted = !effectiveUseTemplate && ((isInCombat && limitRangeInCombat) || (!isInCombat && limitRangeOutOfCombat));
    
    // If range is limited, show a notification with custom distance
    if (rangeRestricted) {
        const distance = isInCombat
            ? game.settings.get(MODULE_ID, 'customSeekDistance')
            : game.settings.get(MODULE_ID, 'customSeekDistanceOutOfCombat');
        ui.notifications.info(`${MODULE_TITLE}: ${game.i18n.format('PF2E_VISIONER.SEEK_AUTOMATION.RANGE_LIMIT_ACTIVE_CUSTOM', {distance})}`);
    }
    if (!rangeRestricted && (useTemplate || hasExplicitTemplate)) {
        // Explicitly inform that range-limit is ignored because of template mode
        // Keep it low-noise: only show once per preview call
        const msg = game.i18n.localize('PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_DISABLED_BY_TEMPLATE') || 'Range limit disabled: Using template';
        ui.notifications.info(`${MODULE_TITLE}: ${msg}`);
    }
    
    // Optionally use an existing manual template or create a 30 ft template centered on seeker
    let templateId = null;
    let templateRadiusFeet = null;
    let templateCenter = null;
    if (effectiveUseTemplate && canvas.scene) {
        try {
            if (actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet) {
                templateRadiusFeet = Number(actionData.seekTemplateRadiusFeet) || 30;
                templateCenter = actionData.seekTemplateCenter;
            } else if (actionData.seekManualTemplateId) {
                const doc = canvas.scene.templates?.get?.(actionData.seekManualTemplateId) || canvas.scene.getEmbeddedDocument?.('MeasuredTemplate', actionData.seekManualTemplateId);
                if (doc) {
                    templateId = doc.id;
                    templateRadiusFeet = Number(doc.distance) || 30;
                    templateCenter = { x: doc.x, y: doc.y };
                }
            } else {
                const tplData = {
                    t: 'circle',
                    user: game.userId,
                    distance: 30,
                    x: actionData.actor.center.x,
                    y: actionData.actor.center.y,
                    fillColor: game.user?.color || '#2c5aa0',
                    borderColor: game.user?.color || '#1e3a6f',
                    texture: null,
                    flags: { [MODULE_ID]: { seekPreview: true } }
                };
                const created = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [tplData]);
                templateId = created?.[0]?.id ?? null;
                templateRadiusFeet = 30;
                templateCenter = { x: tplData.x, y: tplData.y };
            }
        } catch (e) {
            console.warn(`${MODULE_TITLE}: Failed to prepare Seek template:`, e);
        }
    }

    const targets = discoverSeekTargets(actionData.actor, false, templateRadiusFeet, templateCenter);
    
    if (targets.length === 0) {
        // No need for notification, just silently return
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = targets.map(target => analyzeSeekOutcome(actionData, target));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new SeekPreviewDialog(actionData.actor, outcomes, changes, actionData);
    if (templateId) previewDialog.templateId = templateId;
    if (templateRadiusFeet != null) previewDialog.templateRadiusFeet = templateRadiusFeet;
    if (templateCenter) previewDialog.templateCenter = templateCenter;
    previewDialog.render(true);
}
