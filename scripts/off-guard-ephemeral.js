/**
 * Off-Guard Condition Handler using EphemeralEffect Rule Elements
 * This is a cleaner approach that uses PF2e's native EphemeralEffect system
 */

import { MODULE_ID } from './constants.js';
import { getVisibilityMap } from './utils.js';

/**
 * Initialize off-guard automation using EphemeralEffect Rule Elements
 */
export function initializeEphemeralOffGuardHandling() {
  // Use libWrapper to modify Check.roll for attack rolls
  if (typeof libWrapper === 'function') {
    if (game.pf2e?.Check?.roll) {
      libWrapper.register(MODULE_ID, 'game.pf2e.Check.roll', handleCheckRollEphemeral, 'WRAPPER');

    } else {
      // Try again when PF2E is fully loaded
      Hooks.once('pf2e.systemReady', () => {
        if (game.pf2e?.Check?.roll) {
          libWrapper.register(MODULE_ID, 'game.pf2e.Check.roll', handleCheckRollEphemeral, 'WRAPPER');

        }
      });
    }
  } else {
    console.warn('PF2E Visioner: libWrapper not found, ephemeral off-guard effects will not work');
  }
  
  // Clean up ephemeral effects when combat ends
  Hooks.on('deleteCombat', cleanupEphemeralEffects);
}

/**
 * Handle Check.roll wrapper to add ephemeral off-guard effects for hidden/undetected targets
 * @param {Function} wrapped - The original Check.roll function
 * @param {...any} args - The function arguments
 */
async function handleCheckRollEphemeral(wrapped, ...args) {
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

    const targetActor = targetToken?.actor;
    
    if (targetActor && originToken?.actor) {
        // Check if target is hidden/undetected from attacker's perspective
        const attackerVisibilityMap = getVisibilityMap(originToken);
        const targetVisibilityFromAttacker = attackerVisibilityMap[targetToken.document.id];
        

        
        if (["hidden", "undetected"].includes(targetVisibilityFromAttacker)) {
            // Create or update ephemeral effect on the attacker (who becomes off-guard)
            await createEphemeralOffGuardEffect(originToken.actor, targetActor, targetVisibilityFromAttacker);
        } else {

        }
    } else {

    }
    
    return wrapped(...args);
}

/**
 * Create an ephemeral effect that makes the observer off-guard when attacking a hidden target
 * @param {Actor} observerActor - The observing actor (who gets the off-guard effect)
 * @param {Actor} hiddenActor - The hidden actor (who the observer is off-guard to)
 * @param {string} visibilityState - The visibility state ('hidden' or 'undetected')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
async function createEphemeralOffGuardEffect(observerActor, hiddenActor, visibilityState, options = {}) {

    
    // Check if effect already exists to prevent duplicates
    const existingEffect = observerActor.itemTypes.effect.find(e => 
        (e.name === 'Hidden' || e.name === 'Undetected' || e.name === 'Concealed') && 
        e.system.rules?.[0]?.predicate?.includes(`target:signature:${hiddenActor.signature}`)
    );
    
    if (existingEffect) {

        return; // Effect already exists for this target
    }

    const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
    
    const ephemeralEffect = {
        name: `${visibilityLabel}`,
        type: 'effect',
        system: {
            description: {
                value: `<p>Target is off-guard due to attacker being ${visibilityState}.</p>`,
                gm: ''
            },
            publication: {
                title: '',
                authors: '',
                license: 'OGL',
                remaster: false
            },
            rules: [
                {
                    key: 'EphemeralEffect',
                    predicate: [`target:signature:${hiddenActor.signature}`],
                    selectors: [
                        'strike-attack-roll',
                        'spell-attack-roll',
                        'strike-damage',
                        'attack-spell-damage'
                    ],
                    uuid: 'Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg' // Off-Guard condition
                }
            ],
            slug: null,
            traits: {
                otherTags: [],
                value: []
            },
            level: {
                value: 1
            },
            duration: options.durationRounds >= 0 ? {
                "value": options.durationRounds,
                "unit": "rounds",
                "expiry": "turn-end",
                "sustained": false
            } : {
                "value": -1,
                "unit": "unlimited",
                "expiry": null,
                "sustained": false
            },
            tokenIcon: {
                show: false
            },
            unidentified: true,
            start: {
                value: 0,
                initiative: options.initiative 
                ? game.combat?.getCombatantByToken(observerActor.id)?.initiative 
                : null
            },
            badge: null,
            fromSpell: false,
            context: {
                origin: {
                    actor: observerActor.uuid,
                    token: observerActor.getActiveTokens()?.[0]?.uuid,
                    item: null,
                    spellcasting: null
                },
                target: {
                    actor: hiddenActor.uuid,
                    token: hiddenActor.getActiveTokens()?.[0]?.uuid
                },
                roll: null
            }
        },
        img: `systems/pf2e/icons/conditions/${visibilityState}.webp`,
        flags: {
            [MODULE_ID]: {
                isEphemeralOffGuard: true,
                hiddenActorSignature: hiddenActor.signature,
                visibilityState: visibilityState
            }
        }
    };

    try {
        await observerActor.createEmbeddedDocuments("Item", [ephemeralEffect]);

    } catch (error) {
        console.error('Failed to create ephemeral off-guard effect:', error);
    }
}

/**
 * Clean up all ephemeral off-guard effects from all actors
 */
async function cleanupEphemeralEffects() {
    try {
        for (const actor of game.actors) {
            const ephemeralEffects = actor.itemTypes.effect.filter(e => 
                e.flags?.[MODULE_ID]?.isEphemeralOffGuard
            );
            
            if (ephemeralEffects.length > 0) {
                const effectIds = ephemeralEffects.map(e => e.id);
                await actor.deleteEmbeddedDocuments("Item", effectIds);
            }
        }
    } catch (error) {
        console.error('Error cleaning up ephemeral effects:', error);
    }
}

/**
 * Clean up ephemeral effects for a specific target when visibility changes
 * @param {Actor} observerActor - The observing actor (who has the effect)
 * @param {Actor} hiddenActor - The hidden actor (who is targeted by the effect)
 */
export async function cleanupEphemeralEffectsForTarget(observerActor, hiddenActor) {
    try {
        const ephemeralEffects = observerActor.itemTypes.effect.filter(e => 
            e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
            e.flags?.[MODULE_ID]?.hiddenActorSignature === hiddenActor.signature
        );
        
        if (ephemeralEffects.length > 0) {
            const effectIds = ephemeralEffects.map(e => e.id);
            await observerActor.deleteEmbeddedDocuments("Item", effectIds);

        }
    } catch (error) {
        console.error('Error cleaning up ephemeral effects for target:', error);
    }
}

/**
 * Update ephemeral effects when visibility changes
 * @param {Token} observerToken - The observing token
 * @param {Token} targetToken - The target token  
 * @param {string} newVisibilityState - The new visibility state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
export async function updateEphemeralEffectsForVisibility(observerToken, targetToken, newVisibilityState, options = {}) {

    
    if (!observerToken?.actor || !targetToken?.actor) {

        return;
    }
    
    // Clean up existing effects first

    await cleanupEphemeralEffectsForTarget(observerToken.actor, targetToken.actor, options);
    
    // Create new effect if target is hidden/undetected
    // The OBSERVER gets the off-guard effect (because they are off-guard to the hidden target)
    if (["hidden", "undetected"].includes(newVisibilityState)) {
        await createEphemeralOffGuardEffect(observerToken.actor, targetToken.actor, newVisibilityState, options);
    }
}

