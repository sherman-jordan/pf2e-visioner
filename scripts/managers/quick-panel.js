import { COVER_STATES, VISIBILITY_STATES } from "../constants.js";
import { setCoverBetween, setVisibilityBetween } from "../utils.js";

export class VisionerQuickPanel extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pf2e-visioner-quick-panel",
    tag: "div",
    window: {
      title: "Visioner Quick Edit",
      icon: "fas fa-eye",
      resizable: true,
    },
    position: { width: 340, height: "auto" },
    actions: {
      close: VisionerQuickPanel._onClose,
      toggleMode: VisionerQuickPanel._onToggleMode,
      setVisibility: VisionerQuickPanel._onSetVisibility,
      setCover: VisionerQuickPanel._onSetCover,
      refreshSets: VisionerQuickPanel._onRefreshSets,
    },
  };

  constructor(options = {}) {
    super(options);
    this.mode = options.mode || "target"; // 'observer' | 'target'
  }

  get selectedTokens() {
    return Array.from(canvas?.tokens?.controlled ?? []).filter((t) => !!t?.actor);
  }

  get targetedTokens() {
    return Array.from(game?.user?.targets ?? []).filter((t) => !!t?.actor);
  }

  async _prepareContext(_options) {
    const visList = Object.entries(VISIBILITY_STATES).map(([key, cfg]) => ({ key, label: game.i18n.localize(cfg.label), icon: cfg.icon, color: cfg.color }));
    const coverList = Object.entries(COVER_STATES).map(([key, cfg]) => ({ key, label: game.i18n.localize(cfg.label), icon: cfg.icon, color: cfg.color }));
    return {
      mode: this.mode,
      modeIsObserver: this.mode === "observer",
      selCount: this.selectedTokens.length,
      tgtCount: this.targetedTokens.length,
      visibilityStates: visList,
      coverStates: coverList,
    };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      "modules/pf2e-visioner/templates/quick-panel.hbs",
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    try { content.innerHTML = result; } catch (_) {}
    return content;
  }

  static _onClose(_event, _button) {
    try { this.close(); } catch (_) {}
  }

  static async _onToggleMode(_event, _button) {
    this.mode = this.mode === "observer" ? "target" : "observer";
    this.render({ force: true });
  }

  static async _onRefreshSets(_event, _button) {
    this.render({ force: true });
  }

  static async _onSetVisibility(event, button) {
    const state = button?.dataset?.state;
    if (!state) return;
    const selected = this.selectedTokens;
    const targeted = this.targetedTokens;
    if (!selected.length || !targeted.length) {
      ui.notifications?.warn?.("Select token(s) and target token(s) first.");
      return;
    }
    const pairs = [];
    for (const s of selected) {
      for (const t of targeted) {
        if (s === t) continue;
        const observer = this.mode === "observer" ? s : t;
        const target = this.mode === "observer" ? t : s;
        pairs.push([observer, target]);
      }
    }
    try {
      for (const [obs, tgt] of pairs) {
        await setVisibilityBetween(obs, tgt, state);
      }
      try { game.canvas?.perception?.refresh?.(); } catch (_) {}
      ui.notifications?.info?.(`Applied ${state} to ${pairs.length} pair(s).`);
    } catch (e) {
      console.error("[pf2e-visioner] quick visibility error", e);
    }
  }

  static async _onSetCover(event, button) {
    const state = button?.dataset?.state;
    if (!state) return;
    const selected = this.selectedTokens;
    const targeted = this.targetedTokens;
    if (!selected.length || !targeted.length) {
      ui.notifications?.warn?.("Select token(s) and target token(s) first.");
      return;
    }
    const pairs = [];
    for (const s of selected) {
      for (const t of targeted) {
        if (s === t) continue;
        const observer = this.mode === "observer" ? s : t;
        const target = this.mode === "observer" ? t : s;
        pairs.push([observer, target]);
      }
    }
    try {
      for (const [obs, tgt] of pairs) {
        await setCoverBetween(obs, tgt, state);
      }
      try { game.canvas?.perception?.refresh?.(); } catch (_) {}
      ui.notifications?.info?.(`Applied cover ${state} to ${pairs.length} pair(s).`);
    } catch (e) {
      console.error("[pf2e-visioner] quick cover error", e);
    }
  }
}


