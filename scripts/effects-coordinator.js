/**
 * Main Effects Coordinator
 * Coordinates various effect systems (visual, mechanical, targeting)
 */

import { updateTokenVisuals } from './visual-effects.js';

/**
 * Update visibility state for a token from an observer's perspective
 * @param {Token} token - Token whose visibility is being updated
 * @param {string} state - New visibility state
 * @param {Token} observer - Observer token
 */
export function updateTokenVisibilityState(token, state, observer) {
  if (state === 'observed') {
    resetTokenVisuals(token);
  } else {
    applyVisualEffect(token, state, observer);
  }
}

/**
 * Export for backwards compatibility
 */
export { updateTokenVisuals };

export function resetTokenAppearance(token) {
  resetTokenVisuals(token);
}