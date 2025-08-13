/**
 * Hover tooltips for token visibility states
 */

import { COVER_STATES, MODULE_ID, VISIBILITY_STATES } from "../constants.js";
import { canShowTooltips, computeSizesFromSetting } from "../helpers/tooltip-utils.js";
import { getCoverMap, getVisibilityMap } from "../utils.js";

/**
 * Lightweight service wrapper for lifecycle control.
 * Keeps existing functional API intact for compatibility.
 */
class HoverTooltipsImpl {
  constructor() {
    this._initialized = false;
    this.currentHoveredToken = null;
    this.visibilityIndicators = new Map();
    this.coverIndicators = new Map();
    this.tokenEventHandlers = new Map();
    this.tooltipMode = "target";
    this.isShowingKeyTooltips = false;
    this.keyTooltipTokens = new Set();
    this.tooltipFontSize = 16;
    this.tooltipIconSize = 14;
    this.badgeTicker = null;
  }
  init() {
    if (this._initialized) return this.refreshSizes();
    initializeHoverTooltips();
    this._initialized = true;
  }
  dispose() {
    cleanupHoverTooltips();
    this._initialized = false;
  }
  setMode(mode) { setTooltipMode(mode); }
  refreshSizes() {
    try {
      const raw = game.settings?.get?.(MODULE_ID, "tooltipFontSize");
      const { fontPx, iconPx, borderPx } = computeSizesFromSetting(raw ?? this.tooltipFontSize);
      this.tooltipFontSize = fontPx;
      this.tooltipIconSize = iconPx;
      document.documentElement.style.setProperty("--pf2e-visioner-tooltip-font-size", `${fontPx}px`);
      document.documentElement.style.setProperty("--pf2e-visioner-tooltip-icon-size", `${iconPx}px`);
      document.documentElement.style.setProperty("--pf2e-visioner-tooltip-badge-border", `${borderPx}px`);
    } catch (_) {}
  }
}
export const HoverTooltips = new HoverTooltipsImpl();

// Backwards-compatible alias
export const HoverTooltipsService = HoverTooltips;

// DEPRECATED globals: state lives on HoverTooltips singleton now
let currentHoveredToken = null;
let visibilityIndicators = new Map();
let coverIndicators = new Map();
// Mapping of Font Awesome icon classes to glyphs for PIXI.Text rendering
const COVER_ICON_GLYPHS = {
  "fas fa-shield-alt": "\uf3ed",
  "fas fa-shield": "\uf132",
  "fa-regular fa-shield": "\uf132",
};
let tokenEventHandlers = new Map(); // Store references to our specific event handlers
let tooltipMode = "target"; // 'target' (default) or 'observer'
let isShowingKeyTooltips = false; // Track if Alt key tooltips are active
let keyTooltipTokens = new Set(); // Track tokens showing key-based tooltips
// Initialize with default, will try to get from settings when available
let tooltipFontSize = 16;
let tooltipIconSize = 14; // Default icon size
let badgeTicker = null; // Ticker for keeping DOM badges aligned on pan/zoom
let _initialized = false; // Prevent double-binding

// size computation moved to helpers/tooltip-utils.js

/**
 * Check if tooltips are allowed for the current user and token
 * @param {string} [mode='target'] - The tooltip mode to check ('target' or 'observer')
 * @param {Token} [hoveredToken=null] - The token being hovered (optional)
 * @returns {boolean} True if tooltips should be shown
 */
// permissions moved to helpers/tooltip-utils.js

/**
 * Set the tooltip mode
 * @param {string} mode - 'target' (default - how others see hovered token) or 'observer' (O key - how hovered token sees others)
 */
export function setTooltipMode(mode) {
  if (mode !== "observer" && mode !== "target") {
    console.warn("PF2E Visioner: Invalid tooltip mode:", mode);
    return;
  }

  const previousMode = HoverTooltips.tooltipMode;
  HoverTooltips.tooltipMode = mode;

  // When switching from observer to target mode (key up), clean up all indicators first
  if (previousMode === "observer" && mode === "target") {
    // Full cleanup to prevent lingering Alt badges
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    // Reset Alt state
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.keyTooltipTokens.clear();
    // Small defer then re-render clean target-mode indicators if still hovering
    if (HoverTooltips.currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
      }, 50);
    }
    return;
  }

  // If we have a currently hovered token, refresh the indicators
  if (HoverTooltips.currentHoveredToken) showVisibilityIndicators(HoverTooltips.currentHoveredToken);

  // For observer mode, also check if we need to show indicators for controlled tokens
  if (
    mode === "observer" &&
    !HoverTooltips.currentHoveredToken &&
    canvas.tokens.controlled.length > 0
  ) {
    // If we're in observer mode with no hovered token but have controlled tokens,
    // show indicators for the first controlled token
    showVisibilityIndicatorsForToken(canvas.tokens.controlled[0], "observer");
  }
}

