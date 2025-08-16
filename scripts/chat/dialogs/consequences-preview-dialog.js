/**
 * Consequences Preview Dialog
 * Shows consequences of damage rolls from hidden/undetected tokens with GM override capability
 */

import { MODULE_ID, MODULE_TITLE } from "../../constants.js";
import { getDesiredOverrideStatesForAction } from "../services/data/action-state-config.js";
import { getVisibilityStateConfig } from "../services/data/visibility-states.js";
import { notify } from "../services/infra/notifications.js";
import {
  filterOutcomesByEncounter
} from "../services/infra/shared-utils.js";
import { BaseActionDialog } from "./base-action-dialog.js";

// Store reference to current consequences dialog
let currentConsequencesDialog = null;

export class ConsequencesPreviewDialog extends BaseActionDialog {
  constructor(attackingToken, outcomes, changes, damageData, options = {}) {
    super(options);

    this.attackingToken = attackingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.damageData = damageData;
    // Ensure actionData exists for apply/revert services
    this.actionData = options.actionData || {
      actor: attackingToken,
      actionType: "consequences",
      damageData,
    };
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");
    this.bulkActionState = "initial"; // 'initial', 'applied', 'reverted'

    // Set global reference
    currentConsequencesDialog = this;
  }

  // Token id in Consequences outcomes is under `target`
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["consequences-preview-dialog"],
    window: {
      title: `Damage Consequences Results`,
      icon: "fas fa-skull",
      resizable: true,
    },
    position: {
      width: 520,
      height: "auto",
    },
    actions: {
      applyChange: ConsequencesPreviewDialog._onApplyChange,
      revertChange: ConsequencesPreviewDialog._onRevertChange,
      applyAll: ConsequencesPreviewDialog._onApplyAll,
      revertAll: ConsequencesPreviewDialog._onRevertAll,
      toggleEncounterFilter: ConsequencesPreviewDialog._onToggleEncounterFilter,
      overrideState: ConsequencesPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: {
      template: "modules/pf2e-visioner/templates/consequences-preview.hbs",
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes with base helper
    let processedOutcomes = this.applyEncounterFilter(this.outcomes, "target", "No encounter targets found, showing all");

    // Prepare outcomes with additional UI data (and normalize shape)
    processedOutcomes = processedOutcomes.map((outcome) => {
      const effectiveNewState = outcome.overrideState || "observed"; // Default to observed
      const baseOldState = outcome.currentVisibility;
      const hasActionableChange = baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;
      // Build override icon states for the row
      const desired = getDesiredOverrideStatesForAction("consequences");
      const availableStates = this.buildOverrideStates(desired, { ...outcome, newVisibility: effectiveNewState }, { selectFrom: "overrideState", calcFrom: "newVisibility" });
      return {
        ...outcome,
        // Normalize to match BaseActionDialog helpers
        newVisibility: effectiveNewState,
        hasActionableChange,
        overrideState: outcome.overrideState || null,
        tokenImage: this.resolveTokenImage(outcome.target),
        oldVisibilityState: getVisibilityStateConfig(baseOldState),
        newVisibilityState: getVisibilityStateConfig(effectiveNewState),
        availableStates,
      };
    });

    // Prepare attacking token with proper image path
    context.attackingToken = {
      ...this.attackingToken,
      image: this.resolveTokenImage(this.attackingToken),
    };
    context.outcomes = processedOutcomes;

    // Keep internal outcomes annotated where relevant (e.g., hasActionableChange)
    try {
      // Map by token id for safe synchronization
      const byId = new Map(processedOutcomes.map((o) => [o?.target?.id, o]));
      for (const o of this.outcomes) {
        const pid = o?.target?.id;
        if (!pid) continue;
        const po = byId.get(pid);
        if (po) {
          o.hasActionableChange = po.hasActionableChange;
          // Provide a default newVisibility so Base markInitialSelections works
          o.newVisibility = po.newVisibility;
        }
      }
    } catch (_) {}

    // Log the number of changes for debugging
    Object.assign(context, this.buildCommonContext(processedOutcomes));

    return context;
  }

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
   * Calculate if there's an actionable change (considering overrides)
   */
  calculateHasActionableChange(outcome) {
    // Check if the override state is different from the current state
    const effectiveNewState = outcome.overrideState || "observed";
    return effectiveNewState !== outcome.currentVisibility;
  }

  /**
   * Handle render event
   */
  async _onRender(options) {
    await super._onRender(options);

    // Initialize encounter filter state
    const encounterFilter = this.element.querySelector(
      'input[data-action="toggleEncounterFilter"]',
    );
    if (encounterFilter) {
      encounterFilter.checked = this.encounterOnly;
    }

    // Initialize bulk action buttons and handlers
    this.updateBulkActionButtons();
    this.addIconClickHandlers();
    this.markInitialSelections();
  }

  /**
   * Add hover listeners to highlight tokens on canvas when hovering over rows
   */
  // Selection highlight handled by BasePreviewDialog

  getChangesCounterClass() { return "consequences-preview-dialog-changes-count"; }

  /**
   * Handle individual apply change
   */
  static async _onApplyChange(event, button) {
    const app = currentConsequencesDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;

    const effectiveNewState = outcome.overrideState || "observed";
    try {
      const { applyNowConsequences } = await import("../services/index.js");
      const overrides = { [outcome.target.id]: effectiveNewState };
      await applyNowConsequences({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    } catch (_) {}

    // Update button states
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  /**
   * Handle individual revert change
   */
  static async _onRevertChange(event, button) {
    const app = currentConsequencesDialog;
    if (!app) return;
    const tokenId = button?.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;

    try {
      const { revertNowConsequences } = await import("../services/index.js");
      await revertNowConsequences(app.actionData, { html: () => {}, attr: () => {} });
    } catch (_) {}

    // Update button states
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]);
    app.updateChangesCount();
  }

  /**
   * Handle apply all changes
   */
  static async _onApplyAll(event, target) {
    // Get the dialog instance
    const app = currentConsequencesDialog;
    if (!app) {
      console.error("Consequences Dialog not found");
      return;
    }

    if (app.bulkActionState === "applied") {
      notify.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    let filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "target",
    );

    // Apply ally filtering if ignore allies is enabled
    try {
      const { filterOutcomesByAllies } = await import("../services/infra/shared-utils.js");
      filteredOutcomes = filterOutcomesByAllies(filteredOutcomes, app.actorToken, app.ignoreAllies, "target");
    } catch (_) {}

    // Only apply changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
      return;
    }

    const overrides = {};
    for (const o of changedOutcomes) {
      const id = o?.target?.id;
      const state = o?.overrideState || "observed";
      if (id && state) overrides[id] = state;
    }
    const { applyNowConsequences } = await import("../services/index.js");
    await applyNowConsequences({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

    // Update UI for each row
    for (const outcome of changedOutcomes) {
      app.updateRowButtonsToApplied([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
    }

    app.bulkActionState = "applied";
    app.updateBulkActionButtons();
    app.updateChangesCount();

    notify.info(
      `${MODULE_TITLE}: Applied all visibility changes. Dialog remains open for further adjustments.`,
    );
  }

  /**
   * Handle revert all changes
   */
  static async _onRevertAll(event, target) {
    // Get the dialog instance
    const app = currentConsequencesDialog;
    if (!app) {
      console.error("Consequences Dialog not found");
      return;
    }

    if (app.bulkActionState === "reverted") {
      notify.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    let filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "target",
    );

    // Apply ally filtering if ignore allies is enabled
    try {
      const { filterOutcomesByAllies } = await import("../services/infra/shared-utils.js");
      filteredOutcomes = filterOutcomesByAllies(filteredOutcomes, app.actorToken, app.ignoreAllies, "target");
    } catch (_) {}

    // Only revert changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      notify.warn(
        `${MODULE_TITLE}: No visibility changes to revert.`,
      );
      return;
    }

    const { revertNowConsequences } = await import("../services/index.js");
    await revertNowConsequences(app.actionData, { html: () => {}, attr: () => {} });
    for (const outcome of changedOutcomes) {
      app.updateRowButtonsToReverted([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
    }

    app.bulkActionState = "reverted";
    app.updateBulkActionButtons();
    app.updateChangesCount();
  }

  /**
   * Handle encounter filter toggle
   */
  static async _onToggleEncounterFilter(event, target) {
    const app = currentConsequencesDialog;
    if (!app) return;
    app.encounterOnly = target.checked;

    // Re-render with new filter
    await app.render({ force: true });
  }

  /**
   * Handle visibility state override - not used directly, handled by icon click handlers
   */
  static async _onOverrideState(event, target) {
    // This is a placeholder for compatibility with the action system
    // The actual implementation is in the icon click handlers
  }

  // Use base implementations for selection, bulk button state, and icon handlers
  async applyVisibilityChange(_targetToken, _newVisibility) {}

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
