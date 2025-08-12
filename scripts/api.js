/**
 * Public API for PF2E Per-Token Visibility
 */

import { MODULE_ID } from "./constants.js";
import { updateTokenVisuals } from "./effects-coordinator.js";
import {
  rebuildAndRefresh,
  removeAllReferencesToTarget,
  removeModuleEffectsFromActors,
  removeModuleEffectsFromTokenActors,
  removeObserverContributions,
  unsetMapsForTokens,
} from "./services/api-internal.js";
import { refreshEveryonesPerception } from "./socket.js";
import { VisionerTokenManager } from "./token-manager.js";
import {
  cleanupDeletedToken,
  getCoverBetween,
  getVisibilityBetween,
  setCoverBetween,
  setVisibilityBetween,
  showNotification,
} from "./utils.js";

/**
 * Main API class for the module
 */
export class Pf2eVisionerApi {
  // Internal helpers (not exported)
  static async _unsetMapsForTokens(scene, tokens) { return unsetMapsForTokens(scene, tokens); }

  static _collectModuleEffectIds(actor) { return null; }

  static async _removeModuleEffectsFromActors(actors) { return removeModuleEffectsFromActors(actors); }

  static async _removeModuleEffectsFromTokenActors(tokens) { return removeModuleEffectsFromTokenActors(tokens); }

  static async _removeObserverContributions(observerToken, tokens) { return removeObserverContributions(observerToken, tokens); }

  static async _removeAllReferencesToTarget(targetToken, tokens) { return removeAllReferencesToTarget(targetToken, tokens, cleanupDeletedToken); }

  static async _rebuildAndRefresh() { return rebuildAndRefresh(); }

  /**
   * Open the token manager for a specific observer token
   * @param {Token} observer - The observer token (optional, uses controlled tokens if not provided)
   */
  static async openTokenManager(observer = null) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can manage token visibility and cover");
      return;
    }

    // Use provided observer or get from controlled tokens
    if (!observer) {
      const controlled = canvas.tokens.controlled;
      if (controlled.length === 0) {
        showNotification(
          "PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED",
          "warn",
        );
        return;
      }
      observer = controlled[0];

      if (controlled.length > 1) {
        showNotification(
          "PF2E_VISIONER.NOTIFICATIONS.MULTIPLE_OBSERVERS",
          "warn",
        );
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

    const manager = new VisionerTokenManager(observer);
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
  static async openTokenManagerWithMode(observer, mode = "observer") {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can manage token visibility and cover");
      return;
    }

    if (!observer) {
      showNotification(
        "PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED",
        "warn",
      );
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
      VisionerTokenManager.currentInstance.updateObserverWithMode(
        observer,
        mode,
      );
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
   * Get visibility state between two tokens
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @returns {string|null} The visibility state, or null if tokens not found
   */
  static getVisibility(observerId, targetId) {
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

      // Get visibility using utility function
      return getVisibilityBetween(observerToken, targetToken);
    } catch (error) {
      console.error("Error getting visibility:", error);
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
      const validStates = ["observed", "hidden", "undetected", "concealed"];
      if (!validStates.includes(state)) {
        console.error(
          `Invalid visibility state: ${state}. Valid states are: ${validStates.join(", ")}`,
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
      console.error("Error setting visibility:", error);
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
      console.error("Error getting cover:", error);
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
      const validStates = ["none", "lesser", "standard", "greater"];
      if (!validStates.includes(state)) {
        console.error(
          `Invalid cover state: ${state}. Valid states are: ${validStates.join(", ")}`,
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

      // Set cover using utility function
      await setCoverBetween(observerToken, targetToken, state, options);
      await updateTokenVisuals();

      return true;
    } catch (error) {
      console.error("Error setting cover:", error);
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
        options.push("per-token-visibility:observer:has-darkvision");
      }

      if (observerToken.actor.system?.traits?.senses?.tremorsense) {
        options.push("per-token-visibility:observer:has-tremorsense");
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
    return ["observed", "hidden", "undetected", "concealed"];
  }

  /**
   * Get all available cover states
   * @returns {Array<string>} Array of valid cover states
   */
  static getCoverStates() {
    return ["none", "lesser", "standard", "greater"];
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
        ui.notifications.warn("Only GMs can clear Visioner scene data");
        return false;
      }

      const scene = canvas?.scene;
      if (!scene) {
        ui.notifications.warn("No active scene.");
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
          await scene.updateEmbeddedDocuments("Token", updates, {
            diff: false,
          });
        } catch (_) {}
      }

      // 2) Clear scene-level caches used by the module
      try {
        await scene.setFlag(MODULE_ID, "deletedEntryCache", {});
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
              await actor.deleteEmbeddedDocuments("Item", toDelete);
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
              await a.deleteEmbeddedDocuments("Item", toDelete);
            } catch (_) {}
          }
        }
      } catch (_) {}

      // 4) Optional extra sweep for cover effects across all actors
      try {
        const { cleanupAllCoverEffects } = await import("./cover-ephemeral.js");
        await cleanupAllCoverEffects();
      } catch (_) {}

      // 5) Rebuild effects and refresh visuals/perception
      try {
        const { rebuildAllEphemeralEffects } = await import(
          "./effects-coordinator.js"
        );
        await rebuildAllEphemeralEffects();
      } catch (_) {}
      try {
        await updateTokenVisuals();
      } catch (_) {}
      try {
        refreshEveryonesPerception();
      } catch (_) {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch (_) {}

      ui.notifications.info("PF2E Visioner: Cleared all scene data.");
      return true;
    } catch (error) {
      console.error("PF2E Visioner: Error clearing scene data:", error);
      ui.notifications.error(
        "PF2E Visioner: Failed to clear scene data. See console.",
      );
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
        ui.notifications.warn("Only GMs can clear Visioner data");
        return false;
      }

      // Resolve token
      let selected = token;
      if (!selected) {
        const controlled = canvas.tokens?.controlled ?? [];
        if (controlled.length !== 1) {
          ui.notifications.warn(
            controlled.length === 0
              ? "No token selected."
              : "Select a single token.",
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
        await scene.updateEmbeddedDocuments("Token", [unset], { diff: false });
      } catch (_) {}

      // Visibility effects contributed by this observer → remove from all targets
      try {
        const targetUpdates = tokens
          .filter((t) => t.id !== selected.id && t?.actor)
          .map((t) => ({ target: t, state: "observed" }));
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
      try {
        const { rebuildAllEphemeralEffects } = await import(
          "./effects-coordinator.js"
        );
        await rebuildAllEphemeralEffects();
      } catch (_) {}
      try {
        await updateTokenVisuals();
      } catch (_) {}
      try {
        refreshEveryonesPerception();
      } catch (_) {}
      try {
        canvas.perception.update({ refreshVision: true });
      } catch (_) {}

      ui.notifications.info("PF2E Visioner: Cleared data for selected token.");
      return true;
    } catch (error) {
      console.error(
        "PF2E Visioner: Error clearing data for selected token:",
        error,
      );
      ui.notifications.error(
        "PF2E Visioner: Failed to clear token data. See console.",
      );
      return false;
    }
  }
}

/**
 * Standalone function exports for internal use
 */
export const openTokenManager = Pf2eVisionerApi.openTokenManager;
export const openTokenManagerWithMode =
  Pf2eVisionerApi.openTokenManagerWithMode;

// Legacy exports for backward compatibility
export const openVisibilityManager = Pf2eVisionerApi.openTokenManager;
export const openVisibilityManagerWithMode =
  Pf2eVisionerApi.openTokenManagerWithMode;

/**
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;
