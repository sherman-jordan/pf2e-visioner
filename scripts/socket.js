import { MODULE_ID } from "./constants.js";
import { showNotification } from "./utils.js";

// Avoid name collision with Foundry/socket.io global `socket`
let visionerSocket = null;

const REFRESH_CHANNEL = "RefreshPerception";
const POINT_OUT_CHANNEL = "PointOut";
const SEEK_TEMPLATE_CHANNEL = "SeekTemplate";
const POINTOUT_REQUEST_CHANNEL = "PointOutRequest";

export function registerSocket() {
  if (typeof socketlib === "undefined") {
    showNotification(
      "PF2E_VISIONER.NOTIFICATIONS.NO_SOCKETLIB_INSTALLED",
      "warn",
    );
    return;
  }
  visionerSocket = socketlib.registerModule(MODULE_ID);
  visionerSocket.register(REFRESH_CHANNEL, refreshLocalPerception);
  visionerSocket.register(POINT_OUT_CHANNEL, pointOutHandler);
  visionerSocket.register(SEEK_TEMPLATE_CHANNEL, seekTemplateHandler);
  visionerSocket.register(POINTOUT_REQUEST_CHANNEL, pointOutRequestHandler);
}

/*
 * Refresh perception on the local canvas
 */
export function refreshLocalPerception() {
  canvas.perception.update({
    refreshLighting: true,
    refreshVision: true,
    refreshSounds: true,
    refreshOcclusion: true,
  });
}

/*
 * Forces a refresh on all clients including this one
 * (will call refreshLocalPerception on local client)
 */
export function refreshEveryonesPerception() {
  if (visionerSocket) visionerSocket.executeForEveryone(REFRESH_CHANNEL);
}

/*
 * Send a request for Point Out resolution to the GM
 */
export function requestGMHandlePointOut(...args) {
  if (visionerSocket) visionerSocket.executeAsGM(POINT_OUT_CHANNEL, ...args);
}

/*
 * Runs on GM machine with data sent from client
 */
function pointOutHandler(...args) {
  //do what you want to do
}

/**
 * Ask the GM to open Point Out results for a player-initiated action
 * @param {string} pointerTokenId
 * @param {string} messageId
 */
export function requestGMOpenPointOut(pointerTokenId, targetTokenId, messageId) {
  if (!visionerSocket) return;
  try {
    console.log(`[${MODULE_ID}] requestGMOpenPointOut`, { pointerTokenId, targetTokenId, messageId, userId: game.userId });
  } catch (_) {}
  visionerSocket.executeAsGM(POINTOUT_REQUEST_CHANNEL, { pointerTokenId, targetTokenId, messageId, userId: game.userId });
}

