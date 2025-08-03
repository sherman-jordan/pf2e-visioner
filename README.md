# PF2E Visioner

A comprehensive FoundryVTT v13 module that provides advanced per-token visibility management for Pathfinder Second Edition. PF2E Visioner allows GMs to set individual visibility conditions (Hidden, Undetected, Concealed, Invisible) between specific tokens with modern UI and visual effects.

## Features

### 🎯 **Per-Token Visibility System**
- Set different visibility states for each token relationship
- One token can see another as Hidden while a third sees it as Observed
- Individual control over every token-to-token visibility interaction

### 🎨 **Modern UI with ApplicationV2**
- Clean, intuitive interface built with FoundryVTT v13's ApplicationV2 framework
- **Compact & Efficient Layout**: Always-visible header and footer with scrollable token tables
- **Traffic Light Color Schema**: Intuitive green → yellow → orange → red visibility progression
- **Contextual Bulk Actions**: Separate bulk action buttons for PCs and NPCs in table headers
- **Smart Sorting**: Tokens sorted by visibility status precedence (undetected → hidden → concealed → observed)
- **Responsive Design**: Optimized window sizing and space-efficient layout

### 👁️ **Visual Effects & Indicators**
- Real-time visual feedback on token visibility states
- Optional visibility indicators for GMs
- Smooth animations and modern styling

### 🔍 **Interactive Visibility Tooltips**
- **Hover Tooltips**: Hover over any token to see visibility states from different perspectives
- **Alt Key Tooltips**: Hold Alt to see how others see your controlled tokens
- **O Key Mode Switching**: Hold O while hovering to switch between observer and target perspectives
- **Dynamic Indicators**: Real-time visibility state labels (Observed, Hidden, Concealed, Undetected)
- **GM-Only Feature**: Tooltips only appear for Game Masters

### ⚔️ **PF2E Integration**
- Direct integration with PF2E visibility conditions with full mechanical effects
- **Traffic Light Color System**: Intuitive green → yellow → orange → red progression
- Supports all major detection states: Observed, Concealed, Hidden, Undetected
- **Automatic Off-Guard Conditions**: When hidden/undetected attackers make attacks, targets automatically become off-guard for both AC penalties and damage benefits (like sneak attack)
- **Visual Consistency**: All interface elements use consistent color coding throughout

### ⚡ **Easy to Use**
- Keyboard shortcut (`Ctrl+Shift+V`) to open the visibility manager
- Context menu integration on tokens
- Token HUD button for quick access
- **Hover tooltips**: Simply hover over tokens to see visibility states
- **Alt key tooltips**: Hold Alt for instant controlled token visibility overview
- **O key mode switching**: Hold O while hovering to switch perspectives

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

1. **Observer Section**: Compact header with token image, name, and mode toggle
   - **Observer Mode**: How the selected token sees others
   - **Target Mode**: How others see the selected token
2. **Token Tables**: Organized into separate PC and NPC sections with smart sorting
3. **Always-Visible Controls**: Header and footer remain visible while token tables scroll
3. **Visibility States**: Use the dropdown for each token to set how the observer sees them:
   - **🟢 Observed**: Normal visibility (default) - Green color
   - **🟡 Concealed**: Token appears regular with DC 5 flat check - Yellow color
   - **🟠 Hidden**: Token appears semi-transparent with DC 11 flat check - Orange color
   - **🔴 Undetected**: Token location unknown - Red color

### Bulk Actions

**Contextual Bulk Actions** are now integrated into each table header:
- **PC Bulk Actions**: Located in the Player Characters table header
- **NPC Bulk Actions**: Located in the NPCs table header  
- **Color-Coded Buttons**: Each button matches its visibility state color (green, yellow, orange, red)
- **Targeted Control**: Apply bulk changes to just PCs or just NPCs independently
- **Intuitive Icons**: Visual icons for each visibility state (eye, cloud, eye-slash, ghost)

### Interactive Visibility Tooltips (GM Only)

The module provides real-time visibility tooltips that help GMs understand token visibility relationships:

#### Hover Tooltips
- **Hover over any token** to see visibility indicators on other tokens
- **Default Mode (Target)**: Shows how other tokens see the hovered token
- **Observer Mode**: Hold **O key** while hovering to see how the hovered token sees others
- **Dynamic Switching**: Release O to return to target mode

#### Alt Key Tooltips
- **Hold Alt** to see visibility indicators for all controlled tokens
- **Always Target Mode**: Shows how other tokens see your controlled tokens
- **Independent System**: Alt tooltips work independently of hover tooltips

