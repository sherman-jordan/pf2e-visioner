/**
 * Effects Coordinator
 * Rebuilds ephemeral effects (off-guard and cover) from stored per-token maps
 * and provides a compatibility wrapper for updating visuals.
 */

import { updateEphemeralCoverEffects } from './cover-ephemeral.js';
import { updateEphemeralEffectsForVisibility } from './off-guard-ephemeral.js';
import { getCoverMap, getVisibilityMap } from './utils.js';
import { updateTokenVisuals as baseUpdateTokenVisuals } from './visual-effects.js';

/**
 * Compatibility export: delegate to the visuals module
 */
export async function updateTokenVisuals() {
  await baseUpdateTokenVisuals();
}

/**
 * Rebuild all ephemeral effects from current maps for all observer→target pairs
 * Only the GM should run this since it creates/removes items on actors
 */
export async function rebuildAllEphemeralEffects() {
  if (!game?.user?.isGM) return;
  if (!canvas?.tokens) return;

  try {
    const tokens = canvas.tokens.placeables;
    // Build a quick lookup by id once
    const idToToken = new Map(tokens.map(t => [t.document.id, t]));

    const visibilityUpdates = [];
    const coverUpdates = [];

    for (const observer of tokens) {
      // Visibility map held on the observer
      const visMap = getVisibilityMap(observer) || {};
      for (const [targetId, visibilityState] of Object.entries(visMap)) {
        const target = idToToken.get(targetId);
        if (!target) continue;
        visibilityUpdates.push(
          updateEphemeralEffectsForVisibility(observer, target, visibilityState, {
            direction: 'observer_to_target',
          })
        );
      }

      // Cover map held on the observer
      const covMap = getCoverMap(observer) || {};
      for (const [targetId, coverState] of Object.entries(covMap)) {
        const target = idToToken.get(targetId);
        if (!target) continue;
        coverUpdates.push(
          updateEphemeralCoverEffects(target, observer, coverState, {})
        );
      }
    }

    // Apply all updates in parallel; ignore individual failures
    if (visibilityUpdates.length) await Promise.allSettled(visibilityUpdates);
    if (coverUpdates.length) await Promise.allSettled(coverUpdates);

    // Light visual refresh to reflect any icon/state changes
    await baseUpdateTokenVisuals();
  } catch (error) {
    console.error('PF2E Visioner: Failed to rebuild ephemeral effects', error);
  }
}

// (Deprecated coordinator functions removed; compatibility wrapper provided above.)