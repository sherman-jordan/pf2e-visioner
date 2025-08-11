/**
 * Consequences Preview Dialog
 * Shows consequences of damage rolls from hidden/undetected tokens with GM override capability
 */

import { MODULE_ID, MODULE_TITLE } from "../constants.js";
import { hasActiveEncounter } from "../utils.js";
import {
  applyVisibilityChanges,
  filterOutcomesByEncounter,
} from "./shared-utils.js";

// Store reference to current consequences dialog
let currentConsequencesDialog = null;

export class ConsequencesPreviewDialog extends foundry.applications.api
  .ApplicationV2 {
  constructor(attackingToken, outcomes, changes, damageData, options = {}) {
    super(options);

    this.attackingToken = attackingToken;
    this.outcomes = outcomes;
    this.changes = changes;
    this.damageData = damageData;
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");
    this.bulkActionState = "initial"; // 'initial', 'applied', 'reverted'

    // Set global reference
    currentConsequencesDialog = this;
  }

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

    // Filter outcomes based on encounter filter using the shared utility function
    let processedOutcomes = filterOutcomesByEncounter(
      this.outcomes,
      this.encounterOnly,
      "target",
    );

    // Auto-uncheck if no encounter tokens found
    if (
      processedOutcomes.length === 0 &&
      this.encounterOnly &&
      hasActiveEncounter()
    ) {
      this.encounterOnly = false;
      processedOutcomes = this.outcomes;
      ui.notifications.info(
        `${MODULE_TITLE}: No encounter targets found, showing all`,
      );
    }

    // Prepare outcomes with additional UI data
    processedOutcomes = processedOutcomes.map((outcome) => {
      // Make sure we consider both the changed flag and state differences
      const effectiveNewState = outcome.overrideState || "observed"; // Default to observed
      const hasChange = effectiveNewState !== outcome.currentVisibility;
      const hasActionableChange = hasChange;

      return {
        ...outcome,
        hasActionableChange,
        overrideState: outcome.overrideState || null,
        tokenImage:
          outcome.target.document?.texture?.src ||
          outcome.target.img ||
          "icons/svg/mystery-man.svg",
      };
    });

    // Prepare attacking token with proper image path
    context.attackingToken = {
      ...this.attackingToken,
      image:
        this.attackingToken.document?.texture?.src ||
        this.attackingToken.img ||
        "icons/svg/mystery-man.svg",
    };
    context.outcomes = processedOutcomes;

    // Log the number of changes for debugging
    const changesCount = processedOutcomes.filter(
      (outcome) => outcome.hasActionableChange,
    ).length;
    context.changesCount = changesCount;
    context.totalCount = processedOutcomes.length;
    context.showEncounterFilter = hasActiveEncounter();
    context.encounterOnly = this.encounterOnly;

    return context;
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await renderTemplate(
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

    // Initialize bulk action buttons state
    this.updateBulkActionButtons();

    // Selection-based highlighting parity
    this._applySelectionHighlight();
    if (!this._selectionHookId) {
      this._selectionHookId = Hooks.on("controlToken", () =>
        this._applySelectionHighlight(),
      );
    }

    // Add icon click handlers
    this.addIconClickHandlers();

    // Mark initial selections
    this.markInitialSelections();
  }

  /**
   * Add hover listeners to highlight tokens on canvas when hovering over rows
   */
  _applySelectionHighlight() {
    try {
      this.element
        .querySelectorAll("tr.token-row.row-hover")
        ?.forEach((el) => el.classList.remove("row-hover"));
      const selected = Array.from(canvas?.tokens?.controlled ?? []);
      if (!selected.length) return;
      let firstRow = null;
      for (const tok of selected) {
        const row = this.element.querySelector(
          `tr[data-token-id=\"${tok.id}\"]`,
        );
        if (row) {
          row.classList.add("row-hover");
          if (!firstRow) firstRow = row;
        }
      }
      if (firstRow && typeof firstRow.scrollIntoView === "function") {
        firstRow.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
    } catch (_) {}
  }

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
    await app.applyVisibilityChange(outcome.target, effectiveNewState);

    // Update button states
    app.updateRowButtonsToApplied(tokenId);
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

    await app.applyVisibilityChange(outcome.target, outcome.currentVisibility);

    // Update button states
    app.updateRowButtonsToReverted(tokenId);
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
      ui.notifications.warn(
        `${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    const filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "target",
    );

    // Only apply changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      ui.notifications.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
      return;
    }

    // Apply changes one by one to ensure each target gets the correct effect
    for (const outcome of changedOutcomes) {
      const effectiveNewState = outcome.overrideState || "observed";

      // For damage consequences, the target token should see the attacking token as observed
      await applyVisibilityChanges(
        outcome.target,
        [
          {
            target: app.attackingToken,
            newVisibility: effectiveNewState,
          },
        ],
        {
          direction: "observer_to_target",
          durationRounds: 0,
          initiative: true,
          skipEphemeralUpdate: false, // Ensure ephemeral effects are created
          skipCleanup: true, // Skip cleanup to prevent removing previous effects
        },
      );
    }

    // Update UI for each row
    for (const outcome of changedOutcomes) {
      app.updateRowButtonsToApplied(outcome.target.id);
    }

    app.bulkActionState = "applied";
    app.updateBulkActionButtons();

    ui.notifications.info(
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
      ui.notifications.warn(
        `${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`,
      );
      return;
    }

    // Filter outcomes based on encounter filter
    const filteredOutcomes = filterOutcomesByEncounter(
      app.outcomes,
      app.encounterOnly,
      "target",
    );

    // Only revert changes to filtered outcomes that have actionable changes
    const changedOutcomes = filteredOutcomes.filter((outcome) => {
      return outcome.hasActionableChange;
    });

    if (changedOutcomes.length === 0) {
      ui.notifications.warn(
        `${MODULE_TITLE}: No visibility changes to revert.`,
      );
      return;
    }

    for (const outcome of changedOutcomes) {
      await app.applyVisibilityChange(
        outcome.target,
        outcome.currentVisibility,
      );
      app.updateRowButtonsToReverted(outcome.target.id);
    }

    app.bulkActionState = "reverted";
    app.updateBulkActionButtons();
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

  /**
   * Apply visibility change to a token using the shared utility function
   * @param {Token} targetToken - The target token
   * @param {string} newVisibility - The new visibility state
   */
  async applyVisibilityChange(targetToken, newVisibility) {
    try {
      // For damage consequences, the target token should see the attacking token
      await applyVisibilityChanges(
        targetToken,
        [
          {
            target: this.attackingToken,
            newVisibility: newVisibility,
          },
        ],
        {
          direction: "observer_to_target", // Target sees attacking token
          durationRounds: 0, // Set to 0 to use initiative value
          initiative: true,
        },
      );
    } catch (error) {
      console.error(
        `${MODULE_TITLE}: Error applying visibility change:`,
        error,
      );
      ui.notifications.error(
        `${MODULE_TITLE}: Failed to apply visibility change`,
      );
    }
  }

  /**
   * Update row buttons to applied state
   */
  updateRowButtonsToApplied(tokenId) {
    const row = this.element
      .querySelector(`[data-token-id="${tokenId}"]`)
      .closest("tr");
    const applyBtn = row.querySelector(".row-action-btn.apply-change");
    const revertBtn = row.querySelector(".row-action-btn.revert-change");

    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.classList.add("applied");
      applyBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
      applyBtn.title = "Applied";
    }

    if (revertBtn) {
      revertBtn.disabled = false;
      revertBtn.classList.remove("reverted");
      revertBtn.innerHTML = '<i class="fas fa-undo"></i>';
      revertBtn.title = "Revert to original visibility";
    }
  }

  /**
   * Update row buttons to reverted state
   */
  updateRowButtonsToReverted(tokenId) {
    const row = this.element
      .querySelector(`[data-token-id="${tokenId}"]`)
      .closest("tr");
    const applyBtn = row.querySelector(".row-action-btn.apply-change");
    const revertBtn = row.querySelector(".row-action-btn.revert-change");

    if (revertBtn) {
      revertBtn.disabled = true;
      revertBtn.classList.add("reverted");
      revertBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
      revertBtn.title = "Reverted";
    }

    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.classList.remove("applied");
      applyBtn.innerHTML = '<i class="fas fa-check"></i>';
      applyBtn.title = "Apply visibility change";
    }
  }

  /**
   * Update bulk action buttons based on state
   */
  updateBulkActionButtons() {
    const applyAllButton = this.element.querySelector(
      "button.consequences-preview-dialog-bulk-action-btn.apply-all",
    );
    const revertAllButton = this.element.querySelector(
      "button.consequences-preview-dialog-bulk-action-btn.revert-all",
    );

    if (!applyAllButton || !revertAllButton) {
      console.warn("Consequences Dialog: Bulk action buttons not found");
      return;
    }

    switch (this.bulkActionState) {
      case "initial":
        applyAllButton.disabled = false;
        applyAllButton.innerHTML =
          '<i class="fas fa-check-circle"></i> Apply All';
        revertAllButton.disabled = true;
        revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
        break;

      case "applied":
        applyAllButton.disabled = true;
        applyAllButton.innerHTML =
          '<i class="fas fa-check-circle"></i> Applied';
        revertAllButton.disabled = false;
        revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
        break;

      case "reverted":
        applyAllButton.disabled = false;
        applyAllButton.innerHTML =
          '<i class="fas fa-check-circle"></i> Apply All';
        revertAllButton.disabled = true;
        revertAllButton.innerHTML = '<i class="fas fa-undo-alt"></i> Reverted';
        break;
    }
  }

  /**
   * Mark the initial calculated outcomes as selected
   * This is called after rendering to ensure the correct icons are selected
   */
  markInitialSelections() {
    // First, remove all special classes from all icons
    const allIcons = this.element.querySelectorAll(
      ".state-selection .state-icon",
    );
    allIcons.forEach((icon) => {
      icon.classList.remove("selected");
      icon.classList.remove("initial-outcome");
    });

    // Then apply the correct classes for each outcome
    this.outcomes.forEach((outcome) => {
      // Default to observed if no override state is set
      const effectiveState = outcome.overrideState || "observed";

      // Mark the calculated outcome as selected in the UI
      const row = this.element.querySelector(
        `tr[data-token-id="${outcome.target.id}"]`,
      );
      if (row) {
        // Find the icon for the effective state
        const selectedIcon = row.querySelector(
          `.state-selection .state-icon[data-state="${effectiveState}"]`,
        );
        if (selectedIcon) {
          // Add selected class
          selectedIcon.classList.add("selected");

          // Add initial-outcome class to observed state when it's the default
          if (effectiveState === "observed" && !outcome.overrideState) {
            selectedIcon.classList.add("initial-outcome");
          }
        }

        // Update hidden input
        const hiddenInput = row.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          hiddenInput.value = effectiveState;
        }
      }
    });

    // Force a repaint to ensure animations start properly
    setTimeout(() => {
      const initialIcons = this.element.querySelectorAll(
        ".state-selection .state-icon.initial-outcome",
      );
      initialIcons.forEach((icon) => {
        // Force repaint by temporarily removing and re-adding the class
        icon.classList.remove("initial-outcome");
        void icon.offsetWidth; // Force reflow
        icon.classList.add("initial-outcome");
      });
    }, 10);
  }

  /**
   * Update action buttons for a specific token
   */
  updateActionButtonsForToken(tokenId, hasActionableChange) {
    const row = this.element
      .querySelector(`[data-token-id="${tokenId}"]`)
      .closest("tr");
    const actionButtons = row.querySelector(".action-buttons");

    if (hasActionableChange) {
      actionButtons.style.display = "";
    } else {
      actionButtons.style.display = "none";
    }
  }

  /**
   * Add click handlers for state icons
   */
  addIconClickHandlers() {
    // Target all state icons in the state-selection container
    const icons = this.element.querySelectorAll(".state-selection .state-icon");

    icons.forEach((icon) => {
      // Remove existing click handler to prevent duplicates
      icon.removeEventListener("click", icon._clickHandler);

      // Create a new click handler
      icon._clickHandler = (event) => {
        const tokenId = event.currentTarget.dataset.tokenId;
        const state = event.currentTarget.dataset.state;
        if (tokenId && state) {
          // Find the outcome for this token
          const outcome = this.outcomes.find((o) => o.target.id === tokenId);
          if (!outcome) {
            console.error(
              `${MODULE_TITLE}: Could not find outcome for token ${tokenId}`,
            );
            return;
          }

          // Update the override state
          outcome.overrideState = state;

          // Update visual selection in the UI
          const row = event.currentTarget.closest("tr");
          const icons = row.querySelectorAll(".state-selection .state-icon");
          icons.forEach((i) => {
            i.classList.remove("selected");
            i.classList.remove("initial-outcome"); // Remove any initial outcome animation
          });
          event.currentTarget.classList.add("selected");

          // Update hidden input
          const hiddenInput = row.querySelector('input[type="hidden"]');
          if (hiddenInput) {
            hiddenInput.value = state;
          }

          // Recalculate hasActionableChange - check if override state is different from current visibility
          outcome.hasActionableChange =
            this.calculateHasActionableChange(outcome);

          // Update action buttons for this row
          this.updateActionButtonsForToken(
            tokenId,
            outcome.hasActionableChange,
          );

          // Show or hide the action buttons based on whether there's an actionable change
          const actionButtons = row.querySelector(".action-buttons");
          if (actionButtons) {
            if (outcome.hasActionableChange) {
              actionButtons.style.display = "flex";
              actionButtons.innerHTML = `
                                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                                    <i class="fas fa-undo"></i>
                                </button>
                            `;
            } else {
              actionButtons.style.display = "flex";
              actionButtons.innerHTML =
                '<span class="no-action">No change</span>';
            }
          }
        }
      };

      // Add the click handler
      icon.addEventListener("click", icon._clickHandler);
    });
  }
}
