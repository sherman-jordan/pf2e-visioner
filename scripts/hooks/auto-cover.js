/**
 * Auto-cover hooks wrapper (simplified)
 * All cover logic is handled in onPreCreateChatMessage for better maintainability.
 */

import { MODULE_ID } from '../constants.js';
import {
  detectCoverStateForAttack,
  isAttackContext,
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onUpdateToken,
  resolveAttackerFromCtx,
  resolveTargetFromCtx,
} from '../cover/auto-cover.js';
import { getCoverBonusByState } from '../helpers/cover-helpers.js';

// Cover overrides are now stored in global window objects:
// - window.pf2eVisionerPopupOverrides (from popup)
// - window.pf2eVisionerDialogOverrides (from roll dialog)

export function registerAutoCoverHooks() {
  Hooks.on('preCreateChatMessage', onPreCreateChatMessage);
  Hooks.on('renderChatMessageHTML', onRenderChatMessage);
  Hooks.on('renderCheckModifiersDialog', onRenderCheckModifiersDialog);
  Hooks.on('updateToken', onUpdateToken);

  // Simple libWrapper ONLY for popup detection - all other logic in onPreCreateChatMessage
  Hooks.on('pf2e.systemReady', () => {
    if (game.modules.get('lib-wrapper')?.active && typeof libWrapper?.register === 'function') {
      libWrapper.register(
        MODULE_ID,
        'game.pf2e.Check.roll',
        async function coverPopupWrapper(wrapped, check, context = {}, event = null, callback) {
          try {
            // Only handle popup logic here - everything else goes to onPreCreateChatMessage
            if (game?.settings?.get?.(MODULE_ID, 'autoCover') && isAttackContext(context)) {
              const attacker = resolveAttackerFromCtx(context);
              const target = resolveTargetFromCtx(context);

              if (attacker && target && (attacker.isOwner || game.user.isGM)) {
                // Ensure visibility-driven off-guard ephemerals are up-to-date on defender before any DC calculation
                try {
                  const { getVisibilityBetween, setVisibilityBetween } = await import(
                    '../utils.js'
                  );
                  const currentVisEarly = getVisibilityBetween(attacker, target);
                  await setVisibilityBetween(attacker, target, currentVisEarly, {
                    skipEphemeralUpdate: false,
                    direction: 'observer_to_target',
                  });
                } catch (_) {}
                // Check for custom keybind - ONLY show popup when keybind is held
                const isHoldingCoverOverrideKey = () => {
                  try {
                    const keybinding = game.keybindings.get(MODULE_ID, 'holdCoverOverride');
                    if (!keybinding?.[0]) {
                      return false;
                    }

                    const binding = keybinding[0];

                    // Check current keyboard state using game.keyboard
                    const keyboard = game.keyboard;
                    if (!keyboard) {
                      return false;
                    }

                    // Convert key code to the format used by keyboard manager
                    let keyCode = binding.key;
                    if (keyCode.startsWith('Key')) {
                      keyCode = keyCode.replace('Key', ''); // 'KeyX' -> 'X'
                    }

                    const isKeyPressed =
                      keyboard.downKeys.has(keyCode) || keyboard.downKeys.has(binding.key);
                    const isCtrlPressed =
                      keyboard.downKeys.has('Control') ||
                      keyboard.downKeys.has('ControlLeft') ||
                      keyboard.downKeys.has('ControlRight');
                    const isAltPressed =
                      keyboard.downKeys.has('Alt') ||
                      keyboard.downKeys.has('AltLeft') ||
                      keyboard.downKeys.has('AltRight');
                    const isShiftPressed =
                      keyboard.downKeys.has('Shift') ||
                      keyboard.downKeys.has('ShiftLeft') ||
                      keyboard.downKeys.has('ShiftRight');
                    const isMetaPressed =
                      keyboard.downKeys.has('Meta') ||
                      keyboard.downKeys.has('MetaLeft') ||
                      keyboard.downKeys.has('MetaRight');

                    const keyMatch = isKeyPressed;
                    const ctrlMatch =
                      isCtrlPressed === (binding.modifiers?.includes('Control') || false);
                    const altMatch = isAltPressed === (binding.modifiers?.includes('Alt') || false);
                    const shiftMatch =
                      isShiftPressed === (binding.modifiers?.includes('Shift') || false);
                    const metaMatch =
                      isMetaPressed === (binding.modifiers?.includes('Meta') || false);

                    const matches = keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;

                    return matches;
                  } catch (e) {
                    console.warn('PF2E Visioner | Error checking keybind:', e);
                    return false;
                  }
                };

                const isHoldingOverrideKey = isHoldingCoverOverrideKey();
                const shouldShowPopup = isHoldingOverrideKey; // Only show popup when keybind is held

                if (shouldShowPopup) {
                  const state = detectCoverStateForAttack(attacker, target);
                  try {
                    const { openCoverQuickOverrideDialog } = await import(
                      '../cover/quick-override-dialog.js'
                    );
                    const chosen = await openCoverQuickOverrideDialog(state);

                    if (chosen !== null) {
                      // Store the override for onPreCreateChatMessage
                      if (!window.pf2eVisionerPopupOverrides)
                        window.pf2eVisionerPopupOverrides = new Map();
                      const overrideKey = `${attacker.id}-${target.id}`;
                      window.pf2eVisionerPopupOverrides.set(overrideKey, chosen);

                      // Apply the cover effect to the target actor NOW (before roll calculation)
                      const bonus = getCoverBonusByState(chosen) || 0;

                      if (bonus > 0) {
                        // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                        const tgtActor = target.actor;
                        const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        // Remove any existing one-roll cover effects we may have added
                        const filteredItems = items.filter(
                          (i) =>
                            !(
                              i?.type === 'effect' &&
                              i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                            ),
                        );
                        const { getCoverLabel, getCoverImageForState } = await import(
                          '../helpers/cover-helpers.js'
                        );
                        const label = getCoverLabel(chosen);
                        const img = getCoverImageForState(chosen);
                        filteredItems.push({
                          name: label,
                          type: 'effect',
                          system: {
                            description: {
                              value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                              gm: '',
                            },
                            rules: [
                              {
                                key: 'FlatModifier',
                                selector: 'ac',
                                type: 'circumstance',
                                value: bonus,
                              },
                            ],
                            traits: { otherTags: [], value: [] },
                            level: { value: 1 },
                            duration: { value: -1, unit: 'unlimited' },
                            tokenIcon: { show: false },
                            unidentified: false,
                            start: { value: 0 },
                            badge: null,
                          },
                          img,
                          flags: {
                            'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true },
                          },
                        });
                        // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                        try {
                          const { getVisibilityBetween } = await import(
                            '../stores/visibility-map.js'
                          );
                          const visState = getVisibilityBetween(target, attacker);
                          if (['hidden', 'undetected'].includes(visState)) {
                            const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                            filteredItems.push({
                              name: `Off-Guard (${reason})`,
                              type: 'effect',
                              system: {
                                description: {
                                  value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                  gm: '',
                                },
                                rules: [
                                  {
                                    key: 'FlatModifier',
                                    selector: 'ac',
                                    type: 'circumstance',
                                    value: -2,
                                  },
                                ],
                                traits: { otherTags: [], value: [] },
                                level: { value: 1 },
                                duration: { value: -1, unit: 'unlimited' },
                                tokenIcon: { show: false },
                                unidentified: false,
                                start: { value: 0 },
                                badge: null,
                              },
                              img: 'icons/svg/terror.svg',
                              flags: {
                                'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                              },
                            });
                          }
                        } catch (_) {}
                        const clonedActor = tgtActor.clone(
                          { items: filteredItems },
                          { keepId: true },
                        );
                        const dcObj = context.dc;
                        if (dcObj?.slug) {
                          const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                          if (clonedStat) {
                            dcObj.value = clonedStat.value;
                            dcObj.statistic = clonedStat;
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('PF2E Visioner | Popup error:', e);
                  }
                } else {
                  // No popup - apply automatic cover detection
                  const state = detectCoverStateForAttack(attacker, target);

                  if (state !== 'none') {
                    // Apply the cover effect automatically
                    const bonus = getCoverBonusByState(state) || 0;

                    if (bonus > 0) {
                      // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                      const tgtActor = target.actor;
                      const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                      // Remove any existing one-roll cover effects we may have added
                      const filteredItems = items.filter(
                        (i) =>
                          !(
                            i?.type === 'effect' &&
                            i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                          ),
                      );
                      const { getCoverLabel, getCoverImageForState } = await import(
                        '../helpers/cover-helpers.js'
                      );
                      const label = getCoverLabel(state);
                      const img = getCoverImageForState(state);
                      filteredItems.push({
                        name: label,
                        type: 'effect',
                        system: {
                          description: {
                            value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                            gm: '',
                          },
                          rules: [
                            {
                              key: 'FlatModifier',
                              selector: 'ac',
                              type: 'circumstance',
                              value: bonus,
                            },
                          ],
                          traits: { otherTags: [], value: [] },
                          level: { value: 1 },
                          duration: { value: -1, unit: 'unlimited' },
                          tokenIcon: { show: false },
                          unidentified: false,
                          start: { value: 0 },
                          badge: null,
                        },
                        img,
                        flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
                      });
                      // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                      try {
                        const { getVisibilityBetween } = await import(
                          '../stores/visibility-map.js'
                        );
                        const visState = getVisibilityBetween(target, attacker);
                        if (['hidden', 'undetected'].includes(visState)) {
                          const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                          filteredItems.push({
                            name: `Off-Guard (${reason})`,
                            type: 'effect',
                            system: {
                              description: {
                                value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                gm: '',
                              },
                              rules: [
                                {
                                  key: 'FlatModifier',
                                  selector: 'ac',
                                  type: 'circumstance',
                                  value: -2,
                                },
                              ],
                              traits: { otherTags: [], value: [] },
                              level: { value: 1 },
                              duration: { value: -1, unit: 'unlimited' },
                              tokenIcon: { show: false },
                              unidentified: false,
                              start: { value: 0 },
                              badge: null,
                            },
                            img: 'icons/svg/terror.svg',
                            flags: {
                              'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                            },
                          });
                        }
                      } catch (_) {}
                      const clonedActor = tgtActor.clone(
                        { items: filteredItems },
                        { keepId: true },
                      );
                      const dcObj = context.dc;
                      if (dcObj?.slug) {
                        const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                        if (clonedStat) {
                          dcObj.value = clonedStat.value;
                          dcObj.statistic = clonedStat;
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.warn('PF2E Visioner | Error in popup wrapper:', e);
          }

          // (Moved earlier) off-guard ephemerals ensured before calculation

          return await wrapped(check, context, event, callback);
        },
        'WRAPPER',
      );
    }
  });
}
