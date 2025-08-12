import { MODULE_ID, MODULE_TITLE } from "../../constants.js";
import { getVisibilityBetween } from "../../utils.js";
import { getDesiredOverrideStatesForAction } from "../services/data/action-state-config.js";
import {
  filterOutcomesByEncounter
} from "../services/infra/shared-utils.js";
import { BaseActionDialog } from "./base-action-dialog.js";

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
      tag: "form",
      window: {
        title: "Sneak Results",
        icon: "fas fa-user-ninja",
        resizable: true,
        positioned: true,
        minimizable: false,
      },
      position: {
        width: 500,
        height: "auto",
      },
      form: {
        handler: SneakPreviewDialog.formHandler,
        submitOnChange: false,
        closeOnSubmit: false,
      },
      classes: ["sneak-preview-dialog"],
      ...options,
    });

    this.sneakingToken = sneakingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.sneakData = sneakData;
    // Ensure services can resolve the correct handler
    this.actionData = { ...(sneakData || {}), actor: sneakingToken, actionType: "sneak" };
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");
    this.bulkActionState = "initial"; // 'initial', 'applied', 'reverted'

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
      template: "modules/pf2e-visioner/templates/sneak-preview.hbs",
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes with base helper
    let filteredOutcomes = this.applyEncounterFilter(this.outcomes, "token", "No encounter observers found, showing all");

    const cfg = (s) => this.visibilityConfig(s);

    // Process outcomes to add additional properties
    const processedOutcomes = filteredOutcomes.map((outcome) => {
      // Get current visibility state - how this observer sees the sneaking token
      const currentVisibility =
        getVisibilityBetween(outcome.token, this.sneakingToken) ||
        outcome.oldVisibility;

      // Prepare available states for override
      // Sneak can result in hidden or undetected
      const desired = getDesiredOverrideStatesForAction("sneak", outcome);
      const availableStates = this.buildOverrideStates(desired, outcome);

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || currentVisibility;
      // Check if there's an actionable change - either the outcome naturally changed OR user overrode the state
      const hasActionableChange =
        outcome.changed === true ||
        (effectiveNewState && effectiveNewState !== baseOldState);

      return {
        ...outcome,
        outcomeClass: this.getOutcomeClass(outcome.outcome),
        outcomeLabel: this.getOutcomeLabel(outcome.outcome),
        oldVisibilityState: cfg(outcome.oldVisibility || currentVisibility),
        newVisibilityState: cfg(outcome.newVisibility),
        marginText: this.formatMargin(outcome.margin),
        tokenImage: this.resolveTokenImage(outcome.token),
        availableStates: availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange: hasActionableChange,
      };
    });

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange =
          processedOutcome.hasActionableChange;
      }
    });

    // Set sneaker context for template (like Seek dialog)
    context.sneaker = {
      name: this.sneakingToken.name,
      image: this.resolveTokenImage(this.sneakingToken),
      actionType: "sneak",
      actionLabel: "Sneak action results analysis",
    };

    context.sneakingToken = this.sneakingToken;
    context.outcomes = processedOutcomes;
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

  getAvailableStates() {
    return [
      { value: "observed", label: "Observed", icon: "fas fa-eye" },
      { value: "hidden", label: "Hidden", icon: "fas fa-eye-slash" },
      { value: "undetected", label: "Undetected", icon: "fas fa-ghost" },
    ];
  }

  // Use BaseActionDialog outcome helpers
  // Token id in Sneak outcomes is under `token`
  getOutcomeTokenId(outcome) { return outcome?.token?.id ?? null; }

  _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.updateBulkActionButtons();
    this.markInitialSelections();
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
    const container = this.element.querySelector(
      `.override-icons[data-token-id="${tokenId}"]`,
    );
    if (container) {
      container.querySelectorAll(".state-icon").forEach((icon) => {
        icon.classList.remove("selected");
        if (icon.dataset.state === state) {
          icon.classList.add("selected");
        }
      });
    }

    // Update hidden input
    const hiddenInput = this.element.querySelector(
      `input[name="override.${tokenId}"]`,
    );
    if (hiddenInput) {
      hiddenInput.value = state;
    }

    // Update visual selection
    const row = event.currentTarget.closest("tr");
    const icons = row.querySelectorAll(".override-icons .state-icon");
    icons.forEach((i) => i.classList.remove("selected"));
    event.currentTarget.classList.add("selected");

    // Enable the Apply button only if there's actually a change
    const applyButton = row.querySelector(".apply-change");
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
    const actionsCell = this.element.querySelector(
      `tr[data-token-id="${tokenId}"] .actions`,
    );
    if (!actionsCell) return;

    if (hasActionableChange) {
      actionsCell.innerHTML = `
                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                    <i class="fas fa-check"></i>
                </button>
                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                    <i class="fas fa-undo"></i>
                </button>
            `;
    } else {
      actionsCell.innerHTML = '<span class="no-action">No change</span>';
    }

    // ApplicationV2 automatically binds events for elements with data-action attributes
  }

  // Duplicate render methods removed (defined earlier in class)

  static async _onToggleEncounterFilter(event, target) {
    const app = currentSneakDialog;
    if (!app) {
      console.warn("Sneak dialog not found for encounter filter toggle");
      return;
    }

    // Toggle the filter state
    app.encounterOnly = target.checked;

    // Reset bulk action state
    app.bulkActionState = "initial";

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
      const { applyNowSneak } = await import("../services/index.js");
      const overrides = { [tokenId]: effectiveNewState };
      await applyNowSneak({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    } catch (error) {
      console.warn("Error applying visibility changes:", error);
      // Continue execution even if visibility changes fail
    }

    // Update button states
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();

    ui.notifications.info(
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
      // Revert via services to centralize logic
      const { revertNowSneak } = await import("../services/index.js");
      await revertNowSneak(app.actionData, { html: () => {}, attr: () => {} });
    } catch (error) {
      console.warn("Error reverting visibility changes:", error);
      // Continue execution even if visibility changes fail
    }

    // Update button states
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();

    ui.notifications.info(
      `${MODULE_TITLE}: Reverted sneak result - ${outcome.token.name} sees ${app.sneakingToken.name} as ${outcome.oldVisibility}`,
    );
  }

  static async _onApplyAll(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    if (app.bulkActionState === "applied") {
      ui.notifications.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter using shared helper
    const filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "token",
    );

    // Only apply changes to filtered outcomes that have actual changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      return effectiveNewState !== outcome.oldVisibility;
    });

    try {
      const { applyNowSneak } = await import("../services/index.js");
      const overrides = {};
      for (const o of changedOutcomes) {
        const id = o?.token?.id;
        const state = o?.overrideState || o?.newVisibility;
        if (id && state) overrides[id] = state;
      }
      await applyNowSneak({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    } catch (error) {
      console.warn("Error applying visibility changes for bulk apply:", error);
    }

    // Update all affected rows in one go
    app.updateRowButtonsToApplied(
      changedOutcomes.map((o) => ({ target: { id: o.token.id }, hasActionableChange: true }))
    );

    app.bulkActionState = "applied";
    app.updateBulkActionButtons();
    app.updateChangesCount();

    ui.notifications.info(
      `${MODULE_TITLE}: Applied all sneak results (${changedOutcomes.length} changes). Dialog remains open for further adjustments.`,
    );
  }

  static async _onRevertAll(event, button) {
    const app = currentSneakDialog;
    if (!app) return;

    if (app.bulkActionState === "reverted") {
      ui.notifications.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter using shared helper
    const filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "token",
    );

    // Only revert changes to filtered outcomes that have actual changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      return effectiveNewState !== outcome.oldVisibility;
    });

    try {
      const { revertNowSneak } = await import("../services/index.js");
      await revertNowSneak(app.actionData, { html: () => {}, attr: () => {} });
    } catch (error) {
      console.warn("Error reverting visibility changes for bulk revert:", error);
    }

    // Update all affected rows in one go
    app.updateRowButtonsToReverted(
      changedOutcomes.map((o) => ({ target: { id: o.token.id }, hasActionableChange: true }))
    );

    app.bulkActionState = "reverted";
    app.updateBulkActionButtons();
    app.updateChangesCount();

    ui.notifications.info(
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
        Hooks.off("controlToken", this._selectionHookId);
      } catch (_) {}
      this._selectionHookId = null;
    }
    currentSneakDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() { return "sneak-preview-dialog-changes-count"; }
}
