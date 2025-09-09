/**
 * Token HUD integration for PF2E Visioner
 * Based on the approach from pf2e-flatcheck-helper
 */

import { openVisibilityManagerWithMode } from '../api.js';
import { MODULE_ID } from '../constants.js';
import { AVSOverrideDialog } from '../managers/avs-override-dialog.js';

/**
 * Handle rendering of token HUD to add visibility button
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
export function onRenderTokenHUD(app, html) {
  // Only add button if HUD button setting is enabled
  if (!game.settings.get(MODULE_ID, 'useHudButton')) {
    return;
  }

  // Respect loot-actors setting: do not add for loot when disabled
  try {
    const token = app?.object;
    if (token?.actor?.type === 'loot' && !game.settings.get(MODULE_ID, 'includeLootActors')) {
      return;
    }
  } catch (_) {}

  renderVisibilityButton(app, html);
  renderAVSOverrideButton(app, html);
}

/**
 * Render the visibility button in the token HUD
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
function renderVisibilityButton(app, html) {
  const token = app.object;
  if (!token) return;

  // Only show for GMs
  if (!game.user.isGM) {
    return;
  }

  // html is a jQuery in Foundry; normalize to a DOM element
  const root = html?.jquery ? html[0] : html;
  if (!root) return;

  // Find the left column to add the button
  let column = root.querySelector('div.col.left');
  if (!column && html?.find) {
    column = html.find('div.col.left')[0];
  }
  if (!column) {
    console.warn('PF2E Visioner: Could not find left column in token HUD');
    return;
  }

  // Remove any existing instance first
  const existing = column.querySelector('[data-action="pf2e-visioner-visibility"]');
  if (existing) existing.remove();

  // Create the button element
  const buttonElement = document.createElement('div');
  buttonElement.className = 'control-icon';
  buttonElement.style.display = 'flex';
  buttonElement.setAttribute('data-action', 'pf2e-visioner-visibility');
  buttonElement.setAttribute(
    'data-tooltip',
    'Visibility Manager (Left: Target Mode | Right: Observer Mode)',
  );
  buttonElement.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';

  // Add click handlers for both left and right click
  buttonElement.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, 'target');
    } catch (error) {
      console.error('PF2E Visioner: Error opening visibility manager in target mode:', error);
    }
  });

  buttonElement.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await openVisibilityManagerWithMode(token, 'observer');
    } catch (error) {
      console.error('PF2E Visioner: Error opening visibility manager in observer mode:', error);
    }
  });

  // Add the button to the column
  column.appendChild(buttonElement);
}

/**
 * Render the AVS override button in the token HUD
 * @param {TokenHUD} app - The token HUD application
 * @param {HTMLElement} html - The HTML element of the HUD
 */
function renderAVSOverrideButton(app, html) {
  const token = app.object;
  if (!token) return;

  // Only show for GMs
  if (!game.user.isGM) {
    return;
  }

  // html is a jQuery in Foundry; normalize to a DOM element
  const root = html?.jquery ? html[0] : html;
  if (!root) return;

  // Find the left column to add the button
  let column = root.querySelector('div.col.left');
  if (!column && html?.find) {
    column = html.find('div.col.left')[0];
  }
  if (!column) {
    console.warn('PF2E Visioner: Could not find left column in token HUD');
    return;
  }

  // Remove any existing instance first
  const existing = column.querySelector('[data-action="pf2e-visioner-avs-override"]');
  if (existing) existing.remove();

  // Create the button element
  const buttonElement = document.createElement('div');
  buttonElement.className = 'control-icon';
  buttonElement.style.display = 'flex';
  buttonElement.setAttribute('data-action', 'pf2e-visioner-avs-override');
  buttonElement.setAttribute('data-tooltip', 'AVS Override Manager');
  buttonElement.innerHTML = '<i class="fas fa-cog"></i>';

  // Add click handler
  buttonElement.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await AVSOverrideDialog.openForToken(token);
    } catch (error) {
      console.error('PF2E Visioner: Error opening AVS override dialog:', error);
    }
  });

  // Add the button to the column
  column.appendChild(buttonElement);
}
