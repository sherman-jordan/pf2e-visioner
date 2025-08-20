import * as core from "./core.js";
import {
  applyBulkChanges,
  bindDomIconHandlers,
  bulkApplyDirectional,
  bulkApplyToTargets,
  bulkSetTargetCoverState,
  bulkSetTargetState,
  bulkSetVisibility,
  clearBulkSelection,
  goToPage,
  nextPage,
  previousPage,
  selectCondition,
  selectTargetGroup,
  selectVisibilityState,
  toggleEncounterFilter,
  toggleObserverTarget,
  toggleTab,
} from "./ui.js";

export * from "./core.js";
export {
  applyBulkChanges,
  bindDomIconHandlers,
  bulkApplyDirectional,
  bulkApplyToTargets,
  bulkSetTargetCoverState,
  bulkSetTargetState,
  bulkSetVisibility,
  clearBulkSelection,
  goToPage,
  nextPage,
  previousPage,
  selectCondition,
  selectTargetGroup,
  selectVisibilityState,
  toggleEncounterFilter,
  toggleObserverTarget,
  toggleTab
};

export function bindMultiTokenManagerActions(MultiTokenManagerClass) {
  MultiTokenManagerClass.formHandler = core.formHandler;
  MultiTokenManagerClass.confirmChanges = core.confirmChanges;
  MultiTokenManagerClass.applyAllChanges = core.applyAllChanges;

  MultiTokenManagerClass.nextPage = nextPage;
  MultiTokenManagerClass.previousPage = previousPage;
  MultiTokenManagerClass.goToPage = goToPage;
  MultiTokenManagerClass.toggleEncounterFilter = toggleEncounterFilter;
  MultiTokenManagerClass.toggleObserverTarget = toggleObserverTarget;
  MultiTokenManagerClass.toggleTab = toggleTab;
  MultiTokenManagerClass.bulkSetTargetState = bulkSetTargetState;
  MultiTokenManagerClass.bulkSetTargetCoverState = bulkSetTargetCoverState;
  MultiTokenManagerClass.bulkSetVisibility = bulkSetVisibility;
  // New streamlined bulk actions
  MultiTokenManagerClass.selectVisibilityState = selectVisibilityState;
  MultiTokenManagerClass.selectTargetGroup = selectTargetGroup;
  MultiTokenManagerClass.selectCondition = selectCondition;
  MultiTokenManagerClass.applyBulkChanges = applyBulkChanges;
  MultiTokenManagerClass.clearBulkSelection = clearBulkSelection;
  MultiTokenManagerClass.bulkApplyToTargets = bulkApplyToTargets;
  MultiTokenManagerClass.bulkApplyDirectional = bulkApplyDirectional;
  bindDomIconHandlers(MultiTokenManagerClass);
}
