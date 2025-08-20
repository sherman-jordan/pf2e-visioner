/**
 * ApplicationV2-based Multi Token Manager
 * Handles visibility and cover management for multiple selected tokens with pagination
 */


import { MODULE_ID } from "../../constants.js";
import { bindMultiTokenManagerActions } from "./actions/index.js";
import { MULTI_TOKEN_MANAGER_DEFAULT_OPTIONS, MULTI_TOKEN_MANAGER_PARTS } from "./config.js";

export class VisionerMultiTokenManager extends foundry.applications.api.ApplicationV2 {
  // Track the current instance to prevent multiple dialogs
  static currentInstance = null;

  static DEFAULT_OPTIONS = (() => {
    const cfg = JSON.parse(JSON.stringify(MULTI_TOKEN_MANAGER_DEFAULT_OPTIONS));
    // Form handler will be set by the static initialization block
    cfg.form = cfg.form || {};
    // Actions will be populated by the static initialization block
    cfg.actions = {};
    return cfg;
  })();

  static PARTS = MULTI_TOKEN_MANAGER_PARTS;

  // Bind extracted action handlers to this class once (static initialization)
  static {
    try {
      bindMultiTokenManagerActions(VisionerMultiTokenManager);
      
      // Set the form handler
      VisionerMultiTokenManager.DEFAULT_OPTIONS.form.handler = VisionerMultiTokenManager.formHandler;
      
      // Now populate the actions in DEFAULT_OPTIONS after methods are bound
      Object.assign(VisionerMultiTokenManager.DEFAULT_OPTIONS.actions, {
        nextPage: VisionerMultiTokenManager.nextPage,
        previousPage: VisionerMultiTokenManager.previousPage,
        goToPage: VisionerMultiTokenManager.goToPage,
        toggleEncounterFilter: VisionerMultiTokenManager.toggleEncounterFilter,
        toggleObserverTarget: VisionerMultiTokenManager.toggleObserverTarget,
        toggleTab: VisionerMultiTokenManager.toggleTab,
        // New streamlined bulk actions
        selectVisibilityState: VisionerMultiTokenManager.selectVisibilityState,
        selectTargetGroup: VisionerMultiTokenManager.selectTargetGroup,
        selectCondition: VisionerMultiTokenManager.selectCondition,
        applyBulkChanges: VisionerMultiTokenManager.applyBulkChanges,
        clearBulkSelection: VisionerMultiTokenManager.clearBulkSelection,
        bulkApplyToTargets: VisionerMultiTokenManager.bulkApplyToTargets,
        bulkApplyDirectional: VisionerMultiTokenManager.bulkApplyDirectional,
        // Legacy bulk actions for targets
        bulkObservedFrom: VisionerMultiTokenManager.bulkSetTargetState,
        bulkHiddenFrom: VisionerMultiTokenManager.bulkSetTargetState,
        bulkUndetectedTo: VisionerMultiTokenManager.bulkSetTargetState,
        bulkAllies: VisionerMultiTokenManager.bulkSetTargetState,
        bulkEnemies: VisionerMultiTokenManager.bulkSetTargetState,
        bulkAll: VisionerMultiTokenManager.bulkSetTargetState,
        // Cover bulk actions
        bulkNoCover: VisionerMultiTokenManager.bulkSetTargetCoverState,
        bulkLesserCover: VisionerMultiTokenManager.bulkSetTargetCoverState,
        bulkStandardCover: VisionerMultiTokenManager.bulkSetTargetCoverState,
        bulkGreaterCover: VisionerMultiTokenManager.bulkSetTargetCoverState,
        // Final actions
        confirmChanges: VisionerMultiTokenManager.confirmChanges,
        applyAllChanges: VisionerMultiTokenManager.applyAllChanges,
        cancel: VisionerMultiTokenManager.cancel,
      });
      
      console.log("Multi-token manager actions bound successfully");
    } catch (error) {
      console.error("Failed to bind multi-token manager actions:", error);
    }
  }

  constructor(selectedTokens, options = {}) {
    super(options);
    this.selectedTokens = selectedTokens || [];
    this.currentTokenIndex = 0;
    this.activeTab = options.activeTab || "visibility";
    this.observerTargetMode = options.observerTargetMode || false;
    this.selectedTargets = new Set(); // Track which targets are selected for bulk actions
    this.selectedState = null; // Track which visibility state is selected for bulk actions
    this.selectedGroup = null; // Track which target group is selected (allies/enemies/all)
    this.selectedCondition = null; // Track which condition filter is selected
    
    // Initialize filters
    this.encounterOnly = game.settings.get(MODULE_ID, "defaultEncounterFilter");
    
    // Storage for changes made to each token
    this.tokenChanges = new Map();
    this.selectedTokens.forEach(token => {
      this.tokenChanges.set(token.id, {
        visibility: {},
        cover: {}
      });
    });

    // Set this as the current instance
    VisionerMultiTokenManager.currentInstance = this;
  }

  get currentToken() {
    return this.selectedTokens[this.currentTokenIndex] || null;
  }

