/**
 * SneakPositionTracker - Service for tracking position states during sneak actions
 * Integrates with both AVS visibility system and Auto-Cover system to provide
 * unified position state information for enhanced sneak mechanics.
 */

import { VISIBILITY_STATES, COVER_STATES } from '../../../constants.js';
import dualSystemIntegration from './DualSystemIntegration.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/error-handling-service.js';
import performanceOptimizer from './PerformanceOptimizer.js';
import positionCacheManager from './PositionCacheManager.js';
import { getVisibilityBetween, getCoverBetween } from '../../../utils.js';
import { visibilityCalculator } from '../../../visibility/auto-visibility/VisibilityCalculator.js';
import { LightingCalculator } from '../../../visibility/auto-visibility/LightingCalculator.js';

/**
 * Position state data structure combining AVS and Auto-Cover information
 * @typedef {Object} PositionState
 * @property {string} avsVisibility - AVS visibility state ('hidden', 'concealed', 'observed', 'undetected')
 * @property {boolean} avsCalculated - Whether AVS calculation was successful
 * @property {string|null} avsOverride - Any AVS override applied
 * @property {string} coverState - Auto-Cover state ('none', 'lesser', 'standard', 'greater')
 * @property {boolean} coverCalculated - Whether cover calculation was successful
 * @property {string|null} coverOverride - Any cover override applied
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {string} effectiveVisibility - Final visibility considering both systems
 * @property {number} distance - Distance between tokens
 * @property {boolean} hasLineOfSight - Whether there's line of sight
 * @property {string} lightingConditions - Current lighting conditions
 * @property {number} timestamp - When this state was captured
 * @property {boolean} avsEnabled - Whether AVS system is enabled
 * @property {boolean} autoCoverEnabled - Whether Auto-Cover system is enabled
 * @property {Array<string>} systemErrors - Any errors encountered during calculation
 */

/**
 * Position transition data structure
 * @typedef {Object} PositionTransition
 * @property {string} targetId - ID of the target token
 * @property {PositionState} startPosition - Position state at start
 * @property {PositionState} endPosition - Position state at end
 * @property {boolean} hasChanged - Whether any position data changed
 * @property {boolean} avsVisibilityChanged - Whether AVS visibility changed
 * @property {boolean} coverStateChanged - Whether cover state changed
 * @property {number} impactOnDC - Impact on DC calculations
 * @property {number} stealthBonusChange - Change in stealth bonus
 * @property {string} transitionType - 'improved', 'worsened', or 'unchanged'
 * @property {Object} avsTransition - AVS-specific transition data
 * @property {Object} coverTransition - Cover-specific transition data
 */

export class SneakPositionTracker {
  constructor() {
    this._initialized = false;
  }

  /**
   * Initialize the tracker with required systems
   * @private
   */
  async _initialize() {
    if (this._initialized) return;

    console.debug('PF2E Visioner | Initializing SneakPositionTracker...');

    try {
      // Initialize dual system integration
      const initResult = await dualSystemIntegration.initialize();
      console.debug('PF2E Visioner | DualSystemIntegration init result:', initResult);
      this._initialized = true;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to initialize SneakPositionTracker:', error);
      this._initialized = false;
    }
  }

  /**
   * Captures current position state for all potential targets using both systems
   * @param {Token} sneakingToken - The token performing the sneak
   * @param {Array<Token>} targets - Array of potential observer tokens
   * @param {Object} storedStartPosition - Optional stored coordinates from StealthCheckUseCase
   * @param {Object} options - Capture options
   * @returns {Promise<Map<string, PositionState>>} Map of target ID to combined position state
   */
  async captureStartPositions(sneakingToken, targets, storedStartPosition = null, options = {}) {
    await this._initialize();

    console.debug('PF2E Visioner | captureStartPositions called:', {
      sneakingToken: sneakingToken?.name,
      targetCount: targets?.length,
      initialized: this._initialized,
    });

    if (!sneakingToken || !Array.isArray(targets)) {
      const error = new Error('Invalid parameters for captureStartPositions');
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.POSITION_TRACKER, error, {
        sneakingToken,
        targets,
      });
      return new Map();
    }

    // Use performance optimizer for large token counts
    if (targets.length > 10) {
      return performanceOptimizer.optimizeMultiTargetProcessing(
        sneakingToken,
        targets,
        (observer, target) => this._capturePositionState(observer, target, Date.now()),
        {
          ...options,
          cacheTTL: 30000,
          timeout: 5000,
        },
      );
    }

