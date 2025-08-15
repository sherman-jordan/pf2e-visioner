/**
 * Central registration that composes small hook modules.
 */

import { onHighlightObjects } from "../services/hover-tooltips.js";
import { registerAutoCoverHooks } from "./auto-cover.js";
import { registerChatHooks } from "./chat.js";
import { registerCombatHooks } from "./combat.js";
import { onCanvasReady, onReady } from "./lifecycle.js";
import { onTokenCreated, onTokenDeleted } from "./token-events.js";
import { registerUIHooks } from "./ui.js";

export function registerHooks() {
  Hooks.on("ready", onReady);
  Hooks.on("canvasReady", onCanvasReady);
  registerChatHooks();
  Hooks.on("highlightObjects", onHighlightObjects);

  // Token lifecycle
  // Use preCreateToken so we can set defaults (e.g., enable vision) before the doc hits the scene
  Hooks.on("preCreateToken", onTokenCreated);
  Hooks.on("deleteToken", onTokenDeleted);

  // UI hues
  registerUIHooks();
  registerCombatHooks();
  registerAutoCoverHooks();
}


