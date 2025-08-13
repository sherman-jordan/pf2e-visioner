// Import settings
import { registerKeybindings, registerSettings } from "./settings.js";

// Import detection wrapper
import { initializeDetectionWrapper } from "./detection-wrapper.js";

// Import hooks
import { registerHooks } from "./hooks.js";

// Import dialog scroll fix
import { initializeDialogScrollFix } from "./dialog-scroll-fix.js";
// Import rule elements
import { initializeRuleElements } from "./rule-elements/index.js";

// Initialize the module
Hooks.once("init", async () => {
  try {
    // Register Handlebars helper for default value
    Handlebars.registerHelper("default", function (value, defaultValue) {
      return value !== undefined && value !== null ? value : defaultValue;
    });

    // Register settings and keybindings
    registerSettings();
    registerKeybindings();

    // Register hooks
    registerHooks();

    // Set up API
    const { api } = await import("./api.js");
    game.modules.get("pf2e-visioner").api = api;

    // Initialize detection wrapper
    initializeDetectionWrapper();

    // Initialize dialog scroll fix
    initializeDialogScrollFix();

    // Initialize rule elements
    initializeRuleElements();
  } catch (error) {
    console.error("PF2E Visioner: Initialization failed:", error.message);
    console.error("PF2E Visioner: Full error details:", error);
    console.error("PF2E Visioner: Stack trace:", error.stack);

    // Try to show a user notification if possible
    if (typeof ui !== "undefined" && ui.notifications) {
      ui.notifications.error(
        `PF2E Visioner failed to initialize: ${error.message}`
      );
    }
  }
});

// Initialize colorblind mode and cleanup effects on ready
Hooks.once("ready", async () => {
  try {
    // Apply colorblind mode if set
    const colorblindMode = game.settings.get("pf2e-visioner", "colorblindMode");
    if (colorblindMode !== "none") {
      document.body.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
    }

    // Clean up any lingering cover effects from previous sessions
    // Run this on a single authoritative client (GM only) to avoid race conditions
    if (game.user.isGM) {
      try {
        // Register auto-cover detection (GM only to avoid duplicates)
        const { cleanupAllCoverEffects } = await import("./cover-ephemeral.js");
        await cleanupAllCoverEffects();
      } catch (error) {
        console.error(
          "PF2E Visioner: Failed to clean up cover effects:",
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "PF2E Visioner: Failed to initialize colorblind mode:",
      error
    );
  }
});
