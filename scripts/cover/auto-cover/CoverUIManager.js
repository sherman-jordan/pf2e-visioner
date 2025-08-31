/**
 * CoverUIManager.js
 * Manages UI elements for auto-cover functionality
 */
import { COVER_STATES, MODULE_ID } from '../../constants.js';
import { getCoverBonusByState, getCoverLabel } from '../../helpers/cover-helpers.js';
import { CoverQuickOverrideDialog } from '../quick-override-dialog.js';
import autoCoverSystem from './AutoCoverSystem.js';

export class CoverUIManager {

    constructor() {
        this.autoCoverSystem = autoCoverSystem;
    }

    /**
     * Injects cover override UI into a roll/dialog (buttons + roll binding)
     * @param {Dialog} dialog - The check modifiers dialog
     * @param {HTMLElement|jQuery} html - Dialog HTML
     * @param {string} state - Detected cover state to preselect
     * @param {Token} target - The defending/observed token
     * @param {(args: { chosen: string, dialog: any, dctx: any, subject: Token|null, target: Token|null, targetActor: Actor|null, originalState: string }) => void} [onChosen]
     *        Optional callback to handle chosen state on roll. If omitted, a default AC effect + override store is applied.
     */
    async injectDialogCoverUI(dialog, html, state, target, onChosen) {
        try {
            if (html?.find?.('.pv-cover-override').length === 0) {
                const current = dialog?._pvCoverOverride ?? state ?? 'none';
                const container = $(`
                  <div class="pv-cover-override" style="margin: 6px 0 8px 0;">
                    <div class="pv-cover-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                      <div class="pv-cover-title" style="font-weight:600;">${game.i18n?.localize?.('PF2E_VISIONER.UI.COVER_OVERRIDE') ?? 'Cover'}</div>
                      <div class="pv-cover-buttons" style="display:flex; gap:6px;"></div>
                    </div>
                  </div>
                `);
                const btns = container.find('.pv-cover-buttons');
                const states = ['none', 'lesser', 'standard', 'greater'];
                for (const s of states) {
                    const label = getCoverLabel(s);
                    const bonus = getCoverBonusByState(s);
                    const isActive = s === current;
                    const cfg = COVER_STATES?.[s] || {};
                    const iconClass = cfg.icon || (s === 'none'
                        ? 'fas fa-shield-slash'
                        : s === 'lesser' ? 'fa-regular fa-shield'
                            : s === 'standard' ? 'fas fa-shield-alt' : 'fas fa-shield');
                    const color = cfg.color || 'inherit';
                    const tooltip = `${label}${bonus > 0 ? ` (+${bonus})` : ''}`;
                    const btn = $(`
                        <button type="button" class="pv-cover-btn" data-state="${s}" data-tooltip="${tooltip}" data-tooltip-direction="UP" aria-label="${tooltip}" style="width:28px; height:28px; padding:0; line-height:0; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:${isActive ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))' : 'transparent'}; color:inherit; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
                          <i class="${iconClass}" style="color:${color}; display:block; width:18px; height:18px; line-height:18px; text-align:center; font-size:16px; margin:0;"></i>
                        </button>
                    `);
                    if (isActive) btn.addClass('active');
                    btns.append(btn);
                }

                const anchor = html.find('.roll-mode-panel');
                if (anchor.length > 0) anchor.before(container);
                else html.find('.dialog-buttons').before(container);
                dialog.setPosition();
                container.on('click', '.pv-cover-btn', (ev) => {
                    try {
                        const btn = ev.currentTarget;
                        const sel = btn?.dataset?.state || 'none';
                        dialog._pvCoverOverride = sel;
                        container.find('.pv-cover-btn').each((_, el) => {
                            const active = el.dataset?.state === sel;
                            el.classList.toggle('active', active);
                            el.style.background = active
                                ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))'
                                : 'transparent';
                        });
                    } catch (e) {
                        console.error('PF2E Visioner | Error in cover override button click:', e);
                    }
                });
            }

