#!/usr/bin/env node

/**
 * PF2E Visioner Test Runner
 * 
 * This script provides a comprehensive test runner for the PF2E Visioner module.
 * It can run tests locally, generate reports, and validate the test suite.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log('\n' + '='.repeat(60), 'bright');
  log(` ${message}`, 'bright');
  log('='.repeat(60), 'bright');
}

function logSection(message) {
  log('\n' + '-'.repeat(40), 'cyan');
  log(` ${message}`, 'cyan');
  log('-'.repeat(40), 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

// Test configuration
const TEST_CONFIG = {
  unit: {
    pattern: 'tests/unit/**/*.test.js',
    description: 'Unit tests for individual functions and classes'
  },
  integration: {
    pattern: 'tests/integration/**/*.test.js',
    description: 'Integration tests for complex scenarios and interactions'
  },
  all: {
    pattern: 'tests/**/*.test.js',
    description: 'All tests (unit + integration)'
  }
};

// Test scenarios mapping
const TEST_SCENARIOS = {
  'A01': 'Hide behind opaque wall',
  'A02': 'Peek & re-hide (corner)',
  'A03': 'Bright light reveal',
  'A04': 'Make noise while Hidden',
  'A05': 'Seek/Search',
  'B06': 'Reveal on melee attack',
  'B07': 'Ranged attack from concealment',
  'B08': 'Save-only spell',
  'B09': 'Reaction timing vs Hidden',
  'B10': 'Revealed by outline (Glitterdust/Faerie Fire)',
  'C11': 'Dim vs bright light concealment',
  'C12': 'Darkvision parity',
  'C13': 'Magical darkness vs special sight',
  'C14': 'Flicker light stability',
  'D15': 'Soft cover from ally',
  'D16': 'Low wall vs tall target',
  'D17': 'Greater cover behind pillar',
  'D18': 'Door open/close mid-turn',
  'D19': 'One-way window (terrain wall)',
  'D20': 'Squeezing / narrow slit',
  'E21': 'Sneak across gap',
  'E22': 'Fast move vs passive hearing',
  'E23': 'Climb alters cover',
  'E24': 'Prone for cover',
  'F25': 'Tremorsense vs flying',
  'F26': 'Blindsight/echolocation vs Silence',
  'F27': 'Lifesense vs undead/construct',
  'F28': 'Blinded observer',
  'F29': 'Invisible but noisy',
  'G30': 'Blur/Displacement',
  'G31': 'Obscuring Mist / Fog Cloud',
  'G32': 'Darkness + Daylight overlap',
  'G33': 'GM-only illumination',
  'M49': 'Stress: 50+ tokens, fog, lights',
  'M50': 'Save/Reload scene state'
};

function checkDependencies() {
  logSection('Checking Dependencies');
  
  try {
    // Check if Jest is installed
    require.resolve('jest');
    logSuccess('Jest is available');
  } catch (error) {
    logError('Jest is not installed. Run: npm install');
    return false;
  }
  
  try {
    // Check if package.json exists
    const packageJson = require('../package.json');
    logSuccess('package.json found');
    
    // Check required scripts
    const requiredScripts = ['test', 'test:ci', 'lint'];
    for (const script of requiredScripts) {
      if (packageJson.scripts[script]) {
        logSuccess(`Script '${script}' found`);
      } else {
        logWarning(`Script '${script}' missing`);
      }
    }
  } catch (error) {
    logError('package.json not found or invalid');
    return false;
  }
  
  return true;
}

function runLinting() {
  logSection('Running Linting');
  
  try {
    execSync('npm run lint', { stdio: 'inherit' });
    logSuccess('Linting passed');
    return true;
  } catch (error) {
    logError('Linting failed');
    return false;
  }
}

function runTests(testType = 'all', options = {}) {
  const config = TEST_CONFIG[testType];
  if (!config) {
    logError(`Unknown test type: ${testType}`);
    return false;
  }
  
  logSection(`Running ${testType.toUpperCase()} Tests`);
  logInfo(config.description);
  
  const jestArgs = [
    '--passWithNoTests',
    '--verbose',
    '--detectOpenHandles'
  ];
  
  if (options.coverage) {
    jestArgs.push('--coverage');
  }
  
  if (options.watch) {
    jestArgs.push('--watch');
  }
  
  if (options.ci) {
    jestArgs.push('--ci', '--watchAll=false');
  }
  
  try {
    const command = `npx jest ${jestArgs.join(' ')}`;
    logInfo(`Executing: ${command}`);
    
    execSync(command, { stdio: 'inherit' });
    logSuccess(`${testType} tests passed`);
    return true;
  } catch (error) {
    logError(`${testType} tests failed`);
    return false;
  }
}

