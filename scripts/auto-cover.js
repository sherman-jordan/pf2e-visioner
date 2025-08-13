/**
 * Automatic cover detection on attack rolls
 */

import { setCoverBetween } from "./utils.js";

const SIZE_ORDER = {
  tiny: 0,
  sm: 1,
  small: 1,
  med: 2,
  medium: 2,
  lg: 3,
  large: 3,
  huge: 4,
  grg: 5,
  gargantuan: 5,
};

// Track attacker→target pairs so we can clean up even if target info isn't on the final message
const _activePairsByAttacker = new Map(); // attackerId -> Set<targetId>
function _recordPair(attackerId, targetId) {
  if (!attackerId || !targetId) return;
  let set = _activePairsByAttacker.get(attackerId);
  if (!set) { set = new Set(); _activePairsByAttacker.set(attackerId, set); }
  set.add(targetId);
}
function _consumePairs(attackerId) {
  const set = _activePairsByAttacker.get(attackerId);
  if (!set) return [];
  const arr = Array.from(set);
  _activePairsByAttacker.delete(attackerId);
  return arr;
}

function getSizeRank(token) {
  try {
    const v = token?.actor?.system?.traits?.size?.value ?? "med";
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
  const o = (a, b, c) =>
    Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
  const onSeg = (a, b, c) =>
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y);
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
  if (pointInRect(p1.x, p1.y, rect) || pointInRect(p2.x, p2.y, rect))
    return true;
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
    if (!attacker || !target) return "none";
    const p1 = attacker.center ?? attacker.getCenter();
    const p2 = target.center ?? target.getCenter();
    if (!p1 || !p2) return "none";
    const attackerSize = getSizeRank(attacker);

    let hasAny = false;
    let hasStandard = false;
    for (const blocker of canvas.tokens.placeables) {
      if (!blocker?.actor) continue;
      if (blocker === attacker || blocker === target) continue;
      const rect = getTokenRect(blocker);
      if (!segmentIntersectsRect(p1, p2, rect)) continue;
      hasAny = true;
      const blockerSize = getSizeRank(blocker);
      if (blockerSize - attackerSize >= 2) hasStandard = true;
    }
    if (!hasAny) return "none";
    return hasStandard ? "standard" : "lesser";
  } catch (e) {
    return "none";
  }
}

// Helpers for resolving attacker/target from PF2e check-dialog context
function isAttackContext(ctx) {
  const type = ctx?.type ?? "";
  const traits = Array.isArray(ctx?.traits) ? ctx.traits : [];
  return type === "attack-roll" || type === "spell-attack-roll" || traits.includes("attack");
}

function resolveAttackerFromCtx(ctx) {
  try {
    const tokenObj = ctx?.token?.object || ctx?.token;
    if (tokenObj?.id) return tokenObj;
    if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
    const tokenId = ctx?.token?.id || ctx?.tokenId || ctx?.origin?.tokenId || ctx?.actor?.getActiveTokens?.()?.[0]?.id;
    return tokenId ? canvas.tokens.get(tokenId) : null;
  } catch (_) { return null; }
}

function resolveTargetFromCtx(ctx) {
  try {
    const tObj = ctx?.target?.token?.object || ctx?.target?.token;
    if (tObj?.id) return tObj;
    const targetId = (typeof ctx?.target?.token === "string") ? ctx.target.token : (ctx?.target?.tokenId || ctx?.targetTokenId);
    if (targetId) { const byCtx = canvas.tokens.get(targetId); if (byCtx) return byCtx; }
    const t = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]);
    return t || null;
  } catch (_) { return null; }
}

function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {};
  const ctx = flags.context ?? {};
  const type = ctx?.type ?? "";
  const traits = ctx?.traits ?? [];
  if (type === "attack-roll" || type === "spell-attack-roll") return true;
  if (Array.isArray(traits) && traits.includes("attack")) return true;
  return false;
}

