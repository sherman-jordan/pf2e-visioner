import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { getVisibilityBetween, setVisibilityBetween, hasActiveEncounter, isTokenInEncounter } from '../utils.js';
import { updateEphemeralEffectsForVisibility } from '../off-guard-ephemeral.js';
import { filterOutcomesByEncounter } from './shared-utils.js';
import { refreshEveryonesPerception } from '../socket.js';

// Store reference to current sneak dialog
let currentSneakDialog = null;

/**
 * Dialog for previewing and applying Sneak action results
 */
export class SneakPreviewDialog extends foundry.applications.api.ApplicationV2 {
    constructor(sneakingToken, outcomes, changes, sneakData, options = {}) {
        super({
            id: `sneak-preview-${sneakingToken.id}`,
            title: `${MODULE_TITLE}: Sneak Results Preview`,
            tag: 'form',
            window: {
                title: 'Sneak Results Preview',
                icon: 'fas fa-user-ninja',
                resizable: true,
                positioned: true,
                minimizable: false
            },
            position: {
                width: 500,
                height: 'auto'
            },
            form: {
                handler: SneakPreviewDialog.formHandler,
                submitOnChange: false,
                closeOnSubmit: false
            },
            classes: ['sneak-preview-dialog'],
            ...options
        });

        this.sneakingToken = sneakingToken;
        this.outcomes = outcomes;
        this.changes = changes;
        this.sneakData = sneakData;
        this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
        this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'
        
        // Set global reference
        currentSneakDialog = this;
    }

    static DEFAULT_OPTIONS = {
        actions: {
            applyChange: SneakPreviewDialog._onApplyChange,
            revertChange: SneakPreviewDialog._onRevertChange,
            applyAll: SneakPreviewDialog._onApplyAll,
            revertAll: SneakPreviewDialog._onRevertAll,
            toggleEncounterFilter: SneakPreviewDialog._onToggleEncounterFilter,
            overrideState: SneakPreviewDialog._onOverrideState
        }
    };

    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/sneak-preview.hbs'
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Filter outcomes based on encounter filter
        let filteredOutcomes = this.outcomes;
        if (this.encounterOnly && hasActiveEncounter()) {
            filteredOutcomes = this.outcomes.filter(outcome => 
                isTokenInEncounter(outcome.token)
            );
            
            // If no encounter tokens found, keep the filter active but show empty list
            if (filteredOutcomes.length === 0) {
                ui.notifications.info(`${MODULE_TITLE}: No encounter observers found for this action`);
                // Keep filteredOutcomes as empty array, don't reset to all outcomes
            }
        }
        
        // Prepare visibility states for icons
        const visibilityStates = {
            'observed': { icon: 'fas fa-eye', color: '#28a745', label: 'Observed' },
            'hidden': { icon: 'fas fa-eye-slash', color: '#ffc107', label: 'Hidden' },
            'undetected': { icon: 'fas fa-ghost', color: '#dc3545', label: 'Undetected' },
        };
        
        // Process outcomes to add additional properties
        const processedOutcomes = filteredOutcomes.map(outcome => {
            // Get current visibility state - how this observer sees the sneaking token
            const currentVisibility = getVisibilityBetween(outcome.token, this.sneakingToken) || outcome.oldVisibility;
            
            // Prepare available states for override
            // Sneak can result in hidden or undetected
            const availableStates = [
                {
                    value: 'observed',
                    ...visibilityStates.observed,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'observed',
                    calculatedOutcome: outcome.newVisibility === 'observed'
                },
                {
                    value: 'hidden',
                    ...visibilityStates.hidden,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'hidden',
                    calculatedOutcome: outcome.newVisibility === 'hidden'
                },
                {
                    value: 'undetected',
                    ...visibilityStates.undetected,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'undetected',
                    calculatedOutcome: outcome.newVisibility === 'undetected'
                }
            ];
            
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            // Check if there's an actionable change - based on calculated outcome vs original state
            const hasActionableChange = outcome.newVisibility !== outcome.oldVisibility;
            
            return {
                ...outcome,
                outcomeClass: this.getOutcomeClass(outcome.outcome),
                outcomeLabel: this.getOutcomeLabel(outcome.outcome),
                oldVisibilityState: visibilityStates[outcome.oldVisibility || currentVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                marginText: outcome.margin >= 0 ? `+${outcome.margin}` : `${outcome.margin}`,
                tokenImage: outcome.token.texture?.src || outcome.token.document?.texture?.src,
                availableStates: availableStates,
                overrideState: outcome.overrideState || outcome.newVisibility,
                hasActionableChange: hasActionableChange
            };
        });
        
        // Update original outcomes with hasActionableChange for Apply All button logic
        processedOutcomes.forEach((processedOutcome, index) => {
            if (this.outcomes[index]) {
                this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
            }
        });

        // Set sneaker context for template (like Seek dialog)
        context.sneaker = {
            name: this.sneakingToken.name,
            image: this.sneakingToken.texture?.src || this.sneakingToken.document?.texture?.src,
            actionType: 'sneak',
            actionLabel: 'Sneak action results analysis'
        };
        
        context.sneakingToken = this.sneakingToken;
        context.outcomes = processedOutcomes;
        context.changesCount = processedOutcomes.filter(outcome => outcome.hasActionableChange).length;
        context.totalCount = processedOutcomes.length;
        context.showEncounterFilter = hasActiveEncounter();
        context.encounterOnly = this.encounterOnly;
        context.bulkActionState = this.bulkActionState;

        return context;
    }

