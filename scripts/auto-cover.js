/**
 * Automatic cover detection on attack rolls (pre-roll apply, post-roll cleanup)
 */

import { MODULE_ID } from './constants.js';

const SIZE_ORDER = { tiny: 0, sm: 1, small: 1, med: 2, medium: 2, lg: 3, large: 3, huge: 4, grg: 5, gargantuan: 5 };

// Duplicate guard and active sessions for cleanup
const _recent = new Map(); // key: `${attackerId}->${targetId}` -> ts
function _k(a, t) { return `${a}->${t}`; }
function _mark(a, t) { _recent.set(_k(a, t), Date.now()); }
function _wasRecent(a, t, ms = 1500) { const ts = _recent.get(_k(a, t)); return ts && (Date.now() - ts) < ms; }

const _activePairs = new Map(); // key: `${attackerId}->${targetId}` -> { timeoutId }
function _pairKey(attackerId, targetId) { return `${attackerId}->${targetId}`; }
function _normalizeTokenId(idLike) {
  try {
    if (!idLike || typeof idLike !== 'string') return idLike || null;
    // If it's a UUID like Scene.<scene>.Token.<tokenId>[.something]
    const tokenMarker = '.Token.';
    const idx = idLike.indexOf(tokenMarker);
    if (idx !== -1) {
      const rest = idLike.slice(idx + tokenMarker.length);
      const tokenId = rest.split('.')[0];
      return tokenId || idLike;
    }
    // If it looks like a UUID but not token-marked, try Foundry resolver
    if (idLike.includes('.')) {
      const doc = fromUuidSync?.(idLike);
      const tokenId = doc?.id || doc?.token?.id || null;
      if (tokenId) return tokenId;
    }
    return idLike;
  } catch (_) { return idLike; }
}
async function _cleanupPair(attackerId, targetId, reason = 'unknown') {
  try {
    let attacker = canvas.tokens.get(attackerId);
    let target = canvas.tokens.get(targetId);
    // If not found on canvas, try resolving via stored UUIDs
    const key = _pairKey(attackerId, targetId);
    const entry = _activePairs.get(key);
    if (!attacker && entry?.attackerUUID && fromUuidSync) {
      try { const doc = fromUuidSync(entry.attackerUUID); attacker = doc?.object || attacker; } catch (_) { }
    }
    if (!target && entry?.targetUUID && fromUuidSync) {
      try { const doc = fromUuidSync(entry.targetUUID); target = doc?.object || target; } catch (_) { }
    }
    if (attacker && target) {
      // Update cover map (observer -> target) using per-key deletion to ensure persistence
      try {
        const { getCoverMap, clearCoverBetween, setCoverBetween } = await import('./utils.js');
        const before = { ...(getCoverMap(attacker) || {}) };
        await clearCoverBetween(attacker, target);
        const after = { ...(getCoverMap(attacker) || {}) };
        let persisted;
        try { persisted = await attacker.document.getFlag(MODULE_ID, 'cover'); } catch (_) { persisted = undefined; }
        try { Hooks.callAll(`${MODULE_ID}.coverMapUpdated`, { observerId: attacker.id, targetId: target.id, state: 'none' }); } catch (_) { }
      } catch (_) { }
      // Now remove ephemeral/aggregate effects
      const { updateEphemeralCoverEffects } = await import('./cover-ephemeral.js');
      const effectsAll = target.actor?.itemTypes?.effect || [];
      const effBefore = effectsAll.filter(e => e.flags?.[MODULE_ID]?.isEphemeralCover || e.flags?.[MODULE_ID]?.aggregateCover).map(e => ({ id: e.id, name: e.name }));
      await updateEphemeralCoverEffects(target, attacker, 'none', { removeAllEffects: true, force: true });
      let remaining = (target.actor?.itemTypes?.effect || []).filter(e => e.flags?.[MODULE_ID]?.isEphemeralCover || e.flags?.[MODULE_ID]?.aggregateCover);
      // Brute-force fallback: remove any leftover Visioner cover effects
      if (remaining.length) {
        try {
          const ids = remaining.map(e => e.id).filter(id => !!target.actor.items.get(id));
          if (ids.length) await target.actor.deleteEmbeddedDocuments('Item', ids);
        } catch (_) { }
      }
      // Extra safety: remove any AC-cover-like effect tied to this attacker
      try {
        const attackerSig = attacker?.actor?.signature;
        const toDelete = [];
        for (const eff of target.actor?.itemTypes?.effect || []) {
          const rules = eff?.system?.rules || [];
          const hasCoverAC = rules.some(r => r?.key === 'FlatModifier' && r?.selector === 'ac' && (
            String(r?.label || '').toLowerCase().includes('cover') ||
            (Array.isArray(r?.predicate) && r.predicate.some(p => typeof p === 'string' && p.includes('origin:signature:')))
          ));
          const hasAgainstOption = rules.some(r => r?.key === 'RollOption' && (r?.option === `cover-against:${attacker?.id}`));
          const hasOurFlag = !!eff.flags?.[MODULE_ID];
          const hasOurSig = attackerSig && rules.some(r => Array.isArray(r?.predicate) && r.predicate.includes(`origin:signature:${attackerSig}`));
          if (hasCoverAC && (hasAgainstOption || hasOurFlag || hasOurSig)) {
            if (target.actor.items.get(eff.id)) toDelete.push(eff.id);
          }
        }
        if (toDelete.length) {
          try { await target.actor.deleteEmbeddedDocuments('Item', toDelete); } catch (_) { }
        }
      } catch (_) { }

      try {
        const { updateTokenCoverState } = await import('./cover-effects.js');
        updateTokenCoverState(target, 'none', attacker);
      } catch (_) { }
    }
  } catch (e) {
    console.error(`${MODULE_ID}: cleanup error`, e);
  } finally {
    const key = _pairKey(attackerId, targetId);
    const entry = _activePairs.get(key);
    if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    _activePairs.delete(key);
  }
}

