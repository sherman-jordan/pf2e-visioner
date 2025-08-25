/**
 * Auto-cover core: helpers and hook handlers.
 * Hook registration is done in scripts/hooks/visioner-auto-cover.js
 */

// Debug logger removed
import { COVER_STATES } from '../constants.js';
import {
  getCoverBonusByState,
  getCoverImageForState,
  getCoverLabel,
  getCoverStealthBonusByState,
} from '../helpers/cover-helpers.js';
import {
  distancePointToSegment,
  segmentIntersectsRect
} from '../helpers/geometry-utils.js';
import {
  getTokenRect
} from '../helpers/size-elevation-utils.js';
import { getCoverBetween, setCoverBetween } from '../utils.js';
import {
  isAttackContext,
  isAttackLikeMessageData,
  normalizeTokenRef,
  resolveAttackerFromCtx,
  resolveTargetFromCtx,
  resolveTargetTokenIdFromData,
} from './context-resolution.js';
import {
  evaluateCoverBy3DSampling,
  evaluateCoverByCoverage,
  evaluateCoverBySize,
  evaluateCoverByTactical,
} from './cover-evaluation.js';
import {
  getAutoCoverFilterSettings,
  getIntersectionMode,
} from './settings-config.js';
import {
  getEligibleBlockingTokens,
} from './token-filtering.js';
import {
  evaluateWallsCover
} from './wall-detection.js';












// Track attacker→target pairs for cleanup when the final message lacks target info
const _activePairsByAttacker = new Map(); // attackerId -> Set<targetId>

// Track override information temporarily until message is created
export const _pendingOverrides = new Map(); // messageId -> overrideData
export function _recordPair(attackerId, targetId) {
  if (!attackerId || !targetId) return;
  let set = _activePairsByAttacker.get(attackerId);
  if (!set) {
    set = new Set();
    _activePairsByAttacker.set(attackerId, set);
  }
  set.add(targetId);
}
export function _consumePairs(attackerId) {
  const set = _activePairsByAttacker.get(attackerId);
  if (!set) return [];
  const arr = Array.from(set);
  _activePairsByAttacker.delete(attackerId);
  return arr;
}

function _getActivePairsInvolving(tokenId) {
  const pairs = [];
  // As attacker
  const tset = _activePairsByAttacker.get(tokenId);
  if (tset && tset.size > 0) {
    for (const targetId of tset) pairs.push([tokenId, targetId]);
  }
  // As target
  for (const [attackerId, set] of _activePairsByAttacker.entries()) {
    if (set.has(tokenId)) pairs.push([attackerId, tokenId]);
  }
  return pairs;
}



























/**
 * Detect cover using an arbitrary origin point instead of an attacker token.
 * origin: { x:number, y:number }
 */
