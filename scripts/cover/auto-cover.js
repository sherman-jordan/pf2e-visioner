/**
 * Auto-cover core: helpers and hook handlers.
 * Hook registration is done in scripts/hooks/visioner-auto-cover.js
 */

import { MODULE_ID } from "../constants.js";
import { getVisibilityBetween, setCoverBetween } from "../utils.js";

// ----- helpers
function normalizeTokenRef(ref) {
  try {
    if (!ref) return null;
    let s = typeof ref === 'string' ? ref.trim() : String(ref);
    // Strip surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
    // If it's a UUID, extract the final Token.<id> segment
    const m = s.match(/Token\.([^\.\s]+)$/);
    if (m && m[1]) return m[1];
    // Otherwise assume it's already the token id
    return s;
  } catch (_) { return ref; }
}
const SIZE_ORDER = { tiny: 0, sm: 1, small: 1, med: 2, medium: 2, lg: 3, large: 3, huge: 4, grg: 5, gargantuan: 5 };

// Track attacker→target pairs for cleanup when the final message lacks target info
const _activePairsByAttacker = new Map(); // attackerId -> Set<targetId>
export function _recordPair(attackerId, targetId) {
  if (!attackerId || !targetId) return;
  let set = _activePairsByAttacker.get(attackerId);
  if (!set) { set = new Set(); _activePairsByAttacker.set(attackerId, set); }
  set.add(targetId);
}
export function _consumePairs(attackerId) {
  const set = _activePairsByAttacker.get(attackerId);
  if (!set) return [];
  const arr = Array.from(set);
  _activePairsByAttacker.delete(attackerId);
  return arr;
}

export function getSizeRank(token) {
  try { const v = token?.actor?.system?.traits?.size?.value ?? "med"; return SIZE_ORDER[v] ?? 2; } catch (_) { return 2; }
}
function getTokenRect(token) {
  const x1 = token.document.x; const y1 = token.document.y;
  const width = token.document.width * canvas.grid.size; const height = token.document.height * canvas.grid.size;
  return { x1, y1, x2: x1 + width, y2: y1 + height };
}
function getTokenBoundaryPoints(token) {
  try {
    const rect = getTokenRect(token);
    const cx = (rect.x1 + rect.x2) / 2; const cy = (rect.y1 + rect.y2) / 2;
    return [
      { x: rect.x1, y: rect.y1 }, // top-left
      { x: rect.x2, y: rect.y1 }, // top-right
      { x: rect.x2, y: rect.y2 }, // bottom-right
      { x: rect.x1, y: rect.y2 }, // bottom-left
      { x: cx, y: rect.y1 },      // mid-top
      { x: rect.x2, y: cy },      // mid-right
      { x: cx, y: rect.y2 },      // mid-bottom
      { x: rect.x1, y: cy },      // mid-left
      { x: cx, y: cy },           // center
    ];
  } catch (_) {
    const c = token.center ?? token.getCenter?.() ?? { x: 0, y: 0 }; return [c];
  }
}
function pointInRect(px, py, rect) { return px >= rect.x1 && px <= rect.x2 && py >= rect.y1 && py <= rect.y2; }
function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
  const onSeg = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
  const o1 = o(p1, p2, q1); const o2 = o(p1, p2, q2); const o3 = o(q1, q2, p1); const o4 = o(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true;
  if (o2 === 0 && onSeg(p1, p2, q2)) return true;
  if (o3 === 0 && onSeg(q1, q2, p1)) return true;
  if (o4 === 0 && onSeg(q1, q2, p2)) return true;
  return false;
}
function segmentIntersectsRect(p1, p2, rect) {
  if (pointInRect(p1.x, p1.y, rect) || pointInRect(p2.x, p2.y, rect)) return true;
  const r1 = { x: rect.x1, y: rect.y1 }; const r2 = { x: rect.x2, y: rect.y1 }; const r3 = { x: rect.x2, y: rect.y2 }; const r4 = { x: rect.x1, y: rect.y2 };
  return (
    segmentsIntersect(p1, p2, r1, r2) ||
    segmentsIntersect(p1, p2, r2, r3) ||
    segmentsIntersect(p1, p2, r3, r4) ||
    segmentsIntersect(p1, p2, r4, r1)
  );
}

function buildRaysBetweenTokens(attacker, target) {
  const aPts = getTokenBoundaryPoints(attacker);
  const tPts = getTokenBoundaryPoints(target);
  const rays = [];
  for (const ap of aPts) {
    for (const tp of tPts) {
      rays.push([ap, tp]);
    }
  }
  return rays;
}

