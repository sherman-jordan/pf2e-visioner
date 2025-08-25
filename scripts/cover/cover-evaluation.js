/**
 * Cover Evaluation Module
 * Contains the various cover calculation strategies and evaluation algorithms
 */

import { segmentIntersectsRect } from '../helpers/geometry-utils.js';
import {
  getSizeRank,
  getTokenCorners,
  getTokenRect,
  getTokenVerticalSpanFt,
} from '../helpers/size-elevation-utils.js';
import {
  intersectsBetweenTokens,
  segmentRectIntersectionLength,
} from './line-intersection.js';
import { segmentIntersectsAnyBlockingWall } from './wall-detection.js';

/**
 * Evaluate cover using coverage-based calculation (percentage of blocker side coverage)
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @param {Array} blockers - Array of blocker token objects
 * @returns {string} Cover state: 'none', 'lesser', 'standard', or 'greater'
 */
export function evaluateCoverByCoverage(p1, p2, blockers) {
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

/**
 * Evaluate cover using size-based calculation (creature size differences)
 * @param {Object} attacker - Attacker token object
 * @param {Object} target - Target token object
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @param {Array} blockers - Array of blocker token objects
 * @param {string} intersectionMode - Intersection mode setting
 * @returns {string} Cover state: 'none', 'lesser', 'standard', or 'greater'
 */
export function evaluateCoverBySize(attacker, target, p1, p2, blockers, intersectionMode) {
  let any = false;
  let standard = false;
  const attackerSize = getSizeRank(attacker);
  const targetSize = getSizeRank(target);

  for (const blocker of blockers) {
    // Skip if blocker is the same as attacker or target
    if (blocker.id === attacker.id || blocker.id === target.id) continue;
    
    const rect = getTokenRect(blocker);
    
    // Pass the blocker to intersectsBetweenTokens to prevent self-blocking
    if (!intersectsBetweenTokens(attacker, target, rect, intersectionMode, blocker)) continue;
    
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

/**
 * Evaluate cover using tactical corner-to-corner calculation
 * @param {Object} attacker - Attacker token object
 * @param {Object} target - Target token object
 * @param {Array} blockers - Array of blocker token objects
 * @returns {string} Cover state: 'none', 'lesser', 'standard', or 'greater'
 */
export function evaluateCoverByTactical(attacker, target, blockers) {
  // Tactical mode: corner-to-corner calculations
  // Choose the best corner of the attacker and check lines from all target corners to that corner
  // This matches the "choose a corner" tactical rule

  const attackerRect = getTokenRect(attacker);
  const targetRect = getTokenRect(target);

  // Debug token sizes and rectangles
  const attackerSizeValue = attacker?.actor?.system?.traits?.size?.value ?? 'med';
  const targetSizeValue = target?.actor?.system?.traits?.size?.value ?? 'med';

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

  // Return the best (lowest) cover across attacker corners
  return bestCover;
}

/**
 * Evaluate cover using 3D sampling with vertical height considerations
 * @param {Object} attacker - Attacker token object
 * @param {Object} target - Target token object
 * @param {Array} allBlockers - Array of all potential blocker token objects
 * @returns {string} Cover state: 'none', 'lesser', 'standard', or 'greater'
 */
export function evaluateCoverBy3DSampling(attacker, target, allBlockers) {
  try {
    const attSpan = getTokenVerticalSpanFt(attacker);
    const tgtSpan = getTokenVerticalSpanFt(target);

    // Compute overlap band between attacker and target vertical spans
    const bandLow = Math.max(
      Math.min(attSpan.bottom, attSpan.top),
      Math.min(tgtSpan.bottom, tgtSpan.top),
    );
    const bandHigh = Math.min(
      Math.max(attSpan.bottom, attSpan.top),
      Math.max(tgtSpan.bottom, tgtSpan.top),
    );

    let samples;
    if (bandHigh > bandLow) {
      // Vertical overlap – sample within the overlapping band
      const mid = (bandLow + bandHigh) / 2;
      samples = [
        bandLow + 0.1 * (bandHigh - bandLow),
        mid,
        bandHigh - 0.1 * (bandHigh - bandLow),
      ];
    } else {
      // No vertical overlap – interpolate between attacker and target mid-heights
      const zA = (attSpan.bottom + attSpan.top) / 2;
      const zT = (tgtSpan.bottom + tgtSpan.top) / 2;
      samples = [0.1, 0.5, 0.9].map((t) => zA + t * (zT - zA));
    }

    const coverOrder = ['none', 'lesser', 'standard', 'greater'];
    let worst = 'none';

    const overlapsZ = (span, z) => span.bottom < z && span.top > z; // strict interior overlap

    for (const z of samples) {
      // Filter blockers whose vertical span crosses this Z slice
      const blockersAtZ = [];
      for (const b of allBlockers) {
        try {
          const bs = getTokenVerticalSpanFt(b);
          if (overlapsZ(bs, z)) blockersAtZ.push(b);
        } catch (_) {}
      }

      // Evaluate center-to-center per slice: count intersecting blockers
      const p1 = attacker.center ?? attacker.getCenter();
      const p2 = target.center ?? target.getCenter();
      let count = 0;
      let hasStandardBySize = false;
      const attackerSize = getSizeRank(attacker);
      const targetSize = getSizeRank(target);
      for (const blk of blockersAtZ) {
        const rect = getTokenRect(blk);
        if (segmentIntersectsRect(p1, p2, rect)) {
          count++;
          // size-based upgrade check
          try {
            const blockerSize = getSizeRank(blk);
            const sizeDiffAttacker = blockerSize - attackerSize;
            const sizeDiffTarget = blockerSize - targetSize;
            if (sizeDiffAttacker >= 2 && sizeDiffTarget >= 2) hasStandardBySize = true;
          } catch (_) {}
        }
      }
      let coverAtZ = count === 0 ? 'none' : count === 1 ? 'lesser' : count <= 3 ? 'standard' : 'greater';
      if (hasStandardBySize && coverAtZ === 'lesser') coverAtZ = 'standard';
      if (coverOrder.indexOf(coverAtZ) > coverOrder.indexOf(worst)) worst = coverAtZ;
      if (worst === 'greater') break; // early exit
    }

    return worst;
  } catch (_) {
    return 'none';
  }
}