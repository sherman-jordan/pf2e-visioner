/**
 * Module settings registration and management
 */

import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from "./constants.js";

// Define grouped settings sections to declutter the native list.
// All keys listed here will be hidden from the default module settings UI
// and rendered inside our custom grouped settings form instead.
const SETTINGS_GROUPS = {
  General: [
    "defaultEncounterFilter",
    "ignoreAllies",
    "includeLootActors",
    "lootStealthDC",
    "useHudButton",
    "integrateRollOutcome",
    "enforceRawRequirements",
  ],
  "Visibility & Hover": [
    "enableHoverTooltips",
    "allowPlayerTooltips",
    "blockPlayerTargetTooltips",
    "tooltipFontSize",
    "colorblindMode",
  ],
  "Seek & Range": [
    "seekUseTemplate",
    "limitSeekRangeInCombat",
    "limitSeekRangeOutOfCombat",
    "customSeekDistance",
    "customSeekDistanceOutOfCombat",
  ],
  "Auto-cover": [
    "autoCover",
    "autoCoverTokenIntersectionMode",
    "autoCoverCoverageStandardPct",
    "autoCoverCoverageGreaterPct",
    "autoCoverIgnoreUndetected",
    "autoCoverIgnoreDead",
    "autoCoverIgnoreAllies",
    "autoCoverRespectIgnoreFlag",
    "autoCoverAllowProneBlockers",
  ],
  Advanced: [
    "debug",
  ],
};

function isGroupedKey(key) {
  return Object.values(SETTINGS_GROUPS).some((arr) => arr.includes(key));
}

let currentVisionerSettingsApp = null;

