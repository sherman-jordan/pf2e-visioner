/**
 * Sneak Dialog Service - Handles dialog preparation and UI logic for sneak actions
 * Separated from SneakActionHandler to reduce class size and improve maintainability
 */

import { SNEAK_FLAGS } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { getVisibilityMap, setVisibilityMap } from '../../../stores/visibility-map.js';
import { getCoverBetween, getVisibilityBetween } from '../../../utils.js';
import { SneakPreviewDialog } from '../../dialogs/sneak-preview-dialog.js';

export class SneakDialogService {
  /**
   * Starts the sneak action by capturing initial states and hiding the token
   * @param {Object} actionData - Action data from the message
   * @param {Object} button - Button element (optional)
   */
  async startSneak(actionData, _button) {
    console.log('🚀 NEW STATE-BASED startSneak() function called! actionData:', actionData);
    console.log('🚀 startSneak method is being called!');
    try {
      // Get the sneaking token from actionData - handle both token objects and IDs
      let token = null;
      
      // First, try to get token directly from actionData.actor if it's already a token
      if (actionData.actor?.document?.id) {
        token = actionData.actor;
        console.log('PF2E Visioner | Using token directly from actionData.actor:', token.name);
      }
      // If actionData.actor has an ID, look up the token by actor ID
      else if (actionData.actor?.id && canvas?.tokens?.placeables) {
        token = canvas.tokens.placeables.find(t => t.actor?.id === actionData.actor.id);
        if (token) {
          console.log('PF2E Visioner | Found token by actor ID:', token.name);
        }
      }
      // Fallback: try to get from message context
      else if (actionData.message?.speaker?.token) {
        const tokenId = actionData.message.speaker.token;
        token = canvas?.tokens?.placeables?.find(t => t.id === tokenId);
        if (token) {
          console.log('PF2E Visioner | Found token via message speaker:', token.name);
        }
      }
      
      if (!token) {
        console.error('PF2E Visioner | Cannot start sneak - token not found in actionData:', actionData);
        return;
      }
      
      console.log('PF2E Visioner | Starting sneak for token:', token.name);

      // Get message and messageId from actionData
      const messageId = actionData.messageId || actionData.message?.id;
      const message = messageId ? game.messages.get(messageId) : null;

      // Check system availability by checking if systems are enabled
      const avsEnabled = game.settings.get('pf2e-visioner', 'autoVisibilityEnabled') ?? false;
      const autoCoverEnabled = autoCoverSystem?.isEnabled?.() ?? false;
      
      console.log(`PF2E Visioner | System status - AVS: ${avsEnabled ? 'enabled' : 'disabled'}, Auto-Cover: ${autoCoverEnabled ? 'enabled' : 'disabled'}`);
      
      // Capture current visibility and cover states from all observer tokens
      const startStates = {};
      
      // Get all potential observer tokens (non-allied tokens)
      const observerTokens = canvas.tokens.placeables.filter(t => 
        t.id !== token.id && t.actor && !t.document.hidden
      );
      
      // Capture state from each observer's perspective
      for (const observer of observerTokens) {
        try {
          let visibilityState;
          let coverState;
          
          // Use fresh visibility calculation that accounts for darkvision for start positions
          if (avsEnabled) {
            try {
              const { optimizedVisibilityCalculator } = await import('../../../visibility/auto-visibility/index.js');
              visibilityState = await optimizedVisibilityCalculator.calculateVisibility(observer, token);
              console.log(`PF2E Visioner | Fresh AVS visibility calculation for ${observer.name} → ${token.name}: ${visibilityState}`);
            } catch (error) {
              console.warn(`PF2E Visioner | Failed fresh visibility calculation, using stored state:`, error);
              visibilityState = getVisibilityBetween(observer, token) || 'observed';
            }
          } else {
            // Use manual/Foundry visibility detection
            visibilityState = observer.document.canObserve(token.document) ? 'observed' : 'hidden';
            console.log(`PF2E Visioner | Manual visibility for ${observer.name} → ${token.name}: ${visibilityState}`);
          }
          
          // Get cover state based on Auto-Cover system availability
          if (autoCoverEnabled) {
            // Use auto-cover system directly
            coverState = autoCoverSystem.getCoverBetween(observer, token) || 'none';
            console.log(`PF2E Visioner | AUTO cover detection for ${observer.name} → ${token.name}: ${coverState}`);
          } else {
            // Use manual cover detection
            coverState = getCoverBetween(observer, token) || 'none';
            console.log(`PF2E Visioner | Manual cover for ${observer.name} → ${token.name}: ${coverState}`);
          }
          
          startStates[observer.id] = {
            observerName: observer.name,
            observerId: observer.id,
            visibility: visibilityState,
            cover: coverState,
            timestamp: Date.now(),
            // Store which systems were used for capture
            capturedWith: {
              avs: avsEnabled,
              autoCover: autoCoverEnabled
            }
          };
          
          console.log(`PF2E Visioner | Captured start state for ${observer.name}:`, startStates[observer.id]);
        } catch (error) {
          console.warn(`PF2E Visioner | Failed to capture start state for ${observer.name}:`, error);
          startStates[observer.id] = {
            observerName: observer.name,
            observerId: observer.id,
            visibility: 'observed',
            cover: 'none',
            timestamp: Date.now(),
            capturedWith: {
              avs: avsEnabled,
              autoCover: autoCoverEnabled
            }
          };
        }
      }
      
      // Store states in message flags instead of position
      await message.setFlag('pf2e-visioner', 'sneakStartStates', startStates);
      
      // Set sneak flag on the token to indicate it's currently sneaking
      await token.document.setFlag('pf2e-visioner', SNEAK_FLAGS.SNEAK_ACTIVE, true);
      
      // Apply sneak visibility changes immediately
      console.log('PF2E Visioner | About to apply sneak visibility changes...');
      console.log('PF2E Visioner | Method exists?', typeof this._applySneakVisibilityChanges);
      console.log('PF2E Visioner | About to call method...');
      await this._applySneakVisibilityChanges(token, startStates);
      console.log('PF2E Visioner | Sneak visibility changes applied successfully');
      
      console.log('PF2E Visioner | Sneak started - states captured and visibility applied:', {
        observerCount: Object.keys(startStates).length,
        states: startStates
      });

      // Store start states in message flags for persistence
      if (message) {
        try {
          await message.setFlag('pf2e-visioner', 'startStates', startStates);
          console.debug('PF2E Visioner | Start states stored in message flags');
        } catch (error) {
          console.warn('PF2E Visioner | Failed to store start states in message flags:', error);
        }
      }

      // Refresh the UI to show "Open Results" button instead of "Start Sneak"
      try {
        const parent = _button?.closest('.automation-content');
        if (parent && messageId) {
          const message = game.messages.get(messageId);
          if (message) {
            const html = $(message.element);
            parent.remove();
            
            // Re-inject the UI with updated actionData that includes the message
            const { injectAutomationUI } = await import('../ui/ui-injector.js');
            const updatedActionData = { ...actionData, message };
            injectAutomationUI(message, html, updatedActionData);
          }
        }
      } catch (refreshError) {
        console.warn('PF2E Visioner | Failed to refresh UI after starting sneak:', refreshError);
      }
      
    } catch (error) {
      console.error('PF2E Visioner | Error starting sneak:', error);
      const { notify } = await import('../infra/notifications.js');
      notify.error('Failed to start sneak - see console for details');
    }
  }

