import { extractActionData } from "./action-extractor.js";
import { processedMessages } from "./data/message-cache.js";

export async function handleRenderChatMessage(message, html) {
  const actionData = await extractActionData(message);
  if (!actionData) return;

  const hasPendingSeekTemplateForGM =
    actionData.actionType === "seek" &&
    game.user.isGM &&
    !!message.flags?.["pf2e-visioner"]?.seekTemplate;
  const hasPendingSeekTemplateForPlayerAuthor =
    actionData.actionType === "seek" &&
    !game.user.isGM &&
    message.author?.id === game.user.id &&
    !!message.flags?.["pf2e-visioner"]?.seekTemplate;
  const isPlayerPointOutAuthor =
    !game.user.isGM &&
    actionData.actionType === "point-out" &&
    message.author?.id === game.user.id;

  if (isPlayerPointOutAuthor) {
    try {
      let targetId = null;
      // Always prefer explicit PF2e target flag from the player's message; then their current target; then context
      try { targetId = message?.flags?.pf2e?.target?.token || null; } catch (_) {}
      if (!targetId && game.user.targets?.size) targetId = Array.from(game.user.targets)[0]?.id || null;
      if (!targetId) targetId = actionData.context?.target?.token || null;
      import("../../services/socket.js").then(({ requestGMOpenPointOut }) =>
        requestGMOpenPointOut(actionData.actor.id, targetId, actionData.messageId)
      );
    } catch (e) {
      try { console.warn("[PF2E Visioner] Failed to auto-forward Point Out to GM:", e); } catch (_) {}
    }
    processedMessages.add(message.id);
    return;
  }

  const hasPendingPointOutForGM =
    actionData.actionType === "point-out" &&
    game.user.isGM &&
    !!message.flags?.["pf2e-visioner"]?.pointOut;

  const isSeekTemplatePlayer =
    !game.user.isGM &&
    actionData.actionType === "seek" &&
    game.settings.get("pf2e-visioner", "seekUseTemplate") &&
    message.author?.id === game.user.id;
  if (!game.user.isGM && !isSeekTemplatePlayer) return;

  if (processedMessages.has(message.id)) {
    if (hasPendingSeekTemplateForGM || hasPendingPointOutForGM || hasPendingSeekTemplateForPlayerAuthor) {
      try { processedMessages.delete(message.id); } catch (_) {}
    } else {
      // Check if Visioner UI still exists in the DOM - if not, we need to re-inject it
      // This handles cases where message updates remove our injected panels
      const hasVisionerUI = html.find && html.find('.pf2e-visioner-automation-panel').length > 0;
      if (hasVisionerUI) {
        return; // UI still exists, no need to re-inject
      }
      // UI was removed by message update, allow re-injection
      try { processedMessages.delete(message.id); } catch (_) {}
    }
  }

  import("./ui/ui-injector.js").then(({ injectAutomationUI }) =>
    injectAutomationUI(message, html, actionData)
  );
}


