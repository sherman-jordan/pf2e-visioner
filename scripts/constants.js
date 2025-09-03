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
 * Awareness states for ally propagation system
 */
export const AWARENESS_STATES = {
  none: {
    label: 'PF2E_VISIONER.AWARENESS_STATES.none',
    icon: 'fas fa-question',
    color: 'var(--color-text-secondary, #666)',
    cssClass: 'awareness-none',
    description: 'PF2E_VISIONER.AWARENESS_STATES.none_desc'
  },
  suspicious: {
    label: 'PF2E_VISIONER.AWARENESS_STATES.suspicious',
    icon: 'fas fa-exclamation-triangle',
    color: 'var(--color-warning, #ffc107)',
    cssClass: 'awareness-suspicious',
    description: 'PF2E_VISIONER.AWARENESS_STATES.suspicious_desc'
  },
  lastKnownArea: {
    label: 'PF2E_VISIONER.AWARENESS_STATES.lastKnownArea',
    icon: 'fas fa-map-marker-alt',
    color: 'var(--color-info, #2196f3)',
    cssClass: 'awareness-last-known',
    description: 'PF2E_VISIONER.AWARENESS_STATES.lastKnownArea_desc'
  },
  observed: {
    label: 'PF2E_VISIONER.AWARENESS_STATES.observed',
    icon: 'fas fa-eye',
    color: 'var(--visibility-observed, #4caf50)',
    cssClass: 'awareness-observed',
    description: 'PF2E_VISIONER.AWARENESS_STATES.observed_desc'
  }
};

/**
 * Awareness propagation configuration
 */