/**
 * Initialize hover tooltip system
 */
export function initializeHoverTooltips() {
  if (HoverTooltips._initialized || _initialized) {
    // Defensive: avoid duplicate listeners; refresh sizes and return
    HoverTooltips.refreshSizes?.();
    return;
  }
  // Only initialize hover tooltips if allowed for this user in any mode
  // Use 'observer' mode check since we want to initialize if any mode is allowed
  if (!canShowTooltips("observer")) return;

  // Set the CSS variable for tooltip font size
  try {
    const raw = game.settings?.get?.(MODULE_ID, "tooltipFontSize");
    const { fontPx, iconPx, borderPx } = computeSizesFromSetting(
      raw ?? HoverTooltips.tooltipFontSize
    );
    HoverTooltips.tooltipFontSize = fontPx;
    HoverTooltips.tooltipIconSize = iconPx;
    document.documentElement.style.setProperty("--pf2e-visioner-tooltip-font-size", `${fontPx}px`);
    document.documentElement.style.setProperty("--pf2e-visioner-tooltip-icon-size", `${iconPx}px`);
    document.documentElement.style.setProperty("--pf2e-visioner-tooltip-badge-border", `${borderPx}px`);
  } catch (e) {
    console.warn(
      "PF2E Visioner: Error setting tooltip font size CSS variable",
      e
    );
    document.documentElement.style.setProperty(
      "--pf2e-visioner-tooltip-font-size",
      "16px"
    );
    document.documentElement.style.setProperty(
      "--pf2e-visioner-tooltip-icon-size",
      "14px"
    );
    document.documentElement.style.setProperty(
      "--pf2e-visioner-tooltip-badge-border",
      "2px"
    );
  }

  // Add event listeners to canvas for token hover
  canvas.tokens.placeables.forEach((token) => {
    const overHandler = () => onTokenHover(token);
    const outHandler = () => onTokenHoverEnd(token);

    // Store handlers for later cleanup
    HoverTooltips.tokenEventHandlers.set(token.id, { overHandler, outHandler });

    token.on("pointerover", overHandler);
    token.on("pointerout", outHandler);
  });

  // Note: Alt key handled via highlightObjects hook registered in main hooks
  // O key event listeners added globally in registerHooks
}

/**
 * Handle token hover start
 * @param {Token} hoveredToken - The token being hovered
 */
function onTokenHover(hoveredToken) {
  // Only show hover tooltips if allowed for this user with current mode AND token
  // Suppress hover overlays entirely while Alt overlay is active
  if (HoverTooltips.isShowingKeyTooltips) return;
  if (!canShowTooltips(HoverTooltips.tooltipMode, hoveredToken)) {
    return;
  }

  if (HoverTooltips.currentHoveredToken === hoveredToken) {
    return;
  }

  HoverTooltips.currentHoveredToken = hoveredToken;
  showVisibilityIndicators(hoveredToken);
}

/**
 * Handle token hover end
 * @param {Token} token - The token that was hovered
 */
function onTokenHoverEnd(token) {
  if (HoverTooltips.currentHoveredToken === token) {
    HoverTooltips.currentHoveredToken = null;
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
  }
}

/**
 * Handle highlightObjects hook (triggered by Alt key)
 * @param {boolean} highlight - Whether objects should be highlighted
 */
export function onHighlightObjects(highlight) {
  // For GM, check if hover tooltips are enabled
  if (game.user.isGM && !game.settings.get(MODULE_ID, "enableHoverTooltips")) {
    return;
  }

  // For players, check basic requirements
  if (!game.user.isGM) {
    // Basic requirements: both settings must be enabled
    if (
      !game.settings.get(MODULE_ID, "enableHoverTooltips") ||
      !game.settings.get(MODULE_ID, "allowPlayerTooltips")
    ) {
      return;
    }

    // Alt key should always work even with blockPlayerTargetTooltips
    // No need to check blockPlayerTargetTooltips here
  }

  if (highlight) {
    // Guard: if already in Alt overlay, don't layer another
    if (HoverTooltips.isShowingKeyTooltips) return;
    // Alt always shows target-mode overlay from controlled token(s)
    showControlledTokenVisibility();
  } else {
    // Alt released: fully reset Alt state and clean badges
    HoverTooltips.isShowingKeyTooltips = false;
    HoverTooltips.keyTooltipTokens.clear();
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
    // Restore clean hover indicators if still hovering
    if (HoverTooltips.currentHoveredToken) {
      setTimeout(() => {
        showVisibilityIndicators(HoverTooltips.currentHoveredToken);
        try { showCoverIndicators(HoverTooltips.currentHoveredToken); } catch (_) {}
      }, 50);
    }
  }
}

