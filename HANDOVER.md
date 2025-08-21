# PF2E Visioner Development Handover

This document provides a comprehensive overview of the PF2E Visioner module's current state, architecture, development patterns, and critical information for new AI assistants working on this project.

## 📋 Quick Reference

- **Module ID**: `pf2e-visioner`
- **Current Version**: 2.6.5
- **FoundryVTT Compatibility**: v13.341+ (verified up to v13.346)
- **PF2E System**: v6.0.0+
- **License**: GPL-3.0

## 🏗️ Architecture Overview

### Core Philosophy
The module follows a **modular, single-responsibility architecture** with clear separation of concerns:

- **ESModule-based**: Modern JavaScript module system with tree-shaking
- **ApplicationV2**: Uses FoundryVTT v13's modern UI framework
- **Flag-based persistence**: All data stored in token/scene flags for robustness
- **Event-driven**: Heavy use of FoundryVTT's hook system
- **Performance-focused**: Batch operations, lazy loading, and optimized updates

### Key Architectural Patterns

1. **Facade Pattern**: `utils.js` re-exports from stores/services for single source of truth
2. **Store Pattern**: Separate stores for visibility and cover state management
3. **Service Layer**: Cross-cutting concerns handled by dedicated services
4. **Hook Registration**: Centralized in `hooks/registration.js` with modular handlers
5. **API Layer**: Clean public API in `api.js` with internal helpers in `services/api-internal.js`

## 📁 File Structure & Responsibilities

```
scripts/
├── main.js                    # Entry point - module initialization
├── constants.js               # All configuration, states, settings definitions
├── api.js                     # Public API surface
├── utils.js                   # Facade re-exporting stores/services + UI helpers
├── settings.js                # Settings registration with grouped UI
├── hooks.js                   # Thin shim → delegates to hooks/
├── hooks/                     # Modular hook handlers by concern
│   ├── registration.js        # Central registrar
│   ├── lifecycle.js           # ready/canvasReady + socket + tooltips
│   ├── ui.js                  # Token HUD, directory context, config injection
│   ├── token-events.js        # create/delete token handlers
│   ├── party-token-hooks.js   # Party token consolidation detection
│   ├── combat.js              # encounter filter reset
│   └── chat.js                # chat styles + processing
├── managers/                  # UI controllers
│   ├── token-manager/         # Main visibility/cover UI (ApplicationV2)
│   ├── progress.js            # Progress indicator
│   ├── quick-panel.js         # Quick edit panel
│   └── wall-manager/          # Wall management UI
├── stores/                    # State management (single responsibility)
│   ├── visibility-map.js      # Visibility state persistence
│   └── cover-map.js           # Cover state persistence
├── services/                  # Cross-cutting operations
│   ├── api-internal.js        # Internal API helpers
│   ├── scene-cleanup.js       # Token deletion cleanup
│   ├── party-token-state.js   # Party token state preservation
│   ├── socket.js              # Cross-client communication
│   ├── visual-effects.js      # Token appearance management
│   └── [other services]
├── cover/                     # Cover system modules
│   ├── auto-cover.js          # Automatic cover detection
│   ├── cover-visualization.js # Interactive cover grid overlay
│   ├── aggregates.js          # Effect aggregation
│   ├── batch.js               # Batch operations
│   └── [other cover modules]
├── visibility/                # Visibility system modules
├── chat/                      # PF2E action automation
│   ├── automation-service.js  # Main automation controller
│   ├── chat-processor.js      # Chat message processing
│   ├── dialogs/               # Action-specific dialogs
│   └── services/              # Action handlers and utilities
└── helpers/                   # Pure utility functions
```

## 🔧 Development Patterns & Conventions

### Code Style & Standards
- **ESModule imports/exports**: Always use modern module syntax
- **ApplicationV2**: All UI components use FoundryVTT v13's modern framework
- **Async/await**: Prefer over Promise chains
- **Error handling**: Comprehensive try-catch with user notifications
- **JSDoc**: Document all public methods and complex functions
- **No time-based operations**: User preference - avoid setTimeout/setInterval [[memory:4992324]]

### Data Management Patterns
1. **Flag-based persistence**: All state stored in `token.flags["pf2e-visioner"]`
2. **Batch operations**: Always prefer bulk document updates over individual operations
3. **State reconciliation**: Updates merge with existing data, never overwrite completely
4. **Cleanup on deletion**: Automatic cleanup when tokens/actors are removed

