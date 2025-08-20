/**
 * UI-focused Multi Token Manager actions: pagination, filters, and bulk operations.
 */

import { MODULE_ID } from "../../../constants.js";
import { getSceneTargets, getVisibilityMap, showNotification } from "../../../utils.js";

// Helper function to get the current visibility state between two tokens
function getCurrentVisibilityState(observer, target, app) {
  console.log(`Getting visibility state: ${observer.name} observing ${target.name}`);
  
  // First check if there are pending changes in tokenChanges
  const observerChanges = app.tokenChanges.get(observer.id);
  if (observerChanges?.visibility?.[target.id]) {
    const pendingState = observerChanges.visibility[target.id];
    console.log(`Found pending change: ${pendingState}`);
    return pendingState;
  }
  
  // Fall back to actual visibility data (same approach as context.js)
  try {
    const visibilityData = getVisibilityMap(observer) || {};
    const actualState = visibilityData[target.id] || 'observed';
    console.log(`Actual visibility state: ${actualState}`);
    return actualState;
  } catch (error) {
    console.warn(`Error getting visibility data for ${observer.name}:`, error);
    return 'observed'; // Default fallback
  }
}

export async function nextPage(_event, _button) {
  const app = this;
  if (!app.hasNextPage) return;
  
  // Save current form state before changing page
  app.saveCurrentTokenState();
  
  app.currentTokenIndex++;
  await app.render({ force: true });
}

export async function previousPage(_event, _button) {
  const app = this;
  if (!app.hasPreviousPage) return;
  
  // Save current form state before changing page
  app.saveCurrentTokenState();
  
  app.currentTokenIndex--;
  await app.render({ force: true });
}

export async function goToPage(event, button) {
  const app = this;
  const page = parseInt(button.dataset.page);
  if (isNaN(page) || page < 1 || page > app.totalPages) return;
  
  // Save current form state before changing page
  app.saveCurrentTokenState();
  
  app.currentTokenIndex = page - 1;  
  await app.render({ force: true });
}

export async function selectVisibilityState(event, button) {
  const app = this;
  const state = button.dataset.state;
  
  console.log('selectVisibilityState called with state:', state);
  console.log('Button element:', button);
  console.log('App element:', app.element);
  
  // Update selected state
  app.selectedState = state;
  
  // Update button visual states - try multiple selectors
  const allStateButtons = app.element.querySelectorAll('.bulk-action-button.visibility-state');
  console.log('Found state buttons:', allStateButtons.length);
  
  allStateButtons.forEach(btn => {
    btn.classList.remove('selected');
    console.log('Removed selected from:', btn);
  });
  
  button.classList.add('selected');
  console.log('Added selected to clicked button');
  console.log('Button classes after:', button.className);
  
  showNotification(`Selected visibility state: ${state}`, "info");
}

export async function selectTargetGroup(event, button) {
  const app = this;
  const group = button.dataset.group;
  
  console.log('selectTargetGroup called with group:', group);
  
  // Update selected group
  app.selectedGroup = group;
  
  // Update button visual states
  const allGroupButtons = app.element.querySelectorAll('.target-group');
  allGroupButtons.forEach(btn => btn.classList.remove('selected'));
  button.classList.add('selected');
  
  showNotification(`Selected target group: ${group}`, "info");
}

export async function selectCondition(event, button) {
  const app = this;
  const condition = button.dataset.condition;
  
  console.log('selectCondition called with condition:', condition);
  
  // Update selected condition
  app.selectedCondition = condition;
  
  // Update button visual states
  const allConditionButtons = app.element.querySelectorAll('.condition-filter');
  allConditionButtons.forEach(btn => btn.classList.remove('selected'));
  button.classList.add('selected');
  
  showNotification(`Selected condition: ${condition}`, "info");
}

