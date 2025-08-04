
// Import settings
import { registerSettings, registerKeybindings } from "./settings.js";

// Import effects coordinator
import { initializeMechanicalEffects } from "./effects-coordinator.js";

// Import detection wrapper
import { initializeDetectionWrapper } from "./detection-wrapper.js";

// Import hooks
import { registerHooks } from "./hooks.js";



Hooks.once("init", async () => {
  
  try {
    registerSettings();
    
    registerKeybindings();
    
    registerHooks();
    
    const { api } = await import("./api.js");
    game.modules.get("pf2e-visioner").api = api;
    
    initializeMechanicalEffects();
    
    initializeDetectionWrapper();
    
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


