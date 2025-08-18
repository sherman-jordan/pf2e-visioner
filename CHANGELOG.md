# Changelog

## [2.5.2] - 2025-08-17

### Added

- Take cover: support converting system effect to visioner one

### Fixed

- Tooltips: fixed all hover tooltips state and keyboard tooltips states (should be much more stable) 
- Familiars will not be filtered when the encounter filter is turned on


## [2.5.1] - 2025-08-17

### Fixed

- Seek Action: when changing system condition to visioner, change it also to any player that doesnt have it's own visioner flag with the target

## [2.5.0] - 2025-08-17

### Added

- Quick panel:
  - Compacted the design a bit
  - Added minimize button to keep it handy when you need it
  - Added a keybind to open and close quick panel (default Ctrl-Shift-Q)
- Hidden walls:
  - Per scene wall indicator width slider
- Seek Action:
  - Support system conditions -> if a token has been set with a system condition (hidden\undetected) and the seek dialog is opened
    visioner will replace the system condition with it's own flags and reflect that in the results
- API:
  - Add getAutoCoverState function between a token and a target
- Enforce RAW:
  - Will now utilize auto cover(if turned on) to pass the prequisite for hide
- Hide:
  - New setting to add auto cover to the dialog (it will reduce dc instead of adding modifiers to the roll , default off)

### Fixed

- Seek Action: Hidden walls now properly appear in Seek template results
  - Template filtering now works correctly for both tokens and walls

### Changed

- Quick panel:
  - removed refresh button, now refreshes automatically when adding\removing selected tokens and adding\removing targeted tokens

## [2.4.0] - 2025-08-16

### Added

- Hidden walls support:
  - Turn on in the settings
  - Wall config -> under visioner settings turn on hidden wall checkbox
    - This will make the wall appear in the visibility manager and seek dialog
  - Set DC if you want
  - Walls auto start as hidden for tokens
  - Seek to discover wall
  - Hidden walls will light up purple and hidden doors and secret doors will light up yellow
  - EXPERIMENTAL: See through hidden walls you can observe!
- Quick panel in visioner tool -> accepts selected tokens and targets an able to set visioner relationship changes quickly between them
- Hidden wall toggle in visioner tool

### Fixed

- Added abunch of apply changes buttons that were missing in actions
- Diversion outcome column populated again

### Changed

- Removed button title, was not needed honestly

## [2.3.1] - 2025-08-16

### Changed

- Settings menu: saving now preserves values from unvisited tabs. Only submitted or previously edited fields are persisted; untouched settings are no longer reset.
- Added opt in for enable all tokens vision

### Fixed:
- Dialogs: fixed apply changes missing for sneak.

## [2.3.0] - 2025-08-15

### Added

- Proficiency rank requirement for Seeking hazards and loot (token config). Seek will show "No proficiency" when the seeker's rank is too low and keep DC/override controls.
- Keybind to show current calculated Auto‑Cover from all tokens (default G). Press to display cover‑only badges; release to clear.
- Mystler Sneak RAW setting (default off) to enforce RAW outcome for Sneak.
- New settings structure with category tabs and an emphasized Auto‑Cover section.
- Add keybind to open token manager in the opposite mode (@Eligarf)
- polish translation (@Lioheart)

### Changed

- Ignore Allies is now per‑dialog (Seek/Hide/Sneak); the global setting only defines the default checkbox state.

### Fixed

- Hide dialog: restored missing "Apply Changes" button.
- Token Manager: fixed scrolling to the bottom when selecting a token; selected row stays in view.
- Now scrolls to bottom after injecting buttons in chat

## [2.2.0] - 2025-08-15

### Added

