import { MODULE_TITLE } from "../../constants.js";
import { getVisibilityStateConfig } from "../services/data/visibility-states.js";
import "../services/hbs-helpers.js";
import { filterOutcomesByEncounter, hasActiveEncounter } from "../services/infra/shared-utils.js";
import { BasePreviewDialog } from "./base-preview-dialog.js";

export class BaseActionDialog extends BasePreviewDialog {
  constructor(options = {}) {
    super(options);
    this.bulkActionState = this.bulkActionState ?? "initial";
  }

  getApplyDirection() {
    return "observer_to_target";
  }

  getChangesCounterClass() {
    return null; // override in subclass if you want auto counting via dialog-utils
  }

  // Shared UI helpers
  visibilityConfig(state) {
    return getVisibilityStateConfig(state) || { icon: "", color: "", label: String(state ?? "") };
  }

  resolveTokenImage(token) {
    try {
      return (
        token?.texture?.src ||
        token?.document?.texture?.src ||
        token?.img ||
        "icons/svg/mystery-man.svg"
      );
    } catch (_) {
      return "icons/svg/mystery-man.svg";
    }
  }

  formatMargin(margin) {
    const n = Number(margin);
    if (Number.isNaN(n)) return String(margin ?? "");
    return n >= 0 ? `+${n}` : `${n}`;
  }

  buildOverrideStates(desiredStates, outcome, options = {}) {
    const selectFrom = options.selectFrom || "overrideState";
    const calcFrom = options.calcFrom || "newVisibility";
    const selectedValue = outcome?.[selectFrom] || outcome?.[calcFrom] || null;
    return desiredStates
      .filter((s) => typeof s === "string" && s.length > 0)
      .map((state) => ({
        value: state,
        ...this.visibilityConfig(state),
        selected: selectedValue === state,
        calculatedOutcome: outcome?.[calcFrom] === state,
      }));
  }

  computeChangesCount(outcomes) {
    if (!Array.isArray(outcomes)) return 0;
    return outcomes.filter((o) => o?.hasActionableChange).length;
  }

  buildCommonContext(outcomes) {
    const changesCount = this.computeChangesCount(outcomes);
    return {
      changesCount,
      totalCount: Array.isArray(outcomes) ? outcomes.length : 0,
      showEncounterFilter: hasActiveEncounter(),
      encounterOnly: !!this.encounterOnly,
      bulkActionState: this.bulkActionState ?? "initial",
    };
  }

  applyEncounterFilter(outcomes, tokenProperty, emptyNotice) {
    let filtered = filterOutcomesByEncounter(outcomes, this.encounterOnly, tokenProperty);
    if (filtered.length === 0 && this.encounterOnly && hasActiveEncounter()) {
      this.encounterOnly = false;
      filtered = outcomes;
      const message = emptyNotice || "No encounter tokens found, showing all";
      try { ui.notifications.info(`${MODULE_TITLE}: ${message}`); } catch (_) {}
    }
    return filtered;
  }

  async applyVisibilityChanges(seeker, changes, options = {}) {
    const { applyVisibilityChanges } = await import("../services/infra/shared-utils.js");
    const direction = options.direction || this.getApplyDirection();
    return applyVisibilityChanges(seeker, changes, { ...options, direction });
  }

  updateRowButtonsToApplied(outcomes) {
    import("../services/ui/dialog-utils.js").then(({ updateRowButtonsToApplied }) => {
      try { updateRowButtonsToApplied(this.element, outcomes); } catch (_) {}
    });
  }

  updateRowButtonsToReverted(outcomes) {
    import("../services/ui/dialog-utils.js").then(({ updateRowButtonsToReverted }) => {
      try { updateRowButtonsToReverted(this.element, outcomes); } catch (_) {}
    });
  }

  updateBulkActionButtons() {
    import("../services/ui/dialog-utils.js").then(({ updateBulkActionButtons }) => {
      try { updateBulkActionButtons(this.element, this.bulkActionState); } catch (_) {}
    });
  }

