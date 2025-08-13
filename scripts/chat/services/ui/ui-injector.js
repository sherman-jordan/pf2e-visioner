import { processedMessages } from "../data/message-cache.js";

export async function injectAutomationUI(message, html, actionData) {
  try {
    const { shouldInjectPanel } = await import("../infra/panel-visibility.js");
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
    try {
      // Ensure the panel reflects current user context so players keep their template controls
      panel.attr("data-user-id", game.userId);
    } catch (_) {}
    const { bindAutomationEvents } = await import("../../ui/event-binder.js");
    bindAutomationEvents(panel, message, actionData);
    processedMessages.add(message.id);
  } catch (error) {
    const { log } = await import("../infra/notifications.js");
    log.error("Error injecting automation UI:", error);
  }
}




