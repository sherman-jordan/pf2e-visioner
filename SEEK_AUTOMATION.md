# Seek Action Automation

PF2E Visioner now includes automated visibility changes for Seek actions! This feature streamlines the process of resolving Seek attempts by automatically applying visibility state changes based on roll results.

## How It Works

When a player or GM makes a Seek action roll, the module:

1. **Detects Seek Actions**: Monitors chat messages for Seek action skill checks
2. **Adds Automation Button**: Adds an "Apply Seek Results" button to the chat message (GM only)
3. **Calculates Results**: Compares the Seek roll against target Stealth DCs
4. **Applies Changes**: Automatically updates visibility states based on success/failure

## Seek Rules Implementation

The automation follows PF2e Seek action rules:

- **Critical Success**: Undetected → Observed
- **Success**: Undetected → Hidden  
- **Failure/Critical Failure**: No change (remains undetected)

## Usage

1. **Enable the Feature**: Go to Module Settings and ensure "Enable Seek Action Automation" is checked (enabled by default)

2. **Make a Seek Roll**: When a token makes a Seek action, the system will detect it automatically

3. **Apply Results**: Click the "Apply Seek Results" button that appears in the chat message

4. **Automatic Processing**: The module will:
   - Find all tokens that are undetected to the seeker
   - Compare the Seek roll total against each target's Stealth DC
   - Apply appropriate visibility changes based on degree of success
   - Show a notification with the results

## Features

- **Smart Detection**: Only processes tokens that are actually undetected to the seeker
- **Automatic Calculation**: Uses proper PF2e degree of success calculations
- **Visual Feedback**: Button changes to show when results have been applied
- **Localized**: All text supports multiple languages
- **Configurable**: Can be disabled in module settings if not desired

## Requirements

- GM permissions (only GMs can apply Seek results)
- PF2e system (uses PF2e chat message flags and actor data)
- Tokens must have proper Stealth skill values

## Integration

This feature integrates seamlessly with:
- Existing PF2E Visioner visibility system
- Token visibility effects and conditions
- Off-guard automation
- Hover tooltips system

## Settings

- **Enable Seek Action Automation**: Toggle the entire feature on/off
- Located in: Configure Settings → Module Settings → PF2E Visioner

## Troubleshooting

**Button doesn't appear**: 
- Check that you're the GM
- Verify the setting is enabled
- Ensure the roll was actually a Seek action

**No tokens found**:
- Verify tokens are actually set as undetected to the seeker
- Check that target tokens have valid Stealth DCs

**Changes not applied**:
- Check console for error messages
- Verify tokens have proper actor data
- Ensure PF2E Visioner visibility system is working normally
