/**
 * Integration tests for DualSystemIntegration with SneakPositionTracker
 * Tests the complete integration between AVS, Auto-Cover, and sneak action systems
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
  },
  grid: {
    measureDistances: vi.fn(() => [5])
  },
  lighting: {
    getIllumination: vi.fn(() => 0.5)
  }
};

global.Ray = class MockRay {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

describe('DualSystemIntegration with SneakPositionTracker', () => {
  let sneakPositionTracker;
  let mockSneakingToken;
  let mockObservers;
  let mockAutoCoverSystem;
  let mockAVSService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock tokens with v13-compatible structure
    mockSneakingToken = {
      document: { id: 'sneaking-token' },
      center: { x: 150, y: 150 },
      name: 'Sneaking Character'
    };
    
    mockObservers = [
      {
        document: { id: 'observer-1' },
        center: { x: 100, y: 100 },
        name: 'Observer 1'
      },
      {
        document: { id: 'observer-2' },
        center: { x: 200, y: 200 },
        name: 'Observer 2'
      },
      {
        document: { id: 'observer-3' },
        center: { x: 300, y: 300 },
        name: 'Observer 3'
      }
    ];

    // Mock Auto-Cover system
    mockAutoCoverSystem = {
      isEnabled: vi.fn(() => true),
      detectCoverBetweenTokens: vi.fn((observer, target) => {
        // Return different cover based on observer
        if (observer.document.id === 'observer-1') return 'standard';
        if (observer.document.id === 'observer-2') return 'lesser';
        return 'none';
      })
    };

    // Mock AVS service
    mockAVSService = {
      getAVSOverride: vi.fn((observer, target) => {
        // Return override for observer-3
        if (observer.document.id === 'observer-3') return 'hidden';
        return null;
      })
    };

    // Mock canvas tokens
    global.canvas.tokens.get.mockImplementation((id) => {
      if (id === 'sneaking-token') return mockSneakingToken;
      return mockObservers.find(obs => obs.document.id === id) || null;
    });

    // Mock game settings
    global.game.settings.get.mockImplementation((module, setting) => {
      if (setting === 'autoVisibilityEnabled') return true;
      if (setting === 'autoCover') return true;
      return false;
    });

    // Mock wall collision (no walls blocking)
    global.canvas.walls.checkCollision.mockReturnValue(false);

    // Mock utils
    vi.doMock('../../scripts/utils.js', () => ({
      getVisibilityBetween: vi.fn((observer, target) => {
        // Return different visibility based on observer
        if (observer.document.id === 'observer-1') return 'concealed';
        if (observer.document.id === 'observer-2') return 'observed';
        return 'observed';
      }),
      getCoverBetween: vi.fn(() => 'none') // No manual cover
    }));

    // Mock system modules
    vi.doMock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
      default: mockAutoCoverSystem
    }));
    
    vi.doMock('../../scripts/services/avs-override-service.js', () => mockAVSService);

    // Import and create fresh instance
    const SneakPositionTrackerModule = await import('../../scripts/chat/services/position/SneakPositionTracker.js');
    sneakPositionTracker = SneakPositionTrackerModule.default;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('complete sneak workflow integration', () => {
    it('should capture start positions with combined system data', async () => {
      const startPositions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      expect(startPositions.size).toBe(3);

      // Check observer-1 (concealed visibility + standard cover)
      const obs1State = startPositions.get('observer-1');
      expect(obs1State.avsVisibility).toBe('concealed');
      expect(obs1State.coverState).toBe('standard');
      expect(obs1State.stealthBonus).toBe(2);
      expect(obs1State.effectiveVisibility).toBe('concealed');
      expect(obs1State.avsCalculated).toBe(true);
      expect(obs1State.coverCalculated).toBe(true);

      // Check observer-2 (observed visibility + lesser cover)
      const obs2State = startPositions.get('observer-2');
      expect(obs2State.avsVisibility).toBe('observed');
      expect(obs2State.coverState).toBe('lesser');
      expect(obs2State.stealthBonus).toBe(1);
      expect(obs2State.effectiveVisibility).toBe('observed'); // lesser cover can't hide

      // Check observer-3 (AVS override to hidden)
      const obs3State = startPositions.get('observer-3');
      expect(obs3State.avsVisibility).toBe('hidden');
      expect(obs3State.avsOverride).toBe('hidden');
      expect(obs3State.effectiveVisibility).toBe('hidden');
    });

    it('should calculate end positions after movement', async () => {
      // Simulate movement by changing token position
      mockSneakingToken.center = { x: 250, y: 250 };

      // Mock different visibility after movement
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockImplementation((observer, target) => {
        if (observer.document.id === 'observer-1') return 'observed'; // Worse
        if (observer.document.id === 'observer-2') return 'concealed'; // Better
        return 'observed';
      });

      // Mock different cover after movement
      mockAutoCoverSystem.detectCoverBetweenTokens.mockImplementation((observer, target) => {
        if (observer.document.id === 'observer-1') return 'greater'; // Better cover
        if (observer.document.id === 'observer-2') return 'none'; // Worse cover
        return 'none';
      });

      const endPositions = await sneakPositionTracker.calculateEndPositions(
        mockSneakingToken, 
        mockObservers
      );

      expect(endPositions.size).toBe(3);

      // Check observer-1 (visibility worsened but cover improved)
      const obs1State = endPositions.get('observer-1');
      expect(obs1State.avsVisibility).toBe('observed');
      expect(obs1State.coverState).toBe('greater');
      expect(obs1State.stealthBonus).toBe(4);
      expect(obs1State.effectiveVisibility).toBe('concealed'); // greater cover allows hiding

      // Check observer-2 (visibility improved but cover worsened)
      const obs2State = endPositions.get('observer-2');
      expect(obs2State.avsVisibility).toBe('concealed');
      expect(obs2State.coverState).toBe('none');
      expect(obs2State.stealthBonus).toBe(0);
      expect(obs2State.effectiveVisibility).toBe('concealed');
    });

    it('should analyze position transitions correctly', async () => {
      // Capture start positions
      const startPositions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      // Simulate movement and changed conditions
      mockSneakingToken.center = { x: 250, y: 250 };
      
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockImplementation((observer, target) => {
        if (observer.document.id === 'observer-1') return 'observed';
        if (observer.document.id === 'observer-2') return 'concealed';
        return 'observed';
      });

      mockAutoCoverSystem.detectCoverBetweenTokens.mockImplementation((observer, target) => {
        if (observer.document.id === 'observer-1') return 'greater';
        if (observer.document.id === 'observer-2') return 'none';
        return 'none';
      });

      // Capture end positions
      const endPositions = await sneakPositionTracker.calculateEndPositions(
        mockSneakingToken, 
        mockObservers
      );

      // Analyze transitions
      const transitions = sneakPositionTracker.analyzePositionTransitions(
        startPositions, 
        endPositions
      );

      expect(transitions.size).toBe(3);

      // Check observer-1 transition (mixed changes)
      const obs1Transition = transitions.get('observer-1');
      expect(obs1Transition.hasChanged).toBe(true);
      expect(obs1Transition.avsVisibilityChanged).toBe(true);
      expect(obs1Transition.coverStateChanged).toBe(true);
      expect(obs1Transition.stealthBonusChange).toBe(2); // 4 - 2 = 2
      expect(obs1Transition.transitionType).toBe('improved'); // Cover improvement outweighs visibility loss

      // Check observer-2 transition
      const obs2Transition = transitions.get('observer-2');
      expect(obs2Transition.hasChanged).toBe(true);
      expect(obs2Transition.avsVisibilityChanged).toBe(true);
      expect(obs2Transition.coverStateChanged).toBe(true);
      expect(obs2Transition.stealthBonusChange).toBe(-1); // 0 - 1 = -1
      expect(obs2Transition.transitionType).toBe('improved'); // Visibility improvement outweighs cover loss

      // Check observer-3 transition (override should remain)
      const obs3Transition = transitions.get('observer-3');
      expect(obs3Transition.hasChanged).toBe(false); // Override keeps it hidden
      expect(obs3Transition.transitionType).toBe('unchanged');
    });

    it('should handle batch processing efficiently', async () => {
      const batchPositions = await sneakPositionTracker.captureBatchPositions(
        mockSneakingToken, 
        mockObservers
      );

      expect(batchPositions.size).toBe(3);

      // Verify all observers were processed
      expect(batchPositions.has('observer-1')).toBe(true);
      expect(batchPositions.has('observer-2')).toBe(true);
      expect(batchPositions.has('observer-3')).toBe(true);

      // Verify data consistency with individual processing
      const individualPositions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      for (const [observerId, batchState] of batchPositions) {
        const individualState = individualPositions.get(observerId);
        expect(batchState.avsVisibility).toBe(individualState.avsVisibility);
        expect(batchState.coverState).toBe(individualState.coverState);
        expect(batchState.stealthBonus).toBe(individualState.stealthBonus);
        expect(batchState.effectiveVisibility).toBe(individualState.effectiveVisibility);
      }
    });
  });

  describe('error handling and fallback scenarios', () => {
    it('should handle AVS system failure gracefully', async () => {
      // Disable AVS system
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoVisibilityEnabled') return false;
        if (setting === 'autoCover') return true;
        return false;
      });

      const positions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      expect(positions.size).toBe(3);

      // Should still work with fallback visibility detection
      for (const [, state] of positions) {
        expect(state.avsVisibility).toBeDefined();
        expect(state.coverState).toBeDefined();
        expect(state.systemErrors).toBeDefined();
      }
    });

    it('should handle Auto-Cover system failure gracefully', async () => {
      // Disable Auto-Cover system
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);

      const positions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      expect(positions.size).toBe(3);

      // Should still work with fallback cover detection
      for (const [, state] of positions) {
        expect(state.avsVisibility).toBeDefined();
        expect(state.coverState).toBeDefined();
        expect(state.stealthBonus).toBeDefined();
      }
    });

    it('should handle both systems failing with ultimate fallbacks', async () => {
      // Disable both systems
      global.game.settings.get.mockReturnValue(false);
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);

      // Mock canvas to be unavailable
      const originalCanvas = global.canvas;
      global.canvas = undefined;

      try {
        const positions = await sneakPositionTracker.captureStartPositions(
          mockSneakingToken, 
          mockObservers
        );

        // Should return empty map or error states
        expect(positions.size).toBeLessThanOrEqual(3);
      } finally {
        global.canvas = originalCanvas;
      }
    });

    it('should handle invalid token inputs', async () => {
      const positions = await sneakPositionTracker.captureStartPositions(
        null, // Invalid sneaking token
        mockObservers
      );

      expect(positions.size).toBe(0);
    });

    it('should handle mixed valid and invalid observers', async () => {
      const mixedObservers = [
        mockObservers[0], // Valid
        null, // Invalid
        mockObservers[1], // Valid
        { document: null }, // Invalid
        mockObservers[2] // Valid
      ];

      const positions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mixedObservers
      );

      // Should only process valid observers
      expect(positions.size).toBe(3);
      expect(positions.has('observer-1')).toBe(true);
      expect(positions.has('observer-2')).toBe(true);
      expect(positions.has('observer-3')).toBe(true);
    });
  });

  describe('system diagnostics integration', () => {
    it('should provide comprehensive system diagnostics', () => {
      const diagnostics = sneakPositionTracker.getSystemDiagnostics();

      expect(diagnostics).toHaveProperty('avs');
      expect(diagnostics).toHaveProperty('autoCover');
      expect(diagnostics).toHaveProperty('integration');

      expect(diagnostics.avs.available).toBeDefined();
      expect(diagnostics.avs.enabled).toBeDefined();
      expect(diagnostics.autoCover.available).toBeDefined();
      expect(diagnostics.autoCover.enabled).toBeDefined();
      expect(diagnostics.integration.initialized).toBeDefined();
    });

    it('should reflect system status changes in diagnostics', async () => {
      // Initially both systems should be available
      let diagnostics = sneakPositionTracker.getSystemDiagnostics();
      expect(diagnostics.avs.enabled).toBe(true);
      expect(diagnostics.autoCover.enabled).toBe(true);

      // Disable AVS
      global.game.settings.get.mockImplementation((module, setting) => {
        if (setting === 'autoVisibilityEnabled') return false;
        if (setting === 'autoCover') return true;
        return false;
      });

      // Disable Auto-Cover
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);

      // Diagnostics should reflect the changes
      diagnostics = sneakPositionTracker.getSystemDiagnostics();
      expect(diagnostics.avs.enabled).toBe(false);
      expect(diagnostics.autoCover.enabled).toBe(false);
    });
  });

  describe('v13 API compatibility verification', () => {
    it('should use v13 token document APIs correctly', async () => {
      await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      // Verify token access through document.id
      expect(mockSneakingToken.document.id).toBe('sneaking-token');
      expect(mockObservers[0].document.id).toBe('observer-1');

      // Verify canvas.tokens.get usage
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('sneaking-token');
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('observer-1');
    });

    it('should use v13 canvas APIs for distance and collision', async () => {
      await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      // Verify grid.measureDistances usage
      expect(global.canvas.grid.measureDistances).toHaveBeenCalled();

      // Verify walls.checkCollision usage
      expect(global.canvas.walls.checkCollision).toHaveBeenCalled();

      // Verify lighting.getIllumination usage
      expect(global.canvas.lighting.getIllumination).toHaveBeenCalled();
    });

    it('should handle v13 Ray construction correctly', async () => {
      const positions = await sneakPositionTracker.captureStartPositions(
        mockSneakingToken, 
        mockObservers
      );

      // Verify position data includes calculated values
      for (const [, state] of positions) {
        expect(state.distance).toBeDefined();
        expect(state.hasLineOfSight).toBeDefined();
        expect(state.lightingConditions).toBeDefined();
      }
    });
  });
});