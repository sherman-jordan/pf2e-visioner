/**
 * ChatAutomationService
 * Thin orchestration layer for chat automation. Centralizes the chat entrypoint
 * so we can evolve implementation behind a stable API.
 */

class ChatAutomationServiceImpl {
  /**
   * Entry point used by chat render hooks.
   * Delegates to the current processor implementation.
   * @param {ChatMessage} message
   * @param {HTMLElement|jQuery} element
   */
  onRenderChatMessage(message, element) {
    // Lazy import to avoid circular dependencies during Foundry startup
    return import('./chat-processor.js').then((m) => m.onRenderChatMessage(message, element));
  }
}

export const ChatAutomationService = new ChatAutomationServiceImpl();
