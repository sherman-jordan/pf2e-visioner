/**
 * Selection and hover highlighting helpers for the Token Manager
 */

export function attachSelectionHandlers(TokenManagerClass) {
  if (TokenManagerClass._selectionHookId) return;
  TokenManagerClass._selectionHookId = Hooks.on("controlToken", () => {
    applySelectionHighlight(TokenManagerClass);
  });
}

export function detachSelectionHandlers(TokenManagerClass) {
  if (TokenManagerClass._selectionHookId) {
    try {
      Hooks.off("controlToken", TokenManagerClass._selectionHookId);
    } catch (_) {}
    TokenManagerClass._selectionHookId = null;
  }
}

export function applySelectionHighlight(TokenManagerClass) {
  const app = TokenManagerClass.currentInstance;
  if (!app || !app.element) return;
  try {
    app.element
      .querySelectorAll("tr.token-row.row-hover")
      ?.forEach((el) => el.classList.remove("row-hover"));
    const selected = Array.from(canvas?.tokens?.controlled ?? []);
    if (!selected.length) return;
    const activeTab = app.activeTab || "visibility";
    const sectionSelector = activeTab === "cover" ? ".cover-section" : ".visibility-section";
    let firstRow = null;
    for (const tok of selected) {
      const rows = app.element.querySelectorAll(`tr[data-token-id="${tok.id}"]`);
      if (rows && rows.length) {
        rows.forEach((r) => r.classList.add("row-hover"));
        if (!firstRow) {
          for (const r of rows) {
            const section = r.closest(sectionSelector);
            const visible = section && getComputedStyle(section).display !== "none";
            if (section && visible) {
              firstRow = r;
              break;
            }
          }
          if (!firstRow) firstRow = rows[0];
        }
      }
    }
    if (firstRow) {
      const scroller = app.element.querySelector(".tables-content") || app.element;
      requestAnimationFrame(() => {
        try {
          if (typeof firstRow.scrollIntoView === "function") {
            firstRow.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          }
          const computeOffsetTop = (child, ancestor) => {
            let top = 0,
              el = child;
            while (el && el !== ancestor) {
              top += el.offsetTop;
              el = el.offsetParent;
            }
            return top;
          };
          const top = computeOffsetTop(firstRow, scroller);
          const targetTop = Math.max(0, top - 32);
          if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top: targetTop, behavior: "smooth" });
          else scroller.scrollTop = targetTop;
        } catch (_) {}
      });
    }
  } catch (_) {}
}

export function attachCanvasHoverHandlers(TokenManagerClass) {
  if (!canvas?.tokens?.placeables?.length) return;
  if (TokenManagerClass._canvasHoverHandlers?.size > 0) return;
  if (!TokenManagerClass._canvasHoverHandlers) TokenManagerClass._canvasHoverHandlers = new Map();
  const app = TokenManagerClass.currentInstance;
  if (!app || !app.element) return;
  canvas.tokens.placeables.forEach((token) => {
    const over = () => {
      try {
        const row = app.element.querySelector(`tr[data-token-id="${token.id}"]`);
        if (row) {
          row.classList.add("row-hover");
          const scroller = app.element.querySelector(".tables-content") || row.closest(".visibility-table-container") || app.element;
          if (scroller && typeof row.scrollIntoView === "function") {
            row.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          }
        }
      } catch (_) {}
    };
    const out = () => {
      try {
        const row = app.element.querySelector(`tr[data-token-id="${token.id}"]`);
        if (row) row.classList.remove("row-hover");
      } catch (_) {}
    };
    token.on("pointerover", over);
    token.on("pointerout", out);
    TokenManagerClass._canvasHoverHandlers.set(token.id, { over, out });
  });
}

export function detachCanvasHoverHandlers(TokenManagerClass) {
  if (!canvas?.tokens) return;
  TokenManagerClass._canvasHoverHandlers?.forEach((handlers, id) => {
    const token = canvas.tokens.get(id);
    if (token) {
      try { token.off("pointerover", handlers.over); } catch (_) {}
      try { token.off("pointerout", handlers.out); } catch (_) {}
    }
  });
  TokenManagerClass._canvasHoverHandlers?.clear?.();
}


