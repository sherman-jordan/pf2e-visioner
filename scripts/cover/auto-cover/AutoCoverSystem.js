/**
 * Main manager for the auto-cover system
 * Coordinates between different subsystems and provides main API
 */

import { MODULE_ID } from '../../constants.js';
import { CoverDetector } from './CoverDetector.js';
import { CoverStateManager } from './CoverStateManager.js';
import { TemplateManager } from './TemplateManager.js';

export class AutoCoverSystem {
    /**
     * @type {CoverDetector}
     * @private
     */
    _detector = null;

    /**
     * @type {CoverStateManager}
     * @private
     */
    _stateManager = null;

    /**
     * @type {TemplateManager}
     * @private
     */
    _templateManager = null;

    /**
     * Store attacker→target pairs for cleanup
     * @type {Map<string, Set<string>>}
     * @private
     */
    _activePairsByAttacker = new Map();

    /**
     * @type {Map<string, Object>}
     * @private
     */
    _pendingOverrides = new Map();

    constructor() {
        this._detector = new CoverDetector();
        this._stateManager = new CoverStateManager();
        this._templateManager = new TemplateManager();

        // Initialize global template trackers if needed
        if (!window.pf2eVisionerTemplateData) {
            window.pf2eVisionerTemplateData = new Map();
        }

        if (!window.pf2eVisionerActiveReflexSaves) {
            window.pf2eVisionerActiveReflexSaves = new Map();
        }
    }

    /**
     * Check if auto-cover is enabled in settings
     * @returns {boolean}
     */
    isEnabled() {
        return game.settings.get(MODULE_ID, 'autoCover');
    }

    /**
     * Records an attacker-target pair for later cleanup
     * @param {string} attackerId 
     * @param {string} targetId 
     */
    recordPair(attackerId, targetId) {
        if (!attackerId || !targetId) return;
        let set = this._activePairsByAttacker.get(attackerId);
        if (!set) {
            set = new Set();
            this._activePairsByAttacker.set(attackerId, set);
        }
        set.add(targetId);
    }

    /**
     * Consumes and returns all target IDs associated with an attacker
     * @param {string} attackerId 
     * @returns {Array<string>}
     */
    consumePairs(attackerId) {
        const set = this._activePairsByAttacker.get(attackerId);
        if (!set) return [];
        const arr = Array.from(set);
        this._activePairsByAttacker.delete(attackerId);
        return arr;
    }

    /**
     * Gets all active pairs involving a specific token ID
     * @param {string} tokenId 
     * @returns {Array<Array<string>>} Array of [attackerId, targetId] pairs
     */
    getActivePairsInvolving(tokenId) {
        const pairs = [];
        // As attacker
        const tset = this._activePairsByAttacker.get(tokenId);
        if (tset && tset.size > 0) {
            for (const targetId of tset) pairs.push([tokenId, targetId]);
        }
        // As target
        for (const [attackerId, set] of this._activePairsByAttacker.entries()) {
            if (set.has(tokenId)) pairs.push([attackerId, tokenId]);
        }
        return pairs;
    }

    /**
     * Detects cover from a point to a target
     * @param {Object} origin - Point with x,y coordinates
     * @param {Object} target - Target token
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectCoverFromPoint(origin, target, options = {}) {
        return this._detector.detectFromPoint(origin, target, options);
    }

    /**
     * Detects cover between an attacker and target
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectCoverForAttack(attacker, target, options = {}) {
        return this._detector.detectForAttack(attacker, target, options);
    }

    /**
     * Applies auto-cover between two tokens
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {string} state - Cover state
     * @param {Object} options - Additional options
     */
    async setCoverBetween(attacker, target, state, options = {}) {
        return this._stateManager.setCoverBetween(attacker, target, state, options);
    }

    getCoverBetween(attacker, target) {
        return this._stateManager.getCoverBetween(attacker, target);
    }

    /**
     * Cleans up cover for an attacker-target pair
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     */
    async cleanupCover(attacker, target) {
        if (!attacker || !target) return;
        await this.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
    }

    /**
     * Stores a cover override
     * @param {string} messageId 
     * @param {Object} data 
     */
    storeOverride(key, data) {
        this._pendingOverrides.set(key, data);
    }

    /**
     * Gets a pending override
     * @param {string} messageId 
     * @returns {Object|null}
     */
    getOverride(key) {
        return this._pendingOverrides.get(key);
    }

    /**
     * Gets the template manager
     * @returns {TemplateManager}
     */
    getTemplateManager() {
        return this._templateManager;
    }

    /**
     * Handle system initialization when Foundry is ready
     * This method is called by AutoCoverHooks.onReady
     */
    onReady() {
        console.debug('PF2E Visioner | Auto-cover system ready event handler');

        // Additional initialization can be performed here if needed
        // For now, we'll just log that we're ready
    }

    /**
     * Remove all cover involving a specific token
     * @param {string} tokenId - Token ID
     */
    removeAllCoverInvolving(tokenId) {
        // As attacker: delete all entries from this attacker
        this._activePairsByAttacker.delete(tokenId);

        // As target: remove from any attackers that target this token
        for (const [, targets] of this._activePairsByAttacker.entries()) {
            if (targets.has(tokenId)) {
                targets.delete(tokenId);
            }
        }
    }
}

// Singleton instance
const autoCoverSystem = new AutoCoverSystem();
export default autoCoverSystem;
