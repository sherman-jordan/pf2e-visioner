/**
 * Awareness Propagation Hooks
 * 
 * Integrates awareness propagation with existing PF2e action resolution
 */

import { AWARENESS_STATES, MODULE_ID } from '../constants.js';
import { awarenessService } from '../services/awareness-propagation.js';

/**
 * Register awareness propagation hooks
 */
export function registerAwarenessHooks() {
  // Hook into Hide action completion
  Hooks.on('pf2e-visioner:hideActionComplete', async (data) => {
    console.log('PF2E Visioner | Hide action hook triggered:', data);
    
    if (!awarenessService.isEnabled()) {
      console.log('PF2E Visioner | Awareness service disabled, skipping');
      return;
    }
    
    const { actor, targets, outcome, stealthResult } = data;
    
    await awarenessService.propagateAwareness({
      actor,
      action: 'hide',
      result: {
        outcome,
        stealthResult,
        success: outcome.includes('success')
      },
      targets
    });
  });

  // Hook into Sneak action completion
  Hooks.on('pf2e-visioner:sneakActionComplete', async (data) => {
    if (!awarenessService.isEnabled()) return;
    
    const { actor, targets, outcome, stealthResult } = data;
    
    await awarenessService.propagateAwareness({
      actor,
      action: 'sneak',
      result: {
        outcome,
        stealthResult,
        success: outcome.includes('success')
      },
      targets
    });
  });

  // Hook into Create a Diversion action completion
  Hooks.on('pf2e-visioner:createDiversionActionComplete', async (data) => {
    if (!awarenessService.isEnabled()) return;
    
    const { actor, targets, outcome, deceptionResult } = data;
    
    await awarenessService.propagateAwareness({
      actor,
      action: 'create-a-diversion',
      result: {
        outcome,
        deceptionResult,
        success: outcome.includes('success')
      },
      targets
    });
  });

  // Hook into Seek action completion
  Hooks.on('pf2e-visioner:seekActionComplete', async (data) => {
    if (!awarenessService.isEnabled()) return;
    
    const { actor, targets, outcome, perceptionResult, foundTargets } = data;
    
    // For Seek, we propagate awareness about what was found
    if (foundTargets && foundTargets.length > 0) {
      for (const foundTarget of foundTargets) {
        await awarenessService.propagateAwareness({
          actor: foundTarget, // The found target is the "actor" for awareness
          action: 'seek',
          result: {
            outcome,
            perceptionResult,
            success: outcome.includes('success'),
            discoveredBy: actor
          },
          targets: null // Let the service find all eligible allies
        });
      }
    }
  });

  // Hook into token deletion for cleanup
  Hooks.on('deleteToken', async (tokenDocument, options, userId) => {
    if (!awarenessService.isEnabled()) return;
    
    // Clean up awareness data referencing this token
    await awarenessService.cleanupAwarenessForToken(tokenDocument.id);
  });

  // Hook into scene changes for overlay cleanup
  Hooks.on('canvasReady', () => {
    if (awarenessService.awarenessOverlays) {
      awarenessService._clearAwarenessOverlays();
    }
  });

  // Hook into token movement for awareness updates
  Hooks.on('updateToken', async (tokenDocument, changes, options, userId) => {
    if (!awarenessService.isEnabled()) return;
    if (!changes.x && !changes.y) return; // Only care about position changes
    
    // Check if this token has awareness data that might need updating
    const awarenessData = awarenessService.getAwarenessData(tokenDocument.object);
    if (Object.keys(awarenessData).length > 0) {
      // Throttle updates to avoid spam
      if (awarenessService.throttleTimeout) {
        clearTimeout(awarenessService.throttleTimeout);
      }
      
      awarenessService.throttleTimeout = setTimeout(() => {
        awarenessService._updateAwarenessOverlays([]);
      }, 500);
    }
  });

  // Hook into combat start/end for awareness cleanup
  Hooks.on('combatStart', async (combat, updateData) => {
    if (!awarenessService.isEnabled()) return;
    
    // Optional: Clear all awareness data at combat start
    const clearOnCombat = game.settings.get(MODULE_ID, 'awarenessClearOnCombat');
    if (clearOnCombat) {
      const updates = [];
      
      for (const token of canvas.tokens.placeables) {
        const awarenessData = awarenessService.getAwarenessData(token);
        if (Object.keys(awarenessData).length > 0) {
          updates.push({
            _id: token.id,
            [`flags.${MODULE_ID}.awareness`]: {}
          });
        }
      }
      
      if (updates.length > 0) {
        await canvas.scene.updateEmbeddedDocuments('Token', updates);
      }
    }
  });

  // Hook for GM override controls
  Hooks.on('renderTokenConfig', (app, html, data) => {
    if (!game.user.isGM || !awarenessService.isEnabled()) return;
    
    injectAwarenessControls(app, html, data);
  });

  console.log('PF2E Visioner | Awareness propagation hooks registered');
}

