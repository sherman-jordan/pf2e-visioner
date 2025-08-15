/**
 * Seek Preview Dialog for Seek action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from "../../constants.js";
import { getVisibilityBetween } from "../../utils.js";
import { getDesiredOverrideStatesForAction } from "../services/data/action-state-config.js";
import { notify } from "../services/infra/notifications.js";
import {
  filterOutcomesByEncounter,
  filterOutcomesBySeekDistance,
  filterOutcomesByTemplate,
} from "../services/infra/shared-utils.js";
import { BaseActionDialog } from "./base-action-dialog.js";

// Store reference to current seek dialog
let currentSeekDialog = null;

export class SeekPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["seek-preview-dialog"], // Keep same class for CSS compatibility
    window: {
      title: "Seek Results",
      icon: "fas fa-search",
      resizable: true,
    },
    position: {
      width: 600,
      height: "auto",
    },
    actions: {
      close: SeekPreviewDialog._onClose,
      applyAll: SeekPreviewDialog._onApplyAll,
      revertAll: SeekPreviewDialog._onRevertAll,
      applyChange: SeekPreviewDialog._onApplyChange,
      revertChange: SeekPreviewDialog._onRevertChange,
      toggleEncounterFilter: SeekPreviewDialog._onToggleEncounterFilter,
      overrideState: SeekPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: "modules/pf2e-visioner/templates/seek-preview.hbs",
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    // Set window title and icon for seek dialog
    options.window = {
      ...options.window,
      title: "Action Results",
      icon: "fas fa-search",
    };

    super(options);
    this.actorToken = actorToken; // Renamed for clarity
    this.outcomes = outcomes;
    this.changes = changes;
    this.actionData = { ...actionData, actionType: "seek" }; // Store action data, ensuring actionType is always 'seek'

    // Track bulk action states to prevent abuse
    this.bulkActionState = "initial"; // 'initial', 'applied', 'reverted'

    // Track encounter filtering state
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");

    // Set global reference
    currentSeekDialog = this;
  }

  /**
   * Add hover functionality after rendering
   */
    // Hover/selection behavior is provided by BasePreviewDialog

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes with encounter helper, template (if provided), then distance limits if enabled
    let filteredOutcomes = this.applyEncounterFilter(this.outcomes, "target", "No encounter targets found, showing all");
    if (this.actionData.seekTemplateCenter && this.actionData.seekTemplateRadiusFeet) {
      filteredOutcomes = filterOutcomesByTemplate(
        filteredOutcomes,
        this.actionData.seekTemplateCenter,
        this.actionData.seekTemplateRadiusFeet,
        "target",
      );
    }
    filteredOutcomes = filterOutcomesBySeekDistance(filteredOutcomes, this.actorToken, "target");

    // Prepare visibility states using centralized config
    const cfg = (s) => this.visibilityConfig(s);

    // Prepare outcomes for template
    const processedOutcomes = filteredOutcomes.map((outcome) => {
      // Get current visibility state from the token
      const currentVisibility =
        getVisibilityBetween(this.actorToken, outcome.target) ||
        outcome.oldVisibility ||
        outcome.currentVisibility;

      // Prepare available states for override using per-action config
      const desired = getDesiredOverrideStatesForAction("seek");
      const availableStates = this.buildOverrideStates(desired, outcome);

      const effectiveNewState = outcome.overrideState || outcome.newVisibility || currentVisibility;
      const baseOldState = outcome.oldVisibility || currentVisibility;
      // Actionable if original differs from new or override
      const hasActionableChange =
        baseOldState != null &&
        effectiveNewState != null &&
        effectiveNewState !== baseOldState;

      return {
        ...outcome,
        outcomeClass: outcome.noProficiency ? "neutral" : this.getOutcomeClass(outcome.outcome),
        outcomeLabel: outcome.noProficiency ? "No proficiency" : this.getOutcomeLabel(outcome.outcome),
        oldVisibilityState: cfg(baseOldState),
        newVisibilityState: cfg(effectiveNewState),
        marginText: this.formatMargin(outcome.margin),
        tokenImage: this.resolveTokenImage(outcome.target),
        availableStates: availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
        noProficiency: !!outcome.noProficiency,
      };
    });

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange =
          processedOutcome.hasActionableChange;
      }
    });

    // Set actor context for seeker
    context.seeker = {
      name: this.actorToken.name,
      image: this.resolveTokenImage(this.actorToken),
      actionType: "seek",
      actionLabel: "Seek action results analysis",
    };
    context.outcomes = processedOutcomes;
    Object.assign(context, this.buildCommonContext(this.outcomes));

    return context;
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

  /**
   * Called after the application is rendered
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Set initial button states
    this.updateBulkActionButtons();

    // Add icon click handlers
    this.addIconClickHandlers();
    // Mark initial icon selections
    this.markInitialSelections();
  }

  /**
   * Apply all visibility changes
   */
  static async _onApplyAll(event, button) {
    const app = currentSeekDialog;

    if (!app) {
      return;
    }

    // Filter outcomes based on encounter filter using shared helper
    const filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "target",
    );

    // Only apply changes to filtered outcomes
    const actionableOutcomes = filteredOutcomes.filter(
      (outcome) => outcome.hasActionableChange,
    );

    if (actionableOutcomes.length === 0) {
      notify.info("No changes to apply")
      return;
    }

    // Check if Apply All is allowed based on current state
    if (app.bulkActionState === "applied") {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Provide overrides map to services path
    const overrides = {};
    for (const o of actionableOutcomes) {
      const id = o?.target?.id;
      const state = o?.overrideState || o?.newVisibility;
      if (id && state) overrides[id] = state;
    }

    try {
      const { applyNowSeek } = await import("../services/index.js");
      await applyNowSeek({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
      notify.info(
        `${MODULE_TITLE}: Applied ${actionableOutcomes.length} visibility changes. Dialog remains open for additional actions.`,
      );

      // Update individual row buttons to show applied state
      app.updateRowButtonsToApplied(actionableOutcomes);

      // Update bulk action state and buttons
      app.bulkActionState = "applied";
      app.updateBulkActionButtons();
      app.updateChangesCount();

      // Don't close dialog - allow user to continue working
    } catch (error) {
      notify.error(`${MODULE_TITLE}: Error applying changes.`);
    }
  }

  /**
   * Revert all changes to original state
   */
  static async _onRevertAll(event, button) {
    const app = currentSeekDialog;
    if (!app) return;

    try {
      const changedOutcomes = app.outcomes.filter(
        (outcome) => outcome.changed && outcome.hasActionableChange,
      );

      const { revertNowSeek } = await import("../services/index.js");
      await revertNowSeek(app.actionData, { html: () => {}, attr: () => {} });

      app.updateRowButtonsToReverted(changedOutcomes);
      app.bulkActionState = "reverted";
      app.updateBulkActionButtons();
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error reverting changes:`, error);
      notify.error(`${MODULE_TITLE}: Error reverting changes.`);
    }
  }

  /**
   * Apply individual visibility change
   */
  static async _onApplyChange(event, button) {
    const app = currentSeekDialog;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome || !outcome.hasActionableChange) {
      notify.warn(
        `${MODULE_TITLE}: No change to apply for this token`,
      );
      return;
    }

    try {
      const { applyNowSeek } = await import("../services/index.js");
      const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
      await applyNowSeek({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

      app.updateRowButtonsToApplied([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      notify.error(`${MODULE_TITLE}: Error applying change.`);
    }
  }

  /**
   * Revert individual token to original state
   */
  static async _onRevertChange(event, button) {
    const app = currentSeekDialog;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: Token not found`);
      return;
    }

    try {
      const { revertNowSeek } = await import("../services/index.js");
      await revertNowSeek(app.actionData, { html: () => {}, attr: () => {} });
      app.updateRowButtonsToReverted([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      notify.error(`${MODULE_TITLE}: Error reverting change.`);
    }
  }

  /**
   * Update the changes count display dynamically
   */
  // removed: updateChangesCount duplicated; using BaseActionDialog implementation

  /**
   * Override close to clear global reference
   */
  close(options) {
    // Clean up only auto-created preview templates (not manual, which we delete immediately on placement)
    try {
      if (this.templateId && canvas.scene && !this.templateCenter) {
        const doc =
          canvas.scene.templates?.get?.(this.templateId) ||
          canvas.scene.getEmbeddedDocument?.(
            "MeasuredTemplate",
            this.templateId,
          );
        if (doc) {
          canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [
            this.templateId,
          ]);
        }
      }
    } catch (e) {
      console.warn("Failed to remove Seek preview template:", e);
    }
    // Remove selection hook
    if (this._selectionHookId) {
      try {
        Hooks.off("controlToken", this._selectionHookId);
      } catch (_) {}
      this._selectionHookId = null;
    }
    currentSeekDialog = null;
    return super.close(options);
  }

  /**
   * Apply visibility changes using the shared utility function
   * @param {Token} seeker - The seeker token
   * @param {Array} changes - Array of change objects
   * @param {Object} options - Additional options
   * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
   */
  // Use BaseActionDialog.applyVisibilityChanges

  getChangesCounterClass() {
    return "seek-preview-dialog-changes-count";
  }

  // Token id in Seek outcomes is under `target`
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  /**
   * Update individual row buttons to show applied state
   */
  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  /**
   * Update individual row buttons to show reverted state
   */
  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  /**
   * Update bulk action button states based on current bulk action state
   */
  // removed: updateBulkActionButtons duplicated; using BaseActionDialog implementation

  /**
   * Toggle encounter filtering and refresh results
   */
  static async _onToggleEncounterFilter(event, button) {
    const app = currentSeekDialog;
    if (!app) return;

    // Toggle filter and re-render; context preparation applies encounter filter
    app.encounterOnly = !app.encounterOnly;
    app.bulkActionState = "initial";
    app.render({ force: true });
  }

  /**
   * Add click handlers for state icon selection
   */
  // removed: addIconClickHandlers duplicated; using BaseActionDialog implementation

  /**
   * Update action buttons visibility for a specific token
   */
  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }

  /**
   * Handle state override action (for potential future use)
   */
  static async _onOverrideState(event, button) {
    const app = currentSeekDialog;
    if (!app) return;

    const targetId = button.dataset.target;
    const newState = button.dataset.state;
    // This method is available for future enhancements if needed
  }

  /**
   * Handle close action
   */
  static _onClose(event, button) {
    const app = currentSeekDialog;
    if (app) {
      app.close();
      currentSeekDialog = null; // Clear reference when closing
    }
  }
}
