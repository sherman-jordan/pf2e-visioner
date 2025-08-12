// Apply helpers for chat automation actions

import { ConsequencesActionHandler } from "./actions/consequences-action.js";
import { DiversionActionHandler } from "./actions/diversion-action.js";
import { HideActionHandler } from "./actions/hide-action.js";
import { PointOutActionHandler } from "./actions/point-out-action.js";
import { SeekActionHandler } from "./actions/seek-action.js";
import { SneakActionHandler } from "./actions/sneak-action.js";

export async function applyNowSeek(actionData, button) {
  const handler = new SeekActionHandler();
  await handler.apply(actionData, button);
}

export async function applyNowPointOut(actionData, button) {
  const handler = new PointOutActionHandler();
  await handler.apply(actionData, button);
}

export async function applyNowHide(actionData, button) {
  const handler = new HideActionHandler();
  await handler.apply(actionData, button);
}

export async function applyNowSneak(actionData, button) {
  const handler = new SneakActionHandler();
  await handler.apply(actionData, button);
}

export async function applyNowDiversion(actionData, button) {
  const handler = new DiversionActionHandler();
  await handler.apply(actionData, button);
}

export async function applyNowConsequences(actionData, button) {
  const handler = new ConsequencesActionHandler();
  await handler.apply(actionData, button);
}


