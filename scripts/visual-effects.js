/**
 * Visual Effects Handler
 * Handles token visual updates and refresh operations for both visibility and cover
 */


/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly serves to trigger a token refresh
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;
  if (isDiceSoNiceAnimating()) { setTimeout(() => updateTokenVisuals(), 500); return; }
  for (const token of canvas.tokens.placeables) { if (token.visible) token.refresh(); }
}

/**
 * Targeted updates for performance and correctness. Only applies effects to the provided pairs.
 * @param {Array<{observerId:string,targetId:string,visibility?:string,cover?:string}>} pairs
 */
export async function updateSpecificTokenPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  // Apply only changed visibility/cover per pair
  for (const p of pairs) {
    const observer = canvas.tokens.get(p.observerId);
    const target = canvas.tokens.get(p.targetId);
    if (!observer || !target) continue;
    // We do not draw custom visibility rings; detection/engine visuals will handle it
    // Cover effect only for GM
    try {
      if (game.user.isGM && p.cover) {
        const { applyCoverCondition } = await import('./cover-effects.js');
        await applyCoverCondition(target, observer, p.cover);
      }
    } catch (_) {}
    // Light refresh of the two tokens
    try { observer.refresh(); } catch (_) {}
    try { target.refresh(); } catch (_) {}
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
  
  // Primary check: dice box rolling status
  if (game.dice3d?.box?.rolling) {
    return true;
  }
  
  // Secondary check: dice canvas visibility and animation state
  const diceCanvas = document.getElementById('dice-box-canvas');
  if (diceCanvas) {
    const isVisible = diceCanvas.style.display !== 'none' && diceCanvas.offsetParent !== null;
    const hasOpacity = parseFloat(getComputedStyle(diceCanvas).opacity) > 0;
    
    if (isVisible && hasOpacity) {
      return true;
    }
  }
  
  // Tertiary check: look for active dice animations in the scene
  if (game.dice3d?.box?.scene?.children?.length > 0) {
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