export function detectCoverStateFromPoint(origin, target, options = {}) {
  try {
    if (!origin || !target) return 'none';

    // Build a minimal attacker-like object with a center at the origin point
    const pseudoAttacker = {
      id: 'template-origin',
      center: { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
      getCenter: () => ({ x: Number(origin.x) || 0, y: Number(origin.y) || 0 }),
      actor: null,
      document: { x: origin.x, y: origin.y, width: 0, height: 0 },
    };

    // Reuse the normal path using the pseudo attacker
    return detectCoverStateForAttack(pseudoAttacker, target, options);
  } catch (_) {
    return 'none';
  }
}



export function detectCoverStateForAttack(attacker, target, options = {}) {
  try {
    if (!attacker || !target) return 'none';

    // Exclude same token (attacker and target are the same)
    if (attacker.id === target.id) return 'none';

    const p1 = attacker.center ?? attacker.getCenter();
    const p2 = target.center ?? target.getCenter();
    // Walls
    const wallCover = evaluateWallsCover(p1, p2);

    // Token blockers
    const intersectionMode = getIntersectionMode();
    const filters = { ...getAutoCoverFilterSettings(attacker), ...options.filterOverrides };
    let blockers = getEligibleBlockingTokens(attacker, target, filters);

    // Strict center-to-center: only consider blockers that the exact center-to-center ray intersects,
    // and prefer the one whose center is closest to the ray if multiple.
    if (intersectionMode === 'center') {
      try {
        const candidates = [];
        for (const b of blockers) {
          const rect = getTokenRect(b);
          if (segmentIntersectsRect(p1, p2, rect)) {
            const cx = (rect.x1 + rect.x2) / 2;
            const cy = (rect.y1 + rect.y2) / 2;
            const dist = distancePointToSegment({ x: cx, y: cy }, p1, p2);
            candidates.push({ b, dist });
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => a.dist - b.dist);
          blockers = [candidates[0].b];
        } else {
          blockers = [];
        }
      } catch (_) {
        /* ignore */
      }
    }

    const useCoverage = intersectionMode === 'coverage';
    const useTactical = intersectionMode === 'tactical';
    const useSampling3d = intersectionMode === 'sampling3d';

    let tokenCover;
    if (useSampling3d) {
      // For 3D sampling, fetch blockers and slice by Z ourselves
      tokenCover = evaluateCoverBy3DSampling(attacker, target, blockers);
    } else if (useTactical) {
      tokenCover = evaluateCoverByTactical(attacker, target, blockers);
    } else if (useCoverage) {
      tokenCover = evaluateCoverByCoverage(p1, p2, blockers);
    } else {
      tokenCover = evaluateCoverBySize(attacker, target, p1, p2, blockers, intersectionMode);
    }

    if (wallCover === 'standard') {
      const res = tokenCover === 'greater' ? 'greater' : 'standard';
      return res;
    }
    return tokenCover;
  } catch (_) {
    return 'none';
  }
}







// ----- hook handlers (used by hooks/visioner-auto-cover.js)
export async function onPreCreateChatMessage(doc, data) {
  try {
    if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
    
    // CRITICAL: Check if this message was already handled by popup wrapper
    const ctx = data?.flags?.pf2e?.context || {};
    const ctxType = ctx?.type || '';
    
    // For reflex saves, check if popup wrapper handled it recently
    if (ctxType === 'saving-throw') {
      const speakerTokenId = normalizeTokenRef(data?.speaker?.token);
      const targetTokenId = resolveTargetTokenIdFromData(data);
      
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
    }
    
    const attackLike = isAttackLikeMessageData(data);
    if (!attackLike) {
      try {
        const type = ctxType || '(none)';
        const traits = ctx?.traits;
        console.debug('PF2E Visioner | onPreCreateChatMessage: non-attack-like message skipped', {
          type,
          traits,
          hasAreaTrait: Array.isArray(traits) ? traits.includes('area') : typeof traits?.has === 'function' && traits.has('area'),
        });
      } catch (_) {}
      return;
    }

    const speakerTokenId = normalizeTokenRef(data?.speaker?.token);
    const targetTokenId = resolveTargetTokenIdFromData(data);
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
    } catch (_) {}

    const tokens = canvas?.tokens;
    if (!tokens?.get) return;

    // Determine attacker differently for saving throws: the speaker is the defender
    let attackerSource = 'speaker';
    let attackerTokenId = speakerTokenId;
    if (ctxType === 'saving-throw') {
      // 1) PF2E context.origin.token (preferred for system saves)
      try {
        const ctxOriginToken = data?.flags?.pf2e?.context?.origin?.token;
        const normalizedCtx = ctxOriginToken ? normalizeTokenRef(ctxOriginToken) : null;
        if (normalizedCtx) {
          attackerSource = 'pf2e.context.origin.token';
          attackerTokenId = normalizedCtx;
        }
      } catch (_) {}
      // 1b) PF2E origin.token (top-level)
      if (attackerSource === 'speaker') {
        try {
          const originToken = data?.flags?.pf2e?.origin?.token;
          const normalized = originToken ? normalizeTokenRef(originToken) : null;
          if (normalized) {
            attackerSource = 'pf2e.origin.token';
            attackerTokenId = normalized;
          }
        } catch (_) {}
      }
      // 1c) PF2E origin.uuid (extract Token segment if present)
      if (attackerSource === 'speaker') {
        try {
          const originUUID = data?.flags?.pf2e?.origin?.uuid;
          const normalized = originUUID ? normalizeTokenRef(originUUID) : null;
          if (normalized) {
            attackerSource = 'pf2e.origin.uuid';
            attackerTokenId = normalized;
          }
        } catch (_) {}
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
        } catch (_) {}
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
        } catch (_) {}
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
    } catch (_) {}

    // Handle area damage with multiple targets (no single target in PF2E flags)
    if (!targetTokenId && ctxType === 'damage-roll') {
      let tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
      // If toolbelt didn't attach targets yet, try our recent cache from template placement
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
        console.debug('PF2E Visioner | damage-roll: no targets found (pf2e/pf2e-toolbelt/cache)');
        return;
      }
      console.debug('PF2E Visioner | damage-roll: applying cover for multiple targets', {
        count: tbTargets.length,
      });
      let originPoint = null;
      try {
        const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
        if (originRec) {
          originPoint = originRec.point;
          console.debug('PF2E Visioner | damage-roll: found recent template origin', {
            origin: originPoint,
            tsAgeMs: Date.now() - (originRec?.ts || 0),
          });
        }
      } catch (_) {}
      for (const tRef of tbTargets) {
        const tid = normalizeTokenRef(tRef);
        const tgt = tid ? tokens.get(tid) : null;
        if (!tgt) continue;
        let state;
        // Prefer cached placement cover state if available
        try {
          const key = `${attacker.id}-${tgt.id}`;
          const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
          if (rec?.state) {
            state = rec.state;
            console.debug('PF2E Visioner | damage-roll: using cached placement cover', { targetId: tgt.id, state, bonus: rec?.bonus, origin: rec?.origin });
          }
        } catch (_) {}
        // Fallback: compute from stored origin or attacker center
        if (!state) {
          try {
            if (originPoint) {
              console.debug('PF2E Visioner | damage-roll: using template origin for target', {
                targetId: tgt.id,
                origin: originPoint,
              });
              state = detectCoverStateFromPoint(originPoint, tgt);
            }
          } catch (_) {}
        }
        if (!state) state = detectCoverStateForAttack(attacker, tgt);
        // Log computed cover with bonus
        try {
          const { getCoverBonusByState } = await import('../helpers/cover-helpers.js');
          const bonus = getCoverBonusByState(state) || 0;
          console.debug('PF2E Visioner | damage-roll: computed cover', {
            targetId: tgt.id,
            state,
            bonus,
          });
        } catch (_) {}
        // Apply without ephemeral update; damage messages are not attack checks
        try {
          await setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
          console.debug('PF2E Visioner | damage-roll: setCoverBetween applied', {
            attackerId: attacker.id,
            targetId: tgt.id,
            state,
          });
          try {
            Hooks.callAll('pf2e-visioner.coverMapUpdated', {
              observerId: attacker.id,
              targetId: tgt.id,
              state,
            });
          } catch (_) {}
        } catch (e) {
          console.warn('PF2E Visioner | damage-roll: failed to set cover for target', tgt?.id, e);
        }
      }
      // We handled multi-target damage here; stop further single-target flow
      return;
    }

    // Handle saving-throw with multiple targets (pf2e-toolbelt group save buttons)
    if (!targetTokenId && ctxType === 'saving-throw') {
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
        } catch (_) {}
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
      } catch (_) {}
      for (const tRef of tbTargets) {
        const tid = normalizeTokenRef(tRef);
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
        } catch (_) {}
        // Fallback: compute from stored origin or attacker center
        if (!state) {
          try {
            if (originPoint) {
              console.debug('PF2E Visioner | saving-throw: using template origin for target', {
                targetId: tgt.id,
                origin: originPoint,
              });
              state = detectCoverStateFromPoint(originPoint, tgt);
            }
          } catch (_) {}
        }
        if (!state) state = detectCoverStateForAttack(attacker, tgt);
        // Apply without ephemeral update; ephemeral bonuses are handled by the roll wrapper
        try {
          await setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
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
          } catch (_) {}
        } catch (e) {
          console.warn('PF2E Visioner | saving-throw: failed to set cover for target', tgt?.id, e);
        }
      }
      // We handled multi-target saves here; stop further single-target flow
      return;
    }

    const target = tokens.get(targetTokenId);
    if (!target) return;
    console.debug('PF2E Visioner | onPreCreateChatMessage: attacker/target resolved', {
      attackerId: attacker?.id,
      targetId: target?.id,
    });

    // Guard: if attacker and defender are the same on a saving throw, try alternate resolution once
    if (ctxType === 'saving-throw' && attacker?.id === target?.id) {
      console.warn('PF2E Visioner | saving-throw: attacker and defender identical; attempting alternate attacker resolution');
      // Try latest template origin as a last resort
      try {
        const entries = Array.from(window?.pf2eVisionerTemplateOrigins?.entries?.() || []);
        if (entries.length) {
          entries.sort((a, b) => (b?.[1]?.ts || 0) - (a?.[1]?.ts || 0));
          const candidateId = entries[0]?.[0];
          const alt = candidateId ? tokens.get(candidateId) : null;
          if (alt && alt.id !== target.id) {
            attacker = alt;
            console.debug('PF2E Visioner | saving-throw: attacker replaced by latest template origin', {
              attackerId: attacker.id,
            });
          }
        }
      } catch (_) {}
    }

    // Only proceed if this user owns the attacking token or is the GM
    if (!attacker.isOwner && !game.user.isGM) {
      console.debug('PF2E Visioner | onPreCreateChatMessage: skipped (no ownership and not GM)', {
        attackerId: attacker.id,
        userIsGM: game.user.isGM,
      });
      return;
    }

    // Detect base cover state
    let state;
    
    // For saving throws, first check our dedicated template data map (preferred source)
    if (ctxType === 'saving-throw') {
      try {
        const savedTemplateData = window?.pf2eVisionerTemplateData;
        
        if (savedTemplateData && savedTemplateData.size > 0 && target) {
          console.debug('PF2E Visioner | onPreCreateChatMessage: Checking template data for saving throw', {
            templateCount: savedTemplateData.size,
            targetId: target.id
          });
          
          // Find the most recent template that contains this target
          let mostRecentTemplate = null;
          let mostRecentTs = 0;
          
          for (const [id, data] of savedTemplateData.entries()) {
            // Check if this target is in the template's targets
            if (data.targets && data.targets[target.id]) {
              // Found a match - check if it's the most recent
              if (data.timestamp > mostRecentTs) {
                mostRecentTemplate = { id, data };
                mostRecentTs = data.timestamp;
              }
            }
          }
          
          if (mostRecentTemplate) {
            const { id, data } = mostRecentTemplate;
            
            // Use precalculated cover
            if (data.targets[target.id]) {
              state = data.targets[target.id].state;
              
              console.debug('PF2E Visioner | onPreCreateChatMessage: USING PRECALCULATED COVER FROM TEMPLATE', {
                templateId: id,
                templateAge: Date.now() - data.timestamp,
                targetId: target.id,
                state,
                bonus: data.targets[target.id].bonus
              });
            }
          }
        }
      } catch (e) {
        console.debug('PF2E Visioner | onPreCreateChatMessage: Error checking template data for saving throw', e);
      }
    }
    
    // If a stored template origin was recorded for this attacker, prefer using that point
    try {
      const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
      if (originRec && !state) { // Only use this if we haven't already determined state from template data
        console.debug('PF2E Visioner | onPreCreateChatMessage: using template origin', {
          origin: originRec.point,
        });
        state = detectCoverStateFromPoint(originRec.point, target);
      }
    } catch (_) {}
    
    if (!state) {
      console.debug('PF2E Visioner | onPreCreateChatMessage: using attacker center for cover');
      try {
        const current = getCoverBetween?.(attacker, target);
        console.debug('PF2E Visioner | onPreCreateChatMessage: current stored cover before compute', { current });
      } catch (_) {}
      state = detectCoverStateForAttack(attacker, target);
      try {
        console.debug('PF2E Visioner | onPreCreateChatMessage: computed state via detectCoverStateForAttack', { state });
      } catch (_) {}
    }
    
    // Reflex save chat-message injection no longer needed; handled by roll wrapper
    // Intentionally left blank here to avoid duplication in message flags
    
    try {
      const { getCoverBonusByState } = await import('../helpers/cover-helpers.js');
      const bonus = getCoverBonusByState(state) || 0;
      console.debug('PF2E Visioner | onPreCreateChatMessage: computed cover', {
        state,
        bonus,
      });
    } catch (_) {}
    const originalDetectedState = state;
    let wasOverridden = false;
    let overrideSource = null;

    // Check for popup override first (stored in global by popup wrapper)
    try {
      if (window.pf2eVisionerPopupOverrides) {
        const overrideKey = `${attacker.id}-${target.id}`;
        const popupOverride = window.pf2eVisionerPopupOverrides.get(overrideKey);
        if (popupOverride !== undefined) {
          if (popupOverride !== originalDetectedState) {
            wasOverridden = true;
            overrideSource = 'popup';
          }
          state = popupOverride;
          // Clear the override after use
          window.pf2eVisionerPopupOverrides.delete(overrideKey);
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to check popup override:', e);
    }

    // Check for roll dialog override (from renderCheckModifiersDialog)
    try {
      if (window.pf2eVisionerDialogOverrides) {
        // Try multiple key formats to handle different contexts
        const possibleKeys = [
          `${attacker.actor.id}-${target.id}`, // actor ID - token ID
          `${attacker.id}-${target.id}`, // token ID - token ID
          `${attacker.actor.id}-${target.actor.id}`, // actor ID - actor ID
          `${attacker.actor.uuid}-${target.id}`, // actor UUID - token ID
        ];

        let dialogOverride = undefined;
        let usedKey = null;

        for (const key of possibleKeys) {
          if (window.pf2eVisionerDialogOverrides.has(key)) {
            dialogOverride = window.pf2eVisionerDialogOverrides.get(key);
            usedKey = key;
            break;
          }
        }

        if (dialogOverride !== undefined) {
          if (dialogOverride !== originalDetectedState) {
            wasOverridden = true;
            overrideSource = 'dialog';
          }
          state = dialogOverride;
          // Clear the override after use
          window.pf2eVisionerDialogOverrides.delete(usedKey);
        }
      }
    } catch (e) {
      console.warn('PF2E Visioner | Failed to check dialog override:', e);
    }

    // Store override information in chat message flags for later display
    if (wasOverridden) {
      try {
        if (!data.flags) data.flags = {};
        if (!data.flags['pf2e-visioner']) data.flags['pf2e-visioner'] = {};
        const overrideData = {
          originalDetected: originalDetectedState,
          finalState: state,
          overrideSource: overrideSource,
          attackerName: attacker.name,
          targetName: target.name,
        };
        data.flags['pf2e-visioner'].coverOverride = overrideData;

        // Store in temporary map as backup in case flags don't persist
        const tempKey = `${attacker.id}-${target.id}-${Date.now()}`;
        _pendingOverrides.set(tempKey, {
          ...overrideData,
          attackerId: attacker.id,
          targetId: target.id,
          timestamp: Date.now(),
        });

        // Also try to update the document directly if it exists
        if (doc && doc.updateSource) {
          try {
            doc.updateSource({ 'flags.pf2e-visioner.coverOverride': overrideData });
          } catch (e) {
            console.warn('PF2E Visioner | Failed to update document source:', e);
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | Failed to store override info in message flags:', e);
      }
    }

    // Apply cover if any
    if (state !== 'none') {
      await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
      try {
        Hooks.callAll('pf2e-visioner.coverMapUpdated', {
          observerId: attacker.id,
          targetId: target.id,
          state,
        });
      } catch (_) {}
      _recordPair(attacker.id, target.id);
    }
  } catch (e) {
    console.warn('PF2E Visioner | Error in onPreCreateChatMessage:', e);
  }
}

export async function onRenderChatMessage(message) {
  // Allow all users to clean up their own effects
  // GM can clean up any effects

  if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
  const data = message?.toObject?.() || {};
  if (!isAttackLikeMessageData(data)) return;
  const attackerIdRaw =
    data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
  const attackerId = normalizeTokenRef(attackerIdRaw);
  const targetId = resolveTargetTokenIdFromData(data);
  if (!attackerId) return;
  const tokens = canvas?.tokens;
  if (!tokens?.get) return;
  const attacker = tokens.get(attackerId);
  if (!attacker) return;

  // Post-create handling for damage rolls: toolbelt targets are available now
  try {
    const ctxType = data?.flags?.pf2e?.context?.type || '';
    if (!targetId && ctxType === 'damage-roll') {
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
        console.debug('PF2E Visioner | onRenderChatMessage damage-roll: no targets (pf2e/pf2e-toolbelt/cache)');
        return;
      }
      console.debug('PF2E Visioner | onRenderChatMessage damage-roll: applying cover for multiple targets', {
        count: tbTargets.length,
      });
      let originPoint = null;
      try {
        const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
        if (originRec) originPoint = originRec.point;
      } catch (_) {}
      for (const tRef of tbTargets) {
        const tid = normalizeTokenRef(tRef);
        const tgt = tid ? tokens.get(tid) : null;
        if (!tgt) continue;
        let state;
        try {
          const key = `${attacker.id}-${tgt.id}`;
          const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
          if (rec?.state) {
            state = rec.state;
            console.debug('PF2E Visioner | onRenderChatMessage damage-roll: using cached placement cover', {
              targetId: tgt.id,
              state,
            });
          }
        } catch (_) {}
        if (!state) {
          try {
            if (originPoint) {
              state = detectCoverStateFromPoint(originPoint, tgt);
            }
          } catch (_) {}
        }
        if (!state) state = detectCoverStateForAttack(attacker, tgt);
        try {
          const bonus = getCoverBonusByState(state) || 0;
          console.debug('PF2E Visioner | onRenderChatMessage damage-roll: computed cover', {
            targetId: tgt.id,
            state,
            bonus,
          });
        } catch (_) {}
        try {
          await setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
          try {
            Hooks.callAll('pf2e-visioner.coverMapUpdated', {
              observerId: attacker.id,
              targetId: tgt.id,
              state,
            });
          } catch (_) {}
        } catch (e) {
          console.warn('PF2E Visioner | onRenderChatMessage damage-roll: failed to set cover for target', tgt?.id, e);
        }
      }
      // We've applied cover for all damage targets; skip the generic cleanup block
      return;
    }
  } catch (_) {}

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
        console.debug('PF2E Visioner | onRenderChatMessage saving-throw: no targets (pf2e/pf2e-toolbelt/cache)');
        return;
      }
      console.debug('PF2E Visioner | onRenderChatMessage saving-throw: applying cover for multiple targets', {
        count: tbTargets.length,
      });
      let originPoint = null;
      try {
        const originRec = window?.pf2eVisionerTemplateOrigins?.get?.(attacker.id);
        if (originRec) originPoint = originRec.point;
      } catch (_) {}
      for (const tRef of tbTargets) {
        const tid = normalizeTokenRef(tRef);
        const tgt = tid ? tokens.get(tid) : null;
        if (!tgt) continue;
        let state;
        try {
          const key = `${attacker.id}-${tgt.id}`;
          const rec = window?.pf2eVisionerTemplateCoverByTarget?.get?.(key);
          if (rec?.state) {
            state = rec.state;
            console.debug('PF2E Visioner | onRenderChatMessage saving-throw: using cached placement cover', {
              targetId: tgt.id,
              state,
            });
          }
        } catch (_) {}
        if (!state) {
          try {
            if (originPoint) {
              state = detectCoverStateFromPoint(originPoint, tgt);
            }
          } catch (_) {}
        }
        if (!state) state = detectCoverStateForAttack(attacker, tgt);
        try {
          const bonus = getCoverBonusByState(state) || 0;
          console.debug('PF2E Visioner | onRenderChatMessage saving-throw: computed cover', {
            targetId: tgt.id,
            state,
            bonus,
          });
        } catch (_) {}
        try {
          await setCoverBetween(attacker, tgt, state, { skipEphemeralUpdate: true });
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

  const targetIds = targetId ? [targetId] : _consumePairs(attackerId);
  if (targetIds.length === 0) return;
  const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t);
  if (targets.length === 0) return;
  try {
    for (const target of targets) {
      await setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
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

export async function onRenderCheckModifiersDialog(dialog, html) {
  try {
    if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
    
    const ctx = dialog?.context ?? {};
    
    // ENHANCED: Handle both attack contexts AND saving throw contexts
    const isAttackCtx = isAttackContext(ctx);
    const isSavingThrowCtx = ctx?.type === 'saving-throw';
    const isStealthCheck = ctx?.type === 'skill-check' && ctx?.domains.includes('stealth');
    // Only proceed if this is an attack or saving throw
    if (!isAttackCtx && !isSavingThrowCtx && !isStealthCheck ) {
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: not attack or saving throw context, skipping');
      return;
    }
    
    let attacker = null;
    let target = null;
    let state = 'none';
    
    if (isAttackCtx) {
      // Original attack logic
      attacker = resolveAttackerFromCtx(ctx);
      target = resolveTargetFromCtx(ctx);
      if (!attacker || !target) return;
      state = detectCoverStateForAttack(attacker, target);
      
    } else if (isStealthCheck) {
      // NEW: Handle stealth check contexts
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: stealth check context detected', {
        type: ctx.type,
        statistic: ctx.statistic,
        domains: ctx.domains,
        actor: ctx.actor?.name
      });
      
      // Resolve hider (actor making the stealth check)
      const hider = ctx?.actor?.getActiveTokens?.()?.[0] || ctx?.token?.object;
      if (!hider) {
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: no hider token found for stealth check');
        return;
      }

      // Find the first observer the hider has cover from
      let bestObserver = null;
      let bestState = 'none';
      let coverOverride = false;
      
      // Check for cover overrides first (similar to hide action)
      // 1. Roll dialog override (highest priority)
      if (dialog?._pvCoverOverride) {
        bestState = dialog._pvCoverOverride;
        coverOverride = true;
        console.debug('PF2E Visioner | Stealth dialog: Found roll dialog override:', {
          coverState: bestState,
          dialogOverride: dialog._pvCoverOverride
        });
      }
      // 2. Global popup/dialog overrides
      else {
        try {
          const observers = (canvas?.tokens?.placeables || [])
            .filter((t) => t && t.actor && t.id !== hider.id);
          
          for (const obs of observers) {
            const overrideKey = `${hider.id}-${obs.id}`;
            
            // Check popup override
            if (window.pf2eVisionerPopupOverrides?.has(overrideKey)) {
              bestState = window.pf2eVisionerPopupOverrides.get(overrideKey);
              bestObserver = obs;
              coverOverride = true;
              console.debug('PF2E Visioner | Stealth dialog: Found popup override:', {
                overrideKey,
                coverState: bestState
              });
              break;
            }
            // Check global dialog override
            else if (window.pf2eVisionerDialogOverrides?.has(overrideKey)) {
              bestState = window.pf2eVisionerDialogOverrides.get(overrideKey);
              bestObserver = obs;
              coverOverride = true;
              console.debug('PF2E Visioner | Stealth dialog: Found global dialog override:', {
                overrideKey,
                coverState: bestState
              });
              break;
            }
          }
        } catch (_) {}
      }
      
      // If no override found, calculate cover automatically
      if (!coverOverride) {
        try {
          const observers = (canvas?.tokens?.placeables || [])
            .filter((t) => t && t.actor && t.id !== hider.id);
          for (const obs of observers) {
            const s = detectCoverStateForAttack(hider, obs);
            if (s && s !== 'none') {
              bestObserver = obs;
              bestState = s;
              break; // first observer with cover
            }
          }
        } catch (_) {}
      }

      attacker = hider;
      target = bestObserver;
      state = bestState;

      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: stealth tokens resolved', {
        hiderId: attacker?.id,
        observerId: target?.id,
        state
      });
      
      if (isStealthCheck && state !== 'none') {
        const bonus = getCoverStealthBonusByState(state) || 0;
        if (bonus > 1) {
          console.debug('PF2E Visioner | onRenderCheckModifiersDialog: injecting cover modifier for stealth check', {
            state,
            bonus
          });
          // Persist for downstream Hide outcome adjustments
          try {
            if (typeof window !== 'undefined') {
              window.pf2eVisionerStealthLast = { state, bonus, ts: Date.now(), source: 'dialog' };
            }
          } catch (_) {}
          
          // Check if cover modifier already exists in the dialog
          const existingMods = dialog?.check?.modifiers || [];
          const hasExistingCover = existingMods.some(m => m?.slug === 'pf2e-visioner-cover');
          
          if (!hasExistingCover) {
            // Create and inject the cover modifier directly into the dialog's check object
            let coverModifier;
            try {
              if (game?.pf2e?.Modifier) {
                coverModifier = new game.pf2e.Modifier({
                  slug: 'pf2e-visioner-cover',
                  label: state === 'greater' ? 'Greater Cover' : 
                         state === 'standard' ? 'Cover' : 'Lesser Cover',
                  modifier: bonus,
                  type: 'circumstance'
                });
              } else {
                coverModifier = {
                  slug: 'pf2e-visioner-cover',
                  label: state === 'greater' ? 'Greater Cover' : 
                         state === 'standard' ? 'Cover' : 'Lesser Cover',
                  modifier: bonus,
                  type: 'circumstance'
                };
              }
              
              // Add to the dialog's check modifiers
              if (dialog.check && Array.isArray(dialog.check.modifiers)) {
                dialog.check.modifiers.push(coverModifier);
                
                // Recalculate the total
                if (typeof dialog.check.calculateTotal === 'function') {
                  const rollOptions = new Set(ctx.options || []);
                  // rollOptions.add('action:hide');
                  // rollOptions.add('action:sneak');
                  // rollOptions.add('avoid-detection');
                  dialog.check.calculateTotal(rollOptions);
                }
                
                console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier injected into dialog check', {
                  modifier: coverModifier,
                  totalModifiers: dialog.check.modifiers.length,
                  newTotal: dialog.check.totalModifier
                });
                
                // Force the dialog to re-render to show the new modifier
                try {
                  dialog.render(false);
                  console.debug('PF2E Visioner | onRenderCheckModifiersDialog: dialog re-rendered with cover modifier');
                } catch (e) {
                  console.debug('PF2E Visioner | Dialog re-render failed:', e);
                }
              }
            } catch (e) {
              console.warn('PF2E Visioner | Failed to inject cover modifier into dialog:', e);
            }
          } else {
            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier already exists in dialog');
          }
        }
      }
    } 
    else if (isSavingThrowCtx) {
      // NEW: Handle saving throw contexts
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: saving throw context detected', {
        type: ctx.type,
        statistic: ctx.statistic,
        domains: ctx.domains,
        actor: ctx.actor?.name
      });
      
      // For saving throws, the actor making the save is the "target" (defender)
      target = ctx.actor?.getActiveTokens?.()?.[0];
      if (!target) {
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: no target token found for saving throw');
        return;
      }
      
      // Try to find the attacker (origin of the effect requiring the save)
      // Check recent template origins first
      const templateOrigins = window?.pf2eVisionerTemplateOrigins;
      if (templateOrigins) {
        for (const [tokenId, data] of templateOrigins.entries()) {
          if (data.ts && (Date.now() - data.ts) < 30000) { // 30 second window
            const token = canvas.tokens.get(tokenId);
            if (token && token.id !== target.id) {
              attacker = token;
              console.debug('PF2E Visioner | onRenderCheckModifiersDialog: found attacker from template origin', {
                attackerId: attacker.id,
                templateAge: Date.now() - data.ts
              });
              break;
            }
          }
        }
      }
      
      // Fallback: controlled token or targeted tokens
      if (!attacker) {
        attacker = canvas.tokens.controlled?.[0] || 
                  Array.from(game.user.targets)?.[0]?.document?.object;
      }
      
      if (!attacker) {
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: no attacker found for saving throw');
        return;
      }
      
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: tokens resolved for saving throw', {
        attackerId: attacker.id,
        targetId: target.id
      });
      
      // Calculate cover for saving throw
      // For AOE reflex saves, use template data and precalculated cover values
      let state;
      let templateId = null;
      let templateData = null;
      let templateOriginPoint = null;
      
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Checking for template data', {
        targetId: target?.id,
        targetName: target?.name,
        dialogId: dialog?.id
      });
      
      // First check our dedicated template data map (preferred source)
      const savedTemplateData = window?.pf2eVisionerTemplateData;
      
      if (savedTemplateData && savedTemplateData.size > 0 && target) {
        // Find the most recent template that contains this target
        let mostRecentTemplate = null;
        let mostRecentTs = 0;
        
        for (const [id, data] of savedTemplateData.entries()) {
          // Check if this target is in the template's targets
          if (data.targets && data.targets[target.id]) {
            // Found a match - check if it's the most recent
            if (data.timestamp > mostRecentTs) {
              mostRecentTemplate = { id, data };
              mostRecentTs = data.timestamp;
            }
          }
        }
        
        if (mostRecentTemplate) {
          const { id, data } = mostRecentTemplate;
          templateId = id;
          templateData = data;
          templateOriginPoint = data.center;
          
          // Use precalculated cover
          if (data.targets[target.id]) {
            state = data.targets[target.id].state;
            
            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING PRECALCULATED COVER', {
              templateId: id,
              templateAge: Date.now() - data.timestamp,
              targetId: target.id,
              state,
              bonus: data.targets[target.id].bonus
            });
          }
        } else {
          // Try one more fallback - check if there are any recent templates at all
          // This handles cases where the template data might not have been fully processed yet
          console.debug('PF2E Visioner | onRenderCheckModifiersDialog: No direct template match, checking recent templates');
          
          // Find the most recent template overall
          let mostRecentTemplate = null;
          let mostRecentTs = 0;
          
          for (const [id, data] of savedTemplateData.entries()) {
            if (data.timestamp > mostRecentTs) {
              mostRecentTemplate = { id, data };
              mostRecentTs = data.timestamp;
            }
          }
          
          if (mostRecentTemplate) {
            const { id, data } = mostRecentTemplate;
            templateId = id;
            templateData = data;
            templateOriginPoint = data.center;
            
            // Try to get the attacker token if creator ID is available
            if (data.creatorId && !data.creatorId.startsWith('actor:')) {
              attacker = canvas.tokens.get(data.creatorId) || null;
            }
            
            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING MOST RECENT TEMPLATE AS FALLBACK', {
              templateId: id,
              templateAge: Date.now() - data.timestamp,
              hasAttacker: !!attacker,
              attackerName: attacker?.name || 'Unknown',
              creatorId: data.creatorId,
              creatorType: data.creatorType
            });
            
            // Calculate cover from template origin point
            if (templateOriginPoint && target) {
              const { detectCoverStateFromPoint } = await import('../cover/auto-cover.js');
              state = detectCoverStateFromPoint(templateOriginPoint, target);
              
              console.debug('PF2E Visioner | onRenderCheckModifiersDialog: CALCULATED COVER FROM TEMPLATE ORIGIN (fallback)', {
                targetId: target.id,
                state,
                originPoint: templateOriginPoint
              });
            }
          }
        }
      }
      
      // If we didn't find a match in active templates, try the attacker-based lookup
      if (!state && attacker && target) {
        // Check for cached cover data by attacker-target pair
        const cachedKey = `${attacker.id}-${target.id}`;
        const cachedCover = window?.pf2eVisionerTemplateCoverByTarget?.get?.(cachedKey);
        
        if (cachedCover) {
          state = cachedCover.state;
          templateOriginPoint = cachedCover.origin;
          console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING CACHED COVER DATA', {
            attackerId: attacker.id,
            targetId: target.id,
            state,
            bonus: cachedCover.bonus
          });
        }
      }
      
      // If no template data matched, try legacy methods
      if (!state) {
        // Try the attacker-based lookup
        if (attacker && target) {
          // Try the old template origins map
          const templateOriginsVar = window?.pf2eVisionerTemplateOrigins;
          if (templateOriginsVar && templateOriginsVar.has(attacker.id)) {
            const originData = templateOriginsVar.get(attacker.id);
            const templateOriginPoint = originData?.point;
            
            if (templateOriginPoint) {
              console.debug('PF2E Visioner | onRenderCheckModifiersDialog: USING LEGACY TEMPLATE DATA', {
                attackerId: attacker.id,
                targetId: target.id
              });
              
              // Calculate cover from template origin point
              const { detectCoverStateFromPoint } = await import('../cover/auto-cover.js');
              state = detectCoverStateFromPoint(templateOriginPoint, target);
            }
          }
        }
      }
      
      // Check for area effect traits/options in the context
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Checking for area effect traits', {
        hasContextTraits: !!ctx?.traits,
        contextTraits: ctx?.traits,
        hasContextOptions: !!ctx?.options,
        contextOptions: ctx?.options,
        contextType: ctx?.type,
        contextStatistic: ctx?.statistic,
        contextDomains: ctx?.domains
      });
      
      const isAreaEffect = (ctx?.traits?.has?.('area') || 
                          Array.isArray(ctx?.traits) && ctx.traits.includes('area')) ||
                         (Array.isArray(ctx?.options) && ctx.options.includes('area-effect')) ||
                         (ctx?.options?.has && ctx.options.has('area-effect'));
      
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: Area effect detection result', {
        isAreaEffect,
        hasAreaTrait: ctx?.traits?.has?.('area'),
        hasAreaInTraitsArray: Array.isArray(ctx?.traits) && ctx.traits.includes('area'),
        hasAreaEffectInOptions: (Array.isArray(ctx?.options) && ctx.options.includes('area-effect')) || 
                               (ctx?.options?.has && ctx.options.has('area-effect'))
      });
      
      // For area effects with no template data, we still want to calculate cover
      if (!state && isAreaEffect) {
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: AREA EFFECT DETECTED FROM CONTEXT');
        
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
            targetId: target.id
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
        console.debug('PF2E Visioner | onRenderCheckModifiersDialog: FALLBACK TO STANDARD CALCULATION');
        const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
        state = detectCoverStateForAttack(attacker, target);
      }
      
      // Log final state determination
      console.debug('PF2E Visioner | onRenderCheckModifiersDialog: FINAL COVER STATE', {
        state: state || 'none',
        targetId: target?.id,
        attackerId: attacker?.id,
        templateId,
        fromTemplateData: !!templateData,
        dialogId: dialog?.id
      });
      
      // CRITICAL: For reflex saves with area effects, automatically inject the cover modifier
      const isReflexSave = ctx.statistic === 'reflex' || 
                          (Array.isArray(ctx.domains) && ctx.domains.includes('reflex'));
      
      if (isReflexSave && state !== 'none') {
        const bonus = getCoverBonusByState(state) || 0;
        if (bonus > 0) { // Changed from > 1 to > 0 to catch all valid bonuses
          console.debug('PF2E Visioner | onRenderCheckModifiersDialog: injecting cover modifier for reflex save', {
            state,
            bonus
          });
          
          // Check if cover modifier already exists in the dialog
          const existingMods = dialog?.check?.modifiers || [];
          const hasExistingCover = existingMods.some(m => m?.slug === 'pf2e-visioner-cover');
          
          if (!hasExistingCover) {
            // Create and inject the cover modifier directly into the dialog's check object
            let coverModifier;
            try {
              if (game?.pf2e?.Modifier) {
                coverModifier = new game.pf2e.Modifier({
                  slug: 'pf2e-visioner-cover',
                  label: state === 'greater' ? 'Greater Cover' : 
                         state === 'standard' ? 'Cover' : 'Lesser Cover',
                  modifier: bonus,
                  type: 'circumstance'
                });
              } else {
                coverModifier = {
                  slug: 'pf2e-visioner-cover',
                  label: state === 'greater' ? 'Greater Cover' : 
                         state === 'standard' ? 'Cover' : 'Lesser Cover',
                  modifier: bonus,
                  type: 'circumstance'
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
                
                console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier injected into dialog check', {
                  modifier: coverModifier,
                  totalModifiers: dialog.check.modifiers.length,
                  newTotal: dialog.check.totalModifier
                });
                
                // Force the dialog to re-render to show the new modifier
                try {
                  dialog.render(false);
                  console.debug('PF2E Visioner | onRenderCheckModifiersDialog: dialog re-rendered with cover modifier');
                } catch (e) {
                  console.debug('PF2E Visioner | Dialog re-render failed:', e);
                }
              }
            } catch (e) {
              console.warn('PF2E Visioner | Failed to inject cover modifier into dialog:', e);
            }
          } else {
            console.debug('PF2E Visioner | onRenderCheckModifiersDialog: cover modifier already exists in dialog');
          }
        }
      }
    }
    
    // Apply cover state between tokens (for both attacks and saves)
    if (attacker && target && state !== 'none') {
      await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
      try {
        Hooks.callAll('pf2e-visioner.coverMapUpdated', {
          observerId: attacker.id,
          targetId: target.id,
          state,
        });
      } catch (_) {}
      _recordPair(attacker.id, target.id);
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
          const bonus = isStealthCheck ? 
            getCoverStealthBonusByState(s) : 
            getCoverBonusByState(s);
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
              isStealthCheck,
              dialogId: dialog.id,
              dialogTitle: dialog.title
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
        isStealthCheck
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
                isStealthCheck,
                dialogId: dialog.id
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
                      isStealthCheck
                    });
                  }
                } else {
                  console.warn(
                    'PF2E Visioner | Could not resolve target token ID for dialog override',
                  );
                }
              }
              
              // For stealth checks, also store a direct override for the hide action
              if (isStealthCheck && chosen !== 'none') {
                // Store with hider->observer relationship for hide action
                const hider = attacker;
                const observers = (canvas?.tokens?.placeables || [])
                  .filter((t) => t && t.actor && t.id !== hider?.getActiveTokens?.()?.[0]?.id);
                
                for (const obs of observers) {
                  const hideActionKey = `${hider?.getActiveTokens?.()?.[0]?.id}-${obs.id}`;
                  window.pf2eVisionerDialogOverrides.set(hideActionKey, chosen);
                  console.debug('PF2E Visioner | Stored hide action override:', {
                    key: hideActionKey,
                    value: chosen,
                    hiderName: hider?.name,
                    observerName: obs.name
                  });
                }
              }

              const bonus = isStealthCheck ? 
                getCoverStealthBonusByState(chosen) : 
                getCoverBonusByState(chosen) || 0;
              let items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
              // Always remove any previous Visioner one-shot cover effect to ensure override takes precedence
              items = items.filter(
                (i) =>
                  !(
                    i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                  ),
              );
              if (bonus > 0) {
                const label = getCoverLabel(chosen);
                const img = getCoverImageForState(chosen);
                
                // Create appropriate effect based on context
                const effectRules = [];
                if (isStealthCheck) {
                  // For stealth checks, add stealth bonus
                  effectRules.push({
                    key: 'FlatModifier',
                    selector: 'stealth',
                    type: 'circumstance',
                    value: bonus,
                  });
                } else {
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
                    }
                  );
                }
                
                const description = isStealthCheck ?
                  `<p>${label}: +${bonus} circumstance bonus to Stealth for this roll.</p>` :
                  `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`;
                
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
  } catch (_) {}
}

