import { COVER_STATES, MODULE_ID } from '../../../constants.js';
import { detectCoverStateForAttack } from '../../../cover/auto-cover.js';
import { appliedHideChangesByMessage } from '../data/message-cache.js';
import { shouldFilterAlly } from '../infra/shared-utils.js';
import { ActionHandlerBase } from './base-action.js';

export class HideActionHandler extends ActionHandlerBase {
  constructor() {
    super('hide');
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
    const autoCover = game.settings.get(MODULE_ID, 'autoCover');
    const { getVisibilityBetween, getCoverBetween } = await import('../../../utils.js');
    return base.filter((observer) => {
      try {
        const vis = getVisibilityBetween(observer, actorToken);
        if (vis === 'concealed') return true;
        if (vis === 'observed') {
          // Prefer live auto-cover for relevance (do not mutate state), then fall back to stored map
          let cover = 'none';
          if (autoCover) {
            try {
              cover =
                detectCoverStateForAttack(actorToken, observer, { rawPrereq: true }) || 'none';
            } catch (_) {}
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
      } catch (_) {}
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

    const enableCoverHideAction = game.settings.get(MODULE_ID, 'autoCoverHideAction');

    if (enableCoverHideAction) {
      try {
        // Check for stealth roll dialog override first
        const stealthDialog = Object.values(ui.windows).find(
          (w) => w.constructor.name === 'CheckModifiersDialog',
        );

        console.debug('PF2E Visioner | Hide action: Checking for stealth dialog override:', {
          foundDialog: !!stealthDialog,
          dialogId: stealthDialog?.id,
          dialogTitle: stealthDialog?.title,
          dialogOverride: stealthDialog?._pvCoverOverride,
          allDialogs: Object.values(ui.windows).map(w => ({ 
            name: w.constructor.name, 
            id: w.id, 
            title: w.title, 
            override: w._pvCoverOverride 
          }))
        });

        let coverState = null;
        let isOverride = false;
        let coverSource = 'none';

        // Check for cover overrides in priority order:
        // 1. Roll dialog override (highest priority)
        if (stealthDialog?._pvCoverOverride) {
          coverState = stealthDialog._pvCoverOverride;
          isOverride = true;
          coverSource = 'dialog';
          console.debug('PF2E Visioner | Hide action: Found roll dialog override:', {
            coverState,
            dialogOverride: stealthDialog._pvCoverOverride
          });
        }
        // 2. Global popup override (from keybind popup)
        else {
          try {
            const hidingToken = actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
            const overrideKey = `${hidingToken?.id}-${subject?.id}`;
            
            console.debug('PF2E Visioner | Hide action: Checking global overrides:', {
              hidingTokenId: hidingToken?.id,
              subjectId: subject?.id,
              overrideKey,
              hasPopupOverrides: !!window.pf2eVisionerPopupOverrides,
              hasDialogOverrides: !!window.pf2eVisionerDialogOverrides,
              popupOverrideKeys: window.pf2eVisionerPopupOverrides ? Array.from(window.pf2eVisionerPopupOverrides.keys()) : [],
              dialogOverrideKeys: window.pf2eVisionerDialogOverrides ? Array.from(window.pf2eVisionerDialogOverrides.keys()) : []
            });
            
            if (window.pf2eVisionerPopupOverrides?.has(overrideKey)) {
              coverState = window.pf2eVisionerPopupOverrides.get(overrideKey);
              isOverride = true;
              coverSource = 'popup';
              console.debug('PF2E Visioner | Hide action: Found popup override:', {
                overrideKey,
                coverState
              });
            }
            // 3. Global dialog override (from roll dialog buttons)
            else if (window.pf2eVisionerDialogOverrides?.has(overrideKey)) {
              coverState = window.pf2eVisionerDialogOverrides.get(overrideKey);
              isOverride = true;
              coverSource = 'dialog';
              console.debug('PF2E Visioner | Hide action: Found global dialog override:', {
                overrideKey,
                coverState
              });
            }
          } catch (_) {}
        }
        
        // 4. If no override, calculate auto-cover or manual cover
        if (!coverState || coverState === 'none') {
          // Try auto-cover first (if enabled)
          if (game.settings.get(MODULE_ID, 'autoCover')) {
            try {
              // For hide action: subject is the observer, actionData.actor is the hiding actor
              const hidingToken =
                actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
              coverState = detectCoverStateForAttack(hidingToken, subject);
              if (coverState && coverState !== 'none') {
                coverSource = 'automatic';
              }
            } catch (e) {
              console.warn(`PF2E Visioner | Auto-cover calculation failed for Hide action:`, e);
            }
          }

          // Fall back to manual cover if no auto-cover found
          if (!coverState || coverState === 'none') {
            try {
              const { getCoverBetween } = await import('../../../utils.js');
              // For hide action: hidingToken has cover FROM observer (observer to hidingToken direction)
              const hidingToken =
                actionData.actorToken || actionData.actor?.token?.object || actionData.actor;
              coverState = getCoverBetween(hidingToken, subject);
              if (coverState && coverState !== 'none') {
                coverSource = 'manual';
              }
            } catch (e) {
              console.warn(`PF2E Visioner | Manual cover lookup failed for Hide action:`, e);
            }
          }
        }

        if (coverState) {
          const coverConfig = COVER_STATES[coverState];
          
          // Calculate the actual stealth bonus for the final cover state (after overrides)
          const actualStealthBonus = coverConfig?.bonusStealth || 0;
          
          // Debug logging to track cover override processing
          console.debug('PF2E Visioner | Hide action cover state processing:', {
            coverState,
            isOverride,
            coverSource,
            coverConfig,
            actualStealthBonus,
            originalBonus: actionData?.context?._visionerStealth?.bonus
          });

          result.autoCover = {
            state: coverState,
            label: game.i18n.localize(coverConfig.label),
            icon: coverConfig.icon,
            color: coverConfig.color,
            cssClass: coverConfig.cssClass,
            bonus: actualStealthBonus, // Use recalculated bonus, not original roll bonus
            isOverride,
            source: coverSource, // Track whether this came from auto, manual, or override
          };
        }
      } catch (e) {
        console.error(`PF2E Visioner | Error in cover calculation for Hide action:`, e);
      }
    }

    // Calculate roll information (stealth vs observer's perception DC)
    const baseTotal = Number(actionData?.roll?.total ?? 0);
    const observerCoverState = result?.autoCover?.state ?? 'none';
    const injectedStealthBonus = Number(result?.autoCover?.bonus);
    const shouldSubtract = enableCoverHideAction && observerCoverState === 'none' && Number.isFinite(injectedStealthBonus) && injectedStealthBonus > 0;
    const total = shouldSubtract ? baseTotal - injectedStealthBonus : baseTotal;
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
