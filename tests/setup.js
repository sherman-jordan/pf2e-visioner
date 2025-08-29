/**
 * Jest setup file for PF2E Visioner tests
 * Mocks Foundry VTT globals and provides test utilities
 */

// Mock Foundry VTT global objects
global.game = {
  modules: {
    get: jest.fn((id) => ({
      api: {},
      version: '2.6.1',
    })),
  },
  settings: {
    get: jest.fn((moduleId, settingId) => {
      // Check if we have a stored value first
      if (global.pf2eVisionerTestState?.settings?.[moduleId]?.[settingId] !== undefined) {
        return global.pf2eVisionerTestState.settings[moduleId][settingId];
      }

      // Default settings for tests
      const defaults = {
        'pf2e-visioner': {
          defaultEncounterFilter: false,
          ignoreAllies: false,
          colorblindMode: 'none',
          hiddenWallsEnabled: true,
          autoCoverEnabled: true,
          revealOnAttack: true,
          revealOnSpell: true,
          revealOnDamage: false,
          coverFromTokens: true,
          coverFromWalls: true,
          coverFromTerrain: true,
          coverFromLighting: false,
          coverFromEffects: false,
          coverFromSize: true,
          coverFromElevation: true,
          coverFromRotation: true,
          coverFromArc: true,
          coverFromDistance: false,
          coverFromMovement: false,
          coverFromStealth: false,
          coverFromInvisibility: false,
          coverFromConcealment: false,
          coverFromHidden: false,
          coverFromUndetected: false,
          coverFromObserved: false,
          coverFromConcealed: false,
          sneakRawEnforcement: false,
          enforceRawRequirements: false,
        },
      };
      return defaults[moduleId]?.[settingId] ?? false;
    }),
    set: jest.fn((moduleId, settingId, value) => {
      // Store the setting value for retrieval
      if (!global.pf2eVisionerTestState) global.pf2eVisionerTestState = {};
      if (!global.pf2eVisionerTestState.settings) global.pf2eVisionerTestState.settings = {};
      if (!global.pf2eVisionerTestState.settings[moduleId])
        global.pf2eVisionerTestState.settings[moduleId] = {};
      global.pf2eVisionerTestState.settings[moduleId][settingId] = value;
    }),
    register: jest.fn(),
  },
  user: {
    isGM: true,
    hasRole: jest.fn(() => true),
    character: null,
  },
  system: {
    id: 'pf2e',
    version: '6.0.0',
  },
  i18n: {
    localize: jest.fn((key) => key || 'mock.message'), // Simple mock that returns the key or a default
    format: jest.fn((template, data) => template),
  },
};

global.canvas = {
  scene: {
    id: 'test-scene',
    name: 'Test Scene',
    dimensions: { width: 1000, height: 1000 },
    grid: { size: 50 },
  },
  grid: {
    size: 50,
    getPixelsFromGridPosition: jest.fn((x, y) => ({ x: x * 50, y: y * 50 })),
    getGridPositionFromPixels: jest.fn((x, y) => ({
      x: Math.floor(x / 50),
      y: Math.floor(y / 50),
    })),
  },
  tokens: {
    controlled: [],
    placeables: [],
    get: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  },
  walls: {
    placeables: [],
    get: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
    raycast: jest.fn((p1, p2) => {
      // Mock raycast that checks if any wall intersects the line
      const walls = global.canvas?.walls?.placeables || [];
      for (const wall of walls) {
        try {
          const d = wall.document;
          if (!d || d.sight === 0) continue;

          // Skip open doors
          const isDoor = Number(d.door) > 0;
          const doorState = Number(d.ds ?? 0);
          if (isDoor && doorState === 1) continue;

          const [x1, y1, x2, y2] = Array.isArray(d.c) ? d.c : [d.x, d.y, d.x2, d.y2];
          if ([x1, y1, x2, y2].some((n) => typeof n !== 'number')) continue;

          // Simple line intersection check
          const denom = (x2 - x1) * (p2.y - p1.y) - (y2 - y1) * (p2.x - p1.x);
          if (Math.abs(denom) < 1e-10) continue; // parallel lines

          const t = ((p1.x - x1) * (p2.y - p1.y) - (p1.y - y1) * (p2.x - p1.x)) / denom;
          const u = -((x1 - p1.x) * (y2 - y1) - (y1 - p1.y) * (x2 - x1)) / denom;

          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return { t, wall };  // intersection found
          }
        } catch (_) { }
      }
      return null; // no intersection
    }),
    checkCollision: jest.fn((ray) => {
      // Mock checkCollision that uses raycast
      const result = global.canvas.walls.raycast(ray.A, ray.B);
      return !!result;
    }),
  },
  lighting: {
    placeables: [],
    get: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  },
  terrain: {
    placeables: [],
    get: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  },
};

