/**
 * Hide action logic and automation
 * Handles Hide-specific calculations, target discovery, and result processing
 */

import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { 
    extractStealthDC, 
    calculateTokenDistance, 
    hasActiveEncounter, 
    isTokenInEncounter,
    determineOutcome
} from './shared-utils.js';
import { HidePreviewDialog } from './hide-preview-dialog.js';

/**
 * Discover valid Hide observers (tokens that can see the hiding token)
 * @param {Token} hidingToken - The token performing the Hide
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of observer objects with token, DC, and visibility data
 */
export function discoverHideObservers(hidingToken, encounterOnly = false) {
    if (!hidingToken) return [];
    
    const observers = [];
    
    // Find all tokens that can currently see the hiding token
    for (const token of canvas.tokens.placeables) {
        if (token === hidingToken) continue;
        if (!token.actor) {
            continue;
        }
        
        // Check encounter filtering if requested
        if (encounterOnly && !isTokenInEncounter(token)) {
            continue;
        }
        
        // Check current visibility state - Hide only affects tokens that can currently see you
        const currentVisibility = getVisibilityBetween(token, hidingToken);
        
        // For Hide, we need to find tokens that can see the hiding token as observed or concealed
        // If no explicit visibility flag is set, we should assume they can see the token (default observed)
        // Only skip if explicitly set to hidden or undetected
        if (currentVisibility === 'hidden' || currentVisibility === 'undetected') {         
            continue;
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
 * Extract Perception DC from token using modern PF2e patterns
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Perception DC or 0 if not found
 */
export function extractPerceptionDC(token) {
    if (!token.actor) return 0;
    
    const actor = token.actor;
    
    // Method 1: Try standard perception skill DC (for PCs)
    const perceptionSkill = actor.skills?.perception;
    if (perceptionSkill?.dc?.value) {
        return perceptionSkill.dc.value;
    }
    
    // Method 2: Try perception modifier + 10 (standard DC calculation)
    if (perceptionSkill?.modifier !== undefined) {
        return perceptionSkill.modifier + 10;
    }
    
    // Method 3: Try system perception data (for NPCs)
    if (actor.system?.perception?.dc?.value) {
        return actor.system.perception.dc.value;
    }
    
    // Method 4: Try perception modifier from system + 10
    if (actor.system?.perception?.mod !== undefined) {
        return actor.system.perception.mod + 10;
    }
    
    // Method 5: Try attributes.perception (alternative structure)
    if (actor.system?.attributes?.perception?.dc) {
        return actor.system.attributes.perception.dc;
    }
    
    // Method 6: Calculate from level if nothing else works (fallback for NPCs)
    if (actor.system?.details?.level?.value !== undefined) {
        const level = actor.system.details.level.value;
        return 10 + level; // Basic DC calculation
    }
    
    return 0;
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
    
    const observers = discoverHideObservers(actionData.actor);
    
    if (observers.length === 0) {
        ui.notifications.info(`${MODULE_TITLE}: No observers found for ${actionData.actor.name} to hide from`);
        return;
    }
    
    // Analyze all potential outcomes
    const outcomes = observers.map(observer => analyzeHideOutcome(actionData, observer));
    const changes = outcomes.filter(outcome => outcome.changed);
    
    // Create and show ApplicationV2-based preview dialog
    const previewDialog = new HidePreviewDialog(actionData.actor, outcomes, changes, actionData);
    previewDialog.render(true);
}
