import { MODULE_ID } from '../../../constants.js';
import { appliedSeekChangesByMessage } from '../data/message-cache.js';
import { ActionHandlerBase } from './base-action.js';

export class SeekActionHandler extends ActionHandlerBase {
  constructor() {
    super('seek');
  }
  getApplyActionName() {
    return 'apply-now-seek';
  }
  getRevertActionName() {
    return 'revert-now-seek';
  }
  getCacheMap() {
    return appliedSeekChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }

  async discoverSubjects(actionData) {
    // Discover targets based on current canvas tokens and encounter settings, plus hidden walls
    const { shouldFilterAlly, hasActiveEncounter, calculateTokenDistance } = await import(
      '../infra/shared-utils.js'
    );
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { MODULE_ID } = await import('../../../constants.js');

    const allTokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;
    let potential = allTokens
      .filter((t) => t && t.actor)
      // Exclude the acting token reliably by id when possible
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Always include hazards and loot in seek results regardless of ally filtering
      .filter((t) => {
        if (t.actor?.type === 'hazard' || t.actor?.type === 'loot') return true;
        // Prefer dialog's ignoreAllies when provided; otherwise do NOT filter here.
        // Let the dialog handle live ally filtering so the checkbox can reveal allies.
        const preferIgnore =
          actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
            ? actionData.ignoreAllies
            : null;
        if (preferIgnore !== true) return true; // keep allies when unchecked or unspecified
        return !shouldFilterAlly(actionData.actor, t, 'enemies', true);
      });

    // Add hidden walls as discoverable subjects (as pseudo-tokens with dc)
    try {
      // Only include hidden walls as valid Seek targets
      const allWalls = canvas?.walls?.placeables || [];
      const hiddenWalls = allWalls.filter((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));

      const wallSubjects = hiddenWalls.map((w) => {
        const d = w.document;
        // Check if this is a hidden wall with custom DC
        const dcOverride = Number(d.getFlag?.(MODULE_ID, 'stealthDC'));
        const isHiddenWall = !!d.getFlag?.(MODULE_ID, 'hiddenWall');

        if (isHiddenWall && Number.isFinite(dcOverride) && dcOverride > 0) {
          // Hidden wall with custom DC
          return { _isWall: true, _isHiddenWall: true, wall: w, dc: dcOverride };
        } else {
          // Hidden wall with default DC
          const defaultDC = Number(game.settings.get(MODULE_ID, 'wallStealthDC')) || 15;
          return { _isWall: true, _isHiddenWall: true, wall: w, dc: defaultDC };
        }
      });

      potential = potential.concat(wallSubjects);
    } catch (error) {
      console.error('Error processing walls in discoverSubjects:', error);
    }

    // Apply RAW enforcement if enabled
    const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');
    if (enforceRAW) {
      // Filter to only include targets that are Undetected or Hidden from the seeker
      potential = potential.filter((subject) => {
        try {
          if (subject._isWall) {
            // Hidden walls are always valid seek targets (they're hidden by definition)
            return true;
          }

          if (subject?.actor?.type === 'hazard' || subject?.actor?.type === 'loot') {
            // Hazards and loot are always valid seek targets
            return true;
          }

          // For regular tokens, check visibility state
          const visibility = getVisibilityBetween(actionData.actor, subject);
          const isValidTarget = visibility === 'undetected' || visibility === 'hidden';

          return isValidTarget;
        } catch (error) {
          console.warn('Error checking visibility for RAW enforcement:', error);
          // If we can't determine visibility, exclude the target to be safe
          return false;
        }
      });

      // If no valid targets found after RAW filtering, notify the user
      if (potential.length === 0) {
        const { notify } = await import('../infra/notifications.js');
        notify.warn(
          'No valid Seek targets found. According to RAW, you can only Seek targets that are Undetected or Hidden from you.',
        );
      }
    }

    // Optional distance limitation based on settings (combat vs out-of-combat)
    try {
      const inCombat = hasActiveEncounter();
      const limitInCombat = !!game.settings.get('pf2e-visioner', 'limitSeekRangeInCombat');
      const limitOutOfCombat = !!game.settings.get('pf2e-visioner', 'limitSeekRangeOutOfCombat');
      const shouldLimit = (inCombat && limitInCombat) || (!inCombat && limitOutOfCombat);
      if (shouldLimit) {
        const maxFeet = Number(
          inCombat
            ? game.settings.get('pf2e-visioner', 'customSeekDistance')
            : game.settings.get('pf2e-visioner', 'customSeekDistanceOutOfCombat'),
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
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { MODULE_ID } = await import('../../../constants.js');
    const { extractStealthDC, hasConcealedCondition, determineOutcome } = await import(
      '../infra/shared-utils.js'
    );

    let current = 'hidden';
    let dc = 0;
    let targetToken = subject;

    if (subject && subject._isWall) {
      // Walls: use provided dc and evaluate new state vs current observer wall state
      dc = Number(subject.dc) || 15;
      targetToken = actionData.actor; // visibility state applies to wall map per observer; reuse actor for presentation
      try {
        const map = actionData.actor?.document?.getFlag?.(MODULE_ID, 'walls') || {};
        current = map?.[subject.wall?.id] || 'hidden';
      } catch (_) {
        current = 'hidden';
      }
    } else {
      current = getVisibilityBetween(actionData.actor, subject);

      // Proficiency gating for hazards/loot
      try {
        if (subject?.actor && (subject.actor.type === 'hazard' || subject.actor.type === 'loot')) {
          const minRank = Number(subject.document?.getFlag?.(MODULE_ID, 'minPerceptionRank') ?? 0);
          if (Number.isFinite(minRank) && minRank > 0) {
            const stat = actionData.actor?.actor?.getStatistic?.('perception');
            const seekerRank = Number(stat?.proficiency?.rank ?? stat?.rank ?? 0);
            if (!(Number.isFinite(seekerRank) && seekerRank >= minRank)) {
              const dcBlocked = extractStealthDC(subject) || 0;
              const total = Number(actionData?.roll?.total ?? 0);
              const die = Number(
                actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
              );
              return {
                target: subject,
                dc: dcBlocked,
                roll: total,
                die,
                rollTotal: total,
                dieResult: die,
                margin: total - dcBlocked,
                outcome: 'no-proficiency',
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
    const die = Number(
      actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const outcome = determineOutcome(total, die, dc);
    // Simple mapping: success → observed; failure → concealed/hidden depending on target state; crit-failure → undetected
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('seek', current, outcome) || current;

    // Build display metadata for walls
    let wallMeta = {};
    if (subject?._isWall) {
      try {
        const d = subject.wall?.document;
        const doorType = Number(d?.door) || 0; // 0 wall, 1 door, 2 secret door
        const name =
          d?.getFlag?.(MODULE_ID, 'wallIdentifier') ||
          (doorType === 2 ? 'Hidden Secret Door' : doorType === 1 ? 'Hidden Door' : 'Hidden Wall');
        const { getWallImage } = await import('../../../utils.js');
        const img = getWallImage(doorType);
        wallMeta = {
          _isWall: true,
          wall: subject.wall,
          wallId: subject.wall?.id,
          wallIdentifier: name,
          wallImg: img,
        };
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
        const { isTokenWithinTemplate } = await import('../infra/shared-utils.js');

        let inside = false;
        if (subject?._isWall) {
          // For walls, check if the wall's center point is within the template
          try {
            const wallCenter = subject.wall?.center;
            if (wallCenter) {
              const distance = Math.sqrt(
                Math.pow(wallCenter.x - actionData.seekTemplateCenter.x, 2) +
                  Math.pow(wallCenter.y - actionData.seekTemplateCenter.y, 2),
              );
              const radiusPixels = (actionData.seekTemplateRadiusFeet * canvas.scene.grid.size) / 5;
              inside = distance <= radiusPixels;
            }
          } catch (_) {
            // If wall center calculation fails, assume it's not in template
            inside = false;
          }
        } else {
          // For tokens, use the existing function
          inside = isTokenWithinTemplate(
            actionData.seekTemplateCenter,
            actionData.seekTemplateRadiusFeet,
            subject,
          );
        }

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
    const tid = change?.target?.id || change?.targetId || null;
    return { targetId: tid, oldVisibility: change.oldVisibility };
  }

  entriesToRevertChanges(entries, actionData) {
    const changes = [];
    for (const e of entries) {
      if (e?.wallId) {
        // Revert wall state on the seeker back to previous visibility (default hidden)
        const prev = typeof e.oldVisibility === 'string' ? e.oldVisibility : 'hidden';
        changes.push({ observer: actionData.actor, wallId: e.wallId, newWallState: prev });
      } else if (e?.targetId) {
        const tgt = this.getTokenById(e.targetId);
        if (tgt)
          changes.push({ observer: actionData.actor, target: tgt, newVisibility: e.oldVisibility });
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

  // Override base to support wall overrides passed from UI
  applyOverrides(actionData, outcomes) {
    try {
      // Standard token overrides
      const base = super.applyOverrides(actionData, outcomes) || outcomes;
      // Wall overrides delivered as { __wall__: { [wallId]: state } }
      const wallMap = actionData?.overrides?.__wall__;
      if (wallMap && typeof wallMap === 'object') {
        for (const outcome of base) {
          if (outcome?._isWall && outcome?.wallId && wallMap[outcome.wallId]) {
            outcome.newVisibility = wallMap[outcome.wallId];
            outcome.changed =
              outcome.newVisibility !== (outcome.oldVisibility || outcome.currentVisibility);
            outcome.overrideState = wallMap[outcome.wallId];
          }
        }
      }
      return base;
    } catch (_) {
      return outcomes;
    }
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
          if (!wallChangesByObserver.has(obsId))
            wallChangesByObserver.set(obsId, { observer: ch.observer, walls: new Map() });
          wallChangesByObserver.get(obsId).walls.set(ch.wallId, ch.newWallState);
        } else {
          tokenChanges.push(ch);
        }
      }

      // First apply token visibility changes (if any)
      if (tokenChanges.length > 0) {
        const { applyVisibilityChanges } = await import('../infra/shared-utils.js');
        const groups = this.groupChangesByObserver(tokenChanges);
        for (const group of groups) {
          await applyVisibilityChanges(
            group.observer,
            group.items.map((i) => ({ target: i.target, newVisibility: i.newVisibility })),
            { direction: this.getApplyDirection() },
          );
        }
      }

      // Then persist wall states for each observer
      if (wallChangesByObserver.size > 0) {
        for (const { observer, walls } of wallChangesByObserver.values()) {
          try {
            const doc = observer?.document;
            if (!doc) continue;
            const current = doc.getFlag?.(MODULE_ID, 'walls') || {};
            const next = { ...current };
            const { expandWallIdWithConnected } = await import(
              '../../../services/connected-walls.js'
            );
            for (const [wallId, state] of walls.entries()) {
              const eff = typeof state === 'string' ? state : 'observed';
              const applied = eff === 'undetected' || eff === 'hidden' ? 'hidden' : 'observed';
              const ids = expandWallIdWithConnected(wallId);
              for (const id of ids) next[id] = applied;
            }
            await doc.setFlag?.(MODULE_ID, 'walls', next);
            try {
              const { updateWallVisuals } = await import('../../../services/visual-effects.js');
              await updateWallVisuals(observer.id);
            } catch (_) {}
          } catch (e) {
            /* ignore per-observer wall errors */
          }
        }
      }
    } catch (e) {
      // Fallback to base implementation if something goes wrong
      return super.applyChangesInternal(changes);
    }
  }

  // Ensure per-row apply with wall overrides is honored (skip base allowedIds filter)
  async apply(actionData, button) {
    try {
      await this.ensurePrerequisites(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) {
        outcomes.push(await this.analyzeOutcome(actionData, subject));
      }
      // Apply overrides (supports __wall__)
      this.applyOverrides(actionData, outcomes);

      // Keep only changed outcomes, but always include walls for display
      let filtered = outcomes.filter((o) => o && (o.changed || o._isWall));

      // If overrides specify a particular token/wall, limit to those only (per-row apply)
      try {
        const ov = actionData?.overrides || {};
        const wallMap =
          ov?.__wall__ && typeof ov.__wall__ === 'object'
            ? new Set(Object.keys(ov.__wall__))
            : new Set();
        const tokenMap = new Set(Object.keys(ov).filter((k) => k !== '__wall__'));
        if (wallMap.size > 0 || tokenMap.size > 0) {
          filtered = filtered.filter((o) => {
            if (o?._isWall && o?.wallId) return wallMap.has(o.wallId);
            const id = this.getOutcomeTokenId(o);
            return id ? tokenMap.has(id) : false;
          });
        }
      } catch (_) {}

      if (filtered.length === 0) {
        (await import('../infra/notifications.js')).notify.info('No changes to apply');
        return 0;
      }

      // Build changes for tokens and walls
      const changes = filtered.map((o) => this.outcomeToChange(actionData, o)).filter(Boolean);
      await this.applyChangesInternal(changes);
      this.cacheAfterApply(actionData, changes);
      this.updateButtonToRevert(button);
      return changes.length;
    } catch (e) {
      (await import('../infra/notifications.js')).log.error(e);
      return 0;
    }
  }
}
