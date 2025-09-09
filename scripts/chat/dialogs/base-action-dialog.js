import { MODULE_ID, MODULE_TITLE } from '../../constants.js';
import * as avsOverrideService from '../../services/avs-override-service.js';
import { getVisibilityStateConfig } from '../services/data/visibility-states.js';
import '../services/hbs-helpers.js';
import { notify } from '../services/infra/notifications.js';
import { filterOutcomesByEncounter, hasActiveEncounter } from '../services/infra/shared-utils.js';
import { BasePreviewDialog } from './base-preview-dialog.js';

export class BaseActionDialog extends BasePreviewDialog {
  constructor(options = {}) {
    super(options);
    this.bulkActionState = this.bulkActionState ?? 'initial';
  }

  getApplyDirection() {
    return 'observer_to_target';
  }

  getChangesCounterClass() {
    return null; // override in subclass if you want auto counting via dialog-utils
  }

  // Shared UI helpers
  visibilityConfig(state) {
    return getVisibilityStateConfig(state) || { icon: '', color: '', label: String(state ?? '') };
  }

  resolveTokenImage(token) {
    try {
      return (
        token?.actor?.img ||
        token?.actor?.prototypeToken?.texture?.src ||
        token?.texture?.src ||
        token?.document?.texture?.src ||
        token?.img ||
        'icons/svg/mystery-man.svg'
      );
    } catch (_) {
      return 'icons/svg/mystery-man.svg';
    }
  }

  formatMargin(margin) {
    const n = Number(margin);
    if (Number.isNaN(n)) return String(margin ?? '');
    return n >= 0 ? `+${n}` : `${n}`;
  }

  buildOverrideStates(desiredStates, outcome, options = {}) {
    const selectFrom = options.selectFrom || 'overrideState';
    const calcFrom = options.calcFrom || 'newVisibility';
    const selectedValue = outcome?.[selectFrom] || outcome?.[calcFrom] || null;
    return desiredStates
      .filter((s) => typeof s === 'string' && s.length > 0)
      .map((state) => ({
        value: state,
        ...this.visibilityConfig(state),
        selected: selectedValue === state,
        calculatedOutcome: outcome?.[calcFrom] === state,
      }));
  }

