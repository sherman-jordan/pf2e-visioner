/**
 * Unit tests for enhanced prerequisite validation with position context
 * Tests the comprehensive validation system that checks sneak prerequisites
 * and provides warnings and recommendations based on position data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SneakActionHandler } from '../../scripts/chat/services/actions/sneak-action.js';

// Mock dependencies
vi.mock('../../scripts/constants.js', () => ({
  VISIBILITY_STATES: {
    observed: { label: 'Observed' },
    concealed: { label: 'Concealed' },
    hidden: { label: 'Hidden' },
    undetected: { label: 'Undetected' }
  },
  COVER_STATES: {
    none: { label: 'None', bonusStealth: 0 },
    lesser: { label: 'Lesser Cover', bonusStealth: 1 },
    standard: { label: 'Standard Cover', bonusStealth: 2 },
    greater: { label: 'Greater Cover', bonusStealth: 4 }
  }
}));

vi.mock('../../scripts/chat/services/position/SneakPositionTracker.js', () => ({
  default: {
    captureStartPositions: vi.fn(),
    getSystemDiagnostics: vi.fn(() => ({
      avs: { available: true, enabled: true },
      autoCover: { available: true, enabled: true },
      integration: { status: 'ready' }
    }))
  }
}));

vi.mock('../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}));

// Mock game settings
global.game = {
  settings: {
    get: vi.fn((module, setting) => {
      if (module === 'pf2e-visioner' && setting === 'enforceRawRequirements') {
        return false;
      }
      return false;
    })
  }
};

describe('Enhanced Prerequisite Validation with Position Context', () => {
  let sneakHandler;
  let mockActionData;
  let mockSneakingToken;
  let mockObservers;

  beforeEach(() => {
    sneakHandler = new SneakActionHandler();
    
    // Mock basic action data
    mockActionData = {
      actor: {
        id: 'actor1',
        name: 'Test Actor',
        system: {
          attributes: { hp: { value: 50 } },
          skills: { stealth: { total: 10 } }
        },
        conditions: []
      },
      roll: {
        total: 15,
        dice: [{ total: 12 }]
      }
    };

    // Mock sneaking token
    mockSneakingToken = {
      id: 'token1',
      name: 'Sneaking Token',
      actor: mockActionData.actor,
      document: { id: 'token1' },
      center: { x: 100, y: 100 }
    };

    // Mock observer tokens
    mockObservers = [
      {
        id: 'observer1',
        name: 'Observer 1',
        document: { id: 'observer1' },
        actor: {
          id: 'observer1-actor',
          system: { skills: { perception: { total: 12 } } },
          conditions: []
        },
        center: { x: 150, y: 150 }
      },
      {
        id: 'observer2',
        name: 'Observer 2',
        document: { id: 'observer2' },
        actor: {
          id: 'observer2-actor',
          system: { skills: { perception: { total: 14 } } },
          conditions: []
        },
        center: { x: 200, y: 100 }
      }
    ];

    // Mock methods
    sneakHandler._getSneakingToken = vi.fn(() => mockSneakingToken);
    sneakHandler.discoverSubjects = vi.fn(() => Promise.resolve(mockObservers));
    sneakHandler.ensurePrerequisites = vi.fn(() => Promise.resolve());
  });

  describe('validatePrerequisitesWithPosition', () => {
    it('should return error when base prerequisites fail', async () => {
      sneakHandler.ensurePrerequisites = vi.fn(() => {
        throw new Error('Base validation failed');
      });

      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(result.valid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.errors).toContain('Base prerequisite validation failed: Base validation failed');
    });

    it('should return error when sneaking token is not found', async () => {
      sneakHandler._getSneakingToken = vi.fn(() => null);

      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(result.valid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.errors).toContain('Cannot find sneaking token for validation');
      expect(result.recommendations).toContain('Ensure the actor has a token on the scene');
    });

    it('should return error when observer discovery fails', async () => {
      sneakHandler.discoverSubjects = vi.fn(() => {
        throw new Error('Observer discovery failed');
      });

      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(result.valid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.errors).toContain('Failed to discover observers: Observer discovery failed');
    });

    it('should perform comprehensive validation when all prerequisites are met', async () => {
      // Mock position tracker to return good positions
      const mockPositions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          coverState: 'standard',
          stealthBonus: 2,
          distance: 30,
          hasLineOfSight: false,
          lightingConditions: 'dim',
          systemErrors: []
        }],
        ['observer2', {
          avsVisibility: 'concealed',
          coverState: 'lesser',
          stealthBonus: 1,
          distance: 25,
          hasLineOfSight: true,
          lightingConditions: 'darkness',
          systemErrors: []
        }]
      ]);

      sneakHandler.positionTracker.captureStartPositions = vi.fn(() => Promise.resolve(mockPositions));

      const result = await sneakHandler.validatePrerequisitesWithPosition(mockActionData);

      expect(result.canProceed).toBe(true);
      expect(result.observerCount).toBe(2);
      expect(result.positionAnalysis).toBeDefined();
      expect(result.systemStatus).toBeDefined();
    });
  });

  describe('_validateBasicSneakPrerequisites', () => {
    it('should return error when token has no actor', () => {
      const tokenWithoutActor = { ...mockSneakingToken, actor: null };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(tokenWithoutActor, mockActionData);
      
      expect(result.errors).toContain('Token has no associated actor');
    });

    it('should return warning when actor has no stealth skill', () => {
      const actorWithoutStealth = {
        ...mockActionData.actor,
        system: { ...mockActionData.actor.system, skills: {} }
      };
      const tokenWithoutStealth = { ...mockSneakingToken, actor: actorWithoutStealth };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(tokenWithoutStealth, mockActionData);
      
      expect(result.warnings).toContain('Actor does not have stealth skill defined');
      expect(result.recommendations).toContain('Ensure the character sheet has stealth skill configured');
    });

    it('should return error when actor is unconscious', () => {
      const unconsciousActor = {
        ...mockActionData.actor,
        system: { ...mockActionData.actor.system, attributes: { hp: { value: 0 } } }
      };
      const unconsciousToken = { ...mockSneakingToken, actor: unconsciousActor };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(unconsciousToken, mockActionData);
      
      expect(result.errors).toContain('Actor is unconscious or dead and cannot perform stealth actions');
    });

    it('should return error when actor has preventing conditions', () => {
      const actorWithConditions = {
        ...mockActionData.actor,
        conditions: [{ slug: 'stunned', name: 'Stunned' }]
      };
      const tokenWithConditions = { ...mockSneakingToken, actor: actorWithConditions };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(tokenWithConditions, mockActionData);
      
      expect(result.errors).toContain('Actor has conditions preventing stealth: Stunned');
      expect(result.recommendations).toContain('Remove preventing conditions before attempting stealth');
    });

    it('should return recommendations when actor has beneficial conditions', () => {
      const actorWithBenefits = {
        ...mockActionData.actor,
        conditions: [{ slug: 'invisible', name: 'Invisible' }]
      };
      const tokenWithBenefits = { ...mockSneakingToken, actor: actorWithBenefits };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(tokenWithBenefits, mockActionData);
      
      expect(result.recommendations).toContain('Actor has beneficial conditions for stealth: Invisible');
    });

    it('should return warning for invalid roll results', () => {
      const actionDataWithBadRoll = {
        ...mockActionData,
        roll: { total: 0 }
      };
      
      const result = sneakHandler._validateBasicSneakPrerequisites(mockSneakingToken, actionDataWithBadRoll);
      
      expect(result.warnings).toContain('Roll result appears invalid or very low');
      expect(result.recommendations).toContain('Consider rerolling if the result seems incorrect');
    });
  });

  describe('_validatePositionPrerequisites', () => {
    it('should return warning when position analysis is unavailable', () => {
      const result = sneakHandler._validatePositionPrerequisites(null, mockSneakingToken, mockObservers);
      
      expect(result.warnings).toContain('Position analysis unavailable - using basic validation');
    });

    it('should return warnings when actor is fully observed', () => {
      const positionAnalysis = {
        observedByCount: 2,
        hiddenFromCount: 0,
        concealedFromCount: 0,
        noCoverCount: 2,
        goodCoverCount: 0,
        brightLightCount: 2,
        dimLightCount: 0,
        darknessCount: 0,
        averageDistance: 10,
        systemErrors: 0
      };
      
      const result = sneakHandler._validatePositionPrerequisites(positionAnalysis, mockSneakingToken, mockObservers);
      
      expect(result.warnings).toContain('Actor is fully observed by all potential targets');
      expect(result.recommendations).toContain('Consider moving to cover or concealment before sneaking');
      expect(result.warnings).toContain('Actor has no cover from any observers');
      expect(result.warnings).toContain('Very close to observers - stealth will be more difficult');
    });

    it('should return recommendations for good positioning', () => {
      const positionAnalysis = {
        observedByCount: 0,
        hiddenFromCount: 1,
        concealedFromCount: 1,
        noCoverCount: 0,
        goodCoverCount: 2,
        brightLightCount: 0,
        dimLightCount: 1,
        darknessCount: 1,
        averageDistance: 70,
        systemErrors: 0
      };
      
      const result = sneakHandler._validatePositionPrerequisites(positionAnalysis, mockSneakingToken, mockObservers);
      
      expect(result.recommendations).toContain('Actor has good cover from 2 observers');
      expect(result.recommendations).toContain('1 observers are in darkness - excellent for stealth');
      expect(result.recommendations).toContain('Good distance from observers - stealth should be easier');
    });

    it('should return warnings for system errors', () => {
      const positionAnalysis = {
        observedByCount: 1,
        hiddenFromCount: 0,
        concealedFromCount: 0,
        noCoverCount: 1,
        goodCoverCount: 0,
        brightLightCount: 1,
        dimLightCount: 0,
        darknessCount: 0,
        averageDistance: 30,
        systemErrors: 1
      };
      
      const result = sneakHandler._validatePositionPrerequisites(positionAnalysis, mockSneakingToken, mockObservers);
      
      expect(result.warnings).toContain('1 position calculations failed');
      expect(result.recommendations).toContain('Some position data may be inaccurate - proceed with caution');
    });
  });

  describe('_validateObserverRequirements', () => {
    it('should return error when no valid observers are found', () => {
      const emptyPositions = new Map();
      
      const result = sneakHandler._validateObserverRequirements(emptyPositions, mockObservers, mockActionData);
      
      expect(result.errors).toContain('No valid observers found for stealth attempt');
      expect(result.recommendations).toContain('Check scene setup and ensure observers have proper actor data');
    });

    it('should return warnings for observers with issues', () => {
      const positions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          hasLineOfSight: false,
          systemErrors: []
        }]
      ]);
      
      const observersWithIssues = [
        ...mockObservers,
        { id: 'observer3', name: 'Observer 3', document: { id: 'observer3' }, actor: null }
      ];
      
      const result = sneakHandler._validateObserverRequirements(positions, observersWithIssues, mockActionData);
      
      expect(result.warnings.some(w => w.includes('observers have issues'))).toBe(true);
    });

    it('should handle RAW enforcement when enabled', () => {
      global.game.settings.get = vi.fn((module, setting) => {
        if (module === 'pf2e-visioner' && setting === 'enforceRawRequirements') {
          return true;
        }
        return false;
      });

      const positions = new Map([
        ['observer1', { avsVisibility: 'observed', systemErrors: [] }],
        ['observer2', { avsVisibility: 'observed', systemErrors: [] }]
      ]);
      
      const result = sneakHandler._validateObserverRequirements(positions, mockObservers, mockActionData);
      
      expect(result.errors).toContain('RAW enforcement enabled: Actor must be hidden or undetected from at least one observer');
      expect(result.recommendations).toContain('Use Hide action first to meet RAW requirements');
    });

    it('should provide recommendations for observers with impaired perception', () => {
      const positions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          hasLineOfSight: false,
          systemErrors: []
        }]
      ]);

      const observerWithImpairedPerception = {
        ...mockObservers[0],
        actor: {
          ...mockObservers[0].actor,
          conditions: [{ slug: 'blinded', name: 'Blinded' }]
        }
      };
      
      const result = sneakHandler._validateObserverRequirements(positions, [observerWithImpairedPerception], mockActionData);
      
      expect(result.recommendations.some(r => r.includes('has impaired perception: Blinded'))).toBe(true);
    });
  });

  describe('_analyzePositionsForPrerequisites', () => {
    it('should correctly analyze position data', () => {
      const positions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          coverState: 'standard',
          lightingConditions: 'dim',
          distance: 30,
          systemErrors: []
        }],
        ['observer2', {
          avsVisibility: 'observed',
          coverState: 'none',
          lightingConditions: 'bright',
          distance: 20,
          systemErrors: []
        }]
      ]);
      
      const analysis = sneakHandler._analyzePositionsForPrerequisites(positions, mockSneakingToken);
      
      expect(analysis.observedByCount).toBe(1);
      expect(analysis.hiddenFromCount).toBe(1);
      expect(analysis.noCoverCount).toBe(1);
      expect(analysis.goodCoverCount).toBe(1);
      expect(analysis.brightLightCount).toBe(1);
      expect(analysis.dimLightCount).toBe(1);
      expect(analysis.averageDistance).toBe(25);
      expect(analysis.validPositions).toBe(2);
      expect(analysis.overallQuality).toBe('poor'); // Mixed conditions
    });

    it('should determine excellent position quality', () => {
      const positions = new Map([
        ['observer1', {
          avsVisibility: 'hidden',
          coverState: 'standard',
          lightingConditions: 'darkness',
          distance: 40,
          systemErrors: []
        }],
        ['observer2', {
          avsVisibility: 'undetected',
          coverState: 'greater',
          lightingConditions: 'dim',
          distance: 50,
          systemErrors: []
        }]
      ]);
      
      const analysis = sneakHandler._analyzePositionsForPrerequisites(positions, mockSneakingToken);
      
      expect(analysis.overallQuality).toBe('excellent');
    });

    it('should determine terrible position quality', () => {
      const positions = new Map([
        ['observer1', {
          avsVisibility: 'observed',
          coverState: 'none',
          lightingConditions: 'bright',
          distance: 10,
          systemErrors: []
        }],
        ['observer2', {
          avsVisibility: 'observed',
          coverState: 'none',
          lightingConditions: 'bright',
          distance: 15,
          systemErrors: []
        }]
      ]);
      
      const analysis = sneakHandler._analyzePositionsForPrerequisites(positions, mockSneakingToken);
      
      expect(analysis.overallQuality).toBe('terrible');
    });
  });

  describe('_generateTacticalRecommendations', () => {
    it('should generate recommendations based on position quality', () => {
      const excellentAnalysis = { overallQuality: 'excellent' };
      const recommendations = sneakHandler._generateTacticalRecommendations(excellentAnalysis, new Map(), mockSneakingToken);
      
      expect(recommendations).toContain('Excellent stealth position - proceed with confidence');
    });

    it('should generate alternative action recommendations for poor positions', () => {
      const poorAnalysis = { overallQuality: 'poor' };
      const recommendations = sneakHandler._generateTacticalRecommendations(poorAnalysis, new Map(), mockSneakingToken);
      
      expect(recommendations).toContain('Poor stealth position - consider improving before attempting');
      expect(recommendations).toContain('Alternative: Use Hide action to break line of sight first');
      expect(recommendations).toContain('Alternative: Use Take Cover action to improve defensive position');
    });

    it('should provide directional recommendations when available', () => {
      const analysisWithDirections = {
        overallQuality: 'good',
        bestCoverDirection: 'areas with standard cover',
        worstExposureDirection: 'open areas',
        suggestedMovement: 'toward cover (walls, obstacles)'
      };
      
      const recommendations = sneakHandler._generateTacticalRecommendations(analysisWithDirections, new Map(), mockSneakingToken);
      
      expect(recommendations).toContain('Best cover available to the areas with standard cover');
      expect(recommendations).toContain('Most exposed to the open areas - avoid that direction');
      expect(recommendations).toContain('Consider moving toward cover (walls, obstacles) for better positioning');
    });
  });

  describe('condition detection helpers', () => {
    it('should detect stealth preventing conditions', () => {
      const actorWithConditions = {
        conditions: [
          { slug: 'stunned', name: 'Stunned' },
          { slug: 'paralyzed', name: 'Paralyzed' },
          { slug: 'haste', name: 'Haste' } // Should not be detected as preventing
        ]
      };
      
      const preventing = sneakHandler._getStealthPreventingConditions(actorWithConditions);
      
      expect(preventing).toContain('Stunned');
      expect(preventing).toContain('Paralyzed');
      expect(preventing).not.toContain('Haste');
    });

    it('should detect stealth beneficial conditions', () => {
      const actorWithConditions = {
        conditions: [
          { slug: 'invisible', name: 'Invisible' },
          { slug: 'hidden', name: 'Hidden' },
          { slug: 'stunned', name: 'Stunned' } // Should not be detected as beneficial
        ]
      };
      
      const beneficial = sneakHandler._getStealthBeneficialConditions(actorWithConditions);
      
      expect(beneficial).toContain('Invisible');
      expect(beneficial).toContain('Hidden');
      expect(beneficial).not.toContain('Stunned');
    });

    it('should detect perception affecting conditions', () => {
      const observerWithConditions = {
        conditions: [
          { slug: 'blinded', name: 'Blinded' },
          { slug: 'true-seeing', name: 'True Seeing' },
          { slug: 'haste', name: 'Haste' } // Should not be detected
        ]
      };
      
      const conditions = sneakHandler._getPerceptionAffectingConditions(observerWithConditions);
      
      expect(conditions.impaired).toContain('Blinded');
      expect(conditions.enhanced).toContain('True Seeing');
      expect(conditions.impaired).not.toContain('Haste');
      expect(conditions.enhanced).not.toContain('Haste');
    });
  });

  describe('directional analysis helpers', () => {
    it('should determine best cover direction', () => {
      const coverQualities = ['standard', 'standard', 'lesser', 'greater'];
      
      const direction = sneakHandler._determineBestCoverDirection(coverQualities);
      
      expect(direction).toBe('areas with standard cover');
    });

    it('should return null for no cover', () => {
      const direction = sneakHandler._determineBestCoverDirection([]);
      
      expect(direction).toBeNull();
    });

    it('should suggest movement direction based on needs', () => {
      const positions = new Map([
        ['observer1', { coverState: 'none', avsVisibility: 'hidden' }],
        ['observer2', { coverState: 'none', avsVisibility: 'hidden' }]
      ]);
      
      const suggestion = sneakHandler._suggestMovementDirection(positions, mockSneakingToken);
      
      expect(suggestion).toBe('toward cover (walls, obstacles)');
    });
  });

  describe('system status', () => {
    it('should return current system status', () => {
      sneakHandler._isTrackingPositions = true;
      
      const status = sneakHandler._getSystemStatus();
      
      expect(status.positionTracking).toBe(true);
      expect(status.avsAvailable).toBe(true);
      expect(status.autoCoverAvailable).toBe(true);
      expect(status.dualSystemIntegration).toBe(true);
    });
  });
});