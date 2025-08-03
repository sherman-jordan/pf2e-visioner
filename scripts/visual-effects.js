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
  
  // Check if Dice So Nice is currently animating to avoid interference
  if (isDiceSoNiceAnimating()) {
    console.log('PF2E Visioner: Skipping token visual update due to active dice animation');
    return;
  }
  
  // The detection wrapper handles most of the work now
  // We just need to refresh tokens to trigger the detection system
  for (const token of canvas.tokens.placeables) {
    if (token.visible) {
      token.refresh();
    }
  }
}

/**
 * Check if Dice So Nice is currently animating
 * @returns {boolean} True if dice are currently animating
 */
function isDiceSoNiceAnimating() {
  // Check if Dice So Nice module is active
  if (!game.modules.get('dice-so-nice')?.active) {
    return false;
  }
  
  // Check if the dice box is currently rolling
  if (game.dice3d?.box?.rolling) {
    return true;
  }
  
  // Check if the dice canvas is visible (indicating active animation)
  const diceCanvas = document.getElementById('dice-box-canvas');
  if (diceCanvas && diceCanvas.style.display !== 'none' && diceCanvas.offsetParent !== null) {
    return true;
  }
  
  return false;
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