/**
 * Visioner Wall Manager - ApplicationV2 dialog to manage per-wall settings in bulk
 */

import { MODULE_ID } from "../../constants.js";

export class VisionerWallManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pf2e-visioner-wall-manager",
    tag: "div",
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
      const isDoor = Number(d?.door) > 0;
      const provideCover = d.getFlag?.(MODULE_ID, "provideCover");
      const hiddenWall = d.getFlag?.(MODULE_ID, "hiddenWall");
      const identifier = d.getFlag?.(MODULE_ID, "wallIdentifier");
      const dc = d.getFlag?.(MODULE_ID, "stealthDC");
      return {
        id: d.id,
        isDoor,
        provideCover: provideCover !== false,
        hiddenWall: !!hiddenWall,
        identifier: identifier || "",
        dc: Number(dc) || "",
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
    return content;
  }

  static async _onApply(event, _button) {
    const app = this; // ApplicationV2 instance
    try {
      const form = app.element?.querySelector?.("form.pf2e-visioner-wall-manager");
      if (!form) return app.close();
      const fd = new FormData(form);
      const entries = Object.fromEntries(fd.entries());
      const updates = [];
      const byId = new Map();
      for (const [key, value] of Object.entries(entries)) {
        const m = key.match(/^wall\.(?<id>[^.]+)\.(?<field>provideCover|hiddenWall|identifier|dc)$/);
        if (!m) continue;
        const { id, field } = m.groups;
        if (!byId.has(id)) byId.set(id, {});
        byId.get(id)[field] = value;
      }
      for (const [id, data] of byId.entries()) {
        const patch = { _id: id };
        if (data.provideCover !== undefined) {
          const v = data.provideCover === "on" || data.provideCover === "true" || data.provideCover === true;
          patch[`flags.${MODULE_ID}.provideCover`] = v;
        }
        if (data.hiddenWall !== undefined) {
          const v = data.hiddenWall === "on" || data.hiddenWall === "true" || data.hiddenWall === true;
          patch[`flags.${MODULE_ID}.hiddenWall`] = v;
        }
        if (data.identifier !== undefined) {
          patch[`flags.${MODULE_ID}.wallIdentifier`] = String(data.identifier || "");
        }
        if (data.dc !== undefined) {
          const n = Number(data.dc);
          patch[`flags.${MODULE_ID}.stealthDC`] = Number.isFinite(n) && n > 0 ? n : null;
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
}


