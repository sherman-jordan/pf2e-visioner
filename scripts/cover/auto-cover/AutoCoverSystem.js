/**
 * Main manager for the auto-cover system
 * Coordinates between different subsystems and provides main API
 */

import { MODULE_ID } from '../../constants.js';
import { CoverOverrideManager } from '../CoverOverrideManager.js';
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
     * @type {CoverOverrideManager}
     * @private
     */
    _overrideManager = null;

    /**
     * Store attacker→target pairs for cleanup
     * @type {Map<string, Set<string>>}
     * @private
     */
    _activePairsByAttacker = new Map();


    constructor() {
        this._detector = new CoverDetector();
        this._stateManager = new CoverStateManager();
        this._templateManager = new TemplateManager();
        this._overrideManager = new CoverOverrideManager(); // Use global singleton

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
    detectCoverBetweenTokens(attacker, target, options = {}) {
        return this._detector.detectBetweenTokens(attacker, target, options);
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
     * Gets the override manager
     * @returns {CoverOverrideManager}
     */
    getOverrideManager() {
        return this._overrideManager;
    }

    /**
     * Set a popup override for token pair
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {string} coverState 
     * @param {string} originalState 
     */
    setPopupOverride(token1, token2, coverState, originalState) {
        this._overrideManager.setPopupOverride(token1, token2, coverState, originalState);
    }

    /**
     * Set a dialog override for token pair
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {string} coverState 
     * @param {string} originalState 
     */
    setDialogOverride(token1, token2, coverState, originalState) {
        this._overrideManager.setDialogOverride(token1, token2, coverState, originalState);
    }

    setRollOverride(token1, token2, rollId, originalState, coverState) {
        this._overrideManager.setRollOverride(token1, token2, coverState, originalState, rollId);
    }

    /**
     * Get and consume override for token pair
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {string} rollId 
     * @param {boolean} deleteOnConsume - Whether to delete the override after consuming (default: true)
     * @returns {Object|null}
     */
    consumeCoverOverride(token1, token2, rollId = null, deleteOnConsume = true) {
        return this._overrideManager.consumeOverride(token1, token2, rollId, deleteOnConsume);
    }

    /**
     * Get popup override for token pair without consuming
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @returns {Object|null}
     */
    getPopupOverride(token1, token2) {
        return this._overrideManager.getPopupOverride(token1, token2);
    }

    /**
     * Get dialog override for token pair without consuming
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @returns {Object|null}
     */
    getDialogOverride(token1, token2) {
        return this._overrideManager.getDialogOverride(token1, token2);
    }

    /**
     * Consume popup override only
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {boolean} deleteOnConsume 
     * @returns {Object|null}
     */
    consumePopupOverride(token1, token2, deleteOnConsume = true) {
        return this._overrideManager.consumePopupOverride(token1, token2, deleteOnConsume);
    }

    /**
     * Consume dialog override only
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {boolean} deleteOnConsume 
     * @returns {Object|null}
     */
    consumeDialogOverride(token1, token2, deleteOnConsume = true) {
        return this._overrideManager.consumeDialogOverride(token1, token2, deleteOnConsume);
    }

    /**
     * Check if there's an override for token pair
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     * @param {string} rollId 
     * @returns {boolean}
     */
    hasCoverOverride(token1, token2, rollId = null) {
        return this._overrideManager.hasOverride(token1, token2, rollId);
    }

    /**
     * Clear overrides for a token pair
     * @param {Object|string} token1 
     * @param {Object|string} token2 
     */
    clearCoverOverrides(token1, token2) {
        this._overrideManager.clearOverrides(token1, token2);
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
