# PF2E Visioner Scripts

This directory contains the modular JavaScript files for the PF2E Visioner module.

## File Structure

### Core Files
- **`main.js`** - Main module entry point and initialization
- **`constants.js`** - Module constants and configuration
- **`utils.js`** - Utility functions for visibility calculations
- **`settings.js`** - Module settings registration and management

### Feature Modules
- **`off-guard-ephemeral.js`** - Off-guard condition automation using individual ephemeral effects
- **`targeting.js`** - Token targeting event handling
- **`visual-effects.js`** - Token visual effects and appearance management
- **`effects-coordinator.js`** - Main effects coordinator and system integration

### Integration Modules
- **`detection-wrapper.js`** - PF2E detection system integration
- **`visibility-manager.js`** - Visibility management UI and controls
- **`visibility-effects.js`** - Visibility state effects application
- **`hover-tooltips.js`** - Hover tooltip functionality
- **`hooks.js`** - FoundryVTT hook registrations
- **`api.js`** - Public API for other modules

## Module Architecture

The module follows a modular architecture where each file has a specific responsibility:

1. **Separation of Concerns**: Visual effects, mechanical effects, and UI are separated
2. **Clean Dependencies**: Each module imports only what it needs
3. **Backwards Compatibility**: Legacy functions are preserved for compatibility
4. **Extensibility**: New features can be added as separate modules

## Key Features

- **Off-Guard Automation**: Automatically applies off-guard conditions when attackers are hidden/undetected
- **Visual Indicators**: Provides visual feedback for token visibility states
- **PF2E Integration**: Deep integration with the PF2E system's detection mechanics
- **Performance Optimized**: Minimal overhead with efficient visibility calculations