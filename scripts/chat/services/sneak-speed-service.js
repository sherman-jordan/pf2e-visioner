/**
 * Sneak Speed Service
 * - Halves walking speed when Sneak starts
 * - Restores original walking speed when Sneak ends
 *
 * Notes:
 * - Only the primary walk speed is affected (system.attributes.speed.value)
 * - Other movement types (fly, swim, climb, burrow) are left unchanged
 * - Original speed is stored on the Actor as a module flag and restored later
 */

const MODULE_ID = 'pf2e-visioner';
const ORIGINAL_SPEED_FLAG = 'sneak-original-walk-speed';
const EFFECT_ID_FLAG = 'sneak-speed-effect-id';

export class SneakSpeedService {
  /**
   * Resolve an Actor from a token or actor reference.
   * @param {Token|Actor} tokenOrActor
   * @returns {Actor|null}
   */
  static resolveActor(tokenOrActor) {
    if (!tokenOrActor) return null;
    // Token object with actor
    if (tokenOrActor.actor) return tokenOrActor.actor;
    // Token document
    if (tokenOrActor.document?.actor) return tokenOrActor.document.actor;
    // Already an actor
    if (tokenOrActor.system?.attributes) return tokenOrActor;
    return null;
  }

  /**
   * Halve walking speed for the provided token/actor.
   * Prefers adding a PF2e effect (ActiveEffectLike multiply 0.5) so the sheet/UI updates properly.
   * Falls back to directly updating system.attributes.speed.value when effects aren't available.
   * Safe to call multiple times; will not stack.
   * @param {Token|Actor} tokenOrActor
   */
  static async applySneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;

      // Check feats for speed multiplier and flat distance bonus
      let multiplier = 0.5;
      let bonusFeet = 0;
      try {
        const { FeatsHandler } = await import('./feats-handler.js');
        multiplier = FeatsHandler.getSneakSpeedMultiplier(actor) ?? 0.5;
        bonusFeet = FeatsHandler.getSneakDistanceBonusFeet(actor) ?? 0;
      } catch {
        // ignore and keep default
      }

  // If already applied (either flag or effect), do nothing
      const alreadyStored = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
      const existingEffectId = actor.getFlag?.(MODULE_ID, EFFECT_ID_FLAG);
      if ((alreadyStored !== undefined && alreadyStored !== null) || existingEffectId) return;

      const current = Number(actor.system?.attributes?.speed?.value ?? 0);
      if (!Number.isFinite(current) || current <= 0) return;

  // If multiplier is 1.0 (full speed), do not create effect or change speed
  if (multiplier === 1.0) return;

  // Store original current value for safe restoration
      await actor.setFlag(MODULE_ID, ORIGINAL_SPEED_FLAG, current);

      // Try to use a PF2e effect with ActiveEffectLike to multiply base speed by the calculated multiplier
      try {
        if (typeof actor.createEmbeddedDocuments === 'function') {
          // Build a helpful label that also communicates the estimated max distance this action
          const base = current;
          const raw = Math.floor(base * multiplier) + (Number.isFinite(bonusFeet) ? bonusFeet : 0);
          const maxFeet = Math.min(base, raw);
          const baseLabel = multiplier === 0.5 ? 'Sneaking (Halved Speed)' : `Sneaking (Speed x${multiplier})`;
          const extra = maxFeet > 0 ? ` · Max ${maxFeet} ft${bonusFeet > 0 ? ` (+${bonusFeet} ft feat bonus)` : ''}` : '';
          const label = `${baseLabel}${extra}`;
          const effectData = {
            name: label,
            type: 'effect',
            img: 'icons/creatures/mammals/cat-hunched-glowing-red.webp',
            system: {
              rules: [
                {
                  key: 'ActiveEffectLike',
                  path: 'system.attributes.speed.value',
                  mode: 'multiply',
                  value: multiplier,
                },
              ],
              tokenIcon: { show: false },
              // Keep duration flexible; we’ll remove explicitly on restore
              duration: { unit: 'unlimited' },
            },
            flags: { [MODULE_ID]: { sneakSpeedEffect: true } },
          };
          const created = await actor.createEmbeddedDocuments('Item', [effectData]);
          const effect = Array.isArray(created) ? created[0] : null;
          if (effect?.id) {
            await actor.setFlag(MODULE_ID, EFFECT_ID_FLAG, effect.id);
            return; // Done via effect
          }
        }
      } catch (effectErr) {
        // Fall through to direct update
        console.debug('PF2E Visioner | Could not create effect, falling back to direct speed update:', effectErr);
      }