function segmentIntersectsAnyBlockingWall(p1, p2) {
  try {
    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) return false;
    for (const wall of walls) {
      try {
        const d = wall.document;
        if (!d) continue;
        // Skip open doors; treat closed/locked doors and normal walls as blockers
        const isDoor = Number(d.door) > 0; // 0 none, 1 door, 2 secret (treat as door-like)
        const doorState = Number(d.ds ?? d.doorState ?? 0); // 0 closed/secret, 1 open, 2 locked
        if (isDoor && doorState === 1) continue; // open door → no cover contribution
        const [x1, y1, x2, y2] = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        if ([x1, y1, x2, y2].some((n) => typeof n !== "number")) continue;
        const w1 = { x: x1, y: y1 };
        const w2 = { x: x2, y: y2 };
        if (segmentsIntersect(p1, p2, w1, w2)) return true;
      } catch (_) { /* ignore malformed wall */ }
    }
    return false;
  } catch (_) {
    return false;
  }
}

function anyRayIntersectsAnyBlockingWall(rays) {
  try {
    for (const [p1, p2] of rays) {
      if (segmentIntersectsAnyBlockingWall(p1, p2)) return true;
    }
    return false;
  } catch (_) { return false; }
}

function anyRayIntersectsRect(rays, rect) {
  for (const [p1, p2] of rays) {
    if (segmentIntersectsRect(p1, p2, rect)) return true;
  }
  return false;
}

function crossRayIntersectsRect(rays, rect) {
  // Require one ray to cross both opposite edges either vertically or horizontally
  const top = { x: rect.x1, y: rect.y1 }; const right = { x: rect.x2, y: rect.y1 };
  const bottom = { x: rect.x2, y: rect.y2 }; const left = { x: rect.x1, y: rect.y2 };
  // Edges as segments
  const edges = {
    top: [top, right],
    right: [right, bottom],
    bottom: [bottom, left],
    left: [left, top],
  };
  for (const [p1, p2] of rays) {
    const hits = new Set();
    if (segmentsIntersect(p1, p2, edges.top[0], edges.top[1])) hits.add("top");
    if (segmentsIntersect(p1, p2, edges.bottom[0], edges.bottom[1])) hits.add("bottom");
    if (segmentsIntersect(p1, p2, edges.left[0], edges.left[1])) hits.add("left");
    if (segmentsIntersect(p1, p2, edges.right[0], edges.right[1])) hits.add("right");
    if ((hits.has("top") && hits.has("bottom")) || (hits.has("left") && hits.has("right"))) return true;
  }
  return false;
}

function centerLineIntersectsRect(p1, p2, rect, mode = 'any') {
  const topLeft = { x: rect.x1, y: rect.y1 };
  const topRight = { x: rect.x2, y: rect.y1 };
  const bottomRight = { x: rect.x2, y: rect.y2 };
  const bottomLeft = { x: rect.x1, y: rect.y2 };
  const edges = {
    top: [topLeft, topRight],
    right: [topRight, bottomRight],
    bottom: [bottomRight, bottomLeft],
    left: [bottomLeft, topLeft],
  };
  const hits = new Set();
  if (segmentsIntersect(p1, p2, edges.top[0], edges.top[1])) hits.add('top');
  if (segmentsIntersect(p1, p2, edges.bottom[0], edges.bottom[1])) hits.add('bottom');
  if (segmentsIntersect(p1, p2, edges.left[0], edges.left[1])) hits.add('left');
  if (segmentsIntersect(p1, p2, edges.right[0], edges.right[1])) hits.add('right');
  if (mode === 'cross') return (hits.has('top') && hits.has('bottom')) || (hits.has('left') && hits.has('right'));
  return hits.size > 0;
}

