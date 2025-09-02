/**
 * UI-focused Token Manager actions: mode/tab switching, encounter filter, and icon handlers.
 */

import { MODULE_ID } from '../../../constants.js';
import { getSceneTargets, showNotification } from '../../../utils.js';

export async function toggleMode(event, button) {
  const app = this;
  try {
    if (app?.observer?.actor?.type === 'loot') return;
  } catch (_) {}

  const currentPosition = app.position;
  try {
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode])
      app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };
    if (!app._savedModeData[app.mode].visibility) app._savedModeData[app.mode].visibility = {};
    if (!app._savedModeData[app.mode].cover) app._savedModeData[app.mode].cover = {};
    if (!app._savedModeData[app.mode].walls) app._savedModeData[app.mode].walls = {};
    visibilityInputs.forEach((input) => {
      const tokenId = input.name.replace('visibility.', '');
      app._savedModeData[app.mode].visibility[tokenId] = input.value;
    });
    coverInputs.forEach((input) => {
      const tokenId = input.name.replace('cover.', '');
      app._savedModeData[app.mode].cover[tokenId] = input.value;
    });
  } catch (error) {
    console.error('Token Manager: Error saving form state:', error);
  }

  const newMode = app.mode === 'observer' ? 'target' : 'observer';
  app.mode = newMode;
  await app.render({ force: true });

  try {
    if (app._savedModeData && app._savedModeData[newMode]) {
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace('visibility.', '');
        if (app._savedModeData[newMode].visibility[tokenId]) {
          input.value = app._savedModeData[newMode].visibility[tokenId];
          const iconContainer = input.closest('.icon-selection');
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll('.state-icon');
            icons.forEach((icon) => icon.classList.remove('selected'));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add('selected');
          }
        }
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace('cover.', '');
        if (app._savedModeData[newMode].cover[tokenId]) {
          input.value = app._savedModeData[newMode].cover[tokenId];
          const iconContainer = input.closest('.icon-selection');
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll('.state-icon');
            icons.forEach((icon) => icon.classList.remove('selected'));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add('selected');
          }
        }
      });
    }
  } catch (error) {
    console.error('Token Manager: Error restoring saved form state:', error);
  }

  if (currentPosition) {
    app.setPosition({
      left: currentPosition.left,
      top: currentPosition.top,
      width: currentPosition.width,
    });
  }
}

export async function toggleTab(event, button) {
  const app = this;
  const newTab = button.dataset.tab;
  if (newTab && newTab !== app.activeTab) {
    try {
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode])
        app._savedModeData[app.mode] = { visibility: {}, cover: {} };
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace('visibility.', '');
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace('cover.', '');
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
    } catch (error) {
      console.error('Token Manager: Error saving tab state:', error);
    }
    app.activeTab = newTab;
    await app.render({ force: true });
    try {
      if (app._savedModeData && app._savedModeData[app.mode]) {
        const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
        const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
        visibilityInputs.forEach((input) => {
          const tokenId = input.name.replace('visibility.', '');
          const saved = app._savedModeData[app.mode].visibility[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest('.icon-selection');
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll('.state-icon');
              icons.forEach((icon) => icon.classList.remove('selected'));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add('selected');
            }
          }
        });
        coverInputs.forEach((input) => {
          const tokenId = input.name.replace('cover.', '');
          const saved = app._savedModeData[app.mode].cover[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest('.icon-selection');
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll('.state-icon');
              icons.forEach((icon) => icon.classList.remove('selected'));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add('selected');
            }
          }
        });
      }
    } catch (error) {
      console.error('Token Manager: Error restoring tab state:', error);
    }
    try {
      const { applySelectionHighlight } = await import('../highlighting.js');
      applySelectionHighlight(this.constructor);
    } catch (_) {}
  }
}

export async function toggleEncounterFilter(event, button) {
  const app = this;
  app.encounterOnly = !app.encounterOnly;
  const newTargets = getSceneTargets(app.observer, app.encounterOnly);
  if (newTargets.length === 0 && app.encounterOnly) {
    ui.notifications.info(`${MODULE_ID}: No encounter tokens found. Filter disabled.`);
    app.encounterOnly = false;
    return;
  }
  await app.render({ force: true });
}

export async function toggleIgnoreAllies(event, button) {
  const app = this;
  app.ignoreAllies = !app.ignoreAllies;
  await app.render({ force: true });
}

