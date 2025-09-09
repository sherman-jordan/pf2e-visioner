/**
 * Register region behaviors using multiple approaches to ensure it works
 */

import { VisibilityRegionBehavior } from './VisibilityRegionBehavior.js';

import { MODULE_ID } from '../constants.js';

const behaviorKey = `${MODULE_ID}.Pf2eVisionerVisibility`;

function registerBehavior() {
  if (typeof CONFIG !== 'undefined' && CONFIG.RegionBehavior) {
    CONFIG.RegionBehavior.dataModels[behaviorKey] = VisibilityRegionBehavior;
    CONFIG.RegionBehavior.typeLabels[behaviorKey] = 'PF2e Visioner Visibility';
    CONFIG.RegionBehavior.typeIcons[behaviorKey] = 'fa-solid fa-eye';
  }
}

registerBehavior();
