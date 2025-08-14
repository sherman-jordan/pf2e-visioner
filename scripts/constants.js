/**
 * Constants and configuration for PF2E Visioner
 */

export const MODULE_ID = "pf2e-visioner";
export const MODULE_TITLE = "PF2E Visioner";

/**
 * Visibility states supported by the module - aligned with PF2E detection conditions
 */
export const VISIBILITY_STATES = {
  observed: {
    label: "PF2E_VISIONER.VISIBILITY_STATES.observed",
    pf2eCondition: null,
    visible: true,
    icon: "fas fa-eye",
    color: "#4caf50", // Green - safe/visible
  },
  concealed: {
    label: "PF2E_VISIONER.VISIBILITY_STATES.concealed",
    pf2eCondition: "concealed",
    visible: true,
    icon: "fas fa-cloud",
    color: "#ffc107", // Yellow - caution
  },
  hidden: {
    label: "PF2E_VISIONER.VISIBILITY_STATES.hidden",
    pf2eCondition: "hidden",
    visible: true,
    icon: "fas fa-eye-slash",
    color: "#ff6600", // Bright orange - warning
  },
  undetected: {
    label: "PF2E_VISIONER.VISIBILITY_STATES.undetected",
    pf2eCondition: "undetected",
    visible: false, // Hide completely like invisible used to
    icon: "fas fa-ghost",
    color: "#f44336", // Red - danger
  },
};

/**
 * Cover states supported by the module - aligned with PF2E cover rules
 */
