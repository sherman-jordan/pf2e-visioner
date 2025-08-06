
// Import settings
import { registerKeybindings, registerSettings } from "./settings.js";

// Import detection wrapper
import { initializeDetectionWrapper } from "./detection-wrapper.js";

// Import hooks
import { registerHooks } from "./hooks.js";

// Import dialog scroll fix
import { initializeDialogScrollFix } from "./dialog-scroll-fix.js";


Hooks.once("init", async () => {
  
  try {
    registerSettings();
    
    registerKeybindings();
    
    registerHooks();
    
    const { api } = await import("./api.js");
    game.modules.get("pf2e-visioner").api = api;
    
    
    initializeDetectionWrapper();
    
    // Initialize dialog scroll fix
    initializeDialogScrollFix();
    
  } catch (error) {
    console.error('PF2E Visioner: Initialization failed at step:', error.message);
    console.error('PF2E Visioner: Full error details:', error);
    console.error('PF2E Visioner: Stack trace:', error.stack);
    
    // Try to show a user notification if possible
    if (typeof ui !== 'undefined' && ui.notifications) {
      ui.notifications.error(`PF2E Visioner failed to initialize: ${error.message}`);
    }
  }
});


