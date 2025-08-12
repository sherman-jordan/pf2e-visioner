import { appliedPointOutChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class PointOutActionHandler extends ActionHandlerBase {
  constructor() { super("point-out"); }
  getApplyActionName() { return "apply-now-point-out"; }
  getRevertActionName() { return "revert-now-point-out"; }
  getCacheMap() { return appliedPointOutChangesByMessage; }

  async discoverSubjects(actionData) {
    // Resolve target token: prefer message context or user target, then proximity heuristic
    let target = null;
    try { if (game.user.targets?.size) target = Array.from(game.user.targets)[0]; } catch (_) {}
    if (!target) {
      const msg = game.messages.get(actionData.messageId);
      const flg = msg?.flags?.pf2e?.target;
      if (flg?.token) target = canvas.tokens.get(flg.token) || null;
    }
    if (!target) {
      const all = canvas?.tokens?.placeables || [];
      target = all.find((t) => t && t !== actionData.actor && t.actor && t.document.disposition !== actionData.actor.document.disposition) || null;
    }
    if (!target) return [];
    // Allies are same-disposition tokens that currently cannot see the target
    const { getVisibilityBetween } = await import("../../../utils.js");
    const allies = (canvas?.tokens?.placeables || []).filter((t) => t && t !== actionData.actor && t.actor && t.document.disposition === actionData.actor.document.disposition);
    const cannotSee = allies.filter((ally) => {
      const vis = getVisibilityBetween(ally, target);
      return vis === "hidden" || vis === "undetected";
    });
    return cannotSee.map((ally) => ({ ally, target }));
  }

  async analyzeOutcome(_actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const current = getVisibilityBetween(subject.ally, subject.target);
    // Point Out reveals target to allies as hidden if they currently cannot see it
    const newVisibility = current === "hidden" || current === "undetected" ? "hidden" : current;
    return {
      target: subject.ally,
      targetToken: subject.target,
      currentVisibility: current,
      oldVisibility: current,
      newVisibility,
      changed: newVisibility !== current,
    };
  }

  outcomeToChange(_actionData, outcome) {
    return {
      observer: outcome.target,
      target: outcome.targetToken,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
    };
  }

  buildCacheEntryFromChange(change) {
    return { allyId: change.observer?.id, targetTokenId: change.target?.id, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, _actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.allyId), target: this.getTokenById(e.targetTokenId), newVisibility: e.oldVisibility }))
      .filter((c) => c.observer && c.target);
  }
}