function getSizeRank(token) {
  try {
    const v = token?.actor?.system?.traits?.size?.value ?? 'med';
    return SIZE_ORDER[v] ?? 2;
  } catch (_) {
    return 2;
  }
}

function getTokenRect(token) {
  const x1 = token.document.x;
  const y1 = token.document.y;
  const width = token.document.width * canvas.grid.size;
  const height = token.document.height * canvas.grid.size;
  return { x1, y1, x2: x1 + width, y2: y1 + height };
}

function pointInRect(px, py, rect) {
  return px >= rect.x1 && px <= rect.x2 && py >= rect.y1 && py <= rect.y2;
}

function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
  const onSeg = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
  const o1 = o(p1, p2, q1);
  const o2 = o(p1, p2, q2);
  const o3 = o(q1, q2, p1);
  const o4 = o(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true;
  if (o2 === 0 && onSeg(p1, p2, q2)) return true;
  if (o3 === 0 && onSeg(q1, q2, p1)) return true;
  if (o4 === 0 && onSeg(q1, q2, p2)) return true;
  return false;
}

function segmentIntersectsRect(p1, p2, rect) {
  if (pointInRect(p1.x, p1.y, rect) || pointInRect(p2.x, p2.y, rect)) return true;
  const r1 = { x: rect.x1, y: rect.y1 };
  const r2 = { x: rect.x2, y: rect.y1 };
  const r3 = { x: rect.x2, y: rect.y2 };
  const r4 = { x: rect.x1, y: rect.y2 };
  return (
    segmentsIntersect(p1, p2, r1, r2) ||
    segmentsIntersect(p1, p2, r2, r3) ||
    segmentsIntersect(p1, p2, r3, r4) ||
    segmentsIntersect(p1, p2, r4, r1)
  );
}

