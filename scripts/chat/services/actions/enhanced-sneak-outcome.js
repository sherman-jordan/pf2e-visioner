/**
 * Enhanced Sneak Outcome Determination System
 * 
 * This module provides sophisticated outcome determination for sneak actions
 * based on start/end position qualifications, AVS system decisions, and 
 * roll results vs perception DC.
 */

import enhancedAVSOverrideService from '../../../services/enhanced-avs-override-service.js';
import { getDefaultNewStateFor } from '../data/action-state-config.js';

/**
 * Enhanced outcome determination for sneak actions
 */
export class EnhancedSneakOutcome {
  
  /**
   * Determines if a position qualifies for sneak based on visibility state
   * @param {string} visibilityState - The visibility state ('observed', 'concealed', 'hidden', 'undetected')
   * @returns {boolean} Whether this position qualifies for sneak
   */
  static doesPositionQualifyForSneak(visibilityState) {
    // Only hidden and undetected states qualify for sneak per PF2E RAW
    return visibilityState === 'hidden' || visibilityState === 'undetected';
  }

  /**
   * Determines the final outcome state based on position qualifications and roll results
   * @param {Object} params - Parameters for outcome determination
   * @param {string} params.startVisibilityState - Starting visibility state
   * @param {string} params.endVisibilityState - Ending visibility state
   * @param {string} params.currentVisibilityState - Current visibility state from AVS
   * @param {string} params.rollOutcome - Roll outcome ('critical-success', 'success', 'failure', 'critical-failure')
   * @param {number} params.rollTotal - Total roll result
   * @param {number} params.perceptionDC - Observer's perception DC
   * @param {number} params.dieResult - Die roll result (for critical determination)
   * @param {Object} params.observerToken - Observer token
   * @param {Object} params.sneakingToken - Sneaking token
   * @param {Object} params.positionTransition - Position transition data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enhanced outcome determination result
   */
  static async determineEnhancedOutcome(params, options = {}) {
    const {
      startVisibilityState,
      endVisibilityState,
      currentVisibilityState,
      rollOutcome,
      rollTotal,
      perceptionDC,
      dieResult,
      observerToken,
      sneakingToken,
      positionTransition
    } = params;

    console.debug('PF2E Visioner | Enhanced outcome determination:', {
      startVisibility: startVisibilityState,
      endVisibility: endVisibilityState,
      currentVisibility: currentVisibilityState,
      rollOutcome,
      rollTotal,
      perceptionDC
    });

    // Check position qualifications
    const startQualifies = this.doesPositionQualifyForSneak(startVisibilityState);
    const endQualifies = this.doesPositionQualifyForSneak(endVisibilityState);

    console.debug('PF2E Visioner | Position qualifications:', {
      startQualifies,
      endQualifies,
      startState: startVisibilityState,
      endState: endVisibilityState
    });

    let finalOutcome = {
      newVisibility: currentVisibilityState,
      outcomeReason: 'standard',
      avsDecisionUsed: false,
      positionImpact: null,
      enhancedLogic: true
    };

    // Case 1: Start OR end position doesn't qualify for sneak
    // -> Set newVisibility to 'observed' (sneak fails)
    if (!startQualifies || !endQualifies) {
      console.debug('PF2E Visioner | Case 1: Start or end position doesn\'t qualify - sneak fails, setting to observed');
      
      finalOutcome.newVisibility = 'observed';
      finalOutcome.outcomeReason = !startQualifies && !endQualifies 
        ? 'neither_position_qualified' 
        : !startQualifies 
          ? 'start_position_unqualified' 
          : 'end_position_unqualified';
      finalOutcome.enhancedLogic = true;
      finalOutcome.positionImpact = 'sneak_failed_due_to_position';

    // Case 2: Both start and end positions qualify for sneak
    // -> Use regular calculation from action-state-config.js
    } else {
      console.debug('PF2E Visioner | Case 2: Both positions qualify - using standard outcome calculation');
      
      // Use the standard outcome determination from action-state-config.js
      const standardOutcome = getDefaultNewStateFor('sneak', currentVisibilityState, rollOutcome);
      finalOutcome.newVisibility = standardOutcome || currentVisibilityState;
      finalOutcome.outcomeReason = 'both_positions_qualified_standard_calculation';
      finalOutcome.enhancedLogic = true;
      finalOutcome.positionImpact = 'sneak_successful';
    }

    // Add additional outcome metadata
    finalOutcome.positionQualifications = {
      startQualifies,
      endQualifies,
      startState: startVisibilityState,
      endState: endVisibilityState
    };

    finalOutcome.rollData = {
      outcome: rollOutcome,
      total: rollTotal,
      dc: perceptionDC,
      margin: rollTotal - perceptionDC,
      dieResult
    };

    // Apply position-aware state transition if needed
    if (finalOutcome.enhancedLogic && (finalOutcome.avsDecisionUsed || finalOutcome.positionImpact)) {
      try {
        const { default: positionAwareStateTransitions } = await import('../position/PositionAwareStateTransitions.js');
        
        const transitionResult = await positionAwareStateTransitions.initiateTransition({
          observerToken,
          targetToken: sneakingToken,
          newState: finalOutcome.newVisibility,
          positionTransition,
          rollData: finalOutcome.rollData,
          transitionReason: finalOutcome.outcomeReason
        });
        
        if (transitionResult.success) {
          finalOutcome.stateTransitionApplied = true;
          finalOutcome.transitionId = transitionResult.transitionId;
        } else if (transitionResult.pendingConfirmation) {
          finalOutcome.pendingConfirmation = true;
          finalOutcome.confirmationData = transitionResult.confirmationData;
        } else {
          finalOutcome.stateTransitionFailed = true;
          finalOutcome.stateTransitionError = transitionResult.error;
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to apply position-aware state transition:', error);
        finalOutcome.stateTransitionFailed = true;
        finalOutcome.stateTransitionError = error.message;
      }
    }

    console.debug('PF2E Visioner | Final enhanced outcome:', finalOutcome);
    return finalOutcome;
  }

  /**
   * Handles outcome determination when AVS system should decide
   * @param {Object} observerToken - Observer token
   * @param {Object} sneakingToken - Sneaking token
   * @param {string} currentVisibilityState - Current visibility state
   * @param {Object} context - Additional context for the decision
   * @returns {Promise<Object>} AVS-determined outcome
   * @private
   */
  static async _handleAVSDecision(observerToken, sneakingToken, currentVisibilityState, context) {
    try {
      console.debug('PF2E Visioner | Delegating to AVS system for outcome decision:', context.reason);

      // Try to get AVS-determined state
      let avsDecision = currentVisibilityState;
      
      // If we have enhanced AVS override service, use it for more sophisticated decisions
      if (enhancedAVSOverrideService && typeof enhancedAVSOverrideService.determineOutcomeFromPosition === 'function') {
        try {
          avsDecision = await enhancedAVSOverrideService.determineOutcomeFromPosition(
            observerToken,
            sneakingToken,
            context.positionTransition,
            {
              rollOutcome: context.rollOutcome,
              rollTotal: context.rollTotal,
              perceptionDC: context.perceptionDC,
              reason: context.reason
            }
          );
        } catch (avsError) {
          console.warn('PF2E Visioner | Enhanced AVS decision failed, using current state:', avsError);
        }
      }

      return {
        newVisibility: avsDecision,
        outcomeReason: context.reason,
        avsDecisionUsed: true,
        positionImpact: context.positionTransition ? 'position_transition_triggered' : null,
        enhancedLogic: true
      };

    } catch (error) {
      console.warn('PF2E Visioner | AVS decision failed, falling back to current state:', error);
      
      return {
        newVisibility: currentVisibilityState,
        outcomeReason: `${context.reason}_avs_fallback`,
        avsDecisionUsed: false,
        positionImpact: null,
        enhancedLogic: true,
        error: error.message
      };
    }
  }

  /**
   * Handles outcome when both positions qualify for sneak - uses enhanced roll logic
   * @param {string} startVisibilityState - Start visibility state
   * @param {string} endVisibilityState - End visibility state  
   * @param {string} currentVisibilityState - Current visibility state
   * @param {string} rollOutcome - Roll outcome
   * @param {number} rollTotal - Roll total
   * @param {number} perceptionDC - Perception DC
   * @param {number} dieResult - Die result
   * @param {Object} positionTransition - Position transition data
   * @param {Object} observerToken - Observer token
   * @param {Object} sneakingToken - Sneaking token
   * @returns {Promise<Object>} Enhanced qualified outcome
   * @private
   */
  static async _handleQualifiedPositionOutcome(
    startVisibilityState, 
    endVisibilityState, 
    currentVisibilityState,
    rollOutcome,
    rollTotal,
    perceptionDC, 
    dieResult,
    positionTransition,
    observerToken,
    sneakingToken
  ) {
    // Use the action-state-config logic but with enhanced considerations
    let baseOutcome = getDefaultNewStateFor('sneak', currentVisibilityState, rollOutcome);
    
    // Special case: if old state was hidden and outcome was success or above, 
    // should become undetected (per your requirements)
    if (currentVisibilityState === 'hidden' && 
        (rollOutcome === 'success' || rollOutcome === 'critical-success')) {
      baseOutcome = 'undetected';
    }

    // Consider position improvements in outcome determination
    let finalState = baseOutcome;
    let positionImpact = null;

    if (positionTransition) {
      const positionImprovement = this._assessPositionImprovement(
        startVisibilityState,
        endVisibilityState, 
        positionTransition
      );

      if (positionImprovement.significant) {
        positionImpact = positionImprovement;
        
        // Position improvement might enhance the outcome
        if (positionImprovement.type === 'major_improvement' && rollOutcome === 'success') {
          // Consider upgrading success to critical success level outcome
          const criticalOutcome = getDefaultNewStateFor('sneak', currentVisibilityState, 'critical-success');
          if (criticalOutcome && criticalOutcome !== baseOutcome) {
            finalState = criticalOutcome;
            positionImpact.outcomeEnhanced = true;
          }
        }
      }
    }

    return {
      newVisibility: finalState || currentVisibilityState,
      outcomeReason: 'both_positions_qualified',
      avsDecisionUsed: false,
      positionImpact,
      enhancedLogic: true,
      baseOutcome,
      rollEnhanced: positionImpact?.outcomeEnhanced || false
    };
  }

  /**
   * Assesses position improvement between start and end states
   * @param {string} startVisibilityState - Start visibility state
   * @param {string} endVisibilityState - End visibility state
   * @param {Object} positionTransition - Position transition data
   * @returns {Object} Position improvement assessment
   * @private
   */
  static _assessPositionImprovement(startVisibilityState, endVisibilityState, positionTransition) {
    const improvement = {
      significant: false,
      type: 'none',
      description: '',
      stealthBonusChange: 0,
      coverImprovement: false,
      visibilityImprovement: false
    };

    if (!positionTransition) {
      return improvement;
    }

    // Check visibility state improvement
    const visibilityRanking = {
      observed: 1,
      concealed: 2, 
      hidden: 3,
      undetected: 4
    };

    const startRank = visibilityRanking[startVisibilityState] || 1;
    const endRank = visibilityRanking[endVisibilityState] || 1;

    if (endRank > startRank) {
      improvement.visibilityImprovement = true;
      improvement.significant = true;
    }

    // Check stealth bonus improvement
    if (positionTransition.stealthBonusChange > 0) {
      improvement.stealthBonusChange = positionTransition.stealthBonusChange;
      improvement.significant = true;
      
      if (positionTransition.stealthBonusChange >= 2) {
        improvement.coverImprovement = true;
      }
    }

    // Determine improvement type
    if (improvement.visibilityImprovement && improvement.coverImprovement) {
      improvement.type = 'major_improvement';
      improvement.description = 'Major position improvement: better visibility state and cover';
    } else if (improvement.visibilityImprovement) {
      improvement.type = 'visibility_improvement';
      improvement.description = 'Position improved visibility state';
    } else if (improvement.coverImprovement) {
      improvement.type = 'cover_improvement';
      improvement.description = 'Position improved cover bonuses';
    } else if (improvement.stealthBonusChange > 0) {
      improvement.type = 'minor_improvement';
      improvement.description = 'Minor position improvement';
    }

    return improvement;
  }

  /**
   * Gets enhanced outcome explanation for display purposes
   * @param {Object} enhancedOutcome - Enhanced outcome result
   * @returns {Object} Formatted explanation
   */
  static getOutcomeExplanation(enhancedOutcome) {
    const explanation = {
      title: '',
      description: '',
      details: [],
      recommendation: ''
    };

    switch (enhancedOutcome.outcomeReason) {
      case 'start_unqualified_end_qualified':
        explanation.title = 'Position Improved During Movement';
        explanation.description = 'Started in poor position but moved to qualifying stealth position.';
        explanation.details.push('AVS system determined final visibility state');
        explanation.recommendation = 'Consider maintaining this improved position';
        break;

      case 'start_qualified_end_unqualified':
        explanation.title = 'Position Worsened During Movement';
        explanation.description = 'Started in good position but moved to non-qualifying position.';
        explanation.details.push('AVS system determined final visibility state');
        explanation.recommendation = 'Consider returning to better cover';
        break;

      case 'both_positions_qualified':
        explanation.title = 'Roll Determined Outcome';
        explanation.description = 'Both start and end positions qualified for stealth.';
        explanation.details.push(`Roll outcome: ${enhancedOutcome.rollData?.outcome}`);
        if (enhancedOutcome.positionImpact?.significant) {
          explanation.details.push(`Position impact: ${enhancedOutcome.positionImpact.description}`);
        }
        if (enhancedOutcome.rollEnhanced) {
          explanation.details.push('Position improvement enhanced the outcome');
        }
        explanation.recommendation = 'Good positioning helped achieve this result';
        break;

      case 'neither_position_qualified':
        explanation.title = 'Neither Position Qualified';
        explanation.description = 'Standard sneak rules applied as fallback.';
        explanation.recommendation = 'Seek better cover or use Hide action first';
        break;

      default:
        explanation.title = 'Enhanced Outcome';
        explanation.description = 'Advanced positioning logic was applied.';
    }

    if (enhancedOutcome.avsDecisionUsed) {
      explanation.details.push('AVS system made the final decision');
    }

    return explanation;
  }
}

export default EnhancedSneakOutcome;
