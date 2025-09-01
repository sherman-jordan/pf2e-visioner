/**
 * Wall Detection Module
 * Handles wall intersection detection and cover evaluation from walls
 */

import { MODULE_ID } from '../constants.js';
import { segmentsIntersect } from './geometry-utils.js';

/**
 * Check if a wall blocks sight from a given direction based on its sight settings
 * @param {Object} wallDoc - Wall document
 * @param {Object} attackerPos - Attacker position {x, y}
 * @param {Object} targetPos - Target position {x, y}
 * @returns {boolean} True if wall blocks sight from attacker to target
 */
function doesWallBlockFromDirection(wallDoc, attackerPos, targetPos) {
  try {
    // If wall doesn't block sight at all, it doesn't provide cover
    if (wallDoc.sight === 0) return false; // NONE
    
      // Check if wall has a direction (directional wall)
  // Foundry stores directional restrictions in the 'dir' property
  if (wallDoc.dir != null && typeof wallDoc.dir === 'number') {
      // Get wall coordinates
      const [x1, y1, x2, y2] = Array.isArray(wallDoc.c) ? wallDoc.c : [wallDoc.x, wallDoc.y, wallDoc.x2, wallDoc.y2];
      
      // Calculate wall direction vector
      const wallDx = x2 - x1;
      const wallDy = y2 - y1;
      
      // Calculate vector from wall start to attacker
      const attackerDx = attackerPos.x - x1;
      const attackerDy = attackerPos.y - y1;
      
      // Use cross product to determine which side of the wall the attacker is on
      const crossProduct = wallDx * attackerDy - wallDy * attackerDx;
      
      // For directional walls, they block from one direction only
      return crossProduct > 0;
    }
    
    // For non-directional walls, they block from both sides
    return true;
    
  } catch (error) {
    console.warn('PF2E Visioner | Error checking wall direction:', error);
    return true; // Default to blocking if we can't determine
  }
}

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
        // Check if wall blocks sight from this direction
        if (!d || !doesWallBlockFromDirection(d, p1, p2)) continue;

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