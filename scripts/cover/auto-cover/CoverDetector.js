/**
 * CoverDetector.js
 * Handles the logic for detecting cover between tokens or points
 */

import { MODULE_ID } from '../../constants.js';
import { distancePointToSegment, segmentIntersectsRect } from '../../helpers/geometry-utils.js';
import { intersectsBetweenTokens, segmentRectIntersectionLength } from '../../helpers/line-intersection.js';
import { getSizeRank, getTokenCorners, getTokenRect, getTokenVerticalSpanFt } from '../../helpers/size-elevation-utils.js';
import { segmentIntersectsAnyBlockingWall } from '../../helpers/wall-detection.js';
import { getVisibilityBetween } from '../../utils.js';

export class CoverDetector {
    // Define token disposition constants for use within this class
    static TOKEN_DISPOSITIONS = {
        FRIENDLY: 1,
        NEUTRAL: 0,
        HOSTILE: -1
    };
    /**
     * Detect cover using an arbitrary origin point instead of an attacker token
     * @param {Object} origin - Point with x,y coordinates
     * @param {Object} target - Target token 
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectFromPoint(origin, target, options = {}) {
        try {
            if (!origin || !target) return 'none';

            // Build a minimal attacker-like object with a center at the origin point
            const pseudoAttacker = {
                id: 'template-origin',
                center: { x: Number(origin.x) || 0, y: Number(origin.y) || 0 },
                getCenter: () => ({ x: Number(origin.x) || 0, y: Number(origin.y) || 0 }),
                actor: null,
                document: { x: origin.x, y: origin.y, width: 0, height: 0 },
            };

            // Reuse the normal path using the pseudo attacker
            return this.detectBetweenTokens(pseudoAttacker, target, options);
        } catch (error) {
            console.error('PF2E Visioner | CoverDetector.detectFromPoint error:', error);
            return 'none';
        }
    }

    /**
     * Detect cover state for an attack between two tokens
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectBetweenTokens(attacker, target) {
        try {
            if (!attacker || !target) return 'none';

            // Exclude same token (attacker and target are the same)
            if (attacker.id === target.id) return 'none';

            const p1 = attacker.center ?? attacker.getCenter();
            const p2 = target.center ?? target.getCenter();

            // Walls
            const wallCover = this._evaluateWallsCover(p1, p2);

            // Token blockers
            const intersectionMode = this._getIntersectionMode();
            const filters = { ...this._getAutoCoverFilterSettings(attacker) };
            let blockers = this._getEligibleBlockingTokens(attacker, target, filters);

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
                } catch (_) { }
            }


            // Determine token cover based on intersection mode
            let tokenCover;
            if (intersectionMode === 'sampling3d') {
                tokenCover = this._evaluateCoverBy3DSampling(attacker, target, blockers);
            } else if (intersectionMode === 'tactical') {
                tokenCover = this._evaluateCoverByTactical(attacker, target, blockers);
            } else if (intersectionMode === 'coverage') {
                tokenCover = this._evaluateCoverByCoverage(attacker, target, blockers);
            } else {
                tokenCover = this._evaluateCreatureSizeCover(attacker, target, blockers);
            }

            // Combine wall and token cover (walls can now yield standard or greater)
            if (wallCover === 'greater') return 'greater';
            if (wallCover === 'standard') return tokenCover === 'greater' ? 'greater' : 'standard';
            return tokenCover;
        } catch (error) {
            console.error('PF2E Visioner | CoverDetector.detectForAttack error:', error);
            return 'none';
        }
    }

    /**
     * Get the intersection mode from settings
     * @returns {string}
     * @private
     */
    _getIntersectionMode() {
        try {
            const mode = game.settings.get('pf2e-visioner', 'autoCoverTokenIntersectionMode');
            return mode || 'tactical';
        } catch (error) {
            console.warn('PF2E Visioner | Could not read autoCoverTokenIntersectionMode setting, using default', error);
            return 'tactical';
        }
    }

