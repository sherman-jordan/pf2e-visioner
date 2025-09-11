// Apply helpers for chat automation actions

import { COVER_STATES, VISIBILITY_STATES } from '../../constants.js';
import { ConsequencesActionHandler } from './actions/consequences-action.js';
import { DiversionActionHandler } from './actions/diversion-action.js';
import { HideActionHandler } from './actions/hide-action.js';
import { PointOutActionHandler } from './actions/point-out-action.js';
import { SeekActionHandler } from './actions/seek-action.js';
import { SneakActionHandler } from './actions/sneak-action.js';
import { TakeCoverActionHandler } from './actions/take-cover-action.js';

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



// Helper functions for icon and label generation using constants
function getVisibilityIcon(visibility) {
  return VISIBILITY_STATES[visibility]?.icon || 'fas fa-question';
}

function getCoverIcon(cover) {
  return COVER_STATES[cover]?.icon || 'fas fa-question';
}

function getVisibilityLabel(visibility) {
  return VISIBILITY_STATES[visibility]?.label || visibility;
}

function getCoverLabel(cover) {
  return COVER_STATES[cover]?.label || cover;
}
