/**
 * FoundryVTT hooks registration and handling
 */

import { MODULE_TITLE } from './constants.js';
import { updateTokenVisuals } from './effects-coordinator.js';
import { cleanupHoverTooltips, initializeHoverTooltips, onHighlightObjects, onKeyDown, onKeyUp } from './hover-tooltips.js';
import { onRenderTokenHUD } from './token-hud.js';

// Flag to prevent duplicate event listener registration
let keyListenersRegistered = false;

/**
 * Register all FoundryVTT hooks
 */
export function registerHooks() {
  console.log('PF2E Visioner: Registering hooks...');
  Hooks.on('ready', onReady);
  Hooks.on('controlToken', onControlToken);
  Hooks.on('getTokenHUDButtons', onGetTokenHUDButtons);
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('canvasReady', onCanvasReady);
  Hooks.on('highlightObjects', onHighlightObjects);
  // Note: refreshToken hook removed to prevent infinite loops when applying visibility states
  Hooks.on('createToken', onTokenCreated);
  Hooks.on('deleteToken', onTokenDeleted);
  console.log('PF2E Visioner: All hooks registered, including renderTokenHUD');
  
  // Add O key event listeners for visibility tooltips (only once)
  if (!keyListenersRegistered) {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    keyListenersRegistered = true;
    console.log('PF2E Visioner: O key event listeners registered');
  }
  
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
      console.log('PF2E Visioner: Token targeted, could add HUD button here');
    }
  });
  
  // Try approach 2: Listen for canvas right-clicks
  Hooks.on('canvasReady', () => {
    if (canvas?.stage) {
      canvas.stage.on('rightclick', (event) => {
        const token = canvas.tokens.get(event.target?.id);
        if (token && game.user.isGM) {
          console.log('PF2E Visioner: Right-clicked on token:', token.name);
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
      console.log('PF2E Visioner: TokenHUD getData called', data);
      return data;
    };
  }
}

/**
 * Handle the ready hook
 */
function onReady() {
  console.log(`${MODULE_TITLE} | Ready`);
  console.log('FoundryVTT Version:', game.version);
  console.log('PF2E System Version:', game.system.version);
  
  // Add a fallback approach - add a floating button when tokens are selected (only if HUD button is disabled)
  if (!game.settings.get('pf2e-visioner', 'useHudButton')) {
    setupFallbackHUDButton();
  }
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
      console.log('PF2E Visioner: Adding floating button for controlled token');
      
      const button = document.createElement('div');
      button.className = 'pf2e-visioner-floating-button';
      button.innerHTML = '<i class="fas fa-face-hand-peeking"></i>';
      button.title = 'Visibility Manager (Left: Target, Right: Observer) - Drag to move';
      
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
          console.log('PF2E Visioner: Click ignored - just finished dragging');
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        
        console.log('PF2E Visioner: Floating button clicked (left-click)');
        event.preventDefault();
        event.stopPropagation();
        
        try {
          const { openVisibilityManagerWithMode } = await import('./api.js');
          console.log('PF2E Visioner: Opening visibility manager in target mode for token:', token.name);
          await openVisibilityManagerWithMode(token, 'target');
        } catch (error) {
          console.error('PF2E Visioner: Error opening visibility manager:', error);
        }
      });
      
      button.addEventListener('contextmenu', async (event) => {
        // Don't open menu if we just finished dragging
        if (hasDragged) {
          console.log('PF2E Visioner: Right-click ignored - just finished dragging');
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        
        console.log('PF2E Visioner: Floating button right-clicked');
        event.preventDefault();
        event.stopPropagation();
        
        try {
          const { openVisibilityManagerWithMode } = await import('./api.js');
          console.log('PF2E Visioner: Opening visibility manager in observer mode for token:', token.name);
          await openVisibilityManagerWithMode(token, 'observer');
        } catch (error) {
          console.error('PF2E Visioner: Error opening visibility manager:', error);
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
 * Add visibility manager button to token HUD
 * @param {TokenHUD} hud - The token HUD
 * @param {Array} buttons - The buttons array
 * @param {Token} token - The token
 */
function onGetTokenHUDButtons(hud, buttons, token) {
  console.log('PF2E Visioner: onGetTokenHUDButtons called', { isGM: game.user.isGM, buttons: buttons.length, token });
  
  if (!game.user.isGM) {
    console.log('PF2E Visioner: Not GM, skipping button');
    return;
  }
  
  console.log('PF2E Visioner: Adding visibility button to HUD buttons array');
  
  // Add the visibility button
  buttons.push({
    name: 'visibility',
    title: 'Visibility Manager (Left: Target Mode, Right: Observer Mode)',
    icon: 'fas fa-eye',
    onClick: async () => {
      console.log('PF2E Visioner: Button clicked - opening in target mode');
      const { openVisibilityManagerWithMode } = await import('./api.js');
      await openVisibilityManagerWithMode(token, 'target');
    },
    button: true
  });
  
  console.log('PF2E Visioner: Button added to array, total buttons:', buttons.length);
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