/**
 * FoundryVTT hooks registration and handling
 */

import { injectChatAutomationStyles } from './chat/chat-automation-styles.js';
import { onRenderChatMessage } from './chat/chat-processor.js';
import { rebuildAllEphemeralEffects, updateTokenVisuals } from './effects-coordinator.js';
import { cleanupHoverTooltips, initializeHoverTooltips, onHighlightObjects } from './hover-tooltips.js';
import { registerSocket } from './socket.js';
import { onRenderTokenHUD } from './token-hud.js';

/**
 * Register all FoundryVTT hooks
 */
export function registerHooks() {
  Hooks.on('ready', onReady);
  Hooks.on('controlToken', onControlToken);
  Hooks.on('getTokenHUDButtons', onGetTokenHUDButtons);
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('renderChatMessage', onRenderChatMessage);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('canvasReady', onCanvasReady);
  Hooks.on('highlightObjects', onHighlightObjects);
  // Note: refreshToken hook removed to prevent infinite loops when applying visibility states
  Hooks.on('createToken', onTokenCreated);
Hooks.on('deleteToken', onTokenDeleted);
  
  // Encounter hooks to reset dialog states
  Hooks.on('updateCombat', onUpdateCombat);
  Hooks.on('deleteCombat', onDeleteCombat);
  
  // Try alternative HUD button approaches
  setupAlternativeHUDButton();
}

/**
 * Setup alternative token HUD button approach
 */
function setupAlternativeHUDButton() {
  // Try approach 1: Hook into canvas token right-click
  Hooks.on('targetToken', (user, token, targeted) => {
    if (game.user.isGM && targeted) {
    }
  });
  
  // Try approach 2: Listen for canvas right-clicks
  Hooks.on('canvasReady', () => {
    if (canvas?.stage) {
      canvas.stage.on('rightclick', (event) => {
        const token = canvas.tokens.get(event.target?.id);
        if (token && game.user.isGM) {
          // Could show a custom context menu here
        }
      });
    }
  });
  
  // Try approach 3: Patch the TokenHUD class
  if (window.TokenHUD) {
    const originalGetData = window.TokenHUD.prototype.getData;
    window.TokenHUD.prototype.getData = function() {
      const data = originalGetData.call(this);
      return data;
    };
  }
}

/**
 * Handle the ready hook
 */
function onReady() {
  // Add CSS styles for chat automation
  injectChatAutomationStyles();
  
  // Add a fallback approach - add a floating button when tokens are selected (only if HUD button is disabled)
  if (!game.settings.get('pf2e-visioner', 'useHudButton')) {
    setupFallbackHUDButton();
  }

  registerSocket();
}

/**
 * Setup fallback HUD button approach
 */
