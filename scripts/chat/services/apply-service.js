// Apply helpers for chat automation actions

import { ConsequencesActionHandler } from "./actions/consequences-action.js";
import { DiversionActionHandler } from "./actions/diversion-action.js";
import { HideActionHandler } from "./actions/hide-action.js";
import { PointOutActionHandler } from "./actions/point-out-action.js";
import { SeekActionHandler } from "./actions/seek-action.js";
import { SneakActionHandler } from "./actions/sneak-action.js";
import { TakeCoverActionHandler } from "./actions/take-cover-action.js";

export async function applyNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowHide(actionData, button) {
  const handler = new HideActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowSneak(actionData, button) {
  const handler = new SneakActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  return handler.apply(actionData, button);
}

export async function applyNowTakeCover(actionData, button) {
  const handler = new TakeCoverActionHandler();
  return handler.apply(actionData, button);
}


