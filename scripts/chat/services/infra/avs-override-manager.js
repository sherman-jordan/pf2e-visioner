/**
 * AVS Override Manager (Generic)
 * Centralizes how actions set and clear Auto-Visibility System (AVS) overrides.
 *
 * Design goals:
 * - Single choke point for per-action policies (seek, point-out, hide, diversion, consequences, sneak)
 * - Reuse existing hook-based writer setAVSPairOverrides for persistence and EVS integration
 * - Provide clear helpers for both array-of-changes and Map<targetId, changeData> inputs
 */

import { setVisibilityBetween as setVisibility } from '../../../utils.js';
import { MODULE_ID } from '../../../constants.js';

function asChangesByTarget(changesInput, defaultState = null) {
  // Accept Map<string, { target, state, hasCover?, hasConcealment?, expectedCover? }>
  if (changesInput instanceof Map) return changesInput;

  const map = new Map();
  const arr = Array.isArray(changesInput) ? changesInput : [changesInput].filter(Boolean);
  for (const ch of arr) {
    if (!ch) continue;
    const target = ch.target || ch.targetToken || null;
    if (!target?.document?.id) continue;
    const state = ch.state || ch.overrideState || ch.newVisibility || defaultState;
    if (!state) continue;

    // Prefer provided flags; otherwise infer conservatively
    const expectedCover = ch.expectedCover;
    const hasCover = typeof ch.hasCover === 'boolean'
      ? ch.hasCover
      : (expectedCover === 'standard' || expectedCover === 'greater');
    const hasConcealment = typeof ch.hasConcealment === 'boolean'
      ? ch.hasConcealment
      : ['concealed', 'hidden', 'undetected'].includes(state);

    map.set(target.document.id, { target, state, hasCover, hasConcealment, expectedCover });
  }
  return map;
}

export class AvsOverrideManager {
  // Register the avsOverride hook once
  static registerHooks() {
    try {
      Hooks.off('avsOverride', this.onAVSOverride); // ensure no dupes
    } catch {}
    Hooks.on('avsOverride', this.onAVSOverride.bind(this));
  }
  /**
   * Set AVS pair overrides to prevent automatic recalculation of manually set visibility states
   * Centralized here to keep all override lifecycle in one place.
   * - Sneak: one-way (observer -> target only)
   * - Others: symmetric (both directions)
   * @param {Token} observer
   * @param {Map<string, {target: Token, state: string, hasCover?: boolean, hasConcealment?: boolean, expectedCover?: string}>} changesByTarget
   * @param {{source?: string}} options
   */
  static async setPairOverrides(observer, changesByTarget, options = {}) {
    try {
      const isSneakAction =
        options.source === 'sneak_action' || observer.document.getFlag('pf2e-visioner', 'sneak-active');

      for (const [, changeData] of changesByTarget) {
        const target = changeData.target;
        const state = changeData.state;
        const payload = {
          observer,
          target,
          state,
          source: options.source || (isSneakAction ? 'sneak_action' : 'manual_action'),
          hasCover: changeData.hasCover || false,
          hasConcealment: changeData.hasConcealment || false,
          expectedCover: changeData.expectedCover,
        };

        if (isSneakAction) {
          // One-way only
          await this.onAVSOverride(payload);
        } else {
          // Symmetric
          await this.onAVSOverride(payload);
          await this.onAVSOverride({ ...payload, observer: target, target: observer });
        }
      }
    } catch (error) {
      console.error('PF2E Visioner | Error setting AVS overrides in manager:', error);
    }
  }

  // Core hook handler: persist override and apply immediately
  static async onAVSOverride(overrideData) {
    const { observer, target, state, source, hasCover, hasConcealment, expectedCover } =
      overrideData || {};
    if (!observer?.document?.id || !target?.document?.id || !state) {
      console.warn('PF2E Visioner | Invalid AVS override data:', overrideData);
      return;
    }
    try {
      await this.storeOverrideFlag(observer, target, {
        state,
        source: source || 'unknown',
        hasCover: !!hasCover,
        hasConcealment: !!hasConcealment,
        expectedCover,
      });
    } catch (e) {
      console.error('PF2E Visioner | Failed to store override flag:', e);
    }

    try {
      await this.applyOverrideFromFlag(observer, target, state);
    } catch (e) {
      console.error('PF2E Visioner | Error applying AVS override from flag:', e);
    }
  }

