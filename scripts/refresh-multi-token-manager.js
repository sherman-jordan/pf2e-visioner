/**
 * Script to refresh the Multi Token Manager template cache
 * Run this in the console to force template reload
 */

// Close any existing Multi Token Manager
if (game.modules.get("pf2e-visioner")?.api?.VisionerMultiTokenManager?.currentInstance) {
  try {
    await game.modules.get("pf2e-visioner").api.VisionerMultiTokenManager.currentInstance.close();
  } catch (e) {
    console.log("Closed existing instance");
  }
}

// Clear Handlebars template cache for our template
const templatePath = "modules/pf2e-visioner/templates/multi-token-manager.hbs";
if (Handlebars.partials[templatePath]) {
  delete Handlebars.partials[templatePath];
}

// Clear any cached templates in Foundry's template cache
if (foundry.utils.getProperty(foundry, "applications.handlebars._cache")) {
  delete foundry.applications.handlebars._cache[templatePath];
}

console.log("Template cache cleared for Multi Token Manager");

// Now try to open a fresh instance
const controlled = canvas.tokens.controlled;
if (controlled.length >= 2) {
  const { openMultiTokenManager } = game.modules.get("pf2e-visioner").api;
  await openMultiTokenManager();
} else {
  ui.notifications.warn("Select at least 2 tokens to test the Multi Token Manager");
}
