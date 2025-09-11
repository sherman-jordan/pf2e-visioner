/**
 * Unit tests for Enhanced Sneak Action Handler with Position Tracking
 * Tests the integration of SneakPositionTracker with SneakActionHandler
 */

import '../../setup.js';

describe('Enhanced Sneak Action Handler with Position Tracking', () => {
  let sneakHandler;
  let mockPositionTracker;
  let mockActionData;
  let mockSneakingToken;
  let mockObserverTokens;

  beforeEach(() => {
    // Import the enhanced sneak action handler
    const { SneakActionHandler } = require('../../../scripts/chat/services/actions/sneak-action.js');
    sneakHandler = new SneakActionHandler();

    // Mock the position tracker
    mockPositionTracker = {
      captureStartPositions: jest.fn(),
      calculateEndPositions: jest.fn(),
      analyzePositionTransitions: jest.fn(),
    };
    sneakHandler.positionTracker = mockPositionTracker;

    // Mock tokens and action data
    mockSneakingToken = {
      id: 'sneaker1',
      document: { id: 'sneaker1' },
      center: { x: 100, y: 100 },
      actor: { id: 'actor1', name: 'Sneaky Rogue' }
    };

    mockObserverTokens = [
      {
        id: 'observer1',
        document: { id: 'observer1' },
        center: { x: 200, y: 200 },
        actor: { id: 'actor2', name: 'Guard 1', alliance: 'opposition' }
      },
      {
        id: 'observer2', 
        document: { id: 'observer2' },
        center: { x: 300, y: 300 },
        actor: { id: 'actor3', name: 'Guard 2', alliance: 'opposition' }
      }
    ];

    mockActionData = {
      actor: mockSneakingToken.actor,
      actorToken: mockSneakingToken,
      roll: { total: 18, dice: [{ total: 12 }] },
      context: { _visionerRollId: 'test-roll-123' }
    };

    // Mock discoverSubjects to return our observer tokens
    sneakHandler.discoverSubjects = jest.fn().mockResolvedValue(mockObserverTokens);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Position Capture at Action Start', () => {
    test('captures start positions when prerequisites are validated', async () => {
      const mockStartPositions = new Map([
        ['observer1', {
          avsVisibility: 'observed',
          coverState: 'none',
          stealthBonus: 0,
          timestamp: Date.now()
        }],
        ['observer2', {
          avsVisibility: 'concealed',
          coverState: 'standard',
          stealthBonus: 2,
          timestamp: Date.now()
        }]
      ]);

      mockPositionTracker.captureStartPositions.mockResolvedValue(mockStartPositions);

      await sneakHandler.ensurePrerequisites(mockActionData);

      expect(mockPositionTracker.captureStartPositions).toHaveBeenCalledWith(
        mockSneakingToken,
        mockObserverTokens
      );
      expect(sneakHandler._isTrackingPositions).toBe(true);
      expect(sneakHandler._startPositions).toBe(mockStartPositions);
    });

    test('handles missing sneaking token gracefully', async () => {
      mockActionData.actorToken = null;
      mockActionData.actor.token = null;

      await sneakHandler.ensurePrerequisites(mockActionData);

      expect(mockPositionTracker.captureStartPositions).not.toHaveBeenCalled();
      expect(sneakHandler._isTrackingPositions).toBe(false);
    });

    test('handles position capture errors gracefully', async () => {
      mockPositionTracker.captureStartPositions.mockRejectedValue(new Error('Position capture failed'));

      await sneakHandler.ensurePrerequisites(mockActionData);

      expect(sneakHandler._isTrackingPositions).toBe(false);
    });
  });

  describe('Position Recalculation After Movement', () => {
    beforeEach(async () => {
      // Set up initial position tracking
      const mockStartPositions = new Map([['observer1', { avsVisibility: 'observed' }]]);
      mockPositionTracker.captureStartPositions.mockResolvedValue(mockStartPositions);
      await sneakHandler.ensurePrerequisites(mockActionData);
    });

    test('recalculates end positions when analyzing outcomes', async () => {
      const mockEndPositions = new Map([
        ['observer1', {
          avsVisibility: 'concealed',
          coverState: 'standard',
          stealthBonus: 2,
          timestamp: Date.now()
        }]
      ]);

      const mockTransitions = new Map([
        ['observer1', {
          targetId: 'observer1',
          hasChanged: true,
          avsVisibilityChanged: true,
          stealthBonusChange: 2,
          transitionType: 'improved'
        }]
      ]);

      mockPositionTracker.calculateEndPositions.mockResolvedValue(mockEndPositions);
      mockPositionTracker.analyzePositionTransitions.mockReturnValue(mockTransitions);

      // Mock the visibility and DC extraction functions
      const mockUtils = {
        getVisibilityBetween: jest.fn().mockReturnValue('observed'),
        extractPerceptionDC: jest.fn().mockReturnValue(15),
        determineOutcome: jest.fn().mockReturnValue('success')
      };

      // Mock the imports
      jest.doMock('../../../scripts/utils.js', () => ({
        getVisibilityBetween: mockUtils.getVisibilityBetween
      }));

      jest.doMock('../../../scripts/chat/services/infra/shared-utils.js', () => ({
        extractPerceptionDC: mockUtils.extractPerceptionDC,
        determineOutcome: mockUtils.determineOutcome,
        calculateStealthRollTotals: jest.fn().mockReturnValue({
          total: 18,
          originalTotal: 16,
          baseRollTotal: 16
        })
      }));

      const outcome = await sneakHandler.analyzeOutcome(mockActionData, mockObserverTokens[0]);

      expect(mockPositionTracker.calculateEndPositions).toHaveBeenCalledWith(
        mockSneakingToken,
        mockObserverTokens
      );
      expect(mockPositionTracker.analyzePositionTransitions).toHaveBeenCalledWith(
        sneakHandler._startPositions,
        mockEndPositions
      );
      expect(outcome.positionTransition).toBeDefined();
      expect(outcome.positionImpact).toBeDefined();
      expect(outcome.recommendations).toBeDefined();
    });

    test('handles end position calculation errors gracefully', async () => {
      mockPositionTracker.calculateEndPositions.mockRejectedValue(new Error('End position calculation failed'));

      // Should not throw error
      const outcome = await sneakHandler.analyzeOutcome(mockActionData, mockObserverTokens[0]);
      
      expect(outcome).toBeDefined();
      expect(outcome.positionTransition).toBeNull();
    });
  });

  describe('Token Movement Detection', () => {
    beforeEach(async () => {
      // Set up position tracking
      const mockStartPositions = new Map([['observer1', { avsVisibility: 'observed' }]]);
      mockPositionTracker.captureStartPositions.mockResolvedValue(mockStartPositions);
      await sneakHandler.ensurePrerequisites(mockActionData);
    });

    test('detects token movement and triggers position recalculation', (done) => {
      const mockEndPositions = new Map([['observer1', { avsVisibility: 'concealed' }]]);
      mockPositionTracker.calculateEndPositions.mockResolvedValue(mockEndPositions);

      // Set up a timeout to check if recalculation was triggered
      setTimeout(() => {
        expect(mockPositionTracker.calculateEndPositions).toHaveBeenCalled();
        done();
      }, 150); // Wait longer than the debounce timeout

      // Simulate token movement
      sneakHandler._onTokenUpdate(
        mockSneakingToken.document,
        { x: 150, y: 150 }, // New position
        {},
        'user123'
      );
    });

    test('ignores non-movement token updates', () => {
      // Simulate non-movement update (e.g., rotation)
      sneakHandler._onTokenUpdate(
        mockSneakingToken.document,
        { rotation: 90 }, // Not a position change
        {},
        'user123'
      );

      expect(mockPositionTracker.calculateEndPositions).not.toHaveBeenCalled();
    });

    test('ignores updates to other tokens', () => {
      const otherTokenDocument = { id: 'other-token' };

      sneakHandler._onTokenUpdate(
        otherTokenDocument,
        { x: 150, y: 150 },
        {},
        'user123'
      );

      expect(mockPositionTracker.calculateEndPositions).not.toHaveBeenCalled();
    });

    test('debounces rapid movement updates', (done) => {
      const mockEndPositions = new Map([['observer1', { avsVisibility: 'concealed' }]]);
      mockPositionTracker.calculateEndPositions.mockResolvedValue(mockEndPositions);

      // Simulate rapid movement updates
      sneakHandler._onTokenUpdate(mockSneakingToken.document, { x: 110 }, {}, 'user123');
      sneakHandler._onTokenUpdate(mockSneakingToken.document, { x: 120 }, {}, 'user123');
      sneakHandler._onTokenUpdate(mockSneakingToken.document, { x: 130 }, {}, 'user123');

      // Should only call once after debounce period
      setTimeout(() => {
        expect(mockPositionTracker.calculateEndPositions).toHaveBeenCalledTimes(1);
        done();
      }, 150);
    });
  });

  describe('Position Impact Analysis', () => {
    test('calculates position impact correctly for improved position', () => {
      const positionTransition = {
        impactOnDC: 2,
        stealthBonusChange: 2,
        transitionType: 'improved'
      };

      const impact = sneakHandler._calculatePositionImpact(positionTransition, 15);

      expect(impact).toEqual({
        dcModification: 2,
        bonusSource: 'improved_cover',
        explanation: 'Position improved: gained +2 stealth bonus'
      });
    });

    test('calculates position impact correctly for worsened position', () => {
      const positionTransition = {
        impactOnDC: -1,
        stealthBonusChange: -1,
        transitionType: 'worsened'
      };

      const impact = sneakHandler._calculatePositionImpact(positionTransition, 15);

      expect(impact).toEqual({
        dcModification: -1,
        bonusSource: 'reduced_cover',
        explanation: 'Position worsened: lost 1 stealth bonus'
      });
    });

    test('handles no position change', () => {
      const positionTransition = {
        impactOnDC: 0,
        stealthBonusChange: 0,
        hasChanged: false,
        transitionType: 'unchanged'
      };

      const impact = sneakHandler._calculatePositionImpact(positionTransition, 15);

      expect(impact).toEqual({
        dcModification: 0,
        bonusSource: 'none',
        explanation: 'No position change detected'
      });
    });

    test('returns null for missing position transition', () => {
      const impact = sneakHandler._calculatePositionImpact(null, 15);
      expect(impact).toBeNull();
    });
  });

  describe('Recommendation Generation', () => {
    test('generates recommendations for successful sneak with improved position', () => {
      const positionTransition = {
        transitionType: 'improved',
        stealthBonusChange: 2
      };

      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'success',
        positionTransition,
        'observed',
        'undetected'
      );

      expect(recommendations.nextAction).toContain('Continue sneaking');
      expect(recommendations.reasoning).toContain('undetected');
      expect(recommendations.alternatives).toContain('Strike while undetected');
    });

    test('generates recommendations for failed sneak with worsened position', () => {
      const positionTransition = {
        transitionType: 'worsened',
        stealthBonusChange: -1
      };

      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'failure',
        positionTransition,
        'observed',
        'observed'
      );

      expect(recommendations.nextAction).toContain('better cover');
      expect(recommendations.reasoning).toContain('worsened');
      expect(recommendations.alternatives).toContain('Take Cover');
    });

    test('generates basic recommendations when no position data available', () => {
      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'success',
        null,
        'observed',
        'hidden'
      );

      expect(recommendations.nextAction).toContain('advantage');
      expect(recommendations.reasoning).toContain('succeeded');
      expect(recommendations.alternatives).toContain('Continue sneaking');
    });
  });

  describe('Prerequisite Validation with Position Context', () => {
    test('validates prerequisites with favorable positions', async () => {
      const mockStartPositions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          coverState: 'standard',
          systemErrors: []
        }]
      ]);

      sneakHandler._startPositions = mockStartPositions;
      sneakHandler._isTrackingPositions = true;

      const validation = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
    });

    test('warns about unfavorable positions', async () => {
      const mockStartPositions = new Map([
        ['observer1', {
          avsVisibility: 'observed',
          coverState: 'none',
          systemErrors: []
        }]
      ]);

      sneakHandler._startPositions = mockStartPositions;
      sneakHandler._isTrackingPositions = true;

      const validation = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain('No favorable positions detected');
      expect(validation.recommendations).toContain('Consider taking cover');
    });

    test('warns about system errors', async () => {
      const mockStartPositions = new Map([
        ['observer1', {
          avsVisibility: 'observed',
          coverState: 'none',
          systemErrors: ['AVS calculation failed']
        }]
      ]);

      sneakHandler._startPositions = mockStartPositions;
      sneakHandler._isTrackingPositions = true;

      const validation = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(validation.warnings).toContain('Some position calculations failed');
    });
  });

  describe('Position State Management', () => {
    test('clears position state when action completes', () => {
      // Set up some position state
      sneakHandler._startPositions.set('observer1', { avsVisibility: 'observed' });
      sneakHandler._endPositions.set('observer1', { avsVisibility: 'concealed' });
      sneakHandler._isTrackingPositions = true;
      sneakHandler._currentActionData = mockActionData;

      // Simulate action completion
      const mockOutcome = {
        token: mockObserverTokens[0],
        newVisibility: 'hidden',
        oldVisibility: 'observed'
      };

      sneakHandler.outcomeToChange(mockActionData, mockOutcome);

      expect(sneakHandler._startPositions.size).toBe(0);
      expect(sneakHandler._endPositions.size).toBe(0);
      expect(sneakHandler._isTrackingPositions).toBe(false);
      expect(sneakHandler._currentActionData).toBeNull();
    });

    test('handles position state cleanup with pending timeouts', () => {
      // Set up position state with a pending timeout
      sneakHandler._isTrackingPositions = true;
      sneakHandler._movementTimeout = setTimeout(() => {}, 1000);

      sneakHandler._clearPositionState();

      expect(sneakHandler._isTrackingPositions).toBe(false);
      expect(sneakHandler._movementTimeout).toBeNull();
    });
  });

  describe('V13 API Compatibility', () => {
    test('uses v13-compatible token APIs for getting sneaking token', () => {
      // Test different ways the token might be provided
      const testCases = [
        { actorToken: mockSneakingToken },
        { actor: { token: { object: mockSneakingToken } } },
        { actor: { getActiveTokens: () => [mockSneakingToken] } }
      ];

      testCases.forEach((actionData, index) => {
        const token = sneakHandler._getSneakingToken(actionData);
        expect(token).toBe(mockSneakingToken);
      });
    });

    test('falls back to canvas search when token not directly available', () => {
      // Mock canvas.tokens.placeables
      global.canvas = {
        tokens: {
          placeables: [mockSneakingToken]
        }
      };

      const actionData = {
        actor: { id: 'actor1' }
      };

      const token = sneakHandler._getSneakingToken(actionData);
      expect(token).toBe(mockSneakingToken);
    });

    test('returns null when token cannot be found', () => {
      const actionData = {
        actor: { id: 'nonexistent' }
      };

      global.canvas = {
        tokens: {
          placeables: []
        }
      };

      const token = sneakHandler._getSneakingToken(actionData);
      expect(token).toBeNull();
    });
  });
});