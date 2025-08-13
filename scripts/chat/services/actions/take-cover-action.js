import { appliedTakeCoverChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

// Take Cover raises the cover level that the ACTOR (taking cover) has AGAINST each other token (observers).
// Cover storage/orientation is observer -> target. For Take Cover that means:
//   observer = subject row token, target = actor taking cover
// New cover state mapping follows RAW: standard -> greater, lesser/none -> standard.
export class TakeCoverActionHandler extends ActionHandlerBase {
  constructor() { super("take-cover"); }
  getApplyActionName() { return "apply-now-take-cover"; }
  getRevertActionName() { return "revert-now-take-cover"; }
  getCacheMap() { return appliedTakeCoverChangesByMessage; }
  // For overrides and UI selection, token id lives under `target` (the observer of the actor)
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }
  getApplyDirection() { return "observer_to_target"; }

  async discoverSubjects(actionData) {
    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    return allTokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Exclude loot and hazards from observers for Take Cover
      .filter((t) => t.actor?.type !== "loot" && t.actor?.type !== "hazard");
  }

  async analyzeOutcome(actionData, subject) {
    const { getCoverBetween } = await import("../../../utils.js");
    // Orientation: observer = subject (row token), target = actor (taking cover)
    const current = getCoverBetween(subject, actionData.actor) || "none";
    let newCover = current;
    if (current === "lesser" || current === "none") newCover = "standard";
    else if (current === "standard") newCover = "greater";
    // If already greater, no change
    const changed = newCover !== current;
    // Mirror fields to align with BaseActionDialog utilities
    return {
      target: subject,
      currentCover: current,
      oldCover: current,
      newCover,
      // Visibility-aligned aliases so shared UI helpers work
      currentVisibility: current,
      oldVisibility: current,
      newVisibility: newCover,
      changed,
    };
  }

  // Map to cover change call via utility
  outcomeToChange(actionData, outcome) {
    const desired = outcome?.overrideState || outcome?.newVisibility || outcome?.newCover;
    return {
      // Orientation: observer = subject (row token), target = actor (taking cover)
      observer: outcome.target,
      target: actionData.actor,
      newCover: desired,
      oldCover: outcome.oldCover || outcome.oldVisibility || outcome.currentCover,
    };
  }

  async applyChangesInternal(changes) {
    const { setCoverBetween } = await import("../../../utils.js");
    for (const ch of changes) {
      await setCoverBetween(ch.observer, ch.target, ch.newCover, { skipEphemeralUpdate: false });
    }
  }

  buildCacheEntryFromChange(change) {
    // Cache observer id (row token) and the old cover to enable precise revert
    return { observerId: change.observer?.id, oldCover: change.oldCover };
  }

  entriesToRevertChanges(entries, actionData) {
    // Revert orientation: observer = cached observer token, target = actor (taking cover)
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: actionData.actor, newCover: e.oldCover }))
      .filter((c) => c.observer);
  }

  async revert(actionData, button) {
    const { setCoverBetween } = await import("../../../utils.js");
    const changesFromCache = await this.buildChangesFromCache(actionData);
    if (!changesFromCache.length) return;
    for (const ch of changesFromCache) {
      await setCoverBetween(ch.observer, ch.target, ch.newCover, { skipEphemeralUpdate: false });
    }
    this.clearCache(actionData);
    this.updateButtonToApply(button);
  }
}