  static async storeOverrideFlag(observer, target, data) {
    const flagKey = `avs-override-from-${observer.document.id}`;
    const flagData = {
      ...data,
      timestamp: Date.now(),
      observerId: observer.document.id,
      targetId: target.document.id,
      observerName: observer.name,
      targetName: target.name,
    };
    await target.document.setFlag(MODULE_ID, flagKey, flagData);
  }

  static async applyOverrideFromFlag(observer, target, state) {
    await setVisibility(observer, target, state, { isAutomatic: true, source: 'avs_override' });
    try {
      Hooks.call('pf2e-visioner.visibilityChanged', observer.document.id, target.document.id, state);
    } catch {}
  }

  // Remove a specific override (persistent flag-based)
  static async removeOverride(observerId, targetId) {
    try {
      const targetToken = canvas.tokens?.get(targetId);
      if (!targetToken) return false;
      const flagKey = `avs-override-from-${observerId}`;
      const flagExists = targetToken.document.getFlag(MODULE_ID, flagKey);
      if (flagExists) {
        await targetToken.document.unsetFlag(MODULE_ID, flagKey);
        try {
          const { eventDrivenVisibilitySystem } = await import('../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js');
          // Recalc both sides to be thorough
          await eventDrivenVisibilitySystem.recalculateForTokens([observerId, targetId]);
        } catch {}
        return true;
      }
    } catch (error) {
      console.error('PF2E Visioner | Failed to remove override flag:', error);
    }
    return false;
  }

  // Clear all overrides across all tokens
  static async clearAllOverrides() {
    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      try {
        const flags = token.document.flags?.[MODULE_ID] || {};
        for (const flagKey of Object.keys(flags)) {
          if (flagKey.startsWith('avs-override-from-')) {
            try {
              await token.document.unsetFlag(MODULE_ID, flagKey);
            } catch {}
          }
        }
      } catch {}
    }
    // Recalculate everyone once after bulk clear
    try {
      const { eventDrivenVisibilitySystem } = await import('../../../visibility/auto-visibility/EventDrivenVisibilitySystem.js');
      await eventDrivenVisibilitySystem.recalculateAllVisibility(true);
    } catch {}
  }
  // Generic writer with explicit source tag
  static async applyOverrides(observer, changesInput, { source, ...options } = {}) {
    const map = asChangesByTarget(changesInput);
    if (map.size === 0 || !observer) return false;
    await this.setPairOverrides(observer, map, { source: source || 'manual_action', ...options });
    return true;
  }

  // Seek: set/update overrides to match outcome; create if missing
  static async applyForSeek(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'seek_action' });
  }

  // Point Out: ensure override exists as hidden (upgrade undetected->hidden; create hidden otherwise)
  static async applyForPointOut(allyObserver, targetToken) {
    const map = asChangesByTarget({ target: targetToken, state: 'hidden' });
    return this.applyOverrides(allyObserver, map, { source: 'point_out_action' });
  }

  // Hide: set/update overrides to outcome; create if missing
  static async applyForHide(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'hide_action' });
  }

  // Diversion: set/update overrides to outcome; create if missing
  static async applyForDiversion(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'diversion_action' });
  }

  // Take Cover: not strictly an AVS state but some flows may tag concealment reasons
  static async applyForTakeCover(observer, changesInput) {
    return this.applyOverrides(observer, changesInput, { source: 'take_cover_action' });
  }

  // Consequences: clear pair overrides for provided pairs (both directions for safety)
  static async clearForConsequences(observer, targets) {
    const arr = Array.isArray(targets) ? targets : [targets].filter(Boolean);
    for (const tgt of arr) {
      try {
        const obsId = observer?.document?.id || observer?.id;
        const tgtId = tgt?.document?.id || tgt?.id;
        if (!obsId || !tgtId) continue;
        await this.removeOverride(obsId, tgtId);
        await this.removeOverride(tgtId, obsId);
      } catch (e) {
        console.warn('PF2E Visioner | Failed to clear AVS override for consequences:', e);
      }
    }
    return true;
  }

  // Sneak: one-way overrides from observers to sneaking token(s)
  static async applyForSneak(observer, changesInput, options = {}) {
    const map = asChangesByTarget(changesInput);
    if (map.size === 0 || !observer) return false;
    // Mark as sneak so setAVSPairOverrides enforces one-way semantics
    await this.setPairOverrides(observer, map, { source: 'sneak_action', ...options });
    return true;
  }
}

export default AvsOverrideManager;
