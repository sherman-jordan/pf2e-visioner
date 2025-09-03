/**
 * Module settings registration and management
 */

import { reinjectChatAutomationStyles } from './chat/chat-automation-styles.js';
import { DEFAULT_SETTINGS, KEYBINDINGS, MODULE_ID } from './constants.js';

// Define grouped settings sections to declutter the native list.
// All keys listed here will be hidden from the default module settings UI
// and rendered inside our custom grouped settings form instead.
const SETTINGS_GROUPS = {
  General: [
    'defaultEncounterFilter',
    'ignoreAllies',
    'includeLootActors',
    'lootStealthDC',
    'useHudButton',
    'hideVisionerSceneTools',
    'hideQuickEditTool',
    'integrateRollOutcome',
    'enforceRawRequirements',
    'keybindingOpensTMInTargetMode',
    'sneakRawEnforcement',
    'enableAllTokensVision',
  ],
  'Visibility & Hover': [
    'enableHoverTooltips',
    'allowPlayerTooltips',
    'blockPlayerTargetTooltips',
    'tooltipFontSize',
    'colorblindMode',
    'hiddenWallsEnabled',
    'wallStealthDC',
  ],
  'Seek & Range': [
    'seekUseTemplate',
    'limitSeekRangeInCombat',
    'limitSeekRangeOutOfCombat',
    'customSeekDistance',
    'customSeekDistanceOutOfCombat',
  ],
  'Awareness Propagation': [
    'awarenessEnabled',
    'awarenessPrivacyLevel',
    'awarenessNoiseRadius',
    'awarenessCommunicationRadius',
    'awarenessMaxRange',
    'awarenessRequireLoS',
    'awarenessAllowSenses',
    'awarenessLogToGM',
    'awarenessShowFuzzyMarkers',
    'awarenessAutoWhisper',
  ],
  'Auto-cover': [
    'autoCover',
    'autoCoverTokenIntersectionMode',
    'autoCoverCoverageStandardPct',
    'autoCoverCoverageGreaterPct',
    'autoCoverIgnoreUndetected',
    'autoCoverVisualizationOnlyInEncounter',
    'autoCoverIgnoreDead',
    'autoCoverIgnoreAllies',
    'autoCoverRespectIgnoreFlag',
    'autoCoverAllowProneBlockers',
    'autoCoverVisualizationRespectFogForGM',
    'wallCoverAllowGreater',
    'wallCoverStandardThreshold',
    'wallCoverGreaterThreshold',
  ],
  Advanced: ['debug'],
};

function isGroupedKey(key) {
  return Object.values(SETTINGS_GROUPS).some((arr) => arr.includes(key));
}

let currentVisionerSettingsApp = null;

