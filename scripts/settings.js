/**
 * Module settings registration and management
 */

import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from './constants.js';

/**
 * Register all module settings
 */
export function registerSettings() {
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
    } else if (key === 'useHudButton') {
      settingConfig.onChange = () => {
        SettingsConfig.reloadConfirm({
          world: true
        });
      };
    }
    // The showOnlyEncounterTokens setting doesn't require restart - it takes effect immediately
    
    game.settings.register(MODULE_ID, key, settingConfig);
  });
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
    }
    
    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}