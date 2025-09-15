/**
 * Override Validation Dialog - ApplicationV2 with HandlebarsApplicationMixin
 * Shows when manual overrides become invalid due to position/lighting changes
 */

import { VISIBILITY_STATES, COVER_STATES } from '../constants.js';

export class OverrideValidationDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  constructor(options = {}) {
    super(options);
    this.invalidOverrides = options.invalidOverrides || [];
    this.tokenName = options.tokenName || 'Unknown Token';
  }

  static DEFAULT_OPTIONS = {
    id: "override-validation-dialog",
    tag: "div",
    window: {
      title: "Override Validation",
      icon: "fas fa-exclamation-triangle",
      // Include module root class so shared styles apply consistently
      contentClasses: ["pf2e-visioner", "override-validation-dialog"],
      resizable: true,
    },
    position: {
      width: 500,
      height: "auto",
      left: null,
      top: null
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false
    }
  };

  static PARTS = {
    content: {
      template: "modules/pf2e-visioner/templates/simple-override-validation.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Prepare invalid overrides data for display
  const overrides = this.invalidOverrides.map(override => {
      console.log('PF2E Visioner | Processing override for dialog:', override);
      const src = String(override.source || 'manual_action');
      let badgeLabel = 'Manual Override';
      let badgeIcon = 'fa-user-secret';
      let badgeClass = 'badge-manual';

      if (/sneak/i.test(src)) {
        badgeLabel = 'Sneak Override';
        badgeIcon = 'fa-running';
        badgeClass = 'badge-sneak';
      } else if (/seek/i.test(src)) {
        badgeLabel = 'Seek action';
        badgeIcon = 'fa-search';
        badgeClass = 'badge-seek';
      } else if (/point[_-]?out/i.test(src)) {
        badgeLabel = 'Point Out';
        badgeIcon = 'fa-hand-point-right';
        badgeClass = 'badge-pointout';
      } else if (/diversion/i.test(src)) {
        badgeLabel = 'Diversion';
        badgeIcon = 'fa-theater-masks';
        badgeClass = 'badge-diversion';
      } else if (/take[_-]?cover/i.test(src)) {
        badgeLabel = 'Take Cover';
        badgeIcon = 'fa-shield-alt';
        badgeClass = 'badge-takecover';
      } else if (/hide/i.test(src)) {
        badgeLabel = 'Hide Override';
        badgeIcon = 'fa-user-secret';
        badgeClass = 'badge-hide';
      } else if (/manual|popup|dialog|roll/i.test(src)) {
        badgeLabel = 'Manual Override';
        badgeIcon = 'fa-user-edit';
        badgeClass = 'badge-manual';
      } else {
        badgeLabel = 'Override';
        badgeIcon = 'fa-adjust';
        badgeClass = 'badge-generic';
      }
      // Resolve token images if available on the canvas
      const observerToken = canvas.tokens?.get(override.observerId);
      const targetToken = canvas.tokens?.get(override.targetId);
      const observerImg = observerToken?.document?.texture?.src ?? observerToken?.texture?.src ?? observerToken?.document?.img ?? null;
      const targetImg = targetToken?.document?.texture?.src ?? targetToken?.texture?.src ?? targetToken?.document?.img ?? null;

  // Pick analysis icons from actual current state when provided by validator
  // Prefer current states provided by the validator/caller; fall back to safe defaults
  const visibilityKey = override.currentVisibility || 'observed';
  const coverKey = override.currentCover || 'none';
  const prevVisibilityKey = override.state || (override.hasConcealment ? 'concealed' : 'observed');
  // Previous/original cover must reflect what the override expected at apply-time,
  // not what the currentCover is now. If we don't have a specific level, assume 'standard'.
  const prevCoverKey = override.hasCover
    ? (override.expectedCover || override.originalCover || 'standard')
    : 'none';

  const visCfg = (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]) || { icon: 'fas fa-eye', color: '#4caf50', label: 'Observed' };
  const coverCfg = (COVER_STATES && COVER_STATES[coverKey]) || { icon: 'fas fa-shield-slash', color: '#4caf50', label: 'No Cover' };
  const prevVisCfg = (VISIBILITY_STATES && VISIBILITY_STATES[prevVisibilityKey]) || { icon: 'fas fa-eye', color: '#9e9e9e', label: 'Observed' };
  const prevCoverCfg = (COVER_STATES && COVER_STATES[prevCoverKey]) || { icon: 'fas fa-shield', color: '#9e9e9e', label: 'Cover' };

      return {
        id: `${override.observerId}-${override.targetId}`,
        observerId: override.observerId,
        targetId: override.targetId,
        observerName: override.observerName,
        targetName: override.targetName,
        observerImg,
        targetImg,
        reason: override.reason,
        // Optionally surface a friendly description of current states
        currentVisibilityDescription: (VISIBILITY_STATES && VISIBILITY_STATES[visibilityKey]?.label)
          ? (game?.i18n?.localize?.(VISIBILITY_STATES[visibilityKey].label) + (coverKey && COVER_STATES && COVER_STATES[coverKey]?.label ? ` • ${game?.i18n?.localize?.(COVER_STATES[coverKey].label)}` : ''))
          : undefined,
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        badgeLabel,
        badgeIcon,
        badgeClass,
        prevVisibility: {
          key: prevVisibilityKey,
          icon: prevVisCfg.icon,
          color: prevVisCfg.color,
          label: game?.i18n?.localize?.(prevVisCfg.label) || 'Previous'
        },
        statusVisibility: {
          key: visibilityKey,
          icon: visCfg.icon,
          color: visCfg.color,
          label: game?.i18n?.localize?.(visCfg.label) || 'Observed'
        },
        prevCover: {
          key: prevCoverKey,
          icon: prevCoverCfg.icon,
          color: prevCoverCfg.color,
          label: game?.i18n?.localize?.(prevCoverCfg.label) || 'Previous Cover'
        },
        statusCover: {
          key: coverKey,
          icon: coverCfg.icon,
          color: coverCfg.color,
          label: game?.i18n?.localize?.(coverCfg.label) || 'No Cover'
        }
      };
    });

    // Determine target header info (like token manager) - assume a single target across overrides
    const primary = this.invalidOverrides[0];
    const headerTargetToken = primary ? canvas.tokens?.get(primary.targetId) : null;
    const targetHeader = {
      name: primary?.targetName || this.tokenName,
      img: headerTargetToken?.document?.texture?.src ?? headerTargetToken?.texture?.src ?? headerTargetToken?.document?.img ?? null
    };

    const result = {
      ...context,
      tokenName: this.tokenName,
      overrides,
      overrideCount: overrides.length,
      hasManualOverrides: overrides.some(o => /manual/i.test(o.source)),
      targetHeader
    };
    
    console.log('PF2E Visioner | Dialog context prepared:', result);
    return result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    
    // Add event listeners for bulk action buttons
    const clearAllBtn = this.element.querySelector('.btn-clear-all');
    const keepAllBtn = this.element.querySelector('.btn-keep-all');
    
    // Add event listeners for individual action buttons
    const individualClearBtns = this.element.querySelectorAll('.btn-clear');
    const individualKeepBtns = this.element.querySelectorAll('.btn-keep');
    
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => this._onClearAll());
    }
    
    if (keepAllBtn) {
      keepAllBtn.addEventListener('click', () => this._onKeepAll());
    }

    // Add listeners for individual clear buttons
    individualClearBtns.forEach(btn => {
      btn.addEventListener('click', (event) => {
        const overrideId = event.currentTarget.dataset.overrideId;
        this._onClearIndividual(overrideId);
      });
    });

    // Add listeners for individual keep buttons
    individualKeepBtns.forEach(btn => {
      btn.addEventListener('click', (event) => {
        const overrideId = event.currentTarget.dataset.overrideId;
        this._onKeepIndividual(overrideId);
      });
    });

    console.log('PF2E Visioner | Override validation dialog rendered with enhanced UI');
  }

  async _onKeepIndividual(overrideId) {
    console.log('PF2E Visioner | Keep individual override:', overrideId);
    
    // Find the override by ID
    const override = this.invalidOverrides.find(o => `${o.observerId}-${o.targetId}` === overrideId);
    if (!override) {
      console.warn('PF2E Visioner | Override not found:', overrideId);
      return;
    }

    try {
      // Remove from the dialog's data
      this.invalidOverrides = this.invalidOverrides.filter(o => `${o.observerId}-${o.targetId}` !== overrideId);
      
      // Disable the row and update status text/icon in the new table-based UI
      const overrideElement = this.element.querySelector(`[data-override-id="${overrideId}"]`);
      if (overrideElement) {
        overrideElement.style.opacity = '0.6';
        overrideElement.style.pointerEvents = 'none';
        const statusSpan = overrideElement.querySelector('.status-description span');
        if (statusSpan) statusSpan.textContent = 'Kept as manual override';
        const statusIcon = overrideElement.querySelector('.status-description i');
        if (statusIcon) {
          statusIcon.classList.remove('fa-info-circle');
          statusIcon.classList.add('fa-check-circle');
          statusIcon.style.color = '#198754';
        }
        const icons = overrideElement.querySelector('.status-icons');
        const desc = overrideElement.querySelector('.status-description');
        if (icons) icons.style.display = 'none';
        if (desc) desc.style.display = 'inline-flex';
      }
      
      // If no more overrides, close the dialog and hide indicator
      if (this.invalidOverrides.length === 0) {
        setTimeout(() => this.close(), 1000);
        try {
          const { default: indicator } = await import('./override-validation-indicator.js');
          indicator.hide();
        } catch {}
      }
      
      ui.notifications.info(`Kept override: ${override.observerName} → ${override.targetName}`);
    } catch (error) {
      console.error('PF2E Visioner | Error keeping individual override:', error);
      ui.notifications.error('Failed to keep override');
    }
  }

  async _onClearIndividual(overrideId) {
    console.log('PF2E Visioner | Clear individual override:', overrideId);
    
    // Find the override by ID
    const override = this.invalidOverrides.find(o => `${o.observerId}-${o.targetId}` === overrideId);
    if (!override) {
      console.warn('PF2E Visioner | Override not found:', overrideId);
      return;
    }

    try {
  const observer = canvas.tokens?.get(override.observerId);
      const target = canvas.tokens?.get(override.targetId);
      
      if (observer && target) {
        const { default: AvsOverrideManager } = await import('../chat/services/infra/avs-override-manager.js');
        await AvsOverrideManager.removeOverride(override.observerId, override.targetId);
        
        // Remove from the dialog's data
        this.invalidOverrides = this.invalidOverrides.filter(o => `${o.observerId}-${o.targetId}` !== overrideId);
        
        // Disable the row and update status text/icon in the new table-based UI
        const overrideElement = this.element.querySelector(`[data-override-id="${overrideId}"]`);
        if (overrideElement) {
          overrideElement.style.opacity = '0.6';
          overrideElement.style.pointerEvents = 'none';
          const statusSpan = overrideElement.querySelector('.status-description span');
          if (statusSpan) statusSpan.textContent = 'Cleared';
          const statusIcon = overrideElement.querySelector('.status-description i');
          if (statusIcon) {
            statusIcon.classList.remove('fa-info-circle');
            statusIcon.classList.add('fa-times-circle');
            statusIcon.style.color = '#dc3545';
          }
          const icons = overrideElement.querySelector('.status-icons');
          const desc = overrideElement.querySelector('.status-description');
          if (icons) icons.style.display = 'none';
          if (desc) desc.style.display = 'inline-flex';
        }
        
        // If no more overrides, close the dialog and hide indicator
        if (this.invalidOverrides.length === 0) {
          setTimeout(() => this.close(), 1000);
          try {
            const { default: indicator } = await import('./override-validation-indicator.js');
            indicator.hide();
          } catch {}
        }
        
        ui.notifications.info(`Cleared override: ${override.observerName} → ${override.targetName}`);
      }
    } catch (error) {
      console.error('PF2E Visioner | Error removing individual override:', error);
      ui.notifications.error('Failed to clear override');
    }
  }

  async _onClearAll() {
    console.log('PF2E Visioner | Clear All clicked');
    
    // Close dialog first
    await this.close();
    
    // Remove all invalid overrides
    for (const override of this.invalidOverrides) {
      try {
        const { default: AvsOverrideManager } = await import('../chat/services/infra/avs-override-manager.js');
        await AvsOverrideManager.removeOverride(override.observerId, override.targetId);
      } catch (error) {
        console.error('PF2E Visioner | Error removing override:', error);
      }
    }
    
    ui.notifications.info(`Cleared ${this.invalidOverrides.length} invalid override(s)`);
    try {
      const { default: indicator } = await import('./override-validation-indicator.js');
      indicator.hide();
    } catch {}
  }

  async _onKeepAll() {
    console.log('PF2E Visioner | Keep All clicked');
    await this.close();
    ui.notifications.info('Kept all current overrides');
    try {
      const { default: indicator } = await import('./override-validation-indicator.js');
      indicator.hide();
    } catch {}
  }

  /**
   * Static method to show the dialog with invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   * @param {string} tokenName - Name of the token that moved
   * @returns {Promise<OverrideValidationDialog>}
   */
  static async show(invalidOverrides, tokenName) {
    if (!invalidOverrides?.length) {
      console.log('PF2E Visioner | No invalid overrides to show dialog for');
      return null;
    }

    console.log('PF2E Visioner | Showing override validation dialog:', {
      tokenName,
      overrideCount: invalidOverrides.length,
      overrides: invalidOverrides
    });

    const dialog = new OverrideValidationDialog({
      invalidOverrides,
      tokenName
    });

    await dialog.render(true);
    return dialog;
  }
}

// Register the dialog for global access
window.OverrideValidationDialog = OverrideValidationDialog;