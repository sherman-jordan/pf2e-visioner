/**
 * Off-Guard Condition Handler
 * Handles applying off-guard conditions when attackers are hidden/undetected
 */

import { MODULE_ID } from './constants.js';
import { getVisibilityMap } from './utils.js';

/**
 * Initialize off-guard automation using libWrapper and hooks
 */
export function initializeOffGuardHandling() {
  // Use libWrapper to modify Check.roll for attack rolls
  if (typeof libWrapper === 'function') {
    if (game.pf2e?.Check?.roll) {
      libWrapper.register(MODULE_ID, 'game.pf2e.Check.roll', handleCheckRoll, 'WRAPPER');
    } else {
      // Try again when PF2E is fully loaded
      Hooks.once('pf2e.systemReady', () => {
        if (game.pf2e?.Check?.roll) {
          libWrapper.register(MODULE_ID, 'game.pf2e.Check.roll', handleCheckRoll, 'WRAPPER');
        }
      });
    }
  }
  
  // Hook into chat message creation to handle off-guard condition application
  Hooks.on('preCreateChatMessage', handleChatMessage);
  
  // Try to wrap DamagePF2e.roll directly, with fallback to chat message hook
  try {
    if (game.pf2e?.DamagePF2e?.roll) {
      libWrapper.register('pf2e-visioner', 'game.pf2e.DamagePF2e.roll', handleDamageRoll, 'WRAPPER');
    }
  } catch (error) {
    // Fallback to chat message hook
  }
  
  // Add cleanup hooks
  Hooks.on('deleteCombat', cleanupCombatEndStates);
}

/**
 * Clean up stored attack data for rerolls to prevent duplicate conditions
 * @param {string} attackerActorId - The ID of the attacking actor
 */
function clearStoredAttackData(attackerActorId) {
    const offGuardAttacks = game.modules.get('pf2e-visioner')?.offGuardAttacks;
    if (offGuardAttacks) {
        offGuardAttacks.delete(attackerActorId);
    }
}

/** 
 * Handle Check.roll wrapper to add off-guard conditions for hidden/undetected targets
 * @param {Function} wrapped - The original Check.roll function
 * @param {...any} args - The function arguments
 */
function handleCheckRoll(wrapped, ...args) {
    const context = args[1];
    if (!context) {
        return wrapped(...args);
    }
    
    if (Array.isArray(context.options)) context.options = new Set(context.options);

    const {
        actor,
        createMessage = "true",
        type,
        token,
        target,
        isReroll,
        viewOnly,
    } = context;
    
    const originToken = (token ?? actor?.getActiveTokens()?.[0])?.object;
    const targetToken = target?.token?.object;

    if (
        viewOnly ||
        !createMessage ||
        !originToken ||
        actor?.isOfType("hazard") ||
        !["attack-roll", "spell-attack-roll"].includes(type)
    ) {
        return wrapped(...args);
    }

    // Handle rerolls: clear stored attack data to prevent duplicate conditions
    if (isReroll && originToken?.actor) {
        clearStoredAttackData(originToken.actor.id);
    }

    const targetActor = targetToken?.actor;
    
    if (targetActor) {
        // Check if attacker is hidden/undetected from target's perspective
        const targetVisibilityMap = getVisibilityMap(targetToken);
        const attackerVisibilityFromTarget = targetVisibilityMap[originToken.document.id];
        
        if (["hidden", "undetected"].includes(attackerVisibilityFromTarget)) {
            // Add roll options for off-guard (needed for sneak attack and other features)
            context.options.add('target:condition:off-guard');
            
            // Create off-guard condition with visibility context
            const condition = game.pf2e.ConditionManager.getCondition("off-guard");
            const conditionSource = condition.toObject();
            conditionSource.name += ` (${game.i18n.localize(`PF2E.condition.${attackerVisibilityFromTarget}.name`)})`;
            
            // Clone target actor with off-guard condition for attack roll AC penalty
            const items = foundry.utils.deepClone(targetActor._source.items);
            items.push(conditionSource);
            
            const originalTargetActor = targetActor;
            target.actor = targetActor.clone({ items }, { keepId: true });
            
            // Update DC statistics for cloned actor
            const dc = context.dc;
            if (dc?.slug) {
                const statistic = target.actor.getStatistic(dc.slug)?.dc;
                if (statistic) {
                    dc.value = statistic.value;
                    dc.statistic = statistic;
                }
            }
            
            // Store attack data for later condition application to original target
            const attackData = {
                attackerActorId: originToken.actor.id,
                targetId: targetToken.document.id,
                originalTargetActor: originalTargetActor,
                clonedTargetActor: target.actor,
                visibility: attackerVisibilityFromTarget,
                conditionSource: conditionSource,
                conditionName: conditionSource.name,
                timestamp: Date.now()
            };
            
            if (!game.modules.get('pf2e-visioner').offGuardAttacks) {
                game.modules.get('pf2e-visioner').offGuardAttacks = new Map();
            }
            
            game.modules.get('pf2e-visioner').offGuardAttacks.set(originToken.actor.id, attackData);
        }
    }

    return wrapped(...args);
}

