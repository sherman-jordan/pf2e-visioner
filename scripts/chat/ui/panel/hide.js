export function buildHidePanel() {
  const label = 'Open Hide Results';
  const tooltip = 'Preview and apply Hide visibility changes';
  const title = 'Hide Results';
  const icon = 'fas fa-eye-slash';
  const actionName = 'open-hide-results';
  const buttonClass = 'visioner-btn-hide';
  const panelClass = 'hide-panel';

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
              data-action="apply-now-hide"
              title="Apply all calculated changes without opening the dialog">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