### UI Patterns
1. **Tabbed interfaces**: Visibility and Cover tabs in main manager
2. **Bulk actions**: "Apply All", "Revert All" with per-row controls
3. **Progress indicators**: Long operations show progress bars
4. **Responsive design**: CSS breakpoints for different screen sizes
5. **Colorblind support**: Multiple accessibility modes with pattern indicators

### Performance Patterns
1. **Lazy loading**: Dynamic imports for heavy modules (dialogs, batch operations)
2. **Debounced updates**: Visual effects batched to avoid excessive redraws
3. **Efficient queries**: Canvas token filtering optimized for large scenes
4. **Memory management**: Cleanup of event listeners and temporary data

## 🎯 Core Features & Systems

### 1. Visibility System
- **States**: Observed, Concealed, Hidden, Undetected
- **Per-observer tracking**: Each token has individual visibility map
- **PF2E integration**: Automatic condition application with mechanical effects
- **Visual feedback**: Token overlays, opacity changes, indicators

### 2. Cover System  
- **States**: None, Lesser (+1 AC), Standard (+2 AC), Greater (+4 AC)
- **Auto-cover detection**: Multiple intersection algorithms (Any, 10%, Center, Coverage, Tactical)
- **Roll-time application**: Cover applied only during attacks, then cleaned up
- **Override system**: GM can override auto-calculated cover in roll dialogs

### 3. Chat Automation
- **PF2E Actions**: Seek, Hide, Sneak, Point Out, Create a Diversion, Take Cover
- **Attack Consequences**: Post-damage visibility updates for hidden/undetected attackers
- **Template system**: Seek can use placed templates for area targeting
- **Player/GM workflow**: Players trigger, GMs resolve with preview dialogs

### 4. Cover Visualization
- **Interactive grid**: Hold keybind while hovering to show cover levels
- **Color-coded**: Green (none), Yellow (lesser), Orange (standard), Red (greater)
- **Fog of war aware**: Only shows information in visible areas
- **Performance optimized**: Client-side rendering with efficient algorithms

### 5. Party Token Integration ✅ **VALIDATED IN PRODUCTION**
- **State preservation**: Saves visibility/cover when tokens consolidated into party
- **Automatic restoration**: Restores state when tokens brought back from party
- **Effect preservation**: Module effects saved and restored with tokens
- **Smart detection**: Only consolidates character tokens, ignores familiars/NPCs
- **Robust error handling**: Gracefully handles FoundryVTT's complex party mechanics
- **Cache management**: Automatic cleanup prevents memory leaks

## ⚠️ Critical Development Quirks & Gotchas

### 1. Token vs TokenDocument Distinction
- **Always check**: Some functions expect Token objects, others TokenDocument
- **Canvas availability**: During deletion, tokens may not be in canvas.tokens
- **Use token.document**: To get TokenDocument from Token object

### 2. Flag Management
- **Never overwrite**: Always merge with existing flag data
- **Use proper paths**: `flags["pf2e-visioner"].visibility` not `flags.pf2e-visioner.visibility`
- **Batch updates**: Use scene.updateEmbeddedDocuments for multiple token updates

### 3. Effect System Complexity
- **Ephemeral vs Aggregate**: Two types of effects with different lifecycles
- **Cleanup critical**: Always clean up effects to prevent orphaned data
- **Batch creation**: Create multiple effects in single operation for performance

### 4. Auto-Cover Architecture (Simplified v2.6.5+)
- **Dual-phase system**: 
  1. **libWrapper phase**: Immediate DC modification for roll calculation
  2. **Chat message phase**: Persistent state management and visual updates
- **Keybind-only popups**: Override dialog only appears when user holds configured keybind
- **Automatic detection**: Seamless cover application without user intervention when keybind not held
- **Global communication**: Uses `window.pf2eVisionerPopupOverrides` and `window.pf2eVisionerDialogOverrides` Maps
- **Per-user settings**: Correctly accesses PF2e client settings (`game.user.flags.pf2e.settings.*`) not system settings
- **Movement invalidation**: Token movement clears pre-applied cover
- **Owner-based**: Auto-cover runs for token owners and GM to avoid duplicate applications

