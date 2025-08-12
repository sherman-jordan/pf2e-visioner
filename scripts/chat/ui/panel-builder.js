/**
 * buildAutomationPanel
 * Stateless builder for the chat automation panel HTML.
 */

export function buildAutomationPanel(actionData, message) {
  const isSeek = actionData.actionType === "seek";
  const isPointOut = actionData.actionType === "point-out";
  const isHide = actionData.actionType === "hide";
  const isSneak = actionData.actionType === "sneak";
  const isCreateADiversion = actionData.actionType === "create-a-diversion";
  const isConsequences = actionData.actionType === "consequences";

  let label, tooltip, title, icon, actionName, buttonClass, panelClass;

  if (isSeek) {
    label = game.i18n.localize("PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS");
    tooltip = game.i18n.localize(
      "PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP",
    );
    title = "Seek Results";
    icon = "fas fa-search";
    actionName = "open-seek-results";
    buttonClass = "visioner-btn-seek";
    panelClass = "seek-panel";
  } else if (isPointOut) {
    // Only show Point Out button to GM; players don't see this and GM uses player's target implicitly
    label = "Open Point Out Results";
    tooltip = "Preview and apply Point Out visibility changes";
    title = "Point Out Results";
    icon = "fas fa-hand-point-right";
    actionName = "open-point-out-results";
    buttonClass = "visioner-btn-point-out";
    panelClass = "point-out-panel";
  } else if (isHide) {
    label = "Open Hide Results";
    tooltip = "Preview and apply Hide visibility changes";
    title = "Hide Results";
    icon = "fas fa-eye-slash";
    actionName = "open-hide-results";
    buttonClass = "visioner-btn-hide";
    panelClass = "hide-panel";
  } else if (isSneak) {
    label = "Open Sneak Results";
    tooltip = "Preview and apply Sneak visibility changes";
    title = "Sneak Results";
    icon = "fas fa-user-ninja";
    actionName = "open-sneak-results";
    buttonClass = "visioner-btn-sneak";
    panelClass = "sneak-panel";
  } else if (isCreateADiversion) {
    label = "Open Diversion Results";
    tooltip = "Preview and apply Create a Diversion visibility changes";
    title = "Create a Diversion Results";
    icon = "fas fa-theater-masks";
    actionName = "open-diversion-results";
    buttonClass = "visioner-btn-create-a-diversion";
    panelClass = "create-a-diversion-panel";
  } else if (isConsequences) {
    label = "Open Damage Consequences";
    tooltip =
      "Preview and apply visibility changes after damage from hidden/undetected attacker";
    title = "Damage Consequences";
    icon = "fas fa-skull";
    actionName = "open-consequences-results";
    buttonClass = "visioner-btn-consequences";
    panelClass = "consequences-panel";
  }

  const isSeekWithTemplateOption =
    isSeek && game.settings.get("pf2e-visioner", "seekUseTemplate");
  // Prefer the provided message (fresh render) when available
  const msgForPanel = isSeek ? message || game.messages.get(actionData.messageId) : null;
  const hasPendingTemplateFromPlayer = isSeek && !!msgForPanel?.flags?.["pf2e-visioner"]?.seekTemplate && game.user.isGM;
  const pendingHasTargets = !!msgForPanel?.flags?.["pf2e-visioner"]?.seekTemplate?.hasTargets;
  const hasPendingPointOutFromPlayer = isPointOut && !!msgForPanel?.flags?.["pf2e-visioner"]?.pointOut && game.user.isGM;
  const pendingPointOutHasTargets = !!msgForPanel?.flags?.["pf2e-visioner"]?.pointOut?.hasTargets;
  const hasExistingTemplate =
    isSeekWithTemplateOption &&
    !!canvas?.scene?.templates?.find?.((t) => {
      const f = t?.flags?.["pf2e-visioner"];
      return (
        f?.seekPreviewManual &&
        f?.messageId === actionData.messageId &&
        f?.actorTokenId === actionData.actor.id &&
        t?.user?.id === game.userId
      );
    });

  // Precompute action buttons HTML to avoid complex nested template expressions
  let actionButtonsHtml = "";
  if (isSeek) {
    if (hasPendingTemplateFromPlayer) {
      if (pendingHasTargets) {
        actionButtonsHtml = `
          <button type="button" 
                  class="visioner-btn ${buttonClass}" 
                  data-action="open-seek-results"
                  title="${game.i18n.localize(
                    "PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS_TOOLTIP",
                  )}">
            <i class="${icon}"></i> ${game.i18n.localize("PF2E_VISIONER.SEEK_AUTOMATION.OPEN_RESULTS")}
          </button>
          <button type="button"
                  class="visioner-btn ${buttonClass} apply-now"
                  data-action="apply-now-seek"
                  title="Apply all calculated changes without opening the dialog">
            <i class="fas fa-check-double"></i> Apply Changes
          </button>`;
      } else {
        // Pending template from player has no targets: show nothing at all
        actionButtonsHtml = "";
      }
    } else if (isSeekWithTemplateOption) {
      actionButtonsHtml = `
        <button type="button"
                class="visioner-btn ${buttonClass} setup-template"
                data-action="${hasExistingTemplate ? "remove-seek-template" : "setup-seek-template"}"
                title="${game.i18n.localize(
                  "PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE_TOOLTIP",
                )}">
          <i class="fas fa-bullseye"></i> ${
            hasExistingTemplate
              ? game.i18n.localize("PF2E_VISIONER.SEEK_AUTOMATION.REMOVE_TEMPLATE")
              : game.i18n.localize("PF2E_VISIONER.SEEK_AUTOMATION.SETUP_TEMPLATE")
          }
        </button>`;
      if (hasExistingTemplate) {
        actionButtonsHtml += `
          <button type="button"
                  class="visioner-btn ${buttonClass} apply-now"
                  data-action="apply-now-seek"
                  title="Apply all calculated changes without opening the dialog">
            <i class="fas fa-check-double"></i> Apply Changes
          </button>`;
      }
    } else if (game.user.isGM) {
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                title="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-seek"
                title="Apply all calculated changes without opening the dialog">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    }
  } else if (isPointOut) {
    if (hasPendingPointOutFromPlayer) {
      if (pendingPointOutHasTargets) {
        actionButtonsHtml = `
          <button type="button" 
                  class="visioner-btn ${buttonClass}" 
                  data-action="open-point-out-results"
                  title="Preview and apply Point Out visibility changes">
            <i class="fas fa-hand-point-right"></i> Open Point Out Results
          </button>
          <button type="button"
                  class="visioner-btn ${buttonClass} apply-now"
                  data-action="apply-now-point-out"
                  title="Apply all calculated changes without opening the dialog">
            <i class="fas fa-check-double"></i> Apply Changes
          </button>`;
      } else {
        actionButtonsHtml = "";
      }
    } else if (game.user.isGM) {
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                title="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="apply-now-point-out"
                title="Apply all calculated changes without opening the dialog">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>`;
    }
  } else {
    if (game.user.isGM) {
      const applyAction = isHide ? "apply-now-hide"
                        : isSneak ? "apply-now-sneak"
                        : isCreateADiversion ? "apply-now-diversion"
                        : isConsequences ? "apply-now-consequences"
                        : null;
      actionButtonsHtml = `
        <button type="button" 
                class="visioner-btn ${buttonClass}" 
                data-action="${actionName}"
                title="${tooltip}">
          <i class="${icon}"></i> ${label}
        </button>
        ${applyAction ? `
        <button type="button"
                class="visioner-btn ${buttonClass} apply-now"
                data-action="${applyAction}"
                title="Apply all calculated changes without opening the dialog">
          <i class="fas fa-check-double"></i> Apply Changes
        </button>` : ""}`;
    }
  }

  return `
    <div class="pf2e-visioner-automation-panel ${panelClass}" data-message-id="${actionData.messageId}" data-action-type="${actionData.actionType}">
      <div class="automation-header">
        <i class="${icon}"></i>
        <span class="automation-title">${title}</span>
      </div>
      <div class="automation-actions">
        ${actionButtonsHtml}
      </div>
    </div>
  `;
}