function setupFallbackHUDButton() {
  // Add CSS for floating button
  const style = document.createElement('style');
  style.textContent = `
    .pf2e-visioner-floating-button {
      position: fixed;
      top: 50%;
      left: 10px;
      width: 40px;
      height: 40px;
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid #4a90e2;
      border-radius: 8px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: move;
      z-index: 1000;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
      user-select: none;
    }
    .pf2e-visioner-floating-button:hover {
      background: rgba(0, 0, 0, 0.9);
      border-color: #6bb6ff;
      transform: scale(1.05);
    }
    .pf2e-visioner-floating-button.dragging {
      cursor: grabbing;
      transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
  
  // Add button when tokens are controlled (only if HUD button is disabled)
  Hooks.on('controlToken', (token, controlled) => {
    // Remove any existing buttons
    document.querySelectorAll('.pf2e-visioner-floating-button').forEach(btn => btn.remove());
    
    // Only show floating button if HUD button is disabled
    if (controlled && game.user.isGM && !game.settings.get('pf2e-visioner', 'useHudButton')) {
      const button = document.createElement('div');
      button.className = 'pf2e-visioner-floating-button';
      button.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';
      button.title = 'Token Manager (Left: Target, Right: Observer) - Drag to move';
      
      // Add drag functionality
      let isDragging = false;
      let hasDragged = false;
      let dragStartPos = { x: 0, y: 0 };
      let dragOffset = { x: 0, y: 0 };
      
      button.addEventListener('mousedown', (event) => {
        if (event.button === 0) { // Left mouse button
          isDragging = true;
          hasDragged = false;
          dragStartPos.x = event.clientX;
          dragStartPos.y = event.clientY;
          
          const rect = button.getBoundingClientRect();
          dragOffset.x = event.clientX - rect.left;
          dragOffset.y = event.clientY - rect.top;
          
          event.preventDefault();
        }
      });
      
      document.addEventListener('mousemove', (event) => {
        if (isDragging) {
          const dragDistance = Math.sqrt(
            Math.pow(event.clientX - dragStartPos.x, 2) + 
            Math.pow(event.clientY - dragStartPos.y, 2)
          );
          
          // If moved more than 5 pixels, consider it a drag
          if (dragDistance > 5 && !hasDragged) {
            hasDragged = true;
            button.classList.add('dragging');
          }
          
          if (hasDragged) {
            const x = event.clientX - dragOffset.x;
            const y = event.clientY - dragOffset.y;
            
            // Keep button within viewport bounds
            const maxX = window.innerWidth - button.offsetWidth;
            const maxY = window.innerHeight - button.offsetHeight;
            
            button.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            button.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
          }
          
          event.preventDefault();
        }
      });
      
      document.addEventListener('mouseup', (event) => {
        if (isDragging) {
          isDragging = false;
          button.classList.remove('dragging');
          
          // Save position to localStorage if we actually dragged
          if (hasDragged) {
            localStorage.setItem('pf2e-visioner-button-pos', JSON.stringify({
              left: button.style.left,
              top: button.style.top
            }));
          }
          
          // Add a small delay to prevent click events after drag
          if (hasDragged) {
            setTimeout(() => {
              hasDragged = false;
            }, 100);
          } else {
            hasDragged = false;
          }
        }
      });
      
      // Restore saved position
      const savedPos = localStorage.getItem('pf2e-visioner-button-pos');
      if (savedPos) {
        try {
          const pos = JSON.parse(savedPos);
          if (pos.left) button.style.left = pos.left;
          if (pos.top) button.style.top = pos.top;
        } catch (e) {
          console.warn('PF2E Visioner: Could not restore button position');
        }
      }
      
      // Add click handlers with debugging
      button.addEventListener('click', async (event) => {
        // Don't open menu if we just finished dragging
        if (hasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        
        try {
          const { openTokenManagerWithMode } = await import('./api.js');
          await openTokenManagerWithMode(token, 'target');
        } catch (error) {
          console.error('PF2E Visioner: Error opening token manager:', error);
        }
      });
      
      button.addEventListener('contextmenu', async (event) => {
        // Don't open menu if we just finished dragging
        if (hasDragged) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        
        try {
          const { openTokenManagerWithMode } = await import('./api.js');
          await openTokenManagerWithMode(token, 'observer');
        } catch (error) {
          console.error('PF2E Visioner: Error opening token manager:', error);
        }
      });
      
      document.body.appendChild(button);
    }
  });
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
 * Add token manager button to token HUD
 * @param {TokenHUD} hud - The token HUD
 * @param {Array} buttons - The buttons array
 * @param {Token} token - The token
 */
function onGetTokenHUDButtons(hud, buttons, token) {
  // Add the token manager button
  buttons.push({
    name: 'token-manager',
    title: 'Token Manager (Left: Target Mode, Right: Observer Mode)',
    icon: 'fas fa-eye',
    onClick: async () => {
      const { openTokenManagerWithMode } = await import('./api.js');
      await openTokenManagerWithMode(token, 'target');
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
    name: 'PF2E_VISIONER.CONTEXT_MENU.MANAGE_TOKEN',
    icon: '<i class="fas fa-eye"></i>',
    callback: async (li) => {
      const tokenId = li.data('token-id');
      const token = canvas.tokens.get(tokenId);
      if (token) {
        const { openTokenManager } = await import('./api.js');
        await openTokenManager(token);
      }
    }
  });
}

/**
 * Handle canvas ready - apply persistent visibility and cover effects
 */
async function onCanvasReady() {
  // Rebuild ephemeral effects from maps when the canvas is ready (GM),
  // otherwise do a light visual refresh for players
  if (game.user.isGM) {
    try { await rebuildAllEphemeralEffects(); } catch (e) { console.warn('PF2E Visioner: rebuild on canvasReady failed', e); }
  } else {
    await updateTokenVisuals();
  }
  
  // Initialize hover tooltips if enabled
  if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
    initializeHoverTooltips();
  }
}

// onRefreshToken function removed to prevent infinite loops

/**
 * Handle token creation - reapply persistent visibility and cover effects
 */
async function onTokenCreated(scene, tokenDoc) {
  // Reapply persistent visibility and cover effects to include new token
  try {
    // Try restore of maps if this is an undo of a deletion
    const { restoreDeletedTokenMaps } = await import('./utils.js');
    const restored = await restoreDeletedTokenMaps(tokenDoc);
    if (restored && game.user.isGM) {
      // Ensure aggregates reflect restored maps
      const { rebuildAllEphemeralEffects } = await import('./effects-coordinator.js');
      await rebuildAllEphemeralEffects();
    }
  } catch (_) {}

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
 * Handle token deletion - clean up visibility maps and effects
 * @param {Scene} scene - The scene containing the token
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
async function onTokenDeleted(...args) {
  try {
    // Handle Foundry version differences: (scene, tokenDoc, options, userId) vs (tokenDoc, context, userId)
    let tokenDoc = null;
    for (const a of args) {
      if (a && typeof a === 'object') {
        // TokenDocument typically has an actor and a parent Scene
        if (a?.actor && (a?.parent || a?.scene || a?.documentName === 'Token')) {
          tokenDoc = a;
          break;
        }
      }
    }
    if (!tokenDoc) {
      // Fallback: if first arg is a Scene, second is likely the TokenDocument
      if (args[0]?.tokens && args[1]?.actor) tokenDoc = args[1];
    }
    if (!tokenDoc?.id) return;

    // Import the cleanup functions
    const { cleanupDeletedToken } = await import('./utils.js');
    const { cleanupDeletedTokenEffects } = await import('./off-guard-ephemeral.js');
    const { cleanupDeletedTokenCoverEffects } = await import('./cover-ephemeral.js');
    
    // Clean up visibility maps and effects
    if (tokenDoc) {
      // First clean up the visibility maps
      try { await cleanupDeletedToken(tokenDoc); } catch (e) { console.warn('PF2E Visioner: map cleanup failed', e); }
      
      // Then clean up visibility and cover effects
      await Promise.all([
        cleanupDeletedTokenEffects(tokenDoc),
        cleanupDeletedTokenCoverEffects(tokenDoc)
      ]);
    }
    
    // Reapply persistent visibility and cover effects after token removal
    setTimeout(async () => {
      try {
        if (game.user.isGM) {
          // Rebuild aggregates strictly from maps to guarantee purged rules
          await rebuildAllEphemeralEffects();
        } else {
          await updateTokenVisuals();
        }
      } catch (e) {
        console.warn('PF2E Visioner: post-delete rebuild failed', e);
      }
      
      // Reinitialize hover tooltips to remove deleted token
      if (game.settings.get('pf2e-visioner', 'enableHoverTooltips')) {
        cleanupHoverTooltips();
        initializeHoverTooltips();
      }
    }, 100);
  } catch (error) {
    console.error('PF2E Visioner: Error cleaning up deleted token:', error);
  }
}

/**
 * Handle combat updates - reset encounter filter when combat ends
 */
function onUpdateCombat(combat, updateData, options, userId) {
  // Check if combat has ended (started: false)
  if (updateData.hasOwnProperty('started') && updateData.started === false) {
    resetEncounterFiltersInDialogs();
  }
}

/**
 * Handle combat deletion - reset encounter filter
 */
function onDeleteCombat(combat, options, userId) {
  resetEncounterFiltersInDialogs();
}

/**
 * Reset encounter filters in all open dialogs
 */
function resetEncounterFiltersInDialogs() {
  // Reset Hide dialog encounter filter
  const hideDialogs = Object.values(ui.windows).filter(w => w.constructor.name === 'HidePreviewDialog');
  hideDialogs.forEach(dialog => {
    if (dialog.encounterOnly) {
      dialog.encounterOnly = false;
      
      // Update the checkbox in the UI
      const checkbox = dialog.element?.querySelector('input[data-action="toggleEncounterFilter"]');
      if (checkbox) {
        checkbox.checked = false;
      }
      
      // Re-render the dialog to show all tokens
      dialog.render({ force: true });
    }
  });
  
  // Reset Seek dialog encounter filter
  const seekDialogs = Object.values(ui.windows).filter(w => w.constructor.name === 'SeekPreviewDialog');
  seekDialogs.forEach(dialog => {
    if (dialog.encounterOnly) {
      dialog.encounterOnly = false;
      
      // Update the checkbox in the UI
      const checkbox = dialog.element?.querySelector('input[data-action="toggleEncounterFilter"]');
      if (checkbox) {
        checkbox.checked = false;
      }
      
      // Re-render the dialog to show all tokens
      dialog.render({ force: true });
    }
  });
  
  // Reset Point Out dialog encounter filter if it exists
  const pointOutDialogs = Object.values(ui.windows).filter(w => w.constructor.name === 'PointOutPreviewDialog');
  pointOutDialogs.forEach(dialog => {
    if (dialog.encounterOnly) {
      dialog.encounterOnly = false;
      
      // Update the checkbox in the UI
      const checkbox = dialog.element?.querySelector('input[data-action="toggleEncounterFilter"]');
      if (checkbox) {
        checkbox.checked = false;
      }
      
      // Re-render the dialog to show all tokens
      dialog.render({ force: true });
    }
  });
}
