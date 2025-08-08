/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { COVER_STATES, MODULE_ID } from './constants.js';

/**
 * Create an ephemeral effect for cover states
 * @param {Actor} effectReceiverActor - The actor who receives the cover effect
 * @param {Actor} effectSourceActor - The actor who is the source of the effect (the observer)
 * @param {string} coverState - The cover state ('lesser', 'standard', or 'greater')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
export async function createEphemeralCoverEffect(effectReceiverActor, effectSourceActor, coverState, options = {}) {
    // Skip if no cover or invalid state
    if (!coverState || coverState === 'none' || !COVER_STATES[coverState]) {
        return;
    }

    // Check if effect already exists to prevent duplicates
    const existingEffect = effectReceiverActor.itemTypes.effect.find(e => 
        e.flags?.[MODULE_ID]?.isEphemeralCover &&
        e.flags?.[MODULE_ID]?.observerActorSignature === effectSourceActor.signature
    );
    
    if (existingEffect) {
        // If the same level, don't recreate
        if (existingEffect.flags[MODULE_ID].coverState === coverState) {
            return;
        }
        // Otherwise, remove the old one so we can create the new one
        try {
            if (effectReceiverActor.items.get(existingEffect.id)) {
                await effectReceiverActor.deleteEmbeddedDocuments("Item", [existingEffect.id]);
            }
        } catch (_) {
            // Ignore if it was already removed
        }
    }

    const stateConfig = COVER_STATES[coverState];
    const coverLabel = game.i18n.localize(stateConfig.label);
    
    // Pick a representative image per cover level
    const coverEffectImageByState = {
        lesser: "systems/pf2e/icons/equipment/shields/buckler.webp",
        standard: "systems/pf2e/icons/equipment/shields/steel-shield.webp",
        greater: "systems/pf2e/icons/equipment/shields/tower-shield.webp",
    };

    const effectImg = coverEffectImageByState[coverState] || "systems/pf2e/icons/equipment/shields/steel-shield.webp";

    const ephemeralEffect = {
        name: `${coverLabel} against ${effectSourceActor.name}`,
        type: 'effect',
        system: {
            description: {
                value: `<p>You have ${coverState} cover against ${effectSourceActor.name}, granting a +${stateConfig.bonusAC} circumstance bonus to AC.</p>`,
                gm: ''
            },
            rules: [
                {
                    key: "RollOption",
                    domain: "all",
                    option: `cover-against:${effectSourceActor.id}`
                },
                {
                    key: "FlatModifier",
                    selector: "ac",
                    type: "circumstance",
                    value: stateConfig.bonusAC,
                    predicate: [`origin:signature:${effectSourceActor.signature}`]
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
                "expiry": "turn-start",
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
                ? game.combat?.getCombatantByToken(effectReceiverActor.token?.id)?.initiative 
                : null
            },
            badge: null
        },
        img: effectImg,
                         flags: {
            [MODULE_ID]: {
                isEphemeralCover: true,
                observerActorSignature: effectSourceActor.signature,
                observerTokenId: effectSourceActor.getActiveTokens()?.[0]?.id || '',
                coverState: coverState
            },
            core: {}
        }
    };

    // Add reflex and stealth bonuses for standard and greater cover
    if (coverState === 'standard' || coverState === 'greater') {
        ephemeralEffect.system.rules.push(
            {
                key: "FlatModifier",
                selector: "reflex",
                type: "circumstance",
                value: stateConfig.bonusReflex,
                predicate: ["area-effect"]
            },
            {
                key: "FlatModifier",
                predicate: ["action:hide", "action:sneak", "avoid-detection"],
                selector: "stealth",
                type: "circumstance",
                value: stateConfig.bonusStealth
            }
        );
    }

    try {
        await effectReceiverActor.createEmbeddedDocuments("Item", [ephemeralEffect]);
    } catch (error) {
        console.error('Failed to create ephemeral cover effect:', error);
    }
}

/**
 * Clean up all ephemeral cover effects from all actors
 */
export async function cleanupAllCoverEffects() {
    try {
        for (const actor of game.actors) {
            const ephemeralEffects = actor.itemTypes.effect.filter(e => 
                e.flags?.[MODULE_ID]?.isEphemeralCover
            );
            
            if (ephemeralEffects.length > 0) {
                const effectIds = ephemeralEffects.map(e => e.id);
                // Guard against already-removed items
                const existingIds = effectIds.filter(id => !!actor.items.get(id));
                if (existingIds.length > 0) {
                    try {
                        await actor.deleteEmbeddedDocuments("Item", existingIds);
                    } catch (e) {
                        // As a last resort, delete one-by-one to skip missing
                        for (const id of existingIds) {
                            if (actor.items.get(id)) {
                                try { await actor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up ephemeral cover effects:', error);
    }
}

/**
 * Clean up ephemeral cover effects for a specific observer
 * @param {Actor} targetActor - The actor with cover
 * @param {Actor} observerActor - The observing actor
 */
export async function cleanupCoverEffectsForObserver(targetActor, observerActor) {
         try {
         const observerToken = observerActor.getActiveTokens()?.[0];
         if (!observerToken) return;
         
         const ephemeralEffects = targetActor.itemTypes.effect.filter(e => 
             e.flags?.[MODULE_ID]?.isEphemeralCover && 
             (e.flags?.[MODULE_ID]?.observerActorSignature === observerActor.signature ||
              e.flags?.[MODULE_ID]?.observerTokenId === observerToken.id)
         );
        
        if (ephemeralEffects.length > 0) {
            const effectIds = ephemeralEffects.map(e => e.id);
            const existingIds = effectIds.filter(id => !!targetActor.items.get(id));
            if (existingIds.length > 0) {
                try {
                    await targetActor.deleteEmbeddedDocuments("Item", existingIds);
                } catch (e) {
                    for (const id of existingIds) {
                        if (targetActor.items.get(id)) {
                            try { await targetActor.deleteEmbeddedDocuments("Item", [id]); } catch (_) {}
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up ephemeral cover effects for observer:', error);
    }
}

/**
 * Update ephemeral cover effects
 * @param {Token} targetToken - The token with cover
 * @param {Token} observerToken - The observer token
 * @param {string} coverState - The cover state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
export async function updateEphemeralCoverEffects(targetToken, observerToken, coverState, options = {}) {
    if (!targetToken?.actor || !observerToken?.actor) {
        return;
    }
    
    const targetActor = targetToken.actor;
    const observerActor = observerToken.actor;
    
    // Clean up existing effects first
    await cleanupCoverEffectsForObserver(targetActor, observerActor);
    
    // Only apply effects if there's cover
    if (!options.removeAllEffects && coverState && coverState !== 'none') {
        await createEphemeralCoverEffect(targetActor, observerActor, coverState, options);
    }
}
