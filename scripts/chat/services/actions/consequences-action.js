import { appliedConsequencesChangesByMessage } from "../data/message-cache.js";
import { shouldFilterAlly } from "../infra/shared-utils.js";
import { ActionHandlerBase } from "./base-action.js";

export class ConsequencesActionHandler extends ActionHandlerBase {
  constructor() { super("consequences"); }
  getCacheMap() { return appliedConsequencesChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }
  async discoverSubjects(actionData) {
    const tokens = canvas?.tokens?.placeables || [];
    const attacker = actionData?.actor || null;
    // Exclude attacker itself, hazards, and loot tokens from observers
    return tokens.filter((t) => {
      try {
        if (!t || !t.actor) return false;
        if (attacker && t.id === attacker.id) return false;
        const type = t.actor?.type;
        if (type === "hazard" || type === "loot") return false;
        // Respect Ignore Allies: when enabled, filter allies (we only care about enemies noticing attacker)
        if (shouldFilterAlly(attacker, t, "enemies")) return false;
        return true;
      } catch (_) {
        return false;
      }
    });
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


