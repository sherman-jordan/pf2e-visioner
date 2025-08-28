# Auto-Cover Indicator Demo

This demonstrates the new auto-cover indicator feature that shows explicit cover information in attack chat messages.

## Before (Issue #87)

When auto-cover was applied, it only showed in the combat log without clear indication in the attack chat message:
- Attack messages would show "Miss by -9" without explaining why
- Players couldn't easily see that cover was automatically applied
- The cover effect was "invisible" in the chat despite affecting the attack

## After (Fixed)

Now when auto-cover is applied, the chat message explicitly shows:
- "Target has: Standard Cover +2" (or appropriate cover type and bonus)
- Consistent styling with orange border and shield icon
- Visible to all users (not just GMs like the override indicator)
- Shows for all cover types: Lesser (+1), Standard (+2), Greater (+4)

## Visual Example

The screenshot `auto-cover-indicator-demo.png` shows how the new indicators appear in chat messages with different cover types.

## Technical Implementation

1. **New Service**: `scripts/chat/services/auto-cover-indicator.js`
   - Handles injection of cover indicators for all users
   - Multiple fallback insertion points for different message layouts
   - Graceful handling of jQuery availability

2. **Enhanced Data Storage**: Modified `scripts/cover/auto-cover.js`
   - Now stores auto-cover information in chat message flags for all cover applications
   - Previously only stored data when cover was manually overridden

3. **Updated Entry Point**: Modified `scripts/chat/services/entry-service.js`
   - Calls both the new auto-cover indicator and existing override indicator
   - Auto-cover indicator runs for all users, override indicator only for GMs

## Testing

- Added comprehensive unit tests in `tests/unit/auto-cover-indicator.test.js`
- Tests cover data structure validation and indicator logic
- All existing tests continue to pass (692 tests total)

This addresses the core issue by making auto-applied cover as visible as manually applied cover effects.