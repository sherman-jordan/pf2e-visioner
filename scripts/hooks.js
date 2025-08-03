/**
 * FoundryVTT hooks registration and handling
 */

import { MODULE_TITLE } from './constants.js';
import { updateTokenVisuals } from './effects-coordinator.js';
import { cleanupHoverTooltips, initializeHoverTooltips } from './hover-tooltips.js';

/**
 * Register all FoundryVTT hooks
 */
export function registerHooks() {
  Hooks.on('ready', onReady);
  Hooks.on('controlToken', onControlToken);
  Hooks.on('getTokenHUDButtons', onGetTokenHUDButtons);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('canvasReady', onCanvasReady);
  // Note: refreshToken hook removed to prevent infinite loops when applying visibility states
  Hooks.on('createToken', onTokenCreated);
  Hooks.on('deleteToken', onTokenDeleted);
}

/**
 * Handle the ready hook
 */
function onReady() {
  console.log(`${MODULE_TITLE} | Ready`);
}

/**
 * Handle token control changes
 * @param {Token} token - The controlled token
 * @param {boolean} controlled - Whether the token is now controlled
 */
async function onControlToken(token, controlled) {
  // Token control no longer triggers visibility updates
  // Visibility effects are persistent based on GM configuration
  // This prevents selection-based changes and maintains persistent relationships
}

/**
 * Add visibility manager button to token HUD
 * @param {TokenHUD} hud - The token HUD
 * @param {Array} buttons - The buttons array
 * @param {Token} token - The token
 */
function onGetTokenHUDButtons(hud, buttons, token) {
  if (!game.user.isGM) return;
  
  buttons.unshift({
    name: 'visibility',
    title: game.i18n.localize('PF2E_VISIONER.CONTEXT_MENU.MANAGE_VISIBILITY'),
    icon: 'fas fa-eye',
    onClick: async () => {
      const { openVisibilityManager } = await import('./api.js');
      await openVisibilityManager(token);
    },
    button: true
  });
}

/**
 * Add context menu option for token directory
 * @param {jQuery} html - The HTML element
 * @param {Array} options - The context menu options
 */
function onGetTokenDirectoryEntryContext(html, options) {
  if (!game.user.isGM) return;
  
  options.push({
    name: 'PF2E_VISIONER.CONTEXT_MENU.MANAGE_VISIBILITY',
    icon: '<i class="fas fa-eye"></i>',
    callback: async (li) => {
      const tokenId = li.data('token-id');
      const token = canvas.tokens.get(tokenId);
      if (token) {
        const { openVisibilityManager } = await import('./api.js');
        await openVisibilityManager(token);
      }
    }
  });
}

/**
 * Handle canvas ready - apply persistent visibility effects
 */
async function onCanvasReady() {
  // Apply persistent visibility effects based on GM configuration
  await updateTokenVisuals();
  
  // Initialize hover tooltips if enabled
  if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
    initializeHoverTooltips();
  }
}

// onRefreshToken function removed to prevent infinite loops

/**
 * Handle token creation - reapply persistent visibility effects
 */
async function onTokenCreated() {
  // Reapply persistent visibility effects to include new token
  setTimeout(async () => {
    await updateTokenVisuals();
    
    // Reinitialize hover tooltips to include new token
    if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
      cleanupHoverTooltips();
      initializeHoverTooltips();
    }
  }, 100);
}

/**
 * Handle token deletion - reapply persistent visibility effects
 */
async function onTokenDeleted() {
  // Reapply persistent visibility effects after token removal
  setTimeout(async () => {
    await updateTokenVisuals();
    
    // Reinitialize hover tooltips to remove deleted token
    if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
      cleanupHoverTooltips();
      initializeHoverTooltips();
    }
  }, 100);
}