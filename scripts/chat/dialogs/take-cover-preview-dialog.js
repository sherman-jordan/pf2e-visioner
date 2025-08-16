import { COVER_STATES, MODULE_ID, MODULE_TITLE } from "../../constants.js";
import { BaseActionDialog } from "./base-action-dialog.js";

let currentTakeCoverDialog = null;

export class TakeCoverPreviewDialog extends BaseActionDialog {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["take-cover-preview-dialog"],
    window: {
      title: "Take Cover Results",
      icon: "fas fa-shield-alt",
      resizable: true,
    },
    position: { width: 560, height: "auto" },
    actions: {
      close: TakeCoverPreviewDialog._onClose,
      applyAll: TakeCoverPreviewDialog._onApplyAll,
      revertAll: TakeCoverPreviewDialog._onRevertAll,
      applyChange: TakeCoverPreviewDialog._onApplyChange,
      revertChange: TakeCoverPreviewDialog._onRevertChange,
      toggleEncounterFilter: TakeCoverPreviewDialog._onToggleEncounterFilter,
      overrideState: TakeCoverPreviewDialog._onOverrideState,
    },
  };

  static PARTS = {
    content: { template: "modules/pf2e-visioner/templates/take-cover-preview.hbs" },
  };

  constructor(actorToken, outcomes, changes, actionData, options = {}) {
    super(options);
    this.actorToken = actorToken;
    this.outcomes = Array.isArray(outcomes) ? outcomes : [];
    this.changes = Array.isArray(changes) ? changes : [];
    this.actionData = { ...(actionData || {}), actionType: "take-cover" };
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");
    this.bulkActionState = "initial";
    currentTakeCoverDialog = this;
  }

  getOutcomeTokenId(outcome) { return outcome?.target?.id ?? null; }

  async getFilteredOutcomes() {
    try {
      let filtered = this.applyEncounterFilter(this.outcomes || [], "target", "No encounter observers found for this action");
      
      // Apply ally filtering if ignore allies is enabled
      try {
        const { filterOutcomesByAllies } = await import("../services/infra/shared-utils.js");
        filtered = filterOutcomesByAllies(filtered, this.actorToken, this.ignoreAllies, "target");
      } catch (_) {}
      
      return filtered;
    } catch (_) {
      return Array.isArray(this.outcomes) ? this.outcomes : [];
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Filter outcomes (ally/enemy filtering not required for cover; use generic encounter filter)
    const filteredOutcomes = this.applyEncounterFilter(this.outcomes, "target", "No encounter observers found for this action");

    // Map cover constants to templating-friendly config
    const coverCfg = (s) => {
      const cfg = COVER_STATES[s] || null;
      if (!cfg) return { label: String(s ?? ""), icon: "fas fa-shield-alt", color: "#795548" };
      let label = cfg.label;
      try { label = game.i18n.localize(cfg.label); } catch (_) {}
      return { label, icon: cfg.icon || "fas fa-shield-alt", color: cfg.color || "#795548" };
    };

    const allStates = ["none", "standard", "greater"]; // for override icons

    const processed = filteredOutcomes.map((o) => {
      const effectiveNew = o.overrideState || o.newVisibility || o.newCover;
      const baseOld = o.oldVisibility || o.oldCover || o.currentCover;
      const hasActionableChange = baseOld != null && effectiveNew != null && effectiveNew !== baseOld;
      const availableStates = allStates.map((s) => ({
        value: s,
        label: coverCfg(s).label,
        icon: coverCfg(s).icon,
        color: coverCfg(s).color,
        selected: s === effectiveNew,
        calculatedOutcome: s === (o.newVisibility || o.newCover),
      }));
      return {
        ...o,
        tokenImage: this.resolveTokenImage(o.target),
        oldCoverCfg: coverCfg(baseOld),
        newCoverCfg: coverCfg(effectiveNew),
        availableStates,
        overrideState: effectiveNew,
        hasActionableChange,
      };
    });

    this.outcomes = processed;
    context.actorToken = this.actorToken;
    context.outcomes = processed;
    Object.assign(context, this.buildCommonContext(processed));
    return context;
  }

  async _renderHTML(context, options) {
    return await foundry.applications.handlebars.renderTemplate(this.constructor.PARTS.content.template, context);
  }

  _replaceHTML(result, content, options) { content.innerHTML = result; return content; }

  _onRender(context, options) {
    super._onRender(context, options);
    this.addIconClickHandlers();
    this.markInitialSelections();
    this.updateBulkActionButtons();
    this.updateChangesCount();
  }

  getChangesCounterClass() { return "take-cover-preview-dialog-changes-count"; }

  // Static handlers
  static async _onClose(event, target) { currentTakeCoverDialog = null; return super._onClose?.(event, target); }

  static async _onToggleEncounterFilter(event, target) {
    const app = currentTakeCoverDialog; if (!app) return;
    app.encounterOnly = target.checked; app.bulkActionState = "initial"; app.render({ force: true });
  }

  static async _onApplyAll(event, target) {
    const app = currentTakeCoverDialog; if (!app) return;
    if (app.bulkActionState === "applied") { (await import("../services/infra/notifications.js")).notify?.warn?.(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`); return; }
    const filtered = await app.getFilteredOutcomes();
    const changed = filtered.filter((o) => {
      const eff = o.overrideState || o.newVisibility || o.newCover;
      const base = o.oldVisibility || o.oldCover || o.currentCover;
      return eff != null && base != null && eff !== base;
    });
    if (changed.length === 0) { (await import("../services/infra/notifications.js")).notify?.info?.(`${MODULE_TITLE}: No changes to apply`); return; }
    const overrides = {};
    for (const o of changed) { const id = o?.target?.id; const s = o?.overrideState || o?.newVisibility || o?.newCover; if (id && s) overrides[id] = s; }
    const { applyNowTakeCover } = await import("../services/index.js");
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    app.bulkActionState = "applied"; app.updateBulkActionButtons(); app.updateRowButtonsToApplied(changed.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true }))); app.updateChangesCount();
  }

  static async _onRevertAll(event, target) {
    const app = currentTakeCoverDialog; if (!app) return;
    if (app.bulkActionState === "reverted") { (await import("../services/infra/notifications.js")).notify?.warn?.(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`); return; }
    const { revertNowTakeCover } = await import("../services/index.js");
    await revertNowTakeCover(app.actionData, { html: () => {}, attr: () => {} });
    app.bulkActionState = "reverted"; app.updateBulkActionButtons(); app.updateRowButtonsToReverted(app.outcomes.map((o) => ({ target: { id: o.target.id }, hasActionableChange: true }))); app.updateChangesCount();
  }

  static async _onApplyChange(event, target) {
    const app = currentTakeCoverDialog; if (!app) return;
    const tokenId = target?.dataset?.tokenId;
    const outcome = app.outcomes.find((o) => o.target.id === tokenId);
    if (!outcome) return;
    const eff = outcome.overrideState || outcome.newVisibility || outcome.newCover;
    const base = outcome.oldVisibility || outcome.oldCover || outcome.currentCover;
    if (eff === base) return;
    const overrides = { [tokenId]: eff };
    const { applyNowTakeCover } = await import("../services/index.js");
    await applyNowTakeCover({ ...app.actionData, overrides }, { html: () => {}, attr: () => {} });
    app.updateRowButtonsToApplied([{ target: { id: tokenId }, hasActionableChange: true }]); app.updateChangesCount();
  }

  static async _onRevertChange(event, target) {
    const app = currentTakeCoverDialog; if (!app) return;
    const { revertNowTakeCover } = await import("../services/index.js");
    await revertNowTakeCover(app.actionData, { html: () => {}, attr: () => {} });
    const tokenId = target?.dataset?.tokenId;
    app.updateRowButtonsToReverted([{ target: { id: tokenId }, hasActionableChange: true }]); app.updateChangesCount();
  }

  static async _onOverrideState(_event, _target) { /* handled by BaseActionDialog.addIconClickHandlers */ }
}


