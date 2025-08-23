import * as core from './core.js';
import {
  bindDomIconHandlers,
  bulkSetCoverState,
  bulkSetVisibilityState,
  toggleEncounterFilter,
  toggleIgnoreAllies,
  toggleMode,
  toggleTab,
} from './ui.js';

export * from './core.js';
export {
  bindDomIconHandlers,
  bulkSetCoverState,
  bulkSetVisibilityState,
  toggleEncounterFilter,
  toggleIgnoreAllies,
  toggleMode,
  toggleTab,
};

export function bindTokenManagerActions(TokenManagerClass) {
  TokenManagerClass.formHandler = core.formHandler;
  TokenManagerClass.applyCurrent = core.applyCurrent;
  TokenManagerClass.applyBoth = core.applyBoth;
  TokenManagerClass.resetAll = core.resetAll;

  TokenManagerClass.toggleMode = toggleMode;
  TokenManagerClass.toggleEncounterFilter = toggleEncounterFilter;
  // TokenManagerClass.toggleIgnoreAllies = toggleIgnoreAllies; // Commented out - using static method instead
  TokenManagerClass.toggleTab = toggleTab;
  TokenManagerClass.bulkSetVisibilityState = bulkSetVisibilityState;
  TokenManagerClass.bulkSetCoverState = bulkSetCoverState;
  bindDomIconHandlers(TokenManagerClass);
}
