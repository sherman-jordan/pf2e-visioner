/**
 * PF2E Per-Token Visibility Module for FoundryVTT v13
 *
 * Advanced per-observer visibility system for PF2E that allows setting individual
 * visibility conditions between specific tokens with modern UI and visual effects.
 *
 * @author Module Developer
 * @version 0.2.0
 * @license Apache-2.0
 */

import { MODULE_TITLE } from "./constants.js";
import { initializeDetectionWrapper } from "./detection-wrapper.js";
import { initializeMechanicalEffects } from "./effects-coordinator.js";
import { registerHooks } from "./hooks.js";
import { registerKeybindings, registerSettings } from "./settings.js";

/**
 * Main module initialization class
 */
class PerTokenVisibility {
  /**
   * Initialize the module
   */
  static async initialize() {
    registerSettings();
    registerKeybindings();
    registerHooks();

    // Initialize mechanical effects
    initializeMechanicalEffects();

    // Initialize detection system wrapper
    initializeDetectionWrapper();

    // Expose API globally for console access and other modules (lazy loaded)
    const { PerTokenVisibilityAPI, compatibleAPI } = await import("./api.js");
    window.PerTokenVisibility = PerTokenVisibilityAPI;

    // Expose API for external modules
    game.modules.get("pf2e-visioner").api = compatibleAPI;
  }
}

// Initialize module when Foundry is ready
Hooks.once("init", () => {
  PerTokenVisibility.initialize();
});
