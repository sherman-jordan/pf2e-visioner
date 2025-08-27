/**
 * SavingThrowUseCase.js
 * Handles saving throw contexts for auto-cover
 */

import { COVER_STATES } from '../../../constants.js';
import {
  getCoverBonusByState,
  getCoverImageForState,
  getCoverLabel,
} from '../../../helpers/cover-helpers.js';
import { BaseAutoCoverUseCase } from './BaseUseCase.js';
import { CoverUIManager } from '../CoverUIManager.js';

export class SavingThrowUseCase extends BaseAutoCoverUseCase {

      constructor(autoCoverSystem) {
          super(autoCoverSystem);
          this.coverUI = new CoverUIManager(this.autoCoverSystem);
      }

  /**
     * Handle a chat message context
     * @param {Object} data - Message data
     * @param {Object} doc - Message document (optional)
     * @returns {Promise<Object>} Result with tokens and cover state
     */
    async handlePreCreateChatMessage(data, doc = null) {
       try {
           if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
       
           // CRITICAL: Check if this message was already handled by popup wrapper
           const ctx = data?.flags?.pf2e?.context || {};
           const ctxType = ctx?.type || '';
       
           // For reflex saves, check if popup wrapper handled it recently
             const speakerTokenId = this.normalizeTokenRef(data?.speaker?.token);
             const targetTokenId = this._resolveTargetTokenIdFromData(data);

             if (speakerTokenId && window.pf2eVisionerPopupHandled) {
               // Try multiple key patterns to match what popup wrapper stored
               const possibleKeys = [
                 `${speakerTokenId}-${targetTokenId}-reflex`,
                 `${targetTokenId}-${speakerTokenId}-reflex`
               ];
       
               for (const key of possibleKeys) {
                 const timestamp = window.pf2eVisionerPopupHandled.get(key);
                 if (timestamp && (Date.now() - timestamp) < 5000) { // 5 second window
                   console.debug('PF2E Visioner | onPreCreateChatMessage: SKIPPING - already handled by popup wrapper', {
                     key,
                     ageMs: Date.now() - timestamp,
                     contextType: ctxType,
                     contextStatistic: ctx.statistic
                   });
                   // Clean up the flag after use
                   window.pf2eVisionerPopupHandled.delete(key);
                   return;
                 }
               }
             }

           try {
             const ctx = data?.flags?.pf2e?.context || {};
             console.debug('PF2E Visioner | onPreCreateChatMessage: context', {
               type: ctxType,
               statistic: ctx?.statistic,
               saveType: ctx?.save?.type,
               saveStat: ctx?.save?.statistic,
               traits: ctx?.traits,
               options: ctx?.options,
             });
           } catch (_) { }
       
           const tokens = canvas?.tokens;
           if (!tokens?.get) return;
       
           // Determine attacker differently for saving throws: the speaker is the defender
           let attackerSource = 'speaker';
           let attackerTokenId = speakerTokenId;
           if (ctxType === 'saving-throw') {
             // 1) PF2E context.origin.token (preferred for system saves)
             try {
               const ctxOriginToken = data?.flags?.pf2e?.context?.origin?.token;
               const normalizedCtx = ctxOriginToken ? this.normalizeTokenRef(ctxOriginToken) : null;
               if (normalizedCtx) {
                 attackerSource = 'pf2e.context.origin.token';
                 attackerTokenId = normalizedCtx;
               }
             } catch (_) { }
             // 1b) PF2E origin.token (top-level)
             if (attackerSource === 'speaker') {
               try {
                 const originToken = data?.flags?.pf2e?.origin?.token;
                 const normalized = originToken ? this.normalizeTokenRef(originToken) : null;
                 if (normalized) {
                   attackerSource = 'pf2e.origin.token';
                   attackerTokenId = normalized;
                 }
               } catch (_) { }
             }
             // 1c) PF2E origin.uuid (extract Token segment if present)
             if (attackerSource === 'speaker') {
               try {
                 const originUUID = data?.flags?.pf2e?.origin?.uuid;
                 const normalized = originUUID ? this.normalizeTokenRef(originUUID) : null;
                 if (normalized) {
                   attackerSource = 'pf2e.origin.uuid';
                   attackerTokenId = normalized;
                 }
               } catch (_) { }
             }
             // 2) PF2E origin actor -> find a token on scene
             if (attackerSource === 'speaker') {
               try {
                 const originActorId = data?.flags?.pf2e?.context?.origin?.actor || data?.flags?.pf2e?.origin?.actor;
                 if (originActorId) {
                   const t = Array.from(tokens?.placeables || []).find((tk) => tk?.actor?.id === originActorId);
                   if (t?.id) {
                     attackerSource = 'pf2e.origin.actor';
                     attackerTokenId = t.id;
                   }
                 }
               } catch (_) { }
             }
             // 3) Latest template origin cache (pick newest ts)
             if (attackerSource === 'speaker') {
               try {
                 const entries = Array.from(window?.pf2eVisionerTemplateOrigins?.entries?.() || []);
                 if (entries.length) {
                   entries.sort((a, b) => (b?.[1]?.ts || 0) - (a?.[1]?.ts || 0));
                   const candidateId = entries[0]?.[0];
                   if (candidateId && typeof candidateId === 'string') {
                     attackerSource = 'template:latest';
                     attackerTokenId = candidateId;
                   }
                 }
               } catch (_) { }
             }
           }
       
           let attacker = tokens.get(attackerTokenId);
           if (!attacker) return;
           try {
             console.debug('PF2E Visioner | onPreCreateChatMessage: speaker/target/attacker ids', {
               speakerTokenId,
               targetTokenId,
               attackerTokenId,
               attackerSource,
             });
           } catch (_) { }
       
           // Handle saving-throw with multiple targets (pf2e-toolbelt group save buttons)
             let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
             // Fallback to cached targets from template placement
             if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
               try {
                 const out = [];
                 for (const k of (window?.pf2eVisionerTemplateCoverByTarget || new Map()).keys()) {
                   const [attId, tgtId] = String(k).split('-');
                   if (attId === attacker.id && tgtId) out.push(tgtId);
                 }
                 if (out.length > 0) tbTargets = out;
               } catch (_) { }
             }
             if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
               console.debug('PF2E Visioner | saving-throw: no targets found (pf2e/pf2e-toolbelt/cache)');
               return;
             }
             console.debug('PF2E Visioner | saving-throw: applying cover for multiple targets', {
               count: tbTargets.length,
             });
             let originPoint = null;
             try {
               const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
               if (originRec) {
                 originPoint = originRec.point;
                 console.debug('PF2E Visioner | saving-throw: found recent template origin', {
                   origin: originPoint,
                   tsAgeMs: Date.now() - (originRec?.ts || 0),
                 });
               }
             } catch (_) { }
             for (const tRef of tbTargets) {
               const tid = this.normalizeTokenRef(tRef);
               const tgt = tid ? tokens.get(tid) : null;
               if (!tgt) continue;
               let state;
               // Prefer cached placement cover state if available
               try {
                 const key = `${attacker.id}-${tgt.id}`;
                 const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
                 if (rec?.state) {
                   state = rec.state;
                   console.debug('PF2E Visioner | saving-throw: using cached placement cover', {
                     targetId: tgt.id,
                     state,
                     bonus: rec?.bonus,
                     origin: rec?.origin,
                   });
                 }
               } catch (_) { }
               // Fallback: compute from stored origin or attacker center
               if (!state) {
                 try {
                   if (originPoint) {
                     console.debug('PF2E Visioner | saving-throw: using template origin for target', {
                       targetId: tgt.id,
                       origin: originPoint,
                     });
                     state = this._detectCover(originPoint, tgt);
                   }
                 } catch (_) { }
               }
               if (!state) state = this._detectCover(attacker, tgt);
               // Apply without ephemeral update; ephemeral bonuses are handled by the roll wrapper
               try {
                 await this.autoCoverSystem.setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
                 console.debug('PF2E Visioner | saving-throw: setCoverBetween applied', {
                   attackerId: attacker.id,
                   targetId: tgt.id,
                   state,
                 });
                 // Chat-message injection no longer needed: handled by roll wrapper via CheckModifier.push()
                 console.debug('PF2E Visioner | saving-throw: skipping chat message modifier injection (handled by roll wrapper)');
       
                 try {
                   Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                     observerId: attacker.id,
                     targetId: tgt.id,
                     state,
                   });
                 } catch (_) { }
               } catch (e) {
                 console.warn('PF2E Visioner | saving-throw: failed to set cover for target', tgt?.id, e);
               }
             }
             // We handled multi-target saves here; stop further single-target flow
             return;
         } catch (e) {
           console.warn('PF2E Visioner | Error in onPreCreateChatMessage:', e);
         }
    }

  /**
   * Handle a chat message context
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleRenderChatMessage(message, html) {
    // Allow all users to clean up their own effects
    // GM can clean up any effects

    if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
    const data = message?.toObject?.() || {};
    const attackerIdRaw =
      data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
    const attackerId = this.normalizeTokenRef(attackerIdRaw);
    const targetId = this._resolveTargetTokenIdFromData(data);
    if (!attackerId) return;
    const tokens = canvas?.tokens;
    if (!tokens?.get) return;
    const attacker = tokens.get(attackerId);
    if (!attacker) return;
    super.handleRenderChatMessage(message, html);

    // Post-create handling for saving throws: toolbelt targets may be available now
    try {
      const ctxType = data?.flags?.pf2e?.context?.type || '';
      if (!targetId && ctxType === 'saving-throw') {
        let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
        if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
          try {
            const out = [];
            for (const k of (window?.pf2eVisionerTemplateCoverByTarget || new Map()).keys()) {
              const [attId, tgtId] = String(k).split('-');
              if (attId === attacker.id && tgtId) out.push(tgtId);
            }
            if (out.length > 0) tbTargets = out;
          } catch (_) {}
        }
        if (!Array.isArray(tbTargets) || tbTargets.length === 0) {
          console.debug(
            'PF2E Visioner | onRenderChatMessage saving-throw: no targets (pf2e/pf2e-toolbelt/cache)',
          );
          return;
        }
        console.debug(
          'PF2E Visioner | onRenderChatMessage saving-throw: applying cover for multiple targets',
          {
            count: tbTargets.length,
          },
        );
        let originPoint = null;
        try {
          const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
          if (originRec) originPoint = originRec.point;
        } catch (_) {}
        for (const tRef of tbTargets) {
          const tid = this.normalizeTokenRef(tRef);
          const tgt = tid ? tokens.get(tid) : null;
          if (!tgt) continue;
          let state;
          try {
            const key = `${attacker.id}-${tgt.id}`;
            const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
            if (rec?.state) {
              state = rec.state;
              console.debug(
                'PF2E Visioner | onRenderChatMessage saving-throw: using cached placement cover',
                {
                  targetId: tgt.id,
                  state,
                },
              );
            }
          } catch (_) {}
          if (!state) {
            try {
              if (originPoint) {
                state = this._detectCover(originPoint, tgt);
              }
            } catch (_) {}
          }
          if (!state) state = this._detectCover(attacker, tgt);
          try {
            const bonus = getCoverBonusByState(state) || 0;
            console.debug('PF2E Visioner | onRenderChatMessage saving-throw: computed cover', {
              targetId: tgt.id,
              state,
              bonus,
            });
          } catch (_) {}
          try {
            await this.autoCoverSystem.setCoverBetween(attacker, tgt, state, {
              skipEphemeralUpdate: true,
            });
            try {
              Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                observerId: attacker.id,
                targetId: tgt.id,
                state,
              });
            } catch (_) {}
          } catch (e) {
            console.warn(
              'PF2E Visioner | onRenderChatMessage saving-throw: failed to set cover for target',
              tgt?.id,
              e,
            );
          }
        }
        // We've applied cover for all save targets; skip the generic cleanup block
        return;
      }
    } catch (_) {}

    // Only proceed if this user owns the attacking token or is the GM
    if (!attacker.isOwner && !game.user.isGM) return;

    const targetIds = targetId ? [targetId] : this.autoCoverSystem._consumePairs(attackerId);
    if (targetIds.length === 0) return;
    const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
    if (targets.length === 0) return;
    try {
      for (const target of targets) {
        await this.autoCoverSystem.setCoverBetween(attacker, target, 'none', {
          skipEphemeralUpdate: true,
        });
        try {
          Hooks.callAll('pf2e-visioner.coverMapUpdated', {
            observerId: attacker.id,
            targetId: target.id,
            state: 'none',
          });
        } catch (_) {}
        // Remove ephemeral cover effects for this specific attacker
        try {
          const { cleanupCoverEffectsForObserver } = await import('../cover/ephemeral.js');
          await cleanupCoverEffectsForObserver(target, attacker);
        } catch (e) {
          console.warn('PF2E Visioner | Failed to cleanup ephemeral cover effects:', e);
        }
      }
    } catch (_) {}
  }

  /**
   * Handle a check modifiers dialog context
   * @param {Object} dialog - Dialog object
   * @param {Object} ctx - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckDialog(dialog, html) {
    const ctx = dialog?.context || {};
    // ENHANCED: Handle both attack contexts AND saving throw contexts
    const isSavingThrowCtx = ctx?.type === 'saving-throw';
    // Only proceed if this is an attack or saving throw
    if (!isSavingThrowCtx) {
      console.debug(
        'PF2E Visioner | onRenderCheckModifiersDialog: not attack or saving throw context, skipping',
      );
      return;
    }

    let attacker = null;
    let target = null;
    let state = 'none';

    // NEW: Handle saving throw contexts
    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: saving throw context detected', {
      type: ctx.type,
      statistic: ctx.statistic,
      domains: ctx.domains,
      actor: ctx.actor?.name,
    });

    // For saving throws, the actor making the save is the "target" (defender)
    target = ctx.actor?.getActiveTokens?.()?.[0];
    if (!target) {
      console.debug(
        'PF2E Visioner | onRenderCheckModifiersDialog: no target token found for saving throw',
      );
      return;
    }

    // Try to find the attacker (origin of the effect requiring the save)
    // Check recent template origins first
    const templateOrigins = window?.pf2eVisionerTemplateOrigins;
    if (templateOrigins) {
      for (const [tokenId, data] of templateOrigins.entries()) {
        if (data.ts && Date.now() - data.ts < 30000) {
          // 30 second window
          const token = canvas.tokens.get(tokenId);
          if (token && token.id !== target.id) {
            attacker = token;
            console.debug(
              'PF2E Visioner | onRenderCheckModifiersDialog: found attacker from template origin',
              {
                attackerId: attacker.id,
                templateAge: Date.now() - data.ts,
              },
            );
            break;
          }
        }
      }
    }

    // Fallback: controlled token or targeted tokens
    if (!attacker) {
      attacker =
        canvas.tokens.controlled?.[0] || Array.from(game.user.targets)?.[0]?.document?.object;
    }

    if (!attacker) {
      console.debug(
        'PF2E Visioner | onRenderCheckModifiersDialog: no attacker found for saving throw',
      );
      return;
    }

    console.debug(
      'PF2E Visioner | onRenderCheckModifiersDialog: tokens resolved for saving throw',
      {
        attackerId: attacker.id,
        targetId: target.id,
      },
    );

    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Checking for template data', {
      targetId: target?.id,
      targetName: target?.name,
      dialogId: dialog?.id,
    });

    // If we didn't find a match in active templates, try the attacker-based lookup
    if (!state && attacker && target) {
      // Check for cached cover data by attacker-target pair
      const cachedKey = `${attacker.id}-${target.id}`;
      const cachedCover = window?.pf2eVisionerTemplateCoverByTarget?.get?.(cachedKey);

      if (cachedCover) {
        state = cachedCover.state;
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING CACHED COVER DATA', {
          attackerId: attacker.id,
          targetId: target.id,
          state,
          bonus: cachedCover.bonus,
        });
      }
    }

    // If no template data matched, try legacy methods
    if (!state) {
    }

    // Check for area effect traits/options in the context
    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Checking for area effect traits', {
      hasContextTraits: !!ctx?.traits,
      contextTraits: ctx?.traits,
      hasContextOptions: !!ctx?.options,
      contextOptions: ctx?.options,
      contextType: ctx?.type,
      contextStatistic: ctx?.statistic,
      contextDomains: ctx?.domains,
    });

    const isAreaEffect =
      ctx?.traits?.has?.('area') ||
      (Array.isArray(ctx?.traits) && ctx.traits.includes('area')) ||
      (Array.isArray(ctx?.options) && ctx.options.includes('area-effect')) ||
      (ctx?.options?.has && ctx.options.has('area-effect'));

    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Area effect detection result', {
      isAreaEffect,
      hasAreaTrait: ctx?.traits?.has?.('area'),
      hasAreaInTraitsArray: Array.isArray(ctx?.traits) && ctx.traits.includes('area'),
      hasAreaEffectInOptions:
        (Array.isArray(ctx?.options) && ctx.options.includes('area-effect')) ||
        (ctx?.options?.has && ctx.options.has('area-effect')),
    });

    // For area effects with no template data, we still want to calculate cover
    if (!state && isAreaEffect) {
      console.debug(
        'PF2E Visioner | onRenderCheckModifiersDialog: AREA EFFECT DETECTED FROM CONTEXT',
      );

      // Try to use attacker position as proxy origin point
      let originPoint = null;
      if (attacker) {
        originPoint = attacker.center || { x: attacker.x, y: attacker.y };
      }
      // If no attacker, try to use target position as fallback
      else if (target) {
        originPoint = target.center || { x: target.x, y: target.y };
      }

      if (originPoint) {
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING PROXY ORIGIN POINT', {
          x: originPoint.x,
          y: originPoint.y,
          targetId: target.id,
        });

        // Since this is an area effect with no template data, use calculated cover
        if (attacker && target) {
          const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
          state = detectCoverStateForAttack(attacker, target);
        } else if (originPoint && target) {
          const { detectCoverStateFromPoint } = await import('../cover/auto-cover.js');
          state = detectCoverStateFromPoint(originPoint, target);
        }
      }
    }

    // Final fallback - standard calculation
    if (!state && attacker && target) {
      console.debug(
        'PF2E Visioner | onRenderCheckModifiersDialog: FALLBACK TO STANDARD CALCULATION',
      );
      const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
      state = detectCoverStateForAttack(attacker, target);
    }

    // Log final state determination
    console.debug('PF2E Visioner | onRenderCheckModifiersDialog: FINAL COVER STATE', {
      state: state || 'none',
      targetId: target?.id,
      attackerId: attacker?.id,
      dialogId: dialog?.id,
    });

    // CRITICAL: For reflex saves with area effects, automatically inject the cover modifier
    const isReflexSave =
      ctx.statistic === 'reflex' || (Array.isArray(ctx.domains) && ctx.domains.includes('reflex'));

    if (isReflexSave && state !== 'none') {
      const bonus = getCoverBonusByState(state) || 0;
      if (bonus > 0) {
        // Changed from > 1 to > 0 to catch all valid bonuses
        console.debug(
          'PF2E Visioner | onRenderCheckModifiersDialog: injecting cover modifier for reflex save',
          {
            state,
            bonus,
          },
        );

        // Check if cover modifier already exists in the dialog
        const existingMods = dialog?.check?.modifiers || [];
        const hasExistingCover = existingMods.some((m) => m?.slug === 'pf2e-visioner-cover');

        if (!hasExistingCover) {
          // Create and inject the cover modifier directly into the dialog's check object
          let coverModifier;
          try {
            if (game?.pf2e?.Modifier) {
              coverModifier = new game.pf2e.Modifier({
                slug: 'pf2e-visioner-cover',
                label:
                  state === 'greater'
                    ? 'Greater Cover'
                    : state === 'standard'
                      ? 'Cover'
                      : 'Lesser Cover',
                modifier: bonus,
                type: 'circumstance',
              });
            } else {
              coverModifier = {
                slug: 'pf2e-visioner-cover',
                label:
                  state === 'greater'
                    ? 'Greater Cover'
                    : state === 'standard'
                      ? 'Cover'
                      : 'Lesser Cover',
                modifier: bonus,
                type: 'circumstance',
              };
            }

            // Add to the dialog's check modifiers
            if (dialog.check && Array.isArray(dialog.check.modifiers)) {
              dialog.check.modifiers.push(coverModifier);

              // Recalculate the total
              if (typeof dialog.check.calculateTotal === 'function') {
                const rollOptions = new Set(ctx.options || []);
                rollOptions.add('area-effect');
                dialog.check.calculateTotal(rollOptions);
              }

              console.debug(
                'PF2E Visioner | onRenderCheckModifiersDialog: cover modifier injected into dialog check',
                {
                  modifier: coverModifier,
                  totalModifiers: dialog.check.modifiers.length,
                  newTotal: dialog.check.totalModifier,
                },
              );

              // Force the dialog to re-render to show the new modifier
              try {
                dialog.render(false);
                console.debug(
                  'PF2E Visioner | onRenderCheckModifiersDialog: dialog re-rendered with cover modifier',
                );
              } catch (e) {
                console.debug('PF2E Visioner | Dialog re-render failed:', e);
              }
            }
          } catch (e) {
            console.warn('PF2E Visioner | Failed to inject cover modifier into dialog:', e);
          }
        } else {
          console.debug(
            'PF2E Visioner | onRenderCheckModifiersDialog: cover modifier already exists in dialog',
          );
        }
      }

      // Apply cover state between tokens (for both attacks and saves)
      if (attacker && target && state !== 'none') {
        await this.autoCoverSystem.setCoverBetween(attacker, target, state, {
          skipEphemeralUpdate: true,
        });
        try {
          Hooks.callAll('pf2e-visioner.coverMapUpdated', {
            observerId: attacker.id,
            targetId: target.id,
            state,
          });
        } catch (_) {}
        this.autoCoverSystem.recordPair(attacker.id, target.id);
      }

      // Inject cover override UI (GM-only): buttons for None/Lesser/Standard/Greater with icons
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
            // Use appropriate bonus function based on context
            const bonus = getCoverBonusByState(s);
            const isActive = s === current;
            const cfg = COVER_STATES?.[s] || {};
            const iconClass =
              cfg.icon ||
              (s === 'none'
                ? 'fas fa-shield-slash'
                : s === 'lesser'
                  ? 'fa-regular fa-shield'
                  : s === 'standard'
                    ? 'fas fa-shield-alt'
                    : 'fas fa-shield');
            const color = cfg.color || 'inherit';
            const tooltip = `${label}${bonus > 0 ? ` (+${bonus})` : ''}`;
            const btn = $(`
               <button type="button" class="pv-cover-btn" data-state="${s}" title="${tooltip}" data-tooltip="${tooltip}" data-tooltip-direction="UP" aria-label="${tooltip}" style="width:28px; height:28px; padding:0; line-height:0; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:${isActive ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))' : 'transparent'}; color:inherit; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
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
              const oldOverride = dialog._pvCoverOverride;
              dialog._pvCoverOverride = sel;

              console.debug('PF2E Visioner | Cover override button clicked:', {
                selectedState: sel,
                oldOverride,
                newOverride: dialog._pvCoverOverride,
                dialogId: dialog.id,
                dialogTitle: dialog.title,
              });

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
      } catch (_) {}

      // Ensure current roll uses selected (or auto) cover via dialog injection
      try {
        const rollBtnEl = html?.find?.('button.roll')?.[0];
        console.debug('PF2E Visioner | Looking for roll button:', {
          foundButton: !!rollBtnEl,
          buttonId: rollBtnEl?.id,
          alreadyBound: rollBtnEl?.dataset?.pvCoverBind,
          dialogId: dialog.id,
        });

        if (rollBtnEl && !rollBtnEl.dataset?.pvCoverBind) {
          rollBtnEl.dataset.pvCoverBind = '1';
          rollBtnEl.addEventListener(
            'click',
            () => {
              try {
                const dctx = dialog?.context || {};
                const tgt = dctx?.target;
                const tgtActor = tgt?.actor;
                if (!tgtActor) return;
                const chosen = dialog?._pvCoverOverride ?? state ?? 'none';

                console.debug('PF2E Visioner | Roll button clicked with override:', {
                  chosen,
                  dialogOverride: dialog?._pvCoverOverride,
                  dialogId: dialog.id,
                });

                // Store the dialog override for onPreCreateChatMessage to use
                // We'll store it in a temporary global that gets picked up by the message creation
                if (!window.pf2eVisionerDialogOverrides)
                  window.pf2eVisionerDialogOverrides = new Map();
                const attacker = dctx?.actor;
                if (attacker && tgt) {
                  // Get the proper target token ID - try multiple sources
                  const targetTokenId = tgt.id || tgt.token?.id || target?.id;

                  if (targetTokenId) {
                    // Use multiple key formats to ensure compatibility
                    const overrideKeys = [
                      `${attacker.id}-${targetTokenId}`, // actor ID - token ID
                      `${attacker.uuid}-${targetTokenId}`, // actor UUID - token ID (fallback)
                    ];

                    for (const overrideKey of overrideKeys) {
                      window.pf2eVisionerDialogOverrides.set(overrideKey, chosen);
                      console.debug('PF2E Visioner | Stored dialog override:', {
                        key: overrideKey,
                        value: chosen,
                      });
                    }
                  } else {
                    console.warn(
                      'PF2E Visioner | Could not resolve target token ID for dialog override',
                    );
                  }
                }

                const bonus = getCoverBonusByState(chosen) || 0;
                let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                // Always remove any previous Visioner one-shot cover effect to ensure override takes precedence
                items = items.filter(
                  (i) =>
                    !(
                      i?.type === 'effect' &&
                      i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                    ),
                );
                if (bonus > 0) {
                  const label = getCoverLabel(chosen);
                  const img = getCoverImageForState(chosen);

                  // Create appropriate effect based on context
                  const effectRules = [];
                  // For attack/reflex contexts, add AC and reflex bonuses
                  effectRules.push(
                    {
                      key: 'FlatModifier',
                      selector: 'ac',
                      type: 'circumstance',
                      value: bonus,
                    },
                    {
                      key: 'FlatModifier',
                      selector: 'reflex',
                      type: 'circumstance',
                      value: bonus,
                      predicate: ['area-effect'],
                    },
                  );

                  const description = `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`;

                  items.push({
                    name: label,
                    type: 'effect',
                    system: {
                      description: {
                        value: description,
                        gm: '',
                      },
                      rules: effectRules,
                      traits: { otherTags: [], value: [] },
                      level: { value: 1 },
                      duration: { value: -1, unit: 'unlimited' },
                      tokenIcon: { show: false },
                      unidentified: true,
                      start: { value: 0 },
                      badge: null,
                    },
                    img,
                    flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
                  });
                }
                tgt.actor = tgtActor.clone({ items }, { keepId: true });
                const dcObj = dctx.dc;
                if (dcObj?.slug) {
                  const st = tgt.actor.getStatistic(dcObj.slug)?.dc;
                  if (st) {
                    dcObj.value = st.value;
                    dcObj.statistic = st;
                  }
                }
              } catch (_) {}
            },
            true,
          );
        }
      } catch (e) {
        // Add more detailed error logging for better troubleshooting
        // This is a fix for the missing catch/finally error
        console.error('PF2E Visioner | Error in dialog roll button handler:', e);
      }
    }
  }

  /**
   * Handle check roll context
   * @param {Object} check - Check object
   * @param {Object} context - Check context
   * @returns {Promise<Object>} Result with tokens and cover state
   */
  async handleCheckRoll(check, context) {
    const coverInfo = context?._visionerCover;

    // For reflex saves, the actor making the save is the "target" (defender)
    let target = context.actor?.getActiveTokens?.()?.[0];
    if (!target) {
      // Fallback: try to resolve from context
      target = this._resolveTargetFromCtx(context);
      console.debug('PF2E Visioner | 🚨 Using fallback target resolution');
    }

    if (!target) {
      return { success: false };
    }

    // Find the attacker (origin of the area effect) and template data
    let attacker = null;

    // IMPORTANT: If we have an attacker token but no template data or the target is not in the template,
    // handle the alternative detection based on domains and traits
    if (!attacker) {
      // Try to determine if this is an AOE attack from context (area trait, etc.)
      const isAreaEffect =
        context?.traits?.has?.('area') ||
        (Array.isArray(context?.traits) && context.traits.includes('area')) ||
        (Array.isArray(context?.options) && context.options.includes('area-effect'));

      if (isAreaEffect) {
        // Since we know this is an area effect but don't have template data,
        // try to get an attacker token and assume target is valid
        if (!attacker) {
          // Try controlled token or targeted token as fallback
          const controlled = canvas.tokens.controlled?.[0];
          const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;

          attacker = controlled || targeted;
        }

        // Assume the target is in the template since we detected area traits
      } else {
        // Try one more fallback - check if there are any recent templates at all
        // This handles cases where the template data might not have been fully processed yet

        // IMPORTANT: If we have an attacker token but no template data or the target is not in the template,
        // handle the alternative detection based on domains and traits
        if (!attacker) {
          // Try to determine if this is an AOE attack from context (area trait, etc.)
          const isAreaEffect =
            context?.traits?.has?.('area') ||
            (Array.isArray(context?.traits) && context.traits.includes('area')) ||
            (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
            (context?.options?.has && context.options.has('area-effect'));

          if (isAreaEffect) {
            console.debug(
              'PF2E Visioner | ❗ Target might be in template - area effect traits detected',
            );

            // Since we know this is an area effect but don't have template data,
            // try to get an attacker token and assume target is valid
            if (!attacker) {
              // Try controlled token or targeted token as fallback
              const controlled = canvas.tokens.controlled?.[0];
              const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;

              attacker = controlled || targeted;
              console.debug('PF2E Visioner | Using fallback attacker for area effect', {
                attackerId: attacker?.id,
                attackerName: attacker?.name,
              });
            }
          } else {
            console.debug(
              'PF2E Visioner | ❌ Target is not inside any recent template - ABORTING REFLEX SAVE',
            );
            return { success: false };
          }
        }
      }
    }

    // For AOE reflex saves, use the precalculated cover from template data
    let state;

    // If we have an attacker token but no template data, use standard calculation
    if (attacker) {
      // Fallback to normal calculation
      console.debug('PF2E Visioner | ⚠️ FALLBACK: Using standard token-to-token cover calculation');
      const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
      state = detectCoverStateForAttack(attacker, target);
    }
    // Final fallback - check for area effect traits in context
    else {
      // Try to determine if this is an AOE attack from context (area trait, etc.)
      const isAreaEffect =
        context?.traits?.has?.('area') ||
        (Array.isArray(context?.traits) && context.traits.includes('area')) ||
        (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
        (context?.options?.has && context.options.has('area-effect'));

      if (isAreaEffect) {
        console.debug('PF2E Visioner | ❗ Area effect traits detected but no template data found');
        // Try to get attacker from alternative methods
        if (!attacker) {
          const controlled = canvas.tokens.controlled?.[0];
          const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;
          attacker = controlled || targeted;
        }

        if (attacker) {
          // Use standard calculation
          const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
          state = detectCoverStateForAttack(attacker, target);
          console.debug(
            'PF2E Visioner | ⚠️ AREA EFFECT WITH NO TEMPLATE: Using standard calculation',
            {
              attackerId: attacker.id,
              targetId: target.id,
              state,
            },
          );
        }
      }
    }

    // Last resort fallback - if we still don't have a state, try to calculate from context
    if (!state) {
      console.debug(
        'PF2E Visioner | ❗ No cover state determined yet, trying context-based calculation',
      );

      // Try to get any available attacker
      if (!attacker) {
        const controlled = canvas.tokens.controlled?.[0];
        const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;
        attacker = controlled || targeted;
      }

      // If we have an attacker now, try standard calculation
      if (attacker) {
        const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
        state = detectCoverStateForAttack(attacker, target);
        console.debug('PF2E Visioner | 🎯 LAST RESORT: Calculated cover from available attacker', {
          attackerId: attacker.id,
          targetId: target.id,
          state,
        });
      }
    }

    if (!state) {
      console.debug('PF2E Visioner | ❌ No valid cover state could be determined - ABORTING');
      return { success: false };
    }

    // Persist cover info early so it's available for final safety injection
    try {
      const earlyBonus = getCoverBonusByState(state) || 0;
      context._visionerCover = { state, bonus: earlyBonus };
    } catch (e) {
      console.error('PF2E Visioner | Error persisting cover info:', e);
    }

    if (state !== 'none') {
      const bonus = getCoverBonusByState(state) || 0;

      if (bonus > 0) {
        const tgtActor = target.actor;
        const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);

        // Remove any existing one-roll cover effects
        const filteredItems = items.filter(
          (i) =>
            !(i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true),
        );

        const { getCoverLabel, getCoverImageForState } = await import(
          '../../../helpers/cover-helpers.js'
        );
        const label = getCoverLabel(state);
        const img = getCoverImageForState(state);

        // Add the cover effect with rules for both AC and reflex saves
        const coverEffect = {
          name: label,
          type: 'effect',
          system: {
            description: {
              value: `<p>${label}: +${bonus} circumstance bonus to AC and Reflex saves vs area effects.</p>`,
              gm: '',
            },
            rules: [
              {
                key: 'FlatModifier',
                selector: 'ac',
                type: 'circumstance',
                value: bonus,
              },
              {
                key: 'FlatModifier',
                selector: 'reflex',
                type: 'circumstance',
                value: bonus,
                predicate: ['area-effect'],
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
        };

        filteredItems.push(coverEffect);

        // Clone the actor with the temporary cover effect
        const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });

        // Ensure area-effect is in the roll options to trigger the predicate
        if (!context.options) context.options = [];
        // Handle both arrays and Sets for context.options
        if (Array.isArray(context.options)) {
          if (!context.options.includes('area-effect')) {
            context.options.push('area-effect');
          }
        } else if (context.options?.has && !context.options.has('area-effect')) {
          // If it's a Set, we need to convert it to an array to add the option
          context.options = Array.from(context.options);
          context.options.push('area-effect');
        } else if (!context.options) {
          context.options = ['area-effect'];
        }

        // Store computed cover for final pre-roll safety injection
        try {
          context._visionerCover = { state, bonus };
        } catch (_) {}

        // CRITICAL: Mark this reflex save as handled by popup wrapper
        // Use a time-based global flag that doesn't depend on context
        if (!window.pf2eVisionerPopupHandled) window.pf2eVisionerPopupHandled = new Map();
        const reflexSaveKey = `${attacker.id}-${target.id}-reflex`;
        const timestamp = Date.now();
        window.pf2eVisionerPopupHandled.set(reflexSaveKey, timestamp);

        // CRITICAL: Store the original context actor for comparison
        context.actor = clonedActor;

        // IMPORTANT: Rebuild the CheckModifier using the cloned actor's statistic
        try {
          // Decide statistic slug and enforce in context
          let statSlug =
            context?.statistic ||
            (Array.isArray(context?.domains) && context.domains.includes('reflex')
              ? 'reflex'
              : null);
          if (!statSlug) statSlug = 'reflex';
          context.statistic = statSlug;

          // Ensure required domains and options
          const domSet = new Set(Array.isArray(context.domains) ? context.domains : []);
          domSet.add('saving-throw');
          domSet.add(statSlug);
          const optSet = new Set(Array.isArray(context.options) ? context.options : []);
          optSet.add('area-effect');
          context.domains = Array.from(domSet);
          context.options = Array.from(optSet);

          const statObj = context.actor?.getStatistic?.(statSlug);
          // Use the correct method for creating checks in current PF2E system version
          if (statObj?.check?.clone) {
            const rebuildCtx = {
              domains: context.domains,
              options: new Set(context.options),
              type: 'saving-throw',
            };
            const rebuilt = statObj.check.clone(rebuildCtx);

            check = rebuilt;

            // Fallback: if the rebuilt check still doesn't include our cover, inject directly
            try {
              const alreadyHas =
                Array.isArray(check?.modifiers) &&
                check.modifiers.some((m) => m?.slug === 'pf2e-visioner-cover');
              if (!alreadyHas && (bonus || 0) > 0) {
                const label =
                  state === 'greater'
                    ? 'Greater Cover'
                    : state === 'standard'
                      ? 'Cover'
                      : 'Lesser Cover';
                let pf2eMod;
                try {
                  pf2eMod = game?.pf2e?.Modifier
                    ? new game.pf2e.Modifier({
                        slug: 'pf2e-visioner-cover',
                        label,
                        modifier: bonus,
                        type: 'circumstance',
                        predicate: { any: ['area-effect'] },
                      })
                    : {
                        slug: 'pf2e-visioner-cover',
                        label,
                        modifier: bonus,
                        type: 'circumstance',
                        enabled: true,
                      };
                } catch (_) {
                  pf2eMod = {
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                    enabled: true,
                  };
                }
                // Push onto the check's modifiers array if present
                if (Array.isArray(check.modifiers)) check.modifiers.push(pf2eMod);
                console.debug('PF2E Visioner | ✅ Injected cover modifier into check as fallback', {
                  injected: true,
                  modifier: pf2eMod,
                  checkModifierCount: check?.modifiers?.length || 0,
                });
              }
            } catch (injErr) {
              console.debug(
                'PF2E Visioner | ⚠️ Failed fallback injection of cover modifier:',
                injErr,
              );
            }
          }
        } catch (rebuildErr) {
          console.debug(
            'PF2E Visioner | ❌ Failed to rebuild CheckModifier for reflex save:',
            rebuildErr,
          );
        }
      }
      state = coverInfo?.state ?? 'standard';
      // Ensure predicate support
      const optSet = new Set(Array.isArray(context.options) ? context.options : []);
      optSet.add('area-effect');
      context.options = Array.from(optSet);

      // Build PF2E Modifier
      const label =
        state === 'greater'
          ? 'Greater Cover'
          : state === 'standard'
            ? 'Standard Cover'
            : 'Lesser Cover';
      let pf2eMod;
      try {
        pf2eMod = game?.pf2e?.Modifier
          ? new game.pf2e.Modifier({
              slug: 'pf2e-visioner-cover',
              label,
              modifier: bonus,
              type: 'circumstance',
              predicate: ['area-effect'],
            })
          : {
              slug: 'pf2e-visioner-cover',
              label,
              modifier: bonus,
              type: 'circumstance',
              predicate: ['area-effect'],
              enabled: true,
            };
      } catch (_) {
        pf2eMod = {
          slug: 'pf2e-visioner-cover',
          label,
          modifier: bonus,
          type: 'circumstance',
          enabled: true,
        };
      }

      const already = !!(
        check?.modifiers &&
        typeof check.modifiers.some === 'function' &&
        check.modifiers.some((m) => m?.slug === 'pf2e-visioner-cover')
      );
      if (!already && check && typeof check.push === 'function') {
        check.push(pf2eMod);
      } else {
        console.debug('PF2E Visioner | ❌ No cover detected for reflex save', {
          state,
          reason: 'state is none',
        });
      }
    }
  }

  /**
   * Resolve tokens from message data
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Result with attacker, target, and isMultiTarget flag
   * @protected
   */
  async _resolveTokensFromMessage(data) {
    const speakerTokenId = this._normalizeTokenRef(data?.speaker?.token);
    const targetTokenId = this._resolveTargetTokenIdFromData(data);

    // For saving throws, the speaker is the defender (target)
    // Try to determine the real attacker (origin) from context
    const attackerTokenId = this._determineAttackerForSavingThrow(data, speakerTokenId);

    const attacker = this._getToken(attackerTokenId);
    if (!attacker) return { attacker: null, target: null, isMultiTarget: false };

    const target = this._getToken(speakerTokenId);
    const isMultiTarget = !targetTokenId;

    return { attacker, target, isMultiTarget };
  }

  /**
   * Determine attacker for saving throw
   * @param {Object} data - Message data
   * @param {string} speakerTokenId - Speaker token ID
   * @returns {string} Attacker token ID
   * @private
   */
  _determineAttackerForSavingThrow(data, speakerTokenId) {
    if (!data) return speakerTokenId;

    // Try to get origin actor from context
    const ctx = data?.flags?.pf2e?.context || {};
    const originActor = ctx.origin?.actor || ctx.sourceActor || {};
    const originActorId = originActor.id || ctx.actor?.id;

    if (originActorId) {
      // Try to find a token for this actor
      const tokens = canvas.tokens.placeables.filter((t) => t.actor?.id === originActorId);
      if (tokens.length > 0) {
        return tokens[0].id;
      }
    }

    // Try to determine from template
    const templateManager = this.autoCoverSystem.getTemplateManager();
    const originTemplates = [...templateManager._templateData.values()]
      .filter((t) => t.targets && t.targets[speakerTokenId])
      .sort((a, b) => b.timestamp - a.timestamp);

    if (originTemplates.length > 0) {
      return originTemplates[0].creatorId || speakerTokenId;
    }

    return speakerTokenId;
  }

  /**
   * Resolve target token ID from message data
   * @param {Object} data - Message data
   * @returns {string|null}
   * @private
   */
  _resolveTargetTokenIdFromData(data) {
    if (!data) return null;

    // For saving throws, the primary target is in the speaker
    // For multi-target templates, we won't have a specific target
    const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
    if (Array.isArray(tbTargets) && tbTargets.length > 0) {
      // Multi-target case
      return null;
    }

    // Single target case - speaker is the target
    return this._normalizeTokenRef(data?.speaker?.token);
  }

  /**
   * Resolve caster token from saving throw context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveCasterFromSaveCtx(ctx) {
    if (!ctx || !canvas?.tokens?.get) return null;

    // Try to get origin actor from context
    const originActorId = ctx.origin?.actor?.id || ctx.origin?.actorId || ctx.sourceActor?.id;
    if (originActorId) {
      // Try to find a token for this actor
      const tokens = canvas.tokens.placeables.filter((t) => t.actor?.id === originActorId);
      if (tokens.length > 0) {
        return tokens[0];
      }
    }

    // Check for spell source token
    const sourceTokenId = ctx.source?.token?.id || ctx.origin?.token?.id;
    if (sourceTokenId) {
      return canvas.tokens.get(sourceTokenId);
    }

    // Check for template manager data
    const templateManager = this.autoCoverSystem.getTemplateManager();
    if (templateManager) {
      // Find templates that might be associated with this save
      const originTemplates = [...templateManager._templateData.values()].sort(
        (a, b) => b.timestamp - a.timestamp,
      );

      if (originTemplates.length > 0 && originTemplates[0].creatorId) {
        return canvas.tokens.get(originTemplates[0].creatorId);
      }
    }

    // Fallback to controlled token (likely the GM forcing a save)
    if (canvas.tokens.controlled.length === 1) {
      return canvas.tokens.controlled[0];
    }

    return null;
  }

  /**
   * Resolve defender token from saving throw context
   * @param {Object} ctx - Context object
   * @returns {Object|null}
   * @private
   */
  _resolveDefenderFromSaveCtx(ctx) {
    if (!ctx || !canvas?.tokens?.get) return null;

    // Try to get the defending token from context
    const tokenId = ctx.token?.id || ctx.actor?.token?.id;
    if (tokenId) {
      return canvas.tokens.get(tokenId);
    }

    // Fallback to current target
    if (game.user.targets.size === 1) {
      return game.user.targets.first();
    }

    return null;
  }
}