export function detectCoverStateForAttack(attacker, target) {
  try {
    if (!attacker || !target) return "none";
    const rays = buildRaysBetweenTokens(attacker, target);
    const p1 = attacker.center ?? attacker.getCenter();
    const p2 = target.center ?? target.getCenter();
    const attackerSize = getSizeRank(attacker);
    const targetSize = getSizeRank(target);
    let hasAny = false; let hasStandard = false;
    // Walls: any ray intersecting a blocking wall grants at least standard cover
    const hasWall = anyRayIntersectsAnyBlockingWall(rays);
    if (hasWall) { hasAny = true; hasStandard = true; }
    const intersectionMode = (game.settings?.get?.(MODULE_ID, "autoCoverTokenIntersectionMode") || "any");
    const ignoreUndetected = !!game.settings?.get?.(MODULE_ID, "autoCoverIgnoreUndetected");
    const ignoreDead = !!game.settings?.get?.(MODULE_ID, "autoCoverIgnoreDead");
    const ignoreAllies = !!game.settings?.get?.(MODULE_ID, "autoCoverIgnoreAllies");
    const respectIgnoreFlag = !!game.settings?.get?.(MODULE_ID, "autoCoverRespectIgnoreFlag");
    const allowProneBlockers = !!game.settings?.get?.(MODULE_ID, "autoCoverAllowProneBlockers");
    const attackerAlliance = attacker.actor?.alliance;
    for (const blocker of canvas.tokens.placeables) {
      if (!blocker?.actor) continue;
      if (blocker === attacker || blocker === target || blocker.actor?.type === 'loot' || blocker.actor?.type === 'hazard') continue;
      if (respectIgnoreFlag && blocker.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover')) continue;
      if (ignoreUndetected) {
        try {
          const vis = getVisibilityBetween(attacker, blocker);
          if (vis === 'undetected') continue;
        } catch (_) {}
      }
      if (ignoreDead && (blocker.actor?.hitPoints?.value === 0)) continue;
      if (!allowProneBlockers) {
        try {
          const itemConditions = blocker.actor?.itemTypes?.condition || [];
          const legacyConditions = blocker.actor?.conditions?.conditions || blocker.actor?.conditions || [];
          const isProne = itemConditions.some((c) => c?.slug === "prone") || legacyConditions.some((c) => c?.slug === "prone");
          if (isProne) continue;
        } catch (_) {}
      }
      if (ignoreAllies && blocker.actor?.alliance === attackerAlliance) continue;
      const rect = getTokenRect(blocker);
      const intersects = centerLineIntersectsRect(p1, p2, rect, intersectionMode);
      if (!intersects) continue;
      hasAny = true;
      const blockerSize = getSizeRank(blocker);
      if (blockerSize - attackerSize >= 2 && blockerSize - targetSize >= 2) hasStandard = true;
    }
    if (!hasAny) return "none";
    return hasStandard ? "standard" : "lesser";
  } catch (_) { return "none"; }
}

export function isAttackContext(ctx) {
  const type = ctx?.type ?? ""; const traits = Array.isArray(ctx?.traits) ? ctx.traits : [];
  return type === "attack-roll" || type === "spell-attack-roll" || traits.includes("attack");
}
export function resolveAttackerFromCtx(ctx) {
  try {
    const tokenObj = ctx?.token?.object || ctx?.token; if (tokenObj?.id) return tokenObj;
    if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
    const tokenIdRaw = ctx?.token?.id || ctx?.tokenId || ctx?.origin?.tokenId || ctx?.actor?.getActiveTokens?.()?.[0]?.id;
    const tokenId = normalizeTokenRef(tokenIdRaw);
    return tokenId ? (canvas?.tokens?.get?.(tokenId) || null) : null;
  } catch (_) { return null; }
}
export function resolveTargetFromCtx(ctx) {
  try {
    const tObj = ctx?.target?.token?.object || ctx?.target?.token; if (tObj?.id) return tObj;
    const targetIdRaw = (typeof ctx?.target?.token === "string") ? ctx.target.token : (ctx?.target?.tokenId || ctx?.targetTokenId);
    const targetId = normalizeTokenRef(targetIdRaw);
    if (targetId) { const byCtx = canvas?.tokens?.get?.(targetId); if (byCtx) return byCtx; }
    const t = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]);
    return t || null;
  } catch (_) { return null; }
}
export function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {}; const ctx = flags.context ?? {}; const type = ctx?.type ?? ""; const traits = ctx?.traits ?? [];
  if (type === "attack-roll" || type === "spell-attack-roll") return true; if (Array.isArray(traits) && traits.includes("attack")) return true; return false;
}
export function resolveTargetTokenIdFromData(data) {
  try { const ctxTarget = data?.flags?.pf2e?.context?.target?.token; if (ctxTarget) return normalizeTokenRef(ctxTarget); } catch (_) {}
  try { const pf2eTarget = data?.flags?.pf2e?.target?.token; if (pf2eTarget) return normalizeTokenRef(pf2eTarget); } catch (_) {}
  try {
    const arr = data?.flags?.pf2e?.context?.targets; if (Array.isArray(arr) && arr.length > 0) { const first = arr[0]; if (first?.token) return normalizeTokenRef(first.token); if (typeof first === "string") return normalizeTokenRef(first); }
  } catch (_) {}
  return null;
}

// ----- hook handlers (used by hooks/visioner-auto-cover.js)
export async function onPreCreateChatMessage(doc, data) {
  try {
    if (!game.user.isGM) return; if (!game.settings.get("pf2e-visioner", "autoCover")) return; if (!isAttackLikeMessageData(data)) return;
    const speakerTokenId = normalizeTokenRef(data?.speaker?.token); const targetTokenId = resolveTargetTokenIdFromData(data);
    if (!speakerTokenId || !targetTokenId) return;
    const tokens = canvas?.tokens; if (!tokens?.get) return;
    const attacker = tokens.get(speakerTokenId); const target = tokens.get(targetTokenId);
    if (!attacker || !target) return;
    const state = detectCoverStateForAttack(attacker, target); if (state === "none") return;
    await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
    try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state }); } catch (_) {}
    _recordPair(attacker.id, target.id);
  } catch (_) {}
}

