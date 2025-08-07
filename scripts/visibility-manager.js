/**
 * ApplicationV2-based Token Visibility Manager
 */

import { VISIBILITY_STATES } from './constants.js';
import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';
import { refreshEveryonesPerception } from './socket.js';
import { getSceneTargets, getVisibilityMap, hasActiveEncounter, setVisibilityMap, showNotification } from './utils.js';

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
      toggleEncounterFilter: TokenVisibilityManager.toggleEncounterFilter,
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
    
    // Initialize encounter filter state based on setting
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    
    // Initialize storage for saved mode data
    this._savedModeData = {
      observer: {},
      target: {}
    };
    
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
    
    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    
    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Update the observer with a specific mode and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  updateObserverWithMode(newObserver, mode) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    this.mode = mode;
    
    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
    
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

    // Add encounter filtering context
    context.showEncounterFilter = hasActiveEncounter();
    context.encounterOnly = this.encounterOnly;

    const sceneTokens = getSceneTargets(this.observer, this.encounterOnly);

    // Get proper avatar image - be more strict about what we accept
    const getTokenImage = (token) => {
      // Only use actor portrait if it exists and isn't a generic token
      if (token.actor?.img) {
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
      
      // Update ephemeral effects for each target token
      for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
        const targetToken = canvas.tokens.get(tokenId);
        if (targetToken) {
          try {
            // In Observer Mode: observer sees target, so target is hidden from observer
            await updateEphemeralEffectsForVisibility(app.observer, targetToken, newState, {
              direction: 'observer_to_target' // Target is hidden from observer
            });
          } catch (error) {
            console.error('Visibility Manager: Error updating effects:', error);
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
          
          // Update ephemeral effects
          try {
            // In Target Mode: observers see the selected token (app.observer)
            await updateEphemeralEffectsForVisibility(observerToken, app.observer, newState, {
              direction: 'observer_to_target' // Selected token is hidden from observer
            });
          } catch (error) {
            console.error('Visibility Manager: Error updating effects:', error);
          }
        }
      }
    }
    refreshEveryonesPerception();
    
    // Import and update visuals
    const { updateTokenVisuals } = await import('./effects-coordinator.js');
    await updateTokenVisuals();
    
    return app.render();
  }

  /**
   * Apply changes and close
   */
  static async applyChanges(event, button) {
    const app = this;
    
    // First save the current mode's form state
    try {
      // Get all visibility inputs from the form
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      
      // Create a storage object for this mode if it doesn't exist
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = {};
      
      // Store each visibility setting
      visibilityInputs.forEach(input => {
        const tokenId = input.name.replace('visibility.', '');
        app._savedModeData[app.mode][tokenId] = input.value;
      });
      
    } catch (error) {
      console.error('Visibility Manager: Error saving current form state:', error);
    }
    
    // Process and apply changes from both modes
    if (app._savedModeData) {
      
      // Apply observer mode changes if we have them
      if (app._savedModeData.observer) {
        const observerChanges = {};
        
        // Extract visibility changes from observer mode data
        for (const [tokenId, value] of Object.entries(app._savedModeData.observer)) {
          observerChanges[tokenId] = value;
        }
        
        // Apply observer mode changes
        if (Object.keys(observerChanges).length > 0) {
          await setVisibilityMap(app.observer, observerChanges);
          
          // Update ephemeral effects for each target token
          for (const [tokenId, newState] of Object.entries(observerChanges)) {
            const targetToken = canvas.tokens.get(tokenId);
            if (targetToken) {
              try {
                await updateEphemeralEffectsForVisibility(app.observer, targetToken, newState, {
                  direction: 'observer_to_target'
                });
              } catch (error) {
                console.error('Visibility Manager: Error updating effects:', error);
              }
            }
          }
        }
      }
      
      // Apply target mode changes if we have them
      if (app._savedModeData.target) {
        let targetChangeCount = 0;
        
        // Apply target mode changes
        for (const [observerTokenId, newState] of Object.entries(app._savedModeData.target)) {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (observerToken) {
            // Update the observer's visibility map to show how they see the selected token
            const observerVisibilityData = getVisibilityMap(observerToken);
            observerVisibilityData[app.observer.document.id] = newState;
            await setVisibilityMap(observerToken, observerVisibilityData);
            
            // Update ephemeral effects
            try {
              await updateEphemeralEffectsForVisibility(observerToken, app.observer, newState, {
                direction: 'observer_to_target'
              });
            } catch (error) {
              console.error('Visibility Manager: Error updating effects:', error);
            }
            
            targetChangeCount++;
          }
        }
     }
      
      // Update everyone's perception after applying all changes
      refreshEveryonesPerception();
    } else {
      // Fall back to normal submit if no saved data
      await this.submit();
    }
    
    // Force update visuals immediately
    const { updateTokenVisuals } = await import('./effects-coordinator.js');
    await updateTokenVisuals();
    
    // Clear saved data
    app._savedModeData = null;
    
    this.close();
  }

  /**
   * Reset all visibility states to observed
   */
  static async resetAll(event, button) {
    const app = this;
    
    // Clear the visibility map
    await setVisibilityMap(app.observer, {});
    refreshEveryonesPerception();
     
    return app.render();
  }

  /**
   * Toggle between Observer and Target modes
   */
  static async toggleMode(event, button) {
    const app = this;
    
    // Store current position and size to prevent jumping
    const currentPosition = app.position;
    
    // Capture the current form state
    try {
      // Get all visibility inputs from the form
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      
      // Create a storage object for this mode if it doesn't exist
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = {};
      
      // Store each visibility setting
      visibilityInputs.forEach(input => {
        const tokenId = input.name.replace('visibility.', '');
        app._savedModeData[app.mode][tokenId] = input.value;
      });
      
    } catch (error) {
      console.error('Visibility Manager: Error saving form state:', error);
    }
    
    // Toggle the mode
    const newMode = app.mode === 'observer' ? 'target' : 'observer';
    app.mode = newMode;
    
    // Re-render with preserved position
    await app.render({ force: true });
    
    // After rendering, restore any saved values for the new mode
    try {
      if (app._savedModeData && app._savedModeData[newMode]) {
        // Find all visibility inputs in the newly rendered form
        const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
        
        // Set values from saved data
        visibilityInputs.forEach(input => {
          const tokenId = input.name.replace('visibility.', '');
          if (app._savedModeData[newMode][tokenId]) {
            // Set the input value
            input.value = app._savedModeData[newMode][tokenId];
            
            // Also update the visual state (selected icon)
            const iconContainer = input.closest('.icon-selection');
            if (iconContainer) {
              // Remove selected class from all icons
              const icons = iconContainer.querySelectorAll('.state-icon');
              icons.forEach(icon => icon.classList.remove('selected'));
              
              // Add selected class to the matching icon
              const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
              if (targetIcon) {
                targetIcon.classList.add('selected');
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Visibility Manager: Error restoring saved form state:', error);
    }
    
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
   * Toggle encounter filtering and refresh results
   */
  static async toggleEncounterFilter(event, button) {
    const app = this;
    
    // Toggle the encounter filter state
    app.encounterOnly = !app.encounterOnly;
    
    // Check if we have any tokens with the new filter
    const newTargets = getSceneTargets(app.observer, app.encounterOnly);
    
    if (newTargets.length === 0 && app.encounterOnly) {
      ui.notifications.info(`${MODULE_ID}: No encounter tokens found. Filter disabled.`);
      // Reset to false if no targets found
      app.encounterOnly = false;
      return;
    }
    
    // Re-render the dialog with new filter state
    await app.render({ force: true });
  }

  /**
   * Bulk set visibility state for tokens (updates icon selection and hidden inputs)
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
      
      // Update icon selections in the form, filtered by target type
      const form = event.target.closest('form');
      if (form) {
        let selector = '.icon-selection';
        
        // If target type is specified, filter to only that section
        if (targetType === 'pc') {
          selector = '.table-section:has(.header-left .fa-users) .icon-selection';
        } else if (targetType === 'npc') {
          selector = '.table-section:has(.header-left .fa-dragon) .icon-selection';
        }
        
        const iconSelections = form.querySelectorAll(selector);
        iconSelections.forEach(iconSelection => {
          // Remove selected class from all icons in this selection
          const icons = iconSelection.querySelectorAll('.state-icon');
          icons.forEach(icon => icon.classList.remove('selected'));
          
          // Add selected class to the target state icon
          const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);
          if (targetIcon) {
            targetIcon.classList.add('selected');
          }
          
          // Update the hidden input value
          const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
          if (hiddenInput) {
            hiddenInput.value = state;
          }
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
    this.addIconClickHandlers();
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
      if (!tokenId) return;
      
      // Remove existing listeners to prevent duplicates
      row.removeEventListener('mouseenter', row._hoverIn);
      row.removeEventListener('mouseleave', row._hoverOut);
      
      // Add new listeners using Foundry's native token hover methods
      row._hoverIn = () => {
        const token = canvas.tokens.get(tokenId);
        if (token) {
          token._onHoverIn(new Event('mouseenter'), { hoverOutOthers: true });
        }
      };
      
      row._hoverOut = () => {
        const token = canvas.tokens.get(tokenId);
        if (token) {
          token._onHoverOut(new Event('mouseleave'));
        }
      };
      
      row.addEventListener('mouseenter', row._hoverIn);
      row.addEventListener('mouseleave', row._hoverOut);
    });
  }

  /**
   * Add click handlers for icon-based visibility selection
   */
  addIconClickHandlers() {
    const element = this.element;
    if (!element) return;

    // Find all state icon buttons
    const stateIcons = element.querySelectorAll('.state-icon');
    
    stateIcons.forEach(icon => {
      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const targetId = icon.dataset.target;
        const newState = icon.dataset.state;
        
        if (!targetId || !newState) return;
        
        // Find the parent icon selection container
        const iconSelection = icon.closest('.icon-selection');
        if (!iconSelection) return;
        
        // Remove selected class from all icons in this selection
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach(i => i.classList.remove('selected'));
        
        // Add selected class to clicked icon
        icon.classList.add('selected');
        
        // Update the hidden input value
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          hiddenInput.value = newState;
        }
      });
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