- Auto cover:
  - New `Token Intersection Mode: Coverage` that maps ray coverage across a blocking token to cover tiers using configurable thresholds.
    - Standard at ≥ `Auto-Cover: Standard Cover at ≥ %` (default 50)
    - Greater at ≥ `Auto-Cover: Greater Cover at ≥ %` (default 80)
  - Visioner tool: Consolidated GM controls to Ignore/Restore Auto-Cover on selected walls and tokens (highlighted when active).
    - Clear Cover (Target/Observer mode)
    - Make Observed (Target/Observer mode)
  - Hazard/Loot: Minimum Perception Proficiency (token config) required to detect (Untrained–Legendary). Enforced in live detection and Seek.
  - Seek results now always include hazards/loot (subject to template/distance filters). Below-rank entries show outcome "No proficiency", display the correct DC, and still provide override buttons.
  - Auto-cover dependents are hidden unless Auto-cover is enabled.
  - Coverage thresholds only shown when mode = Coverage.
  - Seek: hides both limit checkboxes and distance fields when “Use Template” is enabled; distance fields only shown when their respective limit toggles are on.
  - Tooltips: hides “Block Player Target Tooltips” unless “Allow Player Tooltips” is enabled; hides “Tooltip Font Size” unless “Enable Hover Tooltips” is enabled.

### Changed

- Auto-cover internals refactored into strategy helpers for readability and maintainability.
- Check roll integration now uses a libWrapper WRAPPER when available to avoid conflicts with PF2E Ranged Combat.
- Token and Wall toolbar in visioner tool toggles now reflect the currently selected documents and stay in sync on selection changes.

## [2.1.3] - 2025-08-13

### Fixed

- Auto cover:
  - respect metagaming ac reveals
  - Walls sidebar tool: added GM toggle to Ignore/Restore Auto-Cover for selected walls
  - new settings: coverage thresholds to map ray coverage across a blocking token to lesser/standard/greater

## [2.1.2] - 2025-08-12

### Fixed

- Auto cover:
  - allow players to set keybinds


## [2.1.1] - 2025-08-12

### Fixed

- Auto cover:
  - players could not see override controls
  - dialog height was weird


## [2.1.0] - 2025-08-12

### Added

- Auto cover:
  - now lets you override the cover applied to a roll in the roll dialog
  - now lets you set keybind that if held will let you override cover for the roll (for people that dont use roll dialog, you maniacs)

## [2.0.1] - 2025-08-12

### Fixed

- Auto cover:
  - now works with and without roll dialog
  - now gets reevaluated on token movement
  - walls intersection algorithm tuned to better check
  - removed any and cross modes

## [2.0.0] - 2025-08-12

### Breaking - Full Internal Rewrite and Module Restructure

- Project reorganized and rewritten for clarity and performance.

### Added

- Auto Cover (reworked):
  - Applies cover only if the line from attacker to target passes through a blocking token’s space.
  - Lesser vs Standard cover determined by relative size (blocking token ≥ 2 size categories larger => Standard).
  - Applies pre-roll via modifiers dialog or strike click capture; clears cover immediately after the roll’s message renders.
  - Multi-side evaluation: checks all token sides for walls; tokens use center-to-center line for accurate blocking.
  - Intersection mode for token blockers: new setting “Auto-Cover: Token Intersection Mode” with choices:
    - Any (default): center line intersecting any token edge counts.
    - Cross: center line must cross both opposite edges (top+bottom or left+right).
  - Ignore undetected blockers: new setting “Auto-Cover: Ignore Undetected Tokens” (skip blockers undetected to the attacker per Visioner map).
  - Respect token flag: new setting “Auto-Cover: Respect Token Ignore Flag”; if enabled, tokens with `flags.pf2e-visioner.ignoreAutoCover = true` will be ignored.
  - New token setting in vision tab: ignore as auto cover blocker.
  - Wall-level toggle: per-wall flag `flags.pf2e-visioner.provideCover` (when false) makes that wall not contribute to cover. Default set to true.
  - New wall setting: ignore as auto cover.
  - Prone blockers toggle: new setting “Auto-Cover: Prone Tokens Can Block” (default on). If disabled, tokens with a Prone condition won’t provide cover.
  - Ally/dead filters: existing settings integrated into auto-cover token filtering (ignore allies, ignore 0-HP tokens).
  - Gated by setting and enabled GM-only to avoid duplicates.
  - Auto-Cover live recompute: cover now recalculates when attacker or target moves/resizes during an active roll flow.
  - Auto-Cover blocker options:
    - Any (default)
    - Cross (ray must cross both opposite edges)
    - Ray through token center
    - Ray inside ≥10% of blocking token square
    - Ray inside ≥20% of blocking token square
  - Wall-level toggle: per-wall flag `flags.pf2e-visioner.provideCover` to exclude walls from cover.
  - Token UI: Ignore as Auto-Cover Blocker flag in Token Config Vision tab.
