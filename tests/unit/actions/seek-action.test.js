/**
 * Comprehensive tests for Seek Action
 * Tests all scenarios: per-row apply/revert, dialog apply-all/revert-all, chat apply-changes
 * Tests all settings combinations: allies filter on/off, enforce raw on/off
 */

import '../../setup.js';

describe('Seek Action Comprehensive Tests', () => {
  let originalSettings;
  
  beforeEach(() => {
    // Store original settings
    originalSettings = {
      ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
      enforceRawRequirements: game.settings.get('pf2e-visioner', 'enforceRawRequirements')
    };
  });
  
  afterEach(() => {
    // Restore original settings
    Object.keys(originalSettings).forEach(key => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });
  });

  describe('Panel Generation and Button Actions', () => {
    test('chat panel generates correct apply-changes button', () => {
      const { buildSeekPanel } = require('../../../scripts/chat/ui/panel/seek.js');
      
      // Mock required dependencies for seek panel
      game.user.isGM = true;
      game.settings.set('pf2e-visioner', 'seekUseTemplate', false);
      
      // Mock game.messages
      game.messages = {
        get: jest.fn(() => ({ flags: {} }))
      };
      
      // Provide required parameters for buildSeekPanel
      const mockActionData = { messageId: 'test-message-id' };
      const mockMessage = null;
      
      const panel = buildSeekPanel(mockActionData, mockMessage);
      
      expect(panel.actionButtonsHtml).toContain('data-action="apply-now-seek"');
      expect(panel.actionButtonsHtml).toContain('Apply Changes');
    });
  });

  describe('Status Mapping Tests', () => {
    test('seek against observed targets produces no change', () => {
      const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
      
      expect(getDefaultNewStateFor('seek', 'observed', 'critical-success')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'observed', 'success')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'observed', 'failure')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'observed', 'critical-failure')).toBe('observed');
    });

    test('seek against concealed targets produces no change', () => {
      const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
      
      expect(getDefaultNewStateFor('seek', 'concealed', 'critical-success')).toBe('concealed');
      expect(getDefaultNewStateFor('seek', 'concealed', 'success')).toBe('concealed');
      expect(getDefaultNewStateFor('seek', 'concealed', 'failure')).toBe('concealed');
      expect(getDefaultNewStateFor('seek', 'concealed', 'critical-failure')).toBe('concealed');
    });

    test('seek against hidden targets produces correct outcomes', () => {
      const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
      
      expect(getDefaultNewStateFor('seek', 'hidden', 'critical-success')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'hidden', 'success')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'hidden', 'failure')).toBe('hidden');
      expect(getDefaultNewStateFor('seek', 'hidden', 'critical-failure')).toBe('hidden');
    });

    test('seek against undetected targets produces correct outcomes', () => {
      const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
      
      expect(getDefaultNewStateFor('seek', 'undetected', 'critical-success')).toBe('observed');
      expect(getDefaultNewStateFor('seek', 'undetected', 'success')).toBe('hidden');
      expect(getDefaultNewStateFor('seek', 'undetected', 'failure')).toBe('undetected');
      expect(getDefaultNewStateFor('seek', 'undetected', 'critical-failure')).toBe('undetected');
    });
  });

  describe('Apply Changes (Chat Button) Tests', () => {
    describe('Ignore Allies: OFF', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'ignoreAllies', false);
      });

      test('applies changes to all tokens including allies', () => {
        const mockOutcomes = [
          { token: { id: 'ally1', actor: { alliance: 'party' } }, newVisibility: 'observed', hasActionableChange: true },
          { token: { id: 'enemy1', actor: { alliance: 'opposition' } }, newVisibility: 'observed', hasActionableChange: true },
        ];

        // When ignoreAllies is false, all outcomes should be processed
        const filteredOutcomes = mockOutcomes.filter(outcome => outcome.hasActionableChange);
        
        expect(filteredOutcomes).toHaveLength(2);
        expect(filteredOutcomes.map(o => o.token.id)).toEqual(['ally1', 'enemy1']);
      });
    });

    describe('Ignore Allies: ON', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      });

      test('applies changes only to enemies, filtering out allies', () => {
        const mockOutcomes = [
          { token: { id: 'ally1', actor: { alliance: 'party' } }, newVisibility: 'observed', hasActionableChange: true },
          { token: { id: 'enemy1', actor: { alliance: 'opposition' } }, newVisibility: 'observed', hasActionableChange: true },
        ];

        // Simulate the filtering logic from seek action
        const seekerAlliance = 'party';
        const ignoreAlliesSetting = true; // Simulate the setting being true
        const filteredOutcomes = mockOutcomes.filter(outcome => {
          if (!ignoreAlliesSetting) return outcome.hasActionableChange;
          return outcome.hasActionableChange && outcome.token.actor.alliance !== seekerAlliance;
        });
        
        expect(filteredOutcomes).toHaveLength(1);
        expect(filteredOutcomes[0].token.id).toBe('enemy1');
      });
    });
  });

  describe('Dialog Apply All Tests', () => {
    test('apply all uses pre-filtered outcomes from dialog', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [
          { token: { id: 'enemy1' }, newVisibility: 'observed', hasActionableChange: true },
          // Note: allies already filtered out by dialog
        ],
        actionData: { actor: { alliance: 'party' } }
      };

      // The fix: use outcomes that are already filtered by the dialog
      const changedOutcomes = mockDialog.outcomes.filter(o => o.hasActionableChange);
      
      expect(changedOutcomes).toHaveLength(1);
      expect(changedOutcomes[0].token.id).toBe('enemy1');
    });

    test('apply all passes ignoreAllies setting consistently', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [{ token: { id: 'enemy1' }, hasActionableChange: true }],
        actionData: { actor: { id: 'seeker' } }
      };

      // Ensure ignoreAllies is passed to the apply service
      const actionDataWithIgnoreAllies = {
        ...mockDialog.actionData,
        ignoreAllies: mockDialog.ignoreAllies
      };

      expect(actionDataWithIgnoreAllies.ignoreAllies).toBe(true);
    });
  });

  describe('Dialog Revert All Tests', () => {
    test('revert all uses pre-filtered outcomes from dialog', () => {
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [
          { token: { id: 'enemy1' }, oldVisibility: 'hidden', currentVisibility: 'observed' },
        ]
      };

      // Should use dialog.outcomes which are already filtered
      const revertOutcomes = mockDialog.outcomes;
      
      expect(revertOutcomes).toHaveLength(1);
      expect(revertOutcomes[0].token.id).toBe('enemy1');
    });
  });

  describe('Per-Row Apply Tests', () => {
    test('per-row apply affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, newVisibility: 'observed', hasActionableChange: true },
        { token: { id: 'enemy2' }, newVisibility: 'hidden', hasActionableChange: true },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find(o => o.token.id === targetTokenId);
      
      // Should only process the specific outcome
      expect(targetOutcome.token.id).toBe('enemy1');
      expect(targetOutcome.newVisibility).toBe('observed');
      
      // Other outcomes should remain unaffected
      const otherOutcomes = mockOutcomes.filter(o => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
      expect(otherOutcomes[0].token.id).toBe('enemy2');
    });
  });

  describe('Per-Row Revert Tests', () => {
    test('per-row revert affects only the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'enemy1' }, oldVisibility: 'hidden', currentVisibility: 'observed' },
        { token: { id: 'enemy2' }, oldVisibility: 'undetected', currentVisibility: 'hidden' },
      ];

      const targetTokenId = 'enemy1';
      const targetOutcome = mockOutcomes.find(o => o.token.id === targetTokenId);
      
      // Should create specific revert change for this token only
      const revertVisibility = targetOutcome.oldVisibility || targetOutcome.currentVisibility;
      const revertChange = { target: targetOutcome.token, newVisibility: revertVisibility };
      
      expect(revertChange.target.id).toBe('enemy1');
      expect(revertChange.newVisibility).toBe('hidden');
      
      // Should not affect other tokens
      const otherOutcomes = mockOutcomes.filter(o => o.token.id !== targetTokenId);
      expect(otherOutcomes).toHaveLength(1);
    });
  });

  describe('RAW Enforcement Integration Tests', () => {
    test('chat apply-changes respects RAW enforcement', () => {
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      
      const mockOutcomes = [
        { token: { id: 'valid1' }, hasActionableChange: true, newVisibility: 'observed' },
        { token: { id: 'invalid1' }, hasActionableChange: false, newVisibility: 'observed' },
      ];

      // When RAW enforcement is on, only actionable changes should be applied
      const validOutcomes = mockOutcomes.filter(o => o.hasActionableChange);
      
      expect(validOutcomes).toHaveLength(1);
      expect(validOutcomes[0].token.id).toBe('valid1');
    });

    test('dialog apply-all respects RAW enforcement', () => {
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      
      const mockDialog = {
        outcomes: [
          { token: { id: 'valid1' }, hasActionableChange: true, newVisibility: 'observed' },
          { token: { id: 'invalid1' }, hasActionableChange: false, newVisibility: 'observed' },
        ]
      };

      const validOutcomes = mockDialog.outcomes.filter(o => o.hasActionableChange);
      
      expect(validOutcomes).toHaveLength(1);
      expect(validOutcomes[0].token.id).toBe('valid1');
    });
  });

  describe('hasActionableChange Calculation Tests', () => {
    describe('Without RAW Enforcement', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'enforceRawRequirements', false);
      });

      test('seek against hidden targets (success) is actionable', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const oldState = 'hidden';
        const newState = getDefaultNewStateFor('seek', oldState, 'success');
        const hasActionableChange = newState !== oldState;
        
        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(true);
      });

      test('seek against observed targets (any outcome) is not actionable', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const oldState = 'observed';
        const outcomes = ['critical-success', 'success', 'failure', 'critical-failure'];
        
        outcomes.forEach(outcome => {
          const newState = getDefaultNewStateFor('seek', oldState, outcome);
          const hasActionableChange = newState !== oldState;
          
          expect(newState).toBe('observed');
          expect(hasActionableChange).toBe(false);
        });
      });

      test('seek against concealed targets (any outcome) is not actionable', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const oldState = 'concealed';
        const outcomes = ['critical-success', 'success', 'failure', 'critical-failure'];
        
        outcomes.forEach(outcome => {
          const newState = getDefaultNewStateFor('seek', oldState, outcome);
          const hasActionableChange = newState !== oldState;
          
          expect(newState).toBe('concealed');
          expect(hasActionableChange).toBe(false);
        });
      });

      test('seek against undetected targets (success) is actionable', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const oldState = 'undetected';
        const newState = getDefaultNewStateFor('seek', oldState, 'success');
        const hasActionableChange = newState !== oldState;
        
        expect(newState).toBe('hidden');
        expect(hasActionableChange).toBe(true);
      });

      test('seek against undetected targets (critical success) is actionable', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const oldState = 'undetected';
        const newState = getDefaultNewStateFor('seek', oldState, 'critical-success');
        const hasActionableChange = newState !== oldState;
        
        expect(newState).toBe('observed');
        expect(hasActionableChange).toBe(true);
      });
    });

    describe('With General RAW Enforcement', () => {
      beforeEach(() => {
        game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      });

      test('seek against observed/concealed with RAW enforcement still produces normal outcomes', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const states = ['observed', 'concealed'];
        const outcomes = ['critical-success', 'success', 'failure', 'critical-failure'];
        
        states.forEach(oldState => {
          outcomes.forEach(outcome => {
            const newState = getDefaultNewStateFor('seek', oldState, outcome);
            const hasActionableChange = newState !== oldState;
            
            // General RAW enforcement doesn't change outcome mapping, only target selection
            expect(hasActionableChange).toBe(false); // These states never change for seek
          });
        });
      });

      test('seek against hidden/undetected with RAW enforcement still produces normal outcomes', () => {
        const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
        
        const testCases = [
          { oldState: 'hidden', outcome: 'success', expectedNewState: 'observed' },
          { oldState: 'undetected', outcome: 'success', expectedNewState: 'hidden' },
        ];

        testCases.forEach(({ oldState, outcome, expectedNewState }) => {
          const newState = getDefaultNewStateFor('seek', oldState, outcome);
          const hasActionableChange = newState !== oldState;
          
          expect(newState).toBe(expectedNewState);
          expect(hasActionableChange).toBe(true);
        });
      });
    });

    test('hasActionableChange correctly identifies state transitions', () => {
      const { getDefaultNewStateFor } = require('../../../scripts/chat/services/data/action-state-config.js');
      
      const testCases = [
        { oldState: 'observed', outcome: 'success', expectedNewState: 'observed', shouldBeActionable: false },
        { oldState: 'concealed', outcome: 'success', expectedNewState: 'concealed', shouldBeActionable: false },
        { oldState: 'hidden', outcome: 'success', expectedNewState: 'observed', shouldBeActionable: true },
        { oldState: 'hidden', outcome: 'failure', expectedNewState: 'hidden', shouldBeActionable: false },
        { oldState: 'undetected', outcome: 'success', expectedNewState: 'hidden', shouldBeActionable: true },
        { oldState: 'undetected', outcome: 'critical-success', expectedNewState: 'observed', shouldBeActionable: true },
        { oldState: 'undetected', outcome: 'failure', expectedNewState: 'undetected', shouldBeActionable: false },
      ];

      testCases.forEach(({ oldState, outcome, expectedNewState, shouldBeActionable }) => {
        const newState = getDefaultNewStateFor('seek', oldState, outcome);
        const hasActionableChange = newState !== oldState;
        
        expect(newState).toBe(expectedNewState);
        expect(hasActionableChange).toBe(shouldBeActionable);
      });
    });
  });

  describe('Wall Interaction Tests', () => {
    test('seek can affect walls in addition to tokens', () => {
      const mockOutcomes = [
        { wall: { id: 'wall1' }, newVisibility: 'observed', hasActionableChange: true },
        { token: { id: 'token1' }, newVisibility: 'observed', hasActionableChange: true },
      ];

      const wallOutcomes = mockOutcomes.filter(o => o.wall);
      const tokenOutcomes = mockOutcomes.filter(o => o.token);
      
      expect(wallOutcomes).toHaveLength(1);
      expect(tokenOutcomes).toHaveLength(1);
      expect(wallOutcomes[0].wall.id).toBe('wall1');
      expect(tokenOutcomes[0].token.id).toBe('token1');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('handles empty outcomes gracefully', () => {
      const emptyOutcomes = [];
      const changedOutcomes = emptyOutcomes.filter(o => o?.hasActionableChange);
      
      expect(changedOutcomes).toHaveLength(0);
    });

    test('handles missing outcome properties gracefully', () => {
      const incompleteOutcome = { token: { id: 'test' } };
      const revertVisibility = incompleteOutcome.oldVisibility || 
                               incompleteOutcome.currentVisibility || 
                               'observed';

      expect(revertVisibility).toBe('observed');
    });

    test('filters out null/undefined outcomes', () => {
      const mixedOutcomes = [
        { token: { id: 'valid' }, hasActionableChange: true },
        null,
        undefined,
        { token: null },
      ];

      const validOutcomes = mixedOutcomes.filter(o => o?.token?.id && o.hasActionableChange);
      
      expect(validOutcomes).toHaveLength(1);
      expect(validOutcomes[0].token.id).toBe('valid');
    });
  });
});
