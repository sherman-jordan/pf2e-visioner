import { getVisibilityStateConfig } from "./data/visibility-states.js";

// Register Handlebars helpers once when this module is imported
try {
  // Render a visibility state icon with color and title
  // Usage: {{{visibilityIcon state}}}
  Handlebars.registerHelper("visibilityIcon", function(state) {
    const cfg = getVisibilityStateConfig(state);
    if (!cfg) return "";
    const html = `<i class="${cfg.icon}" style="color: ${cfg.color}" title="${cfg.label}"></i>`;
    return new Handlebars.SafeString(html);
  });

  // REMOVED: Custom helpers that conflict with system
  // Using built-in Foundry/Handlebars helpers instead
} catch (_) {
  // In non-Foundry environments Handlebars may be unavailable; ignore
}


