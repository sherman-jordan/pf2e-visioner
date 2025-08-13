/**
 * Central registration that composes small hook modules.
 */

import { onHighlightObjects } from "../hover-tooltips.js";
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
  Hooks.on("createToken", onTokenCreated);
  Hooks.on("deleteToken", onTokenDeleted);

  // UI hues
  registerUIHooks();
  registerCombatHooks();
  registerAutoCoverHooks();
}