class VisionerSettingsForm extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pf2e-visioner-settings",
    tag: "div",
    window: {
      title: "PF2E Visioner Settings",
      icon: "fas fa-sliders-h",
      resizable: true,
    },
    position: { width: 640, height: 600 },
    classes: ["pf2e-visioner-settings-window"],
    actions: { submit: VisionerSettingsForm._onSubmit },
  };

  constructor(options = {}) {
    super(options);
    currentVisionerSettingsApp = this;
  }

  async _prepareContext() {
    const groups = [];
    for (const [groupName, keys] of Object.entries(SETTINGS_GROUPS)) {
      const items = [];
      for (const key of keys) {
        const cfg = DEFAULT_SETTINGS[key];
        if (!cfg) continue;
        const current = game.settings.get(MODULE_ID, key);
        let inputType = "text";
        let choicesList = null;
        if (cfg.choices && typeof cfg.choices === "object") {
          inputType = "select";
          try {
            choicesList = Object.entries(cfg.choices).map(([val, label]) => ({ value: val, label, selected: String(current) === String(val) }));
          } catch (_) {
            choicesList = null;
          }
        }
        else if (cfg.type === Boolean) inputType = "checkbox";
        else if (cfg.type === Number) inputType = "number";
        items.push({
          key,
          name: game.i18n?.localize?.(cfg.name) ?? cfg.name,
          hint: game.i18n?.localize?.(cfg.hint) ?? (cfg.hint || ""),
          value: current,
          inputType,
          choices: choicesList,
          min: cfg.min ?? null,
          max: cfg.max ?? null,
          step: cfg.step ?? 1,
        });
      }
      if (items.length) groups.push({ title: groupName, items });
    }
    return { groups };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      "modules/pf2e-visioner/templates/settings-menu.hbs",
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    try {
      // Utility: show/hide a setting's form-group wrapper
      const toggleSettingVisibility = (name, visible) => {
        try {
          const input = content.querySelector(`[name="settings.${name}"]`);
          if (!input) return;
          const group = input.closest('.form-group') || input.parentElement;
          if (group) group.style.display = visible ? '' : 'none';
        } catch (_) {}
      };

      // Coverage thresholds visible only when mode === 'coverage'
      const modeSel = content.querySelector('[name="settings.autoCoverTokenIntersectionMode"]');
      const applyCoverageModeVisibility = () => {
        const isCoverage = (modeSel?.value || '') === 'coverage';
        toggleSettingVisibility('autoCoverCoverageStandardPct', isCoverage);
        toggleSettingVisibility('autoCoverCoverageGreaterPct', isCoverage);
      };
      if (modeSel) {
        modeSel.addEventListener('change', applyCoverageModeVisibility);
        applyCoverageModeVisibility();
      }

      // Seek distances visible only when their limit toggles are enabled
      const inCombatToggle = content.querySelector('[name="settings.limitSeekRangeInCombat"]');
      const outCombatToggle = content.querySelector('[name="settings.limitSeekRangeOutOfCombat"]');
      const useTemplateToggle = content.querySelector('[name="settings.seekUseTemplate"]');
      const applySeekVisibility = () => {
        const templateOn = !!useTemplateToggle?.checked;
        if (templateOn) {
          // When template is used, hide both distance fields regardless of toggles
          toggleSettingVisibility('customSeekDistance', false);
          toggleSettingVisibility('customSeekDistanceOutOfCombat', false);
          return;
        }
        const inOn = !!inCombatToggle?.checked;
        const outOn = !!outCombatToggle?.checked;
        toggleSettingVisibility('customSeekDistance', inOn);
        toggleSettingVisibility('customSeekDistanceOutOfCombat', outOn);
      };
      if (inCombatToggle) inCombatToggle.addEventListener('change', applySeekVisibility);
      if (outCombatToggle) outCombatToggle.addEventListener('change', applySeekVisibility);
      if (useTemplateToggle) useTemplateToggle.addEventListener('change', applySeekVisibility);
      applySeekVisibility();

      // Hide the seek range limitation checkboxes entirely when using template
      const applySeekTemplateVisibility = () => {
        const templateOn = !!useTemplateToggle?.checked;
        toggleSettingVisibility('limitSeekRangeInCombat', !templateOn);
        toggleSettingVisibility('limitSeekRangeOutOfCombat', !templateOn);
        // Re-apply distances visibility after checkbox hide/show decision
        applySeekVisibility();
      };
      if (useTemplateToggle) useTemplateToggle.addEventListener('change', applySeekTemplateVisibility);
      applySeekTemplateVisibility();

      // Hide "Block Player Target Tooltips" unless "Allow Player Tooltips" is enabled
      const allowPlayerTooltipsToggle = content.querySelector('[name="settings.allowPlayerTooltips"]');
      const applyPlayerTooltipVisibility = () => {
        const on = !!allowPlayerTooltipsToggle?.checked;
        toggleSettingVisibility('blockPlayerTargetTooltips', on);
      };
      if (allowPlayerTooltipsToggle) allowPlayerTooltipsToggle.addEventListener('change', applyPlayerTooltipVisibility);
      applyPlayerTooltipVisibility();

      // Hide tooltip size unless hover tooltips are enabled
      const enableHoverTooltipsToggle = content.querySelector('[name="settings.enableHoverTooltips"]');
      const applyHoverTooltipVisibility = () => {
        const on = !!enableHoverTooltipsToggle?.checked;
        toggleSettingVisibility('tooltipFontSize', on);
      };
      if (enableHoverTooltipsToggle) enableHoverTooltipsToggle.addEventListener('change', applyHoverTooltipVisibility);
      applyHoverTooltipVisibility();

      // Hide all Auto-cover settings unless the main toggle is on
      const autoCoverToggle = content.querySelector('[name="settings.autoCover"]');
      const autoCoverDependents = [
        'autoCoverTokenIntersectionMode',
        'autoCoverCoverageStandardPct',
        'autoCoverCoverageGreaterPct',
        'autoCoverIgnoreUndetected',
        'autoCoverIgnoreDead',
        'autoCoverIgnoreAllies',
        'autoCoverRespectIgnoreFlag',
        'autoCoverAllowProneBlockers',
      ];
      const applyAutoCoverVisibility = () => {
        const on = !!autoCoverToggle?.checked;
        for (const key of autoCoverDependents) toggleSettingVisibility(key, on);
        // Re-apply coverage sub-visibility if turning on
        if (on) {
          try { applyCoverageModeVisibility(); } catch (_) {}
        }
      };
      if (autoCoverToggle) autoCoverToggle.addEventListener('change', applyAutoCoverVisibility);
      applyAutoCoverVisibility();
    } catch (_) {}
    return content;
  }

  static async _onSubmit(event, _button) {
    const app = currentVisionerSettingsApp || this;
    try {
      const formEl = app.element.querySelector("form.pf2e-visioner-settings");
      if (!formEl) return app.close();
      const fd = new FormData(formEl);
      const rawMap = Object.fromEntries(fd.entries());
      const allKeys = Object.values(SETTINGS_GROUPS).flat();
      for (const key of allKeys) {
        const cfg = DEFAULT_SETTINGS[key];
        if (!cfg) continue;
        const formKey = `settings.${key}`;
        const raw = rawMap[formKey];
        let value;
        if (cfg.type === Boolean) value = raw === "on" || raw === "true" || raw === true;
        else if (cfg.type === Number) value = raw != null && raw !== "" ? Number(raw) : game.settings.get(MODULE_ID, key);
        else value = raw != null ? raw : game.settings.get(MODULE_ID, key);
        await game.settings.set(MODULE_ID, key, value);
      }
      try { await app.close(); } catch (_) {}
    } catch (e) { /* noop */ try { await app.close(); } catch (_) {} }
  }
}

