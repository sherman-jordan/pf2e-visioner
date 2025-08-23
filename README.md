[![Latest Version](https://img.shields.io/github/v/release/roi007leaf/pf2e-visioner?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/roi007leaf/pf2e-visioner/releases/latest)

![Latest Downloads](https://img.shields.io/github/downloads/roi007leaf/pf2e-visioner/latest/total?color=blue&label=latest%20downloads)

# PF2E Visioner – Full Feature Overview

PF2E Visioner is a visibility and perception toolkit for Foundry VTT’s PF2E system. It lets you control what every creature can see, automates PF2e visibility-changing actions, and provides clean UX for GMs and players.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/roileaf)

---

## ✅ Requirements

- Foundry VTT v13.341+
- PF2e System v6.0.0+
- Recommended: socketlib (for cross-client perception refresh)

---

## 🔌 Installation

1. Install the module in Foundry’s Add-on Modules.
2. Enable it for your world.
3. Configure world settings (Game Settings → Module Settings → PF2E Visioner).

---

## 🔍 Core Capabilities

### Per‑Observer Visibility States

- Visibility is tracked for each observer→target pair.
- States: Observed, Concealed, Hidden, Undetected.
- State data lives in token flags; it’s robust across reloads and scenes.

### Per‑Observer Cover States

- Cover is tracked for each attacker→target pair.
- States: None, Lesser (+1), Standard (+2), Greater (+4).
- Cover data is stored per pair and only applied to mechanics at roll time (see Auto Cover below).

### Token Manager UI (Visibility & Cover)

- Modern ApplicationV2 UI with responsive layout and fixed controls.
- Color-coded rows, hover to highlight tokens on the canvas, sortable table.
- “Apply All” and “Revert All” flows with per‑row apply/revert.
- Cover and visibility tabs use consistent iconography and colors.

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

## 🛡️ Auto Cover & Roll Overrides

When enabled, Visioner evaluates cover between the acting token and its current target and applies the appropriate bonus to the target’s AC for that roll only.

### How it works

- On attack/spell-attack rolls, Visioner computes cover just-in-time and injects a one‑shot effect to the target so the DC/AC reflects the chosen cover.
- After the roll’s chat message renders, Visioner cleans up any one‑shot cover effect.
- If a token moves during an active attack flow, Visioner clears any previously applied cover; re‑evaluation happens at the moment of rolling.

### Modifiers dialog (with dialog open)

- GMs see a “Visioner Cover Override” row with four icon buttons: None, Lesser, Standard, Greater.
- The auto-calculated state is highlighted; click another icon to override for that roll.
- Uses Visioner’s shield icons and colors throughout the module.

### Quick rolls (no dialog)

- Bind a key in Controls to: “Hold to Override Cover on Quick Rolls” (no default binding).
- Hold that key while clicking a strike to open a compact override window (AppV2) with the same four icons and a Roll button.
- Pick a cover; Visioner applies it for that roll and then cleans up automatically.

### Auto‑Cover options (world settings)

- Enable Auto‑Cover: master toggle.
- Token Intersection Mode: how token blockers count (Center, ≥10%, ≥20%).
- Ignore Undetected Blockers: attackers ignore blockers they can’t detect per Visioner visibility map.
- Ignore Dead Tokens: skip 0‑HP blockers.
- Ignore Allies: skip same‑alliance blockers.
- Respect Token Ignore Flag: tokens with `flags.pf2e-visioner.ignoreAutoCover = true` won’t provide cover.
- Prone Tokens Can Block: when off, prone tokens are skipped as blockers.

Notes:

- Auto‑Cover is GM‑only to avoid duplicates.
- Cover application is transient; Visioner stores the computed state for UI consistency but only adjusts mechanics during the roll.

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
- Auto‑Cover (world): enable Visioner’s cover evaluation and roll‑time application.
- Auto‑Cover: Token Intersection Mode (world): Center / ≥10% / ≥20%.
- Auto‑Cover: Ignore Undetected / Ignore Dead / Ignore Allies / Respect Token Ignore Flag / Prone Tokens Can Block.
- Debug (world): verbose logging for troubleshooting.

---

## ⌨️ Keybindings

- Open Visibility Manager: Ctrl+Shift+V
- Toggle Observer Mode for Hover Tooltips: O (hold to switch to observer mode; release to return to target mode)
- Hold to Override Cover on Quick Rolls: unbound by default; configure in Controls. Hold while clicking a strike to open the quick cover override window.

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
- getCoverBetween(observerId, targetId)
- setCoverBetween(observerId, targetId, state)
- getCoverStates()

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
- Auto‑Cover with roll‑time application and instant cleanup.
- Modifiers dialog cover override row with icon buttons.
- Quick‑override mini dialog (AppV2) triggered by a configurable hold key.
- Movement clears pre‑applied cover; re‑evaluation happens on roll.

---

## 📜 License & Credits

- GPL-3.0 license. See `LICENSE`.
- PF2e system: community‑maintained; see their repository for credits.
- Special thanks to contributors and testers.
