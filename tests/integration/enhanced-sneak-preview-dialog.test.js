/**
 * Integration tests for Enhanced Sneak Preview Dialog with Position Display Components
 * Tests the enhanced dialog functionality including position tracking, visual indicators,
 * and position-aware override handling using FoundryVTT v13 ApplicationV2 framework.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock FoundryVTT v13 APIs and dependencies
const mockFoundryV13 = {
  applications: {
    handlebars: {
      renderTemplate: vi.fn().mockResolvedValue('<div>Mock Template</div>')
    }
  },
  game: {
    settings: {
      get: vi.fn().mockReturnValue(false)
    },
    i18n: {
      localize: vi.fn((key) => key)
    }
  },
  canvas: {
    tokens: {
      get: vi.fn(),
      placeables: []
    },
    grid: {
      measureDistances: vi.fn().mockReturnValue([30])
    },
    walls: {
      checkCollision: vi.fn().mockReturnValue(false)
    },
    lighting: {
      getIllumination: vi.fn().mockReturnValue(0.5)
    }
  },
  Dialog: vi.fn(),
  Ray: vi.fn()
};

// Mock global FoundryVTT objects
global.foundry = mockFoundryV13;
global.game = mockFoundryV13.game;
global.canvas = mockFoundryV13.canvas;
global.Dialog = mockFoundryV13.Dialog;
global.Ray = mockFoundryV13.Ray;

// Mock module dependencies
vi.mock('../../scripts/constants.js', () => ({
  MODULE_ID: 'pf2e-visioner',
  MODULE_TITLE: 'PF2E Visioner',
  VISIBILITY_STATES: {
    observed: { label: 'Observed', icon: 'fas fa-eye' },
    concealed: { label: 'Concealed', icon: 'fas fa-eye-slash' },
    hidden: { label: 'Hidden', icon: 'fas fa-user-secret' },
    undetected: { label: 'Undetected', icon: 'fas fa-ghost' }
  },
  COVER_STATES: {
    none: { label: 'None', icon: 'fas fa-shield-slash', bonusStealth: 0 },
    lesser: { label: 'Lesser Cover', icon: 'fas fa-shield-halved', bonusStealth: 1 },
    standard: { label: 'Standard Cover', icon: 'fas fa-shield', bonusStealth: 2 },
    greater: { label: 'Greater Cover', icon: 'fas fa-shield-check', bonusStealth: 4 }
  }
}));

vi.mock('../../scripts/utils.js', () => ({
  getVisibilityBetween: vi.fn().mockReturnValue('observed')
}));

vi.mock('../../scripts/chat/services/data/action-state-config.js', () => ({
  getDesiredOverrideStatesForAction: vi.fn().mockReturnValue(['observed', 'hidden', 'undetected'])
}));

vi.mock('../../scripts/chat/services/infra/notifications.js', () => ({
  notify: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../scripts/chat/dialogs/base-action-dialog.js', () => ({
  BaseActionDialog: class MockBaseActionDialog {
    constructor(options) {
      this.options = options;
      this.element = {
        querySelector: vi.fn(),
        querySelectorAll: vi.fn().mockReturnValue([])
      };
    }
    
    async _prepareContext() {
      return {};
    }
    
    visibilityConfig(state) {
      return { label: state, icon: 'fas fa-eye' };
    }
    
    buildOverrideStates(desired, outcome) {
      return desired.map(state => ({ value: state, label: state, selected: false }));
    }
    
    applyEncounterFilter(outcomes) {
      return outcomes;
    }
    
    buildCommonContext(outcomes) {
      return { changesCount: outcomes.length, totalCount: outcomes.length };
    }
    
    getOutcomeClass(outcome) {
      return `outcome-${outcome}`;
    }
    
    getOutcomeLabel(outcome) {
      return outcome;
    }
    
    formatMargin(margin) {
      return `${margin > 0 ? '+' : ''}${margin}`;
    }
    
    resolveTokenImage(token) {
      return token?.texture?.src || 'default.png';
    }
    
    updateActionButtonsForToken() {}
    
    render() {}
    
    close() {}
  }
}));

// Mock position tracker
const mockPositionTracker = {
  captureStartPositions: vi.fn().mockResolvedValue(new Map()),
  calculateEndPositions: vi.fn().mockResolvedValue(new Map()),
  analyzePositionTransitions: vi.fn().mockReturnValue(new Map()),
  getSystemDiagnostics: vi.fn().mockReturnValue({
    avs: { available: true },
    autoCover: { available: true }
  })
};

vi.mock('../../scripts/chat/services/position/SneakPositionTracker.js', () => ({
  default: mockPositionTracker
}));

// Import the class under test
import { SneakPreviewDialog } from '../../scripts/chat/dialogs/sneak-preview-dialog.js';

describe('Enhanced Sneak Preview Dialog with Position Display Components', () => {
  let dialog;
  let mockSneakingToken;
  let mockOutcomes;
  let mockSneakData;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock sneaking token
    mockSneakingToken = {
      id: 'sneaking-token-1',
      name: 'Sneaky Rogue',
      texture: { src: 'rogue.png' },
      center: { x: 100, y: 100 },
      document: { id: 'sneaking-token-1' }
    };

    // Create mock outcomes with position data
    mockOutcomes = [
      {
        token: {
          id: 'observer-1',
          name: 'Guard',
          texture: { src: 'guard.png' }
        },
        rollTotal: 15,
        dc: 12,
        margin: 3,
        outcome: 'success',
        oldVisibility: 'observed',
        newVisibility: 'hidden',
        positionTransition: {
          targetId: 'observer-1',
          hasChanged: true,
          transitionType: 'improved',
          avsVisibilityChanged: true,
          coverStateChanged: true,
          stealthBonusChange: 2,
          impactOnDC: -1,
          startPosition: {
            avsVisibility: 'observed',
            coverState: 'none',
            stealthBonus: 0,
            distance: 25,
            lightingConditions: 'bright',
            avsCalculated: true,
            coverCalculated: true,
            systemErrors: []
          },
          endPosition: {
            avsVisibility: 'concealed',
            coverState: 'standard',
            stealthBonus: 2,
            distance: 30,
            lightingConditions: 'dim',
            avsCalculated: true,
            coverCalculated: true,
            systemErrors: []
          }
        }
      },
      {
        token: {
          id: 'observer-2',
          name: 'Archer',
          texture: { src: 'archer.png' }
        },
        rollTotal: 10,
        dc: 14,
        margin: -4,
        outcome: 'failure',
        oldVisibility: 'observed',
        newVisibility: 'observed',
        positionTransition: {
          targetId: 'observer-2',
          hasChanged: false,
          transitionType: 'unchanged',
          avsVisibilityChanged: false,
          coverStateChanged: false,
          stealthBonusChange: 0,
          impactOnDC: 0,
          startPosition: {
            avsVisibility: 'observed',
            coverState: 'none',
            stealthBonus: 0,
            distance: 20,
            lightingConditions: 'bright',
            avsCalculated: true,
            coverCalculated: true,
            systemErrors: []
          },
          endPosition: {
            avsVisibility: 'observed',
            coverState: 'none',
            stealthBonus: 0,
            distance: 20,
            lightingConditions: 'bright',
            avsCalculated: true,
            coverCalculated: true,
            systemErrors: []
          }
        }
      }
    ];

    mockSneakData = {
      actor: mockSneakingToken,
      actionType: 'sneak',
      roll: { total: 15 }
    };
  });

  afterEach(() => {
    if (dialog) {
      dialog.close();
      dialog = null;
    }
  });

  describe('Dialog Construction and Initialization', () => {
    it('should create enhanced dialog with position tracking properties', () => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);

      expect(dialog.sneakingToken).toBe(mockSneakingToken);
      expect(dialog.outcomes).toEqual(mockOutcomes);
      expect(dialog.positionTracker).toBe(mockPositionTracker);
      expect(dialog._positionTransitions).toBeInstanceOf(Map);
      expect(dialog._hasPositionData).toBe(false);
      expect(dialog._positionDisplayMode).toBe('enhanced');
      expect(dialog.options.classes).toContain('enhanced-position-tracking');
      expect(dialog.options.position.width).toBe(850);
    });

    it('should include position display actions in DEFAULT_OPTIONS', () => {
      expect(SneakPreviewDialog.DEFAULT_OPTIONS.actions).toHaveProperty('togglePositionDisplay');
      expect(SneakPreviewDialog.DEFAULT_OPTIONS.actions).toHaveProperty('showPositionDetails');
    });
  });

  describe('Position Data Extraction and Processing', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
    });

    it('should extract position transitions from outcomes', async () => {
      await dialog._extractPositionTransitions(mockOutcomes);

      expect(dialog._positionTransitions.size).toBe(2);
      expect(dialog._hasPositionData).toBe(true);
      expect(dialog._positionTransitions.get('observer-1')).toBe(mockOutcomes[0].positionTransition);
      expect(dialog._positionTransitions.get('observer-2')).toBe(mockOutcomes[1].positionTransition);
    });

    it('should get position transition for specific token', async () => {
      await dialog._extractPositionTransitions(mockOutcomes);
      
      const transition = dialog._getPositionTransitionForToken({ id: 'observer-1' });
      expect(transition).toBe(mockOutcomes[0].positionTransition);
      
      const noTransition = dialog._getPositionTransitionForToken({ id: 'nonexistent' });
      expect(noTransition).toBeNull();
    });

    it('should handle outcomes without position data gracefully', async () => {
      const outcomesWithoutPosition = [
        {
          token: { id: 'observer-3', name: 'Wizard' },
          outcome: 'success'
        }
      ];

      await dialog._extractPositionTransitions(outcomesWithoutPosition);

      expect(dialog._positionTransitions.size).toBe(0);
      expect(dialog._hasPositionData).toBe(false);
    });
  });

  describe('Position Display Data Preparation', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
    });

    it('should prepare position display data for outcomes with transitions', () => {
      const positionTransition = mockOutcomes[0].positionTransition;
      const displayData = dialog._preparePositionDisplay(positionTransition);

      expect(displayData).toBeDefined();
      expect(displayData.hasChanged).toBe(true);
      expect(displayData.transitionType).toBe('improved');
      expect(displayData.transitionClass).toBe('position-improved');
      expect(displayData.transitionIcon).toBe('fas fa-arrow-up');

      expect(displayData.startPosition).toBeDefined();
      expect(displayData.startPosition.visibility).toBe('observed');
      expect(displayData.startPosition.cover).toBe('none');
      expect(displayData.startPosition.stealthBonus).toBe(0);

      expect(displayData.endPosition).toBeDefined();
      expect(displayData.endPosition.visibility).toBe('concealed');
      expect(displayData.endPosition.cover).toBe('standard');
      expect(displayData.endPosition.stealthBonus).toBe(2);

      expect(displayData.changes).toBeDefined();
      expect(displayData.changes.visibility).toBe(true);
      expect(displayData.changes.cover).toBe(true);
      expect(displayData.changes.stealthBonus).toBe(2);

      expect(displayData.impact).toBeDefined();
      expect(displayData.impact.stealthBonusChange).toBe(2);
      expect(displayData.impact.overallImpact).toBe('positive');
    });

    it('should return null for outcomes without position transitions', () => {
      const displayData = dialog._preparePositionDisplay(null);
      expect(displayData).toBeNull();
    });

    it('should handle unchanged positions correctly', () => {
      const positionTransition = mockOutcomes[1].positionTransition;
      const displayData = dialog._preparePositionDisplay(positionTransition);

      expect(displayData.hasChanged).toBe(false);
      expect(displayData.transitionType).toBe('unchanged');
      expect(displayData.transitionClass).toBe('position-unchanged');
      expect(displayData.impact.overallImpact).toBe('neutral');
    });
  });

  describe('Position Quality Assessment', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
    });

    it('should assess excellent position quality', () => {
      const excellentPosition = {
        avsVisibility: 'undetected',
        coverState: 'greater',
        lightingConditions: 'darkness',
        distance: 70
      };

      const quality = dialog._assessPositionQuality(excellentPosition);
      expect(quality).toBe('excellent');
    });

    it('should assess poor position quality', () => {
      const poorPosition = {
        avsVisibility: 'observed',
        coverState: 'none',
        lightingConditions: 'bright',
        distance: 15
      };

      const quality = dialog._assessPositionQuality(poorPosition);
      expect(quality).toBe('poor');
    });

    it('should handle unknown position gracefully', () => {
      const quality = dialog._assessPositionQuality(null);
      expect(quality).toBe('unknown');
    });
  });

  describe('Enhanced Context Preparation', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
      
      // Mock the filterOutcomesByAllies import
      vi.doMock('../../scripts/chat/services/infra/shared-utils.js', () => ({
        filterOutcomesByAllies: vi.fn((outcomes) => outcomes)
      }));
    });

    it('should prepare enhanced context with position data', async () => {
      const context = await dialog._prepareContext({});

      expect(context.sneaker.actionLabel).toBe('Enhanced sneak action results with position tracking');
      expect(context.hasPositionData).toBe(true);
      expect(context.positionDisplayMode).toBe('enhanced');
      expect(context.positionSummary).toBeDefined();
      expect(context.positionSummary.hasData).toBe(true);

      // Check that outcomes have enhanced position properties
      const processedOutcome = context.outcomes[0];
      expect(processedOutcome.hasPositionData).toBe(true);
      expect(processedOutcome.positionDisplay).toBeDefined();
      expect(processedOutcome.positionQuality).toBeDefined();
      expect(processedOutcome.positionChangeType).toBe('improved');
      expect(processedOutcome.positionImpactSummary).toBeDefined();
    });

    it('should generate position summary correctly', async () => {
      const context = await dialog._prepareContext({});
      const summary = context.positionSummary;

      expect(summary.hasData).toBe(true);
      expect(summary.improved).toBe(1);
      expect(summary.worsened).toBe(0);
      expect(summary.unchanged).toBe(1);
      expect(summary.total).toBe(2);
      expect(summary.message).toContain('2 observers analyzed');
      expect(summary.message).toContain('1 improved');
      expect(summary.message).toContain('1 unchanged');
    });
  });

  describe('Position-Aware Override Handling', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
      dialog.outcomes = mockOutcomes;
      
      // Mock DOM elements
      dialog.element = {
        querySelector: vi.fn((selector) => {
          if (selector.includes('override-icons')) {
            return {
              querySelectorAll: vi.fn().mockReturnValue([
                { classList: { remove: vi.fn(), add: vi.fn() }, dataset: { state: 'hidden' } }
              ])
            };
          }
          if (selector.includes('input[name="override.')) {
            return { value: '' };
          }
          if (selector.includes('tr[data-token-id=')) {
            return {
              querySelector: vi.fn((subSelector) => {
                if (subSelector.includes('position-impact-indicator')) {
                  return { className: '', title: '' };
                }
                if (subSelector.includes('position-recommendation')) {
                  return { textContent: '' };
                }
                return null;
              })
            };
          }
          return null;
        }),
        querySelectorAll: vi.fn().mockReturnValue([])
      };
    });

    it('should update position-aware indicators on override state change', () => {
      const mockEvent = {
        currentTarget: {
          closest: vi.fn().mockReturnValue({
            querySelectorAll: vi.fn().mockReturnValue([
              { classList: { remove: vi.fn() } }
            ]),
            querySelector: vi.fn().mockReturnValue({ disabled: false })
          }),
          classList: { add: vi.fn() }
        }
      };

      dialog._onOverrideState(mockEvent, { tokenId: 'observer-1', state: 'hidden' });

      const outcome = dialog.outcomes.find(o => o.token.id === 'observer-1');
      expect(outcome.overrideState).toBe('hidden');
      expect(outcome.hasActionableChange).toBe(true);
    });

    it('should calculate state change impact with position data', () => {
      const positionTransition = mockOutcomes[0].positionTransition;
      const impact = dialog._calculateStateChangeImpact(positionTransition, 'undetected');

      expect(impact).toBeDefined();
      expect(impact.class).toBe('excellent-synergy');
      expect(impact.tooltip).toContain('Excellent synergy with cover');
    });

    it('should handle missing position data gracefully', () => {
      const impact = dialog._calculateStateChangeImpact(null, 'hidden');

      expect(impact.class).toBe('no-data');
      expect(impact.tooltip).toBe('No position data available');
    });
  });

  describe('Position Details Dialog', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
      
      // Mock canvas.tokens.get
      mockFoundryV13.canvas.tokens.get = vi.fn().mockReturnValue({
        id: 'observer-1',
        name: 'Guard'
      });
    });

    it('should render position details content correctly', async () => {
      const positionTransition = mockOutcomes[0].positionTransition;
      const content = await dialog._renderPositionDetailsContent(
        { name: 'Guard' }, 
        positionTransition
      );

      expect(content).toContain('Start Position');
      expect(content).toContain('End Position');
      expect(content).toContain('Impact Analysis');
      expect(content).toContain('Observed');
      expect(content).toContain('Concealed');
      expect(content).toContain('Standard Cover');
      expect(content).toContain('+2'); // Stealth bonus change
    });

    it('should show position details dialog when requested', async () => {
      const mockDialog = vi.fn();
      global.Dialog = mockDialog;

      await dialog._showPositionDetailsDialog('observer-1', mockOutcomes[0].positionTransition);

      expect(mockDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Position Analysis: Guard',
          content: expect.any(String)
        }),
        expect.objectContaining({
          classes: ['pf2e-visioner', 'position-details-dialog']
        })
      );
    });
  });

  describe('Static Event Handlers', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
      // Set the global reference that the static methods use
      global.currentSneakDialog = dialog;
    });

    afterEach(() => {
      global.currentSneakDialog = null;
    });

    it('should handle position display mode toggle', async () => {
      const mockTarget = { dataset: { mode: 'basic' } };
      dialog.render = vi.fn();

      await SneakPreviewDialog._onTogglePositionDisplay({}, mockTarget);

      expect(dialog._positionDisplayMode).toBe('basic');
      expect(dialog.render).toHaveBeenCalledWith({ force: true });
    });

    it('should handle show position details request', async () => {
      const mockTarget = { dataset: { tokenId: 'observer-1' } };
      dialog._getPositionTransitionForToken = vi.fn().mockReturnValue(mockOutcomes[0].positionTransition);
      dialog._showPositionDetailsDialog = vi.fn();

      await SneakPreviewDialog._onShowPositionDetails({}, mockTarget);

      expect(dialog._showPositionDetailsDialog).toHaveBeenCalledWith(
        'observer-1',
        mockOutcomes[0].positionTransition
      );
    });

    it('should warn when no position data available for details', async () => {
      const mockTarget = { dataset: { tokenId: 'nonexistent' } };
      dialog._getPositionTransitionForToken = vi.fn().mockReturnValue(null);
      
      const { notify } = await import('../../scripts/chat/services/infra/notifications.js');

      await SneakPreviewDialog._onShowPositionDetails({}, mockTarget);

      expect(notify.warn).toHaveBeenCalledWith(
        expect.stringContaining('No position data available')
      );
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
    });

    it('should provide correct transition classes and icons', () => {
      expect(dialog._getTransitionClass('improved')).toBe('position-improved');
      expect(dialog._getTransitionClass('worsened')).toBe('position-worsened');
      expect(dialog._getTransitionClass('unchanged')).toBe('position-unchanged');

      expect(dialog._getTransitionIcon('improved')).toBe('fas fa-arrow-up');
      expect(dialog._getTransitionIcon('worsened')).toBe('fas fa-arrow-down');
      expect(dialog._getTransitionIcon('unchanged')).toBe('fas fa-equals');
    });

    it('should provide correct visibility labels and icons', () => {
      expect(dialog._getVisibilityLabel('undetected')).toBe('Undetected');
      expect(dialog._getVisibilityIcon('hidden')).toBe('fas fa-user-secret');
      expect(dialog._getVisibilityClass('concealed')).toBe('visibility-concealed');
    });

    it('should provide correct cover labels and icons', () => {
      expect(dialog._getCoverLabel('standard')).toBe('Standard Cover');
      expect(dialog._getCoverIcon('greater')).toBe('fas fa-shield-check');
      expect(dialog._getCoverClass('lesser')).toBe('cover-lesser');
    });

    it('should calculate overall impact correctly', () => {
      const positiveTransition = {
        stealthBonusChange: 2,
        transitionType: 'improved'
      };
      expect(dialog._calculateOverallImpact(positiveTransition)).toBe('positive');

      const negativeTransition = {
        stealthBonusChange: -2,
        transitionType: 'worsened'
      };
      expect(dialog._calculateOverallImpact(negativeTransition)).toBe('negative');

      const neutralTransition = {
        stealthBonusChange: 0,
        transitionType: 'unchanged'
      };
      expect(dialog._calculateOverallImpact(neutralTransition)).toBe('neutral');
    });

    it('should generate appropriate recommendations for different states', () => {
      const mockRecommendations = {
        nextAction: 'Strike while undetected'
      };

      expect(dialog._getRecommendationForState(mockRecommendations, 'undetected'))
        .toBe('Strike while undetected');
      expect(dialog._getRecommendationForState(mockRecommendations, 'hidden'))
        .toBe('Consider another stealth attempt or Hide action');
      expect(dialog._getRecommendationForState(mockRecommendations, 'observed'))
        .toBe('Reposition or take defensive actions');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      dialog = new SneakPreviewDialog(mockSneakingToken, mockOutcomes, [], mockSneakData);
    });

    it('should handle missing DOM elements gracefully', () => {
      dialog.element = {
        querySelector: vi.fn().mockReturnValue(null),
        querySelectorAll: vi.fn().mockReturnValue([])
      };

      const mockEvent = {
        currentTarget: {
          closest: vi.fn().mockReturnValue(null),
          classList: { add: vi.fn() }
        }
      };

      // Should not throw error
      expect(() => {
        dialog._onOverrideState(mockEvent, { tokenId: 'observer-1', state: 'hidden' });
      }).not.toThrow();
    });

    it('should handle outcomes with system errors', () => {
      const outcomeWithErrors = {
        ...mockOutcomes[0],
        positionTransition: {
          ...mockOutcomes[0].positionTransition,
          startPosition: {
            ...mockOutcomes[0].positionTransition.startPosition,
            systemErrors: ['AVS calculation failed']
          },
          endPosition: {
            ...mockOutcomes[0].positionTransition.endPosition,
            systemErrors: ['Cover detection failed']
          }
        }
      };

      const displayData = dialog._preparePositionDisplay(outcomeWithErrors.positionTransition);
      expect(displayData).toBeDefined();
      // Should still work despite errors
    });

    it('should handle empty outcomes array', async () => {
      await dialog._extractPositionTransitions([]);
      expect(dialog._positionTransitions.size).toBe(0);
      expect(dialog._hasPositionData).toBe(false);
    });

    it('should handle malformed position transition data', () => {
      const malformedTransition = {
        targetId: 'observer-1',
        // Missing required properties
      };

      // Should not throw error
      expect(() => {
        dialog._preparePositionDisplay(malformedTransition);
      }).not.toThrow();
    });
  });
});