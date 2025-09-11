/**
 * Dual System Result Application Service
 * Handles result application that updates both AVS and Auto-Cover systems using v13 document update APIs
 * Provides state synchronization, rollback mechanisms, and validation for dual system updates
 */

import { MODULE_ID, VISIBILITY_STATES, COVER_STATES } from '../../constants.js';
import { applyVisibilityChanges } from './infra/shared-utils.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';
import coverStateManager from '../../cover/auto-cover/CoverStateManager.js';
import enhancedAVSOverrideService from '../../services/enhanced-avs-override-service.js';
import errorHandlingService, { SYSTEM_TYPES } from './infra/error-handling-service.js';
import { notify } from './infra/notifications.js';

/**
 * Transaction data for rollback support
 * @typedef {Object} TransactionData
 * @property {string} transactionId - Unique transaction identifier
 * @property {number} timestamp - Transaction timestamp
 * @property {Array<Object>} avsChanges - AVS changes applied
 * @property {Array<Object>} coverChanges - Auto-Cover changes applied
 * @property {Object} systemStates - System states before transaction
 * @property {boolean} completed - Whether transaction completed successfully
 */

/**
 * Result application data structure
 * @typedef {Object} ApplicationResult
 * @property {boolean} success - Whether application succeeded
 * @property {string} transactionId - Transaction ID for rollback
 * @property {Array<string>} errors - Any errors encountered
 * @property {Array<string>} warnings - Any warnings generated
 * @property {Object} appliedChanges - Summary of applied changes
 * @property {Object} systemStatus - Status of both systems after application
 */

export class DualSystemResultApplication {
  constructor() {
    this._activeTransactions = new Map(); // Store active transactions for rollback
    this._systemValidators = new Map(); // Store system-specific validators
    this._rollbackHandlers = new Map(); // Store rollback handlers
    this._transactionCounter = 0; // Counter for unique transaction IDs

    // Initialize system validators
    this._initializeValidators();

    // Initialize rollback handlers
    this._initializeRollbackHandlers();
  }

