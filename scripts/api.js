/**
 * Public API for PF2E Per-Token Visibility
 */

import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';
import { refreshEveryonesPerception } from './socket.js';
import { VisionerTokenManager } from './token-manager.js';
import { getCoverBetween, getVisibilityBetween, setCoverBetween, setVisibilityBetween, showNotification } from './utils.js';
import { updateTokenVisuals } from './visual-effects.js';

/**
 * Main API class for the module
 */
export class Pf2eVisionerApi {
  
  /**
   * Open the token manager for a specific observer token
   * @param {Token} observer - The observer token (optional, uses controlled tokens if not provided)
   */
  static async openTokenManager(observer = null) {
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
        VisionerTokenManager.currentInstance.bringToTop();
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data
      VisionerTokenManager.currentInstance.updateObserver(observer);
      VisionerTokenManager.currentInstance.bringToTop();
      return VisionerTokenManager.currentInstance;
    }
    
    const manager = new VisionerTokenManager(observer);
    manager.render({ force: true });
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
          VisionerTokenManager.currentInstance.render({ force: true });
        }
        VisionerTokenManager.currentInstance.bringToTop();
        return VisionerTokenManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data and mode
      VisionerTokenManager.currentInstance.updateObserverWithMode(observer, mode);
      VisionerTokenManager.currentInstance.bringToTop();
      return VisionerTokenManager.currentInstance;
    }
    
    const manager = new VisionerTokenManager(observer, { mode });
    manager.render({ force: true });
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
        console.error(`Invalid visibility state: ${state}. Valid states are: ${validStates.join(', ')}`);
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

  /**
   * Update ephemeral effects for visibility changes
   * @param {string} observerId - The ID of the observing token
   * @param {string} targetId - The ID of the target token
   * @param {string} newVisibilityState - The new visibility state ('observed', 'hidden', 'undetected', 'concealed')
   * @param {Object} options - Optional configuration
   * @param {boolean} options.initiative - Boolean (default: null)
   * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async updateEphemeralEffects(observerId, targetId, newVisibilityState, options = {}) {
    try {
      // Validate visibility state
      const validStates = ['observed', 'hidden', 'undetected', 'concealed'];
      if (!validStates.includes(newVisibilityState)) {
        console.error(`Invalid visibility state: ${newVisibilityState}. Valid states are: ${validStates.join(', ')}`);
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

      // Update ephemeral effects using the utility function
      await updateEphemeralEffectsForVisibility(observerToken, targetToken, newVisibilityState, options);
      
      return true;
    } catch (error) {
      console.error('Error updating ephemeral effects:', error);
      return false;
    }
  }

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
    moduleOptions.forEach(option => {
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
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;
