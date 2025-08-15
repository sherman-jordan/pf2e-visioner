/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { MODULE_ID } from "../constants.js";
import { onRenderTokenHUD } from "../services/token-hud.js";
import { setCoverBetween, setVisibilityBetween } from "../utils.js";

export function registerUIHooks() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("getTokenDirectoryEntryContext", onGetTokenDirectoryEntryContext);
  Hooks.on("renderWallConfig", onRenderWallConfig);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  // Keep toolbar toggle states in sync with current selection (Visioner panel)
  const refreshTokenTool = () => {
    try {
      const tools = ui.controls.controls?.visioner?.tools;
      const tool = tools?.pvVisionerToggleTokenIgnore;
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
      const tools = ui.controls.controls?.visioner?.tools;
      const tool = tools?.pvVisionerToggleWallIgnore;
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
  const minPerceptionRank = Number(tokenDoc.getFlag?.(MODULE_ID, "minPerceptionRank") ?? tokenDoc.flags?.[MODULE_ID]?.minPerceptionRank ?? 0);

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
  if (actor.type === "hazard" || actor.type === "loot") {
    inner += `
      <div class="form-group">
        <label>Minimum Perception Proficiency (to detect)</label>
        <select name="flags.${MODULE_ID}.minPerceptionRank">
          <option value="0" ${minPerceptionRank === 0 ? 'selected' : ''}>Untrained</option>
          <option value="1" ${minPerceptionRank === 1 ? 'selected' : ''}>Trained</option>
          <option value="2" ${minPerceptionRank === 2 ? 'selected' : ''}>Expert</option>
          <option value="3" ${minPerceptionRank === 3 ? 'selected' : ''}>Master</option>
          <option value="4" ${minPerceptionRank === 4 ? 'selected' : ''}>Legendary</option>
        </select>
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
    const visible = !!game.user?.isGM;
    const existingOrder = Object.values(controls).reduce((m, c) => Math.max(m, c?.order ?? 0), 0);
    const visioner = controls.visioner ?? {
      name: "visioner",
      title: "PF2E Visioner",
      icon: "fas fa-face-hand-peeking",
      order: existingOrder + 1,
      visible,
      tools: {},
      activeTool: "",
    };
    const vtools = visioner.tools || {};

    // Token: toggle ignore
    const selectedTokens = canvas?.tokens?.controlled ?? [];
    vtools.pvVisionerToggleTokenIgnore = {
      name: "pvVisionerToggleTokenIgnore",
      title: "Toggle Ignore Auto-Cover (Selected Tokens)",
      icon: (selectedTokens.length > 0 && selectedTokens.every((t) => !!(t?.document?.getFlag?.(MODULE_ID, "ignoreAutoCover")))) ? "fa-solid fa-shield-slash" : "fa-solid fa-shield",
      order: 1,
      visible,
      toggle: true,
      active: selectedTokens.length > 0 && selectedTokens.every((t) => !!(t?.document?.getFlag?.(MODULE_ID, "ignoreAutoCover"))),
      onChange: async (_event, active) => {
        try {
          const selected = canvas?.tokens?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more tokens first."); return; }
          if (active) await Promise.all(selected.map((t) => t?.document?.setFlag?.(MODULE_ID, "ignoreAutoCover", true)));
          else {
            for (const t of selected) {
              try { await t?.document?.unsetFlag?.(MODULE_ID, "ignoreAutoCover"); } catch (_) { try { await t?.document?.setFlag?.(MODULE_ID, "ignoreAutoCover", false); } catch (_) {} }
            }
          }
          ui.controls.render();
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
        } catch (_) {}
      },
    };

    // Walls: toggle ignore
    const selectedWalls = canvas?.walls?.controlled ?? [];
    vtools.pvVisionerToggleWallIgnore = {
      name: "pvVisionerToggleWallIgnore",
      title: "Toggle Ignore Auto-Cover (Selected Walls)",
      icon: (selectedWalls.length > 0 && selectedWalls.every((w) => w?.document?.getFlag?.(MODULE_ID, "provideCover") === false)) ? "fa-solid fa-shield-slash" : "fa-solid fa-shield",
      order: 2,
      visible,
      toggle: true,
      active: selectedWalls.length > 0 && selectedWalls.every((w) => w?.document?.getFlag?.(MODULE_ID, "provideCover") === false),
      onChange: async (_event, active) => {
        try {
          const selected = canvas?.walls?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more walls first."); return; }
          if (active) await Promise.all(selected.map((w) => w?.document?.setFlag?.(MODULE_ID, "provideCover", false)));
          else {
            for (const w of selected) {
              try { await w?.document?.unsetFlag?.(MODULE_ID, "provideCover"); } catch (_) { try { await w?.document?.setFlag?.(MODULE_ID, "provideCover", true); } catch (_) {} }
            }
          }
          ui.controls.render();
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
        } catch (_) {}
      },
    };

    // Clear Cover (selected tokens ↔ others)
    vtools.pvVisionerClearCover = {
      name: "pvVisionerClearCover",
      title: "Clear Cover (Target Mode → Selected Tokens)",
      icon: "fa-solid fa-shield-slash",
      order: 3,
      visible,
      button: true,
      onChange: async () => {
        try {
          const selected = canvas?.tokens?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more tokens first."); return; }
          const allTokens = (canvas?.tokens?.placeables ?? []).filter((t) => !!t);
          // Clear target-mode states (others observing selected)
          for (const target of selected) {
            for (const observer of allTokens) {
              if (!observer || observer.id === target.id) continue;
              try { await setCoverBetween(observer, target, "none", { skipEphemeralUpdate: false }); Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: observer.id, targetId: target.id, state: "none" }); } catch (_) {}
            }
          }
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
          ui.notifications?.info?.("Cleared cover (target mode) for selected tokens.");
        } catch (_) {}
      },
    };

    // Clear Cover (Observer mode)
    vtools.pvVisionerClearCoverObserver = {
      name: "pvVisionerClearCoverObserver",
      title: "Clear Cover (Observer Mode → Others)",
      icon: "fa-solid fa-shield-slash",
      order: 4,
      visible,
      button: true,
      onChange: async () => {
        try {
          const selected = canvas?.tokens?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more tokens first."); return; }
          const allTokens = (canvas?.tokens?.placeables ?? []).filter((t) => !!t);
          // Clear observer-mode states (selected as observers)
          for (const observer of selected) {
            for (const target of allTokens) {
              if (!target || target.id === observer.id) continue;
              try { await setCoverBetween(observer, target, "none", { skipEphemeralUpdate: false }); Hooks.callAll("pf2e-visioner.coverMapUpdated", { observerId: observer.id, targetId: target.id, state: "none" }); } catch (_) {}
            }
          }
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
          ui.notifications?.info?.("Cleared cover (observer mode) for selected tokens.");
        } catch (_) {}
      },
    };

    // Make Observed (all observers -> selected tokens)
    vtools.pvVisionerMakeObserved = {
      name: "pvVisionerMakeObserved",
      title: "Make Observed (Target Mode → Selected Tokens)",
      icon: "fa-solid fa-eye",
      order: 5,
      visible,
      button: true,
      onChange: async () => {
        try {
          const selected = canvas?.tokens?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more tokens first."); return; }
          const observers = (canvas?.tokens?.placeables ?? []).filter((t) => !!t);
          // Target mode visibility (others → selected observed)
          for (const tgt of selected) {
            for (const obs of observers) {
              if (!obs || obs.id === tgt.id) continue;
              try { await setVisibilityBetween(obs, tgt, "observed"); } catch (_) {}
            }
          }
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
          ui.notifications?.info?.("Set Observed (target mode) for selected tokens.");
        } catch (_) {}
      },
    };

    // Make Observed (Observer mode)
    vtools.pvVisionerMakeObservedObserver = {
      name: "pvVisionerMakeObservedObserver",
      title: "Make Observed (Observer Mode → Others)",
      icon: "fa-solid fa-eye",
      order: 6,
      visible,
      button: true,
      onChange: async () => {
        try {
          const selected = canvas?.tokens?.controlled ?? [];
          if (!selected.length) { ui.notifications?.warn?.("Select one or more tokens first."); return; }
          const all = (canvas?.tokens?.placeables ?? []).filter((t) => !!t);
          for (const obs of selected) {
            for (const tgt of all) {
              if (!tgt || tgt.id === obs.id) continue;
              try { await setVisibilityBetween(obs, tgt, "observed"); } catch (_) {}
            }
          }
          try { game.canvas?.perception?.refresh?.(); } catch (_) {}
          ui.notifications?.info?.("Set Observed (observer mode) for selected tokens.");
        } catch (_) {}
      },
    };

    // Consolidated tools: toggles + clear actions
    visioner.tools = vtools;
    controls.visioner = visioner;
  } catch (_) {}
}


