// Unified preview dispatcher for chat automation actions
import { MODULE_ID } from '../../../constants.js';

// Flag to prevent multiple seek actions from being processed simultaneously
let isProcessingSeek = false;

export async function previewActionResults(actionData) {
  const type = actionData.actionType;
  const { log } = await import('../infra/notifications.js');

  try {
    switch (type) {
      case 'seek': {
        // Prevent multiple seek actions from being processed simultaneously
        if (isProcessingSeek) {
          log.warn('Seek action already in progress, skipping duplicate request');
          return;
        }

        isProcessingSeek = true;

        try {
          // Prevent duplicate seek dialogs by closing any existing one first
          try {
            const { SeekPreviewDialog } = await import('../../dialogs/seek-preview-dialog.js');
            // Check if there's already a seek dialog open and close it
            if (SeekPreviewDialog.currentSeekDialog) {
              await SeekPreviewDialog.currentSeekDialog.close();
              // Small delay to ensure the dialog is fully closed
              await new Promise((resolve) => setTimeout(resolve, 100));
            } else {
            }
          } catch (_) {
            // Ignore errors when closing existing dialog
          }

          const { SeekActionHandler } = await import('../actions/seek-action.js');
          const { SeekPreviewDialog } = await import('../../dialogs/seek-preview-dialog.js');
          const handler = new SeekActionHandler();
          await handler.ensurePrerequisites(actionData);

          // RAW enforcement gate: check if there are valid seek targets
          try {
            const { checkForValidTargets } = await import('../infra/target-checker.js');
            const canSeek = checkForValidTargets({ ...actionData, actionType: 'seek' });
            if (!canSeek && game.settings.get(MODULE_ID, 'enforceRawRequirements')) {
              const { notify } = await import('../infra/notifications.js');
              notify.warn(
                'No valid Seek targets found. According to RAW, you can only Seek targets that are Undetected or Hidden from you.',
              );
              return;
            }
          } catch (_) {}

          // Do NOT pre-filter allies at discovery time; let the dialog control it live
          const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
          const outcomes = await Promise.all(
            subjects.map((s) => handler.analyzeOutcome(actionData, s)),
          );
          const changes = outcomes.filter((o) => o && o.changed);
          // Pass the current desired per-dialog ignoreAllies default
          new SeekPreviewDialog(actionData.actor, outcomes, changes, {
            ...actionData,
            ignoreAllies: actionData?.ignoreAllies ?? game.settings.get(MODULE_ID, 'ignoreAllies'),
          }).render(true);
          return;
        } finally {
          // Always reset the flag, even if there's an error
          isProcessingSeek = false;
        }
      }
      case 'point-out': {
        const { PointOutActionHandler } = await import('../actions/point-out-action.js');
        const { PointOutPreviewDialog } = await import('../../dialogs/point-out-preview-dialog.js');
        const handler = new PointOutActionHandler();
        const subjects = await handler.discoverSubjects(actionData);
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new PointOutPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case 'hide': {
        const { HideActionHandler } = await import('../actions/hide-action.js');
        const { HidePreviewDialog } = await import('../../dialogs/hide-preview-dialog.js');
        const handler = new HideActionHandler();
        await handler.ensurePrerequisites(actionData);
        // RAW enforcement gate: do not open dialog if prerequisites fail
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canHide = checkForValidTargets({ ...actionData, actionType: 'hide' });
          if (!canHide && game.settings.get(MODULE_ID, 'enforceRawRequirements')) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'The creature hiding should be Concealed from, or have Standard or Greater Cover from, at least one observed.',
            );
            return;
          }
        } catch (_) {}
        // Do NOT pre-filter allies; let dialog control it
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new HidePreviewDialog(actionData.actor, outcomes, changes, {
          ...actionData,
          ignoreAllies: actionData?.ignoreAllies ?? game.settings.get(MODULE_ID, 'ignoreAllies'),
        }).render(true);
        return;
      }
      case 'sneak': {
        const { SneakActionHandler } = await import('../actions/sneak-action.js');
        const { SneakPreviewDialog } = await import('../../dialogs/sneak-preview-dialog.js');
        const handler = new SneakActionHandler();
        // RAW enforcement gate: do not open dialog if prerequisites fail
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canSneak = checkForValidTargets({ ...actionData, actionType: 'sneak' });
          if (!canSneak && game.settings.get(MODULE_ID, 'enforceRawRequirements')) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'You can attempt Sneak only against creatures you were Hidden or Undetected from at the start.',
            );
            return;
          }
        } catch (_) {}
        // Do NOT pre-filter allies; let dialog control it
        const subjects = await handler.discoverSubjects({
          actor: actionData.actor,
          ignoreAllies: false,
        });
        const outcomes = await Promise.all(
          subjects.map((s) =>
            handler.analyzeOutcome({ actor: actionData.actor, roll: actionData.roll }, s),
          ),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new SneakPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case 'create-a-diversion': {
        const { DiversionActionHandler } = await import('../actions/diversion-action.js');
        const { CreateADiversionPreviewDialog } = await import(
          '../../dialogs/create-a-diversion-preview-dialog.js'
        );
        const handler = new DiversionActionHandler();
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new CreateADiversionPreviewDialog(actionData.actor, outcomes, changes, actionData).render(
          true,
        );
        return;
      }
      case 'take-cover': {
        const { TakeCoverActionHandler } = await import('../actions/take-cover-action.js');
        const { TakeCoverPreviewDialog } = await import(
          '../../dialogs/take-cover-preview-dialog.js'
        );
        const handler = new TakeCoverActionHandler();
        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new TakeCoverPreviewDialog(actionData.actor, outcomes, changes, actionData).render(true);
        return;
      }
      case 'consequences': {
        const { ConsequencesActionHandler } = await import('../actions/consequences-action.js');
        const { ConsequencesPreviewDialog } = await import(
          '../../dialogs/consequences-preview-dialog.js'
        );
        const handler = new ConsequencesActionHandler();

        // RAW enforcement gate: check if there are valid targets for consequences
        try {
          const { checkForValidTargets } = await import('../infra/target-checker.js');
          const canShowConsequences = checkForValidTargets({
            ...actionData,
            actionType: 'consequences',
          });
          if (!canShowConsequences && game.settings.get(MODULE_ID, 'enforceRawRequirements')) {
            const { notify } = await import('../infra/notifications.js');
            notify.warn(
              'No valid targets found for Attack Consequences. According to RAW, you can only see consequences from targets that you are Hidden or Undetected from.',
            );
            return;
          }
        } catch (_) {}

        const subjects = await handler.discoverSubjects({ ...actionData, ignoreAllies: false });
        const outcomes = await Promise.all(
          subjects.map((s) => handler.analyzeOutcome(actionData, s)),
        );
        const changes = outcomes.filter((o) => o && o.changed);
        new ConsequencesPreviewDialog(
          actionData.actor,
          outcomes,
          changes,
          actionData.attackData || {},
          actionData,
        ).render(true);
        return;
      }
      default:
        log.warn(`Unknown action type: ${type}`);
        return;
    }
  } catch (error) {
    log.error(`Error in previewActionResults for ${type}:`, error);
  }
}
