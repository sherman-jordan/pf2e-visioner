/**
 * UI-related hooks: Token HUD, Token Directory, TokenConfig injection
 */

import { MODULE_ID } from '../constants.js';
import { onRenderTokenHUD } from '../services/token-hud.js';

export function registerUIHooks() {
  Hooks.on('renderTokenHUD', onRenderTokenHUD);
  Hooks.on('getTokenDirectoryEntryContext', onGetTokenDirectoryEntryContext);
  Hooks.on('renderWallConfig', onRenderWallConfig);
  // We no longer create a separate Visioner tool; tools are injected into Tokens/Walls below
  // Helper utilities to support both array- and object-shaped tool containers
  const getNamedTool = (toolsContainer, name) => {
    try {
      if (!toolsContainer) return null;
      if (Array.isArray(toolsContainer))
        return toolsContainer.find((t) => t?.name === name) || null;
      if (typeof toolsContainer === 'object') return toolsContainer?.[name] || null;
      return null;
    } catch (_) {
      return null;
    }
  };

  const addTool = (toolsContainer, tool) => {
    try {
      if (!toolsContainer || !tool?.name) return;
      if (Array.isArray(toolsContainer)) toolsContainer.push(tool);
      else if (typeof toolsContainer === 'object') toolsContainer[tool.name] = tool;
    } catch (_) {}
  };
  // Keep toolbar toggle states in sync with current selection (Token tool)
  const refreshTokenTool = () => {
    try {
      const tokenTools = ui.controls.controls?.tokens?.tools;
      const tool = getNamedTool(tokenTools, 'pf2e-visioner-toggle-token-provide');
      if (!tool) return;
      const selected = canvas?.tokens?.controlled ?? [];
      const provideActive =
        selected.length > 0 &&
        selected.every((t) => t?.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover') !== true);
      tool.active = provideActive;
      tool.icon = provideActive ? 'fa-solid fa-shield' : 'fa-solid fa-shield-slash';
      ui.controls.render();
    } catch (_) {}
  };
  // Utility: label identifiers for selected walls on the canvas
  const refreshWallIdentifierLabels = () => {
    try {
      const walls = canvas?.walls?.placeables || [];
      const layer = canvas?.controls || canvas?.hud || canvas?.stage;
      // Clean up labels that shouldn't exist anymore
      for (const w of walls) {
        const shouldShow = !!w?.controlled && !!w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
        if (!shouldShow && w._pvIdLabel) {
          try {
            w._pvIdLabel.parent?.removeChild?.(w._pvIdLabel);
          } catch (_) {}
          try {
            w._pvIdLabel.destroy?.();
          } catch (_) {}
          delete w._pvIdLabel;
        }
      }
      // Create/update labels for currently controlled walls
      for (const w of walls) {
        if (!w?.controlled) continue;
        const idf = w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
        if (!idf) continue;
        try {
          const [x1, y1, x2, y2] = Array.isArray(w.document?.c)
            ? w.document.c
            : [w.document?.x, w.document?.y, w.document?.x2, w.document?.y2];
          const mx = (Number(x1) + Number(x2)) / 2;
          const my = (Number(y1) + Number(y2)) / 2;
          if (!w._pvIdLabel) {
            const style = new PIXI.TextStyle({
              fill: 0xffffff,
              fontSize: 12,
              stroke: 0x000000,
              strokeThickness: 3,
            });
            const text = new PIXI.Text(String(idf), style);
            text.anchor.set(0.5, 1);
            text.zIndex = 10000;
            text.position.set(mx, my - 6);
            // Prefer controls layer; fallback to wall container
            if (layer?.addChild) layer.addChild(text);
            else w.addChild?.(text);
            w._pvIdLabel = text;
          } else {
            w._pvIdLabel.text = String(idf);
            w._pvIdLabel.position.set(mx, my - 6);
          }
        } catch (_) {
          /* ignore label errors */
        }
      }
    } catch (_) {}
  };

  const refreshWallTool = () => {
    try {
      const wallTools = ui.controls.controls?.walls?.tools;
      const selected = canvas?.walls?.controlled ?? [];

      // Provide Cover toggle state (active = provides cover)
      const provideTool = getNamedTool(wallTools, 'pf2e-visioner-toggle-wall-provide');
      if (provideTool) {
        const provideActive =
          selected.length > 0 &&
          selected.every((w) => w?.document?.getFlag?.(MODULE_ID, 'provideCover') !== false);
        provideTool.active = provideActive;
        provideTool.icon = provideActive ? 'fa-solid fa-shield' : 'fa-solid fa-shield-slash';
      }

      // Hidden Wall toggle state
      const hiddenTool = getNamedTool(wallTools, 'pf2e-visioner-toggle-hidden-wall');
      if (hiddenTool) {
        const hiddenActive =
          selected.length > 0 &&
          selected.every((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
        hiddenTool.active = hiddenActive;
        hiddenTool.icon = hiddenActive ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      }

      // Also refresh identifier labels on the canvas when selection changes
      refreshWallIdentifierLabels();
      ui.controls.render();
    } catch (_) {}
  };
  Hooks.on('controlToken', refreshTokenTool);
  Hooks.on('deleteToken', refreshTokenTool);
  Hooks.on('createToken', refreshTokenTool);
  Hooks.on('updateToken', refreshTokenTool);
  Hooks.on('controlWall', refreshWallTool);
  Hooks.on('deleteWall', refreshWallTool);
  Hooks.on('createWall', refreshWallTool);
  Hooks.on('updateWall', refreshWallTool);
  for (const hook of [
    'renderTokenConfig',
    'renderPrototypeTokenConfig',
    'renderTokenConfigPF2e',
    'renderPrototypeTokenConfigPF2e',
    'renderSceneConfig',
  ]) {
    Hooks.on(hook, (app, root) => {
      try {
        injectPF2eVisionerBox(app, root);
      } catch (e) {
        console.error('[pf2e-visioner]', e);
      }
    });
  }

  // Add controls to Wall and Token tools for GM - consolidated into single hook
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;
    try {
      const groups = Array.isArray(controls) ? controls : Object.values(controls || {});
      // === WALL TOOL ADDITIONS ===
      const walls = groups.find((c) => c?.name === 'walls');
      if (walls) {
        // Wall Manager
        addTool(walls.tools, {
          name: 'pf2e-visioner-wall-manager',
          title: 'PF2E Visioner: Wall Settings',
          icon: 'fas fa-grip-lines-vertical',
          button: true,
          onChange: async () => {
            const { VisionerWallManager } = await import(
              '../managers/wall-manager/wall-manager.js'
            );
            new VisionerWallManager().render(true);
          },
        });

        // Toggle Provide Auto-Cover (Selected Walls)
        const selectedWalls = canvas?.walls?.controlled ?? [];
        addTool(walls.tools, {
          name: 'pf2e-visioner-toggle-wall-provide',
          title: 'Toggle Provide Auto-Cover (Selected Walls)',
          icon:
            selectedWalls.length > 0 &&
            selectedWalls.every((w) => w?.document?.getFlag?.(MODULE_ID, 'provideCover') !== false)
              ? 'fa-solid fa-shield'
              : 'fa-solid fa-shield-slash',
          toggle: true,
          active:
            selectedWalls.length > 0 &&
            selectedWalls.every((w) => w?.document?.getFlag?.(MODULE_ID, 'provideCover') !== false),
          onChange: async (_event, toggled) => {
            try {
              const selected = canvas?.walls?.controlled ?? [];
              if (!selected.length) return;

              // Active means walls should provide cover
              const newValue = !!toggled;
              await Promise.all(
                selected.map((w) => w?.document?.setFlag?.(MODULE_ID, 'provideCover', newValue)),
              );
              ui.controls.render();
            } catch (_) {}
          },
        });

        // Toggle Hidden Wall (Selected Walls)
        const currentHiddenState =
          selectedWalls.length > 0 &&
          selectedWalls.every((w) => !!w?.document?.getFlag?.(MODULE_ID, 'hiddenWall'));
        addTool(walls.tools, {
          name: 'pf2e-visioner-toggle-hidden-wall',
          title: 'Toggle Hidden Wall (Selected Walls)',
          icon: currentHiddenState ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye',
          toggle: true,
          active: currentHiddenState,
          onChange: async (_event, toggled) => {
            try {
              const selected = canvas?.walls?.controlled ?? [];
              if (!selected.length) return;

              if (toggled) {
                await Promise.all(
                  selected.map((w) => w?.document?.setFlag?.(MODULE_ID, 'hiddenWall', true)),
                );
              } else {
                for (const w of selected) {
                  try {
                    await w?.document?.unsetFlag?.(MODULE_ID, 'hiddenWall');
                  } catch (_) {
                    try {
                      await w?.document?.setFlag?.(MODULE_ID, 'hiddenWall', false);
                    } catch (_) {}
                  }
                }
              }
              ui.controls.render();
            } catch (_) {}
          },
        });
      }

      // === TOKEN TOOL ADDITIONS ===
      const tokens = groups.find((c) => c?.name === 'tokens' || c?.name === 'token');
      if (tokens) {
        // Quick Edit button (opens Visioner Quick Panel)
        addTool(tokens.tools, {
          name: 'pf2e-visioner-quick-edit',
          title: 'PF2E Visioner: Quick Edit (Selected ↔ Targeted)',
          icon: 'fa-solid fa-bolt',
          button: true,
          onChange: async () => {
            try {
              const { VisionerQuickPanel } = await import('../managers/quick-panel.js');
              if (!game.user?.isGM) return;
              new VisionerQuickPanel({}).render(true);
            } catch (_) {}
          },
        });
        // Toggle Provide Auto-Cover (Selected Tokens)
        const selectedTokens = canvas?.tokens?.controlled ?? [];
        addTool(tokens.tools, {
          name: 'pf2e-visioner-toggle-token-provide',
          title: 'Toggle Provide Auto-Cover (Selected Tokens)',
          icon:
            selectedTokens.length > 0 &&
            selectedTokens.every(
              (t) => t?.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover') !== true,
            )
              ? 'fa-solid fa-shield-slash'
              : 'fa-solid fa-shield',
          toggle: true,
          active:
            selectedTokens.length > 0 &&
            selectedTokens.every(
              (t) => t?.document?.getFlag?.(MODULE_ID, 'ignoreAutoCover') !== true,
            ),
          onChange: async (_event, toggled) => {
            try {
              const selected = canvas?.tokens?.controlled ?? [];
              if (!selected.length) return;

              const ignoreValue = toggled ? false : true; // active = provide cover => ignore=false
              await Promise.all(
                selected.map((t) =>
                  t?.document?.setFlag?.(MODULE_ID, 'ignoreAutoCover', ignoreValue),
                ),
              );
              ui.controls.render();
              try {
                const { updateTokenVisuals } = await import('../services/visual-effects.js');
                const allPlaceables = canvas?.tokens?.placeables ?? [];
                for (const t of allPlaceables) {
                  try {
                    await updateTokenVisuals(t);
                  } catch (_) {}
                }
              } catch (_) {}
            } catch (_) {}
          },
        });

        // Purge: clear all Visioner scene data or selected token data
        addTool(tokens.tools, {
          name: 'pf2e-visioner-purge-scene',
          title: 'PF2E Visioner: Purge Data (Scene/Selected Tokens)',
          icon: 'fa-solid fa-trash',
          button: true,
          onChange: async () => {
            try {
              const selectedTokens = canvas.tokens?.controlled ?? [];

              if (selectedTokens.length > 0) {
                // Tokens selected - offer to clear all selected tokens' data
                const tokenNames = selectedTokens.map((t) => t.name).join(', ');
                const confirmed = await Dialog.confirm({
                  title: 'PF2E Visioner',
                  content: `<p>Clear all PF2E Visioner data for <strong>${selectedTokens.length === 1 ? tokenNames : `${selectedTokens.length} selected tokens`}</strong>? This will reset all visibility and cover relationships for ${selectedTokens.length === 1 ? 'this token' : 'all selected tokens'}.</p>`,
                  yes: () => true,
                  no: () => false,
                  defaultYes: false,
                });
                if (!confirmed) return;
                const { api } = await import('../api.js');

                // Clear data for all selected tokens with comprehensive cleanup
                await api.clearAllDataForSelectedTokens(selectedTokens);
              } else {
                // No tokens or multiple tokens selected - offer to clear entire scene
                const confirmed = await Dialog.confirm({
                  title: 'PF2E Visioner',
                  content: `<p>Clear all PF2E Visioner data for this scene? This cannot be undone.</p>`,
                  yes: () => true,
                  no: () => false,
                  defaultYes: false,
                });
                if (!confirmed) return;
                const { api } = await import('../api.js');
                await api.clearAllSceneData();
              }
            } catch (e) {
              console.error('[pf2e-visioner] purge scene error', e);
            }
          },
        });
      } else {
        console.warn(
          '[pf2e-visioner] Tokens tool not found. Control groups:',
          groups.map((c) => c?.name),
        );
      }

      // When selecting walls, show wall identifier if present on the control icon tooltip
      const showWallIdentifierTooltip = async () => {
        try {
          const selected = canvas?.walls?.controlled ?? [];
          if (!selected.length) return;
          const { MODULE_ID } = await import('../constants.js');
          selected.forEach((w) => {
            try {
              const idf = w?.document?.getFlag?.(MODULE_ID, 'wallIdentifier');
              if (idf && w?.controlIcon) w.controlIcon.tooltip = String(idf);
            } catch (_) {}
          });
        } catch (_) {}
      };
      Hooks.on('controlWall', showWallIdentifierTooltip);
    } catch (_) {
      console.error('[pf2e-visioner] getSceneControlButtons error', _);
    }
  });
}

function onGetTokenDirectoryEntryContext(html, options) {
  if (!game.user.isGM) return;
  options.push({
    name: 'PF2E_VISIONER.CONTEXT_MENU.MANAGE_TOKEN',
    icon: '<i class="fas fa-eye"></i>',
    callback: async (li) => {
      const tokenId = li.data('token-id');
      const token = canvas.tokens.get(tokenId);
      if (token) {
        const { openTokenManager } = await import('../api.js');
        await openTokenManager(token);
      }
    },
  });
}

function injectPF2eVisionerBox(app, root) {
  // Scene Config injection
  try {
    if (app?.object?.documentName === 'Scene' || app?.document?.documentName === 'Scene') {
      const container = (root?.jquery ? root[0] : root) || root;
      const form = container?.querySelector?.('form') || container;
      if (form && !form.querySelector('.pf2e-visioner-scene-settings')) {
        const fs = document.createElement('fieldset');
        fs.className = 'pf2e-visioner-scene-settings';
        const scene = app?.object || app?.document || canvas?.scene;
        const current = Number(scene?.getFlag?.(MODULE_ID, 'hiddenIndicatorHalf')) || 10;
        fs.innerHTML = `
          <legend>PF2E Visioner</legend>
          <div class="form-group" style="display:flex; flex-direction:column; gap:6px;">
            <label>Hidden Wall Indicator Width (half, px)</label>
            <div style="display:flex; align-items:center; gap:8px; width:100%;">
              <input type="range" min="1" max="30" step="1" name="flags.${MODULE_ID}.hiddenIndicatorHalf" value="${current}" oninput="this.nextElementSibling.value=this.value" style="flex:1 1 auto; width:100%;">
              <output style="min-width:2ch; text-align:right;">${current}</output>
            </div>
          </div>
        `;
        try {
          const basicsTab = form.querySelector(
            'div.tab[data-tab="basic"], div[data-tab="basics"], section[data-tab="basics"], div.tab:first-child',
          );
          (basicsTab || form).appendChild(fs);
        } catch (_) {
          form.appendChild(fs);
        }
      }
    }
  } catch (_) {}

  const tokenDoc = app?.document;
  const actor = tokenDoc?.actor ?? tokenDoc?.parent;
  if (!actor) return;
  const panel = root.querySelector(`div.tab[data-group="sheet"][data-tab="vision"]`);
  if (!panel || panel.querySelector('.pf2e-visioner-box')) return;
  const detectionFS = [...panel.querySelectorAll('fieldset')].find(
    (fs) =>
      fs.querySelector('header.detection-mode') ||
      (fs.querySelector('legend')?.textContent || '').trim().toLowerCase().startsWith('detection'),
  );
  const box = document.createElement('fieldset');
  box.className = 'pf2e-visioner-box';

  // Current values
  const stealthCurrent =
    tokenDoc.getFlag?.(MODULE_ID, 'stealthDC') ?? tokenDoc.flags?.[MODULE_ID]?.stealthDC ?? '';
  const ignoreAutoCover = !!(
    tokenDoc.getFlag?.(MODULE_ID, 'ignoreAutoCover') ?? tokenDoc.flags?.[MODULE_ID]?.ignoreAutoCover
  );
  const minPerceptionRank = Number(
    tokenDoc.getFlag?.(MODULE_ID, 'minPerceptionRank') ??
      tokenDoc.flags?.[MODULE_ID]?.minPerceptionRank ??
      0,
  );

  // Build content
  let inner = `
    <legend>PF2E Visioner</legend>
    <div class="form-group">
      <label>Ignore as Auto-Cover Blocker</label>
      <input type="checkbox" name="flags.${MODULE_ID}.ignoreAutoCover" ${ignoreAutoCover ? 'checked' : ''}>
    </div>
  `;
  if (actor.type === 'loot') {
    inner += `
      <div class="form-group">
        <label>Stealth DC</label>
        <input type="number" inputmode="numeric" min="0" step="1" name="flags.${MODULE_ID}.stealthDC" value="${Number.isFinite(+stealthCurrent) ? +stealthCurrent : ''}">
      </div>
    `;
  }
  if (actor.type === 'hazard' || actor.type === 'loot') {
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

  if (detectionFS) detectionFS.insertAdjacentElement('afterend', box);
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
    const hiddenWallsEnabled = !!game.settings.get(MODULE_ID, 'hiddenWallsEnabled');
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
    const doorHeader = Array.from(form.querySelectorAll('label, h3, header, legend')).find((el) =>
      (el.textContent || '').toLowerCase().includes('door configuration'),
    );
    if (doorHeader && doorHeader.parentElement)
      doorHeader.parentElement.insertAdjacentElement('beforebegin', fs);
    else form.appendChild(fs);

    // Bind quick settings button
    try {
      const btn = fs.querySelector('[data-action="open-visioner-wall-quick"]');
      if (btn)
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const { VisionerWallQuickSettings } = await import(
            '../managers/wall-manager/wall-quick.js'
          );
          new VisionerWallQuickSettings(app.document).render(true);
        });
    } catch (_) {}
  } catch (_) {}
}

// Removed: onGetSceneControlButtons for a separate 'visioner' control group
