import { MODULE_ID } from "../../../constants.js";
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
      // Always include hazards and loot in seek results regardless of ally filtering
      .filter((t) => {
        if (t.actor?.type === "hazard" || t.actor?.type === "loot") return true;
        // Prefer dialog's ignoreAllies when provided
        // Discovery should not apply ignoreAllies when null/undefined; allow dialog to filter live
        const preferIgnore = (actionData?.ignoreAllies === true || actionData?.ignoreAllies === false) ? actionData.ignoreAllies : null;
        return !shouldFilterAlly(actionData.actor, t, "enemies", preferIgnore);
      });

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
    const { MODULE_ID } = await import("../../../constants.js");
    const { extractStealthDC, hasConcealedCondition, determineOutcome } = await import("../infra/shared-utils.js");
    
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
      
      // Proficiency gating for hazards/loot
      try {
        if (subject?.actor && (subject.actor.type === "hazard" || subject.actor.type === "loot")) {
          const minRank = Number(subject.document?.getFlag?.(MODULE_ID, "minPerceptionRank") ?? 0);
          if (Number.isFinite(minRank) && minRank > 0) {
            const stat = actionData.actor?.actor?.getStatistic?.("perception");
            const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
            if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
              const dcBlocked = extractStealthDC(subject) || 0;
              const total = Number(actionData?.roll?.total ?? 0);
              const die = Number(actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0);
              return {
                target: subject,
                dc: dcBlocked,
                roll: total,
                die,
                rollTotal: total,
                dieResult: die,
                margin: total - dcBlocked,
                outcome: "no-proficiency",
                currentVisibility: current,
                oldVisibility: current,
                newVisibility: current,
                changed: false,
                noProficiency: true,
              };
            }
          }
        }
      } catch (_) {}
      
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
    // Support both token and wall changes in cache
    if (change?.wallId) {
      return { wallId: change.wallId, oldVisibility: change.oldVisibility };
    }
    return { targetId: change.target?.id, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, actionData) {
    const changes = [];
    for (const e of entries) {
      if (e?.wallId) {
        // Revert wall state on the seeker back to previous visibility (default hidden)
        const prev = typeof e.oldVisibility === "string" ? e.oldVisibility : "hidden";
        changes.push({ observer: actionData.actor, wallId: e.wallId, newWallState: prev });
      } else if (e?.targetId) {
        const tgt = this.getTokenById(e.targetId);
        if (tgt) changes.push({ observer: actionData.actor, target: tgt, newVisibility: e.oldVisibility });
      }
    }
    return changes;
  }

  // For walls, return a change describing wallId + desired state instead of token target
  outcomeToChange(actionData, outcome) {
    try {
      if (outcome?._isWall && outcome?.wallId) {
        const effective = outcome?.overrideState || outcome?.newVisibility || null;
        return {
          observer: actionData.actor,
          wallId: outcome.wallId,
          newWallState: effective,
          oldVisibility: outcome?.oldVisibility || outcome?.currentVisibility || null,
        };
      }
    } catch (_) {}
    return super.outcomeToChange(actionData, outcome);
  }

  // Apply token visibility changes as usual, and also persist wall visibility for the seeker
  async applyChangesInternal(changes) {
    try {
      const tokenChanges = [];
      const wallChangesByObserver = new Map();
      for (const ch of changes) {
        if (ch?.wallId) {
          const obsId = ch?.observer?.id;
          if (!obsId) continue;
          if (!wallChangesByObserver.has(obsId)) wallChangesByObserver.set(obsId, { observer: ch.observer, walls: new Map() });
          wallChangesByObserver.get(obsId).walls.set(ch.wallId, ch.newWallState);
        } else {
          tokenChanges.push(ch);
        }
      }

      // First apply token visibility changes (if any)
      if (tokenChanges.length > 0) {
        const { applyVisibilityChanges } = await import("../infra/shared-utils.js");
        const groups = this.groupChangesByObserver(tokenChanges);
        for (const group of groups) {
          await applyVisibilityChanges(group.observer, group.items.map((i) => ({ target: i.target, newVisibility: i.newVisibility })), { direction: this.getApplyDirection() });
        }
      }

      // Then persist wall states for each observer
      if (wallChangesByObserver.size > 0) {
        for (const { observer, walls } of wallChangesByObserver.values()) {
          try {
            const doc = observer?.document;
            if (!doc) continue;
            const current = doc.getFlag?.(MODULE_ID, "walls") || {};
            const next = { ...current };
            const { expandWallIdWithConnected } = await import("../../../services/connected-walls.js");
            for (const [wallId, state] of walls.entries()) {
              // Default to 'observed' on success; keep 'hidden' otherwise
              const eff = typeof state === "string" ? state : "observed";
              const applied = eff === "undetected" || eff === "hidden" ? "hidden" : "observed";
              const ids = expandWallIdWithConnected(wallId);
              for (const id of ids) next[id] = applied;
            }
            await doc.setFlag?.(MODULE_ID, "walls", next);
            try {
              const { updateWallVisuals } = await import("../../../services/visual-effects.js");
              await updateWallVisuals(observer.id);
            } catch (_) {}
          } catch (e) { /* ignore per-observer wall errors */ }
        }
      }
    } catch (e) {
      // Fallback to base implementation if something goes wrong
      return super.applyChangesInternal(changes);
    }
  }
}