- Take cover action support
- Grouped Settings menu (ApplicationV2), scrollable, localized labels, and reliable select persistence.


- Seek Template and Range Improvements (stabilized from 1.x):
  - Strict filtering by player template (no generic fallback template).

- Chat Automation Quality of Life:
  - Point Out excludes loot, pings target on Apply.
  - Sneak lists only enemies (no allies).
  - Hide prerequisites enforced (concealed or standard/greater cover) and “No changes to apply” notification when relevant.
  - Players don’t see Apply buttons in panels.

- API:
  - Bulk visibility setter to apply many observer→target updates efficiently.

### Changed

- No more world reloads for several settings; they are now applied at runtime:
  - Ignore Allies, Seek template toggle, Seek range toggles, player tooltip toggles, auto cover.
- Hook registration centralized under `scripts/hooks/` with small registrars; heavy logic moved to feature folders.
- Imports largely hoisted to top-of-file for maintainability; kept dynamic imports only where lazy-loading is beneficial (dialogs, heavy batches).

### Fixed

- Hide action now respects the Ignore Allies setting (allied observers are filtered out).
- Auto Cover reliably applies to the current roll and then cleans up; prevents lingering effects.
- Template-based Seek respects only targets inside the player’s template and opens faster via sockets.
- Token Manager batch operations reconciled effects reliably and reduced redundant document operations.
- Sneak integration showing up on sneak attack damage rolls.

### Removed

- Legacy/unused files and integration paths related to the old effects coordinator code.

## [1.9.0] - 2025-08-11

### Added
- Stealth for loot tokens: Added possibility to hide loot from specific tokens and finding them with seek!
- Stealth DC override for loot tokens in Token Config:
  - Injected a Stealth DC number field into the Vision tab for loot actors.
  - Added a dedicated “PF2E Visioner” tab fallback for loot tokens when available.

### Changed

- Seek and Token Manager now respect the token-level Stealth DC override for loot tokens, falling back to the world default when unset.
- Removed Cover and visibility integration, rules will now explicitly follor enforce RAW setting

## [1.8.0] - 2025-08-11

### Added

- API: `api.clearAllSceneData()` to clear all per-token visibility/cover maps and all module-created effects across the scene, then rebuild and refresh visuals.
- Macros added:
  - Clear All Scene Data (calls `api.clearAllSceneData()`)
  - Open Token Manager(calls `api.openTokenManager()`)

### Improved

- Effects handling: will now use batching for better performance

## [1.7.1] - 2025-08-11

### Changed

- Enhanced tooltip size customization: Improved implementation of tooltip font size setting
- Added proper scaling of tooltip icons based on font size
- Added CSS variables for consistent tooltip sizing across all components
- Better responsiveness for tooltip elements at different font sizes

### Fixed

- Tooltips should now stick and not move with the canvas

## [1.7.0] - 2025-08-10

### Added

- Enforce RAW Setting: When disabled (default) will skip some conditions checks
- Multiple rules per effect: Instead of multiple effects, the module will now handle one effect with multiple rules per state

### Improved

- Memory optimization: Batch processing for visibility changes to reduce heap usage
- Token deletion cleanup: Automatically remove deleted tokens from visibility maps, visibility effects, and cover effects
- Performance: Optimized effect creation and updates to use bulk operations instead of individual promises
- Efficiency: Replaced Promise.all loops with direct bulk document operations for better memory usage
- Performance: Completely redesigned effect updates to batch all operations by state and effect type
- Performance: Implemented batched visibility and cover updates in token manager to drastically reduce individual updates
- UI Improvement: "Apply Current" now applies the current type (visibility or cover) for both observer and target modes
- UI Improvement: "Apply Both" now applies both types (visibility and cover) for both observer and target modes
- UI Improvement: Visibility Manager now closes immediately when applying changes and shows a progress bar
- Performance: Optimized cover effects system with bulk operations for better memory usage

