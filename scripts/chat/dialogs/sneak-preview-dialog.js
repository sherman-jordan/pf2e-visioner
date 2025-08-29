import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import { getVisibilityBetween } from '../../utils.js';
import { getDesiredOverrideStatesForAction } from '../services/data/action-state-config.js';
import { notify } from '../services/infra/notifications.js';
import { BaseActionDialog } from './base-action-dialog.js';

// Store reference to current sneak dialog
let currentSneakDialog = null;

/**
 * Dialog for previewing and applying Sneak action results
 */
export class SneakPreviewDialog extends BaseActionDialog {
  constructor(sneakingToken, outcomes, changes, sneakData, options = {}) {
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
        width: 620,
        height: 'auto',
      },
      form: {
        handler: SneakPreviewDialog.formHandler,
        submitOnChange: false,
        closeOnSubmit: false,
      },
      classes: ['pf2e-visioner', 'sneak-preview-dialog'],
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
    },
  };

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/sneak-preview.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

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
    } catch (_) { }

    const cfg = (s) => this.visibilityConfig(s);

    // Process outcomes to add additional properties
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
      actionLabel: 'Sneak action results analysis',
    };

    context.sneakingToken = this.sneakingToken;
    context.outcomes = processedOutcomes;
    context.ignoreAllies = !!this.ignoreAllies;

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
    } catch (_) { }
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
      await applyNowSneak({ ...app.actionData, overrides }, { html: () => { }, attr: () => { } });
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
        { html: () => { }, attr: () => { } },
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
        { html: () => { }, attr: () => { } },
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

  close(options) {
    if (this._selectionHookId) {
      try {
        Hooks.off('controlToken', this._selectionHookId);
      } catch (_) { }
      this._selectionHookId = null;
    }
    currentSneakDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() {
    return 'sneak-preview-dialog-changes-count';
  }
}
