/**
 * Hide action logic and automation
 * Handles Hide-specific calculations, target discovery, and result processing
 */

import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { getCoverBetween, getVisibilityBetween } from '../utils.js';
import { HidePreviewDialog } from './hide-preview-dialog.js';
import {
    calculateTokenDistance,
    determineOutcome,
    extractPerceptionDC,
    hasConcealedCondition,
    isTokenInEncounter,
    shouldFilterAlly
} from './shared-utils.js';

/**
 * Discover valid Hide observers (tokens that can see the hiding token)
 * @param {Token} hidingToken - The token performing the Hide
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @param {boolean} applyAllyFilter - Whether to apply ally filtering (default: true)
 * @returns {Array} Array of observer objects with token, DC, and visibility data
 */
export function discoverHideObservers(hidingToken, encounterOnly = false, applyAllyFilter = true) {
    if (!hidingToken) return [];
    
    const observers = [];
    const integrate = game.settings.get(MODULE_ID, 'integrateCoverVisibility');
    
    // Find all tokens that can currently see the hiding token
    for (const token of canvas.tokens.placeables) {
        if (token === hidingToken) continue;
        if (!token.actor) {
            continue;
        }
        
        // Apply ally filtering if enabled and requested
        if (applyAllyFilter && shouldFilterAlly(hidingToken, token, 'enemies')) continue;
        
        // Check encounter filtering if requested
        if (encounterOnly && !isTokenInEncounter(token)) {
            continue;
        }
        
        // Check current visibility state - Hide only affects tokens that can currently see you
        let currentVisibility = getVisibilityBetween(token, hidingToken);
        // If map says observed but the actor is concealed, treat as concealed for gating
        if (currentVisibility === 'observed' && hasConcealedCondition(hidingToken)) {
            currentVisibility = 'concealed';
        }
        
        // For Hide, skip if explicitly set to hidden or undetected
        if (currentVisibility === 'hidden' || currentVisibility === 'undetected') {         
            continue;
        }

        // With integration ON: allow Hide if you either have Standard/Greater cover OR are Concealed
        // With integration OFF: only allow Hide if Concealed (ignore cover entirely)
        if (integrate) {
            const cover = getCoverBetween(token, hidingToken);
            if (!(cover === 'standard' || cover === 'greater' || currentVisibility === 'concealed')) {
                continue;
            }
        } else {
            if (currentVisibility !== 'concealed') {
                continue;
            }
        }
        
        // Get the observer's Perception DC
        const perceptionDC = extractPerceptionDC(token);
        if (perceptionDC <= 0) {
            continue;
        }
        
        observers.push({
            token,
            perceptionDC,
            currentVisibility,
            distance: calculateTokenDistance(hidingToken, token)
        });
    }
    
    return observers.sort((a, b) => a.distance - b.distance);
}



/**
 * Advanced Hide outcome calculator following official PF2e rules
 * Success: If the creature could see you, you're now Hidden from it instead of observed.
 *          If you were Hidden from or Undetected by the creature, you retain that condition.
 * Failure: No change in visibility
 * @param {Object} hideData - The Hide action data
 * @param {Object} observer - Observer data with token and DC
 * @returns {Object} Detailed outcome analysis
 */
export function analyzeHideOutcome(hideData, observer) {
    const roll = hideData.roll;
    const dc = observer.perceptionDC;
    
    // Validate roll object
    if (!roll || typeof roll.total !== 'number') {
        console.warn('Invalid roll data in analyzeHideOutcome:', roll);
        return {
            token: observer.token,
            currentVisibility: observer.currentVisibility,
            newVisibility: observer.currentVisibility,
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
    
    // Apply official PF2e Hide rules based on current visibility and outcome
    let newVisibility = observer.currentVisibility; // Default: no change
    
    if (outcome === 'success' || outcome === 'critical-success') {
        // Success: If the creature could see you, you're now Hidden from it instead of observed
        if (observer.currentVisibility === 'observed') {
            newVisibility = 'hidden';
        } else if (observer.currentVisibility === 'concealed') {
            // If you were concealed, you become hidden
            newVisibility = 'hidden';
        }
    }         
    
    return {
        target: observer.token,
        oldVisibility: observer.currentVisibility,
        newVisibility,
        outcome,
        rollTotal: roll.total,
        dc,
        margin: roll.total - dc,
        changed: newVisibility !== observer.currentVisibility
    };
}

/**
 * Preview Hide results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Hide action data
 */
export async function previewHideResults(actionData) {    
    // Validate actionData
    if (!actionData || !actionData.actor || !actionData.roll) {
        console.error('Invalid actionData provided to previewHideResults:', actionData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid hide data - cannot preview results`);
        return;
    }
    
    const observers = discoverHideObservers(actionData.actor, false, false);
    
    if (observers.length === 0) {
        // No need for notification, just silently return
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = observers.map(observer => analyzeHideOutcome(actionData, observer));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new HidePreviewDialog(actionData.actor, outcomes, changes, actionData);
    previewDialog.render(true);
}
