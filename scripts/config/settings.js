/**
 * Module settings registration and management
 */

import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from "../constants.js";

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Register each setting from the configuration
    Object.entries(DEFAULT_SETTINGS).forEach(([key, config]) => {
      const settingConfig = { ...config };

      // Add onChange handler for settings that require restart
      if (key === "enableHoverTooltips") {
        // Force world refresh when hover tooltips setting is changed
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === "allowPlayerTooltips") {
        // Live-apply without world reload for players
        settingConfig.onChange = async (value) => {
          try {
            const { initializeHoverTooltips, cleanupHoverTooltips } = await import("../services/hover-tooltips.js");
            if (value && game.settings.get(MODULE_ID, "enableHoverTooltips")) initializeHoverTooltips(); else cleanupHoverTooltips();
          } catch (_) {}
        };
      } else if (key === "useHudButton") {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === "ignoreAllies") {
        // No reload needed: ally filtering is read at runtime by action handlers
        settingConfig.onChange = () => {};
      } else if (key === "defaultEncounterFilter") {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === "seekUseTemplate") {
        // No reload needed: panel logic reads this setting at runtime
        settingConfig.onChange = () => {};
      } else if (key === "limitSeekRangeInCombat") {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => {};
      } else if (key === "limitSeekRangeOutOfCombat") {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => {};
      } else if (key === "customSeekDistance") {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => {};
      } else if (key === "customSeekDistanceOutOfCombat") {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => {};
      } else if (key === "keybindingOpensTMInTargetMode") {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => {};
      } else if (key === "blockPlayerTargetTooltips") {
        // No reload: will take effect on next hover; ensure initialized when allowed
        settingConfig.onChange = async () => {
          try {
            const { initializeHoverTooltips } = await import("../services/hover-tooltips.js");
            if (game.settings.get(MODULE_ID, "enableHoverTooltips") && game.settings.get(MODULE_ID, "allowPlayerTooltips")) initializeHoverTooltips();
          } catch (_) {}
        };
      } else if (key === "tooltipFontSize") {
        settingConfig.onChange = (value) => {
          // Map preset to sizes
          const presets = {
            tiny: { font: 12, icon: 10, border: 2 },
            small: { font: 14, icon: 12, border: 2 },
            medium: { font: 16, icon: 16, border: 3 },
            large: { font: 18, icon: 20, border: 4 },
            xlarge: { font: 20, icon: 24, border: 5 },
          };
          const preset = presets[value] ?? presets.medium;
          document.documentElement.style.setProperty(
            "--pf2e-visioner-tooltip-font-size",
            `${preset.font}px`,
          );
          document.documentElement.style.setProperty(
            "--pf2e-visioner-tooltip-icon-size",
            `${preset.icon}px`,
          );
          document.documentElement.style.setProperty(
            "--pf2e-visioner-tooltip-badge-border",
            `${preset.border}px`,
          );
        };
      } else if (key === "colorblindMode") {
        settingConfig.onChange = (value) => {
          // Apply colorblind mode CSS class to the body
          document.body.classList.remove(
            "pf2e-visioner-colorblind-protanopia",
            "pf2e-visioner-colorblind-deuteranopia",
            "pf2e-visioner-colorblind-tritanopia",
            "pf2e-visioner-colorblind-achromatopsia",
          );

          if (value !== "none") {
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
    if (key === "openTokenManager") {
      keybindingConfig.onDown = async () => {
        const mode = game.settings.get(MODULE_ID, "keybindingOpensTMInTargetMode") ? "target" : "observer";
        const { api } = await import("../api.js");
        await api.openTokenManager(null, {mode});
      };
    } else if (key === "openVisibilityManager") {
      keybindingConfig.onDown = async () => {
        const { api } = await import("../api.js");
        await api.openVisibilityManager();
      };
    } else if (key === "toggleObserverMode") {
      keybindingConfig.onDown = async () => {
        const { setTooltipMode } = await import("../services/hover-tooltips.js");
        setTooltipMode("observer");
      };
      keybindingConfig.onUp = async () => {
        const { setTooltipMode } = await import("../services/hover-tooltips.js");
        setTooltipMode("target");
      };
    } else if (key === "holdCoverVisualization") {
      // The cover visualization handles its own key events, so we don't need handlers here
      // But we need to register it so Foundry knows about it
      keybindingConfig.onDown = () => {}; // No-op handler
      keybindingConfig.onUp = () => {};   // No-op handler
    }

    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}
