/**
 * Central registration that composes small hook modules.
 */

import { MODULE_ID } from '../constants.js';
import { onHighlightObjects } from '../services/hover-tooltips.js';
import { registerChatHooks } from './chat.js';
import { registerCombatHooks } from './combat.js';
import { onCanvasReady, onReady } from './lifecycle.js';
import { registerTokenHooks } from './token-events.js';
import { registerUIHooks } from './ui.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';

export function registerHooks() {
  Hooks.on('ready', onReady);
  Hooks.on('canvasReady', onCanvasReady);

  registerChatHooks();

  Hooks.on('highlightObjects', onHighlightObjects);

  // Token lifecycle
  registerTokenHooks();

  // UI hues
  registerUIHooks();
  registerCombatHooks();
  AutoCoverHooks.registerHooks();

  // Wall lifecycle: refresh indicators and see-through state when walls change
  Hooks.on('createWall', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('updateWall', async (doc, changes) => {
    try {
      // If Hidden Wall flag toggled on, default all observers to Hidden for that wall
      const hiddenChanged = changes?.flags?.[MODULE_ID]?.hiddenWall;
      if (hiddenChanged !== undefined) {
        if (hiddenChanged) {
          try {
            const tokens = canvas.tokens?.placeables || [];
            const updates = [];
            const { getConnectedWallDocsBySourceId } = await import(
              '../services/connected-walls.js'
            );
            const connected = getConnectedWallDocsBySourceId(doc.id) || [];
            const wallIds = [doc.id, ...connected.map((d) => d.id)];
            for (const t of tokens) {
              const current = t.document.getFlag?.(MODULE_ID, 'walls') || {};
              const next = { ...current };
              let changedAny = false;
              for (const wid of wallIds) {
                if (next[wid] !== 'hidden') {
                  next[wid] = 'hidden';
                  changedAny = true;
                }
              }
              if (changedAny) {
                const patch = { _id: t.document.id };
                patch[`flags.${MODULE_ID}.walls`] = next;
                updates.push(patch);
              }
            }
            if (updates.length) {
              // Only GMs can update token documents
              if (game.user.isGM) {
                await canvas.scene?.updateEmbeddedDocuments?.('Token', updates, { diff: false });
              }
            }
          } catch (_) {}
          // Mirror hidden flag to connected walls
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, true);
          } catch (_) {}
        } else {
          // If unhidden, remove entries for that wall from tokens
          try {
            const tokens = canvas.tokens?.placeables || [];
            const updates = [];
            const { getConnectedWallDocsBySourceId } = await import(
              '../services/connected-walls.js'
            );
            const connected = getConnectedWallDocsBySourceId(doc.id) || [];
            const wallIds = [doc.id, ...connected.map((d) => d.id)];
            for (const t of tokens) {
              const current = t.document.getFlag?.(MODULE_ID, 'walls') || {};
              let changedAny = false;
              const next = { ...current };
              for (const wid of wallIds) {
                if (next[wid]) {
                  delete next[wid];
                  changedAny = true;
                }
              }
              if (changedAny) {
                const patch = { _id: t.document.id };
                patch[`flags.${MODULE_ID}.walls`] = next;
                updates.push(patch);
              }
            }
            if (updates.length) {
              // Only GMs can update token documents
              if (game.user.isGM) {
                await canvas.scene?.updateEmbeddedDocuments?.('Token', updates, { diff: false });
              }
            }
          } catch (_) {}
          // Mirror hidden flag to connected walls (set hidden=false)
          try {
            const { mirrorHiddenFlagToConnected } = await import('../services/connected-walls.js');
            await mirrorHiddenFlagToConnected(doc, false);
          } catch (_) {}
        }
      }
    } catch (_) {}
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('deleteWall', async (wallDocument) => {
    try {
      // Clean up any lingering visual indicators for the deleted wall
      const { cleanupDeletedWallVisuals } = await import('../services/visual-effects.js');
      await cleanupDeletedWallVisuals(wallDocument);

      // Update wall visuals for remaining walls
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  // Refresh indicators on selection changes so only selected player tokens reveal observed walls
  Hooks.on('controlToken', async (_token, _controlled) => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('updateToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('createToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('deleteToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
  Hooks.on('refreshToken', async () => {
    try {
      const { updateWallVisuals } = await import('../services/visual-effects.js');
      const id = canvas.tokens.controlled?.[0]?.id || null;
      await updateWallVisuals(id);
    } catch (_) {}
  });
}
