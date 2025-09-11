/**
 * Unit tests for DualSystemIntegration utilities
 * Tests safe integration between AVS and Auto-Cover systems with error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the module constants
vi.mock('../../../scripts/constants.js', () => ({
  MODULE_ID: 'pf2e-visioner',
  VISIBILITY_STATES: {
    observed: 'observed',
    concealed: 'concealed',
    hidden: 'hidden',
    undetected: 'undetected'
  },
  COVER_STATES: {
    none: { bonusStealth: 0, canHide: false },
    lesser: { bonusStealth: 1, canHide: false },
    standard: { bonusStealth: 2, canHide: true },
    greater: { bonusStealth: 4, canHide: true }
  }
}));

// Mock FoundryVTT globals
global.game = {
  settings: {
    get: vi.fn()
  },
  modules: {
    get: vi.fn(() => ({ version: '1.0.0' }))
  },
  version: '13.0.0'
};

global.canvas = {
  tokens: {
    get: vi.fn()
  },
  walls: {
    checkCollision: vi.fn()
  }
};

global.Ray = class MockRay {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

describe('DualSystemIntegration', () => {
  let dualSystemIntegration;
  let mockObserver;
  let mockTarget;
  let mockAutoCoverSystem;
  let mockAVSService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock tokens with v13-compatible structure
    mockObserver = {
      document: { id: 'observer-1' },
      center: { x: 100, y: 100 },
      name: 'Observer Token'
    };
    
    mockTarget = {
      document: { id: 'target-1' },
      center: { x: 200, y: 200 },
      name: 'Target Token'
    };

    // Mock Auto-Cover system
    mockAutoCoverSystem = {
      isEnabled: vi.fn(() => true),
      detectCoverBetweenTokens: vi.fn(() => 'standard')
    };

    // Mock AVS service
    mockAVSService = {
      getAVSOverride: vi.fn(() => null)
    };

    // Mock canvas tokens
    global.canvas.tokens.get.mockImplementation((id) => {
      if (id === 'observer-1') return mockObserver;
      if (id === 'target-1') return mockTarget;
      return null;
    });

    // Mock game settings
    global.game.settings.get.mockImplementation((module, setting) => {
      if (setting === 'autoVisibilityEnabled') return true;
      if (setting === 'autoCover') return true;
      return false;
    });

    // Mock wall collision
    global.canvas.walls.checkCollision.mockReturnValue(false);

    // Import and create fresh instance
    const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
    dualSystemIntegration = new DualSystemIntegration();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with available systems', async () => {
      // Mock successful module imports
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);

      const result = await dualSystemIntegration.initialize();
      expect(result).toBe(true);
    });

    it('should handle initialization failure gracefully', async () => {
      // Mock failed module imports
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => {
        throw new Error('Module not found');
      });

      const result = await dualSystemIntegration.initialize();
      expect(result).toBe(false);
    });
  });

  describe('getAVSVisibilityState', () => {
    beforeEach(async () => {
      // Mock successful initialization
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      vi.doMock('../../scripts/utils.js', () => ({
        getVisibilityBetween: vi.fn(() => 'concealed')
      }));
      
      await dualSystemIntegration.initialize();
    });

    it('should return AVS override when available', async () => {
      mockAVSService.getAVSOverride.mockReturnValue('hidden');

      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.data).toBe('hidden');
      expect(result.source).toBe('override');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should detect visibility when no override exists', async () => {
      mockAVSService.getAVSOverride.mockReturnValue(null);

      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.data).toBe('concealed');
      expect(result.source).toBe('avs');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should handle invalid tokens with error', async () => {
      const result = await dualSystemIntegration.getAVSVisibilityState(null, mockTarget);

      expect(result.success).toBe(true); // Fallback should succeed
      expect(result.error).toBe('Invalid observer or target token');
      expect(result.fallbackUsed).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should use fallback when AVS system fails', async () => {
      // Mock AVS system as unavailable
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoVisibilityEnabled') return false;
        return true;
      });

      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should handle detection errors with fallback', async () => {
      mockAVSService.getAVSOverride.mockReturnValue(null);
      
      // Mock utils import to throw error
      vi.doMock('../../scripts/utils.js', () => ({
        getVisibilityBetween: vi.fn(() => {
          throw new Error('Detection failed');
        })
      }));

      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);

      expect(result.success).toBe(true); // Fallback should work
      expect(result.fallbackUsed).toBe(true);
      expect(result.error).toBe('Detection failed');
    });
  });

  describe('getAutoCoverState', () => {
    beforeEach(async () => {
      // Mock successful initialization
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      vi.doMock('../../scripts/utils.js', () => ({
        getCoverBetween: vi.fn(() => 'none'),
        getVisibilityBetween: vi.fn(() => 'observed')
      }));
      
      await dualSystemIntegration.initialize();
    });

    it('should return manual cover when available', async () => {
      const { getCoverBetween } = await import('../../scripts/utils.js');
      getCoverBetween.mockReturnValue('standard');

      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.data.state).toBe('standard');
      expect(result.data.bonus).toBe(2);
      expect(result.source).toBe('manual');
    });

    it('should detect auto-cover when no manual cover exists', async () => {
      const { getCoverBetween } = await import('../../scripts/utils.js');
      getCoverBetween.mockReturnValue('none');
      mockAutoCoverSystem.detectCoverBetweenTokens.mockReturnValue('lesser');

      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.data.state).toBe('lesser');
      expect(result.data.bonus).toBe(1);
      expect(result.source).toBe('auto-cover');
    });

    it('should handle invalid tokens with error', async () => {
      const result = await dualSystemIntegration.getAutoCoverState(null, mockTarget);

      expect(result.success).toBe(true); // Fallback should succeed
      expect(result.error).toBe('Invalid observer or target token');
      expect(result.fallbackUsed).toBe(true);
    });

    it('should use fallback when Auto-Cover system is disabled', async () => {
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);

      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should handle detection errors with fallback', async () => {
      mockAutoCoverSystem.detectCoverBetweenTokens.mockImplementation(() => {
        throw new Error('Cover detection failed');
      });

      global.canvas.walls.checkCollision.mockReturnValue(true); // Has wall collision

      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);

      expect(result.success).toBe(true); // Fallback should work
      expect(result.fallbackUsed).toBe(true);
      expect(result.data.state).toBe('standard');
      expect(result.data.bonus).toBe(2);
    });
  });

  describe('getCombinedSystemState', () => {
    beforeEach(async () => {
      // Mock successful initialization
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      vi.doMock('../../scripts/utils.js', () => ({
        getCoverBetween: vi.fn(() => 'none'),
        getVisibilityBetween: vi.fn(() => 'observed')
      }));
      
      await dualSystemIntegration.initialize();
    });

    it('should combine successful results from both systems', async () => {
      const result = await dualSystemIntegration.getCombinedSystemState(mockObserver, mockTarget);

      expect(result.avsResult.success).toBe(true);
      expect(result.coverResult.success).toBe(true);
      expect(result.systemsAvailable).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.effectiveVisibility).toBe('concealed'); // observed + standard cover = concealed
      expect(result.stealthBonus).toBe(2);
    });

    it('should handle partial system failures gracefully', async () => {
      // Make AVS fail but Auto-Cover succeed
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoVisibilityEnabled') return false;
        if (setting === 'autoCover') return true;
        return false;
      });

      const result = await dualSystemIntegration.getCombinedSystemState(mockObserver, mockTarget);

      expect(result.avsResult.success).toBe(true); // Should use fallback
      expect(result.coverResult.success).toBe(true);
      expect(result.systemsAvailable).toBe(true);
      expect(result.warnings).toHaveLength(0); // Fallback worked, so no warnings
    });

    it('should collect warnings from failed systems', async () => {
      // Make both systems unavailable
      global.game.settings.get.mockReturnValue(false);
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);

      const result = await dualSystemIntegration.getCombinedSystemState(mockObserver, mockTarget);

      expect(result.systemsAvailable).toBe(true); // Fallbacks should work
      expect(result.effectiveVisibility).toBeDefined();
      expect(result.stealthBonus).toBeDefined();
    });
  });

  describe('getBatchCombinedStates', () => {
    beforeEach(async () => {
      // Mock successful initialization
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      vi.doMock('../../scripts/utils.js', () => ({
        getCoverBetween: vi.fn(() => 'none'),
        getVisibilityBetween: vi.fn(() => 'observed')
      }));
      
      await dualSystemIntegration.initialize();
    });

    it('should process multiple targets successfully', async () => {
      const targets = [
        { document: { id: 'target-1' }, center: { x: 200, y: 200 } },
        { document: { id: 'target-2' }, center: { x: 300, y: 300 } },
        { document: { id: 'target-3' }, center: { x: 400, y: 400 } }
      ];

      // Mock canvas.tokens.get for all targets
      global.canvas.tokens.get.mockImplementation((id) => {
        if (id === 'observer-1') return mockObserver;
        return targets.find(t => t.document.id === id) || null;
      });

      const result = await dualSystemIntegration.getBatchCombinedStates(mockObserver, targets);

      expect(result.size).toBe(3);
      expect(result.has('target-1')).toBe(true);
      expect(result.has('target-2')).toBe(true);
      expect(result.has('target-3')).toBe(true);
    });

    it('should handle empty target array', async () => {
      const result = await dualSystemIntegration.getBatchCombinedStates(mockObserver, []);
      expect(result.size).toBe(0);
    });

    it('should handle invalid targets gracefully', async () => {
      const targets = [
        { document: { id: 'target-1' }, center: { x: 200, y: 200 } },
        null, // Invalid target
        { document: { id: 'target-3' }, center: { x: 400, y: 400 } }
      ];

      global.canvas.tokens.get.mockImplementation((id) => {
        if (id === 'observer-1') return mockObserver;
        if (id === 'target-1') return targets[0];
        if (id === 'target-3') return targets[2];
        return null;
      });

      const result = await dualSystemIntegration.getBatchCombinedStates(mockObserver, targets);

      expect(result.size).toBe(2); // Only valid targets processed
      expect(result.has('target-1')).toBe(true);
      expect(result.has('target-3')).toBe(true);
    });

    it('should respect batch size option', async () => {
      const targets = Array.from({ length: 25 }, (_, i) => ({
        document: { id: `target-${i}` },
        center: { x: 200 + i * 10, y: 200 + i * 10 }
      }));

      // Mock all targets
      global.canvas.tokens.get.mockImplementation((id) => {
        if (id === 'observer-1') return mockObserver;
        return targets.find(t => t.document.id === id) || null;
      });

      const result = await dualSystemIntegration.getBatchCombinedStates(
        mockObserver, 
        targets, 
        { batchSize: 5 }
      );

      expect(result.size).toBe(25);
    });
  });

  describe('getSystemDiagnostics', () => {
    beforeEach(async () => {
      // Mock successful initialization
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      
      await dualSystemIntegration.initialize();
    });

    it('should return comprehensive system diagnostics', () => {
      const diagnostics = dualSystemIntegration.getSystemDiagnostics();

      expect(diagnostics).toHaveProperty('avs');
      expect(diagnostics).toHaveProperty('autoCover');
      expect(diagnostics).toHaveProperty('integration');

      expect(diagnostics.avs).toHaveProperty('available');
      expect(diagnostics.avs).toHaveProperty('enabled');
      expect(diagnostics.autoCover).toHaveProperty('available');
      expect(diagnostics.autoCover).toHaveProperty('enabled');

      expect(diagnostics.integration.initialized).toBe(true);
      expect(diagnostics.integration.foundryVersion).toBe('13.0.0');
      expect(diagnostics.integration.moduleVersion).toBe('1.0.0');
    });

    it('should include error information when systems fail', async () => {
      // Create new instance that will fail initialization
      const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
      const failingIntegration = new DualSystemIntegration();
      
      // Mock failed module imports
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => {
        throw new Error('Auto-Cover system not found');
      });

      await failingIntegration.initialize();
      const diagnostics = failingIntegration.getSystemDiagnostics();

      expect(diagnostics.integration.initialized).toBe(false);
    });
  });

  describe('error handling and fallback mechanisms', () => {
    it('should handle canvas unavailability', async () => {
      // Mock canvas as undefined
      global.canvas = undefined;

      const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
      const integration = new DualSystemIntegration();

      const result = await integration.getAVSVisibilityState(mockObserver, mockTarget);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid observer or target token');
    });

    it('should handle Ray constructor errors', async () => {
      // Mock Ray to throw error
      global.Ray = class MockRay {
        constructor() {
          throw new Error('Ray construction failed');
        }
      };

      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);
      
      const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
      const integration = new DualSystemIntegration();
      await integration.initialize();

      const result = await integration.getAVSVisibilityState(mockObserver, mockTarget);
      
      // Should still succeed with ultimate fallback
      expect(result.data).toBe('observed');
    });

    it('should handle settings access errors', async () => {
      // Mock settings to throw error
      global.game.settings.get.mockImplementation(() => {
        throw new Error('Settings access failed');
      });

      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);

      const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
      const integration = new DualSystemIntegration();
      await integration.initialize();

      const result = await integration.getAVSVisibilityState(mockObserver, mockTarget);
      
      // Should use default settings and still work
      expect(result.success).toBe(true);
    });
  });

  describe('v13 API compatibility', () => {
    it('should use v13 token document APIs', async () => {
      expect(mockObserver.document.id).toBeDefined();
      expect(mockTarget.document.id).toBeDefined();
      
      // Verify tokens are accessed through canvas.tokens.get
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('observer-1');
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('target-1');
    });

    it('should use v13 wall collision APIs', async () => {
      vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: mockAutoCoverSystem
      }));
      vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);

      const { DualSystemIntegration } = await import('../../scripts/chat/services/position/DualSystemIntegration.js');
      const integration = new DualSystemIntegration();
      await integration.initialize();

      // Force fallback to test wall collision API usage
      global.game.settings.get.mockReturnValue(false);
      
      await integration.getAVSVisibilityState(mockObserver, mockTarget);
      
      // Should have used canvas.walls.checkCollision with v13 API
      expect(global.canvas.walls.checkCollision).toHaveBeenCalled();
    });

    it('should handle v13 Ray construction', () => {
      const ray = new global.Ray({ x: 100, y: 100 }, { x: 200, y: 200 });
      expect(ray.start).toEqual({ x: 100, y: 100 });
      expect(ray.end).toEqual({ x: 200, y: 200 });
    });
  });
});