// Capture strike clicks so we can apply ephemeral cover before the roll if no modifiers dialog opens
async function handleStrikeClick(ev) {
  try {
    if (!game.user.isGM) return;
    if (!game.settings.get("pf2e-visioner", "autoCover")) return;
    const el = ev?.target?.closest?.('[data-action="strike-attack"]');
    if (!el) return;
    // Resolve attacker from the sheet window that emitted the click, or fall back to controlled token
    let attacker = null;
    try {
      const appEl = el.closest?.('.app.window-app');
      const appId = appEl?.dataset?.appid ? Number(appEl.dataset.appid) : null;
      const app = appId != null ? ui.windows?.[appId] : null;
      const appActor = app?.actor;
      attacker = appActor?.getActiveTokens?.()?.[0] || canvas.tokens.controlled?.[0] || null;
    } catch (_) { attacker = canvas.tokens.controlled?.[0] || null; }
    // Resolve target from user's current selection
    const target = (Array.from(game?.user?.targets ?? [])?.[0]) || (Array.from(canvas?.tokens?.targets ?? [])?.[0]) || null;
    if (!attacker || !target) return;
    // Compute cover and apply ephemeral for this roll path
    const state = detectCoverStateForAttack(attacker, target);
    if (state === "none") return;
    try {
      const { updateEphemeralCoverEffects } = await import("./cover-ephemeral.js");
      await updateEphemeralCoverEffects(target, attacker, state, { durationRounds: -1 });
    } catch (_) {}
    // Track for cleanup
    _recordPair(attacker.id, target.id);
  } catch (_) {}
}

function resolveTargetTokenIdFromData(data) {
  try {
    const ctxTarget = data?.flags?.pf2e?.context?.target?.token;
    if (ctxTarget) return ctxTarget;
  } catch (_) {}
  try {
    const pf2eTarget = data?.flags?.pf2e?.target?.token;
    if (pf2eTarget) return pf2eTarget;
  } catch (_) {}
  try {
    const arr = data?.flags?.pf2e?.context?.targets;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first?.token) return first.token;
      if (typeof first === "string") return first;
    }
  } catch (_) {}
  return null;
}