### Fixed

- Chat Automation: Fixed encounter filtering not working properly for all actions (Seek, Point Out, Sneak, Hide, Create a Diversion, Consequences)
- Chat Automation: Fixed issue where players couldn't see the Seek template setup button when no valid targets were detected

## [1.6.1] - 2025-08-10

### Fixed

- Token Manager: Cover should now support highlight and go to row as well

## [1.6.0] - 2025-08-10

### Added

- Chat Automation: Added Apply Changes / Revert Changes to the automation panel for all actions

## [1.5.1] - 2025-08-10

### Changed

- Matching color for dialog theme on highlight row

## [1.5.0] - 2025-08-10

### Added

- Token Manager: Replaced Effects column with DC column in the Visibility tab.
  - Target mode shows Perception DC; Observer mode shows Stealth DC.
- New world setting: "Integrate roll outcome in the token manager".
  - Optional Outcome column compares the last relevant roll to the DC and displays degree-of-success (Success, Failure, Critical Success/Failure).
- Selection-based row highlighting across Token Manager and all action dialogs (Seek, Hide, Sneak, Create a Diversion, Point Out, Consequences):
  - Selecting tokens on the canvas highlights matching rows and auto-scrolls them into view.

### Changed

- Moved effects descriptions into the Current State tooltip.
- Unified PC and NPC table widths; responsive colgroups when Outcome is on/off.
- Outcome chip style matches action dialogs.
- If Outcome is enabled, the manager widens on open to ensure the column is visible.
- Removed hover-based row→token and token→row behavior to avoid conflicts; selection now drives row highlighting.

### Fixed

- Correct DC tooltip text and header alignment.
- Layout glitches when Outcome is disabled.

## [1.4.0] - 2025-08-09

### Added

- Hover tooltips now show Font Awesome icon badges aligned above tokens:
  - Left badge: visibility state icon
  - Right badge: cover icon when applicable
- PF2e hud support for tooltip position

### Changed

- Hover tooltips no longer render text labels; icons are used for a cleaner, compact look.
- Badge positioning uses world-to-screen transforms, keeping alignment stable under zoom/pan.
- Create a Diversion discovery now considers both observed and concealed creatures as valid observers, and outcomes display only those who can currently see the diverter.
- Hide possible when token got observers and is concealed OR (has standard OR great cover)
- Effects will show token name rather than actor

### Fixed

- Token Manager: resolved ReferenceError for `pairs2` in target-mode apply flows.
- Tooltip cleanup reliably removes DOM badges to prevent lingering elements after hover/Alt/O.

## [1.3.3] - 2025-08-09

### Fixed

- Damage Consequences: Only list targets that explicitly have the attacker as Hidden/Undetected; removed global condition fallback.
- Damage Consequences button is hidden when no outcomes exist and shown when at least one target qualifies.
- Token Manager/Visibility Manager: Reworked layout to a single outer scroll container; inner tables no longer create nested scrollbars.
- Sticky footer no longer overlaps content; center area flexes and scrolls correctly.

## [1.3.2] - 2025-08-09

## Fixed

- CSS class overrding default system one (sorry!)

## [1.3.1] - 2025-08-08

### Added

- New world setting: Integrate Cover with Visibility Rules (`integrateCoverVisibility`). When enabled, certain actions obey cover prerequisites. Specifically, Hide is only available if the acting token has at least Standard Cover from an observer.

### Changed

- Chat automation now hides the “Open Hide Results” button when no actionable changes are possible after applying visibility and cover checks (and the actual roll outcome when present).
- Hide observer discovery uses the same cover gating as the UI check to ensure consistency.

---

## [1.3.0] - 2025-08-08

### Visioner Token Manager (Visibility & Cover)

