/**
 * Auto-cover system - Main entry point
 * This file replaces the old auto-cover.js with a cleaner interface
 */

import { autocover } from './auto-cover/index.js';

// Export the auto-cover API
export const autoCoverSystem = autocover;

// Export the main detection functions for backward compatibility
export const detectCoverStateFromPoint = (origin, target, options = {}) => {
    return autoCoverSystem.detectCoverFromPoint(origin, target, options);
};

export const detectCoverStateForAttack = (attacker, target, options = {}) => {
    return autoCoverSystem.detectCoverForAttack(attacker, target, options);
};

// Export pair tracking functions for backward compatibility
export const _recordPair = (attackerId, targetId) => {
    return autoCoverSystem.recordPair(attackerId, targetId);
};

export const _consumePairs = (attackerId) => {
    return autoCoverSystem.consumePairs(attackerId);
};

// Export pending overrides map for backward compatibility
export const _pendingOverrides = autoCoverSystem._pendingOverrides;

// Other exports as needed for backward compatibility
export const setCoverBetween = async (attacker, target, state, options = {}) => {
    return await autoCoverSystem.setCoverBetween(attacker, target, state, options);
};

export const getCoverBetween = (attacker, target) => {
    return autoCoverSystem.getCoverBetween(attacker, target);
};
