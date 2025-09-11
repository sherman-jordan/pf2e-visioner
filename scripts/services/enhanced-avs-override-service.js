/**
 * Enhanced AVS Override Service - Extends AVS override functionality for position-aware sneak results
 * Integrates with position tracking data to provide context-aware override management
 */

import errorHandlingService, { SYSTEM_TYPES } from '../chat/services/infra/error-handling-service.js';
import { MODULE_ID } from '../constants.js';
import * as avsOverrideService from './avs-override-service.js';

/**
 * Position-aware AVS override data structure
 * @typedef {Object} PositionAwareOverride
 * @property {string} targetId - Target token ID
 * @property {string} targetName - Target token name
 * @property {string} visibilityState - Override visibility state
 * @property {number} timestamp - When override was created
 * @property {Object} positionContext - Position data when override was applied
 * @property {string} overrideReason - Reason for the override
 * @property {boolean} isPositionBased - Whether override considers position data
 * @property {Object} validationData - Data used to validate override consistency
 */

/**
 * Override conflict resolution result
 * @typedef {Object} ConflictResolution
 * @property {boolean} hasConflict - Whether there's a conflict
 * @property {string} conflictType - Type of conflict detected
 * @property {string} recommendedAction - Recommended resolution
 * @property {Object} conflictDetails - Detailed conflict information
 */

export class EnhancedAVSOverrideService {
  constructor() {
    this._positionOverrides = new Map(); // Store position-aware overrides
    this._conflictResolutions = new Map(); // Store conflict resolution data
  }

  /**
   * Sets AVS override with position context using v13 flag and document APIs
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @param {string} visibilityState - The visibility state to override with
   * @param {Object} positionContext - Position data context
   * @param {string} reason - Reason for the override
   * @returns {Promise<boolean>} Success status
   */
  async setPositionAwareOverride(observer, target, visibilityState, positionContext = null, reason = 'manual') {
    if (!observer?.document || !target?.document) {
      const error = new Error('Invalid observer or target token provided for position-aware override');
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        error,
        { observer, target, visibilityState, positionContext }
      );
      return false;
    }