  updateChangesCount() {
    import("../services/ui/dialog-utils.js").then(({ updateChangesCount }) => {
      try { updateChangesCount(this.element, this.getChangesCounterClass()); } catch (_) {}
    });
  }

  // Default token id resolver for outcomes; subclasses can override
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  // Mark calculated selection (override if present, otherwise calculated)
  markInitialSelections() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const outcome of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(outcome);
        if (!tokenId) continue;
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) continue;
        const container = row.querySelector(".override-icons");
        if (!container) continue;
        const desiredState = outcome.overrideState || outcome.newVisibility;
        container.querySelectorAll(".state-icon").forEach((i) => i.classList.remove("selected"));
        const icon = container.querySelector(`.state-icon[data-state="${desiredState}"]`);
        if (icon) icon.classList.add("selected");
      }
    } catch (_) {}
  }

  // Outcome display helpers (string-based). Subclasses can override if needed
  getOutcomeClass(value) {
    return (value && typeof value === "string")
      ? (value === "criticalSuccess" ? "critical-success" : (value === "criticalFailure" ? "critical-failure" : value))
      : "";
  }

  getOutcomeLabel(value) {
    if (!value || typeof value !== "string") return "";
    const norm = value === "criticalSuccess" ? "critical-success" : (value === "criticalFailure" ? "critical-failure" : value);
    switch (norm) {
      case "critical-success": return "Critical Success";
      case "success": return "Success";
      case "failure": return "Failure";
      case "critical-failure": return "Critical Failure";
      default: return norm.charAt(0).toUpperCase() + norm.slice(1);
    }
  }

  // Default per-row buttons toggling. Subclasses may override for custom layouts.
  updateActionButtonsForToken(tokenId, hasActionableChange) {
    try {
      const applySelector = `button[data-action="applyChange"][data-token-id="${tokenId}"]`;
      const revertSelector = `button[data-action="revertChange"][data-token-id="${tokenId}"]`;
      const applyBtn = this.element?.querySelector?.(applySelector);
      const revertBtn = this.element?.querySelector?.(revertSelector);
      if (!applyBtn && !revertBtn) return;

      if (hasActionableChange) {
        if (applyBtn) applyBtn.disabled = false;
        if (revertBtn) revertBtn.disabled = true;
      } else {
        if (applyBtn) applyBtn.disabled = true;
        if (revertBtn) revertBtn.disabled = true;
      }
    } catch (_) {}
  }

  addIconClickHandlers() {
    const stateIcons = this.element.querySelectorAll(".state-icon");
    stateIcons.forEach((icon) => {
      icon.addEventListener("click", (event) => {
        const targetId = event.currentTarget.dataset.target || event.currentTarget.dataset.tokenId;
        const newState = event.currentTarget.dataset.state;
        const overrideIcons = event.currentTarget.closest(".override-icons");
        if (overrideIcons) {
          overrideIcons.querySelectorAll(".state-icon").forEach((i) => i.classList.remove("selected"));
        }
        event.currentTarget.classList.add("selected");
        const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
        const outcome = this.outcomes?.find?.((o) => this.getOutcomeTokenId(o) === targetId);
        if (outcome) {
          outcome.overrideState = newState;
          const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
          const effectiveNew = outcome.overrideState ?? outcome.newVisibility ?? null;
          const hasActionableChange = oldState != null && effectiveNew != null && effectiveNew !== oldState;
          try {
            this.updateActionButtonsForToken(targetId, hasActionableChange);
          } catch (_) {}
          try {
            // Maintain a lightweight list of changed outcomes for convenience
            this.changes = Array.isArray(this.outcomes)
              ? this.outcomes.filter((o) => {
                  const baseOld = o.oldVisibility ?? o.currentVisibility ?? null;
                  const baseNew = o.overrideState ?? o.newVisibility ?? null;
                  return baseOld != null && baseNew != null && baseOld !== baseNew;
                })
              : [];
          } catch (_) {}
        }
        this.updateChangesCount();
      });
    });
  }
}



