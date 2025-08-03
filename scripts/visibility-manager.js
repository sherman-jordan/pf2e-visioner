/**
 * ApplicationV2-based Token Visibility Manager
 */

import { VISIBILITY_STATES } from './constants.js';
import { getSceneTargets, getVisibilityMap, setVisibilityMap, showNotification } from './utils.js';
import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';

import { MODULE_ID } from './constants.js';

export class TokenVisibilityManager extends foundry.applications.api.ApplicationV2 {
  
  // Track the current instance to prevent multiple dialogs
  static currentInstance = null;
  
  static DEFAULT_OPTIONS = {
    tag: 'form',
    form: {
      handler: TokenVisibilityManager.formHandler,
      submitOnChange: false,
      closeOnSubmit: false
    },
    window: {
      title: 'PF2E_VISIONER.VISIBILITY_MANAGER.TITLE',
      icon: 'fas fa-eye',
      resizable: true
    },
    position: {
      width: 545,
      height: 600
    },
    actions: {
      apply: TokenVisibilityManager.applyChanges,
      reset: TokenVisibilityManager.resetAll,
      toggleMode: TokenVisibilityManager.toggleMode,
      // PC-specific bulk actions
      bulkPCHidden: TokenVisibilityManager.bulkSetState,
      bulkPCUndetected: TokenVisibilityManager.bulkSetState,
      bulkPCConcealed: TokenVisibilityManager.bulkSetState,
      bulkPCObserved: TokenVisibilityManager.bulkSetState,
      // NPC-specific bulk actions
      bulkNPCHidden: TokenVisibilityManager.bulkSetState,
      bulkNPCUndetected: TokenVisibilityManager.bulkSetState,
      bulkNPCConcealed: TokenVisibilityManager.bulkSetState,
      bulkNPCObserved: TokenVisibilityManager.bulkSetState
    }
  };

  static PARTS = {
    form: {
      template: 'modules/pf2e-visioner/templates/visibility-manager.hbs'
    }
  };

  constructor(observer, options = {}) {
    super(options);
    this.observer = observer;
    this.visibilityData = getVisibilityMap(observer);
    
    // Smart default mode selection
    // If the token is controlled by current user, default to Target Mode ("how others see me")
    // Otherwise, default to Observer Mode ("how I see others")
    const isControlledByUser = observer.actor?.hasPlayerOwner && observer.isOwner;
    this.mode = options.mode || (isControlledByUser ? 'target' : 'observer');
    
    // Set this as the current instance
    TokenVisibilityManager.currentInstance = this;
  }

  /**
   * Update the observer and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   */
  updateObserver(newObserver) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    
    // Update mode based on new observer
    const isControlledByUser = newObserver.actor?.hasPlayerOwner && newObserver.isOwner;
    this.mode = isControlledByUser ? 'target' : 'observer';
    
    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    if (!this.observer) {
      context.error = game.i18n.localize('PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED');
      return context;
    }

    // Add mode information to context
    context.mode = this.mode;
    context.isObserverMode = this.mode === 'observer';
    context.isTargetMode = this.mode === 'target';

    const sceneTokens = getSceneTargets(this.observer);

    // Get proper avatar image - be more strict about what we accept
    const getTokenImage = (token) => {
      // Only use actor portrait if it exists and isn't a generic token
      if (token.actor?.img && 
          token.actor.img !== "icons/svg/mystery-man.svg" && 
          !token.actor.img.includes("tokens/") &&
          !token.actor.img.includes("Token") &&
          token.actor.img.includes(".")) {
        return token.actor.img;
      }
      
      // Use a clean fallback instead of any potentially bad images
      return "icons/svg/book.svg"; // Clean book icon as fallback
    };

    context.observer = {
      id: this.observer.document.id,
      name: this.observer.document.name,
      img: getTokenImage(this.observer)
    };

    // Prepare target data based on mode
    let allTargets;
    
