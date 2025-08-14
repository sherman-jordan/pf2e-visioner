import { appliedSeekChangesByMessage } from "../data/message-cache.js";
import { ActionHandlerBase } from "./base-action.js";

export class SeekActionHandler extends ActionHandlerBase {
  constructor() { super("seek"); }
  getApplyActionName() { return "apply-now-seek"; }
  getRevertActionName() { return "revert-now-seek"; }
  getCacheMap() { return appliedSeekChangesByMessage; }
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import("../infra/roll-utils.js");
    ensureActionRoll(actionData);
  }

  async discoverSubjects(actionData) {
    // Discover targets based on current canvas tokens and encounter settings, plus hidden walls
    const { shouldFilterAlly, hasActiveEncounter, calculateTokenDistance } = await import("../infra/shared-utils.js");
    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    let potential = allTokens
      .filter((t) => t && t.actor)
      // Exclude the acting token reliably by id when possible
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      .filter((t) => !shouldFilterAlly(actionData.actor, t, "enemies"));

    // Add hidden walls as discoverable subjects (as pseudo-tokens with dc)
    try {
      const { MODULE_ID } = await import("../../../constants.js");
      const walls = (canvas?.walls?.placeables || []).filter((w) => !!w?.document?.getFlag?.(MODULE_ID, "hiddenWall"));
      const wallSubjects = walls.map((w) => {
        const d = w.document;
        const dcOverride = Number(d.getFlag?.(MODULE_ID, "stealthDC"));
        const defaultDC = Number(game.settings.get(MODULE_ID, "wallStealthDC")) || 15;
        const dc = Number.isFinite(dcOverride) && dcOverride > 0 ? dcOverride : defaultDC;
        return { _isWall: true, wall: w, dc };
      });
      potential = potential.concat(wallSubjects);
    } catch (_) {}
    
    // Optional distance limitation based on settings (combat vs out-of-combat)
    try {
      const inCombat = hasActiveEncounter();
      const limitInCombat = !!game.settings.get("pf2e-visioner", "limitSeekRangeInCombat");
      const limitOutOfCombat = !!game.settings.get("pf2e-visioner", "limitSeekRangeOutOfCombat");
      const shouldLimit = (inCombat && limitInCombat) || (!inCombat && limitOutOfCombat);
      if (shouldLimit) {
        const maxFeet = Number(
          inCombat
            ? game.settings.get("pf2e-visioner", "customSeekDistance")
            : game.settings.get("pf2e-visioner", "customSeekDistanceOutOfCombat"),
        );
        if (Number.isFinite(maxFeet) && maxFeet > 0) {
          potential = potential.filter((t) => {
            const d = calculateTokenDistance(actionData.actor, t);
            return !Number.isFinite(d) || d <= maxFeet;
          });
        }
      }
    } catch (_) {}

    // Do not pre-filter by encounter; the dialog applies encounter filter as needed
    return potential;
  }

  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import("../../../utils.js");
    const { extractStealthDC, determineOutcome } = await import("../infra/shared-utils.js");
    const { MODULE_ID } = await import("../../../constants.js");
    let current = "hidden";
    let dc = 0;
    let targetToken = subject;
    if (subject && subject._isWall) {
      // Walls: use provided dc and evaluate new state vs current observer wall state
      dc = Number(subject.dc) || 15;
      targetToken = actionData.actor; // visibility state applies to wall map per observer; reuse actor for presentation
      try {
        const map = actionData.actor?.document?.getFlag?.(MODULE_ID, "walls") || {};
        current = map?.[subject.wall?.id] || "hidden";
      } catch (_) { current = "hidden"; }
    } else {
      current = getVisibilityBetween(actionData.actor, subject);
      // For loot actors, use the custom Stealth DC flag configured on the token; otherwise use Perception DC
      dc = extractStealthDC(subject);
    }
    const total = Number(actionData?.roll?.total ?? 0);
    const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    const { getDefaultNewStateFor } = await import("../data/action-state-config.js");
    let newVisibility = getDefaultNewStateFor("seek", current, outcome) || current;

    // Build display metadata for walls
    let wallMeta = {};
    if (subject?._isWall) {
      try {
        const d = subject.wall?.document;
        const isDoor = Number(d?.door) > 0;
        const name = d?.getFlag?.(MODULE_ID, "wallIdentifier") || "Hidden Wall";
        const svg = isDoor
          ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect x='6' y='4' width='16' height='20' rx='2' ry='2' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/><circle cx='19' cy='14' r='1.5' fill='#e6e6e6'/></svg>`
          : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect x='4' y='4' width='20' height='20' fill='#1e1e1e' stroke='#cccccc' stroke-width='2'/><path d='M8 6v16M14 6v16M20 6v16' stroke='#888888' stroke-width='2'/></svg>`;
        const img = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        wallMeta = { _isWall: true, wallId: subject.wall?.id, wallIdentifier: name, wallImg: img };
      } catch (_) {}
    }

    const base = {
      target: subject._isWall ? actionData.actor : subject,
      dc,
      // Keep legacy fields while also providing explicit names used by templates
      roll: total,
      die,
      rollTotal: total,
      dieResult: die,
      margin: total - dc,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      newVisibility,
      changed: newVisibility !== current,
      ...wallMeta,
    };

    // If a seek template was provided, ensure the target is within it; otherwise mark as unchanged to be filtered out later
    try {
      if (actionData.seekTemplateCenter && actionData.seekTemplateRadiusFeet) {
        const { isTokenWithinTemplate } = await import("../infra/shared-utils.js");
        const inside = isTokenWithinTemplate(actionData.seekTemplateCenter, actionData.seekTemplateRadiusFeet, subject);
        if (!inside) return { ...base, changed: false };
      }
    } catch (_) {}

    return base;
  }

  buildCacheEntryFromChange(change) {
    return { targetId: change.target?.id, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({ observer: actionData.actor, target: this.getTokenById(e.targetId), newVisibility: e.oldVisibility }))
      .filter((c) => c.target);
  }
}