/**
 * Register all module settings
 */
export function registerSettings() {
  try {
    // Register each setting from the configuration
    Object.entries(DEFAULT_SETTINGS).forEach(([key, config]) => {
      const settingConfig = { ...config };
      // Hide grouped keys from the default module settings sheet; they will
      // be displayed inside our custom grouped settings menu instead.
      if (isGroupedKey(key)) settingConfig.config = false;

      // Add onChange handler for settings that require restart
      if (key === "enableHoverTooltips") {
        // Live-apply without world reload
        settingConfig.onChange = async (value) => {
          try {
            const { initializeHoverTooltips, cleanupHoverTooltips } = await import("./services/hover-tooltips.js");
            if (value) initializeHoverTooltips(); else cleanupHoverTooltips();
          } catch (_) {}
        };
      } else if (key === "allowPlayerTooltips") {
        settingConfig.onChange = () => {};

      } else if (key === "useHudButton") {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === "ignoreAllies") {
        settingConfig.onChange = () => {};

      } else if (key === "defaultEncounterFilter") {
        settingConfig.onChange = () => {};

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
      } else if (key === "blockPlayerTargetTooltips") {
        // No reload: will take effect on next hover; ensure initialized when allowed
        settingConfig.onChange = async () => {
          try {
            const { initializeHoverTooltips } = await import("./services/hover-tooltips.js");
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

    // Register a single grouped settings menu entry
    try {
      game.settings.registerMenu(MODULE_ID, "groupedSettings", {
        name: "PF2E Visioner Settings",
        label: "Open",
        hint: "Grouped settings by category (General, Visibility & Hover, Seek & Range, Auto Cover, Advanced)",
        icon: "fas fa-sliders-h",
        type: VisionerSettingsForm,
        restricted: true,
      });
    } catch (_) {}
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
        const { api } = await import("./api.js");
        await api.openTokenManager();
      };
    } else if (key === "openVisibilityManager") {
      keybindingConfig.onDown = async () => {
        const { api } = await import("./api.js");
        await api.openVisibilityManager();
      };
    } else if (key === "toggleObserverMode") {
      keybindingConfig.onDown = async () => {
        const { setTooltipMode } = await import("./services/hover-tooltips.js");
        setTooltipMode("observer");
      };
      keybindingConfig.onUp = async () => {
        const { setTooltipMode } = await import("./services/hover-tooltips.js");
        setTooltipMode("target");
      };
    }

    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}
