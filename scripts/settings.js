/**
 * Module settings registration and management
 */

import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from './constants.js';

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Register each setting from the configuration
    Object.entries(DEFAULT_SETTINGS).forEach(([key, config]) => {
      const settingConfig = { ...config };
      
      // Add onChange handler for settings that require restart
      if (key === 'enableHoverTooltips') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'allowPlayerTooltips') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'useHudButton') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'ignoreAllies') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'defaultEncounterFilter') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'limitSeekRangeInCombat') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'customSeekDistance') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'blockPlayerTargetTooltips') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true
          });
        };
      } else if (key === 'tooltipFontSize') {
        settingConfig.onChange = (value) => {
          // Update CSS variable for tooltip font size
          document.documentElement.style.setProperty('--pf2e-visioner-tooltip-font-size', `${value}px`);
        };
      } else if (key === 'colorblindMode') {
        settingConfig.onChange = (value) => {
          // Apply colorblind mode CSS class to the body
          document.body.classList.remove(
            'pf2e-visioner-colorblind-protanopia',
            'pf2e-visioner-colorblind-deuteranopia',
            'pf2e-visioner-colorblind-tritanopia',
            'pf2e-visioner-colorblind-achromatopsia'
          );
          
          if (value !== 'none') {
            document.body.classList.add(`pf2e-visioner-colorblind-${value}`);
          }
        };
      }
      
      try {
        game.settings.register(MODULE_ID, key, settingConfig);
      } catch (settingError) {
        throw settingError;
      }
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Register keybindings
 */
export function registerKeybindings() {
  Object.entries(KEYBINDINGS).forEach(([key, config]) => {
    const keybindingConfig = { ...config };
    
    // Add appropriate handler
    if (key === 'openTokenManager') {
      keybindingConfig.onDown = async () => {
        const { api } = await import('./api.js');
        await api.openTokenManager();
      };
    } else if (key === 'openVisibilityManager') {
      keybindingConfig.onDown = async () => {
        const { api } = await import('./api.js');
        await api.openVisibilityManager();
      };
    } else if (key === 'toggleObserverMode') {
      keybindingConfig.onDown = async () => {
        const { setTooltipMode } = await import('./hover-tooltips.js');
        setTooltipMode('observer');
      };
      keybindingConfig.onUp = async () => {
        const { setTooltipMode } = await import('./hover-tooltips.js');
        setTooltipMode('target');
      };
    }
    
    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}