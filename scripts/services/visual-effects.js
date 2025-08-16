/**
 * Visual Effects Handler
 * Handles token/wall visual updates and refresh operations for both visibility and cover
 */

import { MODULE_ID } from "../constants.js";
import { getVisibilityBetween } from "../utils.js";

/**
 * Update token visuals - now mostly handled by detection wrapper
 * This function mainly serves to trigger a token refresh
 */
export async function updateTokenVisuals() {
  if (!canvas?.tokens) return;
  if (isDiceSoNiceAnimating()) {
    setTimeout(() => updateTokenVisuals(), 500);
    return;
  }
  // Minimal per-token refresh; token.visibility managed by PF2e detection wrapper
  for (const token of canvas.tokens.placeables) {
    try {
      if (token?.visible) token.refresh();
    } catch (_) {}
  }
}

/**
 * Targeted updates for performance and correctness. Only applies effects to the provided pairs.
 * @param {Array<{observerId:string,targetId:string,visibility?:string,cover?:string}>} pairs
 */
export async function updateSpecificTokenPairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  // Apply only changed visibility/cover per pair
  for (const p of pairs) {
    const observer = canvas.tokens.get(p.observerId);
    const target = canvas.tokens.get(p.targetId);
    if (!observer || !target) continue;
    // We do not draw custom visibility rings; detection/engine visuals will handle it
    // Effects are already applied by batch/single upsert paths; do not re-apply here
    // This function should only refresh visuals to avoid double-application of rules
    // Light refresh of the two tokens
    try {
      observer.refresh();
    } catch (_) {}
    try {
      target.refresh();
    } catch (_) {}
  }
}

/**
 * Check if Dice So Nice is currently animating
 * @returns {boolean} True if dice are currently animating
 */
function isDiceSoNiceAnimating() {
  // Check if Dice So Nice module is active
  if (!game.modules.get("dice-so-nice")?.active) {
    return false;
  }

  // Primary check: dice box rolling status
  if (game.dice3d?.box?.rolling) {
    return true;
  }

  // Secondary check: dice canvas visibility and animation state
  const diceCanvas = document.getElementById("dice-box-canvas");
  if (diceCanvas) {
    const isVisible =
      diceCanvas.style.display !== "none" && diceCanvas.offsetParent !== null;
    const hasOpacity = parseFloat(getComputedStyle(diceCanvas).opacity) > 0;

    if (isVisible && hasOpacity) {
      return true;
    }
  }

  // Tertiary check: look for active dice animations in the scene
  if (game.dice3d?.box?.scene?.children?.length > 0) {
    return true;
  }

  return false;
}

/**
 * Visual-only walls toggle per observer
 * Hides walls for this client if the active observer has them set as hidden
 */
