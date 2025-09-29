# Client and User Settings
- **Enable Hover Tooltips:** Show visibility status tooltips when hovering over tokens
- **Allow Player Tooltips:** When enabled, players can see visibility status tooltips *from their perspective* when hovering over tokens
- **Tooltip Size:** Choose tooltip size
- **Remove Target Hover Tooltips from Players:** Prevents players from seeing tooltips from the target perspective for owned tokens
- **Colorblind Mode:** Select a colorblind mode to adjust colors for better visibility
- **Debug Mode:** Enable detailed console logging for troubleshooting

# General

## General UI
### Token HUD Button:
Adds a button to Foundry's token HUD for quick access to the Visioner Manager. When disabled, a moving floating button will appear while a token is selected
### Visioner Scene Controls:
Adds Visioner-specific features to to Token and Wall controls in the Foundry sidebar
### Visioner Quick Edit Button:
Adds a button to the Token Controls of the Foundry sidebar that opens the Visioner Quick Edit tool. When disabled, the tool may still be accessed with a keybind

## Visioner Manager Settings
### Visioner Manager Roll Comparison:
Adds a column to the Visioner Manager comparing the last relevant roll vs relevant DC
### Set Default Filters:
The following filters can be defaulted to on when relevant for Vision Manager as well as ***all Actions Results Dialogs***
- Encounter Only
- Ignore Allies
- Hide Foundry-Hidden Tokens

# Vision

## Vision for NPCs
Enables token vision for all NPC tokens to more easily see POV

## Hidden Loot Actors
### Hidden Loot Actors:
Allows the GM to use Visioner's visual settings to make Loot Actors invisible to players without resorting to Foundry-Hidden. Visioner hidden Loot Actors can be discovered using the Seek action
### Loot Actor Stealth DC:
Sets a default Stealth DC for Loot Actors. Stealth DC's may be overwritten on a per-token basis using an additional setting in the Token Configuration window.

## Hidden Walls

### Hidden Walls: 
Allows the GM to mark wall segments as hidden from players. This does not have a visual impact on the player view, but provides for a way for players to discover hidden walls and doors using the Seek action. Hidden walls are marked as discovered using a luminescent PIXI overlay on the wall segment, signalling to the player that they have found something. For more information about using Visioner's tools to customize wall segments with this setting enabled [see here](Wall-Settings.md).
### Wall Stealth DC: 
Sets a default Stealth DC for hidden walls. Stealth DCs may be overwritten on a per-wall basis using additional settings injected into Foundry's wall segment configuration window, or by using Visioner's [Wall Settings](Wall-Settings.md) dialog

## Advanced Seek Options
### Use Seek Template
When Seeking, targets will be decided by a 15 foot burst template. Set Template Button replaces the Standard Visioner buttons in the Seek chat card. Use of the Template completely supersedes other Seek modes - if this option is enabled, the ability to set Seek Range and Exploration Seek Range is disabled.

### Combat Seek Range and Exploration Seek Range
Allows for setting the radius of the Seek action when a template is not used. 

# Auto Cover Settings

## Cover
- **Enable Auto-Cover:** Toggles the Auto-Cover system on or off. When off, cover between tokens is not automatically calculated or updated.
- **Restrict Auto-Cover Visualization to Combat:** Limits use of the keybind to toggle cover visualization to active combat.
- **GM Token Auto-Cover Visualization:** Causes the GM to see the the limits to the Auto-Cover visualization based on the selected token's vision.

## Token Auto Cover Settings
***The following options are customize how Visioner's Auto-Cover system determines cover between tokens.***

### Token Ray Intersection Mode
Auto-Cover uses ray casting between an observer and a target token, then applies a selected algorithm to apply cover granted. This setting allows for adjustment of the way the module determines its best estimate of the cover granted by tokens intersecting the ray.
|Dropdown Option | RAW Adherence | Description |
| --- | --- | --- |
| **Any** | Yes | Tokens will grant cover if any portion of the token border intersects the ray. Intersecting tokens grant lesser cover, unless they are two sizes larger than the Observer or the Target (whichever is larger,) in which case they grant standard cover. This fairly permissive in applying cover of some degree, and uses pf2e RAW to determine the degree of cover granted |
| **10%** | Yes | Tokens will only grant cover if at least 10% of the token's shape intersects the ray. This setting is less permissive than `Any` in applying cover, but also follows pf2e RAW guidelines for the degree of cover granted|
|  **Side Coverage** | No | Somewhat experimental: Uses thresholds based on where the ray intersects the intersecting token's bounding box to determine how offset the intersecting token is from the direct line between observer and target. 0-50% occlusion results in lesser cover, 50-70 results in standard cover, and over 70% results in greater cover. This is quite permissive and not strictly RAW but may feel true to life. |
| **Tactical** | No | User request: Adapted from D&D Point System for determining cover. Uses corner to corner rays and counts the number blocked to determine cover.|

### Ignore Token Types
***The following token types may individually be ignored by the Auto-Cover system:***
- Undetected Tokens
- Dead Tokens
- Prone Tokens
- Ally Tokens

## Wall Auto-Cover Settings
### Wall Standard Threshold
Sets the percentage of the the target token that must be obscured by a wall segment before Standard Cover is granted. Default is 30%
### Wall Greater Cover Settings:
Allows the GM to specify whether walls can grant Greater Cover, and if so, the percentage of the target token that must be obscured by a wall segment before Greater Cover is granted. Default is 55%