- Reworked Apply actions:
  - Apply Current now applies the active type (Visibility or Cover) for BOTH modes (Observer → Targets and Targets → Observer).
  - Apply Both now applies BOTH types for BOTH modes in one click.
- States persist reliably after changing type:
  - All map writes now merge into existing maps instead of overwriting.
  - Writes use `document.update({ flags... })` for stability.
  - Dialog refresh re-reads maps from flags on each render.
- Corrected table sorting per type (ally\npc):
  - Visibility order: Observed → Concealed → Hidden → Undetected.
  - Cover order: None → Lesser → Standard → Greater.

All notable changes to the PF2E Visioner module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2025-08-08

### Fixed

- **Hide/Sneak/Create a diversion/Consequences Buttons**: Restored functionality of "Open Hide Results" and "Open Sneak Results" buttons in chat. Clicking now opens their preview dialogs as expected.
- **Generic Open Actions**: Added unified handling for other `open-*` actions (e.g., Create a Diversion, Consequences) for improved resilience.

## [1.2.1] - 2025-08-08

### Changed

- **Seek Template Player Logic**: Players will now be able to put their own seek templates, letting GMs open the results nicely
- **Point out Player Logic**: Players are now able to point out themselves, letting the GM open the results nicely, added ping on the pointed out token

## [1.2.0] - 2025-08-08

### Added

- **Seek via Template (30 ft Burst)**: Optional template-based Seek targeting
  - New setting to enable template mode for Seek
  - “Setup Seek Template” button in chat lets you place a 30 ft burst anywhere with live preview
  - Tokens inside the template are considered for Seek; edge intersections count
  - Button toggles to “Remove Seek Template” after placement

### Changed

- **Range Limitation Logic**: When using a template, combat/non-combat Seek distance limits are fully ignored
- **Colors**: Template colors use the current player's color; fallback to themed defaults

---

## [1.1.0] - 2025-08-08

### Added

- **Out of Combat Seek Distance Limitation**: Implemented distance limitations for Seek actions outside of combat
  - GMs can now configure maximum distance for out-of-combat Seek attempts
  - Distance is calculated automatically between seeker and potential targets
  - Setting can be adjusted in module configuration

## [1.0.2] - 2025-08-07

### Fixed

- **Visibility Manager Actor Image**: Fixed an issue with actor images

## [1.0.1] - 2025-08-07

### Fixed

- **Visibility Manager Mode Switching**: Fixed issue where toggling between observer and target mode would reset changes made in the previous mode
  - Changes in both modes are now preserved when toggling between modes
  - Apply Changes button now applies changes from both observer and target modes
- **Point Out Action**: Improved Point Out action to work when the pointer can see the target in any visibility state (observed, concealed, or hidden)

## [0.8.0] - 2025-08-10

### Added

- **Rule Element Initial Support**: Added custom rule element for controlling visibility states
  - Implemented PF2eVisionerVisibility rule element with direction control (TO/FROM)
  - Added schema with configurable options for subject, observers, mode, and status
  - Supports multiple observer types: all, allies, enemies, selected, targeted
  - Includes various modes: set, increase, decrease, remove
  - Provides duration control and range limitations
  - Effects are placed on the subject token for consistent behavior
  - Added comprehensive documentation and example items

### Fixed

- **Unification**: Matching colors through all dialogs for the visibility states

## [0.7.0] - 2025-08-08

### Added

- **Colorblind Mode**: Added accessibility option for different types of colorblindness
  - Multiple colorblind modes: Protanopia, Deuteranopia, Tritanopia, and Achromatopsia
  - Client-side setting that can be set individually by each user
  - Adds visual indicators and alternative color schemes for better visibility
  - Includes pattern indicators to help differentiate visibility states beyond color

### Fixed

- **Create a Diversion Button**: Fixed issue where the Create a Diversion button would appear even when there were no valid targets (creatures that can see the actor)
- **Create a Diversion Dialog**: Fixed issue where the Create a Diversion dialog would not open when clicking the button
- Added notification when attempting to use Create a Diversion with no valid targets
- Added detailed logging for Create a Diversion actions to help with troubleshooting

