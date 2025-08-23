/**
 * Auto-cover core: helpers and hook handlers.
 * Hook registration is done in scripts/hooks/visioner-auto-cover.js
 */

// Debug logger removed
import { COVER_STATES, MODULE_ID } from '../constants.js';
import {
  getCoverBonusByState,
  getCoverImageForState,
  getCoverLabel,
} from '../helpers/cover-helpers.js';
import { getCoverBetween, getVisibilityBetween, setCoverBetween } from '../utils.js';

// ----- helpers
function normalizeTokenRef(ref) {
  try {
    if (!ref) return null;
    let s = typeof ref === 'string' ? ref.trim() : String(ref);
    // Strip surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      s = s.slice(1, -1);
    // If it's a UUID, extract the final Token.<id> segment
    const m = s.match(/Token\.([^.\s]+)$/);
    if (m && m[1]) return m[1];
    // Otherwise assume it's already the token id
    return s;
  } catch (_) {
    return ref;
  }
}
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

export function getSizeRank(token) {
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
function getTokenBoundaryPoints(token) {
  try {
    const rect = getTokenRect(token);
    const cx = (rect.x1 + rect.x2) / 2;
    const cy = (rect.y1 + rect.y2) / 2;
    return [
      { x: rect.x1, y: rect.y1 }, // top-left
      { x: rect.x2, y: rect.y1 }, // top-right
      { x: rect.x2, y: rect.y2 }, // bottom-right
      { x: rect.x1, y: rect.y2 }, // bottom-left
      { x: cx, y: rect.y1 }, // mid-top
      { x: rect.x2, y: cy }, // mid-right
      { x: cx, y: rect.y2 }, // mid-bottom
      { x: rect.x1, y: cy }, // mid-left
      { x: cx, y: cy }, // center
    ];
  } catch (_) {
    const c = token.center ?? token.getCenter?.() ?? { x: 0, y: 0 };
    return [c];
  }
}
function pointInRect(px, py, rect) {
  return px >= rect.x1 && px <= rect.x2 && py >= rect.y1 && py <= rect.y2;
}
function segmentsIntersect(p1, p2, q1, q2) {
  // Correct orientation test uses vectors AB and AC (not AB and BC)
  const o = (a, b, c) => Math.sign((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y));
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

function segmentIntersectsAnyBlockingWall(p1, p2) {
  try {
    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) return false;
    for (const wall of walls) {
      try {
        const d = wall.document;
        if (!d) continue;
        // Skip walls explicitly marked as not providing cover
        try {
          const provides = d.getFlag?.(MODULE_ID, 'provideCover');
          if (provides === false) continue;
        } catch (_) {}
        // Skip open doors; treat closed/locked doors and normal walls as blockers
        const isDoor = Number(d.door) > 0; // 0 none, 1 door, 2 secret (treat as door-like)
        const doorState = Number(d.ds ?? d.doorState ?? 0); // 0 closed/secret, 1 open, 2 locked
        if (isDoor && doorState === 1) continue; // open door → no cover contribution
        const [x1, y1, x2, y2] = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
        if ([x1, y1, x2, y2].some((n) => typeof n !== 'number')) continue;
        const w1 = { x: x1, y: y1 };
        const w2 = { x: x2, y: y2 };
        if (segmentsIntersect(p1, p2, w1, w2)) return true;
      } catch (_) {
        /* ignore malformed wall */
      }
    }
    return false;
  } catch (_) {
    return false;
  }
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
  if (mode === 'center') {
    const cx = (rect.x1 + rect.x2) / 2;
    const cy = (rect.y1 + rect.y2) / 2;
    const dist = distancePointToSegment({ x: cx, y: cy }, p1, p2);
    // Treat as pass-through if the center lies near the line segment (within 1px)
    return dist <= 1 && pointBetweenOnSegment({ x: cx, y: cy }, p1, p2);
  }
  if (mode === 'any' || mode === 'length10') {
    const len = segmentRectIntersectionLength(p1, p2, rect);
    if (len <= 0) return false;
    if (mode === 'any') return true; // any graze counts

    if (mode === 'length10') {
      // Grid-square-based approach: 10% of total grid squares
      const width = Math.abs(rect.x2 - rect.x1);
      const height = Math.abs(rect.y2 - rect.y1);

      // Calculate grid squares (assuming each square is ~50px in standard FoundryVTT)
      const gridSize = canvas?.grid?.size || 50;
      const widthSquares = Math.round(width / gridSize);
      const heightSquares = Math.round(height / gridSize);
      const totalSquares = widthSquares * heightSquares;

      // Convert intersection length to "square equivalents"
      // A full diagonal through one square ≈ √2 * gridSize ≈ 71px
      const squareEquivalent = len / (gridSize * Math.sqrt(2));
      const squarePercentage = (squareEquivalent / totalSquares) * 100;

      return squarePercentage >= 10;
    }

    // For other modes (length50), use the old diagonal approach
    const width = Math.abs(rect.x2 - rect.x1);
    const height = Math.abs(rect.y2 - rect.y1);
    const tokenDiagonal = Math.sqrt(width * width + height * height);
    const ratio = len / tokenDiagonal;
    const threshold = 0.5;
    return ratio >= threshold;
  }
  // 'any' behaves like edge-hit (any side), not strict center capture
  return hits.size > 0;
}

function segmentRectIntersectionLength(p1, p2, rect) {
  // Liang-Barsky clipping to get [t0,t1] of the segment inside the rect
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - rect.x1, rect.x2 - p1.x, p1.y - rect.y1, rect.y2 - p1.y];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];
    if (pi === 0) {
      if (qi < 0) return 0;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 > t1) return 0;
  const segLen = Math.hypot(dx, dy);
  return Math.max(0, segLen * Math.max(0, t1 - t0));
}

