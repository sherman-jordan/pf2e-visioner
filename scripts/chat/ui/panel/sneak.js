export function buildSneakPanel() {
  const label = 'Open Sneak Results';
  const tooltip = 'Preview and apply Sneak visibility changes';
  const title = 'Sneak Results';
  const icon = 'fas fa-user-ninja';
  const actionName = 'open-sneak-results';
  const buttonClass = 'visioner-btn-sneak';
  const panelClass = 'sneak-panel';

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
              data-action="apply-now-sneak"
              title="Apply all calculated changes without opening the dialog">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}