export async function bulkSetVisibilityState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;

    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('form') : null) ||
      this?.element?.querySelector?.('form') ||
      this?.element ||
      null;

    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Build selector based on target type
    let selector = '.visibility-section .icon-selection';
    if (targetType === 'pc')
      selector = '.visibility-section .table-section:has(.header-left .fa-users) .icon-selection';
    else if (targetType === 'npc')
      selector = '.visibility-section .table-section:has(.header-left .fa-dragon) .icon-selection';
    else if (targetType === 'loot')
      selector = '.visibility-section .table-section.loot-section .icon-selection';
    else if (targetType === 'walls')
      selector = '.visibility-section .table-section.walls-section .icon-selection';

    // Cache DOM queries to avoid repeated lookups
    const iconSelections = form.querySelectorAll(selector);
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
    const chunkSize = 100;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);

      chunk.forEach((iconSelection) => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;

        // Skip if already in target state
        if (current === state) return;

        const currentSelected = iconSelection.querySelector('.state-icon.selected');
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);

        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon,
          });
        }
      });

      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach((update) => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove('selected');
          }
          update.targetIcon.classList.add('selected');
          update.hiddenInput.value = state;
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
    console.error('Error in bulk set visibility state:', error);
    showNotification('An error occurred while setting bulk visibility state', 'error');

    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export async function bulkSetCoverState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;

    // Add loading state to the button
    button.classList.add('loading');
    button.disabled = true;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('form') : null) ||
      this?.element?.querySelector?.('form') ||
      this?.element ||
      null;

    if (!form) {
      // Restore button state on error
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = originalText;
      return;
    }

    // Build selector based on target type
    let selector = '.cover-section .icon-selection';
    if (targetType === 'pc')
      selector = '.cover-section .table-section:has(.header-left .fa-users) .icon-selection';
    else if (targetType === 'npc')
      selector = '.cover-section .table-section:has(.header-left .fa-dragon) .icon-selection';

    // Cache DOM queries to avoid repeated lookups
    const iconSelections = form.querySelectorAll(selector);
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
    const chunkSize = 100;
    for (let i = 0; i < iconSelectionsArray.length; i += chunkSize) {
      const chunk = iconSelectionsArray.slice(i, i + chunkSize);

      chunk.forEach((iconSelection) => {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;

        // Skip if already in target state
        if (current === state) return;

        const currentSelected = iconSelection.querySelector('.state-icon.selected');
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);

        if (hiddenInput && targetIcon) {
          updates.push({
            hiddenInput,
            currentSelected,
            targetIcon,
          });
        }
      });

      // Yield control to main thread every chunk
      if (i + chunkSize < iconSelectionsArray.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Batch all DOM updates in a single animation frame
    if (updates.length > 0) {
      requestAnimationFrame(() => {
        updates.forEach((update) => {
          if (update.currentSelected) {
            update.currentSelected.classList.remove('selected');
          }
          update.targetIcon.classList.add('selected');
          update.hiddenInput.value = state;
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
    console.error('Error in bulk set cover state:', error);
    showNotification('An error occurred while setting bulk cover state', 'error');

    // Restore button state on error
    if (button) {
      button.classList.remove('loading');
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || 'Error';
    }
  }
}

export function bindDomIconHandlers(TokenManagerClass) {
  TokenManagerClass.prototype.addIconClickHandlers = function addIconClickHandlers() {
    const element = this.element;
    if (!element) return;
    const stateIcons = element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetId = icon.dataset.target;
        const newState = icon.dataset.state;
        if (!targetId || !newState) return;
        const iconSelection = icon.closest('.icon-selection');
        if (!iconSelection) return;
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach((i) => i.classList.remove('selected'));
        icon.classList.add('selected');
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
      });
    });
  };

  TokenManagerClass.prototype.addTokenImageClickHandlers = function addTokenImageClickHandlers() {
    const element = this.element;
    if (!element) return;
    const tokenImages = element.querySelectorAll('.token-image img');
    tokenImages.forEach((img) => {
      img.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        // Get the token ID from the closest row
        const row = img.closest('tr[data-token-id]');
        const wallRow = img.closest('tr[data-wall-id]');
        
        if (row) {
          // Handle token images
          const tokenId = row.dataset.tokenId;
          if (!tokenId) return;
          
          // Find the token on the canvas
          const token = canvas.tokens.get(tokenId);
          if (!token) return;
          
          // Pan to the token and select it
          this.panToAndSelectToken(token);
        } else if (wallRow) {
          // Handle wall images (for walls section)
          const wallId = wallRow.dataset.wallId;
          if (!wallId) return;
          
          // Find the wall on the canvas
          const wall = canvas.walls.get(wallId);
          if (!wall) return;
          
          // Pan to the wall center
          this.panToWall(wall);
        }
      });
    });
  };

  TokenManagerClass.prototype.panToWall = function panToWall(wall) {
    try {
      // Calculate wall center
      const center = wall.center;
      
      // Pan to the wall
      canvas.animatePan({ x: center.x, y: center.y }, { duration: 500 });
      
      // Highlight the wall briefly
      wall.highlight();
      setTimeout(() => wall.unhighlight(), 1000);
    } catch (error) {
      console.warn('Error panning to wall:', error);
    }
  };

  TokenManagerClass.prototype.panToAndSelectToken = function panToAndSelectToken(token) {
    try {
      // Pan to the token
      canvas.animatePan({ x: token.center.x, y: token.center.y }, { duration: 500 });
      
      // Select the token (deselect others first)
      canvas.tokens.releaseAll();
      token.control({ releaseOthers: true });
      
      // Optional: Add a brief highlight effect
      token.highlight();
      setTimeout(() => token.unhighlight(), 1000);
    } catch (error) {
      console.warn('Error panning to token:', error);
    }
  };
}
