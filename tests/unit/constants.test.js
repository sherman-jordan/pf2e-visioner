/**
 * Unit tests for PF2E Visioner constants
 */

import {
  COVER_STATES,
  DEFAULT_SETTINGS,
  MODULE_ID,
  MODULE_TITLE,
  VISIBILITY_STATES
} from '../../scripts/constants.js';

describe('Constants', () => {
  describe('Module Identity', () => {
    test('should have correct module ID', () => {
      expect(MODULE_ID).toBe('pf2e-visioner');
    });

    test('should have correct module title', () => {
      expect(MODULE_TITLE).toBe('PF2E Visioner');
    });
  });

  describe('Visibility States', () => {
    test('should define all required visibility states', () => {
      const expectedStates = ['observed', 'concealed', 'hidden', 'undetected'];
      expect(Object.keys(VISIBILITY_STATES)).toEqual(expect.arrayContaining(expectedStates));
    });

    test('should have correct observed state properties', () => {
      const observed = VISIBILITY_STATES.observed;
      expect(observed.label).toBe('PF2E_VISIONER.VISIBILITY_STATES.observed');
      expect(observed.pf2eCondition).toBeNull();
      expect(observed.visible).toBe(true);
      expect(observed.icon).toBe('fas fa-eye');
      expect(observed.color).toBe('#4caf50');
    });

    test('should have correct concealed state properties', () => {
      const concealed = VISIBILITY_STATES.concealed;
      expect(concealed.label).toBe('PF2E_VISIONER.VISIBILITY_STATES.concealed');
      expect(concealed.pf2eCondition).toBe('concealed');
      expect(concealed.visible).toBe(true);
      expect(concealed.icon).toBe('fas fa-cloud');
      expect(concealed.color).toBe('#ffc107');
    });

    test('should have correct hidden state properties', () => {
      const hidden = VISIBILITY_STATES.hidden;
      expect(hidden.label).toBe('PF2E_VISIONER.VISIBILITY_STATES.hidden');
      expect(hidden.pf2eCondition).toBe('hidden');
      expect(hidden.visible).toBe(true);
      expect(hidden.icon).toBe('fas fa-eye-slash');
      expect(hidden.color).toBe('#ff6600');
    });

    test('should have correct undetected state properties', () => {
      const undetected = VISIBILITY_STATES.undetected;
      expect(undetected.label).toBe('PF2E_VISIONER.VISIBILITY_STATES.undetected');
      expect(undetected.pf2eCondition).toBe('undetected');
      expect(undetected.visible).toBe(false);
      expect(undetected.icon).toBe('fas fa-ghost');
      expect(undetected.color).toBe('#f44336');
    });

    test('should have unique colors for each state', () => {
      const colors = Object.values(VISIBILITY_STATES).map(state => state.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });

    test('should have unique icons for each state', () => {
      const icons = Object.values(VISIBILITY_STATES).map(state => state.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });
  });

  describe('Cover States', () => {
    test('should define all required cover states', () => {
      const expectedStates = ['none', 'lesser', 'standard', 'greater'];
      expect(Object.keys(COVER_STATES)).toEqual(expect.arrayContaining(expectedStates));
    });

    test('should have correct none cover state properties', () => {
      const none = COVER_STATES.none;
      expect(none.label).toBe('PF2E_VISIONER.COVER_STATES.none');
      expect(none.pf2eCondition).toBeNull();
      expect(none.icon).toBe('fas fa-shield-slash');
      expect(none.color).toBe('#4caf50');
      expect(none.bonusAC).toBe(0);
      expect(none.bonusReflex).toBe(0);
      expect(none.bonusStealth).toBe(0);
      expect(none.canHide).toBe(false);
    });

    test('should have correct lesser cover state properties', () => {
      const lesser = COVER_STATES.lesser;
      expect(lesser.label).toBe('PF2E_VISIONER.COVER_STATES.lesser');
      expect(lesser.pf2eCondition).toBe('lesser-cover');
      expect(lesser.icon).toBe('fa-regular fa-shield');
      expect(lesser.color).toBe('#ffc107');
      expect(lesser.bonusAC).toBe(1);
      expect(lesser.bonusReflex).toBe(0);
      expect(lesser.bonusStealth).toBe(0);
      expect(lesser.canHide).toBe(false);
    });

    test('should have correct standard cover state properties', () => {
      const standard = COVER_STATES.standard;
      expect(standard.label).toBe('PF2E_VISIONER.COVER_STATES.standard');
      expect(standard.pf2eCondition).toBe('cover');
      expect(standard.icon).toBe('fas fa-shield-alt');
      expect(standard.color).toBe('#ff6600');
      expect(standard.bonusAC).toBe(2);
      expect(standard.bonusReflex).toBe(2);
      expect(standard.bonusStealth).toBe(2);
      expect(standard.canHide).toBe(true);
    });

    test('should have correct greater cover state properties', () => {
      const greater = COVER_STATES.greater;
      expect(greater.label).toBe('PF2E_VISIONER.COVER_STATES.greater');
      expect(greater.pf2eCondition).toBe('greater-cover');
      expect(greater.icon).toBe('fas fa-shield');
      expect(greater.color).toBe('#f44336');
      expect(greater.bonusAC).toBe(4);
      expect(greater.bonusReflex).toBe(4);
      expect(greater.bonusStealth).toBe(4);
      expect(greater.canHide).toBe(true);
    });

    test('should have progressive AC bonuses', () => {
      expect(COVER_STATES.none.bonusAC).toBe(0);
      expect(COVER_STATES.lesser.bonusAC).toBe(1);
      expect(COVER_STATES.standard.bonusAC).toBe(2);
      expect(COVER_STATES.greater.bonusAC).toBe(4);
    });

    test('should have progressive Reflex bonuses', () => {
      expect(COVER_STATES.none.bonusReflex).toBe(0);
      expect(COVER_STATES.lesser.bonusReflex).toBe(0);
      expect(COVER_STATES.standard.bonusReflex).toBe(2);
      expect(COVER_STATES.greater.bonusReflex).toBe(4);
    });

    test('should have progressive Stealth bonuses', () => {
      expect(COVER_STATES.none.bonusStealth).toBe(0);
      expect(COVER_STATES.lesser.bonusStealth).toBe(0);
      expect(COVER_STATES.standard.bonusStealth).toBe(2);
      expect(COVER_STATES.greater.bonusStealth).toBe(4);
    });

    test('should have unique colors for each state', () => {
      const colors = Object.values(COVER_STATES).map(state => state.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });

    test('should have unique icons for each state', () => {
      const icons = Object.values(COVER_STATES).map(state => state.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });
  });

  describe('Default Settings', () => {
    test('should define core visibility settings', () => {
      expect(DEFAULT_SETTINGS.hiddenWallsEnabled).toBeDefined();
      expect(DEFAULT_SETTINGS.enableHoverTooltips).toBeDefined();
      expect(DEFAULT_SETTINGS.allowPlayerTooltips).toBeDefined();
      expect(DEFAULT_SETTINGS.tooltipFontSize).toBeDefined();
    });

    test('should define cover source settings', () => {
      expect(DEFAULT_SETTINGS.ignoreAllies).toBeDefined();
      expect(DEFAULT_SETTINGS.enableAllTokensVision).toBeDefined();
      expect(DEFAULT_SETTINGS.sneakRawEnforcement).toBeDefined();
      expect(DEFAULT_SETTINGS.lootStealthDC).toBeDefined();
    });

    test('should have correct setting structure', () => {
      const setting = DEFAULT_SETTINGS.hiddenWallsEnabled;
      expect(setting.name).toBeDefined();
      expect(setting.hint).toBeDefined();
      expect(setting.scope).toBeDefined();
      expect(setting.config).toBeDefined();
      expect(setting.type).toBeDefined();
      expect(setting.default).toBeDefined();
    });

    test('should have world scope for GM settings', () => {
      const worldSettings = Object.values(DEFAULT_SETTINGS)
        .filter(setting => setting.scope === 'world');
      expect(worldSettings.length).toBeGreaterThan(0);
    });
  });

  describe('State Consistency', () => {
    test('should have consistent PF2E condition mappings', () => {
      // All PF2E conditions should be valid
      const pf2eConditions = [
        ...Object.values(VISIBILITY_STATES).map(s => s.pf2eCondition).filter(Boolean),
        ...Object.values(COVER_STATES).map(s => s.pf2eCondition).filter(Boolean)
      ];
      
      const validConditions = [
        'concealed', 'hidden', 'undetected',
        'lesser-cover', 'cover', 'greater-cover'
      ];
      
      pf2eConditions.forEach(condition => {
        expect(validConditions).toContain(condition);
      });
    });

    test('should have consistent color schemes', () => {
      // Green for safe/visible states
      expect(VISIBILITY_STATES.observed.color).toBe('#4caf50');
      expect(COVER_STATES.none.color).toBe('#4caf50');
      
      // Yellow for caution states
      expect(VISIBILITY_STATES.concealed.color).toBe('#ffc107');
      expect(COVER_STATES.lesser.color).toBe('#ffc107');
      
      // Orange for warning states
      expect(VISIBILITY_STATES.hidden.color).toBe('#ff6600');
      expect(COVER_STATES.standard.color).toBe('#ff6600');
      
      // Red for danger states
      expect(VISIBILITY_STATES.undetected.color).toBe('#f44336');
      expect(COVER_STATES.greater.color).toBe('#f44336');
    });
  });
});
