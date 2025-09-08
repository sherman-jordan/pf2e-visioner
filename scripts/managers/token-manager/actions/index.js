import * as core from './core.js';
import {
  bindDomIconHandlers,
  bulkSetCoverState,
  bulkSetVisibilityState,
  toggleEncounterFilter,
  toggleIgnoreAllies,
  toggleIgnoreWalls,
  toggleMode,
  toggleStateSelector,
  toggleTab,
} from './ui.js';

export * from './core.js';
export {
  bindDomIconHandlers,
  bulkSetCoverState, bulkSetVisibilityState,
  toggleEncounterFilter,
  toggleIgnoreAllies,
  toggleIgnoreWalls,
  toggleMode,
  toggleStateSelector,
  toggleTab
};

export function bindTokenManagerActions(TokenManagerClass) {
  TokenManagerClass.formHandler = core.formHandler;
  TokenManagerClass.applyCurrent = core.applyCurrent;
  TokenManagerClass.applyBoth = core.applyBoth;
  TokenManagerClass.resetAll = core.resetAll;

  TokenManagerClass.toggleMode = toggleMode;
  TokenManagerClass.toggleEncounterFilter = toggleEncounterFilter;
  TokenManagerClass.toggleIgnoreAllies = toggleIgnoreAllies;
  TokenManagerClass.toggleIgnoreWalls = toggleIgnoreWalls;
  TokenManagerClass.toggleTab = toggleTab;
  TokenManagerClass.bulkSetVisibilityState = bulkSetVisibilityState;
  TokenManagerClass.bulkSetCoverState = bulkSetCoverState;
  bindDomIconHandlers(TokenManagerClass);
}