/**
 * Show visibility indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showVisibilityIndicators(hoveredToken) {
  // Check if tooltips are allowed for the current mode and token
  // Suppress hover overlays entirely while Alt overlay is active
  if (HoverTooltips.isShowingKeyTooltips) return;
  const tooltipsAllowed = canShowTooltips(HoverTooltips.tooltipMode, hoveredToken);

  if (!tooltipsAllowed) return;

  // Clear any existing indicators, unless Alt overlay is active (handled separately)
  if (!HoverTooltips.isShowingKeyTooltips) {
    hideAllVisibilityIndicators();
    hideAllCoverIndicators();
  }

  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(
    (t) => t !== hoveredToken && t.isVisible
  );

  if (otherTokens.length === 0) return;

  if (HoverTooltips.tooltipMode === "observer") {
    // Observer mode (O key): Show how the hovered token sees others
    // For players, only allow if they control the hovered token
    if (!game.user.isGM && !hoveredToken.isOwner) {
      return;
    }

    otherTokens.forEach((targetToken) => {
      const visibilityMap = getVisibilityMap(hoveredToken);
      const visibilityState =
        visibilityMap[targetToken.document.id] || "observed";

      if (visibilityState !== "observed") {
        // Pass relation token (targetToken) to compute cover vs hoveredToken
        addVisibilityIndicator(
          targetToken,
          hoveredToken,
          visibilityState,
          "observer",
          targetToken
        );
      }
    });
  } else {
    // Target mode (default): Show how others see the hovered token
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {
      // For players hovering over their own token, we need to show how OTHER tokens see it
      if (hoveredToken.isOwner) {
        // Get all other tokens in the scene (not just controlled ones)
        const nonPlayerTokens = canvas.tokens.placeables.filter(
          (t) => t !== hoveredToken && t.isVisible
        );

        // Show how each other token sees the player's token
        nonPlayerTokens.forEach((otherToken) => {
          const visibilityMap = getVisibilityMap(otherToken);
          const visibilityState =
            visibilityMap[hoveredToken.document.id] || "observed";

          if (visibilityState !== "observed") {
            // Show indicator on the OTHER token to show how it sees the player's token
            addVisibilityIndicator(
              otherToken,
              otherToken,
              visibilityState,
              "target",
              hoveredToken
            );
          }
        });
      }
    } else {
      // GM sees all perspectives

      otherTokens.forEach((observerToken) => {
        const visibilityMap = getVisibilityMap(observerToken);
        const visibilityState =
          visibilityMap[hoveredToken?.document?.id] || "observed";

        if (visibilityState !== "observed") {
          // Show indicator on the observer token
          addVisibilityIndicator(
            observerToken,
            observerToken,
            visibilityState,
            "target",
            hoveredToken
          );
        }
      });
    }
  }

  // Additionally render cover-only indicators when there is cover but no visibility change
  // Already suppressed above if Alt overlay is active
  try { showCoverIndicators(hoveredToken); } catch (_) {}
}

/**
 * Show cover indicators on other tokens
 * @param {Token} hoveredToken - The token being hovered
 */
