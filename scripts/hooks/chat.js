/**
 * Chat-related hooks
 */

import { ChatAutomationService } from '../chat/automation-service.js';

export function registerChatHooks() {
  // Foundry v13+: use renderChatMessageHTML (HTMLElement instead of jQuery)
  Hooks.on('renderChatMessageHTML', (message, element, ...rest) => {
    try {
      // Adapt to our processor which expects a jQuery-like object
      const jq = typeof window.$ === 'function' ? window.$(element) : element;
      ChatAutomationService.onRenderChatMessage(message, jq, ...rest);
    } catch (e) {
      console.error('[pf2e-visioner] renderChatMessageHTML handler failed', e);
    }
  });
}
