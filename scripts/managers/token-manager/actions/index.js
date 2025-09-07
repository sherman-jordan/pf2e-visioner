import * as core from './core.js';
import {
    bindDomIconHandlers,
    bulkSetCoverState,
    bulkSetOverride,
    bulkSetVisibilityState,
    clearAllOverrides,
    clearTargetTypeOverrides,
    toggleEncounterFilter,
    toggleIgnoreAllies,
    toggleMode,
    toggleStateSelector,
    toggleTab,
} from './ui.js';

export * from './core.js';
export {
    bindDomIconHandlers,
    bulkSetCoverState, bulkSetOverride, bulkSetVisibilityState, clearAllOverrides,
    clearTargetTypeOverrides,
    toggleEncounterFilter,
    toggleIgnoreAllies,
    toggleMode,
    toggleStateSelector,
    toggleTab
};

export function bindTokenManagerActions(TokenManagerClass) {
  TokenManagerClass.formHandler = core.formHandler;
  TokenManagerClass.applyCurrent = core.applyCurrent;
  TokenManagerClass.applyAll = core.applyAll;
  TokenManagerClass.resetAll = core.resetAll;

  TokenManagerClass.toggleMode = toggleMode;
  TokenManagerClass.toggleEncounterFilter = toggleEncounterFilter;
  // TokenManagerClass.toggleIgnoreAllies = toggleIgnoreAllies; // Commented out - using static method instead
  TokenManagerClass.toggleTab = toggleTab;
  TokenManagerClass.bulkSetVisibilityState = bulkSetVisibilityState;
  TokenManagerClass.bulkSetCoverState = bulkSetCoverState;
  bindDomIconHandlers(TokenManagerClass);
}
