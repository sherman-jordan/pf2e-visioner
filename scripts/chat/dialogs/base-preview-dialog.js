/**
 * BasePreviewDialog
 * Common behaviors shared by all chat action preview dialogs.
 * - Selection-based row highlighting synced with controlled tokens
 * - Safe hook attachment/cleanup
 */

export class BasePreviewDialog extends foundry.applications.api.ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this._selectionHookId = null;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._attachSelectionHandlers();
    this._applySelectionHighlight();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applySelectionHighlight();
    // Live re-filtering for per-dialog Ignore Allies checkbox
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb) {
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.render({ force: true });
        });
      }
    } catch (_) {}
  }

  async close(options) {
    this._detachSelectionHandlers();
    return super.close(options);
  }

  _attachSelectionHandlers() {
    if (this._selectionHookId) return;
    this._selectionHookId = Hooks.on("controlToken", () => this._applySelectionHighlight());
  }

  _detachSelectionHandlers() {
    if (!this._selectionHookId) return;
    try {
      Hooks.off("controlToken", this._selectionHookId);
    } catch (_) {}
    this._selectionHookId = null;
  }

  _applySelectionHighlight() {
    try {
      // Clear previous highlights
      this.element
        .querySelectorAll("tr.token-row.row-hover")
        ?.forEach((el) => el.classList.remove("row-hover"));

      const selectedTokens = Array.from(canvas?.tokens?.controlled ?? []);
      if (!selectedTokens.length) return;

      let firstRow = null;
      for (const token of selectedTokens) {
        const row = this.element.querySelector(`tr[data-token-id="${token.id}"]`);
        if (row) {
          row.classList.add("row-hover");
          if (!firstRow) firstRow = row;
        }
      }

      // Do not auto-scroll to wall rows; only scroll to token rows
      if (firstRow && typeof firstRow.scrollIntoView === "function") {
        firstRow.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    } catch (_) {}
  }
}