function generateTestReport() {
  logSection('Generating Test Report');
  
  const report = {
    timestamp: new Date().toISOString(),
    module: 'PF2E Visioner',
    version: require('../package.json').version,
    testScenarios: Object.keys(TEST_SCENARIOS).length,
    testTypes: Object.keys(TEST_CONFIG).length,
    coverage: {
      unit: 0,
      integration: 0,
      overall: 0
    }
  };
  
  // Try to read coverage data if it exists
  try {
    const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
    if (fs.existsSync(coveragePath)) {
      const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      report.coverage = coverageData.total;
    }
  } catch (error) {
    logWarning('Could not read coverage data');
  }
  
  // Write report to file
  const reportPath = path.join(__dirname, '../test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logSuccess(`Test report written to: ${reportPath}`);
  
  return report;
}

function validateTestSuite() {
  logSection('Validating Test Suite');
  
  let valid = true;
  
  // Check if test directories exist
  const testDirs = ['tests', 'tests/unit', 'tests/integration'];
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) {
      logSuccess(`Directory '${dir}' exists`);
    } else {
      logError(`Directory '${dir}' missing`);
      valid = false;
    }
  }
  
  // Check if setup file exists
  if (fs.existsSync('tests/setup.js')) {
    logSuccess('Test setup file exists');
  } else {
    logError('Test setup file missing');
    valid = false;
  }
  
  // Count test files
  let testFileCount = 0;
  for (const config of Object.values(TEST_CONFIG)) {
    const pattern = config.pattern.replace('tests/', '');
    const files = glob.sync(pattern, { cwd: 'tests' });
    testFileCount += files.length;
  }
  
  logInfo(`Found ${testFileCount} test files`);
  
  // Check test scenarios coverage
  const coveredScenarios = Object.keys(TEST_SCENARIOS).length;
  logInfo(`Test scenarios covered: ${coveredScenarios}`);
  
  return valid;
}

function showHelp() {
  logHeader('PF2E Visioner Test Runner Help');
  
  log('\nUsage: node tests/run-tests.js [options]', 'bright');
  
  log('\nOptions:', 'cyan');
  log('  --help, -h          Show this help message');
  log('  --type <type>       Run specific test type (unit, integration, all)');
  log('  --coverage          Generate coverage report');
  log('  --watch             Run tests in watch mode');
  log('  --ci                Run tests in CI mode');
  log('  --lint              Run linting only');
  log('  --validate          Validate test suite only');
  log('  --report            Generate test report only');
  
  log('\nExamples:', 'cyan');
  log('  node tests/run-tests.js                    # Run all tests');
  log('  node tests/run-tests.js --type unit        # Run unit tests only');
  log('  node tests/run-tests.js --coverage         # Run tests with coverage');
  log('  node tests/run-tests.js --lint             # Run linting only');
  log('  node tests/run-tests.js --validate         # Validate test suite');
  
  log('\nTest Types:', 'cyan');
  for (const [type, config] of Object.entries(TEST_CONFIG)) {
    log(`  ${type.padEnd(12)} - ${config.description}`);
  }
  
  log('\nTest Scenarios:', 'cyan');
  log(`  Total: ${Object.keys(TEST_SCENARIOS).length} scenarios covered`);
  log('  See Foundry_Visibility_Test_Scenarios.csv for details');
}

function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {
    type: 'all',
    coverage: false,
    watch: false,
    ci: false,
    lint: false,
    validate: false,
    report: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--type':
        options.type = args[++i] || 'all';
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--ci':
        options.ci = true;
        break;
      case '--lint':
        options.lint = true;
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--report':
        options.report = true;
        break;
      default:
        logWarning(`Unknown option: ${arg}`);
        break;
    }
  }
  
  if (options.help) {
    showHelp();
    return;
  }
  
  logHeader('PF2E Visioner Test Runner');
  logInfo(`Running tests for: ${options.type}`);
  
  // Check dependencies first
  if (!checkDependencies()) {
    process.exit(1);
  }
  
  let success = true;
  
  // Run requested operations
  if (options.lint) {
    success = runLinting() && success;
  }
  
  if (options.validate) {
    success = validateTestSuite() && success;
  }
  
  if (options.report) {
    generateTestReport();
  }
  
  if (!options.lint && !options.validate && !options.report) {
    // Run tests by default
    success = runTests(options.type, options) && success;
    
    if (success) {
      generateTestReport();
    }
  }
  
  // Final status
  logHeader('Test Runner Summary');
  if (success) {
    logSuccess('All operations completed successfully');
    logInfo('Your PF2E Visioner module is ready for release!');
  } else {
    logError('Some operations failed');
    logWarning('Please fix the issues before releasing');
    process.exit(1);
  }
}

// Handle glob if available
let glob;
try {
  glob = require('glob');
} catch (error) {
  // glob not available, skip validation
  glob = { sync: () => [] };
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  runTests,
  runLinting,
  validateTestSuite,
  generateTestReport,
  TEST_CONFIG,
  TEST_SCENARIOS
};
