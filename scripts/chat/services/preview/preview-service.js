// Unified preview dispatcher for chat automation actions

export async function previewActionResults(actionData) {
  const type = actionData.actionType;
  const { log } = await import("../infra/notifications.js");

  try {
    switch (type) {
      case "seek": {
        const { SeekActionHandler } = await import("../actions/seek-action.js");
        const { SeekPreviewDialog } = await import("../../dialogs/seek-preview-dialog.js");
        const handler = new SeekActionHandler();
        await handler.ensurePrerequisites(actionData);
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new SeekPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "point-out": {
        const { PointOutActionHandler } = await import("../actions/point-out-action.js");
        const { PointOutPreviewDialog } = await import("../../dialogs/point-out-preview-dialog.js");
        const handler = new PointOutActionHandler();
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new PointOutPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "hide": {
        const { HideActionHandler } = await import("../actions/hide-action.js");
        const { HidePreviewDialog } = await import("../../dialogs/hide-preview-dialog.js");
        const handler = new HideActionHandler();
        await handler.ensurePrerequisites(actionData);
        // RAW enforcement gate: do not open dialog if prerequisites fail
        try {
          const { checkForValidTargets } = await import("../infra/target-checker.js");
          const canHide = checkForValidTargets({ ...actionData, actionType: "hide" });
          if (!canHide && game.settings.get("pf2e-visioner", "enforceRawRequirements")) {
            const { notify } = await import("../infra/notifications.js");
            notify.warn("The creature hiding should be Concealed from, or have Standard or Greater Cover from, at least one observed.");
            return;
          }
        } catch (_) {}
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new HidePreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "sneak": {
        const { SneakActionHandler } = await import("../actions/sneak-action.js");
        const { SneakPreviewDialog } = await import("../../dialogs/sneak-preview-dialog.js");
        const handler = new SneakActionHandler();
        const subjects = await handler.discoverSubjects({ actor: actionData.actor });
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome({ actor: actionData.actor, roll: actionData.roll }, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new SneakPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "create-a-diversion": {
        const { DiversionActionHandler } = await import("../actions/diversion-action.js");
        const { CreateADiversionPreviewDialog } = await import("../../dialogs/create-a-diversion-preview-dialog.js");
        const handler = new DiversionActionHandler();
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new CreateADiversionPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "take-cover": {
        const { TakeCoverActionHandler } = await import("../actions/take-cover-action.js");
        const { TakeCoverPreviewDialog } = await import("../../dialogs/take-cover-preview-dialog.js");
        const handler = new TakeCoverActionHandler();
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new TakeCoverPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case "consequences": {
        const { ConsequencesActionHandler } = await import("../actions/consequences-action.js");
        const { ConsequencesPreviewDialog } = await import("../../dialogs/consequences-preview-dialog.js");
        const handler = new ConsequencesActionHandler();
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(subjects.map((s) => handler.analyzeOutcome(actionData, s)));
        const changes = outcomes.filter((o) => o && o.changed);
        new ConsequencesPreviewDialog(actionData.actor, outcomes, changes, actionData.damageData || {}, actionData).render(true);
        return;
      }
      default:
        log.warn("Unknown action type:", actionData.actionType);
    }
  } catch (e) {
    log.error(e);
  }
}




