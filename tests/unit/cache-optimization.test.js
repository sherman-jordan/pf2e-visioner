/**
 * Cache Optimization Tests for Enhanced Sneak AVS Integration
 * Tests intelligent caching strategies and optimization mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import positionCacheManager from '../../scripts/chat/services/position/PositionCacheManager.js';
import sneakPositionTracker from '../../scripts/chat/services/position/SneakPositionTracker.js';

// Mock FoundryVTT globals
global.canvas = {
  grid: { measureDistances: vi.fn(() => [100]) },
  walls: { checkCollision: vi.fn(() => false) },
  lighting: { getIllumination: vi.fn(() => 0.5) }
};

global.Ray = class {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

describe('Cache Optimization', () => {
  let mockObserver;
  let mockTargets;

  beforeEach(() => {
    positionCacheManager.clear();

    mockObserver = {
      x: 500,
      y: 500,
      center: { x: 500, y: 500 },
      document: { id: 'cache-observer' }
    };

    mockTargets = Array.from({ length: 25 }, (_, i) => ({
      x: 100 + (i % 5) * 100,
      y: 100 + Math.floor(i / 5) * 100,
      center: { x: 100 + (i % 5) * 100, y: 100 + Math.floor(i / 5) * 100 },
      document: { id: `cache-target-${i}` }
    }));

    // Mock dual system integration
    vi.doMock('../../scripts/chat/services/position/DualSystemIntegration.js', () => ({
      default: {
        initialize: vi.fn().mockResolvedValue(true),
        getCombinedSystemState: vi.fn().mockResolvedValue({
          avsResult: { data: 'concealed', success: true, source: 'calculated' },
          coverResult: { data: { state: 'standard' }, success: true, source: 'calculated' },
          stealthBonus: 2,
          effectiveVisibility: 'concealed',
          warnings: []
        })
      }
    }));
  });

  afterEach(() => {
    positionCacheManager.destroy();
  });

  describe('Intelligent Cache Warming', () => {
    it('should warm cache efficiently for token pairs', async () => {
      const tokenPairs = mockTargets.slice(0, 10).map(target => ({
        observer: mockObserver,
        target
      }));

      const mockCalculator = vi.fn().mockImplementation(async (observer, target) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate calculation
        return {
          calculated: true,
          observerId: observer.document.id,
          targetId: target.document.id,
          timestamp: Date.now()
        };
      });

      const startTime = performance.now();
      
      const warmedCount = await positionCacheManager.warmCache(
        tokenPairs,
        mockCalculator,
        { batchSize: 5, ttl: 60000 }
      );

      const duration = performance.now() - startTime;

      expect(warmedCount).toBe(10);
      expect(duration).toBeLessThan(500); // Should be efficient
      expect(mockCalculator).toHaveBeenCalledTimes(10);

      // Verify cache entries exist
      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBe(10);
      expect(cacheStats.hitRate).toBe(0); // No hits yet, only warming

      // Test that subsequent calls use cache
      const cachedResult = positionCacheManager.getCachedPositionState(
        mockObserver,
        mockTargets[0]
      );
      expect(cachedResult).not.toBeNull();
      expect(cachedResult.calculated).toBe(true);
    });

    it('should skip already cached entries during warming', async () => {
      // Pre-cache some entries
      const preCachedTargets = mockTargets.slice(0, 3);
      preCachedTargets.forEach((target, i) => {
        positionCacheManager.cachePositionState(
          mockObserver,
          target,
          { preCached: true, index: i }
        );
      });

      const allTokenPairs = mockTargets.slice(0, 8).map(target => ({
        observer: mockObserver,
        target
      }));

      const mockCalculator = vi.fn().mockResolvedValue({ warmed: true });

      const warmedCount = await positionCacheManager.warmCache(
        allTokenPairs,
        mockCalculator
      );

      // Should only calculate for non-cached entries
      expect(warmedCount).toBe(5); // 8 total - 3 pre-cached = 5
      expect(mockCalculator).toHaveBeenCalledTimes(5);

      const finalStats = positionCacheManager.getStats();
      expect(finalStats.totalEntries).toBe(8); // 3 pre-cached + 5 warmed
    });
  });

  describe('Predictive Caching', () => {
    it('should generate reasonable movement predictions', async () => {
      const mockCalculator = vi.fn().mockImplementation(async (observer, target) => {
        return {
          predicted: true,
          observerPos: `${observer.x},${observer.y}`,
          targetId: target.document.id
        };
      });

      const nearbyTargets = mockTargets.slice(0, 5);

      await positionCacheManager.predictiveCache(
        mockObserver,
        nearbyTargets,
        mockCalculator,
        {
          predictionRadius: 150,
          maxPredictions: 10
        }
      );

      // Should have cached predictions for multiple positions
      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBeGreaterThan(5); // More than just current positions

      // Verify predictions were made
      expect(mockCalculator).toHaveBeenCalled();
      const callCount = mockCalculator.mock.calls.length;
      expect(callCount).toBeGreaterThan(nearbyTargets.length); // More calls than targets due to predictions
    });

    it('should prioritize closer predictions', async () => {
      const predictions = positionCacheManager._generateMovementPredictions(
        mockObserver,
        200, // radius
        15   // max predictions
      );

      expect(predictions).toHaveLength(15);
      
      // Verify predictions are sorted by probability (closer = higher probability)
      for (let i = 1; i < predictions.length; i++) {
        expect(predictions[i].probability).toBeLessThanOrEqual(predictions[i - 1].probability);
      }

      // Verify all predictions are within radius
      predictions.forEach(prediction => {
        const distance = Math.sqrt(
          (prediction.x - mockObserver.x) ** 2 + 
          (prediction.y - mockObserver.y) ** 2
        );
        expect(distance).toBeLessThanOrEqual(200);
      });
    });

    it('should use shorter TTL for predicted entries', async () => {
      const mockCalculator = vi.fn().mockResolvedValue({ predicted: true });

      await positionCacheManager.predictiveCache(
        mockObserver,
        [mockTargets[0]],
        mockCalculator,
        { ttl: 30000 } // 30 second base TTL
      );

      // Check that predicted entries have shorter TTL
      const cacheEntries = Array.from(positionCacheManager._cache.values());
      const predictedEntries = cacheEntries.filter(entry => 
        entry.data && entry.data.predicted
      );

      expect(predictedEntries.length).toBeGreaterThan(0);
      predictedEntries.forEach(entry => {
        expect(entry.ttl).toBeLessThan(30000); // Should be reduced by probability
      });
    });
  });

  describe('Hierarchical Caching with Importance', () => {
    it('should cache entries with appropriate importance levels', () => {
      const testData = [
        { importance: 'critical', data: { visibility: 'hidden' } },
        { importance: 'high', data: { visibility: 'concealed' } },
        { importance: 'normal', data: { visibility: 'observed' } },
        { importance: 'low', data: { visibility: 'observed', cover: 'none' } }
      ];

      testData.forEach((test, i) => {
        positionCacheManager.cacheWithImportance(
          `importance-${i}`,
          test.data,
          test.importance
        );
      });

      // Verify entries are cached with correct importance
      const criticalEntry = positionCacheManager._cache.get('importance-0');
      const lowEntry = positionCacheManager._cache.get('importance-3');

      expect(criticalEntry.importance).toBe('critical');
      expect(lowEntry.importance).toBe('low');

      // Critical entries should have longer TTL
      expect(criticalEntry.ttl).toBeGreaterThan(lowEntry.ttl);
    });

    it('should evict low importance entries first', () => {
      // Fill cache with mixed importance entries
      for (let i = 0; i < 20; i++) {
        const importance = ['critical', 'high', 'normal', 'low'][i % 4];
        positionCacheManager.cacheWithImportance(
          `mixed-${i}`,
          { data: `test-${i}`, importance },
          importance
        );
      }

      const beforeStats = positionCacheManager.getStats();
      expect(beforeStats.totalEntries).toBe(20);

      // Force optimization to keep only 10 entries
      positionCacheManager.optimize(10);

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.totalEntries).toBe(10);

      // Check which entries remain
      const remainingEntries = [];
      for (let i = 0; i < 20; i++) {
        const entry = positionCacheManager._get(`mixed-${i}`);
        if (entry) {
          remainingEntries.push({ index: i, importance: entry.importance });
        }
      }

      // Count remaining entries by importance
      const importanceCounts = remainingEntries.reduce((acc, entry) => {
        acc[entry.importance] = (acc[entry.importance] || 0) + 1;
        return acc;
      }, {});

      // Critical and high importance should be more likely to remain
      expect(importanceCounts.critical || 0).toBeGreaterThanOrEqual(importanceCounts.low || 0);
    });
  });

  describe('Position-Aware Caching', () => {
    it('should generate position-sensitive cache keys', () => {
      const token1 = { document: { id: 'test1' }, x: 100, y: 200 };
      const token2 = { document: { id: 'test2' }, x: 300, y: 400 };

      const key1 = positionCacheManager._generatePositionKey(mockObserver, token1);
      const key2 = positionCacheManager._generatePositionKey(mockObserver, token2);

      expect(key1).not.toBe(key2);
      expect(key1).toContain('test1');
      expect(key1).toContain('100,200');
      expect(key2).toContain('test2');
      expect(key2).toContain('300,400');
    });

    it('should invalidate cache when tokens move', () => {
      const movingToken = { 
        document: { id: 'moving' }, 
        x: 100, 
        y: 100 
      };

      // Cache initial position
      positionCacheManager.cachePositionState(
        mockObserver,
        movingToken,
        { position: 'initial' }
      );

      const initialStats = positionCacheManager.getStats();
      expect(initialStats.totalEntries).toBe(1);

      // Invalidate cache for moved token
      positionCacheManager.invalidateTokenCache(movingToken);

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.totalEntries).toBe(0);
    });

    it('should handle batch token invalidation efficiently', () => {
      // Cache entries for multiple tokens
      const testTokens = mockTargets.slice(0, 10);
      testTokens.forEach(token => {
        positionCacheManager.cachePositionState(mockObserver, token, { cached: true });
      });

      const beforeStats = positionCacheManager.getStats();
      expect(beforeStats.totalEntries).toBe(10);

      // Batch invalidate subset of tokens
      const tokensToInvalidate = testTokens.slice(0, 4);
      positionCacheManager.batchInvalidateTokenCache(tokensToInvalidate);

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.totalEntries).toBe(6); // 10 - 4 = 6
    });
  });

  describe('Cache Performance Optimization', () => {
    it('should provide efficient batch caching', () => {
      const batchEntries = mockTargets.slice(0, 15).map(target => ({
        observer: mockObserver,
        target,
        state: { batchCached: true, targetId: target.document.id }
      }));

      const startTime = performance.now();
      
      positionCacheManager.batchCachePositionStates(batchEntries, { ttl: 45000 });
      
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50); // Should be very fast

      const stats = positionCacheManager.getStats();
      expect(stats.totalEntries).toBe(15);

      // Verify all entries are cached correctly
      batchEntries.forEach(entry => {
        const cached = positionCacheManager.getCachedPositionState(
          entry.observer,
          entry.target
        );
        expect(cached).not.toBeNull();
        expect(cached.batchCached).toBe(true);
      });
    });

    it('should optimize cache access patterns', async () => {
      // Cache some entries
      const testTargets = mockTargets.slice(0, 8);
      testTargets.forEach((target, i) => {
        positionCacheManager.cachePositionState(
          mockObserver,
          target,
          { index: i, data: 'test' }
        );
      });

      // Access entries in different patterns
      const accessPattern1 = [0, 1, 2, 0, 1, 0]; // Frequent access to 0, 1
      const accessPattern2 = [3, 4, 5, 6, 7]; // Single access to others

      // Simulate access pattern 1
      accessPattern1.forEach(index => {
        positionCacheManager.getCachedPositionState(mockObserver, testTargets[index]);
      });

      // Simulate access pattern 2
      accessPattern2.forEach(index => {
        positionCacheManager.getCachedPositionState(mockObserver, testTargets[index]);
      });

      // Force optimization to keep only 5 entries
      positionCacheManager.optimize(5);

      const finalStats = positionCacheManager.getStats();
      expect(finalStats.totalEntries).toBe(5);

      // Frequently accessed entries should be more likely to remain
      const entry0 = positionCacheManager.getCachedPositionState(mockObserver, testTargets[0]);
      const entry1 = positionCacheManager.getCachedPositionState(mockObserver, testTargets[1]);
      
      // At least one of the frequently accessed entries should remain
      expect(entry0 !== null || entry1 !== null).toBe(true);
    });

    it('should handle concurrent cache operations safely', async () => {
      const concurrentOperations = Array.from({ length: 20 }, (_, i) => {
        return new Promise(resolve => {
          setTimeout(() => {
            positionCacheManager.cachePositionState(
              mockObserver,
              { document: { id: `concurrent-${i}` }, x: i * 10, y: i * 10 },
              { concurrent: true, index: i }
            );
            resolve(i);
          }, Math.random() * 10); // Random delay up to 10ms
        });
      });

      const results = await Promise.all(concurrentOperations);
      expect(results).toHaveLength(20);

      const finalStats = positionCacheManager.getStats();
      expect(finalStats.totalEntries).toBe(20);

      // Verify all entries are properly cached
      for (let i = 0; i < 20; i++) {
        const cached = positionCacheManager.getCachedPositionState(
          mockObserver,
          { document: { id: `concurrent-${i}` }, x: i * 10, y: i * 10 }
        );
        expect(cached).not.toBeNull();
        expect(cached.index).toBe(i);
      }
    });
  });

  describe('SneakPositionTracker Cache Integration', () => {
    beforeEach(() => {
      // Mock error handling service
      vi.doMock('../../scripts/chat/services/infra/error-handling-service.js', () => ({
        default: {
          handleSystemError: vi.fn().mockResolvedValue({ fallbackApplied: false })
        },
        SYSTEM_TYPES: {
          POSITION_TRACKER: 'position-tracker'
        }
      }));
    });

    it('should determine position importance correctly', () => {
      const testCases = [
        {
          state: { avsVisibility: 'hidden', stealthBonus: 0 },
          expected: 'critical'
        },
        {
          state: { avsVisibility: 'undetected', stealthBonus: 1 },
          expected: 'critical'
        },
        {
          state: { avsVisibility: 'concealed', stealthBonus: 1 },
          expected: 'high'
        },
        {
          state: { avsVisibility: 'observed', stealthBonus: 3 },
          expected: 'high'
        },
        {
          state: { avsVisibility: 'observed', stealthBonus: 0 },
          expected: 'low'
        },
        {
          state: { avsVisibility: 'concealed', stealthBonus: 1 },
          expected: 'high'
        }
      ];

      testCases.forEach(({ state, expected }) => {
        const importance = sneakPositionTracker._determinePositionImportance(state);
        expect(importance).toBe(expected);
      });
    });

    it('should preload position cache effectively', async () => {
      const testTargets = mockTargets.slice(0, 12);

      const preloadedCount = await sneakPositionTracker.preloadPositionCache(
        mockObserver,
        testTargets,
        { batchSize: 6, ttl: 90000 }
      );

      expect(preloadedCount).toBe(12);

      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBe(12);

      // Verify entries have longer TTL for preloaded data
      const cacheEntries = Array.from(positionCacheManager._cache.values());
      cacheEntries.forEach(entry => {
        expect(entry.ttl).toBe(90000); // Should match preload TTL
      });
    });

    it('should enable predictive caching for movement', async () => {
      const observers = mockTargets.slice(0, 6);

      await sneakPositionTracker.enablePredictivePositionCaching(
        mockObserver,
        observers,
        {
          predictionRadius: 100,
          maxPredictions: 8,
          ttl: 20000
        }
      );

      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBeGreaterThan(0);

      // Should have cached predictions for multiple positions
      expect(cacheStats.totalEntries).toBeGreaterThan(observers.length);
    });
  });

  describe('Cache Metrics and Monitoring', () => {
    it('should track cache performance metrics accurately', () => {
      // Perform cache operations to generate metrics
      const testTargets = mockTargets.slice(0, 10);
      
      // Cache some entries
      testTargets.forEach((target, i) => {
        positionCacheManager.cachePositionState(mockObserver, target, { index: i });
      });

      // Generate cache hits
      testTargets.slice(0, 5).forEach(target => {
        positionCacheManager.getCachedPositionState(mockObserver, target);
      });

      // Generate cache misses
      const missTargets = Array.from({ length: 3 }, (_, i) => ({
        document: { id: `miss-${i}` },
        x: 1000 + i * 10,
        y: 1000 + i * 10
      }));

      missTargets.forEach(target => {
        positionCacheManager.getCachedPositionState(mockObserver, target);
      });

      const stats = positionCacheManager.getStats();
      
      expect(stats.hits).toBe(5);
      expect(stats.misses).toBe(3);
      expect(stats.totalEntries).toBe(10);
      expect(stats.hitRate).toBe(62.5); // 5/(5+3) * 100 = 62.5%
      expect(stats.memoryUsageMB).toBeGreaterThan(0);
    });

    it('should provide comprehensive performance metrics', () => {
      const metrics = sneakPositionTracker.getPerformanceMetrics();

      expect(metrics).toHaveProperty('optimizer');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('system');

      expect(metrics.cache).toHaveProperty('hits');
      expect(metrics.cache).toHaveProperty('misses');
      expect(metrics.cache).toHaveProperty('hitRate');
      expect(metrics.cache).toHaveProperty('memoryUsageMB');
      expect(metrics.cache).toHaveProperty('performanceMetrics');
    });
  });
});