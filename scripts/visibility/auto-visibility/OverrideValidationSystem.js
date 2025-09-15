/**
 * OverrideValidationSystem - Manages validation of visibility overrides when tokens move
 * Handles checking if stored override conditions still match current visibility state
 * Shows validation dialogs and manages override cleanup
 */

export class OverrideValidationSystem {
  /** @type {OverrideValidationSystem} */
  static #instance = null;

  /** @type {boolean} */
  #enabled = false;

  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

  /** @type {EventDrivenVisibilitySystem} - Reference to main visibility system */
  #visibilitySystem = null;

  constructor(visibilitySystem) {
    if (OverrideValidationSystem.#instance) {
      return OverrideValidationSystem.#instance;
    }
    
    this.#visibilitySystem = visibilitySystem;
    OverrideValidationSystem.#instance = this;
  }

  /**
   * Get singleton instance
   * @param {EventDrivenVisibilitySystem} visibilitySystem - Main visibility system
   * @returns {OverrideValidationSystem}
   */
  static getInstance(visibilitySystem) {
    if (!OverrideValidationSystem.#instance) {
      OverrideValidationSystem.#instance = new OverrideValidationSystem(visibilitySystem);
    }
    return OverrideValidationSystem.#instance;
  }

  /**
   * Enable the validation system
   */
  enable() {
    this.#enabled = true;
    console.log('PF2E Visioner | Override Validation System enabled');
  }