function showCoverIndicators(hoveredToken) {
  // Suppress hover overlays entirely while Alt overlay is active
  if (HoverTooltips.isShowingKeyTooltips) return;
  const tooltipsAllowed = canShowTooltips(HoverTooltips.tooltipMode, hoveredToken);
  if (!tooltipsAllowed) return;

  hideAllCoverIndicators();

  const otherTokens = canvas.tokens.placeables.filter(
    (t) => t !== hoveredToken && t.isVisible
  );
  if (otherTokens.length === 0) return;

  if (HoverTooltips.tooltipMode === "observer") {
    // How hoveredToken sees others (cover from hoveredToken's perspective)
    if (!game.user.isGM && !hoveredToken.isOwner) return;
    otherTokens.forEach((targetToken) => {
      // Skip duplicate if visibility badge already carries cover
      const visInd = HoverTooltips.visibilityIndicators.get(targetToken.id);
      if (visInd && visInd._coverBadgeEl) return;
      const coverMap = getCoverMap(hoveredToken);
      const coverState = coverMap[targetToken.document.id] || "none";
      if (coverState !== "none") {
        addCoverIndicator(targetToken, hoveredToken, coverState, "observer");
      }
    });
  } else {
    // Target mode: How others see the hovered token (cover others have against hovered)
    if (!game.user.isGM) {
      if (hoveredToken.isOwner) {
        const nonPlayerTokens = canvas.tokens.placeables.filter(
          (t) => t !== hoveredToken && t.isVisible
        );
        nonPlayerTokens.forEach((otherToken) => {
          const visInd = HoverTooltips.visibilityIndicators.get(otherToken.id);
          if (visInd && visInd._coverBadgeEl) return;
          const coverMap = getCoverMap(otherToken);
          const coverState = coverMap[hoveredToken.document.id] || "none";
          if (coverState !== "none") {
            addCoverIndicator(otherToken, otherToken, coverState, "target");
          }
        });
      }
    } else {
      otherTokens.forEach((observerToken) => {
        const visInd = HoverTooltips.visibilityIndicators.get(observerToken.id);
        if (visInd && visInd._coverBadgeEl) return;
        const coverMap = getCoverMap(observerToken);
        const coverState = coverMap[hoveredToken.document.id] || "none";
        if (coverState !== "none") {
          addCoverIndicator(observerToken, observerToken, coverState, "target");
        }
      });
    }
  }
}

/**
 * Show visibility indicators for a specific token (without clearing existing ones)
 * @param {Token} observerToken - The token to show visibility indicators for
 * @param {string} forceMode - Optional mode to force ('observer' or 'target'), defaults to current tooltipMode
 */
function showVisibilityIndicatorsForToken(observerToken, forceMode = null) {
  // Use forced mode if provided, otherwise use current tooltipMode
  const effectiveMode = forceMode || HoverTooltips.tooltipMode;

  // Check if tooltips are allowed for the current mode
  if (!canShowTooltips(effectiveMode)) {
    // Special case: Alt key (forceMode = 'target') should always be allowed
    if (!forceMode) {
      return;
    }
  }

  // For players, only allow if they control the observer token
  if (!game.user.isGM && !observerToken.isOwner) {
    return;
  }

  // Get all other tokens in the scene
  const otherTokens = canvas.tokens.placeables.filter(
    (t) => t !== observerToken && t.isVisible
  );

  if (otherTokens.length === 0) return;

  if (effectiveMode === "observer") {
    // Default mode: Show how the observer token sees others
    otherTokens.forEach((targetToken) => {
      const visibilityMap = getVisibilityMap(observerToken);
      const visibilityState =
        visibilityMap[targetToken.document.id] || "observed";

      if (visibilityState !== "observed") {
        addVisibilityIndicator(
          targetToken,
          observerToken,
          visibilityState,
          "observer",
          targetToken
        );
      }
    });
  } else {
    // Target mode: Show how others see the observer token
    // For players, only show visibility from other tokens' perspective
    if (!game.user.isGM) {
      // Get all other tokens in the scene
      const otherTokensForPlayer = canvas.tokens.placeables.filter(
        (t) => t !== observerToken && t.isVisible
      );

      otherTokensForPlayer.forEach((otherToken) => {
        const visibilityMap = getVisibilityMap(otherToken);
        const visibilityState =
          visibilityMap[observerToken.document.id] || "observed";

        if (visibilityState !== "observed") {
          // Show indicator on the OTHER token
          addVisibilityIndicator(
            otherToken,
            otherToken,
            visibilityState,
            "target",
            observerToken
          );
        }
      });
    } else {
      // GM sees all perspectives

      otherTokens.forEach((otherToken) => {
        const visibilityMap = getVisibilityMap(otherToken);
        const visibilityState =
          visibilityMap[observerToken.document.id] || "observed";

        if (visibilityState !== "observed") {
          // Show indicator on the OTHER token
          addVisibilityIndicator(
            otherToken,
            otherToken,
            visibilityState,
            "target",
            observerToken
          );
        }
      });
    }
  }
}

/**
 * Show cover indicators for a specific token (without clearing existing ones)
 * Mirrors visibility behavior
 * @param {Token} observerToken
 * @param {string} forceMode
 */