// Recalculate active auto-cover pairs when a token moves/resizes during an ongoing attack flow
export async function onUpdateToken(tokenDoc, changes) {
  try {
    // Allow all users to handle token updates for auto-cover, but coordinate to prevent duplicates
    if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
    // Only care about position/size/rotation updates
    const relevant =
      'x' in changes ||
      'y' in changes ||
      'width' in changes ||
      'height' in changes ||
      'rotation' in changes;
    if (!relevant) return;
    const tokenId = tokenDoc?.id;
    if (!tokenId) return;
    const pairs = _getActivePairsInvolving(tokenId);
    if (pairs.length === 0) return;
    const tokens = canvas?.tokens;
    if (!tokens?.get) return;
    for (const [attId, tgtId] of pairs) {
      const attacker = tokens.get(attId);
      const target = tokens.get(tgtId);
      if (!attacker || !target) continue;
      // Movement should clear any pre-applied cover. Re-application occurs only when rolling.
      const state = 'none';
      await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
      try {
        Hooks.callAll('pf2e-visioner.coverMapUpdated', {
          observerId: attacker.id,
          targetId: target.id,
          state,
        });
      } catch (_) {}
    }

    // Additionally, clear any existing cover map entries involving the moved token, even if not in active pairs
    try {
      const moved = tokens.get(tokenId) || tokenDoc?.object;
      if (moved && tokens?.placeables) {
        for (const other of tokens.placeables) {
          if (!other || other.id === moved.id || !other.actor || !moved.actor) continue;
          // moved → other: clear
          try {
            const prevMO = getCoverBetween(moved, other);
            if (prevMO && prevMO !== 'none') {
              await setCoverBetween(moved, other, 'none', { skipEphemeralUpdate: true });
              try {
                Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                  observerId: moved.id,
                  targetId: other.id,
                  state: 'none',
                });
              } catch (_) {}
            }
          } catch (_) {}
          // other → moved: clear
          try {
            const prevOM = getCoverBetween(other, moved);
            if (prevOM && prevOM !== 'none') {
              await setCoverBetween(other, moved, 'none', { skipEphemeralUpdate: true });
              try {
                Hooks.callAll('pf2e-visioner.coverMapUpdated', {
                  observerId: other.id,
                  targetId: moved.id,
                  state: 'none',
                });
              } catch (_) {}
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  } catch (_) {}
}
