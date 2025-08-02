# PF2E Visioner

A comprehensive FoundryVTT v13 module that provides advanced per-token visibility management for Pathfinder Second Edition. PF2E Visioner allows GMs to set individual visibility conditions (Hidden, Undetected, Concealed, Invisible) between specific tokens with modern UI and visual effects.

## Features

### 🎯 **Per-Token Visibility System**
- Set different visibility states for each token relationship
- One token can see another as Hidden while a third sees it as Observed
- Individual control over every token-to-token visibility interaction

### 🎨 **Modern UI with ApplicationV2**
- Clean, intuitive interface built with FoundryVTT v13's ApplicationV2 framework
- Responsive design that adapts to different screen sizes
- Bulk actions for quickly setting multiple tokens to the same state

### 👁️ **Visual Effects & Indicators**
- Real-time visual feedback on token visibility states
- Optional visibility indicators for GMs
- Smooth animations and modern styling

### ⚔️ **PF2E Integration**
- Direct integration with PF2E visibility conditions
- Option to automatically apply corresponding PF2E conditions
- Supports all major detection states: Observed, Hidden, Undetected, Concealed, Invisible

### ⚡ **Easy to Use**
- Keyboard shortcut (`Ctrl+Shift+V`) to open the visibility manager
- Context menu integration on tokens
- Token HUD button for quick access

## Installation

1. Download the module files to your `Data/modules/pf2e-visioner/` directory
2. Enable the module in your world's module settings
3. Ensure you're using FoundryVTT v13.341+ and PF2E system v6.0.0+

## Usage

### Opening the Visibility Manager

**Method 1: Keyboard Shortcut**
1. Select the token that will be the "observer" (the token whose perspective you want to manage)
2. Press `Ctrl+Shift+V` to open the Token Visibility Manager

**Method 2: Token HUD**
1. Select a token
2. Click the eye icon in the Token HUD
3. The visibility manager will open with that token as the observer

**Method 3: Context Menu**
1. Right-click on a token in the token layer
2. Select "Manage Token Visibility"

### Setting Visibility States

1. **Observer Token**: The token at the top of the interface represents whose "point of view" you're managing
2. **Target Tokens**: All other tokens in the scene are listed below
3. **Visibility States**: Use the dropdown for each token to set how the observer sees them:
   - **Observed**: Normal visibility (default)
   - **Hidden**: Token appears semi-transparent
   - **Undetected**: Token is barely visible
   - **Concealed**: Token appears dimmed
   - **Invisible**: Token is completely hidden

### Bulk Actions

Use the bulk action buttons at the top to quickly set all tokens to the same visibility state:
- Click any visibility state button to apply it to all tokens at once
- Great for setting up encounters where most enemies start hidden

### Visual Feedback

When you control a token (as GM), other tokens will automatically adjust their appearance based on your visibility settings:
- The controlled token acts as the "observer"
- All other tokens display according to their visibility state relative to the observer
- Small indicators appear on tokens (if enabled in settings) to show their current state

### PF2E Condition Integration

The module automatically integrates with PF2E conditions that affect visibility:

#### Mechanical Effects
- **Hidden**: Applies the actual PF2E Hidden condition with DC 11 flat checks and proper red triangular indicators
- **Concealed**: Applies the actual PF2E Concealed condition with DC 5 flat checks  
- **Undetected**: Applies the actual PF2E Undetected condition with full mechanical effects and completely hides tokens from view
- **Condition Integration**: Uses the PF2E system's native condition application for all visibility states methods for full mechanical compliance

## Settings

Access these settings in the module configuration:

### Enable Visual Effects
**Default**: `true`  
Show visual overlays and transparency effects on tokens to indicate their visibility state.

### Show GM Visibility Hints  
**Default**: `true`  
Display small colored icons on tokens to indicate their visibility relationships. Only visible to GMs.

### Auto-Apply PF2E Conditions
**Default**: `false`  
Automatically apply corresponding PF2E conditions (Hidden, Undetected, etc.) when setting visibility states. Use with caution as this affects the actual game mechanics.

## Technical Details

### Architecture
- **Modular Design**: Clean separation of concerns across multiple files
- **ES Modules**: Modern JavaScript module system for better performance
- **ApplicationV2**: Uses FoundryVTT v13's latest UI framework
- **CSS Layers**: Professional styling that integrates with core themes
- See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed structure documentation

### Data Storage
- Visibility relationships are stored as flags on token documents
- Data structure: `{targetTokenId: visibilityState}` per observer token
- Compatible with token import/export and scene copying

### Compatibility
- **FoundryVTT**: v13.341+ (uses ApplicationV2, ESModules)
- **PF2E System**: v6.0.0+
- **Modules**: Compatible with most other modules

### Performance
- Efficient flag-based storage system
- Only processes visibility when tokens are controlled
- Minimal impact on game performance
- Lazy loading of non-critical components

## API for Developers

The module exposes a global `PerTokenVisibility` object for integration:

```javascript
// Get visibility state between two tokens
const state = PerTokenVisibility.getVisibilityBetween(observerToken, targetToken);

// Set visibility state between two tokens
await PerTokenVisibility.setVisibilityBetween(observerToken, targetToken, 'hidden');

// Open the visibility manager programmatically
PerTokenVisibility.openVisibilityManager(observerToken);

// Update all token visuals manually
PerTokenVisibility.updateTokenVisuals();
```

## Troubleshooting

### The visibility manager doesn't open
- Ensure you have a token selected first
- Check that you're logged in as a GM
- Verify the module is enabled and FoundryVTT v13+ is running

### Visual effects aren't showing
- Check that "Enable Visual Effects" is enabled in module settings
- Ensure you have a token controlled (the observer)
- Try refreshing the scene (`F5`)

### PF2E conditions aren't being applied
- Enable "Auto-Apply PF2E Conditions" in module settings
- Ensure the PF2E system is active and up-to-date
- Check that the target token has an associated actor

## Support

For bug reports, feature requests, or questions:
- Check the [FoundryVTT v13 API documentation](https://foundryvtt.com/api/)
- Review the [PF2E system documentation](https://github.com/foundryvtt/pf2e/)
- Test with minimal modules to isolate conflicts

## License

This module is licensed under the Apache License v2.0. See LICENSE file for details.

## Acknowledgments

- Built for FoundryVTT v13 using modern ApplicationV2 framework
- Inspired by the PF2E system's visibility mechanics
- Thanks to the FoundryVTT and PF2E communities for feedback and testing