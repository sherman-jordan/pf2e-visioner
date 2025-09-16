/**
 * Constants and configuration for PF2E Visioner
 */

export const MODULE_ID = 'pf2e-visioner';
export const MODULE_TITLE = 'PF2E Visioner';

/**
 * Visibility states supported by the module - aligned with PF2E detection conditions
 */
export const VISIBILITY_STATES = {
  observed: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.observed',
    pf2eCondition: null,
    visible: true,
    icon: 'fas fa-eye',
    color: 'var(--visibility-observed, #4caf50)', // Green - safe/visible
    cssClass: 'visibility-observed',
  },
  concealed: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.concealed',
    pf2eCondition: 'concealed',
    visible: true,
    icon: 'fas fa-cloud',
    color: 'var(--visibility-concealed, #ffc107)', // Yellow - caution
    cssClass: 'visibility-concealed',
  },
  hidden: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.hidden',
    pf2eCondition: 'hidden',
    visible: true,
    icon: 'fas fa-eye-slash',
    color: 'var(--visibility-hidden, #ff6600)', // Bright orange - warning
    cssClass: 'visibility-hidden',
  },
  undetected: {
    label: 'PF2E_VISIONER.VISIBILITY_STATES.undetected',
    pf2eCondition: 'undetected',
    visible: false, // Hide completely like invisible used to
    icon: 'fas fa-ghost',
    color: 'var(--visibility-undetected, #f44336)', // Red - danger
    cssClass: 'visibility-undetected',
  },
};

/**
 * Cover states supported by the module - aligned with PF2E cover rules
 */