// Wall visuals and tooltips temporarily disabled
export async function updateWallVisuals(observerId = null) {
  try {
    // Respect setting toggle
    if (!game.settings?.get?.(MODULE_ID, "hiddenWallsEnabled")) {
      return;
    }
    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) return;

    // Prepare updates (GM only) to make hidden doors not block sight
    const updates = [];
    const isGM = !!game.user?.isGM;

    // Determine local observer token strictly from current selection (or provided id)
    let observer = null;
    try {
      if (observerId) observer = canvas.tokens.get(observerId) || null;
      if (!observer) observer = canvas.tokens.controlled?.[0] || null;
      // Only show indicators when a player-owned token is selected
      if (!observer || !observer.actor?.hasPlayerOwner) observer = null;
    } catch (_) { observer = null; }
    const wallMapForObserver = observer?.document?.getFlag?.(MODULE_ID, "walls") || {};

    // Build an expanded set of observed wall IDs that includes any walls
    // connected to an observed wall via the connectedWalls identifier list.
    const observedSet = new Set(
      Object.entries(wallMapForObserver)
        .filter(([, v]) => v === "observed")
        .map(([id]) => id),
    );
    const expandedObserved = new Set(observedSet);
    try {
      const { getConnectedWallDocsBySourceId } = await import("./connected-walls.js");
      for (const wall of walls) {
        const id = wall?.document?.id;
        if (!id || !observedSet.has(id)) continue;
        const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
        for (const d of connectedDocs) expandedObserved.add(d.id);
      }
    } catch (_) {}

    // Collect token flag updates for player-owned tokens that can see hidden walls
    const tokenWallFlagUpdates = [];
    for (const wall of walls) {
      const d = wall.document;
      if (!d) continue;
      let flagHidden = false;
      try { flagHidden = !!d.getFlag?.(MODULE_ID, "hiddenWall"); } catch (_) {}

      // Remove previous indicator/masks if any (always clean before evaluating)
      try {
        if (wall._pvHiddenIndicator && wall._pvHiddenIndicator.parent) {
          wall._pvHiddenIndicator.parent.removeChild(wall._pvHiddenIndicator);
        }
        wall._pvHiddenIndicator = null;
        if (wall._pvSeeThroughMasks && Array.isArray(wall._pvSeeThroughMasks)) {
          for (const m of wall._pvSeeThroughMasks) {
            try { m.parent?.removeChild(m); m.destroy?.(); } catch (_) {}
          }
          wall._pvSeeThroughMasks = [];
        }
      } catch (_) {}

      const isExpandedObserved = expandedObserved.has(d.id);
      if (!flagHidden && !isExpandedObserved) {
        // If previously stored original sight exists, restore (GM only)
        if (isGM) {
          try {
            const origSight = d.getFlag?.(MODULE_ID, "originalSight");
            if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
              updates.push({ _id: d.id, sight: origSight, [`flags.${MODULE_ID}.originalSight`]: null });
            }
          } catch (_) {}
        }
        continue;
      }

      // Draw indicator for this client only if the wall is observed for the local observer
      try {
        const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        const [x1, y1, x2, y2] = c;
        if ([x1, y1, x2, y2].every((n) => typeof n === "number")) {
          const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
          const shouldShowIndicator = isExpandedObserved;
          const seeThrough = shouldShowIndicator && false && !!observer;
          if (shouldShowIndicator) {
            // Clean previous indicator
            try {
              if (wall._pvHiddenIndicator) {
                wall._pvHiddenIndicator.parent?.removeChild(wall._pvHiddenIndicator);
                wall._pvHiddenIndicator.destroy?.();
              }
            } catch (_) {}

            // Indicator uses the same geometry as see-through: a thin rectangle along the wall segment
            const isDoor = Number(d.door) > 0; // 0 none, 1 door, 2 secret
            const color = isDoor ? 0xffd166 : 0x9b59b6; // Yellow for doors, purple for walls
            const dx = x2 - x1; const dy = y2 - y1; const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len; const ny = dx / len; // unit normal
            const half = 10; // 6px wide indicator, matching see-through mask
            const g = new PIXI.Graphics();
            g.lineStyle(2, color, 0.9);
            g.beginFill(color, 0.3);
            g.drawPolygon([
              x1 + nx * half, y1 + ny * half,
              x2 + nx * half, y2 + ny * half,
              x2 - nx * half, y2 - ny * half,
              x1 - nx * half, y1 - ny * half,
            ]);
            g.endFill();
            g.zIndex = 1000;
            g.eventMode = "none";
            const parent = canvas.effects?.foreground || canvas.effects || (canvas.walls || wall);
            parent.addChild(g);
            wall._pvHiddenIndicator = g;
          }

          // Experimental per-token see-through: mask out the wall for this client by overlaying a hole along the wall segment
          if (seeThrough) {
            try {
              // Create a thin rectangular mask along the wall to visually remove it for this client
              const mask = new PIXI.Graphics();
              const isDoor = Number(d.door) > 0;
              const maskColor = isDoor ? 0xffd166 : 0x9b59b6; // Yellow for doors, purple for walls
              mask.beginFill(maskColor, 1.0);
              const dx = x2 - x1; const dy = y2 - y1; const len = Math.hypot(dx, dy) || 1;
              const nx = -dy / len; const ny = dx / len; // unit normal
              const half = 3; // 6px wide opening
              mask.drawPolygon([
                x1 + nx * half, y1 + ny * half,
                x2 + nx * half, y2 + ny * half,
                x2 - nx * half, y2 - ny * half,
                x1 - nx * half, y1 - ny * half,
              ]);
              mask.endFill();
              mask.alpha = 1;
              mask.zIndex = 999;
              mask.eventMode = "none";
              (canvas.walls || wall).addChild(mask);
              if (!wall._pvSeeThroughMasks) wall._pvSeeThroughMasks = [];
              wall._pvSeeThroughMasks.push(mask);
            } catch (_) {}
          } else if (wall._pvSeeThroughMasks) {
            try { wall._pvSeeThroughMasks.forEach((m) => m.parent?.removeChild(m)); } catch (_) {}
            wall._pvSeeThroughMasks = [];
          }

          // As GM, optionally open the wall's sight globally for any wall (door or not)
          // when at least one player-owned token has it Observed. This controls real occlusion.
          if (isGM) {
            try {
              const gmSeeThroughEnabled = false;
              if (!gmSeeThroughEnabled) {
                // Ensure any previous override is restored
                const origSight = d.getFlag?.(MODULE_ID, "originalSight");
                if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
                  updates.push({ _id: d.id, sight: origSight, [`flags.${MODULE_ID}.originalSight`]: null });
                }
              } else {
                // Determine if any token in the scene has this wall marked as Observed
                let anyObserved = false;
                try {
                  const tokens = canvas.tokens?.placeables || [];
                  for (const t of tokens) {
                    const wm = t?.document?.getFlag?.(MODULE_ID, "walls") || {};
                    if (wm?.[d.id] === "observed") { anyObserved = true; break; }
                  }
                } catch (_) {}

                if (anyObserved) {
                  const currentSight = Number(d.sight ?? 1);
                  if (currentSight !== 0) {
                    const origSight = d.getFlag?.(MODULE_ID, "originalSight");
                    const toStore = (origSight === undefined || origSight === null) ? currentSight : origSight;
                    const patch = { _id: d.id, sight: 0 };
                    patch[`flags.${MODULE_ID}.originalSight`] = toStore;
                    updates.push(patch);
                  }
                } else {
                  // Not seeing through: restore any previous override
                  const origSight = d.getFlag?.(MODULE_ID, "originalSight");
                  if (origSight !== undefined && origSight !== null && d.sight !== origSight) {
                    updates.push({ _id: d.id, sight: origSight, [`flags.${MODULE_ID}.originalSight`]: null });
                  }
                }
              }
            } catch (_) {}
          }

          // Note: Auto-discovery disabled. Observed/Hidden should be controlled via the Token Manager.
        }
      } catch (_) {}

      // Door-specific unconditional relaxation removed; handled above under unified GM logic.
    }

    if (isGM && (updates.length > 0 || tokenWallFlagUpdates.length > 0)) {
      try {
        if (updates.length > 0) await canvas.scene?.updateEmbeddedDocuments?.("Wall", updates, { diff: false });
        if (tokenWallFlagUpdates.length > 0) await canvas.scene?.updateEmbeddedDocuments?.("Token", tokenWallFlagUpdates, { diff: false });
        // After sight changes, refresh perception
        canvas.perception.update({ refreshLighting: true, refreshVision: true, refreshOcclusion: true });
        // Force token refresh so newly visible tokens render
        try { for (const t of canvas.tokens.placeables) t.refresh?.(); } catch (_) {}
      } catch (e) {
        console.warn(`[${MODULE_ID}] Failed to update hidden door sight overrides`, e);
      }
    }

    // Draw hidden-echo overlays for tokens relative to current observer (client-only visual)
    try {
      await updateHiddenTokenEchoes(observer);
    } catch (_) {}
  } catch (_) {}
}

