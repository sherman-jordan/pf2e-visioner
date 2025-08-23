/**
 * buildAutomationPanel
 * Stateless builder for the chat automation panel HTML.
 */

import { buildConsequencesPanel } from './panel/consequences.js';
import { buildDiversionPanel } from './panel/diversion.js';
import { buildHidePanel } from './panel/hide.js';
import { buildPointOutPanel } from './panel/point-out.js';
import { buildSeekPanel } from './panel/seek.js';
import { buildSneakPanel } from './panel/sneak.js';
import { buildTakeCoverPanel } from './panel/take-cover.js';

export function buildAutomationPanel(actionData, message) {
  let config = null;
  switch (actionData.actionType) {
    case 'seek':
      config = buildSeekPanel(actionData, message);
      break;
    case 'point-out':
      config = buildPointOutPanel(actionData, message);
      break;
    case 'hide':
      config = buildHidePanel(actionData, message);
      break;
    case 'sneak':
      config = buildSneakPanel(actionData, message);
      break;
    case 'create-a-diversion':
      config = buildDiversionPanel(actionData, message);
      break;
    case 'consequences':
      config = buildConsequencesPanel(actionData, message);
      break;
    case 'take-cover':
      config = buildTakeCoverPanel(actionData, message);
      break;
    default:
      return '';
  }
  if (!config) return '';
  return `
    <div class="pf2e-visioner-automation-panel ${config.panelClass}" data-message-id="${actionData.messageId}" data-action-type="${actionData.actionType}" data-user-id="${game.userId}">
      <div class="automation-actions">
        ${config.actionButtonsHtml}
      </div>
    </div>
  `;
}
