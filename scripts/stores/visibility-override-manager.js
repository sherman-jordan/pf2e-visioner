/**
 * VisibilityOverrideManager.js
 * Centralized management of visibility overrides to prevent AVS from recalculating manually set states
 * Similar to CoverOverrideManager but specifically for visibility states
 */

export class VisibilityOverrideManager {
  constructor() {
    this.visibilityOverrides = new Map(); // Key: "tokenId1->tokenId2", Value: override data
  }

  /**
   * Generate a key for token pair
   * @param {Object|string} token1 - First token or ID
   * @param {Object|string} token2 - Second token or ID
   * @returns {string}
   */
  _generateKey(token1, token2) {
    const id1 = typeof token1 === 'string' ? token1 : token1?.document?.id || token1?.id;
    const id2 = typeof token2 === 'string' ? token2 : token2?.document?.id || token2?.id;
    
    if (!id1 || !id2) {
      throw new Error('Invalid tokens provided to visibility override manager');
    }
    
    return `${id1}->${id2}`;
  }

  /**
   * Set a visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @param {string} visibilityState - Visibility state to override with
   * @param {number} durationMinutes - How long the override should last (default: 5 minutes)
   * @param {string} source - Source of the override (e.g., 'manual_action', 'sneak', 'dialog')
   */
  setVisibilityOverride(observer, target, visibilityState, durationMinutes = 5, source = 'manual') {
    const key = this._generateKey(observer, target);
    const expiryTime = Date.now() + (durationMinutes * 60 * 1000);
    
    const observerId = typeof observer === 'string' ? observer : observer?.document?.id || observer?.id;
    const targetId = typeof target === 'string' ? target : target?.document?.id || target?.id;
    
    this.visibilityOverrides.set(key, {
      observerId,
      targetId,
      visibilityState,
      timestamp: Date.now(),
      expiryTime,
      source,
    });
    
    console.log('PF2E Visioner | ✅ Visibility override SET:', {
      key,
      observerId,
      targetId,
      visibilityState,
      durationMinutes,
      source,
      expiryTime: new Date(expiryTime).toISOString(),
      totalOverrides: this.visibilityOverrides.size
    });
  }

  /**
   * Get visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {Object|null} Override data or null if none exists
   */
  getVisibilityOverride(observer, target) {
    const key = this._generateKey(observer, target);
    const override = this.visibilityOverrides.get(key);
    
    console.log('PF2E Visioner | Checking visibility override:', {
      key,
      hasOverride: !!override,
      totalOverrides: this.visibilityOverrides.size,
      allKeys: Array.from(this.visibilityOverrides.keys())
    });
    
    if (!override) {
      return null;
    }
    
    // Check if override has expired
    if (Date.now() > override.expiryTime) {
      this.visibilityOverrides.delete(key);
      console.log('PF2E Visioner | 🗑️ Removed expired visibility override:', key);
      return null;
    }
    
    console.log('PF2E Visioner | ✅ Found active visibility override:', {
      key,
      visibilityState: override.visibilityState,
      source: override.source,
      remainingMinutes: Math.round((override.expiryTime - Date.now()) / (1000 * 60))
    });
    
    return override;
  }

  /**
   * Check if there's an active override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {boolean} Whether an active override exists
   */
  hasVisibilityOverride(observer, target) {
    return this.getVisibilityOverride(observer, target) !== null;
  }

  /**
   * Remove visibility override for a token pair
   * @param {Object|string} observer - Observer token or ID
   * @param {Object|string} target - Target token or ID
   * @returns {boolean} Whether an override was removed
   */
  removeVisibilityOverride(observer, target) {
    const key = this._generateKey(observer, target);
    const existed = this.visibilityOverrides.has(key);
    
    if (existed) {
      this.visibilityOverrides.delete(key);
      console.debug('PF2E Visioner | Removed visibility override:', key);
    }
    
    return existed;
  }

  /**
   * Remove all overrides involving a specific token
   * @param {string} tokenId - Token ID
   */
  removeAllOverridesInvolving(tokenId) {
    const keysToRemove = [];
    
    for (const [key, override] of this.visibilityOverrides.entries()) {
      if (override.observerId === tokenId || override.targetId === tokenId) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      this.visibilityOverrides.delete(key);
    }
    
    console.debug('PF2E Visioner | Removed', keysToRemove.length, 'visibility overrides involving token:', tokenId);
  }

  /**
   * Clean up expired overrides
   */
  cleanup() {
    const now = Date.now();
    const keysToRemove = [];
    
    for (const [key, override] of this.visibilityOverrides.entries()) {
      if (now > override.expiryTime) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      this.visibilityOverrides.delete(key);
    }
    
    if (keysToRemove.length > 0) {
      console.debug('PF2E Visioner | Cleaned up', keysToRemove.length, 'expired visibility overrides');
    }
  }

  /**
   * Clear all overrides
   */
  clearAll() {
    const count = this.visibilityOverrides.size;
    this.visibilityOverrides.clear();
    console.debug('PF2E Visioner | Cleared all', count, 'visibility overrides');
  }

  /**
   * Get debug information about current overrides
   * @returns {Object}
   */
  getDebugInfo() {
    const overrides = [];
    const now = Date.now();
    
    for (const [key, override] of this.visibilityOverrides.entries()) {
      overrides.push({
        key,
        observerId: override.observerId,
        targetId: override.targetId,
        visibilityState: override.visibilityState,
        source: override.source,
        ageMinutes: Math.round((now - override.timestamp) / (1000 * 60)),
        remainingMinutes: Math.round((override.expiryTime - now) / (1000 * 60)),
        expired: now > override.expiryTime
      });
    }
    
    return {
      totalOverrides: this.visibilityOverrides.size,
      overrides: overrides.sort((a, b) => b.remainingMinutes - a.remainingMinutes)
    };
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy() {
    this.clearAll();
  }
}

const visibilityOverrideManager = new VisibilityOverrideManager();

// Set up periodic cleanup (every 2 minutes)
setInterval(() => {
  visibilityOverrideManager.cleanup();
}, 2 * 60 * 1000);

// Add global debug helper
if (typeof globalThis !== 'undefined') {
  globalThis.debugVisibilityOverrides = () => {
    console.log('PF2E Visioner | 🔍 Visibility Overrides Debug Info:', visibilityOverrideManager.getDebugInfo());
    return visibilityOverrideManager.getDebugInfo();
  };
}

export default visibilityOverrideManager;