function segmentRectIntersectionRange(p1, p2, rect) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - rect.x1, rect.x2 - p1.x, p1.y - rect.y1, rect.y2 - p1.y];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 > t1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

function distancePointToSegment(pt, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = pt.x - a.x;
  const apy = pt.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(pt.x - cx, pt.y - cy);
}

function pointBetweenOnSegment(pt, a, b) {
  const minX = Math.min(a.x, b.x) - 1e-6;
  const maxX = Math.max(a.x, b.x) + 1e-6;
  const minY = Math.min(a.y, b.y) - 1e-6;
  const maxY = Math.max(a.y, b.y) + 1e-6;
  return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
}

// ----- strategy helpers: configuration and evaluators

function getIntersectionMode() {
  const mode = game.settings?.get?.(MODULE_ID, 'autoCoverTokenIntersectionMode');
  return mode || 'any';
}

function getAutoCoverFilterSettings(attacker) {
  const ignoreUndetected = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreUndetected');
  const ignoreDead = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreDead');
  const ignoreAllies = !!game.settings?.get?.(MODULE_ID, 'autoCoverIgnoreAllies');
  const respectIgnoreFlag = !!game.settings?.get?.(MODULE_ID, 'autoCoverRespectIgnoreFlag');
  const allowProneBlockers = !!game.settings?.get?.(MODULE_ID, 'autoCoverAllowProneBlockers');
  return {
    ignoreUndetected,
    ignoreDead,
    ignoreAllies,
    respectIgnoreFlag,
    allowProneBlockers,
    attackerAlliance: attacker?.actor?.alliance,
  };
}

function getEligibleBlockingTokens(attacker, target, filters) {
  const out = [];

  for (const blocker of canvas.tokens.placeables) {
    if (!blocker?.actor) continue;
    if (blocker === attacker || blocker === target) continue;

    // Exclude controlled/selected tokens from being blockers
    if (
      canvas.tokens.controlled.includes(blocker) ||
      blocker.id === attacker.id ||
      blocker.id === target.id
    )
      continue;

    const type = blocker.actor?.type;
    if (type === 'loot' || type === 'hazard') continue;
    if (filters.respectIgnoreFlag && blocker.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover')) {
      continue;
    }
    // Always ignore Foundry hidden tokens
    if (blocker.document.hidden) {
      continue;
    }

    // Check PF2e undetected tokens only if the setting is enabled
    if (filters.ignoreUndetected) {
      try {
        // Use custom visibility perspective if provided, otherwise use attacker
        const perspectiveToken = filters.visibilityPerspective || attacker;
        const vis = getVisibilityBetween(perspectiveToken, blocker);
        if (vis === 'undetected') {
          continue;
        }
      } catch (_) {}
    }
    if (filters.ignoreDead && blocker.actor?.hitPoints?.value === 0) {
      continue;
    }
    if (!filters.allowProneBlockers) {
      try {
        const itemConditions = blocker.actor?.itemTypes?.condition || [];
        const legacyConditions =
          blocker.actor?.conditions?.conditions || blocker.actor?.conditions || [];
        const isProne =
          itemConditions.some((c) => c?.slug === 'prone') ||
          legacyConditions.some((c) => c?.slug === 'prone');
        if (isProne) {
          continue;
        }
      } catch (_) {}
    }
    if (filters.ignoreAllies && blocker.actor?.alliance === filters.attackerAlliance) {
      continue;
    }
    out.push(blocker);
  }

  return out;
}

