/**
 * UI-focused Token Manager actions: mode/tab switching, encounter filter, and icon handlers.
 */

import { MODULE_ID } from "../../../constants.js";
import { getSceneTargets, showNotification } from "../../../utils.js";

export async function toggleMode(event, button) {
  const app = this;
  try { if (app?.observer?.actor?.type === "loot") return; } catch (_) {}

  const currentPosition = app.position;
  try {
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = { visibility: {}, cover: {} };
    visibilityInputs.forEach((input) => {
      const tokenId = input.name.replace("visibility.", "");
      app._savedModeData[app.mode].visibility[tokenId] = input.value;
    });
    coverInputs.forEach((input) => {
      const tokenId = input.name.replace("cover.", "");
      app._savedModeData[app.mode].cover[tokenId] = input.value;
    });
  } catch (error) {
    console.error("Token Manager: Error saving form state:", error);
  }

  const newMode = app.mode === "observer" ? "target" : "observer";
  app.mode = newMode;
  await app.render({ force: true });

  try {
    if (app._savedModeData && app._savedModeData[newMode]) {
      const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace("visibility.", "");
        if (app._savedModeData[newMode].visibility[tokenId]) {
          input.value = app._savedModeData[newMode].visibility[tokenId];
          const iconContainer = input.closest(".icon-selection");
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll(".state-icon");
            icons.forEach((icon) => icon.classList.remove("selected"));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add("selected");
          }
        }
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace("cover.", "");
        if (app._savedModeData[newMode].cover[tokenId]) {
          input.value = app._savedModeData[newMode].cover[tokenId];
          const iconContainer = input.closest(".icon-selection");
          if (iconContainer) {
            const icons = iconContainer.querySelectorAll(".state-icon");
            icons.forEach((icon) => icon.classList.remove("selected"));
            const targetIcon = iconContainer.querySelector(`[data-state="${input.value}"]`);
            if (targetIcon) targetIcon.classList.add("selected");
          }
        }
      });
    }
  } catch (error) {
    console.error("Token Manager: Error restoring saved form state:", error);
  }

  if (currentPosition) {
    app.setPosition({ left: currentPosition.left, top: currentPosition.top, width: currentPosition.width });
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
      if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = { visibility: {}, cover: {} };
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace("visibility.", "");
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace("cover.", "");
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
    } catch (error) {
      console.error("Token Manager: Error saving tab state:", error);
    }
    app.activeTab = newTab;
    await app.render({ force: true });
    try {
      if (app._savedModeData && app._savedModeData[app.mode]) {
        const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
        const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
        visibilityInputs.forEach((input) => {
          const tokenId = input.name.replace("visibility.", "");
          const saved = app._savedModeData[app.mode].visibility[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest(".icon-selection");
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll(".state-icon");
              icons.forEach((icon) => icon.classList.remove("selected"));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add("selected");
            }
          }
        });
        coverInputs.forEach((input) => {
          const tokenId = input.name.replace("cover.", "");
          const saved = app._savedModeData[app.mode].cover[tokenId];
          if (saved) {
            input.value = saved;
            const iconContainer = input.closest(".icon-selection");
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll(".state-icon");
              icons.forEach((icon) => icon.classList.remove("selected"));
              const targetIcon = iconContainer.querySelector(`[data-state="${saved}"]`);
              if (targetIcon) targetIcon.classList.add("selected");
            }
          }
        });
      }
    } catch (error) {
      console.error("Token Manager: Error restoring tab state:", error);
    }
    try {
      const { applySelectionHighlight } = await import("../highlighting.js");
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

export async function bulkSetVisibilityState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;
    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === "function" ? targetEl.closest("form") : null) ||
      this?.element?.querySelector?.("form") ||
      this?.element ||
      null;
    if (form) {
      let selector = ".visibility-section .icon-selection";
      if (targetType === "pc") selector = ".visibility-section .table-section:has(.header-left .fa-users) .icon-selection";
      else if (targetType === "npc") selector = ".visibility-section .table-section:has(.header-left .fa-dragon) .icon-selection";
      else if (targetType === "loot") selector = ".visibility-section .table-section.loot-section .icon-selection";
      const iconSelections = form.querySelectorAll(selector);
      for (const iconSelection of iconSelections) {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;
        if (current === state) continue;
        const currentSelected = iconSelection.querySelector(".state-icon.selected");
        if (currentSelected) currentSelected.classList.remove("selected");
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);
        if (targetIcon) targetIcon.classList.add("selected");
        if (hiddenInput) hiddenInput.value = state;
      }
    }
  } catch (error) {
    console.error("Error in bulk set visibility state:", error);
    showNotification("An error occurred while setting bulk visibility state", "error");
  }
}

export async function bulkSetCoverState(event, button) {
  try {
    const state = button.dataset.state;
    const targetType = button.dataset.targetType;
    if (!state) return;
    const targetEl = button || event?.currentTarget || event?.target || null;
    const form =
      (targetEl && typeof targetEl.closest === "function" ? targetEl.closest("form") : null) ||
      this?.element?.querySelector?.("form") ||
      this?.element ||
      null;
    if (form) {
      let selector = ".cover-section .icon-selection";
      if (targetType === "pc") selector = ".cover-section .table-section:has(.header-left .fa-users) .icon-selection";
      else if (targetType === "npc") selector = ".cover-section .table-section:has(.header-left .fa-dragon) .icon-selection";
      const iconSelections = form.querySelectorAll(selector);
      for (const iconSelection of iconSelections) {
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        const current = hiddenInput?.value;
        if (current === state) continue;
        const currentSelected = iconSelection.querySelector(".state-icon.selected");
        if (currentSelected) currentSelected.classList.remove("selected");
        const targetIcon = iconSelection.querySelector(`[data-state="${state}"]`);
        if (targetIcon) targetIcon.classList.add("selected");
        if (hiddenInput) hiddenInput.value = state;
      }
    }
  } catch (error) {
    console.error("Error in bulk set cover state:", error);
    showNotification("An error occurred while setting bulk cover state", "error");
  }
}

export function bindDomIconHandlers(TokenManagerClass) {
  TokenManagerClass.prototype.addIconClickHandlers = function addIconClickHandlers() {
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
        const allIcons = iconSelection.querySelectorAll(".state-icon");
        allIcons.forEach((i) => i.classList.remove("selected"));
        icon.classList.add("selected");
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
      });
    });
  };
}


