/**
 * Prerequisite Warning Dialog - Shows validation warnings and recommendations
 * for sneak actions with position context. Allows users to proceed with warnings
 * or cancel to address issues first.
 */

import { DialogV2 } from '../../../helpers/dialog-utils.js';

export class PrerequisiteWarningDialog extends DialogV2 {
  constructor(validationResult, actionData, options = {}) {
    const dialogData = {
      title: 'Sneak Action Prerequisites',
      content: PrerequisiteWarningDialog._generateContent(validationResult),
      buttons: PrerequisiteWarningDialog._generateButtons(validationResult),
      default: validationResult.canProceed ? 'proceed' : 'cancel',
      close: () => null
    };

    super(dialogData, options);
    
    this.validationResult = validationResult;
    this.actionData = actionData;
  }

  /**
   * Shows the prerequisite warning dialog
   * @param {Object} validationResult - Validation results from prerequisite check
   * @param {Object} actionData - Action data
   * @returns {Promise<boolean>} True if user chooses to proceed, false otherwise
   */
  static async show(validationResult, actionData) {
    // Don't show dialog if validation is perfect
    if (validationResult.valid && validationResult.warnings.length === 0) {
      return true;
    }

    // Don't show dialog if action cannot proceed (errors will be shown via notifications)
    if (!validationResult.canProceed) {
      return false;
    }

    const dialog = new PrerequisiteWarningDialog(validationResult, actionData);
    const result = await dialog.render(true);
    return result === 'proceed';
  }

  /**
   * Generates the dialog content HTML
   * @param {Object} validationResult - Validation results
   * @returns {string} HTML content
   * @private
   */
  static _generateContent(validationResult) {
    let html = '<div class="prerequisite-warning-dialog">';
    
    // Add header based on validation status
    if (!validationResult.canProceed) {
      html += '<div class="warning-header error">';
      html += '<i class="fas fa-exclamation-triangle"></i>';
      html += '<h3>Cannot Proceed with Sneak Action</h3>';
      html += '</div>';
    } else if (!validationResult.valid) {
      html += '<div class="warning-header warning">';
      html += '<i class="fas fa-exclamation-triangle"></i>';
      html += '<h3>Sneak Action Warnings</h3>';
      html += '</div>';
    } else {
      html += '<div class="warning-header info">';
      html += '<i class="fas fa-info-circle"></i>';
      html += '<h3>Sneak Action Information</h3>';
      html += '</div>';
    }

    // Add errors section
    if (validationResult.errors && validationResult.errors.length > 0) {
      html += '<div class="validation-section errors">';
      html += '<h4><i class="fas fa-times-circle"></i> Critical Issues</h4>';
      html += '<ul>';
      for (const error of validationResult.errors) {
        html += `<li class="error-item">${error}</li>`;
      }
      html += '</ul>';
      html += '</div>';
    }

    // Add warnings section
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      html += '<div class="validation-section warnings">';
      html += '<h4><i class="fas fa-exclamation-triangle"></i> Warnings</h4>';
      html += '<ul>';
      for (const warning of validationResult.warnings) {
        html += `<li class="warning-item">${warning}</li>`;
      }
      html += '</ul>';
      html += '</div>';
    }

    // Add recommendations section
    if (validationResult.recommendations && validationResult.recommendations.length > 0) {
      html += '<div class="validation-section recommendations">';
      html += '<h4><i class="fas fa-lightbulb"></i> Recommendations</h4>';
      html += '<ul>';
      for (const recommendation of validationResult.recommendations.slice(0, 5)) {
        html += `<li class="recommendation-item">${recommendation}</li>`;
      }
      html += '</ul>';
      html += '</div>';
    }

    // Add position analysis summary if available
    if (validationResult.positionAnalysis) {
      html += PrerequisiteWarningDialog._generatePositionSummary(validationResult.positionAnalysis);
    }

