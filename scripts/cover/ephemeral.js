/**
 * Cover Ephemeral Effects Handler
 * Creates ephemeral effects for cover states using PF2e's native EphemeralEffect system
 */

import { runWithCoverEffectLock } from './utils.js';

// cover lock moved to cover/utils.js

export { cleanupAllCoverEffects } from './cleanup.js';

// covered by export above; keep wrapper for API compatibility
export async function cleanupCoverEffectsForObserver(targetToken, observerToken) {
  await runWithCoverEffectLock(targetToken.actor, async () => {
    const { cleanupCoverEffectsForObserver } = await import('./cleanup.js');
    await cleanupCoverEffectsForObserver(targetToken, observerToken);
  });
}

/**
 * Update ephemeral cover effects
 * @param {Token} targetToken - The token with cover
 * @param {Token} observerToken - The observer token
 * @param {string} coverState - The cover state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.initiative - Boolean (default: null)
 * @param {number} options.durationRounds - Duration in rounds (default: unlimited)
 */
/**
 * Clean up all cover effects related to a deleted token
 * @param {TokenDocument} tokenDoc - The token document being deleted
 */
export { cleanupDeletedTokenCoverEffects } from './cleanup.js';

/**
 * Batch update cover effects for multiple targets
 * @param {Token} observerToken - The observer token
 * @param {Array<Object>} targetUpdates - Array of {target: Token, state: string} objects
 * @param {Object} options - Optional configuration
 */
export { batchUpdateCoverEffects } from './batch.js';
