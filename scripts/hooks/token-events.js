/**
 * Token-related hooks: create/delete, highlight, HUD buttons
 */

import { cleanupHoverTooltips, initializeHoverTooltips } from "../services/hover-tooltips.js";
import { updateTokenVisuals } from "../services/visual-effects.js";

export async function onTokenCreated(scene, tokenDoc) {
  try {
    const { restoreDeletedTokenMaps } = await import("../services/scene-cleanup.js");
    const restored = await restoreDeletedTokenMaps(tokenDoc);
    // Removed bulk rebuild; visuals will refresh and ephemerals are updated by batch routines
  } catch (_) {}
  setTimeout(async () => {
    await updateTokenVisuals();
    if (game.settings.get("pf2e-visioner", "enableHoverTooltips")) {
      cleanupHoverTooltips();
      initializeHoverTooltips();
    }
  }, 100);
}

export async function onTokenDeleted(...args) {
  try {
    let tokenDoc = null;
    for (const a of args) {
      if (a && typeof a === "object") {
        if (a?.actor && (a?.parent || a?.scene || a?.documentName === "Token")) {
          tokenDoc = a;
          break;
        }
      }
    }
    if (!tokenDoc) {
      if (args[0]?.tokens && args[1]?.actor) tokenDoc = args[1];
    }
    if (!tokenDoc?.id) return;
    const { cleanupDeletedToken } = await import("../services/scene-cleanup.js");
    const { cleanupDeletedTokenEffects } = await import("../visibility/ephemeral.js");
    const { cleanupDeletedTokenCoverEffects } = await import("../cover/ephemeral.js");
    if (tokenDoc) {
      try { await cleanupDeletedToken(tokenDoc); } catch (e) { console.warn("PF2E Visioner: map cleanup failed", e); }
      await Promise.all([
        cleanupDeletedTokenEffects(tokenDoc),
        cleanupDeletedTokenCoverEffects(tokenDoc),
      ]);
    }
    setTimeout(async () => {
      try {
        await updateTokenVisuals();
      } catch (e) {
        console.warn("PF2E Visioner: post-delete rebuild failed", e);
      }
      if (game.settings.get("pf2e-visioner", "enableHoverTooltips")) {
        cleanupHoverTooltips();
        initializeHoverTooltips();
      }
    }, 100);
  } catch (error) {
    console.error("PF2E Visioner: Error cleaning up deleted token:", error);
  }
}