    // Add system status if there are issues
    if (validationResult.systemStatus && !validationResult.systemStatus.dualSystemIntegration) {
      html += '<div class="validation-section system-status">';
      html += '<h4><i class="fas fa-cog"></i> System Status</h4>';
      html += '<ul>';
      if (!validationResult.systemStatus.avsAvailable) {
        html += '<li class="warning-item">AVS system unavailable</li>';
      }
      if (!validationResult.systemStatus.autoCoverAvailable) {
        html += '<li class="warning-item">Auto-Cover system unavailable</li>';
      }
      if (!validationResult.systemStatus.positionTracking) {
        html += '<li class="info-item">Position tracking disabled</li>';
      }
      html += '</ul>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Generates position analysis summary HTML
   * @param {Object} positionAnalysis - Position analysis data
   * @returns {string} HTML content
   * @private
   */
  static _generatePositionSummary(positionAnalysis) {
    let html = '<div class="validation-section position-summary">';
    html += '<h4><i class="fas fa-map-marker-alt"></i> Position Analysis</h4>';
    
    // Overall quality indicator
    const qualityClass = PrerequisiteWarningDialog._getQualityClass(positionAnalysis.overallQuality);
    html += `<div class="position-quality ${qualityClass}">`;
    html += `<strong>Overall Position Quality:</strong> ${positionAnalysis.overallQuality.toUpperCase()}`;
    html += '</div>';

    // Quick stats
    html += '<div class="position-stats">';
    html += '<div class="stat-row">';
    html += `<span class="stat-label">Observers:</span> <span class="stat-value">${positionAnalysis.validPositions}</span>`;
    html += '</div>';
    
    if (positionAnalysis.hiddenFromCount > 0) {
      html += '<div class="stat-row good">';
      html += `<span class="stat-label">Hidden from:</span> <span class="stat-value">${positionAnalysis.hiddenFromCount}</span>`;
      html += '</div>';
    }
    
    if (positionAnalysis.observedByCount > 0) {
      html += '<div class="stat-row bad">';
      html += `<span class="stat-label">Observed by:</span> <span class="stat-value">${positionAnalysis.observedByCount}</span>`;
      html += '</div>';
    }
    
    if (positionAnalysis.goodCoverCount > 0) {
      html += '<div class="stat-row good">';
      html += `<span class="stat-label">Good cover from:</span> <span class="stat-value">${positionAnalysis.goodCoverCount}</span>`;
      html += '</div>';
    }
    
    html += '<div class="stat-row">';
    html += `<span class="stat-label">Average distance:</span> <span class="stat-value">${Math.round(positionAnalysis.averageDistance)} ft</span>`;
    html += '</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  /**
   * Gets CSS class for position quality
   * @param {string} quality - Position quality ('excellent', 'good', 'poor', 'terrible')
   * @returns {string} CSS class name
   * @private
   */
  static _getQualityClass(quality) {
    switch (quality) {
      case 'excellent': return 'quality-excellent';
      case 'good': return 'quality-good';
      case 'poor': return 'quality-poor';
      case 'terrible': return 'quality-terrible';
      default: return 'quality-unknown';
    }
  }

  /**
   * Generates dialog buttons based on validation results
   * @param {Object} validationResult - Validation results
   * @returns {Object} Button configuration
   * @private
   */
  static _generateButtons(validationResult) {
    const buttons = {};

    if (validationResult.canProceed) {
      buttons.proceed = {
        icon: '<i class="fas fa-check"></i>',
        label: validationResult.valid ? 'Proceed' : 'Proceed Anyway',
        callback: () => 'proceed'
      };
    }

    buttons.cancel = {
      icon: '<i class="fas fa-times"></i>',
      label: 'Cancel',
      callback: () => 'cancel'
    };

    return buttons;
  }

  /**
   * Activates listeners for the dialog
   * @param {jQuery} html - Dialog HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Add click handlers for expandable sections
    html.find('.validation-section h4').click((event) => {
      const section = $(event.currentTarget).parent();
      section.toggleClass('collapsed');
    });

    // Add tooltips for position stats
    html.find('.stat-value').each((index, element) => {
      const $element = $(element);
      const label = $element.siblings('.stat-label').text();
      $element.attr('title', `${label} ${$element.text()}`);
    });
  }
}

// Add CSS styles for the dialog
const dialogStyles = `
<style>
.prerequisite-warning-dialog {
  max-width: 500px;
  font-family: var(--font-primary);
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.warning-header.error {
  background-color: rgba(255, 0, 0, 0.1);
  border: 1px solid #ff0000;
  color: #cc0000;
}

.warning-header.warning {
  background-color: rgba(255, 165, 0, 0.1);
  border: 1px solid #ffa500;
  color: #cc8400;
}

.warning-header.info {
  background-color: rgba(0, 123, 255, 0.1);
  border: 1px solid #007bff;
  color: #0056b3;
}

.warning-header h3 {
  margin: 0;
  font-size: 16px;
}

.validation-section {
  margin-bottom: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.validation-section h4 {
  margin: 0;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #ddd;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.validation-section h4:hover {
  background-color: #e9ecef;
}

.validation-section.collapsed ul,
.validation-section.collapsed .position-stats {
  display: none;
}

.validation-section ul {
  margin: 0;
  padding: 10px 12px;
  list-style: none;
}

.validation-section li {
  margin-bottom: 5px;
  padding-left: 20px;
  position: relative;
}

.error-item::before {
  content: "✗";
  position: absolute;
  left: 0;
  color: #dc3545;
  font-weight: bold;
}

.warning-item::before {
  content: "⚠";
  position: absolute;
  left: 0;
  color: #ffc107;
}

.recommendation-item::before {
  content: "💡";
  position: absolute;
  left: 0;
}

.info-item::before {
  content: "ℹ";
  position: absolute;
  left: 0;
  color: #17a2b8;
}

.position-quality {
  padding: 8px 12px;
  font-weight: bold;
  text-align: center;
  border-radius: 4px;
  margin: 10px 12px;
}

.quality-excellent {
  background-color: rgba(40, 167, 69, 0.2);
  color: #155724;
  border: 1px solid #28a745;
}

.quality-good {
  background-color: rgba(23, 162, 184, 0.2);
  color: #0c5460;
  border: 1px solid #17a2b8;
}

.quality-poor {
  background-color: rgba(255, 193, 7, 0.2);
  color: #856404;
  border: 1px solid #ffc107;
}

.quality-terrible {
  background-color: rgba(220, 53, 69, 0.2);
  color: #721c24;
  border: 1px solid #dc3545;
}

.position-stats {
  padding: 10px 12px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 2px 4px;
  border-radius: 2px;
}

.stat-row.good {
  background-color: rgba(40, 167, 69, 0.1);
}

.stat-row.bad {
  background-color: rgba(220, 53, 69, 0.1);
}

.stat-label {
  font-weight: 500;
}

.stat-value {
  font-weight: bold;
}
</style>
`;

// Inject styles into document head
if (!document.querySelector('#prerequisite-warning-dialog-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'prerequisite-warning-dialog-styles';
  styleElement.innerHTML = dialogStyles.replace(/<\/?style>/g, '');
  document.head.appendChild(styleElement);
}