    // Standard processing for smaller counts
    const positionStates = new Map();
    const timestamp = Date.now();

    console.debug('PF2E Visioner | Processing', targets.length, 'targets for position capture');

    for (const target of targets) {
      if (!target?.document?.id) continue;

      console.debug('PF2E Visioner | Processing target:', target.name);

      try {
        // Pass stored position data for historical distance calculation
        const captureOptions = storedStartPosition 
          ? { storedSneakingPosition: storedStartPosition }
          : {};
        
        const positionState = await this._capturePositionState(
          sneakingToken, 
          target, 
          timestamp, 
          captureOptions
        );
        positionStates.set(target.document.id, positionState);
        console.debug('PF2E Visioner | Position state captured for:', target.name);
      } catch (error) {
        const errorResult = await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.POSITION_TRACKER,
          error,
          { sneakingToken, target, timestamp },
        );

        // Create error state with fallback data if available
        const errorState = errorResult.fallbackApplied
          ? this._createFallbackState(timestamp, errorResult.fallbackData)
          : this._createErrorState(timestamp, error);

        positionStates.set(target.document.id, errorState);
      }
    }

    console.debug(
      'PF2E Visioner | Position capture complete. Captured',
      positionStates.size,
      'position states',
    );
    return positionStates;
  }

  /**
   * Calculates end position state after movement using both systems
   * @param {Token} sneakingToken - The token after movement
   * @param {Array<Token>} targets - Array of observer tokens
   * @param {Object} options - Calculation options
   * @returns {Promise<Map<string, PositionState>>} Map of target ID to combined end position state
   */
  async calculateEndPositions(sneakingToken, targets, options = {}) {
    // Invalidate cache for moved token to ensure fresh calculations
    positionCacheManager.invalidateTokenCache(sneakingToken);

    // Use optimized capture with fresh cache
    return await this.captureStartPositions(sneakingToken, targets, null, {
      ...options,
      forceFresh: true,
    });
  }

  /**
   * Captures position state between two tokens using dual system integration
   * @param {Token} sneakingToken - The sneaking token
   * @param {Token} observerToken - The observing token
   * @param {number} timestamp - Timestamp for this capture
   * @param {Object} options - Capture options including storedSneakingPosition for historical calculations
   * @returns {Promise<PositionState>} Combined position state
   * @private
   */
  async _capturePositionState(sneakingToken, observerToken, timestamp, options = {}) {
    await this._initialize();
    
    try {
      // Check cache first unless forced fresh
      if (!options.forceFresh) {
        const cached = positionCacheManager.getCachedPositionState(observerToken, sneakingToken);
        if (cached !== null) {
          return cached;
        }
      }

      // Debug logging
      console.debug('PF2E Visioner | Capturing position state for:', {
        sneaking: sneakingToken?.name,
        observer: observerToken?.name,
        initialized: this._initialized,
        usingStoredPosition: !!options.storedSneakingPosition,
        storedCoordinates: options.storedSneakingPosition ? 
          `(${options.storedSneakingPosition.x}, ${options.storedSneakingPosition.y})` : 'none',
        currentCoordinates: `(${sneakingToken?.x}, ${sneakingToken?.y})`,
      });

      // Use dual system integration for safe system calls
      // Pass stored position information for accurate calculations
      const integrationOptions = {
        ...options,
        storedSneakingPosition: options.storedSneakingPosition,
      };
      
      const combinedState = await dualSystemIntegration.getCombinedSystemState(
        observerToken,
        sneakingToken,
        integrationOptions,
      );

      console.debug('PF2E Visioner | Combined state result:', combinedState);

      // Calculate additional position data (cached separately for performance)
      let distance = 0;
      let hasLineOfSight = true;
      let lightingConditions = 'unknown';

      try {
        // Use stored coordinates if provided (for historical position calculations)
        if (options.storedSneakingPosition) {
          distance = this._calculateDistanceWithStoredPosition(
            options.storedSneakingPosition, 
            observerToken
          );
          console.debug('PF2E Visioner | Distance calculated using stored position:', distance);
        } else {
          distance = this._calculateDistance(sneakingToken, observerToken);
          console.debug('PF2E Visioner | Distance calculated:', distance);
        }
      } catch (error) {
        console.warn('PF2E Visioner | Distance calculation failed:', error);
      }

      try {
        hasLineOfSight = this._hasLineOfSight(sneakingToken, observerToken);
        console.debug('PF2E Visioner | Line of sight calculated:', hasLineOfSight);
      } catch (error) {
        console.warn('PF2E Visioner | Line of sight calculation failed:', error);
      }

      try {
        lightingConditions = this._getLightingConditions(sneakingToken, observerToken);
        console.debug('PF2E Visioner | Lighting conditions calculated:', lightingConditions);
      } catch (error) {
        console.warn('PF2E Visioner | Lighting calculation failed:', error);
      }

      const positionState = {
        // AVS System Data
        avsVisibility: combinedState.avsResult.data,
        avsCalculated: combinedState.avsResult.success,
        avsOverride:
          combinedState.avsResult.source === 'override' ? combinedState.avsResult.data : null,

        // Auto-Cover System Data
        coverState: combinedState.coverResult.data.state,
        coverCalculated: combinedState.coverResult.success,
        coverOverride:
          combinedState.coverResult.source === 'manual'
            ? combinedState.coverResult.data.state
            : null,
        stealthBonus: combinedState.stealthBonus,

        // Combined/Derived Data
        effectiveVisibility: combinedState.effectiveVisibility,
        distance,
        hasLineOfSight,
        lightingConditions,
        timestamp,
        
        // Position calculation metadata
        usedStoredPosition: !!options.storedSneakingPosition,
        positionNote: options.storedSneakingPosition ? 
          'Distance calculated from stored coordinates; visibility/cover from current position' :
          'All calculations from current position',

        // System Status
        avsEnabled: combinedState.avsResult.success || combinedState.avsResult.fallbackUsed,
        autoCoverEnabled:
          combinedState.coverResult.success || combinedState.coverResult.fallbackUsed,
        systemErrors: combinedState.warnings,
      };

      console.debug('PF2E Visioner | Position state created:', positionState);

      // Cache the result with appropriate importance
      const importance = this._determinePositionImportance(positionState);
      positionCacheManager.cacheWithImportance(
        positionCacheManager._generatePositionKey(observerToken, sneakingToken),
        positionState,
        importance,
        { ttl: options.cacheTTL || 30000 },
      );

      console.debug('PF2E Visioner | Position state cached and returning');
      return positionState;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture position state:', error);
      return this._createErrorState(timestamp, error);
    }
  }

  /**
   * Batch capture positions for multiple targets using dual system integration
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} targets - Array of observer tokens
   * @returns {Promise<Map<string, PositionState>>} Map of target ID to position state
   */
  async captureBatchPositions(sneakingToken, targets) {
    await this._initialize();

    if (!sneakingToken || !Array.isArray(targets)) {
      console.warn('PF2E Visioner | Invalid parameters for captureBatchPositions');
      return new Map();
    }

    try {
      // Use dual system integration for efficient batch processing
      const batchResults = await dualSystemIntegration.getBatchCombinedStates(
        sneakingToken,
        targets,
      );

      const positionStates = new Map();
      const timestamp = Date.now();

      for (const [targetId, combinedState] of batchResults) {
        const target = targets.find((t) => t.document.id === targetId);
        if (!target) continue;

        // Calculate additional position data
        const distance = this._calculateDistance(sneakingToken, target);
        const hasLineOfSight = this._hasLineOfSight(sneakingToken, target);
        const lightingConditions = this._getLightingConditions(sneakingToken, target);

        const positionState = {
          // AVS System Data
          avsVisibility: combinedState.avsResult.data,
          avsCalculated: combinedState.avsResult.success,
          avsOverride:
            combinedState.avsResult.source === 'override' ? combinedState.avsResult.data : null,

          // Auto-Cover System Data
          coverState: combinedState.coverResult.data.state,
          coverCalculated: combinedState.coverResult.success,
          coverOverride:
            combinedState.coverResult.source === 'manual'
              ? combinedState.coverResult.data.state
              : null,
          stealthBonus: combinedState.stealthBonus,

          // Combined/Derived Data
          effectiveVisibility: combinedState.effectiveVisibility,
          distance,
          hasLineOfSight,
          lightingConditions,
          timestamp,

          // System Status
          avsEnabled: combinedState.avsResult.success || combinedState.avsResult.fallbackUsed,
          autoCoverEnabled:
            combinedState.coverResult.success || combinedState.coverResult.fallbackUsed,
          systemErrors: combinedState.warnings,
        };

        positionStates.set(targetId, positionState);
      }

      return positionStates;
    } catch (error) {
      console.warn('PF2E Visioner | Batch position capture failed:', error);
      return new Map();
    }
  }

  /**
   * Compares start and end positions to determine movement impact
   * @param {Map<string, PositionState>} startPositions - Start position states
   * @param {Map<string, PositionState>} endPositions - End position states
   * @returns {Map<string, PositionTransition>} Position transition data
   */
  analyzePositionTransitions(startPositions, endPositions) {
    const transitions = new Map();

    // Get all unique target IDs from both maps
    const allTargetIds = new Set([...startPositions.keys(), ...endPositions.keys()]);

    for (const targetId of allTargetIds) {
      const startPos = startPositions.get(targetId);
      const endPos = endPositions.get(targetId);

      // Skip if we don't have both positions
      if (!startPos || !endPos) continue;

      const transition = this._analyzePositionTransition(targetId, startPos, endPos);
      transitions.set(targetId, transition);
    }

    return transitions;
  }

  /**
   * Analyzes transition between two position states
   * @param {string} targetId - Target token ID
   * @param {PositionState} startPos - Start position state
   * @param {PositionState} endPos - End position state
   * @returns {PositionTransition} Transition analysis
   * @private
   */
  _analyzePositionTransition(targetId, startPos, endPos) {
    // Check what changed
    const avsVisibilityChanged = startPos.avsVisibility !== endPos.avsVisibility;
    const coverStateChanged = startPos.coverState !== endPos.coverState;
    const hasChanged = avsVisibilityChanged || coverStateChanged;

    // Calculate stealth bonus change
    const stealthBonusChange = endPos.stealthBonus - startPos.stealthBonus;

    // Determine transition type
    let transitionType = 'unchanged';
    if (hasChanged) {
      // Improved if visibility got better for sneaking or cover improved
      const visibilityImproved = this._isVisibilityImprovedForStealth(
        startPos.avsVisibility,
        endPos.avsVisibility,
      );
      const coverImproved = stealthBonusChange > 0;

      if (visibilityImproved || coverImproved) {
        transitionType = 'improved';
      } else {
        transitionType = 'worsened';
      }
    }

    // Calculate impact on DC (simplified)
    const impactOnDC = stealthBonusChange;

    return {
      targetId,
      startPosition: startPos,
      endPosition: endPos,
      hasChanged,
      avsVisibilityChanged,
      coverStateChanged,
      impactOnDC,
      stealthBonusChange,
      transitionType,
      avsTransition: {
        from: startPos.avsVisibility,
        to: endPos.avsVisibility,
        changed: avsVisibilityChanged,
      },
      coverTransition: {
        from: startPos.coverState,
        to: endPos.coverState,
        bonusChange: stealthBonusChange,
        changed: coverStateChanged,
      },
    };
  }

  /**
   * Determines if visibility change is improved for stealth purposes
   * @param {string} fromVisibility - Starting visibility
   * @param {string} toVisibility - Ending visibility
   * @returns {boolean} Whether the change is an improvement for stealth
   * @private
   */
  _isVisibilityImprovedForStealth(fromVisibility, toVisibility) {
    // Define stealth preference order (better for stealth = higher index)
    const stealthOrder = ['observed', 'concealed', 'hidden', 'undetected'];
    const fromIndex = stealthOrder.indexOf(fromVisibility);
    const toIndex = stealthOrder.indexOf(toVisibility);

    return toIndex > fromIndex;
  }

  /**
   * Gets system diagnostics using dual system integration
   * @returns {Object} System diagnostic information
   */
  getSystemDiagnostics() {
    return dualSystemIntegration.getSystemDiagnostics();
  }

  /**
   * Calculates distance between two tokens using FoundryVTT v13 APIs
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {number} Distance in grid units
   * @private
   */
  _calculateDistance(token1, token2) {
    try {
      // Use the updated v13+ API for distance calculation
      if (canvas.grid.measurePath) {
        const path = canvas.grid.measurePath([token1.center, token2.center]);
        return path.distance;
      } else if (canvas.grid.measureDistance) {
        // Fallback for older versions
        return canvas.grid.measureDistance(token1.center, token2.center);
      } else {
        // Ultimate fallback to simple Euclidean distance
        const dx = token1.center.x - token2.center.x;
        const dy = token1.center.y - token2.center.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    } catch (error) {
      // Fallback to simple Euclidean distance
      const dx = token1.center.x - token2.center.x;
      const dy = token1.center.y - token2.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      console.warn('PF2E Visioner | Using fallback distance calculation:', distance);
      return distance;
    }
  }

  /**
   * Calculates distance using stored coordinates instead of current token position
   * @param {Object} storedPosition - Stored position with x, y coordinates
   * @param {Token} observerToken - The observer token
   * @returns {number} Distance in grid units
   * @private
   */
  _calculateDistanceWithStoredPosition(storedPosition, observerToken) {
    try {
      const storedCenter = { x: storedPosition.x, y: storedPosition.y };
      
      // Use the updated v13+ API for distance calculation
      if (canvas.grid.measurePath) {
        const path = canvas.grid.measurePath([storedCenter, observerToken.center]);
        return path.distance;
      } else if (canvas.grid.measureDistance) {
        // Fallback for older versions
        return canvas.grid.measureDistance(storedCenter, observerToken.center);
      } else {
        // Ultimate fallback to simple Euclidean distance
        const dx = storedCenter.x - observerToken.center.x;
        const dy = storedCenter.y - observerToken.center.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
    } catch (error) {
      // Fallback to simple Euclidean distance
      const dx = storedPosition.x - observerToken.center.x;
      const dy = storedPosition.y - observerToken.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      console.warn('PF2E Visioner | Using fallback distance calculation with stored position:', distance);
      return distance;
    }
  }

  /**
   * Checks if there's line of sight between tokens using FoundryVTT v13 APIs
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {boolean} Whether there's line of sight
   * @private
   */
  _hasLineOfSight(token1, token2) {
    try {
      // Use AVS VisionAnalyzer for line of sight calculation
      const visionAnalyzer = visibilityCalculator.getComponents().visionAnalyzer;
      if (visionAnalyzer && visionAnalyzer.hasLineOfSight) {
        return visionAnalyzer.hasLineOfSight(token1, token2);
      }

      // Fallback to Foundry's built-in collision detection
      const ray = new foundry.canvas.geometry.Ray(token1.center, token2.center);

      // Check if walls block line of sight using v13+ API
      if (canvas.walls?.testCollision) {
        return !canvas.walls.testCollision(ray.A, ray.B, { type: 'sight' });
      } else if (canvas.walls?.checkCollision) {
        return !canvas.walls.checkCollision(ray, { type: 'sight' });
      } else {
        // Fallback: assume line of sight exists
        console.warn(
          'PF2E Visioner | No wall collision detection available, assuming line of sight',
        );
        return true;
      }
    } catch (error) {
      console.warn('PF2E Visioner | Line of sight calculation failed:', error);
      return true; // Default to true if calculation fails
    }
  }

  /**
   * Gets lighting conditions between tokens
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {string} Lighting condition description
   * @private
   */
  _getLightingConditions(token1, token2) {
    try {
      // Use the LightingCalculator singleton directly for accurate lighting analysis
      const lightingCalculator = LightingCalculator.getInstance();

      // Use target token position for lighting calculation (where the sneaking token is)
      const targetPosition = {
        x: token2.center.x,
        y: token2.center.y,
      };

      const lightLevelInfo = lightingCalculator.getLightLevelAt(targetPosition);

      // Return the light level directly from the calculator
      return lightLevelInfo.level; // Returns 'bright', 'dim', or 'darkness'
    } catch (error) {
      console.warn('PF2E Visioner | Lighting calculation failed:', error);
      return 'unknown';
    }
  }

  /**
   * Calculate visibility using AVS directly (for fallback scenarios)
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {Promise<string>} Visibility state
   * @private
   */
  async _calculateVisibilityWithAVS(observer, target) {
    try {
      // Use AVS visibility calculator directly
      return await visibilityCalculator.calculateVisibility(observer, target);
    } catch (error) {
      console.warn('PF2E Visioner | AVS visibility calculation failed:', error);
      // Fallback to stored visibility state
      return getVisibilityBetween(observer, target) || 'observed';
    }
  }

  /**
   * Get detailed lighting information using the LightingCalculator
   * @param {Token} token - Token to get lighting info for
   * @returns {Object} Detailed lighting information
   * @private
   */
  _getDetailedLightingInfo(token) {
    try {
      const lightingCalculator = LightingCalculator.getInstance();
      const position = {
        x: token.center.x,
        y: token.center.y,
      };

      return lightingCalculator.getLightLevelAt(position);
    } catch (error) {
      console.warn('PF2E Visioner | Detailed lighting calculation failed:', error);
      return {
        level: 'unknown',
        illumination: 0,
        sceneDarkness: 0,
        baseIllumination: 0,
        lightIllumination: 0,
      };
    }
  }

  /**
   * Creates an error state when position calculation fails
   * @param {number} timestamp - Timestamp for the error state
   * @param {Error} error - The error that occurred
   * @returns {PositionState} Error position state
   * @private
   */
  _createErrorState(timestamp, error) {
    const diagnostics = dualSystemIntegration.getSystemDiagnostics();

    return {
      avsVisibility: 'observed',
      avsCalculated: false,
      avsOverride: null,
      coverState: 'none',
      coverCalculated: false,
      coverOverride: null,
      stealthBonus: 0,
      effectiveVisibility: 'observed',
      distance: 0,
      hasLineOfSight: true,
      lightingConditions: 'unknown',
      timestamp,
      avsEnabled: diagnostics.avs.available,
      autoCoverEnabled: diagnostics.autoCover.available,
      systemErrors: [`Position calculation failed: ${error.message}`],
    };
  }

  /**
   * Creates a fallback state when error handling provides fallback data
   * @param {number} timestamp - Timestamp for the state
   * @param {*} fallbackData - Fallback data from error handling
   * @returns {PositionState} Fallback position state
   * @private
   */
  _createFallbackState(timestamp, fallbackData) {
    const diagnostics = dualSystemIntegration.getSystemDiagnostics();

    return {
      avsVisibility: fallbackData?.visibility || 'observed',
      avsCalculated: false,
      avsOverride: null,
      coverState: fallbackData?.cover?.state || 'none',
      coverCalculated: false,
      coverOverride: null,
      stealthBonus: fallbackData?.cover?.bonus || 0,
      effectiveVisibility: fallbackData?.visibility || 'observed',
      distance: 0,
      hasLineOfSight: true,
      lightingConditions: 'unknown',
      timestamp,
      avsEnabled: diagnostics.avs.available,
      autoCoverEnabled: diagnostics.autoCover.available,
      systemErrors: ['Using fallback data due to system failure'],
    };
  }

  /**
   * Gets comprehensive system status including error handling information
   * @returns {Object} Enhanced system diagnostic information
   */
  getEnhancedSystemDiagnostics() {
    const baseDiagnostics = this.getSystemDiagnostics();
    const errorHandlingStatus = errorHandlingService.getSystemStatus();
    const errorHistory = errorHandlingService.getErrorHistory();

    return {
      ...baseDiagnostics,
      errorHandling: {
        systemStatus: errorHandlingStatus,
        recentErrors: errorHistory.slice(0, 10), // Last 10 errors
        recoveryCapabilities: {
          avs: errorHandlingStatus[SYSTEM_TYPES.AVS]?.recoveryAttempts < 3,
          autoCover: errorHandlingStatus[SYSTEM_TYPES.AUTO_COVER]?.recoveryAttempts < 3,
          positionTracker: errorHandlingStatus[SYSTEM_TYPES.POSITION_TRACKER]?.recoveryAttempts < 3,
        },
      },
    };
  }

  /**
   * Attempts to recover from system failures
   * @param {string} systemType - Optional specific system to recover
   * @returns {Promise<Object>} Recovery results
   */
  async attemptSystemRecovery(systemType = null) {
    const results = {};

    if (systemType) {
      results[systemType] = await errorHandlingService.attemptSystemRecovery(systemType);
    } else {
      // Attempt recovery for all systems
      const systems = [SYSTEM_TYPES.AVS, SYSTEM_TYPES.AUTO_COVER, SYSTEM_TYPES.POSITION_TRACKER];

      for (const system of systems) {
        results[system] = await errorHandlingService.attemptSystemRecovery(system);
      }
    }

    return results;
  }

  /**
   * Optimizes position tracking for large scenes with many tokens
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} allTargets - All potential observer tokens
   * @param {Object} options - Optimization options
   * @returns {Promise<Map<string, PositionState>>} Optimized position states
   */
  async optimizeForLargeScene(sneakingToken, allTargets, options = {}) {
    const maxDistance = options.maxDistance || 1000; // Only consider nearby tokens
    const useStreaming = options.useStreaming || allTargets.length > 100;

    // Filter targets by distance for performance
    const nearbyTargets = allTargets.filter((target) => {
      const distance = this._calculateDistance(sneakingToken, target);
      return distance <= maxDistance;
    });

    // Use streaming for very large token counts
    if (useStreaming) {
      const results = new Map();

      for await (const batch of performanceOptimizer.streamLargeTokenProcessing(
        sneakingToken,
        nearbyTargets,
        (observer, target) => this._capturePositionState(observer, target, Date.now()),
        options,
      )) {
        // Merge batch results
        for (const [targetId, result] of batch.results) {
          results.set(targetId, result);
        }

        // Optional progress callback
        if (options.onProgress) {
          options.onProgress(batch.progress);
        }
      }

      return results;
    }

    // Use standard optimization for moderate counts
    return performanceOptimizer.optimizeMultiTargetProcessing(
      sneakingToken,
      nearbyTargets,
      (observer, target) => this._capturePositionState(observer, target, Date.now()),
      options,
    );
  }

  /**
   * Preloads position cache for anticipated sneak actions
   * @param {Token} sneakingToken - The token that might sneak
   * @param {Array<Token>} potentialTargets - Potential observer tokens
   * @param {Object} options - Preload options
   * @returns {Promise<number>} Number of entries preloaded
   */
  async preloadPositionCache(sneakingToken, potentialTargets, options = {}) {
    const calculator = async (observer, target) => {
      return this._capturePositionState(observer, target, Date.now(), { forceFresh: true });
    };

    return positionCacheManager.preloadPositionStates(sneakingToken, potentialTargets, calculator, {
      batchSize: options.batchSize || 10,
      ttl: options.ttl || 60000, // Longer TTL for preloaded data
    });
  }

  /**
   * Implements predictive caching based on token movement
   * @param {Token} sneakingToken - The moving token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} options - Prediction options
   * @returns {Promise<void>} Prediction completion
   */
  async enablePredictivePositionCaching(sneakingToken, observers, options = {}) {
    const calculator = async (observer, target) => {
      return this._capturePositionState(observer, target, Date.now(), { forceFresh: true });
    };

    return positionCacheManager.predictiveCache(sneakingToken, observers, calculator, {
      predictionRadius: options.predictionRadius || 200,
      maxPredictions: options.maxPredictions || 20,
      ttl: options.ttl || 15000, // Shorter TTL for predictions
    });
  }

  /**
   * Gets comprehensive performance metrics
   * @returns {Object} Performance and cache metrics
   */
  getPerformanceMetrics() {
    return {
      optimizer: performanceOptimizer.getMetrics(),
      cache: positionCacheManager.getStats(),
      system: this.getEnhancedSystemDiagnostics(),
    };
  }

  /**
   * Optimizes memory usage by cleaning up caches
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async optimizeMemoryUsage(options = {}) {
    const results = {
      cacheCleanup: false,
      memoryFreed: 0,
      entriesRemoved: 0,
    };

    // Get current memory usage
    const cacheStats = positionCacheManager.getStats();
    const targetMemoryMB = options.targetMemoryMB || 30; // 30MB default

    if (cacheStats.memoryUsageMB > targetMemoryMB) {
      const beforeMemory = cacheStats.memoryUsageMB;
      const beforeEntries = cacheStats.totalEntries;

      await positionCacheManager.memoryAwareCleanup(targetMemoryMB);

      const afterStats = positionCacheManager.getStats();

      results.cacheCleanup = true;
      results.memoryFreed = beforeMemory - afterStats.memoryUsageMB;
      results.entriesRemoved = beforeEntries - afterStats.totalEntries;
    }

    return results;
  }

  /**
   * Determines the importance level of a position state for caching
   * @param {PositionState} positionState - Position state to evaluate
   * @returns {string} Importance level
   * @private
   */
  _determinePositionImportance(positionState) {
    // Critical: Hidden or undetected states (most important for stealth)
    if (positionState.avsVisibility === 'hidden' || positionState.avsVisibility === 'undetected') {
      return 'critical';
    }

    // High: Concealed states or significant cover
    if (positionState.avsVisibility === 'concealed' || positionState.stealthBonus >= 2) {
      return 'high';
    }

    // Low: Observed states with no cover
    if (positionState.avsVisibility === 'observed' && positionState.stealthBonus === 0) {
      return 'low';
    }

    // Normal: Everything else
    return 'normal';
  }
}

// Export singleton instance
export default new SneakPositionTracker();
