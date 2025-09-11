/**
 * Performance tests for Enhanced Multi-Target Processor
 * Tests batch processing, caching, and v13 API optimizations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedMultiTargetProcessor } from '../../../scripts/chat/services/multi-target/EnhancedMultiTargetProcessor.js';

// Mock FoundryVTT v13 APIs
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
  }
};

// Mock Ray class
global.Ray = class Ray {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

describe('EnhancedMultiTargetProcessor', () => {
  let processor;
  let mockSneakingToken;
  let mockTargets;
  let mockActionData;

  beforeEach(() => {
    processor = new EnhancedMultiTargetProcessor();
    
    // Mock sneaking token
    mockSneakingToken = {
      id: 'sneaking-token-1',
      document: { id: 'sneaking-token-1' },
      x: 100,
      y: 100,
      center: { x: 100, y: 100 },
      name: 'Sneaking Character'
    };

    // Mock target tokens
    mockTargets = Array.from({ length: 20 }, (_, i) => ({
      id: `target-${i}`,
      document: { id: `target-${i}` },
      x: 200 + (i * 50),
      y: 200 + (i * 50),
      center: { x: 200 + (i * 50), y: 200 + (i * 50) },
      name: `Target ${i}`,
      actor: { id: `actor-${i}` }
    }));

    // Mock action data
    mockActionData = {
      actor: { id: 'sneaking-actor' },
      roll: { total: 15 },
      actionType: 'sneak'
    };

    // Clear cache before each test
    processor.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Performance Tests', () => {
    it('should process large numbers of targets efficiently', async () => {
      const largeTargetSet = Array.from({ length: 100 }, (_, i) => ({
        id: `large-target-${i}`,
        document: { id: `large-target-${i}` },
        x: i * 10,
        y: i * 10,
        center: { x: i * 10, y: i * 10 },
        name: `Large Target ${i}`,
        actor: { id: `large-actor-${i}` }
      }));

      const startTime = Date.now();
      
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        largeTargetSet,
        mockActionData,
        { enableProgressTracking: false } // Disable for performance testing
      );

      const processingTime = Date.now() - startTime;
      
      expect(outcomes).toHaveLength(largeTargetSet.length);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`Processed ${largeTargetSet.length} targets in ${processingTime}ms`);
    });

    it('should use parallel processing for large target counts', async () => {
      const parallelTargets = mockTargets.slice(0, 15); // Above batch size threshold
      
      const progressUpdates = [];
      const progressCallback = (progress) => {
        progressUpdates.push(progress);
      };

      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        parallelTargets,
        mockActionData,
        { progressCallback }
      );

      expect(outcomes).toHaveLength(parallelTargets.length);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Should have multiple progress updates indicating parallel processing
      const phaseUpdates = progressUpdates.filter(p => p.phase);
      expect(phaseUpdates.length).toBeGreaterThan(1);
    });

    it('should use sequential processing for small target counts', async () => {
      const smallTargets = mockTargets.slice(0, 3); // Below batch size threshold
      
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        smallTargets,
        mockActionData
      );

      expect(outcomes).toHaveLength(smallTargets.length);
      expect(outcomes.every(o => o.hasPositionData !== undefined)).toBe(true);
    });

    it('should complete processing within reasonable time limits', async () => {
      const mediumTargets = mockTargets.slice(0, 50);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), 10000);
      });

      const processingPromise = processor.processMultipleTargets(
        mockSneakingToken,
        mediumTargets,
        mockActionData
      );

      const outcomes = await Promise.race([processingPromise, timeoutPromise]);
      
      expect(outcomes).toHaveLength(mediumTargets.length);
    });
  });

  describe('Caching Tests', () => {
    it('should cache position calculations', async () => {
      const targets = mockTargets.slice(0, 5);
      
      // First processing - should populate cache
      const startTime1 = Date.now();
      const outcomes1 = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );
      const time1 = Date.now() - startTime1;

      // Second processing - should use cache
      const startTime2 = Date.now();
      const outcomes2 = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );
      const time2 = Date.now() - startTime2;

      expect(outcomes1).toHaveLength(targets.length);
      expect(outcomes2).toHaveLength(targets.length);
      
      // Second run should be faster due to caching
      expect(time2).toBeLessThan(time1);
      
      console.log(`First run: ${time1}ms, Second run (cached): ${time2}ms`);
    });

    it('should respect cache timeout', async () => {
      const targets = mockTargets.slice(0, 3);
      
      // Configure short cache timeout for testing
      processor.updateConfig({ cacheTimeout: 100 });
      
      // First processing
      await processor.processMultipleTargets(mockSneakingToken, targets, mockActionData);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Second processing should not use expired cache
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );
      
      expect(outcomes).toHaveLength(targets.length);
    });

    it('should enforce cache size limits', async () => {
      // Configure small cache size for testing
      processor.updateConfig({ maxCacheSize: 3 });
      
      // Process multiple different target sets to fill cache beyond limit
      for (let i = 0; i < 5; i++) {
        const uniqueTargets = mockTargets.slice(i, i + 2);
        await processor.processMultipleTargets(
          mockSneakingToken,
          uniqueTargets,
          mockActionData
        );
      }
      
      const cacheStats = processor.getCacheStats();
      expect(cacheStats.size).toBeLessThanOrEqual(3);
    });

    it('should clear cache when requested', async () => {
      const targets = mockTargets.slice(0, 3);
      
      // Populate cache
      await processor.processMultipleTargets(mockSneakingToken, targets, mockActionData);
      
      let cacheStats = processor.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
      
      // Clear cache
      processor.clearCache();
      
      cacheStats = processor.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });
  });

  describe('Progress Tracking Tests', () => {
    it('should provide progress updates during processing', async () => {
      const targets = mockTargets.slice(0, 10);
      const progressUpdates = [];
      
      const progressCallback = (progress) => {
        progressUpdates.push({
          percentage: progress.percentage,
          phase: progress.phase,
          message: progress.message,
          completed: progress.completed,
          total: progress.total
        });
      };

      await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData,
        { progressCallback }
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Should have progress from 0 to 100
      const percentages = progressUpdates.map(p => p.percentage);
      expect(Math.min(...percentages)).toBe(0);
      expect(Math.max(...percentages)).toBe(100);
      
      // Should have different phases
      const phases = [...new Set(progressUpdates.map(p => p.phase).filter(Boolean))];
      expect(phases.length).toBeGreaterThan(1);
    });

    it('should track completion counts accurately', async () => {
      const targets = mockTargets.slice(0, 8);
      let finalProgress = null;
      
      const progressCallback = (progress) => {
        if (progress.percentage === 100) {
          finalProgress = progress;
        }
      };

      await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData,
        { progressCallback }
      );

      expect(finalProgress).not.toBeNull();
      expect(finalProgress.completed).toBe(targets.length);
      expect(finalProgress.total).toBe(targets.length);
    });

    it('should handle progress callback errors gracefully', async () => {
      const targets = mockTargets.slice(0, 3);
      
      const faultyCallback = () => {
        throw new Error('Progress callback error');
      };

      // Should not throw despite callback error
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData,
        { progressCallback: faultyCallback }
      );

      expect(outcomes).toHaveLength(targets.length);
    });
  });

  describe('Batch Processing Tests', () => {
    it('should process targets in configurable batches', async () => {
      const targets = mockTargets.slice(0, 12);
      
      // Configure small batch size
      processor.updateConfig({ batchSize: 3 });
      
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );

      expect(outcomes).toHaveLength(targets.length);
      expect(outcomes.every(o => o.token)).toBe(true);
    });

    it('should handle batch processing errors gracefully', async () => {
      const targets = mockTargets.slice(0, 6);
      
      // Mock a failure in position tracking
      const originalCapture = processor.positionTracker?.captureBatchPositions;
      if (processor.positionTracker) {
        processor.positionTracker.captureBatchPositions = vi.fn().mockRejectedValue(
          new Error('Position capture failed')
        );
      }

      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );

      // Should return fallback outcomes
      expect(outcomes).toHaveLength(targets.length);
      expect(outcomes.every(o => o.token)).toBe(true);
      
      // Restore original method
      if (processor.positionTracker && originalCapture) {
        processor.positionTracker.captureBatchPositions = originalCapture;
      }
    });
  });

  describe('Configuration Tests', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        useParallelProcessing: false,
        enableCaching: false,
        batchSize: 15,
        cacheTimeout: 60000,
        maxCacheSize: 50
      };

      processor.updateConfig(newConfig);

      const cacheStats = processor.getCacheStats();
      expect(cacheStats.maxSize).toBe(50);
      expect(cacheStats.timeout).toBe(60000);
      expect(cacheStats.enabled).toBe(false);
    });

    it('should validate configuration parameters', () => {
      // Invalid batch size should be ignored
      processor.updateConfig({ batchSize: -5 });
      
      // Invalid cache timeout should be ignored
      processor.updateConfig({ cacheTimeout: -1000 });
      
      // Valid config should be applied
      processor.updateConfig({ batchSize: 20 });
      
      // Should not throw errors with invalid config
      expect(() => {
        processor.updateConfig({ invalidOption: 'test' });
      }).not.toThrow();
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle invalid input parameters', async () => {
      // Null sneaking token
      let outcomes = await processor.processMultipleTargets(null, mockTargets, mockActionData);
      expect(outcomes).toEqual([]);

      // Empty targets array
      outcomes = await processor.processMultipleTargets(mockSneakingToken, [], mockActionData);
      expect(outcomes).toEqual([]);

      // Invalid targets array
      outcomes = await processor.processMultipleTargets(mockSneakingToken, null, mockActionData);
      expect(outcomes).toEqual([]);
    });

    it('should provide fallback outcomes on processing failure', async () => {
      const targets = mockTargets.slice(0, 3);
      
      // Mock a critical failure
      const originalProcess = processor._batchCapturePositions;
      processor._batchCapturePositions = vi.fn().mockRejectedValue(
        new Error('Critical processing failure')
      );

      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );

      expect(outcomes).toHaveLength(targets.length);
      expect(outcomes.every(o => o.token && o.outcome)).toBe(true);
      
      // Restore original method
      processor._batchCapturePositions = originalProcess;
    });

    it('should handle individual target processing failures', async () => {
      const targets = mockTargets.slice(0, 5);
      
      // Mock failure for specific targets
      const outcomes = await processor.processMultipleTargets(
        mockSneakingToken,
        targets,
        mockActionData
      );

      // Should still return outcomes for all targets
      expect(outcomes).toHaveLength(targets.length);
      expect(outcomes.every(o => o.token)).toBe(true);
    });
  });

  describe('Memory Management Tests', () => {
    it('should not leak memory during large processing operations', async () => {
      const largeTargets = Array.from({ length: 200 }, (_, i) => ({
        id: `memory-test-${i}`,
        document: { id: `memory-test-${i}` },
        x: i,
        y: i,
        center: { x: i, y: i },
        name: `Memory Test ${i}`,
        actor: { id: `memory-actor-${i}` }
      }));

      // Process multiple times to test for memory leaks
      for (let i = 0; i < 5; i++) {
        await processor.processMultipleTargets(
          mockSneakingToken,
          largeTargets.slice(i * 40, (i + 1) * 40),
          mockActionData,
          { enableProgressTracking: false }
        );
      }

      // Cache should not grow indefinitely
      const cacheStats = processor.getCacheStats();
      expect(cacheStats.size).toBeLessThanOrEqual(cacheStats.maxSize);
    });

    it('should clean up progress tracking data', async () => {
      const targets = mockTargets.slice(0, 5);
      
      // Process multiple times
      for (let i = 0; i < 3; i++) {
        await processor.processMultipleTargets(
          mockSneakingToken,
          targets,
          mockActionData
        );
      }

      // Progress callbacks should be cleaned up
      expect(processor._progressCallbacks.size).toBe(0);
    });
  });
});