    async _renderHTML(context, options) {
        const html = await renderTemplate(this.constructor.PARTS.content.template, context);
        return html;
    }

    getAvailableStates() {
        return [
            { value: 'observed', label: 'Observed', icon: 'fas fa-eye' },
            { value: 'concealed', label: 'Concealed', icon: 'fas fa-eye-slash' },
            { value: 'hidden', label: 'Hidden', icon: 'fas fa-mask' },
            { value: 'undetected', label: 'Undetected', icon: 'fas fa-ghost' }
        ];
    }

    getOutcomeLabel(outcome) {
        const labels = {
            'critical-success': 'Critical Success',
            'success': 'Success', 
            'failure': 'Failure',
            'critical-failure': 'Critical Failure'
        };
        return labels[outcome] || outcome;
    }

    getOutcomeClass(outcome) {
        const classes = {
            'critical-success': 'critical-success',
            'success': 'success',
            'failure': 'failure', 
            'critical-failure': 'critical-failure'
        };
        return classes[outcome] || outcome;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.addIconClickHandlers();
        this.updateBulkActionButtons();
        this._addHoverListeners();
        this.markInitialSelections();
    }

    /**
     * Mark the initial calculated outcomes as selected
     */
    markInitialSelections() {
        this.outcomes.forEach(outcome => {
            // Mark the calculated outcome as selected in the UI (but don't set overrideState yet)
            const row = this.element.querySelector(`tr[data-token-id="${outcome.token.id}"]`);
            if (row) {
                const container = row.querySelector('.override-icons');
                if (container) {
                    container.querySelectorAll('.state-icon').forEach(i => i.classList.remove('selected'));
                    const calculatedIcon = container.querySelector(`.state-icon[data-state="${outcome.newVisibility}"]`);
                    if (calculatedIcon) {
                        calculatedIcon.classList.add('selected');
                    }
                }
            }
        });
    }

