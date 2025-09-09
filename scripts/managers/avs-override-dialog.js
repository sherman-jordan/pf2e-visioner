/**
 * AVS Override Dialog - Manage Auto Visibility System overrides for a token
 */

import { MODULE_ID, VISIBILITY_STATES } from '../constants.js';
import * as avsOverrideService from '../services/avs-override-service.js';

export class AVSOverrideDialog extends foundry.applications.api.ApplicationV2 {
  constructor(token, options = {}) {
    super(options);
    this.token = token;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'avs-override-dialog',
      title: game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.TITLE'),
      template: 'modules/pf2e-visioner/templates/avs-override-dialog.hbs',
      classes: ['pf2e-visioner', 'avs-override-dialog'],
      width: 400,
      height: 500,
      resizable: true,
      dragDrop: [{ dragSelector: null, dropSelector: null }],
      actions: {
        close: AVSOverrideDialog._onClose,
        removeOverride: AVSOverrideDialog._onRemoveOverride,
        toggleKillSwitch: AVSOverrideDialog._onToggleKillSwitch,
        clearAllOverrides: AVSOverrideDialog._onClearAllOverrides,
      },
    });
  }

  static PARTS = {
    content: {
      template: 'modules/pf2e-visioner/templates/avs-override-dialog.hbs',
    },
  };

  async _renderHTML(context, options) {
    const html = await foundry.applications.handlebars.renderTemplate(
      this.constructor.PARTS.content.template,
      context,
    );
    return html;
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    return content;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.addEventListeners();
  }

  async _prepareContext() {
    const overrides = avsOverrideService.getAllAVSOverrides(this.token);
    const killSwitchEnabled = avsOverrideService.getAVSKillSwitch(this.token);

    console.log(`${MODULE_ID} | AVS Override Dialog - Token: ${this.token.name}`);
    console.log(`${MODULE_ID} | AVS Override Dialog - Overrides:`, overrides);
    console.log(`${MODULE_ID} | AVS Override Dialog - Kill Switch:`, killSwitchEnabled);

    // Process overrides for display
    const processedOverrides = [];
    for (const [key, override] of Object.entries(overrides)) {
      const targetToken = canvas.tokens.get(override.targetId);
      if (targetToken) {
        const visibilityState = VISIBILITY_STATES[override.visibilityState];
        processedOverrides.push({
          observerId: this.token.id,
          targetId: override.targetId,
          targetName: override.targetName,
          targetImg: targetToken.document.texture.src || 'icons/svg/book.svg',
          visibilityState: {
            value: override.visibilityState,
            icon: visibilityState?.icon || 'fas fa-eye',
            label: game.i18n.localize(
              visibilityState?.label || 'PF2E_VISIONER.VISIBILITY_STATES.observed',
            ),
            cssClass: this.getVisibilityCssClass(override.visibilityState),
          },
          timestamp: override.timestamp,
        });
      }
    }

    // Get all available visibility states
    const visibilityStates = Object.entries(VISIBILITY_STATES).map(([key, config]) => ({
      value: key,
      label: game.i18n.localize(config.label),
      icon: config.icon,
      cssClass: config.cssClass,
    }));

    const data = {
      observer: {
        name: this.token.name,
        img: this.token.document.texture.src || 'icons/svg/book.svg',
      },
      processedOverrides: processedOverrides,
      hasOverrides: processedOverrides.length > 0,
      killSwitchEnabled: killSwitchEnabled,
      visibilityStates: visibilityStates,
    };

    console.log(`${MODULE_ID} | AVS Override Dialog - Final Data:`, data);
    console.log(`${MODULE_ID} | AVS Override Dialog - Processed Overrides:`, processedOverrides);
    console.log(`${MODULE_ID} | AVS Override Dialog - Has Overrides Flag:`, data.hasOverrides);
    return data;
  }

  getVisibilityIcon(state) {
    const icons = {
      observed: 'fas fa-eye',
      concealed: 'fas fa-eye-slash',
      hidden: 'fas fa-eye-slash',
      undetected: 'fas fa-question',
    };
    return icons[state] || 'fas fa-eye';
  }

  getVisibilityLabel(state) {
    const labels = {
      observed: 'Observed',
      concealed: 'Concealed',
      hidden: 'Hidden',
      undetected: 'Undetected',
    };
    return labels[state] || 'Observed';
  }

  getVisibilityCssClass(state) {
    const classes = {
      observed: 'observed',
      concealed: 'concealed',
      hidden: 'hidden',
      undetected: 'undetected',
    };
    return classes[state] || 'observed';
  }

  addEventListeners() {
    console.log(`${MODULE_ID} | AVS Override Dialog - Adding event listeners`);

    // Bind state icon clicks
    const stateIcons = this.element.querySelectorAll('.state-icon');
    console.log(`${MODULE_ID} | Found ${stateIcons.length} state icons`);
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', this._onStateIconClick.bind(this));
    });

    // Bind other buttons using data-action
    const buttons = this.element.querySelectorAll('[data-action]');
    console.log(`${MODULE_ID} | Found ${buttons.length} action buttons`);
    buttons.forEach((button) => {
      const action = button.dataset.action;
      if (action === 'removeOverride') {
        button.addEventListener('click', this._onRemoveOverride.bind(this));
      } else if (action === 'toggleKillSwitch') {
        button.addEventListener('change', this._onToggleKillSwitch.bind(this));
      } else if (action === 'clearAllOverrides') {
        button.addEventListener('click', this._onClearAllOverrides.bind(this));
      } else if (action === 'close') {
        button.addEventListener('click', this._onClose.bind(this));
      }
    });
  }

  async _onRemoveOverride(event) {
    console.log(`${MODULE_ID} | Remove override clicked`);

    const button = event.currentTarget;
    const targetId = button.dataset.targetId;
    console.log(`${MODULE_ID} | Target ID: ${targetId}`);

    const targetToken = canvas.tokens.get(targetId);

    if (!targetToken) {
      ui.notifications.warn(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.TARGET_NOT_FOUND'),
      );
      return;
    }

    try {
      await avsOverrideService.removeAVSOverride(this.token, targetToken);
      ui.notifications.info(
        game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.OVERRIDE_REMOVED', {
          observer: this.token.name,
          target: targetToken.name,
        }),
      );
      this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Error removing AVS override:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_REMOVING_OVERRIDE'),
      );
    }
  }

  async _onClearAllOverrides(event) {
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.CLEAR_ALL_CONFIRM_TITLE'),
      content: game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.CLEAR_ALL_CONFIRM_CONTENT', {
        token: this.token.name,
      }),
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });

    if (!confirmed) return;

    try {
      await avsOverrideService.clearAllAVSOverrides(this.token);
      ui.notifications.info(
        game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ALL_OVERRIDES_CLEARED', {
          token: this.token.name,
        }),
      );
      this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Error clearing all AVS overrides:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_CLEARING_OVERRIDES'),
      );
    }
  }

  async _onToggleKillSwitch(event) {
    console.log(`${MODULE_ID} | Kill switch toggled`);

    const enabled = event.currentTarget?.checked ?? event.target?.checked;
    console.log(`${MODULE_ID} | Kill switch enabled: ${enabled}`);

    try {
      await avsOverrideService.setAVSKillSwitch(this.token, enabled);

      // Update the label with appropriate CSS class
      const target = event.currentTarget || event.target;
      const label = target?.parentElement?.querySelector('.kill-switch-label');
      if (label) {
        label.textContent = enabled ? 'AVS Disabled' : 'AVS Enabled';
        label.className = 'kill-switch-label';
        if (enabled) {
          label.classList.add('override-state');
        } else {
          label.classList.add('auto-state');
        }
      }

      const message = enabled
        ? game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.AVS_DISABLED_FOR_TOKEN', {
            token: this.token.name,
          })
        : game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.AVS_ENABLED_FOR_TOKEN', {
            token: this.token.name,
          });

      ui.notifications.info(message);
      this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Error toggling AVS kill switch:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_TOGGLING_KILL_SWITCH'),
      );
    }
  }

  async _onStateIconClick(event) {
    event.preventDefault();
    event.stopPropagation();

    console.log(`${MODULE_ID} | State icon clicked`);

    const icon = event.currentTarget;
    const targetId = icon.dataset.target;
    const newState = icon.dataset.state;

    console.log(`${MODULE_ID} | Target ID: ${targetId}, New State: ${newState}`);

    if (!targetId || !newState) return;

    try {
      const targetToken = canvas.tokens.get(targetId);
      if (!targetToken) {
        ui.notifications.warn('Target token not found');
        return;
      }

      // Update the AVS override with the new state
      await avsOverrideService.setAVSOverride(this.token, targetToken, newState);

      // Update the UI selection
      const iconSelection = icon.closest('.icon-selection');
      if (iconSelection) {
        const allIcons = iconSelection.querySelectorAll('.state-icon');
        allIcons.forEach((i) => i.classList.remove('selected'));
        icon.classList.add('selected');

        // Update the hidden input
        const hiddenInput = iconSelection.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;

        // Update the label
        const label = iconSelection.parentElement.querySelector('.state-label');
        if (label) {
          const stateConfig = VISIBILITY_STATES[newState];
          label.textContent = game.i18n.localize(stateConfig?.label || newState);
        }
      }

      ui.notifications.info(
        `AVS Override updated: ${this.token.name} → ${targetToken.name} = ${newState}`,
      );
    } catch (error) {
      console.error(`${MODULE_ID} | Error updating AVS override:`, error);
      ui.notifications.error('Error updating AVS override');
    }
  }

  _onClose(event) {
    this.close();
  }

  /**
   * Static method to open the dialog for a token
   * @param {Token} token - The token to manage overrides for
   */
  static async openForToken(token) {
    if (!token) {
      ui.notifications.warn(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.NO_TOKEN_SELECTED'),
      );
      return;
    }

    // Debug: Check what overrides exist
    const overrides = avsOverrideService.getAllAVSOverrides(token);
    const killSwitchEnabled = avsOverrideService.getAVSKillSwitch(token);
    const hasOverrides = Object.keys(overrides).length > 0;

    console.log(`${MODULE_ID} | Opening AVS Override Dialog for token: ${token.name}`);
    console.log(`${MODULE_ID} | Overrides found:`, overrides);
    console.log(`${MODULE_ID} | Kill switch enabled:`, killSwitchEnabled);
    console.log(`${MODULE_ID} | Has overrides:`, hasOverrides);

    // For now, always open the dialog to debug the issue
    // TODO: Re-enable the check once we confirm overrides are being detected
    // if (!hasOverrides && !killSwitchEnabled) {
    //   ui.notifications.info(game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.NO_OVERRIDES'));
    //   return;
    // }

    const dialog = new AVSOverrideDialog(token);
    dialog.render(true);
  }

  // Static action handlers
  static async _onClose(event, target) {
    const app = target.closest('.avs-override-dialog')?.app;
    if (app) {
      await app.close();
    }
  }

  static async _onRemoveOverride(event, target) {
    const app = target.closest('.avs-override-dialog')?.app;
    if (!app) return;

    const observerId = target.dataset.observerId;
    const targetId = target.dataset.targetId;

    if (!observerId || !targetId) {
      ui.notifications.warn('Invalid override data');
      return;
    }

    try {
      const observerToken = canvas.tokens.get(observerId);
      const targetToken = canvas.tokens.get(targetId);

      if (!observerToken || !targetToken) {
        ui.notifications.warn('Token not found');
        return;
      }

      await avsOverrideService.removeAVSOverride(observerToken, targetToken);

      ui.notifications.info(
        game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.OVERRIDE_REMOVED', {
          observer: observerToken.name,
          target: targetToken.name,
        }),
      );

      // Re-render the dialog to update the display
      app.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Error removing override:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_REMOVING_OVERRIDE'),
      );
    }
  }

  static async _onToggleKillSwitch(event, target) {
    const app = target.closest('.avs-override-dialog')?.app;
    if (!app) return;

    const isChecked = target.checked;

    try {
      await avsOverrideService.setAVSKillSwitch(app.token, isChecked);

      // Update the label with appropriate CSS class
      const label = target.parentElement?.querySelector('.kill-switch-label');
      if (label) {
        label.textContent = isChecked ? 'AVS Disabled' : 'AVS Enabled';
        label.className = 'kill-switch-label';
        if (isChecked) {
          label.classList.add('override-state');
        } else {
          label.classList.add('auto-state');
        }
      }

      const message = isChecked
        ? game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.AVS_DISABLED_FOR_TOKEN', {
            token: app.token.name,
          })
        : game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.AVS_ENABLED_FOR_TOKEN', {
            token: app.token.name,
          });

      ui.notifications.info(message);

      // Re-render the dialog to update the display
      app.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Error toggling kill switch:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_TOGGLING_KILL_SWITCH'),
      );
    }
  }

  static async _onClearAllOverrides(event, target) {
    const app = target.closest('.avs-override-dialog')?.app;
    if (!app) return;

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.CLEAR_ALL_CONFIRM_TITLE'),
      content: game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.CLEAR_ALL_CONFIRM_CONTENT', {
        token: app.token.name,
      }),
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });

    if (!confirmed) return;

    try {
      await avsOverrideService.clearAllAVSOverrides(app.token);

      ui.notifications.info(
        game.i18n.format('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ALL_OVERRIDES_CLEARED', {
          token: app.token.name,
        }),
      );

      // Re-render the dialog to update the display
      app.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Error clearing overrides:`, error);
      ui.notifications.error(
        game.i18n.localize('PF2E_VISIONER.AVS_OVERRIDE_DIALOG.ERROR_CLEARING_OVERRIDES'),
      );
    }
  }
}
