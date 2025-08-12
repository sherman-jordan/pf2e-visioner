import { appliedSeekChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class SeekActionHandler extends ActionHandlerBase {
  constructor() { super("seek"); }
  getApplyActionName() { return "apply-now-seek"; }
  getRevertActionName() { return "revert-now-seek"; }
  getCacheMap() { return appliedSeekChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  async ensurePrerequisites(actionData) {
    const { ensureSeekRoll } = await import("../infra/roll-utils.js");
    ensureSeekRoll(actionData);
  }

  async discoverSubjects(actionData) {
    // Discover targets based on current canvas tokens and encounter settings
    const { filterOutcomesByEncounter, shouldFilterAlly } = await import("../infra/shared-utils.js");
    const allTokens = canvas?.tokens?.placeables || [];
    const potential = allTokens.filter((t) => t && t !== actionData.actor && t.actor)
      .filter((t) => !shouldFilterAlly(actionData.actor, t, "enemies"));
    // For Seek, we do not pre-filter by encounter here; the dialog applies filter as needed
    return potential;
  }

  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { extractPerceptionDC, hasConcealedCondition, determineOutcome } = await import("../infra/shared-utils.js");
    const { getVisibilityStateConfig } = await import("../data/visibility-states.js");
    const current = getVisibilityBetween(actionData.actor, subject);
    const dc = extractPerceptionDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    let newVisibility = current;
    if (outcome === "critical-success") newVisibility = "observed";
    else if (outcome === "success") newVisibility = current === "concealed" || hasConcealedCondition(subject) ? "observed" : "observed";
    else if (outcome === "failure") newVisibility = current === "undetected" ? "hidden" : (current === "hidden" ? "hidden" : "concealed");
    else if (outcome === "critical-failure") newVisibility = "undetected";

    return {
      target: subject,
      dc,
      roll: total,
      die,
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


