export function buildConsequencesPanel() {
  const label = "Open Damage Consequences";
  const tooltip =
    "Preview and apply visibility changes after damage from hidden/undetected attacker";
  const title = "Damage Consequences";
  const icon = "fas fa-skull";
  const actionName = "open-consequences-results";
  const buttonClass = "visioner-btn-consequences";
  const panelClass = "consequences-panel";

  let actionButtonsHtml = "";
  if (game.user.isGM) {
    actionButtonsHtml = `
      <button type="button" 
              class="visioner-btn ${buttonClass}" 
              data-action="${actionName}"
              title="${tooltip}">
        <i class="${icon}"></i> ${label}
      </button>`;
  }

  return { title, icon, panelClass, actionButtonsHtml };
}



