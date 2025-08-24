/**
 * Auto-cover hooks wrapper (simplified)
 * All cover logic is handled in onPreCreateChatMessage for better maintainability.
 */

import { MODULE_ID } from '../constants.js';
import {
  detectCoverStateForAttack,
  detectCoverStateFromPoint,
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onUpdateToken,
} from '../cover/auto-cover.js';
import {
  isAttackContext,
  resolveAttackerFromCtx,
  resolveTargetFromCtx,
} from '../cover/context-resolution.js';
import { getCoverBonusByState } from '../helpers/cover-helpers.js';

// Cover overrides are now stored in global window objects:
// - window.pf2eVisionerPopupOverrides (from popup)
// - window.pf2eVisionerDialogOverrides (from roll dialog)

export function registerAutoCoverHooks() {
  Hooks.on('preCreateChatMessage', onPreCreateChatMessage);
  Hooks.on('renderChatMessageHTML', onRenderChatMessage);
  Hooks.on('renderCheckModifiersDialog', onRenderCheckModifiersDialog);
  Hooks.on('updateToken', onUpdateToken);

  // Store recent template origins keyed by attacker token id for point-based cover calc
  if (!window.pf2eVisionerTemplateOrigins) window.pf2eVisionerTemplateOrigins = new Map();

  // Capture measured template origin during placement (pre-create)
  Hooks.on('preCreateMeasuredTemplate', (doc, data) => {
    try {
      if (!game.settings.get(MODULE_ID, 'autoCover')) return;
      const x = Number(data?.x ?? doc?.x ?? 0);
      const y = Number(data?.y ?? doc?.y ?? 0);
      // Associate with the user's primary controlled token (best-guess attacker)
      const attacker = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0];
      if (!attacker) return;
      window.pf2eVisionerTemplateOrigins.set(attacker.id, {
        point: { x, y },
        shape: {
          t: String(doc.t || doc.type || 'circle'),
          distance: Number(doc.distance) || 0,
          direction: Number(doc.direction ?? 0),
          angle: Number(doc.angle ?? 90),
        },
        ts: Date.now(),
      });
      console.debug('PF2E Visioner | preCreateMeasuredTemplate: origin set', {
        attacker: attacker.id,
        x,
        y,
      });
    } catch (_) {}
  });

  // Reinforce origin after creation and keep it fresh for a short window
  Hooks.on('createMeasuredTemplate', (doc) => {
    try {
      if (!game.settings.get(MODULE_ID, 'autoCover')) return;
      const x = Number(doc?.x ?? 0);
      const y = Number(doc?.y ?? 0);
      const attacker = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0];
      if (!attacker) return;
      window.pf2eVisionerTemplateOrigins.set(attacker.id, { point: { x, y }, ts: Date.now() });
      console.debug('PF2E Visioner | createMeasuredTemplate: origin reinforced', {
        attacker: attacker.id,
        x,
        y,
      });

      // Cache cover states for currently targeted tokens that are inside the placed template
      try {
        if (!window.pf2eVisionerTemplateCoverByTarget) window.pf2eVisionerTemplateCoverByTarget = new Map();
        // Consider all tokens on scene (not just targeted) as candidates for AoE damage workflows
        const candidates = canvas.tokens.placeables.filter((t) => t?.actor);
        console.debug('PF2E Visioner | createMeasuredTemplate: candidate tokens at placement', {
          count: candidates.length,
          ids: candidates.map((t) => t.id),
        });
        if (candidates.length) {
          // Determine which targeted tokens are inside the template radius/shape
          const radiusFeet = Number(doc.distance) || 0;
          const center = { x, y };
          const tType = String(doc.t || doc.type || 'circle');
          const gridSize = canvas.grid?.size || 100;
          const feetPerSquare = canvas.dimensions?.distance || 5;
          const radiusSquares = radiusFeet / feetPerSquare;
          const radiusWorld = radiusSquares * gridSize;

          const dirDeg = Number(doc.direction ?? 0);
          const halfAngle = Number(doc.angle ?? 90) / 2;
          const norm = (a) => ((a % 360) + 360) % 360;
          const angDist = (a, b) => {
            const d = Math.abs(norm(a) - norm(b));
            return d > 180 ? 360 - d : d;
          };

          const tokensInside = candidates.filter((t) => {
            try {
              const cx = (t.center?.x ?? t.x);
              const cy = (t.center?.y ?? t.y);
              const dx = cx - center.x;
              const dy = cy - center.y;
              const dist = Math.hypot(dx, dy);
              if (dist > radiusWorld + 1) return false;
              if (tType === 'cone') {
                const theta = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
                const delta = angDist(theta, dirDeg);
                return delta <= halfAngle + 0.5; // small tolerance
              }
              // Default: circle-like
              return true;
            } catch (_) {
              return false;
            }
          });
          console.debug('PF2E Visioner | createMeasuredTemplate: tokens inside template', {
            count: tokensInside.length,
            ids: tokensInside.map((t) => t.id),
          });
          for (const tgt of tokensInside) {
            try {
              const state = detectCoverStateFromPoint(center, tgt);
              const key = `${attacker.id}-${tgt.id}`;
              window.pf2eVisionerTemplateCoverByTarget.set(key, {
                state,
                bonus: getCoverBonusByState(state) || 0,
                origin: center,
                ts: Date.now(),
              });
              console.debug('PF2E Visioner | createMeasuredTemplate: cached cover', {
                key,
                state,
                bonus: getCoverBonusByState(state) || 0,
              });
            } catch (_) {}
          }
          // Note: no auto-expiration; entries persist until overwritten or session ends
        }
      } catch (_) {}

      // Ensure any client-side preview overlay is cleaned
      try {
        if (window.pf2eVisionerTemplateOverlay?.graphics) {
          window.pf2eVisionerTemplateOverlay.graphics.destroy(true);
        }
        window.pf2eVisionerTemplateOverlay = null;
        console.debug('PF2E Visioner | createMeasuredTemplate: preview overlay cleaned');
      } catch (_) {}
    } catch (_) {}
  });

  // Simple libWrapper ONLY for popup detection - all other logic in onPreCreateChatMessage
  Hooks.on('pf2e.systemReady', () => {
    if (game.modules.get('lib-wrapper')?.active && typeof libWrapper?.register === 'function') {
      libWrapper.register(
        MODULE_ID,
        'game.pf2e.Check.roll',
        async function coverPopupWrapper(wrapped, check, context = {}, event = null, callback) {
          // CRITICAL DEBUG: Always log entry to verify wrapper is executing
          console.debug('PF2E Visioner | 🔧 POPUP WRAPPER ENTRY', {
            contextType: context?.type,
            contextStatistic: context?.statistic,
            contextDomains: context?.domains,
            contextActor: context?.actor?.name,
            hasCheck: !!check,
            autoCoverEnabled: game?.settings?.get?.(MODULE_ID, 'autoCover')
          });
          
          try {
            // Handle both attack contexts AND reflex save contexts
            const isAttackCtx = game?.settings?.get?.(MODULE_ID, 'autoCover') && isAttackContext(context);
            const isReflexSaveCtx = game?.settings?.get?.(MODULE_ID, 'autoCover') && 
                                   context?.type === 'saving-throw' && 
                                   (context?.statistic === 'reflex' || 
                                    (Array.isArray(context?.domains) && context.domains.includes('reflex')));
            const isStealthCheck = game?.settings?.get?.(MODULE_ID, 'autoCover') && 
                                   context?.type === 'skill-check' && 
                                   (context?.skill === 'stealth' || 
                                    (Array.isArray(context?.domains) && context.domains.includes('stealth')));

            console.debug('PF2E Visioner | 🎯 CONTEXT ANALYSIS', {
              isAttackCtx,
              isReflexSaveCtx,
              isStealthCheck,
              contextType: context?.type,
              contextStatistic: context?.statistic,
              contextDomains: context?.domains,
              isAttackContextResult: isAttackContext ? isAttackContext(context) : 'function not available',
              priorityDecision: isReflexSaveCtx ? 'REFLEX SAVE (priority)' : isAttackCtx ? 'ATTACK' : 'NONE'
            });

            // CRITICAL: Handle reflex saves FIRST since they can also be detected as attack contexts
            if (isReflexSaveCtx) {
              console.debug('PF2E Visioner | 🎯 HANDLING REFLEX SAVE CONTEXT - ENTRY');
              console.debug('PF2E Visioner | Reflex save context detected', {
                type: context.type,
                statistic: context.statistic,
                domains: context.domains,
                actor: context.actor?.name,
                actorId: context.actor?.id,
                hasActor: !!context.actor
              });
              
              // For reflex saves, the actor making the save is the "target" (defender)
              let target = context.actor?.getActiveTokens?.()?.[0];
              if (!target) {
                // Fallback: try to resolve from context
                target = resolveTargetFromCtx(context);
                console.debug('PF2E Visioner | 🚨 Using fallback target resolution');
              }
              
              console.debug('PF2E Visioner | 🎯 TARGET RESOLUTION', {
                target: target?.id,
                targetName: target?.name,
                targetActor: target?.actor?.name,
                hasTarget: !!target
              });
              
              if (!target) {
                console.debug('PF2E Visioner | ❌ No target token found for reflex save - ABORTING');
                return await wrapped(check, context, event, callback);
              }
              
              // Find the attacker (origin of the area effect)
              let attacker = null;
              
              console.debug('PF2E Visioner | 📍 SEARCHING FOR ATTACKER');
              
              // Check recent template origins first (primary method for area effects)
              const templateOrigins = window?.pf2eVisionerTemplateOrigins;
              console.debug('PF2E Visioner | Template origins available:', {
                hasTemplateOrigins: !!templateOrigins,
                templateOriginsSize: templateOrigins?.size || 0,
                templateOrigins: templateOrigins ? Array.from(templateOrigins.entries()).map(([id, data]) => ({
                  tokenId: id,
                  age: Date.now() - (data.ts || 0),
                  hasPoint: !!data.point
                })) : []
              });
              
              if (templateOrigins) {
                for (const [tokenId, data] of templateOrigins.entries()) {
                  const age = Date.now() - (data.ts || 0);
                  console.debug('PF2E Visioner | Checking template origin:', {
                    tokenId,
                    age,
                    isRecent: age < 30000,
                    targetId: target.id
                  });
                  
                  if (data.ts && age < 30000) { // 30 second window
                    const token = canvas.tokens.get(tokenId);
                    console.debug('PF2E Visioner | Template origin token check:', {
                      tokenId,
                      tokenExists: !!token,
                      tokenName: token?.name,
                      isDifferentFromTarget: token && token.id !== target.id
                    });
                    
                    if (token && token.id !== target.id) {
                      attacker = token;
                      console.debug('PF2E Visioner | ✅ Found attacker from template origin', {
                        attackerId: attacker.id,
                        attackerName: attacker.name,
                        templateAge: age
                      });
                      break;
                    }
                  }
                }
              }
              
              // Fallback: controlled token or other methods
              if (!attacker) {
                console.debug('PF2E Visioner | 🔄 Using fallback attacker resolution');
                const controlled = canvas.tokens.controlled?.[0];
                const targeted = Array.from(game.user.targets)?.[0]?.document?.object;
                
                console.debug('PF2E Visioner | Fallback options:', {
                  controlledToken: controlled?.id,
                  targetedToken: targeted?.id
                });
                
                attacker = controlled || targeted;
              }
              
              console.debug('PF2E Visioner | 🎯 FINAL ATTACKER RESOLUTION', {
                attackerId: attacker?.id,
                attackerName: attacker?.name,
                hasAttacker: !!attacker
              });
              
              if (!attacker) {
                console.debug('PF2E Visioner | ❌ No attacker found for reflex save - ABORTING');
                return await wrapped(check, context, event, callback);
              }
              
              console.debug('PF2E Visioner | Reflex save tokens resolved', {
                attackerId: attacker.id,
                targetId: target.id
              });
              
              // Calculate cover state
              console.debug('PF2E Visioner | 📀 CALCULATING COVER STATE');
              
              // CRITICAL DEBUG: Check if attacker and target are the same
              console.debug('PF2E Visioner | 🔍 COVER CALCULATION DEBUG:', {
                attackerId: attacker.id,
                targetId: target.id,
                attackerName: attacker.name,
                targetName: target.name,
                sameToken: attacker.id === target.id,
                reason: attacker.id === target.id ? 'SAME TOKEN - NO COVER POSSIBLE' : 'DIFFERENT TOKENS - COVER POSSIBLE'
              });
              
              if (attacker.id === target.id) {
                console.debug('PF2E Visioner | ⚠️ FIXING SAME TOKEN ISSUE - trying to find real attacker');
                
                // Use the working system's attacker resolution
                const workingSystemAttacker = resolveAttackerFromCtx(context);
                if (workingSystemAttacker && workingSystemAttacker.id !== target.id) {
                  console.debug('PF2E Visioner | ✅ CORRECTED ATTACKER:', {
                    oldAttacker: attacker.id,
                    newAttacker: workingSystemAttacker.id,
                    newAttackerName: workingSystemAttacker.name
                  });
                  attacker = workingSystemAttacker;
                } else {
                  console.debug('PF2E Visioner | ❌ Working system resolution failed, trying context origin');
                  
                  // Try to find attacker from context origin/item
                  let originAttacker = null;
                  if (context?.origin?.actor) {
                    const originActor = context.origin.actor;
                    originAttacker = originActor.getActiveTokens()?.[0];
                    console.debug('PF2E Visioner | Found origin attacker:', {
                      originActorName: originActor.name,
                      originTokenId: originAttacker?.id
                    });
                  } else if (context?.item?.actor) {
                    const itemActor = context.item.actor;
                    originAttacker = itemActor.getActiveTokens()?.[0];
                    console.debug('PF2E Visioner | Found item attacker:', {
                      itemActorName: itemActor.name,
                      itemTokenId: originAttacker?.id
                    });
                  }
                  
                  if (originAttacker && originAttacker.id !== target.id) {
                    console.debug('PF2E Visioner | ✅ CORRECTED ATTACKER FROM ORIGIN:', {
                      oldAttacker: attacker.id,
                      newAttacker: originAttacker.id,
                      newAttackerName: originAttacker.name
                    });
                    attacker = originAttacker;
                  } else {
                    console.debug('PF2E Visioner | ❌ Origin method failed, trying controlled tokens');
                    
                    // Find any controlled token that's not the target
                    const controlled = canvas.tokens.controlled.find(t => t.id !== target.id);
                    if (controlled) {
                      console.debug('PF2E Visioner | ✅ USING CONTROLLED TOKEN AS ATTACKER:', {
                        controlledId: controlled.id,
                        controlledName: controlled.name
                      });
                      attacker = controlled;
                    } else {
                      console.debug('PF2E Visioner | ❌ All methods failed - will use same token (no cover expected)');
                    }
                  }
                }
              }
              
              const state = detectCoverStateForAttack(attacker, target);
              console.debug('PF2E Visioner | Computed cover state for reflex save', { 
                state,
                attackerId: attacker.id,
                targetId: target.id,
                finalAttackerName: attacker.name,
                finalTargetName: target.name
              });
              // Persist cover info early so it's available for final safety injection
              try {
                const earlyBonus = getCoverBonusByState(state) || 0;
                context._visionerCover = { state, bonus: earlyBonus };
              } catch (_) {}
              
              if (state !== 'none') {
                const bonus = getCoverBonusByState(state) || 0;
                
                console.debug('PF2E Visioner | 🛡️ COVER DETECTED FOR REFLEX SAVE', {
                  state,
                  bonus,
                  targetActor: target.actor.name,
                  willProceedWithCloning: bonus > 0
                });
                
                if (bonus > 0) {
                  console.debug('PF2E Visioner | 🏠 STARTING ACTOR CLONING PROCESS');
                  
                  // CRITICAL: Complete actor cloning implementation
                  console.debug('PF2E Visioner | 🏠 APPLYING COVER VIA ACTOR CLONING', {
                    state,
                    bonus,
                    targetActor: target.actor.name,
                    originalActorId: target.actor.id
                  });
                  
                  const tgtActor = target.actor;
                  const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                  
                  // Remove any existing one-roll cover effects
                  const filteredItems = items.filter(
                    (i) =>
                      !(
                        i?.type === 'effect' &&
                        i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                      ),
                  );
                  
                  console.debug('PF2E Visioner | Items filtered:', {
                    originalCount: items.length,
                    filteredCount: filteredItems.length
                  });
                  
                  const { getCoverLabel, getCoverImageForState } = await import(
                    '../helpers/cover-helpers.js'
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
                  
                  console.debug('PF2E Visioner | 🛡️ Cover effect added:', {
                    effectName: coverEffect.name,
                    totalItems: filteredItems.length,
                    effectRules: coverEffect.system.rules
                  });
                  
                  // Clone the actor with the temporary cover effect
                  const clonedActor = tgtActor.clone(
                    { items: filteredItems },
                    { keepId: true },
                  );
                  
                  console.debug('PF2E Visioner | 🏠 Actor cloned successfully:', {
                    originalActor: tgtActor.name,
                    clonedActor: clonedActor.name,
                    clonedActorId: clonedActor.id,
                    itemsCount: clonedActor.items?.size || 0
                  });
                  
                  // Ensure area-effect is in the roll options to trigger the predicate
                  if (!context.options) context.options = [];
                  if (!context.options.includes('area-effect')) {
                    context.options.push('area-effect');
                  }
                  
                  // Store computed cover for final pre-roll safety injection
                  try { context._visionerCover = { state, bonus }; } catch (_) {}
                  
                  console.debug('PF2E Visioner | ✅ REFLEX SAVE ACTOR CLONING COMPLETE', {
                    originalActor: tgtActor.name,
                    clonedActor: clonedActor.name,
                    effectsCount: filteredItems.filter(i => i.type === 'effect').length,
                    rollOptions: context.options,
                    coverState: state,
                    coverBonus: bonus,
                    finalContextActor: context.actor?.name
                  });
                  
                  // CRITICAL: Mark this reflex save as handled by popup wrapper
                  // Use a time-based global flag that doesn't depend on context
                  if (!window.pf2eVisionerPopupHandled) window.pf2eVisionerPopupHandled = new Map();
                  const reflexSaveKey = `${attacker.id}-${target.id}-reflex`;
                  const timestamp = Date.now();
                  window.pf2eVisionerPopupHandled.set(reflexSaveKey, timestamp);
                  
                  console.debug('PF2E Visioner | 🏷️ REFLEX SAVE MARKED AS HANDLED BY POPUP', {
                    key: reflexSaveKey,
                    timestamp,
                    handledMapSize: window.pf2eVisionerPopupHandled.size
                  });
                  
                  // CRITICAL DEBUG: Verify the cloned actor has the cover effect
                  console.debug('PF2E Visioner | 🔍 VERIFYING CLONED ACTOR EFFECTS:', {
                    clonedActorItems: clonedActor.items?.size || 0,
                    clonedActorEffects: Array.from(clonedActor.items || [])
                      .filter(item => item.type === 'effect')
                      .map(effect => ({
                        name: effect.name,
                        slug: effect.slug || 'no-slug',
                        rules: effect.system?.rules?.length || 0
                      })),
                    contextActorSame: context.actor === clonedActor,
                    contextActorId: context.actor?.id,
                    clonedActorId: clonedActor.id
                  });
                  
                  // CRITICAL DEBUG: Check if the cloned actor's reflex statistic has the modifier
                  try {
                    const reflexStat = clonedActor.getStatistic?.('reflex');
                    if (reflexStat) {
                      console.debug('PF2E Visioner | 🔍 CLONED ACTOR REFLEX STAT:', {
                        baseModifier: reflexStat.mod,
                        totalModifier: reflexStat.totalModifier,
                        modifiers: reflexStat.modifiers?.map(m => ({
                          label: m.label,
                          modifier: m.modifier,
                          type: m.type,
                          slug: m.slug
                        })) || []
                      });
                      
                      // CRITICAL: Try to manually create a roll to verify the modifier shows up
                      try {
                        const testRollOptions = new Set(context.options || []);
                        testRollOptions.add('area-effect');
                        const testCheck = reflexStat.createCheck({ options: Array.from(testRollOptions) });
                        console.debug('PF2E Visioner | 🧪 TEST ROLL WITH CLONED ACTOR:', {
                          checkModifier: testCheck?.modifier,
                          checkModifiers: testCheck?.modifiers?.map(m => ({
                            label: m.label,
                            modifier: m.modifier,
                            type: m.type
                          })) || [],
                          rollOptions: Array.from(testRollOptions)
                        });
                      } catch (testError) {
                        console.debug('PF2E Visioner | ❌ Test roll creation failed:', testError);
                      }
                    } else {
                      console.debug('PF2E Visioner | ❌ Could not get reflex statistic from cloned actor');
                    }
                  } catch (e) {
                    console.debug('PF2E Visioner | ❌ Error checking cloned actor reflex stat:', e);
                  }
                  
                  // CRITICAL: Store the original context actor for comparison
                  const originalContextActor = context.actor;
                  context.actor = clonedActor;
                  
                  console.debug('PF2E Visioner | 🔄 Context actor replaced:', {
                    originalActorName: originalContextActor?.name,
                    newActorName: context.actor?.name,
                    replacementSuccess: context.actor === clonedActor,
                    contextActorId: context.actor?.id,
                    clonedActorId: clonedActor.id,
                    actorsAreIdentical: context.actor === clonedActor
                  });
                  
                  // CRITICAL: Verify the context actor has the effect immediately after replacement
                  try {
                    const contextReflexStat = context.actor.getStatistic?.('reflex');
                    if (contextReflexStat) {
                      console.debug('PF2E Visioner | 🔍 CONTEXT ACTOR REFLEX STAT (after replacement):', {
                        baseModifier: contextReflexStat.mod,
                        totalModifier: contextReflexStat.totalModifier,
                        modifiers: contextReflexStat.modifiers?.map(m => ({
                          label: m.label,
                          modifier: m.modifier,
                          type: m.type,
                          slug: m.slug
                        })) || [],
                        hasAreaEffectOptions: context.options?.includes('area-effect')
                      });
                    }
                  } catch (e) {
                    console.debug('PF2E Visioner | ❌ Error checking context actor reflex stat:', e);
                  }

                  // IMPORTANT: Rebuild the CheckModifier using the cloned actor's statistic
                  try {
                    // Decide statistic slug and enforce in context
                    let statSlug = context?.statistic || (Array.isArray(context?.domains) && context.domains.includes('reflex') ? 'reflex' : null);
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
                    if (statObj?.createCheck) {
                      const rebuildCtx = {
                        domains: context.domains,
                        options: context.options,
                        type: 'saving-throw'
                      };
                      const rebuilt = statObj.createCheck(rebuildCtx);
                      console.debug('PF2E Visioner | ♻️ Rebuilt CheckModifier from cloned actor', {
                        statSlug,
                        oldModifier: check?.modifier,
                        newModifier: rebuilt?.modifier,
                        domains: rebuildCtx.domains,
                        options: rebuildCtx.options
                      });
                      check = rebuilt;

                      // Fallback: if the rebuilt check still doesn't include our cover, inject directly
                      try {
                        const alreadyHas = Array.isArray(check?.modifiers) && check.modifiers.some(m => m?.slug === 'pf2e-visioner-cover');
                        if (!alreadyHas && (bonus || 0) > 0) {
                          const label = state === 'greater' ? 'Greater Cover' : state === 'standard' ? 'Cover' : 'Lesser Cover';
                          let pf2eMod;
                          try {
                            pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                              slug: 'pf2e-visioner-cover',
                              label,
                              modifier: bonus,
                              type: 'circumstance',
                              predicate: { any: ['area-effect'] },
                            }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                          } catch (_) {
                            pf2eMod = { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                          }
                          // Push onto the check's modifiers array if present
                          if (Array.isArray(check.modifiers)) check.modifiers.push(pf2eMod);
                          console.debug('PF2E Visioner | ✅ Injected cover modifier into check as fallback', {
                            injected: true,
                            modifier: pf2eMod,
                            checkModifierCount: check?.modifiers?.length || 0,
                          });
                        } else {
                          console.debug('PF2E Visioner | Cover modifier already present on rebuilt check or no bonus to inject', {
                            alreadyHas,
                            bonus,
                          });
                        }
                      } catch (injErr) {
                        console.debug('PF2E Visioner | ⚠️ Failed fallback injection of cover modifier:', injErr);
                      }
                    } else {
                      console.debug('PF2E Visioner | ⚠️ Could not rebuild CheckModifier: statistic not found', {
                        statSlug: context?.statistic,
                        domains: context?.domains
                      });
                    }
                  } catch (rebuildErr) {
                    console.debug('PF2E Visioner | ❌ Failed to rebuild CheckModifier for reflex save:', rebuildErr);
                  }
                } else {
                  console.debug('PF2E Visioner | ❌ Cover detected but no bonus for reflex save', { 
                    state, 
                    bonus,
                    reason: 'bonus is 0 or negative'
                  });
                }
              } else {
                console.debug('PF2E Visioner | ❌ No cover detected for reflex save', {
                  state,
                  reason: 'state is none'
                });
              }
              
            } else if (isAttackCtx) {
              console.debug('PF2E Visioner | 🎯 HANDLING ATTACK CONTEXT');
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
            } else if (isStealthCheck) {
              console.debug('PF2E Visioner | 🥷 HANDLING STEALTH CHECK');

              // Resolve the hider (actor making the stealth check)
              let hider = context?.actor?.getActiveTokens?.()?.[0] || context?.token?.object || null;
              if (!hider) hider = resolveAttackerFromCtx(context);

              // We don't require a specific observer for stealth cover; consider ANY other token
              console.debug('PF2E Visioner | Stealth participant', {
                hiderId: hider?.id,
                hiderName: hider?.name,
              });

              if (hider && (hider.isOwner || game.user.isGM)) {
                try {
                  // Check for a manual override set by the Check Modifiers dialog
                  let state = null;
                  let isOverride = false;
                  try {
                    const stealthDialog = Object.values(ui.windows).find(
                      (w) => w?.constructor?.name === 'CheckModifiersDialog',
                    );
                    if (stealthDialog?._pvCoverOverride) {
                      state = stealthDialog._pvCoverOverride;
                      isOverride = true;
                    }
                  } catch (_) {}

                  // If not overridden, evaluate cover against all other tokens and pick the best (highest stealth bonus)
                  let candidateStates = [];
                  if (!state) {
                    try {
                      const observers = (canvas?.tokens?.placeables || [])
                        .filter((t) => t && t.actor && t.id !== hider.id);
                      for (const obs of observers) {
                        try {
                          const s = detectCoverStateForAttack(hider, obs);
                          if (s) {
                            candidateStates.push(s) 
                            break;
                          };
                        } catch (_) {}
                      }
                      console.debug('PF2E Visioner | Stealth cover candidates', candidateStates);
                    } catch (_) {}
                    state = candidateStates[0];
                  }

                  const { COVER_STATES } = await import('../constants.js');                  
                  const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

                  try {
                    context._visionerCover = { state, bonus };
                  } catch (_) {}

                  // Persist early for potential downstream usage
                  try { context._visionerStealth = { state, bonus, isOverride, source: isOverride ? 'override' : 'automatic' }; } catch (_) {}
                  // Also store globally for post-roll analyzers (e.g., Hide outcome processing)
                  try {
                    if (typeof window !== 'undefined') {
                      window.pf2eVisionerStealthLast = { state, bonus, ts: Date.now(), isOverride };
                    }
                  } catch (_) {}

                  if (state !== 'none' && bonus > 0) {
                    console.debug('PF2E Visioner | 🥷 Stealth cover detected', { state, bonus });

                    // Prefer adjusting the DC if present (Perception DC of the observer)
                    const dcObj = context?.dc;
                    if (dcObj && typeof dcObj.value === 'number') {
                      const before = dcObj.value;
                      dcObj.value = Math.max(0, Number(dcObj.value) - bonus);
                      try {
                        const labelPrefix = dcObj?.label ? `${dcObj.label}` : 'Perception DC';
                        dcObj.label = `${labelPrefix} (Cover -${bonus})`;
                      } catch (_) {}
                      console.debug('PF2E Visioner | ✅ Reduced Perception DC for stealth', {
                        before,
                        after: dcObj.value,
                        bonus,
                      });
                    } else {
                      // No DC in context: show as an itemized bonus by cloning the hider with a 1-roll effect
                      const tgtActor = hider.actor;
                      const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                      const filteredItems = items.filter(
                        (i) =>
                          !(
                            i?.type === 'effect' &&
                            i?.flags?.['pf2e-visioner']?.ephemeralStealthCoverRoll === true
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
                            value: `<p>${label}: +${bonus} circumstance bonus to Stealth for this roll.</p>`,
                            gm: '',
                          },
                          rules: [
                            {
                              key: 'FlatModifier',
                              selector: 'stealth',
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
                          'pf2e-visioner': { forThisRoll: true, ephemeralStealthCoverRoll: true },
                        },
                      });

                      const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });

                      // Replace context actor to apply the itemized modifier
                      const originalActor = context.actor;
                      context.actor = clonedActor;

                      // Ensure domains include stealth for the check
                      try {
                        const domSet = new Set(Array.isArray(context.domains) ? context.domains : []);
                        domSet.add('skill-check');
                        domSet.add('stealth');
                        context.domains = Array.from(domSet);
                      } catch (_) {}

                      console.debug('PF2E Visioner | ✅ Applied stealth cover via actor cloning', {
                        state,
                        bonus,
                        originalActor: originalActor?.name,
                        clonedActor: clonedActor?.name,
                      });
                    }
                  } else {
                    console.debug('PF2E Visioner | ❌ No cover bonus applicable for stealth', { state, bonus });
                  }
                } catch (e) {
                  console.debug('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
                }
              } else {
                console.debug('PF2E Visioner | ❌ Skipping stealth handling (missing tokens or permissions)', {
                  hasHider: !!hider,
                  hiderOwner: hider?.isOwner,
                  isGM: game.user.isGM,
                });
              }

            } else {
              console.debug('PF2E Visioner | ❎ NOT HANDLING - No matching context', {
                isAttackCtx,
                isReflexSaveCtx,
                contextType: context?.type,
                reason: 'Neither attack nor reflex save context'
              });
            }
          } catch (e) {
            console.warn('PF2E Visioner | ❌ Error in popup wrapper:', e);
          }

          console.debug('PF2E Visioner | 🏁 POPUP WRAPPER CALLING ORIGINAL', {
            contextType: context?.type,
            finalContextActor: context?.actor?.name
          });

          // (Moved earlier) off-guard ephemerals ensured before calculation

          // FINAL REFLEX COVER INJECTION (minimal): push cover modifier into the Check
          try {
            const isReflex = Array.isArray(context?.domains)
              ? context.domains.includes('reflex')
              : context?.statistic === 'reflex' || context?.type === 'saving-throw';
            const coverInfo = context?._visionerCover;
            const isStealthCheck = context?.type === 'skill-check' && context?.domains?.includes('stealth');
            const bonus = Number(coverInfo?.bonus) || 0;
            if (isReflex && bonus > 1 || isStealthCheck && bonus > 1) {
              const state = coverInfo?.state ?? 'standard';
              // Ensure predicate support
              const optSet = new Set(Array.isArray(context.options) ? context.options : []);
              optSet.add('area-effect');
              context.options = Array.from(optSet);

              // Build PF2E Modifier
              const label = state === 'greater' ? 'Greater Cover' : state === 'standard' ? 'Standard Cover' : 'Lesser Cover';
              let pf2eMod;
              try {
                if (isReflex) {
                  pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                    predicate: ['area-effect'],
                  }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', predicate: ['area-effect'], enabled: true };
                } else if (isStealthCheck) {
                  pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                  }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                }
              } catch (_) {
                pf2eMod = { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
              }

              const already = !!(check?.modifiers && typeof check.modifiers.some === 'function' && check.modifiers.some(m => m?.slug === 'pf2e-visioner-cover'));
              if (!already && check && typeof check.push === 'function') {
                check.push(pf2eMod);
              }

              console.debug('PF2E Visioner | ✅ Applied cover to reflex check via push()', { state, bonus });
            }
          } catch (finalErr) {
            console.debug('PF2E Visioner | ⚠️ Minimal reflex injection failed', finalErr);
          }

          return await wrapped(check, context, event, callback);
        },
        'WRAPPER',
      );

      // Wrap template preview to show cover visualization and hide template fill
      try {
        libWrapper.register(
          MODULE_ID,
          'MeasuredTemplate.createPreview',
          function previewWrapper(wrapped, data, options) {
            try {
              // Call original
              const result = wrapped(data, options);

              // Prepare overlay container
              if (!window.pf2eVisionerTemplateOverlay) window.pf2eVisionerTemplateOverlay = {};
              const overlay = (window.pf2eVisionerTemplateOverlay.graphics = new PIXI.Graphics());
              canvas.interface.addChild(overlay);
              console.debug('PF2E Visioner | template preview: overlay created');

              // Helper to safely get the live preview object and center/shape
              const getPreviewState = () => {
                const layer = canvas?.templates;
                const preview = layer?.preview ?? layer?._preview;
                const template = preview?.template ?? preview?.object ?? preview;
                if (!template) return null;
                const cx = Number(template.x ?? template.document?.x ?? data?.x ?? 0);
                const cy = Number(template.y ?? template.document?.y ?? data?.y ?? 0);
                const distance = Number(template.document?.distance ?? data?.distance ?? 0);
                return { template, center: { x: cx, y: cy }, distance };
              };

              // Hide template fill (keep border)
              const tryHideFill = () => {
                try {
                  const state = getPreviewState();
                  if (!state) return;
                  // Many versions expose fill alpha on the primary object
                  if (state.template?.fill) state.template.fill.alpha = 0;
                  if (state.template) state.template.alpha = 1; // ensure visible border
                  console.debug('PF2E Visioner | template preview: hide fill applied');
                } catch (_) {}
              };

              // Color by cover state
              const COVER_COLORS = (game.modules.get(MODULE_ID) && CONFIG?.[MODULE_ID]?.COVER_COLORS) || {
                none: 0x000000, // rendered with very low alpha
                lesser: 0xffeb3b,
                standard: 0xff9800,
                greater: 0xf44336,
              };

              const drawOverlay = () => {
                tryHideFill();
                const state = getPreviewState();
                if (!state) return;

                const overlayG = window.pf2eVisionerTemplateOverlay?.graphics;
                if (!overlayG) return;
                overlayG.clear();

                const attacker = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0];
                if (!attacker) {
                  console.debug('PF2E Visioner | template preview: no attacker token');
                  return;
                }

                // Sample grid squares within the template radius and color by default (none)
                const gridSize = canvas.grid?.size || 100;
                const feetPerSquare = canvas.dimensions?.distance || 5;
                const radiusFeet = Number(state.distance) || 0;
                const radiusSquares = radiusFeet / feetPerSquare;
                const radiusWorld = radiusSquares * gridSize;

                const minX = Math.floor((state.center.x - radiusWorld) / gridSize) * gridSize + gridSize / 2;
                const maxX = Math.ceil((state.center.x + radiusWorld) / gridSize) * gridSize - gridSize / 2;
                const minY = Math.floor((state.center.y - radiusWorld) / gridSize) * gridSize + gridSize / 2;
                const maxY = Math.ceil((state.center.y + radiusWorld) / gridSize) * gridSize - gridSize / 2;

                // Pre-compute tokens within template to compute precise cover for them
                const tokens = canvas.tokens.placeables.filter((t) => t?.actor);
                const tokensInside = tokens.filter((t) => {
                  const dx = (t.center?.x ?? t.x) - state.center.x;
                  const dy = (t.center?.y ?? t.y) - state.center.y;
                  const dist = Math.hypot(dx, dy);
                  return dist <= radiusWorld + 1;
                });
                console.debug('PF2E Visioner | template preview: tokens inside radius', {
                  count: tokensInside.length,
                  ids: tokensInside.map((t) => t.id),
                });

                // Build a map of token id -> cover state
                const perTokenCover = new Map();
                for (const t of tokensInside) {
                  try {
                    const cov = detectCoverStateFromPoint(state.center, t);
                    perTokenCover.set(t.id, cov);
                  } catch (_) {}
                }
                console.debug('PF2E Visioner | template preview: per-token cover computed');

                // Draw every grid square within the radius with a base low-alpha color for 'none'
                const baseColor = COVER_COLORS.none;
                const baseAlpha = 0.08; // subtle background
                const strongAlpha = 0.28; // tokens area highlight

                for (let wx = minX; wx <= maxX; wx += gridSize) {
                  for (let wy = minY; wy <= maxY; wy += gridSize) {
                    const dx = wx - state.center.x;
                    const dy = wy - state.center.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > radiusWorld + 1) continue;

                    // Determine if this square is under a token that's inside
                    let color = baseColor;
                    let alpha = baseAlpha;
                    const tokenHere = tokensInside.find((t) => {
                      const left = t.document.x;
                      const top = t.document.y;
                      const right = left + t.document.width * gridSize;
                      const bottom = top + t.document.height * gridSize;
                      const cx = wx;
                      const cy = wy;
                      return cx >= left && cx <= right && cy >= top && cy <= bottom;
                    });

                    if (tokenHere) {
                      const st = perTokenCover.get(tokenHere.id) || 'none';
                      color = COVER_COLORS[st] ?? baseColor;
                      alpha = strongAlpha;
                    }

                    overlayG.beginFill(color, alpha);
                    overlayG.drawRect(wx - gridSize / 2, wy - gridSize / 2, gridSize, gridSize);
                    overlayG.endFill();
                  }
                }
              };

              // Initial draw and listeners
              drawOverlay();
              const moveHandler = () => drawOverlay();
              canvas.stage.on('pointermove', moveHandler);
              console.debug('PF2E Visioner | template preview: draw + pointermove handler attached');

              // Clean up when preview completes/cancels
              const cleanup = () => {
                try {
                  canvas.stage.off('pointermove', moveHandler);
                } catch (_) {}
                try {
                  if (window.pf2eVisionerTemplateOverlay?.graphics) {
                    window.pf2eVisionerTemplateOverlay.graphics.destroy(true);
                  }
                } catch (_) {}
                window.pf2eVisionerTemplateOverlay = null;
                console.debug('PF2E Visioner | template preview: overlay cleaned');
              };

              // Listen once for placement via createMeasuredTemplate
              const onCreate = (placed) => {
                try {
                  if (placed?.user?.id !== game.userId) return;
                } finally {
                  Hooks.off('createMeasuredTemplate', onCreate);
                  cleanup();
                }
              };
              Hooks.on('createMeasuredTemplate', onCreate);

              // Also attempt to catch cancel by monitoring right-click on stage once
              const cancelHandler = () => {
                canvas.stage.off('rightdown', cancelHandler);
                cleanup();
              };
              canvas.stage.on('rightdown', cancelHandler, { once: true });
              console.debug('PF2E Visioner | template preview: cleanup listeners attached');

              return result;
            } catch (e) {
              console.warn('PF2E Visioner | Template preview wrapper failed:', e);
              return wrapped(data, options);
            }
          },
          'WRAPPER',
        );
      } catch (_) {}
    }
  });

  // Register essential wrapper on ready
  Hooks.once('ready', () => {
    console.debug('PF2E Visioner | Ready hook: module initialization complete');
    // Note: Main wrapper registration is handled in pf2e.systemReady hook above
  });
}
