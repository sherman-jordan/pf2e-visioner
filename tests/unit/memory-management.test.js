/**
 * Memory Management Tests for Enhanced Sneak AVS Integration
 * Tests memory optimization and garbage collection mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import positionCacheManager from '../../scripts/chat/services/position/PositionCacheManager.js';
import performanceOptimizer from '../../scripts/chat/services/position/PerformanceOptimizer.js';

describe('Memory Management', () => {
  let mockObserver;
  let mockTargets;

  beforeEach(() => {
    positionCacheManager.clear();
    performanceOptimizer.resetMetrics();

    mockObserver = {
      x: 500,
      y: 500,
      center: { x: 500, y: 500 },
      document: { id: 'observer-memory-test' }
    };

    mockTargets = Array.from({ length: 20 }, (_, i) => ({
      x: 100 + i * 50,
      y: 100 + i * 50,
      center: { x: 100 + i * 50, y: 100 + i * 50 },
      document: { id: `target-memory-${i}` }
    }));
  });

  afterEach(() => {
    positionCacheManager.destroy();
    performanceOptimizer.destroy();
  });

  describe('Cache Memory Management', () => {
    it('should track memory usage accurately', () => {
      const smallData = { value: 'small' };
      const largeData = { value: 'x'.repeat(10000) }; // ~10KB

      // Cache small entry
      positionCacheManager.cachePositionState(mockObserver, mockTargets[0], smallData);
      const statsAfterSmall = positionCacheManager.getStats();
      
      // Cache large entry
      positionCacheManager.cachePositionState(mockObserver, mockTargets[1], largeData);
      const statsAfterLarge = positionCacheManager.getStats();

      expect(statsAfterLarge.memoryUsage).toBeGreaterThan(statsAfterSmall.memoryUsage);
      expect(statsAfterLarge.memoryUsageMB).toBeGreaterThan(0);
    });

    it('should enforce memory limits', () => {
      // Create cache manager with low memory limit
      const limitedCache = new (positionCacheManager.constructor)({
        maxMemoryMB: 0.1, // 100KB limit
        maxEntries: 1000
      });

      const largeData = { value: 'x'.repeat(50000) }; // ~50KB per entry

      // Try to cache 5 large entries (250KB total, exceeds 100KB limit)
      for (let i = 0; i < 5; i++) {
        limitedCache.cachePositionState(
          mockObserver,
          { document: { id: `large-${i}` }, x: i * 10, y: i * 10 },
          largeData
        );
      }

      const stats = limitedCache.getStats();
      expect(stats.memoryUsageMB).toBeLessThanOrEqual(0.15); // Allow some overhead
      expect(stats.evictions).toBeGreaterThan(0);

      limitedCache.destroy();
    });

    it('should perform memory-aware cleanup', async () => {
      // Fill cache with various sized entries
      const entries = [
        { size: 'small', data: { value: 'x'.repeat(100) } },
        { size: 'medium', data: { value: 'x'.repeat(5000) } },
        { size: 'large', data: { value: 'x'.repeat(20000) } }
      ];

      for (let i = 0; i < 30; i++) {
        const entry = entries[i % entries.length];
        positionCacheManager.cachePositionState(
          mockObserver,
          { document: { id: `cleanup-${i}` }, x: i * 10, y: i * 10 },
          entry.data
        );
      }

      const beforeStats = positionCacheManager.getStats();
      expect(beforeStats.totalEntries).toBe(30);

      // Perform memory-aware cleanup with low target
      await positionCacheManager.memoryAwareCleanup(0.05); // 50KB target

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.memoryUsageMB).toBeLessThan(beforeStats.memoryUsageMB);
      expect(afterStats.totalEntries).toBeLessThan(beforeStats.totalEntries);
    });

    it('should prioritize eviction based on importance', () => {
      // Cache entries with different importance levels
      const importanceData = [
        { importance: 'critical', data: { critical: true } },
        { importance: 'high', data: { high: true } },
        { importance: 'normal', data: { normal: true } },
        { importance: 'low', data: { low: true } }
      ];

      for (let i = 0; i < 20; i++) {
        const entry = importanceData[i % importanceData.length];
        positionCacheManager.cacheWithImportance(
          `importance-test-${i}`,
          entry.data,
          entry.importance
        );
      }

      // Force optimization to trigger eviction
      positionCacheManager.optimize(10); // Keep only 10 entries

      const remainingEntries = [];
      for (let i = 0; i < 20; i++) {
        const cached = positionCacheManager._get(`importance-test-${i}`);
        if (cached) {
          remainingEntries.push(cached);
        }
      }

      // Critical and high importance entries should be more likely to remain
      const criticalRemaining = remainingEntries.filter(e => e.critical).length;
      const lowRemaining = remainingEntries.filter(e => e.low).length;
      
      expect(criticalRemaining).toBeGreaterThanOrEqual(lowRemaining);
    });
  });

  describe('Streaming Memory Management', () => {
    it('should manage memory during streaming operations', async () => {
      const largeTokenSet = Array.from({ length: 200 }, (_, i) => ({
        x: i * 10,
        y: i * 10,
        center: { x: i * 10, y: i * 10 },
        document: { id: `stream-token-${i}` }
      }));

      const mockCalculator = vi.fn().mockImplementation(async () => {
        return { data: 'x'.repeat(5000) }; // 5KB per result
      });

      // Mock global.gc
      global.gc = vi.fn();

      let maxMemoryUsage = 0;
      let gcCallCount = 0;

      for await (const batch of performanceOptimizer.streamLargeTokenProcessing(
        mockObserver,
        largeTokenSet,
        mockCalculator,
        {
          streamBatchSize: 25,
          maxMemoryMB: 0.5 // 500KB limit
        }
      )) {
        // Track memory usage during streaming
        const currentMemory = process.memoryUsage?.().heapUsed || 0;
        maxMemoryUsage = Math.max(maxMemoryUsage, currentMemory);

        if (global.gc.mock.calls.length > gcCallCount) {
          gcCallCount = global.gc.mock.calls.length;
        }
      }

      // Verify that garbage collection was triggered
      expect(global.gc).toHaveBeenCalled();
      expect(gcCallCount).toBeGreaterThan(0);
    });

    it('should handle memory pressure gracefully', async () => {
      const mockCalculator = vi.fn().mockImplementation(async () => {
        // Simulate memory-intensive calculation
        const largeArray = new Array(10000).fill('memory-test');
        return { result: largeArray.slice(0, 100) }; // Return smaller result
      });

      const tokens = Array.from({ length: 50 }, (_, i) => ({
        x: i * 20,
        y: i * 20,
        center: { x: i * 20, y: i * 20 },
        document: { id: `pressure-token-${i}` }
      }));

      let completedBatches = 0;
      let errors = 0;

      try {
        for await (const batch of performanceOptimizer.streamLargeTokenProcessing(
          mockObserver,
          tokens,
          mockCalculator,
          {
            streamBatchSize: 10,
            maxMemoryMB: 1 // 1MB limit
          }
        )) {
          completedBatches++;
          expect(batch.results.size).toBeGreaterThan(0);
        }
      } catch (error) {
        errors++;
      }

      expect(completedBatches).toBeGreaterThan(0);
      expect(errors).toBe(0); // Should handle memory pressure without errors
    });
  });

  describe('Cache Compression', () => {
    it('should compress large cache entries', () => {
      const largeObject = {
        timestamp: 1234567890123, // High precision timestamp
        distance: 123.456789, // High precision float
        data: 'x'.repeat(15000), // Large string
        redundantField1: 'same',
        redundantField2: 'same'
      };

      const compressed = positionCacheManager._compressObject(largeObject);

      expect(compressed.timestamp).toBe(1234567890000); // Reduced precision
      expect(compressed.distance).toBe(123.46); // Rounded
      expect(compressed.data).toBe(largeObject.data); // String unchanged
    });

    it('should automatically compress when caching large entries', () => {
      const spy = vi.spyOn(positionCacheManager, '_compressIfNeeded');
      
      const largeData = {
        value: 'x'.repeat(15000), // ~15KB
        metadata: { complex: true }
      };

      positionCacheManager.cachePositionState(mockObserver, mockTargets[0], largeData);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Predictive Caching Memory Impact', () => {
    it('should manage memory during predictive caching', async () => {
      const mockCalculator = vi.fn().mockResolvedValue({
        predicted: true,
        data: 'x'.repeat(2000) // 2KB per prediction
      });

      const nearbyTargets = mockTargets.slice(0, 10);

      const beforeStats = positionCacheManager.getStats();

      await positionCacheManager.predictiveCache(
        mockObserver,
        nearbyTargets,
        mockCalculator,
        {
          predictionRadius: 100,
          maxPredictions: 20
        }
      );

      const afterStats = positionCacheManager.getStats();

      expect(afterStats.totalEntries).toBeGreaterThan(beforeStats.totalEntries);
      expect(afterStats.memoryUsage).toBeGreaterThan(beforeStats.memoryUsage);

      // Verify predictions have shorter TTL
      const cacheEntries = Array.from(positionCacheManager._cache.values());
      const predictedEntries = cacheEntries.filter(entry => 
        entry.data && entry.data.predicted
      );

      expect(predictedEntries.length).toBeGreaterThan(0);
      // Predicted entries should have shorter TTL than default
      predictedEntries.forEach(entry => {
        expect(entry.ttl).toBeLessThan(positionCacheManager.defaultTTL);
      });
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should clean up expired entries automatically', async () => {
      // Create cache manager with short cleanup interval
      const testCache = new (positionCacheManager.constructor)({
        cleanupInterval: 100, // 100ms cleanup interval
        defaultTTL: 50 // 50ms TTL
      });

      // Cache some entries
      for (let i = 0; i < 10; i++) {
        testCache.cachePositionState(
          mockObserver,
          { document: { id: `expire-${i}` }, x: i * 10, y: i * 10 },
          { data: `test-${i}` }
        );
      }

      const initialStats = testCache.getStats();
      expect(initialStats.totalEntries).toBe(10);

      // Wait for entries to expire and cleanup to run
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalStats = testCache.getStats();
      expect(finalStats.totalEntries).toBeLessThan(initialStats.totalEntries);

      testCache.destroy();
    });

    it('should prevent unbounded cache growth', () => {
      // Create cache with low entry limit
      const limitedCache = new (positionCacheManager.constructor)({
        maxEntries: 10,
        maxMemoryMB: 100 // High memory limit to test entry limit
      });

      // Try to cache more entries than the limit
      for (let i = 0; i < 20; i++) {
        limitedCache.cachePositionState(
          mockObserver,
          { document: { id: `growth-${i}` }, x: i * 10, y: i * 10 },
          { data: `test-${i}` }
        );
      }

      const stats = limitedCache.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(10);
      expect(stats.evictions).toBeGreaterThan(0);

      limitedCache.destroy();
    });

    it('should handle token invalidation without memory leaks', () => {
      // Cache entries for multiple tokens
      const testTokens = Array.from({ length: 15 }, (_, i) => ({
        document: { id: `invalidate-${i}` },
        x: i * 20,
        y: i * 20
      }));

      testTokens.forEach(token => {
        positionCacheManager.cachePositionState(mockObserver, token, { data: 'test' });
      });

      const beforeStats = positionCacheManager.getStats();
      expect(beforeStats.totalEntries).toBe(15);

      // Invalidate cache for subset of tokens
      const tokensToInvalidate = testTokens.slice(0, 5);
      positionCacheManager.batchInvalidateTokenCache(tokensToInvalidate);

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.totalEntries).toBe(10); // 15 - 5 = 10
      expect(afterStats.memoryUsage).toBeLessThan(beforeStats.memoryUsage);
    });
  });

  describe('Performance Under Memory Pressure', () => {
    it('should maintain performance when memory is constrained', async () => {
      // Create constrained environment
      const constrainedCache = new (positionCacheManager.constructor)({
        maxMemoryMB: 0.1, // Very low limit
        maxEntries: 20
      });

      const mockCalculator = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { data: 'x'.repeat(1000) }; // 1KB per entry
      });

      const startTime = performance.now();

      // Process tokens that will exceed memory limits
      const results = await performanceOptimizer.optimizePositionCalculation(
        mockObserver,
        mockTargets,
        mockCalculator
      );

      const duration = performance.now() - startTime;

      expect(results.size).toBe(mockTargets.length);
      expect(duration).toBeLessThan(2000); // Should still complete reasonably fast

      constrainedCache.destroy();
    });

    it('should adapt to memory constraints dynamically', () => {
      const initialMemoryLimit = positionCacheManager.maxMemoryMB;

      // Simulate memory pressure
      performanceOptimizer.adaptPerformanceSettings({
        averageOperationTime: 50,
        memoryUsage: 0.95, // Very high memory usage
        systemLoad: 0.7
      });

      // Should increase batch delay to reduce memory pressure
      expect(performanceOptimizer.config.batchDelay).toBeGreaterThan(10);

      // Simulate memory relief
      performanceOptimizer.adaptPerformanceSettings({
        averageOperationTime: 20,
        memoryUsage: 0.3, // Low memory usage
        systemLoad: 0.4
      });

      // Should reduce batch delay when memory is available
      expect(performanceOptimizer.config.batchDelay).toBeLessThan(50);
    });
  });
});