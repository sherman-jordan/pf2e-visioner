/**
 * Module settings registration and management
 */

import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from './constants.js';

/**
 * Register all module settings
 */
export function registerSettings() {
  console.log('PF2E Visioner: Starting settings registration...');
  
  try {
    // Register each setting from the configuration
    Object.entries(DEFAULT_SETTINGS).forEach(([key, config]) => {
      console.log(`PF2E Visioner: Registering setting: ${key}`);
      
      const settingConfig = { ...config };
      
      // Add onChange handler for settings that require restart
      if (key === 'enableHoverTooltips') {
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
      }
      // The showOnlyEncounterTokens setting doesn't require restart - it takes effect immediately
      
      try {
        game.settings.register(MODULE_ID, key, settingConfig);
        console.log(`PF2E Visioner: Successfully registered setting: ${key}`);
      } catch (settingError) {
        console.error(`PF2E Visioner: Failed to register setting ${key}:`, settingError);
        throw settingError;
      }
    });
    
    console.log('PF2E Visioner: All settings registered successfully!');
  } catch (error) {
    console.error('PF2E Visioner: Settings registration failed:', error);
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
    if (key === 'openVisibilityManager') {
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