function showCoverIndicatorsForToken(observerToken, forceMode = null) {
  const effectiveMode = forceMode || HoverTooltips.tooltipMode;
  if (!canShowTooltips(effectiveMode)) {
    if (!forceMode) return;
  }
  if (!game.user.isGM && !observerToken.isOwner) return;

  const otherTokens = canvas.tokens.placeables.filter(
    (t) => t !== observerToken && t.isVisible
  );
  if (otherTokens.length === 0) return;

  if (effectiveMode === "observer") {
    otherTokens.forEach((targetToken) => {
      const coverMap = getCoverMap(observerToken);
      const coverState = coverMap[targetToken.document.id] || "none";
      if (coverState !== "none") {
        addCoverIndicator(targetToken, observerToken, coverState, "observer");
      }
    });
  } else {
    if (!game.user.isGM) {
      const otherTokensForPlayer = canvas.tokens.placeables.filter(
        (t) => t !== observerToken && t.isVisible
      );
      otherTokensForPlayer.forEach((otherToken) => {
        const coverMap = getCoverMap(otherToken);
        const coverState = coverMap[observerToken.document.id] || "none";
        if (coverState !== "none") {
          addCoverIndicator(otherToken, otherToken, coverState, "target");
        }
      });
    } else {
      otherTokens.forEach((otherToken) => {
        const coverMap = getCoverMap(otherToken);
        const coverState = coverMap[observerToken.document.id] || "none";
        if (coverState !== "none") {
          addCoverIndicator(otherToken, otherToken, coverState, "target");
        }
      });
    }
  }
}

/**
 * Show visibility indicators for controlled tokens (simulates hovering over controlled tokens)
 * Uses target mode - how others see the controlled tokens
 */
export function showControlledTokenVisibility() {
  if (HoverTooltips.isShowingKeyTooltips) return;

  const controlledTokens = canvas.tokens.controlled;

  HoverTooltips.isShowingKeyTooltips = true;
  HoverTooltips.keyTooltipTokens.clear();
  // Ensure any hover overlays are cleared before rendering Alt overlay
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // For each controlled token, show visibility indicators as if hovering over it
  controlledTokens.forEach((controlledToken) => {
    HoverTooltips.keyTooltipTokens.add(controlledToken.id);

    // Use the existing showVisibilityIndicators logic, force target mode for Alt key
    showVisibilityIndicatorsForToken(controlledToken, "target");
    // During Alt overlay, do NOT render cover badges; show visibility-only to avoid mixed modes
  });

  HoverTooltips._initialized = true;
}

/**
 * Show visibility indicators for controlled tokens in observer mode
 * Uses observer mode - how controlled tokens see others
 */
export function showControlledTokenVisibilityObserver() {
  if (HoverTooltips.isShowingKeyTooltips) return;

  const controlledTokens = canvas.tokens.controlled;
  // Fallback: if no controlled token, use the currently hovered token as the observer
  const tokensToUse =
    controlledTokens.length > 0
      ? controlledTokens
      : HoverTooltips.currentHoveredToken
      ? [HoverTooltips.currentHoveredToken]
      : [];

  HoverTooltips.isShowingKeyTooltips = true;
  HoverTooltips.keyTooltipTokens.clear();
  // Ensure any hover overlays are cleared before rendering Alt overlay
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // Clear any existing indicators first
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();

  // For each chosen token, show visibility indicators as if hovering over it
  tokensToUse.forEach((controlledToken) => {
    HoverTooltips.keyTooltipTokens.add(controlledToken.id);

    // Use observer mode instead of target mode
    showVisibilityIndicatorsForToken(controlledToken, "observer");
    // During O overlay, do NOT render cover badges; show visibility-only
  });
}

/**
 * Add a visibility indicator to a token
 * @param {Token} targetToken - The token to show the indicator on
 * @param {Token} observerToken - The token that has the visibility perspective
 * @param {string} visibilityState - The visibility state
 * @param {string} mode - 'observer' or 'target' mode
 */
