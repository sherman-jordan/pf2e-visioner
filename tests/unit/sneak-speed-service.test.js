import { jest } from '@jest/globals';

describe('sneak-speed-service', () => {
  let service;
  beforeAll(async () => {
    service = await import('../../scripts/chat/services/sneak-speed-service.js');
  });

  test('applySneakWalkSpeed stores and halves walk speed', async () => {
    const flags = new Map();
    const actor = {
      system: { attributes: { speed: { value: 30 } } },
      getFlag: (mod, key) => (mod === 'pf2e-visioner' ? flags.get(key) : undefined),
      setFlag: (mod, key, val) => {
        if (mod === 'pf2e-visioner') flags.set(key, val);
        return Promise.resolve();
      },
      update: jest.fn().mockResolvedValue(true),
    };
    const token = { actor };

  await service.SneakSpeedService.applySneakWalkSpeed(token);

    expect(flags.get('sneak-original-walk-speed')).toBe(30);
    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.speed.value': 15 });
  });

  test('restoreSneakWalkSpeed restores and clears flag', async () => {
    const flags = new Map([['sneak-original-walk-speed', 25]]);
    const actor = {
      system: { attributes: { speed: { value: 10 } } },
      getFlag: (mod, key) => (mod === 'pf2e-visioner' ? flags.get(key) : undefined),
      unsetFlag: (mod, key) => {
        if (mod === 'pf2e-visioner') flags.delete(key);
        return Promise.resolve();
      },
      update: jest.fn().mockResolvedValue(true),
    };
    const token = { actor };

  await service.SneakSpeedService.restoreSneakWalkSpeed(token);

    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.speed.value': 25 });
    expect(flags.has('sneak-original-walk-speed')).toBe(false);
  });
});
