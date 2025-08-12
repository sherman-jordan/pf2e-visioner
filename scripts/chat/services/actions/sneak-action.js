import { appliedSneakChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class SneakActionHandler extends ActionHandlerBase {
  constructor() { super("sneak"); }
  getCacheMap() { return appliedSneakChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.token?.id ?? outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    return tokens.filter((t) => t && t !== actionData.actor && t.actor);
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);
    // On a successful sneak, observers may lose track (hidden/undetected) based on margin
    const total = Number(actionData?.roll?.total ?? 0);
    const margin = total - 0; // If we lack DC, assume thresholding purely on roll quality
    let newVisibility = current;
    if (margin >= 10) newVisibility = "undetected";
    else if (margin >= 0) newVisibility = current === "observed" ? "hidden" : current;
    else newVisibility = current;
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