/**
 * Draw or remove a subtle "soundwave" echo overlay for tokens that are Hidden to the current observer
 * This is client-only visual so the player gets feedback even if PF2e detection hides the sprite.
 */
async function updateHiddenTokenEchoes(observer) {
  try {
    const enabled = false;
    if (!enabled || !observer) {
      // remove any existing overlays
      for (const t of canvas.tokens.placeables) removeEcho(t);
  return;
    }
    // Build wall sets for intersection checks
    const walls = canvas?.walls?.placeables || [];
    const wallMap = observer?.document?.getFlag?.(MODULE_ID, "walls") || {};
    // Expanded observed set: includes connected walls of any observed wall
    const observedSet = new Set(
      Object.entries(wallMap)
        .filter(([, v]) => v === "observed")
        .map(([id]) => id),
    );
    const expandedObserved = new Set(observedSet);
    try {
      const { getConnectedWallDocsBySourceId } = await import("./connected-walls.js");
      for (const w of walls) {
        const id = w?.document?.id; if (!id || !observedSet.has(id)) continue;
        const connectedDocs = getConnectedWallDocsBySourceId(id) || [];
        for (const d of connectedDocs) expandedObserved.add(d.id);
      }
    } catch (_) {}
    const hiddenObservedWalls = walls.filter((w) => {
      try { return expandedObserved.has(w?.document?.id); } catch (_) { return false; }
    });
    const regularBlockingWalls = walls.filter((w) => {
      try {
        const d = w.document;
        if (expandedObserved.has(d.id)) return false; // these are allowed
        const isDoor = Number(d.door) > 0; const doorState = Number(d.ds ?? d.doorState ?? 0); if (isDoor && doorState === 1) return false; // open door
        const sight = Number(d.sight ?? 1); if (sight === 0) return false; // non-blocking
        return true;
      } catch (_) { return false; }
    });

    for (const t of canvas.tokens.placeables) {
      if (!t?.actor || t === observer) { removeEcho(t); continue; }
      let vis = "observed";
      try { vis = getVisibilityBetween(observer, t); } catch (_) {}
      if (vis !== "hidden") { removeEcho(t); continue; }
      // Only show echo if token lies behind at least one hidden+observed wall, and not blocked by any regular walls
      const p1 = observer.center || observer.getCenter?.();
      const p2 = t.center || t.getCenter?.();
      if (!p1 || !p2) { removeEcho(t); continue; }
      const intersectsHidden = hiddenObservedWalls.some((w) => segmentIntersectsWall(p1, p2, w));
      if (!intersectsHidden) { removeEcho(t); continue; }
      const intersectsRegular = regularBlockingWalls.some((w) => segmentIntersectsWall(p1, p2, w));
      if (intersectsRegular) { removeEcho(t); continue; }
      drawEcho(t);
    }
  } catch (_) {}
}

