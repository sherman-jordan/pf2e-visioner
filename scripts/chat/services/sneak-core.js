/**
 * SneakCore - Unified service for all sneak action functionality
 * Consolidates position tracking, system integration, state management, and dialog logic
 * Eliminates duplication across SneakActionHandler, SneakPreviewDialog, DualSystemIntegration, and SneakPositionTracker
 */

import { COVER_STATES, SNEAK_FLAGS, VISIBILITY_STATES } from '../../constants.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { getCoverBetween, getVisibilityBetween } from '../../utils.js';
import { notify } from './infra/notifications.js';
import { calculateStealthRollTotals, shouldFilterAlly } from './infra/shared-utils.js';
import unifiedSystemIntegration from './unified-system-integration.js';
import simplifiedPositionTracker from './simplified-position-tracker.js';

/**
 * Unified sneak state data structure
 * @typedef {Object} SneakState
 * @property {Token} sneakingToken - The token performing the sneak
 * @property {Array<Token>} observers - Observer tokens
 * @property {Map<string, PositionState>} startPositions - Start position states
 * @property {Map<string, PositionState>} endPositions - End position states
 * @property {Map<string, PositionTransition>} transitions - Position transitions
 * @property {Object} actionData - Action data from the original action
 * @property {boolean} isTracking - Whether position tracking is active
 * @property {number} timestamp - When the sneak action started
 */

/**
 * Simplified position state combining all necessary data
 * @typedef {Object} PositionState
 * @property {string} visibility - Current visibility state
 * @property {string} coverState - Current cover state
 * @property {number} stealthBonus - Stealth bonus from cover
 * @property {number} distance - Distance between tokens
 * @property {boolean} calculated - Whether calculation was successful
 * @property {Array<string>} errors - Any errors encountered
 */

export class SneakCore {
  constructor() {
    this._activeStates = new Map(); // messageId -> SneakState
    this._initialized = false;
    this._systemIntegration = unifiedSystemIntegration;
    this._positionTracker = simplifiedPositionTracker;
  }

  /**
   * Initialize the core service
   */
  async initialize() {
    if (this._initialized) return true;

    try {
      await this._systemIntegration.initialize();
      this._initialized = true;
      console.debug('PF2E Visioner | SneakCore initialized successfully');
      return true;
    } catch (error) {
      console.warn('PF2E Visioner | SneakCore initialization failed:', error);
      return false;
    }
  }

  /**
   * Start a new sneak action session
   * @param {Token} sneakingToken - The sneaking token
   * @param {Array<Token>} observers - Observer tokens
   * @param {Object} actionData - Action data
   * @returns {Promise<string>} Session ID
   */
  async startSneakSession(sneakingToken, observers, actionData) {
    await this.initialize();

    const sessionId = actionData.messageId || `sneak-${Date.now()}`;
    const timestamp = Date.now();

    // Filter observers based on ally settings
    const filteredObservers = observers.filter(observer => 
      !shouldFilterAlly(observer, sneakingToken)
    );

    // Capture start positions
    const startPositions = await this._capturePositions(sneakingToken, filteredObservers, {
      timestamp,
      useStoredPosition: actionData.storedStartPosition
    });

    // Create sneak state
    const sneakState = {
      sneakingToken,
      observers: filteredObservers,
      startPositions,
      endPositions: new Map(),
      transitions: new Map(),
      actionData,
      isTracking: true,
      timestamp
    };

    this._activeStates.set(sessionId, sneakState);
    
    // Set sneak flag
    await this._setSneakFlag(sneakingToken, true);

    console.debug('PF2E Visioner | Sneak session started:', sessionId);
    return sessionId;
  }

  /**
   * Process sneak outcomes for a session
   * @param {string} sessionId - Session ID
   * @param {Array<Object>} rawOutcomes - Raw outcomes from action processing
   * @returns {Promise<Array<Object>>} Processed outcomes with position data
   */
  async processOutcomes(sessionId, rawOutcomes) {
    const state = this._activeStates.get(sessionId);
    if (!state) {
      console.warn('PF2E Visioner | No active sneak state for session:', sessionId);
      return rawOutcomes;
    }

    // Capture end positions if movement occurred
    if (this._hasTokenMoved(state.sneakingToken, state.timestamp)) {
      state.endPositions = await this._capturePositions(
        state.sneakingToken, 
        state.observers, 
        { timestamp: Date.now(), forceFresh: true }
      );
      
      // Analyze transitions
      state.transitions = this._analyzeTransitions(state.startPositions, state.endPositions);
    }

    // Enhance outcomes with position data
    return this._enhanceOutcomes(rawOutcomes, state);
  }

  /**
   * Apply sneak results using unified system
   * @param {string} sessionId - Session ID
   * @param {Array<Object>} outcomes - Processed outcomes
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   */
  async applyResults(sessionId, outcomes, options = {}) {
    
    const state = this._activeStates.get(sessionId);
    if (!state) {
      console.error('PF2E Visioner | No active sneak state for session:', sessionId);
      throw new Error(`No active sneak state for session: ${sessionId}`);
    }

    try {
      // Convert outcomes to sneak results format
      const sneakResults = this._convertToSneakResults(outcomes, state);

      // Apply using dual system (only visibility changes for sneak)
      const { default: dualSystemApplication } = await import('./dual-system-result-application.js');
      
      const result = await dualSystemApplication.applySneakResults(sneakResults, {
        direction: 'observer_to_target',
        skipCoverChanges: true, // Sneak only affects visibility
        ...options
      });

      if (result.success) {
        // Cache for revert functionality
        this._cacheApplicationResult(sessionId, result);
      }

      return result;
    } catch (error) {
      console.error('PF2E Visioner | Failed to apply sneak results:', error);
      throw error;
    }
  }