    /**
     * Get auto cover filter settings
     * @param {Object} attacker 
     * @returns {Object}
     * @private
     */
    _getAutoCoverFilterSettings(attacker) {
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

    /**
     * Helper method to safely get a setting with a default fallback
     * @param {string} key - The setting key
     * @param {any} defaultValue - Default value if setting doesn't exist
     * @returns {any} - The setting value or default
     * @private
     */
    _getSetting(key, defaultValue) {
        try {
            return game.settings.get('pf2e-visioner', key) ?? defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    /**
     * Evaluate walls cover
     * @param {Object} p1 
     * @param {Object} p2 
     * @returns {string}
     * @private
     */
    _evaluateWallsCover(p1, p2) {
        if (!canvas?.walls) return 'none';

        // Compute percent of target token blocked by walls along multiple sight rays and map to cover thresholds
        try {
            const stdT = Math.max(0, Number(game.settings.get('pf2e-visioner', 'wallCoverStandardThreshold') ?? 50));
            const grtT = Math.max(0, Number(game.settings.get('pf2e-visioner', 'wallCoverGreaterThreshold') ?? 70));

            // Resolve a lightweight target token from p2 (best-effort)
            const target = this._findNearestTokenToPoint(p2);
            if (!target) {
                // Fallback: single-ray quick test if we cannot resolve the token geometry
                const ray = this._createRay(p1, p2);
                let blocked = false;
                try {
                    if (CONFIG?.Canvas?.polygonBackends?.sight) blocked = CONFIG.Canvas.polygonBackends.sight.testCollision(p1, p2, { type: 'sight', mode: 'any' });
                    else if (typeof canvas.walls.raycast === 'function') blocked = !!canvas.walls.raycast(ray.A, ray.B);
                    else if (typeof canvas.walls.checkCollision === 'function') blocked = canvas.walls.checkCollision(ray, { type: 'light', mode: 'any' });
                } catch (_) { }
                return blocked ? 'standard' : 'none';
            }

            const pct = this._estimateWallCoveragePercent(p1, target);
            const allowGreater = !!game.settings.get('pf2e-visioner', 'wallCoverAllowGreater');
            if (pct >= grtT) return allowGreater ? 'greater' : 'standard';
            if (pct >= stdT) return 'standard';
            return 'none';
        } catch (error) {
            console.warn('PF2E Visioner | Error in wall coverage evaluation:', error);
            return 'none';
        }
    }

    /**
     * Find nearest token to a point (screen coords). Best-effort helper for wall coverage.
     */
    _findNearestTokenToPoint(p) {
        try {
            const tokens = canvas?.tokens?.placeables || [];
            let best = null;
            let bestD = Infinity;
            for (const t of tokens) {
                const c = t.center ?? t.getCenter?.();
                if (!c) continue;
                const dx = c.x - p.x; const dy = c.y - p.y;
                const d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = t; }
            }
            return best;
        } catch (_) { return null; }
    }

    /**
     * Estimate percent of the target token's edge directions that are blocked by walls from origin p1.
     * Samples multiple points along the target perimeter and casts rays to each, counting wall collisions.
     */
    _estimateWallCoveragePercent(p1, target) {
        try {
            const rect = getTokenRect(target);
            const points = [];
            const samplePerEdge = 5; // 4 edges * 5 = 20 sample points
            const pushLerp = (ax, ay, bx, by) => {
                for (let i = 0; i <= samplePerEdge; i++) {
                    const t = i / samplePerEdge;
                    points.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
                }
            };
            // Edges: top, right, bottom, left
            pushLerp(rect.x1, rect.y1, rect.x2, rect.y1);
            pushLerp(rect.x2, rect.y1, rect.x2, rect.y2);
            pushLerp(rect.x2, rect.y2, rect.x1, rect.y2);
            pushLerp(rect.x1, rect.y2, rect.x1, rect.y1);

            let blocked = 0;
            const testRayBlocked = (a, b) => {
                const ray = this._createRay(a, b);
                try {
                    if (CONFIG?.Canvas?.polygonBackends?.sight) return !!CONFIG.Canvas.polygonBackends.sight.testCollision(a, b, { type: 'sight', mode: 'any' });
                    if (typeof canvas.walls.raycast === 'function') return !!canvas.walls.raycast(ray.A, ray.B);
                    if (typeof canvas.walls.checkCollision === 'function') return !!canvas.walls.checkCollision(ray, { type: 'light', mode: 'any' });
                } catch (_) { }
                // Fallback: simple segment-vs-wall iteration (best-effort)
                const walls = canvas.walls.objects?.children || [];
                for (const wall of walls) {
                    const c = wall?.coords;
                    if (!c) continue;
                    if (this._lineIntersection(ray.A.x, ray.A.y, ray.B.x, ray.B.y, c[0], c[1], c[2], c[3])) return true;
                }
                return false;
            };

            for (const pt of points) {
                if (testRayBlocked(p1, pt)) blocked++;
            }

            const pct = (blocked / Math.max(1, points.length)) * 100;
            return pct;
        } catch (_) { return 0; }
    }

    /**
     * Get eligible blocking tokens
     * @param {Object} attacker 
     * @param {Object} target 
     * @param {Object} filters 
     * @returns {Array}
     * @private
     */
    _getEligibleBlockingTokens(attacker, target, filters) {
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
                } catch (_) { }
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
                } catch (_) { }
            }
            if (filters.ignoreAllies && blocker.actor?.alliance === filters.attackerAlliance) {
                continue;
            }