### 5. ApplicationV2 Patterns
- **Instance management**: Track singleton instances to prevent duplicates
- **Render lifecycle**: Use proper render/close lifecycle methods
- **Event handling**: Use built-in action system, not manual event binding

### 6. Testing Infrastructure
- **Jest-based**: Comprehensive test suite with 586+ tests
- **Canvas mocking**: Real HTML5 canvas integration for drawing tests
- **Coverage requirements**: Strict thresholds enforced in CI/CD

### 7. Effect System Architecture ✅ **BY DESIGN**
- **Custom aggregate effects**: Module intentionally uses custom effects instead of real PF2E conditions for performance
- **Why custom effects**: One aggregate effect can handle multiple observers, more efficient than individual conditions
- **Icon resolution**: Uses `getPF2eConditionIcon()` to get proper PF2E condition icons from `game.pf2e.ConditionManager`
- **Fallback system**: Falls back to direct path, then generic icon if PF2E condition not available
- **Visual consistency**: Custom effects use proper PF2E condition icons while maintaining performance benefits

## 🔍 Common Issues & Solutions

### Performance Issues
- **Large scenes**: Module handles 50+ tokens efficiently through batching
- **Visual updates**: Debounced to prevent excessive canvas redraws
- **Memory leaks**: Automatic cleanup of event listeners and temporary data

### State Synchronization
- **Cross-client**: Uses socketlib for perception refresh broadcasts
- **Race conditions**: GM-only operations prevent conflicts
- **State corruption**: Robust error handling with automatic recovery

### UI Responsiveness
- **Progress indicators**: Long operations show progress to users
- **Non-blocking**: Heavy operations use async patterns
- **Error feedback**: Clear user notifications for all error conditions

### Party Token Edge Cases ✅ **PRODUCTION TESTED**
- **Duplicate events**: FoundryVTT fires multiple creation events - system handles gracefully
- **Undefined token IDs**: Early creation events may have undefined IDs - proper validation prevents errors
- **Actor type filtering**: Only character tokens are consolidated, familiars/NPCs ignored correctly
- **Effect restoration timing**: Module effects recreated after token restoration completes
- **Cache persistence**: State cache survives scene reloads and FoundryVTT restarts
- **⚠️ Effect cleanup bug**: Fixed issue where restored effects weren't cleaned up to match current visibility states
  - **Problem**: Saved effects were restored even when visibility relationships no longer justified them
  - **Root cause**: `rebuildAndRefresh()` only cleans cover effects, not visibility effects like Hidden conditions
  - **Solution**: Unified `rebuildEffectsForToken()` function that handles both visibility and cover effects
  - **Impact**: Ensures all effects match restored relationships without removing valid effects
  - **Technical**: Rebuilds effects FROM/TO restored token for both visibility and cover based on current maps
  - **Unified approach**: Single function handles both effect types consistently, reducing code duplication
  - **Default state filtering**: Only creates effects for non-default states (not "observed" or "none")
  - **Debugging**: Added detailed console logging to track what effects are being created and why
  - **⚠️ Critical fix**: Skip restoring saved effects, only rebuild based on current maps to prevent duplicates
  - **Duplicate prevention**: Don't restore saved effects AND rebuild - choose one approach (rebuild is more accurate)
  - **⚠️ Scene cleanup bug**: Fixed "Cannot read properties of undefined" error during token deletion cleanup
  - **Race condition fix**: Added robust null checks and per-token error handling in scene cleanup
  - **Root cause**: Occurs when allied tokens with visibility relationships are consolidated simultaneously
  - **Scenario**: Setting ally A as undetected to ally B, then both get pulled into party token at same time
  - **⚠️ Party consolidation fix**: Skip cleanup for party tokens during consolidation to prevent race conditions
  - **⚠️ Ally-to-ally restoration**: Added deferred update system for ally relationships during party restoration
  - **Deferred updates**: When ally observer not yet restored, defer the relationship update until ally is available

## 📊 Settings & Configuration

### World Settings (GM-only)
- **Auto-Cover**: Master toggle and behavior configuration
- **Action Automation**: Template usage, range limits, raw enforcement
- **UI Behavior**: Default filters, HUD buttons, tooltip permissions
- **Performance**: Debug mode, ally filtering, encounter filtering

