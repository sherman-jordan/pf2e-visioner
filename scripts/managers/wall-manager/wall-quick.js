/**
 * Visioner Wall Quick Settings - per-wall dialog (ApplicationV2)
 */

import { MODULE_ID } from "../../constants.js";

export class VisionerWallQuickSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pf2e-visioner-wall-quick",
    tag: "div",
    window: {
      title: "PF2E Visioner: Wall Settings",
      icon: "fas fa-grip-lines-vertical",
      resizable: true,
    },
    position: { width: 520, height: "auto" },
    actions: {
      apply: VisionerWallQuickSettings._onApply,
      close: VisionerWallQuickSettings._onClose,
    },
  };

  static PARTS = {
    content: { template: "modules/pf2e-visioner/templates/wall-quick.hbs" },
  };

  constructor(wallDocument, options = {}) {
    super(options);
    this.wall = wallDocument; // WallDocument
  }

  async _prepareContext() {
    const d = this.wall;
    const provideCover = d?.getFlag?.(MODULE_ID, "provideCover");
    const hiddenWall = d?.getFlag?.(MODULE_ID, "hiddenWall");
    const identifier = d?.getFlag?.(MODULE_ID, "wallIdentifier");
    const dc = d?.getFlag?.(MODULE_ID, "stealthDC");
    const connected = d?.getFlag?.(MODULE_ID, "connectedWalls") || [];
    const hiddenWallsEnabled = !!game.settings.get(MODULE_ID, "hiddenWallsEnabled");
    return {
      id: d?.id,
      hiddenWallsEnabled,
      provideCover: provideCover !== false,
      hiddenWall: !!hiddenWall,
      identifier: identifier || "",
      dc: Number(dc) || "",
      connectedCsv: Array.isArray(connected) ? connected.join(", ") : "",
    };
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
    const app = this;
    const form = app.element?.querySelector?.("form.pv-wall-quick");
    if (!form) return app.close();
    const fd = new FormData(form);
    const entries = Object.fromEntries(fd.entries());
    const patch = { _id: app.wall.id };
    const provideCover = entries["provideCover"];
    patch[`flags.${MODULE_ID}.provideCover`] = provideCover === "on" || provideCover === "true" || provideCover === true;
    if (game.settings.get(MODULE_ID, "hiddenWallsEnabled")) {
      const hiddenWall = entries["hiddenWall"];
      patch[`flags.${MODULE_ID}.hiddenWall`] = hiddenWall === "on" || hiddenWall === "true" || hiddenWall === true;
      patch[`flags.${MODULE_ID}.wallIdentifier`] = String(entries["identifier"] || "");
      const n = Number(entries["dc"]);
      patch[`flags.${MODULE_ID}.stealthDC`] = Number.isFinite(n) && n > 0 ? n : null;
      // Connected walls parsing
      const raw = String(entries["connected"] || "");
      const arr = raw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => !!s);
      patch[`flags.${MODULE_ID}.connectedWalls`] = arr;
    }
    await app.wall.parent?.updateEmbeddedDocuments?.("Wall", [patch], { diff: false });
    try { await app.close(); } catch (_) {}
  }

  static async _onClose(_event, _button) {
    try { await this.close(); } catch (_) {}
  }
}


