/**
 * Core Token Manager actions: business logic for applying visibility and cover changes.
 * Split out from actions.js to keep files small and focused.
 */

import { MODULE_ID } from "../../../constants.js";
import { refreshEveryonesPerception } from "../../../socket.js";
import {
    getCoverMap,
    getVisibilityMap,
    setCoverMap,
    setVisibilityMap,
} from "../../../utils.js";

/**
 * ApplicationV2 form handler
 */
export async function formHandler(event, form, formData) {
  const app = this;
  const visibilityChanges = {};
  const coverChanges = {};

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

  if (app.mode === "observer") {
    if (Object.keys(visibilityChanges).length > 0) {
      const currentMap = getVisibilityMap(app.observer) || {};
      const merged = { ...currentMap };
      for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
        if (merged[tokenId] !== newState) merged[tokenId] = newState;
      }
      await setVisibilityMap(app.observer, merged);

      try {
        const { batchUpdateVisibilityEffects } = await import(
          "../../../off-guard-ephemeral.js"
        );
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(visibilityChanges)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (!targetToken) continue;
          const currentState = currentMap?.[tokenId];
          if (currentState === newState) continue;
          targetUpdates.push({ target: targetToken, state: newState });
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

    if (Object.keys(coverChanges).length > 0) {
      const currentCover = getCoverMap(app.observer) || {};
      const mergedCover = { ...currentCover };
      for (const [tokenId, newState] of Object.entries(coverChanges)) {
        if (mergedCover[tokenId] !== newState) mergedCover[tokenId] = newState;
      }
      await setCoverMap(app.observer, mergedCover);

      try {
        const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import(
          "../../../cover-ephemeral.js"
        );
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(coverChanges)) {
          const prev = currentCover?.[tokenId];
          if (prev === newState) continue;
          const targetToken = canvas.tokens.get(tokenId);
          if (!targetToken) continue;
          targetUpdates.push({ target: targetToken, state: newState });
        }
        if (targetUpdates.length > 0) {
          await batchUpdateCoverEffects(app.observer, targetUpdates);
          try {
            for (const { target } of targetUpdates) {
              await reconcileCoverEffectsForTarget(target);
            }
          } catch (_) {}
        }
      } catch (error) {
        console.warn("Token Manager: batch cover update failed", error);
      }
    }
  } else {
    const perObserverChanges = new Map();
    for (const [observerTokenId, newVisibilityState] of Object.entries(
      visibilityChanges,
    )) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (!observerToken) continue;
      try {
        if (["loot", "vehicle", "party"].includes(observerToken?.actor?.type)) continue;
      } catch (_) {}
      const current = getVisibilityMap(observerToken) || {};
      const currentState = current[app.observer.document.id];
      if (currentState === newVisibilityState) continue;
      if (!perObserverChanges.has(observerTokenId))
        perObserverChanges.set(observerTokenId, { token: observerToken, map: current });
      perObserverChanges.get(observerTokenId).map[app.observer.document.id] = newVisibilityState;
    }
    for (const { token: observerToken, map } of perObserverChanges.values()) {
      await setVisibilityMap(observerToken, map);
    }
    try {
      const { batchUpdateVisibilityEffects } = await import(
        "../../../off-guard-ephemeral.js"
      );
      const observerUpdates = [];
      for (const [observerTokenId, newVisibilityState] of Object.entries(
        visibilityChanges,
      )) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        try {
          if (["loot", "vehicle", "party"].includes(observerToken?.actor?.type)) continue;
        } catch (_) {}
        observerUpdates.push({ target: app.observer, state: newVisibilityState, observer: observerToken });
      }
      if (observerUpdates.length > 0) {
        const updatesByObserver = new Map();
        for (const update of observerUpdates) {
          if (!updatesByObserver.has(update.observer.id)) {
            updatesByObserver.set(update.observer.id, { observer: update.observer, updates: [] });
          }
          updatesByObserver.get(update.observer.id).updates.push({ target: update.target, state: update.state });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          await batchUpdateVisibilityEffects(observer, updates, { direction: "observer_to_target" });
        }
      }
    } catch (error) {
      console.warn("Token Manager: batch visibility update failed in target mode", error);
    }

    const perObserverCover = new Map();
    for (const [observerTokenId, newCoverState] of Object.entries(coverChanges)) {
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
      if (currentState === newCoverState && newCoverState !== "none") continue;
      if (!perObserverCover.has(observerTokenId))
        perObserverCover.set(observerTokenId, { token: observerToken, map: current });
      perObserverCover.get(observerTokenId).map[app.observer.document.id] = newCoverState;
    }
    for (const { token: observerToken, map } of perObserverCover.values()) {
      await setCoverMap(observerToken, map);
    }
    try {
      const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import("../../../cover-ephemeral.js");
      const observerUpdates = [];
      for (const [observerTokenId, newCoverState] of Object.entries(coverChanges)) {
        const observerToken = canvas.tokens.get(observerTokenId);
        if (!observerToken) continue;
        try {
          if (["loot", "vehicle", "party"].includes(observerToken?.actor?.type)) continue;
        } catch (_) {}
        observerUpdates.push({ target: app.observer, state: newCoverState, observer: observerToken });
      }
      if (observerUpdates.length > 0) {
        const updatesByObserver = new Map();
        for (const update of observerUpdates) {
          if (!updatesByObserver.has(update.observer.id)) {
            updatesByObserver.set(update.observer.id, { observer: update.observer, updates: [] });
          }
          updatesByObserver.get(update.observer.id).updates.push({ target: update.target, state: update.state });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          await batchUpdateCoverEffects(observer, updates);
        }
        await reconcileCoverEffectsForTarget(app.observer);
      }
    } catch (error) {
      console.warn("Token Manager: batch cover update failed in target mode", error);
    }
  }

  (async () => {
    try {
      refreshEveryonesPerception();
      const { updateTokenVisuals } = await import("../../../effects-coordinator.js");
      await updateTokenVisuals();
    } catch (_) {}
  })();
  return app.render();
}

