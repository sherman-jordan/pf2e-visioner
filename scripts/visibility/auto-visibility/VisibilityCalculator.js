/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 */

import { MODULE_ID } from '../../constants.js';
import * as avsOverrideService from '../../services/avs-override-service.js';

export class VisibilityCalculator {
  /** @type {VisibilityCalculator} */
  static #instance = null;

  /** @type {LightingCalculator} */
  #lightingCalculator;

  /** @type {VisionAnalyzer} */
  #visionAnalyzer;

  /** @type {ConditionManager} */
  #conditionManager;

  constructor() {
    if (VisibilityCalculator.#instance) {
      return VisibilityCalculator.#instance;
    }
    VisibilityCalculator.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {VisibilityCalculator}
   */
  static getInstance() {
    if (!VisibilityCalculator.#instance) {
      VisibilityCalculator.#instance = new VisibilityCalculator();
    }
    return VisibilityCalculator.#instance;
  }

  /**
   * Initialize with required components
   * @param {LightingCalculator} lightingCalculator
   * @param {VisionAnalyzer} visionAnalyzer
   * @param {ConditionManager} ConditionManager
   */
  initialize(lightingCalculator, visionAnalyzer, ConditionManager) {
    this.#lightingCalculator = lightingCalculator;
    this.#visionAnalyzer = visionAnalyzer;
    this.#conditionManager = ConditionManager;
  }

  /**
   * Calculate visibility between observer and target tokens - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    return this.calculateVisibilityWithPosition(observer, target, null, null);
  }

  /**
   * Calculate visibility with position overrides - IMMEDIATE, NO THROTTLING
   * @param {Token} observer
   * @param {Token} target
   * @param {Object} observerPositionOverride - Optional {x, y} position override for observer (reserved for future use)
   * @param {Object} targetPositionOverride - Optional {x, y} position override for target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibilityWithPosition(
    observer,
    target,
    _observerPositionOverride = null,
    targetPositionOverride = null,
  ) {
    if (!observer?.actor || !target?.actor) {
      console.log(`${MODULE_ID} | EARLY RETURN: Missing observer or target actor`);
      return 'observed';
    }

    try {
      const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      console.log(
        `${MODULE_ID} | CALC START: ${observer.name} → ${target.name} - Starting calculation`,
      );

      if (debugMode) {
        console.log(
          `${MODULE_ID} | OPTIMIZED: Calculating visibility ${observer.name} → ${target.name} (IMMEDIATE)`,
        );
      }

      // Check for AVS overrides first
      const avsOverride = avsOverrideService.getAVSOverride(observer, target);
      if (avsOverride) {
        console.log(
          `${MODULE_ID} | AVS OVERRIDE: ${observer.name} → ${target.name} = ${avsOverride}`,
        );
        return avsOverride;
      }

      // Check for AVS kill switch
      if (avsOverrideService.getAVSKillSwitch(observer)) {
        console.log(
          `${MODULE_ID} | AVS KILL SWITCH: ${observer.name} has AVS disabled - skipping calculation`,
        );
        return 'observed'; // Return default state when AVS is disabled
      }

      // Step 1: Check if observer is blinded (cannot see anything)
      const isBlinded = this.#conditionManager.isBlinded(observer);
      console.log(`${MODULE_ID} | BLINDED CHECK: ${observer.name} = ${isBlinded}`);
      if (isBlinded) {
        console.log(`${MODULE_ID} | BLINDED PATH: Observer cannot see anything - returning hidden`);
        return 'hidden';
      }

      // Step 2: Check if target is completely invisible to observer
      const isInvisible = this.#conditionManager.isInvisibleTo(observer, target);
      console.log(
        `${MODULE_ID} | INVISIBILITY CHECK: ${observer.name} → ${target.name} = ${isInvisible}`,
      );
      if (isInvisible) {
        console.log(`${MODULE_ID} | INVISIBLE PATH: Target is invisible - returning undetected`);
        // In PF2e, invisible targets are undetected to all observers unless they have special abilities
        return 'undetected';
      } else {
        console.log(`${MODULE_ID} | NOT INVISIBLE: Proceeding to lighting calculation`);
      }

      // Step 3: Check if observer is dazzled (everything appears concealed)
      const isDazzled = this.#conditionManager.isDazzled(observer);
      console.log(`${MODULE_ID} | DAZZLED CHECK: ${observer.name} = ${isDazzled}`);
      if (isDazzled) {
        console.log(
          `${MODULE_ID} | DAZZLED PATH: Observer is dazzled - everything appears concealed`,
        );
        // In PF2e, dazzled creatures see everything as concealed unless they have special abilities
        return 'concealed';
      }

      // Step 4: Check line of sight
      const hasLineOfSight = this.#visionAnalyzer.hasLineOfSight(observer, target);
      if (!hasLineOfSight) {
        // No line of sight - check if observer has special senses
        if (this.#visionAnalyzer.canDetectWithoutSight(observer, target)) {
          return 'hidden'; // Can detect but not see clearly
        }
        return 'hidden'; // Cannot see at all
      }

      // Step 5: Check lighting conditions at target's position
      // Use position override if provided, otherwise calculate from document
      const targetPosition = targetPositionOverride || {
        x: target.document.x + (target.document.width * canvas.grid.size) / 2,
        y: target.document.y + (target.document.height * canvas.grid.size) / 2,
      };
      const lightLevel = this.#lightingCalculator.getLightLevelAt(targetPosition);
      const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);

      // Enhanced debugging to understand light/vision calculation
      console.log(
        `${MODULE_ID} | 🔍 POSITION DEBUG: ${target.name} position: (${targetPosition.x}, ${targetPosition.y}) [doc: (${target.document.x}, ${target.document.y}), center: (${target.center.x}, ${target.center.y})]`,
      );
      console.log(
        `${MODULE_ID} | 🔍 LIGHT DEBUG: ${observer.name} → ${target.name} - Light level at target: ${JSON.stringify(lightLevel)}`,
      );
      console.log(
        `${MODULE_ID} | 🔍 VISION DEBUG: ${observer.name} vision capabilities:`,
        observerVision,
      );

      // Step 6: Determine visibility based on light level and observer's vision
      const result = this.#visionAnalyzer.determineVisibilityFromLighting(
        lightLevel,
        observerVision,
      );

      console.log(
        `${MODULE_ID} | VISIBILITY RESULT: ${observer.name} → ${target.name} = ${result} (light: ${lightLevel})`,
      );

      if (debugMode) {
        console.log(
          `${MODULE_ID} | OPTIMIZED: Calculated visibility ${observer.name} → ${target.name} = ${result} (IMMEDIATE)`,
        );
      }

      console.log(
        `${MODULE_ID} | CALC END: ${observer.name} → ${target.name} - Returning: ${result}`,
      );
      return result;
    } catch (error) {
      console.error(
        `${MODULE_ID} | OPTIMIZED: Error calculating visibility for ${observer.name} → ${target.name}:`,
        error,
      );
      console.error(
        `${MODULE_ID} | ERROR DETAILS: Type: ${error.constructor.name}, Message: ${error.message}`,
      );
      if (error.stack) {
        console.error(`${MODULE_ID} | ERROR STACK:`, error.stack);
      }
      console.log(
        `${MODULE_ID} | ERROR FALLBACK: ${observer.name} → ${target.name} - Returning: observed`,
      );
      return 'observed'; // Default fallback
    }
  }

  /**
   * Get vision capabilities for a token (public API)
   * @param {Token} token
   * @returns {Object}
   */
  getVisionCapabilities(token) {
    return this.#visionAnalyzer.getVisionCapabilities(token);
  }

  /**
   * Clear caches in all components
   */
  clearCaches() {
    if (this.#lightingCalculator) {
      this.#lightingCalculator.clearLightCache();
    }
    if (this.#visionAnalyzer) {
      this.#visionAnalyzer.clearCache();
    }
  }

  /**
   * Get debug information for visibility calculation - IMMEDIATE
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<Object>}
   */
  async getVisibilityDebugInfo(observer, target) {
    if (!observer || !target) {
      return { error: 'Observer and target tokens required' };
    }

    // Calculate center position manually from document to avoid cached center issues
    const targetPosition = {
      x: target.document.x + (target.document.width * canvas.grid.size) / 2,
      y: target.document.y + (target.document.height * canvas.grid.size) / 2,
    };
    const lightLevel = this.#lightingCalculator.getLightLevelAt(targetPosition);
    const vision = this.#visionAnalyzer.getVisionCapabilities(observer);
    const hasLineOfSight = this.#visionAnalyzer.hasLineOfSight(observer, target);
    const canDetectWithoutSight = this.#visionAnalyzer.canDetectWithoutSight(observer, target);
    const isInvisible = this.#conditionManager.isInvisibleTo(observer, target);
    const calculatedVisibility = await this.calculateVisibility(observer, target);

    return {
      observer: observer.name,
      target: target.name,
      lightLevel,
      vision,
      hasLineOfSight,
      canDetectWithoutSight,
      isInvisible,
      calculatedVisibility,
      optimized: true,
      processingTime: 'immediate',
      components: {
        lighting: this.#lightingCalculator.getDebugInfo(targetPosition),
        vision: this.#visionAnalyzer.getDebugInfo(observer),
        invisibility: this.#conditionManager.getDebugInfo(observer, target),
      },
    };
  }

  /**
   * Get component instances for direct access if needed
   * @returns {Object}
   */
  getComponents() {
    return {
      lightingCalculator: this.#lightingCalculator,
      visionAnalyzer: this.#visionAnalyzer,
      ConditionManager: this.#conditionManager,
    };
  }

  /**
   * Get status information
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: !!(this.#lightingCalculator && this.#visionAnalyzer && this.#conditionManager),
      optimized: true,
      throttling: false,
      circuitBreaker: false,
      description: 'Zero-delay visibility calculator - no throttling or circuit breaking',
      components: {
        lightingCalculator: !!this.#lightingCalculator,
        visionAnalyzer: !!this.#visionAnalyzer,
        ConditionManager: !!this.#conditionManager,
      },
    };
  }
}

// Export singleton instance
export const visibilityCalculator = VisibilityCalculator.getInstance();

// Also export with the legacy name for backward compatibility
export const optimizedVisibilityCalculator = visibilityCalculator;
