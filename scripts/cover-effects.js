/**
 * Cover Effects Coordinator
 * Handles cover-related visual effects and mechanical effects
 */

import { COVER_STATES } from './constants.js';

/**
 * Apply cover effect to token based on cover state
 * @param {Token} token - Token to apply effect to
 * @param {string} state - Cover state
 * @param {Token} observer - Observer token (for context)
 */
export function applyCoverEffect(token, state, observer) {
  if (!token?.document) return;
  
  const stateConfig = COVER_STATES[state];
  if (!stateConfig) return;
  
  // Apply cover indicator
  applyCoverIndicator(token, stateConfig);
}

/**
 * Apply cover indicator to token
 * @param {Token} token - Token to apply indicator to
 * @param {Object} stateConfig - State configuration
 */
function applyCoverIndicator(token, stateConfig) {
  if (!token?.mesh) return;
  
  // Remove existing indicator
  removeCoverIndicator(token);
  
  // Create new indicator
  const indicator = new PIXI.Container();
  indicator.name = 'pf2e-visioner-cover-indicator';
  
  // Create shield icon
  const shield = new PIXI.Graphics();
  shield.beginFill(stateConfig.color, 0.6);
  shield.lineStyle(2, stateConfig.color, 0.8);
  
  // Draw a shield shape
  const width = 20;
  const height = 24;
  
  // Shield top (curved)
  shield.moveTo(0, height / 2);
  shield.lineTo(0, height / 4);
  shield.arcTo(width / 2, 0, width, height / 4, width / 2);
  shield.lineTo(width, height / 2);
  
  // Shield bottom (pointed)
  shield.lineTo(width / 2, height);
  shield.lineTo(0, height / 2);
  
  shield.endFill();
  
  // Position the shield at the top right of the token
  const tokenWidth = token.document.width * canvas.grid.size;
  const tokenHeight = token.document.height * canvas.grid.size;
  
  indicator.addChild(shield);
  indicator.position.set(tokenWidth - width - 5, -5);
  
  // Add text for cover level
  let text;
  if (state === 'lesser') {
    text = '+1';
  } else if (state === 'standard') {
    text = '+2';
  } else if (state === 'greater') {
    text = '+4';
  }
  
  if (text) {
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: 10,
      fontWeight: 'bold',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center'
    });
    
    const textSprite = new PIXI.Text(text, textStyle);
    textSprite.anchor.set(0.5);
    textSprite.position.set(width / 2, height / 2);
    indicator.addChild(textSprite);
  }
  
  token.addChild(indicator);
}

/**
 * Remove cover indicator from token
 * @param {Token} token - Token to remove indicator from
 */
function removeCoverIndicator(token) {
  if (!token?.children) return;
  
  const existing = token.children.find(child => child.name === 'pf2e-visioner-cover-indicator');
  if (existing) {
    token.removeChild(existing);
    existing.destroy();
  }
}

/**
 * Update cover state for a token from an observer's perspective
 * @param {Token} token - Token whose cover is being updated
 * @param {string} state - New cover state
 * @param {Token} observer - Observer token
 */
export function updateTokenCoverState(token, state, observer) {
  if (state === 'none') {
    resetCoverEffects(token);
  } else {
    applyCoverEffect(token, state, observer);
  }
}

/**
 * Reset token cover effects
 * @param {Token} token - Token to reset
 */
export function resetCoverEffects(token) {
  if (!token) return;
  
  // Remove cover indicator
  removeCoverIndicator(token);
}

/**
 * Apply PF2e system conditions based on cover state
 * @param {Token} target - Target token (the one behind cover)
 * @param {Token} observer - Observer token (the one attacking)
 * @param {string} coverState - Cover state
 */
export async function applyCoverCondition(target, observer, coverState) {
  if (!target?.actor || !observer?.actor || !game.pf2e) return;
  
  // Import the ephemeral cover effects system dynamically to avoid circular dependencies
  const { updateEphemeralCoverEffects } = await import('./cover-ephemeral.js');
  
  // Apply ephemeral cover effects
  await updateEphemeralCoverEffects(target, observer, coverState);
}

/**
 * Remove all cover conditions from a token
 * @param {Token} token - Token to remove conditions from
 */
async function removeCoverConditions(token) {
  if (!token?.actor || !game.pf2e) return;
  
  try {
    // Import the ephemeral cover effects system dynamically
    const { cleanupAllCoverEffects } = await import('./cover-ephemeral.js');
    
    // Clean up any ephemeral cover effects
    await cleanupAllCoverEffects();
    
    // Also clean up any legacy cover conditions if they exist
    const coverConditions = token.actor.itemTypes.condition.filter(c => 
      c.slug === 'lesser-cover' || c.slug === 'cover' || c.slug === 'greater-cover'
    );
    
    if (coverConditions.length > 0) {
      const ids = coverConditions.map(c => c.id);
      const existingIds = ids.filter(id => !!token.actor.items.get(id));
      if (existingIds.length > 0) {
        try {
          await token.actor.deleteEmbeddedDocuments('Item', existingIds);
        } catch (e) {
          for (const id of existingIds) {
            if (token.actor.items.get(id)) {
              try { await token.actor.deleteEmbeddedDocuments('Item', [id]); } catch (_) {}
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error removing cover conditions:', error);
  }
}

/**
 * Update all cover effects for a token
 * @param {Token} token - Token to update
 * @param {Object} coverData - Cover data mapping of observer tokens to cover states
 */
export async function updateTokenCoverEffects(token, coverData) {
  if (!token) return;
  
  // For each observer-target relationship, apply the appropriate cover state
  for (const [observerId, coverState] of Object.entries(coverData)) {
    // Get the observer token
    const observer = canvas.tokens.get(observerId);
    if (!observer) continue;
    
    // Apply cover condition for this specific observer-target relationship
    await applyCoverCondition(token, observer, coverState);
  }
}
