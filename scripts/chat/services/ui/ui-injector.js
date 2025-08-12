import { processedMessages } from "../data/message-cache.js";

export async function injectAutomationUI(message, html, actionData) {
  try {
    if (actionData.actionType === "seek" && game.user.isGM) {
      const pending = message?.flags?.["pf2e-visioner"]?.seekTemplate;
      if (pending && pending.hasTargets === false) {
        processedMessages.add(message.id);
        return;
      }
    }
    const { shouldInjectPanel } = await import("../panel-visibility.js");
    if (!shouldInjectPanel(message, actionData)) {
      processedMessages.add(message.id);
      return;
    }
    const { buildAutomationPanel } = await import("../../ui/panel-builder.js");
    const panelHtml = buildAutomationPanel(actionData, message);
    const panel = $(panelHtml);
    const messageContent = html.find(".message-content");
    if (messageContent.length === 0) return;
    messageContent.after(panel);
    const { bindAutomationEvents } = await import("../../ui/event-binder.js");
    bindAutomationEvents(panel, message, actionData);
    processedMessages.add(message.id);
  } catch (error) {
    const { log } = await import("../notifications.js");
    log.error("Error injecting automation UI:", error);
  }
}