function drawEcho(token) {
  try {
    const center = token.center || token.getCenter?.() || { x: token.x + token.w/2, y: token.y + token.h/2 };
    const g = token._pvHiddenEcho || new PIXI.Graphics();
    g.clear();
    const color = 0xffa500; // orange
    g.lineStyle(2, color, 0.9);
    const radii = [12, 18, 24];
    for (const r of radii) g.drawCircle(center.x, center.y, r);
    g.zIndex = 1001;
    g.eventMode = "none";
    if (!token._pvHiddenEcho) {
      (canvas.tokens || token.parent)?.addChild(g);
      token._pvHiddenEcho = g;
    }
  } catch (_) {}
}

function removeEcho(token) {
  try {
    if (token?._pvHiddenEcho) {
      token._pvHiddenEcho.parent?.removeChild(token._pvHiddenEcho);
      token._pvHiddenEcho.destroy?.();
    }
  } catch (_) {}
  token._pvHiddenEcho = null;
}

// Geometry helpers
function segmentIntersectsWall(p1, p2, wall) {
  try {
    const d = wall?.document; if (!d) return false;
    const c = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
    const [x1, y1, x2, y2] = c; if ([x1, y1, x2, y2].some((n) => typeof n !== "number")) return false;
    return segmentsIntersect(p1, p2, { x: x1, y: y1 }, { x: x2, y: y2 });
  } catch (_) { return false; }
}

function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
  const onSeg = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
  const o1 = o(p1, p2, q1); const o2 = o(p1, p2, q2); const o3 = o(q1, q2, p1); const o4 = o(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, q1)) return true;
  if (o2 === 0 && onSeg(p1, p2, q2)) return true;
  if (o3 === 0 && onSeg(q1, q2, p1)) return true;
  if (o4 === 0 && onSeg(q1, q2, p2)) return true;
  return false;
}
