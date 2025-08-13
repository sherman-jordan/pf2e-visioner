export function buildTakeCoverPanel() {
  const label = "Open Take Cover Results";
  const tooltip = "Preview and apply Take Cover changes";
  const title = "Take Cover";
  const icon = "fas fa-shield-alt";
  const actionName = "open-take-cover-results";
  const buttonClass = "visioner-btn-take-cover";
  const panelClass = "take-cover-panel";

  let actionButtonsHtml = "";
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
              data-action="apply-now-take-cover"
              title="Apply all calculated cover changes without opening the dialog">
        <i class="fas fa-check-double"></i> Apply Changes
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}


