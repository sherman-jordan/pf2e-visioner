// Apply helpers for chat automation actions

import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from '../../constants.js';
import autoCoverSystem from '../../cover/auto-cover/AutoCoverSystem.js';
import { getCoverBetween, getVisibilityBetween } from '../../utils.js';
import { ConsequencesActionHandler } from './actions/consequences-action.js';
import { DiversionActionHandler } from './actions/diversion-action.js';
import { HideActionHandler } from './actions/hide-action.js';
import { PointOutActionHandler } from './actions/point-out-action.js';
import { SeekActionHandler } from './actions/seek-action.js';
import { SneakActionHandler } from './actions/sneak-action.js';
import { TakeCoverActionHandler } from './actions/take-cover-action.js';

export async function applyNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowHide(actionData, button) {
  const handler = new HideActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowSneak(actionData, button) {
  const handler = new SneakActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowTakeCover(actionData, button) {
  const handler = new TakeCoverActionHandler();
  return handler.apply(actionData, button);
}

export async function startSneak(actionData, button) {
  console.log('🚀 NEW STATE-BASED startSneak() function called! actionData:', actionData);
  try {
    // Get actor name and message from actionData - handle both token objects and names
    let actorName;
    if (actionData.actor?.name) {
      // If actionData.actor is a token/actor object
      actorName = actionData.actor.name;
    } else if (typeof actionData.actor === 'string') {
      // If actionData.actor is already a string
      actorName = actionData.actor;
    } else if (actionData.message?.actor?.name) {
      actorName = actionData.message.actor.name;
    } else if (typeof actionData.message?.actor === 'string') {
      actorName = actionData.message.actor;
    }
    
    const messageId = actionData.messageId || actionData.message?.id;
    const message = game.messages.get(messageId);
    
    if (!actorName) {
      console.error('PF2E Visioner | Cannot start sneak - actor name not found in actionData:', actionData);
      return;
    }
    
    console.log('PF2E Visioner | Starting sneak for actor:', actorName);
    
    // Get the sneaking token
    const token = canvas.tokens.placeables.find(t => t.actor?.name === actorName);
    if (!token) {
      console.error('PF2E Visioner | Cannot start sneak - token not found for actor:', actorName);
      return;
    }

    // Check system availability by checking if systems are enabled
    const avsEnabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled') ?? false;
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
        
        // Use AVS or manual visibility detection based on setting
        if (avsEnabled) {
          // Use AVS visibility detection - getVisibilityBetween integrates AVS when enabled
          visibilityState = getVisibilityBetween(observer, token) || 'observed';
          console.log(`PF2E Visioner | AVS visibility for ${observer.name} → ${token.name}: ${visibilityState}`);
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
    
    // Hide the token (representing successful stealth)
    await token.document.update({ hidden: true });
    
    console.log('PF2E Visioner | Sneak started - states captured and token hidden:', {
      observerCount: Object.keys(startStates).length,
      states: startStates
    });

    // Refresh the UI to show "Open Results" button instead of "Start Sneak"
    try {
      const parent = button.closest('.automation-content');
      if (parent && messageId) {
        const message = game.messages.get(messageId);
        if (message) {
          const html = $(message.element);
          parent.remove();
          
          // Re-inject the UI with updated actionData that includes the message
          const { injectAutomationUI } = await import('./ui/ui-injector.js');
          const updatedActionData = { ...actionData, message };
          injectAutomationUI(message, html, updatedActionData);
        }
      }
    } catch (refreshError) {
      console.warn('PF2E Visioner | Failed to refresh UI after starting sneak:', refreshError);
    }
    
  } catch (error) {
    console.error('PF2E Visioner | Error starting sneak:', error);
    const { notify } = await import('./infra/notifications.js');
    notify.error('Failed to start sneak - see console for details');
  }
}

export async function openSneakResults(actionData, button) {
  console.log('🚀 NEW STATE-BASED openSneakResults() function called! actionData:', actionData);
  try {
    console.log('🚀 NEW STATE-BASED openSneakResults() function called!');
    console.log('PF2E Visioner | Opening sneak results dialog for actionData:', actionData);
    
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
      console.error('PF2E Visioner | Cannot open sneak results - no stored start states found');
      const { notify } = await import('./infra/notifications.js');
      notify.error('No start states found - please start sneak first');
      return;
    }

    console.log('PF2E Visioner | Found stored start states:', startStates);

    // Capture current states from the same observers
    const currentStates = {};
    const outcomes = [];
    
    for (const [observerId, startState] of Object.entries(startStates)) {
      const observer = canvas.tokens.get(observerId);
      if (!observer) {
        console.warn(`PF2E Visioner | Observer ${startState.observerName} not found, skipping`);
        continue;
      }
      
      try {
        // Check what systems were used for capturing start states
        const usedAVS = startState.capturedWith?.avs ?? false;
        const usedAutoCover = startState.capturedWith?.autoCover ?? false;
        
        let currentVisibility;
        let currentCover;
        
        // Use same visibility detection method as start capture
        if (usedAVS) {
          currentVisibility = getVisibilityBetween(observer, token) || 'observed';
          console.log(`PF2E Visioner | Current AVS visibility for ${observer.name} → ${token.name}: ${currentVisibility}`);
        } else {
          currentVisibility = observer.document.canObserve(token.document) ? 'observed' : 'hidden';
          console.log(`PF2E Visioner | Current manual visibility for ${observer.name} → ${token.name}: ${currentVisibility}`);
        }
        
        // Get current cover state using same system as start capture
        if (usedAutoCover) {
          currentCover = autoCoverSystem.getCoverBetween(observer, token) || 'none';
          console.log(`PF2E Visioner | Current AUTO cover detection for ${observer.name} → ${token.name}: ${currentCover}`);
        } else {
          currentCover = getCoverBetween(observer, token) || 'none';
          console.log(`PF2E Visioner | Current manual cover for ${observer.name} → ${token.name}: ${currentCover}`);
        }
        
        currentStates[observerId] = {
          observerName: observer.name,
          observerId: observer.id,
          visibility: currentVisibility,
          cover: currentCover,
          timestamp: Date.now()
        };
        
        // Calculate actual roll data using proper roll calculation logic
        let rollTotal = 15; // Default fallback
        let originalRollTotal = null;
        let dc = 14; // Default fallback
        let margin = 1; // Default fallback
        
        try {
          // Get roll data from action data
          const baseTotal = Number(actionData?.roll?.total ?? actionData?.context?.roll?.total ?? 0);
          if (baseTotal > 0) {
            // Use the action handler's roll calculation logic
            const { SneakActionHandler } = await import('./actions/sneak-action.js');
            const handler = new SneakActionHandler();
            
            // Analyze this specific observer to get proper roll calculations
            try {
              const analysisResult = await handler.analyzeOutcome(actionData, observer);
              rollTotal = analysisResult.rollTotal || baseTotal;
              originalRollTotal = analysisResult.originalRollTotal;
              dc = analysisResult.dc || 14;
              margin = analysisResult.margin || (rollTotal - dc);
              
              console.log('PF2E Visioner | Calculated roll data for', observer.name, ':', {
                rollTotal,
                originalRollTotal,
                dc,
                margin,
                baseTotal
              });
            } catch (analysisError) {
              console.warn('PF2E Visioner | Failed to analyze outcome, using base total:', analysisError);
              rollTotal = baseTotal;
              dc = 14; // Fallback DC
              margin = baseTotal - dc;
            }
          }
        } catch (rollError) {
          console.warn('PF2E Visioner | Failed to calculate roll data:', rollError);
        }
        
        // Create outcome with state transition data
        const outcome = {
          token: observer,
          actor: observer.actor,
          tokenImage: observer.document.texture.src,
          startVisibility: startState.visibility,
          startCover: startState.cover,
          endVisibility: currentVisibility,
          endCover: currentCover,
          oldVisibility: startState.visibility, // This is the "old" visibility state
          newVisibility: currentVisibility,
          hasChanged: startState.visibility !== currentVisibility || startState.cover !== currentCover,
          outcome: startState.visibility !== currentVisibility ? 'success' : 'failure', // Simplified
          outcomeLabel: startState.visibility !== currentVisibility ? 'Success' : 'Failure',
          rollTotal,
          originalRollTotal, 
          shouldShowOverride: !!originalRollTotal,
          dc,
          margin,
          // Add visibility change data for the arrow display
          availableStates: Object.keys(VISIBILITY_STATES).map(state => ({
            value: state,
            label: getVisibilityLabel(state),
            icon: getVisibilityIcon(state),
            cssClass: VISIBILITY_STATES[state].cssClass,
            selected: state === currentVisibility,
            calculatedOutcome: state === currentVisibility // Highlight AVS recommendation
          })),
          hasActionableChange: startState.visibility !== currentVisibility,
          // Add position transition data for dialog compatibility
          positionTransition: {
            hasChanged: startState.visibility !== currentVisibility || startState.cover !== currentCover,
            transitionType: startState.visibility !== currentVisibility ? 'improved' : 'unchanged',
            startPosition: {
              avsVisibility: startState.visibility,
              coverState: startState.cover,
              visibility: startState.visibility,
              visibilityIcon: getVisibilityIcon(startState.visibility),
              visibilityClass: VISIBILITY_STATES[startState.visibility]?.cssClass || startState.visibility,
              visibilityLabel: getVisibilityLabel(startState.visibility),
              cover: startState.cover,
              coverIcon: getCoverIcon(startState.cover),
              coverClass: COVER_STATES[startState.cover]?.cssClass || startState.cover,
              coverLabel: getCoverLabel(startState.cover),
              stealthBonus: COVER_STATES[startState.cover]?.bonusStealth || 0,
              distance: 0,
              lightingConditions: 'bright',
              qualifies: COVER_STATES[startState.cover]?.canHide || startState.visibility !== 'observed'
            },
            endPosition: {
              avsVisibility: currentVisibility,
              coverState: currentCover,
              visibility: currentVisibility,
              visibilityIcon: getVisibilityIcon(currentVisibility),
              visibilityClass: VISIBILITY_STATES[currentVisibility]?.cssClass || currentVisibility,
              visibilityLabel: getVisibilityLabel(currentVisibility),
              cover: currentCover,
              coverIcon: getCoverIcon(currentCover),
              coverClass: COVER_STATES[currentCover]?.cssClass || currentCover,
              coverLabel: getCoverLabel(currentCover),
              stealthBonus: COVER_STATES[currentCover]?.bonusStealth || 0,
              distance: 0,
              lightingConditions: 'bright',
              qualifies: COVER_STATES[currentCover]?.canHide || currentVisibility !== 'observed'
            }
          },
          hasPositionData: true,
          positionDisplay: {
            startPosition: {
              avsVisibility: startState.visibility,
              coverState: startState.cover,
              visibility: startState.visibility,
              visibilityIcon: getVisibilityIcon(startState.visibility),
              visibilityClass: VISIBILITY_STATES[startState.visibility]?.cssClass || startState.visibility,
              visibilityLabel: getVisibilityLabel(startState.visibility),
              cover: startState.cover,
              coverIcon: getCoverIcon(startState.cover),
              coverClass: COVER_STATES[startState.cover]?.cssClass || startState.cover,
              coverLabel: getCoverLabel(startState.cover),
              stealthBonus: COVER_STATES[startState.cover]?.bonusStealth || 0,
              qualifies: COVER_STATES[startState.cover]?.canHide || startState.visibility !== 'observed'
            },
            endPosition: {
              avsVisibility: currentVisibility,
              coverState: currentCover,
              visibility: currentVisibility,
              visibilityIcon: getVisibilityIcon(currentVisibility),
              visibilityClass: VISIBILITY_STATES[currentVisibility]?.cssClass || currentVisibility,
              visibilityLabel: getVisibilityLabel(currentVisibility),
              cover: currentCover,
              coverIcon: getCoverIcon(currentCover),
              coverClass: COVER_STATES[currentCover]?.cssClass || currentCover,
              coverLabel: getCoverLabel(currentCover),
              stealthBonus: COVER_STATES[currentCover]?.bonusStealth || 0,
              qualifies: COVER_STATES[currentCover]?.canHide || currentVisibility !== 'observed'
            }
          }
        };
        
        outcomes.push(outcome);
        
        console.log(`PF2E Visioner | State transition for ${observer.name}:`, {
          start: startState,
          current: currentStates[observerId],
          hasChanged: outcome.hasChanged
        });
        
      } catch (error) {
        console.warn(`PF2E Visioner | Failed to capture current state for ${observer.name}:`, error);
      }
    }
    
    if (outcomes.length === 0) {
      console.error('PF2E Visioner | No valid outcomes generated');
      const { notify } = await import('./infra/notifications.js');
      notify.error('No valid state transitions found');
      return;
    }

    // Import and create the preview dialog
    const { SneakPreviewDialog } = await import('../dialogs/sneak-preview-dialog.js');
    
    const dialog = new SneakPreviewDialog(
      token,
      outcomes,
      [], // No changes needed for this approach
      actionData
    );
    
    dialog.render(true);
    
  } catch (error) {
    console.error('PF2E Visioner | Error opening sneak results:', error);
    const { notify } = await import('./infra/notifications.js');
    notify.error('Failed to open sneak results - see console for details');
  }
}

// Helper functions for icon and label generation using constants
function getVisibilityIcon(visibility) {
  return VISIBILITY_STATES[visibility]?.icon || 'fas fa-question';
}

function getCoverIcon(cover) {
  return COVER_STATES[cover]?.icon || 'fas fa-question';
}

function getVisibilityLabel(visibility) {
  return VISIBILITY_STATES[visibility]?.label || visibility;
}

function getCoverLabel(cover) {
  return COVER_STATES[cover]?.label || cover;
}