function detectCoverStateForAttack(attacker, target) {
  try {
    if (!attacker || !target) return 'none';
    const p1 = attacker.center ?? attacker.getCenter();
    const p2 = target.center ?? target.getCenter();
    if (!p1 || !p2) return 'none';
    // Any intersection with a token square => cover.
    // If the blocking token is at least two size categories larger than the attacker => standard cover.
    const attackerRank = getSizeRank(attacker);
    let hasAny = false;
    let grantsStandard = false;
    for (const blocker of canvas.tokens.placeables) {
      if (!blocker?.actor) continue;
      if (blocker === attacker || blocker === target) continue;
      const rect = getTokenRect(blocker);
      if (!segmentIntersectsRect(p1, p2, rect)) continue;
      hasAny = true;
      const blockerRank = getSizeRank(blocker);
      if (blockerRank >= attackerRank + 2) {
        grantsStandard = true;
        break;
      }
    }
    if (!hasAny) return 'none';
    return grantsStandard ? 'standard' : 'lesser';
  } catch (e) {
    return 'none';
  }
}

function isAttackContext(ctx) {
  const type = ctx?.type ?? '';
  const traits = Array.isArray(ctx?.traits) ? ctx.traits : [];
  return type === 'attack-roll' || type === 'spell-attack-roll' || traits.includes('attack');
}

function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {};
  const ctx = flags.context ?? {};
  const type = ctx?.type ?? '';
  const traits = ctx?.traits ?? [];
  if (type === 'attack-roll' || type === 'spell-attack-roll') return true;
  if (Array.isArray(traits) && traits.includes('attack')) return true;
  return false;
}

function resolveAttackerFromCtx(ctx) {
  try {
    // Prefer token object from context
    const tokenObj = ctx?.token?.object || ctx?.token;
    if (tokenObj?.id) return tokenObj; // already a Token
    // If it's a TokenDocument, use its object
    if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
    // Fallbacks by id
    const tokenId = ctx?.token?.id || ctx?.tokenId || ctx?.origin?.tokenId || ctx?.actor?.getActiveTokens?.()?.[0]?.id;
    return tokenId ? canvas.tokens.get(tokenId) : null;
  } catch (_) { return null; }
}

function resolveTargetFromCtx(ctx) {
  try {
    // Prefer token object from context
    const tObj = ctx?.target?.token?.object || ctx?.target?.token;
    if (tObj?.id) return tObj;
    // If target.token is an id string
    const targetId = (typeof ctx?.target?.token === 'string') ? ctx.target.token : (ctx?.target?.tokenId || ctx?.targetTokenId);
    if (targetId) { const byCtx = canvas.tokens.get(targetId); if (byCtx) return byCtx; }
    const t = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]);
    return t || null;
  } catch (_) { return null; }
}

