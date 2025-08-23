import { MODULE_ID } from '../constants.js';

export const LOG_PREFIX = `[${MODULE_ID}] Cover`;

const locks = new WeakMap();
export async function runWithCoverEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = locks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (_) {
      return null;
    }
  });
  locks.set(
    actor,
    next.catch(() => {}),
  );
  return next;
}

export function coverDebug(...args) {
  try {
    if (game?.settings?.get?.(MODULE_ID, 'debug')) {
      // Use console.debug with a consistent prefix
      console.debug(LOG_PREFIX, ...args);
    }
  } catch (_) {}
}