global.ui = {
  notifications: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  windows: {
    get: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  },
};

global.Hooks = {
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  call: jest.fn(),
  callAll: jest.fn(),
};

global.foundry = {
  utils: {
    getProperty: jest.fn((obj, path) => {
      return path.split('.').reduce((o, i) => o?.[i], obj);
    }),
    setProperty: jest.fn((obj, path, value) => {
      const keys = path.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((o, i) => (o[i] = o[i] || {}), obj);
      target[lastKey] = value;
    }),
    deepClone: jest.fn((obj) => JSON.parse(JSON.stringify(obj))),
    mergeObject: jest.fn((target, source, options = {}) => {
      const merged = { ...target };
      for (const [key, value] of Object.entries(source)) {
        if (options.insertKeys !== false || !(key in merged)) {
          merged[key] = value;
        }
      }
      return merged;
    }),
  },
  data: {
    models: {
      Token: class MockToken {
        constructor(data) {
          Object.assign(this, data);
        }
      },
      Actor: class MockActor {
        constructor(data) {
          Object.assign(this, data);
        }
      },
      Scene: class MockScene {
        constructor(data) {
          Object.assign(this, data);
        }
      },
    },
  },
  applications: {
    api: {
      ApplicationV2: class MockApplicationV2 {
        constructor(options = {}) {
          this.options = options;
          this.rendered = false;
          this.element = null;
          this.window = null;
        }

        render(options = {}) {
          this.rendered = true;
          return Promise.resolve(this);
        }

        bringToFront() {
          // Mock implementation
        }
      },
    },
  },
};

global.Handlebars = {
  registerHelper: jest.fn(),
  registerPartial: jest.fn(),
  compile: jest.fn((template) => jest.fn(() => template)),
};

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock DOM elements with a safe Canvas mock to avoid OOM
// Use the real document for non-canvas elements, and return a lightweight canvas for 'canvas'.
(() => {
  const realDocument = global.document ?? document;
  const realCreateElement = realDocument.createElement.bind(realDocument);

  const createMock2DContext = () => {
    // Minimal 2D context covering all methods used by tests
    let anyDrawn = false;
    const ctx = {
      // state
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      shadowColor: 'transparent',
      shadowBlur: 0,
      globalAlpha: 1.0,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',

      // path ops
      beginPath: jest.fn(() => { }),
      moveTo: jest.fn(() => { }),
      lineTo: jest.fn(() => { anyDrawn = true; }),
      arc: jest.fn(() => { anyDrawn = true; }),
      stroke: jest.fn(() => { anyDrawn = true; }),
      fill: jest.fn(() => { anyDrawn = true; }),
      strokeRect: jest.fn(() => { anyDrawn = true; }),
      fillRect: jest.fn(() => { anyDrawn = true; }),
      clearRect: jest.fn(() => { }),

      // gradients
      createLinearGradient: jest.fn(() => ({
        addColorStop: jest.fn(() => { }),
      })),

      // text
      fillText: jest.fn(() => { anyDrawn = true; }),
      measureText: jest.fn((text) => ({
        width: (text?.length ?? 0) * 7.2,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 3,
      })),

      // imaging
      getImageData: jest.fn(() => ({
        // Return a tiny buffer indicating whether anything was drawn
        data: new Uint8ClampedArray(anyDrawn ? [0, 0, 0, 255] : [0, 0, 0, 0]),
        width: 1,
        height: 1,
      })),
    };
    return ctx;
  };

  const createMockCanvas = () => {
    const ctx2d = createMock2DContext();
    const el = {
      tagName: 'CANVAS',
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(() => false),
      },
      width: 300,
      height: 150,
      getContext: jest.fn((type) => (type === '2d' ? ctx2d : null)),
      toDataURL: jest.fn(() => 'data:image/png;base64,'),
      // DOM-like methods used by tests
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0 })),
    };
    return el;
  };

  global.document = {
    ...realDocument,
    body: {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(() => false),
      },
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    createElement: jest.fn((tag) => {
      if (String(tag).toLowerCase() === 'canvas') return createMockCanvas();
      return realCreateElement(tag);
    }),
  };
})();

