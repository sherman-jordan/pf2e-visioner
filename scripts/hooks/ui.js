/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { MODULE_ID } from "../constants.js";
import { onRenderTokenHUD } from "../services/token-hud.js";

export function registerUIHooks() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("getTokenDirectoryEntryContext", onGetTokenDirectoryEntryContext);
  Hooks.on("renderWallConfig", onRenderWallConfig);
  for (const hook of [
    "renderTokenConfig",
    "renderPrototypeTokenConfig",
    "renderTokenConfigPF2e",
    "renderPrototypeTokenConfigPF2e",
  ]) {
    Hooks.on(hook, (app, root) => {
      try {
        injectPF2eVisionerBox(app, root);
      } catch (e) {
        console.error("[pf2e-visioner]", e);
      }
    });
  }

  // Add Walls Manager to Scene Controls for GM
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;
    try {
      const walls = controls.find((c) => c.name === "walls");
      if (!walls) return;
      walls.tools.push({
        name: "pf2e-visioner-wall-manager",
        title: "PF2E Visioner: Wall Settings",
        icon: "fas fa-grip-lines-vertical",
        button: true,
        onClick: async () => {
          const { VisionerWallManager } = await import("../managers/wall-manager/wall-manager.js");
          new VisionerWallManager().render(true);
        },
      });
    } catch (_) {}
  });
}

function onGetTokenDirectoryEntryContext(html, options) {
  if (!game.user.isGM) return;
  options.push({
    name: "PF2E_VISIONER.CONTEXT_MENU.MANAGE_TOKEN",
    icon: '<i class="fas fa-eye"></i>',
    callback: async (li) => {
      const tokenId = li.data("token-id");
      const token = canvas.tokens.get(tokenId);
      if (token) {
        const { openTokenManager } = await import("../api.js");
        await openTokenManager(token);
      }
    },
  });
}

function onGetTokenHUDButtons(hud, buttons, token) {
  try {
    if (token?.actor?.type === "loot") {
      if (!game.settings.get(MODULE_ID, "includeLootActors")) return;
    }
  } catch (_) {}
  buttons.push({
    name: "token-manager",
    title: "Token Manager (Left: Target Mode, Right: Observer Mode)",
    icon: "fas fa-eye",
    onClick: async () => {
      const { openTokenManagerWithMode } = await import("../api.js");
      await openTokenManagerWithMode(token, "target");
    },
    button: true,
  });
}

function injectPF2eVisionerBox(app, root) {
  const tokenDoc = app?.document;
  const actor = tokenDoc?.actor ?? tokenDoc?.parent;
  if (!actor) return;
  const panel = root.querySelector(`div.tab[data-group="sheet"][data-tab="vision"]`);
  if (!panel || panel.querySelector(".pf2e-visioner-box")) return;
  const detectionFS = [...panel.querySelectorAll("fieldset")].find((fs) =>
    fs.querySelector("header.detection-mode") || (fs.querySelector("legend")?.textContent || "").trim().toLowerCase().startsWith("detection"),
  );
  const box = document.createElement("fieldset");
  box.className = "pf2e-visioner-box";

  // Current values
  const stealthCurrent = tokenDoc.getFlag?.(MODULE_ID, "stealthDC") ?? tokenDoc.flags?.[MODULE_ID]?.stealthDC ?? "";
  const ignoreAutoCover = !!(tokenDoc.getFlag?.(MODULE_ID, "ignoreAutoCover") ?? tokenDoc.flags?.[MODULE_ID]?.ignoreAutoCover);

  // Build content
  let inner = `
    <legend>PF2E Visioner</legend>
    <div class="form-group">
      <label>Ignore as Auto-Cover Blocker</label>
      <input type="checkbox" name="flags.${MODULE_ID}.ignoreAutoCover" ${ignoreAutoCover ? "checked" : ""}>
    </div>
  `;
  if (actor.type === "loot") {
    inner += `
      <div class="form-group">
        <label>Stealth DC</label>
        <input type="number" inputmode="numeric" min="0" step="1" name="flags.${MODULE_ID}.stealthDC" value="${Number.isFinite(+stealthCurrent) ? +stealthCurrent : ""}">
      </div>
    `;
  }
  box.innerHTML = inner;

  if (detectionFS) detectionFS.insertAdjacentElement("afterend", box);
  else panel.appendChild(box);
}

function onRenderWallConfig(app, html) {
  try {
    const root = html?.jquery ? html[0] : html;
    if (!root) return;
    const form = root.querySelector('form') || root;
    // Avoid duplicate injection
    if (form.querySelector('.pf2e-visioner-wall-settings')) return;

    const provideCoverCurrent = app?.document?.getFlag?.(MODULE_ID, 'provideCover');
    const provideCoverChecked = provideCoverCurrent !== false; // default to true when undefined
    const hiddenWallsEnabled = !!game.settings.get(MODULE_ID, "hiddenWallsEnabled");
    const hiddenWallCurrent = !!app?.document?.getFlag?.(MODULE_ID, 'hiddenWall');
    const wallIdentifier = app?.document?.getFlag?.(MODULE_ID, 'wallIdentifier') ?? '';
    const dcCurrent = Number(app?.document?.getFlag?.(MODULE_ID, 'stealthDC')) || '';

    // Build a single grouped fieldset with a quick settings button (no Provide Cover here)
    const fs = document.createElement('fieldset');
    fs.className = 'pf2e-visioner-wall-settings';
    fs.innerHTML = `
      <legend>PF2E Visioner</legend>
      <div class="form-group">
        <button type="button" class="visioner-btn" data-action="open-visioner-wall-quick">Open Visioner Wall Settings</button>
      </div>
    `;

    // Append near Door Configuration or at form end
    const doorHeader = Array.from(form.querySelectorAll('label, h3, header, legend'))
      .find((el) => (el.textContent || '').toLowerCase().includes('door configuration'));
    if (doorHeader && doorHeader.parentElement) doorHeader.parentElement.insertAdjacentElement('beforebegin', fs);
    else form.appendChild(fs);

    // Bind quick settings button
    try {
      const btn = fs.querySelector('[data-action="open-visioner-wall-quick"]');
      if (btn) btn.addEventListener('click', async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const { VisionerWallQuickSettings } = await import('../managers/wall-manager/wall-quick.js');
        new VisionerWallQuickSettings(app.document).render(true);
      });
    } catch (_) {}
  } catch (_) { }
}


