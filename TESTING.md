# PF2E Visioner Testing Framework

This document describes the comprehensive testing framework for the PF2E Visioner module, designed to ensure code quality and prevent regressions during development and release.

## Overview

The testing framework covers all 50 test scenarios from the `Foundry_Visibility_Test_Scenarios.csv` file, providing comprehensive coverage of:

- **Unit Tests**: Individual functions and classes
- **Integration Tests**: Complex scenarios and interactions
- **Performance Tests**: Stress testing with many tokens and obstacles
- **Edge Case Tests**: Boundary conditions and error handling

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run All Tests

```bash
npm test
```

### 3. Run Tests with Coverage

```bash
npm run test:coverage
```

### 4. Run Tests in Watch Mode

```bash
npm run test:watch
```

### 5. Run Tests for CI

```bash
npm run test:ci
```

## Test Structure

```
tests/
├── setup.js                 # Jest setup and mocks
├── run-tests.js            # Custom test runner
├── unit/                   # Unit tests
│   ├── constants.test.js   # Constants and configuration
│   ├── utils.test.js       # Utility functions
│   ├── auto-cover.test.js  # Auto-cover system
│   └── token-manager.test.js # Token manager UI
└── integration/            # Integration tests
    └── visibility-scenarios.test.js # Complex scenarios
```

## Test Categories

### Unit Tests

#### Constants (`tests/unit/constants.test.js`)
- Module identity and configuration
- Visibility states (observed, concealed, hidden, undetected)
- Cover states (none, lesser, standard, greater)
- Default settings validation
- State consistency checks

#### Utilities (`tests/unit/utils.test.js`)
- Visibility and cover calculations
- Token management functions
- Error handling and edge cases
- Performance benchmarks

#### Auto-Cover (`tests/unit/auto-cover.test.js`)
- Automatic cover detection
- Size-based calculations
- Attack pair tracking
- Performance optimization

#### Token Manager (`tests/unit/token-manager.test.js`)
- UI component testing
- Mode switching (observer/target)
- Bulk operations
- Instance management

### Integration Tests

#### Visibility Scenarios (`tests/integration/visibility-scenarios.test.js`)
Based on the comprehensive test scenarios CSV:

**Baseline Scenarios (A01-A05)**
- Hide behind opaque wall
- Peek & re-hide (corner)
- Bright light reveal
- Make noise while Hidden
- Seek/Search

**Reveal on Attack (B06-B10)**
- Reveal on melee attack
- Ranged attack from concealment
- Save-only spell
- Reaction timing vs Hidden
- Revealed by outline

**Lighting & Vision (C11-C14)**
- Dim vs bright light concealment
- Darkvision parity
- Magical darkness vs special sight
- Flicker light stability

**Terrain & Cover (D15-D20)**
- Soft cover from ally
- Low wall vs tall target
- Greater cover behind pillar
- Door open/close mid-turn
- One-way window
- Squeezing / narrow slit

**Movement & Stealth (E21-E24)**
- Sneak across gap
- Fast move vs passive hearing
- Climb alters cover
- Prone for cover

**Special Senses (F25-F29)**
- Tremorsense vs flying
- Blindsight/echolocation vs Silence
- Lifesense vs undead/construct
- Blinded observer
- Invisible but noisy

**Effects (G30-G33)**
- Blur/Displacement
- Obscuring Mist / Fog Cloud
- Darkness + Daylight overlap
- GM-only illumination

**Performance (M49-M50)**
- Stress: 50+ tokens, fog, lights
- Save/Reload scene state

## Test Runner

The custom test runner (`tests/run-tests.js`) provides additional functionality:

### Command Line Options

```bash
# Show help
node tests/run-tests.js --help

# Run specific test types
node tests/run-tests.js --type unit
node tests/run-tests.js --type integration
node tests/run-tests.js --type all

# Generate coverage report
node tests/run-tests.js --coverage

# Run in watch mode
node tests/run-tests.js --watch

# Run in CI mode
node tests/run-tests.js --ci

# Run linting only
node tests/run-tests.js --lint

# Validate test suite only
node tests/run-tests.js --validate

# Generate test report only
node tests/run-tests.js --report
```

### Test Runner Features

- **Dependency Checking**: Verifies Jest and required scripts
- **Test Validation**: Ensures test suite structure is correct
- **Coverage Integration**: Reads and reports coverage data
- **Scenario Mapping**: Maps test files to CSV scenarios
- **Colored Output**: Clear visual feedback for test results

## Mock System

The testing framework includes comprehensive mocks for Foundry VTT:

### Global Mocks

- `game`: Settings, user permissions, system info
- `canvas`: Scene, tokens, walls, lighting, terrain
- `ui`: Notifications, windows
- `Hooks`: Event system
- `foundry`: Utilities and data models
- `Handlebars`: Template system

### Test Utilities

```javascript
// Create mock tokens
const token = createMockToken({
  id: 'test-token',
  x: 100, y: 100,
  actor: createMockActor({
    type: 'character',
    system: { traits: { size: { value: 'med' } } }
  })
});

// Create mock walls
const wall = createMockWall({
  c: [0, 0, 100, 100], // Coordinates
  sight: 0,              // Blocks sight
  move: 0                // Blocks movement
});

// Create mock lights
const light = createMockLight({
  x: 50, y: 50,
  config: {
    dim: 20,
    bright: 10,
    angle: 360,
    color: '#ffffff'
  }
});
```

