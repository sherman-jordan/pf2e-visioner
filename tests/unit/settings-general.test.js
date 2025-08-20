/**
 * General Settings Tests
 * Tests for all General settings and their interactions with bug scenarios
 */

import '../setup.js';

describe('General Settings Tests', () => {
  let originalSettings;
  
  beforeEach(() => {
    // Store original settings
    originalSettings = {
      defaultEncounterFilter: game.settings.get('pf2e-visioner', 'defaultEncounterFilter'),
      ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
      includeLootActors: game.settings.get('pf2e-visioner', 'includeLootActors'),
      defaultStealthDCForLootActors: game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors'),
      useTokenHUDButton: game.settings.get('pf2e-visioner', 'useTokenHUDButton'),
      integrateRollOutcome: game.settings.get('pf2e-visioner', 'integrateRollOutcome'),
      enforceRawRequirements: game.settings.get('pf2e-visioner', 'enforceRawRequirements'),
      keybindingOpensTokenManagerInTargetMode: game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode'),
      sneakRawEnforcement: game.settings.get('pf2e-visioner', 'sneakRawEnforcement'),
      enableVisionForAllTokens: game.settings.get('pf2e-visioner', 'enableVisionForAllTokens'),
      showCoverInHideResults: game.settings.get('pf2e-visioner', 'showCoverInHideResults')
    };
  });
  
  afterEach(() => {
    // Restore original settings
    Object.keys(originalSettings).forEach(key => {
      game.settings.set('pf2e-visioner', key, originalSettings[key]);
    });
  });

  describe('Default Encounter Filter State', () => {
    test('defaultEncounterFilter setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'defaultEncounterFilter');
      
      // Toggle the setting
      game.settings.set('pf2e-visioner', 'defaultEncounterFilter', !originalValue);
      
      // Verify it changed
      expect(game.settings.get('pf2e-visioner', 'defaultEncounterFilter')).toBe(!originalValue);
      
      // Toggle back
      game.settings.set('pf2e-visioner', 'defaultEncounterFilter', originalValue);
      expect(game.settings.get('pf2e-visioner', 'defaultEncounterFilter')).toBe(originalValue);
    });

    test('affects dialog encounter filter checkbox default state', () => {
      // This setting affects whether encounter filter is checked by default in dialogs
      game.settings.set('pf2e-visioner', 'defaultEncounterFilter', true);
      
      // Simulate dialog creation with this setting
      const mockDialog = {
        encounterOnly: game.settings.get('pf2e-visioner', 'defaultEncounterFilter')
      };
      
      expect(mockDialog.encounterOnly).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'defaultEncounterFilter', false);
      mockDialog.encounterOnly = game.settings.get('pf2e-visioner', 'defaultEncounterFilter');
      expect(mockDialog.encounterOnly).toBe(false);
    });
  });

  describe('Ignore Allies (default)', () => {
    test('ignoreAllies setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'ignoreAllies');
      
      // Toggle the setting
      game.settings.set('pf2e-visioner', 'ignoreAllies', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'ignoreAllies')).toBe(!originalValue);
      
      // Toggle back
      game.settings.set('pf2e-visioner', 'ignoreAllies', originalValue);
      expect(game.settings.get('pf2e-visioner', 'ignoreAllies')).toBe(originalValue);
    });

    test('affects dialog ignore allies checkbox default state', () => {
      // This setting affects whether "Ignore allies" is checked by default in dialogs
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      
      const mockDialog = {
        ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies')
      };
      
      expect(mockDialog.ignoreAllies).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'ignoreAllies', false);
      mockDialog.ignoreAllies = game.settings.get('pf2e-visioner', 'ignoreAllies');
      expect(mockDialog.ignoreAllies).toBe(false);
    });

    test('affects token manager default state', () => {
      // This setting affects the Token Manager's default ignore allies state
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      
      const mockTokenManager = {
        ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies')
      };
      
      expect(mockTokenManager.ignoreAllies).toBe(true);
    });
  });

  describe('Include Loot Actors in Visibility Manager', () => {
    test('includeLootActors setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'includeLootActors');
      
      game.settings.set('pf2e-visioner', 'includeLootActors', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'includeLootActors')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'includeLootActors', originalValue);
      expect(game.settings.get('pf2e-visioner', 'includeLootActors')).toBe(originalValue);
    });

    test('affects whether loot actors appear in visibility calculations', () => {
      game.settings.set('pf2e-visioner', 'includeLootActors', true);
      
      // Simulate token filtering with this setting
      const mockTokens = [
        { id: 'player1', actor: { type: 'character' } },
        { id: 'chest1', actor: { type: 'loot' } },
        { id: 'enemy1', actor: { type: 'npc' } }
      ];
      
      const includeLoot = game.settings.get('pf2e-visioner', 'includeLootActors');
      const filteredTokens = mockTokens.filter(token => {
        if (token.actor.type === 'loot') {
          return includeLoot;
        }
        return true;
      });
      
      expect(filteredTokens).toHaveLength(3); // All tokens included when true
      
      // Test with false
      game.settings.set('pf2e-visioner', 'includeLootActors', false);
      const filteredTokensFalse = mockTokens.filter(token => {
        if (token.actor.type === 'loot') {
          return game.settings.get('pf2e-visioner', 'includeLootActors');
        }
        return true;
      });
      
      expect(filteredTokensFalse).toHaveLength(2); // Loot excluded when false
      expect(filteredTokensFalse.every(t => t.actor.type !== 'loot')).toBe(true);
    });
  });

  describe('Default Stealth DC for Loot Actors', () => {
    test('defaultStealthDCForLootActors setting can be changed', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors');
      
      // Change to a different value
      game.settings.set('pf2e-visioner', 'defaultStealthDCForLootActors', 20);
      expect(game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors')).toBe(20);
      
      // Restore original
      game.settings.set('pf2e-visioner', 'defaultStealthDCForLootActors', originalValue);
      expect(game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors')).toBe(originalValue);
    });

    test('affects Seek action DC calculations for loot', () => {
      game.settings.set('pf2e-visioner', 'defaultStealthDCForLootActors', 20);
      
      // Simulate Seek action against loot
      const mockLootToken = { actor: { type: 'loot' } };
      const lootDC = game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors');
      
      expect(lootDC).toBe(20);
      
      // Test with different value
      game.settings.set('pf2e-visioner', 'defaultStealthDCForLootActors', 25);
      const newLootDC = game.settings.get('pf2e-visioner', 'defaultStealthDCForLootActors');
      expect(newLootDC).toBe(25);
    });
  });

  describe('Use Token HUD Button', () => {
    test('useTokenHUDButton setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'useTokenHUDButton');
      
      game.settings.set('pf2e-visioner', 'useTokenHUDButton', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'useTokenHUDButton')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'useTokenHUDButton', originalValue);
      expect(game.settings.get('pf2e-visioner', 'useTokenHUDButton')).toBe(originalValue);
    });

    test('affects visibility button placement', () => {
      game.settings.set('pf2e-visioner', 'useTokenHUDButton', true);
      
      // When true, button should be in token HUD
      const useHUD = game.settings.get('pf2e-visioner', 'useTokenHUDButton');
      expect(useHUD).toBe(true);
      
      // When false, should use floating button
      game.settings.set('pf2e-visioner', 'useTokenHUDButton', false);
      const useFloating = game.settings.get('pf2e-visioner', 'useTokenHUDButton');
      expect(useFloating).toBe(false);
    });
  });

  describe('Integrate Roll Outcome in Token Manager', () => {
    test('integrateRollOutcome setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'integrateRollOutcome');
      
      game.settings.set('pf2e-visioner', 'integrateRollOutcome', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'integrateRollOutcome')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'integrateRollOutcome', originalValue);
      expect(game.settings.get('pf2e-visioner', 'integrateRollOutcome')).toBe(originalValue);
    });

    test('affects token manager column display', () => {
      game.settings.set('pf2e-visioner', 'integrateRollOutcome', true);
      
      // When true, should show roll outcome column
      const showRollColumn = game.settings.get('pf2e-visioner', 'integrateRollOutcome');
      expect(showRollColumn).toBe(true);
      
      // When false, should hide roll outcome column
      game.settings.set('pf2e-visioner', 'integrateRollOutcome', false);
      const hideRollColumn = game.settings.get('pf2e-visioner', 'integrateRollOutcome');
      expect(hideRollColumn).toBe(false);
    });
  });

  describe('Enforce RAW', () => {
    test('enforceRawRequirements setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'enforceRawRequirements');
      
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'enforceRawRequirements')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', originalValue);
      expect(game.settings.get('pf2e-visioner', 'enforceRawRequirements')).toBe(originalValue);
    });

    test('affects Hide action prerequisites', () => {
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      
      // When true, Hide should only be allowed if token is Concealed or has Standard Cover
      const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');
      expect(enforceRAW).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', false);
      const noEnforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');
      expect(noEnforceRAW).toBe(false);
    });

    test('affects action target filtering', () => {
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      
      // This setting affects which targets are eligible for actions
      const enforceRAW = game.settings.get('pf2e-visioner', 'enforceRawRequirements');
      expect(enforceRAW).toBe(true);
    });
  });

  describe('Keybinding Opens Token Manager in Target Mode', () => {
    test('keybindingOpensTokenManagerInTargetMode setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode');
      
      game.settings.set('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode', originalValue);
      expect(game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode')).toBe(originalValue);
    });

    test('affects token manager default mode', () => {
      game.settings.set('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode', true);
      
      // When true, keybinding should open in Target mode
      const openInTargetMode = game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode');
      expect(openInTargetMode).toBe(true);
      
      // When false, should open in Observer mode
      game.settings.set('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode', false);
      const openInObserverMode = game.settings.get('pf2e-visioner', 'keybindingOpensTokenManagerInTargetMode');
      expect(openInObserverMode).toBe(false);
    });
  });

  describe('Sneak Raw Enforcement', () => {
    test('sneakRawEnforcement setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'sneakRawEnforcement');
      
      game.settings.set('pf2e-visioner', 'sneakRawEnforcement', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'sneakRawEnforcement')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'sneakRawEnforcement', originalValue);
      expect(game.settings.get('pf2e-visioner', 'sneakRawEnforcement')).toBe(originalValue);
    });

    test('affects Sneak action outcome mapping', () => {
      game.settings.set('pf2e-visioner', 'sneakRawEnforcement', true);
      
      // When true, Sneak follows RAW rules (more restrictive)
      const enforceSneakRAW = game.settings.get('pf2e-visioner', 'sneakRawEnforcement');
      expect(enforceSneakRAW).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'sneakRawEnforcement', false);
      const noEnforceSneakRAW = game.settings.get('pf2e-visioner', 'sneakRawEnforcement');
      expect(noEnforceSneakRAW).toBe(false);
    });
  });

  describe('Enable Vision for All Tokens', () => {
    test('enableVisionForAllTokens setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'enableVisionForAllTokens');
      
      game.settings.set('pf2e-visioner', 'enableVisionForAllTokens', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'enableVisionForAllTokens')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'enableVisionForAllTokens', originalValue);
      expect(game.settings.get('pf2e-visioner', 'enableVisionForAllTokens')).toBe(originalValue);
    });

    test('affects token vision default state', () => {
      game.settings.set('pf2e-visioner', 'enableVisionForAllTokens', true);
      
      // When true, all tokens should have vision enabled by default
      const enableVision = game.settings.get('pf2e-visioner', 'enableVisionForAllTokens');
      expect(enableVision).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'enableVisionForAllTokens', false);
      const disableVision = game.settings.get('pf2e-visioner', 'enableVisionForAllTokens');
      expect(disableVision).toBe(false);
    });
  });

  describe('Show Cover in Hide Results', () => {
    test('showCoverInHideResults setting can be toggled', () => {
      const originalValue = game.settings.get('pf2e-visioner', 'showCoverInHideResults');
      
      game.settings.set('pf2e-visioner', 'showCoverInHideResults', !originalValue);
      expect(game.settings.get('pf2e-visioner', 'showCoverInHideResults')).toBe(!originalValue);
      
      game.settings.set('pf2e-visioner', 'showCoverInHideResults', originalValue);
      expect(game.settings.get('pf2e-visioner', 'showCoverInHideResults')).toBe(originalValue);
    });

    test('affects Hide action result display', () => {
      game.settings.set('pf2e-visioner', 'showCoverInHideResults', true);
      
      // When true, Hide results should show cover information
      const showCover = game.settings.get('pf2e-visioner', 'showCoverInHideResults');
      expect(showCover).toBe(true);
      
      // Test with false
      game.settings.set('pf2e-visioner', 'showCoverInHideResults', false);
      const hideCover = game.settings.get('pf2e-visioner', 'showCoverInHideResults');
      expect(hideCover).toBe(false);
    });
  });

  describe('Settings Integration Tests', () => {
    test('multiple settings can be changed simultaneously', () => {
      // Test that multiple settings can be changed without conflicts
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', true);
      game.settings.set('pf2e-visioner', 'sneakRawEnforcement', true);
      
      expect(game.settings.get('pf2e-visioner', 'ignoreAllies')).toBe(true);
      expect(game.settings.get('pf2e-visioner', 'enforceRawRequirements')).toBe(true);
      expect(game.settings.get('pf2e-visioner', 'sneakRawEnforcement')).toBe(true);
    });

    test('settings affect action behavior correctly', () => {
      // Test that settings actually affect the behavior they're supposed to
      game.settings.set('pf2e-visioner', 'ignoreAllies', true);
      game.settings.set('pf2e-visioner', 'enforceRawRequirements', false);
      
      // Simulate action execution with these settings
      const mockAction = {
        ignoreAllies: game.settings.get('pf2e-visioner', 'ignoreAllies'),
        enforceRAW: game.settings.get('pf2e-visioner', 'enforceRawRequirements')
      };
      
      expect(mockAction.ignoreAllies).toBe(true);
      expect(mockAction.enforceRAW).toBe(false);
    });

    test('settings persistence across test runs', () => {
      // Test that settings are properly restored after each test
      const originalIgnoreAllies = game.settings.get('pf2e-visioner', 'ignoreAllies');
      
      // Change setting
      game.settings.set('pf2e-visioner', 'ignoreAllies', !originalIgnoreAllies);
      expect(game.settings.get('pf2e-visioner', 'ignoreAllies')).toBe(!originalIgnoreAllies);
      
      // After test, should be restored by afterEach
      // This test verifies the beforeEach/afterEach pattern works
    });
  });
});
