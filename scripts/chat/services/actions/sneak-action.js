import { COVER_STATES, VISIBILITY_STATES } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import enhancedAVSOverrideService from '../../../services/enhanced-avs-override-service.js';
import { getCoverBetween, notify } from '../../../utils.js';
import { appliedSneakChangesByMessage } from '../data/message-cache.js';
import errorHandlingService, { SYSTEM_TYPES } from '../infra/error-handling-service.js';
import { calculateStealthRollTotals, shouldFilterAlly } from '../infra/shared-utils.js';
import enhancedMultiTargetProcessor from '../multi-target/EnhancedMultiTargetProcessor.js';
import sneakPositionTracker from '../position/SneakPositionTracker.js';
import { ActionHandlerBase } from './base-action.js';
export class SneakActionHandler extends ActionHandlerBase {
  constructor() {
    super('sneak');
    // Use the singleton instance to share state with StealthCheckUseCase
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = stealthCheckUseCase; // Use singleton
    this.positionTracker = sneakPositionTracker;

    // Position tracking state
    this._startPositions = new Map();
    this._endPositions = new Map();
    this._positionTransitions = new Map();
    this._isTrackingPositions = false;
    this._currentActionData = null;
    this._storedStartPosition = null; // Store coordinates from StealthCheckUseCase
    this._positionClearTimeout = null; // Timeout for delayed position state clearing

    // Set up token update hooks for movement detection
    this._setupMovementHooks();
  }
  getCacheMap() {
    return appliedSneakChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? outcome?.target?.id ?? null;
  }
  async ensurePrerequisites(actionData) {
    try {
      const { ensureActionRoll } = await import('../infra/roll-utils.js');
      ensureActionRoll(actionData);

      // Capture start positions when prerequisites are validated
      await this._captureStartPositions(actionData);

      // Basic validation without recursion - just check if we have observers
      const observers = await this.discoverSubjects(actionData);
      if (observers.length === 0) {
        const { notify } = await import('../infra/notifications.js');
        notify.warn('No potential observers detected - sneak may not be necessary');
      }
    } catch (error) {
      // Handle prerequisite failures with comprehensive error handling
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.SNEAK_ACTION,
        error,
        { actionData, phase: 'prerequisites' },
      );

      if (errorResult.fallbackApplied) {
        console.warn(
          'PF2E Visioner | Using fallback for sneak prerequisites:',
          errorResult.fallbackData,
        );
        // Continue with basic prerequisite validation if fallback is available
        const { ensureActionRoll } = await import('../infra/roll-utils.js');
        ensureActionRoll(actionData);
      } else {
        // Re-throw if no fallback is possible
        throw error;
      }
    }
  }

  /**
   * Handles validation results and displays warnings/errors to users
   * @param {Object} validationResult - Result from prerequisite validation
   * @param {Object} actionData - Action data
   * @private
   */
  async _handleValidationResults(validationResult, actionData) {
    const { notify } = await import('../infra/notifications.js');

    // Handle critical errors that prevent the action
    if (!validationResult.canProceed) {
      const errorMessage = validationResult.errors.join('; ');
      notify.error(`Sneak action cannot proceed: ${errorMessage}`);

      // Show recommendations if available
      if (validationResult.recommendations.length > 0) {
        const recommendations = validationResult.recommendations.slice(0, 3).join('; ');
        notify.info(`Recommendations: ${recommendations}`);
      }

      throw new Error(`Prerequisites not met: ${errorMessage}`);
    }

    // Show warning dialog for non-critical issues
    if (!validationResult.valid || validationResult.warnings.length > 0) {
      const shouldProceed = await this._showValidationWarningDialog(validationResult, actionData);
      if (!shouldProceed) {
        throw new Error('User cancelled sneak action due to validation warnings');
      }
    }

    // Show helpful recommendations via notifications for perfect validation
    if (validationResult.valid && validationResult.recommendations.length > 0) {
      const topRecommendations = validationResult.recommendations.slice(0, 2).join('; ');
      notify.info(`Tactical advice: ${topRecommendations}`);
    }

    // Log detailed validation results for debugging
    if (validationResult.positionAnalysis) {
      console.debug('PF2E Visioner | Sneak validation results:', {
        valid: validationResult.valid,
        canProceed: validationResult.canProceed,
        observerCount: validationResult.observerCount,
        positionQuality: validationResult.positionAnalysis.overallQuality,
        systemStatus: validationResult.systemStatus,
      });
    }
  }

  /**
   * Shows validation warning dialog to user
   * @param {Object} validationResult - Validation results
   * @param {Object} actionData - Action data
   * @returns {Promise<boolean>} True if user chooses to proceed
   * @private
   */
  async _showValidationWarningDialog(validationResult, actionData) {
    try {
      const { PrerequisiteWarningDialog } = await import(
        '../dialogs/prerequisite-warning-dialog.js'
      );
      return await PrerequisiteWarningDialog.show(validationResult, actionData);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to show validation warning dialog:', error);

      // Fallback to notifications if dialog fails
      const { notify } = await import('../infra/notifications.js');

      if (validationResult.warnings.length > 0) {
        const warningMessage = validationResult.warnings.slice(0, 2).join('; ');
        notify.warn(`Sneak attempt warnings: ${warningMessage}`);
      }

      // Ask user via simple confirm dialog
      const message = `Sneak action has warnings. Proceed anyway?\n\nWarnings:\n${validationResult.warnings.slice(0, 3).join('\n')}`;
      return confirm(message);
    }
  }

  /**
   * Captures position state at the start of the sneak action
   * Hybrid approach: Capture start positions at dialog render, calculate end positions in real-time
   * @param {Object} actionData - Action data including actor and context
   * @param {Object} storedStartPosition - Optional stored coordinates from StealthCheckUseCase
   * @private
   */
  async _captureStartPositions(actionData, storedStartPosition = null) {
    try {
      console.debug('PF2E Visioner | _captureStartPositions called for action:', {
        actor: actionData.actor?.name,
        messageId: actionData.messageId,
        instanceId: this._instanceId || 'unknown',
        alreadyCaptured: this._startPositions.size > 0,
        hasStoredPosition: !!storedStartPosition,
        storedCoordinates: storedStartPosition ? `(${storedStartPosition.x}, ${storedStartPosition.y})` : 'none',
      });

      // Skip if we already have captured start positions (from dialog render)
      if (this._startPositions.size > 0) {
        console.debug('PF2E Visioner | Start positions already captured, updating message ID and skipping');
        this._currentActionData = actionData; // Update with real action data
        return;
      }

      // Store the provided stored position for later use
      if (storedStartPosition) {
        this._storedStartPosition = storedStartPosition;
        console.debug('PF2E Visioner | Stored start position preserved for later use:', storedStartPosition);
      }
      
      // Try to get stored position from message flags if not provided directly
      if (!storedStartPosition && !this._storedStartPosition) {
        // Get the message by ID if not directly provided
        const message = actionData?.message || game.messages.get(actionData?.messageId);
        
        console.debug('PF2E Visioner | No stored position available, checking message flags:', {
          hasActionData: !!actionData,
          hasMessage: !!message,
          hasFlags: !!message?.flags,
          hasVisionerFlags: !!message?.flags?.['pf2e-visioner'],
          hasRollTimePosition: !!message?.flags?.['pf2e-visioner']?.rollTimePosition,
          hasSneakStartPosition: !!message?.flags?.['pf2e-visioner']?.sneakStartPosition,
          messageId: actionData?.messageId,
          flagsContent: message?.flags?.['pf2e-visioner']
        });
        
        // Check for sneakStartPosition first (from "Start Sneak" button), then rollTimePosition
        if (message?.flags?.['pf2e-visioner']?.sneakStartPosition) {
          this._storedStartPosition = message.flags['pf2e-visioner'].sneakStartPosition;
          console.debug('PF2E Visioner | Retrieved stored position from sneakStartPosition flag:', this._storedStartPosition);
        } else if (message?.flags?.['pf2e-visioner']?.rollTimePosition) {
          this._storedStartPosition = message.flags['pf2e-visioner'].rollTimePosition;
          console.debug('PF2E Visioner | Retrieved stored position from rollTimePosition flag:', this._storedStartPosition);
        } else {
          console.debug('PF2E Visioner | No stored position found in message flags');
        }
      }

      this._isTrackingPositions = true;
      this._currentActionData = actionData; // Store for movement detection

      // Hybrid approach: Capture actual start positions now, calculate end positions later
      console.debug('PF2E Visioner | Using hybrid position tracking approach (start at dialog/roll, end in real-time)');
      
      // Get the sneaking token
      const sneakingToken = this._getSneakingToken(actionData);
      if (!sneakingToken) {
        const error = new Error('Could not find sneaking token for position tracking');
        await errorHandlingService.handleSystemError(SYSTEM_TYPES.POSITION_TRACKER, error, {
          actionData,
          phase: 'start_position_capture',
        });
        return;
      }

      // Get potential observer tokens
      const observers = await this.discoverSubjects(actionData);

      // Capture actual start positions at current moment (or use stored coordinates)
      const useStoredPosition = storedStartPosition || this._storedStartPosition;
      console.debug('PF2E Visioner | Using stored position for capture:', {
        hasProvidedStored: !!storedStartPosition,
        hasInstanceStored: !!this._storedStartPosition, 
        finalStoredPosition: useStoredPosition ? `(${useStoredPosition.x}, ${useStoredPosition.y})` : 'none'
      });
      
      const capturedPositions = await this.positionTracker.captureStartPositions(
        sneakingToken,
        observers,
        useStoredPosition,
      );

      console.debug('PF2E Visioner | Raw captured start positions:', capturedPositions);
      this._startPositions = capturedPositions;

      console.debug(
        'PF2E Visioner | Captured start positions for',
        this._startPositions.size,
        'observers. End positions will be calculated in real-time.',
      );
    } catch (error) {
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.POSITION_TRACKER,
        error,
        { actionData, phase: 'start_position_capture' },
      );

      if (!errorResult.fallbackApplied) {
        console.warn(
          'PF2E Visioner | Failed to setup position tracking:',
          error,
        );
        this._isTrackingPositions = false;
      } else {
        console.warn('PF2E Visioner | Using fallback for position tracking setup');
        this._startPositions = new Map();
      }
    }
  }

  /**
   * Recalculates position state after movement completion
   * @param {Object} actionData - Action data including updated token positions
   * @private
   */
  async _recalculateEndPositions(actionData) {
    if (!this._isTrackingPositions) return;

    try {
      // Get the sneaking token with updated position
      const sneakingToken = this._getSneakingToken(actionData);
      if (!sneakingToken) {
        // Don't spam error handling if we consistently can't find the token
        console.debug('PF2E Visioner | Could not find sneaking token for end position calculation');
        // Don't disable tracking completely - just skip end position calculation
        // The start positions are still valid and should be used
        return;
      }

      // Get observer tokens (may have changed due to movement)
      const observers = await this.discoverSubjects(actionData);

      // Calculate end positions using both systems with error handling
      this._endPositions = await this.positionTracker.calculateEndPositions(
        sneakingToken,
        observers,
      );

      // Analyze position transitions with error handling
      this._positionTransitions = this.positionTracker.analyzePositionTransitions(
        this._startPositions,
        this._endPositions,
      );

      console.debug(
        'PF2E Visioner | Calculated end positions and transitions for',
        this._endPositions.size,
        'observers',
      );
    } catch (error) {
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.POSITION_TRACKER,
        error,
        { actionData, phase: 'end_position_calculation' },
      );

      if (!errorResult.fallbackApplied) {
        console.warn(
          'PF2E Visioner | Failed to calculate end positions and no fallback available:',
          error,
        );
        // Clear position tracking to prevent inconsistent state
        this._endPositions = new Map();
        this._positionTransitions = new Map();
      } else {
        console.warn('PF2E Visioner | Using fallback for end position calculation');
        // Use fallback data if available
        this._endPositions = errorResult.fallbackData?.endPositions || new Map();
        this._positionTransitions = errorResult.fallbackData?.transitions || new Map();
      }
    }
  }

  /**
   * Gets the sneaking token using v13-compatible token and document APIs
   * @param {Object} actionData - Action data
   * @returns {Token|null} The sneaking token
   * @private
   */
  _getSneakingToken(actionData) {
    console.debug('PF2E Visioner | _getSneakingToken called for:', actionData.actor?.name);
    console.debug('PF2E Visioner | Actor data:', {
      id: actionData.actor?.id,
      name: actionData.actor?.name,
      hasToken: !!actionData.actor?.token,
      hasGetActiveTokens: !!actionData.actor?.getActiveTokens,
    });

    // Try multiple ways to get the token, compatible with v13 APIs
    let token = null;

    // Direct token references
    token = actionData.actorToken || actionData.sneakingToken;
    if (token) {
      console.debug('PF2E Visioner | Found token via direct reference:', token.name);
      return token;
    }

    // From actor's token object
    if (actionData.actor?.token?.object) {
      console.debug(
        'PF2E Visioner | Found token via actor.token.object:',
        actionData.actor.token.object.name,
      );
      return actionData.actor.token.object;
    }

    // From actor's active tokens
    if (actionData.actor?.getActiveTokens) {
      const activeTokens = actionData.actor.getActiveTokens();
      if (activeTokens.length > 0) {
        console.debug('PF2E Visioner | Found token via getActiveTokens:', activeTokens[0].name);
        return activeTokens[0];
      }
    }

    // Search canvas tokens by actor ID
    if (actionData.actor?.id && canvas?.tokens?.placeables) {
      console.debug('PF2E Visioner | Searching canvas tokens for actor ID:', actionData.actor.id);
      const availableTokens = canvas.tokens.placeables.map((t) => ({
        id: t.id,
        name: t.name,
        actorId: t.actor?.id,
      }));
      console.debug('PF2E Visioner | Available tokens:', availableTokens);

      // Check if any token has the name we expect
      console.debug('PF2E Visioner | Looking for token with name:', actionData.actor?.name);
      console.debug(
        'PF2E Visioner | Available token names:',
        canvas.tokens.placeables.map((t) => t.name),
      );

      const tokenByName = canvas.tokens.placeables.find((t) => t.name === actionData.actor?.name);
      if (tokenByName) {
        console.debug('PF2E Visioner | Found token by name instead:', {
          name: tokenByName.name,
          actorId: tokenByName.actor?.id,
          expectedActorId: actionData.actor.id,
        });
        return tokenByName;
      } else {
        console.debug('PF2E Visioner | No token found with exact name match');
      }

      token = canvas.tokens.placeables.find((t) => t.actor?.id === actionData.actor.id);
      if (token) {
        console.debug('PF2E Visioner | Found token via canvas search:', token.name);
        return token;
      } else {
        console.debug('PF2E Visioner | No token found with actor ID:', actionData.actor.id);
      }
    }

    // Fallback: try to get from message context
    if (actionData.message?.speaker?.token) {
      const tokenId = actionData.message.speaker.token;
      token = canvas?.tokens?.placeables?.find((t) => t.id === tokenId);
      if (token) {
        console.debug('PF2E Visioner | Found token via message speaker:', token.name);
        return token;
      }
    }

    console.warn('PF2E Visioner | Could not find sneaking token for action data:', {
      hasActorToken: !!actionData.actorToken,
      hasSneakingToken: !!actionData.sneakingToken,
      hasActor: !!actionData.actor,
      actorId: actionData.actor?.id,
      hasCanvas: !!canvas?.tokens?.placeables,
      tokenCount: canvas?.tokens?.placeables?.length || 0,
    });

    return null;
  }

  async handleRenderCheckModifiersDialog(dialog, html) {
    // Delegate to stealth check use case for cover modifier injection
    try {
      await this.stealthCheckUseCase.handleCheckDialog(dialog, html);
    } catch (e) {
      console.warn('PF2E Visioner | Error in sneak dialog handling:', e);
    }

    // CRITICAL: Capture start positions when the stealth dialog opens 
    // This is before the user can move, ensuring we capture the true starting position
    try {
      console.debug('PF2E Visioner | Capturing start positions during dialog render (early capture)');
      
      // Extract actor information from the dialog context
      const actor = dialog?.actor || dialog?.item?.actor || dialog?.options?.actor;
      if (!actor) {
        console.warn('PF2E Visioner | No actor found in stealth dialog context');
        return;
      }

      // Create minimal action data for position capture
      const actionData = {
        actor: actor,
        messageId: `dialog-${Date.now()}`, // Temporary ID until real message is created
        timestamp: Date.now(),
      };

      // Capture start positions immediately when dialog opens
      await this._captureStartPositions(actionData);
      
      console.debug('PF2E Visioner | Early start position capture completed for stealth dialog');
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture early start positions:', error);
    }
  }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;

    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Use global ignoreAllies setting when not explicitly provided in actionData
      .filter(
        (t) =>
          !shouldFilterAlly(
            actionData.actor,
            t,
            'enemies',
            actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies'),
          ),
      )
      // Exclude loot and hazards from observers list
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');

    if (!enforceRAW) return base;

    const { getVisibilityBetween } = await import('../../../utils.js');
    const final = base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actionData.actor);
        return vis === 'hidden' || vis === 'undetected';
      } catch (_) {
        return false;
      }
    });

    return final;
  }
  async analyzeOutcome(actionData, subject) {
    console.log('PF2E Visioner | ⭐ analyzeOutcome START called for:', {
      actor: actionData.actor?.name,
      subject: subject?.name,
      messageId: actionData.messageId,
      instanceId: this._instanceId || 'unknown',
      isTracking: this._isTrackingPositions,
      startPositionsSize: this._startPositions.size,
    });

    try {
      // Don't automatically calculate end positions during outcome analysis
      // End positions should only be calculated when the dialog is opened
      // after the user has moved the token
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.SNEAK_ACTION, error, {
        actionData,
        subject,
        phase: 'outcome_analysis_setup',
      });
    }

    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);

    // Calculate roll information (stealth vs observer's perception DC)
    let adjustedDC = extractPerceptionDC(subject);

    // Initialize result object for auto-cover data
    const result = {};

    try {
      const sneakingToken =
        actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

      let coverState = null;
      let isOverride = false;
      let coverSource = 'none';

      // Compute base cover (manual first, then auto-cover fallback)
      try {
        // First check for manual cover
        const manualDetected = getCoverBetween(subject, sneakingToken);
        if (manualDetected && manualDetected !== 'none') {
          coverState = manualDetected;
          coverSource = 'manual';
        } else if (this.autoCoverSystem.isEnabled()) {
          // Fallback to auto-cover detection if no manual cover
          // For cover detection: observer is "attacking" (perceiving) the sneaking token
          // So observer is attacker, sneaking token is target
          const autoDetected = this.stealthCheckUseCase._detectCover(subject, sneakingToken);
          if (autoDetected && autoDetected !== 'none') {
            coverState = autoDetected;
            coverSource = 'automatic';
          }
        }
      } catch (e) {
        console.warn(`PF2E Visioner | Cover calculation failed for Sneak action:`, e);
      }

      // Apply overrides last (take precedence over base)
      // Prefer roll-specific override if a rollId exists in the action or message context.
      // Don't delete on consume yet - we need it for all observers
      let originalDetectedState = coverState || 'none'; // Store what we actually detected for this observer
      try {
        const rollId =
          actionData?.context?._visionerRollId ||
          actionData?.context?.rollId ||
          actionData?.message?.flags?.['pf2e-visioner']?.rollId ||
          null;

        // First check if there's a stored modifier for this roll (from StealthCheckUseCase)
        let storedModifier = null;
        if (rollId) {
          storedModifier = this.stealthCheckUseCase?.getOriginalCoverModifier?.(rollId);
        }

        if (storedModifier && storedModifier.isOverride) {
          // Use the stored modifier data to determine override
          originalDetectedState = coverState || 'none';
          coverState = storedModifier.finalState;

          // Only mark as override if the final state is different from what we detected
          if (originalDetectedState !== coverState) {
            isOverride = true;
            coverSource = storedModifier.source || 'dialog';
          }
        } else {
          // Fallback to the old method (but don't consume yet)
          // NOTE: Override parameter order is DIFFERENT from cover detection!
          // Stealth check stores overrides as (sneaking token -> observer)
          // Cover detection uses (observer -> sneaking token)
          const overrideData = this.autoCoverSystem.consumeCoverOverride(
            sneakingToken,
            subject,
            rollId,
            false,
          );
          if (overrideData) {
            // Store the original detected state before applying override
            originalDetectedState = coverState || 'none';
            // Apply the override
            coverState = overrideData.state;

            // Only mark as override if there's actually a difference from what we detected
            if (originalDetectedState !== coverState) {
              isOverride = true;
              coverSource = overrideData.source;
            }
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error checking for cover override in Sneak:', e);
      }

      // Create autoCover object if we have a cover state OR if there's an override
      if (coverState || isOverride) {
        const coverConfig = COVER_STATES[coverState || 'none'];
        const actualStealthBonus = coverConfig?.bonusStealth || 0;
        result.autoCover = {
          state: coverState || 'none',
          label: game.i18n.localize(coverConfig?.label || 'None'),
          icon: coverConfig?.icon || 'fas fa-shield',
          color: coverConfig?.color || '#999',
          cssClass: coverConfig?.cssClass || '',
          bonus: actualStealthBonus,
          isOverride: isOverride && originalDetectedState !== coverState,
          source: coverSource,
          // Add override details for template display (only if actually overridden)
          ...(isOverride && {
            overrideDetails: {
              originalState: originalDetectedState,
              originalLabel: game.i18n.localize(
                COVER_STATES[originalDetectedState]?.label || 'None',
              ),
              originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
              originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
              finalState: coverState || 'none',
              finalLabel: game.i18n.localize(coverConfig?.label || 'None'),
              finalIcon: coverConfig?.icon || 'fas fa-shield',
              finalColor: coverConfig?.color || '#999',
              source: coverSource,
            },
          }),
        };
      }
    } catch (e) {
      console.error(`PF2E Visioner | Error in cover calculation for Sneak action:`, e);
    }

    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);
    const diceTotal = Number(
      actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    
    console.log('PF2E Visioner | Sneak roll data:', {
      baseTotal,
      diceTotal,
      rollData: actionData?.roll,
      observerName: subject?.name,
      hasCover: !!result?.autoCover,
      coverState: result?.autoCover?.state
    });

    // Use shared utility to calculate stealth roll totals with cover adjustments
    const { total, originalTotal, baseRollTotal } = calculateStealthRollTotals(
      baseTotal,
      result?.autoCover,
      actionData,
    );

    const dc = adjustedDC;
    const die = Number(
      actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const margin = total - dc;
    const originalMargin = originalTotal ? originalTotal - dc : margin;
    const baseMargin = baseRollTotal ? baseRollTotal - dc : margin;
    const outcome = determineOutcome(total, die, dc);
    const originalOutcome = originalTotal ? determineOutcome(originalTotal, die, dc) : outcome;

    // Generate outcome labels
    const getOutcomeLabel = (outcomeValue) => {
      switch (outcomeValue) {
        case 'critical-success':
          return 'Critical Success';
        case 'success':
          return 'Success';
        case 'failure':
          return 'Failure';
        case 'critical-failure':
          return 'Critical Failure';
        default:
          return outcomeValue?.charAt(0).toUpperCase() + outcomeValue?.slice(1) || '';
      }
    };
    const originalOutcomeLabel = originalTotal ? getOutcomeLabel(originalOutcome) : null;

    // Use enhanced outcome determination if position data is available
    let newVisibility = current;
    let originalNewVisibility = current;
    let enhancedOutcome = null;

    try {
      // Get position transition for enhanced outcome determination
      const positionTransition = await this._getPositionTransitionForSubject(subject);
      
      if (positionTransition?.startPosition && positionTransition?.endPosition) {
        console.debug('PF2E Visioner | Using enhanced outcome determination with position data');
        
        const { default: EnhancedSneakOutcome } = await import('./enhanced-sneak-outcome.js');
        
        enhancedOutcome = await EnhancedSneakOutcome.determineEnhancedOutcome({
          startVisibilityState: positionTransition.startPosition.avsVisibility,
          endVisibilityState: positionTransition.endPosition.avsVisibility,
          currentVisibilityState: current,
          rollOutcome: outcome,
          rollTotal: total,
          perceptionDC: dc,
          dieResult: die,
          observerToken: subject,
          sneakingToken: actionData.actor,
          positionTransition
        });
        
        newVisibility = enhancedOutcome.newVisibility;
        
        // For debugging comparison
        try {
          const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
          const standardOutcome = getDefaultNewStateFor('sneak', current, outcome);
          console.debug('PF2E Visioner | Enhanced outcome determined:', {
            standard: standardOutcome,
            enhanced: newVisibility,
            reason: enhancedOutcome.outcomeReason
          });
        } catch (debugError) {
          console.debug('PF2E Visioner | Enhanced outcome determined:', {
            enhanced: newVisibility,
            reason: enhancedOutcome.outcomeReason
          });
        }
      } else {
        console.debug('PF2E Visioner | No position data available, using standard outcome determination');
        // Fall back to standard outcome determination
        const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
        newVisibility = getDefaultNewStateFor('sneak', current, outcome) || current;
      }
    } catch (error) {
      console.warn('PF2E Visioner | Enhanced outcome determination failed, using standard logic:', error);
      // Fall back to standard outcome determination
      const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
      newVisibility = getDefaultNewStateFor('sneak', current, outcome) || current;
    }

    // Calculate what the visibility change would have been with original outcome
    if (originalTotal) {
      try {
        if (enhancedOutcome) {
          // Use enhanced logic for original outcome too if available
          const { default: EnhancedSneakOutcome } = await import('./enhanced-sneak-outcome.js');
          const positionTransition = await this._getPositionTransitionForSubject(subject);
          
          if (positionTransition?.startPosition && positionTransition?.endPosition) {
            const originalEnhanced = await EnhancedSneakOutcome.determineEnhancedOutcome({
              startVisibilityState: positionTransition.startPosition.avsVisibility,
              endVisibilityState: positionTransition.endPosition.avsVisibility,
              currentVisibilityState: current,
              rollOutcome: originalOutcome,
              rollTotal: originalTotal,
              perceptionDC: dc,
              dieResult: die,
              observerToken: subject,
              sneakingToken: actionData.actor,
              positionTransition
            });
            originalNewVisibility = originalEnhanced.newVisibility;
          } else {
            const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
            originalNewVisibility = getDefaultNewStateFor('sneak', current, originalOutcome) || current;
          }
        } else {
          const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
          originalNewVisibility = getDefaultNewStateFor('sneak', current, originalOutcome) || current;
        }
      } catch (error) {
        console.warn('PF2E Visioner | Failed to calculate original enhanced outcome:', error);
        const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
        originalNewVisibility = getDefaultNewStateFor('sneak', current, originalOutcome) || current;
      }
    } else {
      originalNewVisibility = newVisibility;
    }

    // Check if we should show override displays (only if there's a meaningful difference)
    const shouldShowOverride =
      result.autoCover?.isOverride &&
      (total !== originalTotal ||
        margin !== originalMargin ||
        outcome !== originalOutcome ||
        newVisibility !== originalNewVisibility);

    // Get position transition data if available
    const positionTransition = await this._getPositionTransitionForSubject(subject);
    console.debug('PF2E Visioner | Position transition for', subject.name, ':', positionTransition);

    // Calculate enhanced position impact with DC adjustments
    const positionImpact = this._calculatePositionImpact(positionTransition, dc);

    // Adjust DC based on position impact if available
    let finalDC = dc;
    if (positionImpact?.effectiveDC) {
      finalDC = positionImpact.effectiveDC;
    }

    // Recalculate outcome with adjusted DC if necessary
    let finalOutcome = outcome;
    let finalMargin = margin;
    if (finalDC !== dc) {
      finalMargin = total - finalDC;
      finalOutcome = determineOutcome(total, die, finalDC);
    }

    // Generate enhanced recommendations with full context
    const recommendations = this._generateRecommendationsForOutcome(
      finalOutcome,
      positionTransition,
      current,
      newVisibility,
    );

    console.log('PF2E Visioner | Final sneak outcome values:', {
      observer: subject?.name,
      rollTotal: baseTotal,
      originalRollTotal: total,
      margin: baseTotal - finalDC,
      adjustedMargin: finalMargin,
      baseTotal,
      total,
      originalTotal,
      finalDC,
      dc
    });

    return {
      token: subject,
      dc: finalDC, // Use adjusted DC
      originalDC: dc, // Keep original for reference
      rollTotal: baseTotal, // Show the actual roll the player made
      dieResult: die,
      margin: baseTotal - finalDC, // Margin of actual roll vs final DC
      adjustedMargin: finalMargin, // Internal adjusted margin for calculations
      originalMargin,
      baseMargin,
      outcome: finalOutcome, // Use adjusted outcome
      originalOutcome,
      originalOutcomeLabel,
      originalNewVisibility,
      shouldShowOverride,
      currentVisibility: current,
      oldVisibility: current,
      oldVisibilityLabel: VISIBILITY_STATES[current]?.label || current,
      newVisibility,
      changed: newVisibility !== current,
      autoCover: result.autoCover, // Add auto-cover information
      // Add adjusted total for override display (what's used for calculations)
      originalRollTotal: total,
      // Add base roll total for triple-bracket display
      baseRollTotal: baseRollTotal,
      // Enhanced position tracking data
      positionTransition,
      startPosition: positionTransition?.startPosition,
      endPosition: positionTransition?.endPosition,
      positionImpact,
      recommendations,
      // Enhanced outcome analysis
      dcAdjustment: finalDC !== dc ? finalDC - dc : 0,
      outcomeChanged: finalOutcome !== outcome,
      enhancedAnalysis: {
        hasPositionData: !!positionTransition,
        positionQuality: positionTransition
          ? this._assessPositionQuality(positionTransition.endPosition)
          : 'unknown',
        stealthPotential: positionTransition
          ? this._assessStealthPotential(positionTransition.endPosition)
          : 'unknown',
        riskLevel: positionTransition
          ? this._assessRiskLevel(positionTransition.endPosition, finalOutcome)
          : 'unknown',
      },
      // Enhanced outcome determination data
      enhancedOutcomeData: enhancedOutcome ? {
        outcomeReason: enhancedOutcome.outcomeReason,
        avsDecisionUsed: enhancedOutcome.avsDecisionUsed,
        positionImpact: enhancedOutcome.positionImpact,
        positionQualifications: enhancedOutcome.positionQualifications,
        rollData: enhancedOutcome.rollData,
        rollEnhanced: enhancedOutcome.rollEnhanced,
        explanation: enhancedOutcome.explanation || null
      } : null,
    };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    const change = {
      observer,
      target: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
    };

    return change;
  }

  /**
   * Indicates that SneakActionHandler supports dual system application
   * @returns {boolean} True - sneak actions support dual system
   */
  supportsDualSystemApplication() {
    return true;
  }

  /**
   * Converts sneak outcomes to sneak results format for dual system application
   * @param {Array<Object>} outcomes - Sneak outcomes
   * @param {Object} actionData - Action data
   * @returns {Array<Object>} Sneak results in dual system format
   */
  convertOutcomesToSneakResults(outcomes, actionData) {
    return outcomes.map((outcome) => ({
      token: outcome.token,
      actor: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility || outcome.currentVisibility,
      positionTransition: outcome.positionTransition,
      autoCover: outcome.autoCover,
      overrideState: outcome.overrideState,
      // Enhanced sneak-specific data
      startPosition: outcome.startPosition,
      endPosition: outcome.endPosition,
      positionImpact: outcome.positionImpact,
      recommendations: outcome.recommendations,
      dcAdjustment: outcome.dcAdjustment,
      outcomeChanged: outcome.outcomeChanged,
      enhancedAnalysis: outcome.enhancedAnalysis,
    }));
  }

  /**
   * Override apply method to use dual system application
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Apply button
   * @returns {Promise<number>} Number of changes applied
   */
  async apply(actionData, button) {
    try {
      // Use the enhanced dual system application for sneak actions
      const result = await this.applyWithDualSystem(actionData, button);

      // Clear position state after successful application
      this._clearPositionState();

      return result;
    } catch (error) {
      // Clear position state even on error to prevent stale data
      this._clearPositionState();
      throw error;
    }
  }

  /**
   * Enhanced revert method that handles dual system rollback
   * @param {Object} actionData - Action data
   * @param {jQuery} button - Revert button
   */
  async revert(actionData, button) {
    try {
      // Check if this was a dual system application
      const cache = this.getCacheMap();
      const entries = cache?.get(actionData.messageId) || [];
      const dualSystemEntry = entries.find((entry) => entry.isDualSystem);

      if (dualSystemEntry) {
        // Use dual system rollback
        const { default: dualSystemApplication } = await import(
          '../dual-system-result-application.js'
        );
        const rollbackSuccess = await dualSystemApplication.rollbackTransaction(
          dualSystemEntry.transactionId,
        );

        if (rollbackSuccess) {
          this.clearCache(actionData);
          this.updateButtonToApply(button);
          notify.info('Sneak changes reverted successfully');
        } else {
          // Fallback to standard revert if dual system rollback fails
          console.warn('PF2E Visioner | Dual system rollback failed, attempting standard revert');
          await super.revert(actionData, button);
        }
      } else {
        // Use standard revert for non-dual system applications
        await super.revert(actionData, button);
      }

      // Clear position state after revert
      this._clearPositionState();
    } catch (error) {
      console.error('PF2E Visioner | Enhanced revert failed:', error);
      // Clear position state even on error
      this._clearPositionState();
      // Fallback to standard revert
      await super.revert(actionData, button);
    }
  }

  /**
   * Clears position tracking state when action completes
   * @private
   */
  _clearPositionState() {
    console.debug('PF2E Visioner | Clearing position state. Stack trace:', new Error().stack);
    this._isTrackingPositions = false;
    this._currentActionData = null;
    this._startPositions.clear();
    this._endPositions.clear();
    this._positionTransitions.clear();
  }

  /**
   * Attempts to recover from system failures during sneak action
   * @param {string} systemType - Optional specific system to recover
   * @returns {Promise<boolean>} Whether recovery was successful
   */
  async attemptSystemRecovery(systemType = null) {
    try {
      if (systemType) {
        return await errorHandlingService.attemptSystemRecovery(systemType);
      } else {
        // Attempt recovery for all relevant systems
        const results = await Promise.all([
          errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS),
          errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AUTO_COVER),
          errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.POSITION_TRACKER),
        ]);

        // Return true if any system recovered
        return results.some((result) => result === true);
      }
    } catch (error) {
      console.warn('PF2E Visioner | System recovery attempt failed:', error);
      return false;
    }
  }

  /**
   * Gets comprehensive system diagnostics including error handling status
   * @returns {Object} System diagnostic information
   */
  getSystemDiagnostics() {
    return {
      positionTracking: {
        isActive: this._isTrackingPositions,
        hasStartPositions: this._startPositions.size > 0,
        hasEndPositions: this._endPositions.size > 0,
        hasTransitions: this._positionTransitions.size > 0,
      },
      errorHandling: errorHandlingService.getSystemStatus(),
      positionTracker: this.positionTracker.getEnhancedSystemDiagnostics(),
    };
  }

  /**
   * Validates prerequisites with enhanced position context and error handling
   * @param {Object} actionData - Action data
   * @returns {Promise<Object>} Validation result with position analysis
   */
  async validatePrerequisitesWithPosition(actionData) {
    try {
      // Basic validation structure
      const validationResult = {
        valid: true,
        canProceed: true,
        errors: [],
        warnings: [],
        recommendations: [],
        observerCount: 0,
        positionAnalysis: null,
        systemStatus: null,
      };

      // Get system diagnostics
      validationResult.systemStatus = this.getSystemDiagnostics();

      // Basic roll validation without recursion
      const { ensureActionRoll } = await import('../infra/roll-utils.js');
      try {
        ensureActionRoll(actionData);
      } catch (error) {
        validationResult.errors.push(`Roll validation failed: ${error.message}`);
        validationResult.canProceed = false;
        validationResult.valid = false;
        return validationResult;
      }

      // Check if we have observers
      const observers = await this.discoverSubjects(actionData);
      validationResult.observerCount = observers.length;

      if (observers.length === 0) {
        validationResult.warnings.push(
          'No potential observers detected - sneak may not be necessary',
        );
        validationResult.recommendations.push('Consider if stealth is needed in current situation');
      }

      // Analyze position quality if position tracking is active
      if (this._isTrackingPositions && this._startPositions.size > 0) {
        validationResult.positionAnalysis = this._analyzePositionQuality();

        // Add position-based recommendations
        if (validationResult.positionAnalysis.overallQuality === 'poor') {
          validationResult.warnings.push('Current position provides poor stealth advantages');
          validationResult.recommendations.push('Consider moving to better cover before sneaking');
        } else if (validationResult.positionAnalysis.overallQuality === 'excellent') {
          validationResult.recommendations.push(
            'Excellent position for stealth - proceed with confidence',
          );
        }
      }

      // Check for system failures that might affect the action
      const errorStatus = errorHandlingService.getSystemStatus();
      const failedSystems = Object.entries(errorStatus)
        .filter(([_, status]) => !status.available)
        .map(([system, _]) => system);

      if (failedSystems.length > 0) {
        validationResult.warnings.push(`Some systems unavailable: ${failedSystems.join(', ')}`);
        validationResult.recommendations.push(
          'Fallback mechanisms will be used for unavailable systems',
        );
      }

      return validationResult;
    } catch (error) {
      const errorResult = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.SNEAK_ACTION,
        error,
        { actionData, phase: 'prerequisite_validation' },
      );

      // Return basic validation result if error handling fails
      return {
        valid: false,
        canProceed: errorResult.fallbackApplied,
        errors: [`Prerequisite validation failed: ${error.message}`],
        warnings: errorResult.fallbackApplied ? ['Using fallback validation'] : [],
        recommendations: ['Check system status and try again'],
        observerCount: 0,
        positionAnalysis: null,
        systemStatus: null,
      };
    }
  }

  /**
   * Analyzes overall position quality from start positions
   * @returns {Object} Position quality analysis
   * @private
   */
  _analyzePositionQuality() {
    if (this._startPositions.size === 0) {
      return {
        overallQuality: 'unknown',
        averageStealthBonus: 0,
        coverDistribution: {},
        visibilityDistribution: {},
        systemAvailability: { avs: false, autoCover: false },
      };
    }

    let totalStealthBonus = 0;
    const coverCounts = {};
    const visibilityCounts = {};
    let avsAvailable = false;
    let autoCoverAvailable = false;

    for (const [_, position] of this._startPositions) {
      totalStealthBonus += position.stealthBonus || 0;

      // Count cover states
      const cover = position.coverState || 'none';
      coverCounts[cover] = (coverCounts[cover] || 0) + 1;

      // Count visibility states
      const visibility = position.avsVisibility || 'observed';
      visibilityCounts[visibility] = (visibilityCounts[visibility] || 0) + 1;

      // Track system availability
      if (position.avsEnabled) avsAvailable = true;
      if (position.autoCoverEnabled) autoCoverAvailable = true;
    }

    const averageStealthBonus = totalStealthBonus / this._startPositions.size;

    // Determine overall quality
    let overallQuality = 'poor';
    if (averageStealthBonus >= 3) overallQuality = 'excellent';
    else if (averageStealthBonus >= 2) overallQuality = 'good';
    else if (averageStealthBonus >= 1) overallQuality = 'fair';

    return {
      overallQuality,
      averageStealthBonus,
      coverDistribution: coverCounts,
      visibilityDistribution: visibilityCounts,
      systemAvailability: { avs: avsAvailable, autoCover: autoCoverAvailable },
    };
  }

  /**
   * Sets up token update hooks for movement detection during sneak actions
   * @private
   */
  _setupMovementHooks() {
    // Hook into token updates to detect movement during sneak actions
    Hooks.on('updateToken', async (tokenDocument, changes, options, userId) => {
      try {
        // Only process if we're actively tracking positions
        if (!this._isTrackingPositions || !this._currentActionData) return;

        // Check if this is the sneaking token
        const sneakingToken = this._getSneakingToken(this._currentActionData);
        if (!sneakingToken || tokenDocument.id !== sneakingToken.document.id) return;

        // Check if position actually changed
        if (!changes.x && !changes.y) return;

        console.debug(
          'PF2E Visioner | Detected movement during sneak action, recalculating positions',
        );

        // Recalculate end positions due to movement
        await this._recalculateEndPositions(this._currentActionData);
      } catch (error) {
        await errorHandlingService.handleSystemError(SYSTEM_TYPES.POSITION_TRACKER, error, {
          tokenDocument,
          changes,
          phase: 'movement_detection',
        });
      }
    });
  }
  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actor,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.token || o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }

  /**
   * Gets position transition data for a specific subject token
   * @param {Token} subject - The observer token
   * @returns {PositionTransition|null} Position transition data or null if not available
   * @private
   */
  async _getPositionTransitionForSubject(subject) {
    console.debug('PF2E Visioner | Getting position transition for:', subject.name, {
      isTracking: this._isTrackingPositions,
      subjectId: subject?.document?.id,
      startPositionsSize: this._startPositions.size,
      startPositionsKeys: Array.from(this._startPositions.keys()),
    });

    if (!this._isTrackingPositions || !subject?.document?.id) {
      return null;
    }

    // First check if we have transition data (movement occurred)
    const transition = this._positionTransitions.get(subject.document.id);
    if (transition) {
      return transition;
    }

    // Hybrid approach: Use captured start position, calculate real-time end position
    const startPosition = this._startPositions.get(subject.document.id);
    console.debug(
      'PF2E Visioner | Start position lookup for',
      subject.document.id,
      ':',
      startPosition,
    );

    if (startPosition) {
      console.debug('PF2E Visioner | Using captured start position, calculating real-time end position for:', subject.name);

      try {
        const sneakingToken = this._getSneakingToken(this._currentActionData);
        
        if (!sneakingToken || !this.positionTracker) {
          console.debug('PF2E Visioner | Prerequisites not met for end position calculation:', {
            sneakingToken: !!sneakingToken,
            positionTracker: !!this.positionTracker,
          });
          return null;
        }

        // Calculate current end position in real-time
        console.debug('PF2E Visioner | Calculating real-time end position for:', subject.name);
        console.debug('PF2E Visioner | Token coordinates check:', {
          sneakingTokenX: sneakingToken.x,
          sneakingTokenY: sneakingToken.y,
          sneakingTokenCenter: sneakingToken.center,
          subjectTokenX: subject.x,
          subjectTokenY: subject.y,
          subjectTokenCenter: subject.center,
        });
        
        const currentPositionState = await this.positionTracker._capturePositionState(
          sneakingToken,
          subject,
          Date.now(),
          { forceFresh: true, useCurrentPositionForCover: true },
        );

        const endPosition = currentPositionState || startPosition;

        if (currentPositionState) {
          console.debug('PF2E Visioner | Successfully calculated real-time end position:', {
            startVis: startPosition.avsVisibility,
            startCover: startPosition.coverState,
            startDistance: startPosition.distance,
            endVis: currentPositionState.avsVisibility,
            endCover: currentPositionState.coverState,
            endDistance: currentPositionState.distance,
            distanceChanged:
              Math.abs(startPosition.distance - currentPositionState.distance) > 0.1,
            changed:
              startPosition.avsVisibility !== currentPositionState.avsVisibility ||
              startPosition.coverState !== currentPositionState.coverState,
          });
        } else {
          console.debug('PF2E Visioner | Using start position as fallback for end position');
        }

        // Create transition data comparing captured start vs real-time end positions
        const avsChanged = startPosition.avsVisibility !== endPosition.avsVisibility;
        const coverChanged = startPosition.coverState !== endPosition.coverState;

        return {
          targetId: subject.document.id,
          startPosition: startPosition,
          endPosition: endPosition,
          avsTransition: {
            from: startPosition.avsVisibility,
            to: endPosition.avsVisibility,
            changed: avsChanged,
          },
          coverTransition: {
            from: startPosition.coverState,
            to: endPosition.coverState,
            changed: coverChanged,
          },
          avsVisibilityChanged: avsChanged,
          coverChanged: coverChanged,
          hasChanged: avsChanged || coverChanged,
          transitionType: this._determineTransitionType(startPosition, endPosition),
          stealthBonusChange: endPosition.stealthBonus - startPosition.stealthBonus,
        };
      } catch (error) {
        console.warn('PF2E Visioner | Error calculating real-time end position:', error);
        return null;
      }
    }

    return null;
        
  }

  /**
   * Determines the type of position transition based on start and end positions
   * @param {Object} startPosition - Starting position data
   * @param {Object} endPosition - Ending position data
   * @returns {string} Transition type ('improved', 'worsened', 'changed', 'unchanged')
   * @private
   */
  _determineTransitionType(startPosition, endPosition) {
    // Define visibility rankings (higher is better for stealth)
    const visibilityRanking = {
      observed: 1,
      concealed: 2,
      hidden: 3,
      undetected: 4,
    };

    const startVisRank = visibilityRanking[startPosition.avsVisibility] || 1;
    const endVisRank = visibilityRanking[endPosition.avsVisibility] || 1;

    // Compare cover states (higher is better for stealth)
    const coverRanking = {
      none: 1,
      lesser: 2,
      standard: 3,
      greater: 4,
    };

    const startCoverRank = coverRanking[startPosition.coverState] || 1;
    const endCoverRank = coverRanking[endPosition.coverState] || 1;

    // Calculate overall improvement/decline
    const visibilityChange = endVisRank - startVisRank;
    const coverChange = endCoverRank - startCoverRank;
    const totalChange = visibilityChange + coverChange;

    if (totalChange > 0) {
      return 'improved';
    } else if (totalChange < 0) {
      return 'worsened';
    } else if (visibilityChange !== 0 || coverChange !== 0) {
      return 'changed';
    } else {
      return 'unchanged';
    }
  }

  /**
   * Calculates the impact of position changes on the sneak attempt
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @param {number} baseDC - Base DC for the check
   * @returns {Object|null} Position impact analysis
   * @private
   */
  _calculatePositionImpact(positionTransition, baseDC) {
    if (!positionTransition) return null;

    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    // Calculate DC adjustments based on position transitions
    let dcModification = 0;
    let effectiveDC = baseDC;

    // Visibility-based DC adjustments
    const visibilityDCImpact = this._calculateVisibilityDCImpact(
      startPos.avsVisibility,
      endPos.avsVisibility,
    );

    // Cover-based stealth bonus changes
    const coverBonusChange = positionTransition.stealthBonusChange || 0;

    // Distance-based adjustments (if significant change)
    const distanceChange = endPos.distance - startPos.distance;
    const distanceDCImpact = this._calculateDistanceDCImpact(distanceChange);

    // Lighting condition changes
    const lightingImpact = this._calculateLightingDCImpact(
      startPos.lightingConditions,
      endPos.lightingConditions,
    );

    // Combine all impacts
    dcModification = visibilityDCImpact + distanceDCImpact + lightingImpact;
    effectiveDC = baseDC + dcModification;

    // Generate detailed explanation
    const explanationParts = [];
    let bonusSource = 'none';

    if (coverBonusChange > 0) {
      explanationParts.push(`Gained +${coverBonusChange} stealth bonus from improved cover`);
      bonusSource = 'improved_cover';
    } else if (coverBonusChange < 0) {
      explanationParts.push(`Lost ${Math.abs(coverBonusChange)} stealth bonus from reduced cover`);
      bonusSource = 'reduced_cover';
    }

    if (visibilityDCImpact !== 0) {
      const direction = visibilityDCImpact > 0 ? 'increased' : 'decreased';
      explanationParts.push(
        `DC ${direction} by ${Math.abs(visibilityDCImpact)} due to visibility change`,
      );
    }

    if (distanceDCImpact !== 0) {
      const direction = distanceDCImpact > 0 ? 'increased' : 'decreased';
      explanationParts.push(
        `DC ${direction} by ${Math.abs(distanceDCImpact)} due to distance change`,
      );
    }

    if (lightingImpact !== 0) {
      const direction = lightingImpact > 0 ? 'increased' : 'decreased';
      explanationParts.push(
        `DC ${direction} by ${Math.abs(lightingImpact)} due to lighting change`,
      );
    }
  }

  /**
   * Calculates DC impact from visibility state changes
   * @param {string} startVisibility - Starting visibility state
   * @param {string} endVisibility - Ending visibility state
   * @returns {number} DC modification
   * @private
   */
  _calculateVisibilityDCImpact(startVisibility, endVisibility) {
    // Define DC modifiers for different visibility states
    const visibilityDCModifiers = {
      observed: 0,
      concealed: -2,
      hidden: -4,
      undetected: -6,
    };

    const startModifier = visibilityDCModifiers[startVisibility] || 0;
    const endModifier = visibilityDCModifiers[endVisibility] || 0;

    // Return the change in DC (negative means easier for sneaker)
    return startModifier - endModifier;
  }

  /**
   * Calculates DC impact from distance changes
   * @param {number} distanceChange - Change in distance (positive = farther)
   * @returns {number} DC modification
   * @private
   */
  _calculateDistanceDCImpact(distanceChange) {
    // Significant distance changes can affect perception
    // Every 30 feet of additional distance makes it slightly harder to perceive
    if (Math.abs(distanceChange) < 15) return 0; // Ignore small changes

    const distanceSteps = Math.floor(Math.abs(distanceChange) / 30);
    const modifier = distanceSteps * 1; // +1 DC per 30 feet

    // Farther = harder to perceive (lower DC for sneaker)
    return distanceChange > 0 ? -modifier : modifier;
  }

  /**
   * Calculates DC impact from lighting condition changes
   * @param {string} startLighting - Starting lighting condition
   * @param {string} endLighting - Ending lighting condition
   * @returns {number} DC modification
   * @private
   */
  _calculateLightingDCImpact(startLighting, endLighting) {
    const lightingDCModifiers = {
      bright: 0,
      dim: -2,
      darkness: -4,
      unknown: 0,
    };

    const startModifier = lightingDCModifiers[startLighting] || 0;
    const endModifier = lightingDCModifiers[endLighting] || 0;

    // Return the change in DC (negative means easier for sneaker)
    return startModifier - endModifier;
  }

  /**
   * Generates recommendations based on outcome and position data
   * @param {string} outcome - Roll outcome ('success', 'failure', etc.)
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @param {string} currentVisibility - Current visibility state
   * @param {string} newVisibility - New visibility state after action
   * @returns {Object|null} Recommendation data
   * @private
   */
  _generateRecommendationsForOutcome(
    outcome,
    positionTransition,
    currentVisibility,
    newVisibility,
  ) {
    if (!positionTransition) {
      return this._generateBasicRecommendations(outcome, currentVisibility, newVisibility);
    }

    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    const recommendations = {
      nextAction: '',
      reasoning: '',
      alternatives: [],
      tacticalAnalysis: this._generateTacticalAnalysis(positionTransition, outcome),
      positionAdvice: this._generatePositionAdvice(positionTransition),
      riskAssessment: this._generateRiskAssessment(positionTransition, outcome, newVisibility),
    };

    // Enhanced outcome analysis with detailed position context
    if (outcome === 'critical-success') {
      recommendations.nextAction = 'Exploit your superior stealth advantage';
      recommendations.reasoning = this._buildReasoningString([
        'Critical success achieved',
        positionTransition.transitionType === 'improved' ? 'position significantly improved' : null,
        endPos.coverState !== 'none' ? `excellent cover (${endPos.coverState})` : null,
        endPos.avsVisibility === 'undetected' ? 'completely undetected' : null,
      ]);
      recommendations.alternatives = this._prioritizeAlternatives(
        [
          'Strike with advantage while undetected',
          'Move to an even better tactical position',
          'Set up for coordinated team actions',
          'Continue sneaking to flank enemies',
        ],
        positionTransition,
        outcome,
      );
    } else if (outcome === 'success') {
      if (newVisibility === 'undetected') {
        recommendations.nextAction = 'Maintain stealth advantage and position carefully';
        recommendations.reasoning = this._buildReasoningString([
          'Successfully became undetected',
          positionTransition.stealthBonusChange > 0
            ? `gained ${positionTransition.stealthBonusChange} stealth bonus`
            : null,
          endPos.lightingConditions === 'darkness'
            ? 'darkness provides additional concealment'
            : null,
        ]);
        recommendations.alternatives = this._prioritizeAlternatives(
          [
            'Strike while undetected for maximum advantage',
            'Move to maintain or improve position',
            'Hide action to consolidate stealth',
            'Coordinate with allies for ambush',
          ],
          positionTransition,
          outcome,
        );
      } else if (newVisibility === 'hidden') {
        recommendations.nextAction = 'Improve position or attempt another stealth action';
        recommendations.reasoning = this._buildReasoningString([
          'Improved to hidden status',
          positionTransition.transitionType === 'improved' ? 'position is improving' : null,
          endPos.coverState !== 'none' ? `has ${endPos.coverState} cover` : null,
        ]);
        recommendations.alternatives = this._prioritizeAlternatives(
          [
            'Sneak again to become undetected',
            'Hide action to maintain concealment',
            'Move to better cover position',
            'Take Cover action to improve defenses',
          ],
          positionTransition,
          outcome,
        );
      }
    } else if (outcome === 'failure') {
      if (positionTransition.transitionType === 'improved') {
        recommendations.nextAction = 'Retry stealth from this improved position';
        recommendations.reasoning = this._buildReasoningString([
          'Roll failed but position improved',
          positionTransition.stealthBonusChange > 0
            ? `gained ${positionTransition.stealthBonusChange} stealth bonus`
            : null,
          endPos.coverState !== startPos.coverState
            ? `cover changed from ${startPos.coverState} to ${endPos.coverState}`
            : null,
        ]);
        recommendations.alternatives = this._prioritizeAlternatives(
          [
            'Sneak again with better positioning',
            'Hide action to reset stealth status',
            'Take Cover to maximize defensive bonuses',
            'Move to even better cover',
          ],
          positionTransition,
          outcome,
        );
      } else if (positionTransition.transitionType === 'worsened') {
        recommendations.nextAction = 'Reposition immediately to avoid detection';
        recommendations.reasoning = this._buildReasoningString([
          'Failed roll and position worsened',
          positionTransition.stealthBonusChange < 0
            ? `lost ${Math.abs(positionTransition.stealthBonusChange)} stealth bonus`
            : null,
          endPos.lightingConditions === 'bright' ? 'exposed in bright light' : null,
          !endPos.hasLineOfSight ? null : 'in direct line of sight',
        ]);
        recommendations.alternatives = this._prioritizeAlternatives(
          [
            'Move to cover immediately',
            'Take Cover action for defensive bonuses',
            'Hide action to break line of sight',
            'Consider defensive or escape actions',
          ],
          positionTransition,
          outcome,
        );
      } else {
        recommendations.nextAction = 'Change tactics or seek better positioning';
        recommendations.reasoning = this._buildReasoningString([
          'Failed from similar position',
          endPos.coverState === 'none' ? 'no cover available' : null,
          endPos.distance < 30 ? 'very close to observer' : null,
        ]);
        recommendations.alternatives = this._prioritizeAlternatives(
          [
            'Move to cover before trying again',
            'Hide action to reset the situation',
            'Create a Diversion to distract enemies',
            'Consider non-stealth tactics',
          ],
          positionTransition,
          outcome,
        );
      }
    } else if (outcome === 'critical-failure') {
      recommendations.nextAction = 'Take immediate defensive action';
      recommendations.reasoning = this._buildReasoningString([
        'Critical failure - likely detected',
        positionTransition.transitionType === 'worsened'
          ? 'position significantly compromised'
          : null,
        endPos.coverState === 'none' ? 'no cover protection' : null,
        endPos.lightingConditions === 'bright' ? 'fully exposed in bright light' : null,
      ]);
      recommendations.alternatives = this._prioritizeAlternatives(
        [
          'Take Cover for immediate protection',
          'Move to defensive position',
          'Prepare for combat or escape',
          'Use defensive abilities or spells',
        ],
        positionTransition,
        outcome,
      );
    }

    return recommendations;
  }

  /**
   * Generates tactical analysis based on position transition
   * @param {PositionTransition} positionTransition - Position transition data
   * @param {string} outcome - Roll outcome
   * @returns {Object} Tactical analysis
   * @private
   */
  _generateTacticalAnalysis(positionTransition, outcome) {
    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    return {
      positionQuality: this._assessPositionQuality(endPos),
      stealthPotential: this._assessStealthPotential(endPos),
      riskLevel: this._assessRiskLevel(endPos, outcome),
      advantageFactors: this._identifyAdvantageFactors(positionTransition),
      disadvantageFactors: this._identifyDisadvantageFactors(positionTransition),
    };
  }

  /**
   * Generates position-specific advice
   * @param {PositionTransition} positionTransition - Position transition data
   * @returns {Object} Position advice
   * @private
   */
  _generatePositionAdvice(positionTransition) {
    const endPos = positionTransition.endPosition;

    const advice = {
      coverAdvice: '',
      lightingAdvice: '',
      distanceAdvice: '',
      movementAdvice: '',
    };

    // Cover advice
    if (endPos.coverState === 'none') {
      advice.coverAdvice = 'Seek cover to improve stealth bonuses and protection';
    } else if (endPos.coverState === 'lesser') {
      advice.coverAdvice = 'Look for better cover to maximize stealth advantage';
    } else {
      advice.coverAdvice = `Excellent ${endPos.coverState} cover - maintain this position`;
    }

    // Lighting advice
    if (endPos.lightingConditions === 'bright') {
      advice.lightingAdvice = 'Avoid bright light areas - seek shadows or darkness';
    } else if (endPos.lightingConditions === 'dim') {
      advice.lightingAdvice = 'Dim light provides some concealment - good for stealth';
    } else if (endPos.lightingConditions === 'darkness') {
      advice.lightingAdvice = 'Darkness provides excellent concealment - exploit this advantage';
    }

    // Distance advice
    if (endPos.distance < 15) {
      advice.distanceAdvice = 'Very close range - high risk but potential for surprise attacks';
    } else if (endPos.distance < 30) {
      advice.distanceAdvice = 'Close range - moderate risk, good for quick actions';
    } else if (endPos.distance < 60) {
      advice.distanceAdvice = 'Medium range - balanced risk/reward for stealth';
    } else {
      advice.distanceAdvice = 'Long range - lower detection risk but limited action options';
    }

    // Movement advice
    if (positionTransition.hasChanged) {
      if (positionTransition.transitionType === 'improved') {
        advice.movementAdvice = 'Good positioning - continue this tactical approach';
      } else if (positionTransition.transitionType === 'worsened') {
        advice.movementAdvice = 'Position compromised - consider retreating to better ground';
      } else {
        advice.movementAdvice = 'Position changed but no clear advantage - reassess options';
      }
    } else {
      advice.movementAdvice = 'Static position - consider if movement might improve situation';
    }

    return advice;
  }

  /**
   * Generates risk assessment based on position and outcome
   * @param {PositionTransition} positionTransition - Position transition data
   * @param {string} outcome - Roll outcome
   * @param {string} newVisibility - New visibility state
   * @returns {Object} Risk assessment
   * @private
   */
  _generateRiskAssessment(positionTransition, outcome, newVisibility) {
    const endPos = positionTransition.endPosition;

    let riskLevel = 'moderate';
    const riskFactors = [];
    const mitigatingFactors = [];

    // Assess risk based on outcome
    if (outcome === 'critical-failure') {
      riskLevel = 'critical';
      riskFactors.push('Critical failure likely means detection');
    } else if (outcome === 'failure') {
      riskLevel = 'high';
      riskFactors.push('Failed stealth attempt');
    } else if (outcome === 'success' && newVisibility === 'undetected') {
      riskLevel = 'low';
      mitigatingFactors.push('Successfully undetected');
    }

    // Position-based risk factors
    if (endPos.coverState === 'none') {
      riskFactors.push('No cover protection');
    } else {
      mitigatingFactors.push(`${endPos.coverState} cover provides protection`);
    }

    if (endPos.lightingConditions === 'bright') {
      riskFactors.push('Exposed in bright light');
    } else if (endPos.lightingConditions === 'darkness') {
      mitigatingFactors.push('Darkness provides concealment');
    }

    if (endPos.distance < 15) {
      riskFactors.push('Very close to observer');
    } else if (endPos.distance > 60) {
      mitigatingFactors.push('Safe distance from observer');
    }

    if (!endPos.hasLineOfSight) {
      mitigatingFactors.push('No direct line of sight');
    } else {
      riskFactors.push('In direct line of sight');
    }

    return {
      level: riskLevel,
      riskFactors,
      mitigatingFactors,
      recommendation: this._getRiskRecommendation(riskLevel),
    };
  }

  /**
   * Helper method to build reasoning strings from array of conditions
   * @param {Array<string|null>} conditions - Array of condition strings (null values filtered out)
   * @returns {string} Combined reasoning string
   * @private
   */
  _buildReasoningString(conditions) {
    return conditions.filter(Boolean).join(', ');
  }

  /**
   * Prioritizes alternatives based on position and outcome context
   * @param {Array<string>} alternatives - Base alternatives
   * @param {PositionTransition} positionTransition - Position data
   * @param {string} outcome - Roll outcome
   * @returns {Array<string>} Prioritized alternatives
   * @private
   */
  _prioritizeAlternatives(alternatives, positionTransition, outcome) {
    // For now, return as-is, but could implement sophisticated prioritization
    // based on position quality, risk level, etc.
    return alternatives;
  }

  /**
   * Assesses the quality of current position for stealth
   * @param {PositionState} position - Position state
   * @returns {string} Quality assessment
   * @private
   */
  _assessPositionQuality(position) {
    let score = 0;

    // Cover contributes to quality
    const coverScores = { none: 0, lesser: 1, standard: 2, greater: 3 };
    score += coverScores[position.coverState] || 0;

    // Lighting contributes to quality
    const lightingScores = { bright: 0, dim: 1, darkness: 2 };
    score += lightingScores[position.lightingConditions] || 0;

    // Line of sight affects quality
    if (!position.hasLineOfSight) score += 1;

    if (score >= 5) return 'excellent';
    if (score >= 3) return 'good';
    if (score >= 1) return 'fair';
    return 'poor';
  }

  /**
   * Assesses stealth potential from current position
   * @param {PositionState} position - Position state
   * @returns {string} Stealth potential assessment
   * @private
   */
  _assessStealthPotential(position) {
    if (position.stealthBonus >= 4) return 'high';
    if (position.stealthBonus >= 2) return 'moderate';
    if (position.stealthBonus > 0) return 'low';
    return 'minimal';
  }

  /**
   * Assesses risk level from current position and outcome
   * @param {PositionState} position - Position state
   * @param {string} outcome - Roll outcome
   * @returns {string} Risk level
   * @private
   */
  _assessRiskLevel(position, outcome) {
    if (outcome === 'critical-failure') return 'critical';
    if (outcome === 'failure' && position.coverState === 'none') return 'high';
    if (outcome === 'success' && position.avsVisibility === 'undetected') return 'low';
    return 'moderate';
  }

  /**
   * Identifies advantage factors from position transition
   * @param {PositionTransition} transition - Position transition
   * @returns {Array<string>} Advantage factors
   * @private
   */
  _identifyAdvantageFactors(transition) {
    const factors = [];

    if (transition.stealthBonusChange > 0) {
      factors.push(`Gained +${transition.stealthBonusChange} stealth bonus`);
    }

    if (
      transition.avsTransition.changed &&
      this._isVisibilityImprovedForStealth(
        transition.avsTransition.from,
        transition.avsTransition.to,
      )
    ) {
      factors.push(
        `Visibility improved from ${transition.avsTransition.from} to ${transition.avsTransition.to}`,
      );
    }

    if (transition.endPosition.lightingConditions === 'darkness') {
      factors.push('Positioned in darkness');
    }

    if (!transition.endPosition.hasLineOfSight) {
      factors.push('No line of sight to observer');
    }

    return factors;
  }

  /**
   * Identifies disadvantage factors from position transition
   * @param {PositionTransition} transition - Position transition
   * @returns {Array<string>} Disadvantage factors
   * @private
   */
  _identifyDisadvantageFactors(transition) {
    const factors = [];

    if (transition.stealthBonusChange < 0) {
      factors.push(`Lost ${Math.abs(transition.stealthBonusChange)} stealth bonus`);
    }

    if (
      transition.avsTransition.changed &&
      !this._isVisibilityImprovedForStealth(
        transition.avsTransition.from,
        transition.avsTransition.to,
      )
    ) {
      factors.push(
        `Visibility worsened from ${transition.avsTransition.from} to ${transition.avsTransition.to}`,
      );
    }

    if (transition.endPosition.lightingConditions === 'bright') {
      factors.push('Exposed in bright light');
    }

    if (transition.endPosition.distance < 15) {
      factors.push('Very close to observer');
    }

    if (transition.endPosition.coverState === 'none') {
      factors.push('No cover protection');
    }

    return factors;
  }

  /**
   * Gets risk-based recommendation
   * @param {string} riskLevel - Risk level assessment
   * @returns {string} Risk recommendation
   * @private
   */
  _getRiskRecommendation(riskLevel) {
    switch (riskLevel) {
      case 'critical':
        return 'Take immediate defensive action - high chance of detection';
      case 'high':
        return 'Exercise caution - consider repositioning or defensive measures';
      case 'moderate':
        return 'Proceed carefully - assess situation before next action';
      case 'low':
        return 'Good position - maintain advantage and proceed confidently';
      default:
        return 'Assess situation and proceed as appropriate';
    }
  }

  /**
   * Helper method to determine if visibility improved for stealth
   * @param {string} fromVisibility - Starting visibility
   * @param {string} toVisibility - Ending visibility
   * @returns {boolean} Whether visibility improved for stealth
   * @private
   */
  _isVisibilityImprovedForStealth(fromVisibility, toVisibility) {
    const stealthOrder = ['observed', 'concealed', 'hidden', 'undetected'];
    const fromIndex = stealthOrder.indexOf(fromVisibility);
    const toIndex = stealthOrder.indexOf(toVisibility);
    return toIndex > fromIndex;
  }

  /**
   * Generates basic recommendations without position data
   * @param {string} outcome - Roll outcome
   * @param {string} currentVisibility - Current visibility state
   * @param {string} newVisibility - New visibility state
   * @returns {Object} Basic recommendation data
   * @private
   */
  _generateBasicRecommendations(outcome, currentVisibility, newVisibility) {
    const recommendations = {
      nextAction: '',
      reasoning: '',
      alternatives: [],
    };

    if (outcome === 'success' || outcome === 'critical-success') {
      recommendations.nextAction = 'Take advantage of improved stealth';
      recommendations.reasoning = 'Sneak attempt succeeded';
      recommendations.alternatives = ['Continue sneaking', 'Strike while hidden', 'Reposition'];
    } else {
      recommendations.nextAction = 'Consider alternative approach';
      recommendations.reasoning = 'Sneak attempt failed';
      recommendations.alternatives = ['Hide action', 'Take Cover', 'Change tactics'];
    }

    return recommendations;
  }


  /**
   * Processes multiple targets using enhanced multi-target processor
   * @param {Object} actionData - Action data including roll information
   * @param {Array<Token>} subjects - Array of observer tokens
   * @param {Object} options - Processing options
   * @returns {Promise<Array<Object>>} Array of enhanced outcomes
   */
  async processMultipleTargetsEnhanced(actionData, subjects, options = {}) {
    const sneakingToken = this._getSneakingToken(actionData);
    if (!sneakingToken) {
      console.warn('PF2E Visioner | Cannot process multiple targets without sneaking token');
      return [];
    }

    // Use enhanced multi-target processor for optimized batch processing
    try {
      const enhancedOutcomes = await enhancedMultiTargetProcessor.processMultipleTargets(
        sneakingToken,
        subjects,
        actionData,
        {
          progressCallback: options.progressCallback,
          useCache: options.useCache !== false,
          batchSize: options.batchSize || 10,
          enableParallelProcessing: options.enableParallelProcessing !== false,
        },
      );

      // Store enhanced outcomes for position tracking
      this._lastEnhancedOutcomes = enhancedOutcomes;

      console.debug(
        `PF2E Visioner | Enhanced multi-target processing completed for ${enhancedOutcomes.length} targets`,
      );

      return enhancedOutcomes;
    } catch (error) {
      console.error('PF2E Visioner | Enhanced multi-target processing failed:', error);

      // Fallback to standard processing
      console.warn('PF2E Visioner | Falling back to standard multi-target processing');
      return await this._processMultipleTargetsStandard(actionData, subjects);
    }
  }

  /**
   * Standard multi-target processing fallback
   * @param {Object} actionData - Action data
   * @param {Array<Token>} subjects - Array of observer tokens
   * @returns {Promise<Array<Object>>} Array of standard outcomes
   * @private
   */
  async _processMultipleTargetsStandard(actionData, subjects) {
    const outcomes = [];

    for (const subject of subjects) {
      try {
        const outcome = await this.analyzeOutcome(actionData, subject);
        outcomes.push(outcome);
      } catch (error) {
        console.warn(
          `PF2E Visioner | Failed to analyze outcome for ${subject.document.id}:`,
          error,
        );
        // Add fallback outcome
        outcomes.push({
          token: subject,
          dc: 15,
          rollTotal: actionData?.roll?.total || 0,
          outcome: 'failure',
          currentVisibility: 'observed',
          newVisibility: 'observed',
          changed: false,
          hasPositionData: false,
        });
      }
    }

    return outcomes;
  }

  /**
   * Gets the last enhanced outcomes for UI display
   * @returns {Array<Object>|null} Last enhanced outcomes or null
   */
  getLastEnhancedOutcomes() {
    return this._lastEnhancedOutcomes || null;
  }

  /**
   * Clears cached enhanced outcomes
   */
  clearEnhancedOutcomes() {
    this._lastEnhancedOutcomes = null;
  }

  /**
   * Applies AVS override with position context for sneak results
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} visibilityState - Override visibility state
   * @param {Object} outcome - Sneak outcome with position data
   * @returns {Promise<boolean>} Success status
   */
  async applyPositionAwareOverride(observer, target, visibilityState, outcome) {
    try {
      // Extract position transition from outcome
      const positionTransition = outcome.positionTransition;

      if (!positionTransition) {
        console.warn('PF2E Visioner | No position data available for position-aware override');
        // Fall back to standard override
        return await enhancedAVSOverrideService.setPositionAwareOverride(
          observer,
          target,
          visibilityState,
          null,
          'sneak-result',
        );
      }

      // Apply position-based override
      const success = await enhancedAVSOverrideService.applyPositionBasedOverride(
        observer,
        target,
        visibilityState,
        positionTransition,
      );

      if (success) {
        console.log(
          `${MODULE_ID} | Applied position-aware override for sneak result: ${observer.name} → ${target.name} = ${visibilityState}`,
        );
      }

      return success;
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {
        observer,
        target,
        visibilityState,
        outcome,
        phase: 'apply_position_override',
      });
      return false;
    }
  }

  /**
   * Validates sneak result override against position data
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} proposedState - Proposed override state
   * @param {Object} outcome - Sneak outcome with position data
   * @returns {Promise<Object>} Validation result
   */
  async validateSneakOverride(observer, target, proposedState, outcome) {
    try {
      // Get position-aware override validation
      const positionContext = outcome.positionTransition
        ? {
            startPosition: outcome.positionTransition.startPosition,
            endPosition: outcome.positionTransition.endPosition,
            transitionType: outcome.positionTransition.transitionType,
          }
        : null;

      // Use enhanced override service for validation
      const validationResult = await enhancedAVSOverrideService._validateOverrideConsistency(
        observer,
        target,
        proposedState,
        positionContext,
      );

      // Add sneak-specific validation
      const sneakValidation = this._validateSneakSpecificOverride(proposedState, outcome);

      return {
        ...validationResult,
        sneakSpecific: sneakValidation,
        canApply: validationResult.isValid && sneakValidation.isValid,
        combinedRecommendations: [
          ...validationResult.recommendations,
          ...sneakValidation.recommendations,
        ],
      };
    } catch (error) {
      console.warn('PF2E Visioner | Sneak override validation failed:', error);
      return {
        isValid: false,
        severity: 'error',
        issues: [`Validation failed: ${error.message}`],
        recommendations: ['Manual verification required'],
        canApply: false,
      };
    }
  }

  /**
   * Performs sneak-specific override validation
   * @param {string} proposedState - Proposed override state
   * @param {Object} outcome - Sneak outcome data
   * @returns {Object} Sneak-specific validation result
   * @private
   */
  _validateSneakSpecificOverride(proposedState, outcome) {
    const validation = {
      isValid: true,
      issues: [],
      recommendations: [],
    };

    // Check if override conflicts with sneak roll outcome
    if (outcome.outcome === 'critical-success' && proposedState === 'observed') {
      validation.isValid = false;
      validation.issues.push('Critical success sneak should not result in observed state');
      validation.recommendations.push('Consider hidden or undetected state for critical success');
    }

    if (
      outcome.outcome === 'critical-failure' &&
      ['hidden', 'undetected'].includes(proposedState)
    ) {
      validation.isValid = false;
      validation.issues.push('Critical failure sneak should not result in hidden/undetected state');
      validation.recommendations.push('Consider observed state for critical failure');
    }

    // Check if override makes sense with roll margin
    if (outcome.margin >= 10 && proposedState === 'observed') {
      validation.issues.push('High roll margin suggests better stealth result than observed');
      validation.recommendations.push('Consider concealed or hidden state for high roll');
    }

    if (outcome.margin <= -10 && ['hidden', 'undetected'].includes(proposedState)) {
      validation.issues.push('Low roll margin suggests worse stealth result');
      validation.recommendations.push('Consider observed or concealed state for low roll');
    }

    return validation;
  }

  /**
   * Resolves override conflicts for sneak results
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} resolution - Resolution type ('accept', 'reject', 'modify')
   * @param {string} newState - New state if modifying
   * @returns {Promise<boolean>} Success status
   */
  async resolveSneakOverrideConflict(observer, target, resolution, newState = null) {
    try {
      const success = await enhancedAVSOverrideService.resolveOverrideConflict(
        observer,
        target,
        resolution,
        newState,
      );

      if (success) {
        console.log(
          `${MODULE_ID} | Resolved sneak override conflict: ${observer.name} → ${target.name}, resolution: ${resolution}`,
        );
      }

      return success;
    } catch (error) {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {
        observer,
        target,
        resolution,
        newState,
        phase: 'resolve_conflict',
      });
      return false;
    }
  }

  /**
   * Gets all position-aware overrides for sneak results
   * @param {Token} observer - Observer token
   * @returns {Object} Position-aware overrides
   */
  getSneakPositionOverrides(observer) {
    try {
      return enhancedAVSOverrideService.getAllPositionAwareOverrides(observer);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get sneak position overrides:', error);
      return {};
    }
  }

  /**
   * Clears all position-aware overrides for sneak results
   * @param {Token} observer - Observer token
   * @returns {Promise<boolean>} Success status
   */
  async clearSneakPositionOverrides(observer) {
    try {
      return await enhancedAVSOverrideService.clearAllPositionAwareOverrides(observer);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to clear sneak position overrides:', error);
      return false;
    }
  }

  /**
   * Gets conflict resolution data for sneak override
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @returns {Object|null} Conflict resolution data
   */
  getSneakOverrideConflict(observer, target) {
    try {
      return enhancedAVSOverrideService.getConflictResolution(observer, target);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get sneak override conflict:', error);
      return null;
    }
  }

  /**
   * Generates comprehensive recommendations using the recommendation engine
   * @param {Object} validationResult - Validation results
   * @param {Object} positionAnalysis - Position analysis
   * @param {Object} actionData - Action data
   * @returns {Promise<Object>} Comprehensive recommendations
   * @private
   */
  async _generateComprehensiveRecommendations(validationResult, positionAnalysis, actionData) {
    try {
      const { SneakRecommendationEngine } = await import(
        '../recommendations/sneak-recommendation-engine.js'
      );
      return SneakRecommendationEngine.generateRecommendations(
        validationResult,
        positionAnalysis,
        actionData,
      );
    } catch (error) {
      console.warn('PF2E Visioner | Failed to generate comprehensive recommendations:', error);
      return {
        primary: null,
        alternatives: [],
        tactical: [],
        positioning: [],
        conditions: [],
        priority: 'medium',
      };
    }
  }

  /**
   * Temporary workaround to get cached roll-time position
   * This uses a simple in-memory cache to store positions by actor name
   * @param {Object} actionData - Action data containing actor information
   * @returns {Object|null} Cached roll-time position or null
   * @private
   */
  _getCachedRollTimePosition(actionData) {
    if (!this._rollTimePositionCache) {
      this._rollTimePositionCache = new Map();
    }

    const actorName = actionData.actor?.name;
    const cached = this._rollTimePositionCache.get(actorName);
    
    // Check if the cached position is recent (within last 30 seconds)
    if (cached && (Date.now() - cached.timestamp) < 30000) {
      return cached;
    }

    return null;
  }

  /**
   * Store roll-time position in cache (to be called from position capture service)
   * @param {string} actorName - Name of the actor
   * @param {Object} position - Position data
   * @static
   */
  static cacheRollTimePosition(actorName, position) {
    // This will be called from the position capture service
    if (!SneakActionHandler._globalRollTimeCache) {
      SneakActionHandler._globalRollTimeCache = new Map();
    }
    
    SneakActionHandler._globalRollTimeCache.set(actorName, {
      ...position,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached roll-time position from global cache
   * @param {Object} actionData - Action data
   * @returns {Object|null} Cached position or null
   * @private
   */
  _getCachedRollTimePositionFromGlobal(actionData) {
    if (!SneakActionHandler._globalRollTimeCache) {
      return null;
    }

    const actorName = actionData.actor?.name;
    const cached = SneakActionHandler._globalRollTimeCache.get(actorName);
    
    // Check if the cached position is recent (within last 30 seconds)
    if (cached && (Date.now() - cached.timestamp) < 30000) {
      return cached;
    }

    return null;
  }
}
