// Base class for action logic. Subclasses must implement abstract hooks.

import { log, notify } from "../infra/notifications.js";

export class ActionHandlerBase {
  constructor(actionType) {
    this.actionType = actionType;
  }

  // Abstracts that subclasses should implement
  getApplyActionName() {
    switch (this.actionType) {
      case "seek": return "apply-now-seek";
      case "point-out": return "apply-now-point-out";
      case "hide": return "apply-now-hide";
      case "sneak": return "apply-now-sneak";
      case "create-a-diversion": return "apply-now-diversion";
      case "consequences": return "apply-now-consequences";
      case "take-cover": return "apply-now-take-cover";
      default: return "";
    }
  }
  getRevertActionName() {
    switch (this.actionType) {
      case "seek": return "revert-now-seek";
      case "point-out": return "revert-now-point-out";
      case "hide": return "revert-now-hide";
      case "sneak": return "revert-now-sneak";
      case "create-a-diversion": return "revert-now-diversion";
      case "consequences": return "revert-now-consequences";
      case "take-cover": return "revert-now-take-cover";
      default: return "";
    }
  }
  getApplyDirection() { return "observer_to_target"; }
  getCacheMap() { return null; }

  // Optional hooks for subclasses
  async ensurePrerequisites(_actionData) {}
  async discoverSubjects(_actionData) { throw new Error("discoverSubjects must be implemented in subclass"); }
  async analyzeOutcome(_actionData, _subject) { throw new Error("analyzeOutcome must be implemented in subclass"); }

  // Resolve the token id associated with an outcome (for overrides). Subclasses may override.
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  // Apply user-selected overrides from actionData.overrides onto computed outcomes
  applyOverrides(actionData, outcomes) {
    try {
      const overrides = actionData?.overrides;
      if (!overrides || typeof overrides !== "object") return outcomes;
      const overridesMap = new Map(Object.entries(overrides));
      for (const outcome of outcomes) {
        const id = this.getOutcomeTokenId(outcome);
        if (!id) continue;
        if (!overridesMap.has(id)) continue;
        const overrideState = overridesMap.get(id);
        if (typeof overrideState !== "string" || !overrideState) continue;
        outcome.newVisibility = overrideState;
        const baseOld = outcome.oldVisibility ?? outcome.currentVisibility;
        if (baseOld) outcome.changed = overrideState !== baseOld;
      }
      return outcomes;
    } catch (_) {
      return outcomes;
    }
  }

  // Map outcomes to change objects { observer, target, newVisibility, oldVisibility }
  // Default: observer is actor, target is outcome.target
  outcomeToChange(actionData, outcome) {
    return {
      observer: actionData.actor,
      target: outcome.target,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility ?? outcome.currentVisibility,
    };
  }

  buildCacheEntryFromChange(_change) { return null; }

  // Util: group changes by observer token id
  groupChangesByObserver(changes) {
    const map = new Map();
    for (const ch of changes) {
      const obsId = ch.observer?.id;
      if (!obsId) continue;
      if (!map.has(obsId)) map.set(obsId, { observer: ch.observer, items: [] });
      map.get(obsId).items.push({ target: ch.target, newVisibility: ch.newVisibility, oldVisibility: ch.oldVisibility });
    }
    return Array.from(map.values());
  }

  // Default apply implementation
  async apply(actionData, button) {
    try {
      await this.ensurePrerequisites(actionData);

      const subjects = await this.discoverSubjects(actionData);
      const outcomes = [];
      for (const subject of subjects) {
        outcomes.push(await this.analyzeOutcome(actionData, subject));
      }
      // Apply overrides from the UI if provided
      this.applyOverrides(actionData, outcomes);
      // Start with all changed outcomes
      let filtered = outcomes.filter((o) => o && o.changed);
      // If overrides were provided, restrict application strictly to those ids
      try {
        const overrides = actionData?.overrides;
        if (overrides && typeof overrides === "object" && Object.keys(overrides).length > 0) {
          const allowedIds = new Set(Object.keys(overrides));
          filtered = filtered.filter((o) => allowedIds.has(this.getOutcomeTokenId(o)));
        }
      } catch (_) {}
      if (filtered.length === 0) { notify.info("No changes to apply"); return 0; }
      // Build changes; when overrides are present, also attach overrideState explicitly
      let overridesMap = null;
      try {
        if (actionData?.overrides && typeof actionData.overrides === "object") {
          overridesMap = new Map(Object.entries(actionData.overrides));
        }
      } catch (_) {}
      const changes = filtered
        .map((o) => {
          const ch = this.outcomeToChange(actionData, o);
          if (overridesMap) {
            const id = this.getOutcomeTokenId(o);
            if (id && overridesMap.has(id)) {
              ch.overrideState = overridesMap.get(id);
            }
          }
          return ch;
        })
        .filter(Boolean);

      await this.applyChangesInternal(changes);
      this.cacheAfterApply(actionData, changes);
      this.updateButtonToRevert(button);
      return changes.length;
    } catch (e) {
      log.error(e);
      return 0;
    }
  }

