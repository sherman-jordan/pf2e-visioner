/**
 * FoundryVTT hooks registration and handling
 */

/**
 * Register all FoundryVTT hooks
 */
export function registerHooks() {
  // Always delegate to modular registration
  (async () => {
    try {
      const { registerHooks: registerModular } = await import("./hooks/registration.js");
      registerModular();
    } catch (e) {
      console.error("PF2E Visioner: failed to register modular hooks", e);
    }
  })();
}


