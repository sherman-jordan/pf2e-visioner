import { appliedConsequencesChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class ConsequencesActionHandler extends ActionHandlerBase {
  constructor() { super("consequences"); }
  getCacheMap() { return appliedConsequencesChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    const tokens = canvas?.tokens?.placeables || [];
    return tokens.filter((t) => t && t !== actionData.actor && t.actor);
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const currentVisibility = getVisibilityBetween(subject, actionData.actor);
    return { target: subject, currentVisibility, changed: currentVisibility === "hidden" || currentVisibility === "undetected", newVisibility: "observed" };
  }
  outcomeToChange(actionData, outcome) {
    return { observer: outcome.target, target: actionData.actor, newVisibility: "observed", oldVisibility: outcome.currentVisibility };
  }
  buildCacheEntryFromChange(change) {
    return { observerId: change.observer?.id, oldVisibility: change.oldVisibility };
  }
  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: null, newVisibility: e.oldVisibility }))
      .filter((c) => c.observer);
  }
}


