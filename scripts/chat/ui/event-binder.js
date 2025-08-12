/**
 * bindAutomationEvents
 * Stateless event binding for automation panel.
 */

export function bindAutomationEvents(panel, message, actionData) {
  panel.on("click", "[data-action]", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const action = event.currentTarget.dataset.action;
    const button = $(event.currentTarget);

    if (button.hasClass("processing")) return;

    try {
      button.addClass("processing").prop("disabled", true);
      const {
        previewActionResults,
        applyNowSeek,
        applyNowPointOut,
        applyNowHide,
        applyNowSneak,
        applyNowDiversion,
        applyNowConsequences,
        revertNowSeek,
        revertNowPointOut,
        revertNowHide,
        revertNowSneak,
        revertNowDiversion,
        revertNowConsequences,
        setupSeekTemplate,
        removeSeekTemplate,
        injectAutomationUI,
      } = await import("../services/index.js");

      // Declarative apply/revert handlers by action string
      const applyHandlers = {
        "apply-now-seek": applyNowSeek,
        "apply-now-point-out": applyNowPointOut,
        "apply-now-hide": applyNowHide,
        "apply-now-sneak": applyNowSneak,
        "apply-now-diversion": applyNowDiversion,
        "apply-now-consequences": applyNowConsequences,
      };
      const revertHandlers = {
        "revert-now-seek": revertNowSeek,
        "revert-now-point-out": revertNowPointOut,
        "revert-now-hide": revertNowHide,
        "revert-now-sneak": revertNowSneak,
        "revert-now-diversion": revertNowDiversion,
        "revert-now-consequences": revertNowConsequences,
      };

      if (action === "setup-seek-template" && actionData.actionType === "seek") {
        await setupSeekTemplate(actionData);
      } else if (action === "remove-seek-template" && actionData.actionType === "seek") {
        await removeSeekTemplate(actionData);
        try {
          const parent = button.closest(".pf2e-visioner-automation-panel");
          if (parent?.length) {
            const messageId = parent.data("message-id");
            const message = game.messages.get(messageId);
            if (message) {
              const html = $(message.element);
              parent.remove();
              injectAutomationUI(message, html, actionData);
            }
          }
        } catch (_) {}
      } else if (action === "open-seek-results" && actionData.actionType === "seek") {
        const msg = game.messages.get(actionData.messageId);
        const pending = msg?.flags?.["pf2e-visioner"]?.seekTemplate;
        if (pending && game.user.isGM) {
          actionData.seekTemplateCenter = pending.center;
          actionData.seekTemplateRadiusFeet = pending.radiusFeet;
          if (typeof pending.rollTotal === "number") {
            actionData.roll = { total: pending.rollTotal, dice: [{ total: typeof pending.dieResult === "number" ? pending.dieResult : undefined }] };
          }
        }
        await previewActionResults(actionData);
      } else if (action === "open-point-out-results" && actionData.actionType === "point-out") {
        if (game.user.isGM) {
          const { enrichPointOutActionDataForGM } = await import("../services/index.js");
          await enrichPointOutActionDataForGM(actionData);
        }
        await previewActionResults(actionData);
      } else if (typeof action === "string" && action.startsWith("open-")) {
        await previewActionResults(actionData);
      } else if (applyHandlers[action]) {
        // For Point Out, ping the pointed target when applying from the chat panel
        try {
          if (action === "apply-now-point-out" && game.user.isGM) {
            // Prefer resolved outcomes from handler if available via preview, otherwise flags
            let token = null;
            try {
              const dialog = ui.windows?.find?.((w) => w?.options?.classes?.includes?.("point-out-preview-dialog"));
              const first = dialog?.outcomes?.[0]?.targetToken;
              if (first) token = first;
            } catch (_) {}
            if (!token) {
              const msg = game.messages.get(actionData?.messageId);
              const pointOutFlags = msg?.flags?.["pf2e-visioner"]?.pointOut;
              const targetTokenId = pointOutFlags?.targetTokenId || actionData?.context?.target?.token || msg?.flags?.pf2e?.target?.token;
              if (targetTokenId) token = canvas.tokens.get(targetTokenId) || null;
            }
            if (token) {
              const { pingTokenCenter } = await import("../services/gm-ping.js");
              try { pingTokenCenter(token, "Point Out Target"); } catch (_) {}
            }
          }
        } catch (_) {}
        await applyHandlers[action](actionData, button);
      } else if (revertHandlers[action]) {
        await revertHandlers[action](actionData, button);
      }
    } finally {
      button.removeClass("processing").prop("disabled", false);
    }
  });
}


