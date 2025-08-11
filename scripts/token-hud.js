/**
 * Token HUD integration for PF2E Visioner
 * Based on the approach from pf2e-flatcheck-helper
 */

import { openVisibilityManagerWithMode } from "./api.js";
import { MODULE_ID } from "./constants.js";

/**
 * Handle rendering of token HUD to add visibility button
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
export function onRenderTokenHUD(app, html) {
  // Only add button if HUD button setting is enabled
  if (!game.settings.get(MODULE_ID, "useHudButton")) {
    return;
  }

  // Respect loot-actors setting: do not add for loot when disabled
  try {
    const token = app?.object;
    if (
      token?.actor?.type === "loot" &&
      !game.settings.get(MODULE_ID, "includeLootActors")
    ) {
      return;
    }
  } catch (_) {}

  renderVisibilityButton(app, html);
}

/**
 * Render the visibility button in the token HUD
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
function renderVisibilityButton(app, html) {
  const token = app.object;

  // Only show for GMs
  if (!game.user.isGM) {
    return;
  }

  // Find the left column to add the button
  const column = html.querySelector("div.col.left");
  if (!column) {
    console.warn("PF2E Visioner: Could not find left column in token HUD");
    return;
  }

  // Create the button element
  const buttonElement = document.createElement("div");
  buttonElement.className = "control-icon";
  buttonElement.style.display = "flex";
  buttonElement.setAttribute("data-action", "pf2e-visioner-visibility");
  buttonElement.title =
    "Visibility Manager (Left: Target Mode | Right: Observer Mode)";
  buttonElement.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';

  // Add click handlers for both left and right click
  buttonElement.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, "target");
    } catch (error) {
      console.error(
        "PF2E Visioner: Error opening visibility manager in target mode:",
        error,
      );
    }
  });

  buttonElement.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, "observer");
    } catch (error) {
      console.error(
        "PF2E Visioner: Error opening visibility manager in observer mode:",
        error,
      );
    }
  });

  // Add the button to the column
  column.appendChild(buttonElement);
}