## [0.6.1] - 2025-08-07

### Changed

- **Improved Dialog Visibility Logic**: Dialog buttons now only appear when there are valid targets for actions, avoiding unnecessary notifications for all dialog types (Seek, Point Out, Hide, Sneak, Create a Diversion, and Consequences)

## [0.6.0] - 2025-08-07

### Added

- **Damage Consequences Dialog**: Added red-themed dialog that appears when a hidden or undetected token makes a damage roll, allowing the GM to update visibility states of affected targets

## [0.5.0] - 2025-08-07

### Added

- **Block Target Tooltips for Players**: Added setting to prevent players from seeing target tooltips when hovering over tokens, while still allowing them to see tooltips when holding O key or pressing Alt

## [0.4.0] - 2025-08-07

### Added

- **Custom Tooltip Size**: Added slider control for adjusting tooltip font size
- **Client-side Setting**: Font size preference is stored per-user rather than globally
- **Responsive Sizing**: Tooltip components scale proportionally with font size changes

## [0.3.0] - 2025-08-07

### Added

- **Custom Seek Distance**: Added configurable distance setting for Seek range limitation
- **Settings Organization**: Improved settings layout with logical grouping for better usability
- **Enhanced Notifications**: Updated range limit messages to show the custom distance

## [0.2.18] - 2025-08-06

### Improved

- **Dialog Layout**: Added scrollable table with fixed footer to action dialogs for better usability with many tokens
- **Dialog Sizing**: Fixed dialog height and scrolling behavior to ensure proper display of large result sets
- **Table Scrolling**: Enhanced table container to properly handle overflow with fixed headers and footers
- **Cross-Browser Compatibility**: Added JavaScript-based scrolling fixes for better cross-browser support
- **Direct DOM Manipulation**: Added dedicated scroll fix module that applies direct DOM styling to ensure consistent scrolling behavior across all browsers and Foundry versions
- **Themed Scrollbars**: Added color-matched scrollbars for each action dialog type (Hide, Seek, Point Out, Sneak, Create a Diversion) to enhance visual consistency

## [0.2.17] - 2025-08-06

### Fixed

- **Point out dialog wrong application**: fixed condition(hidden\undetected) change for wrong token

## [0.2.15] - 2025-08-06

### Fixed

- **Major bug**: Had an issue that effect would go on the defender when attacking a condition(hidden\undetected) attacker, this is now fixed

## [0.2.14] - 2025-08-06

### Added

- **Combat Seek Range Limitation**: New setting to limit Seek actions to 30 feet range in combat, following PF2e rules
- **Range Feedback**: Clear notifications when range limitation is active and targets are out of range

## [0.2.13] - 2025-08-06

### Improved

- **Consolidated DC Extraction**: Centralized perception and stealth DC extraction functions in shared utilities for consistent access paths across all automation dialogs
- **Simplified Data Access**: Optimized DC extraction to use definitive paths for both PC and NPC actors, removing complex fallback logic
- **Code Maintainability**: Standardized DC access patterns across all visibility-related dialogs (Hide, Seek, Sneak, Create a Diversion, Point Out)

## [0.2.7] - 2025-08-06

### Added

- **Player Tooltip Setting**: New "Allow Player Tooltips" setting enables non-GM players to see visibility indication tooltips from their controlled tokens' perspective
- **Ignore Allies Setting**: New "Ignore Allies" setting filters visibility dialogs so NPCs only see players and players only see NPCs, streamlining visibility management
- **Shared Utility Functions**: Extracted common ally filtering logic into reusable utility functions for better code maintainability

### Fixed

- **Hide Dialog Encounter Filter**: Fixed bug where "Apply All" button in Hide dialog ignored encounter filter and applied changes to all tokens instead of only encounter tokens
- **Encounter Filter Logic**: Encounter filter now properly maintains its state and shows empty results when no encounter tokens match, instead of automatically disabling the filter

### Improved