export async function applyCurrent(event, button) {
  const app = this;
  const { runTasksWithProgress } = await import("../../../progress.js");

  try {
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    const wallInputs = app.element.querySelectorAll('input[name^="walls."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = { visibility: {}, cover: {}, walls: {} };
    visibilityInputs.forEach((input) => {
      const tokenId = input.name.replace("visibility.", "");
      app._savedModeData[app.mode].visibility[tokenId] = input.value;
    });
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

  try {
    app.close();
  } catch (error) {
    console.warn("Token Manager: Error closing dialog:", error);
  }

  runTasksWithProgress(`${MODULE_ID}: Preparing Changes`, [async () => await new Promise((r) => setTimeout(r, 100))]);

  try {
    const { batchUpdateVisibilityEffects } = await import("../../../off-guard-ephemeral.js");
    const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import("../../../cover-ephemeral.js");
    const { updateWallVisuals } = await import("../../../visual-effects.js");
    const isVisibility = app.activeTab === "visibility";
    const isCover = app.activeTab === "cover";

    const allOperations = [];
    const visualUpdatePairs = [];

    if (isVisibility) {
      const obsVis = app._savedModeData.observer?.visibility || {};
      if (Object.keys(obsVis).length > 0) {
        const currentMap = getVisibilityMap(app.observer) || {};
        await setVisibilityMap(app.observer, { ...currentMap, ...obsVis });
        const targetUpdates = [];
        for (const [tokenId, newState] of Object.entries(obsVis)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (targetToken) targetUpdates.push({ target: targetToken, state: newState });
        }
        if (targetUpdates.length > 0) {
          allOperations.push(async () => {
            await batchUpdateVisibilityEffects(app.observer, targetUpdates, { direction: "observer_to_target" });
          });
          visualUpdatePairs.push(
            ...targetUpdates.map((u) => ({ observerId: app.observer.id, targetId: u.target.id, visibility: u.state })),
          );
        }
      }

      const tgtVis = app._savedModeData.target?.visibility || {};
      if (Object.keys(tgtVis).length > 0) {
        const updatesByObserver = new Map();
        for (const [observerTokenId, newState] of Object.entries(tgtVis)) {
          if (typeof newState !== "string" || !["observed", "concealed", "hidden", "undetected"].includes(newState)) continue;
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          try { if (["loot","vehicle","party"].includes(observerToken?.actor?.type)) continue; } catch (_) {}
          const observerVisibilityData = getVisibilityMap(observerToken) || {};
          await setVisibilityMap(observerToken, { ...observerVisibilityData, [app.observer.document.id]: newState });
          if (!updatesByObserver.has(observerTokenId)) updatesByObserver.set(observerTokenId, { observer: observerToken, updates: [] });
          updatesByObserver.get(observerTokenId).updates.push({ target: app.observer, state: newState });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          allOperations.push(async () => {
            await batchUpdateVisibilityEffects(observer, updates, { direction: "observer_to_target" });
          });
          for (const update of updates) {
            visualUpdatePairs.push({ observerId: observer.id, targetId: app.observer.id, visibility: update.state });
          }
        }
      }
    }

    if (isCover) {
      const obsCov = app._savedModeData.observer?.cover || {};
      if (Object.keys(obsCov).length > 0) {
        const currentCover = getCoverMap(app.observer) || {};
        await setCoverMap(app.observer, { ...currentCover, ...obsCov });
        const targetUpdates = [];
        for (const [tokenId, state] of Object.entries(obsCov)) {
          const targetToken = canvas.tokens.get(tokenId);
          if (targetToken) targetUpdates.push({ target: targetToken, state });
        }
        if (targetUpdates.length > 0) {
          allOperations.push(async () => {
            await batchUpdateCoverEffects(app.observer, targetUpdates);
          });
          allOperations.push(async () => {
            for (const { target } of targetUpdates) {
              try { await reconcileCoverEffectsForTarget(target); } catch (_) {}
            }
          });
          visualUpdatePairs.push(
            ...targetUpdates.map((u) => ({ observerId: app.observer.id, targetId: u.target.id, cover: u.state })),
          );
        }
      }

      const tgtCov = app._savedModeData.target?.cover || {};
      if (Object.keys(tgtCov).length > 0) {
        const updatesByObserver = new Map();
        for (const [observerTokenId, newState] of Object.entries(tgtCov)) {
          const observerToken = canvas.tokens.get(observerTokenId);
          if (!observerToken) continue;
          const observerCoverData = getCoverMap(observerToken) || {};
          await setCoverMap(observerToken, { ...observerCoverData, [app.observer.document.id]: newState });
          if (!updatesByObserver.has(observerTokenId)) updatesByObserver.set(observerTokenId, { observer: observerToken, updates: [] });
          updatesByObserver.get(observerTokenId).updates.push({ target: app.observer, state: newState });
        }
        for (const { observer, updates } of updatesByObserver.values()) {
          try { const t = observer.actor?.type; if (t === "loot" || t === "vehicle" || t === "party") continue; } catch (_) {}
          allOperations.push(async () => {
            const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import("../../../cover-ephemeral.js");
            await batchUpdateCoverEffects(observer, updates);
            for (const { target, state } of updates) {
              visualUpdatePairs.push({ observerId: observer.id, targetId: target.id, cover: state });
            }
            try { await reconcileCoverEffectsForTarget(app.observer); } catch (_) {}
          });
        }
      }
    }

    if (allOperations.length > 0) {
      await runTasksWithProgress(`${MODULE_ID}: Applying Changes`, allOperations);
      if (visualUpdatePairs.length > 0) {
        (async () => {
          try {
            const { updateSpecificTokenPairs } = await import("../../../visual-effects.js");
            await updateSpecificTokenPairs(visualUpdatePairs);
          } catch (error) {
            console.warn("Token Manager: Error updating visuals:", error);
          }
        })();
      }
    }
  } catch (error) {
    console.error("Token Manager: Error applying current type for both modes:", error);
  }

  (async () => {
    try {
      refreshEveryonesPerception();
      canvas.perception.update({ refreshVision: true });
    } catch (error) {
      console.warn("Token Manager: Error refreshing perception:", error);
    }
  })();
}

export async function applyBoth(event, button) {
  const app = this;
  const { runTasksWithProgress } = await import("../../../progress.js");

  try {
    app.close();
  } catch (error) {
    console.warn("Token Manager: Error closing dialog:", error);
  }
  runTasksWithProgress(`${MODULE_ID}: Preparing Changes`, [async () => await new Promise((r) => setTimeout(r, 100))]);

  try {
    const visibilityInputs = app.element.querySelectorAll('input[name^="visibility."]');
    const coverInputs = app.element.querySelectorAll('input[name^="cover."]');
    if (!app._savedModeData) app._savedModeData = {};
    if (!app._savedModeData[app.mode]) app._savedModeData[app.mode] = { visibility: {}, cover: {} };
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

  try {
    const { batchUpdateVisibilityEffects } = await import("../../../off-guard-ephemeral.js");
    const { batchUpdateCoverEffects, reconcileCoverEffectsForTarget } = await import("../../../cover-ephemeral.js");
    const allOperations = [];
    const visualUpdatePairs = [];

    const observerVisUpdates = [];
    const observerCovUpdates = [];

    const vis = app._savedModeData.observer?.visibility || {};
    if (Object.keys(vis).length > 0) {
      const currentMap = getVisibilityMap(app.observer) || {};
      await setVisibilityMap(app.observer, { ...currentMap, ...vis });
      for (const [tokenId, newState] of Object.entries(vis)) {
        const targetToken = canvas.tokens.get(tokenId);
        if (targetToken) {
          observerVisUpdates.push({ target: targetToken, state: newState });
          visualUpdatePairs.push({ observerId: app.observer.id, targetId: targetToken.id, visibility: newState });
        }
      }
    }

    const cov = app._savedModeData.observer?.cover || {};
    if (Object.keys(cov).length > 0) {
      const currentCover = getCoverMap(app.observer) || {};
      await setCoverMap(app.observer, { ...currentCover, ...cov });
      for (const [tokenId, state] of Object.entries(cov)) {
        const targetToken = canvas.tokens.get(tokenId);
        if (targetToken) {
          observerCovUpdates.push({ target: targetToken, state });
          visualUpdatePairs.push({ observerId: app.observer.id, targetId: targetToken.id, cover: state });
        }
      }
    }

    const targetVisUpdates = new Map();
    const targetCovUpdates = new Map();

    const targetVis = app._savedModeData.target?.visibility || {};
    for (const [observerTokenId, newState] of Object.entries(targetVis)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (observerToken) {
        const observerVisibilityData = getVisibilityMap(observerToken) || {};
        await setVisibilityMap(observerToken, { ...observerVisibilityData, [app.observer.document.id]: newState });
        if (!targetVisUpdates.has(observerTokenId)) targetVisUpdates.set(observerTokenId, { observer: observerToken, updates: [] });
        targetVisUpdates.get(observerTokenId).updates.push({ target: app.observer, state: newState });
        visualUpdatePairs.push({ observerId: observerToken.id, targetId: app.observer.id, visibility: newState });
      }
    }

    const targetCov = app._savedModeData.target?.cover || {};
    for (const [observerTokenId, newState] of Object.entries(targetCov)) {
      const observerToken = canvas.tokens.get(observerTokenId);
      if (observerToken) {
        const observerCoverData = getCoverMap(observerToken) || {};
        await setCoverMap(observerToken, { ...observerCoverData, [app.observer.document.id]: newState });
        if (!targetCovUpdates.has(observerTokenId)) targetCovUpdates.set(observerTokenId, { observer: observerToken, updates: [] });
        targetCovUpdates.get(observerTokenId).updates.push({ target: app.observer, state: newState });
        visualUpdatePairs.push({ observerId: observerToken.id, targetId: app.observer.id, cover: newState });
      }
    }

    if (observerVisUpdates.length > 0) {
      allOperations.push(async () => {
        await batchUpdateVisibilityEffects(app.observer, observerVisUpdates, { direction: "observer_to_target" });
      });
    }
    if (observerCovUpdates.length > 0) {
      allOperations.push(async () => {
        await batchUpdateCoverEffects(app.observer, observerCovUpdates);
      });
    }
    for (const { observer, updates } of targetVisUpdates.values()) {
      allOperations.push(async () => {
        await batchUpdateVisibilityEffects(observer, updates, { direction: "observer_to_target" });
      });
    }
    for (const { observer, updates } of targetCovUpdates.values()) {
      allOperations.push(async () => {
        const { batchUpdateCoverEffects } = await import("../../../cover-ephemeral.js");
        await batchUpdateCoverEffects(observer, updates);
      });
    }

    // Reconcile all cover targets once after all updates
    if (observerCovUpdates.length > 0 || targetCovUpdates.size > 0) {
      allOperations.push(async () => {
        const { reconcileCoverEffectsForTarget } = await import("../../../cover-ephemeral.js");
        const reconcileTargets = new Set();
        
        // Add all targets from observer cover updates
        for (const { target } of observerCovUpdates) {
          if (target) reconcileTargets.add(target.id);
        }
        
        // Add the observer token (target of all target cover updates)
        reconcileTargets.add(app.observer.id);
        
        // Reconcile each unique target once
        for (const targetId of reconcileTargets) {
          const token = canvas.tokens.get(targetId);
          if (token) {
            try { await reconcileCoverEffectsForTarget(token); } catch (_) {}
          }
        }
      });
    }

    if (allOperations.length > 0) {
      await runTasksWithProgress(`${MODULE_ID}: Applying Changes`, allOperations);
      if (visualUpdatePairs.length > 0) {
        (async () => {
          try {
            const { updateSpecificTokenPairs } = await import("../../../visual-effects.js");
            await updateSpecificTokenPairs(visualUpdatePairs);
          } catch (error) {
            console.warn("Token Manager: Error updating visuals:", error);
          }
        })();
      }
    }
  } catch (error) {
    console.error("Token Manager: Error applying both types for both modes:", error);
  }

  (async () => {
    try {
      refreshEveryonesPerception();
      canvas.perception.update({ refreshVision: true });
    } catch (error) {
      console.warn("Token Manager: Error refreshing perception:", error);
    }
  })();
}

export async function resetAll(event, button) {
  const app = this;
  await setVisibilityMap(app.observer, {});
  await setCoverMap(app.observer, {});
  refreshEveryonesPerception();
  return app.render();
}