/**
 * Inject awareness controls into token configuration
 * @param {Application} app - The token config application
 * @param {jQuery} html - The HTML content
 * @param {Object} data - The application data
 */
function injectAwarenessControls(app, html, data) {
  const token = app.object;
  const awarenessData = awarenessService.getAwarenessData(token);
  
  // Create awareness section
  const awarenessSection = `
    <div class="form-group pf2e-visioner-awareness-controls">
      <label>Awareness Overrides (GM Only)</label>
      <div class="form-fields">
        <button type="button" class="clear-awareness" data-tooltip="Clear all awareness data for this token">
          <i class="fas fa-trash"></i> Clear Awareness
        </button>
        <button type="button" class="show-awareness" data-tooltip="Show current awareness relationships">
          <i class="fas fa-eye"></i> Show Awareness
        </button>
      </div>
      <p class="notes">
        Current awareness entries: ${Object.keys(awarenessData).length}
      </p>
    </div>
  `;
  
  // Find a good place to inject (after vision settings)
  const visionTab = html.find('.tab[data-tab="vision"]');
  if (visionTab.length) {
    visionTab.append(awarenessSection);
  } else {
    // Fallback to basic tab
    html.find('.tab[data-tab="basic"]').append(awarenessSection);
  }
  
  // Bind event handlers
  html.find('.clear-awareness').click(async (event) => {
    event.preventDefault();
    
    const confirmed = await Dialog.confirm({
      title: 'Clear Awareness Data',
      content: '<p>Are you sure you want to clear all awareness data for this token?</p>',
      yes: () => true,
      no: () => false
    });
    
    if (confirmed) {
      await token.document.update({
        [`flags.${MODULE_ID}.awareness`]: {}
      });
      
      ui.notifications.info(`Cleared awareness data for ${token.name}`);
    }
  });
  
  html.find('.show-awareness').click(async (event) => {
    event.preventDefault();
    
    const awarenessEntries = Object.entries(awarenessData);
    if (awarenessEntries.length === 0) {
      ui.notifications.info(`${token.name} has no awareness data`);
      return;
    }
    
    let content = '<div class="pf2e-visioner-awareness-display">';
    content += '<h4>Current Awareness Relationships</h4>';
    content += '<ul>';
    
    for (const [sourceId, data] of awarenessEntries) {
      const sourceToken = canvas.tokens.get(sourceId);
      const sourceName = sourceToken?.name || 'Unknown Token';
      const stateConfig = AWARENESS_STATES[data.state];
      
      content += `<li>
        <strong>${sourceName}</strong>: 
        <span style="color: ${stateConfig.color}">
          <i class="${stateConfig.icon}"></i> ${stateConfig.label}
        </span>
        <br><small>Reason: ${data.reason} | Radius: ${data.fuzzyRadius}ft</small>
      </li>`;
    }
    
    content += '</ul></div>';
    
    new Dialog({
      title: `Awareness Data - ${token.name}`,
      content,
      buttons: {
        close: {
          label: 'Close',
          callback: () => {}
        }
      }
    }).render(true);
  });
}

/**
 * Emit awareness hook for external integration
 * @param {string} action - The action type
 * @param {Object} data - The action data
 */
export function emitAwarenessHook(action, data) {
  Hooks.callAll(`pf2e-visioner:${action}ActionComplete`, data);
}
