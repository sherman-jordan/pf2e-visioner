/**
 * Seek Preview Dialog for Seek action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_TITLE, MODULE_ID } from '../constants.js';
import { getVisibilityBetween, setVisibilityMap, getVisibilityMap } from '../utils.js';
import { updateTokenVisuals } from '../visual-effects.js';
import { updateEphemeralEffectsForVisibility } from '../off-guard-ephemeral.js';
import { hasActiveEncounter } from './shared-utils.js';
import { discoverSeekTargets, analyzeSeekOutcome } from './seek-logic.js';

// Store reference to current seek dialog
let currentSeekDialog = null;

export class SeekPreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['seek-preview-dialog'], // Keep same class for CSS compatibility
        window: {
            title: 'Seek Results Preview',
            icon: 'fas fa-search',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            close: SeekPreviewDialog._onClose,
            applyAll: SeekPreviewDialog._onApplyAll,
            revertAll: SeekPreviewDialog._onRevertAll,
            applyChange: SeekPreviewDialog._onApplyChange,
            revertChange: SeekPreviewDialog._onRevertChange,
            toggleEncounterFilter: SeekPreviewDialog._onToggleEncounterFilter,
            overrideState: SeekPreviewDialog._onOverrideState
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/seek-preview.hbs'
        }
    };
    
    constructor(actorToken, outcomes, changes, actionData, options = {}) {
        // Set window title and icon for seek dialog
        options.window = {
            ...options.window,
            title: 'Action Results Preview',
            icon: 'fas fa-search'
        };
        
        super(options);
        this.actorToken = actorToken; // Renamed for clarity
        this.outcomes = outcomes;
        this.changes = changes;
        this.actionData = { ...actionData, actionType: 'seek' }; // Store action data, ensuring actionType is always 'seek'
        
        // Track bulk action states to prevent abuse
        this.bulkActionState = 'initial'; // 'initial', 'applied', 'reverted'
        
        // Track encounter filtering state
        this.encounterOnly = false;
        
        // Set global reference
        currentSeekDialog = this;
    }
    
    /**
     * Add hover functionality after rendering
     */
    _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        this._addHoverListeners();
    }
    
    _onRender(context, options) {
        super._onRender?.(context, options);
        this._addHoverListeners();
    }
    
    _addHoverListeners() {
        // Add hover listeners to token images and rows
        const tokenRows = this.element.querySelectorAll('.token-row, tr[data-token-id]');
        
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
    
    /**
     * Prepare context data for the template
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Prepare visibility states for icons
        const visibilityStates = {
            'observed': { icon: 'fas fa-eye', color: '#28a745', label: 'Observed' },
            'hidden': { icon: 'fas fa-eye-slash', color: '#ffc107', label: 'Hidden' },
            'undetected': { icon: 'fas fa-ghost', color: '#dc3545', label: 'Undetected' },
            'concealed': { icon: 'fas fa-cloud', color: '#6c757d', label: 'Concealed' }
        };
        
        // Prepare outcomes for template
        const processedOutcomes = this.outcomes.map(outcome => {
            // Get current visibility state from the token
            const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
            
            // Prepare available states for override
            // Seek can result in hidden or observed
            const availableStates = [
                {
                    value: 'hidden',
                    ...visibilityStates.hidden,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'hidden',
                    calculatedOutcome: outcome.newVisibility === 'hidden'
                },
                {
                    value: 'observed',
                    ...visibilityStates.observed,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'observed',
                    calculatedOutcome: outcome.newVisibility === 'observed'
                }
            ];
            
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            // Check if there's an actionable change - either the outcome naturally changed OR user overrode the state
            const hasActionableChange = outcome.changed || (outcome.overrideState && outcome.overrideState !== outcome.oldVisibility);
            
            // Format the outcome text properly - replace hyphens with spaces and capitalize words
            let formattedOutcome = outcome.outcome;
            if (typeof formattedOutcome === 'string' && formattedOutcome.includes('-')) {
                formattedOutcome = formattedOutcome.split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
            
            return {
                ...outcome,
                outcomeClass: this.getOutcomeClass(outcome.outcome),
                outcomeLabel: formattedOutcome || this.getOutcomeLabel(outcome.outcome),
                oldVisibilityState: visibilityStates[outcome.oldVisibility || outcome.currentVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                marginText: outcome.margin >= 0 ? `+${outcome.margin}` : `${outcome.margin}`,
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src,
                availableStates: availableStates,
                overrideState: outcome.overrideState || outcome.newVisibility,
                hasActionableChange: hasActionableChange
            };
        });
        
        // Add debug logging for outcome processing
        console.log(`${MODULE_TITLE}: Processed outcomes:`, processedOutcomes.map(o => ({
            outcome: o.outcome,
            outcomeClass: o.outcomeClass,
            outcomeLabel: o.outcomeLabel
        })));
        
        // Update original outcomes with hasActionableChange for Apply All button logic
        processedOutcomes.forEach((processedOutcome, index) => {
            if (this.outcomes[index]) {
                this.outcomes[index].hasActionableChange = processedOutcome.hasActionableChange;
            }
        });
        
        // Set actor context for seeker
        context.seeker = {
            name: this.actorToken.name,
            image: this.actorToken.texture?.src || this.actorToken.document?.texture?.src,
            actionType: 'seek',
            actionLabel: 'Seek action results analysis'
        };
        context.outcomes = processedOutcomes;
        context.changesCount = processedOutcomes.filter(outcome => outcome.hasActionableChange).length;
        context.totalCount = this.outcomes.length;
        
        // Add encounter filtering context - show checkbox whenever there's an active encounter
        const hasEncounter = hasActiveEncounter();
        console.log(`${MODULE_TITLE}: hasActiveEncounter() returned:`, hasEncounter);
        context.showEncounterFilter = hasEncounter;
        context.encounterOnly = this.encounterOnly;
        console.log(`${MODULE_TITLE}: Context showEncounterFilter:`, context.showEncounterFilter, 'encounterOnly:', context.encounterOnly);
        
        return context;
    }
    
    /**
     * Get CSS class for outcome type
     */
    getOutcomeClass(outcome) {
        let cssClass = '';
        switch(outcome) {
            case 'criticalSuccess': 
            case 'critical-success': 
                cssClass = 'critical-success'; 
                break;
            case 'success': 
                cssClass = 'success'; 
                break;
            case 'failure': 
                cssClass = 'failure'; 
                break;
            case 'criticalFailure': 
            case 'critical-failure': 
                cssClass = 'critical-failure'; 
                break;
            default: 
                cssClass = '';
        }
        console.log(`${MODULE_TITLE}: getOutcomeClass for '${outcome}' returning '${cssClass}'`);
        return cssClass;
    }
    
    /**
     * Get display label for outcome type
     */
    getOutcomeLabel(outcome) {
        let label = '';
        switch(outcome) {
            case 'criticalSuccess': label = 'Critical Success'; break;
            case 'success': label = 'Success'; break;
            case 'failure': label = 'Failure'; break;
            case 'criticalFailure': label = 'Critical Failure'; break;
            // Only Seek outcomes should be handled here
            default: label = outcome.charAt(0).toUpperCase() + outcome.slice(1);
        }
        console.log(`${MODULE_TITLE}: getOutcomeLabel for '${outcome}' returning '${label}'`);
        return label;
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
     * Called after the application is rendered
     */
    _onRender(context, options) {
        super._onRender(context, options);
        
        // Set initial button states
        this.updateBulkActionButtons();
        
        // Add icon click handlers
        this.addIconClickHandlers();
    }
    
    /**
     * Apply all visibility changes
     */
    static async _onApplyAll(event, button) {
        const app = currentSeekDialog;
        
        if (!app) {
            return;
        }
        
        const actionableOutcomes = app.outcomes.filter(outcome => outcome.hasActionableChange);
        
        if (actionableOutcomes.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No changes to apply`);
            return;
        }
        
        // Check if Apply All is allowed based on current state
        if (app.bulkActionState === 'applied') {
            ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            return;
        }
        
        // Create proper change objects using override state
        const changes = actionableOutcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        }));
        
        try {
            await app.applyVisibilityChanges(app.actorToken, changes);
            ui.notifications.info(`${MODULE_TITLE}: Applied ${changes.length} visibility changes. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show applied state
            app.updateRowButtonsToApplied(actionableOutcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'applied';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error applying changes.`);
        }
    }
    
    /**
     * Revert all changes to original state
     */
    static async _onRevertAll(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        // Check if Revert All is allowed based on current state
        if (app.bulkActionState === 'reverted') {
            ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            return;
        }
        
        const revertChanges = app.outcomes.map(outcome => ({
            target: outcome.target,
            newVisibility: outcome.oldVisibility || outcome.currentVisibility,
            changed: true
        }));
        
        try {
            await app.applyVisibilityChanges(app.actorToken, revertChanges);
            ui.notifications.info(`${MODULE_TITLE}: Reverted all tokens to original visibility. Dialog remains open for additional actions.`);
            
            // Update individual row buttons to show reverted state
            app.updateRowButtonsToReverted(app.outcomes);
            
            // Update bulk action state and buttons
            app.bulkActionState = 'reverted';
            app.updateBulkActionButtons();
            
            // Don't close dialog - allow user to continue working
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error reverting changes.`);
        }
    }
    
    /**
     * Apply individual visibility change
     */
    static async _onApplyChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome || !outcome.hasActionableChange) {
            ui.notifications.warn(`${MODULE_TITLE}: No change to apply for this token`);
            return;
        }
        
        // Create proper change object using override state
        const change = {
            target: outcome.target,
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [change]);
            ui.notifications.info(`${MODULE_TITLE}: Applied visibility change for ${outcome.target.name}`);
            
            // Update button states to show applied and enable revert
            const tokenId = outcome.target.id;
            const applyButton = app.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
            const revertButton = app.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
            
            if (applyButton) {
                applyButton.disabled = true;
                applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
                applyButton.classList.add('applied');
                applyButton.title = 'Applied';
            }
            
            if (revertButton) {
                revertButton.disabled = false;
                revertButton.innerHTML = '<i class="fas fa-undo"></i>';
                revertButton.classList.remove('reverted');
                revertButton.title = 'Revert to original visibility';
            }
            
            // Update the count display
            app.updateChangesCount();
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error applying change.`);
        }
    }
    
    /**
     * Revert individual token to original state
     */
    static async _onRevertChange(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) {
            ui.notifications.warn(`${MODULE_TITLE}: Token not found`);
            return;
        }
        
        const revertChange = {
            target: outcome.target,
            newVisibility: outcome.oldVisibility || outcome.currentVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [revertChange]);
            ui.notifications.info(`${MODULE_TITLE}: Reverted ${outcome.target.name} to original visibility`);
            
            // Update button states to show reverted and enable apply
            const tokenId = outcome.target.id;
            const applyButton = app.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
            const revertButton = app.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
            
            if (revertButton) {
                revertButton.disabled = true;
                revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
                revertButton.classList.add('reverted');
                revertButton.title = 'Reverted';
            }
            
            if (applyButton) {
                applyButton.disabled = false;
                applyButton.innerHTML = '<i class="fas fa-check"></i>';
                applyButton.classList.remove('applied');
                applyButton.title = 'Apply visibility change';
            }
            
            // Update the count display
            app.updateChangesCount();
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error reverting change.`);
        }
    }
    
    /**
     * Update the changes count display dynamically
     */
    updateChangesCount() {
        // Count how many tokens currently have actionable changes
        // This includes both natural changes and user overrides
        let changesCount = 0;
        
        this.outcomes.forEach(outcome => {
            const tokenId = outcome.target.id;
            const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
            const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
            
            // Count as having changes if:
            // 1. Apply button is enabled (has changes to apply)
            // 2. Revert button is enabled (has been applied and can be reverted)
            const hasApplicableChanges = applyButton && !applyButton.disabled;
            const hasRevertibleChanges = revertButton && !revertButton.disabled;
            
            if (hasApplicableChanges || hasRevertibleChanges) {
                changesCount++;
            }
        });
        
        // Update the count display
        const changesCountElement = this.element.querySelector('.seek-preview-dialog-changes-count');
        if (changesCountElement) {
            changesCountElement.textContent = changesCount;
        }
    }
    
    /**
     * Override close to clear global reference
     */
    close(options) {
        currentSeekDialog = null;
        return super.close(options);
    }
    
    /**
     * Apply visibility changes using the existing utility function
     */
    async applyVisibilityChanges(seeker, changes) {
        const promises = changes.map(async (change) => {
            try {
                // Update the visibility relationship in the visibility map
                // Note: We don't use setVisibilityBetween here because it would apply effects to the seeker
                // Instead, we handle visibility map and effects separately for proper seek automation
                const visibilityMap = getVisibilityMap(seeker);
                visibilityMap[change.target.document.id] = change.newVisibility;
                await setVisibilityMap(seeker, visibilityMap);
                
                // Apply ephemeral effects to the target token (like in visibility manager's Observer Mode)
                // Target token gets the ephemeral effect that applies when targeting the seeker
                // NOTE: We only manage ephemeral effects, not PF2E conditions - those should remain as originally set
                await updateEphemeralEffectsForVisibility(change.target, seeker, change.newVisibility);
                
            } catch (error) {
                ui.notifications.error(`${MODULE_TITLE}: Error applying changes.`);
            }
        });
        
        await Promise.all(promises);
        
        // Refresh token visuals to ensure all changes are displayed
        try {
            await updateTokenVisuals();
        } catch (error) {
            ui.notifications.error(`${MODULE_TITLE}: Error refreshing token visuals.`);
        }
    }
    
    /**
     * Update individual row buttons to show applied state
     */
    updateRowButtonsToApplied(outcomes) {
        outcomes.forEach(outcome => {
            if (outcome.hasActionableChange) {
                const tokenId = outcome.target.id;
                const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
                const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
                
                if (applyButton) {
                    applyButton.disabled = true;
                    applyButton.innerHTML = '<i class="fas fa-check-circle"></i>';
                    applyButton.classList.add('applied');
                    applyButton.title = 'Applied';
                }
                
                if (revertButton) {
                    revertButton.disabled = false;
                    revertButton.innerHTML = '<i class="fas fa-undo"></i>';
                    revertButton.classList.remove('reverted');
                    revertButton.title = 'Revert to original visibility';
                }
            }
        });
    }
    
    /**
     * Update individual row buttons to show reverted state
     */
    updateRowButtonsToReverted(outcomes) {
        outcomes.forEach(outcome => {
            if (outcome.hasActionableChange) {
                const tokenId = outcome.target.id;
                const applyButton = this.element.querySelector(`button[data-action="applyChange"][data-token-id="${tokenId}"]`);
                const revertButton = this.element.querySelector(`button[data-action="revertChange"][data-token-id="${tokenId}"]`);
                
                if (revertButton) {
                    revertButton.disabled = true;
                    revertButton.innerHTML = '<i class="fas fa-undo-alt"></i>';
                    revertButton.classList.add('reverted');
                    revertButton.title = 'Reverted';
                }
                
                if (applyButton) {
                    applyButton.disabled = false;
                    applyButton.innerHTML = '<i class="fas fa-check"></i>';
                    applyButton.classList.remove('applied');
                    applyButton.title = 'Apply visibility change';
                }
            }
        });
    }
    
    /**
     * Update bulk action button states based on current bulk action state
     */
    updateBulkActionButtons() {
        const applyAllButton = this.element.querySelector('.seek-preview-dialog-bulk-action-btn[data-action="applyAll"]');
        const revertAllButton = this.element.querySelector('.seek-preview-dialog-bulk-action-btn[data-action="revertAll"]');
        
        if (applyAllButton && revertAllButton) {
            switch (this.bulkActionState) {
                case 'initial':
                    // Only Apply All available initially (nothing to revert yet)
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                    
                case 'applied':
                    // Only Revert All available after Apply All
                    applyAllButton.disabled = true;
                    revertAllButton.disabled = false;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                    
                case 'reverted':
                    // Only Apply All available after Revert All
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Reverted';
                    break;
            }
        }
    }
    
    /**
     * Toggle encounter filtering and refresh results
     */
    static async _onToggleEncounterFilter(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        // Toggle the encounter filter state
        app.encounterOnly = !app.encounterOnly;
        
        // Re-discover targets with new filter setting
        const targets = discoverSeekTargets(app.actorToken, app.encounterOnly);
        
        if (targets.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No ${app.encounterOnly ? 'encounter ' : ''}targets found for seek action`);
            // Reset to false if no targets found
            app.encounterOnly = false;
            return;
        }
        
        // Re-analyze outcomes with new targets
        const outcomes = targets.map(target => analyzeSeekOutcome(app.actionData, target));
        const changes = outcomes.filter(outcome => outcome.changed);
        
        // Update dialog data
        app.outcomes = outcomes;
        app.changes = changes;
        
        // Reset bulk action state
        app.bulkActionState = 'initial';
        
        // Re-render the dialog
        app.render({ force: true });
    }
    
    /**
     * Add click handlers for state icon selection
     */
    addIconClickHandlers() {
        const stateIcons = this.element.querySelectorAll('.state-icon');
        stateIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const targetId = event.currentTarget.dataset.target;
                const newState = event.currentTarget.dataset.state;
                
                // Update the selection visually
                const overrideIcons = event.currentTarget.closest('.override-icons');
                const allIcons = overrideIcons.querySelectorAll('.state-icon');
                allIcons.forEach(i => i.classList.remove('selected'));
                event.currentTarget.classList.add('selected');
                
                // Update the hidden input
                const hiddenInput = overrideIcons.querySelector('input[type="hidden"]');
                if (hiddenInput) {
                    hiddenInput.value = newState;
                }
                
                // Update the outcome data
                const outcome = this.outcomes.find(o => o.target.id === targetId);
                if (outcome) {
                    outcome.overrideState = newState;
                    
                    // Get current visibility state to determine if there's an actionable change
                    const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility || outcome.currentVisibility;
                    
                    // Update both changed status and actionable change status
                    outcome.changed = outcome.overrideState !== (outcome.oldVisibility || outcome.currentVisibility);
                    outcome.hasActionableChange = outcome.overrideState !== currentVisibility;
                    
                    // Update button visibility if needed
                    this.updateActionButtonsForToken(targetId, outcome.hasActionableChange);
                }
                
                // Update the changes array
                this.changes = this.outcomes.filter(outcome => outcome.changed);
            });
        });
    }
    
    /**
     * Update action buttons visibility for a specific token
     */
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) return;
        
        const actionsCell = row.querySelector('.actions');
        if (!actionsCell) return;
        
        if (hasActionableChange) {
            // Show buttons if there's an actionable change
            actionsCell.innerHTML = `
                <button type="button" class="row-action-btn apply-change" data-action="applyChange" data-token-id="${tokenId}" title="Apply this visibility change">
                    <i class="fas fa-check"></i>
                </button>
                <button type="button" class="row-action-btn revert-change" data-action="revertChange" data-token-id="${tokenId}" title="Revert to original visibility" disabled>
                    <i class="fas fa-undo"></i>
                </button>
            `;
        } else {
            // Show "No change" if there's no actionable change
            actionsCell.innerHTML = '<span class="no-action">No change</span>';
        }
    }
    
    /**
     * Handle state override action (for potential future use)
     */
    static async _onOverrideState(event, button) {
        const app = currentSeekDialog;
        if (!app) return;
        
        const targetId = button.dataset.target;
        const newState = button.dataset.state;
        // This method is available for future enhancements if needed
    }
    
    /**
     * Handle close action
     */
    static _onClose(event, button) {
        const app = currentSeekDialog;
        if (app) {
            app.close();
            currentSeekDialog = null; // Clear reference when closing
        }
    }
}
