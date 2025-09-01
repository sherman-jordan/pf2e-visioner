export function buildPointOutPanel(actionData, message) {
  const label = 'Open Point Out Results';
  const tooltip = 'Preview and apply Point Out visibility changes';
  const title = 'Point Out Results';
  const icon = 'fas fa-hand-point-right';
  const actionName = 'open-point-out-results';
  const buttonClass = 'visioner-btn-point-out';
  const panelClass = 'point-out-panel';

  const msgForPanel = message || game.messages.get(actionData.messageId);
  const hasPending = !!msgForPanel?.flags?.['pf2e-visioner']?.pointOut && game.user.isGM;
  const pendingHasTargets = !!msgForPanel?.flags?.['pf2e-visioner']?.pointOut?.hasTargets;

  let actionButtonsHtml = '';
  if (hasPending) {
    if (pendingHasTargets) {
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                data-tooltip="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        ${game.user.isGM ? `<button type="button" class="visioner-btn ${buttonClass} apply-now" data-action="apply-now-point-out" data-tooltip="Apply all calculated changes without opening the dialog"><i class="fas fa-check-double"></i> Apply Changes</button>` : ``}`;
    }
  } else if (game.user.isGM) {
    actionButtonsHtml = `
      <button type="button" 
              class="visioner-btn ${buttonClass}" 
              data-action="${actionName}"
              data-tooltip="${tooltip}">
        <i class="${icon}"></i> ${label}
      </button>
      <button type="button"
              class="visioner-btn ${buttonClass} apply-now"
              data-action="apply-now-point-out"
              data-tooltip="Apply all calculated changes without opening the dialog">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
