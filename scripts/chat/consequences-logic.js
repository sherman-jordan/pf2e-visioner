/**
 * Consequences Logic
 * Handles logic for consequences from damage rolls by hidden/undetected tokens
 */

import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { ConsequencesPreviewDialog } from './consequences-preview-dialog.js';

/**
 * Preview consequences from damage rolls by hidden/undetected tokens
 * @param {Object} actionData - The action data
 */
export async function previewConsequencesResults(actionData) {
    try {        
        // Extract data
        const attackingToken = actionData.actor;
        const damageData = actionData.damageData || {};
        
        // Find all potential targets (tokens that should see the attacking token)
        const potentialTargets = findPotentialTargets(attackingToken);
        
        if (potentialTargets.length === 0) {
            // No need for notification, just silently return
            return;
        }
        
        // Get current visibility states for each target
        const outcomes = await Promise.all(potentialTargets.map(async (target) => {
            // IMPORTANT: For consequences dialog, we need to know how the TARGET sees the ATTACKER
            // This is the opposite direction from most other dialogs!
            const currentVisibility = await getVisibilityBetween(target, attackingToken);
                        
            return {
                target,
                currentVisibility,
                overrideState: 'observed', // Default to observed for all targets
                hasActionableChange: true  // Always show action buttons
            };
        }));
                
        // Filter to include only tokens where the attacking token is hidden or undetected from them
        const hiddenOrUndetectedOutcomes = outcomes.filter(outcome => {
            const isHiddenOrUndetected = outcome.currentVisibility === 'hidden' || outcome.currentVisibility === 'undetected';
            return isHiddenOrUndetected;
        });
                
        // Use the filtered outcomes
        const filteredOutcomes = hiddenOrUndetectedOutcomes;
        
        if (filteredOutcomes.length === 0) {
            // No need for notification, just silently return
            return;
        }
        
        // Create dialog
        const dialog = new ConsequencesPreviewDialog(
            attackingToken,
            filteredOutcomes,
            [], // No changes yet
            damageData
        );
        
        // Render dialog
        await dialog.render(true);
        
    } catch (error) {
        console.error(`${MODULE_TITLE}: Error preparing consequences preview:`, error);
        ui.notifications.error(`${MODULE_TITLE}: Failed to prepare consequences preview`);
    }
}

/**
 * Find potential targets for consequences
 * @param {Token} attackingToken - The attacking token
 * @returns {Array} Array of potential target tokens
 */
function findPotentialTargets(attackingToken) {
    // Get all tokens on the canvas
    const allTokens = canvas.tokens.placeables;
    
    // Filter out the attacking token and tokens without actors
    return allTokens.filter(token => {
        // Skip the attacking token itself
        if (token === attackingToken) return false;
        
        // Skip tokens without actors
        if (!token.actor) return false;
        
        // Only include character and npc type tokens
        if (token.actor.type !== 'character' && token.actor.type !== 'npc') return false;
        
        // Skip tokens with the same disposition as the attacking token
        if (token.document.disposition === attackingToken.document.disposition) return false;
        
        return true;
    });
}

/**
 * Get visibility between two tokens - specifically how the observer sees the target
 * @param {Token} observerToken - The observer token (the one doing the seeing)
 * @param {Token} targetToken - The target token (the one being seen)
 * @returns {string} The visibility state
 */
