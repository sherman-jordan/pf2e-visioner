/**
 * Combat-related hooks: reset encounter filter for open dialogs
 */

export function registerCombatHooks() {
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("deleteCombat", onDeleteCombat);
}

function onUpdateCombat(combat, updateData, options, userId) {
  if (Object.prototype.hasOwnProperty.call(updateData, "started") && updateData.started === false) {
    resetEncounterFiltersInDialogs();
  }
}

function onDeleteCombat(combat, options, userId) {
  resetEncounterFiltersInDialogs();
}

function resetEncounterFiltersInDialogs() {
  const resetDialog = (ctorName) => {
    const dialogs = Object.values(ui.windows).filter((w) => w.constructor.name === ctorName);
    dialogs.forEach((dialog) => {
      if (!dialog.encounterOnly) return;
      dialog.encounterOnly = false;
      const checkbox = dialog.element?.querySelector('input[data-action="toggleEncounterFilter"]');
      if (checkbox) checkbox.checked = false;
      dialog.render({ force: true });
    });
  };
  resetDialog("HidePreviewDialog");
  resetDialog("SeekPreviewDialog");
  resetDialog("PointOutPreviewDialog");
}


