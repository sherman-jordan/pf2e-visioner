/**
 * Auto-Cover Indicator Service
 * Shows when automatic cover is applied to chat messages for all users
 */

import { getCoverLabel, getCoverBonusByState } from '../../helpers/cover-helpers.js';

/**
 * Injects an auto-cover indicator into a chat message to show when cover was automatically applied
 * @param {ChatMessage} message - The chat message
 * @param {HTMLElement|jQuery} html - The message HTML element
 */
export async function injectAutoCoverIndicator(message, html) {
  try {
    // Check if this message has auto-cover information
    const autoCoverInfo = message?.flags?.['pf2e-visioner']?.autoCover;
    
    if (!autoCoverInfo || autoCoverInfo.coverState === 'none') {
      return;
    }

    const { coverState } = autoCoverInfo;
    const coverBonus = getCoverBonusByState(coverState);
    const coverLabel = getCoverLabel(coverState);

    if (coverBonus <= 0) {
      return;
    }

    // Create the indicator text
    const indicatorText = `Target has: ${coverLabel} +${coverBonus}`;

    // Create the HTML for the indicator with styling similar to PF2e system
    const indicatorHtml = `
      <div class="pf2e-visioner-auto-cover-indicator" style="
        margin: 2px 0;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.1);
        border-left: 3px solid #ff6600;
        font-size: 0.85em;
        color: #666;
        font-style: italic;
      ">
        <i class="fas fa-shield-alt" style="margin-right: 4px; color: #ff6600;"></i>
        ${indicatorText}
      </div>
    `;

    const $html = $ ? $(html) : null;
    if (!$html) {
      console.warn('PF2E Visioner | jQuery not available for auto-cover indicator');
      return;
    }
    
    // Find the best place to insert the indicator
    // Try to place it after the target/AC information but before the damage
    let insertionPoint = null;
    
    // Look for target-dc element first (most specific)
    insertionPoint = $html.find('.target-dc').first();
    if (insertionPoint.length > 0) {
      insertionPoint.after(indicatorHtml);
      return;
    }
    
    // Look for any element with target, AC, or DC in class name
    insertionPoint = $html.find('[class*="target"], [class*="ac"], [class*="dc"]').first();
    if (insertionPoint.length > 0) {
      insertionPoint.after(indicatorHtml);
      return;
    }
    
    // Look for attack roll area
    insertionPoint = $html.find('.attack-roll, .dice-roll').last();
    if (insertionPoint.length > 0) {
      insertionPoint.after(indicatorHtml);
      return;
    }
    
    // Last resort: insert at the beginning of message content
    insertionPoint = $html.find('.message-content').first();
    if (insertionPoint.length > 0) {
      insertionPoint.prepend(indicatorHtml);
      return;
    }
    
    // Final fallback
    $html.prepend(indicatorHtml);

  } catch (e) {
    console.warn('PF2E Visioner | Failed to inject auto-cover indicator:', e);
  }
}

/**
 * Checks if a chat message should have an auto-cover indicator
 * @param {ChatMessage} message - The chat message to check
 * @returns {boolean} True if the message has auto-cover information
 */
export function shouldShowAutoCoverIndicator(message) {
  try {
    const autoCoverInfo = message?.flags?.['pf2e-visioner']?.autoCover;
    return !!(autoCoverInfo && autoCoverInfo.coverState && autoCoverInfo.coverState !== 'none');
  } catch (e) {
    console.warn('PF2E Visioner | Error in shouldShowAutoCoverIndicator:', e);
    return false;
  }
}