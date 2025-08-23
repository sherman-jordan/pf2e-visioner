export function buildDiversionPanel() {
  const label = 'Open Diversion Results';
  const tooltip = 'Preview and apply Create a Diversion visibility changes';
  const title = 'Create a Diversion Results';
  const icon = 'fas fa-theater-masks';
  const actionName = 'open-diversion-results';
  const buttonClass = 'visioner-btn-create-a-diversion';
  const panelClass = 'create-a-diversion-panel';

  let actionButtonsHtml = '';
  if (game.user.isGM) {
    actionButtonsHtml = `
      <button type="button" 
              class="visioner-btn ${buttonClass}" 
              data-action="${actionName}"
              title="${tooltip}">
        <i class="${icon}"></i> ${label}
      </button>
      <button type="button"
              class="visioner-btn ${buttonClass} apply-now"
              data-action="apply-now-diversion"
              title="Apply all calculated changes without opening the dialog">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
