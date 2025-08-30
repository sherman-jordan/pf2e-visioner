/**
 * Handles detection of manual action overrides for the auto-visibility system
 * Manages Point Out, Seek, Hide, and Sneak action detection and state management
 */

import { MODULE_ID } from '../../constants.js';

export class ManualOverrideDetector {
  constructor() {
    // No initialization needed for now
  }

  /**
   * Check specifically for Point Out overrides
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<boolean>}
   */
  async hasPointOutOverride(observer, target) {
    try {
      const observerId = observer?.document?.id;
      const targetId = target?.document?.id;
      
      if (!observerId || !targetId) return false;

      // Import the Point Out message cache
      const { appliedPointOutChangesByMessage } = await import('../../chat/services/data/message-cache.js');
      
      // Check for active Point Out actions (affecting observer's view of target)
      for (const [, changes] of appliedPointOutChangesByMessage.entries()) {
        if (Array.isArray(changes)) {
          for (const change of changes) {
            if (change.allyId === observerId && change.targetTokenId === targetId) {
              return true; // Point Out override active
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error(`${MODULE_ID} | Error checking Point Out override:`, error);
      return false;
    }
  }

  /**
   * Check for Seek overrides and return the visibility state
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string|null>} Visibility state from Seek ('hidden', 'observed') or null if no override
   */
  async getSeekOverride(observer, target) {
    try {
      const observerId = observer?.document?.id;
      const targetId = target?.document?.id;
      
      if (!observerId || !targetId) return null;

      // Import the Seek message cache
      const { appliedSeekChangesByMessage } = await import('../../chat/services/data/message-cache.js');
      
      // Check for active Seek actions (observer seeking target)
      for (const [messageId, changes] of appliedSeekChangesByMessage.entries()) {
        if (Array.isArray(changes)) {
          for (const change of changes) {
            if (change.targetId === targetId) {
              // For Seek, we need to check if this observer was the seeker
              const message = game.messages.get(messageId);
              const seekerId = message?.speaker?.token;
              
              if (seekerId === observerId) {
                // Return the visibility state based on Seek result
                // This should be stored in the change object
                return change.visibility || 'hidden'; // Default to hidden if not specified
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`${MODULE_ID} | Error checking Seek override:`, error);
      return null;
    }
  }

  /**
   * Check specifically for Sneak overrides while invisible
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<boolean>}
   */
  async hasSneakOverride(observer, target) {
    try {
      const observerId = observer?.document?.id;
      const targetId = target?.document?.id;
      
      if (!observerId || !targetId) return false;

      // Import the Sneak message cache
      const { appliedSneakChangesByMessage } = await import('../../chat/services/data/message-cache.js');
      
      // Check for active Sneak actions (target sneaking from observer)
      for (const [, changes] of appliedSneakChangesByMessage.entries()) {
        if (Array.isArray(changes)) {
          for (const change of changes) {
            // For Sneak, the target is the one who performed the action
            // Check if this target successfully sneaked from this observer
            if (change.targetId === targetId && change.observerId === observerId) {
              return true; // Sneak override active - invisible creature is undetected
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error(`${MODULE_ID} | Error checking Sneak override:`, error);
      return false;
    }
  }

  /**
   * Check if there's a manual visibility override that should prevent auto-calculation
   * Note: Point Out and Seek are handled separately in calculateVisibility()
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<boolean>}
   */
  async hasManualVisibilityOverride(observer, target) {
    try {
      // Check if there are any cached manual actions affecting this visibility relationship
      // This includes Hide, Sneak actions (Point Out and Seek handled separately)
      
      const observerId = observer?.document?.id;
      const targetId = target?.document?.id;
      
      if (!observerId || !targetId) return false;

      const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      if (debugMode) {
        console.log(`${MODULE_ID} | Checking manual override for ${observer.name} → ${target.name} (${observerId} → ${targetId})`);
      }

      // Import the message cache maps to check for active manual overrides
      const { 
        appliedHideChangesByMessage,
        appliedSneakChangesByMessage
      } = await import('../../chat/services/data/message-cache.js');

      // Check for active Hide actions (target hiding from observer)
      for (const [, changes] of appliedHideChangesByMessage.entries()) {
        if (Array.isArray(changes)) {
          for (const change of changes) {
            // For Hide, check if the target is hiding from this observer
            if (change.targetId === targetId && change.observerId === observerId) {
              if (debugMode) {
                console.log(`${MODULE_ID} | Found Hide override: target ${targetId} hiding from observer ${observerId}`);
              }
              return true; // Manual Hide override active
            }
          }
        }
      }

      // Check for active Sneak actions (target sneaking from observer)
      // Note: This is different from the Sneak check in invisibility - this is for general stealth
      for (const [, changes] of appliedSneakChangesByMessage.entries()) {
        if (Array.isArray(changes)) {
          for (const change of changes) {
            // For Sneak, check if the target is sneaking from this observer
            if (change.targetId === targetId && change.observerId === observerId) {
              if (debugMode) {
                console.log(`${MODULE_ID} | Found Sneak override: target ${targetId} sneaking from observer ${observerId}`);
              }
              return true; // Manual Sneak override active
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error(`${MODULE_ID} | Error checking manual visibility override:`, error);
      return false;
    }
  }

  /**
   * Get debug information about manual overrides
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<Object>} Debug information
   */
  async getDebugInfo(observer, target) {
    if (!observer?.actor || !target?.actor) {
      return { error: 'Missing observer or target actor' };
    }

    try {
      const [pointOut, seek, sneak, general] = await Promise.all([
        this.hasPointOutOverride(observer, target),
        this.getSeekOverride(observer, target),
        this.hasSneakOverride(observer, target),
        this.hasManualVisibilityOverride(observer, target)
      ]);

      return {
        observer: observer.name,
        target: target.name,
        overrides: {
          pointOut,
          seek,
          sneak,
          general
        }
      };
    } catch (error) {
      return {
        observer: observer.name,
        target: target.name,
        error: error.message
      };
    }
  }

  /**
   * Check all manual overrides and return combined result
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<Object>} Combined override information
   */
  async checkAllOverrides(observer, target) {
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    
    try {
      // Check Point Out override
      const hasPointOut = await this.hasPointOutOverride(observer, target);
      if (hasPointOut && debugMode) {
        console.log(`${MODULE_ID} | Point Out override found: ${observer.name} → ${target.name}`);
      }

      // Check Seek override
      const seekOverride = await this.getSeekOverride(observer, target);
      if (seekOverride && debugMode) {
        console.log(`${MODULE_ID} | Seek override found: ${observer.name} → ${target.name} = ${seekOverride}`);
      }

      // Check general manual overrides (Hide/Sneak)
      const hasGeneral = await this.hasManualVisibilityOverride(observer, target);

      return {
        pointOut: hasPointOut,
        seek: seekOverride,
        hasGeneral,
        hasAny: hasPointOut || !!seekOverride || hasGeneral
      };
    } catch (error) {
      console.error(`${MODULE_ID} | Error checking all overrides:`, error);
      return {
        pointOut: false,
        seek: null,
        hasGeneral: false,
        hasAny: false,
        error: error.message
      };
    }
  }
}