export const COVER_STATES = {
  none: {
    label: 'PF2E_VISIONER.COVER_STATES.none',
    pf2eCondition: null,
    icon: 'fas fa-shield-slash',
    color: 'var(--cover-none, #4caf50)', // Green - no cover
    cssClass: 'cover-none',
    bonusAC: 0,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  lesser: {
    label: 'PF2E_VISIONER.COVER_STATES.lesser',
    pf2eCondition: 'lesser-cover',
    icon: 'fa-regular fa-shield',
    color: 'var(--cover-lesser, #ffc107)', // Yellow - minor cover
    cssClass: 'cover-lesser',
    bonusAC: 1,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  standard: {
    label: 'PF2E_VISIONER.COVER_STATES.standard',
    pf2eCondition: 'cover',
    icon: 'fas fa-shield-alt',
    color: 'var(--cover-standard, #ff6600)', // Orange - significant cover
    cssClass: 'cover-standard',
    bonusAC: 2,
    bonusReflex: 2,
    bonusStealth: 2,
    canHide: true,
  },
  greater: {
    label: 'PF2E_VISIONER.COVER_STATES.greater',
    pf2eCondition: 'greater-cover',
    icon: 'fas fa-shield',
    color: 'var(--cover-greater, #f44336)', // Red - major cover
    cssClass: 'cover-greater',
    bonusAC: 4,
    bonusReflex: 4,
    bonusStealth: 4,
    canHide: true,
  },
};

/**
 * Sneak action flags
 */
export const SNEAK_FLAGS = {
  SNEAK_ACTIVE: 'sneak-active', // Flag indicating token is currently sneaking
};


/**
 * Default module settings
 */
export const DEFAULT_SETTINGS = {
  // Visibility Indicators
  hiddenWallsEnabled: {
    name: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.name',
    hint: 'PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  enableHoverTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  allowPlayerTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  tooltipFontSize: {
    name: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.name',
    hint: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.hint',
    scope: 'client',
    config: true,
    restricted: false,
    type: String,
    choices: {
      tiny: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.tiny',
      small: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.small',
      medium: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.medium',
      large: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.large',
      xlarge: 'PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.xlarge',
    },
    default: 'medium',
  },

  // Auto-Visibility System
  autoVisibilityEnabled: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_ENABLED.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_ENABLED.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoVisibilityUpdateOnMovement: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_UPDATE_ON_MOVEMENT.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_UPDATE_ON_MOVEMENT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  autoVisibilityUpdateOnLighting: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_UPDATE_ON_LIGHTING.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_UPDATE_ON_LIGHTING.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  autoVisibilityDebugMode: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_DEBUG_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_DEBUG_MODE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoVisibilityThrottleDelay: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_THROTTLE_DELAY.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_VISIBILITY_THROTTLE_DELAY.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 500,
    range: {
      min: 100,
      max: 2000,
      step: 100,
    },
  },

  colorblindMode: {
    name: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.name',
    hint: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.hint',
    scope: 'client',
    config: true,
    restricted: false, // Allow players to see and change this setting
    type: String,
    choices: {
      none: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.none',
      protanopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.protanopia',
      deuteranopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.deuteranopia',
      tritanopia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.tritanopia',
      achromatopsia: 'PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.achromatopsia',
    },
    default: 'none',
  },

  // Token Filtering
  ignoreAllies: {
    name: 'PF2E_VISIONER.SETTINGS.IGNORE_ALLIES_DEFAULT.name',
    hint: 'PF2E_VISIONER.SETTINGS.IGNORE_ALLIES_DEFAULT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  // Visual filter: hide Foundry-hidden tokens in UIs
  hideFoundryHiddenTokens: {
    name: 'PF2E_VISIONER.SETTINGS.HIDE_FOUNDRY_HIDDEN_TOKENS.name',
    hint: 'PF2E_VISIONER.SETTINGS.HIDE_FOUNDRY_HIDDEN_TOKENS.hint',
    scope: 'client',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  // Token Filtering
  enableAllTokensVision: {
    name: 'PF2E_VISIONER.SETTINGS.ENABLE_ALL_TOKENS_VISION.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENABLE_ALL_TOKENS_VISION.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Loot DCs
  lootStealthDC: {
    name: 'PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.name',
    hint: 'PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 15,
  },

  // Walls DCs
  wallStealthDC: {
    name: 'PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.name',
    hint: 'PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 15,
  },

  // Include additional object types in managers
  includeLootActors: {
    name: 'PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.name',
    hint: 'PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  defaultEncounterFilter: {
    name: 'PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.name',
    hint: 'PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Seek Action Settings
  seekUseTemplate: {
    name: 'PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.name',
    hint: 'PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  limitSeekRangeInCombat: {
    name: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.name',
    hint: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Seek range limitation outside of combat
  limitSeekRangeOutOfCombat: {
    name: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.name',
    hint: 'PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  customSeekDistance: {
    name: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.name',
    hint: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 30,
  },

  // Separate distance for out-of-combat seeks
  customSeekDistanceOutOfCombat: {
    name: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.name',
    hint: 'PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 30,
  },

  // Interface Settings
  useHudButton: {
    name: 'PF2E_VISIONER.SETTINGS.USE_HUD_BUTTON.name',
    hint: 'PF2E_VISIONER.SETTINGS.USE_HUD_BUTTON.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Hide Visioner tools in Tokens and Walls scene controls
  hideVisionerSceneTools: {
    name: 'Hide Visioner Tools in Scene Controls',
    hint: 'If enabled, Visioner buttons/toggles on the Tokens and Walls toolbars are hidden. You can still access features via menus and keybinds.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  blockPlayerTargetTooltips: {
    name: 'PF2E_VISIONER.SETTINGS.BLOCK_PLAYER_TARGET_TOOLTIPS.name',
    hint: 'PF2E_VISIONER.SETTINGS.BLOCK_PLAYER_TARGET_TOOLTIPS.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Token Manager
  integrateRollOutcome: {
    name: 'PF2E_VISIONER.SETTINGS.INTEGRATE_ROLL_OUTCOME.name',
    hint: 'PF2E_VISIONER.SETTINGS.INTEGRATE_ROLL_OUTCOME.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoCover: {
    name: 'PF2E_VISIONER.SETTINGS.AUTO_COVER.name',
    hint: 'PF2E_VISIONER.SETTINGS.AUTO_COVER.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },

  // Auto-Cover behavior tuning
  autoCoverTokenIntersectionMode: {
    name: 'Auto-Cover: Token Intersection Mode',
    hint: "Choose how token blockers are evaluated: 'Any' (size rule: any entry → Lesser; Standard if blocker is ≥2 sizes larger than both attacker and target), '10%' (ray inside ≥10% of blocker side), 'Coverage' (side coverage with fixed thresholds: Standard at 50%, Greater at 70%), or 'Tactical' (corner-to-corner line calculations for precise cover determination).",
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    choices: {
      any: 'Any (ray entering blocker)',
      length10: '10% (ray inside ≥10% of blocker side)',
      coverage: 'Side Coverage (fixed 50%(Standard)/70%(Greater))',
      tactical: 'Tactical (corner-to-corner calculations)',
    },
    default: 'length10',
  },
  autoCoverIgnoreUndetected: {
    name: 'Auto-Cover: Ignore Undetected Tokens',
    hint: "If enabled, tokens that are undetected to the attacker (per Visioner visibility map) won't count for auto-cover.",
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  autoCoverVisualizationOnlyInEncounter: {
    name: 'Auto-Cover: Visualization Only in Encounter',
    hint: 'If enabled, cover visualization will only work during active encounters. If disabled, cover visualization works everywhere.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverVisualizationRespectFogForGM: {
    name: 'Auto-Cover: GM Respects Line of Sight',
    hint: 'If enabled, GMs will see the cover heatmap limited to explored areas (same as players). If disabled, GMs see the full scene.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
  autoCoverIgnoreDead: {
    name: 'Auto-Cover: Ignore Dead Tokens',
    hint: "If enabled, tokens with 0 HP won't count for auto-cover.",
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverIgnoreAllies: {
    name: 'Auto-Cover: Ignore Allies',
    hint: "If enabled, allied tokens won't count for auto-cover.",
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },

  // Wall cover thresholds (percentage of the target token blocked by walls)
  wallCoverStandardThreshold: {
    name: 'Wall Cover: Standard Threshold (%)',
    hint: 'Percent of the target token that must be blocked by walls to grant Standard cover.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 50,
  },
  wallCoverGreaterThreshold: {
    name: 'Wall Cover: Greater Threshold (%)',
    hint: 'Percent of the target token that must be blocked by walls to grant Greater cover.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Number,
    default: 70,
  },
  wallCoverAllowGreater: {
    name: 'Wall Cover: Allow Greater',
    hint: 'If disabled, walls will never grant Greater cover; coverage above the greater threshold is treated as Standard cover.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  autoCoverAllowProneBlockers: {
    name: 'Auto-Cover: Prone Tokens Can Block',
    hint: 'If enabled, prone tokens can grant cover. If disabled, prone tokens are ignored as blockers.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  keybindingOpensTMInTargetMode: {
    name: 'Keybinding Opens Token Manager in Target Mode',
    hint: 'If enabled, the keybinding to open Token Manager in Target mode rather than Observer mode.',
    scope: 'world',
    config: true,
    restricted: false,
    type: Boolean,
    default: false,
  },

  debug: {
    name: 'Debug Mode',
    hint: 'Enable detailed console logging for troubleshooting',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
  // Hide Quick Edit tool in token controls
  hideQuickEditTool: {
    name: 'Hide Quick Edit Tool',
    hint: 'If enabled, the Quick Edit tool will be hidden from the token controls toolbar.',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
  },
};

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  ENCOUNTER_FILTER_TEXT: 'PF2E_VISIONER.UI.ENCOUNTER_FILTER_TEXT',
};

/**
 * Keybinding configurations
 */
export const KEYBINDINGS = {
  openTokenManager: {
    name: 'PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.hint',
    editable: [{ key: 'KeyV', modifiers: ['Control', 'Shift'] }],
    restricted: true,
  },
  openQuickPanel: {
    name: 'Open Visioner Quick Panel',
    hint: 'Open the compact Visioner Quick Edit panel.',
    editable: [],
    restricted: true,
  },
  toggleObserverMode: {
    name: 'PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.hint',
    editable: [{ key: 'KeyO', modifiers: [] }],
    restricted: false,
  },
  holdCoverOverride: {
    name: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.name',
    hint: 'PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.hint',
    // No default binding; user can configure
    editable: [],
    restricted: false,
  },
  showAutoCoverOverlay: {
    name: 'Show Auto‑Cover Overlay',
    hint: 'Press to show auto‑cover badges for the hovered token (or controlled token if none).',
    editable: [{ key: 'KeyG', modifiers: [] }],
    restricted: false,
  },
  holdCoverVisualization: {
    name: 'Hold for Cover Visualization',
    hint: 'Hold this key while hovering over tokens to visualize cover fields. Shows optimal positioning for attacks.',
    editable: [{ key: 'KeyY', modifiers: [] }],
    restricted: false,
  },
  openWallManager: {
    name: 'Open Wall Manager',
    hint: 'Open the Visioner Wall Manager dialog to bulk edit wall settings.',
    editable: [],
    restricted: true,
  },
};
