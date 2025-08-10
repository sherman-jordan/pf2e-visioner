/**
 * Consequences Logic
 * Handles logic for consequences from damage rolls by hidden/undetected tokens
 */

import { MODULE_TITLE } from '../constants.js';
import { getVisibilityMap } from '../utils.js';
import { ConsequencesPreviewDialog } from './consequences-preview-dialog.js';
import { shouldFilterAlly } from './shared-utils.js';

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
        
        // Always proceed to open the dialog, even with no potential targets, so the GM gets feedback
        
        // Get current visibility states for each target
        const outcomes = await Promise.all(potentialTargets.map(async (target) => {
            // IMPORTANT: For consequences dialog, we need to know how the TARGET sees the ATTACKER
            // This is the opposite direction from most other dialogs!
            const currentVisibility = await computeVisibilityBetween(target, attackingToken);
                        
            return {
                target,
                currentVisibility,
                overrideState: 'observed', // Default to observed for all targets
                hasActionableChange: true  // Always show action buttons
            };
        }));
                
        // Filter to include only tokens where the attacking token is hidden or undetected from them
        const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');
        let filteredOutcomes = enforceRAW
            ? outcomes.filter(outcome => outcome.currentVisibility === 'hidden' || outcome.currentVisibility === 'undetected')
            : outcomes;

        // Do NOT fall back to attacker global condition; rely solely on explicit per-observer visibility mapping

        // If enforcing RAW and there are no valid outcomes, notify and stop
        if (enforceRAW && filteredOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No valid Consequences targets found`);
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
export function findPotentialTargets(attackingToken) {
    // Get all tokens on the canvas (prefer placed tokens)
    const allTokens = (canvas?.tokens?.placeables || []);
    
    const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');

    // Filter out the attacking token and tokens without actors
    const results = allTokens.filter(token => {
        // Skip the attacking token itself
        if (token === attackingToken) return false;
        
        // Skip tokens without actors
        if (!token.actor) return false;
        
        // Only include character, npc, or hazard type tokens
        if (token.actor.type !== 'character' && token.actor.type !== 'npc' && token.actor.type !== 'hazard') return false;

        // Optionally filter allies based on module setting (defaults to include allies)
        if (enforceRAW && shouldFilterAlly(attackingToken, token, 'enemies')) return false;
        
        return true;
    });
    
    return results;
}

/**
 * Get visibility between two tokens - specifically how the observer sees the target
 * @param {Token} observerToken - The observer token (the one doing the seeing)
 * @param {Token} targetToken - The target token (the one being seen)
 * @returns {string} The visibility state
 */
export async function computeVisibilityBetween(observerToken, targetToken) {
    // First, consult the module's own per-token visibility map. If an explicit mapping exists,
    // always respect it (even when it's 'observed') and do not fall back to heuristics.
    try {
        const map = getVisibilityMap(observerToken) || {};
        const explicit = Object.prototype.hasOwnProperty.call(map, targetToken.document.id) ? map[targetToken.document.id] : undefined;
        if (explicit !== undefined) return explicit;
    } catch (_) {}
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
    
    // First check if the observer has any effects indicating the target is hidden/undetected
    const observerEffectResult = checkObserverEffects(observerToken, targetToken);
    if (observerEffectResult) {
        return observerEffectResult;
    }
    
    // Then check if the target has any direct effects indicating it's hidden/undetected from the observer
    const targetEffectResult = checkTargetEffects(targetToken, observerToken);
    if (targetEffectResult) {
        return targetEffectResult;
    }
    
    // Default to observed
    return 'observed';
}

/**
 * Quick check for a general condition on a token's actor
 * @param {Token} token
 * @param {string} slug
 * @returns {boolean}
 */
function hasCondition(token, slug) {
    try {
        const itemTypeConditions = token?.actor?.itemTypes?.condition || [];
        if (itemTypeConditions.some(c => c?.slug === slug)) return true;
        const legacy = token?.actor?.conditions?.conditions || [];
        if (legacy.some(c => c?.slug === slug)) return true;
    } catch (_) {}
    return false;
}