### Client Settings (Per-user)
- **Accessibility**: Colorblind modes, tooltip font sizes
- **Keybindings**: Customizable keyboard shortcuts
- **Visual Preferences**: Tooltip behavior, hover modes

### Hidden/Advanced Settings
- **Token flags**: `ignoreAutoCover`, `hiddenWall`, `stealthDC`
- **Wall flags**: `provideCover`, `hiddenWall`
- **Scene flags**: `partyTokenStateCache` for party token preservation

## 🧪 Testing Strategy

### Test Categories
1. **Unit Tests**: Individual functions and classes
2. **Integration Tests**: Complex scenarios and interactions  
3. **Performance Tests**: Stress testing with many tokens
4. **Regression Tests**: Prevent bugs from returning
5. **Canvas Tests**: Real drawing operations with HTML5 canvas

### Coverage Requirements
- **Branches**: 80%+ (currently relaxed for development)
- **Functions**: 80%+
- **Lines**: 80%+
- **Statements**: 80%+

### Test Commands
```bash
npm test              # Run all tests
npm run test:coverage # Generate coverage report
npm run test:watch    # Watch mode for development
npm run test:ci       # CI mode with strict requirements
```

## 🚀 Release Process

### Pre-Release Checklist
1. **Full test suite**: `npm run test:ci`
2. **Linting**: `npm run lint`
3. **Coverage check**: Ensure thresholds met
4. **Manual testing**: Key scenarios in live FoundryVTT
5. **Version bump**: Update module.json and package.json
6. **Changelog**: Document all changes

### Version Strategy
- **Major**: Breaking changes, major feature additions
- **Minor**: New features, significant improvements
- **Patch**: Bug fixes, minor improvements

## 🔗 Key Dependencies

### Required Modules
- **lib-wrapper**: For safe function wrapping (auto-cover system)
- **socketlib**: Cross-client communication (optional but recommended)

### Development Dependencies
- **Jest**: Testing framework with jsdom environment
- **ESLint**: Code linting with custom rules
- **Babel**: ES6+ transpilation for tests

## 📚 Documentation Files

- **README.md**: User-facing documentation and feature overview
- **ARCHITECTURE.md**: Detailed technical architecture
- **DEVELOPMENT.md**: Development setup and testing guide
- **TESTING.md**: Comprehensive testing framework documentation
- **CHANGELOG.md**: Version history and changes
- **RULE_ELEMENTS.md**: Custom rule element documentation
- **SEEK_AUTOMATION.md**: Seek action automation details

## 💡 Future Development Guidelines

### Adding New Features
1. **Write tests first**: Follow TDD principles
2. **Update documentation**: Keep all docs current
3. **Performance consideration**: Benchmark new code
4. **Accessibility**: Support colorblind users and different screen sizes
5. **Backward compatibility**: Maintain save game compatibility

### Code Quality
- **Single responsibility**: Each file/function has one clear purpose
- **Error handling**: Graceful degradation with user feedback
- **Logging**: Comprehensive debug logging when debug mode enabled
- **Memory efficiency**: Clean up resources and avoid leaks

### User Experience
- **Progressive disclosure**: Advanced features don't clutter basic UI
- **Feedback**: Clear notifications for all user actions
- **Performance**: Operations complete quickly or show progress
- **Accessibility**: Support for different user needs and preferences

---

## 🆘 Emergency Procedures

### Critical Bug Response
1. **Identify scope**: Affects saves? Causes crashes? Data loss?
2. **Immediate mitigation**: Disable problematic features via settings
3. **Hotfix process**: Minimal change to resolve critical issue
4. **Communication**: Update users via GitHub issues/Discord

### Data Recovery
- **Scene corruption**: Use `api.clearAllSceneData()` to reset
- **Party token issues**: Use `manuallyRestoreAllPartyTokens()` ✅ **TESTED & WORKING**
- **Effect cleanup**: Use `cleanupAllCoverEffects()` for orphaned effects
- **Party cache inspection**: Check scene flags `pf2e-visioner.partyTokenStateCache` for debugging

### Performance Issues
- **Large scenes**: Increase batch sizes, reduce visual updates
- **Memory leaks**: Check event listener cleanup, effect management
- **Canvas performance**: Optimize drawing operations, reduce redraws

## 🐛 Recent Bug Fixes (Latest)

