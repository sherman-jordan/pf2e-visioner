/**
 * Auto-cover API exports
 * This file provides a clean API for external modules to interact with the auto-cover system
 */

import { autocover } from './auto-cover/index.js';

// Public API for auto-cover system
export const autoCoverApi = {
    /**
     * Detect cover from a point to a target token
     * @param {Object} origin - Origin point with x,y coordinates
     * @param {Object} target - Target token
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectCoverFromPoint: (origin, target, options = {}) => {
        return autocover.detectCoverFromPoint(origin, target, options);
    },

    /**
     * Detect cover between two tokens
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {Object} options - Additional options
     * @returns {string} Cover state ('none', 'lesser', 'standard', 'greater')
     */
    detectCoverBetweenTokens: (attacker, target, options = {}) => {
        return autocover.detectCoverForAttack(attacker, target, options);
    },

    /**
     * Apply auto-cover between tokens
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @param {string} state - Cover state
     * @param {Object} options - Additional options
     * @returns {Promise}
     */
    setCoverBetween: (attacker, target, state, options = {}) => {
        return autocover.setCoverBetween(attacker, target, state, options);
    },

    /**
     * Clear auto-cover between tokens
     * @param {Object} attacker - Attacker token
     * @param {Object} target - Target token
     * @returns {Promise}
     */
    clearCoverBetween: (attacker, target) => {
        return autocover.setCoverBetween(attacker, target, 'none', { skipEphemeralUpdate: true });
    },

    /**
     * Check if auto-cover is enabled in settings
     * @returns {boolean}
     */
    isEnabled: () => {
        return autocover.isEnabled();
    },

    /**
     * Get the template manager for accessing template data
     * @returns {TemplateManager}
     */
    getTemplateManager: () => {
        return autocover.getTemplateManager();
    },
};