export const COVER_STATES = {
  none: {
    label: "PF2E_VISIONER.COVER_STATES.none",
    pf2eCondition: null,
    icon: "fas fa-shield-slash",
    color: "#4caf50", // Green - no cover
    bonusAC: 0,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  lesser: {
    label: "PF2E_VISIONER.COVER_STATES.lesser",
    pf2eCondition: "lesser-cover",
    icon: "fa-regular fa-shield",
    color: "#ffc107", // Yellow - minor cover
    bonusAC: 1,
    bonusReflex: 0,
    bonusStealth: 0,
    canHide: false,
  },
  standard: {
    label: "PF2E_VISIONER.COVER_STATES.standard",
    pf2eCondition: "cover",
    icon: "fas fa-shield-alt",
    color: "#ff6600", // Orange - significant cover
    bonusAC: 2,
    bonusReflex: 2,
    bonusStealth: 2,
    canHide: true,
  },
  greater: {
    label: "PF2E_VISIONER.COVER_STATES.greater",
    pf2eCondition: "greater-cover",
    icon: "fas fa-shield",
    color: "#f44336", // Red - major cover
    bonusAC: 4,
    bonusReflex: 4,
    bonusStealth: 4,
    canHide: true,
  },
};

/**
 * Default module settings
 */
export const DEFAULT_SETTINGS = {
  // Visibility Indicators
  hiddenWallsEnabled: {
    name: "PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.name",
    hint: "PF2E_VISIONER.SETTINGS.HIDDEN_WALLS.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },
  
  enableHoverTooltips: {
    name: "PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.name",
    hint: "PF2E_VISIONER.SETTINGS.ENABLE_HOVER_TOOLTIPS.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },

  allowPlayerTooltips: {
    name: "PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.name",
    hint: "PF2E_VISIONER.SETTINGS.ALLOW_PLAYER_TOOLTIPS.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  tooltipFontSize: {
    name: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.name",
    hint: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.hint",
    scope: "client",
    config: true,
    restricted: false,
    type: String,
    choices: {
      tiny: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.tiny",
      small: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.small",
      medium: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.medium",
      large: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.large",
      xlarge: "PF2E_VISIONER.SETTINGS.TOOLTIP_FONT_SIZE.CHOICES.xlarge",
    },
    default: "medium",
  },

  colorblindMode: {
    name: "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.name",
    hint: "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.hint",
    scope: "client",
    config: true,
    restricted: false, // Allow players to see and change this setting
    type: String,
    choices: {
      none: "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.none",
      protanopia: "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.protanopia",
      deuteranopia:
        "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.deuteranopia",
      tritanopia: "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.tritanopia",
      achromatopsia:
        "PF2E_VISIONER.SETTINGS.COLORBLIND_MODE.CHOICES.achromatopsia",
    },
    default: "none",
  },

  // Token Filtering
  ignoreAllies: {
    name: "PF2E_VISIONER.SETTINGS.IGNORE_ALLIES.name",
    hint: "PF2E_VISIONER.SETTINGS.IGNORE_ALLIES.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // Loot DCs
  lootStealthDC: {
    name: "PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.name",
    hint: "PF2E_VISIONER.SETTINGS.LOOT_STEALTH_DC.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 15,
  },

  // Walls DCs
  wallStealthDC: {
    name: "PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.name",
    hint: "PF2E_VISIONER.SETTINGS.WALL_STEALTH_DC.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 15,
  },

  experimentalSeeThroughWalls: {
    name: "PF2E_VISIONER.SETTINGS.EXPERIMENTAL_SEE_THROUGH_WALLS.name",
    hint: "PF2E_VISIONER.SETTINGS.EXPERIMENTAL_SEE_THROUGH_WALLS.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  },

  // Include additional object types in managers
  includeLootActors: {
    name: "PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.name",
    hint: "PF2E_VISIONER.SETTINGS.INCLUDE_LOOT_ACTORS.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },
  defaultEncounterFilter: {
    name: "PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.name",
    hint: "PF2E_VISIONER.SETTINGS.DEFAULT_ENCOUNTER_FILTER.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // Seek Action Settings
  seekUseTemplate: {
    name: "PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.name",
    hint: "PF2E_VISIONER.SETTINGS.SEEK_USE_TEMPLATE.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  limitSeekRangeInCombat: {
    name: "PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.name",
    hint: "PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // Seek range limitation outside of combat
  limitSeekRangeOutOfCombat: {
    name: "PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.name",
    hint: "PF2E_VISIONER.SETTINGS.LIMIT_SEEK_RANGE_OUT_OF_COMBAT.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  customSeekDistance: {
    name: "PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.name",
    hint: "PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 30,
  },

  // Separate distance for out-of-combat seeks
  customSeekDistanceOutOfCombat: {
    name: "PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.name",
    hint: "PF2E_VISIONER.SETTINGS.CUSTOM_SEEK_DISTANCE_OOC.hint",
    scope: "world",
    config: true,
    type: Number,
    default: 30,
  },

  // Interface Settings
  useHudButton: {
    name: "PF2E_VISIONER.SETTINGS.USE_HUD_BUTTON.name",
    hint: "PF2E_VISIONER.SETTINGS.USE_HUD_BUTTON.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },

  blockPlayerTargetTooltips: {
    name: "PF2E_VISIONER.SETTINGS.BLOCK_PLAYER_TARGET_TOOLTIPS.name",
    hint: "PF2E_VISIONER.SETTINGS.BLOCK_PLAYER_TARGET_TOOLTIPS.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // RAW enforcement toggle
  enforceRawRequirements: {
    name: "PF2E_VISIONER.SETTINGS.ENFORCE_RAW.name",
    hint: "PF2E_VISIONER.SETTINGS.ENFORCE_RAW.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // Token Manager
  integrateRollOutcome: {
    name: "PF2E_VISIONER.SETTINGS.INTEGRATE_ROLL_OUTCOME.name",
    hint: "PF2E_VISIONER.SETTINGS.INTEGRATE_ROLL_OUTCOME.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  autoCover: {
    name: "PF2E_VISIONER.SETTINGS.AUTO_COVER.name",
    hint: "PF2E_VISIONER.SETTINGS.AUTO_COVER.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },

  // Auto-Cover behavior tuning
  autoCoverTokenIntersectionMode: {
    name: "Auto-Cover: Token Intersection Mode",
    hint: "Choose how token blockers are evaluated: 'Center' (ray goes through token center), or side-coverage modes where the portion of the ray inside the token is measured against the token's side length (not the ray length).",
    scope: "world",
    config: true,
    type: String,
    choices: {
      length10: "Ray inside ≥10% of blocking token square",
      length20: "Ray inside ≥20% of blocking token square",
      center: "Ray through token center",
    },
    default: "center",
  },
  autoCoverIgnoreUndetected: {
    name: "Auto-Cover: Ignore Undetected Tokens",
    hint: "If enabled, tokens that are undetected to the attacker (per Visioner visibility map) won't count for auto-cover.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },
  autoCoverIgnoreDead: {
    name: "Auto-Cover: Ignore Dead Tokens",
    hint: "If enabled, tokens with 0 HP won't count for auto-cover.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },
  autoCoverIgnoreAllies: {
    name: "Auto-Cover: Ignore Allies",
    hint: "If enabled, allied tokens won't count for auto-cover.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },
  autoCoverRespectIgnoreFlag: {
    name: "Auto-Cover: Respect Token Ignore Flag",
    hint: "If enabled, tokens with the flag pf2e-visioner.ignoreAutoCover = true won't count for auto-cover.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },
  autoCoverAllowProneBlockers: {
    name: "Auto-Cover: Prone Tokens Can Block",
    hint: "If enabled, prone tokens can grant cover. If disabled, prone tokens are ignored as blockers.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  },

  debug: {
    name: "Debug Mode",
    hint: "Enable detailed console logging for troubleshooting",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  },
};

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  ENCOUNTER_FILTER_TEXT: "PF2E_VISIONER.UI.ENCOUNTER_FILTER_TEXT",
};

/**
 * Keybinding configurations
 */
export const KEYBINDINGS = {
  openTokenManager: {
    name: "PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.name",
    hint: "PF2E_VISIONER.KEYBINDINGS.OPEN_TOKEN_MANAGER.hint",
    editable: [{ key: "KeyV", modifiers: ["Control", "Shift"] }],
  },
  toggleObserverMode: {
    name: "PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.name",
    hint: "PF2E_VISIONER.KEYBINDINGS.TOGGLE_OBSERVER_MODE.hint",
    editable: [{ key: "KeyO", modifiers: [] }],
    restricted: false,
  },
  holdCoverOverride: {
    name: "PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.name",
    hint: "PF2E_VISIONER.KEYBINDINGS.HOLD_COVER_OVERRIDE.hint",
    // No default binding; user can configure
    editable: [],
    restricted: false,
  },
};