async function getVisibilityBetween(observerToken, targetToken) {
    
    // Try to use the module's API if available
    if (game.modules.get(MODULE_ID)?.api?.getVisibilityBetween) {
        const result = await game.modules.get(MODULE_ID).api.getVisibilityBetween(observerToken, targetToken);
        return result;
    }
    
    // IMPORTANT: For consequences dialog, we need to check if the observer has any effects
    // that indicate the target is hidden or undetected from them
    
    // Check for "hidden-from" or "undetected-from" effects on the observer
    const checkObserverEffects = (observer, target) => {
        if (!observer || !observer.actor) return null;
                
        const actor = observer.actor;
        
        // Check for effects that indicate target is hidden/undetected from observer
        if (actor.effects) {
            const effects = actor.effects?.contents || [];
            for (const effect of effects) {
                const effectName = effect.name?.toLowerCase() || '';
                const effectFlags = effect.flags || {};
                const effectOrigin = effectFlags.origin || '';
                                
                // Check for effects that indicate the target is hidden/undetected from this observer
                if ((effectName.includes('hidden from') || effectName.includes('hidden')) && 
                    (effectOrigin.includes(target.id) || effectName.includes(target.name.toLowerCase()))) {
                    return 'hidden';
                }
                
                if ((effectName.includes('undetected from') || effectName.includes('undetected')) && 
                    (effectOrigin.includes(target.id) || effectName.includes(target.name.toLowerCase()))) {
                    return 'undetected';
                }
            }
        }
        
        // Check roll options on the observer
        if (actor.getRollOptions) {
            const rollOptions = actor.getRollOptions();
            
            // Look for options that indicate the target is hidden/undetected from this observer
            for (const option of rollOptions) {
                // Check for options like "target:hidden" or "target:hidden-from:X" where X is related to the target
                if ((option.includes('target:hidden') || option.includes('hidden-from')) && 
                    (option.includes(target.id) || option.includes(target.name.toLowerCase()))) {
                    return 'hidden';
                }
                
                if ((option.includes('target:undetected') || option.includes('undetected-from')) && 
                    (option.includes(target.id) || option.includes(target.name.toLowerCase()))) {
                    return 'undetected';
                }
            }
        }
        
        return null;
    };
    
    // Check for effects on the target that indicate it is hidden/undetected from the observer
    const checkTargetEffects = (target, observer) => {
        if (!target || !target.actor) return null;
                
        const actor = target.actor;
        
        // Check for "hidden-to" or "undetected-to" effects on the target
        if (actor.effects) {
            const effects = actor.effects?.contents || [];
            for (const effect of effects) {
                const effectName = effect.name?.toLowerCase() || '';
                const effectFlags = effect.flags || {};
                const effectOrigin = effectFlags.origin || '';
                                
                // Check for effects that indicate the target is hidden/undetected to this observer
                if ((effectName.includes('hidden to') || effectName.includes('hidden from')) && 
                    (effectOrigin.includes(observer.id) || effectName.includes(observer.name.toLowerCase()))) {
                    return 'hidden';
                }
                
                if ((effectName.includes('undetected to') || effectName.includes('undetected from')) && 
                    (effectOrigin.includes(observer.id) || effectName.includes(observer.name.toLowerCase()))) {
                    return 'undetected';
                }
            }
        }
        
        // Check roll options on the target
        if (actor.getRollOptions) {
            const rollOptions = actor.getRollOptions();
            
            for (const option of rollOptions) {
                // Check for options like "self:hidden" or "self:hidden-to:X" where X is related to the observer
                if ((option.includes('self:hidden') || option.includes('hidden-to')) && 
                    (option.includes(observer.id) || option.includes(observer.name.toLowerCase()))) {
                    return 'hidden';
                }
                
                if ((option.includes('self:undetected') || option.includes('undetected-to')) && 
                    (option.includes(observer.id) || option.includes(observer.name.toLowerCase()))) {
                    return 'undetected';
                }
            }
        }
        
        return null;
    };
    
    // Check if the target has general hidden/undetected condition
    const checkTargetConditions = (target) => {
        if (!target || !target.actor) return null;
                
        // Check for conditions using itemTypes.condition (more reliable)
        if (target.actor.itemTypes?.condition) {
            const conditions = target.actor.itemTypes.condition || [];
            
            // Check for undetected condition
            if (conditions.some(c => c.slug === 'undetected')) {
                return 'undetected';
            }
            
            // Check for hidden condition
            if (conditions.some(c => c.slug === 'hidden')) {
                return 'hidden';
            }
            
            // Check for concealed condition
            if (conditions.some(c => c.slug === 'concealed')) {
                return 'concealed';
            }
        }
        
        // Fallback to checking conditions through conditions property
        if (target.actor.conditions?.conditions) {
            const conditions = target.actor.conditions.conditions || [];
            
            // Check for undetected condition
            if (conditions.some(c => c.slug === 'undetected')) {
                return 'undetected';
            }
            
            // Check for hidden condition
            if (conditions.some(c => c.slug === 'hidden')) {
                return 'hidden';
            }
            
            // Check for concealed condition
            if (conditions.some(c => c.slug === 'concealed')) {
                return 'concealed';
            }
        }
        
        return null;
    };
    
    // First check if the observer has any effects indicating the target is hidden/undetected
    const observerEffectResult = checkObserverEffects(observerToken, targetToken);
    if (observerEffectResult) {
        return observerEffectResult;
    }
    
    // Then check if the target has any effects indicating it's hidden/undetected from the observer
    const targetEffectResult = checkTargetEffects(targetToken, observerToken);
    if (targetEffectResult) {
        return targetEffectResult;
    }
    
    // Finally, check if the target has general hidden/undetected condition
    const targetConditionResult = checkTargetConditions(targetToken);
    if (targetConditionResult) {
        return targetConditionResult;
    }
    
    // Default to observed
    return 'observed';
}
