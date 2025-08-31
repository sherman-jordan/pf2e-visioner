import { COVER_STATES, MODULE_ID } from '../../../constants.js';
import autoCoverSystem from '../../../cover/auto-cover/AutoCoverSystem.js';
import stealthCheckUseCase from '../../../cover/auto-cover/usecases/StealthCheckUseCase.js';
import { appliedHideChangesByMessage } from '../data/message-cache.js';
import { calculateStealthRollTotals, shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

export class HideActionHandler extends ActionHandlerBase {
  constructor() {
    super('hide');
    // Use the singleton instance to share state with StealthCheckUseCase
    this.autoCoverSystem = autoCoverSystem;
    this.stealthCheckUseCase = stealthCheckUseCase; // Use singleton
    // Use the global singleton override manager directly
  }
  getCacheMap() {
    return appliedHideChangesByMessage;
  }
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }
  async ensurePrerequisites(actionData) {
    const { ensureActionRoll } = await import('../infra/roll-utils.js');
    ensureActionRoll(actionData);
  }
  async discoverSubjects(actionData) {
    // Observers are all other tokens; dialog filters encounter as needed
    const tokens = canvas?.tokens?.placeables || [];
    const actorToken = actionData?.actor;
    const actorId = actorToken?.id || actorToken?.document?.id || null;
    const enforceRAW = game.settings.get(MODULE_ID, 'enforceRawRequirements');
    const base = tokens
      .filter((t) => t && t.actor)
      .filter((t) => (actorId ? t.id !== actorId : t !== actorToken))
      // Respect ignoreAllies: when enabled, exclude allies from observers for Hide
      // Only apply ignoreAllies when explicitly provided; otherwise let dialog filter live
      .filter(
        (t) =>
          !shouldFilterAlly(
            actorToken,
            t,
            'enemies',
            actionData?.ignoreAllies === true || actionData?.ignoreAllies === false
              ? actionData.ignoreAllies
              : null,
          ),
      )
      // Hide should not list loot or hazards as observers
      .filter((t) => t.actor?.type !== 'loot' && t.actor?.type !== 'hazard');

    if (!enforceRAW) return base;

    // RAW filter: only observers that currently see the actor as Concealed
    // OR (Observed AND actor has Standard or Greater cover) are relevant.
    const { getVisibilityBetween, getCoverBetween } = await import('../../../utils.js');
    return base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actorToken);
        if (vis === 'concealed') return true;
        if (vis === 'observed') {
          // Prefer live auto-cover for relevance (do not mutate state), then fall back to stored map
          let cover = 'none';
          if (this.autoCoverSystem.isEnabled()) {
            try {
              cover =
                this.stealthCheckUseCase._detectCover(actorToken, observer) || 'none';
            } catch (_) { }
          }
          if (cover === 'none') {
            try {
              cover = getCoverBetween(actorToken, observer);
            } catch (_) {
              cover = 'none';
            }
          }
          return cover === 'standard' || cover === 'greater';
        }
      } catch (_) { }
      return false;
    });
  }
  async analyzeOutcome(actionData, subject) {
    const { getVisibilityBetween } = await import('../../../utils.js');
    const { extractPerceptionDC, determineOutcome } = await import('../infra/shared-utils.js');
    const current = getVisibilityBetween(subject, actionData.actor);

    // Calculate auto-cover from observer's perspective looking at the hiding actor
    let adjustedDC = extractPerceptionDC(subject);

    // Initialize result object for auto-cover data
    const result = {};


    try {
      const hidingToken = actionData.actorToken || actionData.actor?.token?.object || actionData.actor;

      let coverState = null;
      let isOverride = false;
      let coverSource = 'none';

      // Compute base cover (manual first, then auto-cover fallback)
      try {
        // First check for manual cover
        const manualDetected = this.autoCoverSystem.getCoverBetween(subject, hidingToken);
        if (manualDetected && manualDetected !== 'none') {
          coverState = manualDetected;
          coverSource = 'manual';
        } else if (this.autoCoverSystem.isEnabled()) {
          // Fallback to auto-cover detection if no manual cover
          // For cover detection: observer is "attacking" (perceiving) the hiding token
          // So observer is attacker, hiding token is target
          const autoDetected = this.stealthCheckUseCase._detectCover(subject, hidingToken);
          if (autoDetected && autoDetected !== 'none') {
            coverState = autoDetected;
            coverSource = 'automatic';
          }
        }
      } catch (e) {
        console.warn(`PF2E Visioner | Cover calculation failed for Hide action:`, e);
      }

      // Apply overrides last (take precedence over base)
      // Prefer roll-specific override if a rollId exists in the action or message context.
      // Don't delete on consume yet - we need it for all observers
      let originalDetectedState = coverState || 'none'; // Store what we actually detected for this observer
      try {
        const rollId = actionData?.context?._visionerRollId || actionData?.context?.rollId || actionData?.message?.flags?.['pf2e-visioner']?.rollId || null;
        
        // First check if there's a stored modifier for this roll (from StealthCheckUseCase)
        let storedModifier = null;
        if (rollId) {
          storedModifier = this.stealthCheckUseCase?.getOriginalCoverModifier?.(rollId);
        }
        
        if (storedModifier && storedModifier.isOverride) {
          // Use the stored modifier data to determine override
          originalDetectedState = coverState || 'none';
          coverState = storedModifier.finalState;
          
          // Only mark as override if the final state is different from what we detected
          if (originalDetectedState !== coverState) {
            isOverride = true;
            coverSource = storedModifier.source || 'dialog';
            console.log(`PF2E Visioner DEBUG - Found meaningful override for ${subject.name}:`, {
              rollId,
              originalDetectedState,
              finalState: coverState,
              isOverride,
              source: coverSource
            });
          } else {
            console.log(`PF2E Visioner DEBUG - Override found but same as detected for ${subject.name}, treating as normal:`, {
              rollId,
              detectedState: originalDetectedState,
              overrideState: coverState
            });
          }
        } else {
          // Fallback to the old method (but don't consume yet)
          // NOTE: Override parameter order is DIFFERENT from cover detection!
          // Stealth check stores overrides as (hiding token -> observer)  
          // Cover detection uses (observer -> hiding token)
          const overrideData = this.autoCoverSystem.consumeCoverOverride(hidingToken, subject, rollId, false);
          if (overrideData) {
            // Store the original detected state before applying override
            originalDetectedState = coverState || 'none';
            // Apply the override
            coverState = overrideData.state;

            // Only mark as override if there's actually a difference from what we detected
            if (originalDetectedState !== coverState) {
              isOverride = true;
              coverSource = overrideData.source;
            }
          }
        }
      } catch (e) {
        console.warn('PF2E Visioner | Error checking for cover override:', e);
      }

      // Create autoCover object if we have a cover state OR if there's an override
      if (coverState || isOverride) {
        const coverConfig = COVER_STATES[coverState || 'none'];
        const actualStealthBonus = coverConfig?.bonusStealth || 0;
        result.autoCover = {
          state: coverState || 'none',
          label: game.i18n.localize(coverConfig?.label || 'None'),
          icon: coverConfig?.icon || 'fas fa-shield',
          color: coverConfig?.color || '#999',
          cssClass: coverConfig?.cssClass || '',
          bonus: actualStealthBonus,
          isOverride,
          source: coverSource,
          // Add override details for template display (only if actually overridden)
          ...(isOverride && {
            overrideDetails: {
              originalState: originalDetectedState,
              originalLabel: game.i18n.localize(COVER_STATES[originalDetectedState]?.label || 'None'),
              originalIcon: COVER_STATES[originalDetectedState]?.icon || 'fas fa-shield',
              originalColor: COVER_STATES[originalDetectedState]?.color || '#999',
              finalState: coverState || 'none',
              finalLabel: game.i18n.localize(coverConfig?.label || 'None'),
              finalIcon: coverConfig?.icon || 'fas fa-shield',
              finalColor: coverConfig?.color || '#999',
              source: coverSource
            }
          })
        };
        
        console.log(`PF2E Visioner DEBUG - Created autoCover for ${subject.name}:`, result.autoCover);
      }
    } catch (e) {
      console.error(`PF2E Visioner | Error in cover calculation for Hide action:`, e);
    }


    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);

    // Use shared utility to calculate stealth roll totals with cover adjustments
    const { total, originalTotal } = calculateStealthRollTotals(
      baseTotal,
      result?.autoCover,
      actionData
    );

    const die = Number(
      actionData?.roll?.dice?.[0]?.total ?? actionData?.roll?.terms?.[0]?.total ?? 0,
    );
    const margin = total - adjustedDC;
    const outcome = determineOutcome(total, die, adjustedDC);

    // Maintain previous behavior for visibility change while enriching display fields
    // Use centralized mapping for defaults
    const { getDefaultNewStateFor } = await import('../data/action-state-config.js');
    let newVisibility = getDefaultNewStateFor('hide', current, outcome) || current;

    return {
      target: subject,
      dc: adjustedDC,
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
    return {
      observer: outcome.target,
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

  // Ensure fallback revert builds correct direction for Hide (observer -> actor)
  async fallbackRevertChanges(actionData) {
    const subjects = await this.discoverSubjects(actionData);
    const outcomes = [];
    for (const subject of subjects) outcomes.push(await this.analyzeOutcome(actionData, subject));
    const filtered = outcomes.filter(Boolean).filter((o) => o.changed);
    return filtered.map((o) => ({
      observer: o.target,
      target: actionData.actor,
      newVisibility: o.oldVisibility || o.currentVisibility,
    }));
  }
}
