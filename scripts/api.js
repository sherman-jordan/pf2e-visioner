/**
 * Public API for PF2E Per-Token Visibility
 */

import { updateTokenVisuals } from './effects-coordinator.js';
import { getVisibilityBetween, setVisibilityBetween, showNotification } from './utils.js';
import { TokenVisibilityManager } from './visibility-manager.js';

/**
 * Main API class for the module
 */
export class Pf2eVisionerApi {
  
  /**
   * Open the visibility manager for a specific observer token
   * @param {Token} observer - The observer token (optional, uses controlled tokens if not provided)
   */
  static async openVisibilityManager(observer = null) {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility');
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
    if (TokenVisibilityManager.currentInstance) {
      // If the observer is the same, just bring the existing dialog to front
      if (TokenVisibilityManager.currentInstance.observer === observer) {
        TokenVisibilityManager.currentInstance.bringToTop();
        return TokenVisibilityManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data
      TokenVisibilityManager.currentInstance.updateObserver(observer);
      TokenVisibilityManager.currentInstance.bringToTop();
      return TokenVisibilityManager.currentInstance;
    }
    
    const manager = new TokenVisibilityManager(observer);
    manager.render({ force: true });
    return manager;
  }

  /**
   * Open the visibility manager with a specific mode
   * @param {Token} observer - The observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  static async openVisibilityManagerWithMode(observer, mode = 'observer') {
    if (!game.user.isGM) {
      ui.notifications.warn('Only GMs can manage token visibility');
      return;
    }

    if (!observer) {
      showNotification('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED', 'warn');
      return;
    }

    // Check if there's already an open instance
    if (TokenVisibilityManager.currentInstance) {
      // If the observer is the same, update mode if different and bring to front
      if (TokenVisibilityManager.currentInstance.observer === observer) {
        if (TokenVisibilityManager.currentInstance.mode !== mode) {
          TokenVisibilityManager.currentInstance.mode = mode;
          TokenVisibilityManager.currentInstance.render({ force: true });
        }
        TokenVisibilityManager.currentInstance.bringToTop();
        return TokenVisibilityManager.currentInstance;
      }
      // If different observer, update the existing dialog with new data and mode
      TokenVisibilityManager.currentInstance.updateObserverWithMode(observer, mode);
      TokenVisibilityManager.currentInstance.bringToTop();
      return TokenVisibilityManager.currentInstance;
    }
    
    const manager = new TokenVisibilityManager(observer, { mode });
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
   * @returns {Promise<boolean>} Promise that resolves to true if successful, false otherwise
   */
  static async setVisibility(observerId, targetId, state) {
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
      await setVisibilityBetween(observerToken, targetToken, state);
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
    if (!visibilityState) return options;
    
    // Add visibility-specific roll options
    options.push(`per-token-visibility:target:${visibilityState}`);
    
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
}

/**
 * Standalone function exports for internal use
 */
export const openVisibilityManager = Pf2eVisionerApi.openVisibilityManager;
export const openVisibilityManagerWithMode = Pf2eVisionerApi.openVisibilityManagerWithMode;

/**
 * Main API export - this is what external modules should use
 * Usage: game.modules.get("pf2e-visioner").api
 */
export const api = Pf2eVisionerApi;