function evaluateCoverByCoverage(p1, p2, blockers) {
  // Fixed side coverage thresholds: Standard at 50%, Greater at 70%
  const lesserT = 50;
  const greaterT = 70;

  let sawAny = false;
  let meetsStd = false;
  let meetsGrt = false;
  for (const b of blockers) {
    const rect = getTokenRect(b);
    const len = segmentRectIntersectionLength(p1, p2, rect);
    if (len <= 0) continue;
    sawAny = true;
    const width = Math.abs(rect.x2 - rect.x1);
    const height = Math.abs(rect.y2 - rect.y1);
    const side = Math.max(width, height); // larger side in pixels
    const f = (len / Math.max(1, side)) * 100; // percent side coverage
    if (f >= greaterT) {
      meetsGrt = true;
      break;
    }
    if (f >= lesserT) {
      meetsStd = true;
    }
  }

  const result = meetsGrt ? 'greater' : meetsStd ? 'standard' : sawAny ? 'lesser' : 'none';
  return result;
}

function evaluateCoverBySize(attacker, target, p1, p2, blockers, intersectionMode) {
  let any = false;
  let standard = false;
  const attackerSize = getSizeRank(attacker);
  const targetSize = getSizeRank(target);

  for (const blocker of blockers) {
    const rect = getTokenRect(blocker);
    if (!centerLineIntersectsRect(p1, p2, rect, intersectionMode)) continue;
    any = true;
    const blockerSize = getSizeRank(blocker);
    const sizeDiffAttacker = blockerSize - attackerSize;
    const sizeDiffTarget = blockerSize - targetSize;
    const grantsStandard = sizeDiffAttacker >= 2 && sizeDiffTarget >= 2;

    if (grantsStandard) standard = true;
  }

  const result = any ? (standard ? 'standard' : 'lesser') : 'none';
  return result;
}

function evaluateCoverByTactical(attacker, target, blockers) {
  // Tactical mode: corner-to-corner calculations
  // Choose the best corner of the attacker and check lines from all target corners to that corner
  // This matches the "choose a corner" tactical rule

  const attackerRect = getTokenRect(attacker);
  const targetRect = getTokenRect(target);

  // Debug token sizes and rectangles
  const attackerSizeValue = attacker?.actor?.system?.traits?.size?.value ?? 'med';
  const targetSizeValue = target?.actor?.system?.traits?.size?.value ?? 'med';
  // Get corners for both tokens, handling tiny creatures properly
  function getTokenCorners(token, rect, sizeValue) {
    // For tiny creatures, use a slightly larger effective area for tactical cover calculations
    // While they occupy 0.5 squares, they should still provide meaningful cover
    if (sizeValue === 'tiny') {
      const centerX = (rect.x1 + rect.x2) / 2;
      const centerY = (rect.y1 + rect.y2) / 2;
      const gridSize = canvas.grid.size;
      const halfEffective = gridSize * 0.35; // Use 0.7 square effective area for cover (35% from center)

      return [
        { x: centerX - halfEffective, y: centerY - halfEffective }, // top-left
        { x: centerX + halfEffective, y: centerY - halfEffective }, // top-right
        { x: centerX + halfEffective, y: centerY + halfEffective }, // bottom-right
        { x: centerX - halfEffective, y: centerY + halfEffective }, // bottom-left
      ];
    } else {
      // Regular creatures use document boundaries
      return [
        { x: rect.x1, y: rect.y1 }, // top-left
        { x: rect.x2, y: rect.y1 }, // top-right
        { x: rect.x2, y: rect.y2 }, // bottom-right
        { x: rect.x1, y: rect.y2 }, // bottom-left
      ];
    }
  }

  const attackerCorners = getTokenCorners(attacker, attackerRect, attackerSizeValue);
  const targetCorners = getTokenCorners(target, targetRect, targetSizeValue);

  let bestCover = 'greater'; // Start with worst case

  // Try each attacker corner and find the one with the least cover (best for attacking)
  for (let a = 0; a < attackerCorners.length; a++) {
    const attackerCorner = attackerCorners[a];
    let blockedLines = 0;
    const totalLines = targetCorners.length;

    // Check lines from all target corners to this attacker corner
    for (let t = 0; t < targetCorners.length; t++) {
      const targetCorner = targetCorners[t];
      let lineBlocked = false;
      let blockedBy = 'none';

      // Check if this line is blocked by walls
      if (segmentIntersectsAnyBlockingWall(targetCorner, attackerCorner)) {
        lineBlocked = true;
        blockedBy = 'wall';
      }

      // Check if this line is blocked by any token blockers
      if (!lineBlocked) {
        for (const blocker of blockers) {
          if (blocker === attacker || blocker === target) continue;

          const blockerRect = getTokenRect(blocker);
          const intersectionLength = segmentRectIntersectionLength(
            targetCorner,
            attackerCorner,
            blockerRect,
          );
          if (intersectionLength > 0) {
            lineBlocked = true;
            blockedBy = `token:${blocker.name}(${intersectionLength.toFixed(1)}px)`;
            break;
          }
        }
      }

      if (lineBlocked) blockedLines++;
    }

    // Determine cover level for this attacker corner
    let coverForThisCorner;
    if (blockedLines === 0) coverForThisCorner = 'none';
    else if (blockedLines === 1) coverForThisCorner = 'lesser';
    else if (blockedLines <= 3) coverForThisCorner = 'standard';
    else coverForThisCorner = 'greater';

    // Keep the best (lowest) cover result
    const coverOrder = ['none', 'lesser', 'standard', 'greater'];
    if (coverOrder.indexOf(coverForThisCorner) < coverOrder.indexOf(bestCover)) {
      bestCover = coverForThisCorner;
    }
  }

  return bestCover;
}

