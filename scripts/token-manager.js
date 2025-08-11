/**
 * ApplicationV2-based Visioner Token Manager
 * Handles both visibility and cover management for tokens
 */

import { extractPerceptionDC, extractStealthDC } from "./chat/shared-utils.js";
import { COVER_STATES, VISIBILITY_STATES } from "./constants.js";
import { refreshEveryonesPerception } from "./socket.js";
import {
  getCoverMap,
  getLastRollTotalForActor,
  getSceneTargets,
  getVisibilityMap,
  hasActiveEncounter,
  setCoverMap,
  setVisibilityMap,
  showNotification,
} from "./utils.js";

import { MODULE_ID } from "./constants.js";

function tmDebug(...args) {
  try {
    if (game.settings.get(MODULE_ID, "debug")) {
      console.debug(`[${MODULE_ID}][tm-cover]`, ...args);
    }
  } catch (_) {}
}

export class VisionerTokenManager extends foundry.applications.api
  .ApplicationV2 {
  // Track the current instance to prevent multiple dialogs
  static currentInstance = null;
  static _canvasHoverHandlers = new Map();
  static _selectionHookId = null;

  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: VisionerTokenManager.formHandler,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    window: {
      title: "PF2E_VISIONER.TOKEN_MANAGER.TITLE",
      icon: "fas fa-user-pen",
      resizable: true,
    },
    position: {
      width: 600,
      height: 650,
    },
    actions: {
      applyCurrent: VisionerTokenManager.applyCurrent,
      applyBoth: VisionerTokenManager.applyBoth,
      reset: VisionerTokenManager.resetAll,
      toggleMode: VisionerTokenManager.toggleMode,
      toggleEncounterFilter: VisionerTokenManager.toggleEncounterFilter,
      toggleTab: VisionerTokenManager.toggleTab,
      // PC-specific bulk actions for visibility
      bulkPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      // NPC-specific bulk actions for visibility
      bulkNPCHidden: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCUndetected: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCConcealed: VisionerTokenManager.bulkSetVisibilityState,
      bulkNPCObserved: VisionerTokenManager.bulkSetVisibilityState,
      // Loot-specific bulk actions for visibility (loot table only)
      bulkLootObserved: VisionerTokenManager.bulkSetVisibilityState,
      bulkLootHidden: VisionerTokenManager.bulkSetVisibilityState,
      // PC-specific bulk actions for cover
      bulkPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
      // NPC-specific bulk actions for cover
      bulkNPCNoCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCLesserCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCStandardCover: VisionerTokenManager.bulkSetCoverState,
      bulkNPCGreaterCover: VisionerTokenManager.bulkSetCoverState,
    },
  };

  static PARTS = {
    form: {
      template: "modules/pf2e-visioner/templates/token-manager.hbs",
    },
  };

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
    const context = await super._prepareContext(options);

    if (!this.observer) {
      context.error = game.i18n.localize(
        "PF2E_VISIONER.NOTIFICATIONS.NO_OBSERVER_SELECTED"
      );
      return context;
    }

    // Always refresh maps from document flags to avoid stale UI after applies
    try {
      this.visibilityData = getVisibilityMap(this.observer) || {};
      this.coverData = getCoverMap(this.observer) || {};
    } catch (_) {}

    // Add mode and tab information to context
    const isLootObserver = this.observer?.actor?.type === "loot";
    if (isLootObserver) {
      // Force target mode and hide cover
      this.mode = "target";
      if (this.activeTab === "cover") this.activeTab = "visibility";
    }
    context.mode = this.mode;
    context.activeTab = this.activeTab;
    context.isObserverMode = this.mode === "observer";
    context.isTargetMode = this.mode === "target";
    context.isVisibilityTab = this.activeTab === "visibility";
    context.isCoverTab = this.activeTab === "cover";
    context.lootObserver = !!isLootObserver;
    context.hideCoverTab = !!isLootObserver;

    // Add encounter filtering context
    context.showEncounterFilter = hasActiveEncounter();
    context.encounterOnly = this.encounterOnly;

    const sceneTokens = getSceneTargets(this.observer, this.encounterOnly);

    // Get proper avatar image - be more strict about what we accept
    const getTokenImage = (token) => {
      // Only use actor portrait if it exists and isn't a generic token
      if (token.actor?.img) {
        return token.actor.img;
      }

      // Use a clean fallback instead of any potentially bad images
      return "icons/svg/book.svg"; // Clean book icon as fallback
    };

    context.observer = {
      id: this.observer.document.id,
      name: this.observer.document.name,
      img: getTokenImage(this.observer),
    };

    // Prepare target data based on mode
    let allTargets;

    if (this.mode === "observer") {
      // Observer Mode: "How I see others"
      allTargets = sceneTokens.map((token) => {
        const currentVisibilityState =
          this.visibilityData[token.document.id] || "observed";
        const currentCoverState = this.coverData[token.document.id] || "none";

        const disposition = token.document.disposition || 0;

        // Compute DCs and optional outcome based on settings
        const perceptionDC = extractPerceptionDC(this.observer);
        const stealthDC = extractStealthDC(token);
        const showOutcomeSetting = game.settings.get(
          MODULE_ID,
          "integrateRollOutcome"
        );
        let showOutcome = false;
        let outcomeLabel = "";
        let outcomeClass = "";
        if (showOutcomeSetting) {
          const lastRoll = getLastRollTotalForActor(this.observer?.actor, null);
          if (typeof lastRoll === "number" && typeof stealthDC === "number") {
            const diff = lastRoll - stealthDC;
            // PF2E degrees of success
            if (diff >= 10) {
              outcomeLabel = "Critical Success";
              outcomeClass = "critical-success";
            } else if (diff >= 0) {
              outcomeLabel = "Success";
              outcomeClass = "success";
            } else if (diff <= -10) {
              outcomeLabel = "Critical Failure";
              outcomeClass = "critical-failure";
            } else {
              outcomeLabel = "Failure";
              outcomeClass = "failure";
            }
            showOutcome = true;
          }
        }
        // Limit visibility options if observer or row is a loot actor
        const isRowLoot = token.actor?.type === "loot";
        const allowedVisKeys =
          isLootObserver || isRowLoot
            ? ["observed", "hidden"]
            : Object.keys(VISIBILITY_STATES);
        const visibilityStates = allowedVisKeys.map((key) => ({
          value: key,
          label: game.i18n.localize(VISIBILITY_STATES[key].label),
          selected: currentVisibilityState === key,
          icon: VISIBILITY_STATES[key].icon,
          color: VISIBILITY_STATES[key].color,
        }));

        return {
          id: token.document.id,
          name: token.document.name,
          img: getTokenImage(token),
          isLoot: !!isRowLoot,
          currentVisibilityState: allowedVisKeys.includes(
            currentVisibilityState
          )
            ? currentVisibilityState
            : "observed",
          currentCoverState,
          isPC:
            token.actor?.hasPlayerOwner || token.actor?.type === "character",
          disposition: disposition,
          dispositionClass:
            disposition === -1
              ? "hostile"
              : disposition === 1
              ? "friendly"
              : "neutral",
          visibilityStates,
          coverStates: Object.entries(COVER_STATES).map(([key, config]) => ({
            value: key,
            label: game.i18n.localize(config.label),
            selected: currentCoverState === key,
            icon: config.icon,
            color: config.color,
            bonusAC: config.bonusAC,
            bonusReflex: config.bonusReflex,
            bonusStealth: config.bonusStealth,
            canHide: config.canHide,
          })),
          perceptionDC,
          stealthDC,
          showOutcome,
          outcomeLabel,
          outcomeClass,
        };
      });
    } else {
      // Target Mode: "How others see me"
      allTargets = sceneTokens.map((observerToken) => {
        // Get how this observer sees the selected token (reversed relationship)
        const observerVisibilityData = getVisibilityMap(observerToken);
        const observerCoverData = getCoverMap(observerToken);
        const currentVisibilityState =
          observerVisibilityData[this.observer.document.id] || "observed";
        const currentCoverState =
          observerCoverData[this.observer.document.id] || "none";

        const disposition = observerToken.document.disposition || 0;

        const perceptionDC = extractPerceptionDC(observerToken);
        const stealthDC = extractStealthDC(this.observer);
        const showOutcomeSetting = game.settings.get(
          MODULE_ID,
          "integrateRollOutcome"
        );
        let showOutcome = false;
        let outcomeLabel = "";
        let outcomeClass = "";
        if (showOutcomeSetting) {
          const lastRoll = getLastRollTotalForActor(this.observer?.actor, null);
          if (
            typeof lastRoll === "number" &&
            typeof perceptionDC === "number"
          ) {
            const diff = lastRoll - perceptionDC;
            if (diff >= 10) {
              outcomeLabel = "Critical Success";
              outcomeClass = "critical-success";
            } else if (diff >= 0) {
              outcomeLabel = "Success";
              outcomeClass = "success";
            } else if (diff <= -10) {
              outcomeLabel = "Critical Failure";
              outcomeClass = "critical-failure";
            } else {
              outcomeLabel = "Failure";
              outcomeClass = "failure";
            }
            showOutcome = true;
          }
        }
        // Limit visibility options if the selected token (observer in this row) is a loot actor
        const isRowLoot =
          observerToken.actor?.type === "loot" || isLootObserver;
        const allowedVisKeys = isRowLoot
          ? ["observed", "hidden"]
          : Object.keys(VISIBILITY_STATES);
        const visibilityStates = allowedVisKeys.map((key) => ({
          value: key,
          label: game.i18n.localize(VISIBILITY_STATES[key].label),
          selected: currentVisibilityState === key,
          icon: VISIBILITY_STATES[key].icon,
          color: VISIBILITY_STATES[key].color,
        }));

        return {
          id: observerToken.document.id,
          name: observerToken.document.name,
          img: getTokenImage(observerToken),
          isLoot: !!(observerToken.actor?.type === "loot"),
          currentVisibilityState: allowedVisKeys.includes(
            currentVisibilityState
          )
            ? currentVisibilityState
            : "observed",
          currentCoverState,
          isPC:
            observerToken.actor?.hasPlayerOwner ||
            observerToken.actor?.type === "character",
          disposition: disposition,
          dispositionClass:
            disposition === -1
              ? "hostile"
              : disposition === 1
              ? "friendly"
              : "neutral",
          visibilityStates,
          coverStates: Object.entries(COVER_STATES).map(([key, config]) => ({
            value: key,
            label: game.i18n.localize(config.label),
            selected: currentCoverState === key,
            icon: config.icon,
            color: config.color,
            bonusAC: config.bonusAC,
            bonusReflex: config.bonusReflex,
            bonusStealth: config.bonusStealth,
            canHide: config.canHide,
          })),
          perceptionDC,
          stealthDC,
          showOutcome,
          outcomeLabel,
          outcomeClass,
        };
      });
    }

    // Define status precedence for sorting (observed → concealed → hidden → undetected)
    const visibilityPrecedence = {
      observed: 0,
      concealed: 1,
      hidden: 2,
      undetected: 3,
    };

    // Define cover precedence for sorting (none → lesser → standard → greater)
    const coverPrecedence = {
      none: 0,
      lesser: 1,
      standard: 2,
      greater: 3,
    };

    // Sort function by status precedence, then by name
    const sortByStatusAndName = (a, b) => {
      if (this.activeTab === "visibility") {
        const statusA = visibilityPrecedence[a.currentVisibilityState] ?? 999;
        const statusB = visibilityPrecedence[b.currentVisibilityState] ?? 999;

        if (statusA !== statusB) {
          return statusA - statusB;
        }
      } else {
        const statusA = coverPrecedence[a.currentCoverState] ?? 999;
        const statusB = coverPrecedence[b.currentCoverState] ?? 999;

        if (statusA !== statusB) {
          return statusA - statusB;
        }
      }

      // If same status, sort alphabetically by name
      return a.name.localeCompare(b.name);
    };

    // Split targets into PCs, NPCs (non-loot), and Loot; sort each group
    // For loot observers, PC table should not show concealed/undetected options. We already limited allowed keys when observer or row is loot.
    context.pcTargets = allTargets
      .filter((target) => target.isPC && !target.isLoot)
      .sort(sortByStatusAndName);
    context.npcTargets = allTargets
      .filter((target) => !target.isPC && !target.isLoot)
      .sort(sortByStatusAndName);
    context.lootTargets =
      this.mode === "observer"
        ? allTargets.filter((target) => target.isLoot).sort(sortByStatusAndName)
        : [];
    context.targets = allTargets; // Keep for backward compatibility

    context.visibilityStates = Object.entries(VISIBILITY_STATES).map(
      ([key, config]) => ({
        key,
        label: game.i18n.localize(config.label),
        icon: config.icon,
        color: config.color,
      })
    );

    context.coverStates = Object.entries(COVER_STATES).map(([key, config]) => ({
      key,
      label: game.i18n.localize(config.label),
      icon: config.icon,
      color: config.color,
      bonusAC: config.bonusAC,
      bonusReflex: config.bonusReflex,
      bonusStealth: config.bonusStealth,
      canHide: config.canHide,
    }));

    context.hasTargets = allTargets.length > 0;
    context.hasPCs = context.pcTargets.length > 0;
    context.hasNPCs = context.npcTargets.length > 0;
    context.hasLoots =
      this.mode === "observer" && context.lootTargets.length > 0;
    // Walls UI temporarily disabled
    context.includeWalls = false;
    // Settings-driven columns
    try {
      context.showOutcomeColumn = game.settings.get(
        MODULE_ID,
        "integrateRollOutcome"
      );
    } catch (_) {
      context.showOutcomeColumn = false;
    }

    // Check if we're showing targeted tokens
    const targetedTokens = Array.from(game.user.targets).filter(
      (token) => token.document.id !== this.observer?.document.id
    );
    context.showingTargetedTokens = targetedTokens.length > 0;
    context.targetedTokensCount = targetedTokens.length;

    return context;
  }

  /**
   * Render the HTML for the application
   */
  async _renderHTML(context, options) {
    const html = await renderTemplate(
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
    const app = this;
    const visibilityChanges = {};
    const coverChanges = {};
    const wallChanges = {};

    // Parse form data
    const formDataObj = formData.object || formData;
    for (const [key, value] of Object.entries(formDataObj)) {
      if (key.startsWith("visibility.")) {
        const tokenId = key.replace("visibility.", "");
        visibilityChanges[tokenId] = value;
      } else if (key.startsWith("cover.")) {
        const tokenId = key.replace("cover.", "");
        coverChanges[tokenId] = value;
      }
    }

    // Handle visibility updates based on mode
    if (app.mode === "observer") {
      // Observer Mode: "How I see others" - update this observer's visibility map
      if (Object.keys(visibilityChanges).length > 0) {
        const currentMap = getVisibilityMap(app.observer) || {};
        const merged = { ...currentMap };
        // Only write entries that actually change, to reduce doc update size
        for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
          if (merged[tokenId] !== newState) merged[tokenId] = newState;
        }
        await setVisibilityMap(app.observer, merged);

        // Use batch update for visibility changes
        try {
          const { batchUpdateVisibilityEffects } = await import(
            "./off-guard-ephemeral.js"
          );
          const targetUpdates = [];

          for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
            const targetToken = canvas.tokens.get(tokenId);
            if (!targetToken) continue;
            // Skip no-op updates
            const currentState = currentMap?.[tokenId];
            if (currentState === newState) continue;

            targetUpdates.push({
              target: targetToken,
              state: newState,
            });
          }

          if (targetUpdates.length > 0) {
            await batchUpdateVisibilityEffects(app.observer, targetUpdates, {
              direction: "observer_to_target",
            });
          }
        } catch (error) {
          console.warn("Token Manager: batch visibility update failed", error);
        }
      }

      // Handle cover updates
      if (Object.keys(coverChanges).length > 0) {
        const currentCover = getCoverMap(app.observer) || {};
        const mergedCover = { ...currentCover };
        for (const [tokenId, newState] of Object.entries(coverChanges)) {
          if (mergedCover[tokenId] !== newState)
            mergedCover[tokenId] = newState;
        }
        await setCoverMap(app.observer, mergedCover);
        // Use batch update for cover changes
        try {
          const { batchUpdateCoverEffects } = await import(
            "./cover-ephemeral.js"
          );
          const targetUpdates = [];

          for (const [tokenId, newState] of Object.entries(coverChanges)) {
            const prev = currentCover?.[tokenId];
            if (prev === newState) continue;
            const targetToken = canvas.tokens.get(tokenId);
            if (!targetToken) continue;

            targetUpdates.push({
              target: targetToken,
              state: newState,
            });
          }

          if (targetUpdates.length > 0) {
            await batchUpdateCoverEffects(app.observer, targetUpdates);
          }
        } catch (error) {
          console.warn("Token Manager: batch cover update failed", error);
        }
      }
      // Walls functionality temporarily disabled
    } else {
      // Target Mode: "How others see me" - update each observer's maps
      // Batch target-mode updates per observer
      const perObserverChanges = new Map();
      for (const [observerTokenId, newVisibilityState] of Object.entries(
        visibilityChanges
      )) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        try {
          const t = observerToken.actor?.type;
          if (t === "loot" || t === "vehicle" || t === "party") continue;
        } catch (_) {}
        const current = getVisibilityMap(observerToken) || {};
        const currentState = current[app.observer.document.id];
        if (currentState === newVisibilityState) continue; // skip no-op
        // Queue map write
        if (!perObserverChanges.has(observerTokenId))
          perObserverChanges.set(observerTokenId, {
            token: observerToken,
            map: current,
          });
        perObserverChanges.get(observerTokenId).map[app.observer.document.id] =
          newVisibilityState;
      }
      // Perform document writes first
      for (const { token: observerToken, map } of perObserverChanges.values()) {
        await setVisibilityMap(observerToken, map);
      }
      // Use batch update for visibility changes in target mode
      try {
        const { batchUpdateVisibilityEffects } = await import(
          "./off-guard-ephemeral.js"
        );
        const observerUpdates = [];

        for (const [observerTokenId, newVisibilityState] of Object.entries(
          visibilityChanges
        )) {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          try {
            const t = observerToken.actor?.type;
            if (t === "loot" || t === "vehicle" || t === "party") continue;
          } catch (_) {}
          const currentState =
            getVisibilityMap(observerToken)?.[app.observer.document.id];
          if (currentState !== newVisibilityState) {
            observerUpdates.push({
              target: app.observer,
              state: newVisibilityState,
              observer: observerToken,
            });
          }
        }

        if (observerUpdates.length > 0) {
          // Group by observer
          const updatesByObserver = new Map();

          for (const update of observerUpdates) {
            if (!updatesByObserver.has(update.observer.id)) {
              updatesByObserver.set(update.observer.id, {
                observer: update.observer,
                updates: [],
              });
            }

            updatesByObserver.get(update.observer.id).updates.push({
              target: update.target,
              state: update.state,
            });
          }

          // Process each observer's batch
          for (const { observer, updates } of updatesByObserver.values()) {
            await batchUpdateVisibilityEffects(observer, updates, {
              direction: "observer_to_target",
            });
          }
        }
      } catch (error) {
        console.warn(
          "Token Manager: batch visibility update failed in target mode",
          error
        );
      }

      // Handle cover updates for target mode
      // Batch target-mode cover writes
      const perObserverCover = new Map();
      for (const [observerTokenId, newCoverState] of Object.entries(
        coverChanges
      )) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        const current = getCoverMap(observerToken) || {};
        const currentState = current[app.observer.document.id];
        // If observer is loot/etc, zero out map entry and skip enqueueing effect updates
        try {
          const t = observerToken.actor?.type;
          if (t === "loot" || t === "vehicle" || t === "party") {
            if (currentState && currentState !== "none") {
              current[app.observer.document.id] = "none";
              await setCoverMap(observerToken, current);
            }
            continue;
          }
        } catch (_) {}
        // Always queue removals so effects get cleaned even if map already at 'none'
        if (currentState === newCoverState && newCoverState !== "none")
          continue;
        if (!perObserverCover.has(observerTokenId))
          perObserverCover.set(observerTokenId, {
            token: observerToken,
            map: current,
          });
        perObserverCover.get(observerTokenId).map[app.observer.document.id] =
          newCoverState;
      }
      for (const { token: observerToken, map } of perObserverCover.values()) {
        await setCoverMap(observerToken, map);
      }
      // Use batch update for cover changes in target mode
      try {
        const { batchUpdateCoverEffects } = await import(
          "./cover-ephemeral.js"
        );
        const observerUpdates = [];

        for (const [observerTokenId, newCoverState] of Object.entries(
          coverChanges
        )) {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          const current = getCoverMap(observerToken) || {};
          const currentState = current[app.observer.document.id];
          try {
            const t = observerToken.actor?.type;
            if (t === "loot" || t === "vehicle" || t === "party") {
              if (currentState && currentState !== "none") {
                current[app.observer.document.id] = "none";
                await setCoverMap(observerToken, current);
              }
              continue;
            }
          } catch (_) {}
          if (currentState !== newCoverState || newCoverState === "none") {
            observerUpdates.push({
              target: app.observer,
              state: newCoverState,
              observer: observerToken,
            });
            tmDebug("target-mode enqueue", {
              observer: observerToken.name,
              target: app.observer.name,
              from: currentState,
              to: newCoverState,
            });
          }
        }

        if (observerUpdates.length > 0) {
          // Group by observer
          const updatesByObserver = new Map();

          for (const update of observerUpdates) {
            if (!updatesByObserver.has(update.observer.id)) {
              updatesByObserver.set(update.observer.id, {
                observer: update.observer,
                updates: [],
              });
            }

            updatesByObserver.get(update.observer.id).updates.push({
              target: update.target,
              state: update.state,
            });
          }

          // Process each observer's batch
          for (const { observer, updates } of updatesByObserver.values()) {
            tmDebug("target-mode batch", {
              observer: observer.name,
              updates: updates.map((u) => ({
                target: u.target.name,
                state: u.state,
              })),
            });
            await batchUpdateCoverEffects(observer, updates);
          }
        }
      } catch (error) {
        console.warn(
          "Token Manager: batch cover update failed in target mode",
          error
        );
      }
    }

    // Run refresh and visuals in background; don't block UI
    (async () => {
      try {
        refreshEveryonesPerception();
        const { updateTokenVisuals } = await import("./effects-coordinator.js");
        await updateTokenVisuals();
      } catch (_) {}
    })();
    return app.render();
  }

  /**
   * Apply changes and close
   */
  static async applyCurrent(event, button) {
    const app = this;
    const { runTasksWithProgress } = await import("./progress.js");

    // Close dialog immediately
    try {
      app.close();
    } catch (error) {
      console.warn("Token Manager: Error closing dialog:", error);
    }

    // First save the current mode's form state
    try {
      // Get all inputs from the form
      const visibilityInputs = app.element.querySelectorAll(
        'input[name^="visibility."]'
      );
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      const wallInputs = app.element.querySelectorAll('input[name^="walls."]');

      // Create a storage object for this mode if it doesn't exist
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode])
        app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };

      // Store each visibility setting
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace("visibility.", "");
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });

      // Store each cover setting
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace("cover.", "");
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
      wallInputs.forEach((input) => {
        const wallId = input.name.replace("walls.", "");
        app._savedModeData[app.mode].walls[wallId] = input.value;
      });
    } catch (error) {
      console.error("Token Manager: Error saving current form state:", error);
    }

    // Show progress bar immediately
    const initialProgress = runTasksWithProgress(
      `${MODULE_ID}: Preparing Changes`,
      [
        async () => {
          // This is a placeholder task that will be replaced by real tasks
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      ]
    );

    // Apply current TYPE (visibility or cover) for BOTH modes (observer and target)
    try {
      const { batchUpdateVisibilityEffects } = await import(
        "./off-guard-ephemeral.js"
      );
      const { batchUpdateCoverEffects } = await import("./cover-ephemeral.js");
      const { updateWallVisuals } = await import("./visual-effects.js");
      const isVisibility = app.activeTab === "visibility";
      const isCover = app.activeTab === "cover";

      // Collect all operations to perform
      const allOperations = [];
      const visualUpdatePairs = [];

      // Apply the current type (visibility or cover) for BOTH modes (observer and target)
      if (isVisibility) {
        // Observer mode visibility updates
        const obsVis = app._savedModeData.observer?.visibility || {};
        if (Object.keys(obsVis).length > 0) {
          // Update the visibility map
          const currentMap = getVisibilityMap(app.observer) || {};
          await setVisibilityMap(app.observer, { ...currentMap, ...obsVis });

          // Prepare batch updates
          const targetUpdates = [];
          for (const [tokenId, newState] of Object.entries(obsVis)) {
            const targetToken = canvas.tokens.get(tokenId);
            if (targetToken) {
              targetUpdates.push({
                target: targetToken,
                state: newState,
              });
            }
          }

          // Add batch operation
          if (targetUpdates.length > 0) {
            allOperations.push(async () => {
              await batchUpdateVisibilityEffects(app.observer, targetUpdates, {
                direction: "observer_to_target",
              });
            });

            // Collect for visual updates
            visualUpdatePairs.push(
              ...targetUpdates.map((update) => ({
                observerId: app.observer.id,
                targetId: update.target.id,
                visibility: update.state,
              }))
            );
          }
        }

        // Target mode visibility updates
        const tgtVis = app._savedModeData.target?.visibility || {};
        if (Object.keys(tgtVis).length > 0) {
          // Group updates by observer
          const updatesByObserver = new Map();

          for (const [observerTokenId, newState] of Object.entries(tgtVis)) {
            if (
              typeof newState !== "string" ||
              !["observed", "concealed", "hidden", "undetected"].includes(
                newState
              )
            )
              continue;
            const observerToken = canvas.tokens.get(observerTokenId);
            if (!observerToken) continue;
            try {
              const t = observerToken.actor?.type;
              if (t === "loot" || t === "vehicle" || t === "party") continue;
            } catch (_) {}

            // Update the visibility map
            const observerVisibilityData =
              getVisibilityMap(observerToken) || {};
            await setVisibilityMap(observerToken, {
              ...observerVisibilityData,
              [app.observer.document.id]: newState,
            });

            // Add to batch updates
            if (!updatesByObserver.has(observerTokenId)) {
              updatesByObserver.set(observerTokenId, {
                observer: observerToken,
                updates: [],
              });
            }

            updatesByObserver.get(observerTokenId).updates.push({
              target: app.observer,
              state: newState,
            });
          }

          // Add batch operations for each observer
          for (const { observer, updates } of updatesByObserver.values()) {
            allOperations.push(async () => {
              await batchUpdateVisibilityEffects(observer, updates, {
                direction: "observer_to_target",
              });
            });

            // Collect for visual updates
            for (const update of updates) {
              visualUpdatePairs.push({
                observerId: observer.id,
                targetId: app.observer.id,
                visibility: update.state,
              });
            }
          }
        }
      }

      // Always apply observer wall updates if present
      const obsWalls = app._savedModeData.observer?.walls || {};
      if (Object.keys(obsWalls).length > 0) {
        const currentWalls = getWallVisibilityMap(app.observer) || {};
        await setWallVisibilityMap(app.observer, {
          ...currentWalls,
          ...obsWalls,
        });
        allOperations.push(async () => {
          try {
            await updateWallVisuals(app.observer?.id || null);
          } catch (_) {}
        });
      }

      if (isCover) {
        // Observer mode cover updates
        const obsCov = app._savedModeData.observer?.cover || {};
        if (Object.keys(obsCov).length > 0) {
          // Update the cover map
          const currentCover = getCoverMap(app.observer) || {};
          await setCoverMap(app.observer, { ...currentCover, ...obsCov });

          // Prepare batch updates
          const targetUpdates = [];
          for (const [tokenId, state] of Object.entries(obsCov)) {
            const targetToken = canvas.tokens.get(tokenId);
            if (targetToken) {
              targetUpdates.push({
                target: targetToken,
                state: state,
              });
            }
          }

          // Add batch operation
          if (targetUpdates.length > 0) {
            allOperations.push(async () => {
              await batchUpdateCoverEffects(app.observer, targetUpdates);
            });

            // Collect for visual updates
            visualUpdatePairs.push(
              ...targetUpdates.map((update) => ({
                observerId: app.observer.id,
                targetId: update.target.id,
                cover: update.state,
              }))
            );
          }
        }

        // Target mode cover updates
        const tgtCov = app._savedModeData.target?.cover || {};
        if (Object.keys(tgtCov).length > 0) {
          // Group updates by observer
          const updatesByObserver = new Map();

          for (const [observerTokenId, newState] of Object.entries(tgtCov)) {
            const observerToken = canvas.tokens.get(observerTokenId);
            if (!observerToken) continue;

            // Update the cover map
            const observerCoverData = getCoverMap(observerToken) || {};
            await setCoverMap(observerToken, {
              ...observerCoverData,
              [app.observer.document.id]: newState,
            });

            // Add to batch updates
            if (!updatesByObserver.has(observerTokenId)) {
              updatesByObserver.set(observerTokenId, {
                observer: observerToken,
                updates: [],
              });
            }

            updatesByObserver.get(observerTokenId).updates.push({
              target: app.observer,
              state: newState,
            });

            tmDebug("applyCurrent target-mode enqueue", {
              observer: observerToken.name,
              target: app.observer.name,
              to: newState,
            });
          }

          // Add batch operations for each observer
          for (const { observer, updates } of updatesByObserver.values()) {
            try {
              const t = observer.actor?.type;
              if (t === "loot" || t === "vehicle" || t === "party") continue;
            } catch (_) {}
            tmDebug("applyCurrent target-mode batch", {
              observer: observer.name,
              updates: updates.map((u) => ({
                target: u.target.name,
                state: u.state,
              })),
            });
            allOperations.push(async () => {
              await batchUpdateCoverEffects(observer, updates);
            });

            // Collect for visual updates
            for (const update of updates) {
              visualUpdatePairs.push({
                observerId: observer.id,
                targetId: app.observer.id,
                cover: update.state,
              });
            }
          }
        }
      }

      // Replace the placeholder task with real tasks
      if (allOperations.length > 0) {
        await runTasksWithProgress(
          `${MODULE_ID}: Applying Changes`,
          allOperations
        );

        // Update visuals in the background
        if (visualUpdatePairs.length > 0) {
          (async () => {
            try {
              const { updateSpecificTokenPairs } = await import(
                "./visual-effects.js"
              );
              await updateSpecificTokenPairs(visualUpdatePairs);
            } catch (error) {
              console.warn("Token Manager: Error updating visuals:", error);
            }
          })();
        }
      }
    } catch (error) {
      console.error(
        "Token Manager: Error applying current type for both modes:",
        error
      );
    }

    // Background perception refresh
    (async () => {
      try {
        refreshEveryonesPerception();
        canvas.perception.update({ refreshVision: true });
      } catch (error) {
        console.warn("Token Manager: Error refreshing perception:", error);
      }
    })();
  }

  /**
   * Apply both Visibility and Cover changes for the current mode
   */
  static async applyBoth(event, button) {
    const app = this;
    const { runTasksWithProgress } = await import("./progress.js");

    // Close dialog immediately
    try {
      app.close();
    } catch (error) {
      console.warn("Token Manager: Error closing dialog:", error);
    }
    // Show progress bar immediately
    const initialProgress = runTasksWithProgress(
      `${MODULE_ID}: Preparing Changes`,
      [
        async () => {
          // This is a placeholder task that will be replaced by real tasks
          await new Promise((resolve) => setTimeout(resolve, 100));
        },
      ]
    );

    // Save current inputs first
    try {
      const visibilityInputs = app.element.querySelectorAll(
        'input[name^="visibility."]'
      );
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode])
        app._savedModeData[app.mode] = { visibility: {}, cover: {} };
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace("visibility.", "");
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace("cover.", "");
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
    } catch (error) {
      console.error("Token Manager: Error saving current form state:", error);
    }

    // The following code is no longer used, as we now use batch operations directly

    // Use batch operations
    try {
      const { batchUpdateVisibilityEffects } = await import(
        "./off-guard-ephemeral.js"
      );
      const { batchUpdateCoverEffects } = await import("./cover-ephemeral.js");

      // Collect all operations to perform
      const allOperations = [];
      const visualUpdatePairs = [];

      // Observer mode updates
      const observerVisUpdates = [];
      const observerCovUpdates = [];

      // Process observer mode visibility updates
      const vis = app._savedModeData.observer?.visibility || {};
      if (Object.keys(vis).length > 0) {
        // Update the visibility map
        const currentMap = getVisibilityMap(app.observer) || {};
        await setVisibilityMap(app.observer, { ...currentMap, ...vis });

        // Collect updates for batch processing
        for (const [tokenId, newState] of Object.entries(vis)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (targetToken) {
            observerVisUpdates.push({
              target: targetToken,
              state: newState,
            });

            // Collect for visual updates
            visualUpdatePairs.push({
              observerId: app.observer.id,
              targetId: targetToken.id,
              visibility: newState,
            });
          }
        }
      }

      // Process observer mode cover updates
      const cov = app._savedModeData.observer?.cover || {};
      if (Object.keys(cov).length > 0) {
        // Update the cover map
        const currentCover = getCoverMap(app.observer) || {};
        await setCoverMap(app.observer, { ...currentCover, ...cov });

        // Collect updates for batch processing
        for (const [tokenId, state] of Object.entries(cov)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (targetToken) {
            observerCovUpdates.push({
              target: targetToken,
              state: state,
            });

            // Collect for visual updates
            visualUpdatePairs.push({
              observerId: app.observer.id,
              targetId: targetToken.id,
              cover: state,
            });
          }
        }
      }

      // Target mode updates
      const targetVisUpdates = new Map();
      const targetCovUpdates = new Map();

      // Process target mode visibility updates
      const targetVis = app._savedModeData.target?.visibility || {};
      for (const [observerTokenId, newState] of Object.entries(targetVis)) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (observerToken) {
          // Update the visibility map
          const observerVisibilityData = getVisibilityMap(observerToken) || {};
          await setVisibilityMap(observerToken, {
            ...observerVisibilityData,
            [app.observer.document.id]: newState,
          });

          // Add to batch updates
          if (!targetVisUpdates.has(observerTokenId)) {
            targetVisUpdates.set(observerTokenId, {
              observer: observerToken,
              updates: [],
            });
          }

          targetVisUpdates.get(observerTokenId).updates.push({
            target: app.observer,
            state: newState,
          });

          // Collect for visual updates
          visualUpdatePairs.push({
            observerId: observerToken.id,
            targetId: app.observer.id,
            visibility: newState,
          });
        }
      }

      // Process target mode cover updates
      const targetCov = app._savedModeData.target?.cover || {};
      for (const [observerTokenId, newState] of Object.entries(targetCov)) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (observerToken) {
          // Update the cover map
          const observerCoverData = getCoverMap(observerToken) || {};
          await setCoverMap(observerToken, {
            ...observerCoverData,
            [app.observer.document.id]: newState,
          });

          // Add to batch updates
          if (!targetCovUpdates.has(observerTokenId)) {
            targetCovUpdates.set(observerTokenId, {
              observer: observerToken,
              updates: [],
            });
          }

          targetCovUpdates.get(observerTokenId).updates.push({
            target: app.observer,
            state: newState,
          });

          // Collect for visual updates
          visualUpdatePairs.push({
            observerId: observerToken.id,
            targetId: app.observer.id,
            cover: newState,
          });
        }
      }

      // Add all operations to the list

      // Observer mode batch operations
      if (observerVisUpdates.length > 0) {
        allOperations.push(async () => {
          await batchUpdateVisibilityEffects(app.observer, observerVisUpdates, {
            direction: "observer_to_target",
          });
        });
      }

      if (observerCovUpdates.length > 0) {
        allOperations.push(async () => {
          await batchUpdateCoverEffects(app.observer, observerCovUpdates);
        });
      }

      // Target mode batch operations
      for (const { observer, updates } of targetVisUpdates.values()) {
        allOperations.push(async () => {
          await batchUpdateVisibilityEffects(observer, updates, {
            direction: "observer_to_target",
          });
        });
      }

      for (const { observer, updates } of targetCovUpdates.values()) {
        allOperations.push(async () => {
          await batchUpdateCoverEffects(observer, updates);
        });
      }

      // Replace the placeholder task with real tasks
      if (allOperations.length > 0) {
        await runTasksWithProgress(
          `${MODULE_ID}: Applying Changes`,
          allOperations
        );

        // Update visuals in the background
        if (visualUpdatePairs.length > 0) {
          (async () => {
            try {
              const { updateSpecificTokenPairs } = await import(
                "./visual-effects.js"
              );
              await updateSpecificTokenPairs(visualUpdatePairs);
            } catch (error) {
              console.warn("Token Manager: Error updating visuals:", error);
            }
          })();
        }
      }
    } catch (error) {
      console.error(
        "Token Manager: Error applying both types for both modes:",
        error
      );
    }

    // Background perception refresh
    (async () => {
      try {
        refreshEveryonesPerception();
        canvas.perception.update({ refreshVision: true });
      } catch (error) {
        console.warn("Token Manager: Error refreshing perception:", error);
      }
    })();
  }

  /**
   * Reset all visibility and cover states
   */
  static async resetAll(event, button) {
    const app = this;

    // Clear the visibility and cover maps
    await setVisibilityMap(app.observer, {});
    await setCoverMap(app.observer, {});
    refreshEveryonesPerception();

    return app.render();
  }

  /**
   * Toggle between Observer and Target modes
   */
  static async toggleMode(event, button) {
    const app = this;
    // If observer is a loot actor, do not allow switching modes
    try {
      if (app?.observer?.actor?.type === "loot") return;
    } catch (_) {}

    // Store current position and size to prevent jumping
    const currentPosition = app.position;

    // Capture the current form state
    try {
      // Get all inputs from the form
      const visibilityInputs = app.element.querySelectorAll(
        'input[name^="visibility."]'
      );
      const coverInputs = app.element.querySelectorAll('input[name^="cover."]');

      // Create a storage object for this mode if it doesn't exist
      if (!app._savedModeData) app._savedModeData = {};
      if (!app._savedModeData[app.mode])
        app._savedModeData[app.mode] = { visibility: {}, cover: {} };

      // Store each visibility setting
      visibilityInputs.forEach((input) => {
        const tokenId = input.name.replace("visibility.", "");
        app._savedModeData[app.mode].visibility[tokenId] = input.value;
      });

      // Store each cover setting
      coverInputs.forEach((input) => {
        const tokenId = input.name.replace("cover.", "");
        app._savedModeData[app.mode].cover[tokenId] = input.value;
      });
    } catch (error) {
      console.error("Token Manager: Error saving form state:", error);
    }

    // Toggle the mode
    const newMode = app.mode === "observer" ? "target" : "observer";
    app.mode = newMode;

    // Re-render with preserved position
    await app.render({ force: true });

    // After rendering, restore any saved values for the new mode
    try {
      if (app._savedModeData && app._savedModeData[newMode]) {
        // Find all inputs in the newly rendered form
        const visibilityInputs = app.element.querySelectorAll(
          'input[name^="visibility."]'
        );
        const coverInputs = app.element.querySelectorAll(
          'input[name^="cover."]'
        );

        // Set visibility values from saved data
        visibilityInputs.forEach((input) => {
          const tokenId = input.name.replace("visibility.", "");
          if (app._savedModeData[newMode].visibility[tokenId]) {
            input.value = app._savedModeData[newMode].visibility[tokenId];

            // Also update the visual state (selected icon)
            const iconContainer = input.closest(".icon-selection");
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll(".state-icon");
              icons.forEach((icon) => icon.classList.remove("selected"));

              const targetIcon = iconContainer.querySelector(
                `[data-state="${input.value}"]`
              );
              if (targetIcon) {
                targetIcon.classList.add("selected");
              }
            }
          }
        });

        // Set cover values from saved data
        coverInputs.forEach((input) => {
          const tokenId = input.name.replace("cover.", "");
          if (app._savedModeData[newMode].cover[tokenId]) {
            input.value = app._savedModeData[newMode].cover[tokenId];

            // Also update the visual state (selected icon)
            const iconContainer = input.closest(".icon-selection");
            if (iconContainer) {
              const icons = iconContainer.querySelectorAll(".state-icon");
              icons.forEach((icon) => icon.classList.remove("selected"));

              const targetIcon = iconContainer.querySelector(
                `[data-state="${input.value}"]`
              );
              if (targetIcon) {
                targetIcon.classList.add("selected");
              }
            }
          }
        });
      }
    } catch (error) {
      console.error("Token Manager: Error restoring saved form state:", error);
    }

    // Restore position after render to prevent jumping
    if (currentPosition) {
      app.setPosition({
        left: currentPosition.left,
        top: currentPosition.top,
        width: currentPosition.width,
      });
    }
  }

  /**
   * Toggle between Visibility and Cover tabs
   */
  static async toggleTab(event, button) {
    const app = this;
    const newTab = button.dataset.tab;

    if (newTab && newTab !== app.activeTab) {
      // 1) Save current tab inputs before switching
      try {
        const visibilityInputs = app.element.querySelectorAll(
          'input[name^="visibility."]'
        );
        const coverInputs = app.element.querySelectorAll(
          'input[name^="cover."]'
        );

        if (!app._savedModeData) app._savedModeData = {};
        if (!app._savedModeData[app.mode])
          app._savedModeData[app.mode] = { visibility: {}, cover: {} };

        visibilityInputs.forEach((input) => {
          const tokenId = input.name.replace("visibility.", "");
          app._savedModeData[app.mode].visibility[tokenId] = input.value;
        });

        coverInputs.forEach((input) => {
          const tokenId = input.name.replace("cover.", "");
          app._savedModeData[app.mode].cover[tokenId] = input.value;
        });
      } catch (error) {
        console.error("Token Manager: Error saving tab state:", error);
      }

      // 2) Switch tab and re-render
      app.activeTab = newTab;
      await app.render({ force: true });

      // 3) Restore saved values for the current mode on the newly active tab
      try {
        if (app._savedModeData && app._savedModeData[app.mode]) {
          const visibilityInputs = app.element.querySelectorAll(
            'input[name^="visibility."]'
          );
          const coverInputs = app.element.querySelectorAll(
            'input[name^="cover."]'
          );

          visibilityInputs.forEach((input) => {
            const tokenId = input.name.replace("visibility.", "");
            const saved = app._savedModeData[app.mode].visibility[tokenId];
            if (saved) {
              input.value = saved;
              const iconContainer = input.closest(".icon-selection");
              if (iconContainer) {
                const icons = iconContainer.querySelectorAll(".state-icon");
                icons.forEach((icon) => icon.classList.remove("selected"));
                const targetIcon = iconContainer.querySelector(
                  `[data-state="${saved}"]`
                );
                if (targetIcon) targetIcon.classList.add("selected");
              }
            }
          });

          coverInputs.forEach((input) => {
            const tokenId = input.name.replace("cover.", "");
            const saved = app._savedModeData[app.mode].cover[tokenId];
            if (saved) {
              input.value = saved;
              const iconContainer = input.closest(".icon-selection");
              if (iconContainer) {
                const icons = iconContainer.querySelectorAll(".state-icon");
                icons.forEach((icon) => icon.classList.remove("selected"));
                const targetIcon = iconContainer.querySelector(
                  `[data-state="${saved}"]`
                );
                if (targetIcon) targetIcon.classList.add("selected");
              }
            }
          });
        }
      } catch (error) {
        console.error("Token Manager: Error restoring tab state:", error);
      }
      // After switching tabs, re-apply selection highlight so rows in the new tab are highlighted too
      try {
        VisionerTokenManager._applySelectionHighlight();
      } catch (_) {}
    }
  }

  /**
   * Toggle encounter filtering and refresh results
   */
  static async toggleEncounterFilter(event, button) {
    const app = this;

    // Toggle the encounter filter state
    app.encounterOnly = !app.encounterOnly;

    // Check if we have any tokens with the new filter
    const newTargets = getSceneTargets(app.observer, app.encounterOnly);

    if (newTargets.length === 0 && app.encounterOnly) {
      ui.notifications.info(
        `${MODULE_ID}: No encounter tokens found. Filter disabled.`
      );
      // Reset to false if no targets found
      app.encounterOnly = false;
      return;
    }

    // Re-render the dialog with new filter state
    await app.render({ force: true });
  }

  /**
   * Bulk set visibility state for tokens
   */
  static async bulkSetVisibilityState(event, button) {
    try {
      const state = button.dataset.state;
      const targetType = button.dataset.targetType; // 'pc' | 'npc' | 'loot'

      if (!state) {
        return;
      }

      // Update icon selections in the form, filtered by target type
      const form = event.currentTarget.closest("form");
      if (form) {
        let selector = ".visibility-section .icon-selection";

        // If target type is specified, filter to only that section
        if (targetType === "pc") {
          selector =
            ".visibility-section .table-section:has(.header-left .fa-users) .icon-selection";
        } else if (targetType === "npc") {
          selector =
            ".visibility-section .table-section:has(.header-left .fa-dragon) .icon-selection";
        } else if (targetType === "loot") {
          selector =
            ".visibility-section .table-section.loot-section .icon-selection";
        }

        const iconSelections = form.querySelectorAll(selector);

        // Minimize DOM churn: only change rows that actually differ
        for (const iconSelection of iconSelections) {
          const hiddenInput = iconSelection.querySelector(
            'input[type="hidden"]'
          );
          const current = hiddenInput?.value;
          if (current === state) continue; // skip unchanged rows

          // Toggle only the necessary icons instead of clearing all
          const currentSelected = iconSelection.querySelector(
            ".state-icon.selected"
          );
          if (currentSelected) currentSelected.classList.remove("selected");
          const targetIcon = iconSelection.querySelector(
            `[data-state="${state}"]`
          );
          if (targetIcon) targetIcon.classList.add("selected");

          if (hiddenInput) hiddenInput.value = state;
        }
      }
    } catch (error) {
      console.error("Error in bulk set visibility state:", error);
      showNotification(
        "An error occurred while setting bulk visibility state",
        "error"
      );
    }
  }

  /**
   * Bulk set cover state for tokens
   */
  static async bulkSetCoverState(event, button) {
    try {
      const state = button.dataset.state;
      const targetType = button.dataset.targetType; // 'pc' or 'npc'

      if (!state) {
        return;
      }

      // Update icon selections in the form, filtered by target type
      const form = event.currentTarget.closest("form");
      if (form) {
        let selector = ".cover-section .icon-selection";

        // If target type is specified, filter to only that section
        if (targetType === "pc") {
          selector =
            ".cover-section .table-section:has(.header-left .fa-users) .icon-selection";
        } else if (targetType === "npc") {
          selector =
            ".cover-section .table-section:has(.header-left .fa-dragon) .icon-selection";
        }

        const iconSelections = form.querySelectorAll(selector);

        // Minimize DOM churn: only change rows that actually differ
        for (const iconSelection of iconSelections) {
          const hiddenInput = iconSelection.querySelector(
            'input[type="hidden"]'
          );
          const current = hiddenInput?.value;
          if (current === state) continue; // skip unchanged rows

          const currentSelected = iconSelection.querySelector(
            ".state-icon.selected"
          );
          if (currentSelected) currentSelected.classList.remove("selected");
          const targetIcon = iconSelection.querySelector(
            `[data-state="${state}"]`
          );
          if (targetIcon) targetIcon.classList.add("selected");

          if (hiddenInput) hiddenInput.value = state;
        }
      }
    } catch (error) {
      console.error("Error in bulk set cover state:", error);
      showNotification(
        "An error occurred while setting bulk cover state",
        "error"
      );
    }
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
    this.addIconClickHandlers();
    // Setup canvas selection → row highlighting
    VisionerTokenManager._attachSelectionHandlers();
    VisionerTokenManager._applySelectionHighlight();
  }

  /**
   * Clean up when closing
   */
  async close(options = {}) {
    // Clean up any remaining token borders
    this.cleanupAllTokenBorders();
    // Remove selection handlers and clear row highlights
    VisionerTokenManager._detachSelectionHandlers();
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

  /**
   * Attach hover handlers on canvas tokens to highlight corresponding rows in the manager
   */
  static _attachCanvasHoverHandlers() {
    const app = VisionerTokenManager.currentInstance;
    if (!app || !app.element || !canvas?.tokens?.placeables?.length) return;
    // If already attached, skip
    if (VisionerTokenManager._canvasHoverHandlers.size > 0) return;

    canvas.tokens.placeables.forEach((token) => {
      const over = () => {
        try {
          const row = app.element.querySelector(
            `tr[data-token-id="${token.id}"]`
          );
          if (row) {
            row.classList.add("row-hover");
            // Scroll into view within the main tables-content container
            const scroller =
              app.element.querySelector(".tables-content") ||
              row.closest(".visibility-table-container") ||
              app.element;
            if (scroller && typeof row.scrollIntoView === "function") {
              row.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
          }
        } catch (_) {}
      };
      const out = () => {
        try {
          const row = app.element.querySelector(
            `tr[data-token-id="${token.id}"]`
          );
          if (row) row.classList.remove("row-hover");
        } catch (_) {}
      };
      token.on("pointerover", over);
      token.on("pointerout", out);
      VisionerTokenManager._canvasHoverHandlers.set(token.id, { over, out });
    });
  }

  /**
   * Detach previously attached canvas hover handlers
   */
  static _detachCanvasHoverHandlers() {
    if (!canvas?.tokens) return;
    VisionerTokenManager._canvasHoverHandlers.forEach((handlers, id) => {
      const token = canvas.tokens.get(id);
      if (token) {
        try {
          token.off("pointerover", handlers.over);
        } catch (_) {}
        try {
          token.off("pointerout", handlers.out);
        } catch (_) {}
      }
    });
    VisionerTokenManager._canvasHoverHandlers.clear();
  }

  /**
   * Selection-based row highlight handlers
   */
  static _attachSelectionHandlers() {
    if (VisionerTokenManager._selectionHookId) return;
    VisionerTokenManager._selectionHookId = Hooks.on("controlToken", () => {
      VisionerTokenManager._applySelectionHighlight();
    });
  }

  static _detachSelectionHandlers() {
    if (VisionerTokenManager._selectionHookId) {
      try {
        Hooks.off("controlToken", VisionerTokenManager._selectionHookId);
      } catch (_) {}
      VisionerTokenManager._selectionHookId = null;
    }
  }

  static _applySelectionHighlight() {
    const app = VisionerTokenManager.currentInstance;
    if (!app || !app.element) return;
    try {
      // Clear existing
      app.element
        .querySelectorAll("tr.token-row.row-hover")
        ?.forEach((el) => el.classList.remove("row-hover"));
      const selected = Array.from(canvas?.tokens?.controlled ?? []);
      if (!selected.length) return;
      const activeTab = app.activeTab || "visibility";
      const sectionSelector =
        activeTab === "cover" ? ".cover-section" : ".visibility-section";
      let firstRow = null;
      for (const tok of selected) {
        const rows = app.element.querySelectorAll(
          `tr[data-token-id="${tok.id}"]`
        );
        if (rows && rows.length) {
          rows.forEach((r) => r.classList.add("row-hover"));
          if (!firstRow) {
            // Prefer a row within the visible active section
            for (const r of rows) {
              const section = r.closest(sectionSelector);
              const visible =
                section && getComputedStyle(section).display !== "none";
              if (section && visible) {
                firstRow = r;
                break;
              }
            }
            // Fallback to the first match if none in active section
            if (!firstRow) firstRow = rows[0];
          }
        }
      }
      if (firstRow) {
        const scroller =
          app.element.querySelector(".tables-content") || app.element;
        // Defer to next frame to ensure layout after render/tab switch
        requestAnimationFrame(() => {
          try {
            // Try native scrollIntoView first
            if (typeof firstRow.scrollIntoView === "function") {
              firstRow.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
            // Also explicitly scroll the container to the row as a robust fallback
            const computeOffsetTop = (child, ancestor) => {
              let top = 0,
                el = child;
              while (el && el !== ancestor) {
                top += el.offsetTop;
                el = el.offsetParent;
              }
              return top;
            };
            const top = computeOffsetTop(firstRow, scroller);
            const targetTop = Math.max(0, top - 32); // small padding
            if (typeof scroller.scrollTo === "function") {
              scroller.scrollTo({ top: targetTop, behavior: "smooth" });
            } else {
              scroller.scrollTop = targetTop;
            }
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

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
  addIconClickHandlers() {
    const element = this.element;
    if (!element) return;

    // Find all state icon buttons
    const stateIcons = element.querySelectorAll(".state-icon");

    stateIcons.forEach((icon) => {
      icon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const targetId = icon.dataset.target;
        const newState = icon.dataset.state;

        if (!targetId || !newState) return;

        // Find the parent icon selection container
        const iconSelection = icon.closest(".icon-selection");
        if (!iconSelection) return;

        // Remove selected class from all icons in this selection
        const allIcons = iconSelection.querySelectorAll(".state-icon");
        allIcons.forEach((i) => i.classList.remove("selected"));

        // Add selected class to clicked icon
        icon.classList.add("selected");

        // Update the hidden input value
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          hiddenInput.value = newState;
        }
      });
    });
  }

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
    // Remove existing border if any
    this.removeTokenBorder(token);

    // Create a border graphic
    const border = new PIXI.Graphics();
    const padding = 4;

    // Different styles for subtle vs strong highlighting
    const borderColor = strong ? 0xffd700 : 0xffa500; // Gold vs Orange
    const borderWidth = strong ? 3 : 2;
    const alpha = strong ? 0.9 : 0.7;

    // Get token dimensions
    const tokenWidth = token.document.width * canvas.grid.size;
    const tokenHeight = token.document.height * canvas.grid.size;

    // Draw a rounded rectangle border centered on the token
    border.lineStyle(borderWidth, borderColor, alpha);
    border.drawRoundedRect(
      -tokenWidth / 2 - padding,
      -tokenHeight / 2 - padding,
      tokenWidth + padding * 2,
      tokenHeight + padding * 2,
      8 // Corner radius
    );

    // Position the border at the token's center
    border.x = token.document.x + tokenWidth / 2;
    border.y = token.document.y + tokenHeight / 2;

    // Add to the tokens layer so it appears correctly
    canvas.tokens.addChild(border);

    // Store reference for cleanup
    token._highlightBorder = border;
  }

  /**
   * Remove the border highlight from a token
   */
  removeTokenBorder(token) {
    if (token._highlightBorder) {
      // Remove from canvas
      if (token._highlightBorder.parent) {
        token._highlightBorder.parent.removeChild(token._highlightBorder);
      }

      // Destroy the graphics object
      token._highlightBorder.destroy();
      delete token._highlightBorder;
    }
  }
}
