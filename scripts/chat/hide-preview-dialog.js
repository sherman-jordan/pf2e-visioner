/**
 * Hide Preview Dialog for Hide action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_TITLE } from '../constants.js';
import { setVisibilityMap, getVisibilityMap } from '../utils.js';
import { updateTokenVisuals } from '../visual-effects.js';
import { updateEphemeralEffectsForVisibility } from '../off-guard-ephemeral.js';
import { hasActiveEncounter } from './shared-utils.js';
import { discoverHideObservers, analyzeHideOutcome } from './hide-logic.js';

// Store reference to current hide dialog
let currentHideDialog = null;

export class HidePreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['hide-preview-dialog'],
        window: {
            title: 'Hide Results Preview',
            icon: 'fas fa-eye-slash',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            close: HidePreviewDialog._onClose,
            applyAll: HidePreviewDialog._onApplyAll,
            revertAll: HidePreviewDialog._onRevertAll,
            applyChange: HidePreviewDialog._onApplyChange,
            revertChange: HidePreviewDialog._onRevertChange,
            toggleEncounterFilter: HidePreviewDialog._onToggleEncounterFilter,
            overrideState: HidePreviewDialog._onOverrideState
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/hide-preview.hbs'
        }
    };
    
    constructor(actorToken, outcomes, changes, actionData, options = {}) {
        // Set window title and icon for hide dialog
        options.window = {
            ...options.window,
            title: `Hide Results Preview`,
            icon: 'fas fa-eye-slash'
        };
        
        super(options);
        
        this.actorToken = actorToken;
        this.outcomes = outcomes || [];
        this.changes = changes || [];
        this.actionData = actionData;
        this.encounterOnly = false;
        this.bulkActionState = 'initial'; // Track bulk action state
        
        // Store reference for singleton behavior
        currentHideDialog = this;
    }
    
    /**
     * Called after the dialog is first rendered to set up event handlers
     */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        
        // Add click handlers for visibility state icons
        this.addIconClickHandlers();
        
        // Mark initial selections after render
        this.markInitialSelections();
        
        // Update changes count
        this.updateChangesCount();
        
        // Add hover listeners for token highlighting
        this._addHoverListeners();
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
    
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Process outcomes to add additional properties needed by template
        const processedOutcomes = this.outcomes.map(outcome => {
            const availableStates = this.getAvailableStatesForOutcome(outcome);
            const overrideState = outcome.overrideState || outcome.newVisibility; // Default to calculated result
            const hasActionableChange = outcome.newVisibility !== outcome.oldVisibility;
            
            // No override system needed for Hide dialog
            
            return {
                ...outcome,
                availableStates,
                overrideState,
                hasActionableChange,
                calculatedOutcome: outcome.newVisibility, // For highlighting the calculated result
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src,
                outcomeClass: this.getOutcomeClass(outcome.outcome),
                outcomeLabel: this.getOutcomeLabel(outcome.outcome),
                marginText: outcome.margin >= 0 ? `+${outcome.margin}` : `${outcome.margin}`
            };
        });
        
        // Calculate summary information
        context.actorToken = this.actorToken;
        context.outcomes = processedOutcomes;
        context.changesCount = processedOutcomes.filter(outcome => outcome.hasActionableChange).length;
        context.totalCount = processedOutcomes.length;
        context.encounterOnly = this.encounterOnly;
        context.showEncounterFilter = hasActiveEncounter();
        context.bulkActionState = this.bulkActionState;
        
        return context;
    }
    
    /**
     * Get available visibility states for an outcome based on Hide rules
     * Hide can only make you hidden from observers who can currently see you
     */
    getAvailableStatesForOutcome(outcome) {
        const states = [];
        
        // Always include the current state as an option
        states.push({
            value: outcome.oldVisibility,
            label: this.getStateLabel(outcome.oldVisibility),
            calculatedOutcome: outcome.newVisibility === outcome.oldVisibility
        });
        
        // Add hidden state if different from current
        if (outcome.oldVisibility !== 'hidden') {
            states.push({
                value: 'hidden',
                label: this.getStateLabel('hidden'),
                calculatedOutcome: outcome.newVisibility === 'hidden'
            });
        }
        
        return states;
    }
    
    getStateLabel(state) {
        const labels = {
            'observed': 'Observed',
            'concealed': 'Concealed', 
            'hidden': 'Hidden',
            'undetected': 'Undetected'
        };
        return labels[state] || state;
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
    
    getOutcomeLabel(outcome) {
        const labels = {
            'critical-success': 'Critical Success',
            'success': 'Success',
            'failure': 'Failure',
            'critical-failure': 'Critical Failure'
        };
        return labels[outcome] || outcome;
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
    
    async _onRender(context, options) {
        super._onRender(context, options);
        this.addIconClickHandlers();
        this.markInitialSelections();
        this.updateBulkActionButtons();
        this.updateChangesCount();
    }
    
    /**
     * Mark the initial calculated outcomes as selected
     */
    markInitialSelections() {
        this.outcomes.forEach(outcome => {
            // Set the initial override state to the calculated new visibility
            outcome.overrideState = outcome.newVisibility;            
            // Mark the calculated outcome as selected in the UI
            const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
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
    
    addIconClickHandlers() {
        const icons = this.element.querySelectorAll('.state-icon');
        
        icons.forEach((icon, index) => {
            icon.addEventListener('click', (event) => {
                let tokenId = event.currentTarget.dataset.tokenId;
                const state = event.currentTarget.dataset.state;
                
                // If no tokenId in the icon, try to find it from the row
                if (!tokenId) {
                    const row = event.currentTarget.closest('tr');
                    
                    // Try multiple methods to find the tokenId
                    // Method 1: Check if row has data-token-id
                    tokenId = row?.dataset?.tokenId;
                    
                    // Method 2: Find by observer name
                    if (!tokenId) {
                        const nameCell = row?.querySelector('.observer-name');
                        if (nameCell) {
                            const observerName = nameCell.textContent.trim();
                            const outcome = this.outcomes.find(o => o.target.name === observerName);
                            if (outcome) {
                                tokenId = outcome.target.id;
                            }
                        }
                    }
                    
                    // Method 3: Use row index as fallback
                    if (!tokenId) {
                        const allRows = Array.from(this.element.querySelectorAll('tbody tr'));
                        const rowIndex = allRows.indexOf(row);
                        if (rowIndex >= 0 && rowIndex < this.outcomes.length) {
                            tokenId = this.outcomes[rowIndex].target.id;
                        }
                    }
                }
                
                if (!tokenId) {
                    return;
                }
                
                // Find the outcome for this token
                const outcome = this.outcomes.find(o => o.target.id === tokenId);
                if (!outcome) {
                    return;
                }
                                
                // Update the override state
                outcome.overrideState = state;
                
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
                
                // Update the changes count
                this.updateChangesCount();
            });
        });
    }
    
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (row) {
            const actionButtons = row.querySelector('.row-actions');
            if (actionButtons) {
                // Always show action buttons
                actionButtons.style.display = 'flex';
            }
        }
    }
    
    /**
     * Updates the changes count in the dialog footer
     */
    updateChangesCount() {
        
        // Count outcomes where override state differs from old visibility
        const changesCount = this.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            const hasChange = effectiveNewState !== outcome.oldVisibility;
            return hasChange;
        }).length;
                
        // Update the UI
        const countElement = this.element.querySelector('.hide-preview-dialog-changes-count');
        if (countElement) {
            countElement.textContent = changesCount;
        }
        
        // Enable/disable bulk action buttons based on changes count
        const applyAllButton = this.element.querySelector('button[data-action="applyAll"]');
        if (applyAllButton) {
            applyAllButton.disabled = changesCount === 0;
        }
        
        // Also check individual Apply buttons
        this.outcomes.forEach(outcome => {
            const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
            if (row) {
                const applyButton = row.querySelector('.row-action-btn.apply-change');
                if (applyButton) {
                    const effectiveNewState = outcome.overrideState || outcome.newVisibility;
                    const hasChange = effectiveNewState !== outcome.oldVisibility;
                    applyButton.disabled = !hasChange;
                }
            }
        });
    }
    
    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('.bulk-action-btn[data-action="applyAll"]');
        const revertAllButton = this.element.querySelector('.bulk-action-btn[data-action="revertAll"]');
        
        if (!applyAllButton || !revertAllButton) return;
        
        // Count current changes to determine if Apply All should be enabled
        const changesCount = this.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        }).length;
                
        switch (this.bulkActionState) {
            case 'initial':
                // Apply All enabled only if there are changes
                applyAllButton.disabled = changesCount === 0;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                revertAllButton.disabled = true;
                revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                break;
                
            case 'applied':
                // Only Revert All available after applying
                applyAllButton.disabled = true;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                revertAllButton.disabled = false;
                revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                break;
                
            case 'reverted':
                // Apply All enabled only if there are changes
                applyAllButton.disabled = changesCount === 0;
                applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                revertAllButton.disabled = true;
                revertAllButton.innerHTML = '<i class="fas fa-undo-alt"></i> Reverted';
                break;
        }
    }
    
    static async _onClose(event, target) {
        currentHideDialog = null;
        return super._onClose?.(event, target);
    }
    
    static async _onApplyAll(event, target) {
        const app = target.closest('.application').app;
        
        // Check if already applied
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Get all outcomes that have actionable changes
        const changedOutcomes = app.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });
        
        
        if (changedOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No visibility changes to apply`);
            return;
        }
                
        // Apply all visibility changes
        app.applyVisibilityChanges(app.actorToken, changedOutcomes);
        
        // Update button states
        app.bulkActionState = 'applied';
        app.updateBulkActionButtons();
        app.updateRowButtonsToApplied(changedOutcomes);
        
        ui.notifications.info(`${MODULE_TITLE}: Applied ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`);
    }
    
    /**
     * Handle applying a visibility change for a single token
     */
    static async _onApplyChange(event, target) {
        const app = target.closest('.application').app;
        const tokenId = target.dataset.tokenId;
        
        if (!app || !tokenId) {
            return;
        }
        
        app.applyChangeForToken(tokenId);
    }
    
    /**
     * Handle reverting a visibility change for a single token
     */
    static async _onRevertChange(event, target) {
        const app = target.closest('.application').app;
        const tokenId = target.dataset.tokenId;
        
        if (!app || !tokenId) {
            console.error('[Hide Dialog] Could not find application instance or token ID');
            return;
        }
        
        app.revertChangeForToken(tokenId);
    }
    
    /**
     * Handle applying a visibility change for a single token
     * @param {string} tokenId - The ID of the token to apply changes for
     */
    applyChangeForToken(tokenId) {
        const outcome = this.outcomes.find(o => o.target.id === tokenId);
        if (!outcome) {
            console.warn(`[Hide Dialog] No outcome found for token ID: ${tokenId}`);
            return;
        }
        
        // Get the effective new state (override or calculated)
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        
        // Check if there's actually a change to apply
        if (effectiveNewState === outcome.oldVisibility) {
            ui.notifications.info(`${MODULE_TITLE}: No change needed for ${outcome.target.name}`);
            return;
        }
                
        // Apply the visibility change
        this.applyVisibilityChanges(this.actorToken, [outcome]);
        
        // Update row buttons
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (row) {
            const applyButton = row.querySelector('.row-action-btn.apply-change');
            const revertButton = row.querySelector('.row-action-btn.revert-change');
            
            if (applyButton) applyButton.disabled = true;
            if (revertButton) revertButton.disabled = false;
        }
        
        // Update changes count
        this.updateChangesCount();
    }
    
    /**
     * Handle reverting a visibility change for a single token
     * @param {string} tokenId - The ID of the token to revert changes for
     */
    revertChangeForToken(tokenId) {
        const outcome = this.outcomes.find(o => o.target.id === tokenId);
        if (!outcome) return;
                
        // Revert to original visibility
        const visibilityMap = getVisibilityMap();
        visibilityMap[this.actorToken.id] = visibilityMap[this.actorToken.id] || {};
        visibilityMap[this.actorToken.id][tokenId] = outcome.oldVisibility;
        setVisibilityMap(visibilityMap);
        
        // Update token visuals
        updateTokenVisuals(this.actorToken, [outcome.target]);
        updateEphemeralEffectsForVisibility(this.actorToken, [outcome.target]);
        
        // Reset override state
        outcome.overrideState = null;
        
        // Update row buttons
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (row) {
            const applyButton = row.querySelector('.row-action-btn.apply-change');
            const revertButton = row.querySelector('.row-action-btn.revert-change');
            
            if (applyButton) applyButton.disabled = false;
            if (revertButton) revertButton.disabled = true;
            
            // Reset selected state in UI
            const container = row.querySelector('.override-icons');
            if (container) {
                container.querySelectorAll('.state-icon').forEach(i => i.classList.remove('selected'));
                const calculatedIcon = container.querySelector(`.state-icon[data-state="${outcome.newVisibility}"]`);
                if (calculatedIcon) calculatedIcon.classList.add('selected');
            }
        }
        
        // Update changes count
        this.updateChangesCount();
    }
    
    static async _onRevertAll(event, target) {
        const app = currentHideDialog;
        
        if (!app) {
            return;
        }
        
        // Check if already reverted
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }
        
        const changedOutcomes = app.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });
        
        if (changedOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No visibility changes to revert`);
            return;
        }
        
        // Revert all changes (set back to old visibility)
        const revertChanges = changedOutcomes.map(outcome => ({
            ...outcome,
            newVisibility: outcome.oldVisibility
        }));
        
        app.applyVisibilityChanges(app.actorToken, revertChanges);
        
        // Update button states
        app.updateRowButtonsToReverted(changedOutcomes);
        app.bulkActionState = 'reverted';
        app.updateBulkActionButtons();
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`);
    }
    
    static async _onApplyChange(event, target) {
        const app = target.closest('[data-appid]')?.application;
        if (!app) {
            return;
        }
        
        const tokenId = target.dataset.tokenId;
        
        // Use the existing applyChangeForToken method which handles overrideState properly
        app.applyChangeForToken(tokenId);
    }
    
    static async _onRevertChange(event, target) {
        const app = target.closest('[data-appid]')?.application;
        if (!app) return;
        
        const tokenId = target.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) return;
        
        const revertChange = {
            ...outcome,
            newVisibility: outcome.oldVisibility
        };
        
        // Apply the revert
        app.applyVisibilityChanges(app.actorToken, [revertChange]);
        
        // Update button states for this row
        app.updateRowButtonsToReverted([outcome]);
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted hide visibility change for ${outcome.target.name}`);
    }
    
    static async _onToggleEncounterFilter(event, target) {
        const app = target.closest('[data-appid]')?.application;
        if (!app) return;
        
        // Toggle the filter state
        app.encounterOnly = !app.encounterOnly;
        
        // Re-discover observers with new filter
        const observers = discoverHideObservers(app.actorToken, app.encounterOnly);
        
        if (observers.length === 0 && app.encounterOnly) {
            ui.notifications.info(`${MODULE_TITLE}: No encounter observers found. Unchecking encounter filter.`);
            app.encounterOnly = false;
            return;
        }
        
        // Re-analyze outcomes
        app.outcomes = observers.map(observer => analyzeHideOutcome(app.actionData, observer));
        app.changes = app.outcomes.filter(outcome => outcome.changed);
        
        // Reset bulk action state
        app.bulkActionState = 'initial';
        
        // Re-render the dialog
        app.render({ force: true });
    }
    
    static async _onOverrideState(event, target) {
        // This is handled by the icon click handlers
        // Placeholder for future functionality if needed
    }
    
    applyVisibilityChanges(hidingToken, changes) {
        if (!changes || changes.length === 0) {
            return;
        }
        
        try {
            // Get current visibility map
            const visibilityMap = getVisibilityMap(hidingToken);
            
            // Apply all changes - note the perspective is reversed for Hide
            // We're setting how observers see the hiding token
            changes.forEach(change => {
                // Use override state if available, otherwise use calculated newVisibility
                const effectiveNewState = change.overrideState || change.newVisibility;
                
                if (change.target && effectiveNewState) {
                    // For Hide, we set how the observer (change.target) sees the hiding token
                    const observerVisibilityMap = getVisibilityMap(change.target);
                    
                    observerVisibilityMap[hidingToken.id] = effectiveNewState;
                    setVisibilityMap(change.target, observerVisibilityMap);
                                        
                    // Apply ephemeral effects if needed - for Hide, effects go on the hiding token
                    updateEphemeralEffectsForVisibility(hidingToken, change.target, effectiveNewState);
                }
            });
            
            // Update visual effects for all affected tokens
            updateTokenVisuals(hidingToken);
            changes.forEach(change => {
                if (change.target) {
                    updateTokenVisuals(change.target);
                }
            });
            
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying hide visibility changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to apply hide visibility changes - ${error.message}`);
        }
    }
    
    updateRowButtonsToApplied(outcomes) {
        outcomes.forEach(outcome => {
            const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
            if (row) {
                const applyButton = row.querySelector('.row-action-btn.apply-change');
                const revertButton = row.querySelector('.row-action-btn.revert-change');
                
                if (applyButton) {
                    applyButton.disabled = true;
                }
                
                if (revertButton) {
                    revertButton.disabled = false;
                }
            }
        });
    }
    
    updateRowButtonsToReverted(outcomes) {
        outcomes.forEach(outcome => {
            const row = this.element.querySelector(`tr[data-token-id="${outcome.target.id}"]`);
            if (row) {
                const applyBtn = row.querySelector('.apply-change');
                const revertBtn = row.querySelector('.revert-change');
                
                if (applyBtn && revertBtn) {
                    // Apply button: enabled, shows apply option
                    applyBtn.disabled = false;
                    applyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    applyBtn.title = 'Apply visibility change';
                    applyBtn.classList.remove('applied');
                    applyBtn.classList.remove('reverted');
                    
                    // Revert button: disabled, shows reverted state
                    revertBtn.disabled = true;
                    revertBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
                    revertBtn.title = 'Reverted';
                    revertBtn.classList.add('reverted');
                    revertBtn.classList.remove('applied');
                }
            }
        });
    }
    
    // Static button handler methods
    static async _onClose(event, target) {
        currentHideDialog = null;
        return super._onClose?.(event, target);
    }
    
    static async _onApplyAll(event, target) {
        const app = currentHideDialog;
        
        if (!app) {
            console.error('[Hide Dialog] Could not find application instance');
            return;
        }
        
        // Ensure bulkActionState is initialized
        if (!app.bulkActionState) {
            app.bulkActionState = 'initial';
        }
                
        // Check if already applied
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Get all outcomes that have actionable changes
        const changedOutcomes = app.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });
                
        if (changedOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No visibility changes to apply`);
            return;
        }
                
        // Apply all visibility changes
        await app.applyVisibilityChanges(app.actorToken, changedOutcomes);
        
        // Update button states
        app.bulkActionState = 'applied';
        app.updateBulkActionButtons();
        app.updateRowButtonsToApplied(changedOutcomes);
        ui.notifications.info(`${MODULE_TITLE}: Applied ${changedOutcomes.length} hide visibility changes. Dialog remains open for further adjustments.`);
    }
    
    static async _onRevertAll(event, target) {
        const app = currentHideDialog;
        
        if (!app) {
            return;
        }
        
        // Ensure bulkActionState is initialized
        if (!app.bulkActionState) {
            app.bulkActionState = 'initial';
        }
                
        // Check if already reverted
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }
        
        const changedOutcomes = app.outcomes.filter(outcome => {
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            return effectiveNewState !== outcome.oldVisibility;
        });
        
        if (changedOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No visibility changes to revert`);
            return;
        }
        
        // Create revert changes (back to original visibility)
        const revertChanges = app.outcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.oldVisibility,
            changed: true
        }));
                
        // Apply revert changes
        await app.applyVisibilityChanges(app.actorToken, revertChanges);
        
        // Update button states
        app.bulkActionState = 'reverted';
        app.updateBulkActionButtons();
        app.updateRowButtonsToReverted(app.outcomes);
        
        ui.notifications.info(`${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for further adjustments.`);
    }
    
    static async _onApplyChange(event, target) {
        const app = currentHideDialog;
        if (!app) {
            console.error('[Hide Dialog] Could not find application instance');
            return;
        }
        
        const tokenId = target.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) {
            ui.notifications.warn(`${MODULE_TITLE}: No outcome found for this token`);
            return;
        }
        
        // Check if there's actually a change to apply
        const effectiveNewState = outcome.overrideState || outcome.newVisibility;
        const hasChange = effectiveNewState !== outcome.oldVisibility;
        
        if (!hasChange) {
            ui.notifications.warn(`${MODULE_TITLE}: No change to apply for ${outcome.target.name}`);
            return;
        }
                
        // Create change object using override state
        const change = {
            target: outcome.target,
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [change]);
            ui.notifications.info(`${MODULE_TITLE}: Applied visibility change for ${outcome.target.name}`);
            
            // Update button states for this row
            const row = app.element.querySelector(`tr[data-token-id="${tokenId}"]`);
            if (row) {
                const applyBtn = row.querySelector('.apply-change');
                const revertBtn = row.querySelector('.revert-change');
                
                if (applyBtn && revertBtn) {
                    applyBtn.disabled = true;
                    applyBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
                    applyBtn.title = 'Applied';
                    
                    revertBtn.disabled = false;
                    revertBtn.innerHTML = '<i class="fas fa-undo"></i>';
                    revertBtn.title = 'Revert to original visibility';
                }
            }
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error applying change for ${outcome.target.name}`);
        }
    }
    
    static async _onRevertChange(event, target) {
        const app = currentHideDialog;
        if (!app) {
            console.error('[Hide Dialog] Could not find application instance');
            return;
        }
        
        const tokenId = target.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) {
            ui.notifications.warn(`${MODULE_TITLE}: Could not find outcome for this token`);
            return;
        }
        
        // Store the current override state before clearing it
        const previousOverrideState = outcome.overrideState;
        
        // Clear the override state
        outcome.overrideState = null;
        
        // Update the changes count since we cleared the override state
        app.updateChangesCount();
        
        // Create revert change object (back to original visibility)
        const change = {
            target: outcome.target,
            newVisibility: outcome.oldVisibility,
            changed: true
        };
                
        try {
            await app.applyVisibilityChanges(app.actorToken, [change]);
            ui.notifications.info(`${MODULE_TITLE}: Reverted visibility change for ${outcome.target.name}`);
            
            // Update button states for this row
            const row = app.element.querySelector(`tr[data-token-id="${tokenId}"]`);
            if (row) {
                const applyBtn = row.querySelector('.apply-change');
                const revertBtn = row.querySelector('.revert-change');
                
                if (applyBtn && revertBtn) {
                    // After revert, Apply button should be disabled until user selects a different state
                    applyBtn.disabled = true;
                    applyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    applyBtn.title = 'Apply visibility change';
                    
                    revertBtn.disabled = true;
                    revertBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
                    revertBtn.title = 'Reverted';
                    
                    // Update icon selection to show the previous override state (what user had selected)
                    const icons = row.querySelectorAll('.override-icons .state-icon');
                    icons.forEach(icon => {
                        icon.classList.remove('selected');
                        // Show the state that was applied: override if user selected one, otherwise calculated newVisibility
                        const stateToSelect = previousOverrideState || outcome.newVisibility;
                        if (icon.dataset.state === stateToSelect) {
                            icon.classList.add('selected');
                        }
                    });
                    
                    // Restore the override state so user can apply again
                    outcome.overrideState = previousOverrideState;
                }
            }
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error reverting change for ${outcome.target.name}`);
        }
    }
}
