/**
 * Integration tests for Enhanced Sneak Action Error Handling
 * Tests error handling integration in the enhanced sneak action workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SneakActionHandler } from '../../scripts/chat/services/actions/sneak-action.js';
import errorHandlingService, { SYSTEM_TYPES } from '../../scripts/chat/services/infra/error-handling-service.js';

// Mock FoundryVTT globals
global.game = {
  settings: {
    get: vi.fn().mockReturnValue(true)
  },
  i18n: {
    localize: vi.fn().mockImplementation((key) => key)
  }
};

global.canvas = {
  tokens: {
    placeables: []
  },
  walls: {
    checkCollision: vi.fn().mockReturnValue(false)
  }
};

global.ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
};

global.Hooks = {
  on: vi.fn(),
  off: vi.fn()
};

global.confirm = vi.fn().mockReturnValue(true);

// Mock console methods
global.console = {
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  debug: vi.fn()
};

// Mock token objects
const createMockToken = (id, actorId = null, x = 0, y = 0) => ({
  document: { id },
  id,
  actor: actorId ? { id: actorId, type: 'character' } : null,
  center: { x, y },
  x, y
});

const createMockActor = (id, type = 'character') => ({
  id,
  type,
  document: { id },
  getActiveTokens: vi.fn().mockReturnValue([])
});

describe('Enhanced Sneak Action Error Handling Integration', () => {
  let sneakHandler;
  let mockActor, mockObserver, mockActionData;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset error handling service
    errorHandlingService._errorHistory.clear();
    errorHandlingService._systemStatus.clear();
    errorHandlingService._recoveryAttempts.clear();
    errorHandlingService._notificationCount = 0;
    
    // Create sneak handler
    sneakHandler = new SneakActionHandler();
    
    // Create mock data
    mockActor = createMockActor('actor1');
    mockObserver = createMockToken('observer1', 'observer-actor', 10, 10);
    
    mockActionData = {
      actor: mockActor,
      actorToken: createMockToken('actor-token', 'actor1', 0, 0),
      roll: { total: 15, dice: [{ total: 12 }] },
      context: {}
    };
    
    // Setup canvas tokens
    global.canvas.tokens.placeables = [mockActionData.actorToken, mockObserver];
    
    // Mock imports
    vi.doMock('../../scripts/chat/services/infra/roll-utils.js', () => ({
      ensureActionRoll: vi.fn()
    }));
    
    vi.doMock('../../scripts/utils.js', () => ({
      getVisibilityBetween: vi.fn().mockReturnValue('observed'),
      getCoverBetween: vi.fn().mockReturnValue('none')
    }));
    
    vi.doMock('../../scripts/chat/services/infra/shared-utils.js', () => ({
      extractPerceptionDC: vi.fn().mockReturnValue(15),
      determineOutcome: vi.fn().mockReturnValue('success'),
      calculateStealthRollTotals: vi.fn().mockReturnValue({
        total: 15,
        originalTotal: 15,
        baseRollTotal: 15
      }),
      shouldFilterAlly: vi.fn().mockReturnValue(false)
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Prerequisites Error Handling', () => {
    it('should handle roll utils import failure gracefully', async () => {
      // Mock import failure
      vi.doMock('../../scripts/chat/services/infra/roll-utils.js', () => {
        throw new Error('Roll utils import failed');
      });
      
      // Should handle error and continue with fallback
      await expect(sneakHandler.ensurePrerequisites(mockActionData)).rejects.toThrow();
      
      // Should have logged error handling
      expect(errorHandlingService.getErrorHistory()).toHaveLength(1);
      expect(errorHandlingService.getErrorHistory()[0].systemType).toBe(SYSTEM_TYPES.SNEAK_ACTION);
    });

    it('should handle position capture failure during prerequisites', async () => {
      // Mock position tracker to fail
      vi.spyOn(sneakHandler.positionTracker, 'captureStartPositions').mockRejectedValue(
        new Error('Position capture failed')
      );
      
      // Mock successful validation to isolate position capture error
      vi.spyOn(sneakHandler, 'validatePrerequisitesWithPosition').mockResolvedValue({
        valid: true,
        canProceed: true,
        errors: [],
        warnings: [],
        recommendations: []
      });
      
      vi.spyOn(sneakHandler, '_handleValidationResults').mockResolvedValue();
      
      // Should handle error but continue
      await expect(sneakHandler.ensurePrerequisites(mockActionData)).resolves.not.toThrow();
      
      // Should have disabled position tracking
      expect(sneakHandler._isTrackingPositions).toBe(false);
    });

    it('should handle validation failure with fallback', async () => {
      // Mock validation to fail
      vi.spyOn(sneakHandler, 'validatePrerequisitesWithPosition').mockRejectedValue(
        new Error('Validation failed')
      );
      
      // Should handle error and provide fallback validation
      await expect(sneakHandler.ensurePrerequisites(mockActionData)).resolves.not.toThrow();
      
      // Should have logged error
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.length).toBeGreaterThan(0);
    });
  });

  describe('Position Tracking Error Handling', () => {
    it('should handle missing sneaking token gracefully', async () => {
      // Remove actor token
      mockActionData.actorToken = null;
      mockActionData.actor.getActiveTokens.mockReturnValue([]);
      global.canvas.tokens.placeables = [mockObserver];
      
      await sneakHandler._captureStartPositions(mockActionData);
      
      // Should have handled error and logged it
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.some(e => e.systemType === SYSTEM_TYPES.POSITION_TRACKER)).toBe(true);
    });

    it('should handle position tracker system failure', async () => {
      // Mock position tracker to fail completely
      vi.spyOn(sneakHandler.positionTracker, 'captureStartPositions').mockRejectedValue(
        new Error('Position tracker system failure')
      );
      
      await sneakHandler._captureStartPositions(mockActionData);
      
      // Should have handled error
      expect(sneakHandler._isTrackingPositions).toBe(false);
      
      // Should have logged error
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.some(e => e.systemType === SYSTEM_TYPES.POSITION_TRACKER)).toBe(true);
    });

    it('should handle end position calculation failure', async () => {
      // Setup successful start position capture
      sneakHandler._isTrackingPositions = true;
      sneakHandler._startPositions = new Map([['observer1', {}]]);
      
      // Mock end position calculation to fail
      vi.spyOn(sneakHandler.positionTracker, 'calculateEndPositions').mockRejectedValue(
        new Error('End position calculation failed')
      );
      
      await sneakHandler._recalculateEndPositions(mockActionData);
      
      // Should have cleared position data
      expect(sneakHandler._endPositions.size).toBe(0);
      expect(sneakHandler._positionTransitions.size).toBe(0);
    });

    it('should handle position transition analysis failure', async () => {
      // Setup position tracking
      sneakHandler._isTrackingPositions = true;
      sneakHandler._startPositions = new Map([['observer1', {}]]);
      
      // Mock successful end position but failed transition analysis
      vi.spyOn(sneakHandler.positionTracker, 'calculateEndPositions').mockResolvedValue(
        new Map([['observer1', {}]])
      );
      vi.spyOn(sneakHandler.positionTracker, 'analyzePositionTransitions').mockImplementation(() => {
        throw new Error('Transition analysis failed');
      });
      
      await sneakHandler._recalculateEndPositions(mockActionData);
      
      // Should have handled error
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.some(e => e.systemType === SYSTEM_TYPES.POSITION_TRACKER)).toBe(true);
    });
  });

  describe('Outcome Analysis Error Handling', () => {
    it('should handle outcome analysis setup failure', async () => {
      // Setup position tracking but make recalculation fail
      sneakHandler._isTrackingPositions = true;
      sneakHandler._endPositions = new Map(); // Empty to trigger recalculation
      
      vi.spyOn(sneakHandler, '_recalculateEndPositions').mockRejectedValue(
        new Error('Recalculation failed')
      );
      
      // Should handle error but continue with analysis
      const result = await sneakHandler.analyzeOutcome(mockActionData, mockObserver);
      
      expect(result).toBeDefined();
      expect(result.token).toBe(mockObserver);
      
      // Should have logged error
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.some(e => e.systemType === SYSTEM_TYPES.SNEAK_ACTION)).toBe(true);
    });

    it('should handle cover calculation failure gracefully', async () => {
      // Mock cover calculation to fail
      vi.doMock('../../scripts/utils.js', () => ({
        getVisibilityBetween: vi.fn().mockReturnValue('observed'),
        getCoverBetween: vi.fn().mockImplementation(() => {
          throw new Error('Cover calculation failed');
        })
      }));
      
      // Should handle error and continue
      const result = await sneakHandler.analyzeOutcome(mockActionData, mockObserver);
      
      expect(result).toBeDefined();
      expect(result.token).toBe(mockObserver);
      // Should not have auto-cover data due to failure
      expect(result.autoCover).toBeUndefined();
    });
  });

  describe('System Recovery Integration', () => {
    it('should attempt system recovery when requested', async () => {
      // Mock recovery to succeed
      vi.spyOn(errorHandlingService, 'attemptSystemRecovery').mockResolvedValue(true);
      
      const result = await sneakHandler.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(true);
      expect(errorHandlingService.attemptSystemRecovery).toHaveBeenCalledWith(SYSTEM_TYPES.AVS);
    });

    it('should attempt recovery for all systems when no specific system provided', async () => {
      // Mock recovery results
      vi.spyOn(errorHandlingService, 'attemptSystemRecovery')
        .mockResolvedValueOnce(true)  // AVS
        .mockResolvedValueOnce(false) // AUTO_COVER
        .mockResolvedValueOnce(true); // POSITION_TRACKER
      
      const result = await sneakHandler.attemptSystemRecovery();
      
      expect(result).toBe(true); // Should return true if any system recovered
      expect(errorHandlingService.attemptSystemRecovery).toHaveBeenCalledTimes(3);
    });

    it('should handle recovery failure gracefully', async () => {
      // Mock recovery to throw error
      vi.spyOn(errorHandlingService, 'attemptSystemRecovery').mockRejectedValue(
        new Error('Recovery failed')
      );
      
      const result = await sneakHandler.attemptSystemRecovery(SYSTEM_TYPES.AVS);
      
      expect(result).toBe(false);
    });
  });

  describe('System Diagnostics', () => {
    it('should provide comprehensive system diagnostics', () => {
      // Setup some position tracking state
      sneakHandler._isTrackingPositions = true;
      sneakHandler._startPositions = new Map([['observer1', {}]]);
      sneakHandler._endPositions = new Map([['observer1', {}]]);
      sneakHandler._positionTransitions = new Map([['observer1', {}]]);
      
      const diagnostics = sneakHandler.getSystemDiagnostics();
      
      expect(diagnostics).toHaveProperty('positionTracking');
      expect(diagnostics).toHaveProperty('errorHandling');
      expect(diagnostics).toHaveProperty('positionTracker');
      
      expect(diagnostics.positionTracking.isActive).toBe(true);
      expect(diagnostics.positionTracking.hasStartPositions).toBe(true);
      expect(diagnostics.positionTracking.hasEndPositions).toBe(true);
      expect(diagnostics.positionTracking.hasTransitions).toBe(true);
    });

    it('should show inactive state when position tracking is disabled', () => {
      const diagnostics = sneakHandler.getSystemDiagnostics();
      
      expect(diagnostics.positionTracking.isActive).toBe(false);
      expect(diagnostics.positionTracking.hasStartPositions).toBe(false);
      expect(diagnostics.positionTracking.hasEndPositions).toBe(false);
      expect(diagnostics.positionTracking.hasTransitions).toBe(false);
    });
  });

  describe('Enhanced Prerequisite Validation', () => {
    it('should validate prerequisites with position context', async () => {
      // Mock successful discovery of subjects
      vi.spyOn(sneakHandler, 'discoverSubjects').mockResolvedValue([mockObserver]);
      
      // Setup position tracking
      sneakHandler._isTrackingPositions = true;
      sneakHandler._startPositions = new Map([
        ['observer1', {
          stealthBonus: 2,
          coverState: 'standard',
          avsVisibility: 'concealed',
          avsEnabled: true,
          autoCoverEnabled: true
        }]
      ]);
      
      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);
      
      expect(result.valid).toBe(true);
      expect(result.canProceed).toBe(true);
      expect(result.observerCount).toBe(1);
      expect(result.positionAnalysis).toBeDefined();
      expect(result.positionAnalysis.overallQuality).toBe('good');
    });

    it('should handle validation with no observers', async () => {
      vi.spyOn(sneakHandler, 'discoverSubjects').mockResolvedValue([]);
      
      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);
      
      expect(result.valid).toBe(true);
      expect(result.observerCount).toBe(0);
      expect(result.warnings).toContain(
        expect.stringContaining('No potential observers detected')
      );
    });

    it('should handle validation with system failures', async () => {
      // Mock system failures
      errorHandlingService._systemStatus.set(SYSTEM_TYPES.AVS, {
        available: false,
        lastError: 'AVS system failed'
      });
      
      vi.spyOn(sneakHandler, 'discoverSubjects').mockResolvedValue([mockObserver]);
      
      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);
      
      expect(result.warnings).toContain(
        expect.stringContaining('Some systems unavailable')
      );
      expect(result.recommendations).toContain(
        expect.stringContaining('Fallback mechanisms will be used')
      );
    });

    it('should handle validation failure with error handling', async () => {
      // Mock discovery to fail
      vi.spyOn(sneakHandler, 'discoverSubjects').mockRejectedValue(
        new Error('Subject discovery failed')
      );
      
      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Prerequisite validation failed')
      );
    });
  });

  describe('Movement Detection Error Handling', () => {
    it('should handle movement detection errors gracefully', async () => {
      // Setup position tracking
      sneakHandler._isTrackingPositions = true;
      sneakHandler._currentActionData = mockActionData;
      
      // Mock recalculation to fail
      vi.spyOn(sneakHandler, '_recalculateEndPositions').mockRejectedValue(
        new Error('Movement recalculation failed')
      );
      
      // Simulate token movement
      const mockTokenDocument = { id: mockActionData.actorToken.document.id };
      const changes = { x: 50, y: 50 };
      
      // Get the movement hook callback
      const hookCallback = global.Hooks.on.mock.calls.find(
        call => call[0] === 'updateToken'
      )[1];
      
      // Should handle error gracefully
      await expect(hookCallback(mockTokenDocument, changes, {}, 'user1')).resolves.not.toThrow();
      
      // Should have logged error
      const errorHistory = errorHandlingService.getErrorHistory();
      expect(errorHistory.some(e => e.systemType === SYSTEM_TYPES.POSITION_TRACKER)).toBe(true);
    });

    it('should ignore movement for non-sneaking tokens', async () => {
      sneakHandler._isTrackingPositions = true;
      sneakHandler._currentActionData = mockActionData;
      
      const spy = vi.spyOn(sneakHandler, '_recalculateEndPositions');
      
      // Simulate movement of different token
      const mockTokenDocument = { id: 'different-token' };
      const changes = { x: 50, y: 50 };
      
      const hookCallback = global.Hooks.on.mock.calls.find(
        call => call[0] === 'updateToken'
      )[1];
      
      await hookCallback(mockTokenDocument, changes, {}, 'user1');
      
      // Should not have triggered recalculation
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Position Quality Analysis', () => {
    it('should analyze position quality correctly', () => {
      // Setup position data
      sneakHandler._startPositions = new Map([
        ['observer1', {
          stealthBonus: 2,
          coverState: 'standard',
          avsVisibility: 'concealed',
          avsEnabled: true,
          autoCoverEnabled: true
        }],
        ['observer2', {
          stealthBonus: 4,
          coverState: 'greater',
          avsVisibility: 'hidden',
          avsEnabled: true,
          autoCoverEnabled: true
        }]
      ]);
      
      const analysis = sneakHandler._analyzePositionQuality();
      
      expect(analysis.overallQuality).toBe('excellent');
      expect(analysis.averageStealthBonus).toBe(3);
      expect(analysis.coverDistribution).toEqual({
        'standard': 1,
        'greater': 1
      });
      expect(analysis.visibilityDistribution).toEqual({
        'concealed': 1,
        'hidden': 1
      });
      expect(analysis.systemAvailability.avs).toBe(true);
      expect(analysis.systemAvailability.autoCover).toBe(true);
    });

    it('should handle empty position data', () => {
      const analysis = sneakHandler._analyzePositionQuality();
      
      expect(analysis.overallQuality).toBe('unknown');
      expect(analysis.averageStealthBonus).toBe(0);
      expect(analysis.systemAvailability.avs).toBe(false);
      expect(analysis.systemAvailability.autoCover).toBe(false);
    });
  });
});