// Mock window
global.window = {
  ...window,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock shouldFilterAlly function to break circular dependency
global.shouldFilterAlly = jest.fn((observer, token, filterType, ignoreAllies) => {
  // Simple mock: return false (don't filter) for testing
  return false;
});

// Additional globals for token manager tests
global.hasActiveEncounter = jest.fn(() => false);
global.isTokenInEncounter = jest.fn((token) => token.inCombat || false);

// Mock getSceneTargets function with default behavior
global.getSceneTargets = jest.fn((observer, encounterOnly = false, ignoreAllies = false) => {
  // Simple mock that respects filters
  let tokens = global.canvas?.tokens?.placeables || [];

  if (encounterOnly) {
    tokens = tokens.filter((token) => token.inCombat === true);
  }

  if (ignoreAllies) {
    tokens = tokens.filter((token) => !token.actor?.hasPlayerOwner);
  }

  return tokens;
});

// Mock progress system for token manager
global.runTasksWithProgress = jest.fn(async (title, tasks) => {
  // Just run the tasks without progress UI
  for (const task of tasks) {
    if (typeof task === 'function') {
      await task();
    }
  }
});

// Mock dynamic imports for token manager actions
jest.mock(
  '../../scripts/managers/progress.js',
  () => ({
    runTasksWithProgress: global.runTasksWithProgress,
  }),
  { virtual: true },
);

jest.mock(
  '../../scripts/visibility/ephemeral.js',
  () => ({
    batchUpdateVisibilityEffects: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '../../scripts/cover/ephemeral.js',
  () => ({
    batchUpdateCoverEffects: jest.fn(),
    reconcileCoverEffectsForTarget: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '../../scripts/services/visual-effects.js',
  () => ({
    updateWallVisuals: jest.fn(),
  }),
  { virtual: true },
);

// ✅ REMOVED DANGEROUS UTILS.JS MOCK
// The previous mock hid real import chain bugs and provided fake behavior.
// Tests should import real modules and only mock external APIs.
//
// If individual tests need to mock specific utils functions, they should:
// 1. Import the real module: const utils = await import('../../scripts/utils.js')
// 2. Mock only what's necessary: utils.showNotification = jest.fn()
// 3. Restore after test: utils.showNotification = originalFunction
//
// This ensures tests catch real import issues and integration bugs.

// Test utilities
global.createMockToken = (data = {}) => {
  // Create a proper flags structure that mimics Foundry VTT
  const flags = data.flags || {};

  return {
    id: data.id || 'mock-token-' + Math.random().toString(36).substr(2, 9),
    document: {
      id: data.id || 'mock-token-' + Math.random().toString(36).substr(2, 9),
      x: data.x || 0,
      y: data.y || 0,
      width: data.width || 1,
      height: data.height || 1,
      elevation: data.elevation || 0,
      rotation: data.rotation || 0,
      hidden: data.hidden || false,
      vision: data.vision || { enabled: true, range: 60, angle: 360 },
      light: data.light || { enabled: false, range: 0, intensity: 0 },
      flags: flags,
      getFlag: jest.fn((moduleId, key) => {
        // Simulate Foundry VTT flag structure - flags.moduleId.key
        if (!flags[moduleId]) return null;
        return flags[moduleId][key] || null;
      }),
      setFlag: jest.fn((moduleId, key, value) => {
        // Simulate Foundry VTT flag structure
        if (!flags[moduleId]) flags[moduleId] = {};
        flags[moduleId][key] = value;
        return Promise.resolve(true);
      }),
      update: jest.fn((updates) => {
        // Simulate Foundry VTT update behavior
        if (updates.flags) {
          // Handle nested flags structure: { flags: { moduleId: { key: value } } }
          Object.keys(updates.flags).forEach((moduleId) => {
            if (!flags[moduleId]) flags[moduleId] = {};
            Object.assign(flags[moduleId], updates.flags[moduleId]);
          });
        }

        // Handle dotted path updates like "flags.module-id.key": value
        Object.keys(updates).forEach((path) => {
          if (path.startsWith('flags.')) {
            const parts = path.split('.');
            if (parts.length === 3) {
              const [, moduleId, key] = parts;
              if (!flags[moduleId]) flags[moduleId] = {};
              flags[moduleId][key] = updates[path];
            }
          }
        });

        return Promise.resolve(true);
      }),
    },
    actor: data.actor || {
      id: data.actorId || 'mock-actor-' + Math.random().toString(36).substr(2, 9),
      type: data.actorType || 'character',
      system: data.actorSystem || {
        traits: { size: { value: 'med' } },
        attributes: { perception: { value: 10 } },
      },
      hasPlayerOwner: data.hasPlayerOwner || false,
      isOwner: data.isOwner || false,
    },
    center: data.center || { x: 25, y: 25 },
    getCenter: jest.fn(() => ({ x: 25, y: 25 })),
    isOwner: data.isOwner || false,
    visible: data.visible !== false,
    inCombat: data.inCombat !== undefined ? data.inCombat : false, // For encounter tests
    ...data,
  };
};

global.createMockActor = (data = {}) => ({
  id: data.id || 'mock-actor-' + Math.random().toString(36).substr(2, 9),
  type: data.type || 'character',
  system: data.system || {
    traits: { size: { value: 'med' } },
    attributes: { perception: { value: 10 } },
  },
  hasPlayerOwner: data.hasPlayerOwner || false,
  isOwner: data.isOwner || false,
  isLinked: data.isLinked !== undefined ? data.isLinked : false, // For linked actor tests
  ...data,
});

global.createMockScene = (data = {}) => ({
  id: data.id || 'mock-scene-' + Math.random().toString(36).substr(2, 9),
  name: data.name || 'Test Scene',
  dimensions: data.dimensions || { width: 1000, height: 1000 },
  grid: data.grid || { size: 50 },
  ...data,
});

global.createMockWall = (data = {}) => ({
  id: data.id || 'mock-wall-' + Math.random().toString(36).substr(2, 9),
  document: {
    id: data.id || 'mock-wall-' + Math.random().toString(36).substr(2, 9),
    c: data.c || [0, 0, 100, 100],
    move: data.move || 0,
    sight: data.sight || 0,
    sound: data.sound || 0,
    light: data.light || 0,
    dir: data.dir || 0,
    door: data.door || 0,
    ds: data.ds || 0,
    flags: data.flags || {},
  },
  ...data,
});

global.createMockLight = (data = {}) => ({
  id: data.id || 'mock-light-' + Math.random().toString(36).substr(2, 9),
  document: {
    id: data.id || 'mock-light-' + Math.random().toString(36).substr(2, 9),
    x: data.x || 0,
    y: data.y || 0,
    rotation: data.rotation || 0,
    config: data.config || {
      dim: 20,
      bright: 10,
      angle: 360,
      color: '#ffffff',
      alpha: 0.5,
      animation: { type: 'none', speed: 1, intensity: 1 },
    },
    flags: data.flags || {},
  },
  ...data,
});

// Mock socket
global.socket = {
  executeAsGM: jest.fn((func) => func()),
  executeAsUser: jest.fn((func) => func()),
  executeForAllGMs: jest.fn((func) => func()),
  executeForOthers: jest.fn((func) => func()),
  executeForUser: jest.fn((func) => func()),
};

// Mock libWrapper
global.libWrapper = {
  register: jest.fn(),
  unregister: jest.fn(),
  ignore: jest.fn(),
};

// Mock socketlib
global.socketlib = {
  registerModule: jest.fn(() => ({
    registerFunction: jest.fn(),
    executeAsGM: jest.fn((func) => func()),
    executeAsUser: jest.fn((func) => func()),
    executeForAllGMs: jest.fn((func) => func()),
    executeForOthers: jest.fn((func) => func()),
    executeForUser: jest.fn((func) => func()),
  })),
};

// Setup before each test
beforeEach(() => {
  // Reset all mocks
  jest.clearAllMocks();

  // Reset global state
  // Note: Temporarily commented out due to mock setup issues
  // global.game.settings.get?.mockClear?.();
  // global.game.settings.set?.mockClear?.();
  // global.game.settings.register?.mockClear?.();

  // Reset canvas state
  global.canvas.tokens.controlled = [];
  global.canvas.tokens.placeables = [];

  // Ensure these properties exist before trying to set them
  if (!global.canvas.walls) {
    global.canvas.walls = { placeables: [], get: jest.fn(), addChild: jest.fn(), removeChild: jest.fn() };
  }
  if (!global.canvas.lighting) {
    global.canvas.lighting = { placeables: [], get: jest.fn(), addChild: jest.fn(), removeChild: jest.fn() };
  }
  if (!global.canvas.terrain) {
    global.canvas.terrain = { placeables: [], get: jest.fn(), addChild: jest.fn(), removeChild: jest.fn() };
  }

  global.canvas.walls.placeables = [];
  global.canvas.lighting.placeables = [];
  global.canvas.terrain.placeables = [];

  // Reset UI state
  global.ui.notifications.info.mockClear();
  global.ui.notifications.warn.mockClear();
  global.ui.notifications.error.mockClear();

  // Reset Hooks
  global.Hooks.on.mockClear();
  global.Hooks.once.mockClear();
  global.Hooks.off.mockClear();
  global.Hooks.call.mockClear();
  global.Hooks.callAll.mockClear();
});

// Cleanup after each test
afterEach(() => {
  // Clean up any global state
  if (global.pf2eVisionerTestState) {
    delete global.pf2eVisionerTestState;
  }
});
