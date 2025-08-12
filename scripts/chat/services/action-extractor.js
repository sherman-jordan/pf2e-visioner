
/**
 * Extract action data from a chat message. Supports Seek, Point Out, Hide, Sneak,
 * Create a Diversion, and damage consequences.
 */
export function extractActionData(message) {
  if (!message) return null;

  const context = message.flags?.pf2e?.context;
  const origin = message.flags?.pf2e?.origin;

  const isPointOutAction =
    origin?.rollOptions?.includes("origin:item:point-out") ||
    origin?.rollOptions?.includes("origin:item:slug:point-out") ||
    message.content?.includes("Point Out") ||
    message.flavor?.toLowerCase?.().includes?.("point out");

  const isSeekAction =
    (context?.type === "skill-check" &&
      (context.options?.includes("action:seek") || context.slug === "seek")) ||
    message.flavor?.toLowerCase?.().includes?.("seek");

  const isCreateADiversionAction =
    (context?.type === "skill-check" &&
      (context.options?.some((opt) => opt.startsWith("action:create-a-diversion")) ||
        context.slug === "create-a-diversion")) ||
    message.flavor?.toLowerCase?.().includes?.("create a diversion");

  const isHideAction =
    !isCreateADiversionAction &&
    ((context?.type === "skill-check" &&
      (context.options?.includes("action:hide") || context.slug === "hide")) ||
      (message.flavor?.toLowerCase?.().includes?.("hide") &&
        !message.flavor?.toLowerCase?.().includes?.("create a diversion")));

  const isAvoidNoticeAction =
    origin?.rollOptions?.includes("origin:item:avoid-notice") ||
    origin?.rollOptions?.includes("origin:item:slug:avoid-notice") ||
    context?.options?.includes("action:avoid-notice") ||
    message.content?.includes("Avoid Notice") ||
    message.flavor?.toLowerCase?.().includes?.("avoid notice");

  const isSneakAction =
    !isCreateADiversionAction &&
    !isAvoidNoticeAction &&
    ((context?.type === "skill-check" &&
      (context.options?.includes("action:sneak") || context.slug === "sneak")) ||
      (message.flavor?.toLowerCase?.().includes?.("sneak") &&
        !message.flavor?.toLowerCase?.().includes?.("create a diversion")));

  const firstRoll = message.rolls?.[0];
  const isDamageRoll =
    context?.type === "damage-roll" ||
    message.flags?.pf2e?.damageRoll ||
    (firstRoll &&
      (firstRoll.isDamage === true ||
        (typeof DamageRoll !== "undefined" && firstRoll instanceof DamageRoll) ||
        (typeof CONFIG?.Dice?.DamageRoll !== "undefined" && firstRoll instanceof CONFIG.Dice.DamageRoll) ||
        (typeof firstRoll?.options?.type === "string" && firstRoll.options.type.includes("damage")))) ||
    message.content?.includes("Damage Roll");

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
  if (!actorToken && origin?.uuid && typeof fromUuidSync === "function") {
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
      itemTypeConditions.some((c) => c?.slug === "hidden" || c?.slug === "undetected") ||
      legacyConditions.some((c) => c?.slug === "hidden" || c?.slug === "undetected");
  }
  if (!isHiddenOrUndetectedToken && context?.options) {
    isHiddenOrUndetectedToken = context.options.some(
      (opt) =>
        opt.includes("effect:hidden-from") ||
        opt.includes("effect:undetected-from") ||
        opt.includes("hidden-from") ||
        opt.includes("undetected-from")
    );
  }

  let actionType = null;
  if (isSeekAction) actionType = "seek";
  else if (isPointOutAction) actionType = "point-out";
  else if (isHideAction) actionType = "hide";
  else if (isSneakAction) actionType = "sneak";
  else if (isCreateADiversionAction) actionType = "create-a-diversion";
  else if (isDamageRoll && isHiddenOrUndetectedToken) actionType = "consequences";

  if (!actionType) return null;

  // Build common action data object
  const data = {
    messageId: message.id,
    actor: actorToken,
    context,
    origin,
    actionType,
  };

  if (context?.type === "skill-check" && message.rolls?.[0]) {
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
    if (actionType === "point-out" && !data.context?.target && message.flags?.pf2e?.target) {
      data.context = data.context || {};
      data.context.target = { ...message.flags.pf2e.target };
    }
  } catch (_) {}

  return data;
}