    /**
     * Add hover listeners to highlight tokens on canvas
     */
    _addHoverListeners() {
        // Add hover listeners to token rows
        const tokenRows = this.element.querySelectorAll('tr[data-token-id]');
        
        tokenRows.forEach(row => {
            const tokenId = row.dataset.tokenId;
            if (!tokenId) return;
            
            // Remove existing listeners to prevent duplicates
            row.removeEventListener('mouseenter', row._hoverIn);
            row.removeEventListener('mouseleave', row._hoverOut);
            
            // Add new listeners
            row._hoverIn = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverIn(new Event('mouseenter'), { hoverOutOthers: true });
                }
            };
            
            row._hoverOut = () => {
                const token = canvas.tokens.get(tokenId);
                if (token) {
                    token._onHoverOut(new Event('mouseleave'));
                }
            };
            
            row.addEventListener('mouseenter', row._hoverIn);
            row.addEventListener('mouseleave', row._hoverOut);
        });
    }

    addIconClickHandlers() {
        const icons = this.element.querySelectorAll('.state-icon');
        icons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const tokenId = event.currentTarget.dataset.tokenId;
                const state = event.currentTarget.dataset.state;
                
                if (tokenId && state) {
                    this._onOverrideState(event, { tokenId, state });
                }
            });
        });
    }

    _onOverrideState(event, { tokenId, state }) {
        // Find the outcome for this token
        const outcome = this.outcomes.find(o => o.token.id === tokenId);
        if (!outcome) return;

        // Update the override state
        outcome.overrideState = state;

        // Update visual selection
        const container = this.element.querySelector(`.override-icons[data-token-id="${tokenId}"]`);
        if (container) {
            container.querySelectorAll('.state-icon').forEach(icon => {
                icon.classList.remove('selected');
                if (icon.dataset.state === state) {
                    icon.classList.add('selected');
                }
            });
        }

        // Update hidden input
        const hiddenInput = this.element.querySelector(`input[name="override.${tokenId}"]`);
        if (hiddenInput) {
            hiddenInput.value = state;
        }

        // Update visual selection
        const row = event.currentTarget.closest('tr');
        const icons = row.querySelectorAll('.override-icons .state-icon');
        icons.forEach(i => i.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
        
        // Enable the Apply button only if there's actually a change
        const applyButton = row.querySelector('.apply-change');
        if (applyButton) {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            const hasChange = effectiveNewState !== outcome.oldVisibility;
            applyButton.disabled = !hasChange;
        }
        
        // Update actionable change status and buttons
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        outcome.hasActionableChange = effectiveNewState !== outcome.oldVisibility;
        this.updateActionButtonsForToken(tokenId, outcome.hasActionableChange);
    }

    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const actionsCell = this.element.querySelector(`tr[data-token-id="${tokenId}"] .actions`);
        if (!actionsCell) return;
        
        if (hasActionableChange) {
            actionsCell.innerHTML = `
                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                    <i class="fas fa-check"></i>
                </button>
                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                    <i class="fas fa-undo"></i>
                </button>
            `;
        } else {
            actionsCell.innerHTML = '<span class="no-action">No change</span>';
        }
        
        // ApplicationV2 automatically binds events for elements with data-action attributes
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

    static async _onToggleEncounterFilter(event, target) {
        const app = currentSneakDialog;
        if (!app) {
            console.warn('Sneak dialog not found for encounter filter toggle');
            return;
        }
        
        // Toggle the filter state
        app.encounterOnly = target.checked;
        
        // Reset bulk action state
        app.bulkActionState = 'initial';
        
        // Re-render the dialog - _prepareContext will handle the filtering
        app.render({ force: true });
    }

    static async _onApplyChange(event, button) {
        const app = currentSneakDialog;
        if (!app) return;
        
        const tokenId = button?.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.token.id === tokenId);
        
        if (!outcome) return;

        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        
        try {
            // Apply the visibility change - observer sees sneaking token with new state
            await setVisibilityBetween(outcome.token, app.sneakingToken, effectiveNewState, {skipEphemeralUpdate: true});
            
            // For Sneak actions, also apply ephemeral effects where sneaking token gets effects against observers
            // This matches Create a Diversion logic where the acting token gets effects against observers
            if (['hidden', 'undetected'].includes(effectiveNewState)) {
                await updateEphemeralEffectsForVisibility(app.sneakingToken, outcome.token, effectiveNewState, { durationRounds: 1 });
            }
        } catch (error) {
            console.warn('Error applying visibility changes:', error);
            // Continue execution even if visibility changes fail
        }
        
        // Update button states
        app.updateRowButtonsToApplied(tokenId);
        refreshEveryonesPerception();
        
        ui.notifications.info(`${MODULE_TITLE}: Applied sneak result - ${outcome.token.name} sees ${app.sneakingToken.name} as ${effectiveNewState}`);
    }

    static async _onRevertChange(event, button) {
        const app = currentSneakDialog;
        if (!app) return;
        
        const tokenId = button?.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.token.id === tokenId);
        
        if (!outcome) return;

        try {
            // Revert to original visibility - observer sees sneaking token with original state
            await setVisibilityBetween(outcome.token, app.sneakingToken, outcome.oldVisibility, {skipEphemeralUpdate: true});
            
            // Clean up ephemeral effects on the sneaking token by reverting its visibility of the observer
            await updateEphemeralEffectsForVisibility(app.sneakingToken, outcome.token, outcome.oldVisibility, { durationRounds: 1 });
        } catch (error) {
            console.warn('Error reverting visibility changes:', error);
            // Continue execution even if visibility changes fail
        }
        
        // Update button states
        app.updateRowButtonsToReverted(tokenId);
        refreshEveryonesPerception();
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted sneak result - ${outcome.token.name} sees ${app.sneakingToken.name} as ${outcome.oldVisibility}`);
    }

    static async _onApplyAll(event, button) {
        const app = currentSneakDialog;
        if (!app) return;
        
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }

        // Filter outcomes based on encounter filter using shared helper
        const filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'token');
        
        // Only apply changes to filtered outcomes that have actual changes
        const changedOutcomes = filteredOutcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });

        for (const outcome of changedOutcomes) {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            
            // Apply the visibility change - observer sees sneaking token with new state
            try {
                await setVisibilityBetween(outcome.token, app.sneakingToken, effectiveNewState, {skipEphemeralUpdate: true});
                
                // For Sneak actions, also apply ephemeral effects where sneaking token gets effects against observers
                if (['hidden', 'undetected'].includes(effectiveNewState)) {
                    await updateEphemeralEffectsForVisibility(app.sneakingToken, outcome.token, effectiveNewState, { durationRounds: 1 });
                }
            } catch (error) {
                console.warn('Error applying visibility changes for bulk apply:', error);
                // Continue with other outcomes even if one fails
            }
            app.updateRowButtonsToApplied(outcome.token.id);
        }

        app.bulkActionState = 'applied';
        app.updateBulkActionButtons();
        refreshEveryonesPerception();
        
        ui.notifications.info(`${MODULE_TITLE}: Applied all sneak results (${changedOutcomes.length} changes). Dialog remains open for further adjustments.`);
    }

    static async _onRevertAll(event, button) {
        const app = currentSneakDialog;
        if (!app) return;
        
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }

        // Filter outcomes based on encounter filter using shared helper
        const filteredOutcomes = filterOutcomesByEncounter(app.outcomes, app.encounterOnly, 'token');
        
        // Only revert changes to filtered outcomes that have actual changes
        const changedOutcomes = filteredOutcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });

        for (const outcome of changedOutcomes) {
            // Revert to original visibility - observer sees sneaking token with original state
            try {
                await setVisibilityBetween(outcome.token, app.sneakingToken, outcome.oldVisibility, {skipEphemeralUpdate: true});
                
                // Clean up ephemeral effects on the sneaking token
                await updateEphemeralEffectsForVisibility(app.sneakingToken, outcome.token, outcome.oldVisibility, { durationRounds: 1 });
            } catch (error) {
                console.warn('Error reverting visibility changes for bulk revert:', error);
                // Continue with other outcomes even if one fails
            }
            app.updateRowButtonsToReverted(outcome.token.id);
        }

        app.bulkActionState = 'reverted';
        app.updateBulkActionButtons();
        refreshEveryonesPerception();
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted all sneak results (${changedOutcomes.length} changes). Dialog remains open for further adjustments.`);
    }

    updateRowButtonsToApplied(tokenId) {
        const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
        
        if (applyButton) {
            applyButton.disabled = true;
            applyButton.classList.add('applied');
            applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
            applyButton.title = 'Applied';
        }
        
        if (revertButton) {
            revertButton.disabled = false;
            revertButton.classList.remove('reverted');
            revertButton.innerHTML = '<i class="fas fa-undo"></i>';
            revertButton.title = 'Revert to original visibility';
        }
    }

    updateRowButtonsToReverted(tokenId) {
        const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
        
        if (applyButton) {
            applyButton.disabled = false;
            applyButton.classList.remove('applied');
            applyButton.innerHTML = '<i class="fas fa-check"></i>';
            applyButton.title = 'Apply visibility change';
        }
        
        if (revertButton) {
            revertButton.disabled = true;
            revertButton.classList.add('reverted');
            revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
            revertButton.title = 'Reverted';
        }
    }

    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('.bulk-action-btn[data-action="applyAll"]');
        const revertAllButton = this.element.querySelector('.bulk-action-btn[data-action="revertAll"]');
        
        if (!applyAllButton || !revertAllButton) return;

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
                revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Reverted';
                break;
        }
    }

    static async _onOverrideState(event, button) {
        // Override state method for consistency with other dialogs
        const app = currentSneakDialog;
        if (!app) return;
        // This method is available for future enhancements if needed
    }
    
    close(options) {
        currentSneakDialog = null;
        return super.close(options);
    }
}
