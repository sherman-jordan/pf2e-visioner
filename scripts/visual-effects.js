/**
 * Visual Effects Handler
 * Handles token visual updates and refresh operations
 */

/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly serves to trigger a token refresh
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;
  
  // The detection wrapper handles most of the work now
  // We just need to refresh tokens to trigger the detection system
  for (const token of canvas.tokens.placeables) {
    if (token.visible) {
      token.refresh();
    }
  }
}

/**
 * Apply specific visual effects to tokens based on visibility state
 * @param {Token} token - The token to apply effects to
 * @param {string} visibilityState - The visibility state (observed, concealed, hidden, undetected)
 */
export function applyTokenVisualEffects(token, visibilityState) {
  // Future: Could add custom visual effects here
  // For now, this is handled by the detection wrapper
}

/**
 * Legacy function for backwards compatibility
 */
export async function applyPersistentVisibilityEffects() {
  // This function is kept for backwards compatibility
  // but most functionality is now handled by other systems
  await updateTokenVisuals();
}