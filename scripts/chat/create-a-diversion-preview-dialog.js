/**
 * Create a Diversion Preview Dialog
 * Shows Create a Diversion results with GM override capability
 */

import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { hasActiveEncounter, isTokenInEncounter } from '../utils.js';
import { applyVisibilityChanges, filterOutcomesByEncounter } from './shared-utils.js';

// Store reference to current create a diversion dialog
let currentDiversionDialog = null;

export class CreateADiversionPreviewDialog extends foundry.applications.api.ApplicationV2 {
    constructor(divertingToken, outcomes, changes, diversionData, options = {}) {
        super(options);
        
        this.divertingToken = divertingToken;
        this.outcomes = outcomes;
        this.changes = changes;
        this.diversionData = diversionData;
        this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
        this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'
        
        // Set global reference
        currentDiversionDialog = this;
    }

    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['create-a-diversion-preview-dialog'],
        window: {
            title: `Create a Diversion Results`,
            icon: 'fas fa-theater-masks',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            applyChange: CreateADiversionPreviewDialog._onApplyChange,
            revertChange: CreateADiversionPreviewDialog._onRevertChange,
            applyAll: CreateADiversionPreviewDialog._onApplyAll,
            revertAll: CreateADiversionPreviewDialog._onRevertAll,
            toggleEncounterFilter: CreateADiversionPreviewDialog._onToggleEncounterFilter,
            overrideState: CreateADiversionPreviewDialog._onOverrideState
        }
    };

    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/create-a-diversion-preview.hbs'
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Filter outcomes based on encounter filter
        let processedOutcomes = this.outcomes;
        if (this.encounterOnly && hasActiveEncounter()) {
            processedOutcomes = this.outcomes.filter(outcome => 
                isTokenInEncounter(outcome.observer)
            );
            
            // Auto-uncheck if no encounter tokens found
            if (processedOutcomes.length === 0) {
                this.encounterOnly = false;
                processedOutcomes = this.outcomes;
                ui.notifications.info(`${MODULE_TITLE}: No encounter observers found, showing all`);
            }
        }
        
        // Prepare outcomes with additional UI data
        processedOutcomes = processedOutcomes.map(outcome => {
            const availableStates = this.getAvailableStates(outcome);
            
            // Make sure we consider both the changed flag and state differences
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            const hasChange = effectiveNewState !== outcome.currentVisibility;
            const hasActionableChange = hasChange || (outcome.changed && effectiveNewState !== 'observed');
            
            return {
                ...outcome,
                availableStates,
                hasActionableChange,
                overrideState: outcome.overrideState || null,
                tokenImage: outcome.observer.document?.texture?.src || outcome.observer.img || "icons/svg/mystery-man.svg"
            };
        });
        
        // Prepare diverting token with proper image path
        context.divertingToken = {
            ...this.divertingToken,
            image: this.divertingToken.document?.texture?.src || this.divertingToken.img || "icons/svg/mystery-man.svg"
        };
        context.outcomes = processedOutcomes;
        
        // Log the number of changes for debugging
        const changesCount = processedOutcomes.filter(outcome => outcome.hasActionableChange).length;        
        context.changesCount = changesCount;
        context.totalCount = processedOutcomes.length;
        context.showEncounterFilter = hasActiveEncounter();
        context.encounterOnly = this.encounterOnly;
        context.marginText = this.getMarginText.bind(this);
        context.getOutcomeClass = this.getOutcomeClass.bind(this);
        context.getOutcomeLabel = this.getOutcomeLabel.bind(this);
        
        return context;
    }

    /**
     * Render the HTML for the application
     */
    async _renderHTML(context, options) {
        const html = await renderTemplate(this.constructor.PARTS.content.template, context);
        return html;
    }
        
    /**
     * Replace the HTML content of the application
     */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
        return content;
    }

    /**
     * Get available visibility states for override
     */
    getAvailableStates(outcome) {
        const states = [
            { 
                key: 'hidden', 
                icon: 'fas fa-eye-slash', 
                label: game.i18n.localize('PF2E.condition.hidden.name'),
                selected: outcome.overrideState === 'hidden',
                calculatedOutcome: outcome.newVisibility === 'hidden'
            }
        ];
        
        return states;
    }

    /**
     * Calculate if there's an actionable change (considering overrides)
     */
    calculateHasActionableChange(outcome) {
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        const hasChange = effectiveNewState !== outcome.currentVisibility;
        
        // Return true if either the original calculation determined a change OR there's an override
        return hasChange || (outcome.changed && effectiveNewState !== 'observed');
    }

    /**
     * Get margin text for display
     */
    getMarginText(outcome) {
        const sign = outcome.margin >= 0 ? '+' : '';
        return `${sign}${outcome.margin}`;
    }

    /**
     * Get CSS class for outcome
     */
    getOutcomeClass(outcome) {
        switch (outcome.outcome) {
            case 'critical-success': return 'critical-success';
            case 'success': return 'success';
            case 'failure': return 'failure';
            case 'critical-failure': return 'critical-failure';
            default: return 'failure';
        }
    }

    /**
     * Get human-readable outcome label
     */
    getOutcomeLabel(outcome) {
        switch (outcome.outcome) {
            case 'critical-success': return 'Critical Success';
            case 'success': return 'Success';
            case 'failure': return 'Failure';
            case 'critical-failure': return 'Critical Failure';
            default: return 'Failure';
        }
    }
    
    /**
     * Handle render event
     */
    async _onRender(options) {
        await super._onRender(options);
        
        // Initialize encounter filter state
        const encounterFilter = this.element.querySelector('input[data-action="toggleEncounterFilter"]');
        if (encounterFilter) {
            encounterFilter.checked = this.encounterOnly;
        }
        
        // Initialize bulk action buttons state
        this.updateBulkActionButtons();
        
        // Selection-based highlighting parity
        this._applySelectionHighlight();
        if (!this._selectionHookId) {
            this._selectionHookId = Hooks.on('controlToken', () => this._applySelectionHighlight());
        }
    }
    
    /**
     * Add hover listeners to highlight tokens on canvas when hovering over rows
     */
    _applySelectionHighlight() {
        try {
            this.element.querySelectorAll('tr.token-row.row-hover')?.forEach((el) => el.classList.remove('row-hover'));
            const selected = Array.from(canvas?.tokens?.controlled ?? []);
            if (!selected.length) return;
            let firstRow = null;
            for (const tok of selected) {
                const row = this.element.querySelector(`tr[data-token-id="${tok.id}"]`);
                if (row) {
                    row.classList.add('row-hover');
                    if (!firstRow) firstRow = row;
                }
            }
            if (firstRow && typeof firstRow.scrollIntoView === 'function') {
                firstRow.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        } catch (_) {}
    }

    /**
     * Handle individual apply change
     */
    static async _onApplyChange(event, button) {
        const app = currentDiversionDialog;
        if (!app) return;
        const tokenId = button?.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.observer.id === tokenId);
        if (!outcome) return;
        
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        await app.applyVisibilityChange(outcome.observer, effectiveNewState);
        
        // Update button states
        app.updateRowButtonsToApplied(tokenId);
   }

    /**
     * Handle individual revert change
     */
    static async _onRevertChange(event, button) {
        const app = currentDiversionDialog;
        if (!app) return;
        const tokenId = button?.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.observer.id === tokenId);
        if (!outcome) return;
        
        await app.applyVisibilityChange(outcome.observer, outcome.currentVisibility);
        
        // Update button states
        app.updateRowButtonsToReverted(tokenId);
        
    }

    /**
     * Handle apply all changes
     */
    static async _onApplyAll(event, target) {
        // Get the dialog instance
        const app = currentDiversionDialog;
        if (!app) {
            console.error('Create a Diversion Dialog not found');
            return;
        }
        
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Count active changes in the rendered dialog context
        const totalChanges = app.element.querySelector('.create-a-diversion-preview-dialog-changes-count')?.textContent;
        
        // Filter outcomes based on encounter filter
        const filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'observer');
        
        // Only apply changes to filtered outcomes that have actionable changes
        const changedOutcomes = filteredOutcomes.filter(outcome => {
            return outcome.hasActionableChange || (outcome.changed && outcome.newVisibility !== 'observed');
        });
                
        if (changedOutcomes.length === 0) {
            ui.notifications.warn(`${MODULE_TITLE}: No visibility changes to apply.`);
            return;
        }
        
        // Apply changes one by one to ensure each observer gets the correct effect
        for (const outcome of changedOutcomes) {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            
            // For Create a Diversion, the observer token should see the diverting token as hidden
            await applyVisibilityChanges(outcome.observer, [{
                target: app.divertingToken,
                newVisibility: effectiveNewState
            }], { 
                direction: 'observer_to_target',
                durationRounds: 0,
                initiative: true,
                skipEphemeralUpdate: false, // Ensure ephemeral effects are created
                skipCleanup: true // Skip cleanup to prevent removing previous effects
            });
        }
        
        // Update UI for each row
        for (const outcome of changedOutcomes) {
            app.updateRowButtonsToApplied(outcome.observer.id);
        }
        
        app.bulkActionState = 'applied';
        app.updateBulkActionButtons();
        
        ui.notifications.info(`${MODULE_TITLE}: Applied all diversion visibility changes. Dialog remains open for further adjustments.`);
    }

    /**
     * Handle revert all changes
     */
    static async _onRevertAll(event, target) {
        // Get the dialog instance
        const app = currentDiversionDialog;
        if (!app) {
            console.error('Create a Diversion Dialog not found');
            return;
        }
        
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }
        
        // Count active changes in the rendered dialog context
        const totalChanges = app.element.querySelector('.create-a-diversion-preview-dialog-changes-count')?.textContent;
        
        // Filter outcomes based on encounter filter
        const filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'observer');
        
        // Only revert changes to filtered outcomes that have actionable changes
        const changedOutcomes = filteredOutcomes.filter(outcome => {
            return outcome.hasActionableChange || (outcome.changed && outcome.newVisibility !== 'observed');
        });
                
        if (changedOutcomes.length === 0) {
            ui.notifications.warn(`${MODULE_TITLE}: No visibility changes to revert.`);
            return;
        }
        
        for (const outcome of changedOutcomes) {
            await app.applyVisibilityChange(outcome.observer, outcome.currentVisibility);
            app.updateRowButtonsToReverted(outcome.observer.id);
        }
        
        app.bulkActionState = 'reverted';
        app.updateBulkActionButtons();
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted all diversion visibility changes. Dialog remains open for further adjustments.`);
    }

    /**
     * Handle encounter filter toggle
     */
    static async _onToggleEncounterFilter(event, target) {
        const app = currentDiversionDialog;
        if (!app) return;
        app.encounterOnly = target.checked;
        
        // Re-render with new filter
        await app.render({ force: true });
    }

    /**
     * Handle visibility state override
     */
    static async _onOverrideState(event, target) {
        const app = currentDiversionDialog;
        if (!app) return;
        
        const tokenId = target.dataset.tokenId;
        const newState = target.dataset.state;
        
        // Find the outcome and update override state
        const outcome = app.outcomes.find(o => o.observer.id === tokenId);
        if (!outcome) return;
        
        // Toggle the override state
        if (outcome.overrideState === newState) {
            // Clicking the same state removes the override
            outcome.overrideState = null;
        } else {
            // Set new override state
            outcome.overrideState = newState;
        }
        
        // Recalculate hasActionableChange
        outcome.hasActionableChange = app.calculateHasActionableChange(outcome);
        
        // Update icon selection visually
        app.updateIconSelection(tokenId, outcome.overrideState);
        
        // Update action buttons for this row
        app.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
    }

    /**
     * Apply visibility change to a token using the shared utility function
     * @param {Token} observerToken - The observer token
     * @param {string} newVisibility - The new visibility state
     */
    async applyVisibilityChange(observerToken, newVisibility) {
        try {
            // For Create a Diversion, effects use initiative tracking
            // For Create a Diversion, the observer token should see the diverting token as hidden
            // So the diverting token is the target, and the observer token is the observer
            await applyVisibilityChanges(observerToken, [{
                target: this.divertingToken,
                newVisibility: newVisibility
            }], { 
                direction: 'observer_to_target', // Observer sees diverting token as hidden
                durationRounds: 0, // Set to 0 to use initiative value
                initiative: true,
            });
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying visibility change:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to apply visibility change`);
        }
    }

    /**
     * Update row buttons to applied state
     */
    updateRowButtonsToApplied(tokenId) {
        const row = this.element.querySelector(`[data-token-id="${tokenId}"]`).closest('tr');
        const applyBtn = row.querySelector('.row-action-btn.apply-change');
        const revertBtn = row.querySelector('.row-action-btn.revert-change');
        
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.classList.add('applied');
            applyBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
            applyBtn.title = 'Applied';
        }
        
        if (revertBtn) {
            revertBtn.disabled = false;
            revertBtn.classList.remove('reverted');
            revertBtn.innerHTML = '<i class="fas fa-undo"></i>';
            revertBtn.title = 'Revert to original visibility';
        }
    }

    /**
     * Update row buttons to reverted state
     */
    updateRowButtonsToReverted(tokenId) {
        const row = this.element.querySelector(`[data-token-id="${tokenId}"]`).closest('tr');
        const applyBtn = row.querySelector('.row-action-btn.apply-change');
        const revertBtn = row.querySelector('.row-action-btn.revert-change');
        
        if (revertBtn) {
            revertBtn.disabled = true;
            revertBtn.classList.add('reverted');
            revertBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
            revertBtn.title = 'Reverted';
        }
        
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.classList.remove('applied');
            applyBtn.innerHTML = '<i class="fas fa-check"></i>';
            applyBtn.title = 'Apply visibility change';
        }
    }

    /**
     * Update bulk action buttons based on state
     */
    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('button.create-a-diversion-preview-dialog-bulk-action-btn.apply-all');
        const revertAllButton = this.element.querySelector('button.create-a-diversion-preview-dialog-bulk-action-btn.revert-all');
        
        if (!applyAllButton || !revertAllButton) {
            console.warn('Create a Diversion: Bulk action buttons not found');
            return;
        }
                
        switch (this.bulkActionState) {
            case 'initial':
                applyAllButton.disabled = false;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                revertAllButton.disabled = true;
                revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                break;
                
            case 'applied':
                applyAllButton.disabled = true;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                revertAllButton.disabled = false;
                revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                break;
                
            case 'reverted':
                applyAllButton.disabled = false;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                revertAllButton.disabled = true;
                revertAllButton.innerHTML = '<i class="fas fa-undo-alt"></i> Reverted';
                break;
        }
    }

    /**
     * Update icon selection visually
     */
    updateIconSelection(tokenId, selectedState) {
        const row = this.element.querySelector(`[data-token-id="${tokenId}"]`).closest('tr');
        const icons = row.querySelectorAll('.state-icon');
        
        icons.forEach(icon => {
            const state = icon.dataset.state;
            if (state === selectedState) {
                icon.classList.add('selected');
            } else {
                icon.classList.remove('selected');
            }
        });
        
        // Update hidden input
        const hiddenInput = row.querySelector('input[type="hidden"]');
        if (hiddenInput) {
            hiddenInput.value = selectedState || '';
        }
    }

    /**
     * Update action buttons for a specific token
     */
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`[data-token-id="${tokenId}"]`).closest('tr');
        const actionButtons = row.querySelector('.action-buttons');
        
        if (hasActionableChange) {
            actionButtons.style.display = '';
        } else {
            actionButtons.style.display = 'none';
        }
    }

    /**
     * Add icon click handlers after render
     */
    _onRender(context, options) {
        super._onRender(context, options);
        this.addIconClickHandlers();
        this.updateBulkActionButtons();
    }

    /**
     * Add click handlers for state icons
     */
    addIconClickHandlers() {
        const icons = this.element.querySelectorAll('.state-icon');
        icons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const tokenId = event.currentTarget.dataset.tokenId;
                const state = event.currentTarget.dataset.state;
                
                if (tokenId && state) {
                    CreateADiversionPreviewDialog._onOverrideState.call(this, event, {
                        dataset: { tokenId, state }
                    });
                }
            });
        });
    }
}