            out.push(blocker);
        }

        return out;
    }

    /**
     * Helper method to create a ray object
     * @param {Object} p1 - Start point {x, y}
     * @param {Object} p2 - End point {x, y}
     * @returns {Object} - A ray-like object with A, B, and distance properties
     * @private
     */
    _createRay(p1, p2) {
        // Use Foundry V13+ namespaced Ray class if available
        if (foundry?.canvas?.geometry?.Ray) {
            return new foundry.canvas.geometry.Ray(p1, p2);
        }
        // Fallback to global Ray if available (pre-V13)
        else if (typeof globalThis.Ray !== 'undefined') {
            return new globalThis.Ray(p1, p2);
        }

        // Otherwise, create a simple ray-like object
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return {
            A: { x: p1.x, y: p1.y },
            B: { x: p2.x, y: p2.y },
            distance: distance
        };
    }

    /**
     * Evaluate cover by 3D sampling
     * @param {Object} attacker 
     * @param {Object} target 
     * @param {Array} blockers 
     * @returns {string}
     * @private
     */
    _evaluateCoverBy3DSampling(attacker, target, blockers) {
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
                for (const b of blockers) {
                    try {
                        const bs = getTokenVerticalSpanFt(b);
                        if (overlapsZ(bs, z)) blockersAtZ.push(b);
                    } catch (_) { }
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
                        } catch (_) { }
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

    /**
     * Evaluate cover provided by the creature's size
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {Array} blockers - Array of potential blocking tokens
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     * @private
     */
    _evaluateCreatureSizeCover(attacker, target, blockers) {
        try {
            if (!attacker || !target) return 'none';

            let any = false;
            let standard = false;
            const attackerSize = getSizeRank(attacker);
            const targetSize = getSizeRank(target);

            for (const blocker of blockers) {
                // Skip if blocker is the same as attacker or target
                if (blocker.id === attacker.id || blocker.id === target.id) continue;

                const rect = getTokenRect(blocker);

                // Create rectangle in the format expected by intersectsBetweenTokens
                const rectForIntersection = {
                    x1: rect.x1,
                    y1: rect.y1,
                    x2: rect.x2,
                    y2: rect.y2
                };

                // Check if blocker intersects between tokens
                if (!intersectsBetweenTokens(attacker, target, rectForIntersection, this._getIntersectionMode(), blocker)) continue;

                any = true;
                const blockerSize = getSizeRank(blocker);
                const sizeDiffAttacker = blockerSize - attackerSize;
                const sizeDiffTarget = blockerSize - targetSize;
                const grantsStandard = sizeDiffAttacker >= 2 && sizeDiffTarget >= 2;

                if (grantsStandard) standard = true;
            }

            const result = any ? (standard ? 'standard' : 'lesser') : 'none';

            return result;
        } catch (error) {
            console.error('PF2E Visioner | Error in evaluateCreatureSizeCover:', error);
            return 'none';
        }
    }

    // Using segmentIntersectsRect from geometry-utils.js instead of _rayIntersectRect

    /**
     * Evaluate cover by tactical rules
     * @param {Object} attacker 
     * @param {Object} target 
     * @param {Array} blockers 
     * @returns {string}
     * @private
     */
    _evaluateCoverByTactical(attacker, target, blockers) {
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

            // Check lines from all target corners to this attacker corner
            for (let t = 0; t < targetCorners.length; t++) {
                const targetCorner = targetCorners[t];
                let lineBlocked = false;

                // Check if this line is blocked by walls
                if (segmentIntersectsAnyBlockingWall(targetCorner, attackerCorner)) {
                    lineBlocked = true;
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
     * Evaluate cover by coverage percentage
     * @param {Object} attacker 
     * @param {Object} target 
     * @param {Array} blockers 
     * @returns {string}
     * @private
     */
    _evaluateCoverByCoverage(attacker, target, blockers) {
        try {
            // If no blockers, no cover
            if (!blockers.length) return 'none';

            // Get centers
            const p1 = attacker.center ?? attacker.getCenter();
            const p2 = target.center ?? target.getCenter();

            // Calculate total coverage by all blockers
            let totalCoverage = 0;

            for (const blocker of blockers) {
                // Calculate coverage contribution of this blocker
                const coverage = this._calculateCoverageByBlocker(p1, p2, [blocker]);
                totalCoverage += coverage;
            }

            // Cap total coverage at 100%
            totalCoverage = Math.min(totalCoverage, 100);

            // Determine cover based on percentage
            if (totalCoverage >= 75) return 'greater';
            if (totalCoverage >= 50) return 'standard';
            if (totalCoverage >= 20) return 'lesser';
            return 'none';
        } catch (error) {
            console.error('PF2E Visioner | Error in evaluateCoverByCoverage:', error);
            return 'none';
        }
    }

    /**
     * Basic 2D line segment intersection test.
     */
    _lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d === 0) return false;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = -(((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d);
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    /**
     * Calculate coverage percentage by a single blocker
     * @param {Object} blocker - The blocker token
     * @param {Ray} ray - The ray from attacker to target
     * @param {number} rayLength - The length of the ray
     * @returns {number} - Coverage percentage (0-100)
     * @private
     */
    _calculateCoverageByBlocker(p1, p2, blockers) {
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
}

const coverDetector = new CoverDetector();
export default coverDetector;