      // Fallback: directly update the base speed (minimum 5 ft)
      const newSpeed = Math.max(5, Math.floor(current * multiplier));
      await actor.update({ 'system.attributes.speed.value': newSpeed });
    } catch (error) {
      console.warn('PF2E Visioner | Failed to apply sneak walk speed:', error);
    }
  }

  /**
   * Restore the original walking speed if it was halved by applySneakWalkSpeed.
   * Safe to call even if not applied.
   * @param {Token|Actor} tokenOrActor
   */
  static async restoreSneakWalkSpeed(tokenOrActor) {
    try {
      const actor = SneakSpeedService.resolveActor(tokenOrActor);
      if (!actor) return;

      // Remove created effect if it exists
      try {
        const effectId = actor.getFlag?.(MODULE_ID, EFFECT_ID_FLAG);
        if (effectId) {
          const effectExists = actor.items?.get?.(effectId) || actor.items?.find?.((i) => i.id === effectId);
          if (effectExists && typeof actor.deleteEmbeddedDocuments === 'function') {
            await actor.deleteEmbeddedDocuments('Item', [effectId]);
          }
          await actor.unsetFlag(MODULE_ID, EFFECT_ID_FLAG);
        }
      } catch (e) {
        console.debug('PF2E Visioner | Failed removing sneak speed effect (continuing):', e);
      }

      // Restore original speed if we directly modified it
      const original = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
      if (original !== undefined && original !== null) {
        try {
          await actor.update({ 'system.attributes.speed.value': original });
        } catch (e) {
          // If update fails, at least clear the flag to avoid stale state
          console.debug('PF2E Visioner | Failed to restore speed directly (may be effect-driven):', e);
        }
        await actor.unsetFlag(MODULE_ID, ORIGINAL_SPEED_FLAG);
      }
    } catch (error) {
      console.warn('PF2E Visioner | Failed to restore sneak walk speed:', error);
    }
  }

  /**
   * Compute the maximum distance (in feet) a token can move with a single Sneak action,
   * considering speed multiplier (halved or full) and feat-based flat bonuses.
   * Per Very Sneaky, the total distance cannot exceed the creature's Speed.
   * @param {Token|Actor} tokenOrActor
   * @returns {number} feet
   */
  static async getSneakMaxDistanceFeet(tokenOrActor) {
    const actor = SneakSpeedService.resolveActor(tokenOrActor);
    if (!actor) return 0;
    // Prefer original speed flag if present (so we don't double-apply the effect when Sneak is active)
    const original = actor.getFlag?.(MODULE_ID, ORIGINAL_SPEED_FLAG);
    const baseSpeed = Number(original ?? actor.system?.attributes?.speed?.value ?? 0) || 0;
    if (baseSpeed <= 0) return 0;

    let multiplier = 0.5;
    let bonusFeet = 0;
    try {
      const { FeatsHandler } = await import('./feats-handler.js');
      multiplier = FeatsHandler.getSneakSpeedMultiplier(actor) ?? 0.5;
      bonusFeet = FeatsHandler.getSneakDistanceBonusFeet(actor) ?? 0;
    } catch {}

    const raw = Math.floor(baseSpeed * multiplier) + bonusFeet;
    // Cannot exceed base Speed as per Very Sneaky text
    return Math.min(baseSpeed, raw);
  }
}

export default SneakSpeedService;
