/**
 * Point Out Preview Dialog for Point Out action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from "../../constants.js";
import { getDesiredOverrideStatesForAction } from "../services/data/action-state-config.js";
import { notify } from "../services/infra/notifications.js";
import {
  filterOutcomesByEncounter
} from "../services/infra/shared-utils.js";
import { BaseActionDialog } from "./base-action-dialog.js";
// Logic now handled via services action handler; no direct logic imports

// Store reference to current dialog (shared with SeekPreviewDialog)
let currentPointOutDialog = null;

export class PointOutPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["point-out-preview-dialog"],
    window: {
      title: "Point Out Results",
      icon: "fas fa-hand-point-right",
      resizable: true,
    },
    position: {
      width: 600,
      height: "auto",
    },
    actions: {
      close: PointOutPreviewDialog._onClose,
      applyAll: PointOutPreviewDialog._onApplyAll,
      revertAll: PointOutPreviewDialog._onRevertAll,
      applyChange: PointOutPreviewDialog._onApplyChange,
      revertChange: PointOutPreviewDialog._onRevertChange,
      toggleEncounterFilter: PointOutPreviewDialog._onToggleEncounterFilter,
    },
  };

  static PARTS = {
    content: {
      template: "modules/pf2e-visioner/templates/point-out-preview.hbs",
    },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    super(options);
    this.actorToken = actorToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.actionData = actionData;
    this.bulkActionState = "initial";
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");

    // Set global reference
    currentPointOutDialog = this;
  }

  /**
   * Add hover functionality after rendering
   */
  // Hover/selection behavior is provided by BasePreviewDialog

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes with base helper
    let filteredOutcomes = this.applyEncounterFilter(this.outcomes, "target", "No encounter allies found, showing all");

    const cfg = (s) => this.visibilityConfig(s);

    const processedOutcomes = filteredOutcomes.map((outcome) => {
      const desired = getDesiredOverrideStatesForAction("point-out");
      const availableStates = { hidden: this.buildOverrideStates(desired, outcome)[0] };

      const effectiveNewState = outcome.overrideState || outcome.newVisibility;
      const baseOldState = outcome.oldVisibility || outcome.currentVisibility;
      const hasActionableChange =
        baseOldState != null && effectiveNewState != null && effectiveNewState !== baseOldState;

      return {
        ...outcome,
        oldVisibilityState: cfg(baseOldState),
        newVisibilityState: cfg(effectiveNewState),
        tokenImage: this.resolveTokenImage(outcome.target),
        availableStates,
        overrideState: outcome.overrideState || outcome.newVisibility,
        hasActionableChange,
      };
    });

    // Update original outcomes with hasActionableChange for Apply All button logic
    processedOutcomes.forEach((processedOutcome, index) => {
      if (this.outcomes[index]) {
        this.outcomes[index].hasActionableChange =
          processedOutcome.hasActionableChange;
      }
    });

    context.actorName = this.actorToken.name;
    context.actorImage = this.resolveTokenImage(this.actorToken);
    context.outcomes = processedOutcomes;
    context.changes = this.changes;
    Object.assign(context, this.buildCommonContext(this.outcomes));

    // Add target name and DC if all outcomes point to the same target
    if (processedOutcomes.length > 0) {
      const firstTargetToken = processedOutcomes[0].targetToken;
      const allSameTarget = processedOutcomes.every(
        (outcome) => outcome.targetToken?.id === firstTargetToken?.id,
      );
      if (allSameTarget && firstTargetToken) {
        context.targetName = firstTargetToken.name;
        context.targetDC = processedOutcomes[0].dc;
      }
    }

    return context;
  }

  async _renderHTML(context, options) {
    return await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    return content;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.updateBulkActionButtons();
    this.addIconClickHandlers();
    this.markInitialSelections();

    // Ping the exact token pointed at in the chat message (speaker's target), if available
    try {
      if (game.user.isGM) {
        // Best effort: use first outcome's targetToken if present; otherwise fall back to flags
        let token = this.outcomes?.[0]?.targetToken || null;
        if (!token) {
          const msg = game.messages.get(this?.actionData?.messageId);
          const pointOutFlags = msg?.flags?.["pf2e-visioner"]?.pointOut;
          const targetTokenId = pointOutFlags?.targetTokenId || this?.actionData?.context?.target?.token || msg?.flags?.pf2e?.target?.token;
          if (targetTokenId) token = canvas.tokens.get(targetTokenId) || null;
        }
        if (token) {
          import("../services/gm-ping.js").then(({ pingTokenCenter }) => {
            try { pingTokenCenter(token, "Point Out Target"); } catch (_) {}
          });
        }
      }
    } catch (_) {}
  }

  // Token id in Point Out outcomes is under `target`
  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  // Point Out specific action methods
  static async _onClose(event, button) {
    const app = currentPointOutDialog;
    if (app) {
      app.close();
    }
  }

  static async _onApplyAll(event, button) {
    const app = currentPointOutDialog;
    if (!app || app.bulkActionState === "applied") {
      if (app.bulkActionState === "applied") {
        notify.warn(
          `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
        );
      }
      return;
    }

    try {
      // Filter outcomes based on encounter filter using shared helper
      let filteredOutcomes = filterOutcomesByEncounter(
        app.changes,
        app.encounterOnly,
        "target",
      );

      // Apply ally filtering if ignore allies is enabled
      try {
        const { filterOutcomesByAllies } = await import("../services/infra/shared-utils.js");
        filteredOutcomes = filterOutcomesByAllies(filteredOutcomes, app.actorToken, app.ignoreAllies, "target");
      } catch (_) {}

      // Only apply changes to filtered outcomes
      const changedOutcomes = filteredOutcomes.filter(
        (change) => change.hasActionableChange !== false,
      );

      // Make sure each outcome has the targetToken property
      const processedOutcomes = changedOutcomes.map((outcome) => {
        // If outcome doesn't have targetToken, try to get it from the original outcome
        if (!outcome.targetToken) {
          const originalOutcome = app.outcomes.find(
            (o) => o.target.id === outcome.target.id,
          );
          if (originalOutcome && originalOutcome.targetToken) {
            return { ...outcome, targetToken: originalOutcome.targetToken };
          }
        }
        return outcome;
      });

      // Provide overrides map to services path (ally id → newVisibility). Point Out uses special mapping in handler.
      const overrides = {};
      for (const o of processedOutcomes) {
        const id = o?.target?.id;
        const state = o?.overrideState || o?.newVisibility;
        if (id && state) overrides[id] = state;
      }
      const { applyNowPointOut } = await import("../services/index.js");
      await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

      app.bulkActionState = "applied";
      app.updateBulkActionButtons();
      app.updateRowButtonsToApplied(app.outcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })));
      app.updateChangesCount();

      notify.info(
        `${MODULE_TITLE}: Applied Point Out changes for ${processedOutcomes.length} allies. Dialog remains open for further adjustments.`,
      );
    } catch (error) {
      console.error(
        `${MODULE_TITLE}: Error applying Point Out changes:`,
        error,
      );
      notify.error(
        `${MODULE_TITLE}: Failed to apply Point Out changes`,
      );
    }
  }

  static async _onRevertAll(event, button) {
    const app = currentPointOutDialog;
    if (!app || app.bulkActionState === "reverted") {
      if (app.bulkActionState === "reverted") {
        notify.warn(
          `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
        );
      }
      return;
    }

    try {
      // Filter outcomes based on encounter filter using shared helper
      let filteredOutcomes = filterOutcomesByEncounter(
        app.changes,
        app.encounterOnly,
        "target",
      );

      // Apply ally filtering if ignore allies is enabled
      try {
        const { filterOutcomesByAllies } = await import("../services/infra/shared-utils.js");
        filteredOutcomes = filterOutcomesByAllies(filteredOutcomes, app.actorToken, app.ignoreAllies, "target");
      } catch (_) {}

      // Only revert changes to filtered outcomes
      const changedOutcomes = filteredOutcomes.map((change) => {
        // Make sure to include targetToken in the change
        const originalOutcome = app.outcomes.find(
          (o) => o.target.id === change.target.id,
        );
        return {
          ...change,
          targetToken: originalOutcome?.targetToken || change.targetToken,
          newVisibility: change.oldVisibility || change.currentVisibility, // Revert to original state
        };
      });

      const { revertNowPointOut } = await import("../services/index.js");
      await revertNowPointOut(app.actionData, { html: () => {}, attr: () => {} });

      app.bulkActionState = "reverted";
      app.updateBulkActionButtons();
      app.updateRowButtonsToReverted(app.outcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true })));
      app.updateChangesCount();
    } catch (error) {
      console.error(
        `${MODULE_TITLE}: Error reverting Point Out changes:`,
        error,
      );
      notify.error(
        `${MODULE_TITLE}: Failed to revert Point Out changes`,
      );
    }
  }

  static async _onToggleEncounterFilter(event, button) {
    const app = currentPointOutDialog;
    if (!app) return;

    app.encounterOnly = !app.encounterOnly;

    // Toggle filter and re-render; action handler context prep will apply filter
    app.encounterOnly = !app.encounterOnly;
    app.bulkActionState = "initial";
    app.bulkActionState = "initial";
    app.render({ force: true });
  }

  /**
   * Apply individual visibility change
   */
  static async _onApplyChange(event, button) {
    const app = currentPointOutDialog;
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
      const overrides = { [outcome.target.id]: outcome.overrideState || outcome.newVisibility };
      const { applyNowPointOut } = await import("../services/index.js");
      await applyNowPointOut({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });

      // Update row using base helper
      app.updateRowButtonsToApplied([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error applying change.`, error);
      notify.error(`${MODULE_TITLE}: Error applying change.`);
    }
  }

  /**
   * Revert individual token to original state
   */
  static async _onRevertChange(event, button) {
    const app = currentPointOutDialog;
    if (!app) return;

    const tokenId = button.dataset.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);

    if (!outcome) {
      notify.warn(`${MODULE_TITLE}: Token not found`);
      return;
    }

    const revertChange = {
      target: outcome.target,
      targetToken: outcome.targetToken, // Include the targetToken for Point Out
      newVisibility: outcome.oldVisibility || outcome.currentVisibility,
      changed: true,
    };

    try {
      const { revertNowPointOut } = await import("../services/index.js");
      await revertNowPointOut(app.actionData, { html: () => {}, attr: () => {} });

      // Update row using base helper
      app.updateRowButtonsToReverted([{ target: { id: outcome.target.id }, hasActionableChange: true }]);
      app.updateChangesCount();
    } catch (error) {
      console.error(`${MODULE_TITLE}: Error reverting change.`, error);
      notify.error(`${MODULE_TITLE}: Error reverting change.`);
    }
  }

  // Use BaseActionDialog.updateChangesCount
  close(options) {
    if (this._selectionHookId) {
      try {
        Hooks.off("controlToken", this._selectionHookId);
      } catch (_) {}
      this._selectionHookId = null;
    }
    currentPointOutDialog = null;
    return super.close(options);
  }

  getChangesCounterClass() { return "point-out-preview-dialog-changes-count"; }

  // Use services path for apply/revert; no custom applyVisibilityChanges override needed

  // removed: bulk row-button helpers; using BaseActionDialog batch helpers

  // removed: updateRowButtonsToApplied duplicated; using BaseActionDialog implementation

  // removed: updateRowButtonsToReverted duplicated; using BaseActionDialog implementation

  // Use BaseActionDialog.updateBulkActionButtons

  // Use BaseActionDialog.addIconClickHandlers

  updateActionButtonsForToken(tokenId, hasActionableChange) {
    // Delegate to base which renders Apply/Revert or "No Change"
    super.updateActionButtonsForToken(tokenId, hasActionableChange);
  }
}