  /**
   * Disable the validation system
   */
  disable() {
    this.#enabled = false;
    this.#tokensQueuedForValidation.clear();
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
      this.#validationTimeoutId = null;
    }
    console.log('PF2E Visioner | Override Validation System disabled');
  }

  /**
   * Queue a token for override validation after movement
   * @param {string} tokenId - ID of the token that moved
   */
  queueOverrideValidation(tokenId) {
    if (!this.#enabled || !game.user.isGM) {
      console.log('PF2E Visioner | Override validation skipped:', { enabled: this.#enabled, isGM: game.user.isGM });
      return;
    }

    console.log('PF2E Visioner | Queueing override validation for token:', tokenId);
    this.#tokensQueuedForValidation.add(tokenId);

    // Clear existing timeout and set new one to batch validations
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
    }

    // Validate after a short delay to handle waypoints and complete movements
    this.#validationTimeoutId = setTimeout(() => {
      console.log('PF2E Visioner | Processing queued validations...');
      this.#processQueuedValidations();
    }, 500); // 500ms delay to ensure movement is complete
  }

  /**
   * Process all queued override validations
   */
  async #processQueuedValidations() {
    if (!this.#enabled || !game.user.isGM) return;
    
    const tokensToValidate = Array.from(this.#tokensQueuedForValidation);
    this.#tokensQueuedForValidation.clear();
    this.#validationTimeoutId = null;

    console.log('PF2E Visioner | Processing override validation for tokens:', tokensToValidate);

    for (const tokenId of tokensToValidate) {
      await this.#validateOverridesForToken(tokenId);
    }
  }

  /**
   * Validate all overrides involving a specific token that just moved
   * @param {string} movedTokenId - ID of the token that moved
   */
  async #validateOverridesForToken(movedTokenId) {
    const movedToken = canvas.tokens?.get(movedTokenId);
    if (!movedToken) {
      console.log('PF2E Visioner | Could not find moved token:', movedTokenId);
      return;
    }

    console.log('PF2E Visioner | Validating overrides for moved token:', movedToken.name);

    const overridesToCheck = [];

    // Check memory-based overrides first (backwards compatibility)
    const activeOverrides = this.#visibilitySystem.getActiveOverrides();
    for (const [overrideKey, override] of activeOverrides.entries()) {
      const [observerId, targetId] = overrideKey.split('-');
      
      if (observerId === movedTokenId || targetId === movedTokenId) {
        console.log('PF2E Visioner | Found memory override to check:', { key: overrideKey, override });
        overridesToCheck.push({
          key: overrideKey,
          override,
          observerId,
          targetId,
          type: 'memory'
        });
      }
    }

    // Check persistent flag-based overrides for all tokens
    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      if (!token?.document) continue;
      
      // Check all override flags on this token (target has flags FROM observers)
      const flags = token.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(flags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        
        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = token.document.id;
        
        // Skip if not involving the moved token
        if (observerId !== movedTokenId && targetId !== movedTokenId) continue;

        console.log('PF2E Visioner | Found persistent flag override to check:', { 
          flagKey, 
          observerId, 
          targetId, 
          flagData 
        });
        
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: canvas.tokens?.get(observerId),
            target: token,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            observerId,
            targetId,
            observerName: flagData.observerName,
            targetName: flagData.targetName || token.name
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: token
        });
      }
    }

    console.log('PF2E Visioner | Total overrides to check:', overridesToCheck.length);

    // Check each override for validity and collect invalid ones
    const invalidOverrides = [];
    for (const checkData of overridesToCheck) {
      const { override, observerId, targetId, type, flagKey, token } = checkData;
      const shouldRemove = await this.#checkOverrideValidity(observerId, targetId, override);
      
      console.log('PF2E Visioner | Validity check result:', { 
        observerId, 
        targetId, 
        shouldRemove,
        override: override 
      });
      
      if (shouldRemove) {
        console.log('PF2E Visioner | Override should be removed:', { 
          observerId, 
          targetId, 
          type,
          reason: shouldRemove.reason 
        });
        // Attach current visibility/cover to the override for dialog rendering
        try {
          if (shouldRemove.currentVisibility) override.currentVisibility = shouldRemove.currentVisibility;
          if (shouldRemove.currentCover) override.currentCover = shouldRemove.currentCover;
  } catch { /* ignore */ }
        invalidOverrides.push({
          observerId,
          targetId,
          override,
          reason: shouldRemove.reason,
          type,
          flagKey,
          token
        });
      } else {
        console.log('PF2E Visioner | Override is still valid:', { observerId, targetId, type });
      }
    }

    // If we found invalid overrides, show the validation dialog
    if (invalidOverrides.length > 0) {
      console.log('PF2E Visioner | About to show validation dialog with invalid overrides:', {
        count: invalidOverrides.length,
        overrides: invalidOverrides
      });
      await this.#showOverrideValidationDialog(invalidOverrides);
    } else {
      console.log('PF2E Visioner | No invalid overrides found to show dialog for');
    }
  }

  /**
   * Check if an override is still valid based on current visibility/cover state
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID  
   * @param {Object} override - Override object with hasCover/hasConcealment flags
   * @returns {Promise<{shouldRemove: boolean, reason: string}|null>}
   */
  async #checkOverrideValidity(observerId, targetId, override) {
    const observer = canvas.tokens?.get(observerId);
    const target = canvas.tokens?.get(targetId);
    
    if (!observer || !target) return null;

    try {
      // Get current positions for detailed logging
      const observerPos = { x: observer.document.x, y: observer.document.y };
      const targetPos = { x: target.document.x, y: target.document.y };
      
      console.log('PF2E Visioner | Validation position check:', {
        observer: observer.name,
        target: target.name,
        observerPos,
        targetPos,
        observerCanvas: { x: observer.x, y: observer.y },
        targetCanvas: { x: target.x, y: target.y }
      });
      
      // Calculate current visibility and cover using the auto-visibility system
      const visibility = await this.#visibilitySystem.calculateVisibility(observer, target);
      
      console.log('PF2E Visioner | Validation check for override:', {
        observer: observer.name,
        target: target.name,
        storedOverride: override,
        storedFlags: {
          hasCover: override.hasCover,
          hasConcealment: override.hasConcealment,
          state: override.state,
          source: override.source
        },
        currentVisibility: visibility
      });
      
      if (!visibility) return null;

      const currentlyHasCover = visibility.cover !== 'none';
      const currentlyConcealed = visibility.visibility === 'concealed' || visibility.visibility === 'hidden';
      const currentlyVisible = visibility.visibility === 'observed' || visibility.visibility === 'concealed';

      console.log('PF2E Visioner | Cover calculation breakdown:', {
        'visibility.cover': visibility.cover,
        'visibility.cover !== "none"': visibility.cover !== 'none',
        'currentlyHasCover result': currentlyHasCover,
        'Expected result if no cover': false,
        'Position analysis': `${target.name} at (${targetPos.x}, ${targetPos.y}) observed by ${observer.name} at (${observerPos.x}, ${observerPos.y})`
      });

      console.log('PF2E Visioner | Validation conditions:', {
        stored: { hasCover: override.hasCover, hasConcealment: override.hasConcealment },
        current: { hasCover: currentlyHasCover, concealed: currentlyConcealed, visible: currentlyVisible },
        rawVisibility: visibility,
        visibility: visibility?.visibility,
        cover: visibility?.cover
      });

      // Enhanced debug logging for validation logic
      console.log('PF2E Visioner | Detailed validation logic:', {
        'override.hasCover': override.hasCover,
        'currentlyHasCover': currentlyHasCover,
        'override.hasCover && !currentlyHasCover': override.hasCover && !currentlyHasCover,
        '!override.hasCover && currentlyHasCover': !override.hasCover && currentlyHasCover,
        'cover calculation': {
          rawCover: visibility?.cover,
          coverIsNone: visibility?.cover === 'none',
          coverIsNotNone: visibility?.cover !== 'none'
        }
      });

      const reasons = [];

      // Check if cover conditions have changed
      if (override.hasCover && !currentlyHasCover) {
        console.log('PF2E Visioner | Validation reason: no longer has cover');
        reasons.push('has NO cover (override expected cover)');
      }
      if (!override.hasCover && currentlyHasCover) {
        console.log('PF2E Visioner | Validation reason: now has cover');
        reasons.push('now has cover (override expected no cover)');
      }

      // Check if concealment conditions have changed
      if (override.hasConcealment && currentlyVisible && !currentlyConcealed) {
        reasons.push('has NO concealment (override expected concealment)');
      }
      if (!override.hasConcealment && currentlyConcealed) {
        reasons.push('now has concealment (override expected no concealment)');
      }

      // Additional check for concealment: if override claims hidden but token is now observed
      if (override.hasConcealment && visibility.visibility === 'observed') {
        reasons.push('is now clearly observed (override expected concealment)');
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if ((override.source === 'manual_action' || override.source === 'sneak_action') && override.state === 'undetected') {
        // If target is now clearly observed (in bright light with no concealment), 
        // "undetected" may be too strong
        if (visibility.visibility === 'observed' && !currentlyHasCover && !currentlyConcealed) {
          // Only flag if the observer has normal vision capabilities
          const observerToken = canvas.tokens?.get(observerId);
          if (observerToken?.actor) {
            try {
              const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
              const visionAnalyzer = VisionAnalyzer.getInstance();
              const visionCapabilities = visionAnalyzer.getVisionCapabilities(observerToken.actor);
              
              // If observer has normal vision and target is in bright light with no obstructions,
              // "undetected" might be questionable for stealth
              if (!visionCapabilities.hasDarkvision || visibility.lighting === 'bright') {
                if (override.source === 'sneak_action') {
                  reasons.push('stealth failed: now clearly visible in bright light');
                } else {
                  reasons.push('is now clearly visible with no concealment or cover');
                }
              }
            } catch (error) {
              console.warn('PF2E Visioner | Error checking vision capabilities:', error);
            }
          }
        }
        
        // Additional check for sneak actions: if moved from concealing terrain to open bright light
        if (override.source === 'sneak_action' && visibility.lighting === 'bright' && !currentlyHasCover) {
          reasons.push('stealth broken: moved to bright open area');
        }
      }

      if (reasons.length > 0) {
        console.log('PF2E Visioner | Override validation FAILED - reasons:', reasons);
        return {
          shouldRemove: true,
          reason: reasons.join(' and '),
          currentVisibility: visibility?.visibility || null,
          currentCover: visibility?.cover || null
        };
      }

      console.log('PF2E Visioner | Override validation PASSED - no reasons to remove');
      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }

  /**
   * Show the override validation dialog for multiple invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   */
  async #showOverrideValidationDialog(invalidOverrides) {
    if (invalidOverrides.length === 0) return;

    // Prepare the override data for the dialog
    const overrideData = invalidOverrides.map(({ observerId, targetId, override, reason }) => {
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);
      
      console.log('PF2E Visioner | Preparing dialog data for override:', {
        observer: observer?.document?.name,
        target: target?.document?.name,
        reason,
        storedState: override,
        observerId,
        targetId
      });
      
      return {
        id: `${observerId}-${targetId}`,
        observerId,
        targetId,
        observerName: observer?.document?.name || 'Unknown',
        targetName: target?.document?.name || 'Unknown',
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        reason,
        hasCover: override.hasCover || false,
        hasConcealment: override.hasConcealment || false,
        // Provide actual current states so the dialog can render accurate icon deltas
        currentVisibility: override.currentVisibility || null,
        currentCover: override.currentCover || null,
        isManual: override.source === 'manual_action'
      };
    });

    // Dynamically import the dialog
    try {
      console.log('PF2E Visioner | Attempting to import OverrideValidationDialog...');
      const { OverrideValidationDialog } = await import('../../ui/override-validation-dialog.js');
      console.log('PF2E Visioner | Successfully imported OverrideValidationDialog');
      
      // Show the dialog and wait for the user's decision
      const result = await OverrideValidationDialog.show(overrideData, 'Token Movement');

      // Handle the user's choice
      if (result) {
        switch (result.action) {
          case 'clear-all':
            // Remove all overrides
            {
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
              for (const { observerId, targetId } of invalidOverrides) {
                await AvsOverrideManager.removeOverride(observerId, targetId);
              }
            }
            ui.notifications.info(`Cleared ${invalidOverrides.length} invalid override${invalidOverrides.length > 1 ? 's' : ''}`);
            break;

          case 'clear-manual': {
            // Remove only manual overrides
            let clearedCount = 0;
            {
              const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
              for (const { observerId, targetId, override } of invalidOverrides) {
                if (override.source === 'manual_action') {
                  await AvsOverrideManager.removeOverride(observerId, targetId);
                  clearedCount++;
                }
              }
            }
            if (clearedCount > 0) {
              ui.notifications.info(`Cleared ${clearedCount} manual override${clearedCount > 1 ? 's' : ''}`);
            }
            break;
          }

          case 'keep':
            // Do nothing - keep all overrides
            ui.notifications.info('Kept all current overrides');
            break;

          default:
            console.warn('PF2E Visioner | Unknown dialog action:', result.action);
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Error showing override validation dialog:', error);
      // Fallback to simple confirmation for the first override
      const first = invalidOverrides[0];
      const observer = canvas.tokens?.get(first.observerId);
      const target = canvas.tokens?.get(first.targetId);
      
      if (observer && target) {
        const result = await Dialog.confirm({
          title: "Override Validation",
          content: `<p>The visibility override <strong>${observer.document.name} → ${target.document.name}</strong> may no longer be valid.</p><p><strong>Reason:</strong> ${first.reason}</p><p>Would you like to remove this override?</p>`,
          yes: () => true,
          no: () => false,
          defaultYes: true
        });

        if (result) {
          {
            const { default: AvsOverrideManager } = await import('../../chat/services/infra/avs-override-manager.js');
            await AvsOverrideManager.removeOverride(first.observerId, first.targetId);
          }
          ui.notifications.info(`Removed visibility override: ${observer.document.name} → ${target.document.name}`);
        }
      }
    }
  }

  /**
   * Debug method to manually trigger validation for a token (PUBLIC)
   * @param {string} tokenId - Token ID to validate
   */
  async debugValidateToken(tokenId) {
    console.log('PF2E Visioner | 🔧 DEBUG: Manually triggering validation for token:', tokenId);
    await this.#validateOverridesForToken(tokenId);
  }
}