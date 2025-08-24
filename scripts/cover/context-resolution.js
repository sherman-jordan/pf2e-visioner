/**
 * Context Resolution Module
 * Handles attacker/target resolution, token parsing, and context analysis
 */

/**
 * Normalize token reference from various formats
 * @param {*} ref - Token reference (string, UUID, or object)
 * @returns {string|null} Normalized token ID or null if invalid
 */
export function normalizeTokenRef(ref) {
  try {
    if (!ref) return null;
    let s = typeof ref === 'string' ? ref.trim() : String(ref);
    // Strip surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      s = s.slice(1, -1);
    // If it's a UUID, extract the final Token.<id> segment
    const m = s.match(/Token\.([^.\s]+)$/);
    if (m && m[1]) return m[1];
    // Otherwise assume it's already the token id
    return s;
  } catch (_) {
    return ref;
  }
}

/**
 * Check if context represents an attack-like action
 * @param {Object} ctx - Context object
 * @returns {boolean} True if context is attack-related
 */
export function isAttackContext(ctx) {
  const type = ctx?.type ?? '';
  const traits = Array.isArray(ctx?.traits) ? ctx.traits : [];
  if (type === 'attack-roll' || type === 'spell-attack-roll' || traits.includes('attack')) return true;
  // Treat saving throws as relevant so wrapper can inject ephemeral cover bonuses on Reflex saves
  if (type === 'saving-throw') return true;
  return false;
}

/**
 * Resolve attacker token from context
 * @param {Object} ctx - Context object
 * @returns {Object|null} Attacker token object or null
 */
export function resolveAttackerFromCtx(ctx) {
  try {
    const tokenObj = ctx?.token?.object || ctx?.token;
    if (tokenObj?.id) return tokenObj;
    if (ctx?.token?.isEmbedded && ctx?.token?.object?.id) return ctx.token.object;
    // Try a variety of sources, including origin.token (UUID like Scene.X.Token.Y)
    const tokenIdRaw =
      ctx?.token?.id ||
      ctx?.tokenId ||
      ctx?.origin?.tokenId ||
      ctx?.origin?.token ||
      ctx?.actor?.getActiveTokens?.()?.[0]?.id;
    const tokenId = normalizeTokenRef(tokenIdRaw);
    return tokenId ? canvas?.tokens?.get?.(tokenId) || null : null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve target token from context
 * @param {Object} ctx - Context object
 * @returns {Object|null} Target token object or null
 */
export function resolveTargetFromCtx(ctx) {
  try {
    const tObj = ctx?.target?.token?.object || ctx?.target?.token;
    if (tObj?.id) return tObj;
    const targetIdRaw =
      typeof ctx?.target?.token === 'string'
        ? ctx.target.token
        : ctx?.target?.tokenId || ctx?.targetTokenId;
    const targetId = normalizeTokenRef(targetIdRaw);
    if (targetId) {
      const byCtx = canvas?.tokens?.get?.(targetId);
      if (byCtx) return byCtx;
    }
    const t =
      Array.from(game?.user?.targets ?? [])?.[0] || Array.from(canvas?.tokens?.targets ?? [])?.[0];
    return t || null;
  } catch (_) {
    return null;
  }
}

/**
 * Check if message data represents an attack-like action
 * @param {Object} data - Message data object
 * @returns {boolean} True if message is attack-related
 */
export function isAttackLikeMessageData(data) {
  const flags = data?.flags?.pf2e ?? {};
  const ctx = flags.context ?? {};
  const type = ctx?.type ?? '';
  const traits = ctx?.traits ?? [];
  const domains = ctx?.domains ?? [];
  
  // Treat attack and damage rolls as relevant for cover application/caching
  if (
    type === 'attack-roll' ||
    type === 'spell-attack-roll' ||
    type === 'damage-roll' ||
    type === 'saving-throw'
  )
    return true;
    
  // Include stealth skill checks
  if (type === 'skill-check' && Array.isArray(domains) && domains.includes('stealth'))
    return true;
    
  if (Array.isArray(traits) && traits.includes('attack')) return true;
  return false;
}

/**
 * Resolve target token ID from message data
 * @param {Object} data - Message data object
 * @returns {string|null} Target token ID or null
 */
export function resolveTargetTokenIdFromData(data) {
  try {
    const pf2eTarget = data?.flags?.pf2e?.context?.target?.token ?? data?.flags?.pf2e?.target?.token;
    if (pf2eTarget) {
      try {
        console.debug('PF2E Visioner | target-resolve: pf2e.context.target.token', { value: pf2eTarget });
      } catch (_) {}
      return normalizeTokenRef(pf2eTarget);
    }
  } catch (_) {}
  try {
    const context = data?.flags?.pf2e?.context;
    if (context?.target?.token) return normalizeTokenRef(context.target.token);
    if (context?.target?.actor) {
      const first = Array.from(canvas?.tokens?.placeables || [])
        .find((t) => t.actor?.id === context.target.actor)?.id;
      if (typeof first === 'string') {
        try {
          console.debug('PF2E Visioner | target-resolve: matched token by context.target.actor', { actorId: context.target.actor, tokenId: first });
        } catch (_) {}
        return normalizeTokenRef(first);
      }
    }
  } catch (_) {}
  // Fallback: pf2e-toolbelt target helper may carry targets for area damage
  try {
    const tbTargets = data?.flags?.['pf2e-toolbelt']?.targetHelper?.targets;
    if (Array.isArray(tbTargets) && tbTargets.length === 1) {
      try {
        console.debug('PF2E Visioner | target-resolve: pf2e-toolbelt single target', { value: tbTargets[0] });
      } catch (_) {}
      return normalizeTokenRef(tbTargets[0]);
    }
  } catch (_) {}
  try {
    console.debug('PF2E Visioner | target-resolve: no target found in pf2e flags or toolbelt');
  } catch (_) {}
  return null;
}