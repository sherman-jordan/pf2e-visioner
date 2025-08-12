
/**
 * Enhanced chat message processor for Seek action automation
 * Uses modern FoundryVTT patterns and intelligent detection
 * @param {ChatMessage} message - The chat message document
 * @param {jQuery} html - The rendered HTML element
 */
export function onRenderChatMessage(message, html) {
  import("./services/entry-service.js").then(({ handleRenderChatMessage }) =>
    handleRenderChatMessage(message, html)
  );
}

export { removeSeekTemplate, setupSeekTemplate } from "./services/index.js";

