/**
 * Core Multi Token Manager actions: business logic for applying visibility and cover changes.
 */

import { MODULE_ID } from "../../../constants.js";
import { refreshEveryonesPerception } from "../../../services/socket.js";
import {
    getCoverMap,
    getVisibilityMap,
    setCoverMap,
    setVisibilityMap,
} from "../../../utils.js";

/**
 * ApplicationV2 form handler - saves current form state to tokenChanges
 */
export async function formHandler(event, form, formData) {
  const app = this;
  
  // Save current token's form state
  app.saveCurrentTokenState();
  
  // Re-render to reflect any changes
  return app.render();
}

/**
 * Show confirmation dialog with summary of all changes
 */
export async function confirmChanges(event, button) {
  const app = this;
  
  // Save current form state before proceeding
  app.saveCurrentTokenState();
  
  const allChanges = app.getAllChanges();
  
  // Build summary of changes
  let summaryHtml = "<div class='changes-summary'>";
  let hasAnyChanges = false;
  
  for (const [tokenId, visibilityChanges] of allChanges.visibility) {
    const token = canvas.tokens.get(tokenId);
    if (!token || visibilityChanges.size === 0) continue;
    
    hasAnyChanges = true;
    summaryHtml += `<div class='token-changes'><h4>${token.name} - Visibility Changes:</h4><ul>`;
    
    for (const [targetId, newState] of visibilityChanges) {
      const target = canvas.tokens.get(targetId);
      if (!target) continue;
      
      const currentState = getVisibilityMap(token)[targetId] || "observed";
      if (currentState !== newState) {
        summaryHtml += `<li>${target.name}: ${currentState} → ${newState}</li>`;
      }
    }
    summaryHtml += "</ul></div>";
  }
  
  for (const [tokenId, coverChanges] of allChanges.cover) {
    const token = canvas.tokens.get(tokenId);
    if (!token || coverChanges.size === 0) continue;
    
    hasAnyChanges = true;
    summaryHtml += `<div class='token-changes'><h4>${token.name} - Cover Changes:</h4><ul>`;
    
    for (const [targetId, newState] of coverChanges) {
      const target = canvas.tokens.get(targetId);
      if (!target) continue;
      
      const currentState = getCoverMap(token)[targetId] || "none";
      if (currentState !== newState) {
        summaryHtml += `<li>${target.name}: ${currentState} → ${newState}</li>`;
      }
    }
    summaryHtml += "</ul></div>";
  }
  
  summaryHtml += "</div>";
  
  if (!hasAnyChanges) {
    ui.notifications.info("No changes to apply.");
    return;
  }
  
  // Show confirmation dialog
  new Dialog({
    title: "Confirm Changes",
    content: `
      <div class="confirmation-dialog">
        <p>The following changes will be applied to all selected tokens:</p>
        ${summaryHtml}
        <p><strong>Are you sure you want to apply all these changes?</strong></p>
      </div>
    `,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: "Apply Changes",
        callback: () => {
          app.constructor.applyAllChanges.call(app, event, button);
        }
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
      }
    },
    default: "yes",
    render: html => {
      html.find(".confirmation-dialog").css({
        "max-height": "400px",
        "overflow-y": "auto"
      });
    }
  }, {
    width: 500,
    height: "auto"
  }).render(true);
}

/**
 * Apply all accumulated changes to all tokens
 */
export async function applyAllChanges(event, button) {
  const app = this;
  const { runTasksWithProgress } = await import("../../progress.js");
  
  try {
    // Close the dialog first
    app.close();
  } catch (error) {
    console.warn("Multi Token Manager: Error closing dialog:", error);
  }
  
  // Show progress indicator
  runTasksWithProgress(`${MODULE_ID}: Preparing Multi-Token Changes`, [
    async () => await new Promise((r) => setTimeout(r, 100))
  ]);
  
  try {
    const { batchUpdateVisibilityEffects } = await import("../../../visibility/ephemeral.js");
    const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import("../../../cover/ephemeral.js");
    
    const allChanges = app.getAllChanges();
    const allOperations = [];
    const visualUpdatePairs = [];
    
    // Process visibility changes
    for (const [tokenId, visibilityChanges] of allChanges.visibility) {
      const token = canvas.tokens.get(tokenId);
      if (!token || visibilityChanges.size === 0) continue;
      
      const currentMap = getVisibilityMap(token) || {};
      const updatedMap = { ...currentMap };
      const targetUpdates = [];
      
      for (const [targetId, newState] of visibilityChanges) {
        const target = canvas.tokens.get(targetId);
        if (!target) continue;
        
        const currentState = currentMap[targetId];
        if (currentState !== newState) {
          updatedMap[targetId] = newState;
          targetUpdates.push({ target, state: newState });
          visualUpdatePairs.push({ 
            observerId: token.id, 
            targetId: target.id, 
            visibility: newState 
          });
        }
      }
      
      if (targetUpdates.length > 0) {
        await setVisibilityMap(token, updatedMap);
        allOperations.push(async () => {
          await batchUpdateVisibilityEffects(token, targetUpdates, { 
            direction: "observer_to_target" 
          });
        });
      }
    }
    
    // Process cover changes
    for (const [tokenId, coverChanges] of allChanges.cover) {
      const token = canvas.tokens.get(tokenId);
      if (!token || coverChanges.size === 0) continue;
      
      const currentMap = getCoverMap(token) || {};
      const updatedMap = { ...currentMap };
      const targetUpdates = [];
      
      for (const [targetId, newState] of coverChanges) {
        const target = canvas.tokens.get(targetId);
        if (!target) continue;
        
        const currentState = currentMap[targetId];
        if (currentState !== newState) {
          updatedMap[targetId] = newState;
          targetUpdates.push({ target, state: newState });
          visualUpdatePairs.push({ 
            observerId: token.id, 
            targetId: target.id, 
            cover: newState 
          });
        }
      }
      
      if (targetUpdates.length > 0) {
        await setCoverMap(token, updatedMap);
        allOperations.push(async () => {
          await batchUpdateCoverEffects(token, targetUpdates);
        });
        
        // Add reconciliation for each target
        allOperations.push(async () => {
          for (const { target } of targetUpdates) {
            try {
              await reconcileCoverEffectsForTarget(target);
            } catch (_) {}
          }
        });
      }
    }
    
    // Execute all operations
    if (allOperations.length > 0) {
      await runTasksWithProgress(`${MODULE_ID}: Applying Multi-Token Changes`, allOperations);
      
      // Update visuals
      if (visualUpdatePairs.length > 0) {
        (async () => {
          try {
            const { updateSpecificTokenPairs } = await import("../../../services/visual-effects.js");
            await updateSpecificTokenPairs(visualUpdatePairs);
          } catch (error) {
            console.warn("Multi Token Manager: Error updating visuals:", error);
          }
        })();
      }
    }
    
    // Show success notification
    ui.notifications.info(`Applied changes to ${app.selectedTokens.length} tokens successfully.`);
    
  } catch (error) {
    console.error("Multi Token Manager: Error applying changes:", error);
    ui.notifications.error("An error occurred while applying changes. Check the console for details.");
  }
  
  // Refresh perception
  (async () => {
    try {
      refreshEveryonesPerception();
      canvas.perception.update({ refreshVision: true });
    } catch (error) {
      console.warn("Multi Token Manager: Error refreshing perception:", error);
    }
  })();
}
