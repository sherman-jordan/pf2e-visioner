/**
 * Public API for PF2E Per-Token Visibility
 */

import { MODULE_ID } from './constants.js';
import autoCoverSystem from './cover/auto-cover/AutoCoverSystem.js';
import { VisionerTokenManager } from './managers/token-manager/token-manager.js';
import {
  rebuildAndRefresh,
  removeAllReferencesToTarget,
  removeModuleEffectsFromActors,
  removeModuleEffectsFromTokenActors,
  removeObserverContributions,
  unsetMapsForTokens,
} from './services/api-internal.js';
import { manuallyRestoreAllPartyTokens } from './services/party-token-state.js';
import { refreshEveryonesPerception } from './services/socket.js';
import { updateTokenVisuals } from './services/visual-effects.js';
import {
  cleanupDeletedToken,
  getCoverBetween,
  getVisibility,
  setCoverBetween,
  setVisibilityBetween,
  showNotification,
} from './utils.js';
import { autoVisibilitySystem } from './visibility/auto-visibility/index.js';

/**
 * Main API class for the module
 */
export class Pf2eVisionerApi {
  // Internal helpers (not exported)
  static async _unsetMapsForTokens(scene, tokens) {
    return unsetMapsForTokens(scene, tokens);
  }

  static _collectModuleEffectIds() {
    return null;
  }

  static async _removeModuleEffectsFromActors(actors) {
    return removeModuleEffectsFromActors(actors);
  }

  static async _removeModuleEffectsFromTokenActors(tokens) {
    return removeModuleEffectsFromTokenActors(tokens);
  }

  static async _removeObserverContributions(observerToken, tokens) {
    return removeObserverContributions(observerToken, tokens);
  }

  static async _removeAllReferencesToTarget(targetToken, tokens) {
    return removeAllReferencesToTarget(targetToken, tokens, cleanupDeletedToken);
  }

  static async _rebuildAndRefresh() {
    return rebuildAndRefresh();
  }

  /**
   * Open the token manager for a specific observer token
   * @param {Token} observer - The observer token (optional, uses controlled tokens if not provided)
   * @param options - data to pass to the token manager constructor. mode can be 'observer' or 'target'
   */
  static async openTokenManager(observer = null, options = { mode: 'observer' }) {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility and cover');
      return;
    }

    // Use provided observer or get from controlled tokens
    if (!observer) {
      const controlled = canvas.tokens.controlled;
      if (controlled.length === 0) {
        showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED', 'warn');
        return;
      }
      observer = controlled[0];

      if (controlled.length > 1) {
        showNotification('PF2E_VISIONER.NOTIFICATIONS.MULTIPLE_OBSERVERS', 'warn');
        return;
      }
    }

