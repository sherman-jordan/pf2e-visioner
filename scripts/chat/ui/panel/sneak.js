export function buildSneakPanel(actionData = {}, message = null) {
  const panelClass = 'sneak-panel';

  let actionButtonsHtml = '';
  if (game.user.isGM) {
    // Check if sneak has been started by looking for sneakStartStates flag
    const chatMessage = message || actionData?.message || game.messages.get(actionData?.messageId);
    const hasStartedSneak = chatMessage?.flags?.['pf2e-visioner']?.sneakStartStates;

    if (hasStartedSneak) {
      // Show "Open Results" if sneak has been started
      const label = 'Open Sneak Results';
      const tooltip = 'Preview and apply Sneak visibility changes';
      const icon = 'fas fa-user-ninja';
      const actionName = 'open-sneak-results';
      const buttonClass = 'visioner-btn-sneak';
      
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                data-tooltip="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-sneak"
                data-tooltip="Apply all calculated changes without opening the dialog">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    } else {
      // Show "Start Sneak" if sneak hasn't been started yet
      const buttonClass = 'visioner-btn-sneak';
      
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="start-sneak"
                data-tooltip="Start sneaking: capture current visibility and cover states">
          <i class="fas fa-mask"></i> Start Sneak
        </button>`;
    }
  }

  const hasStartedSneak = (message || actionData?.message || game.messages.get(actionData?.messageId))?.flags?.['pf2e-visioner']?.sneakStartStates;
  const title = hasStartedSneak ? 'Sneak Results' : 'Sneak Action';
  const icon = hasStartedSneak ? 'fas fa-user-ninja' : 'fas fa-mask';

  return { title, icon, panelClass, actionButtonsHtml };
}