async function pointOutRequestHandler({ pointerTokenId, targetTokenId, messageId, userId }) {
  try {
    if (!game.user.isGM) return;
    console.log(`[${MODULE_ID}] pointOutRequestHandler`, { pointerTokenId, targetTokenId, messageId, fromUser: userId });
    const pointerToken = canvas.tokens.get(pointerTokenId);
    if (!pointerToken) return;
    // Resolve target token: prefer provided tokenId; otherwise, fall back to message PF2e flags
    let targetToken = targetTokenId ? canvas.tokens.get(targetTokenId) : null;
    if (!targetToken && messageId) {
      const msg = game.messages.get(messageId);
      const flg = msg?.flags?.pf2e?.target;
      if (flg?.token) targetToken = canvas.tokens.get(flg.token);
    }

    // Ping the target token's location so the table sees what was pointed out
    try {
      if (targetToken) {
        const point = targetToken.center || { x: targetToken.x + (targetToken.w ?? (targetToken.width * canvas.grid.size)) / 2, y: targetToken.y + (targetToken.h ?? (targetToken.height * canvas.grid.size)) / 2 };
        const playerUser = game.users?.get?.(userId);
        if (typeof canvas.ping === 'function') {
          canvas.ping(point, { color: playerUser?.color, name: playerUser?.name || 'Point Out' });
        } else if (canvas?.pings?.create) {
          canvas.pings.create({ ...point, user: playerUser });
        }
      }
    } catch (pingErr) {
      console.warn(`[${MODULE_ID}] Failed to ping pointed-out target:`, pingErr);
    }

    // Determine whether there are any allies that benefit from Point Out
    let hasTargets = false;
    try {
      if (targetToken) {
        const { discoverPointOutAllies } = await import('./chat/point-out-logic.js');
        const allies = discoverPointOutAllies(pointerToken, targetToken) || [];
        hasTargets = allies.length > 0;
      }
    } catch (calcErr) {
      console.warn(`[${MODULE_ID}] Failed to evaluate allies for player Point Out:`, calcErr);
    }

    // Persist pending Point Out info so GM can decide when to open results
    const msg = game.messages.get(messageId);
    if (msg) {
      // Best-effort: annotate PF2e target flags so downstream code has a standard fallback
      try {
        const currentPF2eTarget = msg?.flags?.pf2e?.target || {};
        const updatedPF2eTarget = { ...currentPF2eTarget };
        if (targetToken) {
          updatedPF2eTarget.token = targetToken.id;
          if (targetToken.actor?.id) updatedPF2eTarget.actor = targetToken.actor.id;
        }
        await msg.update({ ['flags.pf2e.target']: updatedPF2eTarget });
      } catch (e) {
        console.warn(`[${MODULE_ID}] Unable to update PF2e target flags for Point Out:`, e);
      }
      await msg.update({
        [`flags.${MODULE_ID}.pointOut`]: {
          pointerTokenId,
          targetTokenId: targetToken?.id ?? null,
          hasTargets,
          fromUserId: userId
        }
      });
      try { await msg.render(true); } catch (_) {}
    }

    // Update GM panel actions if already rendered
    try {
      const panel = document.querySelector(`.pf2e-visioner-automation-panel[data-message-id="${messageId}"]`);
      if (panel) {
        const actions = panel.querySelector('.automation-actions');
        if (actions) {
          if (hasTargets) {
            actions.innerHTML = `
              <button type="button" 
                      class="visioner-btn visioner-btn-point-out" 
                      data-action="open-point-out-results"
                      title="Preview and apply Point Out visibility changes">
                <i class="fas fa-hand-point-right"></i> Open Point Out Results
              </button>
            `;
          } else {
            try { panel.remove(); } catch (_) { actions.innerHTML = ''; }
          }
        }
      }
    } catch (domError) {
      console.warn(`[${MODULE_ID}] Failed to update GM panel actions for pending Point Out:`, domError);
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to handle GM Point Out preview from player action:`, e);
  }
}

/**
 * Ask the GM to open Seek preview with a provided template center/radius for an actor token
 * @param {string} actorTokenId
 * @param {{x:number,y:number}} center
 * @param {number} radiusFeet
 * @param {string} messageId
 */
export function requestGMOpenSeekWithTemplate(actorTokenId, center, radiusFeet, messageId, rollTotal, dieResult) {
  if (!visionerSocket) return;
  try {
    console.log(`[${MODULE_ID}] requestGMOpenSeekWithTemplate`, { actorTokenId, center, radiusFeet, messageId, rollTotal, dieResult, userId: game.userId });
  } catch (_) {}
  visionerSocket.executeAsGM(SEEK_TEMPLATE_CHANNEL, { actorTokenId, center, radiusFeet, messageId, rollTotal, dieResult, userId: game.userId });
}

async function seekTemplateHandler({ actorTokenId, center, radiusFeet, messageId, rollTotal, dieResult, userId }) {
  try {
    if (!game.user.isGM) return; // Only GM handles
    console.log(`[${MODULE_ID}] seekTemplateHandler received`, { actorTokenId, center, radiusFeet, messageId, rollTotal, dieResult, fromUser: userId });
    const actorToken = canvas.tokens.get(actorTokenId);
    if (!actorToken) return;

    // Determine whether there are any valid targets in the provided template area
    let hasTargets = false;
    try {
      const { discoverSeekTargets } = await import('./chat/seek-logic.js');
      const targets = discoverSeekTargets(actorToken, false, radiusFeet, center) || [];
      hasTargets = targets.length > 0;
    } catch (calcErr) {
      console.warn(`[${MODULE_ID}] Failed to evaluate targets for player-provided Seek template:`, calcErr);
    }

    // Persist the pending template data on the chat message flags so the GM can decide when to open results
    const msg = game.messages.get(messageId);
    if (msg) {
      await msg.update({
        [`flags.${MODULE_ID}.seekTemplate`]: {
          center,
          radiusFeet,
          actorTokenId,
          rollTotal: (typeof rollTotal === 'number') ? rollTotal : null,
          dieResult: (typeof dieResult === 'number') ? dieResult : null,
          fromUserId: userId,
          hasTargets
        }
      });
      // Re-render the chat message so the injected panel can be updated/removed appropriately
      try { await msg.render(true); } catch (_) {}
    }

    // If the automation panel is already injected for this message on the GM, swap its action to "Open Seek Results"
    try {
      const panel = document.querySelector(`.pf2e-visioner-automation-panel[data-message-id="${messageId}"]`);
      if (panel) {
        const actions = panel.querySelector('.automation-actions');
        if (actions) {
          if (hasTargets) {
            const label = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS');
            const tooltip = game.i18n.localize('PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP');
            actions.innerHTML = `
              <button type="button" 
                      class="visioner-btn visioner-btn-seek" 
                      data-action="open-seek-results"
                      title="${tooltip}">
                <i class="fas fa-search"></i> ${label}
              </button>
            `;
          } else {
            // No targets: remove the entire panel to avoid showing Setup Seek Template
            try { panel.remove(); } catch (_) { actions.innerHTML = ''; }
          }
        }
      }
    } catch (domError) {
      console.warn(`[${MODULE_ID}] Failed to update GM panel actions for pending Seek template:`, domError);
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to handle GM Seek template from player:`, e);
  }
}
