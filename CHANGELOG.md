# Changelog

All notable changes to the PF2E Visioner module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-31

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