export function onRenderChatMessage(message, html) {
  if (!game.user.isGM) return; if (!game.settings.get("pf2e-visioner", "autoCover")) return;
  const data = message?.toObject?.() || {}; if (!isAttackLikeMessageData(data)) return;
  const attackerIdRaw = data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
  const attackerId = normalizeTokenRef(attackerIdRaw);
  const targetId = resolveTargetTokenIdFromData(data); if (!attackerId) return;
  const tokens = canvas?.tokens; if (!tokens?.get) return;
  const attacker = tokens.get(attackerId); if (!attacker) return;
  const targetIds = targetId ? [targetId] : _consumePairs(attackerId); if (targetIds.length === 0) return;
  const targets = targetIds.map((tid) => tokens.get(tid)).filter((t) => !!t); if (targets.length === 0) return;
  setTimeout(async () => {
    try {
      for (const target of targets) {
        await setCoverBetween(attacker, target, "none", { skipEphemeralUpdate: true });
        try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state: "none" }); } catch (_) {}
        // Remove our one-shot dialog-injected effect if present
        try {
          const toDelete = (target.actor?.itemTypes?.effect ?? []).filter(e => e.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true).map(e => e.id);
          if (toDelete.length) await target.actor.deleteEmbeddedDocuments('Item', toDelete);
        } catch (_) {}
      }
    } catch (_) {}
  }, 150);
}

export async function onRenderCheckModifiersDialog(dialog, html) {
  try {
    if (!game.user.isGM) return; if (!game.settings.get("pf2e-visioner", "autoCover")) return;
    const ctx = dialog?.context ?? {}; if (!isAttackContext(ctx)) return;
    const attacker = resolveAttackerFromCtx(ctx); const target = resolveTargetFromCtx(ctx); if (!attacker || !target) return;
    const state = detectCoverStateForAttack(attacker, target); if (state === "none") return;
    await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
    try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state }); } catch (_) {}
    _recordPair(attacker.id, target.id);
    // Ensure current roll uses covered AC via dialog injection
    try {
      const rollBtnEl = html?.find?.('button.roll')?.[0];
      if (rollBtnEl && !rollBtnEl.dataset?.pvCoverBind) {
        rollBtnEl.dataset.pvCoverBind = '1';
        const isStandard = state === 'standard'; const bonus = isStandard ? 2 : 1;
        rollBtnEl.addEventListener('click', () => {
          try {
            const dctx = dialog?.context || {}; const tgt = dctx?.target; const tgtActor = tgt?.actor; if (!tgtActor) return;
            const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
            const label = isStandard ? 'Standard Cover' : 'Lesser Cover';
            items.push({ name: label, type: 'effect', system: { description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: '' }, rules: [ { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus } ], traits: { otherTags: [], value: [] }, level: { value: 1 }, duration: { value: -1, unit: 'unlimited' }, tokenIcon: { show: false }, unidentified: true, start: { value: 0 }, badge: null }, img: isStandard ? 'systems/pf2e/icons/equipment/shields/steel-shield.webp' : 'systems/pf2e/icons/equipment/shields/buckler.webp', flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } } });
            tgt.actor = tgtActor.clone({ items }, { keepId: true });
            const dcObj = dctx.dc; if (dcObj?.slug) { const st = tgt.actor.getStatistic(dcObj.slug)?.dc; if (st) { dcObj.value = st.value; dcObj.statistic = st; } }
          } catch (_) { }
        }, true);
      }
    } catch (_) { }
  } catch (_) {}
}

// Pre-roll capture when no modifiers dialog opens
export async function onStrikeClickCapture(ev) {
  try {
    if (!game.user.isGM) return; if (!game.settings.get("pf2e-visioner", "autoCover")) return;
    const el = ev?.target?.closest?.('[data-action="strike-attack"]'); if (!el) return;
    let attacker = null; try { const appEl = el.closest?.('.app.window-app'); const appId = appEl?.dataset?.appid ? Number(appEl.dataset.appid) : null; const app = appId != null ? ui.windows?.[appId] : null; const appActor = app?.actor; attacker = appActor?.getActiveTokens?.()?.[0] || canvas?.tokens?.controlled?.[0] || null; } catch (_) { attacker = canvas?.tokens?.controlled?.[0] || null; }
    const target = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]) || null; if (!attacker || !target) return;
    const state = detectCoverStateForAttack(attacker, target); if (state === "none") return;
    try { const { updateEphemeralCoverEffects } = await import("../cover/ephemeral.js"); await updateEphemeralCoverEffects(target, attacker, state, { durationRounds: -1 }); } catch (_) {}
    _recordPair(attacker.id, target.id);
  } catch (_) {}
}


