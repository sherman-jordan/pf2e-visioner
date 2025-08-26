/**
 * TemplateManager.js
 * Manages template-related cover data for area effects
 */

import { CoverDetector } from './CoverDetector.js';

export class TemplateManager {
    /**
     * Flag scope for template data
     * @type {string}
     * @readonly
     */
    static FLAG_SCOPE = 'pf2e-visioner';
    /**
     * Map of template data
     * @type {Map<string, Object>}
     * @private
     */
    _templateData = null;

    /**
     * Map of active reflex saves
     * @type {Map<string, Object>}
     * @private
     */
    _activeReflexSaves = null;

    /**
     * Map of template origins by token ID
     * @type {Map<string, Object>}
     * @private
     */
    _templateOrigins = null;

    constructor() {
        // Initialize or reference global maps for template data
        this._templateData = window.pf2eVisionerTemplateData = window.pf2eVisionerTemplateData || new Map();
        this._activeReflexSaves = window.pf2eVisionerActiveReflexSaves = window.pf2eVisionerActiveReflexSaves || new Map();
        this._templateOrigins = window.pf2eVisionerTemplateOrigins = window.pf2eVisionerTemplateOrigins || new Map();

        // Start cleanup timer
        this._startCleanupTimer();
    }

    /**
     * Starts a timer to clean up old template data
     * @private
     */
    _startCleanupTimer() {
        // Clean up old templates every minute
        setInterval(() => {
            try {
                this.cleanupOldTemplates();
            } catch (error) {
                console.error('PF2E Visioner | Error in template cleanup:', error);
            }
        }, 60000);
    }

    /**
     * Removes templates older than 10 minutes
     */
    cleanupOldTemplates() {
        const now = Date.now();
        const oldTemplates = [];

        for (const [id, data] of this._templateData.entries()) {
            // Keep templates with active reflex saves regardless of age
            if (this._activeReflexSaves.has(id)) continue;

            // Remove templates older than 10 minutes
            if (now - data.timestamp > 600000) { // 10 minutes
                oldTemplates.push(id);
            }
        }

        // Only remove template data from our maps, don't delete templates from canvas
        for (const id of oldTemplates) {
            this._templateData.delete(id);
        }

        if (oldTemplates.length > 0) {
            console.debug('PF2E Visioner | Template data cleanup:', {
                removedCount: oldTemplates.length,
                remainingCount: this._templateData.size
            });
        }
    }

    /**
     * Registers a new template with all tokens inside it
     * @param {Object} document - Template document
     * @param {string} creatorId - ID of the token that created the template
     * @returns {Object} Template data
     */
    registerTemplate(document, creatorId = null) {
        try {
            if (!document?.id) return null;

            // Get template details
            const x = Number(document?.x ?? 0);
            const y = Number(document?.y ?? 0);
            const center = { x, y };
            const tType = String(document.t || document.type || 'circle');
            const radiusFeet = Number(document.distance) || 0;
            const dirDeg = Number(document.direction ?? 0);
            const halfAngle = Number(document.angle ?? 90) / 2;

            // Find all tokens inside the template
            const tokensInside = this._findTokensInsideTemplate(center, radiusFeet, tType, dirDeg, halfAngle);

            // Calculate cover for each token and store data
            const targetData = {};
            const tokenIds = [];

            for (const token of tokensInside) {
                try {
                    // Calculate cover from template center to token
                    const state = this._calculateCoverFromCenter(center, token);
                    const bonus = this._getCoverBonus(state);

                    targetData[token.id] = {
                        tokenId: token.id,
                        tokenName: token.name,
                        actorId: token.actor?.id,
                        actorName: token.actor?.name,
                        state,
                        bonus,
                        saveProcessed: false
                    };

                    tokenIds.push(token.id);
                } catch (error) {
                    console.error('PF2E Visioner | Error calculating cover for token:', error);
                }
            }

            // Store template data with all targets inside it
            const templateData = {
                id: document.id,
                type: tType,
                center,
                radiusFeet,
                dirDeg,
                halfAngle,
                creatorId,
                tokenIds,
                targets: targetData,
                timestamp: Date.now()
            };

            this._templateData.set(document.id, templateData);

            // Also store in the template origins map for backwards compatibility
            if (creatorId && !creatorId.startsWith('actor:')) {
                this._templateOrigins.set(creatorId, {
                    point: center,
                    shape: {
                        t: tType,
                        distance: radiusFeet,
                        direction: dirDeg,
                        angle: halfAngle * 2,
                    },
                    ts: Date.now(),
                    templateId: document.id
                });
            }

            console.debug('PF2E Visioner | Template registered:', {
                templateId: document.id,
                tokenCount: tokenIds.length,
                creatorId
            });

            return templateData;
        } catch (error) {
            console.error('PF2E Visioner | Error registering template:', error);
            return null;
        }
    }

