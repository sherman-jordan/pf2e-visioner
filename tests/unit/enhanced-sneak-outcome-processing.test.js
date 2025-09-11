/**
 * Unit tests for enhanced sneak outcome processing with position context
 * Tests the enhanced position-aware outcome analysis, DC calculations, 
 * stealth bonus calculations, and recommendation generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SneakActionHandler } from '../../scripts/chat/services/actions/sneak-action.js';

// Mock dependencies
vi.mock('../../scripts/constants.js', () => ({
  VISIBILITY_STATES: {
    'observed': { label: 'Observed' },
    'concealed': { label: 'Concealed' },
    'hidden': { label: 'Hidden' },
    'undetected': { label: 'Undetected' }
  },
  COVER_STATES: {
    'none': { label: 'None', bonusStealth: 0 },
    'lesser': { label: 'Lesser Cover', bonusStealth: 1 },
    'standard': { label: 'Standard Cover', bonusStealth: 2 },
    'greater': { label: 'Greater Cover', bonusStealth: 4 }
  }
}));

vi.mock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: {
    isEnabled: () => true,
    consumeCoverOverride: () => null
  }
}));

vi.mock('../../scripts/cover/auto-cover/usecases/StealthCheckUseCase.js', () => ({
  default: {
    _detectCover: () => 'none',
    getOriginalCoverModifier: () => null
  }
}));

vi.mock('../../scripts/chat/services/position/SneakPositionTracker.js', () => ({
  default: {
    captureStartPositions: vi.fn(),
    calculateEndPositions: vi.fn(),
    analyzePositionTransitions: vi.fn()
  }
}));

vi.mock('../../scripts/utils.js', () => ({
  getVisibilityBetween: vi.fn(() => 'hidden'),
  getCoverBetween: vi.fn(() => 'none')
}));

vi.mock('../../scripts/chat/services/infra/shared-utils.js', () => ({
  extractPerceptionDC: vi.fn(() => 15),
  determineOutcome: vi.fn((total, die, dc) => {
    if (total >= dc + 10) return 'critical-success';
    if (total >= dc) return 'success';
    if (total <= dc - 10) return 'critical-failure';
    return 'failure';
  }),
  calculateStealthRollTotals: vi.fn((baseTotal, autoCover) => ({
    total: baseTotal + (autoCover?.bonus || 0),
    originalTotal: baseTotal,
    baseRollTotal: baseTotal
  })),
  shouldFilterAlly: vi.fn(() => false)
}));

vi.mock('../../scripts/chat/services/data/action-state-config.js', () => ({
  getDefaultNewStateFor: vi.fn((action, current, outcome) => {
    if (outcome === 'success' || outcome === 'critical-success') {
      return current === 'hidden' ? 'undetected' : 'hidden';
    }
    return current;
  })
}));

describe('Enhanced Sneak Outcome Processing', () => {
  let sneakHandler;
  let mockActionData;
  let mockSubject;
  let mockPositionTransition;

  beforeEach(() => {
    sneakHandler = new SneakActionHandler();
    
    // Mock action data
    mockActionData = {
      actor: { id: 'actor1' },
      roll: { total: 18, dice: [{ total: 12 }] }
    };

    // Mock subject token
    mockSubject = {
      id: 'subject1',
      document: { id: 'subject1' },
      actor: { id: 'subject-actor1' }
    };

    // Mock position transition data
    mockPositionTransition = {
      targetId: 'subject1',
      startPosition: {
        avsVisibility: 'hidden',
        coverState: 'none',
        stealthBonus: 0,
        distance: 25,
        hasLineOfSight: true,
        lightingConditions: 'dim'
      },
      endPosition: {
        avsVisibility: 'hidden',
        coverState: 'standard',
        stealthBonus: 2,
        distance: 30,
        hasLineOfSight: false,
        lightingConditions: 'darkness'
      },
      hasChanged: true,
      avsVisibilityChanged: false,
      coverStateChanged: true,
      impactOnDC: 0,
      stealthBonusChange: 2,
      transitionType: 'improved',
      avsTransition: {
        from: 'hidden',
        to: 'hidden',
        changed: false
      },
      coverTransition: {
        from: 'none',
        to: 'standard',
        bonusChange: 2,
        changed: true
      }
    };

    // Setup position tracking mocks
    sneakHandler._isTrackingPositions = true;
    sneakHandler._positionTransitions = new Map([['subject1', mockPositionTransition]]);
  });

  describe('_calculatePositionImpact', () => {
    it('should calculate comprehensive position impact with all factors', () => {
      const result = sneakHandler._calculatePositionImpact(mockPositionTransition, 15);

      expect(result).toMatchObject({
        dcModification: expect.any(Number),
        effectiveDC: expect.any(Number),
        bonusSource: 'improved_cover',
        explanation: expect.stringContaining('Gained +2 stealth bonus'),
        breakdown: {
          visibilityImpact: expect.any(Number),
          distanceImpact: expect.any(Number),
          lightingImpact: expect.any(Number),
          coverBonusChange: 2
        }
      });
    });

    it('should handle position worsening correctly', () => {
      const worsenedTransition = {
        ...mockPositionTransition,
        stealthBonusChange: -2,
        transitionType: 'worsened',
        endPosition: {
          ...mockPositionTransition.endPosition,
          coverState: 'none',
          stealthBonus: 0,
          lightingConditions: 'bright'
        }
      };

      const result = sneakHandler._calculatePositionImpact(worsenedTransition, 15);

      expect(result.bonusSource).toBe('reduced_cover');
      expect(result.explanation).toContain('Lost 2 stealth bonus');
    });

    it('should return null for missing position data', () => {
      const result = sneakHandler._calculatePositionImpact(null, 15);
      expect(result).toBeNull();
    });
  });

  describe('_calculateVisibilityDCImpact', () => {
    it('should calculate correct DC impact for visibility improvements', () => {
      const impact = sneakHandler._calculateVisibilityDCImpact('observed', 'hidden');
      expect(impact).toBe(4); // observed (0) - hidden (-4) = 4
    });

    it('should calculate correct DC impact for visibility degradation', () => {
      const impact = sneakHandler._calculateVisibilityDCImpact('hidden', 'observed');
      expect(impact).toBe(-4); // hidden (-4) - observed (0) = -4
    });

    it('should return 0 for no visibility change', () => {
      const impact = sneakHandler._calculateVisibilityDCImpact('hidden', 'hidden');
      expect(impact).toBe(0);
    });
  });

  describe('_calculateDistanceDCImpact', () => {
    it('should return 0 for small distance changes', () => {
      const impact = sneakHandler._calculateDistanceDCImpact(10);
      expect(impact).toBe(0);
    });

    it('should calculate negative impact for increased distance', () => {
      const impact = sneakHandler._calculateDistanceDCImpact(35); // More than 30 feet
      expect(impact).toBe(-1); // Farther = easier to hide
    });

    it('should calculate positive impact for decreased distance', () => {
      const impact = sneakHandler._calculateDistanceDCImpact(-35); // Closer by 35 feet
      expect(impact).toBe(1); // Closer = harder to hide
    });
  });

  describe('_calculateLightingDCImpact', () => {
    it('should calculate correct impact for lighting improvements', () => {
      const impact = sneakHandler._calculateLightingDCImpact('bright', 'darkness');
      expect(impact).toBe(4); // bright (0) - darkness (-4) = 4
    });

    it('should calculate correct impact for lighting degradation', () => {
      const impact = sneakHandler._calculateLightingDCImpact('darkness', 'bright');
      expect(impact).toBe(-4); // darkness (-4) - bright (0) = -4
    });

    it('should return 0 for no lighting change', () => {
      const impact = sneakHandler._calculateLightingDCImpact('dim', 'dim');
      expect(impact).toBe(0);
    });
  });

  describe('_generateRecommendationsForOutcome', () => {
    it('should generate detailed recommendations for critical success', () => {
      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'critical-success',
        mockPositionTransition,
        'hidden',
        'undetected'
      );

      expect(recommendations).toMatchObject({
        nextAction: expect.stringContaining('Exploit'),
        reasoning: expect.stringContaining('Critical success'),
        alternatives: expect.arrayContaining([
          expect.stringContaining('Strike with advantage')
        ]),
        tacticalAnalysis: expect.any(Object),
        positionAdvice: expect.any(Object),
        riskAssessment: expect.any(Object)
      });
    });

    it('should generate appropriate recommendations for failure with improved position', () => {
      const failureTransition = {
        ...mockPositionTransition,
        transitionType: 'improved'
      };

      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'failure',
        failureTransition,
        'hidden',
        'hidden'
      );

      expect(recommendations.nextAction).toContain('Retry stealth');
      expect(recommendations.reasoning).toContain('position improved');
    });

    it('should generate defensive recommendations for critical failure', () => {
      const criticalFailureTransition = {
        ...mockPositionTransition,
        transitionType: 'worsened',
        endPosition: {
          ...mockPositionTransition.endPosition,
          coverState: 'none',
          lightingConditions: 'bright'
        }
      };

      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'critical-failure',
        criticalFailureTransition,
        'hidden',
        'observed'
      );

      expect(recommendations.nextAction).toContain('defensive action');
      expect(recommendations.alternatives).toContain('Take Cover for immediate protection');
    });

    it('should fall back to basic recommendations without position data', () => {
      const recommendations = sneakHandler._generateRecommendationsForOutcome(
        'success',
        null,
        'hidden',
        'undetected'
      );

      expect(recommendations).toMatchObject({
        nextAction: expect.any(String),
        reasoning: expect.any(String),
        alternatives: expect.any(Array)
      });
    });
  });

  describe('_generateTacticalAnalysis', () => {
    it('should provide comprehensive tactical analysis', () => {
      const analysis = sneakHandler._generateTacticalAnalysis(mockPositionTransition, 'success');

      expect(analysis).toMatchObject({
        positionQuality: expect.any(String),
        stealthPotential: expect.any(String),
        riskLevel: expect.any(String),
        advantageFactors: expect.any(Array),
        disadvantageFactors: expect.any(Array)
      });
    });

    it('should identify advantage factors correctly', () => {
      const factors = sneakHandler._identifyAdvantageFactors(mockPositionTransition);

      expect(factors).toContain('Gained +2 stealth bonus');
      expect(factors).toContain('Positioned in darkness');
      expect(factors).toContain('No line of sight to observer');
    });

    it('should identify disadvantage factors for poor positions', () => {
      const badTransition = {
        ...mockPositionTransition,
        stealthBonusChange: -2,
        endPosition: {
          ...mockPositionTransition.endPosition,
          coverState: 'none',
          lightingConditions: 'bright',
          distance: 10,
          hasLineOfSight: true
        }
      };

      const factors = sneakHandler._identifyDisadvantageFactors(badTransition);

      expect(factors).toContain('Lost 2 stealth bonus');
      expect(factors).toContain('Exposed in bright light');
      expect(factors).toContain('Very close to observer');
      expect(factors).toContain('No cover protection');
    });
  });

  describe('_generatePositionAdvice', () => {
    it('should provide specific advice for each position aspect', () => {
      const advice = sneakHandler._generatePositionAdvice(mockPositionTransition);

      expect(advice).toMatchObject({
        coverAdvice: expect.stringContaining('cover'),
        lightingAdvice: expect.stringContaining('Darkness'),
        distanceAdvice: expect.stringContaining('range'),
        movementAdvice: expect.stringContaining('positioning')
      });
    });

    it('should advise seeking cover when none available', () => {
      const noCoverTransition = {
        ...mockPositionTransition,
        endPosition: {
          ...mockPositionTransition.endPosition,
          coverState: 'none'
        }
      };

      const advice = sneakHandler._generatePositionAdvice(noCoverTransition);
      expect(advice.coverAdvice).toContain('Seek cover');
    });
  });

  describe('_generateRiskAssessment', () => {
    it('should assess risk correctly for different outcomes', () => {
      const criticalFailureRisk = sneakHandler._generateRiskAssessment(
        mockPositionTransition,
        'critical-failure',
        'observed'
      );

      expect(criticalFailureRisk.level).toBe('critical');
      expect(criticalFailureRisk.riskFactors).toContain('Critical failure likely means detection');
    });

    it('should identify mitigating factors for good positions', () => {
      const goodRisk = sneakHandler._generateRiskAssessment(
        mockPositionTransition,
        'success',
        'undetected'
      );

      expect(goodRisk.mitigatingFactors).toContain('Successfully undetected');
      expect(goodRisk.mitigatingFactors).toContain('standard cover provides protection');
      expect(goodRisk.mitigatingFactors).toContain('Darkness provides concealment');
    });
  });

  describe('Position Quality Assessment', () => {
    it('should assess excellent position quality', () => {
      const excellentPosition = {
        coverState: 'greater',
        lightingConditions: 'darkness',
        hasLineOfSight: false
      };

      const quality = sneakHandler._assessPositionQuality(excellentPosition);
      expect(quality).toBe('excellent');
    });

    it('should assess poor position quality', () => {
      const poorPosition = {
        coverState: 'none',
        lightingConditions: 'bright',
        hasLineOfSight: true
      };

      const quality = sneakHandler._assessPositionQuality(poorPosition);
      expect(quality).toBe('poor');
    });
  });

  describe('Stealth Potential Assessment', () => {
    it('should assess high stealth potential', () => {
      const highBonusPosition = { stealthBonus: 5 };
      const potential = sneakHandler._assessStealthPotential(highBonusPosition);
      expect(potential).toBe('high');
    });

    it('should assess minimal stealth potential', () => {
      const noBonusPosition = { stealthBonus: 0 };
      const potential = sneakHandler._assessStealthPotential(noBonusPosition);
      expect(potential).toBe('minimal');
    });
  });

  describe('Integration with analyzeOutcome', () => {
    beforeEach(async () => {
      // Mock the imports that analyzeOutcome uses
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      const { extractPerceptionDC, determineOutcome, calculateStealthRollTotals } = 
        await import('../../scripts/chat/services/infra/shared-utils.js');
      const { getDefaultNewStateFor } = 
        await import('../../scripts/chat/services/data/action-state-config.js');

      getVisibilityBetween.mockReturnValue('hidden');
      extractPerceptionDC.mockReturnValue(15);
      determineOutcome.mockImplementation((total, die, dc) => {
        if (total >= dc + 10) return 'critical-success';
        if (total >= dc) return 'success';
        return 'failure';
      });
      calculateStealthRollTotals.mockReturnValue({
        total: 20,
        originalTotal: 18,
        baseRollTotal: 18
      });
      getDefaultNewStateFor.mockReturnValue('undetected');
    });

    it('should integrate position impact into outcome analysis', async () => {
      const outcome = await sneakHandler.analyzeOutcome(mockActionData, mockSubject);

      expect(outcome).toMatchObject({
        token: mockSubject,
        dc: expect.any(Number),
        rollTotal: 20,
        outcome: expect.any(String),
        positionTransition: mockPositionTransition,
        positionImpact: expect.any(Object),
        recommendations: expect.any(Object),
        enhancedAnalysis: {
          hasPositionData: true,
          positionQuality: expect.any(String),
          stealthPotential: expect.any(String),
          riskLevel: expect.any(String)
        }
      });
    });

    it('should adjust DC based on position impact', async () => {
      // Mock position impact that changes DC
      vi.spyOn(sneakHandler, '_calculatePositionImpact').mockReturnValue({
        dcModification: -2,
        effectiveDC: 13,
        bonusSource: 'improved_cover',
        explanation: 'Position improved'
      });

      const outcome = await sneakHandler.analyzeOutcome(mockActionData, mockSubject);

      expect(outcome.dc).toBe(13); // Adjusted DC
      expect(outcome.originalDC).toBe(15); // Original DC preserved
      expect(outcome.dcAdjustment).toBe(-2);
    });

    it('should handle missing position data gracefully', async () => {
      sneakHandler._isTrackingPositions = false;
      sneakHandler._positionTransitions.clear();

      const outcome = await sneakHandler.analyzeOutcome(mockActionData, mockSubject);

      expect(outcome.positionTransition).toBeNull();
      expect(outcome.positionImpact).toBeNull();
      expect(outcome.enhancedAnalysis.hasPositionData).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in position impact calculation gracefully', () => {
      const invalidTransition = { /* missing required properties */ };
      
      expect(() => {
        sneakHandler._calculatePositionImpact(invalidTransition, 15);
      }).not.toThrow();
    });

    it('should handle errors in recommendation generation gracefully', () => {
      expect(() => {
        sneakHandler._generateRecommendationsForOutcome('invalid-outcome', null, 'hidden', 'hidden');
      }).not.toThrow();
    });
  });
});