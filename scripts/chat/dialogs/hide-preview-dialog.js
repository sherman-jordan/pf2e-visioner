/**
 * Hide Preview Dialog for Hide action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import { notify } from '../services/infra/notifications.js';
import { hasActiveEncounter } from '../services/infra/shared-utils.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current hide dialog
let currentHideDialog = null;

export class HidePreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    classes: ['pf2e-visioner', 'hide-preview-dialog'],
    window: {
      title: 'Hide Results',
      icon: 'fas fa-eye-slash',
      resizable: true,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      close: HidePreviewDialog._onClose,
      applyAll: HidePreviewDialog._onApplyAll,
      revertAll: HidePreviewDialog._onRevertAll,
      applyChange: HidePreviewDialog._onApplyChange,
      revertChange: HidePreviewDialog._onRevertChange,
      toggleEncounterFilter: HidePreviewDialog._onToggleEncounterFilter,
      overrideState: HidePreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/hide-preview.hbs',
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    // Set window title and icon for hide dialog
    options.window = {
      ...options.window,
      title: `Hide Results`,
      icon: 'fas fa-eye-slash',
    };

    super(options);

    this.actorToken = actorToken;
    this.outcomes = outcomes || [];
    // Preserve an immutable base list for live filtering toggles
    try {
      this._originalOutcomes = Array.isArray(outcomes) ? [...outcomes] : [];
    } catch (_) {
      this._originalOutcomes = outcomes || [];
    }
    this.changes = changes || [];
    this.actionData = { ...(actionData || {}), actionType: 'hide' };
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    this.ignoreAllies = game.settings.get(MODULE_ID, 'ignoreAllies');
    this.bulkActionState = 'initial'; // Track bulk action state

    // Store reference for singleton behavior
    currentHideDialog = this;
  }

  /**
   * Called after the dialog is first rendered to set up event handlers
   */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateChangesCount();
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb)
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.bulkActionState = 'initial';
          // Recompute filtered list and preserve overrides before re-rendering
          this.getFilteredOutcomes()
            .then((list) => {
              this.outcomes = list;
              this.render({ force: true });
            })
            .catch(() => this.render({ force: true }));
        });
    } catch (_) {}
  }

  /**
   * Add hover listeners to highlight tokens on canvas
   */
  // Selection highlight handled by BasePreviewDialog

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Check if cover for hide action is enabled (works with both auto and manual cover)
    const showCover = game.settings.get(MODULE_ID, 'autoCoverHideAction');
    context.showAutoCover = showCover;

    // Get filtered outcomes from the original list using encounter helper, ally filtering, then extra RAW filtering
    const baseList = Array.isArray(this._originalOutcomes)
      ? this._originalOutcomes
      : this.outcomes || [];
    let filteredOutcomes = this.applyEncounterFilter(
      baseList,
      'target',
      'No encounter observers found for this action',
    );
    // Apply ally filtering for display purposes
    try {
      const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
      filteredOutcomes = filterOutcomesByAllies(
        filteredOutcomes,
        this.actorToken,
        this.ignoreAllies,
        'target',
      );
    } catch (_) {}

    // Note: autoCover data is already calculated in hide-action.js and should be preserved
    // No need to call getCoverBetween here as it would overwrite the rich autoCover object

    // Show notification if encounter filter results in empty list
    if (this.encounterOnly && hasActiveEncounter() && filteredOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No encounter observers found for this action`);
    }

    // Process outcomes to add additional properties needed by template
    const processedOutcomes = filteredOutcomes.map((outcome) => {
      const availableStates = this.getAvailableStatesForOutcome(outcome);
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
      const hasActionableChange =
        baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

      return {
        ...outcome,
        availableStates,
        overrideState: effectiveNewState,
        hasActionableChange,
        calculatedOutcome: outcome.newVisibility,
        tokenImage: this.resolveTokenImage(outcome.target),
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        marginText: this.formatMargin(outcome.margin),
        oldVisibilityState: getVisibilityStateConfig(baseOldState),
        newVisibilityState: getVisibilityStateConfig(effectiveNewState),
      };
    });

    // Do not overwrite the original outcomes; keep them for live re-filtering

    // Calculate summary information
    context.actorToken = this.actorToken;
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;
    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
  }

  /**
   * Get filtered outcomes based on current filter settings
   * @returns {Array} Filtered outcomes
   */
  async getFilteredOutcomes() {
    try {
      const baseList = Array.isArray(this._originalOutcomes)
        ? this._originalOutcomes
        : this.outcomes || [];
      let filtered = this.applyEncounterFilter(
        baseList,
        'target',
        'No encounter observers found for this action',
      );
      // Apply ally filtering via live checkbox
      try {
        const { filterOutcomesByAllies } = await import('../services/infra/shared-utils.js');
        filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, 'target');
      } catch (_) {}
      if (!Array.isArray(filtered)) return [];
      // Preserve override selections and recompute actionability
      const merged = filtered.map((o) => {
        try {
          const existing = (this.outcomes || []).find((x) => x?.target?.id === o?.target?.id);
          const overrideState = existing?.overrideState ?? o?.overrideState ?? null;
          const currentVisibility = o.oldVisibility || o.currentVisibility;
          const effectiveNewState = overrideState || o.newVisibility || currentVisibility;
          const baseOldState = o.oldVisibility || currentVisibility;
          const hasActionableChange =
            baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;
          return { ...o, overrideState, hasActionableChange };
        } catch (_) {
          return { ...o };
        }
      });
      return merged;
    } catch (_) {
      return Array.isArray(this.outcomes) ? this.outcomes : [];
    }
  }

  // Token id in Hide outcomes is under `target`
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  /**
   * Get available visibility states for an outcome based on Hide rules
   * Hide can only make you hidden from observers who can currently see you
   */
  getAvailableStatesForOutcome(outcome) {
    const desired = getDesiredOverrideStatesForAction('hide');
    const built = this.buildOverrideStates(desired, outcome);
    // Inject labels expected by template
    return built.map((s) => ({ ...s, label: this.getStateLabel(s.value) }));
  }

  getStateLabel(state) {
    const labels = {
      observed: 'Observed',
      concealed: 'Concealed',
      hidden: 'Hidden',
      undetected: 'Undetected',
    };
    return labels[state] || state;
  }

  // Use base outcome helpers

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );

    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content, options) {
    content.innerHTML = result;

    return content;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();
  }

  /**
   * Mark the initial calculated outcomes as selected
   */
  markInitialSelections() {
    this.outcomes.forEach((outcome) => {
      // Set the initial override state to the calculated new visibility
      outcome.overrideState = outcome.newVisibility;
      // Mark the calculated outcome as selected in the UI
      const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
      if (row) {
        const container = row.querySelector('.override-icons');
        if (container) {
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          const calculatedIcon = container.querySelector(
            `.state-icon[data-state="${outcome.newVisibility}"]`,
          );
          if (calculatedIcon) {
            calculatedIcon.classList.add('selected');
          }
        }
      }
    });
  }

  // removed: addIconClickHandlers duplicated; using BaseActionDialog implementation

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  /**
   * Updates the changes count in the dialog footer
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   */
  // consolidated handlers defined later in file

  /**
   * Handle applying a visibility change for a single token
   * @param {string} tokenId - The ID of the token to apply changes for
   */
  // consolidated handlers defined later in file

  /**
   * Handle reverting a visibility change for a single token
   * @param {string} tokenId - The ID of the token to revert changes for
   */
  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  // consolidated handlers defined later in file

  static async _onToggleEncounterFilter(event, target) {
    const app = currentHideDialog;
    if (!app) {
      return;
    }

    // Toggle the filter state
    app.encounterOnly = target.checked;

    // Reset bulk action state
    app.bulkActionState = 'initial';

    // Re-render the dialog - _prepareContext will handle the filtering
    app.render({ force: true });
  }

  static async _onOverrideState(event, target) {
    // This is handled by the icon click handlers
    // Placeholder for future functionality if needed
  }

  // Use services path for apply/revert; no custom applyVisibilityChanges override needed

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  getChangesCounterClass() {
    return 'hide-preview-dialog-changes-count';
  }

  // Static button handler methods
  static async _onClose(event, target) {
    currentHideDialog = null;
    return super._onClose?.(event, target);
  }

  static async _onApplyAll(event, target) {
    const app = currentHideDialog;

    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    // Ensure bulkActionState is initialized
    if (!app.bulkActionState) {
      app.bulkActionState = 'initial';
    }

    // Check if already applied
    if (app.bulkActionState === 'applied') {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Get filtered outcomes based on current filter settings
    const filteredOutcomes = await app.getFilteredOutcomes();

    // Get filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOld = outcome.oldVisibility || outcome.currentVisibility;
      return baseOld != null && effectiveNewState != null && effectiveNewState !== baseOld;
    });

    if (changedOutcomes.length === 0) {
      notify.info(`${MODULE_TITLE}: No visibility changes to apply`);
      return;
    }

    // Route via services with overrides for user selections
    const overrides = {};
    for (const o of changedOutcomes) {
      const id = o?.target?.id;
      const state = o?.overrideState || o?.newVisibility;
      if (id && state) overrides[id] = state;
    }
    await (
      await import('../services/index.js')
    ).applyNowHide(
      { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
      { html: () => {}, attr: () => {} },
    );

    // Update button states
    app.bulkActionState = 'applied';
    app.updateBulkActionButtons();
    app.updateRowButtonsToApplied(changedOutcomes);
    app.updateChangesCount();
    notify.info(
      `${MODULE_TITLE}: Applied ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`,
    );
  }

  static async _onRevertAll(event, target) {
    const app = currentHideDialog;

    if (!app) {
      return;
    }

    // Ensure bulkActionState is initialized
    if (!app.bulkActionState) {
      app.bulkActionState = 'initial';
    }

    // Check if already reverted
    if (app.bulkActionState === 'reverted') {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    try {
      const { revertNowHide } = await import('../services/index.js');
      await revertNowHide(
        { ...app.actionData, ignoreAllies: app.ignoreAllies },
        { html: () => {}, attr: () => {} },
      );
    } catch (error) {}

    app.bulkActionState = 'reverted';
    app.updateBulkActionButtons();
    app.updateRowButtonsToReverted(
      app.outcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })),
    );
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for further adjustments.`,
    );
  }

  static async _onApplyChange(event, target) {
    const app = currentHideDialog;
    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    const tokenId = target.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: No outcome found for this token`);
      return;
    }

    // Check if there's actually a change to apply
    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
    const hasChange = effectiveNewState !== outcome.oldVisibility;

    if (!hasChange) {
      notify.warn(`${MODULE_TITLE}: No change to apply for ${outcome.target.name}`);
      return;
    }

    try {
      const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
      await (
        await import('../services/index.js')
      ).applyNowHide(
        { ...app.actionData, ignoreAllies: app.ignoreAllies, overrides },
        { html: () => {}, attr: () => {} },
      );

      app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      notify.error(`${MODULE_TITLE}: Error applying change for ${outcome.target.name}`);
    }
  }

  static async _onRevertChange(event, target) {
    const app = currentHideDialog;
    if (!app) {
      console.error('[Hide Dialog] Could not find application instance');
      return;
    }

    const tokenId = target.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: Could not find outcome for this token`);
      return;
    }

    try {
      const { revertNowHide } = await import('../services/index.js');
      // Pass the specific tokenId for per-row revert
      const actionDataWithTarget = {
        ...app.actionData,
        ignoreAllies: app.ignoreAllies,
        targetTokenId: tokenId,
      };
      await revertNowHide(actionDataWithTarget, { html: () => {}, attr: () => {} });

      app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      notify.error(`${MODULE_TITLE}: Error reverting change for ${outcome.target.name}`);
    }
  }
}
