/**
 * Point Out action logic and automation
 * Handles Point Out-specific calculations, ally discovery, and result processing
 */

import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { 
    calculateTokenDistance, 
    hasActiveEncounter, 
    isTokenInEncounter,
    extractStealthDC
} from './shared-utils.js';
import { PointOutPreviewDialog } from './point-out-preview-dialog.js';

/**
 * Get the actual target from Point Out action data
 * @param {Object} actionData - The Point Out action data
 * @returns {Token|null} The targeted token, or null if none found
 */
export function getPointOutTarget(actionData) {
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
export function findBestPointOutTarget(pointerToken) {
    const potentialTargets = canvas.tokens.placeables.filter(token => {
        // Skip self and allies
        if (token === pointerToken || token.actor?.alliance === pointerToken.actor?.alliance) return false;
        
        // Must be an NPC or character
        if (token.actor?.type !== 'npc' && token.actor?.type !== 'character') return false;
        
        // Pointer must be able to see the target (can't point out what you can't see)
        const pointerVisibility = getVisibilityBetween(pointerToken, token);
        if (pointerVisibility === 'undetected') return false;
        
        // Check if any allies can't see this target
        const allies = canvas.tokens.placeables.filter(ally => {
            return ally !== pointerToken && 
                   ally.actor?.alliance === pointerToken.actor?.alliance &&
                   ally.actor?.type === 'character';
        });
        
        // Target is good if at least one ally can't see it
        return allies.some(ally => {
            const allyVisibility = getVisibilityBetween(ally, token);
            return allyVisibility === 'undetected';
        });
    });
    
    if (potentialTargets.length === 0) return null;
    
    // Sort by distance and return closest
    potentialTargets.sort((a, b) => {
        const distA = calculateTokenDistance(pointerToken, a);
        const distB = calculateTokenDistance(pointerToken, b);
        return distA - distB;
    });
    
    return potentialTargets[0];
}

/**
 * Find allies who can't see the specified target and will benefit from Point Out
 * @param {Token} pointerToken - The token performing the Point Out
 * @param {Token} targetToken - The specific token being pointed out
 * @param {boolean} encounterOnly - Whether to filter to encounter tokens only
 * @returns {Array} Array of ally data who can't see the target
 */
export function discoverPointOutAllies(pointerToken, targetToken, encounterOnly = false) {
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
export function discoverPointOutTargets(pointerToken, targetToken = null, encounterOnly = false) {
    // If no specific target provided, find the best one
    if (!targetToken) {
        targetToken = findBestPointOutTarget(pointerToken);
        if (!targetToken) return [];
    }
    
    // Get allies who can't see the target
    const allies = discoverPointOutAllies(pointerToken, targetToken, encounterOnly);
    return allies.map(ally => ally.token);
}

/**
 * Analyze Point Out outcome following official PF2e rules
 * Point Out makes undetected creatures hidden to specific allies
 * @param {Object} actionData - The Point Out action data
 * @param {Object} allyData - Data about the ally who can't see the target
 * @returns {Object} Detailed outcome analysis
 */
export function analyzePointOutOutcome(actionData, allyData) {
    
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
 * Preview Point Out results without applying changes
 * Shows a dialog with potential outcomes
 * @param {Object} actionData - The Point Out action data
 */
export async function previewPointOutResults(actionData) {
    console.log(`${MODULE_TITLE}: previewPointOutResults called with:`, actionData);
    
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
    previewDialog.render(true);
}
