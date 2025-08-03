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
    console.error('PF2E Visioner: Initialization failed:', error);
  }
});


