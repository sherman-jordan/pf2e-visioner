import { MODULE_ID } from "./constants";

let socket = null;

export function registerSocket() {
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
  socket.executeForEveryone("RefreshPerception");
}