export const AWARENESS_CONFIG = {
  // Default ranges in feet
  DEFAULT_NOISE_RADIUS: 20,
  DEFAULT_COMMUNICATION_RADIUS: 30,
  DEFAULT_MAX_PROPAGATION_RANGE: 60,
  
  // Actions that trigger awareness propagation
  TRIGGERING_ACTIONS: [
    'hide',
    'sneak', 
    'create-a-diversion',
    'seek'
  ],
  
  // PF2e Sense Acuity Levels and Detection Rules
  SENSE_ACUITY: {
    // Precise senses - allow targeting without penalty, detect creatures reliably
    PRECISE: {
      detectionState: 'observed',
      canTarget: true,
      flatCheckDC: 0,
      description: 'Can target normally and avoid Seek in most cases'
    },
    // Imprecise senses - detect presence but target is hidden, need Seek to improve
    IMPRECISE: {
      detectionState: 'lastKnownArea', 
      canTarget: true,
      flatCheckDC: 11, // 50-50 chance to target
      description: 'Detection only hides location; Seek needed to observe'
    },
    // Vague senses - only know something is "there somewhere", undetected at best
    VAGUE: {
      detectionState: 'suspicious', // Using suspicious as "undetected but aware of presence"
      canTarget: false,
      flatCheckDC: null, // Cannot target at all
      description: 'Only alerts presence; cannot track; Seek/other senses needed'
    }
  },
  
  // PF2e Senses mapped to acuity levels
  SENSES: {
    // Precise senses
    vision: { acuity: 'PRECISE', range: 'sight', requiresLight: true },
    darkvision: { acuity: 'PRECISE', range: 60, requiresLight: false },
    lowLightVision: { acuity: 'PRECISE', range: 'sight', requiresLight: 'dim' },
    echolocation: { acuity: 'PRECISE', range: 60, requiresLight: false },
    lifesense: { acuity: 'PRECISE', range: 60, requiresLight: false },
    
    // Imprecise senses  
    hearing: { acuity: 'IMPRECISE', range: 60, requiresLight: false },
    scent: { acuity: 'IMPRECISE', range: 30, requiresLight: false },
    tremorsense: { acuity: 'IMPRECISE', range: 60, requiresLight: false },
    
    // Vague senses
    smell: { acuity: 'VAGUE', range: 15, requiresLight: false }
  },
  
  // Seek action detection upgrades
  SEEK_UPGRADES: {
    // Success: Hidden → Observed, Undetected → Hidden
    success: {
      'hidden': 'observed',
      'suspicious': 'lastKnownArea', // Vague → Imprecise equivalent
      'lastKnownArea': 'observed',
      'observed': 'observed' // No change
    },
    // Critical Success: Undetected → Observed directly
    criticalSuccess: {
      'hidden': 'observed', 
      'suspicious': 'observed', // Direct upgrade
      'lastKnownArea': 'observed',
      'observed': 'observed'
    }
  },
  
  // Privacy levels
  PRIVACY_LEVELS: {
    conservative: {
      label: 'PF2E_VISIONER.AWARENESS_PRIVACY.conservative',
      description: 'PF2E_VISIONER.AWARENESS_PRIVACY.conservative_desc',
      revealExact: false,
      allowFuzzy: true,
      requireAction: true
    },
    moderate: {
      label: 'PF2E_VISIONER.AWARENESS_PRIVACY.moderate', 
      description: 'PF2E_VISIONER.AWARENESS_PRIVACY.moderate_desc',
      revealExact: false,
      allowFuzzy: true,
      requireAction: false
    },
    permissive: {
      label: 'PF2E_VISIONER.AWARENESS_PRIVACY.permissive',
      description: 'PF2E_VISIONER.AWARENESS_PRIVACY.permissive_desc', 
      revealExact: true,
      allowFuzzy: true,
      requireAction: false
    }
  }
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

  sneakRawEnforcement: {
    name: 'PF2E_VISIONER.SETTINGS.SNEAK_RAW_ENFORCEMENT.name',
    hint: 'PF2E_VISIONER.SETTINGS.SNEAK_RAW_ENFORCEMENT.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
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

  // RAW enforcement toggle
  enforceRawRequirements: {
    name: 'PF2E_VISIONER.SETTINGS.ENFORCE_RAW.name',
    hint: 'PF2E_VISIONER.SETTINGS.ENFORCE_RAW.hint',
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

  // Awareness Propagation settings
  awarenessEnabled: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessEnabled.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessEnabled.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  awarenessPrivacyLevel: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessPrivacyLevel.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessPrivacyLevel.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: String,
    choices: {
      conservative: 'PF2E_VISIONER.AWARENESS_PRIVACY.conservative',
      moderate: 'PF2E_VISIONER.AWARENESS_PRIVACY.moderate',
      permissive: 'PF2E_VISIONER.AWARENESS_PRIVACY.permissive'
    },
    default: 'conservative',
  },
  awarenessNoiseRadius: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessNoiseRadius.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessNoiseRadius.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Number,
    range: { min: 5, max: 100, step: 5 },
    default: 20,
  },
  awarenessCommunicationRadius: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessCommunicationRadius.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessCommunicationRadius.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Number,
    range: { min: 10, max: 150, step: 5 },
    default: 30,
  },
  awarenessMaxRange: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessMaxRange.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessMaxRange.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Number,
    range: { min: 20, max: 200, step: 10 },
    default: 60,
  },
  awarenessRequireLoS: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessRequireLoS.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessRequireLoS.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Boolean,
    default: true,
  },
  awarenessAllowSenses: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessAllowSenses.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessAllowSenses.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Boolean,
    default: true,
  },
  awarenessLogToGM: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessLogToGM.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessLogToGM.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
  },
  awarenessShowFuzzyMarkers: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessShowFuzzyMarkers.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessShowFuzzyMarkers.hint',
    scope: 'client',
    config: true,
    restricted: false,
    type: Boolean,
    default: true,
  },
  awarenessAutoWhisper: {
    name: 'PF2E_VISIONER.SETTINGS.awarenessAutoWhisper.name',
    hint: 'PF2E_VISIONER.SETTINGS.awarenessAutoWhisper.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: Boolean,
    default: true,
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
};
