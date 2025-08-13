/**
 * ApplicationV2-based Visioner Token Manager
 * Handles both visibility and cover management for tokens
 */

import {
  getCoverMap,
  getVisibilityMap
} from "../../utils.js";

import { MODULE_ID } from "../../constants.js";
import { bindTokenManagerActions } from "./actions/index.js";
import { addTokenBorder as addBorderUtil, removeTokenBorder as removeBorderUtil } from "./borders.js";
import { TOKEN_MANAGER_DEFAULT_OPTIONS, TOKEN_MANAGER_PARTS } from "./config.js";
import { applySelectionHighlight, attachCanvasHoverHandlers, attachSelectionHandlers, detachCanvasHoverHandlers, detachSelectionHandlers } from "./highlighting.js";

export class VisionerTokenManager extends foundry.applications.api
  .ApplicationV2 {
  // Track the current instance to prevent multiple dialogs
  static currentInstance = null;
  static _canvasHoverHandlers = new Map();
  static _selectionHookId = null;

  static DEFAULT_OPTIONS = (() => {
    const cfg = structuredClone(TOKEN_MANAGER_DEFAULT_OPTIONS);
    cfg.form.handler = VisionerTokenManager.formHandler;
    cfg.actions = {
      applyCurrent: VisionerTokenManager.applyCurrent,
      applyBoth: VisionerTokenManager.applyBoth,
      reset: VisionerTokenManager.resetAll,
      toggleMode: VisionerTokenManager.toggleMode,
      toggleEncounterFilter: VisionerTokenManager.toggleEncounterFilter,
      toggleTab: VisionerTokenManager.toggleTab,
      bulkPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkLootObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkLootHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
    };
    return cfg;
  })();

  static PARTS = TOKEN_MANAGER_PARTS;

  constructor(observer, options = {}) {
    super(options);
    this.observer = observer;
    this.visibilityData = getVisibilityMap(observer);
    this.coverData = getCoverMap(observer);

    // Smart default mode selection
    // If the token is controlled by current user, default to Target Mode ("how others see me")
    // Otherwise, default to Observer Mode ("how I see others")
    const isControlledByUser =
      observer.actor?.hasPlayerOwner && observer.isOwner;
    const isLootObserver = observer.actor?.type === "loot";
    this.mode = isLootObserver
      ? "target"
      : options.mode || (isControlledByUser ? "target" : "observer");

    // Initialize active tab (visibility or cover)
    this.activeTab = options.activeTab || "visibility";

    // Initialize encounter filter state based on setting
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");

    // Initialize storage for saved mode data
    this._savedModeData = {
      observer: { visibility: {}, cover: {} },
      target: { visibility: {}, cover: {} },
    };

    // Set this as the current instance
    VisionerTokenManager.currentInstance = this;
  }

  // Bind extracted action handlers to this class once (static initialization)
  static {
    try {
      bindTokenManagerActions(VisionerTokenManager);
    } catch (_) {}
  }

  /**
   * Update the observer and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   */
  updateObserver(newObserver) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    this.coverData = getCoverMap(newObserver);

    // Update mode based on new observer
    const isControlledByUser =
      newObserver.actor?.hasPlayerOwner && newObserver.isOwner;
    const isLootObserver = newObserver.actor?.type === "loot";
    this.mode = isLootObserver
      ? "target"
      : isControlledByUser
      ? "target"
      : "observer";

    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");

    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Update the observer with a specific mode and refresh the dialog content
   * @param {Token} newObserver - The new observer token
   * @param {string} mode - The mode to use ('observer' or 'target')
   */
  updateObserverWithMode(newObserver, mode) {
    this.observer = newObserver;
    this.visibilityData = getVisibilityMap(newObserver);
    this.coverData = getCoverMap(newObserver);
    this.mode = newObserver.actor?.type === "loot" ? "target" : mode;

    // Reset encounter filter to default for new observer
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");

    // Re-render the dialog with new data
    this.render({ force: true });
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const { buildContext } = await import("./context.js");
    return buildContext(this, options);
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.form.template,
      context
    );
    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  /**
   * Handle form submission
   */
  static async formHandler(event, form, formData) {
    const { formHandler } = await import("./actions/index.js");
    return formHandler.call(this, event, form, formData);
  }

  /**
   * Apply changes and close
   */
  static async applyCurrent(event, button) {
    const { applyCurrent } = await import("./actions/index.js");
    return applyCurrent.call(this, event, button);
  }

  /**
   * Apply both Visibility and Cover changes for the current mode
   */
  static async applyBoth(event, button) {
    const { applyBoth } = await import("./actions/index.js");
    return applyBoth.call(this, event, button);
  }

  /**
   * Reset all visibility and cover states
   */
  static async resetAll(event, button) {
    const { resetAll } = await import("./actions/index.js");
    return resetAll.call(this, event, button);
  }

  /**
   * Toggle between Observer and Target modes
   */
  static async toggleMode(event, button) {
    const { toggleMode } = await import("./actions/index.js");
    return toggleMode.call(this, event, button);
  }

  /**
   * Toggle between Visibility and Cover tabs
   */
  static async toggleTab(event, button) {
    const { toggleTab } = await import("./actions/index.js");
    return toggleTab.call(this, event, button);
  }

  /**
   * Toggle encounter filtering and refresh results
   */
  static async toggleEncounterFilter(event, button) {
    const { toggleEncounterFilter } = await import("./actions/index.js");
    return toggleEncounterFilter.call(this, event, button);
  }

  /**
   * Bulk set visibility state for tokens
   */
  static async bulkSetVisibilityState(event, button) {
    const { bulkSetVisibilityState } = await import("./actions/index.js");
    return bulkSetVisibilityState.call(this, event, button);
  }

  /**
   * Bulk set cover state for tokens
   */
  static async bulkSetCoverState(event, button) {
    const { bulkSetCoverState } = await import("./actions/index.js");
    return bulkSetCoverState.call(this, event, button);
  }

  /**
   * Override _onRender to add custom event listeners
   */
  _onRender(context, options) {
    super._onRender(context, options);
    try {
      const showOutcome = game.settings.get(MODULE_ID, "integrateRollOutcome");
      if (showOutcome) {
        // Ensure sufficient width to display Outcome column fully
        const minWidth = 705;
        const current = this.position?.width ?? 0;
        if (!current || current < minWidth) {
          this.setPosition({ width: minWidth });
        }
      }
    } catch (_) {}
    // No row→token hover anymore (to avoid conflict with canvas→row). Keep icon handlers.
    // Provided by managers/token-manager/actions.js via bindTokenManagerActions
    // Setup canvas selection → row highlighting and canvas hover → row
    try {
      // Bind per-row icon click handlers (visibility/cover selection)
      this.addIconClickHandlers?.();
    } catch (_) {}
    attachSelectionHandlers(this.constructor);
    attachCanvasHoverHandlers(this.constructor);
    applySelectionHighlight(this.constructor);
  }

  /**
   * Clean up when closing
   */
  async close(options = {}) {
    // Clean up any remaining token borders
    this.cleanupAllTokenBorders();
    // Remove selection/hover handlers and clear row highlights
    detachSelectionHandlers(this.constructor);
    detachCanvasHoverHandlers(this.constructor);
    try {
      if (this.element) {
        this.element
          .querySelectorAll("tr.token-row.row-hover")
          ?.forEach((el) => el.classList.remove("row-hover"));
      }
    } catch (_) {}

    // Clear the current instance reference
    if (VisionerTokenManager.currentInstance === this) {
      VisionerTokenManager.currentInstance = null;
    }

    return super.close(options);
  }

  // Canvas hover handlers moved to managers/token-manager/highlighting.js

  /**
   * Selection-based row highlight handlers
   */
  

  /**
   * Clean up all token borders when closing the application
   */
  cleanupAllTokenBorders() {
    canvas.tokens.placeables.forEach((token) => {
      this.removeTokenBorder(token);
    });
  }

  /**
   * Add hover highlighting to help identify tokens on canvas
   */
  // Removed row→token hover to avoid conflicts with canvas→row highlight/scroll

  /**
   * Add click handlers for icon-based state selection
   */
  // Provided by managers/token-manager/actions.js via bindTokenManagerActions

  /**
   * Highlight or unhighlight a token on the canvas
   */
  highlightToken(token, highlight, strong = false) {
    if (!token || !token.mesh) return;

    if (highlight) {
      // Create a subtle border highlight instead of scaling/tinting
      this.addTokenBorder(token, strong);
    } else {
      // Remove the border highlight
      this.removeTokenBorder(token);
    }
  }

  /**
   * Add a subtle border around the token
   */
  addTokenBorder(token, strong = false) {
    addBorderUtil(token, strong);
  }

  /**
   * Remove the border highlight from a token
   */
  removeTokenBorder(token) {
    removeBorderUtil(token);
  }
}
