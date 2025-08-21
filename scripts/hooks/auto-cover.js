/**
 * Auto-cover hooks wrapper (simplified)
 * All cover logic is handled in onPreCreateChatMessage for better maintainability.
 */

import { MODULE_ID } from "../constants.js";
import {
  detectCoverStateForAttack,
  isAttackContext,
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onUpdateToken,
  resolveAttackerFromCtx,
  resolveTargetFromCtx
} from "../cover/auto-cover.js";
import { getCoverBonusByState } from "../helpers/cover-helpers.js";

// Cover overrides are now stored in global window objects:
// - window.pf2eVisionerPopupOverrides (from popup)
// - window.pf2eVisionerDialogOverrides (from roll dialog)

export function registerAutoCoverHooks() {
  Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("renderCheckModifiersDialog", onRenderCheckModifiersDialog);
  Hooks.on("updateToken", onUpdateToken);

  // Simple libWrapper ONLY for popup detection - all other logic in onPreCreateChatMessage
  Hooks.on("pf2e.systemReady", () => {
      if (game.modules.get("lib-wrapper")?.active && typeof libWrapper?.register === "function") {
        libWrapper.register(
        MODULE_ID,
          "game.pf2e.Check.roll",
        async function coverPopupWrapper(wrapped, check, context = {}, event = null, callback) {
            try {
            // Only handle popup logic here - everything else goes to onPreCreateChatMessage
              if (game?.settings?.get?.(MODULE_ID, "autoCover") && isAttackContext(context)) {
              const attacker = resolveAttackerFromCtx(context);
              const target = resolveTargetFromCtx(context);
              
              if (attacker && target && (attacker.isOwner || game.user.isGM)) {
                console.log("PF2E Visioner | Checking for keybind override:", {
                  hasEvent: !!event, 
                  eventType: event?.type, 
                  eventCode: event?.code,
                  eventKey: event?.key,
                  ctrlKey: event?.ctrlKey,
                  altKey: event?.altKey,
                  shiftKey: event?.shiftKey,
                  metaKey: event?.metaKey
                });
                
                // Check for custom keybind - ONLY show popup when keybind is held
                const isHoldingCoverOverrideKey = () => {
                  try {
                    const keybinding = game.keybindings.get(MODULE_ID, "holdCoverOverride");
                    console.log("PF2E Visioner | Keybinding config:", keybinding);
                    if (!keybinding?.[0]) {
                      console.log("PF2E Visioner | No keybinding configured");
                      return false;
                    }
                    
                    const binding = keybinding[0];
                    
                    // Check current keyboard state using game.keyboard
                    const keyboard = game.keyboard;
                    if (!keyboard) {
                      console.log("PF2E Visioner | No keyboard manager available");
                      return false;
                    }
                    
                    // Convert key code to the format used by keyboard manager
                    let keyCode = binding.key;
                    if (keyCode.startsWith('Key')) {
                      keyCode = keyCode.replace('Key', ''); // 'KeyX' -> 'X'
                    }
                    
                    const isKeyPressed = keyboard.downKeys.has(keyCode) || keyboard.downKeys.has(binding.key);
                    const isCtrlPressed = keyboard.downKeys.has('Control') || keyboard.downKeys.has('ControlLeft') || keyboard.downKeys.has('ControlRight');
                    const isAltPressed = keyboard.downKeys.has('Alt') || keyboard.downKeys.has('AltLeft') || keyboard.downKeys.has('AltRight');
                    const isShiftPressed = keyboard.downKeys.has('Shift') || keyboard.downKeys.has('ShiftLeft') || keyboard.downKeys.has('ShiftRight');
                    const isMetaPressed = keyboard.downKeys.has('Meta') || keyboard.downKeys.has('MetaLeft') || keyboard.downKeys.has('MetaRight');
                    
                    console.log("PF2E Visioner | Keyboard state check:", {
                      requiredKey: binding.key,
                      keyCode,
                      requiredModifiers: binding.modifiers,
                      currentDownKeys: Array.from(keyboard.downKeys),
                      keyPressed: isKeyPressed,
                      ctrlPressed: isCtrlPressed,
                      altPressed: isAltPressed,
                      shiftPressed: isShiftPressed,
                      metaPressed: isMetaPressed
                    });
                    
                    const keyMatch = isKeyPressed;
                    const ctrlMatch = isCtrlPressed === (binding.modifiers?.includes("Control") || false);
                    const altMatch = isAltPressed === (binding.modifiers?.includes("Alt") || false);
                    const shiftMatch = isShiftPressed === (binding.modifiers?.includes("Shift") || false);
                    const metaMatch = isMetaPressed === (binding.modifiers?.includes("Meta") || false);
                    
                    const matches = keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
                    console.log("PF2E Visioner | Keybind match result:", {
                      keyMatch,
                      ctrlMatch,
                      altMatch,
                      shiftMatch,
                      metaMatch,
                      overallMatch: matches
                    });
                    
                    return matches;
                        } catch (e) {
                    console.warn("PF2E Visioner | Error checking keybind:", e);
                    return false;
                  }
                };
                
                const isHoldingOverrideKey = isHoldingCoverOverrideKey();
                const shouldShowPopup = isHoldingOverrideKey; // Only show popup when keybind is held
                
                console.log("PF2E Visioner | Popup decision:", {
                  isHoldingOverrideKey,
                  shouldShowPopup
                });
                
                if (shouldShowPopup) {
                  const state = detectCoverStateForAttack(attacker, target);
                  console.log("PF2E Visioner | Showing popup for cover override");
                  
                  try {
                    const { openCoverQuickOverrideDialog } = await import("../cover/quick-override-dialog.js");
                    const chosen = await openCoverQuickOverrideDialog(state);
                    
                    if (chosen !== null) {
                      // Store the override for onPreCreateChatMessage
                      if (!window.pf2eVisionerPopupOverrides) window.pf2eVisionerPopupOverrides = new Map();
                      const overrideKey = `${attacker.id}-${target.id}`;
                      window.pf2eVisionerPopupOverrides.set(overrideKey, chosen);
                      console.log("PF2E Visioner | Stored popup override:", { key: overrideKey, chosen });
                      
                      // Apply the cover effect to the target actor NOW (before roll calculation)
                      const bonus = getCoverBonusByState(chosen) || 0;
                      console.log("PF2E Visioner | Applying cover effect to target actor:", { chosen, bonus });
                      
                      if (bonus > 0) {
                        // Clone the target actor with the cover effect
                        const tgtActor = target.actor;
                        const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        
                        // Remove any existing cover effects
                        const filteredItems = items.filter((i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true));
                        
                        // Add the new cover effect
                        const { getCoverLabel, getCoverImageForState } = await import("../helpers/cover-helpers.js");
                        const label = getCoverLabel(chosen);
                        const img = getCoverImageForState(chosen);
                        
                        filteredItems.push({
                          name: label,
                          type: 'effect',
                          system: {
                            description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: '' },
                            rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus }],
                            traits: { otherTags: [], value: [] },
                            level: { value: 1 },
                            duration: { value: -1, unit: 'unlimited' },
                            tokenIcon: { show: false },
                            unidentified: false,
                            start: { value: 0 },
                            badge: null
                          },
                          img,
                          flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } }
                        });
                        
                        // Update the context to use the cloned actor
                        const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });
                        
                        // Update the DC object to use the cloned actor's statistics
                        const dcObj = context.dc;
                        if (dcObj?.slug) {
                          const originalStat = tgtActor.getStatistic?.(dcObj.slug)?.dc;
                          const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                          console.log("PF2E Visioner | AC comparison:", {
                            originalAC: originalStat?.value,
                            clonedAC: clonedStat?.value,
                            dcSlug: dcObj.slug,
                            expectedBonus: bonus
                          });
                          if (clonedStat) {
                            dcObj.value = clonedStat.value;
                            dcObj.statistic = clonedStat;
                            console.log("PF2E Visioner | Updated DC to cloned actor AC:", clonedStat.value);
                          }
                        }
                      } else if (chosen === "none") {
                        console.log("PF2E Visioner | No cover selected - no AC modification");
                      }
                    }
                  } catch (e) {
                    console.warn("PF2E Visioner | Popup error:", e);
                  }
                } else {
                  // No popup - apply automatic cover detection
                  const state = detectCoverStateForAttack(attacker, target);
                  console.log("PF2E Visioner | Applying automatic cover detection:", { state });
                  
                  if (state !== "none") {
                    // Apply the cover effect automatically
                  const bonus = getCoverBonusByState(state) || 0;
                    console.log("PF2E Visioner | Applying automatic cover effect:", { state, bonus });
                    
                    if (bonus > 0) {
                      // Clone the target actor with the cover effect
                      const tgtActor = target.actor;
                      const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                      
                      // Remove any existing cover effects
                      const filteredItems = items.filter((i) => !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true));
                      
                      // Add the new cover effect
                      const { getCoverLabel, getCoverImageForState } = await import("../helpers/cover-helpers.js");
                      const label = getCoverLabel(state);
                      const img = getCoverImageForState(state);
                      
                      filteredItems.push({
                        name: label,
                        type: 'effect',
                        system: {
                          description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: '' },
                          rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus }],
                          traits: { otherTags: [], value: [] },
                          level: { value: 1 },
                          duration: { value: -1, unit: 'unlimited' },
                          tokenIcon: { show: false },
                          unidentified: false,
                          start: { value: 0 },
                          badge: null
                        },
                        img,
                        flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } }
                      });
                      
                      // Update the context to use the cloned actor
                      const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });
                      
                      // Update the DC object to use the cloned actor's statistics
                      const dcObj = context.dc;
                      if (dcObj?.slug) {
                        const originalStat = tgtActor.getStatistic?.(dcObj.slug)?.dc;
                        const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                        console.log("PF2E Visioner | Auto-cover AC comparison:", {
                          originalAC: originalStat?.value,
                          clonedAC: clonedStat?.value,
                          dcSlug: dcObj.slug,
                          expectedBonus: bonus
                        });
                        if (clonedStat) {
                          dcObj.value = clonedStat.value;
                          dcObj.statistic = clonedStat;
                          console.log("PF2E Visioner | Updated DC to auto-cover AC:", clonedStat.value);
                        }
                      }
                    }
                  } else {
                    console.log("PF2E Visioner | No cover detected - no AC modification");
                  }
                }
              }
            }
          } catch (e) {
            console.warn("PF2E Visioner | Error in popup wrapper:", e);
          }
          
          return await wrapped(check, context, event, callback);
        },
        "WRAPPER"
      );
      console.log("PF2E Visioner | Simple popup wrapper registered");
    }
  });
  
  console.log("PF2E Visioner | Auto-cover hooks registered (simplified architecture)");
}
