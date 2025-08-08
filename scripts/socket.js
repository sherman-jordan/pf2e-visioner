import { MODULE_ID } from "./constants.js";
import { showNotification } from "./utils.js";

let socket = null;

const REFRESH_CHANNEL = "RefreshPerception";
const POINT_OUT_CHANNEL = "PointOut";

export function registerSocket() {
  if (typeof socketlib === "undefined") {
    showNotification(
      "PF2E_VISIONER.NOTIFICATIONS.NO_SOCKETLIB_INSTALLED",
      "warn",
    );
    return;
  }
  socket = socketlib.registerModule(MODULE_ID);
  socket.register(REFRESH_CHANNEL, refreshLocalPerception);
  socket.register(POINT_OUT_CHANNEL, pointOutHandler);
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
  if (socket) socket.executeForEveryone(REFRESH_CHANNEL);
}

/*
 * Send a request for Point Out resolution to the GM
 */
export function requestGMHandlePointOut(...args) {
  if (socket) socket.executeForGM(POINT_OUT_CHANNEL, ...args);
}

/*
 * Runs on GM machine with data sent from client
 */
function pointOutHandler(...args) {
  //do what you want to do
}