export function registerAutoCoverHooks() {
  // Capture strike clicks early and apply ephemeral cover before PF2E processes the attack
  const handleStrikeClick = async (ev) => {
    if (!game.user.isGM) return;
    const el = ev?.target?.closest?.('[data-action="strike-attack"]');
    if (!el) return;
    // Resolve attacker token: prefer actor from the sheet the click came from
    let attacker = null;
    const appEl = el.closest?.('.app.window-app');
    const appId = appEl?.dataset?.appid ? Number(appEl.dataset.appid) : null;
    const app = appId != null ? ui.windows?.[appId] : null;
    const appActor = app?.actor;
    attacker = appActor?.getActiveTokens?.()[0] || canvas.tokens.controlled?.[0] || null;
    // Resolve target: from user's current targets
    const target = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]) || null;
    if (!attacker || !target) return;
    if (_wasRecent(attacker.id, target.id)) return;

    const state = detectCoverStateForAttack(attacker, target);
    if (state === 'none') return;
    const { updateEphemeralCoverEffects } = await import('./cover-ephemeral.js');
    await updateEphemeralCoverEffects(target, attacker, state, { sticky: true });
    try {
      const { updateTokenCoverState } = await import('./cover-effects.js');
      updateTokenCoverState(target, state, attacker);
    } catch (_) { }
    // Update cover map (observer -> target)
    try {
      const { setCoverBetween, getCoverMap } = await import('./utils.js');
      const before = { ...(getCoverMap(attacker) || {}) };
      await setCoverBetween(attacker, target, state);
      const after = { ...(getCoverMap(attacker) || {}) };
      let persisted;
      try { persisted = await attacker.document.getFlag(MODULE_ID, 'cover'); } catch (_) { persisted = undefined; }
      try { Hooks.callAll(`${MODULE_ID}.coverMapUpdated`, { observerId: attacker.id, targetId: target.id, state }); } catch (_) { }
    } catch (_) { }
    _mark(attacker.id, target.id);
    const key = _pairKey(attacker.id, target.id);
    const prev = _activePairs.get(key);
    if (prev?.timeoutId) clearTimeout(prev.timeoutId);
    const timeoutId = setTimeout(() => _cleanupPair(attacker.id, target.id, 'timeout'), 5000);
    _activePairs.set(key, {
      timeoutId,
      attackerId: attacker.id,
      targetId: target.id,
      attackerUUID: attacker.document?.uuid,
      targetUUID: target.document?.uuid,
    });
  };
  // Use capture phase so we run before PF2E rolls
  document.addEventListener('click', handleStrikeClick, true);

  Hooks.on('renderDamageModifierDialog', async (appOrActor, htmlMaybe, dataMaybe) => {
    // Attempt to resolve the actor/attacker token regardless of signature variant
    const actor = appOrActor?.actor || appOrActor; // app.actor or actor directly
    const attacker = actor?.getActiveTokens?.()?.[0] || null;
    if (attacker) {
      // Cleanup all active pairs for this attacker when the damage dialog opens
      for (const key of Array.from(_activePairs.keys())) {
        const [aid, tid] = key.split('->');
        if (aid === attacker.id) {
          _cleanupPair(aid, tid, 'damage-modifier dialog');
        }
      }
    }
    // Best-effort: if we have an HTML element, bind a one-time click to ensure cleanup
    const html = htmlMaybe?.[0] || htmlMaybe; // jQuery or Element
    if (html && html.addEventListener) {
      html.addEventListener('click', (ev) => {
        try {
          const el = ev.target?.closest?.('[data-action]');
          const action = el?.dataset?.action || '';
          if (!action) return;
          if (attacker) {
            for (const key of Array.from(_activePairs.keys())) {
              const [aid, tid] = key.split('->');
              if (aid === attacker.id) {
                _cleanupPair(aid, tid, 'damage-modifier dialog click');
              }
            }
          }
        } catch (_) { }
      }, { once: true, capture: true });
    }
  });

  // Pre-roll: use PF2E's modifiers dialog to apply ephemeral lesser cover
  Hooks.on('renderCheckModifiersDialog', async (dialog, html) => {
    if (!game.user.isGM) return; // single source
    const ctx = dialog?.context ?? {};
    if (!isAttackContext(ctx)) return;
    const attacker = resolveAttackerFromCtx(ctx);
    const target = resolveTargetFromCtx(ctx);
    if (!attacker || !target) return;
    if (_wasRecent(attacker.id, target.id)) return;

    const state = detectCoverStateForAttack(attacker, target);
    if (state === 'none') return;
    const { updateEphemeralCoverEffects } = await import('./cover-ephemeral.js');
    await updateEphemeralCoverEffects(target, attacker, state, { sticky: true });
    // Update visual indicator immediately (non-mechanical)
    try {
      const { updateTokenCoverState } = await import('./cover-effects.js');
      updateTokenCoverState(target, state, attacker);
    } catch (_) { }
    // Update cover map for dialog path as well
    try {
      const { getCoverMap, setCoverMap } = await import('./utils.js');
      const map = getCoverMap(attacker);
      map[target.document.id] = state;
      await setCoverMap(attacker, map);
    } catch (_) { }

    // Ensure current roll uses cover and hover shows label: inject right before PF2E handles the click
    try {
      const rollBtnEl = html.find('button.roll')[0];
      if (rollBtnEl && !rollBtnEl.dataset?.pvBind) {
        rollBtnEl.dataset.pvBind = '1';
        rollBtnEl.addEventListener('click', () => {
          const dctx = dialog.context || {};
          const tgt = dctx.target; const tgtActor = tgt?.actor;
          if (!tgtActor) return;
          const items = foundry.utils.deepClone(tgtActor._source.items ?? []);
          const isStandard = state === 'standard';
          const labeled = {
            name: isStandard ? 'Standard Cover' : 'Lesser Cover',
            type: 'effect',
            system: {
              description: { value: isStandard ? '<p>+2 circumstance to AC from standard cover.</p>' : '<p>+1 circumstance to AC from lesser cover.</p>', gm: '' },
              rules: [{ key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: isStandard ? 2 : 1, label: isStandard ? 'Standard Cover' : 'Lesser Cover' }],
              traits: { otherTags: [], value: [] }, level: { value: 1 }, duration: { value: -1, unit: 'unlimited' },
              tokenIcon: { show: false }, unidentified: true, start: { value: 0 }, badge: null,
            },
            img: 'systems/pf2e/icons/equipment/shields/buckler.webp', flags: { [MODULE_ID]: { forThisRoll: true } },
          };
          items.push(labeled);
          tgt.actor = tgtActor.clone({ items }, { keepId: true });
          const dcObj = dctx.dc;
          if (dcObj?.slug) {
            const st = tgt.actor.getStatistic(dcObj.slug)?.dc;
            if (st) { dcObj.value = st.value; dcObj.statistic = st; }
          }

        }, true);
      }
    } catch (_) { }

    // We intentionally avoid cloning the target actor or binding the dialog's roll button.
    // Timing is handled by the strike-attack click capture above, which applies cover before the roll.
    _mark(attacker.id, target.id);
    const key = _pairKey(attacker.id, target.id);
    const prev = _activePairs.get(key);
    if (prev?.timeoutId) clearTimeout(prev.timeoutId);
    const timeoutId = setTimeout(() => _cleanupPair(attacker.id, target.id, 'timeout'), 60000);
    _activePairs.set(key, { timeoutId });
  });

  // Post-roll: cleanup when damage/critical buttons are clicked
  Hooks.on('renderChatMessage', (message, html) => {
    // Bind to common PF2E damage/critical buttons on ANY message
    const selector = [
      'button[data-action="strike-damage"]',
      'a[data-action="strike-damage"]',
      'button[data-action="strike-critical"]',
      'a[data-action="strike-critical"]',
      'button[data-action="attack-spell-damage"]',
      'a[data-action="attack-spell-damage"]',
      // Generic patterns to be safe across versions
      '[data-action$="-damage"]',
      '[data-action$="-critical"]',
      '[data-action*="damage"]',
      '[data-action*="critical"]'
    ].join(', ');

    html.on('click', selector, (ev) => {
      // Try to resolve ids at click time from the message context
      const msg = message; // already provided
      const flags = msg?.flags?.pf2e ?? {};
      const ctx = flags.context ?? {};
      let attackerId = _normalizeTokenId(msg?.speaker?.token || ctx?.token?.id || null);
      let targetId = _normalizeTokenId(ctx?.target?.token || ctx?.targets?.[0]?.token || flags?.target?.token || flags?.targets?.[0]?.token || null);

      if (attackerId && targetId) {
        _cleanupPair(attackerId, targetId, 'damage/critical click');
        // Additionally sweep all pairs for this attacker to cover any target-id mismatch
        let swept = false;
        for (const key of Array.from(_activePairs.keys())) {
          const [aid, tid] = key.split('->');
          if (aid === attackerId && tid !== targetId) {
            swept = true;
            _cleanupPair(aid, tid, 'damage/critical click (attacker sweep)');
          }
        }
        return;
      }
      // Fallback 1: by attacker
      if (attackerId) {
        let cleaned = false;
        for (const key of Array.from(_activePairs.keys())) {
          const [aid, tid] = key.split('->');
          if (aid === attackerId) {
            _cleanupPair(aid, tid, 'damage/critical click (fallback by attacker)');
            cleaned = true;
          }
        }
        if (cleaned) return;
      }
      // Fallback 2: clear all active pairs for safety (rare, last resort)
      for (const key of Array.from(_activePairs.keys())) {
        const [aid, tid] = key.split('->');
        _cleanupPair(aid, tid, 'damage/critical click (global fallback)');
      }
    });
  });
}
