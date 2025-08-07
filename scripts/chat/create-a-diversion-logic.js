/**
 * Create a Diversion Action Logic
 * Handles the discovery and analysis of Create a Diversion action outcomes
 */

import { MODULE_TITLE } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { CreateADiversionPreviewDialog } from './create-a-diversion-preview-dialog.js';
import { determineOutcome, extractPerceptionDC, shouldFilterAlly } from './shared-utils.js';

/**
 * Discovers all tokens that can see the diverting token (potential targets for diversion)
 * @param {Token} divertingToken - The token performing Create a Diversion
 * @returns {Array} Array of observer tokens that can see the diverting token
 */
export function discoverDiversionObservers(divertingToken) {    
    if (!canvas.tokens) {
        console.warn(`${MODULE_TITLE}: Canvas tokens not available`);
        return [];
    }

    const observers = [];
    
    // Find all tokens that can currently see the diverting token
    for (const token of canvas.tokens.placeables) {
        // Skip the diverting token itself
        if (token.id === divertingToken.id) continue;
        
        // Skip tokens without actors
        if (!token.actor) continue;
        
        // Apply ally filtering if enabled
        if (shouldFilterAlly(divertingToken, token, 'enemies')) continue;
        
        // Check if this token can see the diverting token
        const visibility = getVisibilityBetween(token, divertingToken);
        
        // Only include tokens that can currently see the diverting token
        // (observed or concealed - they need to see you to be diverted)
        if (visibility === 'observed') {
            // Get the correct perception DC using the shared utility function
            const perceptionDC = extractPerceptionDC(token);
            observers.push({
                token: token,
                actor: token.actor,
                currentVisibility: visibility,
                perceptionDC: perceptionDC
            });
        } 
    }
    
    return observers;
}

/**
 * Analyzes the outcome of a Create a Diversion roll against observer Perception DCs
 * @param {Object} diversionData - The diversion action data (actor, roll, etc.)
 * @param {Object} observer - Observer data with token, actor, and DC
 * @returns {Object} Analysis result with visibility changes
 */
export function analyzeDiversionOutcome(diversionData, observer) {
    const { roll } = diversionData;
    const { token: observerToken, currentVisibility, perceptionDC } = observer;
    
    // Validate inputs
    if (!roll || typeof roll.total !== 'number') {
        console.warn(`${MODULE_TITLE}: Invalid roll data in analyzeDiversionOutcome:`, roll);
        return {
            observer: observerToken,
            currentVisibility: currentVisibility,
            newVisibility: currentVisibility,
            changed: false,
            outcome: 'failure',
            rollTotal: 0,
            dc: perceptionDC,
            margin: -perceptionDC
        };
    }
    
    const rollTotal = roll.total;
    // Ensure we're using the observer's unique perception DC
    const dc = perceptionDC;
    const margin = rollTotal - dc;
        
    // Get the die result for critical success/failure determination
    const dieResult = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total ?? 10;
    const outcome = determineOutcome(rollTotal, dieResult, dc);
    
    // Determine new visibility based on Create a Diversion rules
    let newVisibility = currentVisibility;
    let changed = false;
    
    switch (outcome) {
        case 'critical-success':
            // Critical Success: Observer becomes undetected (if they could see you)
            if (currentVisibility === 'observed') {
                newVisibility = 'hidden';
                changed = true;
            }
            break;
            
        case 'success':
            // Success: Observer becomes hidden (if they could see you)
            if (currentVisibility === 'observed') {
                newVisibility = 'hidden';
                changed = true;
            }
            break;
            
        case 'failure':
        case 'critical-failure':
            // Failure/Critical Failure: No change in visibility
            // Observer is aware you tried to create a diversion
            break;
    }
        
    return {
        observer: observerToken,
        currentVisibility: currentVisibility,
        newVisibility: newVisibility,
        changed: changed,
        outcome: outcome,
        rollTotal: rollTotal,
        dc: dc,
        margin: margin
    };
}

/**
 * Shows the Create a Diversion results preview dialog
 * @param {Object} diversionData - The diversion action data
 */
export async function previewDiversionResults(diversionData) {    
    // Validate diversionData
    if (!diversionData || !diversionData.actor || !diversionData.roll) {
        console.error(`${MODULE_TITLE}: Invalid diversionData provided to previewDiversionResults:`, diversionData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid diversion data - cannot preview results`);
        return;
    }
    
    // Discover all observers that can see the diverting token
    const observers = discoverDiversionObservers(diversionData.actor);
    
    if (observers.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: No tokens can see ${diversionData.actor.name} - no diversion needed`);
        return;
    }
    
    // Analyze outcomes for each observer
    const outcomes = observers.map(observer => analyzeDiversionOutcome(diversionData, observer));
    
    // Filter to only outcomes with changes
    const changes = outcomes.filter(outcome => outcome.changed);
    
    if (changes.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: Create a Diversion had no effect on visibility`);
        return;
    }
    
    // Create and show the preview dialog
    const dialog = new CreateADiversionPreviewDialog(
        diversionData.actor,
        outcomes,
        changes,
        diversionData
    );
    
    dialog.render(true);
}
