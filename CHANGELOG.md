# Changelog

All notable changes to the PF2E Visioner module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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