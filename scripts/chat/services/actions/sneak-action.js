import { appliedSneakChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class SneakActionHandler extends ActionHandlerBase {
  constructor() { super("sneak"); }
  getCacheMap() { return appliedSneakChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.token?.id ?? outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    return tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor));
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);
    // Determine default state from centralized mapping using roll quality only
    const total = Number(actionData?.roll?.total ?? 0);
    const outcome = total >= 20 ? "critical-success" : (total >= 10 ? "success" : (total >= 0 ? "failure" : "critical-failure"));
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    const newVisibility = getDefaultNewStateFor("sneak", current, outcome) || current;
    return { token: subject, currentVisibility: current, oldVisibility: current, newVisibility, changed: newVisibility !== current };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    return { observer, target: actionData.actor, newVisibility: outcome.newVisibility, oldVisibility: outcome.oldVisibility };
  }
  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: null, newVisibility: e.oldVisibility }))
      .filter((c) => c.observer);
  }
}


