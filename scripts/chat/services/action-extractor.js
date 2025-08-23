/**
 * Extract action data from a chat message. Supports Seek, Point Out, Hide, Sneak,
 * Create a Diversion, and damage consequences.
 */
export async function extractActionData(message) {
  if (!message) return null;

  const context = message.flags?.pf2e?.context;
  const origin = message.flags?.pf2e?.origin;

  const isPointOutAction =
    message.flavor?.toLowerCase?.().includes?.('point out') ||
    message.flavor?.toLowerCase?.().includes?.('указать') || // temporary fix for russian language
    context?.options?.some((opt) => opt.includes('action:point-out')) ||
    origin?.rollOptions?.some((opt) => opt.includes('item:point-out'));

  const isSeekAction =
    (context?.type === 'perception-check' &&
      (context.options?.includes('action:seek') || context.slug === 'seek')) ||
    message.flavor?.toLowerCase?.().includes?.('seek');

  const isCreateADiversionAction =
    (context?.type === 'skill-check' &&
      (context.options?.some((opt) => opt.startsWith('action:create-a-diversion')) ||
        context.slug === 'create-a-diversion')) ||
    message.flavor?.toLowerCase?.().includes?.('create a diversion');

  const isTakeCoverAction =
    (context?.type === 'action' &&
      (context.options?.includes?.('action:take-cover') || context.slug === 'take-cover')) ||
    origin?.rollOptions?.includes?.('origin:item:take-cover') ||
    origin?.rollOptions?.includes?.('origin:item:slug:take-cover') ||
    message.content?.includes?.('Take Cover') ||
    message.flavor?.toLowerCase?.().includes?.('take cover') ||
    message.flavor?.includes?.("Mise à l'abri");

  const isAvoidNoticeAction =
    origin?.rollOptions?.includes('origin:item:avoid-notice') ||
    origin?.rollOptions?.includes('origin:item:slug:avoid-notice') ||
    context?.options?.includes('action:avoid-notice') ||
    message.content?.includes('Avoid Notice') ||
    message.flavor?.toLowerCase?.().includes?.('avoid notice');

  // Check for explicit sneak action first (more specific)
  const isSneakAction =
    !isCreateADiversionAction &&
    !isAvoidNoticeAction &&
    ((context?.type === 'skill-check' &&
      (context.options?.includes('action:sneak') || context.slug === 'sneak')) ||
      (message.flavor?.toLowerCase?.().includes?.('sneak') &&
        !message.flavor?.toLowerCase?.().includes?.('sneak attack') &&
        !message.flavor?.toLowerCase?.().includes?.('create a diversion') &&
        !message.flavor?.toLowerCase?.().includes?.('avoid notice') &&
        !message.flavor?.toLowerCase?.().includes?.('hide')));

  // Check for hide action after sneak (less specific, can overlap)
  const isHideAction =
    !isCreateADiversionAction &&
    !isSneakAction && // Don't classify as hide if already identified as sneak
    ((context?.type === 'skill-check' &&
      (context.options?.includes('action:hide') || context.slug === 'hide')) ||
      (message.flavor?.toLowerCase?.().includes?.('hide') &&
        !message.flavor?.toLowerCase?.().includes?.('create a diversion') &&
        !message.flavor?.toLowerCase?.().includes?.('sneak attack'))) &&
    !message.flavor?.toLowerCase?.().includes?.('sneak');

  const isAttackRoll =
    context?.type === 'attack-roll' ||
    context?.type === 'spell-attack-roll' ||
    context?.type === 'strike-attack-roll' ||
    message.content?.includes('Attack Roll') ||
    message.content?.includes('Strike') ||
    context?.options?.some((opt) => opt.includes('attack-roll')) ||
    context?.options?.some((opt) => opt.includes('strike'));

  // Skip attack consequences for damage-taken messages
  const isDamageTakenMessage =
    context?.type === 'damage-taken' || message.flags?.pf2e?.appliedDamage;

  let actorToken = null;
  if (message.token?.object) {
    actorToken = message.token.object;
  } else if (message.speaker?.token && canvas?.tokens?.get) {
    actorToken = canvas.tokens.get(message.speaker.token);
  }
  if (!actorToken && message.speaker?.actor) {
    try {
      const speakerActor = game.actors?.get?.(message.speaker.actor);
      const activeTokens = speakerActor?.getActiveTokens?.(true, true) || [];
      actorToken = activeTokens[0] || null;
    } catch (_) {}
  }
  if (!actorToken && origin?.uuid && typeof fromUuidSync === 'function') {
    try {
      const originDoc = fromUuidSync(origin.uuid);
      const originActor = originDoc?.actor ?? originDoc?.parent?.actor ?? null;
      const activeTokens = originActor?.getActiveTokens?.(true, true) || [];
      actorToken = activeTokens[0] || null;
    } catch (_) {}
  }

  let isHiddenOrUndetectedToken = false;
  if (actorToken?.actor) {
    const itemTypeConditions = actorToken.actor.itemTypes?.condition || [];
    const legacyConditions = actorToken.actor.conditions?.conditions || [];
    isHiddenOrUndetectedToken =
      itemTypeConditions.some((c) => c?.slug === 'hidden' || c?.slug === 'undetected') ||
      legacyConditions.some((c) => c?.slug === 'hidden' || c?.slug === 'undetected');
  }
  if (!isHiddenOrUndetectedToken && context?.options) {
    isHiddenOrUndetectedToken = context.options.some(
      (opt) =>
        opt.includes('effect:hidden-from') ||
        opt.includes('effect:undetected-from') ||
        opt.includes('hidden-from') ||
        opt.includes('undetected-from'),
    );
  }

  // Debug logging for action type detection

  let actionType = null;
  if (isSeekAction) actionType = 'seek';
  else if (isPointOutAction) actionType = 'point-out';
  else if (isSneakAction)
    actionType = 'sneak'; // Check sneak BEFORE hide
  else if (isHideAction) actionType = 'hide';
  else if (isCreateADiversionAction) actionType = 'create-a-diversion';
  else if (isTakeCoverAction) actionType = 'take-cover';
  else if (isAttackRoll && !isDamageTakenMessage) {
    if (isHiddenOrUndetectedToken) actionType = 'consequences';
    else if (actorToken) {
      try {
        // Fallback: if any token on the scene currently treats the attacker as hidden/undetected per Visioner map, enable consequences
        const tokens = canvas?.tokens?.placeables || [];
        if (tokens.length) {
          // Lazy-load only when needed to keep extractor fast on non-attack messages
          const { getVisibilityBetween } = await import('../../utils.js');
          const hasHiddenVsAny = tokens.some((t) => {
            if (!t?.actor || t === actorToken) return false;
            const vis = getVisibilityBetween(t, actorToken);
            return vis === 'hidden' || vis === 'undetected';
          });
          if (hasHiddenVsAny) actionType = 'consequences';
        }
      } catch (_) {}
    }
  }

  if (!actionType) return null;

  // Build common action data object
  const data = {
    messageId: message.id,
    actor: actorToken,
    context,
    origin,
    actionType,
  };

  // Add attack roll data for consequences
  if (actionType === 'consequences') {
    data.attackData = { isAttackRoll: true };
  }

  if (context?.type === 'skill-check' && message.rolls?.[0]) {
    try {
      const roll = message.rolls[0];
      const total = Number(roll.total ?? roll?._total ?? 0);
      const die = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
      if (Number.isFinite(total)) {
        data.roll = { total, dice: [{ total: die }] };
      }
    } catch (_) {}
  }

  // For Point Out, include target reference if present
  try {
    if (actionType === 'point-out' && !data.context?.target && message.flags?.pf2e?.target) {
      data.context = data.context || {};
      data.context.target = { ...message.flags.pf2e.target };
    }
  } catch (_) {}

  return data;
}
