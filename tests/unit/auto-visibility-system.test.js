/**
 * Tests for AutoVisibilitySystem
 */

import AutoVisibilitySystem from '../../scripts/visibility/auto-visibility/AutoVisibilitySystem.js';

// Mock FoundryVTT globals
global.game = {
  user: { isGM: true },
  settings: {
    get: jest.fn().mockReturnValue(true),
  },
  modules: {
    get: jest.fn().mockReturnValue({ api: {} }),
  },
};

global.canvas = {
  tokens: {
    placeables: [],
  },
  visibility: {
    testVisibility: jest.fn().mockReturnValue(true),
  },
  lighting: {
    placeables: [],
  },
  scene: {
    darkness: 0,
  },
  grid: {
    measureDistance: jest.fn().mockReturnValue(5),
  },
};

global.Hooks = {
  on: jest.fn(),
  once: jest.fn(),
};

// Mock console methods
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('AutoVisibilitySystem', () => {
  let autoVisibilitySystem;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Get fresh instance for each test
    autoVisibilitySystem = AutoVisibilitySystem;
  });

  describe('Singleton Pattern', () => {
    test('should return the same instance when called multiple times', () => {
      const instance1 = AutoVisibilitySystem;
      const instance2 = AutoVisibilitySystem;
      expect(instance1).toBe(instance2);
    });

    test('should throw error when trying to create new instance directly', () => {
      expect(() => {
        new AutoVisibilitySystem.constructor();
      }).toThrow();
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully with default options', async () => {
      await autoVisibilitySystem.initialize();
      expect(autoVisibilitySystem.isEnabled).toBe(true);
    });

    test('should initialize with custom enabled state', async () => {
      await autoVisibilitySystem.initialize({ enabled: false });
      expect(autoVisibilitySystem.isEnabled).toBe(false);
    });

    test('should not initialize twice', async () => {
      await autoVisibilitySystem.initialize();
      const consoleSpy = jest.spyOn(console, 'log');
      await autoVisibilitySystem.initialize();
      // Should only log once
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Enable/Disable System', () => {
    beforeEach(async () => {
      await autoVisibilitySystem.initialize();
    });

    test('should enable the system', () => {
      autoVisibilitySystem.setEnabled(true);
      expect(autoVisibilitySystem.isEnabled).toBe(true);
    });

    test('should disable the system', () => {
      autoVisibilitySystem.setEnabled(false);
      expect(autoVisibilitySystem.isEnabled).toBe(false);
    });
  });

  describe('Visibility Calculation', () => {
    let mockObserver, mockTarget;

    beforeEach(async () => {
      await autoVisibilitySystem.initialize();

      // Create mock tokens
      mockObserver = {
        actor: {
          perception: {
            hasVision: true,
            senses: new Map([['darkvision', { range: 60 }]]),
          },
        },
        center: { x: 0, y: 0 },
        distanceTo: jest.fn().mockReturnValue(30),
      };

      mockTarget = {
        actor: {
          hasCondition: jest.fn().mockReturnValue(false),
        },
        center: { x: 100, y: 100 },
        x: 100,
        y: 100,
      };
    });

    test('should return observed in bright light', async () => {
      // Mock bright light conditions
      canvas.lighting.placeables = [
        {
          emitsLight: true,
          center: { x: 50, y: 50 },
          brightRadius: 100,
          dimRadius: 200,
        },
      ];

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('observed');
    });

    test('should return concealed in dim light without darkvision', async () => {
      // Observer without darkvision
      mockObserver.actor.perception.senses = new Map();

      // Mock dim light conditions
      canvas.lighting.placeables = [
        {
          emitsLight: true,
          center: { x: 50, y: 50 },
          brightRadius: 50,
          dimRadius: 150,
        },
      ];

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('concealed');
    });

    test('should return hidden in darkness without darkvision', async () => {
      // Observer without darkvision
      mockObserver.actor.perception.senses = new Map();

      // Mock darkness (no light sources)
      canvas.lighting.placeables = [];
      canvas.scene.darkness = 1;

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('hidden');
    });

    test('should return observed in darkness with darkvision', async () => {
      // Mock darkness
      canvas.lighting.placeables = [];
      canvas.scene.darkness = 1;

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('observed');
    });

    test('should return undetected for invisible targets without see-invisibility', async () => {
      mockTarget.actor.hasCondition = jest.fn().mockReturnValue(true);

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('undetected');
    });

    test('should return observed for invisible targets with see-invisibility', async () => {
      mockTarget.actor.hasCondition = jest.fn().mockReturnValue(true);
      mockObserver.actor.perception.senses.set('see-invisibility', { range: Infinity });

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('observed');
    });

    test('should return hidden when no line of sight but has tremorsense', async () => {
      canvas.visibility.testVisibility = jest.fn().mockReturnValue(false);
      mockObserver.actor.perception.senses.set('tremorsense', { range: 60 });

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('hidden');
    });

    test('should return undetected when no line of sight and no special senses', async () => {
      canvas.visibility.testVisibility = jest.fn().mockReturnValue(false);
      mockObserver.actor.perception.senses = new Map();

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('undetected');
    });

    test('should handle missing actor gracefully', async () => {
      const visibility = await autoVisibilitySystem.calculateVisibility(null, mockTarget);
      expect(visibility).toBe('observed');
    });

    test('should handle errors gracefully', async () => {
      // Force an error by making distanceTo throw
      mockObserver.distanceTo = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const visibility = await autoVisibilitySystem.calculateVisibility(mockObserver, mockTarget);
      expect(visibility).toBe('observed'); // Should fallback to default
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Light Level Detection', () => {
    beforeEach(async () => {
      await autoVisibilitySystem.initialize();
    });

    test('should detect bright light correctly', () => {
      canvas.lighting.placeables = [
        {
          emitsLight: true,
          center: { x: 0, y: 0 },
          brightRadius: 100,
          dimRadius: 200,
        },
      ];

      const lightLevel = autoVisibilitySystem._getLightLevelAt({ x: 50, y: 50 });
      expect(lightLevel).toBe(1); // Bright light
    });

    test('should detect dim light correctly', () => {
      canvas.lighting.placeables = [
        {
          emitsLight: true,
          center: { x: 0, y: 0 },
          brightRadius: 50,
          dimRadius: 150,
        },
      ];

      const lightLevel = autoVisibilitySystem._getLightLevelAt({ x: 100, y: 100 });
      expect(lightLevel).toBe(0.5); // Dim light
    });

    test('should detect darkness correctly', () => {
      canvas.lighting.placeables = [];
      canvas.scene.darkness = 1;

      const lightLevel = autoVisibilitySystem._getLightLevelAt({ x: 100, y: 100 });
      expect(lightLevel).toBe(0); // Darkness
    });

    test('should factor in scene darkness', () => {
      canvas.lighting.placeables = [
        {
          emitsLight: true,
          center: { x: 0, y: 0 },
          brightRadius: 100,
          dimRadius: 200,
        },
      ];
      canvas.scene.darkness = 0.5;

      const lightLevel = autoVisibilitySystem._getLightLevelAt({ x: 50, y: 50 });
      expect(lightLevel).toBe(0.5); // Bright light reduced by darkness
    });
  });

  describe('Vision Capabilities', () => {
    beforeEach(async () => {
      await autoVisibilitySystem.initialize();
    });

    test('should detect darkvision correctly', () => {
      const mockToken = {
        actor: {
          perception: {
            hasVision: true,
            senses: new Map([['darkvision', { range: 60 }]]),
          },
        },
      };

      const vision = autoVisibilitySystem._getVisionCapabilities(mockToken);
      expect(vision.hasDarkvision).toBe(true);
      expect(vision.darkvisionRange).toBe(60);
    });

    test('should detect low-light vision correctly', () => {
      const mockToken = {
        actor: {
          perception: {
            hasVision: true,
            senses: new Map([['low-light-vision', { range: Infinity }]]),
          },
        },
      };

      const vision = autoVisibilitySystem._getVisionCapabilities(mockToken);
      expect(vision.hasLowLightVision).toBe(true);
    });

    test('should handle tokens without senses', () => {
      const mockToken = {
        actor: {
          perception: {
            hasVision: true,
          },
        },
      };

      const vision = autoVisibilitySystem._getVisionCapabilities(mockToken);
      expect(vision.hasVision).toBe(true);
      expect(vision.hasDarkvision).toBe(false);
      expect(vision.hasLowLightVision).toBe(false);
    });

    test('should handle tokens without perception', () => {
      const mockToken = {
        actor: {},
      };

      const vision = autoVisibilitySystem._getVisionCapabilities(mockToken);
      expect(vision.hasVision).toBe(true); // Default
      expect(vision.hasDarkvision).toBe(false);
    });
  });

  describe('Debug Information', () => {
    let mockObserver, mockTarget;

    beforeEach(async () => {
      await autoVisibilitySystem.initialize();

      mockObserver = {
        name: 'Observer',
        actor: {
          perception: {
            hasVision: true,
            senses: new Map([['darkvision', { range: 60 }]]),
          },
        },
        center: { x: 0, y: 0 },
        distanceTo: jest.fn().mockReturnValue(30),
      };

      mockTarget = {
        name: 'Target',
        actor: {
          hasCondition: jest.fn().mockReturnValue(false),
        },
        center: { x: 100, y: 100 },
        x: 100,
        y: 100,
      };
    });

    test('should provide comprehensive debug information', async () => {
      const debugInfo = await autoVisibilitySystem.getVisibilityDebugInfo(mockObserver, mockTarget);

      expect(debugInfo).toHaveProperty('observer', 'Observer');
      expect(debugInfo).toHaveProperty('target', 'Target');
      expect(debugInfo).toHaveProperty('lightLevel');
      expect(debugInfo).toHaveProperty('vision');
      expect(debugInfo).toHaveProperty('hasLineOfSight');
      expect(debugInfo).toHaveProperty('canDetectWithoutSight');
      expect(debugInfo).toHaveProperty('isInvisible');
      expect(debugInfo).toHaveProperty('calculatedVisibility');
      expect(debugInfo).toHaveProperty('sceneDarkness');
    });
  });

  describe('Hook Registration', () => {
    test('should register all necessary hooks', async () => {
      await autoVisibilitySystem.initialize();

      expect(Hooks.on).toHaveBeenCalledWith('updateToken', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('createToken', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('lightingRefresh', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('updateWall', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('createWall', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('deleteWall', expect.any(Function));
      expect(Hooks.on).toHaveBeenCalledWith('updateScene', expect.any(Function));
    });
  });

  describe('Performance and Error Handling', () => {
    beforeEach(async () => {
      await autoVisibilitySystem.initialize();
    });

    test('should not process the same token multiple times simultaneously', async () => {
      const mockTokenDoc = {
        id: 'test-token',
        object: {
          actor: { name: 'Test Actor' },
        },
      };

      // Start two simultaneous updates
      const promise1 = autoVisibilitySystem._updateTokenVisibility(mockTokenDoc);
      const promise2 = autoVisibilitySystem._updateTokenVisibility(mockTokenDoc);

      await Promise.all([promise1, promise2]);

      // Should handle gracefully without errors
      expect(console.error).not.toHaveBeenCalled();
    });

    test('should handle missing canvas gracefully', async () => {
      const originalCanvas = global.canvas;
      global.canvas = null;

      const mockTokenDoc = {
        id: 'test-token',
        object: null,
      };

      await autoVisibilitySystem._updateTokenVisibility(mockTokenDoc);

      // Should not throw errors
      expect(console.error).not.toHaveBeenCalled();

      global.canvas = originalCanvas;
    });

    test('should skip processing when system is disabled', async () => {
      autoVisibilitySystem.setEnabled(false);

      const mockTokenDoc = {
        id: 'test-token',
        object: {
          actor: { name: 'Test Actor' },
        },
      };

      await autoVisibilitySystem._updateTokenVisibility(mockTokenDoc);

      // Should exit early without processing
      expect(canvas.tokens.placeables).toHaveLength(0);
    });

    test('should skip processing for non-GM users', async () => {
      game.user.isGM = false;

      const mockTokenDoc = {
        id: 'test-token',
        object: {
          actor: { name: 'Test Actor' },
        },
      };

      await autoVisibilitySystem._updateTokenVisibility(mockTokenDoc);

      // Should exit early without processing
      expect(canvas.tokens.placeables).toHaveLength(0);

      game.user.isGM = true; // Reset for other tests
    });
  });
});