class VisionerSettingsForm extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'pf2e-visioner-settings',
    tag: 'div',
    window: {
      title: 'PF2E Visioner Settings',
      icon: 'fas fa-sliders-h',
      resizable: true,
    },
    position: { width: 640, height: 600 },
    classes: ['pf2e-visioner-settings-window'],
    actions: {
      submit: VisionerSettingsForm._onSubmit,
      switchGroup: VisionerSettingsForm._onSwitchGroup,
    },
  };

  constructor(options = {}) {
    super(options);
    currentVisionerSettingsApp = this;
    // Track unsaved edits across tab switches so the Save button applies all changes
    this._pendingChanges = {};
    // Default to the first defined group
    try {
      if (!this.activeGroupKey) this.activeGroupKey = Object.keys(SETTINGS_GROUPS)[0];
    } catch (_) {
      this.activeGroupKey = 'General';
    }
  }

  async _prepareContext() {
    const isGM = !!game.user?.isGM;
    const keyVisible = (key) => {
      const cfg = DEFAULT_SETTINGS[key];
      if (!cfg) return false;
      if (cfg.restricted && !isGM) return false;
      return true;
    };

    // Only show categories (tabs) that have at least one visible item
    const visibleCategoryKeys = Object.keys(SETTINGS_GROUPS).filter((cat) =>
      (SETTINGS_GROUPS[cat] || []).some((k) => keyVisible(k)),
    );

    // If current active group has no visible items, switch to the first visible group
    if (!visibleCategoryKeys.includes(this.activeGroupKey)) {
      this.activeGroupKey = visibleCategoryKeys[0] || this.activeGroupKey;
    }

    const categories = visibleCategoryKeys.map((k) => ({
      key: k,
      title: k,
      active: k === this.activeGroupKey,
    }));
    const groups = [];
    const activeKeys = (SETTINGS_GROUPS[this.activeGroupKey] || []).filter((k) => keyVisible(k));
    const items = [];
    for (const key of activeKeys) {
      const cfg = DEFAULT_SETTINGS[key];
      if (!cfg) continue;
      // Prefer pending (unsaved) value if user edited in another tab visit
      const pendingRaw = this?._pendingChanges?.[`settings.${key}`];
      const saved = game.settings.get(MODULE_ID, key);
      let current = saved;
      if (pendingRaw !== undefined) {
        if (cfg.type === Boolean) current = !!pendingRaw;
        else if (cfg.type === Number)
          current = pendingRaw !== '' && pendingRaw != null ? Number(pendingRaw) : saved;
        else current = String(pendingRaw);
      }
      let inputType = 'text';
      let choicesList = null;
      if (cfg.choices && typeof cfg.choices === 'object') {
        inputType = 'select';
        try {
          choicesList = Object.entries(cfg.choices).map(([val, label]) => ({
            value: val,
            label,
            selected: String(current) === String(val),
          }));
        } catch (_) {
          choicesList = null;
        }
      } else if (cfg.type === Boolean) inputType = 'checkbox';
      else if (cfg.type === Number) inputType = 'number';
      items.push({
        key,
        name: game.i18n?.localize?.(cfg.name) ?? cfg.name,
        hint: game.i18n?.localize?.(cfg.hint) ?? (cfg.hint || ''),
        value: current,
        inputType,
        choices: choicesList,
        min: cfg.min ?? null,
        max: cfg.max ?? null,
        step: cfg.step ?? 1,
      });
    }
    if (items.length) groups.push({ title: this.activeGroupKey, items });
    return { groups, categories };
  }

  async _renderHTML(context, _options) {
    return await foundry.applications.handlebars.renderTemplate(
      'modules/pf2e-visioner/templates/settings-menu.hbs',
      context,
    );
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    try {
      // Wire tabs for categories
      const tabs = content.querySelectorAll('[data-action="switchGroup"][data-key]');
      tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
          try {
            VisionerSettingsForm._onSwitchGroup(null, btn);
          } catch (_) { }
        });
      });

      // Utility: show/hide a setting's form-group wrapper
      const toggleSettingVisibility = (name, visible) => {
        try {
          const input = content.querySelector(`[name="settings.${name}"]`);
          if (!input) return;
          const group =
            input.closest('.pv-form-row') || input.closest('.form-group') || input.parentElement;
          if (!group) return;
          if (!group.dataset.pvDisplay) {
            const computed = getComputedStyle(group)?.display || '';
            group.dataset.pvDisplay = group.style.display || computed || '';
          }
          group.style.display = visible ? group.dataset.pvDisplay : 'none';
        } catch (_) { }
      };

      // Coverage thresholds visible only when mode === 'coverage'
      const modeSel = content.querySelector('[name="settings.autoCoverTokenIntersectionMode"]');
      const applyCoverageModeVisibility = () => {
        /* thresholds are fixed; keep them hidden */
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
      if (useTemplateToggle)
        useTemplateToggle.addEventListener('change', applySeekTemplateVisibility);
      applySeekTemplateVisibility();

      // Hide "Block Player Target Tooltips" unless "Allow Player Tooltips" is enabled
      const allowPlayerTooltipsToggle = content.querySelector(
        '[name="settings.allowPlayerTooltips"]',
      );
      const applyPlayerTooltipVisibility = () => {
        const on = !!allowPlayerTooltipsToggle?.checked;
        toggleSettingVisibility('blockPlayerTargetTooltips', on);
      };
      if (allowPlayerTooltipsToggle) {
        allowPlayerTooltipsToggle.addEventListener('change', applyPlayerTooltipVisibility);
      }
      applyPlayerTooltipVisibility();

      // Hide tooltip size unless hover tooltips are enabled
      const enableHoverTooltipsToggle = content.querySelector(
        '[name="settings.enableHoverTooltips"]',
      );
      const applyHoverTooltipVisibility = () => {
        // If the GM-only toggle isn't present (e.g., for players), base visibility
        // on both global enablement and whether players are allowed to see tooltips.
        let on;
        try {
          if (enableHoverTooltipsToggle) {
            // In GM view, use the checkbox state directly
            on = !!enableHoverTooltipsToggle.checked;
          } else {
            const globallyEnabled = !!game.settings.get(MODULE_ID, 'enableHoverTooltips');
            const playersAllowed = !!game.settings.get(MODULE_ID, 'allowPlayerTooltips');
            on = globallyEnabled && playersAllowed;
          }
        } catch (_) {
          on = !!enableHoverTooltipsToggle?.checked;
        }
        toggleSettingVisibility('tooltipFontSize', on);
      };
      if (enableHoverTooltipsToggle)
        enableHoverTooltipsToggle.addEventListener('change', applyHoverTooltipVisibility);
      // Also react to Allow Player Tooltips changes (GM view) so preview updates
      if (allowPlayerTooltipsToggle)
        allowPlayerTooltipsToggle.addEventListener('change', applyHoverTooltipVisibility);
      applyHoverTooltipVisibility();

      // Hide all Auto-cover settings unless the main toggle is on
      const autoCoverToggle = content.querySelector('[name="settings.autoCover"]');
      const wallsGreaterCoverToggle = content.querySelector('[name="settings.wallCoverAllowGreater"]');

      const autoCoverDependents = [
        'autoCoverTokenIntersectionMode',
        'autoCoverCoverageStandardPct',
        'autoCoverCoverageGreaterPct',
        'autoCoverIgnoreUndetected',
        'autoCoverVisualizationOnlyInEncounter',
        'autoCoverIgnoreDead',
        'autoCoverIgnoreAllies',
        'autoCoverRespectIgnoreFlag',
        'autoCoverAllowProneBlockers',
        'autoCoverVisualizationRespectFogForGM',
        'wallCoverAllowGreater',
        'wallCoverStandardThreshold',
        'wallCoverGreaterThreshold',
      ];
      const applyAutoCoverVisibility = () => {
        const on = !!autoCoverToggle?.checked;
        for (const key of autoCoverDependents) toggleSettingVisibility(key, on);
        // Re-apply coverage sub-visibility if turning on
        if (on) {
          try {
            applyCoverageModeVisibility();
          } catch (_) { }
        }
      };

      const applyWallCoverVisibility = () => {
        const on = !!wallsGreaterCoverToggle?.checked;
        toggleSettingVisibility('wallCoverGreaterThreshold', on);
      };
      if (autoCoverToggle) autoCoverToggle.addEventListener('change', applyAutoCoverVisibility);
      if (wallsGreaterCoverToggle) wallsGreaterCoverToggle.addEventListener('change', applyWallCoverVisibility);
      applyAutoCoverVisibility();
      applyWallCoverVisibility();
    } catch (_) { }
    return content;
  }

  static async _onSubmit(event, _button) {
    const app = currentVisionerSettingsApp || this;
    try {
      const formEl = app.element.querySelector('form.pf2e-visioner-settings');
      if (!formEl) return app.close();
      // Capture any unsaved edits from the currently visible group before reading form data
      try {
        app._capturePendingChanges();
      } catch (_) { }
      const fd = new FormData(formEl);
      const rawMap = Object.fromEntries(fd.entries());
      // Merge previously edited values from other tabs
      if (app?._pendingChanges) {
        for (const [name, value] of Object.entries(app._pendingChanges)) {
          if (!(name in rawMap)) rawMap[name] = value;
        }
      }
      const allKeys = Object.values(SETTINGS_GROUPS).flat();
      for (const key of allKeys) {
        const cfg = DEFAULT_SETTINGS[key];
        if (!cfg) continue;
        const formKey = `settings.${key}`;
        const raw = rawMap[formKey];
        // If the key wasn't present in the merged form+pending map, don't touch it
        if (raw === undefined) continue;
        const saved = game.settings.get(MODULE_ID, key);
        let value;
        if (cfg.type === Boolean) value = raw === 'on' || raw === 'true' || raw === true;
        else if (cfg.type === Number) value = raw != null && raw !== '' ? Number(raw) : saved;
        else value = raw != null ? raw : saved;
        if (value !== saved) await game.settings.set(MODULE_ID, key, value);
      }
      // Reset pending after successful save
      try {
        app._pendingChanges = {};
      } catch (_) { }
      try {
        await app.close();
      } catch (_) { }
    } catch (e) {
      /* noop */ try {
        await app.close();
      } catch (_) { }
    }
  }

  static _onSwitchGroup(_event, button) {
    try {
      const key = button?.dataset?.key;
      if (!key) return;
      const app = currentVisionerSettingsApp;
      if (!app) return;
      // Preserve edits from the current group before switching
      try {
        app._capturePendingChanges();
      } catch (_) { }
      app.activeGroupKey = key;
      app.render({ force: true });
    } catch (_) { }
  }
}

