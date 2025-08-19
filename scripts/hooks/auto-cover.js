/**
 * Auto-cover hooks wrapper
 * Moves hook wiring out of auto-cover logic file for better structure.
 */

import { MODULE_ID } from "../constants.js";
import {
  _recordPair,
  detectCoverStateForAttack,
  isAttackContext,
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onUpdateToken,
  resolveAttackerFromCtx,
  resolveTargetFromCtx,
} from "../cover/auto-cover.js";
import { getCoverBonusByState, getCoverImageForState, getCoverLabel } from "../helpers/cover-helpers.js";
import { setCoverBetween } from "../utils.js";

export function registerAutoCoverHooks() {
  Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("renderCheckModifiersDialog", onRenderCheckModifiersDialog);
  Hooks.on("updateToken", onUpdateToken);

  // Track registration state to avoid duplicate libWrapper registrations
  let _pvLibWrapperRegistered = false;

  // Patch PF2E Check.roll to support quick rolls (no modifiers dialog)
  const patchCheckRoll = () => {
    try {
      // If libWrapper is available, register a WRAPPER to avoid conflicts
      if (game.modules.get("lib-wrapper")?.active && typeof libWrapper?.register === "function") {
        if (_pvLibWrapperRegistered) return;
        libWrapper.register(
          "pf2e-visioner",
          "game.pf2e.Check.roll",
          async function visionerAutoCoverWrapper(wrapped, check, context = {}, event = null, callback) {
            try {
              // Apply only when auto-cover is enabled and this is an attack-like roll
              if (game?.settings?.get?.(MODULE_ID, "autoCover") && isAttackContext(context)) {
                const attacker = resolveAttackerFromCtx(context);
                const target = resolveTargetFromCtx(context);
                if (attacker && target) {
                  // If user holds the configured override keybinding, force override path (skip auto-calculated add)
                  const isOverrideHeld = (() => {
                    try {
                      const binding = game.keybindings.get(MODULE_ID, "holdCoverOverride");
                      if (!binding || binding.length === 0) return false;
                      const kb = game.keyboard;
                      if (kb?.downKeys) {
                        return binding.some(({ key, modifiers }) => {
                          const code = key;
                          const modOk = (modifiers ?? []).every((m) => kb.downKeys.has(m));
                          return modOk && kb.downKeys.has(code);
                        });
                      }
                    } catch (_) {}
                    return false;
                  })();
                  // If target already has a cover effect for this attacker (aggregate or ephemeral), don't also add to DC
                  let hasExistingForThisAttacker = false;
                  try {
                    const sig = attacker.actor?.signature || attacker.actor?.id;
                    const effects = Array.from(target.actor?.itemTypes?.effect ?? []);
                    hasExistingForThisAttacker = effects.some((e) => {
                      const f = e?.flags?.[MODULE_ID] || {};
                      if (!f.aggregateCover && !f.isEphemeralCover) return false;
                      const rules = Array.isArray(e?.system?.rules) ? e.system.rules : [];
                      return rules.some((r) => r?.key === "FlatModifier" && r.selector === "ac" && Array.isArray(r.predicate) && r.predicate.some((p) => String(p).includes(`origin:signature:${sig}`)));
                    });
                  } catch (_) {
                    hasExistingForThisAttacker = false;
                  }

                  const state = detectCoverStateForAttack(attacker, target);
                  // Persist computed cover for consistency/UI without triggering ephemeral update here
                  try { await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true }); } catch (_) {}
                  try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state }); } catch (_) {}
                  try { _recordPair(attacker.id, target.id); } catch (_) {}

                  if (!hasExistingForThisAttacker && !isOverrideHeld) {
                    const bonus = getCoverBonusByState(state) || 0;
                    if (context.dc && typeof context.dc.value === "number") {
                      context.dc.value += bonus;
                      // Respect PF2E metagame DC visibility; do not force visibility here
                    }
                    try {
                      if (bonus > 0 && target?.actor) {
                        let coverBonus, label;
                        if (state === "greater") {
                          coverBonus = 4;
                          label = "Greater Cover";
                        } else if (state === "standard") {
                          coverBonus = 2;
                          label = "Standard Cover";
                        } else {
                          coverBonus = 1;
                          label = "Lesser Cover";
                        }
                        const tgtActor = target.actor;
                        const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        items.push({
                          name: label,
                          type: "effect",
                          system: {
                            description: { value: `<p>${label}: +${coverBonus} circumstance bonus to AC for this roll.</p>`, gm: "" },
                            rules: [{ key: "FlatModifier", selector: "ac", type: "circumstance", value: coverBonus }],
                            traits: { otherTags: [], value: [] },
                            level: { value: 1 },
                            duration: { value: -1, unit: "unlimited" },
                            tokenIcon: { show: false },
                            unidentified: true,
                            start: { value: 0 },
                            badge: null,
                          },
                          img: isStandard ? "systems/pf2e/icons/equipment/shields/steel-shield.webp" : "systems/pf2e/icons/equipment/shields/buckler.webp",
                          flags: { "pf2e-visioner": { forThisRoll: true, ephemeralCoverRoll: true } },
                        });
                        const clonedActor = tgtActor.clone({ items }, { keepId: true });
                        const dcObj = context.dc;
                        if (dcObj?.slug) {
                          const st = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                          if (st) { dcObj.value = st.value; dcObj.statistic = st; }
                        }
                      }
                    } catch (_) {}
                  }
                  if (isOverrideHeld) {
                    try {
                      const { openCoverQuickOverrideDialog } = await import("../cover/quick-override-dialog.js");
                      const chosen = await openCoverQuickOverrideDialog(state);
                      if (chosen != null) {
                        const bonus = getCoverBonusByState(chosen) || 0;
                        if (context.dc && typeof context.dc.value === "number") {
                          context.dc.value += bonus;
                          // Respect PF2E metagame DC visibility; do not force visibility here
                        }
                        try {
                          if (bonus > 0 && target?.actor) {
                            const label = getCoverLabel(chosen) || "Cover";
                            const img = getCoverImageForState(chosen);
                            const tgtActor = target.actor;
                            let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                            items = items.filter((i) => !(i?.type === "effect" && i?.flags?.["pf2e-visioner"]?.ephemeralCoverRoll === true));
                            if (bonus > 0) {
                              items.push({
                                name: label,
                                type: "effect",
                                system: {
                                  description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: "" },
                                  rules: [{ key: "FlatModifier", selector: "ac", type: "circumstance", value: bonus }],
                                  traits: { otherTags: [], value: [] },
                                  level: { value: 1 },
                                  duration: { value: -1, unit: "unlimited" },
                                  tokenIcon: { show: false },
                                  unidentified: true,
                                  start: { value: 0 },
                                  badge: null,
                                },
                                img,
                                flags: { "pf2e-visioner": { forThisRoll: true, ephemeralCoverRoll: true } },
                              });
                            }
                            const clonedActor = tgtActor.clone({ items }, { keepId: true });
                            const dcObj = context.dc;
                            if (dcObj?.slug) {
                              const st = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                              if (st) { dcObj.value = st.value; dcObj.statistic = st; }
                            }
                          }
                        } catch (_) {}
                      }
                    } catch (_) {}
                  }
                }
              }
            } catch (_) {}
            return await wrapped(check, context, event, callback);
          },
          "WRAPPER",
        );
        _pvLibWrapperRegistered = true;
        return;
      }

      // Fallback: direct patch when libWrapper is not available
      const Check = game?.pf2e?.Check ?? game?.pf2e?.CheckPF2e;
      if (!Check || typeof Check.roll !== "function") return;
      if (Check._pvVisionerPatched) return; // idempotent
      const original = Check.roll.bind(Check);
      Check.roll = async function patchedVisionerCheckRoll(check, context = {}, event = null, callback) {
        try {
          // Apply only when auto-cover is enabled and this is an attack-like roll
          if (game?.settings?.get?.(MODULE_ID, "autoCover") && isAttackContext(context)) {
            const attacker = resolveAttackerFromCtx(context);
            const target = resolveTargetFromCtx(context);
            if (attacker && target) {
              // If user holds the configured override keybinding, force override path (skip auto-calculated add)
              const isOverrideHeld = (() => {
                try {
                  const binding = game.keybindings.get(MODULE_ID, "holdCoverOverride");
                  if (!binding || binding.length === 0) return false;
                  // When bound, Foundry tracks pressed state; also check incoming event modifiers
                  // Prefer Foundry's pressed state via keyboard manager if available
                  const kb = game.keyboard;
                  if (kb?.downKeys) {
                    return binding.some(({ key, modifiers }) => {
                      const code = key; // already a KeyboardEvent.code
                      const modOk = (modifiers ?? []).every((m) => kb.downKeys.has(m));
                      return modOk && kb.downKeys.has(code);
                    });
                  }
                } catch (_) { }
                return false;
              })();
              // If target already has a cover effect for this attacker (aggregate or ephemeral), don't also add to DC
              let hasExistingForThisAttacker = false;
              try {
                const sig = attacker.actor?.signature || attacker.actor?.id;
                const effects = Array.from(target.actor?.itemTypes?.effect ?? []);
                hasExistingForThisAttacker = effects.some((e) => {
                  const f = e?.flags?.[MODULE_ID] || {};
                  if (!f.aggregateCover && !f.isEphemeralCover) return false;
                  const rules = Array.isArray(e?.system?.rules) ? e.system.rules : [];
                  return rules.some((r) => r?.key === 'FlatModifier' && r.selector === 'ac' && Array.isArray(r.predicate) && r.predicate.some((p) => String(p).includes(`origin:signature:${sig}`)));
                });
              } catch (_) { hasExistingForThisAttacker = false; }

              const state = detectCoverStateForAttack(attacker, target);
              // Persist computed cover for consistency/UI without triggering ephemeral update here
              try { await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true }); } catch (_) {}
              try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state }); } catch (_) {}
              // Track this pair so movement during the attack re-evaluates cover
              try { _recordPair(attacker.id, target.id); } catch (_) {}
              // Only adjust DC for true quick-rolls (skipDialog) and when no existing cover effect already applies
              if (!hasExistingForThisAttacker && !isOverrideHeld) {
                const bonus = getCoverBonusByState(state) || 0;
                // Safely bump DC value for this roll only
                if (context.dc && typeof context.dc.value === "number") {
                  context.dc.value += bonus;
                  // Respect PF2E metagame DC visibility; do not force visibility here
                }

                // Inject a one-shot cover effect by cloning the target's actor so covered AC is used even in quick-rolls
                try {
                  if (bonus > 0 && target?.actor) {
                    let coverBonus, label;
                    if (state === "greater") {
                      coverBonus = 4;
                      label = "Greater Cover";
                    } else if (state === "standard") {
                      coverBonus = 2;
                      label = "Standard Cover";
                    } else {
                      coverBonus = 1;
                      label = "Lesser Cover";
                    }
                    const tgtActor = target.actor;
                    const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                    items.push({
                      name: label,
                      type: "effect",
                      system: {
                        description: { value: `<p>${label}: +${coverBonus} circumstance bonus to AC for this roll.</p>`, gm: "" },
                        rules: [{ key: "FlatModifier", selector: "ac", type: "circumstance", value: coverBonus }],
                        traits: { otherTags: [], value: [] },
                        level: { value: 1 },
                        duration: { value: -1, unit: "unlimited" },
                        tokenIcon: { show: false },
                        unidentified: true,
                        start: { value: 0 },
                        badge: null
                      },
                      img: isStandard ? "systems/pf2e/icons/equipment/shields/steel-shield.webp" : "systems/pf2e/icons/equipment/shields/buckler.webp",
                      flags: { "pf2e-visioner": { forThisRoll: true, ephemeralCoverRoll: true } }
                    });

                    // Clone without mutating token.actor (token.actor is a getter-only property)
                    const clonedActor = tgtActor.clone({ items }, { keepId: true });

                    const dcObj = context.dc;
                    if (dcObj?.slug) {
                      const st = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                      if (st) { dcObj.value = st.value; dcObj.statistic = st; }
                    }
                  }
                } catch (_) {}
              }
              // If override key is held, open a quick override mini-dialog to choose cover, then proceed
              if (isOverrideHeld) {
                try {
                  const { openCoverQuickOverrideDialog } = await import("../cover/quick-override-dialog.js");
                  const chosen = await openCoverQuickOverrideDialog(state);
                  if (chosen != null) {
                    // Apply chosen cover transiently to this quick roll by bumping DC and adding ephemeral effect just like auto path
                    const bonus = getCoverBonusByState(chosen) || 0;
                    if (context.dc && typeof context.dc.value === "number") {
                      context.dc.value += bonus;
                      // Respect PF2E metagame DC visibility; do not force visibility here
                    }
                    try {
                      if (bonus > 0 && target?.actor) {
                        const label = getCoverLabel(chosen) || "Cover";
                        const img = getCoverImageForState(chosen);
                        const tgtActor = target.actor;
                        let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        // remove any one-shot effect we might have injected previously
                        items = items.filter((i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true));
                        if (bonus > 0) {
                          items.push({
                            name: label,
                            type: "effect",
                            system: {
                              description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: "" },
                              rules: [{ key: "FlatModifier", selector: "ac", type: "circumstance", value: bonus }],
                              traits: { otherTags: [], value: [] },
                              level: { value: 1 },
                              duration: { value: -1, unit: "unlimited" },
                              tokenIcon: { show: false },
                              unidentified: true,
                              start: { value: 0 },
                              badge: null
                            },
                            img,
                            flags: { "pf2e-visioner": { forThisRoll: true, ephemeralCoverRoll: true } }
                          });
                        }
                        const clonedActor = tgtActor.clone({ items }, { keepId: true });
                        const dcObj = context.dc;
                        if (dcObj?.slug) {
                          const st = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                          if (st) { dcObj.value = st.value; dcObj.statistic = st; }
                        }
                      }
                    } catch (_) {}
                  }
                } catch (_) { /* ignore */ }
              }
            }
          }
        } catch (_) { /* ignore */ }
        return await original(check, context, event, callback);
      };
      Check._pvVisionerPatched = true;
    } catch (_) { /* ignore */ }
  };

  // Patch when PF2E system is ready and also attempt immediately
  Hooks.on("pf2e.systemReady", patchCheckRoll);
  Hooks.on("ready", patchCheckRoll);
  // In case system is already loaded
  patchCheckRoll();
}