### ⚠️ Chat message update bug
- **Issue**: Visioner buttons disappear when chat messages are updated (e.g., `message.update({"flags.pf2e.test": "foo"})`)
- **Root cause**: `processedMessages` cache prevents re-injection when message is re-rendered after updates
- **Solution**: Added DOM check in `entry-service.js` - if message is cached but no `.pf2e-visioner-automation-panel` exists, allow re-injection
- **Files**: `scripts/chat/services/entry-service.js` (lines 55-63)
- **Impact**: ✅ FIXED - Chat automation panels now persist through message updates
- **Technical**: Uses `html.find('.pf2e-visioner-automation-panel').length > 0` to detect if UI was removed by update

### ✅ Player error handling
- **Status**: Already implemented - players don't see red console errors during token operations
- **Coverage**: Comprehensive test suite added in `tests/unit/chat-message-updates.test.js`
- **Scenarios tested**: Token deletion race conditions, party consolidation errors, effect update failures
- **Pattern**: All player-facing operations use try-catch with `console.warn` instead of throwing errors

### ✅ Party Token Integration Testing
- **Coverage**: Comprehensive test suite added in `tests/unit/party-token-integration.test.js` (18 test cases)
- **State Management**: Tests for saving/restoring visibility maps, cover maps, observer states, and effects
- **Race Conditions**: Tests for parallel token deletion, cleanup skipping, effect rebuild failures
- **Deferred Updates**: Tests for ally-to-ally relationship restoration when both tokens aren't immediately available
- **Effect Management**: Tests for duplicate prevention, correct PF2e icon usage, cache management
- **NPC Integration**: Tests for effect restoration FROM restored players TO existing NPCs AND FROM existing NPCs TO restored players
- **Integration**: Full consolidation/restoration cycle tests, mass party operations
- **Bug Coverage**: All previously fixed issues (duplicate effects, race conditions, ally relationships) are tested

### ✅ Auto-Cover Simplified Architecture (v2.6.5+)
- **Issue**: Complex auto-cover system with multiple code paths caused timing issues and inconsistent cover application
- **Impact**: ✅ FIXED - Simplified architecture with keybind-only popups and reliable automatic cover detection
- **Technical**: Complete refactor of auto-cover system in `scripts/hooks/auto-cover.js` and `scripts/cover/auto-cover.js`
- **Root Cause**: Previous complex libWrapper logic with multiple override paths created race conditions and timing conflicts
- **New Simplified Approach**: 
  - **Keybind-only popups**: Cover override popup only shows when user holds configured keybind (default: X key)
  - **Automatic detection**: When keybind not held, system automatically applies detected cover without user intervention
  - **Dual-phase processing**: 
    1. **libWrapper phase**: Modifies target actor DC immediately before roll calculation (ensures AC bonus is applied)
    2. **Chat message phase**: Applies persistent cover state and updates visual indicators
  - **Global override storage**: Uses `window.pf2eVisionerPopupOverrides` and `window.pf2eVisionerDialogOverrides` Maps for communication between phases
  - **Roll dialog integration**: PF2E roll dialogs include cover override buttons that store choices for chat message processing
  - **Per-user settings**: Correctly accesses PF2e per-user client settings (`game.user.flags.pf2e.settings.showCheckDialogs`) not system settings
- **Benefits**:
  - **Performance**: Eliminates complex conditional logic and multiple code paths
  - **Reliability**: Clear separation between DC modification (libWrapper) and state persistence (chat hooks)
  - **User control**: Popup only appears when explicitly requested via keybind
  - **Automatic operation**: Works seamlessly without user intervention in normal cases
  - **Correct timing**: DC modification happens at the right moment in PF2e's roll calculation
- **Testing**: New test suite in `tests/unit/simplified-auto-cover-core.test.js` and `tests/integration/auto-cover-workflow.test.js`
- **User Experience**: 
  - **Normal attacks**: Automatic cover detection and application, no interruption
  - **Override needed**: Hold keybind (X) while clicking attack to see popup with override options
  - **Roll dialogs**: When PF2e roll dialog appears, cover override buttons are injected for manual selection

---

**Remember**: This module is designed as an inspirational successor to pf2e-perception [[memory:4963811]], not a direct copy. Always consider the official PF2E system patterns and best practices [[memory:4812605]] when making changes.

**Last Updated**: 2025-01-20
**Document Version**: 1.2