    /**
     * Find tokens inside a template area
     * @param {Object} center - Template center point
     * @param {number} radiusFeet - Template radius in feet
     * @param {string} tType - Template type ('circle', 'cone', etc.)
     * @param {number} dirDeg - Direction in degrees
     * @param {number} halfAngle - Half angle in degrees (for cones)
     * @returns {Array} Tokens inside the template
     * @private
     */
    _findTokensInsideTemplate(center, radiusFeet, tType, dirDeg, halfAngle) {
        const gridSize = canvas.grid?.size || 100;
        const feetPerSquare = canvas.dimensions?.distance || 5;
        const radiusSquares = radiusFeet / feetPerSquare;
        const radiusWorld = radiusSquares * gridSize;

        const candidates = canvas.tokens.placeables.filter((t) => t?.actor);

        const norm = (a) => ((a % 360) + 360) % 360;
        const angDist = (a, b) => {
            const d = Math.abs(norm(a) - norm(b));
            return d > 180 ? 360 - d : d;
        };

        return candidates.filter((t) => {
            try {
                const cx = (t.center?.x ?? t.x);
                const cy = (t.center?.y ?? t.y);
                const dx = cx - center.x;
                const dy = cy - center.y;
                const dist = Math.hypot(dx, dy);

                if (dist > radiusWorld + 1) return false;
                if (tType === 'cone') {
                    const theta = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
                    const delta = angDist(theta, dirDeg);
                    return delta <= halfAngle + 0.5; // small tolerance
                }
                // Default: circle-like
                return true;
            } catch (_) {
                return false;
            }
        });
    }

    /**
     * Calculate cover from template center to token
     * @param {Object} center - Template center point
     * @param {Object} token - Token to check
     * @returns {string} Cover state
     * @private
     */
    _calculateCoverFromCenter(center, token) {
        try {
            // Use our CoverDetector class to detect cover from the template's center point to the token
            const detector = new CoverDetector();
            return detector.detectFromPoint(center, token);
        } catch (error) {
            console.error('PF2E Visioner | Error calculating cover from center:', error);
            return 'none';
        }
    }

    /**
     * Get cover bonus for a state
     * @param {string} state - Cover state
     * @returns {number} Bonus value
     * @private
     */
    _getCoverBonus(state) {
        switch (state) {
            case 'lesser':
                return 1;
            case 'standard':
                return 2;
            case 'greater':
                return 4;
            default:
                return 0;
        }
    }

    /**
     * Get template data by ID
     * @param {string} templateId 
     * @returns {Object|null}
     */
    getTemplateData(templateId) {
        return this._templateData.get(templateId) || null;
    }

    /**
     * Mark a template as being used for reflex saves
     * @param {string} templateId 
     */
    markTemplateActive(templateId) {
        if (!templateId) return;
        this._activeReflexSaves.set(templateId, { ts: Date.now() });
    }

    /**
     * Unmark a template as being used for reflex saves
     * @param {string} templateId 
     */
    unmarkTemplateActive(templateId) {
        if (!templateId) return;
        this._activeReflexSaves.delete(templateId);
    }

    /**
     * Get template origin for a token
     * @param {string} tokenId 
     * @returns {Object|null}
     */
    getTemplateOrigin(tokenId) {
        return this._templateOrigins.get(tokenId) || null;
    }

    /**
     * Set template origin for a token
     * @param {string} tokenId 
     * @param {Object} origin 
     */
    setTemplateOrigin(tokenId, origin) {
        if (!tokenId || !origin) return;
        this._templateOrigins.set(tokenId, {
            ...origin,
            ts: Date.now()
        });
    }

    /**
     * Remove template data
     * @param {string} templateId 
     */
    removeTemplateData(templateId) {
        if (!templateId) return;
        this._templateData.delete(templateId);
        this._activeReflexSaves.delete(templateId);
    }
}
