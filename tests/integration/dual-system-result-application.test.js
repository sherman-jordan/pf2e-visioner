/**
 * Integration tests for dual system result application
 * Tests the coordination between AVS and Auto-Cover systems during result application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dualSystemApplication from '../../scripts/chat/services/dual-system-result-application.js';
import { VISIBILITY_STATES, COVER_STATES } from '../../scripts/constants.js';

// Mock dependencies
vi.mock('../../scripts/chat/services/infra/shared-utils.js', () => ({
  applyVisibilityChanges: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {
    isEnabled: vi.fn().mockReturnValue(true)
  }
}));

vi.mock('../../scripts/cover/auto-cover/CoverStateManager.js', () => ({
  default: {
    getCoverBetween: vi.fn().mockReturnValue('none'),
    setCoverBetween: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../scripts/services/enhanced-avs-override-service.js', () => ({
  default: {
    applyPositionBasedOverride: vi.fn().mockResolvedValue(true),
    getPositionAwareOverride: vi.fn().mockReturnValue(null),
    removePositionAwareOverride: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../scripts/chat/services/infra/error-handling-service.js', () => ({
  default: {
    handleSystemError: vi.fn().mockResolvedValue({ fallbackApplied: false }),
    attemptSystemRecovery: vi.fn().mockResolvedValue(true),
    getSystemStatus: vi.fn().mockReturnValue({})
  },
  SYSTEM_TYPES: {
    AVS: 'avs',
    AUTO_COVER: 'auto-cover',
    DUAL_SYSTEM: 'dual-system'
  }
}));

vi.mock('../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../scripts/utils.js', () => ({
  getVisibilityBetween: vi.fn().mockReturnValue('observed')
}));

// Mock canvas and tokens
global.canvas = {
  tokens: {
    get: vi.fn(),
    placeables: []
  }
};

global.Hooks = {
  callAll: vi.fn()
};

describe('Dual System Result Application', () => {
  let mockObserverToken, mockTargetToken, mockSneakResults;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock tokens with v13-compatible structure
    mockObserverToken = {
      document: {
        id: 'observer-token-id',
        getFlag: vi.fn().mockReturnValue({}),
        setFlag: vi.fn().mockResolvedValue(undefined),
        unsetFlag: vi.fn().mockResolvedValue(undefined)
      },
      name: 'Observer Token',
      actor: {
        document: { id: 'observer-actor-id' }
      }
    };

    mockTargetToken = {
      document: {
        id: 'target-token-id',
        getFlag: vi.fn().mockReturnValue({}),
        setFlag: vi.fn().mockResolvedValue(undefined),
        unsetFlag: vi.fn().mockResolvedValue(undefined)
      },
      name: 'Target Token',
      actor: {
        document: { id: 'target-actor-id' }
      }
    };

    // Create mock sneak results
    mockSneakResults = [
      {
        token: mockObserverToken,
        actor: mockTargetToken,
        newVisibility: 'hidden',
        oldVisibility: 'observed',
        positionTransition: {
          targetId: 'target-token-id',
          startPosition: {
            avsVisibility: 'observed',
            coverState: 'none',
            stealthBonus: 0,
            avsEnabled: true,
            autoCoverEnabled: true,
            systemErrors: []
          },
          endPosition: {
            avsVisibility: 'hidden',
            coverState: 'standard',
            stealthBonus: 2,
            avsEnabled: true,
            autoCoverEnabled: true,
            systemErrors: []
          },
          hasChanged: true,
          avsVisibilityChanged: true,
          coverStateChanged: true,
          transitionType: 'improved'
        },
        autoCover: {
          state: 'standard',
          bonus: 2,
          isOverride: false,
          source: 'automatic'
        }
      }
    ];

    // Mock canvas.tokens.get to return our mock tokens
    global.canvas.tokens.get.mockImplementation((id) => {
      if (id === 'observer-token-id') return mockObserverToken;
      if (id === 'target-token-id') return mockTargetToken;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applySneakResults', () => {
    it('should successfully apply sneak results to both AVS and Auto-Cover systems', async () => {
      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.appliedChanges.avsChanges).toHaveLength(1);
      expect(result.appliedChanges.coverChanges).toHaveLength(1);
      expect(result.transactionId).toBeDefined();
    });

    it('should handle validation errors for invalid sneak results', async () => {
      const invalidResults = [
        {
          token: null, // Invalid token
          actor: mockTargetToken,
          newVisibility: 'hidden'
        }
      ];

      const result = await dualSystemApplication.applySneakResults(invalidResults);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Result 0: Missing or invalid token');
    });

    it('should handle missing visibility states', async () => {
      const invalidResults = [
        {
          token: mockObserverToken,
          actor: mockTargetToken,
          newVisibility: null // Missing visibility
        }
      ];

      const result = await dualSystemApplication.applySneakResults(invalidResults);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Result 0: Missing new visibility state');
    });

    it('should handle invalid visibility states', async () => {
      const invalidResults = [
        {
          token: mockObserverToken,
          actor: mockTargetToken,
          newVisibility: 'invalid-state' // Invalid visibility
        }
      ];

      const result = await dualSystemApplication.applySneakResults(invalidResults);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Result 0: Invalid visibility state \'invalid-state\'');
    });

    it('should apply position-aware overrides when present', async () => {
      const resultsWithOverride = [{
        ...mockSneakResults[0],
        overrideState: 'concealed'
      }];

      const result = await dualSystemApplication.applySneakResults(resultsWithOverride);

      expect(result.success).toBe(true);
      expect(result.appliedChanges.overrideChanges).toHaveLength(1);
    });

    it('should handle Auto-Cover system being disabled', async () => {
      const { default: autoCoverSystem } = await import('../../scripts/cover/auto-cover/AutoCoverSystem.js');
      autoCoverSystem.isEnabled.mockReturnValue(false);

      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Auto-Cover system is disabled - skipping cover changes');
    });

    it('should rollback changes on critical errors', async () => {
      const { applyVisibilityChanges } = await import('../../scripts/chat/services/infra/shared-utils.js');
      applyVisibilityChanges.mockRejectedValue(new Error('AVS application failed'));

      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Transaction rolled back due to critical errors');
    });

    it('should handle system consistency validation', async () => {
      // Mock inconsistent system state
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('observed'); // Different from expected 'hidden'

      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      // Should still succeed but may have warnings about inconsistencies
      expect(result.success).toBe(true);
    });

    it('should trigger synchronization hooks on successful application', async () => {
      await dualSystemApplication.applySneakResults(mockSneakResults);

      expect(global.Hooks.callAll).toHaveBeenCalledWith('pf2e-visioner.dualSystemUpdate', expect.any(Object));
      expect(global.Hooks.callAll).toHaveBeenCalledWith('pf2e-visioner.avsUpdated', expect.any(Array));
      expect(global.Hooks.callAll).toHaveBeenCalledWith('pf2e-visioner.coverUpdated', expect.any(Array));
    });
  });

  describe('rollbackTransaction', () => {
    it('should successfully rollback a completed transaction', async () => {
      // First apply changes
      const applyResult = await dualSystemApplication.applySneakResults(mockSneakResults);
      expect(applyResult.success).toBe(true);

      // Then rollback
      const rollbackResult = await dualSystemApplication.rollbackTransaction(applyResult.transactionId);
      expect(rollbackResult).toBe(true);
    });

    it('should handle rollback of non-existent transaction', async () => {
      const rollbackResult = await dualSystemApplication.rollbackTransaction('non-existent-tx');
      expect(rollbackResult).toBe(false);
    });

    it('should handle rollback errors gracefully', async () => {
      // Apply changes first
      const applyResult = await dualSystemApplication.applySneakResults(mockSneakResults);
      
      // Mock rollback failure
      const { applyVisibilityChanges } = await import('../../scripts/chat/services/infra/shared-utils.js');
      applyVisibilityChanges.mockRejectedValue(new Error('Rollback failed'));

      const rollbackResult = await dualSystemApplication.rollbackTransaction(applyResult.transactionId);
      expect(rollbackResult).toBe(false);
    });
  });

  describe('validateSystemConsistency', () => {
    it('should validate consistent system states', async () => {
      const result = await dualSystemApplication.validateSystemConsistency(mockSneakResults);

      expect(result.isConsistent).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect AVS inconsistencies', async () => {
      // Mock inconsistent AVS state
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('observed'); // Different from expected

      const result = await dualSystemApplication.validateSystemConsistency(mockSneakResults);

      expect(result.systemStatus.avs).toBeDefined();
    });

    it('should detect cover system inconsistencies', async () => {
      const { default: coverStateManager } = await import('../../scripts/cover/auto-cover/CoverStateManager.js');
      coverStateManager.getCoverBetween.mockReturnValue('lesser'); // Different from expected

      const result = await dualSystemApplication.validateSystemConsistency(mockSneakResults);

      expect(result.systemStatus.cover).toBeDefined();
    });
  });

  describe('getSystemStatus', () => {
    it('should return comprehensive system status', async () => {
      const status = await dualSystemApplication.getSystemStatus();

      expect(status.avs).toBeDefined();
      expect(status.autoCover).toBeDefined();
      expect(status.dualSystem).toBeDefined();
      expect(status.errorHandling).toBeDefined();
    });

    it('should handle system status errors', async () => {
      const { default: autoCoverSystem } = await import('../../scripts/cover/auto-cover/AutoCoverSystem.js');
      autoCoverSystem.isEnabled.mockImplementation(() => {
        throw new Error('System error');
      });

      const status = await dualSystemApplication.getSystemStatus();

      expect(status.autoCover.available).toBe(false);
      expect(status.autoCover.error).toBeDefined();
    });
  });

  describe('attemptSystemRecovery', () => {
    it('should recover both systems successfully', async () => {
      const result = await dualSystemApplication.attemptSystemRecovery('both');
      expect(result).toBe(true);
    });

    it('should recover AVS system only', async () => {
      const result = await dualSystemApplication.attemptSystemRecovery('avs');
      expect(result).toBe(true);
    });

    it('should recover cover system only', async () => {
      const result = await dualSystemApplication.attemptSystemRecovery('cover');
      expect(result).toBe(true);
    });

    it('should handle recovery failures', async () => {
      const errorHandlingService = await import('../../scripts/chat/services/infra/error-handling-service.js');
      errorHandlingService.default.attemptSystemRecovery.mockResolvedValue(false);

      const result = await dualSystemApplication.attemptSystemRecovery('both');
      expect(result).toBe(false);
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle multiple observers with different outcomes', async () => {
      const multiObserverResults = [
        {
          ...mockSneakResults[0],
          token: { ...mockObserverToken, document: { ...mockObserverToken.document, id: 'observer1' } }
        },
        {
          ...mockSneakResults[0],
          token: { ...mockObserverToken, document: { ...mockObserverToken.document, id: 'observer2' } },
          newVisibility: 'concealed'
        }
      ];

      // Mock canvas.tokens.get for additional observers
      global.canvas.tokens.get.mockImplementation((id) => {
        if (id === 'observer1') return multiObserverResults[0].token;
        if (id === 'observer2') return multiObserverResults[1].token;
        if (id === 'target-token-id') return mockTargetToken;
        return null;
      });

      const result = await dualSystemApplication.applySneakResults(multiObserverResults);

      expect(result.success).toBe(true);
      expect(result.appliedChanges.avsChanges).toHaveLength(2);
    });

    it('should handle mixed system availability scenarios', async () => {
      const mixedResults = [
        {
          ...mockSneakResults[0],
          positionTransition: {
            ...mockSneakResults[0].positionTransition,
            endPosition: {
              ...mockSneakResults[0].positionTransition.endPosition,
              avsEnabled: true,
              autoCoverEnabled: false // Cover system disabled for this result
            }
          }
        }
      ];

      const result = await dualSystemApplication.applySneakResults(mixedResults);

      expect(result.success).toBe(true);
      // Should still apply AVS changes even if cover is unavailable
      expect(result.appliedChanges.avsChanges).toHaveLength(1);
    });

    it('should handle position transitions with system conflicts', async () => {
      const conflictResults = [
        {
          ...mockSneakResults[0],
          positionTransition: {
            ...mockSneakResults[0].positionTransition,
            transitionType: 'worsened', // Position got worse
            endPosition: {
              ...mockSneakResults[0].positionTransition.endPosition,
              avsVisibility: 'observed' // But trying to apply 'hidden'
            }
          },
          newVisibility: 'hidden' // Conflicts with position data
        }
      ];

      const result = await dualSystemApplication.applySneakResults(conflictResults);

      // Should still succeed but may have warnings about conflicts
      expect(result.success).toBe(true);
    });

    it('should handle batch processing with partial failures', async () => {
      const batchResults = [
        mockSneakResults[0], // Valid result
        {
          token: null, // Invalid result
          actor: mockTargetToken,
          newVisibility: 'hidden'
        }
      ];

      const result = await dualSystemApplication.applySneakResults(batchResults);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Result 1: Missing or invalid token');
    });

    it('should maintain transaction integrity across system boundaries', async () => {
      // Apply changes
      const applyResult = await dualSystemApplication.applySneakResults(mockSneakResults);
      expect(applyResult.success).toBe(true);

      // Verify transaction is tracked
      const status = await dualSystemApplication.getSystemStatus();
      expect(status.dualSystem.activeTransactions).toBeGreaterThan(0);

      // Rollback should clean up transaction
      await dualSystemApplication.rollbackTransaction(applyResult.transactionId);
      
      const statusAfterRollback = await dualSystemApplication.getSystemStatus();
      expect(statusAfterRollback.dualSystem.activeTransactions).toBe(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle AVS system failures with fallback', async () => {
      const { applyVisibilityChanges } = await import('../../scripts/chat/services/infra/shared-utils.js');
      applyVisibilityChanges.mockRejectedValueOnce(new Error('AVS failure'));

      const errorHandlingService = await import('../../scripts/chat/services/infra/error-handling-service.js');
      errorHandlingService.default.handleSystemError.mockResolvedValue({ 
        fallbackApplied: true,
        fallbackData: { success: true }
      });

      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      expect(result.warnings).toContain('Fallback application method used');
    });

    it('should handle cover system failures gracefully', async () => {
      const { default: coverStateManager } = await import('../../scripts/cover/auto-cover/CoverStateManager.js');
      coverStateManager.setCoverBetween.mockRejectedValue(new Error('Cover system failure'));

      const result = await dualSystemApplication.applySneakResults(mockSneakResults);

      // Should still succeed with AVS changes, just log cover errors
      expect(result.appliedChanges.avsChanges).toHaveLength(1);
    });

    it('should handle override system failures', async () => {
      const resultsWithOverride = [{
        ...mockSneakResults[0],
        overrideState: 'concealed'
      }];

      const enhancedAVSOverrideService = await import('../../scripts/services/enhanced-avs-override-service.js');
      enhancedAVSOverrideService.default.applyPositionBasedOverride.mockResolvedValue(false);

      const result = await dualSystemApplication.applySneakResults(resultsWithOverride);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Failed to apply position-aware override for Observer Token -> Target Token');
    });
  });
});