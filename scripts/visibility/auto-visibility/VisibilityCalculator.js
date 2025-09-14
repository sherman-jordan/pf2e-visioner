/**
 * VisibilityCalculator - Zero-delay visibility calculation
 * Bypasses all throttling and circuit breaking for immediate processing
 */


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
      return 'observed';
    }

    try {
      // Step 1: Check if observer is blinded (cannot see anything)
      const isBlinded = this.#conditionManager.isBlinded(observer);
      if (isBlinded) {
        return 'hidden';
      }

      // Step 2: Check if target is completely invisible to observer
      const isInvisible = this.#conditionManager.isInvisibleTo(observer, target);
      if (isInvisible) {
        // In PF2e, invisible targets are undetected to all observers unless they have special abilities
        return 'undetected';
      }

      // Step 3: Check if observer is dazzled (everything appears concealed)
      const isDazzled = this.#conditionManager.isDazzled(observer);
      if (isDazzled) {
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

      // Step 6: Determine visibility based on light level and observer's vision
      const result = this.#visionAnalyzer.determineVisibilityFromLighting(
        lightLevel,
        observerVision,
        target, // Pass the target token for sneaking checks
      );

      return result;
    } catch (error) {
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
