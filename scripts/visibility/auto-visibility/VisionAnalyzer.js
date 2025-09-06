/**
 * Handles all vision-related analysis for the auto-visibility system
 * Manages vision capabilities, senses, line of sight, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';

export class VisionAnalyzer {
  /** @type {VisionAnalyzer} */
  static #instance = null;

  #visionCapabilitiesCache = new Map();
  #visionCacheTimestamp = new Map();
  #visionCacheTimeout = 5000; // 5 second cache

  constructor() {
    if (VisionAnalyzer.#instance) {
      return VisionAnalyzer.#instance;
    }

    this.#visionCapabilitiesCache = new Map();
    this.#visionCacheTimestamp = new Map();

    VisionAnalyzer.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {VisionAnalyzer}
   */
  static getInstance() {
    if (!VisionAnalyzer.#instance) {
      VisionAnalyzer.#instance = new VisionAnalyzer();
    }
    return VisionAnalyzer.#instance;
  }

  /**
   * Get vision capabilities for a token (with caching)
   * @param {Token} token
   * @returns {Object} Vision capabilities
   */
  getVisionCapabilities(token) {
    if (!token?.actor) {
      return { hasVision: false, hasDarkvision: false, hasLowLightVision: false };
    }

    const tokenId = token.document.id;
    const now = Date.now();

    // Check cache first
    if (this.#visionCapabilitiesCache.has(tokenId)) {
      const cacheTime = this.#visionCacheTimestamp.get(tokenId) || 0;
      if ((now - cacheTime) < this.#visionCacheTimeout) {
        return this.#visionCapabilitiesCache.get(tokenId);
      }
    }

    // Calculate vision capabilities
    const capabilities = this.#calculateVisionCapabilities(token);

    // Cache the result
    this.#visionCapabilitiesCache.set(tokenId, capabilities);
    this.#visionCacheTimestamp.set(tokenId, now);

    return capabilities;
  }

  /**
   * Calculate vision capabilities for a token
   * @param {Token} token
   * @returns {Object} Vision capabilities
   */
  #calculateVisionCapabilities(token) {
    const actor = token.actor;
    if (!actor) {
      return { hasVision: false, hasDarkvision: false, hasLowLightVision: false };
    }

    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

    let hasVision = true;
    let hasDarkvision = false;
    let hasLowLightVision = false;
    let darkvisionRange = 0;
    let lowLightRange = 0;
    let isBlinded = false;
    let isDazzled = false;

    try {
      // Check for blinded and dazzled conditions first (these override other vision capabilities)
      isBlinded = this.#hasCondition(actor, 'blinded');
      isDazzled = this.#hasCondition(actor, 'dazzled');

      // Blinded overrides dazzled and disables all vision
      if (isBlinded) {
        hasVision = false;
        if (debugMode) {
          console.log(`${MODULE_ID} | ${actor.name} is blinded - no vision`);
        }
      }

      // Check if actor has vision at all
      if (actor.system?.perception?.vision === false) {
        hasVision = false;
      }

      // Multiple paths to check for senses
      let senses = null;

      // Try different property paths for senses
      if (actor.system?.perception?.senses) {
        senses = actor.system.perception.senses;
      } else if (actor.perception?.senses) {
        senses = actor.perception.senses;
      }

      if (senses) {
        // Handle senses as array (NPCs) or object (PCs)
        if (Array.isArray(senses)) {
          // NPC format: array of sense objects
          for (const sense of senses) {
            if (sense.type === 'darkvision') {
              hasDarkvision = true;
              darkvisionRange = sense.range || Infinity;
            } else if (sense.type === 'low-light-vision') {
              hasLowLightVision = true;
              lowLightRange = sense.range || Infinity;
            }
          }
        } else {
          // PC format: object with sense properties
          if (senses.darkvision) {
            hasDarkvision = true;
            darkvisionRange = senses.darkvision.range || Infinity;
          }
          if (senses['low-light-vision']) {
            hasLowLightVision = true;
            lowLightRange = senses['low-light-vision'].range || Infinity;
          }
        }
      }

      // Fallback: check direct properties on actor
      if (!hasDarkvision && (actor.darkvision || actor.system?.darkvision)) {
        hasDarkvision = true;
        darkvisionRange = actor.darkvision || actor.system?.darkvision || Infinity;
      }

      if (!hasLowLightVision && (actor['low-light-vision'] || actor.system?.['low-light-vision'])) {
        hasLowLightVision = true;
        lowLightRange = actor['low-light-vision'] || actor.system?.['low-light-vision'] || Infinity;
      }

      // Check flags as additional fallback
      const flags = actor.flags || {};
      if (!hasDarkvision && flags.darkvision) {
        hasDarkvision = true;
        darkvisionRange = flags.darkvision.range || Infinity;
      }
      if (!hasLowLightVision && flags['low-light-vision']) {
        hasLowLightVision = true;
        lowLightRange = flags['low-light-vision'].range || Infinity;
      }

    } catch (error) {
      if (debugMode) {
        console.warn(`${MODULE_ID} | Error getting vision capabilities for ${actor.name}:`, error);
      }
    }

    const result = {
      hasVision,
      hasDarkvision,
      hasLowLightVision,
      darkvisionRange,
      lowLightRange,
      isBlinded,
      isDazzled
    };

    if (debugMode) {
      console.log(`${MODULE_ID} | Vision capabilities for ${actor.name}:`, result);
    }

    return result;
  }

  /**
   * Check if observer has line of sight to target
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  hasLineOfSight(observer, target) {
    if (!observer || !target) return false;

    try {
      // Use FoundryVTT's built-in visibility testing
      return canvas.visibility.testVisibility(target.center, {
        tolerance: 0,
        object: target
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Error testing line of sight:`, error);
      return false;
    }
  }

  /**
   * Check if observer can detect target without sight (special senses)
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  canDetectWithoutSight(observer, target) {
    if (!observer?.actor || !target?.actor) return false;

    // Blinded creatures might still have special senses
    // Check for special senses that work without vision
    // This could be expanded for tremorsense, echolocation, etc.

    // TODO: Implement special senses detection
    // const observerCapabilities = this.getVisionCapabilities(observer);
    // Check observerCapabilities for tremorsense, echolocation, scent, etc.

    // For now, return false - most creatures rely on vision
    // Future enhancement: check for tremorsense, echolocation, scent, etc.
    return false;
  }

  /**
   * Determine visibility based on lighting conditions and observer's vision
   * @param {Object} lightLevel - Light level information from LightingCalculator
   * @param {Object} observerVision - Vision capabilities from getVisionCapabilities
   * @returns {string} Visibility state
   */
  determineVisibilityFromLighting(lightLevel, observerVision) {
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

    // Blinded: Can't see anything (handled by hasVision = false)
    if (!observerVision.hasVision) {
      return 'hidden';
    }

    // Dazzled: If vision is only precise sense, everything is concealed
    // Note: In PF2E, most creatures only have vision as their precise sense
    // unless they have special senses like tremorsense, echolocation, etc.
    if (observerVision.isDazzled) {
      // For simplicity, we assume vision is the only precise sense for most creatures
      // This could be enhanced later to check for other precise senses
      return 'concealed';
    }

    switch (lightLevel.level) {
      case 'bright':
        return 'observed';

      case 'dim':
        if (observerVision.hasLowLightVision) {
          return 'observed';
        } else {
          return 'concealed';
        }

      case 'darkness':
        if (observerVision.hasDarkvision) {
          if (debugMode) {
            console.log(`${MODULE_ID} | 🌑 DARKNESS → OBSERVED: Observer has darkvision (range: ${observerVision.darkvisionRange})`);
          }
          return 'observed';
        } else {
          // ONLY log when darkness results in hidden state for debugging
          if (debugMode) {
            console.log(`${MODULE_ID} | 🌑 DARKNESS → HIDDEN: No darkvision in darkness area`);
          }
          return 'hidden';
        }

      default:
        return 'observed';
    }
  }

  /**
   * Invalidate vision cache for a specific token or all tokens
   * @param {string} [tokenId] - Specific token ID, or undefined to clear all
   */
  invalidateVisionCache(tokenId = null) {
    if (tokenId) {
      this.#visionCapabilitiesCache.delete(tokenId);
      this.#visionCacheTimestamp.delete(tokenId);
    } else {
      this.#visionCapabilitiesCache.clear();
      this.#visionCacheTimestamp.clear();
    }
  }

  /**
   * Clear vision cache (public API)
   * @param {string} actorId - Optional actor ID to clear specific cache entry
   */
  clearVisionCache(actorId = null) {
    if (actorId) {
      // Clear cache for specific actor
      this.#visionCapabilitiesCache.delete(actorId);
      this.#visionCacheTimestamp.delete(actorId);
    } else {
      // Clear entire cache
      this.invalidateVisionCache();
    }
  }

  /**
   * Check if an actor has a specific condition
   * @param {Actor} actor
   * @param {string} conditionSlug - The condition slug (e.g., 'blinded', 'dazzled')
   * @returns {boolean}
   * @private
   */
  #hasCondition(actor, conditionSlug) {
    try {
      // Try multiple methods to detect conditions in PF2E

      // Method 1: hasCondition function (most reliable)
      if (actor.hasCondition && typeof actor.hasCondition === 'function') {
        return actor.hasCondition(conditionSlug);
      }

      // Method 2: Check system conditions
      if (actor.system?.conditions?.[conditionSlug]?.active) {
        return true;
      }

      // Method 3: Check conditions collection
      if (actor.conditions?.has?.(conditionSlug)) {
        return true;
      }

      // Method 4: Iterate through conditions collection
      if (actor.conditions) {
        try {
          return actor.conditions.some(condition =>
            condition.slug === conditionSlug || condition.key === conditionSlug
          );
        } catch (e) {
          // Ignore iteration errors
        }
      }

      return false;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error checking condition ${conditionSlug} for ${actor.name}:`, error);
      return false;
    }
  }

  /**
   * Get debug information about a token's vision
   * @param {Token} token
   * @returns {Object} Debug information
   */
  getDebugInfo(token) {
    if (!token?.actor) {
      return { error: 'No token or actor provided' };
    }

    const capabilities = this.getVisionCapabilities(token);
    const cacheInfo = {
      cached: this.#visionCapabilitiesCache.has(token.document.id),
      cacheTime: this.#visionCacheTimestamp.get(token.document.id),
      cacheAge: this.#visionCacheTimestamp.has(token.document.id) ?
        Date.now() - this.#visionCacheTimestamp.get(token.document.id) : null
    };

    return {
      tokenName: token.name,
      actorName: token.actor.name,
      capabilities,
      cacheInfo,
      rawSenses: token.actor.system?.perception?.senses || token.actor.perception?.senses
    };
  }
}
