import { appliedSneakChangesByMessage } from "../data/message-cache.js";
import { shouldFilterAlly } from "../infra/shared-utils.js";
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
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Respect ignoreAllies setting: filter allies only when enabled
      .filter((t) => !shouldFilterAlly(actionData.actor, t, "enemies"))
      // Exclude loot and hazards from observers list
      .filter((t) => t.actor?.type !== "loot" && t.actor?.type !== "hazard");
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { extractPerceptionDC, determineOutcome } = await import("../infra/shared-utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);

    // Calculate roll information (stealth vs observer's perception DC)
    const dc = extractPerceptionDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const margin = total - dc;
    const outcome = determineOutcome(total, die, dc);

    // Determine default new visibility using centralized mapping
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    const newVisibility = getDefaultNewStateFor("sneak", current, outcome) || current;

    return {
      token: subject,
      dc,
      rollTotal: total,
      dieResult: die,
      margin,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      newVisibility,
      changed: newVisibility !== current,
    };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    return { observer, target: actionData.actor, newVisibility: outcome.newVisibility, oldVisibility: outcome.oldVisibility };
  }
  buildCacheEntryFromChange(change) {
    return { observerId: change?.observer?.id ?? null, oldVisibility: change?.oldVisibility ?? null };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: actionData.actor, newVisibility: e.oldVisibility }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({ observer: o.token || o.target, target: actionData.actor, newVisibility: o.oldVisibility || o.currentVisibility }));
  }
}


