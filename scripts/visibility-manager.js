/**
 * ApplicationV2-based Token Visibility Manager
 */

import { VISIBILITY_STATES } from './constants.js';
import { getSceneTargets, getVisibilityMap, setVisibilityMap, showNotification } from './utils.js';

export class TokenVisibilityManager extends foundry.applications.api.ApplicationV2 {
  
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
      width: 600,
      height: 'auto'
    },
    actions: {
      apply: TokenVisibilityManager.applyChanges,
      reset: TokenVisibilityManager.resetAll,
      bulkHidden: TokenVisibilityManager.bulkSetState,
      bulkUndetected: TokenVisibilityManager.bulkSetState,
      bulkConcealed: TokenVisibilityManager.bulkSetState,
      bulkObserved: TokenVisibilityManager.bulkSetState,
      bulkInvisible: TokenVisibilityManager.bulkSetState
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

    // Prepare target data for each token
    const allTargets = sceneTokens.map(token => {
      const currentState = this.visibilityData[token.document.id] || 'observed';
      
      const disposition = token.document.disposition || 0; // 0 = neutral, -1 = hostile, 1 = friendly
      
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

    // Split targets into PCs and NPCs
    context.pcTargets = allTargets.filter(target => target.isPC);
    context.npcTargets = allTargets.filter(target => !target.isPC);
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

    // Update the visibility map
    await setVisibilityMap(app.observer, visibilityChanges);
    
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
    await setVisibilityMap(this.observer, {});
    const { updateTokenVisuals } = await import('./effects-coordinator.js');
    await updateTokenVisuals();
    this.render();
  }

  /**
   * Bulk set visibility state for all tokens (only changes dropdown values, doesn't apply immediately)
   */
  static async bulkSetState(event, button) {
    try {
      const state = button.dataset.state;
      if (!state) {
        console.warn('No state specified for bulk action');
        return;
      }
      
      // Update all dropdown values in the form
      const form = event.target.closest('form');
      if (form) {
        const selects = form.querySelectorAll('select[name^="visibility."]');
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