    // Check if there's already an open instance
    if (VisionerTokenManager.currentInstance) {
      // If the observer is the same, just bring the existing dialog to front
      if (VisionerTokenManager.currentInstance.observer === observer) {
        if (
          VisionerTokenManager.currentInstance.rendered &&
          (VisionerTokenManager.currentInstance.element ||
            VisionerTokenManager.currentInstance.window)
        ) {
          VisionerTokenManager.currentInstance.bringToFront();
        } else {
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data
      VisionerTokenManager.currentInstance.updateObserver(observer);
      await VisionerTokenManager.currentInstance.render({ force: true });
      if (
        VisionerTokenManager.currentInstance.element ||
        VisionerTokenManager.currentInstance.window
      ) {
        VisionerTokenManager.currentInstance.bringToFront();
      }
      return VisionerTokenManager.currentInstance;
    }

    const manager = new VisionerTokenManager(observer, { mode: options.mode });
    await manager.render({ force: true });
    try {
      if (manager.element || manager.window) manager.bringToFront();
    } catch (_) {}
    return manager;
  }

  /**
   * Open the token manager with a specific mode
   * @param {Token} observer - The observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  static async openTokenManagerWithMode(observer, mode = 'observer') {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility and cover');
      return;
    }

    if (!observer) {
      showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED', 'warn');
      return;
    }

    // Check if there's already an open instance
    if (VisionerTokenManager.currentInstance) {
      // If the observer is the same, update mode if different and bring to front
      if (VisionerTokenManager.currentInstance.observer === observer) {
        if (VisionerTokenManager.currentInstance.mode !== mode) {
          VisionerTokenManager.currentInstance.mode = mode;
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        if (
          VisionerTokenManager.currentInstance.rendered &&
          (VisionerTokenManager.currentInstance.element ||
            VisionerTokenManager.currentInstance.window)
        ) {
          VisionerTokenManager.currentInstance.bringToFront();
        } else {
          await VisionerTokenManager.currentInstance.render({ force: true });
        }
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data and mode
      VisionerTokenManager.currentInstance.updateObserverWithMode(observer, mode);
      await VisionerTokenManager.currentInstance.render({ force: true });
      if (
        VisionerTokenManager.currentInstance.element ||
        VisionerTokenManager.currentInstance.window
      ) {
        VisionerTokenManager.currentInstance.bringToFront();
      }
      return VisionerTokenManager.currentInstance;
    }

    const manager = new VisionerTokenManager(observer, { mode });
    await manager.render({ force: true });
    try {
      if (manager.element || manager.window) manager.bringToFront();
    } catch (_) {}
    return manager;
  }

  /**
   * Bulk set visibility between subjects and their targets.
   * @param {Array<{observerId:string,targetId:string,state:string}>|Map<string,Array<{targetId:string,state:string}>>} updates
   *   Either an array of tuples, or a map of observerId -> array of { targetId, state }
   * @param {{direction?:"observer_to_target"|"target_to_observer", effectTarget?:"observer"|"subject"}} options
   */
  static async bulkSetVisibility(updates, options = {}) {
    const { batchUpdateVisibilityEffects } = await import('./visibility/ephemeral.js');
    const groups = new Map();
    if (updates instanceof Map) {
      for (const [observerId, arr] of updates.entries()) {
        const observer = canvas.tokens.get(observerId);
        if (!observer) continue;
        const prepared = [];
        for (const { targetId, state } of arr || []) {
          const target = canvas.tokens.get(targetId);
          if (target && typeof state === 'string' && state) prepared.push({ target, state });
        }
        if (prepared.length) groups.set(observer.id, { observer, prepared });
      }
    } else if (Array.isArray(updates)) {
      for (const u of updates) {
        const observer = canvas.tokens.get(u?.observerId);
        const target = canvas.tokens.get(u?.targetId);
        const state = u?.state;
        if (!observer || !target || typeof state !== 'string' || !state) continue;
        const key = observer.id;
        const entry = groups.get(key) || { observer, prepared: [] };
        entry.prepared.push({ target, state });
        groups.set(key, entry);
      }
    }
    for (const { observer, prepared } of groups.values()) {
      await batchUpdateVisibilityEffects(observer, prepared, options);
    }
  }

  /**
   * Get visibility state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {string|null} The visibility state, or null if tokens not found
   */
  static getVisibility(observerId, targetId) {
    try {
      return getVisibility(observerId, targetId);
    } catch (error) {
      console.error('Error getting visibility:', error);
      return null;
    }
  }

  /**
   * Set visibility state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @param {string} state - The visibility state to set ('observed', 'hidden', 'undetected', 'concealed')
   * @param {Object} options - Optional configuration
   * @param {boolean} options.skipEphemeralUpdate - Boolean (default: false)
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async setVisibility(observerId, targetId, state, options = {}) {
    try {
      // Validate visibility state
      const validStates = ['observed', 'hidden', 'undetected', 'concealed'];
      if (!validStates.includes(state)) {
        console.error(
          `Invalid visibility state: ${state}. Valid states are: ${validStates.join(', ')}`,
        );
        return false;
      }

      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return false;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return false;
      }

      // Set visibility using utility function
      await setVisibilityBetween(observerToken, targetToken, state, options);
      await updateTokenVisuals();

      return true;
    } catch (error) {
      console.error('Error setting visibility:', error);
      return false;
    }
  }

  /**
   * Update all token visuals manually
   */
  static async updateTokenVisuals() {
    await updateTokenVisuals();
  }

  // (Removed) updateEphemeralEffects: superseded by map/effects batch updaters

  /**
   * Get cover state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {string|null} The cover state, or null if tokens not found
   */
  static getCover(observerId, targetId) {
    try {
      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return null;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return null;
      }

      // Get cover using utility function
      return getCoverBetween(observerToken, targetToken);
    } catch (error) {
      console.error('Error getting cover:', error);
      return null;
    }
  }

  /**
   * Set cover state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @param {string} state - The cover state to set ('none', 'lesser', 'standard', 'greater')
   * @param {Object} options - Optional configuration
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async setCover(observerId, targetId, state, options = {}) {
    try {
      // Validate cover state
      const validStates = ['none', 'lesser', 'standard', 'greater'];
      if (!validStates.includes(state)) {
        console.error(`Invalid cover state: ${state}. Valid states are: ${validStates.join(', ')}`);
        return false;
      }

      // Get tokens from IDs
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken) {
        console.error(`Observer token not found with ID: ${observerId}`);
        return false;
      }

      if (!targetToken) {
        console.error(`Target token not found with ID: ${targetId}`);
        return false;
      }

      // Set cover using utility function
      await setCoverBetween(observerToken, targetToken, state, options);
      await updateTokenVisuals();

      return true;
    } catch (error) {
      console.error('Error setting cover:', error);
      return false;
    }
  }

  /**
   * Request clients to refresh their canvas
   */
  static refreshEveryonesPerception() {
    refreshEveryonesPerception();
  }

  /**
   * Manually restore all party token states
   * Useful when automatic restoration fails or for debugging
   */
  static async restorePartyTokens() {
    return manuallyRestoreAllPartyTokens();
  }

  /**
   * Get roll options for Rule Elements integration
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {Array<string>} Array of roll options
   */
  static getRollOptions(observerId, targetId) {
    const options = [];

    if (!observerId || !targetId) return options;

    // Get visibility state between observer and target
    const visibilityState = this.getVisibility(observerId, targetId);
    if (visibilityState) {
      // Add visibility-specific roll options
      options.push(`per-token-visibility:target:${visibilityState}`);
    }

    // Get cover state between observer and target
    const coverState = this.getCover(observerId, targetId);
    if (coverState) {
      // Add cover-specific roll options
      options.push(`per-token-cover:target:${coverState}`);
    }

    // Get observer token for capabilities check
    const observerToken = canvas.tokens.get(observerId);
    if (observerToken?.actor) {
      // Add observer capabilities (if implemented)
      if (observerToken.actor.system?.traits?.senses?.darkvision) {
        options.push('per-token-visibility:observer:has-darkvision');
      }

      if (observerToken.actor.system?.traits?.senses?.tremorsense) {
        options.push('per-token-visibility:observer:has-tremorsense');
      }
    }

    return options;
  }