/**
 * Handle damage roll to inject off-guard options
 */
function handleDamageRoll(wrapped, ...args) {
    // Check if there's stored off-guard attack data
    const offGuardAttacks = game.modules.get("pf2e-visioner")?.offGuardAttacks;
    if (!offGuardAttacks || offGuardAttacks.size === 0) {
        return wrapped(...args);
    }
    
    // Try to find the context in the arguments
    let context = null;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] && typeof args[i] === 'object' && args[i].options) {
            context = args[i];
            break;
        }
    }
    
    if (!context) {
        return wrapped(...args);
    }
    
    // Check if this damage roll is from an actor with stored off-guard data
    for (const [actorId, attackData] of offGuardAttacks.entries()) {
        // Add off-guard options to the damage roll context
        if (Array.isArray(context.options)) {
            context.options = new Set(context.options);
        }
        
        context.options.add("target:condition:off-guard");
        
        // Clean up the stored attack data
        offGuardAttacks.delete(actorId);
        break;
    }
    
    return wrapped(...args);
}

/**
 * Handle chat messages to apply off-guard conditions for attack and damage rolls
 */
function handleChatMessage(data) {
    const flags = data?.flags?.pf2e;
    if (!flags?.context) return;
    
    const contextType = flags.context.type;
    if (contextType === "attack-roll" || contextType === "spell-attack-roll") {
        // Apply off-guard condition to original target actor for damage roll processing
        const origin = flags.origin;
        if (origin?.actor) {
            const actorId = origin.actor.replace("Actor.", "");
            const offGuardAttacks = game.modules.get("pf2e-visioner")?.offGuardAttacks;
            
            if (offGuardAttacks?.has(actorId)) {
                const attackData = offGuardAttacks.get(actorId);
                const originalTargetActor = attackData.originalTargetActor;
                
                // Check if condition already exists to prevent duplicates
                const existingCondition = originalTargetActor.itemTypes.condition.find(c => 
                    c.slug === 'off-guard' && c.name === attackData.conditionName
                );
                
                // Only apply condition if it doesn't already exist
                if (!existingCondition) {
                    originalTargetActor.createEmbeddedDocuments("Item", [attackData.conditionSource]);
                }
            }
        }
    } else if (contextType === "damage-roll") {
        // Handle damage roll completion and cleanup
        handleDamageRollCompletion(data);
    }
}

/**
 * Handle damage roll completion and clean up temporary off-guard conditions
 */
function handleDamageRollCompletion(data) {
    const flags = data.flags?.pf2e;
    if (!flags) return;
    
    // Check if this damage roll is from an off-guard attack
    const origin = flags.origin;
    if (origin?.actor) {
        const actorId = origin.actor.replace("Actor.", "");
        const offGuardAttacks = game.modules.get("pf2e-visioner")?.offGuardAttacks;
        
        if (offGuardAttacks?.has(actorId)) {
            const attackData = offGuardAttacks.get(actorId);
            
            // Remove the temporary off-guard condition from target actor
            const originalTargetActor = attackData.originalTargetActor;
            if (originalTargetActor) {
                // Schedule removal after a delay to ensure damage roll is fully processed
                setTimeout(() => {
                    const offGuardCondition = originalTargetActor.itemTypes.condition.find(c => 
                        c.slug === 'off-guard' && c.name === attackData.conditionName
                    );
                    if (offGuardCondition) {
                        offGuardCondition.delete();
                    }
                }, 2000); // 2 second delay to ensure damage processing completes
            }
            
            // Ensure damage roll has off-guard options as backup
            if (!flags.options) flags.options = [];
            if (!flags.options.includes("target:condition:off-guard")) {
                flags.options.push("target:condition:off-guard");
            }
            
            // Clean up the stored attack data
            offGuardAttacks.delete(actorId);
        }
    }
}

/**
 * Clean up stored off-guard attack data when combat ends
 */
function cleanupCombatEndStates() {
  try {
    const offGuardAttacks = game.modules.get('pf2e-visioner')?.offGuardAttacks;
    if (offGuardAttacks) {
      offGuardAttacks.clear();
    }
  } catch (error) {
    // Silent cleanup failure
  }
}