            // Ensure current roll uses selected (or auto) cover via dialog injection
            try {
                const rollBtnEl = html?.find?.('button.roll')?.[0];
                if (rollBtnEl && !rollBtnEl.dataset?.pvCoverBind) {
                    rollBtnEl.dataset.pvCoverBind = '1';
                    rollBtnEl.addEventListener('click', () => {
                        try {
                            const dctx = dialog?.context || {};
                            const tgt = dctx?.target || target;
                            const tgtActor = tgt?.actor;
                            if (!tgtActor) return;
                            const chosen = dialog?._pvCoverOverride ?? state ?? 'none';
                            const subjectToken = dctx?.actor?.token;
                            const subjectActor = dctx?.actor || null;

                            // Delegate to callback if provided
                            if (typeof onChosen === 'function') {
                                try {
                                    dctx._visionerRollId = foundry?.utils?.randomID?.();
                                    onChosen({ chosen, dialog, dctx, subject: subjectToken, subjectActor, target: tgt, targetActor: tgtActor, originalState: state, rollId: dctx._visionerRollId });
                                } catch (cbErr) {
                                    console.warn('PF2E Visioner | onChosen callback failed:', cbErr);
                                }
                                return;
                            }
                        } catch (_) { }
                    }, true);
                }
            } catch (e) {
                console.error('PF2E Visioner | Error in dialog roll button handler:', e);
            }
        } catch (err) {
            console.warn('PF2E Visioner | injectDialogCoverUI failed:', err);
        }
    }

    // Popup/keybind/dialog helpers
    async isHoldingCoverOverrideKey() {
        try {
            const keybinding = game.keybindings.get(MODULE_ID, 'holdCoverOverride');
            if (!keybinding?.[0]) return false;
            const binding = keybinding[0];
            const keyboard = game.keyboard;
            if (!keyboard) return false;
            let keyCode = binding.key;
            if (keyCode.startsWith('Key')) keyCode = keyCode.replace('Key', '');
            const isKeyPressed = keyboard.downKeys.has(keyCode) || keyboard.downKeys.has(binding.key);
            return isKeyPressed;
        } catch (e) {
            console.warn('PF2E Visioner | Error checking keybind:', e);
            return false;
        }
    }

    async openCoverQuickOverrideDialog(initialState = 'none', isStealthContext = false) {
        return new Promise((resolve) => {
            try {
                const app = new CoverQuickOverrideDialog(initialState, { isStealthContext });
                app.setResolver(resolve);
                app.render(true);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async getCoverPopupChosenState(state) {
        const isHoldingOverrideKey = await this.isHoldingCoverOverrideKey();
        if (!isHoldingOverrideKey) return null;
        try {
            const chosen = await this.openCoverQuickOverrideDialog(state);
            return chosen;
        } catch (e) {
            console.warn('PF2E Visioner | Failed to open cover override dialog:', e);
            return null;
        }
    }

    /**
     * Show popup and return the chosen cover state (or null if cancelled/no override).
     * No effect/stat/actor logic here; only UI.
     */
    async showPopupAndApply(detectedState) {
        try {
            if (game.user.flags?.pf2e?.settings?.showCheckDialogs) {
                return
            }
            const chosen = await this.getCoverPopupChosenState(detectedState);
            return { chosen, rollId: foundry?.utils?.randomID?.() };
        } catch (e) {
            console.warn('PF2E Visioner | Popup error in CoverUIManager:', e);
            return { chosen: null };
        }
    }

    /**
     * Injects a cover override indicator into a chat message
     * @param {ChatMessage} message - The chat message
     * @param {HTMLElement|jQuery} html - The message HTML element
     */
    async injectCoverOverrideIndicator(message, html) {
        try {
            // Only show override indicators to GMs
            if (!game.user.isGM) {
                return;
            }

            // Check if this message has cover override information
            let overrideInfo = message?.flags?.['pf2e-visioner']?.coverOverride;

            // If no override info in message flags, we could try checking the manager
            // but we need token information which isn't available here
            if (!overrideInfo) {
                return;
            }

            // Ensure we have a jQuery-like object
            const $html = html.find ? html : typeof window.$ === 'function' ? window.$(html) : null;
            if (!$html) return;

            // Check if indicator already exists to avoid duplicates
            if ($html.find('.pf2e-visioner-cover-override-indicator').length > 0) {
                return;
            }

            const { originalDetected, finalState, overrideSource } = overrideInfo;

            // Get human-readable labels
            const originalLabel = getCoverLabel(originalDetected);
            const finalLabel = getCoverLabel(finalState);

            // Create compact override indicator with crossed-out original and hover tooltip
            const tooltipText =
                overrideSource === 'popup'
                    ? `Cover overridden via keybind popup`
                    : overrideSource === 'dialog'
                        ? `Cover overridden in roll dialog`
                        : `Cover overridden`;

            // Get cover state colors and icons
            const originalColor =
                COVER_STATES?.[originalDetected]?.color || 'var(--color-text-secondary, #666)';
            const finalColor = COVER_STATES?.[finalState]?.color || 'var(--color-warning, #f39c12)';
            const originalIcon = COVER_STATES?.[originalDetected]?.icon || 'fas fa-shield';
            const finalIcon = COVER_STATES?.[finalState]?.icon || 'fas fa-shield';

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
                    let acNumberSpan = targetDcElement
                        .find('span')
                        .filter(function () {
                            return /^\d+$/.test($(this).text().trim());
                        })
                        .last(); // Get the last number span (should be the final AC)

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
            console.warn('PF2E Visioner | Failed to inject cover override indicator:', e);
        }
    }

    /**
     * Checks if a chat message should have a cover override indicator
     * @param {ChatMessage} message - The chat message to check
     * @returns {Promise<boolean>} True if the message has override information
     */
    async shouldShowCoverOverrideIndicator(message) {
        try {
            if (!game.user.isGM) {
                return false;
            }

            const hasOverride = !!message?.flags?.['pf2e-visioner']?.coverOverride;

            return hasOverride;
        } catch (e) {
            console.warn('PF2E Visioner | Error in shouldShowCoverOverrideIndicator:', e);
            return false;
        }
    }
}

// Singleton instance
const coverUIManager = new CoverUIManager(autoCoverSystem);
export default coverUIManager;
