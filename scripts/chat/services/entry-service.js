import { extractActionData } from "./action-extractor.js";
import { processedMessages } from "./data/message-cache.js";

export function handleRenderChatMessage(message, html) {
  const actionData = extractActionData(message);
  if (!actionData) return;

  const hasPendingSeekTemplateForGM =
    actionData.actionType === "seek" &&
    game.user.isGM &&
    !!message.flags?.["pf2e-visioner"]?.seekTemplate;
  const isPlayerPointOutAuthor =
    !game.user.isGM &&
    actionData.actionType === "point-out" &&
    message.user?.id === game.user.id;

  if (isPlayerPointOutAuthor) {
    try {
      let targetId = null;
      if (game.user.targets?.size) targetId = Array.from(game.user.targets)[0]?.id || null;
      if (!targetId) targetId = actionData.context?.target?.token || null;
      if (!targetId) {
        const flg = message?.flags?.pf2e?.target;
        targetId = flg?.token || null;
      }
      import("../../socket.js").then(({ requestGMOpenPointOut }) =>
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
    message.user?.id === game.user.id;
  if (!game.user.isGM && !isSeekTemplatePlayer) return;

  if (processedMessages.has(message.id)) {
    if (hasPendingSeekTemplateForGM || hasPendingPointOutForGM) {
      try { processedMessages.delete(message.id); } catch (_) {}
    } else {
      return;
    }
  }

  import("./ui/ui-injector.js").then(({ injectAutomationUI }) =>
    injectAutomationUI(message, html, actionData)
  );
}