export async function applyBulkChanges(event, button) {
  const app = this;
  
  console.log('applyBulkChanges called');
  console.log('Selected state:', app.selectedState);
  console.log('Selected group:', app.selectedGroup);
  console.log('Selected condition:', app.selectedCondition);
  
  // Validate all selections are made
  if (!app.selectedState) {
    showNotification("Please select a visibility state first", "warn");
    return;
  }
  
  if (!app.selectedGroup) {
    showNotification("Please select a target group", "warn");
    return;
  }
  
  // Condition is optional - if not selected, apply to all in the group
  
  const currentToken = app.currentToken;
  if (!currentToken) return;
  
  const allTargets = getSceneTargets(currentToken, app.encounterOnly);
  let targetTokens = [];
  
  // First filter by group
  switch (app.selectedGroup) {
    case 'allies':
      targetTokens = allTargets.filter(t => t.disposition === 1);
      break;
    case 'enemies':
      targetTokens = allTargets.filter(t => t.disposition === -1);
      break;
    case 'all':
      targetTokens = allTargets;
      break;
  }
  
  // Then filter by condition if one is selected
  if (app.selectedCondition) {
    const conditionState = app.selectedCondition.replace('To', '').toLowerCase();
    targetTokens = targetTokens.filter(t => {
      const currentState = getCurrentVisibilityState(currentToken, t, app);
      return currentState === conditionState;
    });
  }
  
  console.log(`Found ${targetTokens.length} targets matching criteria`);
  
  if (targetTokens.length === 0) {
    const description = app.selectedCondition ? 
      `${app.selectedGroup} with condition ${app.selectedCondition}` : 
      app.selectedGroup;
    showNotification(`No targets found matching: ${description}`, "warn");
    return;
  }
  
  // Apply the selected state to filtered targets
  let updatedCount = 0;
  for (const target of targetTokens) {
    if (!app.tokenChanges.has(currentToken.id)) {
      app.tokenChanges.set(currentToken.id, { visibility: {}, cover: {} });
    }
    const tokenChanges = app.tokenChanges.get(currentToken.id);
    tokenChanges.visibility[target.id] = app.selectedState;
    
    // Also update the form state immediately
    const hiddenInput = app.element.querySelector(`input[name="visibility.${target.id}"]`);
    if (hiddenInput) {
      hiddenInput.value = app.selectedState;
      
      // Update visual selection in the table
      const iconSelection = hiddenInput.closest('.icon-selection');
      if (iconSelection) {
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach(icon => icon.classList.remove('selected'));
        
        const targetIcon = iconSelection.querySelector(`[data-state="${app.selectedState}"]`);
        if (targetIcon) {
          targetIcon.classList.add('selected');
          updatedCount++;
        }
      }
    }
  }
  
  // Create description for notification
  const groupDesc = app.selectedGroup;
  const conditionDesc = app.selectedCondition ? ` that I see as ${app.selectedCondition.replace('To', '')}` : '';
  
  showNotification(`Applied ${app.selectedState} to ${updatedCount} ${groupDesc}${conditionDesc}`, "info");
  await app.render({ force: true });
}

export async function clearBulkSelection(event, button) {
  const app = this;
  
  // Clear all selections
  app.selectedState = null;
  app.selectedGroup = null;
  app.selectedCondition = null;
  
  // Clear visual states
  const allButtons = app.element.querySelectorAll('.bulk-action-button');
  allButtons.forEach(btn => btn.classList.remove('selected'));
  
  showNotification("Cleared all bulk selections", "info");
}

export async function bulkSetVisibility(event, button) {
  const app = this;
  const state = button.dataset.state;
  
  if (app.selectedTargets.size === 0) {
    showNotification("Select targets first using the 'Apply to' buttons", "warn");
    return;
  }
  
  const currentToken = app.currentToken;
  if (!currentToken) return;
  
  // Apply visibility state to selected targets
  for (const targetId of app.selectedTargets) {
    if (!app.tokenChanges.has(currentToken.id)) {
      app.tokenChanges.set(currentToken.id, { visibility: {}, cover: {} });
    }
    const tokenChanges = app.tokenChanges.get(currentToken.id);
    tokenChanges.visibility[targetId] = state;
  }
  
  showNotification(`Set ${app.selectedTargets.size} targets as ${state}`, "info");
  await app.render({ force: true });
}

