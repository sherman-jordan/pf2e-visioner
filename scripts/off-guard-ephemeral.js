/**
 * Off-Guard Condition Handler using EphemeralEffect Rule Elements
 * This is a cleaner approach that uses PF2e's native EphemeralEffect system
 */

import { MODULE_ID } from './constants.js';


/**
 * Create an ephemeral effect for visibility states
 * @param {Actor} effectReceiverActor - The actor who receives the effect (the hidden one)
 * @param {Actor} effectSourceActor - The actor who is the source of the effect (the one who sees the hidden actor)
 * @param {string} visibilityState - The visibility state ('hidden' or 'undetected')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
async function createEphemeralOffGuardEffect(effectReceiverActor, effectSourceActor, visibilityState, options = {}) {

    
    // Check if effect already exists to prevent duplicates
    const existingEffect = effectReceiverActor.itemTypes.effect.find(e => 
        e.flags?.[MODULE_ID]?.isEphemeralOffGuard &&
        e.flags?.[MODULE_ID]?.hiddenActorSignature === effectSourceActor.signature
    );
    
    if (existingEffect) {
        return; // Effect already exists for this target
    }

    const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
    
    const ephemeralEffect = {
        name: `${visibilityLabel} from ${effectSourceActor.name}`,
        type: 'effect',
        system: {
            description: {
                value: `<p>You are ${visibilityState.toLowerCase()} from ${effectSourceActor.name}'s perspective.</p>`,
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
                    predicate: [`target:signature:${effectSourceActor.signature}`],
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
                    actor: effectSourceActor.uuid,
                    token: effectSourceActor.getActiveTokens()?.[0]?.uuid,
                    item: null,
                    spellcasting: null
                },
                target: {
                    actor: effectReceiverActor.uuid,
                    token: effectReceiverActor.getActiveTokens()?.[0]?.uuid
                },
                roll: null
            }
        },
        img: `systems/pf2e/icons/conditions/${visibilityState}.webp`,
        flags: {
            [MODULE_ID]: {
                isEphemeralOffGuard: true,
                hiddenActorSignature: effectSourceActor.signature,
                visibilityState: visibilityState
            }
        }
    };

    try {
        await effectReceiverActor.createEmbeddedDocuments("Item", [ephemeralEffect]);

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
 * @param {string} options.effectTarget - Which token gets the effect ('observer' or 'subject')
 */
export async function updateEphemeralEffectsForVisibility(observerToken, targetToken, newVisibilityState, options = {}) {
    if (!observerToken?.actor || !targetToken?.actor) {
        return;
    }
        
    // Determine which token gets the effect
    let effectReceiverActor, effectSourceActor;
    
    // For rule elements, always put effects on the subject
    if (options.direction) {
        // Rule elements always put effects on the subject
        options.effectTarget = 'subject';
    } else if (!options.effectTarget) {
        // Handle legacy direction parameter for backward compatibility
        if (options.direction === 'target_to_observer') {
            options.effectTarget = 'observer';
        } else {
            // Default to 'subject' (target) if not specified
            options.effectTarget = 'subject';
        }
    }
    
    const effectTarget = options.effectTarget;
    
    if (effectTarget === 'observer') {
        effectReceiverActor = observerToken.actor;
        effectSourceActor = targetToken.actor;
    } else {
        effectReceiverActor = targetToken.actor;
        effectSourceActor = observerToken.actor;
    }
    
    // Clean up existing effects first
    await cleanupEphemeralEffectsForTarget(effectReceiverActor, effectSourceActor, options);
    

    // Only apply effects if the token is hidden or undetected and we're not in remove mode
    if (!options.removeAllEffects && ["hidden", "undetected"].includes(newVisibilityState)) {
        // Apply effect to the token that is hidden/undetected
        await createEphemeralOffGuardEffect(effectReceiverActor, effectSourceActor, newVisibilityState, options);
    }
}

