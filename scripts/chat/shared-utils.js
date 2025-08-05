/**
 * Shared utilities for chat automation
 * Common functions used by both Seek and Point Out logic
 */

import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { getVisibilityBetween, setVisibilityMap, getVisibilityMap } from '../utils.js';
import { updateTokenVisuals } from '../visual-effects.js';
import { updateEphemeralEffectsForVisibility } from '../off-guard-ephemeral.js';

/**
 * Validate if a token is a valid Seek target
 * @param {Token} token - Potential target token
 * @param {Token} seeker - The seeking token
 * @returns {boolean} Whether the token is a valid target
 */
export function isValidSeekTarget(token, seeker) {
    if (!token || !seeker || token === seeker) return false;
    if (token.actor?.type !== 'npc' && token.actor?.type !== 'character') return false;
    if (token.actor?.alliance === seeker.actor?.alliance) return false;
    return true;
}

/**
 * Extract Stealth DC from token using modern PF2e patterns
 * @param {Token} token - The token to extract DC from
 * @returns {number} The Stealth DC or 0 if not found
 */
export function extractStealthDC(token) {
    // Try to get from actor's stealth skill
    const stealthSkill = token.actor?.skills?.stealth;
    return stealthSkill?.dc?.value || 0;
}

/**
 * Calculate distance between tokens for sorting
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} Distance in grid units
 */
export function calculateTokenDistance(token1, token2) {
    const dx = token1.x - token2.x;
    const dy = token1.y - token2.y;
    return Math.sqrt(dx * dx + dy * dy) / canvas.grid.size;
}

/**
 * Check if there's an active encounter
 * @returns {boolean} True if there's an active encounter with combatants
 */
export function hasActiveEncounter() {
    return game.combat?.started && game.combat?.combatants?.size > 0;
}

/**
 * Check if a token is in the current encounter
 * @param {Token} token - The token to check
 * @returns {boolean} True if the token is in the encounter
 */
export function isTokenInEncounter(token) {
    if (!hasActiveEncounter()) return false;
    
    const combatant = game.combat.combatants.find(c => c.tokenId === token.id);
    return !!combatant;
}

/**
 * Modern degree of success determination with natural 20/1 handling
 * @param {number} total - Roll total
 * @param {number} die - Natural die result
 * @param {number} dc - Difficulty class
 * @returns {string} Outcome string
 */
export function determineOutcome(total, die, dc) {
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
 * Apply visibility changes atomically with error handling
 * @param {Token} seeker - The seeking token
 * @param {Array} changes - Array of change objects
 */
export function applyVisibilityChanges(seeker, changes) {
    if (!changes || changes.length === 0) return;
    
    try {
        // Get current visibility map
        const visibilityMap = getVisibilityMap(seeker);
        
        // Apply all changes
        changes.forEach(change => {
            if (change.target && change.newVisibility) {
                visibilityMap[change.target.id] = change.newVisibility;
                
                // Apply ephemeral effects if needed
                updateEphemeralEffectsForVisibility(seeker, change.target, change.newVisibility);
            }
        });
        
        // Update the visibility map
        setVisibilityMap(seeker, visibilityMap);
        
        // Update visual effects for all affected tokens
        updateTokenVisuals(seeker);
        changes.forEach(change => {
            if (change.target) {
                updateTokenVisuals(change.target);
            }
        });
        
        // Notify success
        const changeCount = changes.length;
        ui.notifications.info(`${MODULE_TITLE}: Applied visibility changes to ${changeCount} token${changeCount !== 1 ? 's' : ''}`);
        
    } catch (error) {
        console.error(`${MODULE_TITLE}: Error applying visibility changes:`, error);
        ui.notifications.error(`${MODULE_TITLE}: Failed to apply visibility changes - ${error.message}`);
    }
}

/**
 * Mark automation panel as complete
 * @param {jQuery} panel - The automation panel
 * @param {Array} changes - Applied changes
 */
export function markPanelComplete(panel, changes) {
    if (!panel || !panel.length) return;
    
    try {
        // Update panel appearance
        panel.addClass('completed');
        
        // Update button text and disable
        const button = panel.find('.preview-results');
        if (button.length) {
            button.prop('disabled', true)
                  .html('<i class="fas fa-check"></i> Changes Applied')
                  .removeClass('visioner-btn-primary')
                  .addClass('visioner-btn-success');
        }
        
        // Add completion message
        const completionMsg = `
            <div class="automation-completion">
                <i class="fas fa-check-circle"></i>
                <span>Applied ${changes.length} visibility change${changes.length !== 1 ? 's' : ''}</span>
            </div>
        `;
        
        panel.find('.automation-actions').after(completionMsg);
        
    } catch (error) {
        console.error(`${MODULE_TITLE}: Error marking panel complete:`, error);
    }
}

/**
 * Filter outcomes based on encounter filter setting
 * @param {Array} outcomes - Array of outcomes to filter
 * @param {boolean} encounterOnly - Whether to filter for encounter only
 * @param {string} tokenProperty - The property name to check for token (e.g., 'target', 'token')
 * @returns {Array} Filtered outcomes
 */
export function filterOutcomesByEncounter(outcomes, encounterOnly, tokenProperty = 'target') {
    if (!encounterOnly || !hasActiveEncounter()) {
        return outcomes;
    }
    
    return outcomes.filter(outcome => {
        const token = outcome[tokenProperty];
        return isTokenInEncounter(token);
    });
}