function evaluateWallsCover(p1, p2) {
  return segmentIntersectsAnyBlockingWall(p1, p2) ? 'standard' : 'none';
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

    const intersectionModeValue = game.settings?.get?.(MODULE_ID, 'autoCoverTokenIntersectionMode');
    const useCoverage = intersectionModeValue === 'coverage';
    const useTactical = intersectionModeValue === 'tactical';

    let tokenCover;
    if (useTactical) {
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

export function isAttackContext(ctx) {
  const type = ctx?.type ?? '';
  const traits = Array.isArray(ctx?.traits) ? ctx.traits : [];
  return type === 'attack-roll' || type === 'spell-attack-roll' || traits.includes('attack');
}
export function resolveAttackerFromCtx(ctx) {
  try {
    const tokenObj = ctx?.token?.object || ctx?.token;
    if (tokenObj?.id) return tokenObj;
    if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
    const tokenIdRaw =
      ctx?.token?.id ||
      ctx?.tokenId ||
      ctx?.origin?.tokenId ||
      ctx?.actor?.getActiveTokens?.()?.[0]?.id;
    const tokenId = normalizeTokenRef(tokenIdRaw);
    return tokenId ? canvas?.tokens?.get?.(tokenId) || null : null;
  } catch (_) {
    return null;
  }
}
export function resolveTargetFromCtx(ctx) {
  try {
    const tObj = ctx?.target?.token?.object || ctx?.target?.token;
    if (tObj?.id) return tObj;
    const targetIdRaw =
      typeof ctx?.target?.token === 'string'
        ? ctx.target.token
        : ctx?.target?.tokenId || ctx?.targetTokenId;
    const targetId = normalizeTokenRef(targetIdRaw);
    if (targetId) {
      const byCtx = canvas?.tokens?.get?.(targetId);
      if (byCtx) return byCtx;
    }
    const t =
      Array.from(game?.user?.targets ?? [])?.[0] || Array.from(canvas?.tokens?.targets ?? [])?.[0];
    return t || null;
  } catch (_) {
    return null;
  }
}
export function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {};
  const ctx = flags.context ?? {};
  const type = ctx?.type ?? '';
  const traits = ctx?.traits ?? [];
  if (type === 'attack-roll' || type === 'spell-attack-roll') return true;
  if (Array.isArray(traits) && traits.includes('attack')) return true;
  return false;
}
export function resolveTargetTokenIdFromData(data) {
  try {
    const ctxTarget = data?.flags?.pf2e?.context?.target?.token;
    if (ctxTarget) return normalizeTokenRef(ctxTarget);
  } catch (_) {}
  try {
    const pf2eTarget = data?.flags?.pf2e?.target?.token;
    if (pf2eTarget) return normalizeTokenRef(pf2eTarget);
  } catch (_) {}
  try {
    const arr = data?.flags?.pf2e?.context?.targets;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first?.token) return normalizeTokenRef(first.token);
      if (typeof first === 'string') return normalizeTokenRef(first);
    }
  } catch (_) {}
  return null;
}

