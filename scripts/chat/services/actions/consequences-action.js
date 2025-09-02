import { MODULE_ID, VISIBILITY_STATES } from '../../../constants.js';
import { appliedConsequencesChangesByMessage } from '../data/message-cache.js';
import { log, notify } from '../infra/notifications.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

export class ConsequencesActionHandler extends ActionHandlerBase {
  constructor() {
    super('consequences');
  }
  getCacheMap() {
    return appliedConsequencesChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }
  async discoverSubjects(actionData) {
    const tokens = canvas?.tokens?.placeables || [];
    const attacker = actionData?.actor || null;

    // Apply RAW enforcement if enabled
    const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');

    // Exclude attacker itself, hazards, and loot tokens from observers
    let potential = tokens.filter((t) => {
      try {
        if (!t || !t.actor) return false;
        if (attacker && t.id === attacker.id) return false;
        const type = t.actor?.type;
        if (type === 'hazard' || type === 'loot') return false;
        // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
        if (
          shouldFilterAlly(
            attacker,
            t,
            'enemies',
            actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
              ? actionData.ignoreAllies
              : null,
          )
        )
          return false;
        return true;
      } catch (_) {
        return false;
      }
    });

    // Apply RAW enforcement if enabled
    if (enforceRAW) {
      const { getVisibilityBetween } = await import('../../../utils.js');

      // Filter to only include targets that the attacker is Hidden or Undetected from
      potential = potential.filter((subject) => {
        try {
          // Check visibility state from the subject's perspective toward the attacker
          const visibility = getVisibilityBetween(subject, attacker);
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
        notify.warn(
          'No valid targets found for Attack Consequences. According to RAW, you can only see consequences from targets that you are Hidden or Undetected from.',
        );
      }
    }

    return potential;
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const currentVisibility = getVisibilityBetween(subject, actionData.actor);
    return {
      target: subject,
      currentVisibility,
      oldVisibility: currentVisibility,
      oldVisibilityLabel: VISIBILITY_STATES[currentVisibility]?.label || currentVisibility,
      changed: currentVisibility === 'hidden' || currentVisibility === 'undetected',
      newVisibility: 'observed',
    };
  }
  outcomeToChange(actionData, outcome) {
    // Use the outcome's newVisibility if set (from overrides), otherwise default to "observed"
    const newVisibility = outcome.newVisibility || 'observed';
    return {
      observer: outcome.target,
      target: actionData.actor,
      newVisibility,
      oldVisibility: outcome.currentVisibility,
    };
  }
  buildCacheEntryFromChange(change) {
    return { observerId: change.observer?.id, oldVisibility: change.oldVisibility };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData?.actor || null,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target);
  }
  async fallbackRevertChanges(actionData) {
    // Recompute outcomes and revert observers back to their recorded old/current visibility toward the attacker
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.target,
      target: actionData.actor,
      newVisibility: o.currentVisibility,
    }));
  }

  // Ensure chat "Apply Changes" matches dialog "Apply All"
  async apply(actionData, button) {
    try {
      await this.ensurePrerequisites(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
      // Apply overrides from chat (if any)
      this.applyOverrides(actionData, outcomes);

      // Start with changed outcomes
      const changed = outcomes.filter((o) => o && o.changed);

      // Respect encounter filter if requested
      let filtered = changed;
      try {
        if (typeof actionData?.encounterOnly === 'boolean') {
          const { filterOutcomesByEncounter } = await import('../infra/shared-utils.js');
          filtered = filterOutcomesByEncounter(changed, actionData.encounterOnly, 'target');
        }
      } catch (_) {}

      if (filtered.length === 0) {
        notify.info('No changes to apply');
        return 0;
      }

      // Build changes, prefer any override provided for that token id
      let overridesMap = null;
      try {
        if (actionData?.overrides && typeof actionData.overrides === 'object') {
          overridesMap = new Map(Object.entries(actionData.overrides));
        }
      } catch (_) {}
      const changes = filtered
        .map((o) => {
          const ch = this.outcomeToChange(actionData, o);
          if (overridesMap) {
            const id = this.getOutcomeTokenId(o);
            if (id && overridesMap.has(id)) ch.overrideState = overridesMap.get(id);
          }
          return ch;
        })
        .filter(Boolean);

      await this.applyChangesInternal(changes);

      // Explicitly persist visibility maps for observers toward attacker in one scene batch
      try {
        const { getVisibilityMap } = await import('../../../utils.js');
        const groups = this.groupChangesByObserver(changes);
        const updates = [];
        for (const group of groups) {
          const observer = group.observer;
          if (!observer?.document?.id) continue;
          const current = { ...(getVisibilityMap(observer) || {}) };
          for (const item of group.items) {
            const targetId = item?.target?.id;
            if (!targetId) continue;
            const state = item?.overrideState || item?.newVisibility;
            if (!state || state === 'observed') delete current[targetId];
            else current[targetId] = state;
          }
          const update = { _id: observer.document.id };
          if (Object.keys(current).length === 0) update[`flags.${MODULE_ID}.-=visibility`] = null;
          else update[`flags.${MODULE_ID}.visibility`] = current;
          updates.push(update);
        }
        if (updates.length) await canvas.scene.updateEmbeddedDocuments('Token', updates);
      } catch (_) {}

      this.cacheAfterApply(actionData, changes);
      this.updateButtonToRevert(button);
      return changes.length;
    } catch (e) {
      log.error(e);
      return 0;
    }
  }
}
