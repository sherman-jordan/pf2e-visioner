/**
 * Cover Override Indicator Service
 * Adds visual indicators to chat messages when auto cover calculations were overridden
 */

import { COVER_STATES } from "../../constants.js";
import { getCoverLabel } from "../../helpers/cover-helpers.js";

// Import the pending overrides map from auto-cover
let _pendingOverrides = null;
async function getPendingOverrides() {
    if (!_pendingOverrides) {
        try {
            const module = await import("../../cover/auto-cover.js");
            _pendingOverrides = module._pendingOverrides || new Map();
        } catch (e) {
            _pendingOverrides = new Map();
        }
    }
    return _pendingOverrides;
}

/**
 * Injects a cover override indicator into a chat message
 * @param {ChatMessage} message - The chat message
 * @param {HTMLElement|jQuery} html - The message HTML element
 */
export async function injectCoverOverrideIndicator(message, html) {
  try {
    // Only show override indicators to GMs
    if (!game.user.isGM) {
      return;
    }

        // Check if this message has cover override information
        let overrideInfo = message?.flags?.["pf2e-visioner"]?.coverOverride;

        // If not found in flags, check pending overrides map
        if (!overrideInfo) {
            const pendingOverrides = await getPendingOverrides();

            // Look for matching override in pending map
            for (const [key, data] of pendingOverrides.entries()) {
                // Match based on attacker/target and recent timestamp (within last 10 seconds)
                if (Date.now() - data.timestamp < 10000) {
                    overrideInfo = data;
                    // Clean up the used override
                    pendingOverrides.delete(key);
                    break;
                }
            }
        }

        if (!overrideInfo) {
            return;
        }

        // Ensure we have a jQuery-like object
        const $html = html.find ? html : (typeof window.$ === "function" ? window.$(html) : null);
        if (!$html) return;

        // Check if indicator already exists to avoid duplicates
        if ($html.find('.pf2e-visioner-cover-override-indicator').length > 0) {
            return;
        }

        const { originalDetected, finalState, overrideSource, attackerName, targetName } = overrideInfo;

        // Get human-readable labels
        const originalLabel = getCoverLabel(originalDetected);
        const finalLabel = getCoverLabel(finalState);

        // Determine the override type and create appropriate message
        let overrideText = "";
        let overrideIcon = "";

        if (overrideSource === "popup") {
            overrideText = game.i18n?.format?.("PF2E_VISIONER.COVER_OVERRIDE.POPUP_OVERRIDE", {
                original: originalLabel,
                final: finalLabel
            }) || `Cover overridden via keybind popup: ${originalLabel} → ${finalLabel}`;
            overrideIcon = "fas fa-hand-pointer";
        } else if (overrideSource === "dialog") {
            overrideText = game.i18n?.format?.("PF2E_VISIONER.COVER_OVERRIDE.DIALOG_OVERRIDE", {
                original: originalLabel,
                final: finalLabel
            }) || `Cover overridden in roll dialog: ${originalLabel} → ${finalLabel}`;
            overrideIcon = "fas fa-cog";
        } else {
            overrideText = game.i18n?.format?.("PF2E_VISIONER.COVER_OVERRIDE.GENERIC_OVERRIDE", {
                original: originalLabel,
                final: finalLabel
            }) || `Cover overridden: ${originalLabel} → ${finalLabel}`;
            overrideIcon = "fas fa-edit";
        }

        // Create compact override indicator with crossed-out original and hover tooltip
        const tooltipText = overrideSource === "popup"
            ? `Cover overridden via keybind popup`
            : overrideSource === "dialog"
                ? `Cover overridden in roll dialog`
                : `Cover overridden`;

        // Get cover state colors and icons
        const originalColor = COVER_STATES?.[originalDetected]?.color || "var(--color-text-secondary, #666)";
        const finalColor = COVER_STATES?.[finalState]?.color || "var(--color-warning, #f39c12)";
        const originalIcon = COVER_STATES?.[originalDetected]?.icon || "fas fa-shield";
        const finalIcon = COVER_STATES?.[finalState]?.icon || "fas fa-shield";

        const indicatorHtml = `
      <span class="pf2e-visioner-cover-override-indicator" style="
        margin-left: 4px;
        padding: 2px 4px;
        background: rgba(0, 0, 0, 0.15);
        border-radius: 3px;
        font-size: 1em;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        vertical-align: middle;
      ">
        <span style="
          color: ${originalColor};
          opacity: 0.8;
          display: inline-flex;
          align-items: center;
          filter: brightness(0.7);
        ">
          <i class="${originalIcon}" style="font-size: 0.9em;"></i>
        </span>
        <i class="fas fa-arrow-right" style="
          color: var(--color-text-secondary, #999);
          font-size: 0.6em;
        "></i>
        <span 
          data-tooltip="${tooltipText}: ${originalLabel} → ${finalLabel}"
          data-tooltip-direction="UP"
          style="
            color: ${finalColor};
            cursor: help;
            display: inline-flex;
            align-items: center;
            filter: brightness(0.8);
          "
        >
          <i class="${finalIcon}" style="font-size: 0.9em;"></i>
        </span>
      </span>
    `;

        // Find the specific AC span element (the adjusted AC value)
        let acSpan = $html.find('.target-dc .adjusted').first();
        
        if (acSpan.length > 0) {
            // Insert the indicator right after the AC span (inline)
            acSpan.after(indicatorHtml);
        } else {
            // Fallback: look for any span with AC pattern in the target-dc area
            let targetDcElement = $html.find('.target-dc').first();
            
            if (targetDcElement.length > 0) {
                // Look for spans containing numbers that could be AC
                let acNumberSpan = targetDcElement.find('span').filter(function() {
                    return /^\d+$/.test($(this).text().trim());
                }).last(); // Get the last number span (should be the final AC)
                
                if (acNumberSpan.length > 0) {
                    acNumberSpan.after(indicatorHtml);
                } else {
                    // Look for the closing parenthesis and insert before it
                    let targetHtml = targetDcElement.html();
                    if (targetHtml.includes(')')) {
                        let newHtml = targetHtml.replace(/\)/, indicatorHtml + ')');
                        targetDcElement.html(newHtml);
                    } else {
                        // Last resort: append to the target-dc element
                        targetDcElement.append(indicatorHtml);
                    }
                }
            } else {
                // Fallback: look for any element with target or AC in the class name
                let fallbackTarget = $html.find('[class*="target"], [class*="ac"], [class*="dc"]').first();
                
                if (fallbackTarget.length > 0) {
                    fallbackTarget.after(indicatorHtml);
                } else {
                    // Last resort: insert after attack roll
                    let attackTarget = $html.find('.attack-roll, .dice-roll').last();
                    if (attackTarget.length === 0) {
                        attackTarget = $html.find('.message-content').first();
                    }
                    
                    if (attackTarget.length > 0) {
                        if (attackTarget.is('.message-content')) {
                            attackTarget.prepend(indicatorHtml);
                        } else {
                            attackTarget.after(indicatorHtml);
                        }
                    } else {
                        $html.prepend(indicatorHtml);
                    }
                }
            }
        }

    } catch (e) {
        console.warn("PF2E Visioner | Failed to inject cover override indicator:", e);
    }
}

/**
 * Checks if a chat message should have a cover override indicator
 * @param {ChatMessage} message - The chat message to check
 * @returns {Promise<boolean>} True if the message has override information
 */
export async function shouldShowCoverOverrideIndicator(message) {
    try {
        if (!game.user.isGM) {
            return false;
        }
        
        const hasOverride = !!message?.flags?.["pf2e-visioner"]?.coverOverride;

        // If not in flags, check pending overrides
        let hasPendingOverride = false;
        if (!hasOverride) {
            const pendingOverrides = await getPendingOverrides();
            
            const messageId = message?.id;
            for (const [key, data] of pendingOverrides.entries()) {
                // Check if key contains the message ID or if it's a recent override
                if ((messageId && key.includes(messageId)) || (Date.now() - data.timestamp < 10000)) {
                    hasPendingOverride = true;
                    break;
                }
            }
        }

        return hasOverride || hasPendingOverride;
    } catch (e) {
        console.warn("PF2E Visioner | Error in shouldShowCoverOverrideIndicator:", e);
        return false;
    }
}