// ----- hook handlers (used by hooks/visioner-auto-cover.js)
export async function onPreCreateChatMessage(doc, data) {
  try {
    if (!game.settings.get('pf2e-visioner', 'autoCover')) return;
    if (!isAttackLikeMessageData(data)) return;

    const speakerTokenId = normalizeTokenRef(data?.speaker?.token);
    const targetTokenId = resolveTargetTokenIdFromData(data);
    if (!speakerTokenId || !targetTokenId) return;

    const tokens = canvas?.tokens;
    if (!tokens?.get) return;

    const attacker = tokens.get(speakerTokenId);
    const target = tokens.get(targetTokenId);
    if (!attacker || !target) return;

    // Only proceed if this user owns the attacking token or is the GM
    if (!attacker.isOwner && !game.user.isGM) return;

    // Detect base cover state
    let state = detectCoverStateForAttack(attacker, target);
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
    if (!isAttackContext(ctx)) return;
    const attacker = resolveAttackerFromCtx(ctx);
    const target = resolveTargetFromCtx(ctx);
    if (!attacker || !target) return;
    const state = detectCoverStateForAttack(attacker, target);
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
            dialog._pvCoverOverride = sel;
            container.find('.pv-cover-btn').each((_, el) => {
              const active = el.dataset?.state === sel;
              el.classList.toggle('active', active);
              el.style.background = active
                ? 'var(--color-bg-tertiary, rgba(0,0,0,0.2))'
                : 'transparent';
            });
          } catch (_) {}
        });
      }
    } catch (_) {}

    // Ensure current roll uses selected (or auto) cover via dialog injection
    try {
      const rollBtnEl = html?.find?.('button.roll')?.[0];
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

              // Check if this is actually an override (different from detected state)
              const isOverride = chosen !== state;

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
                    i?.type === 'effect' && i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                  ),
              );
              if (bonus > 0) {
                const label = getCoverLabel(chosen);
                const img = getCoverImageForState(chosen);
                items.push({
                  name: label,
                  type: 'effect',
                  system: {
                    description: {
                      value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                      gm: '',
                    },
                    rules: [
                      { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: bonus },
                    ],
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
    } catch (_) {}
  } catch (_) {}
}

// Intercept stealth rolls to apply DC reduction from cover
Hooks.on?.('preCreateChatMessage', (messageData) => {
  try {
    if (!game.settings.get(MODULE_ID, 'autoCover')) return;

    // Check if this is a stealth check
    const flags = messageData?.flags?.pf2e || {};
    const context = flags?.context || {};
    const isStealthCheck =
      context?.type === 'skill-check' &&
      (context?.skill === 'stealth' ||
        context?.statistic === 'stealth' ||
        messageData?.flavor?.toLowerCase()?.includes('stealth'));

    if (!isStealthCheck) return;

    // Look for any open stealth modifier dialog with cover bonus
    const stealthDialog = Object.values(ui.windows).find(
      (w) => w.constructor.name === 'CheckModifiersDialog' && w._pvStealthCoverBonus > 0,
    );

    if (!stealthDialog || !stealthDialog._pvStealthCoverBonus) return;

    const coverBonus = stealthDialog._pvStealthCoverBonus;

    // Reduce the DC by the cover bonus (equivalent to adding bonus to roll)
    if (context.dc && typeof context.dc.value === 'number') {
      const originalDC = context.dc.value;
      context.dc.value = Math.max(0, originalDC - coverBonus);

      // Add a note about the cover adjustment
      const coverNote =
        coverBonus === 4
          ? ' (DC reduced by 4 for Greater Cover)'
          : coverBonus === 2
            ? ' (DC reduced by 2 for Standard Cover)'
            : '';

      if (context.dc.label) {
        context.dc.label += coverNote;
      } else {
        context.dc.label = `DC ${context.dc.value}${coverNote}`;
      }

      // Also update the messageData flags
      foundry.utils.setProperty(messageData, 'flags.pf2e.context.dc', context.dc);
    }
  } catch (e) {
    console.warn('PF2E Visioner | Error adjusting stealth DC for cover:', e);
  }
});

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
