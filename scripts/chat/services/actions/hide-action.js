import { appliedHideChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class HideActionHandler extends ActionHandlerBase {
  constructor() { super("hide"); }
  getCacheMap() { return appliedHideChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    return tokens.filter((t) => t && t !== actionData.actor && t.actor);
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);
    // Hide generally moves visibility one step toward hidden if currently observed
    let newVisibility = current;
    if (current === "observed") newVisibility = "hidden";
    else if (current === "concealed") newVisibility = "hidden";
    else if (current === "hidden") newVisibility = "hidden";
    else if (current === "undetected") newVisibility = "undetected";
    return { target: subject, currentVisibility: current, oldVisibility: current, newVisibility, changed: newVisibility !== current };
  }
  outcomeToChange(actionData, outcome) {
    return { observer: outcome.target, target: actionData.actor, newVisibility: outcome.newVisibility, oldVisibility: outcome.oldVisibility };
  }
  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: null, newVisibility: e.oldVisibility, _observerId: e.observerId }))
      .map((c) => ({ ...c, target: canvas.tokens.controlled.find((t) => t.id === c._observerId)?.target || null }))
      .filter((c) => c.observer && c.target);
  }
}


