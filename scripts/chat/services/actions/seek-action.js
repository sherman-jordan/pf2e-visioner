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
    const { filterOutcomesByEncounter, shouldFilterAlly } = await import("../infra/shared-utils.js");
    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    const potential = allTokens
      .filter((t) => t && t.actor)
      // Exclude the acting token reliably by id when possible
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      .filter((t) => !shouldFilterAlly(actionData.actor, t, "enemies"));
    // For Seek, we do not pre-filter by encounter here; the dialog applies filter as needed
    return potential;
  }

  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { extractStealthDC, hasConcealedCondition, determineOutcome } = await import("../infra/shared-utils.js");
    const current = getVisibilityBetween(actionData.actor, subject);
    // For loot actors, use the custom Stealth DC flag configured on the token; otherwise use Perception DC
    const dc = extractStealthDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    let newVisibility = getDefaultNewStateFor("seek", current, outcome) || current;

    return {
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