## GitHub Actions Integration

The framework includes automated CI/CD through GitHub Actions:

### Workflow Features

- **Multi-Node Testing**: Tests on Node.js 18.x and 20.x
- **Security Scanning**: Dependency vulnerability checks
- **Build Verification**: Ensures module structure is correct
- **Release Checks**: Version consistency and artifact creation
- **Coverage Reporting**: Integration with Codecov

### Trigger Conditions

- Push to main/develop branches
- Pull requests
- Release creation

## Coverage Requirements

The testing framework enforces strict coverage requirements:

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

## Performance Benchmarks

Tests include performance benchmarks to ensure the module remains efficient:

- **Token Handling**: 100 tokens in <100ms
- **Wall Processing**: 50 walls in <50ms
- **Cover Calculation**: 50 targets in <200ms
- **Mode Switching**: 100 toggles in <50ms

## Writing New Tests

### Unit Test Template

```javascript
describe('Feature Name', () => {
  let testData;

  beforeEach(() => {
    // Setup test data
    testData = createMockToken({ /* ... */ });
  });

  test('should handle normal case', () => {
    const result = functionUnderTest(testData);
    expect(result).toBe(expectedValue);
  });

  test('should handle edge case', () => {
    const edgeCase = createMockToken({ /* edge case data */ });
    const result = functionUnderTest(edgeCase);
    expect(result).toBeDefined();
  });

  test('should handle error conditions', () => {
    expect(() => functionUnderTest(null)).toThrow();
  });
});
```

### Integration Test Template

```javascript
describe('Complex Scenario', () => {
  let scene, observer, target, obstacles;

  beforeEach(() => {
    // Set up complex scene
    scene = createMockScene();
    observer = createMockToken({ /* observer data */ });
    target = createMockToken({ /* target data */ });
    obstacles = [/* array of walls, terrain, etc. */];
    
    global.canvas.scene = scene;
    global.canvas.tokens.placeables = [observer, target];
    global.canvas.walls.placeables = obstacles;
  });

  test('should handle scenario correctly', () => {
    // Test the complex interaction
    const visibility = getVisibilityBetween(observer, target);
    const cover = getCoverBetween(observer, target);
    
    expect(visibility).toBe(expectedVisibility);
    expect(cover).toBe(expectedCover);
  });
});
```

## Debugging Tests

### Common Issues

1. **Mock Not Working**: Ensure mocks are imported correctly
2. **Async Issues**: Use `async/await` for asynchronous operations
3. **State Pollution**: Use `beforeEach` to reset state
4. **Coverage Gaps**: Check if all code paths are tested

### Debug Commands

```bash
# Run specific test file
npx jest tests/unit/utils.test.js

# Run with verbose output
npx jest --verbose

# Run with coverage for specific file
npx jest tests/unit/utils.test.js --coverage

# Debug mode
npx jest --detectOpenHandles --forceExit
```

## Pre-Release Checklist

Before releasing a new version:

1. **Run Full Test Suite**
   ```bash
   npm run test:ci
   ```

2. **Check Coverage**
   ```bash
   npm run test:coverage
   ```

3. **Run Linting**
   ```bash
   npm run lint
   ```

4. **Validate Test Suite**
   ```bash
   node tests/run-tests.js --validate
   ```

5. **Generate Test Report**
   ```bash
   node tests/run-tests.js --report
   ```

## Continuous Integration

The testing framework automatically runs on:

- **Every Commit**: Basic tests and linting
- **Pull Requests**: Full test suite and coverage
- **Releases**: Comprehensive validation and artifact creation

## Troubleshooting

### Test Failures

1. **Check Mock Setup**: Ensure Foundry VTT globals are mocked
2. **Verify Dependencies**: Run `npm install` to ensure all packages are available
3. **Check Node Version**: Ensure you're using Node.js 18+ or 20+
4. **Clear Jest Cache**: Run `npx jest --clearCache`

### Performance Issues

1. **Reduce Test Data**: Use fewer tokens/obstacles in performance tests
2. **Check System Resources**: Ensure adequate memory and CPU
3. **Update Benchmarks**: Adjust timing expectations for slower systems

### Coverage Issues

1. **Add Missing Tests**: Cover untested code paths
2. **Check Exclusions**: Verify coverage exclusions are correct
3. **Update Thresholds**: Adjust coverage requirements if needed

## Contributing

When adding new features:

1. **Write Tests First**: Follow TDD principles
2. **Cover Edge Cases**: Test boundary conditions
3. **Add Performance Tests**: Ensure new code is efficient
4. **Update Documentation**: Document new test scenarios

## Support

For testing framework issues:

1. Check this documentation
2. Review existing test examples
3. Check GitHub Actions logs
4. Create an issue with test details

---

The testing framework ensures that PF2E Visioner maintains high quality and reliability across all releases. Regular testing helps catch regressions early and provides confidence in the module's functionality.