  /**
   * Register roll options for integration with PF2E roll system
   * This would typically be called during a roll preparation
   * @param {object} rollOptions - The roll options object to modify
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   */
  static addRollOptions(rollOptions, observerId, targetId) {
    const moduleOptions = this.getRollOptions(observerId, targetId);
    moduleOptions.forEach((option) => {
      rollOptions[option] = true;
    });
  }

  /**
   * Get all available visibility states
   * @returns {Array<string>} Array of valid visibility states
   */
  static getVisibilityStates() {
    return ['observed', 'hidden', 'undetected', 'concealed'];
  }

  /**
   * Get all available cover states
   * @returns {Array<string>} Array of valid cover states
   */
  static getCoverStates() {
    return ['none', 'lesser', 'standard', 'greater'];
  }

  /**
   * Clear all PF2E Visioner scene data for all tokens
   * - Resets visibility/cover maps on all scene tokens
   * - Removes module-created ephemeral and aggregate effects from all actors
   * - Clears module scene caches
   * - Refreshes visuals and perception
   */
  static async clearAllSceneData() {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear Visioner scene data');
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn('No active scene.');
        return false;
      }

      // 1) Bulk-reset flags on all scene tokens (hard remove the maps)
      const tokens = canvas.tokens?.placeables ?? [];
      const updates = tokens.map((t) => ({
        _id: t.id,
        // Use Foundry removal syntax to ensure full deletion of maps
        [`flags.${MODULE_ID}.-=visibility`]: null,
        [`flags.${MODULE_ID}.-=cover`]: null,
      }));
      if (updates.length && scene.updateEmbeddedDocuments) {
        try {
          await scene.updateEmbeddedDocuments('Token', updates, {
            diff: false,
          });
        } catch (_) {}
      }

      // 2) Clear scene-level caches used by the module
      try {
        // Only GMs can update scene flags
        if (game.user.isGM) {
          await scene.setFlag(MODULE_ID, 'deletedEntryCache', {});
        }
      } catch (_) {}

      // 3) Remove module-created effects from all actors and token-actors (handles unlinked tokens)
      try {
        const actors = Array.from(game.actors ?? []);
        for (const actor of actors) {
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch (_) {}
          }
        }

        // Also purge effects on token-actors (unlinked tokens won't be in game.actors)
        for (const tok of tokens) {
          const a = tok?.actor;
          if (!a) continue;
          const effects = a?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!a.items.get(id));
          if (toDelete.length) {
            try {
              await a.deleteEmbeddedDocuments('Item', toDelete);
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 4) Optional extra sweep for cover effects across all actors
      try {
        const { cleanupAllCoverEffects } = await import('./cover/ephemeral.js');
        await cleanupAllCoverEffects();
      } catch (_) {}

      // 5) Rebuild effects and refresh visuals/perception
      // Removed effects-coordinator: bulk rebuild handled elsewhere
      try {
        await updateTokenVisuals();
      } catch (_) {}
      try {
        refreshEveryonesPerception();
      } catch (_) {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch (_) {}

      ui.notifications.info('PF2E Visioner: Cleared all scene data.');
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing scene data:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear scene data. See console.');
      return false;
    }
  }

  /**
   * Clear all PF2E Visioner data for a single token (selected or provided)
   * - As observer: remove its visibility/cover maps and its contributed effects on all targets
   * - As target: remove all observers' entries that point to this token and related effects
   */
  static async clearAllDataForSelectedToken(token = null) {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear Visioner data');
        return false;
      }

      // Resolve token
      let selected = token;
      if (!selected) {
        const controlled = canvas.tokens?.controlled ?? [];
        if (controlled.length !== 1) {
          ui.notifications.warn(
            controlled.length === 0 ? 'No token selected.' : 'Select a single token.',
          );
          return false;
        }
        selected = controlled[0];
      }
      if (!selected?.actor) return false;

      const scene = canvas?.scene;
      if (!scene) return false;

      const tokens = canvas.tokens?.placeables ?? [];

      // 1) As observer: delete this token's maps and remove effects it contributed on targets
      try {
        const unset = {
          _id: selected.id,
          [`flags.${MODULE_ID}.-=visibility`]: null,
          [`flags.${MODULE_ID}.-=cover`]: null,
        };
        await scene.updateEmbeddedDocuments('Token', [unset], { diff: false });
      } catch (_) {}

      // Visibility effects contributed by this observer → remove from all targets
      try {
        const targetUpdates = tokens
          .filter((t) => t.id !== selected.id && t?.actor)
          .map((t) => ({ target: t, state: 'observed' }));
        if (targetUpdates.length) {
          await batchUpdateOffGuardEffects(selected, targetUpdates, {
            removeAllEffects: true,
          });
        }
      } catch (_) {}

      // Cover effects contributed by this observer → remove from all targets
      try {
        for (const t of tokens) {
          if (!t?.actor || t.id === selected.id) continue;
          await cleanupCoverEffectsForObserver(t, selected);
        }
      } catch (_) {}

