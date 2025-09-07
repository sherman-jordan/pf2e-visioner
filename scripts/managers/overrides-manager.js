/**
 * OverridesManager - Singleton class for managing visibility state overrides
 * Handles setting and retrieving override states for tokens per action
 */

import { MODULE_ID, VISIBILITY_STATES } from '../constants.js';

export class OverridesManager {
  static _instance = null;

  constructor() {
    if (OverridesManager._instance) {
      return OverridesManager._instance;
    }
    OverridesManager._instance = this;
    
    // Available actions that can have overrides
    this.availableActions = [
      'visibility',
      'seek',
      'hide', 
      'sneak',
      'createDiversion',
      'attackConsequences'
    ];
    
    // Override states: each visibility state + 'no-override'
    this.overrideStates = {
      ...VISIBILITY_STATES,
      'no-override': {
        label: 'PF2E_VISIONER.OVERRIDE_STATES.no_override',
        icon: 'fas fa-ban',
        color: 'var(--color-text-secondary)',
        cssClass: 'override-none',
      }
    };
  }

  /**
   * Get the singleton instance
   * @returns {OverridesManager}
   */
  static getInstance() {
    if (!OverridesManager._instance) {
      new OverridesManager();
    }
    return OverridesManager._instance;
  }

  /**
   * Get override state for a specific token and action
   * @param {string} tokenId - Token ID
   * @param {string} action - Action name
   * @param {string} observerTokenId - Observer token ID
   * @returns {string|null} Override state or null if no override
   */
  getOverride(tokenId, action, observerTokenId) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return null;

    const overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
    const actionOverrides = overrides[action] || {};
    return actionOverrides[observerTokenId] || null;
  }

  /**
   * Set override state for a specific token and action
   * @param {string} tokenId - Token ID
   * @param {string} action - Action name
   * @param {string} observerTokenId - Observer token ID
   * @param {string} state - Override state ('no-override' to clear)
   */
  async setOverride(tokenId, action, observerTokenId, state) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return;

    let overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
    
    if (!overrides[action]) {
      overrides[action] = {};
    }

    if (state === 'no-override' || state === null) {
      // Clear override
      delete overrides[action][observerTokenId];
      
      // Clean up empty action entries
      if (Object.keys(overrides[action]).length === 0) {
        delete overrides[action];
      }
    } else {
      // Set override
      overrides[action][observerTokenId] = state;
    }

    await token.document.setFlag(MODULE_ID, 'overrides', overrides);
  }

  /**
   * Clear all overrides for a token
   * @param {string} tokenId - Token ID
   */
  async clearAllOverrides(tokenId) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return;

    await token.document.unsetFlag(MODULE_ID, 'overrides');
  }

  /**
   * Clear overrides for a specific action across all observer tokens
   * @param {string} tokenId - Token ID
   * @param {string} action - Action name
   */
  async clearActionOverrides(tokenId, action) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return;

    let overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
    delete overrides[action];

    if (Object.keys(overrides).length === 0) {
      await token.document.unsetFlag(MODULE_ID, 'overrides');
    } else {
      await token.document.setFlag(MODULE_ID, 'overrides', overrides);
    }
  }

  /**
   * Clear all overrides for a specific observer across all tokens and actions
   * @param {string} observerTokenId - Observer token ID
   */
  async clearObserverOverrides(observerTokenId) {
    const tokens = canvas.tokens.placeables;
    
    for (const token of tokens) {
      const overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
      let hasChanges = false;

      for (const action in overrides) {
        if (overrides[action][observerTokenId]) {
          delete overrides[action][observerTokenId];
          hasChanges = true;
          
          // Clean up empty action entries
          if (Object.keys(overrides[action]).length === 0) {
            delete overrides[action];
          }
        }
      }

      if (hasChanges) {
        if (Object.keys(overrides).length === 0) {
          await token.document.unsetFlag(MODULE_ID, 'overrides');
        } else {
          await token.document.setFlag(MODULE_ID, 'overrides', overrides);
        }
      }
    }
  }

  /**
   * Get all overrides for a specific observer token
   * @param {string} observerTokenId - Observer token ID
   * @returns {Object} Map of tokenId -> action -> overrideState
   */
  getObserverOverrides(observerTokenId) {
    const result = {};
    const tokens = canvas.tokens.placeables;

    for (const token of tokens) {
      const overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
      const tokenOverrides = {};

      for (const action in overrides) {
        if (overrides[action][observerTokenId]) {
          tokenOverrides[action] = overrides[action][observerTokenId];
        }
      }

      if (Object.keys(tokenOverrides).length > 0) {
        result[token.document.id] = tokenOverrides;
      }
    }

    return result;
  }

  /**
   * Check if a token has any overrides
   * @param {string} tokenId - Token ID
   * @returns {boolean}
   */
  hasOverrides(tokenId) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return false;

    const overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
    return Object.keys(overrides).length > 0;
  }

  /**
   * Check if a token has overrides for a specific action
   * @param {string} tokenId - Token ID
   * @param {string} action - Action name
   * @returns {boolean}
   */
  hasActionOverrides(tokenId, action) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return false;

    const overrides = token.document.getFlag(MODULE_ID, 'overrides') || {};
    return !!(overrides[action] && Object.keys(overrides[action]).length > 0);
  }

  /**
   * Apply override to calculated outcome if one exists
   * @param {string} tokenId - Token ID
   * @param {string} action - Action name
   * @param {string} observerTokenId - Observer token ID
   * @param {string} calculatedState - The normally calculated state
   * @returns {string} The final state (override or calculated)
   */
  applyOverride(tokenId, action, observerTokenId, calculatedState) {
    const override = this.getOverride(tokenId, action, observerTokenId);
    return override || calculatedState;
  }

  /**
   * Get available actions for overrides
   * @returns {Array<string>}
   */
  getAvailableActions() {
    return [...this.availableActions];
  }

  /**
   * Get available override states
   * @returns {Object}
   */
  getOverrideStates() {
    return { ...this.overrideStates };
  }
}

// Initialize singleton instance
OverridesManager.getInstance();