  get totalPages() {
    return this.selectedTokens.length;
  }

  get currentPage() {
    return this.currentTokenIndex + 1;
  }

  get hasNextPage() {
    return this.currentTokenIndex < this.selectedTokens.length - 1;
  }

  get hasPreviousPage() {
    return this.currentTokenIndex > 0;
  }

  /**
   * Prepare context data for the template
   */
  async _prepareContext(options) {
    const { buildMultiTokenContext } = await import("./context.js");
    return buildMultiTokenContext(this, options);
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, _options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.form.template,
      context
    );
    return html;
  }

  /**
   * Replace the HTML content of the application
   */
  _replaceHTML(result, content, _options) {
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
   * Navigate to next page (token)
   */
  static async nextPage(event, button) {
    const { nextPage } = await import("./actions/index.js");
    return nextPage.call(this, event, button);
  }

  /**
   * Navigate to previous page (token)
   */
  static async previousPage(event, button) {
    const { previousPage } = await import("./actions/index.js");
    return previousPage.call(this, event, button);
  }

  /**
   * Navigate to specific page
   */
  static async goToPage(event, button) {
    const { goToPage } = await import("./actions/index.js");
    return goToPage.call(this, event, button);
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
   * Bulk set visibility state for targets
   */
  static async bulkSetTargetState(event, button) {
    const { bulkSetTargetState } = await import("./actions/index.js");
    return bulkSetTargetState.call(this, event, button);
  }

  /**
   * Bulk set cover state for targets
   */
  static async bulkSetTargetCoverState(event, button) {
    const { bulkSetTargetCoverState } = await import("./actions/index.js");
    return bulkSetTargetCoverState.call(this, event, button);
  }

  /**
   * Show confirmation dialog for applying all changes
   */
  static async confirmChanges(event, button) {
    const { confirmChanges } = await import("./actions/index.js");
    return confirmChanges.call(this, event, button);
  }

  /**
   * Apply all accumulated changes
   */
  static async applyAllChanges(event, button) {
    const { applyAllChanges } = await import("./actions/index.js");
    return applyAllChanges.call(this, event, button);
  }

  /**
   * Cancel and close dialog
   */
  static async cancel(_event, _button) {
    this.close();
  }

  /**
   * Override _onRender to add custom event listeners
   */
  _onRender(context, options) {
    super._onRender(context, options);
    
    try {
      // Bind per-row icon click handlers (visibility/cover selection)
      this.addIconClickHandlers?.();
    } catch (_) {}
  }

  /**
   * Clean up when closing
   */
  async close(options = {}) {
    // Clear the current instance reference
    if (VisionerMultiTokenManager.currentInstance === this) {
      VisionerMultiTokenManager.currentInstance = null;
    }

    return super.close(options);
  }

  /**
   * Update target selection button states
   */
  updateTargetSelectionButtons(selectedType) {
    const element = this.element;
    if (!element) return;
    
    // Remove active state from all target buttons
    element.querySelectorAll('.bulk-action-button.allies, .bulk-action-button.enemies, .bulk-action-button.all')
      .forEach(btn => btn.classList.remove('target-selected'));
    
    // Add active state to selected button
    const activeButton = element.querySelector(`[data-target="${selectedType}"]`);
    if (activeButton) {
      activeButton.classList.add('target-selected');
    }
  }

  /**
   * Save current form state to tokenChanges
   */
  saveCurrentTokenState() {
    if (!this.currentToken || !this.element) return;

    const tokenId = this.currentToken.id;
    const changes = this.tokenChanges.get(tokenId);
    if (!changes) return;

    // Save visibility changes
    const visibilityInputs = this.element.querySelectorAll('input[name^="visibility."]');
    visibilityInputs.forEach(input => {
      const targetId = input.name.replace("visibility.", "");
      changes.visibility[targetId] = input.value;
    });

    // Save cover changes
    const coverInputs = this.element.querySelectorAll('input[name^="cover."]');
    coverInputs.forEach(input => {
      const targetId = input.name.replace("cover.", "");
      changes.cover[targetId] = input.value;
    });
  }

  /**
   * Get all accumulated changes for all tokens
   */
  getAllChanges() {
    // First save current token state
    this.saveCurrentTokenState();
    
    const allChanges = {
      visibility: new Map(),
      cover: new Map()
    };

    // Aggregate changes from all tokens
    for (const [tokenId, changes] of this.tokenChanges) {
      const token = canvas.tokens.get(tokenId);
      if (!token) continue;

      // For each target this token has changes for
      for (const [targetId, visibilityState] of Object.entries(changes.visibility)) {
        if (!allChanges.visibility.has(tokenId)) {
          allChanges.visibility.set(tokenId, new Map());
        }
        allChanges.visibility.get(tokenId).set(targetId, visibilityState);
      }

      for (const [targetId, coverState] of Object.entries(changes.cover)) {
        if (!allChanges.cover.has(tokenId)) {
          allChanges.cover.set(tokenId, new Map());
        }
        allChanges.cover.get(tokenId).set(targetId, coverState);
      }
    }

    return allChanges;
  }
}
