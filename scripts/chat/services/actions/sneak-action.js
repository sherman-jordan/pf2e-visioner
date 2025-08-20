import { appliedSneakChangesByMessage } from "../data/message-cache.js";
import { shouldFilterAlly } from "../infra/shared-utils.js";
import { ActionHandlerBase } from "./base-action.js";

export class SneakActionHandler extends ActionHandlerBase {
  constructor() { 
    super("sneak"); 
  }
  getCacheMap() { return appliedSneakChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.token?.id ?? outcome?.target?.id ?? null; }
  async ensurePrerequisites(_actionData) {}
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    
    console.log(`[DEBUG SNEAK] Total tokens: ${tokens.length}`);
    console.log(`[DEBUG SNEAK] Actor ID: ${actorId}`);
    console.log(`[DEBUG SNEAK] Action data actor:`, actionData?.actor);
    
    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Use global ignoreAllies setting when not explicitly provided in actionData
      .filter((t) => !shouldFilterAlly(actionData.actor, t, "enemies", actionData?.ignoreAllies ?? game.settings.get("pf2e-visioner", "ignoreAllies")))
      // Exclude loot and hazards from observers list
      .filter((t) => t.actor?.type !== "loot" && t.actor?.type !== "hazard");
    
    console.log(`[DEBUG SNEAK] Base tokens after filtering: ${base.length}`);
    console.log(`[DEBUG SNEAK] Base tokens:`, base.map(t => ({ id: t.id, name: t.name, type: t.actor?.type })));
    
    const enforceRAW = game.settings.get("pf2e-visioner", "enforceRawRequirements");
    console.log(`[DEBUG SNEAK] Enforce RAW: ${enforceRAW}`);
    
    if (!enforceRAW) return base;
    
    const { getVisibilityBetween } = await import("../../../utils.js");
    const final = base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actionData.actor);
        console.log(`[DEBUG SNEAK] Token ${observer.name} visibility: ${vis}`);
        return vis === "hidden" || vis === "undetected";
      } catch (_) { 
        console.log(`[DEBUG SNEAK] Token ${observer.name} visibility check failed`);
        return false; 
      }
    });
    
    console.log(`[DEBUG SNEAK] Final subjects: ${final.length}`);
    return final;
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { extractPerceptionDC, determineOutcome } = await import("../infra/shared-utils.js");
    const current = getVisibilityBetween(subject, actionData.actor);

    console.log(`[DEBUG SNEAK] Analyzing outcome for ${subject.name}:`);
    console.log(`[DEBUG SNEAK] Current visibility: ${current}`);
    console.log(`[DEBUG SNEAK] Action data roll:`, actionData?.roll);

    // Calculate roll information (stealth vs observer's perception DC)
    const dc = extractPerceptionDC(subject);
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const margin = total - dc;
    const outcome = determineOutcome(total, die, dc);

    console.log(`[DEBUG SNEAK] DC: ${dc}, Total: ${total}, Die: ${die}, Outcome: ${outcome}`);

    // Determine default new visibility using centralized mapping
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    const newVisibility = getDefaultNewStateFor("sneak", current, outcome) || current;

    console.log(`[DEBUG SNEAK] New visibility: ${newVisibility}, Changed: ${newVisibility !== current}`);

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


