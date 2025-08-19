/**
 * Visioner Wall Manager - ApplicationV2 dialog to manage per-wall settings in bulk
 */

import { MODULE_ID } from "../../constants.js";
import { getWallImage } from "../../utils.js";

export class VisionerWallManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pf2e-visioner-wall-manager",
    tag: "div",
    classes: ["pf2e-visioner"],
    window: {
      title: "PF2E Visioner: Wall Settings",
      icon: "fas fa-grip-lines-vertical",
      resizable: true,
    },
    position: { width: 720, height: "auto" },
    actions: {
      apply: VisionerWallManager._onApply,
      close: VisionerWallManager._onClose,
      bulkHiddenOn: VisionerWallManager._onBulkHiddenOn,
      bulkHiddenOff: VisionerWallManager._onBulkHiddenOff,
      bulkProvideCoverOn: VisionerWallManager._onBulkProvideCoverOn,
      bulkProvideCoverOff: VisionerWallManager._onBulkProvideCoverOff,
    },
  };

  static PARTS = {
    content: { template: "modules/pf2e-visioner/templates/wall-manager.hbs" },
  };

  constructor(options = {}) {
    super(options);
  }

  async _prepareContext() {
    const scene = canvas?.scene;
    const walls = (canvas?.walls?.placeables || []).map((w) => w.document);
    const rows = walls.map((d) => {
      const doorType = Number(d?.door) || 0; // 0 wall, 1 door, 2 secret door
      const provideCover = d.getFlag?.(MODULE_ID, "provideCover");
      const hiddenWall = d.getFlag?.(MODULE_ID, "hiddenWall");
      const identifier = d.getFlag?.(MODULE_ID, "wallIdentifier");
      const dc = d.getFlag?.(MODULE_ID, "stealthDC");
      return {
        id: d.id,
        doorType,
        provideCover: provideCover !== false,
        hiddenWall: !!hiddenWall,
        identifier: identifier || "",
        dc: Number(dc) || "",
        img: getWallImage(doorType),
      };
    });
    return { rows };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    try { this._bindSelectionSync(content); } catch (_) {}
    return content;
  }

  static async _onApply(event, _button) {
    const app = this; // ApplicationV2 instance
    try {
      const form = app.element?.querySelector?.("form.pf2e-visioner-wall-manager");
      if (!form) return app.close();
      const updates = [];
      const byId = new Map();
      // Read inputs directly so unchecked checkboxes are captured as false
      const inputs = form.querySelectorAll('input[name^="wall."]');
      inputs.forEach((input) => {
        const name = input.getAttribute("name") || "";
        const m = name.match(/^wall\.(?<id>[^.]+)\.(?<field>provideCover|hiddenWall|identifier|dc)$/);
        if (!m) return;
        const { id, field } = m.groups;
        if (!byId.has(id)) byId.set(id, {});
        let value;
        if (field === "provideCover" || field === "hiddenWall") {
          value = !!input.checked;
        } else if (field === "identifier") {
          value = String(input.value || "");
        } else if (field === "dc") {
          const n = Number(input.value);
          value = Number.isFinite(n) && n > 0 ? n : null;
        }
        byId.get(id)[field] = value;
      });
      for (const [id, data] of byId.entries()) {
        const patch = { _id: id };
        if (data.provideCover !== undefined) {
          patch[`flags.${MODULE_ID}.provideCover`] = !!data.provideCover;
        }
        if (data.hiddenWall !== undefined) {
          patch[`flags.${MODULE_ID}.hiddenWall`] = !!data.hiddenWall;
        }
        if (data.identifier !== undefined) {
          patch[`flags.${MODULE_ID}.wallIdentifier`] = String(data.identifier || "");
        }
        if (data.dc !== undefined) {
          patch[`flags.${MODULE_ID}.stealthDC`] = data.dc;
        }
        updates.push(patch);
      }
      if (updates.length) await canvas.scene?.updateEmbeddedDocuments?.("Wall", updates, { diff: false });
      await app.close();
    } catch (e) {
      console.error(`[${MODULE_ID}] Wall Manager apply failed`, e);
      try { await app.close(); } catch (_) {}
    }
  }

  static async _onClose(_event, _button) {
    try { await this.close(); } catch (_) {}
  }

  static async _onSelectWall(event, button) {
    try {
      const wallId = button?.dataset?.wallId;
      if (!wallId) return;
      const wall = canvas?.walls?.get?.(wallId) || (canvas?.walls?.placeables || []).find((w) => w?.id === wallId || w?.document?.id === wallId);
      if (!wall) return;
      try { wall.layer?.releaseAll?.(); } catch (_) {}
      try { wall.control?.({ releaseOthers: true }); } catch (_) { try { wall.control?.(); } catch (_) {} }
      try {
        const d = wall.document;
        const coords = Array.isArray(d?.c) ? d.c : [d?.x, d?.y, d?.x2, d?.y2];
        const [x1, y1, x2, y2] = coords.map((n) => Number(n) || 0);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        canvas?.animatePan?.({ x: mx, y: my, duration: 350 });
      } catch (_) {}
    } catch (e) {
      console.warn(`[${MODULE_ID}] Select wall failed`, e);
    }
  }

  static _setAll(form, selector, checked) {
    const els = form.querySelectorAll(selector);
    els.forEach((el) => { el.checked = !!checked; });
  }

  static async _onBulkHiddenOn(event, _button) {
    const form = this.element?.querySelector?.("form.pf2e-visioner-wall-manager");
    if (form) this.constructor._setAll(form, 'input[name$=".hiddenWall"]', true);
  }
  static async _onBulkHiddenOff(event, _button) {
    const form = this.element?.querySelector?.("form.pf2e-visioner-wall-manager");
    if (form) this.constructor._setAll(form, 'input[name$=".hiddenWall"]', false);
  }
  static async _onBulkProvideCoverOn(event, _button) {
    const form = this.element?.querySelector?.("form.pf2e-visioner-wall-manager");
    if (form) this.constructor._setAll(form, 'input[name$=".provideCover"]', true);
  }
  static async _onBulkProvideCoverOff(event, _button) {
    const form = this.element?.querySelector?.("form.pf2e-visioner-wall-manager");
    if (form) this.constructor._setAll(form, 'input[name$=".provideCover"]', false);
  }

  _bindSelectionSync(root) {
    try {
      // Clear any old binding
      this._unbindSelectionSync?.();
      const table = root?.querySelector?.("table.visibility-table tbody");
      if (!table) return;
      const highlight = () => {
        try {
          const selected = new Set((canvas?.walls?.controlled || []).map((w) => w?.id || w?.document?.id));
          table.querySelectorAll("tr[data-wall-id]").forEach((tr) => {
            const id = tr.getAttribute("data-wall-id");
            const on = selected.has(id);
            tr.classList.toggle("row-hover", on);
            tr.style.outline = on ? "2px solid var(--color-text-hyperlink, #ff9800)" : "";
            tr.style.background = on ? "rgba(255, 152, 0, 0.12)" : "";
          });
        } catch (_) {}
      };
      const onControl = () => highlight();
      const onDelete = () => highlight();
      Hooks.on("controlWall", onControl);
      Hooks.on("deleteWall", onDelete);
      Hooks.on("createWall", onControl);
      Hooks.on("updateWall", onControl);
      highlight();
      this._unbindSelectionSync = () => {
        try { Hooks.off("controlWall", onControl); } catch (_) {}
        try { Hooks.off("deleteWall", onDelete); } catch (_) {}
        try { Hooks.off("createWall", onControl); } catch (_) {}
        try { Hooks.off("updateWall", onControl); } catch (_) {}
        this._unbindSelectionSync = null;
      };
      this.once?.("close", () => { try { this._unbindSelectionSync?.(); } catch (_) {} });
    } catch (_) {}
  }
}


