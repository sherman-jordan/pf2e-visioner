import { MODULE_TITLE } from "../../constants.js";

export const notify = {
  info(message) {
    try { ui.notifications.info(`${MODULE_TITLE}: ${message}`); } catch (_) {}
  },
  error(message) {
    try { ui.notifications.error(`${MODULE_TITLE}: ${message}`); } catch (_) {}
  },
  warn(message) {
    try { ui.notifications.warn(`${MODULE_TITLE}: ${message}`); } catch (_) {}
  },
};

export const log = {
  warn(...args) {
    try { console.warn("[PF2E Visioner]", ...args); } catch (_) {}
  },
  error(...args) {
    try { console.error("[PF2E Visioner]", ...args); } catch (_) {}
  },
};