export function registerAutoCoverHooks() {
  Hooks.on("preCreateChatMessage", async (doc, data, options, userId) => {
    try {
      if (!game.user.isGM) return; // avoid duplicates
      if (!game.settings.get("pf2e-visioner", "autoCover")) return;
      if (!isAttackLikeMessageData(data)) return;
      const speakerTokenId = data?.speaker?.token;
      const targetTokenId = resolveTargetTokenIdFromData(data);
      if (!speakerTokenId || !targetTokenId) return;
      const attacker = canvas.tokens.get(speakerTokenId);
      const target = canvas.tokens.get(targetTokenId);
      if (!attacker || !target) return;

      const state = detectCoverStateForAttack(attacker, target);
      if (state === "none") return;
      // Persist to cover map only; skip creating any persistent effects here.
      await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
      try {
        Hooks.callAll("pf2e-visioner.coverMapUpdated", {
          observerId: attacker.id,
          targetId: target.id,
          state,
        });
      } catch (_) {}
      _recordPair(attacker.id, target.id);
    } catch (_) {}
  });

  // Delay cleanup until after the roll is complete
  // We'll use a different hook to clean up cover after the roll is processed
  
  // Post-roll cleanup once the attack message is rendered
  Hooks.on("renderChatMessage", (message, html) => {
    if (!game.user.isGM) return;
    if (!game.settings.get("pf2e-visioner", "autoCover")) return;
    const data = message?.toObject?.() || {};
    if (!isAttackLikeMessageData(data)) return;
    const attackerId = data?.speaker?.token || data?.flags?.pf2e?.context?.token?.id || data?.flags?.pf2e?.token?.id;
    const targetId = resolveTargetTokenIdFromData(data);
    if (!attackerId) return;
    const attacker = canvas.tokens.get(attackerId);
    if (!attacker) return;
    const targetIds = targetId ? [targetId] : _consumePairs(attackerId);
    if (targetIds.length === 0) return;
    const targets = targetIds.map((tid) => canvas.tokens.get(tid)).filter((t) => !!t);
    if (targets.length === 0) return;
    // Defer slightly to ensure any late PF2e processing finishes
    setTimeout(async () => {
      try {
        const { cleanupCoverEffectsForObserver, reconcileCoverEffectsForTarget } = await import("./cover-ephemeral.js");
        for (const target of targets) {
          // Clear our persisted map entry without creating new effects
          await setCoverBetween(attacker, target, "none", { skipEphemeralUpdate: true });
          // Remove any Visioner cover effects tied to this attacker (including dialog-injected ones)
          try {
            const toDelete = (target.actor?.itemTypes?.effect ?? []).filter(e => e.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true).map(e => e.id);
            if (toDelete.length) await target.actor.deleteEmbeddedDocuments('Item', toDelete);
          } catch (_) {}
          // Cleanup any aggregates or observer-specific rules
          try { await cleanupCoverEffectsForObserver(target, attacker); } catch (_) {}
          try { await reconcileCoverEffectsForTarget(target); } catch (_) {}
          try { Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state: "none" }); } catch (_) {}
        }
      } catch (err) {
        console.error("PF2e-Visioner: Error cleaning up cover post-roll", err);
      }
    }, 150);
  });

  // Additional fast path: when PF2e renders the Check Modifiers dialog, we can compute and tag cover quickly
  Hooks.on("renderCheckModifiersDialog", async (dialog, html) => {
    try {
      if (!game.user.isGM) return;
      if (!game.settings.get("pf2e-visioner", "autoCover")) return;
      const ctx = dialog?.context ?? {};
      if (!isAttackContext(ctx)) return;
      const attacker = resolveAttackerFromCtx(ctx);
      const target = resolveTargetFromCtx(ctx);
      if (!attacker || !target) return;
      const state = detectCoverStateForAttack(attacker, target);
      if (state === "none") return;
      // Persist for visibility/UX only; skip creating persistent effects.
      await setCoverBetween(attacker, target, state, { skipEphemeralUpdate: true });
      try {
        Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: attacker.id, targetId: target.id, state });
      } catch (_) {}
      _recordPair(attacker.id, target.id);
      // Ensure the current roll uses the covered AC even if PF2e clones the actor
      try {
        const rollBtnEl = html?.find?.('button.roll')?.[0];
        if (rollBtnEl && !rollBtnEl.dataset?.pvCoverBind) {
          rollBtnEl.dataset.pvCoverBind = '1';
          const isStandard = state === 'standard';
          const bonus = isStandard ? 2 : 1; // lesser=+1, standard=+2
          rollBtnEl.addEventListener('click', () => {
            try {
              const dctx = dialog?.context || {};
              const tgt = dctx?.target; const tgtActor = tgt?.actor;
              if (!tgtActor) return;
              // Mutate dialog statistic for this roll: add a circumstantial +AC modifier via temporary item
              const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
              const label = isStandard ? 'Standard Cover' : 'Lesser Cover';
              items.push({
                name: label,
                type: 'effect',
                system: {
                  description: { value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`, gm: '' },
                  rules: [ { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus } ],
                  traits: { otherTags: [], value: [] },
                  level: { value: 1 }, duration: { value: -1, unit: 'unlimited' },
                  tokenIcon: { show: false }, unidentified: true, start: { value: 0 }, badge: null,
                },
                img: isStandard ? 'systems/pf2e/icons/equipment/shields/steel-shield.webp' : 'systems/pf2e/icons/equipment/shields/buckler.webp',
                flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
              });
              tgt.actor = tgtActor.clone({ items }, { keepId: true });
              const dcObj = dctx.dc;
              if (dcObj?.slug) {
                const st = tgt.actor.getStatistic(dcObj.slug)?.dc;
                if (st) { dcObj.value = st.value; dcObj.statistic = st; }
              }
            } catch (_) { }
          }, true);
        }
      } catch (_) { }
    } catch (_) {}
  });

  // Register click-capture for strike attacks so we can apply before-the-roll effects
  try { document.addEventListener('click', handleStrikeClick, true); } catch (_) {}
}