  async applyChangesInternal(changes) {
    const { applyVisibilityChanges } = await import("../infra/shared-utils.js");
    const direction = this.getApplyDirection();
    // Group by observer and apply batched
    const groups = this.groupChangesByObserver(changes);
    for (const group of groups) {
      await applyVisibilityChanges(group.observer, group.items.map((i) => ({ target: i.target, newVisibility: i.newVisibility })), { direction });
    }
  }

  cacheAfterApply(actionData, changes) {
    try {
      const cache = this.getCacheMap();
      if (!cache) return;
      const existing = cache.get(actionData.messageId) || [];
      const entries = changes.map((c) => this.buildCacheEntryFromChange(c)).filter(Boolean);
      cache.set(actionData.messageId, existing.concat(entries));
    } catch (_) {}
  }

  updateButtonToRevert(button) {
    if (!button) return;
    try { button.html('<i class="fas fa-undo"></i> Revert Changes').attr("data-action", this.getRevertActionName()); } catch (_) {}
  }

  updateButtonToApply(button) {
    if (!button) return;
    try { button.html('<i class="fas fa-check-double"></i> Apply Changes').attr("data-action", this.getApplyActionName()); } catch (_) {}
  }

  // Revert logic
  async revert(actionData, button) {
    try {
      const changesFromCache = await this.buildChangesFromCache(actionData);
      let changes = changesFromCache && changesFromCache.length ? changesFromCache : await this.fallbackRevertChanges(actionData);
      
      // Filter changes by targetTokenId if specified (for per-row revert)
      if (actionData.targetTokenId && changes && changes.length > 0) {
        changes = changes.filter(change => {
          const tokenId = change.observer?.id || change.target?.id;
          return tokenId === actionData.targetTokenId;
        });
      }
      
      if (!changes || changes.length === 0) { notify.info("Nothing to revert"); return; }
      await this.applyChangesInternal(changes);
      
      // Only clear cache if reverting all tokens (no targetTokenId specified)
      if (!actionData.targetTokenId) {
        this.clearCache(actionData);
      } else {
        // For per-row revert, remove only the specific token from cache
        this.removeFromCache(actionData, actionData.targetTokenId);
      }
      
      this.updateButtonToApply(button);
    } catch (e) {
      log.error(e);
    }
  }

  async buildChangesFromCache(actionData) {
    const cache = this.getCacheMap();
    if (!cache) return [];
    const entries = cache.get(actionData.messageId) || [];
    return this.entriesToRevertChanges(entries, actionData);
  }

  // Subclasses should override according to their cache shape
  entriesToRevertChanges(_entries, _actionData) { return []; }

  async fallbackRevertChanges(actionData) {
    // Default: recompute outcomes and revert to oldVisibility
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({ observer: actionData.actor, target: o.target, newVisibility: o.oldVisibility || o.currentVisibility }));
  }

  clearCache(actionData) {
    try { this.getCacheMap()?.delete(actionData.messageId); } catch (_) {}
  }

  removeFromCache(actionData, targetTokenId) {
    try {
      const cache = this.getCacheMap();
      if (!cache) return;
      
      const entries = cache.get(actionData.messageId) || [];
      const filteredEntries = entries.filter(entry => {
        // Remove entries that match the target token ID
        const entryTokenId = entry.observerId || entry.targetId || entry.tokenId;
        return entryTokenId !== targetTokenId;
      });
      
      if (filteredEntries.length === 0) {
        cache.delete(actionData.messageId);
      } else {
        cache.set(actionData.messageId, filteredEntries);
      }
    } catch (_) {}
  }

  // Helpers
  getTokenById(tokenId) {
    return canvas?.tokens?.get?.(tokenId) || canvas.tokens.placeables.find((t) => t.id === tokenId) || null;
  }
}