      // 2) As target: remove this token from all observers' maps and effects
      try {
        await cleanupDeletedToken(selected.document);
      } catch (_) {}

      try {
        for (const obs of tokens) {
          if (!obs?.actor || obs.id === selected.id) continue;
          await cleanupOffGuardEffectsForTarget(obs, selected);
          await cleanupCoverEffectsForObserver(selected, obs);
        }
      } catch (_) {}

      // 3) Rebuild/refresh
      // Removed effects-coordinator: bulk rebuild handled elsewhere
      try {
        await updateTokenVisuals();
      } catch (_) {}
      try {
        refreshEveryonesPerception();
      } catch (_) {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch (_) {}

      ui.notifications.info('PF2E Visioner: Cleared data for selected token.');
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing data for selected token:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear token data. See console.');
      return false;
    }
  }

  /**
   * Get the current auto-cover state from an observer token to a target token
   * @param {Token|string} observer - The observer token or token ID
   * @param {Token|string} target - The target token or token ID
   * @param {Object} options - Additional options for cover detection
   * @param {boolean} options.rawPrereq - Whether to use raw prerequisite mode (default: false)
   * @param {boolean} options.forceRecalculate - Whether to force recalculation instead of using cached values
   * @returns {string|null} The cover state: "none", "lesser", "standard", "greater", or null if error
   */
  static getAutoCoverState(observer, target, options = {}) {
    try {
      // Resolve tokens if IDs are provided
      let observerToken = observer;
      let targetToken = target;

      if (typeof observer === 'string') {
        observerToken = canvas.tokens.get(observer);
        if (!observerToken) {
          console.warn(`PF2E Visioner: Observer token with ID '${observer}' not found`);
          return null;
        }
      }

      if (typeof target === 'string') {
        targetToken = canvas.tokens.get(target);
        if (!targetToken) {
          console.warn(`PF2E Visioner: Target token with ID '${target}' not found`);
          return null;
        }
      }

      if (!observerToken || !targetToken) {
        console.warn('PF2E Visioner: Invalid tokens provided to getAutoCoverState');
        return null;
      }

      // Exclude same token (observer and target are the same)
      if (observerToken.id === targetToken.id) {
        console.warn('PF2E Visioner: Cannot calculate cover between a token and itself');
        return null;
      }

      // Check if auto-cover is enabled
      if (!game.settings.get(MODULE_ID, 'autoCover')) {
        console.warn('PF2E Visioner: Auto-cover is disabled in module settings');
        return null;
      }

      const { rawPrereq = false, forceRecalculate = false } = options;

      let coverState = null;

      if (forceRecalculate) {
        // Force fresh calculation
        coverState = autoCoverSystem.detectCoverBetweenTokens(observerToken, targetToken, {
          rawPrereq,
        });
      } else {
        // Try to get cached cover first, then fall back to fresh calculation
        coverState = (observerToken, targetToken);
        if (!coverState || coverState === 'none') {
          coverState = autoCoverSystem.detectCoverBetweenTokens(observerToken, targetToken, {
            rawPrereq,
          });
        }
      }

      return coverState || 'none';
    } catch (error) {
      console.error('PF2E Visioner: Error getting auto-cover state:', error);
      return null;
    }
  }

  /**
   * Clear all PF2E Visioner data for multiple selected tokens with comprehensive cleanup
   * - Removes visibility/cover maps from selected tokens
   * - Removes module-created effects from all actors (same as clearAllSceneData)
   * - Clears scene-level caches
   * - Rebuilds effects and refreshes visuals/perception
   */
  static async clearAllDataForSelectedTokens(tokens = []) {
    try {
      if (!game.user.isGM) {
        ui.notifications.warn('Only GMs can clear Visioner data');
        return false;
      }

      if (!tokens || tokens.length === 0) {
        ui.notifications.warn('No tokens provided for cleanup');
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn('No active scene.');
        return false;
      }

      // 1) Bulk-reset flags on selected tokens (hard remove the maps)
      const updates = tokens.map((t) => ({
        _id: t.id,
        // Use Foundry removal syntax to ensure full deletion of maps
        [`flags.${MODULE_ID}.-=visibility`]: null,
        [`flags.${MODULE_ID}.-=cover`]: null,
      }));
      if (updates.length && scene.updateEmbeddedDocuments) {
        try {
          await scene.updateEmbeddedDocuments('Token', updates, {
            diff: false,
          });
        } catch (_) {}
      }

      // 2) Clear scene-level caches used by the module
      try {
        // Only GMs can update scene flags
        if (game.user.isGM) {
          await scene.setFlag(MODULE_ID, 'deletedEntryCache', {});
        }
      } catch (_) {}

      // 3) Remove module-created effects from all actors and token-actors (handles unlinked tokens)
      try {
        const actors = Array.from(game.actors ?? []);
        for (const actor of actors) {
          const effects = actor?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!actor.items.get(id));
          if (toDelete.length) {
            try {
              await actor.deleteEmbeddedDocuments('Item', toDelete);
            } catch (_) {}
          }
        }

        // Also purge effects on token-actors (unlinked tokens won't be in game.actors)
        const allTokens = canvas.tokens?.placeables ?? [];
        for (const tok of allTokens) {
          const a = tok?.actor;
          if (!a) continue;
          const effects = a?.itemTypes?.effect ?? [];
          const toDelete = effects
            .filter((e) => {
              const f = e.flags?.[MODULE_ID] || {};
              return (
                f.isEphemeralOffGuard ||
                f.isEphemeralCover ||
                f.aggregateOffGuard === true ||
                f.aggregateCover === true
              );
            })
            .map((e) => e.id)
            .filter((id) => !!a.items.get(id));
          if (toDelete.length) {
            try {
              await a.deleteEmbeddedDocuments('Item', toDelete);
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 4) Clean up any remaining effects related to the selected tokens specifically
      try {
        const { cleanupDeletedToken } = await import('./utils.js');
        for (const token of tokens) {
          if (!token?.actor) continue;
          // Clean up this token from all other tokens' maps and effects
          await cleanupDeletedToken(token.document);
        }
      } catch (_) {}

      // 5) Also remove the selected tokens from ALL other tokens' visibility/cover maps
      try {
        const allTokens = canvas.tokens?.placeables ?? [];
        const otherTokens = allTokens.filter(
          (t) => !tokens.some((selected) => selected.id === t.id),
        );

        if (otherTokens.length > 0) {
          const updates = otherTokens
            .map((t) => {
              const update = { _id: t.id };

              // Get current visibility map for this token
              const currentVisibility = t.document.getFlag(MODULE_ID, 'visibility') || {};
              const currentCover = t.document.getFlag(MODULE_ID, 'cover') || {};

              // Remove entries for all selected tokens
              for (const selectedToken of tokens) {
                if (currentVisibility[selectedToken.id]) {
                  update[`flags.${MODULE_ID}.visibility.${selectedToken.id}`] = null;
                }
                if (currentCover[selectedToken.id]) {
                  update[`flags.${MODULE_ID}.cover.${selectedToken.id}`] = null;
                }
              }

              return update;
            })
            .filter((update) => Object.keys(update).length > 1); // Only include updates that have changes

          if (updates.length > 0 && scene.updateEmbeddedDocuments) {
            await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
          }
        }
      } catch (_) {}

      // 6) Rebuild effects and refresh visuals/perception
      try {
        await updateTokenVisuals();
      } catch (_) {}
      try {
        refreshEveryonesPerception();
      } catch (_) {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch (_) {}

      ui.notifications.info(
        `PF2E Visioner: Cleared all data for ${tokens.length} selected token${tokens.length === 1 ? '' : 's'}.`,
      );
      return true;
    } catch (error) {
      console.error('PF2E Visioner: Error clearing data for selected tokens:', error);
      ui.notifications.error('PF2E Visioner: Failed to clear token data. See console.');
      return false;
    }
  }
}

/**
 * Standalone function exports for internal use
 */
export const openTokenManager = Pf2eVisionerApi.openTokenManager;
export const openTokenManagerWithMode = Pf2eVisionerApi.openTokenManagerWithMode;

// Legacy exports for backward compatibility
export const openVisibilityManager = Pf2eVisionerApi.openTokenManager;
export const openVisibilityManagerWithMode = Pf2eVisionerApi.openTokenManagerWithMode;

/**
 * Standalone function to get auto-cover state between two tokens
 * @param {Token|string} observer - The observer token or token ID
 * @param {Token|string} target - The target token or token ID
 * @param {Object} options - Additional options for cover detection
 * @returns {string|null} The cover state: "none", "lesser", "standard", "greater", or null if error
 */
export const getAutoCoverState = Pf2eVisionerApi.getAutoCoverState;

/**
 * Auto-Visibility System API
 */
export const autoVisibility = {
  enable: () => autoVisibilitySystem.enable(),
  disable: () => autoVisibilitySystem.disable(),
  isEnabled: () => autoVisibilitySystem.getStatus().enabled,
  recalculateAll: (force = false) => autoVisibilitySystem.recalculateAllVisibility(force),
  updateTokens: (tokens) => autoVisibilitySystem.updateVisibilityForTokens?.(tokens) || console.warn("updateTokens method not available in refactored system"),
  calculateVisibility: (observer, target) => autoVisibilitySystem.calculateVisibility(observer, target),
  getDebugInfo: (observer, target) => autoVisibilitySystem.getVisibilityDebugInfo(observer, target),

  // Debug helpers
  testLighting: () => {
    const selected = canvas.tokens.controlled;
    if (selected.length === 0) {
      ui.notifications.warn("Select a token to test lighting at its position");
      return;
    }

    const token = selected[0];
    const sceneDarkness = canvas.scene?.environment?.darknessLevel ?? 'undefined';
    console.log(`Testing lighting at ${token.name}'s position:`, token.center);
    console.log(`Scene darkness: ${sceneDarkness} (0=daylight, 1=complete darkness)`);
    console.log(`Light sources: ${canvas.lighting?.placeables?.length ?? 0}`);

    // Access the private method via the global reference
    if (globalThis.pf2eVisionerAutoVisibility?._getLightLevelAt) {
      const lightLevel = globalThis.pf2eVisionerAutoVisibility._getLightLevelAt(token.center);
      const interpretation = lightLevel >= 1 ? 'BRIGHT LIGHT' :
        lightLevel >= 0.5 ? 'DIM LIGHT' : 'DARKNESS';
      console.log(`Light level: ${lightLevel} (${interpretation})`);
      ui.notifications.info(`${token.name}: ${interpretation} (level ${lightLevel}) - see console for details`);
    } else {
      ui.notifications.error("Cannot access light level calculation method");
    }
  },

  debugSelected: async () => {
    const selected = canvas.tokens.controlled;
    if (selected.length < 2) {
      ui.notifications.warn("Select at least 2 tokens to debug visibility between them");
      return;
    }

    const observer = selected[0];
    const target = selected[1];

    console.log(`=== Debugging visibility: ${observer.name} → ${target.name} ===`);

    try {
      const debugInfo = await autoVisibilitySystem.getVisibilityDebugInfo(observer, target);
      console.log("Debug info:", debugInfo);

      const visibility = await autoVisibilitySystem.calculateVisibility(observer, target);
      console.log("Calculated visibility:", visibility);

      ui.notifications.info(`${observer.name} → ${target.name}: ${visibility} (see console for details)`);
    } catch (error) {
      console.error("Error debugging visibility:", error);
      ui.notifications.error("Error debugging visibility - check console");
    }
  },

  // Quick performance helpers
  disableMovementUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnMovement', false);
    ui.notifications.info("Auto-visibility movement updates disabled - no more lag during token movement");
  },

  enableMovementUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnMovement', true);
    ui.notifications.info("Auto-visibility movement updates enabled");
  },

  setThrottleDelay: (ms) => {
    if (ms < 100 || ms > 5000) {
      ui.notifications.error("Throttle delay must be between 100ms and 5000ms");
      return;
    }
    game.settings.set('pf2e-visioner', 'autoVisibilityThrottleDelay', ms);
    ui.notifications.info(`Auto-visibility throttle delay set to ${ms}ms`);
  },

  // Emergency disable for scene configuration issues
  disableLightingUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnLighting', false);
    ui.notifications.info("Auto-visibility lighting updates disabled - scene configuration should work normally now");
  },

  enableLightingUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnLighting', true);
    ui.notifications.info("Auto-visibility lighting updates enabled");
  },

  // Complete system disable/enable for troubleshooting
  emergencyDisable: () => {
    autoVisibilitySystem.disable();
    ui.notifications.warn("Auto-visibility system completely disabled - use emergencyEnable() to re-enable");
  },

  emergencyEnable: () => {
    autoVisibilitySystem.enable();
    ui.notifications.info("Auto-visibility system re-enabled");
  },

  // Debug vision capabilities for selected token
  debugVision: () => {
    const selected = canvas.tokens.controlled[0];
    if (!selected) {
      ui.notifications.error("Please select a token first");
      return;
    }

    const vision = autoVisibilitySystem.getVisionCapabilities?.(selected) || "Vision method not available";
    console.log(`${selected.name} Vision Capabilities:`, vision);
    console.log(`Actor System Data:`, selected.actor?.system?.perception);
    console.log(`Actor Perception:`, selected.actor?.perception);
    ui.notifications.info(`Vision data logged to console for ${selected.name}`);
  },

  // EMERGENCY: Disable all automatic updates (if still needed)
  disableAllUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnMovement', false);
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnLighting', false);
    ui.notifications.warn("All auto-visibility updates disabled");
    console.log("Auto-visibility: All automatic updates disabled. Use enableAllUpdates() to re-enable.");
  },

  // Re-enable all automatic updates
  enableAllUpdates: () => {
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnMovement', true);
    game.settings.set('pf2e-visioner', 'autoVisibilityUpdateOnLighting', true);
    ui.notifications.info("All auto-visibility updates re-enabled");
    console.log("Auto-visibility: All automatic updates re-enabled.");
  },

  // Check if scene config dialog is currently open
  isSceneConfigOpen: () => {
    const hasOpenSceneConfig = Object.values(ui.windows).some(app =>
      app.constructor.name === 'SceneConfig' ||
      app.id?.includes('scene-config') ||
      app.title?.includes('Scene Configuration') ||
      app.options?.id === 'scene-config'
    );
    console.log(`Scene Config Dialog Open: ${hasOpenSceneConfig}`);
    return hasOpenSceneConfig;
  },

  // Debug light sources and light-emitting tokens in the scene
  debugLights: () => {
    const lightSources = canvas.lighting?.placeables || [];
    const tokens = canvas.tokens?.placeables || [];
    const lightEmittingTokens = tokens.filter(t => t.emitsLight);

    console.log(`=== LIGHT SOURCES (${lightSources.length}) ===`);
    lightSources.forEach((light, index) => {
      console.log(`Light Source ${index + 1}:`, {
        position: `(${light.center.x}, ${light.center.y})`,
        emitsLight: light.emitsLight,
        hidden: light.document.hidden,
        brightRadius: light.brightRadius,
        dimRadius: light.dimRadius,
        documentBright: light.document?.config?.bright || light.document?.bright,
        documentDim: light.document?.config?.dim || light.document?.dim,
        configBright: light.config?.bright,
        configDim: light.config?.dim,
        fullLight: light,
        fullDocument: light.document
      });
    });

    console.log(`=== LIGHT-EMITTING TOKENS (${lightEmittingTokens.length}) ===`);
    lightEmittingTokens.forEach((token, index) => {
      console.log(`Light Token ${index + 1} - "${token.name}":`, {
        position: `(${token.center.x}, ${token.center.y})`,
        emitsLight: token.emitsLight,
        hidden: token.document.hidden,
        brightRadius: token.brightRadius,
        dimRadius: token.dimRadius,
        documentLightBright: token.document?.light?.bright,
        documentLightDim: token.document?.light?.dim,
        lightObject: token.light,
        fullTokenLight: token.document?.light,
        fullToken: token
      });
    });

    const totalLights = lightSources.length + lightEmittingTokens.length;
    ui.notifications.info(`Light data logged: ${lightSources.length} sources + ${lightEmittingTokens.length} light tokens = ${totalLights} total`);
  },

  // Clear light cache (for performance troubleshooting)
  clearLightCache: () => {
    if (autoVisibilitySystem.clearLightCache) {
      autoVisibilitySystem.clearLightCache();
      ui.notifications.info("Light-emitting tokens cache cleared");
    } else {
      ui.notifications.warn("Cache clearing not available");
    }
  },

  // Clear vision cache (for performance troubleshooting)
  clearVisionCache: (actorId = null) => {
    if (autoVisibilitySystem.clearVisionCache) {
      autoVisibilitySystem.clearVisionCache(actorId);
      const message = actorId ? `Vision cache cleared for actor ${actorId}` : "Vision capabilities cache cleared";
      ui.notifications.info(message);
    } else {
      ui.notifications.warn("Vision cache clearing not available");
    }
  },

  // Force recalculation with cache clear (for troubleshooting scene changes)
  forceRecalculate: () => {
    if (autoVisibilitySystem.clearLightCache) {
      autoVisibilitySystem.clearLightCache();
    }
    if (autoVisibilitySystem.clearVisionCache) {
      autoVisibilitySystem.clearVisionCache();
    }
    autoVisibilitySystem.recalculateAllVisibility();
    ui.notifications.info("All caches cleared and visibility recalculated");
  },

  // Test invisibility detection for selected tokens
  testInvisibility: () => {
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 2) {
      ui.notifications.warn("Select exactly 2 tokens: observer and target");
      return;
    }

    const [observer, target] = controlled;
    const isInvisible = autoVisibilitySystem.testInvisibility?.(observer, target);

    console.log(`Invisibility test: ${observer.name} → ${target.name}:`, {
      isInvisible,
      targetConditions: target.actor?.conditions,
      targetSystemConditions: target.actor?.system?.conditions
    });

    ui.notifications.info(`${target.name} is ${isInvisible ? 'invisible' : 'visible'} to ${observer.name}`);
  },

  // Debug open applications to find what's blocking updates
  debugOpenApps: () => {
    if (autoVisibilitySystem.debugOpenApplications) {
      return autoVisibilitySystem.debugOpenApplications();
    } else {
      console.log("Debug method not available");
    }
  },

  // Reset Scene Config flag (emergency fix)
  resetSceneConfigFlag: () => {
    if (autoVisibilitySystem.resetSceneConfigFlag) {
      autoVisibilitySystem.resetSceneConfigFlag();
      ui.notifications.info("Scene Config flag reset - updates should resume");
    } else {
      console.log("Reset method not available");
    }
  },

  // Force lighting update (bypasses Scene Config check)
  forceLightingUpdate: () => {
    if (autoVisibilitySystem.recalculateAllVisibility) {
      console.log("Forcing lighting update...");
      autoVisibilitySystem.recalculateAllVisibility(true);
      ui.notifications.info("Forced lighting update completed");
    } else {
      console.log("Force update method not available");
    }
  },

  // Test vision capabilities including conditions
  testVisionCapabilities: () => {
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 1) {
      ui.notifications.warn("Select exactly 1 token to test vision capabilities");
      return;
    }

    const token = controlled[0];
    if (!token.actor) {
      ui.notifications.warn("Selected token has no actor");
      return;
    }

    // Get vision capabilities from the auto-visibility system
    const visionAnalyzer = autoVisibilitySystem?.visionAnalyzer;
    if (!visionAnalyzer) {
      ui.notifications.error("Vision analyzer not available");
      return;
    }

    const capabilities = visionAnalyzer.getVisionCapabilities(token);

    console.log(`Vision capabilities for ${token.name}:`, capabilities);

    const statusText = [];
    if (capabilities.isBlinded) statusText.push("BLINDED");
    if (capabilities.isDazzled) statusText.push("DAZZLED");
    if (capabilities.hasDarkvision) statusText.push("Darkvision");
    if (capabilities.hasLowLightVision) statusText.push("Low-Light Vision");
    if (!capabilities.hasVision) statusText.push("No Vision");

    const status = statusText.length > 0 ? statusText.join(", ") : "Normal Vision";
    ui.notifications.info(`${token.name}: ${status}`);
  },

  // Test condition detection and overrides
  testConditionOverrides: () => {
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 1) {
      ui.notifications.warn("Select exactly 1 token to test condition overrides");
      return;
    }

    const token = controlled[0];
    const actor = token.actor;
    if (!actor) {
      ui.notifications.warn("Selected token has no actor");
      return;
    }

    // Test both conditions
    const isBlinded = actor.hasCondition?.('blinded') || false;
    const isDazzled = actor.hasCondition?.('dazzled') || false;

    console.log(`Condition test for ${actor.name}:`);
    console.log(`- Blinded: ${isBlinded}`);
    console.log(`- Dazzled: ${isDazzled}`);
    console.log(`- Expected: If blinded=true, then dazzled should=false (PF2E override)`);

    // Also show all active conditions
    if (actor.conditions) {
      const activeConditions = Array.from(actor.conditions)
        .filter(c => c.active)
        .map(c => c.name || c.slug)
        .join(', ');
      console.log(`- Active conditions: ${activeConditions || 'none'}`);
    }

    ui.notifications.info(`Check console for ${actor.name}'s condition details`);
  },

  // Test light source detection
  testLightSources: () => {
    const lightSources = canvas.lighting?.placeables || [];
    console.log(`=== Light Sources Debug (${lightSources.length} total) ===`);

    lightSources.forEach((light, index) => {
      const isDarknessSource = light.isDarknessSource || light.document?.isDarknessSource || false;
      const brightRadius = light.document.config?.bright || light.document.bright || light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || light.document.dim || light.config?.dim || 0;
      const hidden = light.document.hidden;
      const emitsLight = light.emitsLight;

      console.log(`Light ${index + 1}:`, {
        id: light.id,
        isDarknessSource,
        brightRadius,
        dimRadius,
        hidden,
        emitsLight,
        center: light.center
      });
    });

    ui.notifications.info(`Found ${lightSources.length} light sources - check console for details`);
  },

  // Test darkness source detection specifically
  testDarknessSources: () => {
    const lightSources = canvas.lighting?.placeables || [];

    console.log(`=== All Light Sources Debug (${lightSources.length} total) ===`);

    lightSources.forEach((light, index) => {
      const brightRadius = light.document.config?.bright || light.document.bright || light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || light.document.dim || light.config?.dim || 0;

      // Check multiple ways to detect darkness sources
      const isDarknessSource = light.isDarknessSource ||
        light.document?.config?.negative ||
        false;

      console.log(`Light Source ${index + 1} ${isDarknessSource ? '(DARKNESS)' : '(NORMAL)'}:`, {
        id: light.id,
        brightRadius,
        dimRadius,
        x: light.document.x,
        y: light.document.y,
        isDarknessSource,
        'light.isDarknessSource': light.isDarknessSource,
        'light.document.isDarknessSource': light.document?.isDarknessSource,
        'light.document.config.negative': light.document?.config?.negative,
        'light.negative': light.negative,
        'light.document.config.type': light.document?.config?.type,
        'light.document.config': light.document?.config
      });
    });

    const darknessCount = lightSources.filter(light => {
      return light.isDarknessSource ||
        light.document?.config?.negative;
    }).length;

    console.log(`Found ${darknessCount} darkness sources out of ${lightSources.length} total lights`);
    ui.notifications.info(`Found ${darknessCount} darkness sources out of ${lightSources.length} total lights`);
  },

  // Emergency circuit breaker reset
  resetCircuitBreaker: () => {
    const autoVisibilitySystem = game.modules.get(MODULE_ID)?.api?.autoVisibilitySystem;
    if (autoVisibilitySystem) {
      // Reset circuit breaker via a force recalculation
      console.log(`${MODULE_ID} | Manually resetting circuit breaker`);
      autoVisibilitySystem.recalculateAllVisibility(true);
      ui.notifications.info("Circuit breaker reset - visibility system reactivated");
    } else {
      ui.notifications.warn("Auto visibility system not found");
    }
  },

  // Test if feedback loops are fixed by monitoring recalculation frequency
  testFeedbackLoops: () => {
    let recalcCount = 0;
    const startTime = Date.now();

    console.log(`${MODULE_ID} | Starting feedback loop test - monitoring for 10 seconds...`);

    // Hook into recalculations to count them
    const originalRecalc = game.modules.get(MODULE_ID)?.api?.autoVisibilitySystem?.recalculateAllVisibility;
    if (!originalRecalc) {
      ui.notifications.error("Auto-visibility system not found");
      return;
    }

    // Wrap the recalculation function to count calls
    const testWrapper = function (...args) {
      recalcCount++;
      console.log(`${MODULE_ID} | Recalculation #${recalcCount} at ${Date.now() - startTime}ms`);
      return originalRecalc.apply(this, args);
    };

    // Replace temporarily
    const autoVis = game.modules.get(MODULE_ID).api.autoVisibilitySystem;
    autoVis.recalculateAllVisibility = testWrapper;

    // Restore after 10 seconds and report results
    setTimeout(() => {
      autoVis.recalculateAllVisibility = originalRecalc;
      const elapsed = Date.now() - startTime;
      const rate = (recalcCount / elapsed * 1000).toFixed(2);

      console.log(`${MODULE_ID} | Feedback test complete: ${recalcCount} recalculations in ${elapsed}ms (${rate} per second)`);

      if (recalcCount > 20) {
        ui.notifications.error(`Feedback loop detected! ${recalcCount} recalculations in 10 seconds (${rate}/sec)`);
      } else if (recalcCount > 10) {
        ui.notifications.warn(`High recalculation rate: ${recalcCount} in 10 seconds (${rate}/sec)`);
      } else {
        ui.notifications.info(`Feedback loops appear fixed: only ${recalcCount} recalculations in 10 seconds (${rate}/sec)`);
      }
    }, 10000);

    ui.notifications.info("Monitoring recalculation frequency for 10 seconds...");
  }
};

/**
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;