    if (this.mode === 'observer') {
      // Observer Mode: "How I see others"
      allTargets = sceneTokens.map(token => {
        const currentState = this.visibilityData[token.document.id] || 'observed';
        
        const disposition = token.document.disposition || 0;
        
        return {
          id: token.document.id,
          name: token.document.name,
          img: getTokenImage(token),
          currentState,
          isPC: token.actor?.hasPlayerOwner || token.actor?.type === 'character',
          disposition: disposition,
          dispositionClass: disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
          states: Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
            value: key,
            label: game.i18n.localize(config.label),
            selected: currentState === key,
            icon: config.icon,
            color: config.color
          }))
        };
      });
    } else {
      // Target Mode: "How others see me"
      allTargets = sceneTokens.map(observerToken => {
        // Get how this observer sees the selected token (reversed relationship)
        const observerVisibilityData = getVisibilityMap(observerToken);
        const currentState = observerVisibilityData[this.observer.document.id] || 'observed';
        
        const disposition = observerToken.document.disposition || 0;
        
        return {
          id: observerToken.document.id,
          name: observerToken.document.name,
          img: getTokenImage(observerToken),
          currentState,
          isPC: observerToken.actor?.hasPlayerOwner || observerToken.actor?.type === 'character',
          disposition: disposition,
          dispositionClass: disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
          states: Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
            value: key,
            label: game.i18n.localize(config.label),
            selected: currentState === key,
            icon: config.icon,
            color: config.color
          }))
        };
      });
    }

    // Define status precedence for sorting (undetected > hidden > concealed > observed)
    const statusPrecedence = {
      'undetected': 0,
      'hidden': 1,
      'concealed': 2,
      'observed': 3
    };

    // Sort function by status precedence, then by name
    const sortByStatusAndName = (a, b) => {
      const statusA = statusPrecedence[a.currentState] ?? 999;
      const statusB = statusPrecedence[b.currentState] ?? 999;
      
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      
      // If same status, sort alphabetically by name
      return a.name.localeCompare(b.name);
    };

    // Split targets into PCs and NPCs and sort each group
    context.pcTargets = allTargets.filter(target => target.isPC).sort(sortByStatusAndName);
    context.npcTargets = allTargets.filter(target => !target.isPC).sort(sortByStatusAndName);
    context.targets = allTargets; // Keep for backward compatibility

    context.visibilityStates = Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
      key,
      label: game.i18n.localize(config.label),
      icon: config.icon,
      color: config.color
    }));

    context.hasTargets = allTargets.length > 0;
    context.hasPCs = context.pcTargets.length > 0;
    context.hasNPCs = context.npcTargets.length > 0;
    
    // Check if we're showing targeted tokens
    const targetedTokens = Array.from(game.user.targets).filter(token =>
      token.document.id !== this.observer?.document.id
    );
    context.showingTargetedTokens = targetedTokens.length > 0;
    context.targetedTokensCount = targetedTokens.length;

    return context;
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await renderTemplate(this.constructor.PARTS.form.template, context);
    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  /**
   * Handle form submission
   */
  static async formHandler(event, form, formData) {
    const app = this;
    const visibilityChanges = {};
    
    // Parse visibility changes from form data
    const formDataObj = formData.object || formData;
    for (const [key, value] of Object.entries(formDataObj)) {
      if (key.startsWith('visibility.')) {
        const tokenId = key.replace('visibility.', '');
        visibilityChanges[tokenId] = value;
      }
    }

    // Handle visibility updates based on mode

    
    if (app.mode === 'observer') {
      // Observer Mode: "How I see others" - update this observer's visibility map
      await setVisibilityMap(app.observer, visibilityChanges);
      
      // Update off-guard effects: this observer gets effects for targets they see as hidden
      for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
        const targetToken = canvas.tokens.get(tokenId);
        if (targetToken) {

          
          try {
            // In Observer Mode: effect goes on the hidden token (targetToken) targeting the observer
            await updateEphemeralEffectsForVisibility(targetToken, app.observer, newState);
          } catch (error) {
            console.error('Visibility Manager: Error updating off-guard effects:', error);
          }
        }
      }
    } else {
      // Target Mode: "How others see me" - update each observer's visibility map
      for (const [observerTokenId, newState] of Object.entries(visibilityChanges)) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (observerToken) {

          
          // Update the observer's visibility map to show how they see the selected token
          const observerVisibilityData = getVisibilityMap(observerToken);
          observerVisibilityData[app.observer.document.id] = newState;
          await setVisibilityMap(observerToken, observerVisibilityData);
          
          // Update off-guard effects: in Target Mode, the selected token gets effects for observers who see them as hidden
          try {
            // In Target Mode: effect goes on the selected token (app.observer) targeting the observer
            await updateEphemeralEffectsForVisibility(app.observer, observerToken, newState);
          } catch (error) {
            console.error('Visibility Manager: Error updating off-guard effects:', error);
          }
        }
      }
    }
    
    // Import and update visuals
    const { updateTokenVisuals } = await import('./effects-coordinator.js');
    await updateTokenVisuals();
    
    return app.render();
  }

  /**
   * Apply changes and close
   */
  static async applyChanges(event, button) {
    await this.submit();
    
    // Force update visuals immediately
    const { updateTokenVisuals } = await import('./effects-coordinator.js');
    await updateTokenVisuals();
    
    this.close();
  }

  /**
   * Reset all visibility states to observed
   */
  static async resetAll(event, button) {
    const app = this;
    
    // Clear the visibility map
    await setVisibilityMap(app.observer, {});
    
    return app.render();
  }

  /**
   * Toggle between Observer and Target modes
   */
  static async toggleMode(event, button) {
    const app = this;
    
    // Store current position and size to prevent jumping
    const currentPosition = app.position;
    
    // Toggle the mode
    app.mode = app.mode === 'observer' ? 'target' : 'observer';
    

    
    // Re-render with preserved position
    await app.render({ force: true });
    
    // Restore position after render to prevent jumping
    if (currentPosition) {
      app.setPosition({
        left: currentPosition.left,
        top: currentPosition.top,
        width: currentPosition.width
      });
    }
  }

  /**
   * Bulk set visibility state for tokens (only changes dropdown values, doesn't apply immediately)
   * Now supports filtering by target type (PC/NPC)
   */
  static async bulkSetState(event, button) {
    try {
      const state = button.dataset.state;
      const targetType = button.dataset.targetType; // 'pc' or 'npc'
      
      if (!state) {
        console.warn('No state specified for bulk action');
        return;
      }
      
      // Update dropdown values in the form, filtered by target type
      const form = event.target.closest('form');
      if (form) {
        let selector = 'select[name^="visibility."]';
        
        // If target type is specified, filter to only that section
        if (targetType === 'pc') {
          selector = '.table-section:has(.header-left .fa-users) select[name^="visibility."]';
        } else if (targetType === 'npc') {
          selector = '.table-section:has(.header-left .fa-dragon) select[name^="visibility."]';
        }
        
        const selects = form.querySelectorAll(selector);
        selects.forEach(select => {
          select.value = state;
        });
      }
      
    } catch (error) {
      console.error('Error in bulk set state:', error);
      showNotification('An error occurred while setting bulk visibility state', 'error');
    }
  }

  /**
   * Override _onRender to add custom event listeners
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.addTokenHighlighting();
  }

  /**
   * Clean up when closing
   */
  async close(options = {}) {
    // Clean up any remaining token borders
    this.cleanupAllTokenBorders();
    
    // Clear the current instance reference
    if (TokenVisibilityManager.currentInstance === this) {
      TokenVisibilityManager.currentInstance = null;
    }
    
    return super.close(options);
  }

  /**
   * Clean up all token borders when closing the application
   */
  cleanupAllTokenBorders() {
    canvas.tokens.placeables.forEach(token => {
      this.removeTokenBorder(token);
    });
  }

  /**
   * Add hover highlighting to help identify tokens on canvas
   */
  addTokenHighlighting() {
    const element = this.element;
    if (!element) return;

    // Find all token rows in the table
    const rows = element.querySelectorAll('tr[data-token-id]');
    
    rows.forEach(row => {
      const tokenId = row.dataset.tokenId;
      const token = canvas.tokens.get(tokenId);
      
      if (!token) return;
      
      // Add highlighting only for token image
      const image = row.querySelector('.token-image img');
      
      if (image) {
        image.addEventListener('mouseenter', () => {
          this.highlightToken(token, true, true); // Strong highlight
        });
        
        image.addEventListener('mouseleave', () => {
          this.highlightToken(token, false);
        });
        
        // Add cursor pointer to indicate interactivity
        image.style.cursor = 'pointer';
      }
    });
  }

  /**
   * Highlight or unhighlight a token on the canvas
   */
  highlightToken(token, highlight, strong = false) {
    if (!token || !token.mesh) return;
    
    if (highlight) {
      // Create a subtle border highlight instead of scaling/tinting
      this.addTokenBorder(token, strong);
    } else {
      // Remove the border highlight
      this.removeTokenBorder(token);
    }
  }

  /**
   * Add a subtle border around the token
   */
  addTokenBorder(token, strong = false) {
    // Remove existing border if any
    this.removeTokenBorder(token);
    
    // Create a border graphic
    const border = new PIXI.Graphics();
    const padding = 4;
    
    // Different styles for subtle vs strong highlighting
    const borderColor = strong ? 0xFFD700 : 0xFFA500; // Gold vs Orange
    const borderWidth = strong ? 3 : 2;
    const alpha = strong ? 0.9 : 0.7;
    
    // Get token dimensions
    const tokenWidth = token.document.width * canvas.grid.size;
    const tokenHeight = token.document.height * canvas.grid.size;
    
    // Draw a rounded rectangle border centered on the token
    border.lineStyle(borderWidth, borderColor, alpha);
    border.drawRoundedRect(
      -tokenWidth/2 - padding,
      -tokenHeight/2 - padding,
      tokenWidth + padding * 2,
      tokenHeight + padding * 2,
      8 // Corner radius
    );
    
    // Position the border at the token's center
    border.x = token.document.x + tokenWidth/2;
    border.y = token.document.y + tokenHeight/2;
    
    // Add to the tokens layer so it appears correctly
    canvas.tokens.addChild(border);
    
    // Store reference for cleanup
    token._highlightBorder = border;
  }

  /**
   * Remove the border highlight from a token
   */
  removeTokenBorder(token) {
    if (token._highlightBorder) {
      // Remove from canvas
      if (token._highlightBorder.parent) {
        token._highlightBorder.parent.removeChild(token._highlightBorder);
      }
      
      // Destroy the graphics object
      token._highlightBorder.destroy();
      delete token._highlightBorder;
    }
  }
}