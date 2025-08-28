import { COVER_STATES, MODULE_ID } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import { StealthCheckUseCase } from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { appliedSneakChangesByMessage } from '../data/message-cache.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

export class SneakActionHandler extends ActionHandlerBase {
  constructor() {
    super('sneak');
    // Use the singleton instance to share state with StealthCheckUseCase
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = new StealthCheckUseCase(this.autoCoverSystem);
  }
  getCacheMap() {
    return appliedSneakChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.token?.id ?? outcome?.target?.id ?? null;
  }
  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }

  async handleRenderCheckModifiersDialog(dialog, html) {
    // Delegate to stealth check use case for cover modifier injection
    try {
      await this.stealthCheckUseCase.handleCheckDialog(dialog, html);
    } catch (e) {
      console.warn('PF2E Visioner | Error in sneak dialog handling:', e);
    }
  }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorId = actionData?.actor?.id || actionData?.actor?.document?.id || null;

    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actionData.actor))
      // Use global ignoreAllies setting when not explicitly provided in actionData
      .filter(
        (t) =>
          !shouldFilterAlly(
            actionData.actor,
            t,
            'enemies',
            actionData?.ignoreAllies ?? game.settings.get('pf2e-visioner', 'ignoreAllies'),
          ),
      )
      // Exclude loot and hazards from observers list
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');

    if (!enforceRAW) return base;

    const { getVisibilityBetween } = await import('../../../utils.js');
    const final = base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actionData.actor);
        return vis === 'hidden' || vis === 'undetected';
      } catch (_) {
        return false;
      }
    });

    return final;
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);
    
    // Calculate roll information (stealth vs observer's perception DC)
    let adjustedDC = extractPerceptionDC(subject);
    
    // Initialize result object for auto-cover data
    const result = {};

    const enableCoverSneakAction = game.settings.get(MODULE_ID, 'autoCoverHideAction');

    if (enableCoverSneakAction) {
      try {
        const sneakingToken = actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

        let coverState = null;
        let isOverride = false;
        let coverSource = 'none';

        // Compute base cover (manual first, then auto-cover fallback)
        try {
          // First check for manual cover
          const manualDetected = this.autoCoverSystem.getCoverBetween(subject, sneakingToken);
          if (manualDetected && manualDetected !== 'none') {
            coverState = manualDetected;
            coverSource = 'manual';
          } else if (game.settings.get(MODULE_ID, 'autoCover')) {
            // Fallback to auto-cover detection if no manual cover
            // For cover detection: observer is "attacking" (perceiving) the sneaking token
            // So observer is attacker, sneaking token is target
            const autoDetected = this.stealthCheckUseCase._detectCover(subject, sneakingToken);
            if (autoDetected && autoDetected !== 'none') {
              coverState = autoDetected;
              coverSource = 'automatic';
            }
          }
        } catch (e) {
          console.warn(`PF2E Visioner | Cover calculation failed for Sneak action:`, e);
        }

        // Apply overrides last (take precedence over base)
        // Delete on consume since this is the final consumer
        let originalDetectedState = coverState || 'none'; // Store what we actually detected for this observer
        try {
          // NOTE: Override parameter order is DIFFERENT from cover detection!
          // Stealth check stores overrides as (sneaking token -> observer)
          // Cover detection uses (observer -> sneaking token)
          const overrideData = this.autoCoverSystem.consumeCoverOverride(sneakingToken, subject, null, true);
          if (overrideData) {
            // Don't use overrideData.originalState - use what we actually detected for this observer
            coverState = overrideData.state;
            
            // Only mark as override if there's actually a difference from what we detected
            if (originalDetectedState !== coverState) {
              isOverride = true;
              coverSource = overrideData.source;
            }
          }
        } catch (_) { }

        // Always create autoCover object if we have a cover state (even without override)
        if (coverState) {
          const coverConfig = COVER_STATES[coverState];
          const actualStealthBonus = coverConfig?.bonusStealth || 0;
          result.autoCover = {
            state: coverState,
            label: game.i18n.localize(coverConfig.label),
            icon: coverConfig.icon,
            color: coverConfig.color,
            cssClass: coverConfig.cssClass,
            bonus: actualStealthBonus,
            isOverride,
            source: coverSource,
            // Add override details for template display (only if actually overridden)
            ...(isOverride && originalDetectedState !== coverState && {
              overrideDetails: {
                originalState: originalDetectedState,
                originalLabel: game.i18n.localize(COVER_STATES[originalDetectedState]?.label || 'None'),
                originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
                originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
                finalState: coverState,
                finalLabel: game.i18n.localize(coverConfig.label),
                finalIcon: coverConfig.icon,
                finalColor: coverConfig.color,
                source: coverSource
              }
            })
          };
        }
      } catch (e) {
        console.error(`PF2E Visioner | Error in cover calculation for Sneak action:`, e);
      }
    }

    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);
    const injectedStealthBonus = Number(actionData?.context?._visionerStealth?.bonus ?? 0);
    
    // For cover override calculations:
    // - baseTotal is the final roll result (includes any applied cover bonuses)
    // - injectedStealthBonus is the cover bonus that was actually applied
    // - We need to show the "true" roll result based on the final cover state
    let total = baseTotal;
    let originalTotal = null;
    
    if (enableCoverSneakAction && result?.autoCover?.isOverride) {
      if (result.autoCover.overrideDetails) {
        const originalState = result.autoCover.overrideDetails.originalState;
        const finalState = result.autoCover.overrideDetails.finalState;
        
        if (originalState !== 'none' && finalState === 'none') {
          // Override from some cover to none: subtract the applied bonus to get base roll
          total = baseTotal - injectedStealthBonus;
          originalTotal = baseTotal; // Show what it was with original cover
        } else if (originalState === 'none' && finalState !== 'none') {
          // Override from none to some cover: baseTotal includes the cover bonus, 
          // but we want to show the base roll without cover
          total = baseTotal - injectedStealthBonus;
          originalTotal = baseTotal; // Show what it is with the new cover
        } else {
          // Override from one cover to another cover
          const originalCoverConfig = COVER_STATES[originalState];
          const originalBonus = originalCoverConfig?.bonusStealth || 0;
          // Calculate what the roll would have been with original cover
          const baseRollWithoutCover = baseTotal - injectedStealthBonus;
          total = baseTotal; // Keep current total with new cover
          originalTotal = baseRollWithoutCover + originalBonus; // Show original cover total
        }
      }
    }
    
    const dc = adjustedDC;
    const die = Number(
      actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const margin = total - dc;
    const outcome = determineOutcome(total, die, dc);

    // Determine default new visibility using centralized mapping
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    const newVisibility = getDefaultNewStateFor('sneak', current, outcome) || current;

    return {
      token: subject,
      dc,
      rollTotal: total,
      dieResult: die,
      margin,
      outcome,
      currentVisibility: current,
      oldVisibility: current,
      newVisibility,
      changed: newVisibility !== current,
      autoCover: result.autoCover, // Add auto-cover information
      // Add original total for override display
      originalRollTotal: originalTotal,
    };
  }
  outcomeToChange(actionData, outcome) {
    const observer = outcome.token || outcome.target;
    return {
      observer,
      target: actionData.actor,
      newVisibility: outcome.newVisibility,
      oldVisibility: outcome.oldVisibility,
    };
  }
  buildCacheEntryFromChange(change) {
    return {
      observerId: change?.observer?.id ?? null,
      oldVisibility: change?.oldVisibility ?? null,
    };
  }
  entriesToRevertChanges(entries, actionData) {
    return entries
      .map((e) => ({
        observer: this.getTokenById(e.observerId),
        target: actionData.actor,
        newVisibility: e.oldVisibility,
      }))
      .filter((c) => c.observer && c.target && c.newVisibility);
  }

  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.token || o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
