/**
 * Utilities to resolve Point Out targets and allies, shared by preview/apply flows.
 */

export async function enrichPointOutActionDataForGM(actionData) {
  try {
    const msg = game.messages.get(actionData.messageId);
    const modulePointOut = msg?.flags?.["pf2e-visioner"]?.pointOut;
    if (modulePointOut?.targetTokenId) {
      actionData.context = actionData.context || {};
      actionData.context.target = { token: modulePointOut.targetTokenId };
    } else if (msg?.flags?.pf2e?.target?.token) {
      actionData.context = actionData.context || {};
      actionData.context.target = { token: msg.flags.pf2e.target.token };
    }
  } catch (_) {}
}

export function getBestPointOutTargetForGM(actionData) {
  try {
    const pointerId = actionData.actor?.id;
    const pointerToken = pointerId ? canvas.tokens.get(pointerId) : null;
    if (!pointerToken) return null;
    // Heuristic: choose nearest enemy token
    const tokens = canvas?.tokens?.placeables || [];
    const enemies = tokens.filter((t) => t && t !== pointerToken && t.actor && t.document.disposition !== pointerToken.document.disposition);
    if (enemies.length === 0) return null;
    let best = enemies[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const e of enemies) {
      const dx = e.center.x - pointerToken.center.x;
      const dy = e.center.y - pointerToken.center.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = e; }
    }
    return best;
  } catch (_) {
    return null;
  }
}