function addVisibilityIndicator(
  targetToken,
  observerToken,
  visibilityState,
  mode = "observer",
  relationToken = null
) {
  const config = VISIBILITY_STATES[visibilityState];
  if (!config) return;

  // Create an anchor container at the token center-top to compute transformed bounds
  const indicator = new PIXI.Container();
  const tokenWidth = targetToken.document.width * canvas.grid.size;
  indicator.x = targetToken.x + tokenWidth / 2;
  indicator.y = targetToken.y - 8; // slight padding above the token
  canvas.tokens.addChild(indicator);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  // Compute dynamic badge dimensions based on configured sizes
  let sizeConfig;
  try {
    const raw = game.settings?.get?.(MODULE_ID, "tooltipFontSize");
    sizeConfig = computeSizesFromSetting(raw ?? HoverTooltips.tooltipFontSize);
  } catch (_) {
    sizeConfig = {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    };
  }
  const badgeWidth = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 8
  );
  const badgeHeight = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 6
  );
  const spacing = Math.max(6, Math.round(sizeConfig.iconPx / 2));
  const borderRadius = Math.round(badgeHeight / 3);

  // Determine if cover applies
  let coverConfig = null;
  try {
    if (relationToken) {
      const coverMapSource = mode === "observer" ? observerToken : targetToken;
      const coverMap = getCoverMap(coverMapSource);
      const coverState = coverMap[relationToken.document.id] || "none";
      if (coverState !== "none") coverConfig = COVER_STATES[coverState];
    }
  } catch (_) {}

  // Compute aligned positions using world->screen transform
  const globalPoint = canvas.tokens.toGlobal(
    new PIXI.Point(indicator.x, indicator.y)
  );
  const centerX = canvasRect.left + globalPoint.x;
  // If pf2e-hud is active, nudge badges downward to sit beneath its tooltip bubble
  const hudActive = !!game.modules?.get?.("pf2e-hud")?.active;
  const verticalOffset = hudActive ? 26 : -6; // nudge up slightly when HUD is not active
  const centerY =
    canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

  const placeBadge = (leftPx, topPx, color, iconClass) => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.pointerEvents = "none";
    el.style.zIndex = "60";
    el.style.left = `${Math.round(leftPx)}px`;
    el.style.top = `${Math.round(topPx)}px`;
    el.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.9); border: var(--pf2e-visioner-tooltip-badge-border, 2px) solid ${color}; border-radius: ${borderRadius}px; width: ${badgeWidth}px; height: ${badgeHeight}px; color: ${color};">
      <i class="${iconClass}" style="font-size: var(--pf2e-visioner-tooltip-icon-size, 14px); line-height: 1;"></i>
    </span>`;
    document.body.appendChild(el);
    return el;
  };

  if (coverConfig) {
    // Two badges: visibility on left, cover on right
    const visLeft = centerX - spacing / 2 - badgeWidth;
    const coverLeft = centerX + spacing / 2;
    indicator._visBadgeEl = placeBadge(
      visLeft,
      centerY,
      config.color,
      config.icon
    );
    indicator._coverBadgeEl = placeBadge(
      coverLeft,
      centerY,
      coverConfig.color,
      coverConfig.icon
    );
  } else {
    // Only visibility badge, centered
    const visLeft = centerX - badgeWidth / 2;
    indicator._visBadgeEl = placeBadge(
      visLeft,
      centerY,
      config.color,
      config.icon
    );
  }

  HoverTooltips.visibilityIndicators.set(targetToken.id, indicator);

  // Ensure ticker updates DOM badge positions during pan/zoom
  ensureBadgeTicker();
}

function ensureBadgeTicker() {
  if (HoverTooltips.badgeTicker) return;
  HoverTooltips.badgeTicker = () => {
    try {
      updateBadgePositions();
    } catch (_) {}
  };
  try {
    canvas.app.ticker.add(HoverTooltips.badgeTicker);
  } catch (_) {}
}

function updateBadgePositions() {
  const canvasRect = canvas.app.view.getBoundingClientRect();
  let sizeConfig;
  try {
    const raw = game.settings?.get?.(MODULE_ID, "tooltipFontSize");
    sizeConfig = computeSizesFromSetting(raw ?? HoverTooltips.tooltipFontSize);
  } catch (_) {
    sizeConfig = {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    };
  }
  const badgeWidth = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 8
  );
  const badgeHeight = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 6
  );
  const spacing = Math.max(6, Math.round(sizeConfig.iconPx / 2));
  const hudActive = !!game.modules?.get?.("pf2e-hud")?.active;
  const verticalOffset = hudActive ? 26 : -6;

  HoverTooltips.visibilityIndicators.forEach((indicator) => {
    if (!indicator || (!indicator._visBadgeEl && !indicator._coverBadgeEl))
      return;
    const globalPoint = canvas.tokens.toGlobal(
      new PIXI.Point(indicator.x, indicator.y)
    );
    const centerX = canvasRect.left + globalPoint.x;
    const centerY =
      canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

    if (indicator._visBadgeEl && indicator._coverBadgeEl) {
      const visLeft = centerX - spacing / 2 - badgeWidth;
      const coverLeft = centerX + spacing / 2;
      indicator._visBadgeEl.style.left = `${Math.round(visLeft)}px`;
      indicator._visBadgeEl.style.top = `${Math.round(centerY)}px`;
      indicator._coverBadgeEl.style.left = `${Math.round(coverLeft)}px`;
      indicator._coverBadgeEl.style.top = `${Math.round(centerY)}px`;
    } else if (indicator._visBadgeEl) {
      const visLeft = centerX - badgeWidth / 2;
      indicator._visBadgeEl.style.left = `${Math.round(visLeft)}px`;
      indicator._visBadgeEl.style.top = `${Math.round(centerY)}px`;
    }
  });

  // Also update standalone cover badges
  HoverTooltips.coverIndicators.forEach((indicator) => {
    if (!indicator || !indicator._coverBadgeEl) return;
    const globalPoint = canvas.tokens.toGlobal(
      new PIXI.Point(indicator.x, indicator.y)
    );
    const centerX = canvasRect.left + globalPoint.x;
    const centerY =
      canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;
    const left = centerX - badgeWidth / 2;
    indicator._coverBadgeEl.style.left = `${Math.round(left)}px`;
    indicator._coverBadgeEl.style.top = `${Math.round(centerY)}px`;
  });
}

/**
 * Add a cover indicator to a token
 * @param {Token} targetToken
 * @param {Token} observerToken
 * @param {string} coverState
 * @param {string} mode 'observer' | 'target'
 */
function addCoverIndicator(
  targetToken,
  observerToken,
  coverState,
  mode = "observer"
) {
  const config = COVER_STATES[coverState];
  if (!config) return;

  // Use DOM badge with icon only (no large text), consistent with visibility badges
  const indicator = new PIXI.Container();
  const tokenWidth = targetToken.document.width * canvas.grid.size;
  indicator.x = targetToken.x + tokenWidth / 2;
  indicator.y = targetToken.y - 8; // align above token
  canvas.tokens.addChild(indicator);

  const canvasRect = canvas.app.view.getBoundingClientRect();
  let sizeConfig;
  try {
    const raw = game.settings?.get?.(MODULE_ID, "tooltipFontSize");
    sizeConfig = computeSizesFromSetting(raw ?? HoverTooltips.tooltipFontSize);
  } catch (_) {
    sizeConfig = {
      fontPx: tooltipFontSize,
      iconPx: tooltipIconSize,
      borderPx: 3,
    };
  }
  const badgeWidth = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 8
  );
  const badgeHeight = Math.round(
    sizeConfig.iconPx + sizeConfig.borderPx * 2 + 6
  );
  const borderRadius = Math.round(badgeHeight / 3);
  const globalPoint = canvas.tokens.toGlobal(
    new PIXI.Point(indicator.x, indicator.y)
  );
  const hudActive = !!game.modules?.get?.("pf2e-hud")?.active;
  const verticalOffset = hudActive ? 26 : -6;
  const centerX = canvasRect.left + globalPoint.x;
  const centerY =
    canvasRect.top + globalPoint.y - badgeHeight / 2 + verticalOffset;

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.pointerEvents = "none";
  el.style.zIndex = "60";
  el.style.left = `${Math.round(centerX - badgeWidth / 2)}px`;
  el.style.top = `${Math.round(centerY)}px`;
  el.innerHTML = `<span style="display:inline-flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.9); border: var(--pf2e-visioner-tooltip-badge-border, 2px) solid ${config.color}; border-radius: ${borderRadius}px; width: ${badgeWidth}px; height: ${badgeHeight}px; color: ${config.color};">
    <i class="${config.icon}" style="font-size: var(--pf2e-visioner-tooltip-icon-size, 14px); line-height: 1;"></i>
  </span>`;
  document.body.appendChild(el);
  indicator._coverBadgeEl = el;

  // Do not attach a Foundry tooltip on hover; the badge itself is the tooltip.

  HoverTooltips.coverIndicators.set(targetToken.id + "|cover", indicator);
  ensureBadgeTicker();
}

/**
 * Hide all visibility indicators
 */
function hideAllVisibilityIndicators() {
  // Deactivate any active tooltips
  try {
    game.tooltip.deactivate();
  } catch (e) {
    console.warn("PF2E Visioner: Error deactivating tooltips", e);
  }

  // Clean up all indicators
  HoverTooltips.visibilityIndicators.forEach((indicator, tokenId) => {
    try {
      // Remove DOM badges if present
      if (indicator._visBadgeEl && indicator._visBadgeEl.parentNode) {
        indicator._visBadgeEl.parentNode.removeChild(indicator._visBadgeEl);
      }
      if (indicator._coverBadgeEl && indicator._coverBadgeEl.parentNode) {
        indicator._coverBadgeEl.parentNode.removeChild(indicator._coverBadgeEl);
      }
      delete indicator._visBadgeEl;
      delete indicator._coverBadgeEl;

      // Clean up tooltip anchor if it exists
      if (indicator._tooltipAnchor) {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(
            indicator._tooltipAnchor
          );
        }
        delete indicator._tooltipAnchor;
      }
      // Clean up cover badge element if present
      if (indicator._coverBadgeEl) {
        try {
          if (indicator._coverBadgeEl.parentNode)
            indicator._coverBadgeEl.parentNode.removeChild(
              indicator._coverBadgeEl
            );
        } catch (_) {}
        delete indicator._coverBadgeEl;
      }

      // Remove from parent
      if (indicator.parent) {
        indicator.parent.removeChild(indicator);
      }

      // Destroy the indicator
      indicator.destroy({ children: true, texture: true, baseTexture: true });
    } catch (e) {
      console.warn("PF2E Visioner: Error cleaning up indicator", e);
    }
  });

  // Also clean up DOM-based visibility badges
  HoverTooltips.visibilityIndicators.forEach((indicator) => {
    try {
      if (indicator._visBadgeEl && indicator._visBadgeEl.parentNode) {
        indicator._visBadgeEl.parentNode.removeChild(indicator._visBadgeEl);
      }
      delete indicator._visBadgeEl;
    } catch (_) {}
  });

  // Clear the map
  HoverTooltips.visibilityIndicators.clear();

  // Reset tracking variables to ensure clean state
  isShowingKeyTooltips = false;
  keyTooltipTokens.clear();

  // Stop ticker when no indicators remain
  try {
    if (HoverTooltips.badgeTicker) {
      canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
      HoverTooltips.badgeTicker = null;
    }
  } catch (_) {}
}

/**
 * Hide all cover indicators
 */
function hideAllCoverIndicators() {
  try {
    game.tooltip.deactivate();
  } catch (_) {}
  HoverTooltips.coverIndicators.forEach((indicator) => {
    try {
      if (indicator._coverBadgeEl && indicator._coverBadgeEl.parentNode) {
        indicator._coverBadgeEl.parentNode.removeChild(indicator._coverBadgeEl);
      }
      delete indicator._coverBadgeEl;
      if (indicator._tooltipAnchor) {
        if (indicator._tooltipAnchor.parentNode) {
          indicator._tooltipAnchor.parentNode.removeChild(
            indicator._tooltipAnchor
          );
        }
        delete indicator._tooltipAnchor;
      }
      if (indicator.parent) indicator.parent.removeChild(indicator);
      indicator.destroy({ children: true, texture: true, baseTexture: true });
    } catch (_) {}
  });
  HoverTooltips.coverIndicators.clear();
  // Stop ticker if nothing remains
  try {
    if (
      HoverTooltips.badgeTicker &&
      HoverTooltips.visibilityIndicators.size === 0 &&
      HoverTooltips.coverIndicators.size === 0
    ) {
      canvas.app?.ticker?.remove?.(HoverTooltips.badgeTicker);
      HoverTooltips.badgeTicker = null;
    }
  } catch (_) {}
}

/**
 * Cleanup hover tooltips
 */
export function cleanupHoverTooltips() {
  hideAllVisibilityIndicators();
  hideAllCoverIndicators();
  HoverTooltips.currentHoveredToken = null;
  HoverTooltips.isShowingKeyTooltips = false;
  HoverTooltips.keyTooltipTokens.clear();

  // Reset tooltip mode to default
  setTooltipMode("target");

  // Remove only our specific event listeners from tokens
  HoverTooltips.tokenEventHandlers.forEach((handlers, tokenId) => {
    const token = canvas.tokens.get(tokenId);
    if (token) {
      token.off("pointerover", handlers.overHandler);
      token.off("pointerout", handlers.outHandler);
    }
  });

  // Clear the handlers map
  HoverTooltips.tokenEventHandlers.clear();

  _initialized = false;

  // Note: O key event listeners are managed globally in hooks.js
}
