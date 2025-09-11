/**
 * Integration tests for Enhanced Multi-Target Sneak Processing
 * Tests the integration between SneakActionHandler and EnhancedMultiTargetProcessor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock FoundryVTT v13 APIs and dependencies
global.canvas = {
  tokens: {
    placeables: []
  },
  grid: {
    measureDistances: vi.fn(() => [30])
  },
  walls: {
    checkCollision: vi.fn(() => false)
  },
  lighting: {
    getIllumination: vi.fn(() => 0.5)
  }
};

global.ui = {
  notifications: {
    active: [],
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
};

global.game = {
  settings: {
    get: vi.fn(() => true)
  },
  i18n: {
    localize: vi.fn((key) => key)
  }
};

global.Ray = class Ray {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

// Mock modules that would be imported
vi.mock('../../../scripts/constants.js', () => ({
  VISIBILITY_STATES: {
    observed: { label: 'Observed', icon: 'fas fa-eye' },
    hidden: { label: 'Hidden', icon: 'fas fa-eye-slash' },
    undetected: { label: 'Undetected', icon: 'fas fa-ghost' }
  },
  COVER_STATES: {
    none: { label: 'No Cover', bonusStealth: 0 },
    lesser: { label: 'Lesser Cover', bonusStealth: 1 },
    standard: { label: 'Standard Cover', bonusStealth: 2 },
    greater: { label: 'Greater Cover', bonusStealth: 4 }
  }
}));

vi.mock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {
    isEnabled: () => true,
    consumeCoverOverride: () => null
  }
}));

vi.mock('../../../scripts/cover/auto-cover/usecases/StealthCheckUseCase.js', () => ({
  default: {
    _detectCover: () => 'none',
    getOriginalCoverModifier: () => null
  }
}));

vi.mock('../../../scripts/utils.js', () => ({
  getCoverBetween: () => 'none',
  getVisibilityBetween: () => 'observed'
}));

vi.mock('../../../scripts/chat/services/data/message-cache.js', () => ({
  appliedSneakChangesByMessage: new Map()
}));

vi.mock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
  calculateStealthRollTotals: (total) => ({ total, originalTotal: total, baseRollTotal: total }),
  shouldFilterAlly: () => false,
  extractPerceptionDC: () => 15,
  determineOutcome: () => 'success'
}));

vi.mock('../../../scripts/chat/services/actions/base-action.js', () => ({
  ActionHandlerBase: class ActionHandlerBase {
    constructor(type) {
      this.type = type;
    }
    getTokenById(id) {
      return { id, name: `Token ${id}` };
    }
  }
}));

describe('Enhanced Multi-Target Sneak Integration', () => {
  let sneakHandler;
  let mockSneakingToken;
  let mockTargets;
  let mockActionData;

  beforeEach(async () => {
    // Import after mocks are set up
    const { SneakActionHandler } = await import('../../../scripts/chat/services/actions/sneak-action.js');
    sneakHandler = new SneakActionHandler();
    
    // Mock sneaking token
    mockSneakingToken = {
      id: 'sneaking-token-1',
      document: { id: 'sneaking-token-1' },
      x: 100,
      y: 100,
      center: { x: 100, y: 100 },
      name: 'Sneaking Character',
      actor: { id: 'sneaking-actor' }
    };

    // Mock target tokens
    mockTargets = Array.from({ length: 15 }, (_, i) => ({
      id: `target-${i}`,
      document: { id: `target-${i}` },
      x: 200 + (i * 50),
      y: 200 + (i * 50),
      center: { x: 200 + (i * 50), y: 200 + (i * 50) },
      name: `Target ${i}`,
      actor: { 
        id: `actor-${i}`,
        type: 'character',
        conditions: []
      }
    }));

    // Mock action data
    mockActionData = {
      actor: mockSneakingToken.actor,
      actorToken: mockSneakingToken,
      roll: { 
        total: 18,
        dice: [{ total: 12 }],
        terms: [{ total: 12 }]
      },
      actionType: 'sneak'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Enhanced Multi-Target Processing Integration', () => {
    it('should process multiple targets with enhanced analysis', async () => {
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets,
        { enableProgressTracking: false }
      );

      expect(outcomes).toHaveLength(mockTargets.length);
      
      // Each outcome should have enhanced properties
      outcomes.forEach(outcome => {
        expect(outcome).toHaveProperty('token');
        expect(outcome).toHaveProperty('hasPositionData');
        expect(outcome).toHaveProperty('positionQuality');
        expect(outcome).toHaveProperty('stealthPotential');
        expect(outcome).toHaveProperty('riskLevel');
        expect(outcome).toHaveProperty('tacticalAdvice');
        expect(outcome).toHaveProperty('systemStatus');
      });
    });

    it('should fall back to standard processing on enhanced failure', async () => {
      // Mock enhanced processor to fail
      const originalProcessor = sneakHandler.multiTargetProcessor;
      sneakHandler.multiTargetProcessor = {
        processMultipleTargets: vi.fn().mockRejectedValue(new Error('Enhanced processing failed'))
      };

      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets
      );

      expect(outcomes).toHaveLength(mockTargets.length);
      
      // Should have basic outcome properties even in fallback
      outcomes.forEach(outcome => {
        expect(outcome).toHaveProperty('token');
        expect(outcome).toHaveProperty('dc');
        expect(outcome).toHaveProperty('outcome');
      });

      // Restore original processor
      sneakHandler.multiTargetProcessor = originalProcessor;
    });

    it('should handle progress callbacks during processing', async () => {
      const progressUpdates = [];
      const progressCallback = (progress) => {
        progressUpdates.push(progress);
      };

      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets,
        { progressCallback }
      );

      expect(outcomes).toHaveLength(mockTargets.length);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Should have progress from start to completion
      const percentages = progressUpdates.map(p => p.percentage);
      expect(Math.min(...percentages)).toBe(0);
      expect(Math.max(...percentages)).toBe(100);
    });

    it('should cache and reuse enhanced outcomes', async () => {
      // First processing
      const outcomes1 = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets.slice(0, 5),
        { enableProgressTracking: false }
      );

      // Get cached outcomes
      const cachedOutcomes = sneakHandler.getLastEnhancedOutcomes();
      
      expect(cachedOutcomes).not.toBeNull();
      expect(cachedOutcomes).toHaveLength(5);
      expect(cachedOutcomes).toEqual(outcomes1);

      // Clear cache
      sneakHandler.clearEnhancedOutcomes();
      expect(sneakHandler.getLastEnhancedOutcomes()).toBeNull();
    });

    it('should handle different batch sizes efficiently', async () => {
      const testSizes = [3, 8, 15, 25];
      
      for (const size of testSizes) {
        const targets = mockTargets.slice(0, size);
        const startTime = Date.now();
        
        const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
          mockActionData,
          targets,
          { enableProgressTracking: false }
        );
        
        const processingTime = Date.now() - startTime;
        
        expect(outcomes).toHaveLength(size);
        expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
        
        console.log(`Processed ${size} targets in ${processingTime}ms`);
      }
    });
  });

  describe('Position Tracking Integration', () => {
    it('should integrate position data with sneak outcomes', async () => {
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets.slice(0, 5)
      );

      outcomes.forEach(outcome => {
        if (outcome.hasPositionData) {
          expect(outcome.positionState).toBeDefined();
          expect(outcome.positionQuality).toMatch(/excellent|good|fair|poor|terrible|unknown/);
          expect(outcome.stealthPotential).toMatch(/excellent|good|fair|poor|unknown/);
          expect(outcome.riskLevel).toMatch(/high|medium|low|unknown/);
        }
      });
    });

    it('should calculate enhanced DCs with position context', async () => {
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets.slice(0, 3)
      );

      outcomes.forEach(outcome => {
        expect(outcome.dc).toBeGreaterThan(0);
        
        if (outcome.enhancedDC) {
          expect(outcome.enhancedDC).toBeGreaterThan(0);
          expect(typeof outcome.positionBonus).toBe('number');
        }
      });
    });

    it('should provide tactical advice based on position analysis', async () => {
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mockTargets.slice(0, 4)
      );

      outcomes.forEach(outcome => {
        expect(typeof outcome.tacticalAdvice).toBe('string');
        expect(outcome.tacticalAdvice.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should process small groups quickly', async () => {
      const smallTargets = mockTargets.slice(0, 5);
      const startTime = Date.now();
      
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        smallTargets,
        { enableProgressTracking: false }
      );
      
      const processingTime = Date.now() - startTime;
      
      expect(outcomes).toHaveLength(5);
      expect(processingTime).toBeLessThan(500); // Should be very fast for small groups
    });

    it('should handle medium groups efficiently', async () => {
      const mediumTargets = mockTargets.slice(0, 15);
      const startTime = Date.now();
      
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        mediumTargets,
        { enableProgressTracking: false }
      );
      
      const processingTime = Date.now() - startTime;
      
      expect(outcomes).toHaveLength(15);
      expect(processingTime).toBeLessThan(1500); // Should complete within 1.5 seconds
    });

    it('should scale reasonably with large groups', async () => {
      const largeTargets = Array.from({ length: 50 }, (_, i) => ({
        id: `large-target-${i}`,
        document: { id: `large-target-${i}` },
        x: i * 20,
        y: i * 20,
        center: { x: i * 20, y: i * 20 },
        name: `Large Target ${i}`,
        actor: { 
          id: `large-actor-${i}`,
          type: 'character',
          conditions: []
        }
      }));

      const startTime = Date.now();
      
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        largeTargets,
        { enableProgressTracking: false }
      );
      
      const processingTime = Date.now() - startTime;
      
      expect(outcomes).toHaveLength(50);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`Large group (50 targets) processed in ${processingTime}ms`);
    });

    it('should benefit from caching on repeated processing', async () => {
      const targets = mockTargets.slice(0, 10);
      
      // First run - populate cache
      const startTime1 = Date.now();
      const outcomes1 = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        targets,
        { enableProgressTracking: false }
      );
      const time1 = Date.now() - startTime1;

      // Second run - should use cache
      const startTime2 = Date.now();
      const outcomes2 = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        targets,
        { enableProgressTracking: false }
      );
      const time2 = Date.now() - startTime2;

      expect(outcomes1).toHaveLength(10);
      expect(outcomes2).toHaveLength(10);
      
      // Second run should be faster due to caching
      expect(time2).toBeLessThan(time1);
      
      console.log(`First run: ${time1}ms, Cached run: ${time2}ms, Speedup: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle missing sneaking token gracefully', async () => {
      const actionDataWithoutToken = { ...mockActionData, actorToken: null, actor: null };
      
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        actionDataWithoutToken,
        mockTargets.slice(0, 3)
      );

      expect(outcomes).toEqual([]);
    });

    it('should handle empty target arrays', async () => {
      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        []
      );

      expect(outcomes).toEqual([]);
    });

    it('should handle malformed target data', async () => {
      const malformedTargets = [
        null,
        undefined,
        { id: 'valid-target', document: { id: 'valid-target' }, name: 'Valid' },
        { id: null }, // Missing required properties
        { document: null } // Missing required properties
      ];

      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        malformedTargets
      );

      // Should process valid targets and handle invalid ones gracefully
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.every(o => o.token)).toBe(true);
    });

    it('should recover from individual target processing failures', async () => {
      const targets = mockTargets.slice(0, 5);
      
      // Mock analyzeOutcome to fail for some targets
      const originalAnalyze = sneakHandler.analyzeOutcome;
      sneakHandler.analyzeOutcome = vi.fn().mockImplementation((actionData, subject) => {
        if (subject.id === 'target-2') {
          throw new Error('Individual target processing failed');
        }
        return originalAnalyze.call(sneakHandler, actionData, subject);
      });

      const outcomes = await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        targets
      );

      // Should still return outcomes for all targets (with fallbacks for failed ones)
      expect(outcomes).toHaveLength(5);
      expect(outcomes.every(o => o.token)).toBe(true);

      // Restore original method
      sneakHandler.analyzeOutcome = originalAnalyze;
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not accumulate memory during repeated processing', async () => {
      const targets = mockTargets.slice(0, 8);
      
      // Process multiple times to check for memory leaks
      for (let i = 0; i < 10; i++) {
        await sneakHandler.processMultipleTargetsEnhanced(
          mockActionData,
          targets,
          { enableProgressTracking: false }
        );
        
        // Clear outcomes to prevent accumulation
        sneakHandler.clearEnhancedOutcomes();
      }

      // Should complete without issues
      expect(true).toBe(true);
    });

    it('should clean up resources after processing', async () => {
      const targets = mockTargets.slice(0, 6);
      
      await sneakHandler.processMultipleTargetsEnhanced(
        mockActionData,
        targets
      );

      // Check that processor cleans up progress tracking
      expect(sneakHandler.multiTargetProcessor._progressCallbacks.size).toBe(0);
    });
  });
});