/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { MODULE_ID } from "../constants.js";
import { onRenderTokenHUD } from "../services/token-hud.js";

export function registerUIHooks() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("getTokenDirectoryEntryContext", onGetTokenDirectoryEntryContext);
  Hooks.on("renderWallConfig", onRenderWallConfig);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  // Keep toolbar toggle states in sync with current selection
  const refreshTokenTool = () => {
    try {
      const tools = ui.controls.controls?.tokens?.tools;
      const tool = tools?.pvToggleIgnoreTokenAutoCover;
      if (!tool) return;
      const selected = canvas?.tokens?.controlled ?? [];
      const active = selected.length > 0 && selected.every((t) => !!(t?.document?.getFlag?.(MODULE_ID, "ignoreAutoCover")));
      tool.active = active;
      tool.icon = active ? "fa-solid fa-shield-slash" : "fa-solid fa-shield";
      ui.controls.render();
    } catch (_) {}
  };
  const refreshWallTool = () => {
    try {
      const tools = ui.controls.controls?.walls?.tools;
      const tool = tools?.pvToggleAutoCover;
      if (!tool) return;
      const selected = canvas?.walls?.controlled ?? [];
      const active = selected.length > 0 && selected.every((w) => w?.document?.getFlag?.(MODULE_ID, "provideCover") === false);
      tool.active = active;
      tool.icon = active ? "fa-solid fa-shield-slash" : "fa-solid fa-shield";
      ui.controls.render();
    } catch (_) {}
  };
  Hooks.on("controlToken", refreshTokenTool);
  Hooks.on("deleteToken", refreshTokenTool);
  Hooks.on("createToken", refreshTokenTool);
  Hooks.on("updateToken", refreshTokenTool);
  Hooks.on("controlWall", refreshWallTool);
  Hooks.on("deleteWall", refreshWallTool);
  Hooks.on("createWall", refreshWallTool);
  Hooks.on("updateWall", refreshWallTool);
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
    // Avoid duplicate injection
    if (root.querySelector(`[name="flags.${MODULE_ID}.provideCover"]`)) return;

    const form = root.querySelector('form') || root;
    const current = app?.document?.getFlag?.(MODULE_ID, 'provideCover');
    const checked = current !== false; // default to true when undefined

    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = `
      <label>PF2E Visioner: Provide Cover</label>
      <input type="checkbox" name="flags.${MODULE_ID}.provideCover" ${checked ? 'checked' : ''}>
      <p class="notes">Uncheck to ignore this wall for auto-cover.</p>
    `;

    // Append near Door Configuration or at form end
    const doorHeader = Array.from(form.querySelectorAll('label, h3, header, legend'))
      .find((el) => (el.textContent || '').toLowerCase().includes('door configuration'));
    if (doorHeader && doorHeader.parentElement) {
      doorHeader.parentElement.insertAdjacentElement('beforebegin', group);
    } else {
      form.appendChild(group);
    }
  } catch (_) { }
}

function onGetSceneControlButtons(controls) {
  try {
    // --- Tokens: toggle ignore-as-auto-cover-blocker on selected tokens
    const tokensControl = controls?.tokens;
    const tokenTools = tokensControl?.tools;
    if (tokensControl && tokenTools) {
      const visible = !!game.user?.isGM;
      const maxOrderT = Object.values(tokenTools).reduce((m, t) => Math.max(m, t?.order ?? 0), 0);
      const selectedTokens = canvas?.tokens?.controlled ?? [];
      const tokensActive = selectedTokens.length > 0 && selectedTokens.every((t) => !!(t?.document?.getFlag?.(MODULE_ID, "ignoreAutoCover")));
      const toggleTokenTool = {
        name: "pvToggleIgnoreTokenAutoCover",
        title: "PF2E Visioner: Toggle Ignore Auto-Cover (Tokens)",
        icon: "fa-solid fa-shield-halved",
        order: maxOrderT + 1,
        visible,
        toggle: true,
        active: tokensActive,
        onChange: async (_event, active) => {
          try {
            const selected = canvas?.tokens?.controlled ?? [];
            if (!selected.length) {
              ui.notifications?.warn?.("Select one or more tokens first.");
              const tool = ui.controls.control?.tools?.pvToggleIgnoreTokenAutoCover;
              if (tool) { tool.active = !active; ui.controls.render(); }
              return;
            }
            const tool = ui.controls.control?.tools?.pvToggleIgnoreTokenAutoCover;
            if (active) {
              await Promise.all(selected.map((t) => t?.document?.setFlag?.(MODULE_ID, "ignoreAutoCover", true)));
              ui.notifications?.info?.(`Ignored auto-cover for ${selected.length} token(s).`);
              if (tool) { tool.icon = "fa-solid fa-shield-slash"; ui.controls.render(); }
            } else {
              for (const t of selected) {
                try { await t?.document?.unsetFlag?.(MODULE_ID, "ignoreAutoCover"); } catch (_) {
                  try { await t?.document?.setFlag?.(MODULE_ID, "ignoreAutoCover", false); } catch (_) {}
                }
              }
              ui.notifications?.info?.(`Restored auto-cover for ${selected.length} token(s).`);
              if (tool) { tool.icon = "fa-solid fa-shield"; ui.controls.render(); }
            }
          } catch (_) {}
        },
      };
      tokenTools[toggleTokenTool.name] = toggleTokenTool;
    }

    const wallsControl = controls?.walls;
    const wallTools = wallsControl?.tools;
    if (!wallsControl || !wallTools) return;
    const visible = !!game.user?.isGM;

    const maxOrder = Object.values(wallTools).reduce((m, t) => Math.max(m, t?.order ?? 0), 0);
    const selectedWalls = canvas?.walls?.controlled ?? [];
    const wallsActive = selectedWalls.length > 0 && selectedWalls.every((w) => w?.document?.getFlag?.(MODULE_ID, "provideCover") === false);
    const toggleTool = {
      name: "pvToggleAutoCover",
      title: "PF2E Visioner: Ignore Auto-Cover",
      icon: "fa-solid fa-shield-slash",
      order: maxOrder + 1,
      visible,
      toggle: true,
      active: wallsActive,
      onChange: async (_event, active) => {
        try {
          const selected = canvas?.walls?.controlled ?? [];
          if (!selected.length) {
            ui.notifications?.warn?.("Select one or more walls first.");
            const tool = ui.controls.control?.tools?.pvToggleAutoCover;
            if (tool) { tool.active = !active; ui.controls.render(); }
            return;
          }
          const tool = ui.controls.control?.tools?.pvToggleAutoCover;
          if (active) {
            await Promise.all(selected.map((w) => w?.document?.setFlag?.(MODULE_ID, "provideCover", false)));
            ui.notifications?.info?.(`Ignored auto-cover on ${selected.length} wall(s).`);
            if (tool) { tool.icon = "fa-solid fa-shield-slash"; ui.controls.render(); }
          } else {
            for (const w of selected) {
              try { await w?.document?.unsetFlag?.(MODULE_ID, "provideCover"); } catch (_) {
                try { await w?.document?.setFlag?.(MODULE_ID, "provideCover", true); } catch (_) {}
              }
            }
            ui.notifications?.info?.(`Restored auto-cover on ${selected.length} wall(s).`);
            if (tool) { tool.icon = "fa-solid fa-shield"; ui.controls.render(); }
          }
        } catch (_) {}
      },
    };

    wallTools[toggleTool.name] = toggleTool;
  } catch (_) {}
}


