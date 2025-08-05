# Changelog

All notable changes to the PF2E Visioner module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-08-05

### Added
- **Sneak Action Dialog**: Complete automation for PF2E Sneak actions with preview and outcome management
- **Token hover highlighting**: Hover over token rows in dialogs to highlight tokens on canvas
- **Enhanced error handling**: Graceful handling of ephemeral effect cleanup errors

### Improved
- **Dialog styling consistency**: Unified text sizes, spacing, and layout across all action dialogs
- **Token image presentation**: Removed unnecessary tooltips and borders from token images in tables
- **UI responsiveness**: Optimized dialog width and column sizing for better proportions
- **Button state management**: Dynamic enabling/disabling based on actual changes from original state
- **Visual feedback**: Enhanced state icons and selection indicators for better user experience

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