    if (!['observed', 'concealed', 'hidden', 'undetected'].includes(visibilityState)) {
      const error = new Error(`Invalid visibility state for position-aware override: ${visibilityState}`);
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        error,
        { observer, target, visibilityState }
      );
      return false;
    }

    try {
      // Validate override consistency with position data
      const validationResult = await this._validateOverrideConsistency(
        observer, 
        target, 
        visibilityState, 
        positionContext
      );

      if (!validationResult.isValid && validationResult.severity === 'error') {
        console.warn('PF2E Visioner | Override validation failed:', validationResult.issues);
        return false;
      }

      // Create position-aware override data
      const positionAwareOverride = {
        targetId: target.document.id,
        targetName: target.name,
        visibilityState,
        timestamp: Date.now(),
        positionContext: positionContext ? {
          startPosition: positionContext.startPosition,
          endPosition: positionContext.endPosition,
          transitionType: positionContext.transitionType,
          hasPositionData: true
        } : { hasPositionData: false },
        overrideReason: reason,
        isPositionBased: !!positionContext,
        validationData: {
          validationResult,
          originalCalculation: positionContext?.endPosition?.avsVisibility || 'unknown',
          overrideJustification: this._generateOverrideJustification(visibilityState, positionContext)
        }
      };

      // Store position-aware override data using v13 document APIs
      const overrideKey = `${observer.document.id}->${target.document.id}`;
      const currentOverrides = observer.document.getFlag(MODULE_ID, 'position-aware-overrides') || {};
      currentOverrides[overrideKey] = positionAwareOverride;

      await observer.document.setFlag(MODULE_ID, 'position-aware-overrides', currentOverrides);

      // Also set the standard AVS override for compatibility
      await avsOverrideService.setAVSOverride(observer, target, visibilityState);

      // Store in memory for quick access
      this._positionOverrides.set(overrideKey, positionAwareOverride);

      console.log(
        `${MODULE_ID} | Position-aware AVS override set: ${observer.name} → ${target.name} = ${visibilityState}`,
        { positionContext: !!positionContext, reason }
      );

      return true;
    } catch (error) {
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        error,
        { observer, target, visibilityState, positionContext, phase: 'set_override' }
      );
      return false;
    }
  }

  /**
   * Applies override that considers both start and end positions using v13 token document updates
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @param {string} visibilityState - Override visibility state
   * @param {Object} positionTransition - Position transition data
   * @returns {Promise<boolean>} Success status
   */
  async applyPositionBasedOverride(observer, target, visibilityState, positionTransition) {
    if (!positionTransition?.startPosition || !positionTransition?.endPosition) {
      console.warn('PF2E Visioner | Cannot apply position-based override without complete position data');
      return false;
    }

    try {
      // Analyze position impact on override decision
      const positionImpact = this._analyzePositionImpactOnOverride(positionTransition, visibilityState);
      
      // Check for conflicts between position data and override
      const conflictResult = await this._checkOverrideConflicts(
        observer, 
        target, 
        visibilityState, 
        positionTransition
      );

      if (conflictResult.hasConflict) {
        // Store conflict for resolution
        const conflictKey = `${observer.document.id}->${target.document.id}`;
        this._conflictResolutions.set(conflictKey, conflictResult);
        
        console.warn('PF2E Visioner | Override conflict detected:', conflictResult);
        
        // Handle conflict based on severity
        if (conflictResult.conflictType === 'critical') {
          return false; // Block override for critical conflicts
        }
      }

      // Apply the override with enhanced context
      const success = await this.setPositionAwareOverride(
        observer, 
        target, 
        visibilityState, 
        {
          startPosition: positionTransition.startPosition,
          endPosition: positionTransition.endPosition,
          transitionType: positionTransition.transitionType,
          positionImpact
        },
        'position-based'
      );

      if (success && conflictResult.hasConflict) {
        // Log successful override despite conflict
        console.log(
          `${MODULE_ID} | Position-based override applied despite ${conflictResult.conflictType} conflict:`,
          conflictResult.recommendedAction
        );
      }

      return success;
    } catch (error) {
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        error,
        { observer, target, visibilityState, positionTransition, phase: 'apply_position_override' }
      );
      return false;
    }
  }

  /**
   * Validates override consistency with position data using v13 validation patterns
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} visibilityState - Proposed override state
   * @param {Object} positionContext - Position context data
   * @returns {Promise<Object>} Validation result
   * @private
   */
  async _validateOverrideConsistency(observer, target, visibilityState, positionContext) {
    const validationResult = {
      isValid: true,
      severity: 'info', // 'info', 'warning', 'error'
      issues: [],
      recommendations: []
    };

    try {
      // Skip position validation if no position context
      if (!positionContext?.endPosition) {
        validationResult.issues.push('No position context available for validation');
        validationResult.severity = 'warning';
        return validationResult;
      }

      const endPosition = positionContext.endPosition;
      
      // Check if override conflicts with calculated position
      if (endPosition.avsVisibility && endPosition.avsVisibility !== visibilityState) {
        const calculatedState = endPosition.avsVisibility;
        const overrideState = visibilityState;
        
        // Determine severity based on the nature of the conflict
        const conflictSeverity = this._assessOverrideConflictSeverity(calculatedState, overrideState);
        
        if (conflictSeverity === 'critical') {
          validationResult.isValid = false;
          validationResult.severity = 'error';
          validationResult.issues.push(
            `Critical conflict: Override state '${overrideState}' conflicts with calculated state '${calculatedState}'`
          );
        } else if (conflictSeverity === 'moderate') {
          validationResult.severity = 'warning';
          validationResult.issues.push(
            `Override state '${overrideState}' differs from calculated state '${calculatedState}'`
          );
          validationResult.recommendations.push(
            `Consider if '${calculatedState}' is more appropriate based on position`
          );
        }
      }

      // Check cover state consistency
      if (endPosition.coverState && endPosition.coverState !== 'none') {
        const coverBonus = endPosition.stealthBonus || 0;
        
        // Warn if override doesn't consider significant cover bonuses
        if (coverBonus >= 2 && visibilityState === 'observed') {
          validationResult.severity = Math.max(validationResult.severity, 'warning');
          validationResult.issues.push(
            `Override to 'observed' ignores significant cover bonus (+${coverBonus})`
          );
          validationResult.recommendations.push(
            'Consider if cover should affect visibility state'
          );
        }
      }

      // Check for system errors that might affect validation
      if (endPosition.systemErrors?.length > 0) {
        validationResult.severity = 'warning';
        validationResult.issues.push('Position calculation had errors - validation may be incomplete');
        validationResult.recommendations.push('Verify override manually due to calculation errors');
      }

      return validationResult;
    } catch (error) {
      console.warn('PF2E Visioner | Override validation failed:', error);
      return {
        isValid: false,
        severity: 'error',
        issues: [`Validation failed: ${error.message}`],
        recommendations: ['Manual verification required']
      };
    }
  }

  /**
   * Checks for conflicts between position data and override
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} visibilityState - Override visibility state
   * @param {Object} positionTransition - Position transition data
   * @returns {Promise<ConflictResolution>} Conflict resolution data
   * @private
   */
  async _checkOverrideConflicts(observer, target, visibilityState, positionTransition) {
    const conflictResult = {
      hasConflict: false,
      conflictType: 'none', // 'none', 'minor', 'moderate', 'critical'
      recommendedAction: 'proceed',
      conflictDetails: {}
    };

    try {
      const startPos = positionTransition.startPosition;
      const endPos = positionTransition.endPosition;

      // Check for conflicts with position transition
      if (positionTransition.transitionType === 'improved' && 
          this._isVisibilityWorse(endPos.avsVisibility, visibilityState)) {
        conflictResult.hasConflict = true;
        conflictResult.conflictType = 'moderate';
        conflictResult.recommendedAction = 'review_position_improvement';
        conflictResult.conflictDetails.positionImproved = true;
        conflictResult.conflictDetails.overrideMakesWorse = true;
      }

      // Check for conflicts with cover state
      if (endPos.coverState !== 'none' && endPos.stealthBonus > 0) {
        const coverShouldImproveVisibility = endPos.stealthBonus >= 2;
        const overrideIgnoresCover = visibilityState === 'observed';
        
        if (coverShouldImproveVisibility && overrideIgnoresCover) {
          conflictResult.hasConflict = true;
          conflictResult.conflictType = 'moderate';
          conflictResult.recommendedAction = 'consider_cover_bonus';
          conflictResult.conflictDetails.coverIgnored = true;
          conflictResult.conflictDetails.coverBonus = endPos.stealthBonus;
        }
      }

      // Check for system availability conflicts
      if (!endPos.avsEnabled && !endPos.autoCoverEnabled) {
        conflictResult.hasConflict = true;
        conflictResult.conflictType = 'critical';
        conflictResult.recommendedAction = 'manual_verification_required';
        conflictResult.conflictDetails.systemsUnavailable = true;
      }

      return conflictResult;
    } catch (error) {
      console.warn('PF2E Visioner | Conflict checking failed:', error);
      return {
        hasConflict: true,
        conflictType: 'critical',
        recommendedAction: 'manual_verification_required',
        conflictDetails: { error: error.message }
      };
    }
  }

  /**
   * Gets position-aware override for a token pair
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {PositionAwareOverride|null} Position-aware override data or null
   */
  getPositionAwareOverride(observer, target) {
    if (!observer?.document || !target?.document) return null;

    try {
      const overrideKey = `${observer.document.id}->${target.document.id}`;
      
      // Check memory cache first
      if (this._positionOverrides.has(overrideKey)) {
        return this._positionOverrides.get(overrideKey);
      }

      // Check document flags
      const currentOverrides = observer.document.getFlag(MODULE_ID, 'position-aware-overrides') || {};
      const override = currentOverrides[overrideKey];
      
      if (override) {
        // Cache in memory for future access
        this._positionOverrides.set(overrideKey, override);
        return override;
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get position-aware override:', error);
      return null;
    }
  }

  /**
   * Removes position-aware override for a token pair
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {Promise<boolean>} Success status
   */
  async removePositionAwareOverride(observer, target) {
    if (!observer?.document || !target?.document) return false;

    try {
      const overrideKey = `${observer.document.id}->${target.document.id}`;
      
      // Remove from document flags
      const currentOverrides = observer.document.getFlag(MODULE_ID, 'position-aware-overrides') || {};
      if (currentOverrides[overrideKey]) {
        delete currentOverrides[overrideKey];
        await observer.document.setFlag(MODULE_ID, 'position-aware-overrides', currentOverrides);
      }

      // Remove from memory cache
      this._positionOverrides.delete(overrideKey);
      
      // Also remove standard AVS override
      await avsOverrideService.removeAVSOverride(observer, target);

      console.log(`${MODULE_ID} | Position-aware AVS override removed: ${observer.name} → ${target.name}`);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Error removing position-aware AVS override:`, error);
      return false;
    }
  }

  /**
   * Gets all position-aware overrides for a token
   * @param {Token} token - The token to get overrides for
   * @returns {Object} Object containing all position-aware overrides
   */
  getAllPositionAwareOverrides(token) {
    if (!token?.document) return {};
    
    try {
      return token.document.getFlag(MODULE_ID, 'position-aware-overrides') || {};
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get all position-aware overrides:', error);
      return {};
    }
  }

  /**
   * Clears all position-aware overrides for a token
   * @param {Token} token - The token to clear overrides for
   * @returns {Promise<boolean>} Success status
   */
  async clearAllPositionAwareOverrides(token) {
    if (!token?.document) return false;

    try {
      await token.document.unsetFlag(MODULE_ID, 'position-aware-overrides');
      
      // Clear memory cache for this token
      const tokenId = token.document.id;
      for (const [key, _] of this._positionOverrides) {
        if (key.startsWith(`${tokenId}->`) || key.endsWith(`->${tokenId}`)) {
          this._positionOverrides.delete(key);
        }
      }

      console.log(`${MODULE_ID} | All position-aware AVS overrides cleared for token: ${token.name}`);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Error clearing position-aware AVS overrides:`, error);
      return false;
    }
  }

  /**
   * Gets conflict resolution data for a token pair
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {ConflictResolution|null} Conflict resolution data
   */
  getConflictResolution(observer, target) {
    if (!observer?.document || !target?.document) return null;
    
    const conflictKey = `${observer.document.id}->${target.document.id}`;
    return this._conflictResolutions.get(conflictKey) || null;
  }

  /**
   * Resolves override conflict with user choice
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} resolution - Resolution choice ('accept', 'reject', 'modify')
   * @param {string} newState - New state if modifying
   * @returns {Promise<boolean>} Success status
   */
  async resolveOverrideConflict(observer, target, resolution, newState = null) {
    const conflictKey = `${observer.document.id}->${target.document.id}`;
    const conflictData = this._conflictResolutions.get(conflictKey);
    
    if (!conflictData) {
      console.warn('PF2E Visioner | No conflict found to resolve');
      return false;
    }

    try {
      switch (resolution) {
        case 'accept':
          // Keep the override as-is, just clear the conflict
          this._conflictResolutions.delete(conflictKey);
          return true;
          
        case 'reject':
          // Remove the override entirely
          await this.removePositionAwareOverride(observer, target);
          this._conflictResolutions.delete(conflictKey);
          return true;
          
        case 'modify': {
          if (!newState) {
            console.warn('PF2E Visioner | New state required for modify resolution');
            return false;
          }
          // Apply new override state
          const success = await this.setPositionAwareOverride(
            observer, 
            target, 
            newState, 
            null, 
            'conflict-resolution'
          );
          if (success) {
            this._conflictResolutions.delete(conflictKey);
          }
          return success;
        }
          
        default:
          console.warn('PF2E Visioner | Invalid conflict resolution:', resolution);
          return false;
      }
    } catch (error) {
      console.error('PF2E Visioner | Error resolving override conflict:', error);
      return false;
    }
  }

  /**
   * Assesses the severity of an override conflict
   * @param {string} calculatedState - State calculated by systems
   * @param {string} overrideState - State from override
   * @returns {string} Conflict severity ('none', 'minor', 'moderate', 'critical')
   * @private
   */
  _assessOverrideConflictSeverity(calculatedState, overrideState) {
    // Define visibility hierarchy for conflict assessment
    const visibilityHierarchy = {
      'undetected': 4,
      'hidden': 3,
      'concealed': 2,
      'observed': 1
    };

    const calculatedLevel = visibilityHierarchy[calculatedState] || 1;
    const overrideLevel = visibilityHierarchy[overrideState] || 1;
    const difference = Math.abs(calculatedLevel - overrideLevel);

    if (difference === 0) return 'none';
    if (difference === 1) return 'minor';
    if (difference === 2) return 'moderate';
    return 'critical'; // difference >= 3
  }

  /**
   * Determines if one visibility state is worse than another for stealth
   * @param {string} currentState - Current visibility state
   * @param {string} newState - New visibility state
   * @returns {boolean} Whether new state is worse for stealth
   * @private
   */
  _isVisibilityWorse(currentState, newState) {
    const stealthOrder = ['observed', 'concealed', 'hidden', 'undetected'];
    const currentIndex = stealthOrder.indexOf(currentState);
    const newIndex = stealthOrder.indexOf(newState);
    
    return newIndex < currentIndex;
  }

  /**
   * Analyzes position impact on override decision
   * @param {Object} positionTransition - Position transition data
   * @param {string} visibilityState - Override visibility state
   * @returns {Object} Position impact analysis
   * @private
   */
  _analyzePositionImpactOnOverride(positionTransition, visibilityState) {
    return {
      transitionType: positionTransition.transitionType,
      stealthBonusChange: positionTransition.stealthBonusChange,
      coverImproved: positionTransition.coverTransition.changed && positionTransition.stealthBonusChange > 0,
      visibilityImproved: positionTransition.avsTransition.changed,
      overrideJustified: this._isOverrideJustifiedByPosition(positionTransition, visibilityState),
      recommendedState: this._getRecommendedStateFromPosition(positionTransition)
    };
  }

  /**
   * Determines if override is justified by position data
   * @param {Object} positionTransition - Position transition data
   * @param {string} visibilityState - Override visibility state
   * @returns {boolean} Whether override is justified
   * @private
   */
  _isOverrideJustifiedByPosition(positionTransition, visibilityState) {
    // Override is justified if it aligns with position improvements
    if (positionTransition.transitionType === 'improved') {
      return !this._isVisibilityWorse(positionTransition.endPosition.avsVisibility, visibilityState);
    }
    
    // Override is justified if it accounts for position worsening
    if (positionTransition.transitionType === 'worsened') {
      return this._isVisibilityWorse(positionTransition.startPosition.avsVisibility, visibilityState);
    }
    
    // For unchanged positions, any reasonable override is acceptable
    return true;
  }

  /**
   * Gets recommended visibility state based on position data
   * @param {Object} positionTransition - Position transition data
   * @returns {string} Recommended visibility state
   * @private
   */
  _getRecommendedStateFromPosition(positionTransition) {
    const endPos = positionTransition.endPosition;
    
    // Start with AVS calculation if available
    let recommended = endPos.avsVisibility || 'observed';
    
    // Adjust based on cover bonuses
    if (endPos.stealthBonus >= 4) {
      recommended = 'hidden';
    } else if (endPos.stealthBonus >= 2) {
      recommended = 'concealed';
    }
    
    return recommended;
  }

  /**
   * Determines outcome state from position transition for enhanced sneak results
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token (sneaking token)
   * @param {Object} positionTransition - Position transition data
   * @param {Object} context - Additional context (rollOutcome, rollTotal, etc.)
   * @returns {Promise<string>} Determined visibility state
   */
  async determineOutcomeFromPosition(observer, target, positionTransition, context = {}) {
    try {
      console.debug('PF2E Visioner | AVS determining outcome from position transition:', {
        observer: observer.name,
        target: target.name,
        reason: context.reason,
        rollOutcome: context.rollOutcome
      });

      if (!positionTransition?.startPosition || !positionTransition?.endPosition) {
        console.warn('PF2E Visioner | Incomplete position data, using current visibility');
        const { getVisibilityBetween } = await import('../utils.js');
        return getVisibilityBetween(observer, target) || 'observed';
      }

      const startPos = positionTransition.startPosition;
      const endPos = positionTransition.endPosition;
      
      // Use end position visibility as the base decision
      let decision = endPos.avsVisibility || 'observed';
      
      // Enhance decision based on context
      if (context.reason === 'start_unqualified_end_qualified') {
        // Started in poor position but ended in good position
        // Favor the improved end position but consider it might not be as good as a pure sneak
        if (endPos.avsVisibility === 'hidden' && context.rollOutcome === 'success') {
          decision = 'concealed'; // Slightly less effective due to poor start
        } else if (endPos.avsVisibility === 'undetected' && context.rollOutcome === 'success') {
          decision = 'hidden'; // Reduce effectiveness due to transition
        }
      } else if (context.reason === 'start_qualified_end_unqualified') {
        // Started in good position but ended in poor position
        // The poor end position should dominate but consider the good start
        if (startPos.avsVisibility === 'hidden' && endPos.avsVisibility === 'observed') {
          decision = 'concealed'; // Compromise between good start and poor end
        } else {
          decision = endPos.avsVisibility; // Poor end position dominates
        }
      }
      
      // Apply cover bonuses to the decision
      const stealthBonus = endPos.stealthBonus || 0;
      if (stealthBonus >= 4 && decision === 'observed') {
        decision = 'concealed'; // Significant cover should improve visibility
      } else if (stealthBonus >= 2 && decision === 'observed') {
        decision = 'concealed'; // Some cover provides concealment
      }
      
      console.debug('PF2E Visioner | AVS decision from position:', {
        startVisibility: startPos.avsVisibility,
        endVisibility: endPos.avsVisibility,
        stealthBonus,
        finalDecision: decision,
        reason: context.reason
      });
      
      return decision;
    } catch (error) {
      console.error('PF2E Visioner | Error determining outcome from position:', error);
      // Fallback to current visibility
      try {
        const { getVisibilityBetween } = await import('../utils.js');
        return getVisibilityBetween(observer, target) || 'observed';
      } catch {
        return 'observed';
      }
    }
  }

  /**
   * Generates justification text for an override
   * @param {string} visibilityState - Override visibility state
   * @param {Object} positionContext - Position context data
   * @returns {string} Justification text
   * @private
   */
  _generateOverrideJustification(visibilityState, positionContext) {
    if (!positionContext) {
      return `Manual override to ${visibilityState}`;
    }

    const endPos = positionContext.endPosition;
    let justification = `Override to ${visibilityState}`;

    if (endPos?.coverState && endPos.coverState !== 'none') {
      justification += ` (considering ${endPos.coverState} cover`;
      if (endPos.stealthBonus > 0) {
        justification += ` +${endPos.stealthBonus} stealth`;
      }
      justification += ')';
    }

    if (positionContext.transitionType !== 'unchanged') {
      justification += ` after position ${positionContext.transitionType}`;
    }

    return justification;
  }
}

// Export singleton instance
export default new EnhancedAVSOverrideService();