  /**
   * Revert sneak results
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} Whether revert succeeded
   */
  async revertResults(sessionId) {
    const cachedResult = this._getCachedResult(sessionId);
    if (!cachedResult) {
      console.warn('PF2E Visioner | No cached result to revert for session:', sessionId);
      return false;
    }

    try {
      const { default: dualSystemApplication } = await import('./dual-system-result-application.js');
      const success = await dualSystemApplication.rollbackTransaction(cachedResult.transactionId);
      
      if (success) {
        this._clearCachedResult(sessionId);
        console.debug('PF2E Visioner | Sneak results reverted successfully:', sessionId);
      }
      
      return success;
    } catch (error) {
      console.error('PF2E Visioner | Failed to revert sneak results:', error);
      return false;
    }
  }

  /**
   * End a sneak session and cleanup
   * @param {string} sessionId - Session ID
   */
  async endSneakSession(sessionId) {
    const state = this._activeStates.get(sessionId);
    if (state) {
      // Clear sneak flag
      await this._setSneakFlag(state.sneakingToken, false);
      
      // Cleanup state
      this._activeStates.delete(sessionId);
      this._clearCachedResult(sessionId);
      
      console.debug('PF2E Visioner | Sneak session ended:', sessionId);
    }
  }

  /**
   * Get current sneak state for a session
   * @param {string} sessionId - Session ID
   * @returns {SneakState|null} Current state or null
   */
  getSneakState(sessionId) {
    return this._activeStates.get(sessionId) || null;
  }

  /**
   * Check if a token is currently sneaking
   * @param {Token} token - Token to check
   * @returns {boolean} Whether token is sneaking
   */
  isSneaking(token) {
    return token?.document?.getFlag('pf2e-visioner', 'sneak-active') || false;
  }

  // Private methods

  /**
   * Capture position states for all observers
   * @private
   */
  async _capturePositions(sneakingToken, observers, options = {}) {
    // Use simplified position tracker for batch processing
    return await this._positionTracker.capturePositions(sneakingToken, observers, options);
  }

  /**
   * Capture position state for a single observer
   * @private
   */
  async _capturePositionState(sneakingToken, observer, options = {}) {
    try {
      // Get combined system state using unified integration
      const systemState = await this._systemIntegration.getCombinedState(
        observer, 
        sneakingToken, 
        options
      );

      return {
        visibility: systemState.visibility || 'observed',
        coverState: systemState.coverState || 'none',
        stealthBonus: systemState.stealthBonus || 0,
        distance: this._calculateDistance(sneakingToken, observer),
        calculated: systemState.calculated,
        errors: systemState.warnings || []
      };
    } catch (error) {
      // Fallback to manual detection
      return {
        visibility: getVisibilityBetween(observer, sneakingToken) || 'observed',
        coverState: getCoverBetween(observer, sneakingToken) || 'none',
        stealthBonus: this._getCoverBonus(getCoverBetween(observer, sneakingToken)),
        distance: this._calculateDistance(sneakingToken, observer),
        calculated: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Analyze position transitions
   * @private
   */
  _analyzeTransitions(startPositions, endPositions) {
    // Use simplified position tracker for transition analysis
    return this._positionTracker.analyzeTransitions(startPositions, endPositions);
  }

  /**
   * Enhance outcomes with position data
   * @private
   */
  _enhanceOutcomes(outcomes, state) {
    return outcomes.map(outcome => {
      const observerId = outcome.token?.document?.id;
      const startPos = state.startPositions.get(observerId);
      const endPos = state.endPositions.get(observerId);
      const transition = state.transitions.get(observerId);

      return {
        ...outcome,
        startPosition: startPos,
        endPosition: endPos,
        positionTransition: transition,
        hasPositionData: !!transition
      };
    });
  }

  /**
   * Convert outcomes to sneak results format
   * @private
   */
  _convertToSneakResults(outcomes, state) {
    return outcomes.map(outcome => ({
      token: outcome.token,
      actor: state.sneakingToken,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      positionTransition: outcome.positionTransition,
      overrideState: outcome.overrideState
    }));
  }

  /**
   * Utility methods
   * @private
   */
  _calculateDistance(token1, token2) {
    if (!token1?.center || !token2?.center) return 0;
    const dx = token1.center.x - token2.center.x;
    const dy = token1.center.y - token2.center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getCoverBonus(coverState) {
    return COVER_STATES[coverState]?.bonusStealth || 0;
  }

  // Removed _isVisibilityImproved - now handled by simplified position tracker

  _hasTokenMoved(token, since) {
    // Use simplified position tracker for movement detection
    return this._positionTracker.hasTokenMoved(token, since);
  }

  async _setSneakFlag(token, active) {
    try {
      if (active) {
        await token.document.setFlag('pf2e-visioner', 'sneak-active', true);
      } else {
        await token.document.unsetFlag('pf2e-visioner', 'sneak-active');
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to set sneak flag:', error);
    }
  }

  // Cache management for apply/revert functionality
  _cacheApplicationResult(sessionId, result) {
    if (!this._resultCache) this._resultCache = new Map();
    this._resultCache.set(sessionId, result);
  }

  _getCachedResult(sessionId) {
    return this._resultCache?.get(sessionId) || null;
  }

  _clearCachedResult(sessionId) {
    this._resultCache?.delete(sessionId);
  }
}

export default new SneakCore();