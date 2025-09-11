/**
 * Unit tests for Error Handling Service
 * Tests individual error handling functions, fallback strategies, and recovery mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import errorHandlingService, { 
  ERROR_SEVERITY, 
  SYSTEM_TYPES, 
  FALLBACK_STRATEGIES 
} from '../../scripts/chat/services/infra/error-handling-service.js';

// Mock FoundryVTT globals
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

// Mock console methods
global.console = {
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn()
};

describe('Error Handling Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset service state
    errorHandlingService._errorHistory.clear();
    errorHandlingService._systemStatus.clear();
    errorHandlingService._recoveryAttempts.clear();
    errorHandlingService._notificationCount = 0;
    
    // Reset notification settings
    errorHandlingService.configureNotifications({
      showFallbackNotifications: true,
      showRecoveryNotifications: true,
      maxNotificationsPerSession: 5
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Severity Determination', () => {
    it('should classify critical errors correctly', async () => {
      const error = new Error('core functionality broken');
      const result = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.SNEAK_ACTION, 
        error, 
        {}
      );
      
      expect(result.severity).toBe(ERROR_SEVERITY.CRITICAL);
    });

    it('should classify high severity errors correctly', async () => {
      const error = new Error('System unavailable');
      const result = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AVS, 
        error, 
        {}
      );
      
      expect(result.severity).toBe(ERROR_SEVERITY.HIGH);
    });

    it('should classify medium severity errors correctly', async () => {
      const error = new Error('calculation failed');
      const result = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.AUTO_COVER, 
        error, 
        {}
      );
      
      expect(result.severity).toBe(ERROR_SEVERITY.MEDIUM);
    });

    it('should default to low severity for unknown errors', async () => {
      const error = new Error('unknown issue');
      const result = await errorHandlingService.handleSystemError(
        SYSTEM_TYPES.DIALOG, 
        error, 
        {}
      );
      
      expect(result.severity).toBe(ERROR_SEVERITY.LOW);
    });
  });

  describe('AVS System Fallback Handling', () => {
    const mockObserver = { center: { x: 0, y: 0 } };
    const mockTarget = { center: { x: 10, y: 10 } };

    it('should use line of sight fallback when available', async () => {
      global.canvas.walls.checkCollision.mockReturnValue(false);
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('observed');
      expect(result.strategy).toBe(FALLBACK_STRATEGIES.BASIC_CALCULATION);
      expect(result.source).toBe('line-of-sight-fallback');
    });

    it('should detect concealment with line of sight fallback', async () => {
      global.canvas.walls.checkCollision.mockReturnValue(true);
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('concealed');
      expect(result.source).toBe('line-of-sight-fallback');
    });

    it('should use lighting fallback when line of sight fails', async () => {
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall check failed');
      });
      global.canvas.lighting.getIllumination.mockReturnValue(0.8);
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('observed');
      expect(result.source).toBe('lighting-fallback');
    });

    it('should detect concealment in darkness with lighting fallback', async () => {
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall check failed');
      });
      global.canvas.lighting.getIllumination.mockReturnValue(0);
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('concealed');
      expect(result.source).toBe('lighting-fallback');
    });

    it('should use conservative fallback when all mechanisms fail', async () => {
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall check failed');
      });
      global.canvas.lighting.getIllumination.mockImplementation(() => {
        throw new Error('Lighting check failed');
      });
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('observed');
      expect(result.source).toBe('conservative-fallback');
      expect(result.canRecover).toBe(true);
    });

    it('should handle complete fallback failure', async () => {
      // Mock all canvas operations to be undefined
      global.canvas = undefined;
      
      const result = await errorHandlingService.handleAVSSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('observed');
      expect(result.source).toBe('conservative-fallback');
    });
  });

  describe('Auto-Cover System Fallback Handling', () => {
    const mockObserver = { center: { x: 0, y: 0 } };
    const mockTarget = { center: { x: 10, y: 10 } };

    it('should use wall collision fallback when available', async () => {
      global.canvas.walls.checkCollision.mockReturnValue(true);
      
      const result = await errorHandlingService.handleAutoCoverSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data.state).toBe('standard');
      expect(result.data.bonus).toBe(2);
      expect(result.strategy).toBe(FALLBACK_STRATEGIES.BASIC_CALCULATION);
      expect(result.source).toBe('wall-collision-fallback');
    });

    it('should detect no cover with wall collision fallback', async () => {
      global.canvas.walls.checkCollision.mockReturnValue(false);
      
      const result = await errorHandlingService.handleAutoCoverSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data.state).toBe('none');
      expect(result.data.bonus).toBe(0);
      expect(result.source).toBe('wall-collision-fallback');
    });

    it('should use manual override fallback when available', async () => {
      // Mock wall collision to fail
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall collision failed');
      });
      
      // Mock manual cover override
      vi.spyOn(errorHandlingService, '_getManualCoverOverride').mockResolvedValue('greater');
      
      const result = await errorHandlingService.handleAutoCoverSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data.state).toBe('greater');
      expect(result.data.bonus).toBe(4);
      expect(result.strategy).toBe(FALLBACK_STRATEGIES.MANUAL_OVERRIDE);
      expect(result.source).toBe('manual-override-fallback');
    });

    it('should use no-cover fallback when all mechanisms fail', async () => {
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('Wall collision failed');
      });
      vi.spyOn(errorHandlingService, '_getManualCoverOverride').mockResolvedValue('none');
      
      const result = await errorHandlingService.handleAutoCoverSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data.state).toBe('none');
      expect(result.data.bonus).toBe(0);
      expect(result.source).toBe('no-cover-fallback');
    });

    it('should handle complete fallback failure', async () => {
      global.canvas = undefined;
      vi.spyOn(errorHandlingService, '_getManualCoverOverride').mockRejectedValue(
        new Error('Manual override failed')
      );
      
      const result = await errorHandlingService.handleAutoCoverSystemFailure({
        observer: mockObserver,
        target: mockTarget
      });
      
      expect(result.success).toBe(true);
      expect(result.data.state).toBe('none');
      expect(result.data.bonus).toBe(0);
      expect(result.source).toBe('no-cover-fallback');
    });
  });

  describe('System Recovery Mechanisms', () => {
    it('should recover AVS system successfully', async () => {
      global.game.settings.get.mockReturnValue(true);
      global.canvas = {
        tokens: {
          placeables: [
            { center: { x: 0, y: 0 } },
            { center: { x: 10, y: 10 } }
          ]
        }
      };
      
      // Mock successful import
      vi.doMock('../../../scripts/utils.js', () => ({
        getVisibilityBetween: vi.fn().mockResolvedValue('observed')
      }));
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(true);
    });

    it('should fail AVS recovery when settings are disabled', async () => {
      global.game.settings.get.mockReturnValue(false);
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(false);
    });

    it('should recover Auto-Cover system successfully', async () => {
      global.game.settings.get.mockImplementation((moduleId, setting) => {
        if (setting === 'autoCover') return true;
        return true;
      });
      
      global.canvas = {
        tokens: {
          placeables: [
            { center: { x: 0, y: 0 } },
            { center: { x: 10, y: 10 } }
          ]
        }
      };
      
      // Mock successful Auto-Cover system
      vi.doMock('../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
        default: {
          isEnabled: () => true,
          detectCoverBetweenTokens: vi.fn().mockResolvedValue('standard')
        }
      }));
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AUTO_COVER);
      
      expect(result).toBe(true);
    });

    it('should handle recovery exceptions gracefully', async () => {
      global.game.settings.get.mockImplementation(() => {
        throw new Error('Settings access failed');
      });
      
      const result = await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(false);
    });

    it('should limit recovery attempts', async () => {
      // Simulate multiple recovery attempts
      errorHandlingService._recoveryAttempts.set(SYSTEM_TYPES.AVS, 3);
      
      // This should not trigger a recovery attempt
      errorHandlingService._scheduleRecoveryAttempt(SYSTEM_TYPES.AVS, new Error('Test'), {});
      
      // Wait a bit to ensure no recovery was scheduled
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(global.console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Maximum recovery attempts reached')
      );
    });
  });

  describe('User Notification System', () => {
    it('should show info notification for successful fallback', async () => {
      const error = new Error('System unavailable');
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {});
      
      expect(global.ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('avs system temporarily unavailable')
      );
    });

    it('should respect notification settings', async () => {
      errorHandlingService.configureNotifications({ showFallbackNotifications: false });
      
      const error = new Error('System unavailable');
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error, {});
      
      expect(global.ui.notifications.info).not.toHaveBeenCalled();
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(global.ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should limit notifications per session', async () => {
      errorHandlingService.configureNotifications({ maxNotificationsPerSession: 2 });
      
      // Generate multiple errors
      for (let i = 0; i < 5; i++) {
        await errorHandlingService.handleSystemError(
          SYSTEM_TYPES.AVS, 
          new Error(`Error ${i}`), 
          {}
        );
      }
      
      expect(global.ui.notifications.info).toHaveBeenCalledTimes(2);
    });

    it('should not notify for low severity errors', async () => {
      const error = new Error('minor issue');
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.DIALOG, error, {});
      
      expect(global.ui.notifications.info).not.toHaveBeenCalled();
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(global.ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should show recovery notifications when enabled', async () => {
      errorHandlingService.configureNotifications({ showRecoveryNotifications: true });
      
      // Mock successful recovery
      vi.spyOn(errorHandlingService, '_recoverAVSSystem').mockResolvedValue(true);
      
      await errorHandlingService.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(global.ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining('avs system has been recovered')
      );
    });
  });

  describe('Error History and Tracking', () => {
    it('should track error history correctly', async () => {
      const error1 = new Error('First error');
      const error2 = new Error('Second error');
      
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error1, { context: 'test1' });
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AUTO_COVER, error2, { context: 'test2' });
      
      const history = errorHandlingService.getErrorHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Second error'); // Most recent first
      expect(history[1].message).toBe('First error');
      expect(history[0].systemType).toBe(SYSTEM_TYPES.AUTO_COVER);
      expect(history[1].systemType).toBe(SYSTEM_TYPES.AVS);
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

    it('should limit error history size', async () => {
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

    it('should provide system status information', async () => {
      await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, new Error('Test error'), {});
      
      const status = errorHandlingService.getSystemStatus();
      
      expect(status).toHaveProperty(SYSTEM_TYPES.AVS);
      expect(status[SYSTEM_TYPES.AVS]).toHaveProperty('available');
      expect(status[SYSTEM_TYPES.AVS]).toHaveProperty('lastError');
      expect(status[SYSTEM_TYPES.AVS]).toHaveProperty('recoveryAttempts');
    });
  });

  describe('Utility Functions', () => {
    it('should generate unique error IDs', async () => {
      const error1 = new Error('Same message');
      const error2 = new Error('Same message');
      
      const result1 = await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error1, {});
      const result2 = await errorHandlingService.handleSystemError(SYSTEM_TYPES.AVS, error2, {});
      
      expect(result1.errorId).not.toBe(result2.errorId);
    });

    it('should calculate basic cover bonus correctly', () => {
      expect(errorHandlingService._calculateBasicCoverBonus('none')).toBe(0);
      expect(errorHandlingService._calculateBasicCoverBonus('lesser')).toBe(1);
      expect(errorHandlingService._calculateBasicCoverBonus('standard')).toBe(2);
      expect(errorHandlingService._calculateBasicCoverBonus('greater')).toBe(4);
      expect(errorHandlingService._calculateBasicCoverBonus('unknown')).toBe(0);
    });

    it('should hash strings consistently', () => {
      const hash1 = errorHandlingService._hashString('test string');
      const hash2 = errorHandlingService._hashString('test string');
      const hash3 = errorHandlingService._hashString('different string');
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('Configuration Management', () => {
    it('should update notification settings correctly', () => {
      const newSettings = {
        showFallbackNotifications: false,
        showRecoveryNotifications: false,
        maxNotificationsPerSession: 10
      };
      
      errorHandlingService.configureNotifications(newSettings);
      
      expect(errorHandlingService._userNotificationSettings.showFallbackNotifications).toBe(false);
      expect(errorHandlingService._userNotificationSettings.showRecoveryNotifications).toBe(false);
      expect(errorHandlingService._userNotificationSettings.maxNotificationsPerSession).toBe(10);
    });

    it('should merge configuration settings', () => {
      errorHandlingService.configureNotifications({ showFallbackNotifications: false });
      errorHandlingService.configureNotifications({ maxNotificationsPerSession: 10 });
      
      expect(errorHandlingService._userNotificationSettings.showFallbackNotifications).toBe(false);
      expect(errorHandlingService._userNotificationSettings.maxNotificationsPerSession).toBe(10);
      expect(errorHandlingService._userNotificationSettings.showRecoveryNotifications).toBe(true); // Should remain unchanged
    });
  });
});