/**
 * Debug macro for Auto-Visibility System
 * This macro helps debug visibility calculations and lighting detection
 */

// Check if the system is available
if (!globalThis.pf2eVisionerAutoVisibility) {
  ui.notifications.error("Auto-Visibility System not found. Make sure PF2E Visioner is enabled.");
  return;
}

const autoVis = globalThis.pf2eVisionerAutoVisibility;

// Get selected tokens
const selectedTokens = canvas.tokens.controlled;
if (selectedTokens.length === 0) {
  ui.notifications.warn("Please select at least one token to debug.");
  return;
}

// Debug information
console.log("=== PF2E Visioner Auto-Visibility Debug ===");
console.log("System enabled:", autoVis.isEnabled);
console.log("Scene darkness:", canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? "undefined");
console.log("Light sources:", canvas.lighting?.placeables?.length ?? 0);

// For each selected token, show debug info
for (const token of selectedTokens) {
  console.log(`\n--- Token: ${token.name} ---`);
  console.log("Position:", { x: token.x, y: token.y, center: token.center });
  
  // Get light level at token position
  const lightLevel = autoVis._getLightLevelAt ? autoVis._getLightLevelAt(token.center) : "Method not accessible";
  console.log("Light level at position:", lightLevel);
  
  // Get vision capabilities
  const vision = autoVis._getVisionCapabilities ? autoVis._getVisionCapabilities(token) : "Method not accessible";
  console.log("Vision capabilities:", vision);
  
  // Check visibility to other tokens
  const otherTokens = canvas.tokens.placeables.filter(t => t !== token && t.actor);
  if (otherTokens.length > 0) {
    console.log("Visibility to other tokens:");
    for (const otherToken of otherTokens.slice(0, 3)) { // Limit to first 3 to avoid spam
      autoVis.calculateVisibility(token, otherToken).then(visibility => {
        console.log(`  → ${otherToken.name}: ${visibility}`);
      });
    }
  }
}

// Show current settings
console.log("\n--- Settings ---");
console.log("Auto-Visibility Enabled:", game.settings.get('pf2e-visioner', 'autoVisibilityEnabled'));
console.log("Update on Movement:", game.settings.get('pf2e-visioner', 'autoVisibilityUpdateOnMovement'));
console.log("Update on Lighting:", game.settings.get('pf2e-visioner', 'autoVisibilityUpdateOnLighting'));
console.log("Debug Mode:", game.settings.get('pf2e-visioner', 'autoVisibilityDebugMode'));

ui.notifications.info("Debug information logged to console. Check the browser console (F12) for details.");

// Offer to recalculate all visibility
new Dialog({
  title: "Auto-Visibility Debug",
  content: `
    <p>Debug information has been logged to the console.</p>
    <p><strong>Scene Darkness:</strong> ${canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? "undefined"}</p>
    <p><strong>Light Sources:</strong> ${canvas.lighting?.placeables?.length ?? 0}</p>
    <p><strong>System Enabled:</strong> ${autoVis.isEnabled}</p>
    <p>Would you like to recalculate visibility for all tokens?</p>
  `,
  buttons: {
    recalculate: {
      label: "Recalculate All",
      callback: () => {
        autoVis.recalculateAllVisibility();
        ui.notifications.info("Recalculating visibility for all tokens...");
      }
    },
    close: {
      label: "Close"
    }
  },
  default: "close"
}).render(true);