// Instance helpers
VisionerSettingsForm.prototype._capturePendingChanges = function _capturePendingChanges() {
  try {
    const form = this.element?.querySelector?.('form.pf2e-visioner-settings');
    if (!form) return;
    const inputs = form.querySelectorAll('[name^="settings."]');
    inputs.forEach((el) => {
      const name = el.name;
      if (!name) return;
      if (el.type === 'checkbox') this._pendingChanges[name] = !!el.checked;
      else this._pendingChanges[name] = el.value;
    });
  } catch (_) { }
};

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
      if (key === 'enableHoverTooltips') {
        // Live-apply without world reload
        settingConfig.onChange = async (value) => {
          try {
            const { initializeHoverTooltips, cleanupHoverTooltips } = await import(
              './services/hover-tooltips.js'
            );
            if (value) initializeHoverTooltips();
            else cleanupHoverTooltips();
          } catch (_) { }
        };
      } else if (key === 'allowPlayerTooltips') {
        settingConfig.onChange = () => { };
      } else if (key === 'useHudButton' || key === 'enableHoverTooltips') {
        settingConfig.onChange = () => {
          SettingsConfig.reloadConfirm({
            world: true,
          });
        };
      } else if (key === 'ignoreAllies') {
        settingConfig.onChange = () => { };
      } else if (key === 'defaultEncounterFilter') {
        settingConfig.onChange = () => { };
      } else if (key === 'seekUseTemplate') {
        // No reload needed: panel logic reads this setting at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'limitSeekRangeInCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'limitSeekRangeOutOfCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'customSeekDistance') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'customSeekDistanceOutOfCombat') {
        // No reload needed: seek distance is read at runtime
        settingConfig.onChange = () => { };
      } else if (
        key === 'autoCover' ||
        key === 'autoCoverTokenIntersectionMode' ||
        key === 'autoCoverCoverageStandardPct' ||
        key === 'autoCoverCoverageGreaterPct' ||
        key === 'autoCoverIgnoreUndetected' ||
        key === 'autoCoverIgnoreDead' ||
        key === 'autoCoverIgnoreAllies' ||
        key === 'autoCoverRespectIgnoreFlag' ||
        key === 'autoCoverAllowProneBlockers'
      ) {
        // No reload needed: auto-cover is read at runtime
        settingConfig.onChange = () => { };
      } else if (key === 'blockPlayerTargetTooltips') {
        // No reload: will take effect on next hover; ensure initialized when allowed
        settingConfig.onChange = async () => {
          try {
            const { initializeHoverTooltips } = await import('./services/hover-tooltips.js');
            if (
              game.settings.get(MODULE_ID, 'enableHoverTooltips') &&
              game.settings.get(MODULE_ID, 'allowPlayerTooltips')
            )
              initializeHoverTooltips();
          } catch (_) { }
        };
      } else if (key === 'hideVisionerSceneTools') {
        // Rebuild scene controls to add/remove Visioner tools immediately
        settingConfig.onChange = () => {
          try {
            ui.controls.render();
            SettingsConfig.reloadConfirm({
              world: true,
            });
          } catch (_) { }
        };
      } else if (key === 'hiddenWallsEnabled') {
        // Refresh wall visuals when toggled
        settingConfig.onChange = async () => {
          try {
            const { updateWallVisuals } = await import('./services/visual-effects.js');
            await updateWallVisuals();
          } catch (_) { }
        };
      } else if (key === 'tooltipFontSize') {
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
            '--pf2e-visioner-tooltip-font-size',
            `${preset.font}px`,
          );
          document.documentElement.style.setProperty(
            '--pf2e-visioner-tooltip-icon-size',
            `${preset.icon}px`,
          );
          document.documentElement.style.setProperty(
            '--pf2e-visioner-tooltip-badge-border',
            `${preset.border}px`,
          );
        };
      } else if (key === 'colorblindMode') {
        settingConfig.onChange = (value) => {
          // Apply colorblind mode CSS class to the body
          document.body.classList.remove(
            'pf2e-visioner-colorblind-protanopia',
            'pf2e-visioner-colorblind-deuteranopia',
            'pf2e-visioner-colorblind-tritanopia',
            'pf2e-visioner-colorblind-achromatopsia',
          );

          if (value !== 'none') {
            document.body.classList.add(`pf2e-visioner-colorblind-${value}`);
          }

          // Apply to any existing .pf2e-visioner containers to ensure immediate effect
          const containers = document.querySelectorAll('.pf2e-visioner');
          containers.forEach((container) => {
            container.classList.remove(
              'pf2e-visioner-colorblind-protanopia',
              'pf2e-visioner-colorblind-deuteranopia',
              'pf2e-visioner-colorblind-tritanopia',
              'pf2e-visioner-colorblind-achromatopsia',
            );

            if (value !== 'none') {
              container.classList.add(`pf2e-visioner-colorblind-${value}`);
            }
          });

          // Re-inject chat automation styles to apply new colorblind colors
          try {
            reinjectChatAutomationStyles();
            console.log(
              `[PF2E Visioner] Re-injected chat automation styles for colorblind mode: ${value}`,
            );
          } catch (error) {
            console.warn(`[PF2E Visioner] Failed to re-inject chat automation styles:`, error);
          }

          // Force immediate visual update by triggering a re-render
          setTimeout(() => {
            const tokenManager = document.querySelector('.pf2e-visioner.token-visibility-manager');
            if (tokenManager) {
              // Force a style recalculation
              tokenManager.style.display = 'none';
              tokenManager.offsetHeight; // Trigger reflow
              tokenManager.style.display = '';
            }
          }, 10);
        };
      } else if (key === 'keybindingOpensTMInTargetMode') {
        // No reload needed: swap mode is read at runtime
        settingConfig.onChange = () => { };
      }

      try {
        game.settings.register(MODULE_ID, key, settingConfig);
      } catch (settingError) {
        throw settingError;
      }
    });

    // Register a single grouped settings menu entry
    try {
      game.settings.registerMenu(MODULE_ID, 'groupedSettings', {
        name: 'PF2E Visioner Settings',
        label: 'Open',
        hint: 'Grouped settings by category (General, Visibility & Hover, Seek & Range, Auto Cover, Advanced)',
        icon: 'fas fa-sliders-h',
        type: VisionerSettingsForm,
        restricted: false,
      });
    } catch (_) { }
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
        const mode = game.settings.get(MODULE_ID, 'keybindingOpensTMInTargetMode')
          ? 'target'
          : 'observer';
        const { api } = await import('./api.js');
        await api.openTokenManager(null, { mode });
      };
    } else if (key === 'openQuickPanel') {
      keybindingConfig.onDown = async () => {
        try {
          const { VisionerQuickPanel } = await import('./managers/quick-panel.js');
          const existing =
            VisionerQuickPanel.current ||
            Object.values(ui.windows || {}).find((w) => w instanceof VisionerQuickPanel) ||
            null;
          // Toggle: if open, close it
          if (existing) {
            try {
              await existing.close();
            } catch (_) { }
            return;
          }

          // If minimized floater exists, restore at its position
          const floater = document.getElementById('pf2e-visioner-floating-qp');
          if (floater) {
            const left = parseInt(floater.style.left || '0', 10) || 120;
            const top = parseInt(floater.style.top || '0', 10) || 120;
            const qp = new VisionerQuickPanel();
            qp.position = { ...(qp.position || {}), left, top };
            qp.render(true);
            try {
              qp._removeFloatingButton();
            } catch (_) { }
            return;
          }

          // Otherwise open a new one
          const qp = new VisionerQuickPanel();
          qp.render(true);
        } catch (_) { }
      };
    } else if (key === 'openVisibilityManager') {
      keybindingConfig.onDown = async () => {
        const { api } = await import('./api.js');
        await api.openVisibilityManager();
      };
    } else if (key === 'toggleObserverMode') {
      keybindingConfig.onDown = async () => {
        const { setTooltipMode } = await import('./services/hover-tooltips.js');
        setTooltipMode('observer');
      };
      keybindingConfig.onUp = async () => {
        const { setTooltipMode } = await import('./services/hover-tooltips.js');
        setTooltipMode('target');
      };
    } else if (key === 'showAutoCoverOverlay') {
      keybindingConfig.onDown = async () => {
        try {
          const { HoverTooltips, showAutoCoverComputedOverlay, hideAutoCoverComputedOverlay } =
            await import('./services/hover-tooltips.js');
          // Decide source token: hovered or first controlled
          let token = HoverTooltips.currentHoveredToken;
          if (!token) token = canvas.tokens.controlled?.[0] || null;
          if (!token) return;
          // Render fresh auto-cover computation overlay (cover-only)
          hideAutoCoverComputedOverlay();
          showAutoCoverComputedOverlay(token);
        } catch (_) { }
      };
      keybindingConfig.onUp = async () => {
        try {
          const { hideAutoCoverComputedOverlay } = await import('./services/hover-tooltips.js');
          hideAutoCoverComputedOverlay();
        } catch (_) { }
      };
    }

    game.keybindings.register(MODULE_ID, key, keybindingConfig);
  });
}