export async function bulkApplyToTargets(event, button) {
  const app = this;
  const targetType = button.dataset.target;
  
  console.log(`Bulk apply to ${targetType}, selected state: ${app.selectedState}`);
  
  if (!app.selectedState) {
    showNotification("Please select a visibility state first", "warn");
    return;
  }
  
  const currentToken = app.currentToken;
  if (!currentToken) return;
  
  const allTargets = getSceneTargets(currentToken, app.encounterOnly);
  let targetTokens = [];
  
  console.log(`All targets available: ${allTargets.map(t => t.name).join(', ')}`);
  console.log(`Target type: ${targetType}`);
  
  // Filter targets based on type
  switch (targetType) {
    case 'allies':
      targetTokens = allTargets.filter(t => t.disposition === 1);
      break;
    case 'enemies':
      targetTokens = allTargets.filter(t => t.disposition === -1);
      break;
    case 'all':
      targetTokens = allTargets;
      break;
    case 'observedTo':
      // Find targets that the current token sees as "observed"
      targetTokens = allTargets.filter(t => {
        // Check the current visibility state from current token's perspective to the target
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${currentToken.name} sees ${t.name} as: ${currentState}`);
        return currentState === 'observed';
      });
      console.log(`Found ${targetTokens.length} targets that current token sees as 'observed'`);
      break;
    case 'concealedTo':
      targetTokens = allTargets.filter(t => {
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${currentToken.name} sees ${t.name} as: ${currentState}`);
        return currentState === 'concealed';
      });
      console.log(`Found ${targetTokens.length} targets that current token sees as 'concealed'`);
      break;
    case 'hiddenTo':
      targetTokens = allTargets.filter(t => {
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${currentToken.name} sees ${t.name} as: ${currentState}`);
        return currentState === 'hidden';
      });
      console.log(`Found ${targetTokens.length} targets that current token sees as 'hidden'`);
      break;
    case 'undetectedTo':
      targetTokens = allTargets.filter(t => {
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${currentToken.name} sees ${t.name} as: ${currentState}`);
        return currentState === 'undetected';
      });
      console.log(`Found ${targetTokens.length} targets that current token sees as 'undetected'`);
      break;
    // Combined filters: disposition + state
    case 'alliesObservedTo':
      targetTokens = allTargets.filter(t => {
        const isAlly = t.disposition === 1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${t.name}: ally=${isAlly}, state=${currentState}`);
        return isAlly && currentState === 'observed';
      });
      console.log(`Found ${targetTokens.length} allies that current token sees as 'observed'`);
      break;
    case 'enemiesObservedTo':
      targetTokens = allTargets.filter(t => {
        const isEnemy = t.disposition === -1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        console.log(`${t.name}: enemy=${isEnemy}, state=${currentState}`);
        return isEnemy && currentState === 'observed';
      });
      console.log(`Found ${targetTokens.length} enemies that current token sees as 'observed'`);
      break;
    case 'alliesHiddenTo':
      targetTokens = allTargets.filter(t => {
        const isAlly = t.disposition === 1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        return isAlly && currentState === 'hidden';
      });
      console.log(`Found ${targetTokens.length} allies that current token sees as 'hidden'`);
      break;
    case 'enemiesHiddenTo':
      targetTokens = allTargets.filter(t => {
        const isEnemy = t.disposition === -1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        return isEnemy && currentState === 'hidden';
      });
      console.log(`Found ${targetTokens.length} enemies that current token sees as 'hidden'`);
      break;
    case 'alliesUndetectedTo':
      targetTokens = allTargets.filter(t => {
        const isAlly = t.disposition === 1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        return isAlly && currentState === 'undetected';
      });
      console.log(`Found ${targetTokens.length} allies that current token sees as 'undetected'`);
      break;
    case 'enemiesUndetectedTo':
      targetTokens = allTargets.filter(t => {
        const isEnemy = t.disposition === -1;
        const currentState = getCurrentVisibilityState(currentToken, t, app);
        return isEnemy && currentState === 'undetected';
      });
      console.log(`Found ${targetTokens.length} enemies that current token sees as 'undetected'`);
      break;
  }
  
  if (targetTokens.length === 0) {
    showNotification(`No ${targetType} targets found`, "warn");
    return;
  }
  
  // Apply the selected state to all target tokens
  let updatedCount = 0;
  for (const target of targetTokens) {
    if (!app.tokenChanges.has(currentToken.id)) {
      app.tokenChanges.set(currentToken.id, { visibility: {}, cover: {} });
    }
    const tokenChanges = app.tokenChanges.get(currentToken.id);
    tokenChanges.visibility[target.id] = app.selectedState;
    
    // Also update the form state immediately
    const hiddenInput = app.element.querySelector(`input[name="visibility.${target.id}"]`);
    if (hiddenInput) {
      hiddenInput.value = app.selectedState;
      
      // Update visual selection in the table
      const iconSelection = hiddenInput.closest('.icon-selection');
      if (iconSelection) {
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach(icon => icon.classList.remove('selected'));
        
        const targetIcon = iconSelection.querySelector(`[data-state="${app.selectedState}"]`);
        if (targetIcon) {
          targetIcon.classList.add('selected');
          updatedCount++;
        }
      }
    } else {
      console.warn(`Could not find input for target ${target.id}`, target);
    }
  }
  
  console.log(`Updated ${updatedCount} of ${targetTokens.length} ${targetType} targets to ${app.selectedState}`);
  
  // Create a user-friendly description of what was targeted
  let targetDescription;
  if (targetType.includes('allies') && targetType.includes('To')) {
    const state = targetType.replace('allies', '').replace('To', '').toLowerCase();
    targetDescription = `allies that current token sees as ${state}`;
  } else if (targetType.includes('enemies') && targetType.includes('To')) {
    const state = targetType.replace('enemies', '').replace('To', '').toLowerCase();
    targetDescription = `enemies that current token sees as ${state}`;
  } else if (targetType.includes('To')) {
    const state = targetType.replace('To', '').toLowerCase();
    targetDescription = `targets that current token sees as ${state}`;
  } else {
    targetDescription = `${targetType} targets`;
  }
  
  showNotification(`Applied ${app.selectedState} to ${targetTokens.length} ${targetDescription}`, "info");
  await app.render({ force: true });
}

export async function bulkApplyDirectional(event, button) {
  const app = this;
  const direction = button.dataset.direction;
  
  const currentToken = app.currentToken;
  if (!currentToken) return;
  
  // Map direction to visibility state
  const stateMap = {
    'observedTo': 'observed',
    'concealedTo': 'concealed', 
    'hiddenTo': 'hidden',
    'undetectedTo': 'undetected'
  };
  
  const state = stateMap[direction];
  if (!state) return;
  
  const allTargets = getSceneTargets(currentToken, app.encounterOnly);
  
  // Apply directional visibility (targets see current token as state)
  for (const target of allTargets) {
    const targetToken = canvas.tokens.get(target.id);
    if (!targetToken) continue;
    
    if (!app.tokenChanges.has(targetToken.id)) {
      app.tokenChanges.set(targetToken.id, { visibility: {}, cover: {} });
    }
    const tokenChanges = app.tokenChanges.get(targetToken.id);
    tokenChanges.visibility[currentToken.id] = state;
  }
  
  showNotification(`Set current token as ${state} to all targets`, "info");
  await app.render({ force: true });
}

export async function toggleTab(event, button) {
  const app = this;
  const newTab = button.dataset.tab;
  if (newTab && newTab !== app.activeTab) {
    // Save current form state before switching tabs
    app.saveCurrentTokenState();
    
    app.activeTab = newTab;
    await app.render({ force: true });
  }
}

export async function toggleEncounterFilter(_event, _button) {
  const app = this;
  app.encounterOnly = !app.encounterOnly;
  
  // Check if current token would be filtered out
  if (app.encounterOnly && app.currentToken) {
    const newTargets = getSceneTargets(app.currentToken, app.encounterOnly);
    if (newTargets.length === 0) {
      ui.notifications.info(`${MODULE_ID}: No encounter tokens found. Filter disabled.`);
      app.encounterOnly = false;
      return;
    }
  }
  
  await app.render({ force: true });
}

export async function toggleObserverTarget(_event, _button) {
  const app = this;
  app.observerTargetMode = !app.observerTargetMode;
  
  // Clear selected targets when switching modes
  app.selectedTargets.clear();
  
  await app.render({ force: true });
}

export async function bulkSetTargetState(event, button) {
  try {
    const app = this;
    const action = button.dataset.action;
    if (!action || !app.currentToken) return;
    
    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    const form = app.element?.querySelector?.("form") || app.element;
    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }
    
    let targetSelector = "";
    let newState = "";
    
    // Determine the state and target selector based on action
    switch (action) {
      case "bulkObservedFrom":
        newState = "observed";
        targetSelector = ".visibility-section .icon-selection";
        break;
      case "bulkHiddenFrom":
        newState = "hidden";
        targetSelector = ".visibility-section .icon-selection";
        break;
      case "bulkUndetectedTo":
        newState = "undetected";
        targetSelector = ".visibility-section .icon-selection";
        break;
      case "bulkAllies":
        newState = "observed"; // Default for allies
        targetSelector = ".visibility-section .friendly-npc .icon-selection, .visibility-section .pc-row .icon-selection";
        break;
      case "bulkEnemies":
        newState = "hidden"; // Default for enemies
        targetSelector = ".visibility-section .hostile-npc .icon-selection";
        break;
      case "bulkAll":
        newState = "observed"; // Default for all
        targetSelector = ".visibility-section .icon-selection";
        break;
      default:
        // Restore button state on unknown action
        button.classList.remove('loading');
        button.disabled = false;
        button.innerHTML = originalText;
        return;
    }
    
    // Get the relevant icon selections
    const iconSelections = form.querySelectorAll(targetSelector);
    if (!iconSelections.length) {
      // Restore button state if no elements found
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }
    
    // Pre-cache all elements that need updates
    const updates = [];
    const iconSelectionsArray = Array.from(iconSelections);
    
    // Process in chunks to avoid blocking the main thread
    const chunkSize = 50;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);
      
      chunk.forEach(iconSelection => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;
        
        // Skip if already in target state
        if (current === newState) return;
        
        const currentSelected = iconSelection.querySelector(".state-icon.selected");
        const targetIcon = iconSelection.querySelector(`[data-state="${newState}"]`);
        
        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon
          });
        }
      });
      
      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach(update => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove("selected");
          }
          update.targetIcon.classList.add("selected");
          update.hiddenInput.value = newState;
        });
      });
    }
    
    // Restore button state after operation completes
    setTimeout(() => {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
    }, 100);
    
  } catch (error) {
    console.error("Error in bulk set target state:", error);
    showNotification("An error occurred while setting bulk target state", "error");
    
    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export async function bulkSetTargetCoverState(event, button) {
  try {
    const app = this;
    const action = button.dataset.action;
    if (!action || !app.currentToken) return;
    
    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    const form = app.element?.querySelector?.("form") || app.element;
    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }
    
    let newState = "";
    
    // Determine the state based on action
    switch (action) {
      case "bulkNoCover":
        newState = "none";
        break;
      case "bulkLesserCover":
        newState = "lesser";
        break;
      case "bulkStandardCover":
        newState = "standard";
        break;
      case "bulkGreaterCover":
        newState = "greater";
        break;
      default:
        // Restore button state on unknown action
        button.classList.remove('loading');
        button.disabled = false;
        button.innerHTML = originalText;
        return;
    }
    
    // Get all cover icon selections
    const iconSelections = form.querySelectorAll(".cover-section .icon-selection");
    if (!iconSelections.length) {
      // Restore button state if no elements found
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }
    
    // Pre-cache all elements that need updates
    const updates = [];
    const iconSelectionsArray = Array.from(iconSelections);
    
    // Process in chunks to avoid blocking the main thread
    const chunkSize = 50;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);
      
      chunk.forEach(iconSelection => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;
        
        // Skip if already in target state
        if (current === newState) return;
        
        const currentSelected = iconSelection.querySelector(".state-icon.selected");
        const targetIcon = iconSelection.querySelector(`[data-state="${newState}"]`);
        
        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon
          });
        }
      });
      
      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach(update => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove("selected");
          }
          update.targetIcon.classList.add("selected");
          update.hiddenInput.value = newState;
        });
      });
    }
    
    // Restore button state after operation completes
    setTimeout(() => {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
    }, 100);
    
  } catch (error) {
    console.error("Error in bulk set target cover state:", error);
    showNotification("An error occurred while setting bulk target cover state", "error");
    
    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export function bindDomIconHandlers(MultiTokenManagerClass) {
  MultiTokenManagerClass.prototype.addIconClickHandlers = function addIconClickHandlers() {
    const element = this.element;
    if (!element) return;
    
    const stateIcons = element.querySelectorAll(".state-icon");
    stateIcons.forEach((icon) => {
      icon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const targetId = icon.dataset.target;
        const newState = icon.dataset.state;
        if (!targetId || !newState) return;
        
        const iconSelection = icon.closest(".icon-selection");
        if (!iconSelection) return;
        
        // Update visual selection
        const allIcons = iconSelection.querySelectorAll(".state-icon");
        allIcons.forEach((i) => i.classList.remove("selected"));
        icon.classList.add("selected");
        
        // Update hidden input
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
      });
    });
  };
}
