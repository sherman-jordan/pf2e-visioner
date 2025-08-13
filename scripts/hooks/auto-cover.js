/**
 * Auto-cover hooks wrapper
 * Moves hook wiring out of auto-cover logic file for better structure.
 */

import {
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onStrikeClickCapture,
  onUpdateToken,
} from "../cover/auto-cover.js";

export function registerAutoCoverHooks() {
  Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
  Hooks.on("renderChatMessage", onRenderChatMessage);
  Hooks.on("renderCheckModifiersDialog", onRenderCheckModifiersDialog);
  try { document.addEventListener("click", onStrikeClickCapture, true); } catch (_) {}
  Hooks.on("updateToken", onUpdateToken);
}


