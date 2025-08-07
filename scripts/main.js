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
    Handlebars.registerHelper('default', function(value, defaultValue) {
      return value !== undefined && value !== null ? value : defaultValue;
    });
    
    registerSettings();
    console.log('PF2E Visioner | Initializing module');
    
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
    
    console.log('PF2E Visioner | Initialization complete');
  } catch (error) {
    console.error('PF2E Visioner: Initialization failed:', error.message);
    console.error('PF2E Visioner: Full error details:', error);
    console.error('PF2E Visioner: Stack trace:', error.stack);
    
    // Try to show a user notification if possible
    if (typeof ui !== 'undefined' && ui.notifications) {
      ui.notifications.error(`PF2E Visioner failed to initialize: ${error.message}`);
    }
  }
});

// Initialize colorblind mode on ready
Hooks.once("ready", () => {
  try {
    // Apply colorblind mode if set
    const colorblindMode = game.settings.get("pf2e-visioner", "colorblindMode");
    if (colorblindMode !== "none") {
      document.body.classList.add(`pf2e-visioner-colorblind-${colorblindMode}`);
    }
  } catch (error) {
    console.error('PF2E Visioner: Failed to initialize colorblind mode:', error);
  }
});