- **Code Organization**: Refactored all chat automation modules to use shared ally filtering utility, eliminating code duplication and ensuring consistency
- **Player Access Control**: Players can only see tooltips for their own controlled tokens when player tooltips are enabled, preventing information leakage
- **Setting Integration**: Both new settings require world restart and are properly integrated with the module's configuration system

## [0.2.5] - 2025-08-06

### Fixed

- **API**: Fixed API function with options

## [0.2.4] - 2025-08-06

### Added

- **API**: Added API function to update ephemeral effects for visibility changes

## [0.2.3] - 2025-08-05

### Fixed

- **Sneak visibility**: Fixed Sneak visibility logic to use effective new state instead of hardcoding 'undetected'

## [0.2.2] - 2025-08-05

### Fixed

- **CSS Syntax**: Fixed CSS syntax error in chat-automation-styles.js

## [0.2.1] - 2025-08-05

### Fixed

- **Sneak perception DC calculation**: Enhanced Sneak dialog perception DC retrieval with multiple fallback paths for different PF2e system versions, matching Create a Diversion's robust implementation

## [0.2.0] - 2025-08-05

### Added

- **Sneak Action Dialog**: Complete automation for PF2E Sneak actions with preview and outcome management
- **Create a Diversion Dialog**: Complete automation for PF2E Create a Diversion actions with preview and outcome management
- **Token hover highlighting**: Hover over token rows in dialogs to highlight tokens on canvas
- **Enhanced error handling**: Graceful handling of ephemeral effect cleanup errors
- **Initiative-based effects**: Support for ephemeral effects that track combat initiative

### Improved

- **Dialog styling consistency**: Unified text sizes, spacing, and layout across all action dialogs
- **Token image presentation**: Removed unnecessary tooltips and borders from token images in tables
- **UI responsiveness**: Optimized dialog width and column sizing for better proportions
- **Button state management**: Dynamic enabling/disabling based on actual changes from original state
- **Visual feedback**: Enhanced state icons and selection indicators for better user experience
- **Create a Diversion outcomes**: Fixed token images, centered action buttons, and added proper outcome text coloring
- **Perception DC calculation**: Improved DC retrieval with multiple fallback paths for different PF2e system versions

### Technical

- **ApplicationV2 compliance**: Proper use of built-in action system instead of manual event binding
- **Error resilience**: Try-catch blocks around visibility operations to prevent dialog crashes
- **Code organization**: Improved separation of concerns between dialog logic and template rendering

## [0.1.x] - 2025-01-31

### Fixed

- Resolved circular dependency issue causing "Cannot use import statement outside a module" error
- Fixed manifest warning about unknown "system" key by using correct v13 relationships format
- Implemented lazy loading for API components to prevent initialization conflicts

### Added

- Complete rewrite for FoundryVTT v13 compatibility
- Modern ApplicationV2-based visibility manager interface
- ESModule architecture for better performance and maintainability
- Comprehensive localization support (English included)
- Bulk actions for setting multiple tokens at once
- Visual indicators with animated effects
- Keyboard shortcut support (`Ctrl+Shift+V`)
- Token HUD integration for quick access
- Context menu integration
- Modern responsive CSS design with v13 theme support
- Auto-apply PF2E conditions option
- Socket support for future multiplayer features
- Hot reload support for development
- Comprehensive API for module developers
- Full TypeScript-style JSDoc documentation

### Changed

- Upgraded from ApplicationV1 to ApplicationV2 framework
- Improved data storage using modern flag system
- Enhanced visual effects system with better performance
- Redesigned UI with modern FoundryVTT v13 styling
- Better error handling and user feedback
- Optimized token visibility update logic

### Technical

- Minimum FoundryVTT version: v13.341
- Verified compatibility: v13.346
- PF2E system compatibility: v6.0.0+
- ESModule entry point instead of legacy scripts
- CSS Layer implementation for better module compatibility

## [0.1.0] - Previous Version

### Added

- Basic per-token visibility functionality
- Simple table-based interface
- Core visibility states (Observed, Hidden, Undetected, Concealed)
- Token appearance modification
- Flag-based data storage

### Compatibility

- FoundryVTT v12 and earlier
- Basic ApplicationV1 framework