  /**
   * Opens the sneak results dialog for preview and application
   * @param {Object} actionData - Action data from the message
   * @param {Object} button - Button element (optional)
   */
  static async openSneakResults(actionData, _button) {
    console.log('PF2E Visioner | Opening sneak results dialog for actionData:', actionData);
    
    try {
      // Get the token and message
      const messageId = actionData.messageId || actionData.message?.id;
      const message = game.messages.get(messageId);
      console.log('PF2E Visioner | Message found:', !!message, 'ID:', messageId);
      
      // Extract token ID from actionData
      let tokenId;
      
      if (actionData.actor) {
        if (typeof actionData.actor === 'string') {
          // If it's a string, it might be a token ID
          tokenId = actionData.actor;
        } else if (actionData.actor.id) {
          // actionData.actor is a token object with ID
          tokenId = actionData.actor.id;
        }
      }
      
      // Fallback to direct tokenId property
      tokenId = tokenId || actionData.tokenId;
      
      console.log('PF2E Visioner | Looking for token ID:', tokenId);
      
      // Find the token by ID
      const token = canvas.tokens.placeables.find(t => t.id === tokenId);
      if (!token) {
        console.error('PF2E Visioner | Cannot open sneak results - token not found for ID:', tokenId);
        console.error('PF2E Visioner | Available token IDs:', canvas.tokens.placeables.map(t => t.id));
        return;
      }
      
      console.log('PF2E Visioner | Token found:', token.name, 'Actor:', token.actor?.name);

      // Get the stored start states from message flags
      const startStates = message?.flags?.['pf2e-visioner']?.sneakStartStates;
      
      if (!startStates || Object.keys(startStates).length === 0) {
        console.error('PF2E Visioner | Cannot open sneak results - no start states found in message flags');
        const { notify } = await import('../infra/notifications.js');
        notify.error('No sneak start states found - please use "Start Sneak" first');
        return;
      }

      console.log('PF2E Visioner | Found start states for', Object.keys(startStates).length, 'observers');

      // Generate fresh outcomes using the sneak action handler to calculate end positions
      const { SneakActionHandler } = await import('../actions/sneak-action.js');
      const sneakHandler = new SneakActionHandler();
      
      // Discover current subjects (observers)
      const subjects = await sneakHandler.discoverSubjects(actionData);
      console.log('PF2E Visioner | Discovered', subjects.length, 'subjects for end position calculation');
      
      // Calculate outcomes with current (end) positions and inject start states
      const outcomes = await Promise.all(
        subjects.map(async subject => {
          const outcome = await sneakHandler.analyzeOutcome(actionData, subject);
          
          // Inject correct start state from stored start states
          const observerId = subject.document.id;
          const startState = startStates[observerId];
          
          if (startState && outcome.positionTransition) {
            // Override the start position with the correct visibility from start states
            outcome.positionTransition.startPosition.avsVisibility = startState.visibility;
            console.log(`PF2E Visioner | Corrected start visibility for ${subject.name}: ${startState.visibility}`);
          }
          
          return outcome;
        })
      );
      
      console.log('PF2E Visioner | Generated', outcomes.length, 'outcomes with end position qualifications');
      
      // Filter to only changed outcomes
      const changes = outcomes.filter(outcome => outcome && outcome.changed);
      
      // Debug: Log what start states we're passing to the dialog
      console.debug('PF2E Visioner | SneakDialogService startStates debug before dialog creation:', {
        startStatesExists: !!startStates,
        startStatesKeys: startStates ? Object.keys(startStates) : [],
        startStatesSize: startStates ? Object.keys(startStates).length : 0,
        startStatesContent: startStates
      });
      
      // Create the sneak preview dialog with proper outcomes
      const dialog = new SneakPreviewDialog(token, outcomes, changes, { startStates, message, actionData });
      await dialog.render(true);
      
      console.log('PF2E Visioner | Sneak results dialog opened successfully');
      
    } catch (error) {
      console.error('PF2E Visioner | Error opening sneak results dialog:', error);
      const { notify } = await import('../infra/notifications.js');
      notify.error('Failed to open sneak results dialog - see console for details');
    }
  }

