/**
 * Main Effects Coordinator
 * Coordinates various effect systems (visual, mechanical, targeting)
 */

import { VISIBILITY_STATES } from './constants.js';
import { initializeOffGuardHandling } from './off-guard.js';
import { initializeTargeting } from './targeting.js';
import { applyPersistentVisibilityEffects, updateTokenVisuals } from './visual-effects.js';

/**
 * Apply visual effect to token based on visibility state
 * @param {Token} token - Token to apply effect to
 * @param {string} state - Visibility state
 * @param {Token} observer - Observer token (for context)
 */
export function applyVisualEffect(token, state, observer) {
  if (!token?.document) return;
  
  const stateConfig = VISIBILITY_STATES[state];
  if (!stateConfig) return;
  
  // Apply ring effect
  applyVisualIndicator(token, stateConfig);
}

/**
 * Apply visual indicator (ring) to token
 * @param {Token} token - Token to apply indicator to
 * @param {Object} stateConfig - State configuration
 */
function applyVisualIndicator(token, stateConfig) {
  if (!token?.mesh) return;
  
  // Remove existing indicator
  removeVisualIndicator(token);
  
  // Create new ring
  const ring = new PIXI.Graphics();
  ring.lineStyle(4, stateConfig.color, 0.8);
  ring.drawCircle(0, 0, (token.document.width * canvas.grid.size) / 2 + 8);
  ring.name = 'pf2e-visioner-ring';
  ring.zIndex = 1;
  
  token.addChild(ring);
}

/**
 * Remove visual indicator from token
 * @param {Token} token - Token to remove indicator from
 */
function removeVisualIndicator(token) {
  if (!token?.children) return;
  
  const existing = token.children.find(child => child.name === 'pf2e-visioner-ring');
  if (existing) {
    token.removeChild(existing);
    existing.destroy();
  }
}

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
 * Reset token to default visual state
 * @param {Token} token - Token to reset
 */
export function resetTokenVisuals(token) {
  if (!token) return;
  
  // Remove visual indicator (ring)
  removeVisualIndicator(token);
}

/**
 * Initialize all mechanical effects
 * This coordinates all the different effect systems
 */
export function initializeMechanicalEffects() {
  initializeOffGuardHandling();
  initializeTargeting();
}

/**
 * Export for backwards compatibility
 */
export { applyPersistentVisibilityEffects, updateTokenVisuals };

export function resetTokenAppearance(token) {
  resetTokenVisuals(token);
}