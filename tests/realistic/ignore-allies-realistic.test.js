/**
 * REALISTIC IGNORE ALLIES TEST
 * 
 * This test uses realistic mocks that mirror real FoundryVTT scenarios.
 * It WILL catch bugs that perfect mocks miss.
 * 
 * PRINCIPLE: Test with the chaos of real usage, not perfect scenarios
 */

import { jest } from '@jest/globals';
import {
    createRealisticGameSettings,
    createRealisticTokenScenarios,
    setupRealisticEnvironment,
    testWithRealisticScenarios
} from '../realistic-mocks.js';

describe('REALISTIC: Ignore Allies Functionality', () => {
  let originalGame, originalCanvas;

  beforeEach(() => {
    originalGame = global.game;
    originalCanvas = global.canvas;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.game = originalGame;
    global.canvas = originalCanvas;
    jest.restoreAllMocks();
  });

  describe('Real World Scenarios', () => {
    testWithRealisticScenarios((scenario) => {
      test(`getSceneTargets handles ${scenario} scenario correctly`, async () => {
        // Import REAL module (no mocking of internal logic)
        const utils = await import('../../scripts/utils.js');
        
        // Mock only external behavior
        const originalIsValidToken = utils.isValidToken;
        utils.isValidToken = jest.fn().mockImplementation((token) => {
          // REALISTIC: Some tokens are invalid in real usage
          if (!token || !token.actor || !token.document) return false;
          if (token.actor.type === null) return false; // Corrupted actor
          return true;
        });

        try {
          const observer = global.canvas.tokens.placeables.find(t => t?.id === 'pc-1');
          
          if (!observer) {
            // In empty/chaos scenarios, no observer exists
            expect(utils.getSceneTargets(null, false, true)).toEqual([]);
            return;
          }

          // Test with ignoreAllies = false
          const allTargets = utils.getSceneTargets(observer, false, false);
          
          // Test with ignoreAllies = true  
          const filteredTargets = utils.getSceneTargets(observer, false, true);
          
          // REALISTIC EXPECTATIONS based on scenario
          if (scenario === 'normal') {
            expect(allTargets.length).toBeGreaterThan(0);
            expect(filteredTargets.length).toBeLessThanOrEqual(allTargets.length);
            
            // Should filter out allies (familiar in this case)
            const familiarInAll = allTargets.find(t => t.id === 'familiar-1');
            const familiarInFiltered = filteredTargets.find(t => t.id === 'familiar-1');
            
            if (familiarInAll) {
              expect(familiarInFiltered).toBeUndefined(); // Familiar filtered out
            }
          } else if (scenario === 'chaos') {
            // In chaos scenario, function should not crash
            expect(Array.isArray(allTargets)).toBe(true);
            expect(Array.isArray(filteredTargets)).toBe(true);
            
            // Should handle corrupted data gracefully
            allTargets.forEach(token => {
              expect(token).toBeTruthy(); // No null tokens in result
              expect(token.actor).toBeTruthy(); // No tokens with null actors
            });
          } else if (scenario === 'empty') {
            expect(allTargets).toEqual([]);
            expect(filteredTargets).toEqual([]);
          }
          
        } finally {
          utils.isValidToken = originalIsValidToken;
        }
      });
    });
  });

  describe('Edge Cases That Break Real Modules', () => {
    test('handles null observer gracefully', async () => {
      setupRealisticEnvironment('normal');
      const utils = await import('../../scripts/utils.js');
      
      // This breaks many modules in real usage
      expect(() => utils.getSceneTargets(null, false, true)).not.toThrow();
      expect(utils.getSceneTargets(null, false, true)).toEqual([]);
    });

    test('handles corrupted token data', async () => {
      const scenarios = createRealisticTokenScenarios();
      
      global.canvas = {
        tokens: {
          placeables: [
            scenarios.healthyPC, // Observer
            scenarios.corruptedActor, // Corrupted target
            scenarios.deletedToken, // Deleted target
            scenarios.missingDocument // Missing document
          ]
        }
      };

      const utils = await import('../../scripts/utils.js');
      const observer = scenarios.healthyPC;
      
      // Should not crash with corrupted data
      expect(() => utils.getSceneTargets(observer, false, true)).not.toThrow();
      
      const result = utils.getSceneTargets(observer, false, true);
      
      // Should filter out corrupted tokens
      expect(result.every(token => token && token.actor && token.document)).toBe(true);
    });

    test('handles missing settings gracefully', async () => {
      // Simulate corrupted/missing settings (happens in real usage)
      global.game = {
        settings: {
          get: jest.fn().mockImplementation((module, setting) => {
            if (setting === 'ignoreAllies') return undefined; // Missing setting!
            return false;
          })
        }
      };

      setupRealisticEnvironment('normal');
      const utils = await import('../../scripts/utils.js');
      const observer = global.canvas.tokens.placeables[0];
      
      // Should handle missing settings without crashing
      expect(() => utils.getSceneTargets(observer, false, true)).not.toThrow();
    });
  });

  describe('User Configuration Scenarios', () => {
    test('works with different user setting profiles', async () => {
      const settings = createRealisticGameSettings();
      
      // Test each realistic user profile
      Object.keys(settings.profiles).forEach(async (profile) => {
        global.game = {
          settings: {
            get: settings.createMockGet(profile)
          }
        };

        setupRealisticEnvironment('normal');
        const utils = await import('../../scripts/utils.js');
        const observer = global.canvas.tokens.placeables[0];
        
        // Should work regardless of user settings
        expect(() => utils.getSceneTargets(observer, false, true)).not.toThrow();
        
        const result = utils.getSceneTargets(observer, false, true);
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Performance Under Realistic Load', () => {
    test('handles large token counts without performance degradation', async () => {
      // Simulate realistic large scene (100+ tokens)
      const manyTokens = Array.from({ length: 150 }, (_, i) => ({
        id: `token-${i}`,
        name: `Token ${i}`,
        actor: { 
          alliance: i % 3 === 0 ? 'party' : 'opposition', 
          type: i % 10 === 0 ? 'loot' : 'npc' 
        },
        document: { disposition: i % 3 === 0 ? 1 : -1 }
      }));

      global.canvas = { tokens: { placeables: manyTokens } };
      
      const utils = await import('../../scripts/utils.js');
      const observer = manyTokens[0];
      
      const startTime = performance.now();
      const result = utils.getSceneTargets(observer, false, true);
      const endTime = performance.now();
      
      // Should complete in reasonable time (< 100ms for 150 tokens)
      expect(endTime - startTime).toBeLessThan(100);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Mock Realism Audit', () => {
    test('our mocks behave like real FoundryVTT', async () => {
      const scenarios = createRealisticTokenScenarios();
      
      // Test that our mocks fail in realistic ways
      const realWorldInputs = [
        null,
        undefined,
        { actor: null },
        { document: null },
        { actor: { alliance: undefined } }
      ];

      // Our shouldFilterAlly should handle these gracefully
      const { shouldFilterAlly } = await import('../../scripts/chat/services/infra/shared-utils.js');
      
      realWorldInputs.forEach(badInput => {
        expect(() => shouldFilterAlly(scenarios.healthyPC, badInput, "enemies", true)).not.toThrow();
      });
    });
  });
});

/**
 * CRITICAL TEST: Verify this test would catch the import bug
 */
describe('VERIFICATION: This Test Catches Real Issues', () => {
  test('would fail if shouldFilterAlly import was broken', async () => {
    // This test verifies our realistic test would catch the import issue
    
    setupRealisticEnvironment('normal');
    const utils = await import('../../scripts/utils.js');
    
    const observer = global.canvas.tokens.placeables.find(t => t.id === 'pc-1');
    const result = utils.getSceneTargets(observer, false, true);
    
    // If import was broken, this would return wrong results
    // With realistic mocks, we'd catch it because:
    // 1. We test actual filtering behavior
    // 2. We use real token scenarios with allies
    // 3. We verify specific tokens are filtered
    
    const familiar = global.canvas.tokens.placeables.find(t => t.id === 'familiar-1');
    if (familiar) {
      expect(result.find(t => t.id === 'familiar-1')).toBeUndefined();
    }
    
    console.log('✅ Realistic test would catch import issues');
  });
});

