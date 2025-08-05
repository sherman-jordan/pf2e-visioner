import { MODULE_ID } from "./constants.js";
import { showNotification } from "./utils.js";

let socket = null;

export function registerSocket() {
  if (typeof socketlib === "undefined") {
    showNotification(
      "PF2E_VISIONER.NOTIFICATIONS.NO_SOCKETLIB_INSTALLED",
      "warn",
    );
    return;
  }
  socket = socketlib.registerModule(MODULE_ID);
  socket.register("RefreshPerception", refreshLocalPerception);
}

/*
 * Refresh perception on the local canvas
 */
export function refreshLocalPerception() {
  canvas.perception.update({
    refreshLighting: true,
    refreshVision: true,
    refreshSounds: true,
    refreshOcclusion: true,
  });
}

/*
 * Forces a refresh on all clients including this one
 * (will call refreshLocalPerception on local client)
 */
export function refreshEveryonesPerception() {
  if (socket) socket.executeForEveryone("RefreshPerception");
}
