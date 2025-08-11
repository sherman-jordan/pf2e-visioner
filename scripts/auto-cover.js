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

function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {};
  const ctx = flags.context ?? {};
  const type = ctx?.type ?? "";
  const traits = ctx?.traits ?? [];
  if (type === "attack-roll" || type === "spell-attack-roll") return true;
  if (Array.isArray(traits) && traits.includes("attack")) return true;
  return false;
}

export function registerAutoCoverHooks() {
  Hooks.on("preCreateChatMessage", async (doc, data, options, userId) => {
    try {
      if (!game.user.isGM) return; // avoid duplicates
      if (!isAttackLikeMessageData(data)) return;
      const speakerTokenId = data?.speaker?.token;
      const targetTokenId = data?.flags?.pf2e?.context?.target?.token;
      if (!speakerTokenId || !targetTokenId) return;
      const attacker = canvas.tokens.get(speakerTokenId);
      const target = canvas.tokens.get(targetTokenId);
      if (!attacker || !target) return;

      const state = detectCoverStateForAttack(attacker, target);
      if (state === "none") return;
      // Apply aggregate/ephemeral effect to match bulk method
      try {
        const { updateEphemeralCoverEffects } = await import(
          "./cover-ephemeral.js"
        );
        await updateEphemeralCoverEffects(target, attacker, state, {
          durationRounds: -1,
        });
      } catch (_) {}

      // Persist to cover map (observer -> target)
      await setCoverBetween(attacker, target, state);
      try {
        Hooks.callAll("pf2e-visioner.coverMapUpdated", {
          observerId: attacker.id,
          targetId: target.id,
          state,
        });
      } catch (_) {}
    } catch (_) {}
  });
}
