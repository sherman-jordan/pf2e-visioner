import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { getVisibilityBetween, isTokenInEncounter, hasActiveEncounter } from '../utils.js';
import { determineOutcome, shouldFilterAlly } from './shared-utils.js';
import { SneakPreviewDialog } from './sneak-preview-dialog.js';

/**
 * Discovers tokens that can potentially see the sneaking token
 * @param {Token} sneakingToken - The token performing the sneak action
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of observer data objects
 */
export function discoverSneakObservers(sneakingToken, encounterOnly = false) {
    if (!sneakingToken) {
        console.warn(`${MODULE_TITLE}: No sneaking token provided to discoverSneakObservers`);
        return [];
    }

    const observers = [];
    const allTokens = canvas.tokens.placeables;

    for (const token of allTokens) {
        // Skip the sneaking token itself
        if (token.id === sneakingToken.id) continue;

        // Skip if token has no actor
        if (!token.actor) continue;
        
        // Apply ally filtering if enabled
        if (shouldFilterAlly(sneakingToken, token, 'enemies')) continue;

        // Apply encounter filtering if requested
        if (encounterOnly && hasActiveEncounter() && !isTokenInEncounter(token)) {
            continue;
        }

        // Get current visibility - how this observer sees the sneaking token
        const currentVisibility = getVisibilityBetween(token, sneakingToken);
        
        // Only include tokens that the sneaking token is currently hidden or undetected from
        // Sneak action is used to maintain or improve stealth against these tokens
        if (!['hidden', 'undetected'].includes(currentVisibility)) {
            continue;
        }

        // Get the observer's Perception DC - using robust path checking for different PF2e versions
        const perceptionDC = token.actor?.system?.perception?.dc?.value || 
                           token.actor?.system?.perception?.dc ||
                           token.actor?.system?.attributes?.perception?.dc || 
                           token.actor?.data?.data?.perception?.dc?.value || 
                           token.actor?.data?.data?.attributes?.perception?.dc || 
                           Math.floor(10 + token.actor?.system?.abilities?.wis?.mod || 0);
        
        observers.push({
            token: token,
            currentVisibility: currentVisibility,
            perceptionDC: perceptionDC
        });
    }

    return observers;
}

/**
 * Analyzes the outcome of a sneak action for a specific observer
 * @param {Object} sneakData - The sneak action data
 * @param {Object} observer - Observer data object
 * @returns {Object} Analysis result
 */
export function analyzeSneakOutcome(sneakData, observer) {
    if (!sneakData || !observer) {
        console.warn(`${MODULE_TITLE}: Invalid data provided to analyzeSneakOutcome`);
        return null;
    }

    const roll = sneakData.roll;
    const dc = observer.perceptionDC;
    const margin = roll.total - dc;
    
    // Get the die result for natural 20/1 determination
    const dieResult = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total ?? 10;
    const outcome = determineOutcome(roll.total, dieResult, dc);

    // Determine new visibility based on Sneak rules
    let newVisibility = observer.currentVisibility;
    let changed = false;

    switch (outcome) {
        case 'critical-success':
        case 'success':
            // Success: You remain undetected by the creature
            if (observer.currentVisibility !== 'undetected') {
                newVisibility = 'undetected';
                changed = true;
            }
            break;
        case 'failure':
            // Failure: You're hidden from the creature
            if (observer.currentVisibility === 'observed' || observer.currentVisibility === 'concealed') {
                newVisibility = 'hidden';
                changed = true;
            }
            // If already hidden or undetected, remain hidden
            else if (observer.currentVisibility === 'undetected') {
                newVisibility = 'hidden';
                changed = true;
            }
            break;
        case 'critical-failure':
            // Critical Failure: You're observed by the creature
            if (observer.currentVisibility !== 'observed') {
                newVisibility = 'observed';
                changed = true;
            }
            break;
    }

    return {
        token: observer.token,
        oldVisibility: observer.currentVisibility,
        newVisibility: newVisibility,
        outcome: outcome,
        rollTotal: roll.total,
        dc: dc,
        margin: margin,
        changed: changed,
        isSneak: true
    };
}

/**
 * Shows the sneak results preview dialog
 * @param {Object} sneakData - The sneak action data
 */
export async function previewSneakResults(sneakData) {

    // Validate sneakData
    if (!sneakData || !sneakData.actor || !sneakData.roll) {
        console.error('Invalid sneakData provided to previewSneakResults:', sneakData);
        ui.notifications.error(`${MODULE_TITLE}: Invalid sneak data - cannot preview results`);
        return;
    }

    // Discover potential observers
    const observers = discoverSneakObservers(sneakData.actor, false);
    
    if (observers.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: No observers found for sneak action`);
        return;
    }

    // Analyze outcomes for each observer
    const outcomes = observers.map(observer => analyzeSneakOutcome(sneakData, observer))
                              .filter(outcome => outcome !== null);

    if (outcomes.length === 0) {
        ui.notifications.warn(`${MODULE_TITLE}: No valid sneak outcomes to display`);
        return;
    }

    // Filter to only outcomes with changes
    const changes = outcomes.filter(outcome => outcome.changed);

    // Create and show the dialog
    const dialog = new SneakPreviewDialog(sneakData.actor, outcomes, changes, sneakData);
    dialog.render(true);
}
