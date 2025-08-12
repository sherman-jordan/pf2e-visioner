import { appliedDiversionChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class DiversionActionHandler extends ActionHandlerBase {
  constructor() { super("create-a-diversion"); }
  getCacheMap() { return appliedDiversionChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.observer?.id ?? outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    return tokens.filter((t) => t && t !== actionData.actor && t.actor);
  }
  async analyzeOutcome(actionData, subject) {
    // Diversion typically makes observers treat actor as hidden briefly
    const { getVisibilityBetween } = await import("../../../utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);
    const newVisibility = current === "observed" ? "hidden" : current;
    return { observer: subject, currentVisibility: current, newVisibility };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.observer || outcome.token || outcome.target;
    return { observer, target: actionData.actor, newVisibility: outcome.newVisibility, oldVisibility: outcome.currentVisibility };
  }
  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: null, newVisibility: e.oldVisibility }))
      .filter((c) => c.observer);
  }
}


