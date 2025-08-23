/**
 * Scene cleanup helpers for visibility/cover data
 */

import { MODULE_ID } from '../constants.js';
import { getCoverMap } from '../stores/cover-map.js';
import { getVisibilityMap } from '../stores/visibility-map.js';

/**
 * Remove references to a deleted token id from all observers' maps.
 * Bulk-updates the scene for performance.
 * @param {TokenDocument} tokenDoc
 */
export async function cleanupDeletedToken(tokenDoc) {
  if (!tokenDoc?.id) {
    console.warn('PF2E Visioner: cleanupDeletedToken called with invalid tokenDoc:', tokenDoc);
    return;
  }

  // Check if this is part of a party consolidation - if so, delay cleanup
  const scene = tokenDoc.parent || canvas.scene;
  if (scene) {
    const cache = scene.getFlag(MODULE_ID, 'partyTokenStateCache') || {};
    const isPartyConsolidation = tokenDoc.actor?.signature && cache[tokenDoc.actor.signature];

    if (isPartyConsolidation) {
      return; // Skip cleanup for party tokens - restoration will handle it
    }
  }

  try {
    const allTokens = canvas.tokens?.placeables || [];
    const updates = [];

    const restoreEntry = { visibilityByObserver: {}, coverByObserver: {} };

    for (const token of allTokens) {
      if (!token?.document?.id) continue; // More robust check

      try {
        const visMap = getVisibilityMap(token);
        const covMap = getCoverMap(token);
        const hadVis = visMap && Object.prototype.hasOwnProperty.call(visMap, tokenDoc.id);
        const hadCov = covMap && Object.prototype.hasOwnProperty.call(covMap, tokenDoc.id);
        if (!hadVis && !hadCov) continue;

        const tokenId = token.document.id;
        if (!tokenId) continue; // Extra safety check

        const patch = { _id: tokenId };
        if (hadVis) {
          restoreEntry.visibilityByObserver[tokenId] = visMap[tokenDoc.id];
          const newVis = { ...visMap };
          delete newVis[tokenDoc.id];
          patch[`flags.${MODULE_ID}.visibility`] = newVis;
        }
        if (hadCov) {
          restoreEntry.coverByObserver[tokenId] = covMap[tokenDoc.id];
          const newCov = { ...covMap };
          delete newCov[tokenDoc.id];
          patch[`flags.${MODULE_ID}.cover`] = newCov;
        }
        updates.push(patch);
      } catch (tokenError) {
        console.warn(
          `PF2E Visioner: Error processing token ${token?.name || 'unknown'} during cleanup:`,
          tokenError,
        );
        continue; // Skip this token and continue with others
      }
    }

    if (updates.length && scene?.updateEmbeddedDocuments) {
      // Only GMs can update token documents during cleanup
      if (game.user.isGM) {
        await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
      }
    }

    try {
      const cache = scene?.getFlag?.(MODULE_ID, 'deletedEntryCache') || {};
      cache[tokenDoc.id] = restoreEntry;
      // Only GMs can update scene flags
      if (game.user.isGM) {
        await scene?.setFlag?.(MODULE_ID, 'deletedEntryCache', cache);
      }
    } catch (_) {}
  } catch (error) {
    console.error('PF2E Visioner: Error cleaning up data for deleted token:', error);
  }
}

/**
 * Restore previously removed vis/cover entries when undo recreates a token
 * @param {TokenDocument} tokenDoc
 */
export async function restoreDeletedTokenMaps(tokenDoc) {
  try {
    const scene = tokenDoc?.parent || canvas.scene;
    if (!scene) return false;
    const cache = scene.getFlag(MODULE_ID, 'deletedEntryCache') || {};
    const entry = cache?.[tokenDoc.id];
    if (!entry) return false;

    const updates = [];
    const observerIds = new Set([
      ...Object.keys(entry.visibilityByObserver || {}),
      ...Object.keys(entry.coverByObserver || {}),
    ]);

    for (const obsId of observerIds) {
      const token = canvas.tokens?.get?.(obsId);
      if (!token?.document) continue;
      const patch = { _id: obsId };
      const visState = entry.visibilityByObserver?.[obsId];
      const covState = entry.coverByObserver?.[obsId];

      if (visState !== undefined) {
        const current = getVisibilityMap(token);
        const newVis = { ...current, [tokenDoc.id]: visState };
        patch[`flags.${MODULE_ID}.visibility`] = newVis;
      }
      if (covState !== undefined) {
        const current = getCoverMap(token);
        const newCov = { ...current, [tokenDoc.id]: covState };
        patch[`flags.${MODULE_ID}.cover`] = newCov;
      }
      updates.push(patch);
    }

    if (updates.length) {
      // Only GMs can update token documents during restoration
      if (game.user.isGM) {
        await scene.updateEmbeddedDocuments('Token', updates, { diff: false });
      }
    }

    try {
      delete cache[tokenDoc.id];
      // Only GMs can update scene flags
      if (game.user.isGM) {
        await scene.setFlag(MODULE_ID, 'deletedEntryCache', cache);
      }
    } catch (_) {}

    return updates.length > 0;
  } catch (e) {
    console.warn('PF2E Visioner: Failed to restore deleted token maps', e);
    return false;
  }
}
