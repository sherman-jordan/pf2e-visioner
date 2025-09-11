/**
 * Integration tests for Enhanced Sneak Error Handling and Fallback Systems
 * Tests comprehensive error handling, graceful degradation, and recovery mechanisms
 * for the enhanced sneak AVS integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import errorHandlingService, { 
  ERROR_SEVERITY, 
  SYSTEM_TYPES, 
  FALLBACK_STRATEGIES 
} from '../../scripts/chat/services/infra/error-handling-service.js';
import dualSystemIntegration from '../../scripts/chat/services/position/DualSystemIntegration.js';
import sneakPositionTracker from '../../scripts/chat/services/position/SneakPositionTracker.js';

// Mock FoundryVTT globals and modules
global.game = {
  settings: {
    get: vi.fn().mockReturnValue(true)
  },
  modules: {
    get: vi.fn().mockReturnValue({ version: '1.0.0' })
  },
  version: '13.0.0'
};

global.canvas = {
  tokens: {
    placeables: []
  },
  walls: {
    checkCollision: vi.fn().mockReturnValue(false)
  },
  lighting: {
    getIllumination: vi.fn().mockReturnValue(0.5)
  },
  grid: {
    measureDistances: vi.fn().mockReturnValue([5])
  }
};

global.ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
};

global.Ray = class MockRay {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
};

global.Dialog = class MockDialog {};

// Mock token objects
const createMockToken = (id, x = 0, y = 0) => ({
  document: { id },
  center: { x, y },
  x, y
});

describe('Enhanced Sneak Error Handling Integration', () => {
  let mockObserver, mockTarget, mockTargets;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock tokens
    mockObserver = createMockToken('observer1', 0, 0);
    mockTarget = createMockToken('target1', 10, 10);
    mockTargets = [mockTarget, createMockToken('target2', 20, 20)];
    
    // Reset error handling service state
    errorHandlingService._errorHistory.clear();
    errorHandlingService._systemStatus.clear();
    errorHandlingService._recoveryAttempts.clear();
    errorHandlingService._notificationCount = 0;
    
    // Setup canvas tokens
    global.canvas.tokens.placeables = [mockObserver, ...mockTargets];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AVS System Failure Handling', () => {
    it('should handle AVS system unavailability with graceful degradation', async () => {
      // Mock AVS system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAVSSystemAvailable').mockReturnValue(false);
      
      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.data).toBe('observed'); // Should fallback to basic calculation
      expect(result.source).toBe('line-of-sight-fallback');
    });

    it('should use lighting-based fallback when line of sight calculation fails', async () => {
      // Mock AVS system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAVSSystemAvailable').mockReturnValue(false);
      
      // Mock wall collision check to fail
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall collision check failed');
      });
      
      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.source).toBe('lighting-fallback');
    });

    it('should apply conservative fallback when all AVS fallbacks fail', async () => {
      // Mock AVS system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAVSSystemAvailable').mockReturnValue(false);
      
      // Mock all fallback mechanisms to fail
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall collision failed');
      });
      global.canvas.lighting.getIllumination.mockImplementation(() => {
        throw new Error('Lighting calculation failed');
      });
      
      const result = await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.data).toBe('observed');
      expect(result.source).toBe('conservative-fallback');
    });

    it('should notify user of AVS system failure and fallback', async () => {
      // Configure notifications to be shown
      errorHandlingService.configureNotifications({ showFallbackNotifications: true });
      
      // Mock AVS system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAVSSystemAvailable').mockReturnValue(false);
      
      await dualSystemIntegration.getAVSVisibilityState(mockObserver, mockTarget);
      
      // Should have notified user about fallback
      expect(global.ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('avs system temporarily unavailable')
      );
    });
  });

  describe('Auto-Cover System Failure Handling', () => {
    it('should handle Auto-Cover system unavailability with wall collision fallback', async () => {
      // Mock Auto-Cover system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAutoCoverSystemAvailable').mockReturnValue(false);
      
      // Mock wall collision to indicate cover
      global.canvas.walls.checkCollision.mockReturnValue(true);
      
      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.data.state).toBe('standard');
      expect(result.data.bonus).toBe(2);
      expect(result.source).toBe('wall-collision-fallback');
    });

    it('should use manual cover override when Auto-Cover system fails', async () => {
      // Mock Auto-Cover system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAutoCoverSystemAvailable').mockReturnValue(false);
      
      // Mock manual cover override
      vi.spyOn(dualSystemIntegration, '_getManualCoverState').mockResolvedValue('greater');
      
      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.data.state).toBe('greater');
      expect(result.data.bonus).toBe(4);
      expect(result.source).toBe('manual-override-fallback');
    });

    it('should apply no-cover fallback when all Auto-Cover fallbacks fail', async () => {
      // Mock Auto-Cover system as unavailable
      vi.spyOn(dualSystemIntegration, '_isAutoCoverSystemAvailable').mockReturnValue(false);
      
      // Mock all fallback mechanisms to fail
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall collision failed');
      });
      vi.spyOn(dualSystemIntegration, '_getManualCoverState').mockRejectedValue(
        new Error('Manual cover check failed')
      );
      
      const result = await dualSystemIntegration.getAutoCoverState(mockObserver, mockTarget);
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.data.state).toBe('none');
      expect(result.data.bonus).toBe(0);
      expect(result.source).toBe('no-cover-fallback');
    });
  });

  describe('Position Tracker Error Handling', () => {
    it('should handle position capture failures with error states', async () => {
      // Mock dual system integration to fail
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState').mockRejectedValue(
        new Error('Combined state calculation failed')
      );
      
      const result = await sneakPositionTracker.captureStartPositions(mockObserver, mockTargets);
      
      expect(result.size).toBe(2);
      
      // Check that error states were created
      for (const [targetId, positionState] of result) {
        expect(positionState.systemErrors).toContain(
          expect.stringContaining('Position calculation failed')
        );
        expect(positionState.avsCalculated).toBe(false);
        expect(positionState.coverCalculated).toBe(false);
      }
    });

    it('should create fallback states when error handling provides fallback data', async () => {
      // Mock error handling to provide fallback data
      vi.spyOn(errorHandlingService, 'handleSystemError').mockResolvedValue({
        fallbackApplied: true,
        fallbackData: {
          visibility: 'concealed',
          cover: { state: 'standard', bonus: 2 }
        }
      });
      
      // Mock dual system integration to fail
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState').mockRejectedValue(
        new Error('System failure')
      );
      
      const result = await sneakPositionTracker.captureStartPositions(mockObserver, [mockTarget]);
      
      const positionState = result.get(mockTarget.document.id);
      expect(positionState.avsVisibility).toBe('concealed');
      expect(positionState.coverState).toBe('standard');
      expect(positionState.stealthBonus).toBe(2);
      expect(positionState.systemErrors).toContain('Using fallback data due to system failure');
    });

    it('should provide enhanced diagnostics including error information', async () => {
      // Simulate some errors
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        new Error('Test AVS error'),
        {}
      );
      
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AUTO_COVER,
        new Error('Test Auto-Cover error'),
        {}
      );
      
      const diagnostics = sneakPositionTracker.getEnhancedSystemDiagnostics();
      
      expect(diagnostics.errorHandling).toBeDefined();
      expect(diagnostics.errorHandling.systemStatus).toBeDefined();
      expect(diagnostics.errorHandling.recentErrors).toHaveLength(2);
      expect(diagnostics.errorHandling.recoveryCapabilities).toBeDefined();
    });
  });

  describe('System Recovery Mechanisms', () => {
    it('should attempt AVS system recovery successfully', async () => {
      // Mock successful AVS recovery
      global.game.settings.get.mockReturnValue(true);
      vi.spyOn(dualSystemIntegration, '_isAVSSystemAvailable').mockReturnValue(true);
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(true);
    });

    it('should attempt Auto-Cover system recovery successfully', async () => {
      // Mock successful Auto-Cover recovery
      global.game.settings.get.mockImplementation((moduleId, setting) => {
        if (setting === 'autoCover') return true;
        return true;
      });
      
      // Mock Auto-Cover system import
      vi.doMock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: {
          isEnabled: () => true,
          detectCoverBetweenTokens: vi.fn().mockResolvedValue('standard')
        }
      }));
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AUTO_COVER);
      
      expect(result).toBe(true);
    });

    it('should handle recovery failures gracefully', async () => {
      // Mock recovery to fail
      global.game.settings.get.mockImplementation(() => {
        throw new Error('Settings access failed');
      });
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(false);
    });

    it('should limit recovery attempts to prevent infinite loops', async () => {
      // Simulate multiple failed recovery attempts
      for (let i = 0; i < 5; i++) {
        await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.AVS,
          new Error('Repeated failure'),
          {}
        );
      }
      
      const status = errorHandlingService.getSystemStatus();
      expect(status[SYSTEM_TYPES.AVS].recoveryAttempts).toBeLessThanOrEqual(3);
    });

    it('should notify user of successful recovery', async () => {
      // Configure recovery notifications
      errorHandlingService.configureNotifications({ showRecoveryNotifications: true });
      
      // Mock successful recovery
      vi.spyOn(errorHandlingService, '_recoverAVSSystem').mockResolvedValue(true);
      
      await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(global.ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('avs system has been recovered')
      );
    });
  });

  describe('User Notification System', () => {
    it('should respect notification settings', async () => {
      // Disable fallback notifications
      errorHandlingService.configureNotifications({ showFallbackNotifications: false });
      
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        new Error('Test error'),
        {}
      );
      
      expect(global.ui.notifications.info).not.toHaveBeenCalled();
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });

    it('should limit notifications per session', async () => {
      // Set low notification limit
      errorHandlingService.configureNotifications({ 
        showFallbackNotifications: true,
        maxNotificationsPerSession: 2
      });
      
      // Generate multiple errors
      for (let i = 0; i < 5; i++) {
        await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.AVS,
          new Error(`Error ${i}`),
          {}
        );
      }
      
      // Should only have shown 2 notifications
      expect(global.ui.notifications.info).toHaveBeenCalledTimes(2);
    });

    it('should show appropriate notification types based on severity', async () => {
      errorHandlingService.configureNotifications({ showFallbackNotifications: true });
      
      // High severity error
      await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS,
        new Error('System unavailable'),
        {}
      );
      
      // Should show error notification for failed fallback or info for successful fallback
      expect(
        global.ui.notifications.info.mock.calls.length + 
        global.ui.notifications.error.mock.calls.length
      ).toBeGreaterThan(0);
    });
  });

  describe('Error History and Diagnostics', () => {
    it('should track error history correctly', async () => {
      const error1 = new Error('First error');
      const error2 = new Error('Second error');
      
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error1, {});
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AUTO_COVER, error2, {});
      
      const history = errorHandlingService.getErrorHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Second error'); // Most recent first
      expect(history[1].message).toBe('First error');
    });

    it('should filter error history by system type', async () => {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, new Error('AVS error'), {});
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AUTO_COVER, new Error('Cover error'), {});
      
      const avsHistory = errorHandlingService.getErrorHistory(SYSTEM_TYPES.AVS);
      const coverHistory = errorHandlingService.getErrorHistory(SYSTEM_TYPES.AUTO_COVER);
      
      expect(avsHistory).toHaveLength(1);
      expect(coverHistory).toHaveLength(1);
      expect(avsHistory[0].systemType).toBe(SYSTEM_TYPES.AVS);
      expect(coverHistory[0].systemType).toBe(SYSTEM_TYPES.AUTO_COVER);
    });

    it('should limit error history size to prevent memory issues', async () => {
      // Generate many errors
      for (let i = 0; i < 150; i++) {
        await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.AVS,
          new Error(`Error ${i}`),
          {}
        );
      }
      
      const history = errorHandlingService.getErrorHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Batch Processing Error Handling', () => {
    it('should handle batch processing failures gracefully', async () => {
      // Mock some targets to fail
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState')
        .mockResolvedValueOnce({
          avsResult: { success: true, data: 'observed' },
          coverResult: { success: true, data: { state: 'none', bonus: 0 } },
          effectiveVisibility: 'observed',
          stealthBonus: 0,
          warnings: [],
          systemsAvailable: true
        })
        .mockRejectedValueOnce(new Error('Batch processing failed'));
      
      const result = await dualSystemIntegration.getBatchCombinedStates(mockObserver, mockTargets);
      
      expect(result.size).toBe(2);
      
      // First target should succeed
      const firstResult = result.get(mockTargets[0].document.id);
      expect(firstResult.systemsAvailable).toBe(true);
      
      // Second target should have error state
      const secondResult = result.get(mockTargets[1].document.id);
      expect(secondResult.systemsAvailable).toBe(false);
      expect(secondResult.warnings).toContain(expect.stringContaining('System error'));
    });

    it('should process batches efficiently even with some failures', async () => {
      const largeTargetList = Array.from({ length: 25 }, (_, i) => 
        createMockToken(`target${i}`, i * 10, i * 10)
      );
      
      // Mock some failures in the batch
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState')
        .mockImplementation(async (observer, target) => {
          if (target.document.id.includes('5') || target.document.id.includes('15')) {
            throw new Error('Simulated failure');
          }
          return {
            avsResult: { success: true, data: 'observed' },
            coverResult: { success: true, data: { state: 'none', bonus: 0 } },
            effectiveVisibility: 'observed',
            stealthBonus: 0,
            warnings: [],
            systemsAvailable: true
          };
        });
      
      const result = await dualSystemIntegration.getBatchCombinedStates(
        mockObserver, 
        largeTargetList,
        { batchSize: 5 }
      );
      
      expect(result.size).toBe(25);
      
      // Check that failed targets have error states
      const failedTarget1 = result.get('target5');
      const failedTarget2 = result.get('target15');
      
      expect(failedTarget1.systemsAvailable).toBe(false);
      expect(failedTarget2.systemsAvailable).toBe(false);
    });
  });

  describe('Integration with Existing Systems', () => {
    it('should maintain compatibility with existing sneak action workflow', async () => {
      // Mock successful system operations
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState').mockResolvedValue({
        avsResult: { success: true, data: 'concealed' },
        coverResult: { success: true, data: { state: 'standard', bonus: 2 } },
        effectiveVisibility: 'concealed',
        stealthBonus: 2,
        warnings: [],
        systemsAvailable: true
      });
      
      const positions = await sneakPositionTracker.captureStartPositions(mockObserver, mockTargets);
      
      expect(positions.size).toBe(2);
      
      for (const [targetId, positionState] of positions) {
        expect(positionState.avsVisibility).toBe('concealed');
        expect(positionState.coverState).toBe('standard');
        expect(positionState.stealthBonus).toBe(2);
        expect(positionState.systemErrors).toHaveLength(0);
      }
    });

    it('should provide system recovery capabilities to position tracker', async () => {
      const recoveryResults = await sneakPositionTracker.attemptSystemRecovery();
      
      expect(recoveryResults).toHaveProperty(SYSTEM_TYPES.AVS);
      expect(recoveryResults).toHaveProperty(SYSTEM_TYPES.AUTO_COVER);
      expect(recoveryResults).toHaveProperty(SYSTEM_TYPES.POSITION_TRACKER);
    });

    it('should handle mixed system availability scenarios', async () => {
      // Mock AVS available but Auto-Cover unavailable
      vi.spyOn(dualSystemIntegration, 'getCombinedSystemState').mockResolvedValue({
        avsResult: { success: true, data: 'concealed' },
        coverResult: { 
          success: true, 
          data: { state: 'none', bonus: 0 }, 
          fallbackUsed: true,
          source: 'fallback'
        },
        effectiveVisibility: 'concealed',
        stealthBonus: 0,
        warnings: ['Auto-Cover system error: System unavailable'],
        systemsAvailable: false
      });
      
      const positions = await sneakPositionTracker.captureStartPositions(mockObserver, [mockTarget]);
      const positionState = positions.get(mockTarget.document.id);
      
      expect(positionState.avsVisibility).toBe('concealed');
      expect(positionState.avsCalculated).toBe(true);
      expect(positionState.coverState).toBe('none');
      expect(positionState.autoCoverEnabled).toBe(false);
      expect(positionState.systemErrors).toContain(
        expect.stringContaining('Auto-Cover system error')
      );
    });
  });
});