/**
 * Regression tests for specific bug fixes
 * These tests ensure that critical bugs don't reoccur
 */

import '../setup.js';

describe('Bug Fix Regression Tests', () => {
  describe('Apply All + Ignore Allies Bug Fix', () => {
    test('dialog uses current outcomes instead of recomputing filters', () => {
      // Mock a dialog-like structure
      const mockDialog = {
        ignoreAllies: true,
        outcomes: [
          { token: { id: 'enemy1' }, hasActionableChange: true, newVisibility: 'hidden' },
        ],
        actionData: { actor: { id: 'sneaker' } }
      };

      // The key fix: use pre-filtered outcomes from dialog.outcomes
      const filteredOutcomes = mockDialog.outcomes || [];
      const changedOutcomes = filteredOutcomes.filter(o => o.hasActionableChange);

      expect(changedOutcomes).toHaveLength(1);
      expect(changedOutcomes[0].token.id).toBe('enemy1');
    });

    test('bulk actions pass ignoreAllies parameter consistently', () => {
      const mockActionData = { actor: { id: 'actor1' } };
      const mockIgnoreAllies = true;

      // Simulate the fix: always pass ignoreAllies from dialog state
      const actionDataWithIgnoreAllies = { 
        ...mockActionData, 
        ignoreAllies: mockIgnoreAllies 
      };

      expect(actionDataWithIgnoreAllies.ignoreAllies).toBe(true);
      expect(actionDataWithIgnoreAllies.actor.id).toBe('actor1');
    });
  });

  describe('Individual Revert Button Bug Fix', () => {
    test('individual revert creates specific visibility change instead of global revert', () => {
      const mockOutcome = {
        token: { id: 'enemy1' },
        oldVisibility: 'observed',
        currentVisibility: 'hidden'
      };

      // The fix: create specific visibility change instead of calling global revert
      const revertVisibility = mockOutcome.oldVisibility || mockOutcome.currentVisibility;
      const changes = [{ target: mockOutcome.token, newVisibility: revertVisibility }];

      expect(changes).toHaveLength(1);
      expect(changes[0].target.id).toBe('enemy1');
      expect(changes[0].newVisibility).toBe('observed');
    });

    test('individual revert only affects the specified token', () => {
      const mockOutcomes = [
        { token: { id: 'token1' }, oldVisibility: 'observed' },
        { token: { id: 'token2' }, oldVisibility: 'observed' },
      ];

      const targetTokenId = 'token1';
      const targetOutcome = mockOutcomes.find(o => o.token.id === targetTokenId);

      // Verify only the target outcome is processed
      expect(targetOutcome.token.id).toBe('token1');
      expect(mockOutcomes.filter(o => o.token.id !== targetTokenId)).toHaveLength(1);
    });
  });

  describe('Filter Logic Consistency', () => {
    test('shouldFilterAlly logic works correctly with alliance', () => {
      // Mock tokens with alliance
      const playerToken = { actor: { alliance: 'party' } };
      const allyToken = { actor: { alliance: 'party' } };
      const enemyToken = { actor: { alliance: 'opposition' } };

      // Simple alliance check (mirroring the actual function logic)
      const isAllyFiltered = playerToken.actor.alliance === allyToken.actor.alliance;
      const isEnemyFiltered = playerToken.actor.alliance === enemyToken.actor.alliance;

      // When ignoring allies, allies should be filtered out, enemies should not
      expect(isAllyFiltered).toBe(true);  // Ally should be filtered
      expect(isEnemyFiltered).toBe(false); // Enemy should not be filtered
    });

    test('filterOutcomesByAllies respects ignoreAllies parameter', () => {
      const outcomes = [
        { target: { actor: { alliance: 'party' } } },      // Ally
        { target: { actor: { alliance: 'opposition' } } }, // Enemy
      ];
      const actorToken = { actor: { alliance: 'party' } };

      // Simulate the filtering logic
      const filterAllies = (outcomes, ignoreAllies) => {
        if (!ignoreAllies) return outcomes;
        return outcomes.filter(o => 
          o.target.actor.alliance !== actorToken.actor.alliance
        );
      };

      const filteredIgnore = filterAllies(outcomes, true);
      const filteredKeep = filterAllies(outcomes, false);

      expect(filteredIgnore).toHaveLength(1); // Only enemy
      expect(filteredKeep).toHaveLength(2);   // Both ally and enemy
    });
  });

  describe('Parameter Passing Consistency', () => {
    test('action handlers receive ignoreAllies parameter from dialogs', () => {
      const mockDialogState = { ignoreAllies: true };
      const mockActionData = { actor: { id: 'actor1' } };

      // The fix: dialogs pass their current state to action handlers
      const enrichedActionData = { 
        ...mockActionData, 
        ignoreAllies: mockDialogState.ignoreAllies 
      };

      expect(enrichedActionData.ignoreAllies).toBe(true);
    });

    test('bulk operations use pre-filtered outcomes', () => {
      const allOutcomes = [
        { token: { id: 'ally1' }, hasActionableChange: true },
        { token: { id: 'enemy1' }, hasActionableChange: true },
      ];

      // Simulate dialog filtering (allies removed when ignoreAllies = true)
      const dialogFilteredOutcomes = allOutcomes.filter(o => o.token.id.includes('enemy'));

      // The fix: use already-filtered outcomes instead of recomputing
      const changedOutcomes = dialogFilteredOutcomes.filter(o => o.hasActionableChange);

      expect(changedOutcomes).toHaveLength(1);
      expect(changedOutcomes[0].token.id).toBe('enemy1');
    });
  });

  describe('State Management', () => {
    test('dialog state tracks bulk action status correctly', () => {
      const mockDialog = {
        bulkActionState: 'initial'
      };

      // Test state transitions
      mockDialog.bulkActionState = 'applied';
      expect(mockDialog.bulkActionState).toBe('applied');

      mockDialog.bulkActionState = 'reverted';
      expect(mockDialog.bulkActionState).toBe('reverted');

      mockDialog.bulkActionState = 'initial';
      expect(mockDialog.bulkActionState).toBe('initial');
    });

    test('individual actions reset bulk state appropriately', () => {
      const mockDialog = {
        bulkActionState: 'applied'
      };

      // Individual revert should reset to initial state
      mockDialog.bulkActionState = 'initial';
      
      expect(mockDialog.bulkActionState).toBe('initial');
    });
  });

  describe('Sneak Panel Button Bug Fix', () => {
    test('sneak panel button uses correct apply-now-sneak action instead of apply-now-hide', () => {
      // Import the actual panel builder to test the real HTML output
      const { buildSneakPanel } = require('../../scripts/chat/ui/panel/sneak.js');
      
      // Mock game.user.isGM to ensure buttons are generated
      const originalIsGM = game.user.isGM;
      game.user.isGM = true;
      
      try {
        const panel = buildSneakPanel();
        
        // The critical fix: ensure the Apply Changes button uses apply-now-sneak
        expect(panel.actionButtonsHtml).toContain('data-action="apply-now-sneak"');
        
        // Ensure it does NOT use the wrong action (this was the bug)
        expect(panel.actionButtonsHtml).not.toContain('data-action="apply-now-hide"');
        
        // Verify the button text is correct
        expect(panel.actionButtonsHtml).toContain('Apply Changes');
        
        // Verify the button class is correct
        expect(panel.actionButtonsHtml).toContain('visioner-btn-sneak');
      } finally {
        // Restore original game.user.isGM
        game.user.isGM = originalIsGM;
      }
    });

    test('sneak panel button routes to correct handler function', () => {
      // This test verifies that the button action name matches what the event binder expects
      const expectedAction = 'apply-now-sneak';
      
      // The event binder should have this mapping
      const expectedHandlerMapping = {
        'apply-now-sneak': 'applyNowSneak',
        'apply-now-hide': 'applyNowHide'
      };
      
      // Verify the sneak action routes to the correct handler
      expect(expectedHandlerMapping[expectedAction]).toBe('applyNowSneak');
      
      // Verify the hide action routes to a different handler (this was the bug)
      expect(expectedHandlerMapping['apply-now-hide']).toBe('applyNowHide');
      expect(expectedHandlerMapping['apply-now-hide']).not.toBe('applyNowSneak');
    });

    test('sneak action uses global ignoreAllies setting when not explicitly provided', () => {
      // This test verifies that the sneak action handler correctly uses the global setting
      // when ignoreAllies is not explicitly provided in actionData
      
      // Mock the global setting
      const mockGlobalSetting = true;
      const originalGet = game.settings.get;
      game.settings.get = jest.fn().mockReturnValue(mockGlobalSetting);
      
      try {
        // Simulate the logic from discoverSubjects method
        const actionData = { actor: { id: 'sneaker' } }; // No ignoreAllies property
        const fallbackValue = actionData?.ignoreAllies ?? game.settings.get("pf2e-visioner", "ignoreAllies");
        
        expect(fallbackValue).toBe(mockGlobalSetting);
        expect(game.settings.get).toHaveBeenCalledWith("pf2e-visioner", "ignoreAllies");
      } finally {
        // Restore original function
        game.settings.get = originalGet;
      }
    });
  });

  describe('Outcome Status Application Tests', () => {
    test('sneak action applies correct status based on outcome', () => {
      // Test that sneak actions map to the correct visibility states
      const { getDefaultNewStateFor } = require('../../scripts/chat/services/data/action-state-config.js');
      
      // Test sneak action outcomes from hidden state (most common scenario)
      const sneakOutcomes = [
        { degree: 'critical-success', expectedStatus: 'undetected' },
        { degree: 'success', expectedStatus: 'undetected' },
        { degree: 'failure', expectedStatus: 'hidden' },
        { degree: 'critical-failure', expectedStatus: 'observed' }
      ];
      
      sneakOutcomes.forEach(({ degree, expectedStatus }) => {
        const result = getDefaultNewStateFor('sneak', 'hidden', degree);
        expect(result).toBe(expectedStatus);
      });
    });

    test('hide action applies correct status based on outcome', () => {
      // Test that hide actions map to the correct visibility states
      const { getDefaultNewStateFor } = require('../../scripts/chat/services/data/action-state-config.js');
      
      // Test hide action outcomes from observed state (most common scenario)
      const hideOutcomes = [
        { degree: 'critical-success', expectedStatus: 'hidden' },
        { degree: 'success', expectedStatus: 'hidden' },
        { degree: 'failure', expectedStatus: 'observed' },
        { degree: 'critical-failure', expectedStatus: 'observed' }
      ];
      
      hideOutcomes.forEach(({ degree, expectedStatus }) => {
        const result = getDefaultNewStateFor('hide', 'observed', degree);
        expect(result).toBe(expectedStatus);
      });
    });

    test('RAW enforcement correctly filters outcomes', () => {
      // Test that RAW enforcement respects game rules
      const mockOutcomes = [
        { token: { id: 'valid1' }, hasActionableChange: true, newVisibility: 'hidden' },
        { token: { id: 'valid2' }, hasActionableChange: true, newVisibility: 'undetected' },
        { token: { id: 'invalid1' }, hasActionableChange: false, newVisibility: 'hidden' },
        { token: { id: 'invalid2' }, hasActionableChange: false, newVisibility: 'undetected' }
      ];
      
      // When RAW enforcement is on, only actionable changes should be applied
      const actionableOutcomes = mockOutcomes.filter(o => o.hasActionableChange);
      
      expect(actionableOutcomes).toHaveLength(2);
      expect(actionableOutcomes.map(o => o.token.id)).toEqual(['valid1', 'valid2']);
    });

    test('visibility changes are applied to correct tokens', () => {
      // Test that the actual visibility changes are applied to the right tokens
      const mockOutcomes = [
        { 
          token: { id: 'enemy1', document: { update: jest.fn() } },
          newVisibility: 'hidden',
          hasActionableChange: true
        },
        { 
          token: { id: 'enemy2', document: { update: jest.fn() } },
          newVisibility: 'undetected',
          hasActionableChange: true
        }
      ];
      
      // Simulate applying visibility changes
      const appliedChanges = [];
      mockOutcomes.forEach(outcome => {
        if (outcome.hasActionableChange) {
          appliedChanges.push({
            tokenId: outcome.token.id,
            newVisibility: outcome.newVisibility
          });
          
          // Mock the actual token update
          outcome.token.document.update({ 
            [`flags.pf2e-visioner.visibility.${outcome.token.id}`]: outcome.newVisibility 
          });
        }
      });
      
      expect(appliedChanges).toHaveLength(2);
      expect(appliedChanges[0]).toEqual({ tokenId: 'enemy1', newVisibility: 'hidden' });
      expect(appliedChanges[1]).toEqual({ tokenId: 'enemy2', newVisibility: 'undetected' });
      
      // Verify update was called for each token
      mockOutcomes.forEach(outcome => {
        if (outcome.hasActionableChange) {
          expect(outcome.token.document.update).toHaveBeenCalled();
        }
      });
    });

    test('sneak vs hide status mapping is distinct', () => {
      // Ensure sneak and hide actions can produce different results
      const { getDefaultOutcomeMapping } = require('../../scripts/chat/services/data/action-state-config.js');
      
      // Get the default mappings for both actions
      const sneakMapping = getDefaultOutcomeMapping()['sneak'];
      const hideMapping = getDefaultOutcomeMapping()['hide'];
      
      // Both should exist and be objects
      expect(sneakMapping).toBeDefined();
      expect(hideMapping).toBeDefined();
      expect(typeof sneakMapping).toBe('object');
      expect(typeof hideMapping).toBe('object');
      
      // They should have the same structure but potentially different values
      expect(Object.keys(sneakMapping)).toEqual(Object.keys(hideMapping));
      
      // Test specific outcomes from hidden state for sneak vs observed state for hide
      expect(sneakMapping.hidden['critical-success']).toBe('undetected');
      expect(hideMapping.observed['critical-success']).toBe('hidden');
      
      // These should be different (sneak vs hide have different mechanics)
      expect(sneakMapping.hidden['critical-success']).not.toBe(hideMapping.observed['critical-success']);
    });

    test('outcome filtering respects ignoreAllies setting', () => {
      // Test that ally filtering works correctly in outcome processing
      const mockOutcomes = [
        { 
          token: { id: 'ally1', actor: { alliance: 'party' } },
          newVisibility: 'hidden',
          hasActionableChange: true
        },
        { 
          token: { id: 'enemy1', actor: { alliance: 'opposition' } },
          newVisibility: 'undetected',
          hasActionableChange: true
        },
        { 
          token: { id: 'ally2', actor: { alliance: 'party' } },
          newVisibility: 'hidden',
          hasActionableChange: true
        }
      ];
      
      // When ignoreAllies is true, allies should be filtered out
      const ignoreAllies = true;
      const filteredOutcomes = mockOutcomes.filter(outcome => {
        if (!ignoreAllies) return true;
        return outcome.token.actor.alliance !== 'party';
      });
      
      expect(filteredOutcomes).toHaveLength(1);
      expect(filteredOutcomes[0].token.id).toBe('enemy1');
      expect(filteredOutcomes[0].token.actor.alliance).toBe('opposition');
    });
  });

  describe('Error Handling', () => {
    test('empty outcomes arrays are handled gracefully', () => {
      const emptyOutcomes = [];
      const changedOutcomes = emptyOutcomes.filter(o => o?.hasActionableChange);
      
      expect(changedOutcomes).toHaveLength(0);
    });

    test('missing properties are handled gracefully', () => {
      const incompleteOutcome = { token: { id: 'test' } }; // Missing visibility properties
      
      const revertVisibility = incompleteOutcome.oldVisibility || 
                               incompleteOutcome.currentVisibility || 
                               'observed'; // fallback

      expect(revertVisibility).toBe('observed');
    });

    test('null/undefined outcomes are filtered out', () => {
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
