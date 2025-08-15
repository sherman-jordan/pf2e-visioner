import { appliedSeekChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class SeekActionHandler extends ActionHandlerBase {
  constructor() { super("seek"); }
  getApplyActionName() { return "apply-now-seek"; }
  getRevertActionName() { return "revert-now-seek"; }
  getCacheMap() { return appliedSeekChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import("../infra/roll-utils.js");
    ensureActionRoll(actionData);
  }

  async discoverSubjects(actionData) {
    // Discover targets based on current canvas tokens and encounter settings
    const { shouldFilterAlly, hasActiveEncounter, calculateTokenDistance } = await import("../infra/shared-utils.js");
    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    let potential = allTokens
      .filter((t) => t && t.actor)
      // Exclude the acting token reliably by id when possible
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Always include hazards and loot in seek results regardless of ally filtering
      .filter((t) => {
        if (t.actor?.type === "hazard" || t.actor?.type === "loot") return true;
        // Prefer dialog's ignoreAllies when provided
        // Discovery should not apply ignoreAllies when null/undefined; allow dialog to filter live
        const preferIgnore = (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) ? actionData.ignoreAllies : null;
        return !shouldFilterAlly(actionData.actor, t, "enemies", preferIgnore);
      });
    
    // Optional distance limitation based on settings (combat vs out-of-combat)
    try {
      const inCombat = hasActiveEncounter();
      const limitInCombat = !!game.settings.get("pf2e-visioner", "limitSeekRangeInCombat");
      const limitOutOfCombat = !!game.settings.get("pf2e-visioner", "limitSeekRangeOutOfCombat");
      const shouldLimit = (inCombat && limitInCombat) || (!inCombat && limitOutOfCombat);
      if (shouldLimit) {
        const maxFeet = Number(
          inCombat
            ? game.settings.get("pf2e-visioner", "customSeekDistance")
            : game.settings.get("pf2e-visioner", "customSeekDistanceOutOfCombat"),
        );
        if (Number.isFinite(maxFeet) && maxFeet > 0) {
          potential = potential.filter((t) => {
            const d = calculateTokenDistance(actionData.actor, t);
            return !Number.isFinite(d) || d <= maxFeet;
          });
        }
      }
    } catch (_) {}

    // Do not pre-filter by encounter; the dialog applies encounter filter as needed
    return potential;
  }

  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { MODULE_ID } = await import("../../../constants.js");
    const { extractStealthDC, hasConcealedCondition, determineOutcome } = await import("../infra/shared-utils.js");
    const current = getVisibilityBetween(actionData.actor, subject);
    // Proficiency gating for hazards/loot
    try {
      if (subject?.actor && (subject.actor.type === "hazard" || subject.actor.type === "loot")) {
        const minRank = Number(subject.document?.getFlag?.(MODULE_ID, "minPerceptionRank") ?? 0);
        if (Number.isFinite(minRank) && minRank > 0) {
          const stat = actionData.actor?.actor?.getStatistic?.("perception");
          const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
          if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
            const dcBlocked = extractStealthDC(subject) || 0;
            const total = Number(actionData?.roll?.total ?? 0);
            const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
            return {
              target: subject,
              dc: dcBlocked,
              roll: total,
              die,
              rollTotal: total,
              dieResult: die,
              margin: total - dcBlocked,
              outcome: "no-proficiency",
              currentVisibility: current,
              oldVisibility: current,
              newVisibility: current,
              changed: false,
              noProficiency: true,
            };
          }
        }
      }
    } catch (_) {}
    // For loot actors, use the custom Stealth DC flag configured on the token; otherwise use Perception DC
    const dc = extractStealthDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    let newVisibility = getDefaultNewStateFor("seek", current, outcome) || current;

    const base = {
      target: subject,
      dc,
      // Keep legacy fields while also providing explicit names used by templates
      roll: total,
      die,
      rollTotal: total,
      dieResult: die,
      margin: total - dc,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      newVisibility,
      changed: newVisibility !== current,
    };

    // If a seek template was provided, ensure the target is within it; otherwise mark as unchanged to be filtered out later
    try {
      if (actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet) {
        const { isTokenWithinTemplate } = await import("../infra/shared-utils.js");
        const inside = isTokenWithinTemplate(actionData.seekTemplateCenter, actionData.seekTemplateRadiusFeet, subject);
        if (!inside) return { ...base, changed: false };
      }
    } catch (_) {}

    return base;
  }

  buildCacheEntryFromChange(change) {
    return { targetId: change.target?.id, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({ observer: actionData.actor, target: this.getTokenById(e.targetId), newVisibility: e.oldVisibility }))
      .filter((c) => c.target);
  }
}


