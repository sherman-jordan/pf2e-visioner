import { MODULE_ID } from '../constants.js';

export const LOG_PREFIX = `[${MODULE_ID}] Ephemeral`;

const locks = new WeakMap();
export async function runWithEffectLock(actor, taskFn) {
  if (!actor) return taskFn();
  const prev = locks.get(actor) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await taskFn();
    } catch (e) {
      console.warn(`${LOG_PREFIX}: task error`, e);
      return null;
    }
  });
  locks.set(
    actor,
    next.catch(() => {}),
  );
  return next;
}
