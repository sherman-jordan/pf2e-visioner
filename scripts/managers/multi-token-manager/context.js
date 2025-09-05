/**
 * Context builder for VisionerMultiTokenManager template
 */

import { extractPerceptionDC, extractStealthDC } from '../../chat/services/infra/shared-utils.js';
import { COVER_STATES, VISIBILITY_STATES } from '../../constants.js';
import { getCoverMap, getSceneTargets, getVisibilityMap, hasActiveEncounter } from '../../utils.js';

function getTokenImage(token) {
  if (token.actor?.img) return token.actor.img;
  return 'icons/svg/book.svg';
}

export async function buildMultiTokenContext(app, options) {
  // IMPORTANT: Call the base ApplicationV2 implementation
  const BaseApp = foundry?.applications?.api?.ApplicationV2;
  const context = BaseApp ? await BaseApp.prototype._prepareContext.call(app, options) : {};

  if (!app.currentToken) {
    context.error = game.i18n.localize('PF2E_VISIONER.MULTI_TOKEN_MANAGER.NO_TOKENS_SELECTED');
    return context;
  }

  const currentToken = app.currentToken;
  context.currentToken = {
    id: currentToken.document.id,
    name: currentToken.document.name,
    img: getTokenImage(currentToken),
  };

  // Pagination info
  context.currentPage = app.currentPage;
  context.totalPages = app.totalPages;
  context.hasNextPage = app.hasNextPage;
  context.hasPreviousPage = app.hasPreviousPage;

  // Generate page numbers array for pagination buttons
  context.pageNumbers = [];
  for (let i = 1; i <= app.totalPages; i++) {
    context.pageNumbers.push({
      number: i,
      isActive: i === app.currentPage,
    });
  }

  // Tab and filter state
  context.activeTab = app.activeTab;
  context.isVisibilityTab = app.activeTab === 'visibility';
  context.isCoverTab = app.activeTab === 'cover';
  context.showEncounterFilter = hasActiveEncounter();
  context.encounterOnly = app.encounterOnly;
  context.observerTargetMode = app.observerTargetMode || false;
  context.selectedState = app.selectedState;

  // Get targets for the current token (excluding only self)
  const allSceneTargets = getSceneTargets(currentToken, app.encounterOnly, false);
  const targets = allSceneTargets.filter((token) => token.id !== currentToken.id);

  // Get current visibility and cover data for this token
  let currentVisibilityData, currentCoverData;
  try {
    currentVisibilityData = getVisibilityMap(currentToken) || {};
    currentCoverData = getCoverMap(currentToken) || {};
  } catch (e) {
    console.warn('Failed to get visibility/cover maps:', e);
    currentVisibilityData = {};
    currentCoverData = {};
  }

  // Get any saved changes for this token
  const savedChanges = app.tokenChanges.get(currentToken.id);

  // Build target data with current states and any pending changes
  const allTargets = targets.map((token) => {
    const baseVisibilityState = currentVisibilityData[token.document.id] || 'observed';
    const baseCoverState = currentCoverData[token.document.id] || 'none';

    // Apply any saved changes
    const currentVisibilityState =
      savedChanges?.visibility[token.document.id] || baseVisibilityState;
    const currentCoverState = savedChanges?.cover[token.document.id] || baseCoverState;

    const disposition = token.document.disposition || 0;

    let perceptionDC, stealthDC;
    try {
      perceptionDC = extractPerceptionDC(currentToken);
    } catch (e) {
      console.warn('Failed to extract perception DC:', e);
      perceptionDC = 10; // Default
    }

    try {
      stealthDC = extractStealthDC(token);
    } catch (e) {
      console.warn('Failed to extract stealth DC:', e);
      stealthDC = 10; // Default
    }

    const isLoot = token.actor?.type === 'loot';
    const allowedVisKeys = isLoot ? ['observed', 'hidden'] : Object.keys(VISIBILITY_STATES);

    const visibilityStates = allowedVisKeys.map((key) => {
      const state = VISIBILITY_STATES[key];
      if (!state) {
        console.warn(`Missing visibility state config for: ${key}`);
        return {
          value: key,
          label: key,
          selected: currentVisibilityState === key,
          icon: 'fas fa-question',
          color: '#999',
        };
      }
      return {
        value: key,
        label: game.i18n.localize(state.label),
        selected: currentVisibilityState === key,
        icon: state.icon,
        color: state.color,
      };
    });

    const coverStates = Object.entries(COVER_STATES).map(([key, config]) => ({
      value: key,
      label: game.i18n.localize(config.label),
      selected: currentCoverState === key,
      icon: config.icon,
      color: config.color,
      bonusAC: config.bonusAC,
      bonusReflex: config.bonusReflex,
      bonusStealth: config.bonusStealth,
      canHide: config.canHide,
    }));

    return {
      id: token.document.id,
      name: token.document.name,
      img: getTokenImage(token),
      isLoot: !!isLoot,
      currentVisibilityState: allowedVisKeys.includes(currentVisibilityState)
        ? currentVisibilityState
        : 'observed',
      currentCoverState,
      isPC: token.actor?.hasPlayerOwner || token.actor?.type === 'character',
      disposition: disposition,
      dispositionClass: disposition === -1 ? 'hostile' : disposition === 1 ? 'friendly' : 'neutral',
      visibilityStates,
      coverStates,
      coverStateFlags: {
        none: currentCoverState === 'none',
        lesser: currentCoverState === 'lesser',
        standard: currentCoverState === 'standard',
        greater: currentCoverState === 'greater',
      },
      perceptionDC,
      stealthDC,
    };
  });

  // Sort and categorize targets
  const visibilityPrecedence = { observed: 0, concealed: 1, hidden: 2, undetected: 3 };
  const coverPrecedence = { none: 0, lesser: 1, standard: 2, greater: 4 };

  const sortByStatusAndName = (a, b) => {
    if (app.activeTab === 'visibility') {
      const statusA = visibilityPrecedence[a.currentVisibilityState] ?? 999;
      const statusB = visibilityPrecedence[b.currentVisibilityState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    } else {
      const statusA = coverPrecedence[a.currentCoverState] ?? 999;
      const statusB = coverPrecedence[b.currentCoverState] ?? 999;
      if (statusA !== statusB) return statusA - statusB;
    }
    return a.name.localeCompare(b.name);
  };

  context.pcTargets = allTargets.filter((t) => t.isPC && !t.isLoot).sort(sortByStatusAndName);
  context.npcTargets = allTargets.filter((t) => !t.isPC && !t.isLoot).sort(sortByStatusAndName);
  context.lootTargets = allTargets.filter((t) => t.isLoot).sort(sortByStatusAndName);
  context.allTargets = allTargets;
  context.hasTargets = allTargets.length > 0;
  context.hasPCs = context.pcTargets.length > 0;
  context.hasNPCs = context.npcTargets.length > 0;
  context.hasLoots = context.lootTargets.length > 0;

  // Add visibility and cover state definitions for legends and bulk actions
  context.visibilityStates = Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
    key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    color: config.color,
  }));

  context.coverStates = Object.entries(COVER_STATES).map(([key, config]) => ({
    key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    color: config.color,
    bonusAC: config.bonusAC,
    bonusReflex: config.bonusReflex,
    bonusStealth: config.bonusStealth,
    canHide: config.canHide,
  }));

  // Changes summary for the confirmation dialog
  context.hasChanges = false;
  for (const [tokenId, changes] of app.tokenChanges) {
    if (Object.keys(changes.visibility).length > 0 || Object.keys(changes.cover).length > 0) {
      context.hasChanges = true;
      break;
    }
  }

  return context;
}
