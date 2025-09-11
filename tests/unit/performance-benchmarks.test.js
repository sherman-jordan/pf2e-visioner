/**
 * Performance Benchmarks for Enhanced Sneak AVS Integration
 * Tests performance optimizations and caching mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import performanceOptimizer from '../../scripts/chat/services/position/PerformanceOptimizer.js';
import positionCacheManager from '../../scripts/chat/services/position/PositionCacheManager.js';
import sneakPositionTracker from '../../scripts/chat/services/position/SneakPositionTracker.js';

// Mock FoundryVTT globals
global.canvas = {
  grid: {
    measureDistances: vi.fn(() => [100])
  },
  walls: {
    checkCollision: vi.fn(() => false)
  },
  lighting: {
    getIllumination: vi.fn(() => 0.5)
  }
};

global.Ray = class {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

describe('Performance Benchmarks', () => {
  let mockTokens;
  let observer;

  beforeEach(() => {
    // Reset performance metrics
    performanceOptimizer.resetMetrics();
    positionCacheManager.clear();

    // Create mock observer token
    observer = {
      x: 500,
      y: 500,
      center: { x: 500, y: 500 },
      document: { id: 'observer-1' }
    };

    // Create mock target tokens
    mockTokens = Array.from({ length: 100 }, (_, i) => ({
      x: 100 + (i % 10) * 100,
      y: 100 + Math.floor(i / 10) * 100,
      center: { x: 100 + (i % 10) * 100, y: 100 + Math.floor(i / 10) * 100 },
      document: { id: `token-${i}` }
    }));
  });

  afterEach(() => {
    performanceOptimizer.destroy();
    positionCacheManager.destroy();
  });

  describe('Batch Processing Performance', () => {
    it('should process small batches efficiently', async () => {
      const smallBatch = mockTokens.slice(0, 10);
      const mockCalculator = vi.fn().mockResolvedValue({ calculated: true });

      const startTime = performance.now();
      
      const results = await performanceOptimizer.optimizePositionCalculation(
        observer,
        smallBatch,
        mockCalculator
      );

      const duration = performance.now() - startTime;

      expect(results.size).toBe(10);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
      expect(mockCalculator).toHaveBeenCalledTimes(10);
    });

    it('should handle large batches with controlled concurrency', async () => {
      const largeBatch = mockTokens.slice(0, 50);
      const mockCalculator = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
        return { calculated: true };
      });

      const startTime = performance.now();
      
      const results = await performanceOptimizer.optimizePositionCalculation(
        observer,
        largeBatch,
        mockCalculator
      );

      const duration = performance.now() - startTime;

      expect(results.size).toBe(50);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
      expect(mockCalculator).toHaveBeenCalledTimes(50);

      // Check that batching was used
      const metrics = performanceOptimizer.getMetrics();
      expect(metrics.batchMetrics.totalBatches).toBeGreaterThan(1);
    });

    it('should adapt batch size based on performance', async () => {
      const mockCalculator = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Slow operation
        return { calculated: true };
      });

      // First run with slow operations
      await performanceOptimizer.optimizePositionCalculation(
        observer,
        mockTokens.slice(0, 20),
        mockCalculator
      );

      const metrics1 = performanceOptimizer.getMetrics();
      const initialBatchSize = performanceOptimizer._currentOptimalBatchSize;

      // Simulate performance adaptation
      performanceOptimizer.adaptPerformanceSettings({
        averageOperationTime: 150, // Slow
        memoryUsage: 0.5,
        systemLoad: 0.6
      });

      expect(performanceOptimizer._currentOptimalBatchSize).toBeLessThan(initialBatchSize);
    });
  });

  describe('Multi-Target Processing Performance', () => {
    it('should use spatial clustering for large token counts', async () => {
      const mockCalculator = vi.fn().mockResolvedValue({ calculated: true });

      const startTime = performance.now();
      
      const results = await performanceOptimizer.optimizeMultiTargetProcessing(
        observer,
        mockTokens,
        mockCalculator
      );

      const duration = performance.now() - startTime;

      expect(results.size).toBe(100);
      expect(duration).toBeLessThan(3000); // Should complete in under 3 seconds
      expect(mockCalculator).toHaveBeenCalledTimes(100);
    });

    it('should handle streaming for very large token counts', async () => {
      const veryLargeTokens = Array.from({ length: 200 }, (_, i) => ({
        x: i * 10,
        y: i * 10,
        center: { x: i * 10, y: i * 10 },
        document: { id: `large-token-${i}` }
      }));

      const mockCalculator = vi.fn().mockResolvedValue({ calculated: true });
      const progressUpdates = [];

      let totalResults = 0;
      
      for await (const batch of performanceOptimizer.streamLargeTokenProcessing(
        observer,
        veryLargeTokens,
        mockCalculator,
        {
          streamBatchSize: 25,
          onProgress: (progress) => progressUpdates.push(progress)
        }
      )) {
        totalResults += batch.results.size;
        expect(batch.progress.percentage).toBeGreaterThanOrEqual(0);
        expect(batch.progress.percentage).toBeLessThanOrEqual(100);
      }

      expect(totalResults).toBe(200);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    });
  });

  describe('Cache Performance', () => {
    it('should provide significant speedup with caching', async () => {
      const mockCalculator = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate calculation time
        return { calculated: true, timestamp: Date.now() };
      });

      const testTokens = mockTokens.slice(0, 20);

      // First run - no cache
      const startTime1 = performance.now();
      const results1 = await performanceOptimizer.optimizePositionCalculation(
        observer,
        testTokens,
        mockCalculator
      );
      const duration1 = performance.now() - startTime1;

      expect(mockCalculator).toHaveBeenCalledTimes(20);

      // Second run - with cache
      mockCalculator.mockClear();
      const startTime2 = performance.now();
      const results2 = await performanceOptimizer.optimizePositionCalculation(
        observer,
        testTokens,
        mockCalculator
      );
      const duration2 = performance.now() - startTime2;

      expect(results1.size).toBe(results2.size);
      expect(duration2).toBeLessThan(duration1 * 0.5); // Should be at least 50% faster
      expect(mockCalculator).toHaveBeenCalledTimes(0); // No new calculations

      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.hitRate).toBeGreaterThan(90); // High hit rate
    });

    it('should handle cache warming efficiently', async () => {
      const mockCalculator = vi.fn().mockResolvedValue({ warmed: true });
      const tokenPairs = mockTokens.slice(0, 30).map(target => ({
        observer,
        target
      }));

      const startTime = performance.now();
      
      const warmedCount = await positionCacheManager.warmCache(
        tokenPairs,
        mockCalculator,
        { batchSize: 10 }
      );

      const duration = performance.now() - startTime;

      expect(warmedCount).toBe(30);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(mockCalculator).toHaveBeenCalledTimes(30);

      // Verify cache entries exist
      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBe(30);
    });

    it('should manage memory usage effectively', async () => {
      // Fill cache with large entries
      const largeData = { data: 'x'.repeat(10000) }; // ~10KB entry
      
      for (let i = 0; i < 100; i++) {
        positionCacheManager.cachePositionState(
          observer,
          { document: { id: `memory-test-${i}` }, x: i, y: i },
          largeData
        );
      }

      const beforeStats = positionCacheManager.getStats();
      expect(beforeStats.memoryUsageMB).toBeGreaterThan(0.5); // Should use significant memory

      // Trigger memory cleanup
      await positionCacheManager.memoryAwareCleanup(0.5); // 0.5MB target

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.memoryUsageMB).toBeLessThan(beforeStats.memoryUsageMB);
      expect(afterStats.totalEntries).toBeLessThan(beforeStats.totalEntries);
    });
  });

  describe('SneakPositionTracker Performance', () => {
    beforeEach(() => {
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
          }),
          getBatchCombinedStates: vi.fn().mockImplementation(async (observer, targets) => {
            const results = new Map();
            for (const target of targets) {
              results.set(target.document.id, {
                avsResult: { data: 'concealed', success: true, source: 'calculated' },
                coverResult: { data: { state: 'standard' }, success: true, source: 'calculated' },
                stealthBonus: 2,
                effectiveVisibility: 'concealed',
                warnings: []
              });
            }
            return results;
          })
        }
      }));
    });

    it('should handle large scene optimization efficiently', async () => {
      const largeScene = Array.from({ length: 150 }, (_, i) => ({
        x: (i % 15) * 100,
        y: Math.floor(i / 15) * 100,
        center: { x: (i % 15) * 100, y: Math.floor(i / 15) * 100 },
        document: { id: `scene-token-${i}` }
      }));

      const progressUpdates = [];
      
      const startTime = performance.now();
      
      const results = await sneakPositionTracker.optimizeForLargeScene(
        observer,
        largeScene,
        {
          maxDistance: 800,
          useStreaming: true,
          onProgress: (progress) => progressUpdates.push(progress)
        }
      );

      const duration = performance.now() - startTime;

      expect(results.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should preload cache effectively', async () => {
      const testTargets = mockTokens.slice(0, 25);

      const startTime = performance.now();
      
      const preloadedCount = await sneakPositionTracker.preloadPositionCache(
        observer,
        testTargets,
        { batchSize: 10 }
      );

      const duration = performance.now() - startTime;

      expect(preloadedCount).toBe(25);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds

      // Verify cache entries
      const cacheStats = positionCacheManager.getStats();
      expect(cacheStats.totalEntries).toBe(25);
    });

    it('should provide comprehensive performance metrics', () => {
      const metrics = sneakPositionTracker.getPerformanceMetrics();

      expect(metrics).toHaveProperty('optimizer');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('system');

      expect(metrics.optimizer).toHaveProperty('totalOperations');
      expect(metrics.cache).toHaveProperty('hitRate');
      expect(metrics.system).toHaveProperty('avs');
    });
  });

  describe('Memory Management', () => {
    it('should optimize memory usage when requested', async () => {
      // Fill up memory with cache entries
      for (let i = 0; i < 50; i++) {
        positionCacheManager.cachePositionState(
          observer,
          { document: { id: `memory-${i}` }, x: i * 10, y: i * 10 },
          { largeData: 'x'.repeat(5000) } // ~5KB per entry
        );
      }

      const beforeStats = positionCacheManager.getStats();
      
      const optimizationResults = await sneakPositionTracker.optimizeMemoryUsage({
        targetMemoryMB: 0.1 // Very low target to force cleanup
      });

      expect(optimizationResults.cacheCleanup).toBe(true);
      expect(optimizationResults.memoryFreed).toBeGreaterThan(0);
      expect(optimizationResults.entriesRemoved).toBeGreaterThan(0);

      const afterStats = positionCacheManager.getStats();
      expect(afterStats.memoryUsageMB).toBeLessThan(beforeStats.memoryUsageMB);
    });

    it('should handle garbage collection hints for large processing', async () => {
      const veryLargeTokens = Array.from({ length: 300 }, (_, i) => ({
        x: i,
        y: i,
        center: { x: i, y: i },
        document: { id: `gc-token-${i}` }
      }));

      const mockCalculator = vi.fn().mockResolvedValue({ data: 'x'.repeat(1000) });

      // Mock global.gc
      global.gc = vi.fn();

      let batchCount = 0;
      for await (const batch of performanceOptimizer.streamLargeTokenProcessing(
        observer,
        veryLargeTokens,
        mockCalculator,
        { streamBatchSize: 50, maxMemoryMB: 1 }
      )) {
        batchCount++;
      }

      expect(batchCount).toBeGreaterThan(1);
      // GC should be called when memory threshold is exceeded
      expect(global.gc).toHaveBeenCalled();
    });
  });

  describe('Adaptive Performance Tuning', () => {
    it('should adapt settings based on performance data', () => {
      const initialBatchSize = performanceOptimizer._currentOptimalBatchSize;
      const initialConcurrency = performanceOptimizer.config.maxConcurrentOperations;

      // Simulate poor performance
      performanceOptimizer.adaptPerformanceSettings({
        averageOperationTime: 200, // Slow
        memoryUsage: 0.9, // High memory
        systemLoad: 0.9 // High load
      });

      expect(performanceOptimizer._currentOptimalBatchSize).toBeLessThan(initialBatchSize);
      expect(performanceOptimizer.config.maxConcurrentOperations).toBeLessThan(initialConcurrency);
      expect(performanceOptimizer.config.batchDelay).toBeGreaterThan(10);

      // Simulate good performance
      performanceOptimizer.adaptPerformanceSettings({
        averageOperationTime: 10, // Fast
        memoryUsage: 0.3, // Low memory
        systemLoad: 0.3 // Low load
      });

      expect(performanceOptimizer._currentOptimalBatchSize).toBeGreaterThan(5);
      expect(performanceOptimizer.config.maxConcurrentOperations).toBeGreaterThan(1);
    });
  });
});

describe('Performance Regression Tests', () => {
  it('should maintain performance standards for common operations', async () => {
    const observer = {
      x: 500,
      y: 500,
      center: { x: 500, y: 500 },
      document: { id: 'perf-observer' }
    };

    const targets = Array.from({ length: 50 }, (_, i) => ({
      x: 100 + i * 20,
      y: 100 + i * 20,
      center: { x: 100 + i * 20, y: 100 + i * 20 },
      document: { id: `perf-target-${i}` }
    }));

    const mockCalculator = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5)); // 5ms per calculation
      return { calculated: true };
    });

    const startTime = performance.now();
    
    const results = await performanceOptimizer.optimizePositionCalculation(
      observer,
      targets,
      mockCalculator
    );

    const duration = performance.now() - startTime;

    // Performance standards
    expect(results.size).toBe(50);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    expect(mockCalculator).toHaveBeenCalledTimes(50);

    const metrics = performanceOptimizer.getMetrics();
    expect(metrics.averageTokensPerSecond).toBeGreaterThan(10); // At least 10 tokens/second
  });
});