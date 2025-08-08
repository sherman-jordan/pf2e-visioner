# PF2E Visioner – Full Feature Overview

PF2E Visioner is a visibility and perception toolkit for Foundry VTT’s PF2E system. It lets you control what every creature can see, automates PF2e visibility-changing actions, and provides clean UX for GMs and players.

Support: [https://ko-fi.com/roileaf](https://ko-fi.com/roileaf)

---

## ✅ Requirements

- Foundry VTT v13.341+
- PF2e System v6.0.0+
- Recommended: socketlib (for cross-client perception refresh)

---

## 🔌 Installation

1) Install the module in Foundry’s Add-on Modules.
2) Enable it for your world.
3) Configure world settings (Game Settings → Module Settings → PF2E Visioner).

---

## 🔍 Core Capabilities

### Per‑Observer Visibility States

- Visibility is tracked for each observer→target pair.
- States: Observed, Concealed, Hidden, Undetected.
- State data lives in token flags; it’s robust across reloads and scenes.

### Visibility Manager UI

- Modern ApplicationV2 UI with responsive layout and fixed controls.
- Color-coded rows, hover to highlight tokens on the canvas, sortable table.
- “Apply All” and “Revert All” flows with per‑row apply/revert.

### Visual Feedback

- Token overlays/filters reflect current visibility.
- Smooth transitions when states change.
- Hover tooltips communicate “how this token sees others” or “how others see this token” depending on mode.

---

## 🫠 PF2E Action Automation

Visioner augments PF2e chat cards with buttons that open result dialogs and apply changes safely.

### Actions Covered

- Seek
- Hide
- Sneak
- Point Out
- Create a Diversion
- Damage Consequences (post‑damage visibility updates for hidden/undetected attackers)

### Shared Dialog Features

- Preview changes before applying
- Encounter filtering toggle
- Outcome/margin display
- Per‑row apply/revert and bulk actions

### Chat Automation Behavior (GM‑first, player‑safe)

#### Seek

- With setting “Use Seek Template” ON:
  - GM and players get “Setup Seek Template”.
  - Player‑placed templates create a GM‑side pending request. GM sees “Open Seek Results” only when the area contains valid targets; otherwise GM sees no button. Using a template disables range limits.
  - GM‑placed templates open the dialog immediately.
- With the setting OFF: GM sees “Open Seek Results”; players see nothing.
- Optional range limits (in/out of combat) apply when not using a template.

#### Point Out

- Players do not see a Point Out button.
- Player Point Out auto‑forwards to GM:
  - GM sees “Open Point Out Results” only if allies will benefit; otherwise no button is shown.
  - One‑Ping Rule: ping once on GM receipt (not on dialog open). GM‑initiated Point Out pings when opening.
- Results set allies’ visibility of the target to Hidden (PF2e rules).

#### Hide / Sneak / Create a Diversion

- Open result dialogs from chat.
- Visioner detects applicable tokens (filtered by allies/enemies setting and encounter filter).
- Apply/revert changes per‑row or in bulk.

#### Damage Consequences

- When a hidden/undetected creature deals damage, a red dialog appears to apply resulting visibility changes following PF2e guidance.

---

## 🧠 Off‑Guard Automation

- Applies off‑guard where appropriate based on Hidden/Undetected relationships.
- Visuals refresh immediately after changes.

---

## 🛠 Settings (World unless noted)

- Enable Hover Tooltips (client): show token visibility tooltips.
- Allow Player Tooltips (world): allow players to see hover tooltips from their perspective.
- Tooltip Font Size (client): scale tooltip text.
- Colorblind Mode (client): alternate palettes (Protanopia, Deuteranopia, Tritanopia, Achromatopsia).
- Ignore Allies (world): reduce dialog clutter by filtering same‑side tokens (PC↔PC, NPC↔NPC) when appropriate.
- Default Encounter Filter State (world): dialogs start filtered to encounter tokens when combat is active.
- Use Seek Template (world): enable template placement flow for Seek.
- Limit Seek Range in Combat / Out of Combat (world): cap range when not using a template.
- Seek Range Value / Out of Combat (world): range distances (ft).
- Use Token HUD Button (world): adds a quick access button on token HUD.
- Block Target Tooltips for Players (world): disable “target‑perspective” tooltips for players.
- Debug (world): verbose logging for troubleshooting.

---

## ⌨️ Keybindings

- Open Visibility Manager: Ctrl+Shift+V
- Toggle Observer Mode for Hover Tooltips: O (hold to switch to observer mode; release to return to target mode)

---

## 🔧 Developer API (minimal)

```js
const api = game.modules.get('pf2e-visioner')?.api;
await api?.openVisibilityManager(token);
```

- getVisibility(observerId, targetId)
- setVisibility(observerId, targetId, state)
- updateTokenVisuals(token?)
- getVisibilityStates()

See `scripts/api.js` for the current surface.

---

## 🧩 Rule Elements

Visioner ships a `PF2eVisionerVisibility` rule element for item‑driven visibility. See `RULE_ELEMENTS.md` for schema, fields, and examples.

---

## 🔧 Troubleshooting

- No button on chat card?
  - For Seek: ensure a valid template was placed (if template mode is ON), or that range limits allow targets.
  - For Point Out: the GM only sees a button if allies will benefit.
- Socketlib missing? Cross‑client perception refresh will not broadcast; only local canvas refreshes.
- Already‑open chat message? The GM panel re‑renders on player handoff; if you still don’t see updates, refocus the message or toggle the chat log.

---

## 💪 Stability & Compatibility

- Foundry VTT v13.341+
- PF2e System v6.0.0+
- ESModules, libWrapper integration, responsive CSS

---

## 📆 Recent Enhancements

- Rule Element support for item‑based visibility effects.
- Colorblind mode and tooltip improvements.
- Player tooltip restrictions and pattern indicators.
- Damage Consequences dialog.
- Seek Template flow with GM gate, player template handoff, and “no targets → no button”.
- Point Out flow rework with robust target resolution and single‑ping rule.
- UI polish: scrollbars, scaling, initiative‑aware ephemeral durations.

---

## 📜 License & Credits

- MIT. See `LICENSE`.
- PF2e system: community‑maintained; see their repository for credits.
- Special thanks to contributors and testers.
