/**
 * Unit tests for Enhanced AVS Override Integration with Position Data
 * Tests the integration between AVS overrides and position-aware sneak results
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import enhancedAVSOverrideService from '../../scripts/services/enhanced-avs-override-service.js';
import { SneakActionHandler } from '../../scripts/chat/services/actions/sneak-action.js';
import { SneakPreviewDialog } from '../../scripts/chat/dialogs/sneak-preview-dialog.js';

// Mock FoundryVTT v13 APIs
const mockFoundryV13 = {
  game: {
    settings: {
      get: vi.fn(() => false)
    }
  },
  canvas: {
    tokens: {
      placeables: []
    },
    grid: {
      measureDistances: vi.fn(() => [30])
    },
    walls: {
      checkCollision: vi.fn(() => false)
    },
    lighting: {
      getIllumination: vi.fn(() => 0.5)
    }
  },
  ui: {
    notifications: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  },
  Dialog: {
    prompt: vi.fn(() => Promise.resolve()),
    confirm: vi.fn(() => Promise.resolve(true))
  }
};

// Mock token with v13 document API
const createMockToken = (id, name) => ({
  id,
  name,
  document: {
    id,
    getFlag: vi.fn(() => ({})),
    setFlag: vi.fn(() => Promise.resolve()),
    unsetFlag: vi.fn(() => Promise.resolve())
  },
  center: { x: 100, y: 100 },
  actor: { id: `actor-${id}` }
});

// Mock position state data
const createMockPositionState = (overrides = {}) => ({
  avsVisibility: 'concealed',
  avsCalculated: true,
  avsOverride: null,
  coverState: 'standard',
  coverCalculated: true,
  coverOverride: null,
  stealthBonus: 2,
  effectiveVisibility: 'concealed',
  distance: 30,
  hasLineOfSight: true,
  lightingConditions: 'dim',
  timestamp: Date.now(),
  avsEnabled: true,
  autoCoverEnabled: true,
  systemErrors: [],
  ...overrides
});

// Mock position transition data
const createMockPositionTransition = (overrides = {}) => ({
  targetId: 'observer-1',
  startPosition: createMockPositionState({ avsVisibility: 'observed', coverState: 'none', stealthBonus: 0 }),
  endPosition: createMockPositionState({ avsVisibility: 'concealed', coverState: 'standard', stealthBonus: 2 }),
  hasChanged: true,
  avsVisibilityChanged: true,
  coverStateChanged: true,
  impactOnDC: -2,
  stealthBonusChange: 2,
  transitionType: 'improved',
  avsTransition: {
    from: 'observed',
    to: 'concealed',
    changed: true
  },
  coverTransition: {
    from: 'none',
    to: 'standard',
    bonusChange: 2,
    changed: true
  },
  ...overrides
});

describe('Enhanced AVS Override Integration', () => {
  let observerToken, targetToken, sneakHandler;

  beforeEach(() => {
    // Set up global mocks
    global.game = mockFoundryV13.game;
    global.canvas = mockFoundryV13.canvas;
    global.ui = mockFoundryV13.ui;
    global.Dialog = mockFoundryV13.Dialog;

    // Create mock tokens
    observerToken = createMockToken('observer-1', 'Observer');
    targetToken = createMockToken('target-1', 'Sneaking Actor');
    
    // Create sneak handler instance
    sneakHandler = new SneakActionHandler();

    // Reset service state
    enhancedAVSOverrideService._positionOverrides.clear();
    enhancedAVSOverrideService._conflictResolutions.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Position-Aware Override Setting', () => {
    it('should set position-aware override with valid position context', async () => {
      const positionContext = {
        startPosition: createMockPositionState({ avsVisibility: 'observed' }),
        endPosition: createMockPositionState({ avsVisibility: 'concealed' }),
        transitionType: 'improved'
      };

      const success = await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        positionContext,
        'test-override'
      );

      expect(success).toBe(true);
      expect(observerToken.document.setFlag).toHaveBeenCalledWith(
        expect.any(String),
        'position-aware-overrides',
        expect.objectContaining({
          [`${observerToken.id}->${targetToken.id}`]: expect.objectContaining({
            targetId: targetToken.id,
            visibilityState: 'hidden',
            isPositionBased: true,
            overrideReason: 'test-override'
          })
        })
      );
    });

    it('should reject invalid visibility states', async () => {
      const success = await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'invalid-state',
        null,
        'test'
      );

      expect(success).toBe(false);
      expect(observerToken.document.setFlag).not.toHaveBeenCalled();
    });

    it('should handle missing tokens gracefully', async () => {
      const success = await enhancedAVSOverrideService.setPositionAwareOverride(
        null,
        targetToken,
        'hidden',
        null,
        'test'
      );

      expect(success).toBe(false);
    });
  });

  describe('Position-Based Override Application', () => {
    it('should apply override considering position transition', async () => {
      const positionTransition = createMockPositionTransition();

      const success = await enhancedAVSOverrideService.applyPositionBasedOverride(
        observerToken,
        targetToken,
        'hidden',
        positionTransition
      );

      expect(success).toBe(true);
      expect(observerToken.document.setFlag).toHaveBeenCalled();
    });

    it('should detect conflicts between position and override', async () => {
      // Create transition that improved position but override makes it worse
      const positionTransition = createMockPositionTransition({
        transitionType: 'improved',
        endPosition: createMockPositionState({ avsVisibility: 'hidden' })
      });

      const success = await enhancedAVSOverrideService.applyPositionBasedOverride(
        observerToken,
        targetToken,
        'observed', // Conflicts with improved position
        positionTransition
      );

      // Should still succeed but log conflict
      expect(success).toBe(true);
      
      // Check if conflict was detected and stored
      const conflict = enhancedAVSOverrideService.getConflictResolution(observerToken, targetToken);
      expect(conflict).toBeTruthy();
      expect(conflict.hasConflict).toBe(true);
    });

    it('should require complete position data', async () => {
      const incompleteTransition = {
        startPosition: createMockPositionState(),
        // Missing endPosition
        transitionType: 'improved'
      };

      const success = await enhancedAVSOverrideService.applyPositionBasedOverride(
        observerToken,
        targetToken,
        'hidden',
        incompleteTransition
      );

      expect(success).toBe(false);
    });
  });

  describe('Override Validation', () => {
    it('should validate override consistency with position data', async () => {
      const positionContext = {
        endPosition: createMockPositionState({ 
          avsVisibility: 'concealed',
          coverState: 'standard',
          stealthBonus: 2
        })
      };

      const validationResult = await enhancedAVSOverrideService._validateOverrideConsistency(
        observerToken,
        targetToken,
        'concealed', // Matches calculated state
        positionContext
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.severity).toBe('info');
      expect(validationResult.issues).toHaveLength(0);
    });

    it('should detect conflicts with calculated position', async () => {
      const positionContext = {
        endPosition: createMockPositionState({ 
          avsVisibility: 'hidden',
          coverState: 'greater',
          stealthBonus: 4
        })
      };

      const validationResult = await enhancedAVSOverrideService._validateOverrideConsistency(
        observerToken,
        targetToken,
        'observed', // Conflicts with calculated hidden state
        positionContext
      );

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.severity).toBe('error');
      expect(validationResult.issues.length).toBeGreaterThan(0);
    });

    it('should warn about ignoring cover bonuses', async () => {
      const positionContext = {
        endPosition: createMockPositionState({ 
          coverState: 'standard',
          stealthBonus: 3 // Significant bonus
        })
      };

      const validationResult = await enhancedAVSOverrideService._validateOverrideConsistency(
        observerToken,
        targetToken,
        'observed', // Ignores cover bonus
        positionContext
      );

      expect(validationResult.severity).toBe('warning');
      expect(validationResult.issues.some(issue => issue.includes('cover bonus'))).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflicts by accepting override', async () => {
      // Set up a conflict
      const conflictKey = `${observerToken.id}->${targetToken.id}`;
      enhancedAVSOverrideService._conflictResolutions.set(conflictKey, {
        hasConflict: true,
        conflictType: 'moderate',
        recommendedAction: 'review'
      });

      const success = await enhancedAVSOverrideService.resolveOverrideConflict(
        observerToken,
        targetToken,
        'accept'
      );

      expect(success).toBe(true);
      expect(enhancedAVSOverrideService._conflictResolutions.has(conflictKey)).toBe(false);
    });

    it('should resolve conflicts by rejecting override', async () => {
      // Set up override and conflict
      await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        null,
        'test'
      );

      const conflictKey = `${observerToken.id}->${targetToken.id}`;
      enhancedAVSOverrideService._conflictResolutions.set(conflictKey, {
        hasConflict: true,
        conflictType: 'critical'
      });

      const success = await enhancedAVSOverrideService.resolveOverrideConflict(
        observerToken,
        targetToken,
        'reject'
      );

      expect(success).toBe(true);
      expect(observerToken.document.unsetFlag).toHaveBeenCalled();
    });

    it('should resolve conflicts by modifying override', async () => {
      const conflictKey = `${observerToken.id}->${targetToken.id}`;
      enhancedAVSOverrideService._conflictResolutions.set(conflictKey, {
        hasConflict: true,
        conflictType: 'moderate'
      });

      const success = await enhancedAVSOverrideService.resolveOverrideConflict(
        observerToken,
        targetToken,
        'modify',
        'concealed'
      );

      expect(success).toBe(true);
      expect(observerToken.document.setFlag).toHaveBeenCalledWith(
        expect.any(String),
        'position-aware-overrides',
        expect.objectContaining({
          [`${observerToken.id}->${targetToken.id}`]: expect.objectContaining({
            visibilityState: 'concealed',
            overrideReason: 'conflict-resolution'
          })
        })
      );
    });
  });

  describe('Sneak Action Handler Integration', () => {
    it('should apply position-aware override through sneak handler', async () => {
      const outcome = {
        token: observerToken,
        positionTransition: createMockPositionTransition()
      };

      const success = await sneakHandler.applyPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        outcome
      );

      expect(success).toBe(true);
    });

    it('should validate sneak override with position context', async () => {
      const outcome = {
        token: observerToken,
        outcome: 'success',
        margin: 5,
        positionTransition: createMockPositionTransition()
      };

      const validationResult = await sneakHandler.validateSneakOverride(
        observerToken,
        targetToken,
        'concealed',
        outcome
      );

      expect(validationResult).toBeTruthy();
      expect(validationResult.canApply).toBeDefined();
    });

    it('should detect sneak-specific validation issues', async () => {
      const outcome = {
        token: observerToken,
        outcome: 'critical-success',
        margin: 15,
        positionTransition: createMockPositionTransition()
      };

      const validationResult = await sneakHandler.validateSneakOverride(
        observerToken,
        targetToken,
        'observed', // Conflicts with critical success
        outcome
      );

      expect(validationResult.sneakSpecific.isValid).toBe(false);
      expect(validationResult.canApply).toBe(false);
    });
  });

  describe('Override Data Management', () => {
    it('should retrieve position-aware override data', async () => {
      await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        null,
        'test'
      );

      const override = enhancedAVSOverrideService.getPositionAwareOverride(
        observerToken,
        targetToken
      );

      expect(override).toBeTruthy();
      expect(override.visibilityState).toBe('hidden');
      expect(override.overrideReason).toBe('test');
    });

    it('should remove position-aware overrides', async () => {
      await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        null,
        'test'
      );

      const success = await enhancedAVSOverrideService.removePositionAwareOverride(
        observerToken,
        targetToken
      );

      expect(success).toBe(true);
      expect(observerToken.document.unsetFlag).toHaveBeenCalled();
    });

    it('should clear all position-aware overrides for a token', async () => {
      await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        null,
        'test'
      );

      const success = await enhancedAVSOverrideService.clearAllPositionAwareOverrides(observerToken);

      expect(success).toBe(true);
      expect(observerToken.document.unsetFlag).toHaveBeenCalledWith(
        expect.any(String),
        'position-aware-overrides'
      );
    });
  });

  describe('Position Impact Analysis', () => {
    it('should analyze position impact on override decision', () => {
      const positionTransition = createMockPositionTransition({
        transitionType: 'improved',
        stealthBonusChange: 3,
        endPosition: createMockPositionState({ avsVisibility: 'hidden' })
      });

      const impact = enhancedAVSOverrideService._analyzePositionImpactOnOverride(
        positionTransition,
        'hidden'
      );

      expect(impact.transitionType).toBe('improved');
      expect(impact.stealthBonusChange).toBe(3);
      expect(impact.coverImproved).toBe(true);
      expect(impact.overrideJustified).toBe(true);
    });

    it('should detect unjustified overrides', () => {
      const positionTransition = createMockPositionTransition({
        transitionType: 'improved',
        endPosition: createMockPositionState({ avsVisibility: 'hidden' })
      });

      const impact = enhancedAVSOverrideService._analyzePositionImpactOnOverride(
        positionTransition,
        'observed' // Worse than calculated state despite improvement
      );

      expect(impact.overrideJustified).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      // Mock validation to throw error
      const originalValidate = enhancedAVSOverrideService._validateOverrideConsistency;
      enhancedAVSOverrideService._validateOverrideConsistency = vi.fn(() => {
        throw new Error('Validation failed');
      });

      const success = await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        { endPosition: createMockPositionState() },
        'test'
      );

      expect(success).toBe(false);

      // Restore original method
      enhancedAVSOverrideService._validateOverrideConsistency = originalValidate;
    });

    it('should handle document flag errors', async () => {
      // Mock setFlag to fail
      observerToken.document.setFlag = vi.fn(() => Promise.reject(new Error('Flag error')));

      const success = await enhancedAVSOverrideService.setPositionAwareOverride(
        observerToken,
        targetToken,
        'hidden',
        null,
        'test'
      );

      expect(success).toBe(false);
    });
  });
});

describe('Sneak Preview Dialog Position-Aware Override Integration', () => {
  let dialog, observerToken, targetToken, mockOutcomes;

  beforeEach(() => {
    // Set up global mocks
    global.game = mockFoundryV13.game;
    global.canvas = mockFoundryV13.canvas;
    global.ui = mockFoundryV13.ui;
    global.Dialog = mockFoundryV13.Dialog;

    observerToken = createMockToken('observer-1', 'Observer');
    targetToken = createMockToken('target-1', 'Sneaking Actor');

    mockOutcomes = [{
      token: observerToken,
      outcome: 'success',
      margin: 5,
      positionTransition: createMockPositionTransition(),
      hasPositionData: true
    }];

    dialog = new SneakPreviewDialog(targetToken, mockOutcomes, [], {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Position-Aware Override Handling', () => {
    it('should validate override before application', async () => {
      const mockTarget = {
        dataset: {
          tokenId: observerToken.id,
          state: 'hidden'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };

      // Mock validation to return valid result
      const validationSpy = vi.spyOn(dialog, '_validatePositionAwareOverride')
        .mockResolvedValue({
          canApply: true,
          isValid: true,
          severity: 'info'
        });

      const applySpy = vi.spyOn(dialog, '_applyPositionAwareOverride')
        .mockResolvedValue(true);

      await dialog._onPositionAwareOverride(mockEvent, mockTarget);

      expect(validationSpy).toHaveBeenCalled();
      expect(applySpy).toHaveBeenCalled();
    });

    it('should show warning for invalid overrides', async () => {
      const mockTarget = {
        dataset: {
          tokenId: observerToken.id,
          state: 'observed'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      };

      // Mock validation to return invalid result
      vi.spyOn(dialog, '_validatePositionAwareOverride')
        .mockResolvedValue({
          canApply: false,
          isValid: false,
          severity: 'error',
          issues: ['Critical conflict detected']
        });

      const warningSpy = vi.spyOn(dialog, '_showOverrideValidationWarning')
        .mockResolvedValue();

      await dialog._onPositionAwareOverride(mockEvent, mockTarget);

      expect(warningSpy).toHaveBeenCalled();
    });

    it('should update UI after successful override', async () => {
      const mockTarget = {
        dataset: {
          tokenId: observerToken.id,
          state: 'concealed'
        },
        classList: {
          add: vi.fn()
        },
        closest: vi.fn(() => ({
          querySelector: vi.fn(() => ({
            querySelectorAll: vi.fn(() => []),
            querySelector: vi.fn(() => ({ value: '' })),
            parentElement: {
              querySelector: vi.fn(() => ({ textContent: '', className: '' }))
            }
          }))
        }))
      };

      const validationResult = {
        canApply: true,
        isValid: true,
        severity: 'info'
      };

      await dialog._updateOverrideUI(mockTarget, 'concealed', validationResult);

      expect(mockTarget.classList.add).toHaveBeenCalledWith('selected');
    });
  });

  describe('Position Details Display', () => {
    it('should show position details dialog', async () => {
      const mockTarget = {
        dataset: {
          tokenId: observerToken.id
        }
      };

      const mockEvent = {
        preventDefault: vi.fn()
      };

      // Mock the position details dialog
      const mockPositionDialog = {
        render: vi.fn()
      };

      // Mock dynamic import
      const originalImport = global.import;
      global.import = vi.fn(() => Promise.resolve({
        PositionDetailsDialog: vi.fn(() => mockPositionDialog)
      }));

      await dialog._onShowPositionDetails(mockEvent, mockTarget);

      expect(mockPositionDialog.render).toHaveBeenCalledWith(true);

      // Restore original import
      global.import = originalImport;
    });

    it('should handle missing position data gracefully', async () => {
      const mockTarget = {
        dataset: {
          tokenId: 'nonexistent-token'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn()
      };

      await dialog._onShowPositionDetails(mockEvent, mockTarget);

      expect(mockFoundryV13.ui.notifications.warn).toHaveBeenCalledWith(
        'No position data available for this observer'
      );
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve override conflicts', async () => {
      const mockTarget = {
        dataset: {
          tokenId: observerToken.id,
          resolution: 'accept'
        },
        closest: vi.fn(() => ({
          remove: vi.fn()
        }))
      };

      const mockEvent = {
        preventDefault: vi.fn()
      };

      // Mock sneak handler
      const mockSneakHandler = {
        resolveSneakOverrideConflict: vi.fn(() => Promise.resolve(true))
      };

      // Mock dynamic import
      const originalImport = global.import;
      global.import = vi.fn(() => Promise.resolve({
        SneakActionHandler: vi.fn(() => mockSneakHandler)
      }));

      await dialog._onResolveOverrideConflict(mockEvent, mockTarget);

      expect(mockSneakHandler.resolveSneakOverrideConflict).toHaveBeenCalledWith(
        observerToken,
        targetToken,
        'accept',
        undefined
      );

      // Restore original import
      global.import = originalImport;
    });
  });
});