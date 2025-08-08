# PF2E Visioner – Full Feature Overview

**PF2E Visioner** is a powerful, modular token management system for Foundry VTT tailored to the Pathfinder Second Edition (PF2E) ruleset. It provides GMs with complete control over how each token perceives others (visibility) and their cover status, integrating deeply with PF2E's visibility and cover mechanics.

Support the project on Ko-fi: [https://ko-fi.com/roileaf](https://ko-fi.com/roileaf)

---

## 🔍 Core Features

### Per-Token Visibility Control

* Assigns visibility state per observer-target pair.
* Visibility states: **Observed**, **Concealed**, **Hidden**, **Undetected**.
* Independent perception per creature.
* Data stored in modern token flags.

### Per-Token Cover Control

* Assigns cover state per observer-target pair.
* Cover states: **None**, **Lesser** (+1 AC), **Standard** (+2 AC/Reflex/Stealth), **Greater** (+4 AC/Reflex/Stealth).
* Independent cover assessment per creature.
* Data stored in modern token flags.

### Interface

* Based on **ApplicationV2** with modern layout.
* Tabbed interface for **Visibility** and **Cover** management.
* Responsive UI with fixed headers/footers.
* Sortable, color-coded tables for both visibility and cover.
* Always-visible controls with clean separation.

### Visual Indicators

* Tokens are visually altered based on visibility:

  * Transparency, outlines, icons, effects.
* Cover indicators show current cover status with icons and colors.
* Smooth animated transitions between states.
* Tooltips show perception and cover from selected/hovered tokens.

---

## 🫠 PF2E Ruleset Integration

### Action Dialogs

* Complete automation for the following actions:

  * **Seek**
  * **Sneak**
  * **Hide**
  * **Point Out**
  * **Create a Diversion**
  * **Damage Consequences** (new red dialog)
* Dialogs feature:

  * Preview and outcome resolution
  * Smart button toggles
  * Range and DC validation
  * Scrollable token tables with hover highlights

### Off-Guard Automation

* Applies off-guard condition when appropriate based on hidden/undetected status.
* Effects update immediately after combat actions.

### Range Enforcement

* Configurable Seek range (default 30 ft in combat).
* Notifications when targets are out of range.

---

## 🌈 Accessibility & UX

### Colorblind Mode

* Modes: Protanopia, Deuteranopia, Tritanopia, Achromatopsia.
* Pattern-based indicators in addition to color.
* Individual client setting.

### Tooltip Controls

* Players only see tooltips for controlled tokens.
* GMs can toggle tooltip perspectives with Alt/O keys.
* Setting to block player tooltips entirely.

### Customization

* Adjustable tooltip font size.
* Per-client storage of preferences.
* Ignore allies setting (players vs. NPCs visibility separation).

---

## 🚀 Rule Element System (v0.8.0+)

### `PF2eVisionerVisibility` Rule Element

* Controls visibility dynamically using item-based effects.
* Fields:

  * **subject**, **observers**, **mode**, **status**, **direction** (TO/FROM).
  * Supports: `set`, `increase`, `decrease`, `remove`.
  * Observer types: `all`, `allies`, `enemies`, `selected`, `targeted`.
  * Includes duration and range limitations.
* Applies ephemeral effects to subject tokens.
* Full schema validation with examples included.

---

## 🔧 Developer API

```js
const api = game.modules.get("pf2e-visioner").api;
```

### Functions

* `getVisibility(observerId, targetId)`
* `setVisibility(observerId, targetId, state)`
* `openVisibilityManager(token)`
* `updateTokenVisuals()`
* `getVisibilityStates()`

### Integration

* Ephemeral effects
* Sockets for multiplayer updates
* Rule automation hooks

---

## 💪 Stability & Compatibility

* Foundry VTT v13.341+
* PF2E System v6.0.0+
* Written in ESModules with full JSDoc documentation
* Responsive CSS and CSS layers
* Verified cross-browser layout and scrolling behavior
* Compatible with other PF2E modules (via libWrapper)

---

## 📆 Recent Enhancements (v1.0.0)

* Rule Element support for item-based visibility effects.
* Colorblind mode for improved accessibility.
* Player tooltip restrictions and pattern indicators.
* Damage Consequences Dialog for visibility state changes after hidden attacks.
* Smarter dialog conditions, range validation, and token filtering.
* Enhanced scrollbar themes, tooltip scaling, and combat initiative-based ephemeral durations.