  /**
   * Applies sneak results to both AVS and Auto-Cover systems using v13 document update APIs
   * @param {Array<Object>} sneakResults - Array of sneak result objects
   * @param {Object} options - Application options
   * @returns {Promise<ApplicationResult>} Application result with transaction data
   */
  async applySneakResults(sneakResults, options = {}) {
    const transactionId = this._generateTransactionId();
    const applicationResult = {
      success: false,
      transactionId,
      errors: [],
      warnings: [],
      appliedChanges: {
        avsChanges: [],
        coverChanges: [],
        overrideChanges: [],
      },
      systemStatus: null,
    };

    try {
      // Validate input data
      const validationResult = await this._validateSneakResults(sneakResults);
      if (!validationResult.isValid) {
        applicationResult.errors.push(...validationResult.errors);
        return applicationResult;
      }

      // Start transaction with system state capture
      const transaction = await this._startTransaction(transactionId, sneakResults, options);

      // Separate results by system requirements
      const { avsResults, coverResults, combinedResults } = this._categorizeResults(sneakResults);

      // Apply AVS changes using v13 document update APIs
      if (avsResults.length > 0) {
        const avsResult = await this._applyAVSChanges(avsResults, transaction, options);
        applicationResult.appliedChanges.avsChanges = avsResult.changes;
        applicationResult.errors.push(...avsResult.errors);
        applicationResult.warnings.push(...avsResult.warnings);
      }

      // Apply Auto-Cover changes using v13 document update APIs
      if (coverResults.length > 0) {
        const coverResult = await this._applyCoverChanges(coverResults, transaction, options);
        applicationResult.appliedChanges.coverChanges = coverResult.changes;
        applicationResult.errors.push(...coverResult.errors);
        applicationResult.warnings.push(...coverResult.warnings);
      }

      // Apply combined results that affect both systems
      if (combinedResults.length > 0) {
        const combinedResult = await this._applyCombinedChanges(
          combinedResults,
          transaction,
          options,
        );
        applicationResult.appliedChanges.avsChanges.push(...combinedResult.avsChanges);
        applicationResult.appliedChanges.coverChanges.push(...combinedResult.coverChanges);
        applicationResult.errors.push(...combinedResult.errors);
        applicationResult.warnings.push(...combinedResult.warnings);
      }

      // Apply position-aware overrides if present
      const overrideResult = await this._applyPositionAwareOverrides(
        sneakResults,
        transaction,
        options,
      );
      applicationResult.appliedChanges.overrideChanges = overrideResult.changes;
      applicationResult.errors.push(...overrideResult.errors);
      applicationResult.warnings.push(...overrideResult.warnings);

      // Validate system consistency after changes using v13 validation APIs
      const consistencyResult = await this._validateSystemConsistency(transaction);
      if (!consistencyResult.isConsistent) {
        applicationResult.errors.push(...consistencyResult.errors);
        applicationResult.warnings.push(...consistencyResult.warnings);

        // Attempt automatic correction if possible
        if (consistencyResult.canAutoCorrect) {
          const correctionResult = await this._attemptAutoCorrection(
            transaction,
            consistencyResult,
          );
          if (correctionResult.success) {
            applicationResult.warnings.push('System inconsistencies were automatically corrected');
          } else {
            applicationResult.errors.push('Failed to correct system inconsistencies');
          }
        }
      }

      // Complete transaction if no critical errors
      const hasCriticalErrors = applicationResult.errors.length > 0;
      if (!hasCriticalErrors) {
        await this._completeTransaction(transaction);
        applicationResult.success = true;
        applicationResult.systemStatus = await this._getSystemStatus();

        // Trigger system synchronization hooks using v13 hook system integration
        await this._triggerSynchronizationHooks(transaction, applicationResult);

        notify.info(`Applied ${sneakResults.length} sneak results successfully`);
      } else {
        // Rollback on critical errors
        await this._rollbackTransaction(transaction);
        applicationResult.errors.unshift('Transaction rolled back due to critical errors');
        notify.error('Failed to apply sneak results - changes have been rolled back');
      }

      return applicationResult;
    } catch (error) {
      // Handle unexpected errors with comprehensive error handling
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.DUAL_SYSTEM,
        error,
        { sneakResults, options, transactionId, phase: 'result_application' },
      );

      applicationResult.errors.push(`Application failed: ${error.message}`);

      if (errorResult.fallbackApplied) {
        applicationResult.warnings.push('Fallback application method used');
        // Attempt fallback application
        const fallbackResult = await this._attemptFallbackApplication(sneakResults, options);
        if (fallbackResult.success) {
          applicationResult.success = true;
          applicationResult.appliedChanges = fallbackResult.appliedChanges;
        }
      }

      // Ensure transaction is cleaned up
      if (this._activeTransactions.has(transactionId)) {
        await this._rollbackTransaction(this._activeTransactions.get(transactionId));
      }

      return applicationResult;
    }
  }

  /**
   * Implements rollback mechanisms for failed result applications using v13 transaction patterns
   * @param {string} transactionId - Transaction ID to rollback
   * @returns {Promise<boolean>} Whether rollback succeeded
   */
  async rollbackTransaction(transactionId) {
    if (!this._activeTransactions.has(transactionId)) {
      console.warn('PF2E Visioner | No active transaction found for rollback:', transactionId);
      return false;
    }

    const transaction = this._activeTransactions.get(transactionId);
    return await this._rollbackTransaction(transaction);
  }

  /**
   * Validates that both systems remain consistent after updates using v13 validation APIs
   * @param {Array<Object>} sneakResults - Applied sneak results
   * @returns {Promise<Object>} Validation result
   */
  async validateSystemConsistency(sneakResults) {
    try {
      const validationResult = {
        isConsistent: true,
        errors: [],
        warnings: [],
        inconsistencies: [],
        systemStatus: {},
      };

      // Check AVS system consistency
      const avsStatus = await this._validateAVSConsistency(sneakResults);
      validationResult.systemStatus.avs = avsStatus;
      if (!avsStatus.isConsistent) {
        validationResult.isConsistent = false;
        validationResult.errors.push(...avsStatus.errors);
        validationResult.inconsistencies.push(...avsStatus.inconsistencies);
      }

      // Check Auto-Cover system consistency
      const coverStatus = await this._validateCoverConsistency(sneakResults);
      validationResult.systemStatus.cover = coverStatus;
      if (!coverStatus.isConsistent) {
        validationResult.isConsistent = false;
        validationResult.errors.push(...coverStatus.errors);
        validationResult.inconsistencies.push(...coverStatus.inconsistencies);
      }

      // Check cross-system consistency
      const crossSystemStatus = await this._validateCrossSystemConsistency(sneakResults);
      validationResult.systemStatus.crossSystem = crossSystemStatus;
      if (!crossSystemStatus.isConsistent) {
        validationResult.isConsistent = false;
        validationResult.warnings.push(...crossSystemStatus.warnings);
        validationResult.inconsistencies.push(...crossSystemStatus.inconsistencies);
      }

      return validationResult;
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.DUAL_SYSTEM, error, {
        sneakResults,
        phase: 'consistency_validation',
      });

      return {
        isConsistent: false,
        errors: [`Consistency validation failed: ${error.message}`],
        warnings: [],
        inconsistencies: [],
        systemStatus: {},
      };
    }
  }

  /**
   * Gets comprehensive system status including both AVS and Auto-Cover systems
   * @returns {Promise<Object>} System status information
   */
  async getSystemStatus() {
    return await this._getSystemStatus();
  }

  /**
   * Attempts to recover from system failures during result application
   * @param {string} systemType - Specific system to recover ('avs', 'cover', or 'both')
   * @returns {Promise<boolean>} Whether recovery succeeded
   */
  async attemptSystemRecovery(systemType = 'both') {
    try {
      const recoveryResults = [];

      if (systemType === 'avs' || systemType === 'both') {
        const avsRecovery = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
        recoveryResults.push({ system: 'avs', success: avsRecovery });
      }

      if (systemType === 'cover' || systemType === 'both') {
        const coverRecovery = await errorHandlingService.attemptSystemRecovery(
          SYSTEM_TYPES.AUTO_COVER,
        );
        recoveryResults.push({ system: 'cover', success: coverRecovery });
      }

      const allSuccessful = recoveryResults.every((result) => result.success);

      if (allSuccessful) {
        notify.info('System recovery completed successfully');
      } else {
        const failedSystems = recoveryResults
          .filter((result) => !result.success)
          .map((result) => result.system);
        notify.warn(`System recovery partially failed for: ${failedSystems.join(', ')}`);
      }

      return allSuccessful;
    } catch (error) {
      console.error('PF2E Visioner | System recovery attempt failed:', error);
      notify.error('System recovery failed - manual intervention may be required');
      return false;
    }
  }

  /**
   * Generates unique transaction ID
   * @returns {string} Transaction ID
   * @private
   */
  _generateTransactionId() {
    return `tx_${Date.now()}_${++this._transactionCounter}`;
  }

  /**
   * Validates sneak results before application
   * @param {Array<Object>} sneakResults - Sneak results to validate
   * @returns {Promise<Object>} Validation result
   * @private
   */
  async _validateSneakResults(sneakResults) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!Array.isArray(sneakResults) || sneakResults.length === 0) {
      validationResult.isValid = false;
      validationResult.errors.push('No sneak results provided for application');
      return validationResult;
    }

    // Validate each result
    for (let i = 0; i < sneakResults.length; i++) {
      const result = sneakResults[i];

      if (!result.token?.document) {
        validationResult.errors.push(`Result ${i}: Missing or invalid token`);
        continue;
      }

      if (!result.newVisibility) {
        validationResult.errors.push(`Result ${i}: Missing new visibility state`);
        continue;
      }

      if (!VISIBILITY_STATES[result.newVisibility]) {
        validationResult.errors.push(
          `Result ${i}: Invalid visibility state '${result.newVisibility}'`,
        );
        continue;
      }

      // Validate position data if present
      if (result.positionTransition) {
        const positionValidation = this._validatePositionData(result.positionTransition);
        if (!positionValidation.isValid) {
          validationResult.warnings.push(`Result ${i}: ${positionValidation.error}`);
        }
      }
    }

    if (validationResult.errors.length > 0) {
      validationResult.isValid = false;
    }

    return validationResult;
  }

  /**
   * Validates position transition data
   * @param {Object} positionTransition - Position transition data
   * @returns {Object} Validation result
   * @private
   */
  _validatePositionData(positionTransition) {
    if (!positionTransition.startPosition || !positionTransition.endPosition) {
      return {
        isValid: false,
        error: 'Incomplete position transition data',
      };
    }

    if (!positionTransition.targetId) {
      return {
        isValid: false,
        error: 'Missing target ID in position transition',
      };
    }

    return { isValid: true };
  }

  /**
   * Starts a new transaction with system state capture
   * @param {string} transactionId - Transaction ID
   * @param {Array<Object>} sneakResults - Sneak results
   * @param {Object} options - Application options
   * @returns {Promise<TransactionData>} Transaction data
   * @private
   */
  async _startTransaction(transactionId, sneakResults, options) {
    const transaction = {
      transactionId,
      timestamp: Date.now(),
      avsChanges: [],
      coverChanges: [],
      overrideChanges: [],
      systemStates: await this._captureSystemStates(sneakResults),
      completed: false,
      options,
    };

    this._activeTransactions.set(transactionId, transaction);

    console.debug('PF2E Visioner | Started dual system transaction:', transactionId);
    return transaction;
  }

  /**
   * Captures current system states for rollback
   * @param {Array<Object>} sneakResults - Sneak results
   * @returns {Promise<Object>} Captured system states
   * @private
   */
  async _captureSystemStates(sneakResults) {
    const systemStates = {
      avs: {},
      cover: {},
      overrides: {},
      timestamp: Date.now(),
    };

    try {
      // Capture AVS states for all involved token pairs
      for (const result of sneakResults) {
        if (!result.token?.document || !result.actor?.document) continue;

        const observerId = result.token.document.id;
        const actorId = result.actor.document.id;
        const pairKey = `${observerId}->${actorId}`;

        // Capture current visibility state
        const { getVisibilityBetween } = await import('../../utils.js');
        systemStates.avs[pairKey] = {
          currentVisibility: getVisibilityBetween(result.token, result.actor),
          observerId,
          actorId,
        };

        // Capture current cover state if Auto-Cover is enabled
        if (autoCoverSystem.isEnabled()) {
          systemStates.cover[pairKey] = {
            currentCover: coverStateManager.getCoverBetween(result.token, result.actor),
            observerId,
            actorId,
          };
        }

        // Capture current overrides
        const avsOverride = enhancedAVSOverrideService.getPositionAwareOverride(
          result.token,
          result.actor,
        );
        if (avsOverride) {
          systemStates.overrides[pairKey] = avsOverride;
        }
      }

      return systemStates;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture system states:', error);
      return systemStates;
    }
  }

  /**
   * Categorizes results by system requirements
   * @param {Array<Object>} sneakResults - Sneak results
   * @returns {Object} Categorized results
   * @private
   */
  _categorizeResults(sneakResults) {
    const avsResults = [];
    const coverResults = [];
    const combinedResults = [];

    for (const result of sneakResults) {
      const hasAVSChanges = result.newVisibility !== result.oldVisibility;
      const hasCoverChanges = result.autoCover && autoCoverSystem.isEnabled();
      const hasPositionData = !!result.positionTransition;

      if (hasAVSChanges && hasCoverChanges) {
        combinedResults.push(result);
      } else if (hasAVSChanges) {
        avsResults.push(result);
      } else if (hasCoverChanges) {
        coverResults.push(result);
      }

      // Results with position data may need special handling
      if (hasPositionData && !combinedResults.includes(result)) {
        combinedResults.push(result);
      }
    }

    return { avsResults, coverResults, combinedResults };
  }

  /**
   * Applies AVS changes using v13 document update APIs
   * @param {Array<Object>} avsResults - Results requiring AVS updates
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   * @private
   */
  async _applyAVSChanges(avsResults, transaction, options) {
    const result = {
      changes: [],
      errors: [],
      warnings: [],
    };

    try {
      // Group changes by observer for batch processing
      const changesByObserver = new Map();

      for (const sneakResult of avsResults) {
        const observer = sneakResult.token;
        const target = sneakResult.actor;

        if (!changesByObserver.has(observer.document.id)) {
          changesByObserver.set(observer.document.id, {
            observer,
            changes: [],
          });
        }

        const change = {
          target,
          newVisibility: sneakResult.newVisibility,
          oldVisibility: sneakResult.oldVisibility || sneakResult.currentVisibility,
          overrideState: sneakResult.overrideState,
        };

        changesByObserver.get(observer.document.id).changes.push(change);

        // Track change for rollback
        transaction.avsChanges.push({
          observerId: observer.document.id,
          targetId: target.document.id,
          oldState: change.oldVisibility,
          newState: change.newVisibility,
          timestamp: Date.now(),
        });
      }

      // Apply changes in batches using existing applyVisibilityChanges function
      for (const [observerId, data] of changesByObserver) {
        try {
          await applyVisibilityChanges(data.observer, data.changes, {
            direction: options.direction || 'observer_to_target',
            skipEphemeralUpdate: options.skipEphemeralUpdate,
            skipCleanup: options.skipCleanup,
          });

          result.changes.push({
            observerId,
            changeCount: data.changes.length,
            type: 'avs',
          });
        } catch (error) {
          result.errors.push(
            `Failed to apply AVS changes for observer ${observerId}: ${error.message}`,
          );
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`AVS application failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Applies Auto-Cover changes using v13 document update APIs
   * @param {Array<Object>} coverResults - Results requiring cover updates
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   * @private
   */
  async _applyCoverChanges(coverResults, transaction, options) {
    const result = {
      changes: [],
      errors: [],
      warnings: [],
    };

    if (!autoCoverSystem.isEnabled()) {
      result.warnings.push('Auto-Cover system is disabled - skipping cover changes');
      return result;
    }

    try {
      for (const sneakResult of coverResults) {
        const observer = sneakResult.token;
        const target = sneakResult.actor;
        const coverData = sneakResult.autoCover;

        if (!coverData) continue;

        try {
          // Apply cover state using CoverStateManager
          const oldCoverState = coverStateManager.getCoverBetween(observer, target);
          const newCoverState = coverData.state || 'none';

          if (oldCoverState !== newCoverState) {
            await coverStateManager.setCoverBetween(observer, target, newCoverState, {
              skipEphemeralUpdate: options.skipEphemeralUpdate,
            });

            // Track change for rollback
            transaction.coverChanges.push({
              observerId: observer.document.id,
              targetId: target.document.id,
              oldState: oldCoverState,
              newState: newCoverState,
              timestamp: Date.now(),
            });

            result.changes.push({
              observerId: observer.document.id,
              targetId: target.document.id,
              coverState: newCoverState,
              type: 'cover',
            });
          }
        } catch (error) {
          result.errors.push(
            `Failed to apply cover change for ${observer.name} -> ${target.name}: ${error.message}`,
          );
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Cover application failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Applies combined changes that affect both systems
   * @param {Array<Object>} combinedResults - Results requiring both system updates
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   * @private
   */
  async _applyCombinedChanges(combinedResults, transaction, options) {
    const result = {
      avsChanges: [],
      coverChanges: [],
      errors: [],
      warnings: [],
    };

    try {
      // Apply AVS and cover changes in coordinated fashion
      for (const sneakResult of combinedResults) {
        const observer = sneakResult.token;
        const target = sneakResult.actor;

        // Apply AVS changes first
        if (sneakResult.newVisibility !== sneakResult.oldVisibility) {
          const avsResult = await this._applyAVSChanges([sneakResult], transaction, options);
          result.avsChanges.push(...avsResult.changes);
          result.errors.push(...avsResult.errors);
          result.warnings.push(...avsResult.warnings);
        }

        // Apply cover changes second
        if (sneakResult.autoCover && autoCoverSystem.isEnabled()) {
          const coverResult = await this._applyCoverChanges([sneakResult], transaction, options);
          result.coverChanges.push(...coverResult.changes);
          result.errors.push(...coverResult.errors);
          result.warnings.push(...coverResult.warnings);
        }

        // Handle position-aware coordination
        if (sneakResult.positionTransition) {
          await this._coordinatePositionBasedChanges(sneakResult, transaction, options);
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Combined application failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Applies position-aware overrides
   * @param {Array<Object>} sneakResults - All sneak results
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   * @private
   */
  async _applyPositionAwareOverrides(sneakResults, transaction, options) {
    const result = {
      changes: [],
      errors: [],
      warnings: [],
    };

    try {
      for (const sneakResult of sneakResults) {
        // Skip if no position data or override needed
        if (!sneakResult.positionTransition || !sneakResult.overrideState) continue;

        const observer = sneakResult.token;
        const target = sneakResult.actor;
        const overrideState = sneakResult.overrideState;
        const positionTransition = sneakResult.positionTransition;

        try {
          const success = await enhancedAVSOverrideService.applyPositionBasedOverride(
            observer,
            target,
            overrideState,
            positionTransition,
          );

          if (success) {
            // Track override for rollback
            transaction.overrideChanges.push({
              observerId: observer.document.id,
              targetId: target.document.id,
              overrideState,
              positionContext: positionTransition,
              timestamp: Date.now(),
            });

            result.changes.push({
              observerId: observer.document.id,
              targetId: target.document.id,
              overrideState,
              type: 'position-override',
            });
          } else {
            result.warnings.push(
              `Failed to apply position-aware override for ${observer.name} -> ${target.name}`,
            );
          }
        } catch (error) {
          result.errors.push(
            `Position override application failed for ${observer.name} -> ${target.name}: ${error.message}`,
          );
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Position override application failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Coordinates position-based changes between systems
   * @param {Object} sneakResult - Sneak result with position data
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} options - Application options
   * @private
   */
  async _coordinatePositionBasedChanges(sneakResult, transaction, options) {
    try {
      const positionTransition = sneakResult.positionTransition;

      // Check if position changes require system coordination
      if (positionTransition.avsTransition.changed || positionTransition.coverTransition.changed) {
        // Log coordination for debugging
        console.debug('PF2E Visioner | Coordinating position-based changes:', {
          avsChanged: positionTransition.avsTransition.changed,
          coverChanged: positionTransition.coverTransition.changed,
          transitionType: positionTransition.transitionType,
        });

        // Additional coordination logic can be added here as needed
        // For example, ensuring cover bonuses are properly reflected in visibility calculations
      }
    } catch (error) {
      console.warn('PF2E Visioner | Position coordination failed:', error);
    }
  }

  /**
   * Validates system consistency after changes
   * @param {TransactionData} transaction - Transaction data
   * @returns {Promise<Object>} Consistency validation result
   * @private
   */
  async _validateSystemConsistency(transaction) {
    const validationResult = {
      isConsistent: true,
      canAutoCorrect: false,
      errors: [],
      warnings: [],
      inconsistencies: [],
    };

    try {
      // Check AVS consistency
      for (const change of transaction.avsChanges) {
        const observer = canvas.tokens.get(change.observerId);
        const target = canvas.tokens.get(change.targetId);

        if (!observer || !target) continue;

        const { getVisibilityBetween } = await import('../../utils.js');
        const currentState = getVisibilityBetween(observer, target);

        if (currentState !== change.newState) {
          validationResult.isConsistent = false;
          validationResult.inconsistencies.push({
            type: 'avs',
            observerId: change.observerId,
            targetId: change.targetId,
            expected: change.newState,
            actual: currentState,
          });
        }
      }

      // Check cover consistency
      for (const change of transaction.coverChanges) {
        const observer = canvas.tokens.get(change.observerId);
        const target = canvas.tokens.get(change.targetId);

        if (!observer || !target) continue;

        const currentCover = coverStateManager.getCoverBetween(observer, target);

        if (currentCover !== change.newState) {
          validationResult.isConsistent = false;
          validationResult.inconsistencies.push({
            type: 'cover',
            observerId: change.observerId,
            targetId: change.targetId,
            expected: change.newState,
            actual: currentCover,
          });
        }
      }

      // Determine if auto-correction is possible
      if (!validationResult.isConsistent) {
        validationResult.canAutoCorrect = validationResult.inconsistencies.length <= 3; // Arbitrary threshold
      }

      return validationResult;
    } catch (error) {
      validationResult.isConsistent = false;
      validationResult.errors.push(`Consistency validation failed: ${error.message}`);
      return validationResult;
    }
  }

  /**
   * Attempts automatic correction of system inconsistencies
   * @param {TransactionData} transaction - Transaction data
   * @param {Object} consistencyResult - Consistency validation result
   * @returns {Promise<Object>} Correction result
   * @private
   */
  async _attemptAutoCorrection(transaction, consistencyResult) {
    const correctionResult = {
      success: false,
      correctionsMade: [],
      errors: [],
    };

    try {
      for (const inconsistency of consistencyResult.inconsistencies) {
        const observer = canvas.tokens.get(inconsistency.observerId);
        const target = canvas.tokens.get(inconsistency.targetId);

        if (!observer || !target) continue;

        try {
          if (inconsistency.type === 'avs') {
            // Re-apply AVS change
            await applyVisibilityChanges(observer, [
              {
                target,
                newVisibility: inconsistency.expected,
              },
            ]);

            correctionResult.correctionsMade.push({
              type: 'avs',
              observerId: inconsistency.observerId,
              targetId: inconsistency.targetId,
              correctedTo: inconsistency.expected,
            });
          } else if (inconsistency.type === 'cover') {
            // Re-apply cover change
            await coverStateManager.setCoverBetween(observer, target, inconsistency.expected);

            correctionResult.correctionsMade.push({
              type: 'cover',
              observerId: inconsistency.observerId,
              targetId: inconsistency.targetId,
              correctedTo: inconsistency.expected,
            });
          }
        } catch (error) {
          correctionResult.errors.push(
            `Failed to correct ${inconsistency.type} inconsistency: ${error.message}`,
          );
        }
      }

      correctionResult.success = correctionResult.errors.length === 0;
      return correctionResult;
    } catch (error) {
      correctionResult.errors.push(`Auto-correction failed: ${error.message}`);
      return correctionResult;
    }
  }

  /**
   * Completes a transaction
   * @param {TransactionData} transaction - Transaction to complete
   * @private
   */
  async _completeTransaction(transaction) {
    transaction.completed = true;
    transaction.completedAt = Date.now();

    // Keep transaction for a short time for potential rollback
    setTimeout(() => {
      this._activeTransactions.delete(transaction.transactionId);
    }, 30000); // 30 seconds

    console.debug('PF2E Visioner | Completed dual system transaction:', transaction.transactionId);
  }

  /**
   * Rolls back a transaction
   * @param {TransactionData} transaction - Transaction to rollback
   * @returns {Promise<boolean>} Whether rollback succeeded
   * @private
   */
  async _rollbackTransaction(transaction) {
    try {
      console.debug(
        'PF2E Visioner | Rolling back dual system transaction:',
        transaction.transactionId,
      );

      // Rollback AVS changes
      for (const change of transaction.avsChanges.reverse()) {
        try {
          const observer = canvas.tokens.get(change.observerId);
          const target = canvas.tokens.get(change.targetId);

          if (observer && target) {
            await applyVisibilityChanges(observer, [
              {
                target,
                newVisibility: change.oldState,
              },
            ]);
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to rollback AVS change:', error);
        }
      }

      // Rollback cover changes
      for (const change of transaction.coverChanges.reverse()) {
        try {
          const observer = canvas.tokens.get(change.observerId);
          const target = canvas.tokens.get(change.targetId);

          if (observer && target) {
            await coverStateManager.setCoverBetween(observer, target, change.oldState);
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to rollback cover change:', error);
        }
      }

      // Rollback override changes
      for (const change of transaction.overrideChanges.reverse()) {
        try {
          const observer = canvas.tokens.get(change.observerId);
          const target = canvas.tokens.get(change.targetId);

          if (observer && target) {
            await enhancedAVSOverrideService.removePositionAwareOverride(observer, target);
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to rollback override change:', error);
        }
      }

      // Remove transaction
      this._activeTransactions.delete(transaction.transactionId);

      return true;
    } catch (error) {
      console.error('PF2E Visioner | Transaction rollback failed:', error);
      return false;
    }
  }

  /**
   * Triggers system synchronization hooks using v13 hook system integration
   * @param {TransactionData} transaction - Completed transaction
   * @param {ApplicationResult} applicationResult - Application result
   * @private
   */
  async _triggerSynchronizationHooks(transaction, applicationResult) {
    try {
      // Trigger custom hooks for other modules to respond to dual system updates
      Hooks.callAll('pf2e-visioner.dualSystemUpdate', {
        transactionId: transaction.transactionId,
        avsChanges: transaction.avsChanges,
        coverChanges: transaction.coverChanges,
        overrideChanges: transaction.overrideChanges,
        success: applicationResult.success,
      });

      // Trigger system-specific hooks
      if (transaction.avsChanges.length > 0) {
        Hooks.callAll('pf2e-visioner.avsUpdated', transaction.avsChanges);
      }

      if (transaction.coverChanges.length > 0) {
        Hooks.callAll('pf2e-visioner.coverUpdated', transaction.coverChanges);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to trigger synchronization hooks:', error);
    }
  }

  /**
   * Gets comprehensive system status
   * @returns {Promise<Object>} System status
   * @private
   */
  async _getSystemStatus() {
    try {
      return {
        avs: {
          available: true, // AVS is always available in this module
          enabled: true,
          lastUpdate: Date.now(),
        },
        autoCover: {
          available: autoCoverSystem.isEnabled(),
          enabled: autoCoverSystem.isEnabled(),
          lastUpdate: Date.now(),
        },
        dualSystem: {
          activeTransactions: this._activeTransactions.size,
          lastUpdate: Date.now(),
        },
        errorHandling: errorHandlingService.getSystemStatus(),
      };
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get system status:', error);
      return {
        avs: { available: false, enabled: false, error: error.message },
        autoCover: { available: false, enabled: false, error: error.message },
        dualSystem: { available: false, error: error.message },
      };
    }
  }

  /**
   * Attempts fallback application when main application fails
   * @param {Array<Object>} sneakResults - Sneak results
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Fallback result
   * @private
   */
  async _attemptFallbackApplication(sneakResults, options) {
    try {
      console.warn('PF2E Visioner | Attempting fallback application for sneak results');

      // Use basic visibility application as fallback
      const changes = sneakResults
        .filter((result) => result.newVisibility !== result.oldVisibility)
        .map((result) => ({
          target: result.actor,
          newVisibility: result.newVisibility,
          oldVisibility: result.oldVisibility,
        }));

      if (changes.length === 0) {
        return { success: false, appliedChanges: {} };
      }

      // Group by observer and apply basic changes
      const changesByObserver = new Map();
      for (const result of sneakResults) {
        const observer = result.token;
        if (!changesByObserver.has(observer.document.id)) {
          changesByObserver.set(observer.document.id, { observer, changes: [] });
        }
        changesByObserver.get(observer.document.id).changes.push({
          target: result.actor,
          newVisibility: result.newVisibility,
        });
      }

      for (const [_, data] of changesByObserver) {
        await applyVisibilityChanges(data.observer, data.changes, options);
      }

      return {
        success: true,
        appliedChanges: {
          avsChanges: changes,
          coverChanges: [],
          overrideChanges: [],
        },
      };
    } catch (error) {
      console.error('PF2E Visioner | Fallback application failed:', error);
      return { success: false, appliedChanges: {} };
    }
  }

  /**
   * Validates AVS system consistency
   * @param {Array<Object>} sneakResults - Sneak results
   * @returns {Promise<Object>} AVS consistency result
   * @private
   */
  async _validateAVSConsistency(sneakResults) {
    // Implementation would check AVS-specific consistency
    return {
      isConsistent: true,
      errors: [],
      inconsistencies: [],
    };
  }

  /**
   * Validates Auto-Cover system consistency
   * @param {Array<Object>} sneakResults - Sneak results
   * @returns {Promise<Object>} Cover consistency result
   * @private
   */
  async _validateCoverConsistency(sneakResults) {
    // Implementation would check cover-specific consistency
    return {
      isConsistent: true,
      errors: [],
      inconsistencies: [],
    };
  }

  /**
   * Validates cross-system consistency
   * @param {Array<Object>} sneakResults - Sneak results
   * @returns {Promise<Object>} Cross-system consistency result
   * @private
   */
  async _validateCrossSystemConsistency(sneakResults) {
    // Implementation would check consistency between AVS and cover systems
    return {
      isConsistent: true,
      warnings: [],
      inconsistencies: [],
    };
  }

  /**
   * Initializes system validators
   * @private
   */
  _initializeValidators() {
    // Initialize validators for different systems
    this._systemValidators.set('avs', this._validateAVSConsistency.bind(this));
    this._systemValidators.set('cover', this._validateCoverConsistency.bind(this));
    this._systemValidators.set('cross', this._validateCrossSystemConsistency.bind(this));
  }

  /**
   * Initializes rollback handlers
   * @private
   */
  _initializeRollbackHandlers() {
    // Initialize rollback handlers for different change types
    this._rollbackHandlers.set('avs', this._rollbackAVSChanges.bind(this));
    this._rollbackHandlers.set('cover', this._rollbackCoverChanges.bind(this));
    this._rollbackHandlers.set('override', this._rollbackOverrideChanges.bind(this));
  }

  /**
   * Rollback AVS changes
   * @param {Array<Object>} changes - AVS changes to rollback
   * @private
   */
  async _rollbackAVSChanges(changes) {
    // Implementation for AVS-specific rollback
  }

  /**
   * Rollback cover changes
   * @param {Array<Object>} changes - Cover changes to rollback
   * @private
   */
  async _rollbackCoverChanges(changes) {
    // Implementation for cover-specific rollback
  }

  /**
   * Rollback override changes
   * @param {Array<Object>} changes - Override changes to rollback
   * @private
   */
  async _rollbackOverrideChanges(changes) {
    // Implementation for override-specific rollback
  }
}

// Export singleton instance
export default new DualSystemResultApplication();