#### Tooltip Indicators
- **🟢 Observed**: Normal visibility (no special indicator)
- **🟡 Concealed**: Yellow "Concealed" label above token
- **🟠 Hidden**: Orange "Hidden" label above token  
- **🔴 Undetected**: Red "Undetected" label above token

#### Usage Tips
- **Perspective Understanding**: Use target mode to see "who can see this token" and observer mode to see "what can this token see"
- **Quick Assessment**: Alt key provides instant overview of controlled token visibility
- **Mode Clarity**: O key only affects hover tooltips, not Alt key tooltips

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

### Off-Guard Automation

The module includes sophisticated automation for off-guard conditions when attackers are hidden or undetected:

#### How It Works
1. **Attack Detection**: When a hidden/undetected token makes an attack roll, the system automatically detects this
2. **AC Penalty**: The target immediately becomes off-guard for the attack roll (AC penalty)
3. **Damage Benefits**: The off-guard condition persists through damage rolls, enabling sneak attack and other benefits
4. **Automatic Cleanup**: The temporary off-guard condition is automatically removed after damage processing

#### Features
- **Hybrid Approach**: Uses cloned actors for attack rolls and real conditions for damage rolls
- **Reroll Support**: Properly handles rerolls without creating duplicate conditions
- **Sneak Attack Integration**: Works seamlessly with rogue sneak attacks and similar features
- **Clean State Management**: No permanent modifications to actors
- **PF2E Remaster Compatible**: Designed for the current PF2E system architecture

#### Technical Details
- Uses libWrapper to intercept `game.pf2e.Check.roll` for attack detection
- Applies temporary off-guard conditions with visibility context (e.g., "Off-Guard (Hidden)")
- Automatically removes conditions after a 2-second delay to ensure damage processing completes
- Stores attack data temporarily to coordinate between attack and damage phases

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
- **Required Dependencies**: libWrapper (for off-guard automation)
- **Modules**: Compatible with most other modules

### Performance
- Efficient flag-based storage system
- Only processes visibility when tokens are controlled
- Minimal impact on game performance
- Lazy loading of non-critical components

## API for Developers

The module exposes an API through `game.modules.get("pf2e-visioner").api` for integration:

### Core Functions

```javascript
const api = game.modules.get("pf2e-visioner").api;

// Get visibility state between two tokens (using token IDs)
const state = api.getVisibility(observerId, targetId);
// Returns: 'observed', 'hidden', 'undetected', 'concealed', or null

// Set visibility state between two tokens
const success = await api.setVisibility(observerId, targetId, 'hidden');
// Returns: Promise<boolean> - true if successful

// Open the visibility manager programmatically
api.openVisibilityManager(observerToken); // Still requires Token object

// Update all token visuals manually
await api.updateTokenVisuals();

// Get valid visibility states
const validStates = api.getVisibilityStates();
// Returns: ['observed', 'hidden', 'undetected', 'concealed']
```

### Rule Elements Integration

```javascript
// Get roll options for Rule Elements
const rollOptions = api.getRollOptions(observerId, targetId);
// Returns: Array of strings like ['per-token-visibility:target:hidden']

// Add roll options to existing roll data
api.addRollOptions(myRollOptions, observerId, targetId);
// Modifies myRollOptions object in-place
```

### Usage Examples

```javascript
// Set multiple tokens as hidden from an observer
const observerId = 'token123';
const targetIds = ['token456', 'token789'];

for (const targetId of targetIds) {
  await api.setVisibility(observerId, targetId, 'hidden');
}

// Check if a token can see another
const canSee = api.getVisibility(observerId, targetId) === 'observed';

// Integration with custom Rule Elements
const rollData = { options: {} };
api.addRollOptions(rollData.options, attackerId, targetId);
// rollData.options now contains visibility-based roll options
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

### Off-guard automation isn't working
- Ensure libWrapper is installed and enabled (required dependency)
- Check that tokens have proper visibility relationships set
- Verify that the attacking token is set as "hidden" or "undetected" from the target's perspective
- Check the browser console for any error messages
- Make sure both attacker and target have associated actors

### Sneak attack damage isn't applying
- Verify the off-guard condition appears briefly on the target during the attack
- Check that the rogue has sneak attack features properly configured
- Ensure the attack is coming from a hidden/undetected position
- Look for "Off-Guard (Hidden)" or "Off-Guard (Undetected)" condition on the target

### Multiple off-guard conditions appearing
- This should be automatically prevented by the module's duplicate detection
- If it persists, try refreshing the scene or restarting Foundry
- Check for conflicts with other modules that modify conditions

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
