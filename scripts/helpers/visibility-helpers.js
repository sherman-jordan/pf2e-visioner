/**
 * Helpers for off-guard visibility ephemeral effects
 */

import { MODULE_ID } from "../constants.js";

export function createEphemeralEffectRule(signature) {
  return {
    key: "EphemeralEffect",
    predicate: [`target:signature:${signature}`],
    selectors: [
      "strike-attack-roll",
      "spell-attack-roll",
      "strike-damage",
      "attack-spell-damage",
    ],
    uuid: "Compendium.pf2e.conditionitems.AJh5ex99aV6VTggg",
  };
}

export function createAggregateEffectData(visibilityState, signature, options = {}) {
  const visibilityLabel = game.i18n.localize(`PF2E.condition.${visibilityState}.name`);
  const effectTarget = options.effectTarget || "subject";
  let rules = options.existingRules || [];
  if (rules.length === 0 && signature !== "batch") {
    rules = [createEphemeralEffectRule(signature)];
  }
  return {
    name: `${visibilityLabel}`,
    type: "effect",
    system: {
      description: {
        value: `<p>Aggregated off-guard for ${visibilityState} vs multiple observers.</p>`,
        gm: "",
      },
      rules: rules,
      slug: null,
      traits: { otherTags: [], value: [] },
      level: { value: 1 },
      duration:
        options.durationRounds >= 0
          ? {
              value: options.durationRounds,
              unit: "rounds",
              expiry: "turn-end",
              sustained: false,
            }
          : { value: -1, unit: "unlimited", expiry: null, sustained: false },
      tokenIcon: { show: false },
      unidentified: true,
      start: {
        value: 0,
        initiative: options.initiative
          ? game.combat?.getCombatantByToken(options.receiverId)?.initiative
          : null,
      },
      badge: null,
      fromSpell: false,
    },
    img: `systems/pf2e/icons/conditions/${visibilityState}.webp`,
    flags: {
      [MODULE_ID]: {
        aggregateOffGuard: true,
        visibilityState,
        effectTarget,
      },
    },
  };
}