  computeChangesCount(outcomes) {
    if (!Array.isArray(outcomes)) return 0;
    return outcomes.filter((o) => o?.hasActionableChange).length;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applySelectionHighlight();

    // Live re-filtering for per-dialog Ignore Allies checkbox
    try {
      const cb = this.element.querySelector('input[data-action="toggleIgnoreAllies"]');
      if (cb) {
        cb.addEventListener('change', () => {
          this.ignoreAllies = !!cb.checked;
          this.render({ force: true });
        });
      }
    } catch (_) {}

    // AVS Override toggles
    try {
      const avsToggles = this.element.querySelectorAll('.avs-override-checkbox');
      console.log(`${MODULE_ID} | Found ${avsToggles.length} AVS override toggles`);
      avsToggles.forEach((toggle, index) => {
        console.log(`${MODULE_ID} | Binding toggle ${index}:`, toggle);
        toggle.addEventListener('change', (event) => {
          console.log(`${MODULE_ID} | Toggle change event fired for toggle ${index}`);
          this._onToggleAVSOverride(event);
        });
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Error binding AVS override toggles:`, error);
    }
  }

  buildCommonContext(outcomes) {
    const changesCount = this.computeChangesCount(outcomes);

    // Add AVS override information to outcomes
    if (Array.isArray(outcomes) && this.actorToken) {
      outcomes.forEach((outcome) => {
        if (outcome.target?.id) {
          const targetToken = canvas.tokens.get(outcome.target.id);
          if (targetToken) {
            outcome.avsOverride = !!avsOverrideService.getAVSOverride(this.actorToken, targetToken);
            outcome.avsOverrideStateClass = outcome.avsOverride ? 'override-state' : 'auto-state';
          }
        }
      });
    }

    return {
      changesCount,
      totalCount: Array.isArray(outcomes) ? outcomes.length : 0,
      showEncounterFilter: hasActiveEncounter(),
      encounterOnly: !!this.encounterOnly,
      // Per-dialog ignore-allies checkbox state (defaults from global setting)
      ignoreAllies: this.ignoreAllies,
      bulkActionState: this.bulkActionState ?? 'initial',
    };
  }

  applyEncounterFilter(outcomes, tokenProperty, emptyNotice) {
    let filtered = filterOutcomesByEncounter(outcomes, this.encounterOnly, tokenProperty);
    if (filtered.length === 0 && this.encounterOnly && hasActiveEncounter()) {
      this.encounterOnly = false;
      filtered = outcomes;
      const message = emptyNotice || 'No encounter tokens found, showing all';
      try {
        notify.info(`${MODULE_TITLE}: ${message}`);
      } catch (_) {}
    }
    return filtered;
  }

  async applyVisibilityChanges(seeker, changes, options = {}) {
    const { applyVisibilityChanges } = await import('../services/infra/shared-utils.js');
    const direction = options.direction || this.getApplyDirection();
    return applyVisibilityChanges(seeker, changes, { ...options, direction });
  }

  updateRowButtonsToApplied(outcomes) {
    import('../services/ui/dialog-utils.js').then(({ updateRowButtonsToApplied }) => {
      try {
        updateRowButtonsToApplied(this.element, outcomes);
      } catch (_) {}
    });
  }

  updateRowButtonsToReverted(outcomes) {
    import('../services/ui/dialog-utils.js').then(({ updateRowButtonsToReverted }) => {
      try {
        updateRowButtonsToReverted(this.element, outcomes);
      } catch (_) {}
      try {
        // After reverting, reset each row's selection to its initial calculated outcome
        if (!Array.isArray(outcomes)) return;
        for (const o of outcomes) {
          const tokenId = o?.target?.id;
          if (!tokenId) continue;
          const row = this.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
          if (!row) continue;
          const container = row.querySelector('.override-icons');
          if (!container) continue;
          // Clear current selection
          container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
          // Prefer icon marked as calculated outcome; fallback to the hidden input's value
          let selectedIcon = container.querySelector('.state-icon.calculated-outcome');
          if (!selectedIcon) {
            const hidden = container.querySelector('input[type="hidden"]');
            if (hidden)
              selectedIcon = container.querySelector(`.state-icon[data-state="${hidden.value}"]`);
          }
          if (selectedIcon) {
            selectedIcon.classList.add('selected');
            const state = selectedIcon.dataset.state;
            const hidden = container.querySelector('input[type="hidden"]');
            if (hidden) hidden.value = state;
          }
          // Clear any explicit override so selection reflects initial calculated state
          try {
            const outcome = this.outcomes?.find?.(
              (x) => String(this.getOutcomeTokenId(x)) === String(tokenId),
            );
            if (outcome) outcome.overrideState = null;
          } catch (_) {}
        }
      } catch (_) {}
    });
  }

  updateBulkActionButtons() {
    import('../services/ui/dialog-utils.js').then(({ updateBulkActionButtons }) => {
      try {
        updateBulkActionButtons(this.element, this.bulkActionState);
      } catch (_) {}
    });
  }

  updateChangesCount() {
    import('../services/ui/dialog-utils.js').then(({ updateChangesCount }) => {
      try {
        updateChangesCount(this.element, this.getChangesCounterClass());
      } catch (_) {}
    });
  }

  // Default token id resolver for outcomes; subclasses can override
  getOutcomeTokenId(outcome) {
    return outcome?.target?.id ?? null;
  }

  // Mark calculated selection (override if present, otherwise calculated)
  markInitialSelections() {
    try {
      if (!Array.isArray(this.outcomes)) return;
      for (const outcome of this.outcomes) {
        const tokenId = this.getOutcomeTokenId(outcome);
        if (!tokenId) continue;
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) continue;
        const container = row.querySelector('.override-icons');
        if (!container) continue;
        const desiredState = outcome.overrideState || outcome.newVisibility;
        container.querySelectorAll('.state-icon').forEach((i) => i.classList.remove('selected'));
        const icon = container.querySelector(`.state-icon[data-state="${desiredState}"]`);
        if (icon) icon.classList.add('selected');
      }
    } catch (_) {}
  }

  // Outcome display helpers (string-based). Subclasses can override if needed
  getOutcomeClass(value) {
    return value && typeof value === 'string'
      ? value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value
      : '';
  }

  getOutcomeLabel(value) {
    if (!value || typeof value !== 'string') return '';
    const norm =
      value === 'criticalSuccess'
        ? 'critical-success'
        : value === 'criticalFailure'
          ? 'critical-failure'
          : value;
    switch (norm) {
      case 'critical-success':
        return 'Critical Success';
      case 'success':
        return 'Success';
      case 'failure':
        return 'Failure';
      case 'critical-failure':
        return 'Critical Failure';
      default:
        return norm.charAt(0).toUpperCase() + norm.slice(1);
    }
  }

  // Default per-row buttons rendering. Subclasses may override for custom layouts.
  updateActionButtonsForToken(tokenId, hasActionableChange, opts = {}) {
    try {
      // Support wall rows by allowing caller to pass row or using wallId
      let row = opts.row || this.element?.querySelector?.(`tr[data-token-id="${tokenId}"]`);
      if (!row && opts.wallId)
        row = this.element?.querySelector?.(`tr[data-wall-id="${opts.wallId}"]`);
      if (!row) return;

      // Try common containers in priority order
      let container = row.querySelector('td.actions');
      if (!container) container = row.querySelector('.actions');
      if (!container) container = row.querySelector('.row-actions');
      if (!container) container = row.querySelector('.action-buttons');
      if (!container) return;

      if (hasActionableChange) {
        container.innerHTML = `
          <button type="button" class="row-action-btn apply-change" data-action="applyChange" ${opts.wallId ? `data-wall-id="${opts.wallId}"` : `data-token-id="${tokenId}"`} data-tooltip="Apply this visibility change">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="row-action-btn revert-change" data-action="revertChange" ${opts.wallId ? `data-wall-id="${opts.wallId}"` : `data-token-id="${tokenId}"`} data-tooltip="Revert to original visibility">
            <i class="fas fa-undo"></i>
          </button>
        `;
      } else {
        container.innerHTML = '<span class="no-action">No Change</span>';
      }
    } catch (_) {}
  }

  addIconClickHandlers() {
    const stateIcons = this.element.querySelectorAll('.state-icon');
    stateIcons.forEach((icon) => {
      icon.addEventListener('click', (event) => {
        // Only handle clicks within override selection container
        const overrideIcons = event.currentTarget.closest('.override-icons');
        if (!overrideIcons) return;

        // Robustly resolve target id from data attributes or row
        let targetId = event.currentTarget.dataset.target || event.currentTarget.dataset.tokenId;
        const wallId =
          overrideIcons?.dataset?.wallId ||
          event.currentTarget.dataset.wallId ||
          event.currentTarget.closest('tr')?.dataset?.wallId ||
          null;
        if (!targetId) {
          const row = event.currentTarget.closest('tr[data-token-id]');
          targetId = row?.dataset?.tokenId;
        }
        const newState = event.currentTarget.dataset.state;
        overrideIcons
          .querySelectorAll('.state-icon')
          .forEach((i) => i.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
        const hiddenInput = overrideIcons?.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = newState;
        let outcome = this.outcomes?.find?.(
          (o) => String(this.getOutcomeTokenId(o)) === String(targetId),
        );
        if (!outcome && wallId) outcome = this.outcomes?.find?.((o) => o?.wallId === wallId);
        if (outcome) {
          outcome.overrideState = newState;
          const oldState = outcome.oldVisibility ?? outcome.currentVisibility ?? null;
          const hasActionableChange = oldState != null && newState != null && newState !== oldState;
          // Persist actionable state on outcome so templates and bulk ops reflect immediately
          outcome.hasActionableChange = hasActionableChange;
          try {
            this.updateActionButtonsForToken(targetId || null, hasActionableChange, {
              wallId,
              row: event.currentTarget.closest('tr'),
            });
          } catch (_) {}
          // Direct DOM fallback to ensure row shows buttons immediately
          try {
            const rowEl = event.currentTarget.closest('tr');
            if (rowEl) {
              let container = rowEl.querySelector('td.actions') || rowEl.querySelector('.actions');
              if (container) {
                if (hasActionableChange) {
                  const idAttr = wallId
                    ? `data-wall-id="${wallId}"`
                    : targetId
                      ? `data-token-id="${targetId}"`
                      : '';
                  container.innerHTML = `
                    <button type="button" class="row-action-btn apply-change" data-action="applyChange" ${idAttr} data-tooltip="Apply this visibility change">
                      <i class="fas fa-check"></i>
                    </button>
                    <button type="button" class="row-action-btn revert-change" data-action="revertChange" ${idAttr} data-tooltip="Revert to original visibility">
                      <i class="fas fa-undo"></i>
                    </button>
                  `;
                } else {
                  container.innerHTML = '<span class="no-action">No Change</span>';
                }
              }
            }
          } catch (_) {}
          try {
            // Maintain a lightweight list of changed outcomes for convenience
            this.changes = Array.isArray(this.outcomes)
              ? this.outcomes.filter((o) => {
                  const baseOld = o.oldVisibility ?? o.currentVisibility ?? null;
                  const baseNew = o.overrideState ?? o.newVisibility ?? null;
                  return baseOld != null && baseNew != null && baseOld !== baseNew;
                })
              : [];
          } catch (_) {}
        }
        this.updateChangesCount();
      });
    });
  }

  /**
   * Handle AVS override toggle
   * @param {Event} event - The toggle event
   */
  async _onToggleAVSOverride(event) {
    console.log(`${MODULE_ID} | AVS Override toggle clicked`);
    const checkbox = event.currentTarget;
    const targetTokenId = checkbox.dataset.tokenId;
    const isChecked = checkbox.checked;

    console.log(`${MODULE_ID} | Checkbox checked: ${isChecked}, Target ID: ${targetTokenId}`);

    if (!this.actorToken || !targetTokenId) {
      console.warn('PF2E Visioner: Missing actor token or target token ID for AVS override');
      return;
    }

    try {
      const targetToken = canvas.tokens.get(targetTokenId);
      if (!targetToken) {
        console.warn('PF2E Visioner: Target token not found for AVS override');
        return;
      }

      if (isChecked) {
        // Set AVS override to the calculated visibility state
        const outcome = this.outcomes?.find((o) => o.target?.id === targetTokenId);
        const visibilityState = outcome?.newVisibility || outcome?.overrideState || 'observed';
        await avsOverrideService.setAVSOverride(this.actorToken, targetToken, visibilityState);
      } else {
        // Remove AVS override
        await avsOverrideService.removeAVSOverride(this.actorToken, targetToken);
      }

      // Update the label immediately
      const toggleContainer = checkbox.parentElement.parentElement; // .avs-override-toggle
      const label = toggleContainer.querySelector('.avs-override-label');
      if (label) {
        console.log(`${MODULE_ID} | Updating label: ${isChecked ? 'Override' : 'Auto'}`);
        label.textContent = isChecked ? 'Override' : 'Auto';
        label.className = 'avs-override-label';
        if (isChecked) {
          label.classList.add('override-state');
        } else {
          label.classList.add('auto-state');
        }
        console.log(`${MODULE_ID} | Label updated: ${label.textContent}`);
      }

      notify.info(
        isChecked
          ? `AVS override set for ${targetToken.name}`
          : `AVS override removed for ${targetToken.name}`,
      );
    } catch (error) {
      console.error('PF2E Visioner: Error toggling AVS override:', error);
      notify.error('Error toggling AVS override');

      // Revert checkbox state
      checkbox.checked = !isChecked;
    }
  }
}