  /**
   * Apply sneak visibility changes immediately when sneaking starts
   * @param {Token} token - The sneaking token
   * @param {Object} startStates - The captured start states
   * @private
   */
  async _applySneakVisibilityChanges(token, startStates) {
    try {
      console.log('PF2E Visioner | _applySneakVisibilityChanges called for token:', token.name);
      
      // Get all observer tokens
      const observerTokens = canvas.tokens.placeables.filter(t => 
        t.id !== token.id && t.actor
      );
      
      console.log('PF2E Visioner | Found observer tokens:', observerTokens.map(t => t.name));

      // Import the visibility calculator to get proper AVS calculations
      console.log('PF2E Visioner | About to import visibility calculator...');
      
      let visibilityModule;
      let optimizedVisibilityCalculator;
      
      try {
        visibilityModule = await import('../../../visibility/auto-visibility/index.js');
        console.log('PF2E Visioner | Visibility module imported:', Object.keys(visibilityModule));
        
        optimizedVisibilityCalculator = visibilityModule.optimizedVisibilityCalculator;
        console.log('PF2E Visioner | Visibility calculator extracted:', typeof optimizedVisibilityCalculator);
        
        if (!optimizedVisibilityCalculator) {
          throw new Error('optimizedVisibilityCalculator is undefined');
        }
        
        console.log('PF2E Visioner | Visibility calculator imported successfully');
      } catch (importError) {
        console.error('PF2E Visioner | Import error:', importError);
        throw importError;
      }
      
      // Check if the calculator is properly initialized
      const status = optimizedVisibilityCalculator.getStatus();
      console.log('PF2E Visioner | Visibility calculator status:', status);
      
      if (!status.initialized) {
        throw new Error('Visibility calculator is not initialized');
      }
      
      // Set visibility for sneak: ONLY affect how observers see the sneaking token, NOT how sneaking token sees observers
      console.log('PF2E Visioner | Starting visibility calculations for', observerTokens.length, 'observers');
      for (const observer of observerTokens) {
        try {
        // Calculate proper visibility using AVS
        const sneakingTokenPosition = this.#getTokenPosition(token);
        const observerPosition = this.#getTokenPosition(observer);
        
        // Calculate how the observer sees the sneaking token (this is what sneak affects)
        const observerToSneaking = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
          observer,
          token,
          observerPosition,
          sneakingTokenPosition,
        );

        console.log('PF2E Visioner | AVS calculated visibility:', {
          sneakingToken: token.name,
          observer: observer.name,
          observerToSneaking
        });

        // DO NOT set how the sneaking token sees the observer - they should see normally
        // Sneak only affects how others see the sneaking token, not how the sneaking token sees others

        // Set how the observer sees the sneaking token (observer's visibility map)
        const observerVisibilityMap = getVisibilityMap(observer);
        observerVisibilityMap[token.document.id] = observerToSneaking;
        await setVisibilityMap(observer, observerVisibilityMap);
        console.log(`PF2E Visioner | Set observer visibility: ${observer.name} → ${token.name}: ${observerToSneaking}`);
        } catch (observerError) {
          console.error('PF2E Visioner | Error processing observer:', observer.name, observerError);
        }
      }

      console.log('PF2E Visioner | Bidirectional visibility set based on AVS calculations');
      
    } catch (error) {
      console.error('PF2E Visioner | Error applying sneak visibility changes:', error);
      console.error('PF2E Visioner | Error stack:', error.stack);
      console.error('PF2E Visioner | Error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause
      });
    }
  }

  /**
   * Get token position for visibility calculations
   * @param {Token} token
   * @returns {Object}
   * @private
   */
  #getTokenPosition(token) {
    return {
      x: token.document.x,
      y: token.document.y,
      elevation: token.document.elevation || 0
    };
  }

  /**
   * Manually initialize visibility for already sneaking tokens
   * This is useful when a token is already sneaking but the visibility map wasn't properly initialized
   */
  static async initializeSneakVisibility(tokenId) {
    try {
      console.log('PF2E Visioner | Manually initializing sneak visibility for token:', tokenId);
      
      const token = canvas.tokens.get(tokenId);
      if (!token) {
        console.warn('PF2E Visioner | Token not found:', tokenId);
        return;
      }

      const isSneaking = token.document.getFlag('pf2e-visioner', 'sneak-active');
      if (!isSneaking) {
        console.log('PF2E Visioner | Token is not sneaking, skipping initialization');
        return;
      }

      console.log('PF2E Visioner | Token is sneaking, proceeding with initialization');
      const service = new SneakDialogService();
      await service._applySneakVisibilityChanges(token, {});
      console.log('PF2E Visioner | Sneak visibility initialization completed');
      
    } catch (error) {
      console.error('PF2E Visioner | Error initializing sneak visibility:', error);
    }
  }

  /**
   * Initialize visibility for all currently sneaking tokens
   * This should be called when the module loads to fix already sneaking tokens
   */
  static async initializeAllSneakingTokens() {
    try {
      console.log('PF2E Visioner | Initializing all sneaking tokens...');
      
      const sneakingTokens = canvas.tokens.placeables.filter(token => 
        token.document.getFlag('pf2e-visioner', 'sneak-active')
      );
      
      console.log('PF2E Visioner | Found sneaking tokens:', sneakingTokens.map(t => t.name));
      
      for (const token of sneakingTokens) {
        await this.initializeSneakVisibility(token.id);
      }
      
      console.log('PF2E Visioner | All sneaking tokens initialized');
      
    } catch (error) {
      console.error('PF2E Visioner | Error initializing sneaking tokens:', error);
    }
  }
}
