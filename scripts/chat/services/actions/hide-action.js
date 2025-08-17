import { MODULE_ID } from "../../../constants.js";
import { detectCoverStateForAttack } from "../../../cover/auto-cover.js";
import { appliedHideChangesByMessage } from "../data/message-cache.js";
import { shouldFilterAlly } from "../infra/shared-utils.js";
import { ActionHandlerBase } from "./base-action.js";

export class HideActionHandler extends ActionHandlerBase {
  constructor() { super("hide"); }
  getCacheMap() { return appliedHideChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }
  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import("../infra/roll-utils.js");
    ensureActionRoll(actionData);
  }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorToken = actionData?.actor;
    const actorId = actorToken?.id || actorToken?.document?.id || null;
    const enforceRAW = game.settings.get(MODULE_ID, "enforceRawRequirements");
    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actorToken))
      // Respect ignoreAllies: when enabled, exclude allies from observers for Hide
      // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
      .filter((t) => !shouldFilterAlly(actorToken, t, "enemies", (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) ? actionData.ignoreAllies : null))
      // Hide should not list loot or hazards as observers
      .filter((t) => t.actor?.type !== "loot" && t.actor?.type !== "hazard");

    if (!enforceRAW) return base;

    // RAW filter: only observers that currently see the actor as Concealed
    // OR (Observed AND actor has Standard or Greater cover) are relevant.
    const autoCover = game.settings.get(MODULE_ID, "autoCover");
    const { getVisibilityBetween, getCoverBetween } = await import("../../../utils.js");
    return base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actorToken);
        if (vis === "concealed") return true;
        if (vis === "observed") {
          // Prefer live auto-cover for relevance (do not mutate state), then fall back to stored map
          let cover = "none";
          if (autoCover) {
            try { cover = detectCoverStateForAttack(observer, actorToken, { rawPrereq: true }) || "none"; } catch (_) {}
          }
          if (cover === "none") {
            try { cover = getCoverBetween(observer, actorToken); } catch (_) { cover = "none"; }
          }
          return cover === "standard" || cover === "greater";
        }
      } catch (_) {}
      return false;
    });
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

    // Maintain previous behavior for visibility change while enriching display fields
    // Use centralized mapping for defaults
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    let newVisibility = getDefaultNewStateFor("hide", current, outcome) || current;

    return {
      target: subject,
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
    return { observer: outcome.target, target: actionData.actor, newVisibility: outcome.newVisibility, oldVisibility: outcome.oldVisibility };
  }
  buildCacheEntryFromChange(change) {
    return { observerId: change?.observer?.id ?? null, oldVisibility: change?.oldVisibility ?? null };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({ observer: this.getTokenById(e.observerId), target: actionData.actor, newVisibility: e.oldVisibility }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  // Ensure fallback revert builds correct direction for Hide (observer -> actor)
  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({ observer: o.target, target: actionData.actor, newVisibility: o.oldVisibility || o.currentVisibility }));
  }
}


