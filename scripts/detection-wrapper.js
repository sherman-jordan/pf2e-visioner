/**
 * Detection System Wrapper - Makes PF2E system show real conditions
 */

import { getVisibilityMap } from './utils.js';

/**
 * Initialize detection system wrappers
 */
export function initializeDetectionWrapper() {
  
  // Check if libWrapper is available
  if (!game.modules.get('lib-wrapper')?.active) {
    console.warn('Per-Token Visibility: libWrapper not found - visual conditions may not work properly');
    return;
  }
  
  // Wrap the main detection mode test visibility function
        libWrapper.register(
        'pf2e-visioner',
    'DetectionMode.prototype.testVisibility',
    detectionModeTestVisibility,
    'OVERRIDE'
  );
  
  // Wrap basic sight detection (hidden threshold - undetected tokens are invisible)
        libWrapper.register(
        'pf2e-visioner',
    'CONFIG.Canvas.detectionModes.basicSight._canDetect',
    canDetectWrapper(VISIBILITY_VALUES.hidden),
    'WRAPPER'
  );
  
  // Wrap light perception detection (hidden threshold - undetected tokens are invisible)
        libWrapper.register(
        'pf2e-visioner',
    'CONFIG.Canvas.detectionModes.lightPerception._canDetect',
    canDetectWrapper(VISIBILITY_VALUES.hidden),
    'WRAPPER'
  );
  
  // Wrap hearing detection (undetected threshold - can still hear undetected tokens)
        libWrapper.register(
        'pf2e-visioner',
    'CONFIG.Canvas.detectionModes.hearing._canDetect',
    canDetectWrapper(VISIBILITY_VALUES.undetected),
    'WRAPPER'
  );
  
  // Wrap tremor detection (undetected threshold - can still feel undetected tokens)
        libWrapper.register(
        'pf2e-visioner',
    'CONFIG.Canvas.detectionModes.feelTremor._canDetect',
    canDetectWrapper(VISIBILITY_VALUES.undetected),
    'WRAPPER'
  );
}

/**
 * Visibility values
 */
const VISIBILITY_VALUES = {
  observed: 0,
  concealed: 1,
  hidden: 2,
  undetected: 3,
};

/**
 * Override the detection mode test visibility function
 * This makes the PF2E system think tokens have actual conditions
 */
function detectionModeTestVisibility(visionSource, mode, config = {}) {
  if (!mode.enabled) return false;
  if (!this._canDetect(visionSource, config.object, config)) return false;
  return config.tests.some((test) => this._testPoint(visionSource, mode, config.object, test));
}

/**
 * Create a wrapper for detection functions that respects our visibility flags
 */
function canDetectWrapper(threshold) {
  return function (wrapped, visionSource, target, config) {
    // Call the original function first
    const canDetect = wrapped(visionSource, target);
    if (canDetect === false) return false;
    
    // Check our module's visibility settings
    const origin = visionSource.object;
    const reachedThreshold = reachesVisibilityThreshold(origin, target, threshold, config);
    
    return !reachedThreshold;
  };
}

/**
 * Check if visibility threshold is reached based on our module's flags
 */
function reachesVisibilityThreshold(origin, target, threshold, config = {}) {
  if (!origin?.actor || !target?.actor) return false;
  
  // Get visibility from our module's flags
  if (!config.visibility) {
    config.visibility = getVisibilityBetweenTokens(origin, target);
  }
  
  return VISIBILITY_VALUES[config.visibility] >= threshold;
}

/**
 * Get visibility state between two tokens using our module's flags
 * This is the key function that makes the detection wrapper work
 */
function getVisibilityBetweenTokens(observer, target) {
  if (!observer || !target) return 'observed';
  
  // Get the observer's visibility map
  const visibilityMap = getVisibilityMap(observer);
  
  // Return the visibility state for this target
  return visibilityMap[target.document.id] || 'observed';
}