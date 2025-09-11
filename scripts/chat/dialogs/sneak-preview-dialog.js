import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getVisibilityBetween } from '../../utils.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import enhancedMultiTargetProcessor from '../services/multi-target/EnhancedMultiTargetProcessor.js';
import sneakPositionTracker from '../services/position/SneakPositionTracker.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current sneak dialog
let currentSneakDialog = null;

/**
 * Dialog for previewing and applying Sneak action results
 */
export class SneakPreviewDialog extends BaseActionDialog {
  constructor(sneakingToken, outcomes, changes, sneakData, options = {}) {
    console.log('PF2E Visioner | SneakPreviewDialog constructor called with outcomes:', outcomes.map(o => ({
      tokenName: o.token?.name,
      hasPositionTransition: !!o.positionTransition,
      positionTransitionKeys: o.positionTransition ? Object.keys(o.positionTransition) : [],
      startCover: o.positionDisplay?.startPosition?.cover,
      endCover: o.positionDisplay?.endPosition?.cover
    })));
    
    super({
      id: `sneak-preview-${sneakingToken.id}`,
      title: `Sneak Results`,
      tag: 'form',
      window: {
        title: 'Sneak Results',
        icon: 'fas fa-user-ninja',
        resizable: true,
        positioned: true,
        minimizable: false,
      },
      position: {
        width: 850, // Increased width for position display components
        height: 'auto',
      },
      form: {
        handler: SneakPreviewDialog.formHandler,
        submitOnChange: false,
        closeOnSubmit: false,
      },
      classes: ['pf2e-visioner', 'sneak-preview-dialog', 'enhanced-position-tracking'],
      ...options,
    });

    this.sneakingToken = sneakingToken;
    this.outcomes = outcomes;
    // Preserve original outcomes so live toggles can re-filter from a stable list
    try {
      this._originalOutcomes = Array.isArray(outcomes) ? [...outcomes] : [];
    } catch (_) {
      this._originalOutcomes = outcomes || [];
    }
    this.changes = changes;
    this.sneakData = sneakData;
    // Ensure services can resolve the correct handler
    this.actionData = { ...(sneakData || {}), actor: sneakingToken, actionType: 'sneak' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'

    // Enhanced position tracking properties
    this.positionTracker = sneakPositionTracker;
    this._positionTransitions = new Map();
    this._hasPositionData = false;
    this._positionDisplayMode = 'enhanced'; // 'basic', 'enhanced', 'detailed'

    // Enhanced multi-target processing properties
    this.multiTargetProcessor = enhancedMultiTargetProcessor;
    this._processingProgress = null;
    this._isProcessingMultiTarget = false;
    this._multiTargetCache = new Map();

    // Set global reference
    currentSneakDialog = this;
  }

  static DEFAULT_OPTIONS = {
    actions: {
      applyChange: SneakPreviewDialog._onApplyChange,
      revertChange: SneakPreviewDialog._onRevertChange,
      applyAll: SneakPreviewDialog._onApplyAll,
      revertAll: SneakPreviewDialog._onRevertAll,
      toggleEncounterFilter: SneakPreviewDialog._onToggleEncounterFilter,
      overrideState: SneakPreviewDialog._onOverrideState,
      togglePositionDisplay: SneakPreviewDialog._onTogglePositionDisplay,
      showPositionDetails: SneakPreviewDialog._onShowPositionDetails,
      reprocessMultiTarget: SneakPreviewDialog._onReprocessMultiTarget,
      positionAwareOverride: SneakPreviewDialog._onPositionAwareOverride,
      resolveOverrideConflict: SneakPreviewDialog._onResolveOverrideConflict,
      toggleStartPosition: SneakPreviewDialog._onToggleStartPosition,
      toggleEndPosition: SneakPreviewDialog._onToggleEndPosition,
      setCoverBonus: SneakPreviewDialog._onSetCoverBonus,
      applyAllCover: SneakPreviewDialog._onApplyAllCover,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/sneak-preview.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Capture current end positions FIRST, before processing outcomes
    await this._captureCurrentEndPositions();

    // Start from original list if available so toggles can re-include allies
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];
    // Filter outcomes with base helper and ally filtering
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'token',
      'No encounter observers found, showing all',
    );
    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.sneakingToken,
        this.ignoreAllies,
        'token',
      );
    } catch (_) {}

    const cfg = (s) => this.visibilityConfig(s);

    // Extract position transition data from outcomes
    await this._extractPositionTransitions(filteredOutcomes);

    // Process outcomes to add additional properties including position data
    const processedOutcomes = filteredOutcomes.map((outcome) => {
      // Get current visibility state - how this observer sees the sneaking token
      const currentVisibility =
        getVisibilityBetween(outcome.token, this.sneakingToken) ||
        outcome.oldVisibility ||
        outcome.currentVisibility;

      // Prepare available states for override
      const desired = getDesiredOverrideStatesForAction('sneak');
      const availableStates = this.buildOverrideStates(desired, outcome);

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || currentVisibility;
      const hasActionableChange =
        baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

      // Get position transition data for this outcome
      const positionTransition = this._getPositionTransitionForToken(outcome.token);
      console.log('PF2E Visioner | Preparing position display for token:', outcome.token.name, 'positionTransition:', !!positionTransition);
      const positionDisplay = this._preparePositionDisplay(positionTransition, outcome.token, outcome);
      console.log('PF2E Visioner | Position display result for', outcome.token.name, ':', positionDisplay);

      return {
        ...outcome,
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        oldVisibilityState: cfg(baseOldState),
        newVisibilityState: cfg(effectiveNewState),
        marginText: this.formatMargin(outcome.margin),
        tokenImage: this.resolveTokenImage(outcome.token),
        availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
        // Enhanced position tracking data
        positionTransition,
        positionDisplay,
        hasPositionData: !!positionTransition,
        positionQuality: positionTransition
          ? this._assessPositionQuality(positionTransition.endPosition)
          : 'unknown',
        positionChangeType: positionTransition?.transitionType || 'unchanged',
        positionImpactSummary: this._generatePositionImpactSummary(positionTransition, outcome),
        // Cover bonus and roll data
        baseRollTotal: outcome.rollTotal, // Store original roll total
        appliedCoverBonus: typeof outcome.appliedCoverBonus !== 'undefined' ? outcome.appliedCoverBonus : 0, // Track applied cover bonus (default to 0)
      };
    });

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
      }
    });

    // Set sneaker context for template (like Seek dialog)
    context.sneaker = {
      name: this.sneakingToken.name,
      image: this.resolveTokenImage(this.sneakingToken),
      actionType: 'sneak',
      actionLabel: 'Enhanced sneak action results with position tracking',
    };

    context.sneakingToken = this.sneakingToken;
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;

    // Enhanced context with position tracking data
    context.hasPositionData = this._hasPositionData;
    context.positionDisplayMode = this._positionDisplayMode;
    context.positionSummary = this._generatePositionSummary(processedOutcomes);

    // DEBUG: Log the complete template context
    console.log('PF2E Visioner | Template context being passed to sneak-preview.hbs:', {
      outcomesCount: context.outcomes.length,
      hasPositionData: context.hasPositionData,
      firstOutcome: context.outcomes[0] ? {
        hasPositionDisplay: !!context.outcomes[0].positionDisplay,
        positionDisplay: context.outcomes[0].positionDisplay
      } : null
    });

    // Preserve original outcomes separate from processed
    this.outcomes = processedOutcomes;

    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
  }

  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
    return html;
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    return content;
  }

  getAvailableStates() {
    return [
      { value: 'observed', label: 'Observed', icon: 'fas fa-eye' },
      { value: 'hidden', label: 'Hidden', icon: 'fas fa-eye-slash' },
      { value: 'undetected', label: 'Undetected', icon: 'fas fa-ghost' },
    ];
  }

  // Use BaseActionDialog outcome helpers
  // Token id in Sneak outcomes is under `token`
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? null;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.updateBulkActionButtons();
    this.markInitialSelections();

    // Apply enhanced visual feedback
    this._applyEnhancedVisualFeedback();

    // Setup accessibility features
    this._setupAccessibilityFeatures();

    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb)
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute outcomes and preserve overrides before re-rendering
          this.getFilteredOutcomes?.()
            .then((list) => {
              if (Array.isArray(list)) this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
    } catch (_) {}
  }

  /**
   * Applies enhanced visual feedback to the dialog
   * @private
   */
  _applyEnhancedVisualFeedback() {
    try {
      // Apply result-based row styling
      const rows = this.element.querySelectorAll('.token-row[data-result-type]');
      rows.forEach((row) => {
        const resultType = row.dataset.resultType;
        const outcomeCell = row.querySelector('.outcome');

        // Add enhanced styling classes
        if (outcomeCell) {
          outcomeCell.classList.add(`sneak-result-${resultType}`);
        }

        // Add colorblind-friendly patterns if enabled
        try {
          if (game.settings.get('pf2e-visioner', 'colorblindSupport')) {
            row.classList.add('colorblind-patterns');
          }
        } catch (error) {
          // Setting not registered, skip colorblind support
          console.debug('PF2E Visioner | colorblindSupport setting not available');
        }

        // Add symbol indicators if enabled
        try {
          const colorblindMode = game.settings.get('pf2e-visioner', 'colorblindMode');
          if (colorblindMode && colorblindMode !== 'none') {
            row.classList.add('colorblind-symbols');
          }
        } catch (settingError) {
          console.debug('PF2E Visioner | colorblind settings not available:', settingError);
        }
      });

      // Enhance position transition displays
      const positionDisplays = this.element.querySelectorAll('.position-transition-display');
      positionDisplays.forEach((display) => {
        const summary = display.querySelector('.position-change-summary');
        if (summary) {
          // Add animation class for new changes
          summary.classList.add('animating');
          setTimeout(() => {
            summary.classList.remove('animating');
          }, 600);
        }
      });

      // Setup enhanced tooltips
      this._setupEnhancedTooltips();
    } catch (error) {
      console.warn('PF2E Visioner | Failed to apply enhanced visual feedback:', error);
    }
  }

  /**
   * Sets up accessibility features for the dialog
   * @private
   */
  _setupAccessibilityFeatures() {
    try {
      // Add keyboard navigation support
      const focusableElements = this.element.querySelectorAll(
        'button, .state-icon, .position-details-btn, input, select',
      );

      focusableElements.forEach((element, index) => {
        element.setAttribute('tabindex', index === 0 ? '0' : '-1');

        element.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            const nextIndex = (index + 1) % focusableElements.length;
            focusableElements[nextIndex].focus();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const prevIndex = (index - 1 + focusableElements.length) % focusableElements.length;
            focusableElements[prevIndex].focus();
          }
        });
      });

      // Add ARIA labels for screen readers
      const table = this.element.querySelector('.sneak-results-table');
      if (table) {
        table.setAttribute('role', 'table');
        table.setAttribute('aria-label', 'Sneak action results');

        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
          header.setAttribute('id', `sneak-header-${index}`);
        });

        const cells = table.querySelectorAll('td');
        cells.forEach((cell, index) => {
          const headerIndex = index % headers.length;
          cell.setAttribute('headers', `sneak-header-${headerIndex}`);
        });
      }

      // Add live region for dynamic updates
      if (!this.element.querySelector('.sr-live-region')) {
        const liveRegion = document.createElement('div');
        liveRegion.className = 'sr-only sr-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        this.element.appendChild(liveRegion);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to setup accessibility features:', error);
    }
  }

  /**
   * Sets up enhanced tooltips with detailed information
   * @private
   */
  _setupEnhancedTooltips() {
    try {
      const elementsWithEnhancedTooltips = this.element.querySelectorAll('[data-tooltip-enhanced]');

      elementsWithEnhancedTooltips.forEach((element) => {
        const tooltipData = element.dataset.tooltipEnhanced;
        const parts = tooltipData.split('|');
        const header = parts[0];
        const sections = parts.slice(1);

        // Create enhanced tooltip content
        let tooltipContent = `<div class="enhanced-tooltip">`;
        if (header) {
          tooltipContent += `<div class="tooltip-header">${header}</div>`;
        }

        sections.forEach((section) => {
          tooltipContent += `<div class="tooltip-section">${section}</div>`;
        });

        tooltipContent += `</div>`;

        // Replace the standard tooltip with enhanced version
        element.removeAttribute('data-tooltip');
        element.setAttribute('data-tooltip-html', tooltipContent);
      });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to setup enhanced tooltips:', error);
    }
  }

  /**
   * Announces changes to screen readers
   * @param {string} message - Message to announce
   * @private
   */
  _announceToScreenReader(message) {
    try {
      const liveRegion = this.element.querySelector('.sr-live-region');
      if (liveRegion) {
        liveRegion.textContent = message;

        // Clear after a delay to allow for new announcements
        setTimeout(() => {
          liveRegion.textContent = '';
        }, 1000);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to announce to screen reader:', error);
    }
  }

  /**
   * Applies feedback animation to an element
   * @param {HTMLElement} element - Element to animate
   * @param {string} type - Animation type ('success', 'error', 'loading')
   * @param {number} duration - Animation duration in milliseconds
   * @private
   */
  _applyFeedbackAnimation(element, type, duration = 600) {
    try {
      if (!element) return;

      // Remove existing feedback classes
      element.classList.remove('feedback-success', 'feedback-error', 'loading');

      // Add new feedback class
      if (type === 'loading') {
        element.classList.add('loading');
      } else {
        element.classList.add(`feedback-${type}`);

        // Remove class after animation completes
        setTimeout(() => {
          element.classList.remove(`feedback-${type}`);
        }, duration);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to apply feedback animation:', error);
    }
  }

  /**
   * Provides haptic feedback for supported devices
   * @param {string} type - Feedback type ('light', 'medium', 'heavy')
   * @private
   */
  _provideHapticFeedback(type = 'light') {
    try {
      if (navigator.vibrate) {
        const patterns = {
          light: [10],
          medium: [20],
          heavy: [30, 10, 30],
        };
        navigator.vibrate(patterns[type] || patterns.light);
      }
    } catch (error) {
      // Haptic feedback is optional, fail silently
    }
  }

  /**
   * Updates visual feedback for bulk operations
   * @param {string} operation - Operation type ('apply', 'revert')
   * @param {boolean} success - Whether operation was successful
   * @private
   */
  _updateBulkOperationFeedback(operation, success) {
    try {
      const bulkButtons = this.element.querySelectorAll('.bulk-action-btn');
      const feedbackType = success ? 'success' : 'error';

      bulkButtons.forEach((button) => {
        this._applyFeedbackAnimation(button, feedbackType);
      });

      // Provide haptic feedback
      this._provideHapticFeedback(success ? 'light' : 'medium');

      // Update button states
      this.updateBulkActionButtons();

      // Announce to screen readers
      const message = success
        ? `Bulk ${operation} operation completed successfully`
        : `Bulk ${operation} operation failed`;
      this._announceToScreenReader(message);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update bulk operation feedback:', error);
    }
  }

  // Use BaseActionDialog.markInitialSelections

  // Selection highlight handled by BasePreviewDialog

  // Use BaseActionDialog.addIconClickHandlers

  _onOverrideState(event, { tokenId, state }) {
    // Find the outcome for this token
    const outcome = this.outcomes.find((o) => o.token.id === tokenId);
    if (!outcome) return;

    // Update the override state
    outcome.overrideState = state;

    // Update visual selection
    const container = this.element.querySelector(`.override-icons[data-token-id="${tokenId}"]`);
    if (container) {
      container.querySelectorAll('.state-icon').forEach((icon) => {
        icon.classList.remove('selected');
        if (icon.dataset.state === state) {
          icon.classList.add('selected');
        }
      });
    }

    // Update hidden input
    const hiddenInput = this.element.querySelector(`input[name="override.${tokenId}"]`);
    if (hiddenInput) {
      hiddenInput.value = state;
    }

    // Update visual selection
    const row = event.currentTarget.closest('tr');
    const icons = row.querySelectorAll('.override-icons .state-icon');
    icons.forEach((i) => i.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    // Enable the Apply button only if there's actually a change
    const applyButton = row.querySelector('.apply-change');
    if (applyButton) {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const hasChange = effectiveNewState !== outcome.oldVisibility;
      applyButton.disabled = !hasChange;
    }

    // Update actionable change status and buttons
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    outcome.hasActionableChange = effectiveNewState !== outcome.oldVisibility;
    this.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);

    // Update position-aware indicators if position data is available
    this._updatePositionAwareIndicators(tokenId, state, outcome);

    // Enhanced visual feedback for state change
    this._applyStateChangeVisualFeedback(row, state, outcome);

    // Announce change to screen readers
    const tokenName = outcome.token.name;
    const stateLabel = this._getVisibilityLabel(state);
    this._announceToScreenReader(`${tokenName} visibility changed to ${stateLabel}`);
  }

  /**
   * Applies visual feedback for state changes
   * @param {HTMLElement} row - The table row element
   * @param {string} state - The new visibility state
   * @param {Object} outcome - The outcome data
   * @private
   */
  _applyStateChangeVisualFeedback(row, state, outcome) {
    try {
      // Remove existing result classes
      row.classList.remove(
        'result-success',
        'result-failure',
        'result-critical-success',
        'result-critical-failure',
      );

      // Determine new result type based on override
      let newResultType = 'failure'; // Default assumption

      // If we have position data, we can make a better determination
      if (outcome.hasPositionData && outcome.positionTransition) {
        const impact = this._calculateStateChangeImpact(outcome.positionTransition, state);
        if (impact.class.includes('excellent') || impact.class.includes('good')) {
          newResultType = 'success';
        }
      } else {
        // Simple heuristic: hidden/undetected are generally successful
        if (state === 'hidden' || state === 'undetected') {
          newResultType = 'success';
        }
      }

      // Apply new result class
      row.classList.add(`result-${newResultType}`);
      row.dataset.resultType = newResultType;

      // Update outcome cell styling
      const outcomeCell = row.querySelector('.outcome');
      if (outcomeCell) {
        outcomeCell.classList.remove('success', 'failure', 'critical-success', 'critical-failure');
        outcomeCell.classList.add(newResultType);

        // Add enhanced styling
        outcomeCell.classList.remove(
          'sneak-result-success',
          'sneak-result-failure',
          'sneak-result-critical-success',
          'sneak-result-critical-failure',
        );
        outcomeCell.classList.add(`sneak-result-${newResultType}`);
      }

      // Add temporary highlight animation
      row.style.transition = 'all 0.3s ease';
      row.style.transform = 'scale(1.02)';
      row.style.boxShadow = '0 4px 12px rgba(255, 193, 7, 0.3)';

      setTimeout(() => {
        row.style.transform = '';
        row.style.boxShadow = '';
      }, 300);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to apply state change visual feedback:', error);
    }
  }

  /**
   * Captures current end positions for all observer tokens in real-time
   * This provides fresh position data without relying on complex tracking systems
   * @private
   */
  async _captureCurrentEndPositions() {
    if (!this.outcomes?.length || !this.sneakingToken) return;

    console.debug('PF2E Visioner | Capturing current end positions for dialog');

    try {
      for (const outcome of this.outcomes) {
        if (!outcome.token?.document?.id) continue;

        try {
          // Capture current position state for this observer token
          const currentEndPosition = await this.positionTracker._capturePositionState(
            this.sneakingToken,
            outcome.token,
            Date.now(),
            { forceFresh: true, useCurrentPositionForCover: true }
          );

          // Update the outcome with fresh end position data
          if (currentEndPosition) {
            outcome.endCover = currentEndPosition.coverState;
            outcome.endVisibility = currentEndPosition.avsVisibility;
            console.debug('PF2E Visioner | Updated end position for', outcome.token.name, {
              endCover: outcome.endCover,
              endVisibility: outcome.endVisibility
            });
          }
        } catch (error) {
          console.warn('PF2E Visioner | Failed to capture current end position for', outcome.token.name, error);
        }
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to capture current end positions', error);
    }
  }

  /**
   * Extracts position transition data from outcomes
   * @param {Array} outcomes - Array of outcome objects
   * @private
   */
  async _extractPositionTransitions(outcomes) {
    this._positionTransitions.clear();
    this._hasPositionData = false;

    console.debug(
      'PF2E Visioner | Extracting position transitions from',
      outcomes.length,
      'outcomes',
    );

    for (const outcome of outcomes) {
      console.debug('PF2E Visioner | Outcome for', outcome.token?.name, ':', {
        hasPositionTransition: !!outcome.positionTransition,
        hasStartPosition: !!outcome.startPosition,
        hasEndPosition: !!outcome.endPosition,
        hasPositionData: !!outcome.enhancedAnalysis?.hasPositionData,
      });

      if (outcome.positionTransition) {
        this._positionTransitions.set(outcome.token.id, outcome.positionTransition);
        this._hasPositionData = true;
        console.debug('PF2E Visioner | Added position transition for', outcome.token.name);
      }
    }

    console.debug('PF2E Visioner | Position extraction complete. Has data:', this._hasPositionData);
  }

  /**
   * Gets position transition data for a specific token
   * @param {Token} token - The token to get position data for
   * @returns {PositionTransition|null} Position transition data or null
   * @private
   */
  _getPositionTransitionForToken(token) {
    if (!token?.id) return null;
    return this._positionTransitions.get(token.id) || null;
  }

  /**
   * Prepares position display data for template rendering
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @param {Token} observerToken - The observer token
   * @param {Object} outcome - The sneak outcome data
   * @returns {Object|null} Position display data
   * @private
   */
  _preparePositionDisplay(positionTransition, observerToken, outcome) {
    if (!positionTransition) return null;

    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    const result = {
      hasChanged: positionTransition.hasChanged,
      transitionType: positionTransition.transitionType,
      transitionClass: this._getTransitionClass(positionTransition.transitionType),
      transitionIcon: this._getTransitionIcon(positionTransition.transitionType),

      // Start position display
      startPosition: {
        visibility: startPos.avsVisibility,
        visibilityLabel: this._getVisibilityLabel(startPos.avsVisibility),
        visibilityIcon: this._getVisibilityIcon(startPos.avsVisibility),
        visibilityClass: this._getVisibilityClass(startPos.avsVisibility),
        cover: startPos.coverState,
        coverLabel: this._getCoverLabel(startPos.coverState),
        coverIcon: this._getCoverIcon(startPos.coverState),
        coverClass: this._getCoverClass(startPos.coverState),
        stealthBonus: startPos.stealthBonus,
        distance: Math.round(startPos.distance),
        lighting: startPos.lightingConditions,
        lightingLabel: this._getLightingLabel(startPos.lightingConditions),
        lightingIcon: this._getLightingIcon(startPos.lightingConditions),
        qualifies: this._startPositionQualifiesForSneak(observerToken, outcome),
      },

      // End position display
      endPosition: {
        visibility: endPos.avsVisibility,
        visibilityLabel: this._getVisibilityLabel(endPos.avsVisibility),
        visibilityIcon: this._getVisibilityIcon(endPos.avsVisibility),
        visibilityClass: this._getVisibilityClass(endPos.avsVisibility),
        cover: endPos.coverState,
        coverLabel: this._getCoverLabel(endPos.coverState),
        coverIcon: this._getCoverIcon(endPos.coverState),
        coverClass: this._getCoverClass(endPos.coverState),
        stealthBonus: endPos.stealthBonus,
        distance: Math.round(endPos.distance),
        lighting: endPos.lightingConditions,
        lightingLabel: this._getLightingLabel(endPos.lightingConditions),
        lightingIcon: this._getLightingIcon(endPos.lightingConditions),
        qualifies: this._endPositionQualifiesForSneak(observerToken, outcome),
      },

      // Change indicators
      changes: {
        visibility: positionTransition.avsVisibilityChanged,
        cover: positionTransition.coverStateChanged,
        stealthBonus: positionTransition.stealthBonusChange,
        distance: Math.round(endPos.distance - startPos.distance),
        lighting: startPos.lightingConditions !== endPos.lightingConditions,
      },

      // Impact summary
      impact: {
        dcModification: positionTransition.impactOnDC || 0,
        stealthBonusChange: positionTransition.stealthBonusChange || 0,
        overallImpact: this._calculateOverallImpact(positionTransition),
        impactClass: this._getImpactClass(positionTransition),
        impactIcon: this._getImpactIcon(positionTransition),
      },
    };

    // Debug logging for icon data
    console.log('PF2E Visioner | Position display prepared:', {
      startVisibility: result.startPosition.visibility,
      startVisibilityIcon: result.startPosition.visibilityIcon,
      startCover: result.startPosition.cover,
      startCoverIcon: result.startPosition.coverIcon,
      endVisibility: result.endPosition.visibility,
      endVisibilityIcon: result.endPosition.visibilityIcon,
      endCover: result.endPosition.cover,
      endCoverIcon: result.endPosition.coverIcon
    });

    return result;
  }

  /**
   * Assesses the quality of a position for stealth purposes
   * @param {PositionState} position - Position state to assess
   * @returns {string} Quality assessment ('excellent', 'good', 'fair', 'poor')
   * @private
   */
  _assessPositionQuality(position) {
    if (!position) return 'unknown';

    let score = 0;

    // Visibility contribution
    switch (position.avsVisibility) {
      case 'undetected':
        score += 4;
        break;
      case 'hidden':
        score += 3;
        break;
      case 'concealed':
        score += 2;
        break;
      case 'observed':
        score += 0;
        break;
    }

    // Cover contribution
    switch (position.coverState) {
      case 'greater':
        score += 3;
        break;
      case 'standard':
        score += 2;
        break;
      case 'lesser':
        score += 1;
        break;
      case 'none':
        score += 0;
        break;
    }

    // Lighting contribution
    switch (position.lightingConditions) {
      case 'darkness':
        score += 2;
        break;
      case 'dim':
        score += 1;
        break;
      case 'bright':
        score += 0;
        break;
    }

    // Distance contribution (farther is generally better for stealth)
    if (position.distance > 60) score += 2;
    else if (position.distance > 30) score += 1;

    // Convert score to quality rating
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'fair';
    if (score >= 2) return 'poor';
    return 'terrible';
  }

  // ===== Enhanced Visual Feedback Helper Functions =====

  /**
   * Gets the CSS class for a transition type
   * @param {string} transitionType - The transition type ('improved', 'worsened', 'unchanged')
   * @returns {string} CSS class name
   * @private
   */
  _getTransitionClass(transitionType) {
    switch (transitionType) {
      case 'improved':
        return 'position-improved';
      case 'worsened':
        return 'position-worsened';
      case 'unchanged':
        return 'position-unchanged';
      default:
        return 'position-unknown';
    }
  }

  /**
   * Gets the icon for a transition type
   * @param {string} transitionType - The transition type
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getTransitionIcon(transitionType) {
    switch (transitionType) {
      case 'improved':
        return 'fas fa-arrow-up';
      case 'worsened':
        return 'fas fa-arrow-down';
      case 'unchanged':
        return 'fas fa-equals';
      default:
        return 'fas fa-question';
    }
  }

  /**
   * Gets the label for a visibility state
   * @param {string} visibility - The visibility state
   * @returns {string} Human-readable label
   * @private
   */
  _getVisibilityLabel(visibility) {
    switch (visibility) {
      case 'observed':
        return 'Observed';
      case 'concealed':
        return 'Concealed';
      case 'hidden':
        return 'Hidden';
      case 'undetected':
        return 'Undetected';
      default:
        return visibility || 'Unknown';
    }
  }

  /**
   * Determines if start position qualifies for sneaking
   * Start position: Check if sneaker is hidden from the observer AT THE START POSITION
   * @param {Object} observerToken - The token observing the sneaker
   * @param {Object} outcome - The sneak outcome data containing roll information
   * @returns {boolean} True if start position qualifies for sneak
   * @private
   */
  _startPositionQualifiesForSneak(observerToken, outcome) {
    if (!observerToken || !this.sneakingToken) return false;
    
    try {
      // Get the position transition data for this observer
      const positionTransition = this._getPositionTransitionForToken(observerToken);
      if (positionTransition && positionTransition.startPosition) {
        // Use the actual start position visibility data
        const startVisibility = positionTransition.startPosition.avsVisibility;
        
        // Start position qualifies if sneaker is hidden from observer at START position
        return startVisibility === 'hidden' || startVisibility === 'undetected';
      }

      console.debug('PF2E Visioner | No start position data available, using outcome start state');
      
      // Fallback: Use outcome start state data when position tracking is not available
      if (outcome && (outcome.startVisibility || outcome.startState)) {
        const startVisibility = outcome.startVisibility || outcome.startState?.visibility;
        return startVisibility === 'hidden' || startVisibility === 'undetected';
      }

      // Final fallback to current visibility check if no position or outcome data available
      const { getVisibilityBetween } = game.modules.get('pf2e-visioner')?.api || {};
      if (!getVisibilityBetween) return false;
      const visibility = getVisibilityBetween(this.sneakingToken, observerToken);
      return visibility === 'hidden' || visibility === 'undetected';
    } catch (error) {
      console.warn('PF2E Visioner | Error checking start position qualification:', error);
      return false;
    }
  }

  /**
   * Determines if end position qualifies for sneaking
   * End position: Check if sneaker has cover (auto/manual) or is concealed AT THE END POSITION
   * @param {Object} observerToken - The token observing the sneaker
   * @param {Object} outcome - The sneak outcome data containing roll information
   * @returns {boolean} True if end position qualifies for sneak
   * @private
   */
  _endPositionQualifiesForSneak(observerToken, outcome) {
    if (!observerToken || !this.sneakingToken) return false;
    
    try {
      console.debug('PF2E Visioner | _endPositionQualifiesForSneak called for:', observerToken.name, {
        endCover: outcome?.endCover,
        endVisibility: outcome?.endVisibility,
        newVisibility: outcome?.newVisibility
      });
      
      // Get the position transition data for this observer
      const positionTransition = this._getPositionTransitionForToken(observerToken);
      console.debug('PF2E Visioner | Position transition check:', {
        hasPositionTransition: !!positionTransition,
        hasEndPosition: !!positionTransition?.endPosition,
        endPositionCoverState: positionTransition?.endPosition?.coverState
      });
      
      // Priority: Use fresh outcome data if available (from _captureCurrentEndPositions), 
      // otherwise fall back to position transition data
      if (outcome && (outcome.endCover || outcome.endVisibility)) {
        console.debug('PF2E Visioner | Using fresh outcome data (priority over position transition)');
        
        // Check if end cover indicates cover was detected
        if (outcome.endCover && outcome.endCover !== 'none') {
          console.debug('PF2E Visioner | End position qualifies - cover detected in outcome:', outcome.endCover);
          return true;
        }

        // Check outcome end visibility states
        if (outcome.endVisibility === 'concealed' || 
            outcome.endVisibility === 'hidden' || 
            outcome.endVisibility === 'undetected') {
          console.debug('PF2E Visioner | End position qualifies - favorable end visibility state:', outcome.endVisibility);
          return true;
        }
        
        console.debug('PF2E Visioner | End position does not qualify based on outcome data');
        return false;
      }
      
      if (positionTransition && positionTransition.endPosition) {
        console.debug('PF2E Visioner | Using position transition data (no fresh outcome data available)');
        // Use the actual end position data
        const endPosition = positionTransition.endPosition;
        
        // Check if sneaker has cover at end position
        if (endPosition.coverState && endPosition.coverState !== 'none') {
          return true;
        }
        
        // Check if concealed or better at end position
        const endVisibility = endPosition.avsVisibility;
        if (endVisibility === 'concealed' || endVisibility === 'hidden' || endVisibility === 'undetected') {
          return true;
        }
        
        return false;
      }

      console.debug('PF2E Visioner | No position transition or outcome data available, using fallback');

      // Final fallback to current position check if no position or outcome data available
      console.debug('PF2E Visioner | No end position data available, falling back to current position check');
      const { getCoverBetween, getVisibilityBetween } = game.modules.get('pf2e-visioner')?.api || {};
      if (!getCoverBetween || !getVisibilityBetween) return false;
      
      // Check for manual or auto cover
      const coverState = getCoverBetween(this.sneakingToken, observerToken);
      if (coverState && coverState !== 'none') return true;
      
      // Check if concealed or better
      const visibility = getVisibilityBetween(this.sneakingToken, observerToken);
      return visibility === 'concealed' || visibility === 'hidden' || visibility === 'undetected';
    } catch (error) {
      console.warn('PF2E Visioner | Error checking end position qualification:', error);
      return false;
    }
  }

  /**
   * Gets the icon for a visibility state
   * @param {string} visibility - The visibility state
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getVisibilityIcon(visibility) {
    switch (visibility) {
      case 'observed':
        return 'fas fa-eye';
      case 'concealed':
        return 'fas fa-eye-slash';
      case 'hidden':
        return 'fas fa-user-secret';
      case 'undetected':
        return 'fas fa-ghost';
      default:
        return 'fas fa-question-circle';
    }
  }

  /**
   * Gets the CSS class for a visibility state
   * @param {string} visibility - The visibility state
   * @returns {string} CSS class name
   * @private
   */
  _getVisibilityClass(visibility) {
    switch (visibility) {
      case 'observed':
        return 'visibility-observed';
      case 'concealed':
        return 'visibility-concealed';
      case 'hidden':
        return 'visibility-hidden';
      case 'undetected':
        return 'visibility-undetected';
      default:
        return 'visibility-unknown';
    }
  }

  /**
   * Gets the label for a cover state
   * @param {string} cover - The cover state
   * @returns {string} Human-readable label
   * @private
   */
  _getCoverLabel(cover) {
    switch (cover) {
      case 'none':
        return 'No Cover';
      case 'lesser':
        return 'Lesser Cover';
      case 'standard':
        return 'Standard Cover';
      case 'greater':
        return 'Greater Cover';
      default:
        return cover || 'Unknown';
    }
  }

  /**
   * Gets the icon for a cover state
   * @param {string} cover - The cover state
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getCoverIcon(cover) {
    switch (cover) {
      case 'none':
        return 'fas fa-shield-slash';
      case 'lesser':
        return 'fas fa-shield-alt';
      case 'standard':
        return 'fas fa-shield';
      case 'greater':
        return 'fas fa-shield-check';
      default:
        return 'fas fa-question-circle';
    }
  }

  /**
   * Gets the CSS class for a cover state
   * @param {string} cover - The cover state
   * @returns {string} CSS class name
   * @private
   */
  _getCoverClass(cover) {
    switch (cover) {
      case 'none':
        return 'cover-none';
      case 'lesser':
        return 'cover-lesser';
      case 'standard':
        return 'cover-standard';
      case 'greater':
        return 'cover-greater';
      default:
        return 'cover-unknown';
    }
  }

  /**
   * Gets the label for lighting conditions
   * @param {string} lighting - The lighting condition
   * @returns {string} Human-readable label
   * @private
   */
  _getLightingLabel(lighting) {
    switch (lighting) {
      case 'bright':
        return 'Bright Light';
      case 'dim':
        return 'Dim Light';
      case 'darkness':
        return 'Darkness';
      default:
        return lighting || 'Unknown';
    }
  }

  /**
   * Gets the icon for lighting conditions
   * @param {string} lighting - The lighting condition
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getLightingIcon(lighting) {
    switch (lighting) {
      case 'bright':
        return 'fas fa-sun';
      case 'dim':
        return 'fas fa-adjust';
      case 'darkness':
        return 'fas fa-moon';
      default:
        return 'fas fa-question-circle';
    }
  }

  /**
   * Calculates the overall impact of a position transition
   * @param {PositionTransition} positionTransition - Position transition data
   * @returns {string} Overall impact assessment
   * @private
   */
  _calculateOverallImpact(positionTransition) {
    if (!positionTransition) return 'neutral';

    let impactScore = 0;

    // Factor in DC impact
    if (positionTransition.impactOnDC > 0) impactScore += 2;
    else if (positionTransition.impactOnDC < 0) impactScore -= 2;

    // Factor in stealth bonus change
    if (positionTransition.stealthBonusChange > 0) impactScore += 1;
    else if (positionTransition.stealthBonusChange < 0) impactScore -= 1;

    // Factor in visibility change
    if (positionTransition.avsVisibilityChanged) {
      const startVis = positionTransition.startPosition.avsVisibility;
      const endVis = positionTransition.endPosition.avsVisibility;
      const visibilityOrder = ['observed', 'concealed', 'hidden', 'undetected'];
      const startIndex = visibilityOrder.indexOf(startVis);
      const endIndex = visibilityOrder.indexOf(endVis);

      if (endIndex > startIndex)
        impactScore += 1; // Better visibility
      else if (endIndex < startIndex) impactScore -= 1; // Worse visibility
    }

    // Factor in cover change
    if (positionTransition.coverStateChanged) {
      const startCover = positionTransition.startPosition.coverState;
      const endCover = positionTransition.endPosition.coverState;
      const coverOrder = ['none', 'lesser', 'standard', 'greater'];
      const startIndex = coverOrder.indexOf(startCover);
      const endIndex = coverOrder.indexOf(endCover);

      if (endIndex > startIndex)
        impactScore += 1; // Better cover
      else if (endIndex < startIndex) impactScore -= 1; // Worse cover
    }

    if (impactScore >= 3) return 'major-positive';
    if (impactScore >= 1) return 'positive';
    if (impactScore <= -3) return 'major-negative';
    if (impactScore <= -1) return 'negative';
    return 'neutral';
  }

  /**
   * Gets the CSS class for impact assessment
   * @param {PositionTransition} positionTransition - Position transition data
   * @returns {string} CSS class name
   * @private
   */
  _getImpactClass(positionTransition) {
    const impact = this._calculateOverallImpact(positionTransition);
    switch (impact) {
      case 'major-positive':
        return 'impact-major-positive';
      case 'positive':
        return 'impact-positive';
      case 'major-negative':
        return 'impact-major-negative';
      case 'negative':
        return 'impact-negative';
      case 'neutral':
        return 'impact-neutral';
      default:
        return 'impact-unknown';
    }
  }

  /**
   * Gets the icon for impact assessment
   * @param {PositionTransition} positionTransition - Position transition data
   * @returns {string} Font Awesome icon class
   * @private
   */
  _getImpactIcon(positionTransition) {
    const impact = this._calculateOverallImpact(positionTransition);
    switch (impact) {
      case 'major-positive':
        return 'fas fa-chevron-double-up';
      case 'positive':
        return 'fas fa-chevron-up';
      case 'major-negative':
        return 'fas fa-chevron-double-down';
      case 'negative':
        return 'fas fa-chevron-down';
      case 'neutral':
        return 'fas fa-minus';
      default:
        return 'fas fa-question';
    }
  }

  /**
   * Gets recommendation for a specific state based on outcome data
   * @param {Object} recommendations - Recommendation data
   * @param {string} state - The visibility state
   * @returns {string} Recommendation text
   * @private
   */
  _getRecommendationForState(recommendations, state) {
    if (!recommendations || !recommendations.alternatives) return '';

    // Find recommendation that matches the state
    const stateRecommendation = recommendations.alternatives.find((alt) =>
      alt.toLowerCase().includes(state.toLowerCase()),
    );

    return stateRecommendation || recommendations.nextAction || '';
  }

  /**
   * Generates a position impact summary for display
   * @param {PositionTransition|null} positionTransition - Position transition data
   * @param {Object} outcome - Outcome data
   * @returns {string} Impact summary text
   * @private
   */
  _generatePositionImpactSummary(positionTransition, outcome) {
    if (!positionTransition) return 'No position data available';

    const parts = [];

    if (positionTransition.transitionType === 'improved') {
      parts.push('Position improved');
    } else if (positionTransition.transitionType === 'worsened') {
      parts.push('Position worsened');
    } else {
      parts.push('Position unchanged');
    }

    if (positionTransition.stealthBonusChange > 0) {
      parts.push(`+${positionTransition.stealthBonusChange} stealth`);
    } else if (positionTransition.stealthBonusChange < 0) {
      parts.push(`${positionTransition.stealthBonusChange} stealth`);
    }

    if (positionTransition.impactOnDC !== 0) {
      const direction = positionTransition.impactOnDC > 0 ? 'harder' : 'easier';
      parts.push(`DC ${direction}`);
    }

    return parts.join(', ') || 'No significant impact';
  }

  /**
   * Generates an overall position summary for the dialog
   * @param {Array} processedOutcomes - Array of processed outcomes with position data
   * @returns {Object} Position summary data
   * @private
   */
  _generatePositionSummary(processedOutcomes) {
    const withPositionData = processedOutcomes.filter((o) => o.hasPositionData);

    if (withPositionData.length === 0) {
      return {
        hasData: false,
        message: 'No position tracking data available for this sneak attempt',
      };
    }

    const improved = withPositionData.filter((o) => o.positionChangeType === 'improved').length;
    const worsened = withPositionData.filter((o) => o.positionChangeType === 'worsened').length;
    const unchanged = withPositionData.filter((o) => o.positionChangeType === 'unchanged').length;

    let summaryText = `Position tracking: ${withPositionData.length} observers analyzed`;

    if (improved > 0) summaryText += `, ${improved} improved`;
    if (worsened > 0) summaryText += `, ${worsened} worsened`;
    if (unchanged > 0) summaryText += `, ${unchanged} unchanged`;

    return {
      hasData: true,
      message: summaryText,
      improved,
      worsened,
      unchanged,
      total: withPositionData.length,
    };
  }

  /**
   * Updates position-aware indicators when override state changes
   * @param {string} tokenId - Token ID
   * @param {string} newState - New override state
   * @param {Object} outcome - Outcome data
   * @private
   */
  _updatePositionAwareIndicators(tokenId, newState, outcome) {
    if (!outcome.hasPositionData) return;

    const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (!row) return;

    // Update position impact indicators based on new state
    const positionIndicator = row.querySelector('.position-impact-indicator');
    if (positionIndicator) {
      const impact = this._calculateStateChangeImpact(outcome.positionTransition, newState);
      positionIndicator.className = `position-impact-indicator ${impact.class}`;
      positionIndicator.title = impact.tooltip;
    }

    // Update recommendation text if available
    const recommendationElement = row.querySelector('.position-recommendation');
    if (recommendationElement && outcome.recommendations) {
      const recommendation = this._getRecommendationForState(outcome.recommendations, newState);
      recommendationElement.textContent = recommendation;
    }
  }

  /**
   * Processes outcomes using enhanced multi-target processor
   * @param {Array<Token>} targets - Array of target tokens
   * @param {Object} actionData - Action data
   * @returns {Promise<Array<Object>>} Enhanced outcomes
   */
  async processOutcomesEnhanced(targets, actionData) {
    if (this._isProcessingMultiTarget) {
      console.warn('PF2E Visioner | Multi-target processing already in progress');
      return this.outcomes || [];
    }

    this._isProcessingMultiTarget = true;

    try {
      // Show progress indicator
      this._showProcessingProgress(targets.length);

      // Use enhanced multi-target processor
      const enhancedOutcomes = await this.multiTargetProcessor.processMultipleTargets(
        this.sneakingToken,
        targets,
        actionData,
        {
          progressCallback: (progress) => this._updateProcessingProgress(progress),
          useCache: true,
          batchSize: Math.min(10, Math.max(5, Math.floor(targets.length / 4))), // Dynamic batch size
          enableParallelProcessing: targets.length > 5, // Use parallel processing for larger groups
        },
      );

      // Cache results for potential reuse
      this._cacheMultiTargetResults(targets, enhancedOutcomes);

      // Hide progress indicator
      this._hideProcessingProgress();

      return enhancedOutcomes;
    } catch (error) {
      console.error('PF2E Visioner | Enhanced multi-target processing failed in dialog:', error);

      // Hide progress indicator and show error
      this._hideProcessingProgress();
      this._showProcessingError(error.message);

      // Return original outcomes as fallback
      return this.outcomes || [];
    } finally {
      this._isProcessingMultiTarget = false;
    }
  }

  /**
   * Shows processing progress indicator
   * @param {number} totalTargets - Total number of targets being processed
   * @private
   */
  _showProcessingProgress(totalTargets) {
    try {
      // Create or update progress element in dialog
      let progressElement = this.element.querySelector('.multi-target-progress');

      if (!progressElement) {
        progressElement = document.createElement('div');
        progressElement.className = 'multi-target-progress';
        progressElement.innerHTML = `
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">Initializing multi-target processing...</div>
          </div>
        `;

        // Insert at top of dialog content
        const content = this.element.querySelector('.dialog-content');
        if (content) {
          content.insertBefore(progressElement, content.firstChild);
        }
      }

      progressElement.style.display = 'block';
    } catch (error) {
      console.warn('PF2E Visioner | Failed to show processing progress:', error);
    }
  }

  /**
   * Updates processing progress
   * @param {Object} progressData - Progress data from processor
   * @private
   */
  _updateProcessingProgress(progressData) {
    try {
      const progressElement = this.element.querySelector('.multi-target-progress');
      if (!progressElement) return;

      const progressFill = progressElement.querySelector('.progress-fill');
      const progressText = progressElement.querySelector('.progress-text');

      if (progressFill) {
        progressFill.style.width = `${Math.max(0, Math.min(100, progressData.percentage))}%`;
      }

      if (progressText) {
        progressText.textContent = progressData.message || 'Processing...';
      }

      // Add phase indicator
      if (progressData.phase) {
        progressElement.setAttribute('data-phase', progressData.phase);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update processing progress:', error);
    }
  }

  /**
   * Hides processing progress indicator
   * @private
   */
  _hideProcessingProgress() {
    try {
      const progressElement = this.element.querySelector('.multi-target-progress');
      if (progressElement) {
        progressElement.style.display = 'none';
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to hide processing progress:', error);
    }
  }

  /**
   * Shows processing error message
   * @param {string} errorMessage - Error message to display
   * @private
   */
  _showProcessingError(errorMessage) {
    try {
      notify.error(`Multi-target processing failed: ${errorMessage}`);

      // Also show in dialog if possible
      const progressElement = this.element.querySelector('.multi-target-progress');
      if (progressElement) {
        const progressText = progressElement.querySelector('.progress-text');
        if (progressText) {
          progressText.textContent = `Error: ${errorMessage}`;
          progressText.style.color = '#ff6b6b';
        }

        // Hide after a delay
        setTimeout(() => {
          progressElement.style.display = 'none';
        }, 3000);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to show processing error:', error);
    }
  }

  /**
   * Caches multi-target processing results
   * @param {Array<Token>} targets - Target tokens
   * @param {Array<Object>} outcomes - Processing outcomes
   * @private
   */
  _cacheMultiTargetResults(targets, outcomes) {
    try {
      const cacheKey = this._generateMultiTargetCacheKey(targets);
      this._multiTargetCache.set(cacheKey, {
        outcomes,
        timestamp: Date.now(),
        targetCount: targets.length,
      });

      // Limit cache size
      if (this._multiTargetCache.size > 10) {
        const oldestKey = Array.from(this._multiTargetCache.keys())[0];
        this._multiTargetCache.delete(oldestKey);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to cache multi-target results:', error);
    }
  }

  /**
   * Generates cache key for multi-target results
   * @param {Array<Token>} targets - Target tokens
   * @returns {string} Cache key
   * @private
   */
  _generateMultiTargetCacheKey(targets) {
    const tokenIds = targets
      .map((t) => t.document.id)
      .sort()
      .join(',');
    const sneakingId = this.sneakingToken.document.id;
    return `${sneakingId}:${tokenIds}`;
  }

  /**
   * Gets cached multi-target results if available
   * @param {Array<Token>} targets - Target tokens
   * @returns {Array<Object>|null} Cached outcomes or null
   */
  getCachedMultiTargetResults(targets) {
    try {
      const cacheKey = this._generateMultiTargetCacheKey(targets);
      const cached = this._multiTargetCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < 60000) {
        // 1 minute cache
        return cached.outcomes;
      }

      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Failed to get cached multi-target results:', error);
      return null;
    }
  }

  /**
   * Calculates the impact of a state change considering position data
   * @param {PositionTransition} positionTransition - Position transition data
   * @param {string} newState - New visibility state
   * @returns {Object} Impact data with class and tooltip
   * @private
   */
  _calculateStateChangeImpact(positionTransition, newState) {
    if (!positionTransition) {
      return { class: 'no-data', tooltip: 'No position data available' };
    }

    const endPos = positionTransition.endPosition;
    let impactScore = 0;
    let tooltip = 'State change impact: ';

    // Factor in position quality for the new state
    if (newState === 'undetected' && endPos.coverState !== 'none') {
      impactScore += 2;
      tooltip += 'Excellent synergy with cover';
    } else if (newState === 'hidden' && endPos.lightingConditions === 'darkness') {
      impactScore += 1;
      tooltip += 'Good synergy with lighting';
    } else if (newState === 'observed' && positionTransition.transitionType === 'improved') {
      impactScore -= 1;
      tooltip += 'Wasted position improvement';
    }

    if (impactScore > 1) return { class: 'excellent-synergy', tooltip };
    if (impactScore > 0) return { class: 'good-synergy', tooltip };
    if (impactScore < 0) return { class: 'poor-synergy', tooltip };
    return { class: 'neutral-impact', tooltip: 'Neutral impact' };
  }

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  // Duplicate render methods removed (defined earlier in class)

  static async _onToggleEncounterFilter(event, target) {
    const app = currentSneakDialog;
    if (!app) {
      console.warn('Sneak dialog not found for encounter filter toggle');
      return;
    }

    // Toggle the filter state
    app.encounterOnly = target.checked;

    // Reset bulk action state
    app.bulkActionState = 'initial';

    // Re-render the dialog - _prepareContext will handle the filtering
    app.render({ force: true });
  }

  static async _onApplyChange(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.token.id === tokenId);

    if (!outcome) return;

    const effectiveNewState = outcome.overrideState || outcome.newVisibility;

    try {
      // Apply only this row via services using overrides map
      const { applyNowSneak } = await import('../services/index.js');
      const overrides = { [tokenId]: effectiveNewState };
      await applyNowSneak({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    } catch (error) {
      console.warn('Error applying visibility changes:', error);
      // Continue execution even if visibility changes fail
    }

    // Update button states
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied sneak result - ${outcome.token.name} sees ${app.sneakingToken.name} as ${effectiveNewState}`,
    );
  }

  static async _onRevertChange(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.token.id === tokenId);

    if (!outcome) return;

    try {
      // Apply the original visibility state for just this specific token
      const { applyVisibilityChanges } = await import('../services/infra/shared-utils.js');
      const revertVisibility = outcome.oldVisibility || outcome.currentVisibility;
      const changes = [{ target: outcome.token, newVisibility: revertVisibility }];

      await applyVisibilityChanges(app.sneakingToken, changes, {
        direction: 'observer_to_target',
      });
    } catch (error) {
      console.warn('Error reverting visibility changes:', error);
      // Continue execution even if visibility changes fail
    }

    // Update button states
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Reverted sneak result - ${outcome.token.name} sees ${app.sneakingToken.name} as ${outcome.oldVisibility}`,
    );
  }

  static async _onApplyAll(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Use the current filtered outcomes that are already displayed in the dialog
    // These have already been filtered by encounter and ignore allies settings
    const filteredOutcomes = app.outcomes || [];

    // Only apply changes to filtered outcomes that have actual changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      return effectiveNewState !== outcome.oldVisibility && outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No changes to apply`);
      return;
    }

    try {
      const { applyNowSneak } = await import('../services/index.js');
      const overrides = {};
      for (const o of changedOutcomes) {
        const id = o?.token?.id;
        const state = o?.overrideState || o?.newVisibility;
        if (id && state) overrides[id] = state;
      }
      // Pass the dialog's current ignoreAllies state to ensure consistency
      await applyNowSneak(
        { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
        { html: () => {}, attr: () => {} },
      );
    } catch (error) {
      console.warn('Error applying visibility changes for bulk apply:', error);
    }

    // Update all affected rows in one go
    app.updateRowButtonsToApplied(
      changedOutcomes.map((o) => ({ target: { id: o.token.id }, hasActionableChange: true })),
    );

    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied all sneak results (${changedOutcomes.length} changes). Dialog remains open for further adjustments.`,
    );
  }

  static async _onRevertAll(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    if (app.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Use the current filtered outcomes that are already displayed in the dialog
    // These have already been filtered by encounter and ignore allies settings
    const filteredOutcomes = app.outcomes || [];

    // Only revert changes to filtered outcomes that have actual changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      return effectiveNewState !== outcome.oldVisibility && outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No changes to revert`);
      return;
    }

    try {
      const { revertNowSneak } = await import('../services/index.js');
      await revertNowSneak(
        { ...app.actionData, ignoreAllies: app.ignoreAllies },
        { html: () => {}, attr: () => {} },
      );
    } catch (error) {
      console.warn('Error reverting visibility changes for bulk revert:', error);
    }

    // Update all affected rows in one go
    app.updateRowButtonsToReverted(
      changedOutcomes.map((o) => ({ target: { id: o.token.id }, hasActionableChange: true })),
    );

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Reverted all sneak results (${changedOutcomes.length} changes). Dialog remains open for further adjustments.`,
    );
  }

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  static async _onOverrideState(event, button) {
    // Override state method for consistency with other dialogs
    const app = currentSneakDialog;
    if (!app) return;
    // This method is available for future enhancements if needed
  }

  static async _onTogglePositionDisplay(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    // Cycle through display modes: basic -> enhanced -> detailed -> basic
    const modes = ['basic', 'enhanced', 'detailed'];
    const currentIndex = modes.indexOf(app._positionDisplayMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    app._positionDisplayMode = modes[nextIndex];

    // Update button text to show current mode
    if (button) {
      button.textContent = `Position: ${app._positionDisplayMode}`;
    }

    // Re-render dialog with new display mode
    app.render({ force: true });
  }

  static async _onShowPositionDetails(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = button?.dataset?.tokenId;
    if (!tokenId) return;

    const outcome = app.outcomes.find((o) => o.token.id === tokenId);
    if (!outcome || !outcome.hasPositionData) {
      notify.warn('No position data available for this token');
      return;
    }

    // Show detailed position information in a separate dialog
    try {
      const { PositionDetailsDialog } = await import('./position-details-dialog.js');
      new PositionDetailsDialog(outcome.positionTransition, outcome.token).render(true);
    } catch (error) {
      console.warn('PF2E Visioner | Failed to show position details dialog:', error);

      // Fallback to notification with basic info
      const pos = outcome.positionTransition?.endPosition;
      if (pos) {
        const info = `Position: ${pos.avsVisibility}, Cover: ${pos.coverState}, Distance: ${Math.round(pos.distance)}ft`;
        notify.info(`${outcome.token.name}: ${info}`);
      }
    }
  }

  static async _onReprocessMultiTarget(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    if (app._isProcessingMultiTarget) {
      notify.warn('Multi-target processing already in progress');
      return;
    }

    try {
      // Get current targets from outcomes
      const targets = app.outcomes.map((o) => o.token).filter(Boolean);

      if (targets.length === 0) {
        notify.warn('No targets available for reprocessing');
        return;
      }

      // Clear cache to force fresh processing
      app.multiTargetProcessor.clearCache();
      app._multiTargetCache.clear();

      // Reprocess with enhanced multi-target processor
      const enhancedOutcomes = await app.processOutcomesEnhanced(targets, app.actionData);

      // Update outcomes and re-render
      app.outcomes = enhancedOutcomes;
      app.render({ force: true });

      notify.info(`Reprocessed ${enhancedOutcomes.length} targets with enhanced analysis`);
    } catch (error) {
      console.error('PF2E Visioner | Failed to reprocess multi-target:', error);
      notify.error(`Reprocessing failed: ${error.message}`);
    }
  }

  close(options) {
    if (this._selectionHookId) {
      try {
        Hooks.off('controlToken', this._selectionHookId);
      } catch (_) {}
      this._selectionHookId = null;
    }
    currentSneakDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() {
    return 'sneak-preview-dialog-changes-count';
  }


  /**
   * Shows a detailed position analysis dialog
   * @param {string} tokenId - Token ID
   * @param {PositionTransition} positionTransition - Position transition data
   * @private
   */
  async _showPositionDetailsDialog(tokenId, positionTransition) {
    const token = canvas.tokens.get(tokenId);
    if (!token) return;

    const content = await this._renderPositionDetailsContent(token, positionTransition);

    new Dialog(
      {
        title: `Position Analysis: ${token.name}`,
        content,
        buttons: {
          close: {
            label: 'Close',
            callback: () => {},
          },
        },
        default: 'close',
        render: (html) => {
          // Add any interactive elements to the position details dialog
          html.find('.position-detail-section').each((i, el) => {
            el.addEventListener('click', (e) => {
              e.currentTarget.classList.toggle('expanded');
            });
          });
        },
      },
      {
        classes: ['pf2e-visioner', 'position-details-dialog'],
        width: 500,
        height: 'auto',
      },
    ).render(true);
  }

  /**
   * Renders detailed position analysis content
   * @param {Token} token - The token
   * @param {PositionTransition} positionTransition - Position transition data
   * @returns {string} HTML content
   * @private
   */
  async _renderPositionDetailsContent(token, positionTransition) {
    const startPos = positionTransition.startPosition;
    const endPos = positionTransition.endPosition;

    return `
      <div class="position-details-content">
        <div class="position-comparison">
          <div class="position-column start-position">
            <h3><i class="fas fa-play"></i> Start Position</h3>
            <div class="position-stats">
              <div class="stat-row">
                <span class="stat-label">Visibility:</span>
                <span class="stat-value ${this._getVisibilityClass(startPos.avsVisibility)}">
                  <i class="${this._getVisibilityIcon(startPos.avsVisibility)}"></i>
                  ${this._getVisibilityLabel(startPos.avsVisibility)}
                </span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Cover:</span>
                <span class="stat-value ${this._getCoverClass(startPos.coverState)}">
                  <i class="${this._getCoverIcon(startPos.coverState)}"></i>
                  ${this._getCoverLabel(startPos.coverState)}
                  ${startPos.stealthBonus > 0 ? `(+${startPos.stealthBonus})` : ''}
                </span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Distance:</span>
                <span class="stat-value">${Math.round(startPos.distance)} ft</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Lighting:</span>
                <span class="stat-value">
                  <i class="${this._getLightingIcon(startPos.lightingConditions)}"></i>
                  ${this._getLightingLabel(startPos.lightingConditions)}
                </span>
              </div>
            </div>
          </div>
          
          <div class="position-arrow">
            <i class="${this._getTransitionIcon(positionTransition.transitionType)} ${this._getTransitionClass(positionTransition.transitionType)}"></i>
          </div>
          
          <div class="position-column end-position">
            <h3><i class="fas fa-stop"></i> End Position</h3>
            <div class="position-stats">
              <div class="stat-row">
                <span class="stat-label">Visibility:</span>
                <span class="stat-value ${this._getVisibilityClass(endPos.avsVisibility)}">
                  <i class="${this._getVisibilityIcon(endPos.avsVisibility)}"></i>
                  ${this._getVisibilityLabel(endPos.avsVisibility)}
                  ${positionTransition.avsVisibilityChanged ? '<i class="fas fa-exclamation-triangle change-indicator"></i>' : ''}
                </span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Cover:</span>
                <span class="stat-value ${this._getCoverClass(endPos.coverState)}">
                  <i class="${this._getCoverIcon(endPos.coverState)}"></i>
                  ${this._getCoverLabel(endPos.coverState)}
                  ${endPos.stealthBonus > 0 ? `(+${endPos.stealthBonus})` : ''}
                  ${positionTransition.coverStateChanged ? '<i class="fas fa-exclamation-triangle change-indicator"></i>' : ''}
                </span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Distance:</span>
                <span class="stat-value">
                  ${Math.round(endPos.distance)} ft
                  ${Math.abs(endPos.distance - startPos.distance) > 5 ? '<i class="fas fa-exclamation-triangle change-indicator"></i>' : ''}
                </span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Lighting:</span>
                <span class="stat-value">
                  <i class="${this._getLightingIcon(endPos.lightingConditions)}"></i>
                  ${this._getLightingLabel(endPos.lightingConditions)}
                  ${startPos.lightingConditions !== endPos.lightingConditions ? '<i class="fas fa-exclamation-triangle change-indicator"></i>' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="position-impact-summary">
          <h3><i class="fas fa-chart-line"></i> Impact Analysis</h3>
          <div class="impact-stats">
            <div class="impact-row">
              <span class="impact-label">Stealth Bonus Change:</span>
              <span class="impact-value ${positionTransition.stealthBonusChange > 0 ? 'positive' : positionTransition.stealthBonusChange < 0 ? 'negative' : 'neutral'}">
                ${positionTransition.stealthBonusChange > 0 ? '+' : ''}${positionTransition.stealthBonusChange}
              </span>
            </div>
            <div class="impact-row">
              <span class="impact-label">DC Impact:</span>
              <span class="impact-value ${positionTransition.impactOnDC > 0 ? 'negative' : positionTransition.impactOnDC < 0 ? 'positive' : 'neutral'}">
                ${positionTransition.impactOnDC > 0 ? '+' : ''}${positionTransition.impactOnDC}
              </span>
            </div>
            <div class="impact-row">
              <span class="impact-label">Overall Assessment:</span>
              <span class="impact-value ${this._getImpactClass(positionTransition)}">
                <i class="${this._getImpactIcon(positionTransition)}"></i>
                ${positionTransition.transitionType.charAt(0).toUpperCase() + positionTransition.transitionType.slice(1)}
              </span>
            </div>
          </div>
        </div>
        
        ${
          positionTransition.startPosition.systemErrors?.length > 0 ||
          positionTransition.endPosition.systemErrors?.length > 0
            ? `
          <div class="position-warnings">
            <h3><i class="fas fa-exclamation-triangle"></i> System Warnings</h3>
            <ul>
              ${(positionTransition.startPosition.systemErrors || []).map((error) => `<li>Start: ${error}</li>`).join('')}
              ${(positionTransition.endPosition.systemErrors || []).map((error) => `<li>End: ${error}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Handles position-aware override state changes using v13 event handling
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Event target element
   * @returns {Promise<void>}
   */
  async _onPositionAwareOverride(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const tokenId = target.dataset.tokenId;
    const newState = target.dataset.state;

    if (!tokenId || !newState) {
      console.warn('PF2E Visioner | Invalid position-aware override data');
      return;
    }

    try {
      // Find the outcome for this token
      const outcome = this.outcomes.find((o) => o.token?.id === tokenId);
      if (!outcome) {
        console.warn('PF2E Visioner | Outcome not found for token:', tokenId);
        return;
      }

      const observerToken = outcome.token;

      // Validate the override with position context
      const validationResult = await this._validatePositionAwareOverride(
        observerToken,
        this.sneakingToken,
        newState,
        outcome,
      );

      if (!validationResult.canApply) {
        // Show validation warning
        await this._showOverrideValidationWarning(validationResult, observerToken, newState);
        return;
      }

      // Apply the position-aware override
      const success = await this._applyPositionAwareOverride(
        observerToken,
        this.sneakingToken,
        newState,
        outcome,
      );

      if (success) {
        // Update the outcome state
        outcome.overrideState = newState;
        outcome.newVisibility = newState;

        // Update UI to reflect the change
        await this._updateOverrideUI(target, newState, validationResult);

        notify.info(
          `Position-aware override applied: ${observerToken.name} now sees ${this.sneakingToken.name} as ${newState}`,
        );
      } else {
        notify.error('Failed to apply position-aware override');
      }
    } catch (error) {
      console.error('PF2E Visioner | Error applying position-aware override:', error);
      notify.error('Error applying position-aware override');
    }
  }

  /**
   * Validates position-aware override with enhanced context
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} newState - Proposed override state
   * @param {Object} outcome - Outcome with position data
   * @returns {Promise<Object>} Validation result
   * @private
   */
  async _validatePositionAwareOverride(observer, target, newState, outcome) {
    try {
      // Get the sneak action handler for validation
      const { SneakActionHandler } = await import('../services/actions/sneak-action.js');
      const sneakHandler = new SneakActionHandler();

      // Validate using the enhanced sneak handler
      const validationResult = await sneakHandler.validateSneakOverride(
        observer,
        target,
        newState,
        outcome,
      );

      return validationResult;
    } catch (error) {
      console.warn('PF2E Visioner | Position-aware override validation failed:', error);
      return {
        isValid: false,
        canApply: false,
        severity: 'error',
        issues: [`Validation failed: ${error.message}`],
        recommendations: ['Manual verification required'],
      };
    }
  }

  /**
   * Applies position-aware override using enhanced service
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} newState - Override state
   * @param {Object} outcome - Outcome with position data
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _applyPositionAwareOverride(observer, target, newState, outcome) {
    try {
      // Get the sneak action handler for override application
      const { SneakActionHandler } = await import('../services/actions/sneak-action.js');
      const sneakHandler = new SneakActionHandler();

      // Apply using the enhanced sneak handler
      const success = await sneakHandler.applyPositionAwareOverride(
        observer,
        target,
        newState,
        outcome,
      );

      return success;
    } catch (error) {
      console.error('PF2E Visioner | Failed to apply position-aware override:', error);
      return false;
    }
  }

  /**
   * Shows validation warning dialog for override conflicts
   * @param {Object} validationResult - Validation result
   * @param {Token} observer - Observer token
   * @param {string} newState - Proposed state
   * @returns {Promise<void>}
   * @private
   */
  async _showOverrideValidationWarning(validationResult, observer, newState) {
    const issues = validationResult.issues.slice(0, 3).join('\n');
    const recommendations =
      validationResult.combinedRecommendations?.slice(0, 2).join('\n') ||
      validationResult.recommendations?.slice(0, 2).join('\n') ||
      'No recommendations available';

    const content = `
      <div class="override-validation-warning">
        <h3><i class="fas fa-exclamation-triangle"></i> Override Validation Warning</h3>
        <p><strong>Observer:</strong> ${observer.name}</p>
        <p><strong>Proposed State:</strong> ${newState}</p>
        
        <div class="validation-issues">
          <h4>Issues Detected:</h4>
          <p>${issues}</p>
        </div>
        
        <div class="validation-recommendations">
          <h4>Recommendations:</h4>
          <p>${recommendations}</p>
        </div>
        
        <p><em>The override was not applied due to validation concerns.</em></p>
      </div>
    `;

    await Dialog.prompt({
      title: 'Position-Aware Override Warning',
      content,
      callback: () => {},
      options: {
        classes: ['pf2e-visioner', 'override-validation-warning-dialog'],
      },
    });
  }

  /**
   * Updates override UI elements after successful application
   * @param {HTMLElement} target - Target element that triggered the override
   * @param {string} newState - New override state
   * @param {Object} validationResult - Validation result
   * @returns {Promise<void>}
   * @private
   */
  async _updateOverrideUI(target, newState, validationResult) {
    try {
      // Update the state icon selection
      const iconSelection = target.closest('.icon-selection');
      if (iconSelection) {
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach((icon) => icon.classList.remove('selected'));
        target.classList.add('selected');

        // Update hidden input
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;

        // Update state label
        const label = iconSelection.parentElement.querySelector('.state-label');
        if (label) {
          const stateConfig = this.visibilityConfig(newState);
          label.textContent = stateConfig.label;
          label.className = `state-label ${stateConfig.cssClass}`;
        }
      }

      // Add validation indicator if there were warnings
      if (validationResult.severity === 'warning') {
        const warningIndicator = document.createElement('span');
        warningIndicator.className = 'override-warning-indicator';
        warningIndicator.innerHTML =
          '<i class="fas fa-exclamation-triangle" title="Override applied with warnings"></i>';
        target.appendChild(warningIndicator);
      }

      // Update position impact display if available
      const positionDisplay = target.closest('.outcome-row')?.querySelector('.position-display');
      if (positionDisplay) {
        positionDisplay.classList.add('override-applied');
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to update override UI:', error);
    }
  }

  /**
   * Handles showing detailed position information dialog
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Event target
   * @returns {Promise<void>}
   */
  async _onShowPositionDetails(event, target) {
    event.preventDefault();

    const tokenId = target.dataset.tokenId;
    if (!tokenId) return;

    const outcome = this.outcomes.find((o) => o.token?.id === tokenId);
    if (!outcome?.positionTransition) {
      notify.warn('No position data available for this observer');
      return;
    }

    try {
      // Show detailed position dialog
      const { PositionDetailsDialog } = await import('./position-details-dialog.js');
      const dialog = new PositionDetailsDialog(
        outcome.positionTransition,
        outcome.token,
        this.sneakingToken,
      );
      dialog.render(true);
    } catch (error) {
      console.error('PF2E Visioner | Failed to show position details:', error);
      notify.error('Failed to show position details');
    }
  }

  /**
   * Handles conflict resolution for position-aware overrides
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Event target
   * @returns {Promise<void>}
   */
  async _onResolveOverrideConflict(event, target) {
    event.preventDefault();

    const tokenId = target.dataset.tokenId;
    const resolution = target.dataset.resolution;
    const newState = target.dataset.newState;

    if (!tokenId || !resolution) return;

    try {
      const outcome = this.outcomes.find((o) => o.token?.id === tokenId);
      if (!outcome) return;

      const observerToken = outcome.token;

      // Get the sneak action handler for conflict resolution
      const { SneakActionHandler } = await import('../services/actions/sneak-action.js');
      const sneakHandler = new SneakActionHandler();

      const success = await sneakHandler.resolveSneakOverrideConflict(
        observerToken,
        this.sneakingToken,
        resolution,
        newState,
      );

      if (success) {
        notify.info(`Override conflict resolved: ${resolution}`);

        // Update UI to reflect resolution
        const conflictIndicator = target.closest('.conflict-indicator');
        if (conflictIndicator) {
          conflictIndicator.remove();
        }

        // Re-render if necessary
        if (resolution === 'modify' && newState) {
          outcome.overrideState = newState;
          outcome.newVisibility = newState;
          this.render();
        }
      } else {
        notify.error('Failed to resolve override conflict');
      }
    } catch (error) {
      console.error('PF2E Visioner | Error resolving override conflict:', error);
      notify.error('Error resolving override conflict');
    }
  }

  /**
   * Static action handler for position-aware overrides
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Event target
   * @returns {Promise<void>}
   */
  static async _onPositionAwareOverride(event, target) {
    const dialog = target.closest('.sneak-preview-dialog')?.application;
    if (dialog && dialog._onPositionAwareOverride) {
      await dialog._onPositionAwareOverride(event, target);
    }
  }


  /**
   * Static action handler for resolving override conflicts
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Event target
   * @returns {Promise<void>}
   */
  static async _onResolveOverrideConflict(event, target) {
    const dialog = target.closest('.sneak-preview-dialog')?.application;
    if (dialog && dialog._onResolveOverrideConflict) {
      await dialog._onResolveOverrideConflict(event, target);
    }
  }

  /**
   * Handles toggling start position requirements
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onToggleStartPosition(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    if (!tokenId) return;

    const outcome = app.outcomes.find(o => o.token.id === tokenId);
    if (!outcome || !outcome.hasPositionData) return;

    // Toggle the qualification status
    const currentQualifies = outcome.positionDisplay.startPosition.qualifies;
    outcome.positionDisplay.startPosition.qualifies = !currentQualifies;

    // Update button visual state
    const icon = target.querySelector('i');
    if (outcome.positionDisplay.startPosition.qualifies) {
      target.className = 'position-requirement-btn position-check active';
      icon.className = 'fas fa-check';
      target.setAttribute('data-tooltip', 'Start position qualifies for sneak');
    } else {
      target.className = 'position-requirement-btn position-x';
      icon.className = 'fas fa-times';
      target.setAttribute('data-tooltip', 'Start position does not qualify for sneak');
    }

    // Notify change
    notify.info(`${outcome.token.name} start position ${outcome.positionDisplay.startPosition.qualifies ? 'now qualifies' : 'no longer qualifies'} for sneak`);
  }

  /**
   * Handles toggling end position requirements
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onToggleEndPosition(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    if (!tokenId) return;

    const outcome = app.outcomes.find(o => o.token.id === tokenId);
    if (!outcome || !outcome.hasPositionData) return;

    // Toggle the qualification status
    const currentQualifies = outcome.positionDisplay.endPosition.qualifies;
    outcome.positionDisplay.endPosition.qualifies = !currentQualifies;

    // Update button visual state
    const icon = target.querySelector('i');
    if (outcome.positionDisplay.endPosition.qualifies) {
      target.className = 'position-requirement-btn position-check active';
      icon.className = 'fas fa-check';
      target.setAttribute('data-tooltip', 'End position qualifies for sneak');
    } else {
      target.className = 'position-requirement-btn position-x';
      icon.className = 'fas fa-times';
      target.setAttribute('data-tooltip', 'End position does not qualify for sneak');
    }

    // Notify change
    notify.info(`${outcome.token.name} end position ${outcome.positionDisplay.endPosition.qualifies ? 'now qualifies' : 'no longer qualifies'} for sneak`);
  }

  /**
   * Handles setting cover bonus for individual tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onSetCoverBonus(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const tokenId = target.dataset.tokenId;
    const bonus = parseInt(target.dataset.bonus, 10);
    if (!tokenId || isNaN(bonus)) return;

    const outcome = app.outcomes.find(o => o.token.id === tokenId);
    if (!outcome) return;

    // Update the outcome's applied cover bonus
    outcome.appliedCoverBonus = bonus;

    // Update button visual states in this row
    const row = target.closest('tr');
    const coverButtons = row.querySelectorAll('.cover-bonus-btn');
    coverButtons.forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');

    // Update the roll total display
    const rollTotalElement = row.querySelector('.roll-total');
    const baseTotal = parseInt(rollTotalElement.dataset.baseTotal, 10) || outcome.baseRollTotal || outcome.rollTotal;
    const newTotal = baseTotal + bonus;
    
    // Store the base total if not already stored
    if (!rollTotalElement.dataset.baseTotal) {
      rollTotalElement.dataset.baseTotal = outcome.rollTotal;
    }
    
    console.debug('PF2E Visioner | Cover bonus update:', {
      tokenName: outcome.token.name,
      bonus: bonus,
      baseTotal: baseTotal,
      newTotal: newTotal,
      dc: outcome.dc,
      dcType: typeof outcome.dc,
      margin: newTotal - outcome.dc,
      marginCalc: `${newTotal} - ${outcome.dc} = ${newTotal - outcome.dc}`,
      previousOutcome: outcome.outcome
    });
    
    rollTotalElement.textContent = newTotal;
    outcome.rollTotal = newTotal;

    // Recalculate outcome based on new total
    const margin = newTotal - outcome.dc;
    const newOutcome = app._calculateOutcome(margin);
    console.debug('PF2E Visioner | Recalculated outcome:', {
      margin: margin,
      newOutcome: newOutcome
    });
    
    // Update outcome in the data structure
    outcome.outcome = newOutcome;
    
    // Update outcome display
    const outcomeCell = row.querySelector('.outcome');
    const outcomeText = outcomeCell.querySelector('.outcome-text');
    if (outcomeText) {
      const outcomeLabel = app._getOutcomeLabel(newOutcome);
      outcomeText.textContent = outcomeLabel;
      console.debug('PF2E Visioner | Updated outcome display:', {
        newOutcome: newOutcome,
        outcomeLabel: outcomeLabel,
        outcomeTextContent: outcomeText.textContent
      });
    }
    
    // Update outcome CSS class
    if (outcomeCell) {
      outcomeCell.className = `outcome ${app.getOutcomeClass(newOutcome)}`;
    }
    
    // Update visibility state indicators
    app._updateVisibilityStateIndicators(row, newOutcome);

    notify.info(`Applied +${bonus} cover bonus to ${outcome.token.name} (Roll: ${newTotal} vs DC ${outcome.dc})`);
  }

  /**
   * Handles applying cover bonus to all tokens
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Button element
   */
  static async _onApplyAllCover(event, target) {
    const app = currentSneakDialog;
    if (!app) return;

    const bonus = parseInt(target.dataset.bonus, 10);
    if (isNaN(bonus)) return;

    let appliedCount = 0;

    // Apply to all visible outcomes
    app.outcomes.forEach(outcome => {
      if (!outcome.token) return;

      // Update the applied cover bonus
      outcome.appliedCoverBonus = bonus;

      // Find the row and update buttons
      const row = app.element.querySelector(`tr[data-token-id="${outcome.token.id}"]`);
      if (!row) return;

      // Update cover bonus buttons
      const coverButtons = row.querySelectorAll('.cover-bonus-btn');
      coverButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.bonus, 10) === bonus) {
          btn.classList.add('active');
        }
      });

      // Update roll total
      const rollTotalElement = row.querySelector('.roll-total');
      const baseTotal = parseInt(rollTotalElement.dataset.baseTotal, 10) || outcome.baseRollTotal || outcome.rollTotal;
      const newTotal = baseTotal + bonus;
      
      if (!rollTotalElement.dataset.baseTotal) {
        rollTotalElement.dataset.baseTotal = outcome.rollTotal;
      }
      
      rollTotalElement.textContent = newTotal;
      outcome.rollTotal = newTotal;

      // Recalculate outcome
      const margin = newTotal - outcome.dc;
      const newOutcome = app._calculateOutcome(margin);
      
      // Update outcome display
      const outcomeCell = row.querySelector('.outcome');
      const outcomeText = outcomeCell.querySelector('.outcome-text');
      if (outcomeText) {
        outcomeText.textContent = app._getOutcomeLabel(newOutcome);
      }
      
      // Update visibility indicators
      app._updateVisibilityStateIndicators(row, newOutcome);

      appliedCount++;
    });

    // Highlight the "Apply All" button that was clicked
    const applyAllButtons = app.element.querySelectorAll('.apply-all-cover-btn');
    applyAllButtons.forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');

    notify.info(`Applied +${bonus} cover bonus to all ${appliedCount} observers`);
  }

  /**
   * Calculates outcome based on margin
   * @param {number} margin - Roll margin vs DC
   * @returns {string} Outcome type
   */
  _calculateOutcome(margin) {
    if (margin >= 10) return 'critical-success';
    if (margin >= 0) return 'success';
    if (margin <= -10) return 'critical-failure';
    return 'failure';
  }

  /**
   * Gets outcome label for display
   * @param {string} outcome - Outcome type
   * @returns {string} Display label
   */
  _getOutcomeLabel(outcome) {
    const labels = {
      'critical-success': 'Critical Success',
      'success': 'Success', 
      'failure': 'Failure',
      'critical-failure': 'Critical Failure'
    };
    return labels[outcome] || outcome;
  }

  /**
   * Updates visibility state indicators based on outcome
   * @param {HTMLElement} row - Table row element
   * @param {string} outcome - New outcome
   */
  _updateVisibilityStateIndicators(row, outcome) {
    const visibilityStates = row.querySelectorAll('.visibility-state');
    visibilityStates.forEach(state => state.classList.remove('active'));

    // Map outcomes to visibility states
    const stateMapping = {
      'critical-success': 'undetected-state',
      'success': 'success-state',
      'failure': 'failure-state', 
      'critical-failure': 'critical-failure-state'
    };

    const targetState = stateMapping[outcome];
    if (targetState) {
      const targetElement = row.querySelector(`.${targetState}`);
      if (targetElement) {
        targetElement.classList.add('active');
      }
    }
  }
}
