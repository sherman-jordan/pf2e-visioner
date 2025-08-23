/**
 * Utilities to reconstruct or ensure minimal roll data for actions.
 */

export function reconstructRollFromMessage(messageId) {
  try {
    const msg = game.messages.get(messageId);
    const roll = msg?.rolls?.[0];
    if (!roll) return null;
    const total = Number(roll.total ?? roll?._total ?? 0);
    const die = roll.dice?.[0]?.total ?? roll.terms?.[0]?.total;
    return { total, dice: [{ total: die }] };
  } catch (_) {
    return null;
  }
}

// Generic helper: ensure a skill-check roll is present on actionData
export function ensureActionRoll(actionData) {
  if (actionData.roll && typeof actionData.roll.total === 'number') return actionData;
  if (!actionData.messageId) return actionData;
  const reconstructed = reconstructRollFromMessage(actionData.messageId);
  if (reconstructed) actionData.roll = reconstructed;
  return actionData;
}
