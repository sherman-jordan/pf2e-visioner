/**
 * Wall Detection Module
 * Handles wall intersection detection and cover evaluation from walls
 */

import { MODULE_ID } from '../constants.js';
import { segmentsIntersect } from './geometry-utils.js';

/**
 * Check if a line segment intersects any blocking wall
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties  
 * @returns {boolean} True if segment intersects any blocking wall
 */
export function segmentIntersectsAnyBlockingWall(p1, p2) {
  try {
    const walls = canvas?.walls?.placeables || [];
    if (!walls.length) return false;

    for (const wall of walls) {
      try {
        const d = wall.document;
        // Walls with sight=0 (does not block vision)
        if (!d || d.sight === 0) continue;

        // Skip walls explicitly marked as not providing cover
        try {
          const provides = d.getFlag?.(MODULE_ID, 'provideCover');
          if (provides === false) continue;
        } catch (_) { }

        // Skip open doors - they never provide cover
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

/**
 * Evaluate cover provided by walls between two points
 * @param {Object} p1 - Start point with x, y properties
 * @param {Object} p2 - End point with x, y properties
 * @returns {string} Cover state: 'standard' if walls block, 'none' otherwise
 */
export function evaluateWallsCover(p1, p2) {
  return segmentIntersectsAnyBlockingWall(p1, p2) ? 'standard' : 'none';
}