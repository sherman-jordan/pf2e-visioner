/**
 * Point Out Preview Dialog for Point Out action automation
 * Uses ApplicationV2 for modern FoundryVTT compatibility
 */

import { MODULE_ID, MODULE_TITLE } from '../constants.js';
import { getVisibilityBetween } from '../utils.js';
import { analyzePointOutOutcome, discoverPointOutAllies, getPointOutTarget } from './point-out-logic.js';
import { applyVisibilityChanges, filterOutcomesByEncounter, hasActiveEncounter, isTokenInEncounter } from './shared-utils.js';

// Store reference to current dialog (shared with SeekPreviewDialog)
let currentPointOutDialog = null;

export class PointOutPreviewDialog extends foundry.applications.api.ApplicationV2 {
    
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['point-out-preview-dialog'],
        window: {
            title: 'Point Out Results Preview',
            icon: 'fas fa-hand-point-right',
            resizable: true
        },
        position: {
            width: 600,
            height: 'auto'
        },
        actions: {
            close: PointOutPreviewDialog._onClose,
            applyAll: PointOutPreviewDialog._onApplyAll,
            revertAll: PointOutPreviewDialog._onRevertAll,
            applyChange: PointOutPreviewDialog._onApplyChange,
            revertChange: PointOutPreviewDialog._onRevertChange,
            toggleEncounterFilter: PointOutPreviewDialog._onToggleEncounterFilter
        }
    };
    
    static PARTS = {
        content: {
            template: 'modules/pf2e-visioner/templates/point-out-preview.hbs'
        }
    };
    
    constructor(actorToken, outcomes, changes, actionData, options = {}) {
        super(options);
        this.actorToken = actorToken;
        this.outcomes = outcomes;
        this.changes = changes;
        this.actionData = actionData;
        this.bulkActionState = 'initial';
        this.encounterOnly = game.settings.get(MODULE_ID, 'defaultEncounterFilter');
        
        // Set global reference
        currentPointOutDialog = this;
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
        // Add hover listeners to token rows (Point Out template uses different structure)
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
        
        // Filter outcomes based on encounter filter
        let filteredOutcomes = this.outcomes;
        if (this.encounterOnly && hasActiveEncounter()) {
            filteredOutcomes = this.outcomes.filter(outcome => 
                isTokenInEncounter(outcome.target)
            );
            
            // Auto-uncheck if no encounter tokens found
            if (filteredOutcomes.length === 0) {
                this.encounterOnly = false;
                filteredOutcomes = this.outcomes;
                ui.notifications.info(`${MODULE_TITLE}: No encounter allies found, showing all`);
            }
        }
        
        const visibilityStates = {
            'hidden': { icon: 'fas fa-eye-slash', color: '#ffc107', label: 'Hidden' },
            'undetected': { icon: 'fas fa-ghost', color: '#dc3545', label: 'Undetected' }
        };
        
        const processedOutcomes = filteredOutcomes.map(outcome => {
            const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility;
            const availableStates = {
                'hidden': {
                    ...visibilityStates.hidden,
                    selected: (outcome.overrideState || outcome.newVisibility) === 'hidden'
                }
            };
            
            const effectiveNewState = outcome.overrideState || outcome.newVisibility;
            // Check if there's an actionable change - either the outcome naturally changed OR user overrode the state
            const hasActionableChange = outcome.changed || (outcome.overrideState && outcome.overrideState !== outcome.oldVisibility);
            
            return {
                ...outcome,
                oldVisibilityState: visibilityStates[outcome.oldVisibility || outcome.currentVisibility],
                newVisibilityState: visibilityStates[outcome.newVisibility],
                tokenImage: outcome.target.texture?.src || outcome.target.document?.texture?.src,
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
        
        context.actorName = this.actorToken.name;
        context.actorImage = this.actorToken.texture?.src || this.actorToken.document?.texture?.src;
        context.outcomes = processedOutcomes;
        context.changes = this.changes;
        context.changesCount = processedOutcomes.filter(outcome => outcome.hasActionableChange).length;
        context.totalCount = this.outcomes.length;
        context.showEncounterFilter = hasActiveEncounter();
        context.encounterOnly = this.encounterOnly;
        
        // Add target name and DC if all outcomes point to the same target
        if (processedOutcomes.length > 0) {
            const firstTargetToken = processedOutcomes[0].targetToken;
            const allSameTarget = processedOutcomes.every(outcome => outcome.targetToken?.id === firstTargetToken?.id);
            if (allSameTarget && firstTargetToken) {
                context.targetName = firstTargetToken.name;
                context.targetDC = processedOutcomes[0].dc;
            }
        }
        
        return context;
    }
    
    async _renderHTML(context, options) {
        return await renderTemplate(this.constructor.PARTS.content.template, context);
    }
    
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
        return content;
    }
    
    _onRender(context, options) {
        super._onRender(context, options);
        this.updateBulkActionButtons();
        this.addIconClickHandlers();
    }
    
    // Point Out specific action methods
    static async _onClose(event, button) {
        const app = currentPointOutDialog;
        if (app) {
            app.close();
        }
    }
    
    static async _onApplyAll(event, button) {
        const app = currentPointOutDialog;
        if (!app || app.bulkActionState === 'applied') {
            if (app.bulkActionState === 'applied') {
                ui.notifications.warn(`${MODULE_TITLE}: Apply All has already been used. Use Revert All to undo changes.`);
            }
            return;
        }
        
        try {
            // Filter outcomes based on encounter filter using shared helper
            const filteredOutcomes = filterOutcomesByEncounter(app.changes, app.encounterOnly, 'target');
            
            // Only apply changes to filtered outcomes
            const changedOutcomes = filteredOutcomes.filter(change => change.hasActionableChange !== false);
            
            // Make sure each outcome has the targetToken property
            const processedOutcomes = changedOutcomes.map(outcome => {
                // If outcome doesn't have targetToken, try to get it from the original outcome
                if (!outcome.targetToken) {
                    const originalOutcome = app.outcomes.find(o => o.target.id === outcome.target.id);
                    if (originalOutcome && originalOutcome.targetToken) {
                        return { ...outcome, targetToken: originalOutcome.targetToken };
                    }
                }
                return outcome;
            });
            
            await app.applyVisibilityChanges(app.actorToken, processedOutcomes);
            
            app.bulkActionState = 'applied';
            app.updateBulkActionButtons();
            app.updateAllRowButtonsToApplied();
            
            ui.notifications.info(`${MODULE_TITLE}: Applied Point Out changes for ${processedOutcomes.length} allies. Dialog remains open for further adjustments.`);
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying Point Out changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to apply Point Out changes`);
        }
    }
    
    static async _onRevertAll(event, button) {
        const app = currentPointOutDialog;
        if (!app || app.bulkActionState === 'reverted') {
            if (app.bulkActionState === 'reverted') {
                ui.notifications.warn(`${MODULE_TITLE}: Revert All has already been used. Use Apply All to reapply changes.`);
            }
            return;
        }
        
        try {
            // Filter outcomes based on encounter filter using shared helper
            const filteredOutcomes = filterOutcomesByEncounter(app.changes, app.encounterOnly, 'target');
            
            // Only revert changes to filtered outcomes
            const changedOutcomes = filteredOutcomes.map(change => {
                // Make sure to include targetToken in the change
                const originalOutcome = app.outcomes.find(o => o.target.id === change.target.id);
                return {
                    ...change,
                    targetToken: originalOutcome?.targetToken || change.targetToken,
                    newVisibility: change.oldVisibility || change.currentVisibility // Revert to original state
                };
            });
            
            await app.applyVisibilityChanges(app.actorToken, changedOutcomes);
            
            app.bulkActionState = 'reverted';
            app.updateBulkActionButtons();
            app.updateAllRowButtonsToReverted();
            
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error reverting Point Out changes:`, error);
            ui.notifications.error(`${MODULE_TITLE}: Failed to revert Point Out changes`);
        }
    }
    

    
    static async _onToggleEncounterFilter(event, button) {
        const app = currentPointOutDialog;
        if (!app) return;
        
        app.encounterOnly = !app.encounterOnly;
        
        // Get the actual targeted token from the Point Out action
        const pointOutTarget = getPointOutTarget(app.actionData);
        if (!pointOutTarget) {
            ui.notifications.info(`${MODULE_TITLE}: No target found for Point Out action`);
            app.encounterOnly = false;
            return;
        }
        
        // Find allies who can't see this target
        let allies = discoverPointOutAllies(app.actorToken, pointOutTarget, app.encounterOnly);
        
        // If no encounter allies found, turn off filter and try again
        if (allies.length === 0 && app.encounterOnly) {
            ui.notifications.info(`${MODULE_TITLE}: No encounter allies found who can't see ${pointOutTarget.name} - showing all allies`);
            app.encounterOnly = false;
            allies = discoverPointOutAllies(app.actorToken, pointOutTarget, app.encounterOnly);
        }
        
        // If still no allies found, show message and return
        if (allies.length === 0) {
            ui.notifications.info(`${MODULE_TITLE}: No allies found who can't see ${pointOutTarget.name}`);
            return;
        }
        
        const outcomes = allies.map(allyData => analyzePointOutOutcome(app.actionData, allyData));
        const changes = outcomes.filter(outcome => outcome.changed);
        
        app.outcomes = outcomes;
        app.changes = changes;
        app.bulkActionState = 'initial';
        app.render({ force: true });
    }
    
    /**
     * Apply individual visibility change
     */
    static async _onApplyChange(event, button) {
        const app = currentPointOutDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome || !outcome.hasActionableChange) {
            ui.notifications.warn(`${MODULE_TITLE}: No change to apply for this token`);
            return;
        }
        
        console.log('Applying Point Out change for outcome:', outcome);
        
        // Create proper change object using override state
        const change = {
            target: outcome.target, // This is the ally token
            targetToken: outcome.targetToken, // This is the token being pointed out
            newVisibility: outcome.overrideState || outcome.newVisibility,
            changed: true
        };
        
        try {
            // Apply the change - the ally will see the pointed out token
            await app.applyVisibilityChanges(app.actorToken, [change]);
            
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
            console.error(`${MODULE_TITLE}: Error applying change.`, error);
            ui.notifications.error(`${MODULE_TITLE}: Error applying change.`);
        }
    }
    
    /**
     * Revert individual token to original state
     */
    static async _onRevertChange(event, button) {
        const app = currentPointOutDialog;
        if (!app) return;
        
        const tokenId = button.dataset.tokenId;
        const outcome = app.outcomes.find(o => o.target.id === tokenId);
        
        if (!outcome) {
            ui.notifications.warn(`${MODULE_TITLE}: Token not found`);
            return;
        }
        
        const revertChange = {
            target: outcome.target,
            targetToken: outcome.targetToken, // Include the targetToken for Point Out
            newVisibility: outcome.oldVisibility || outcome.currentVisibility,
            changed: true
        };
        
        try {
            await app.applyVisibilityChanges(app.actorToken, [revertChange]);
            
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
            console.error(`${MODULE_TITLE}: Error reverting change.`, error);
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
        const changesCountElement = this.element.querySelector('.point-out-preview-dialog-changes-count');
        if (changesCountElement) {
            changesCountElement.textContent = changesCount;
        }
    }
    
    close(options) {
        currentPointOutDialog = null;
        return super.close(options);
    }
    
    /**
     * Apply visibility changes using the shared utility function
     * @param {Token} actor - The actor token (usually the one pointing out)
     * @param {Array} changes - Array of change objects
     * @param {Object} options - Additional options
     * @param {string} options.direction - Direction of visibility check ('observer_to_target' or 'target_to_observer')
     */
    async applyVisibilityChanges(actor, changes, options = {}) {
        // For Point Out, we need to handle the special relationship:
        // The ally token needs to see the pointed out token
        options.direction = options.direction || 'observer_to_target';
        
        try {
            // Process each change
            const promises = changes.map(async (change) => {
                try {
                    if (!change.target) {
                        console.error(`${MODULE_TITLE}: No ally token found in change:`, change);
                        return;
                    }
                    
                    // Get the token being pointed out
                    let pointedOutToken = change.targetToken;
                    if (!pointedOutToken) {
                        // Try to get from action data
                        if (this.actionData.target) {
                            pointedOutToken = this.actionData.target;
                        } else if (game.user.targets && game.user.targets.size > 0) {
                            // Try to get from current user targets
                            pointedOutToken = Array.from(game.user.targets)[0];
                        }
                    }
                    
                    if (!pointedOutToken) {
                        console.error(`${MODULE_TITLE}: Could not find pointed out token for Point Out`);
                        return;
                    }
                    
                    // The ally token (change.target) needs to see the pointed out token (pointedOutToken)
                    // Use the shared applyVisibilityChanges function
                    await applyVisibilityChanges(
                        change.target, // The ally token (observer)
                        [{ 
                            target: pointedOutToken, // The pointed out token (target)
                            newVisibility: change.overrideState || change.newVisibility,
                            changed: true
                        }],
                        { direction: 'observer_to_target' }
                    );
                } catch (error) {
                    console.error(`${MODULE_TITLE}: Error applying individual visibility change:`, error);
                }
            });
            
            // Wait for all changes to complete
            await Promise.all(promises);
            return true;
        } catch (error) {
            console.error(`${MODULE_TITLE}: Error applying visibility changes:`, error);
            return false;
        }
    }
    
    updateAllRowButtonsToApplied() {
        const applyButtons = this.element.querySelectorAll('.row-action-btn.apply-change');
        const revertButtons = this.element.querySelectorAll('.row-action-btn.revert-change');
        
        applyButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('applied');
            btn.innerHTML = '<i class="fas fa-check-circle"></i>';
            btn.title = 'Applied';
        });
        
        revertButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('reverted');
            btn.innerHTML = '<i class="fas fa-undo"></i>';
            btn.title = 'Revert to original visibility';
        });
    }
    
    updateAllRowButtonsToReverted() {
        const applyButtons = this.element.querySelectorAll('.row-action-btn.apply-change');
        const revertButtons = this.element.querySelectorAll('.row-action-btn.revert-change');
        
        applyButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('applied');
            btn.innerHTML = '<i class="fas fa-check"></i>';
            btn.title = 'Apply visibility change';
        });
        
        revertButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('reverted');
            btn.innerHTML = '<i class="fas fa-undo-alt"></i>';
            btn.title = 'Reverted';
        });
    }
    
    updateRowButtonsToApplied(tokenId) {
        const applyButton = this.element.querySelector(`.row-action-btn.apply-change[data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`.row-action-btn.revert-change[data-token-id="${tokenId}"]`);
        
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
        const applyButton = this.element.querySelector(`.row-action-btn.apply-change[data-token-id="${tokenId}"]`);
        const revertButton = this.element.querySelector(`.row-action-btn.revert-change[data-token-id="${tokenId}"]`);
        
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
        
        if (applyAllButton && revertAllButton) {
            switch (this.bulkActionState) {
                case 'initial':
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                case 'applied':
                    applyAllButton.disabled = true;
                    revertAllButton.disabled = false;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Applied';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Revert All';
                    break;
                case 'reverted':
                    applyAllButton.disabled = false;
                    revertAllButton.disabled = true;
                    applyAllButton.innerHTML = '<i class="fas fa-check-circle"></i> Apply All';
                    revertAllButton.innerHTML = '<i class="fas fa-undo"></i> Reverted';
                    break;
            }
        }
    }
    
    addIconClickHandlers() {
        const stateIcons = this.element.querySelectorAll('.state-icon');
        stateIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                const targetId = event.currentTarget.dataset.target;
                const newState = event.currentTarget.dataset.state;
                
                const overrideIcons = event.currentTarget.closest('.override-icons');
                const allIcons = overrideIcons.querySelectorAll('.state-icon');
                allIcons.forEach(i => i.classList.remove('selected'));
                event.currentTarget.classList.add('selected');
                
                const hiddenInput = overrideIcons.querySelector('input[type="hidden"]');
                if (hiddenInput) hiddenInput.value = newState;
                
                const outcome = this.outcomes.find(o => o.target.id === targetId);
                if (outcome) {
                    outcome.overrideState = newState;
                    const currentVisibility = getVisibilityBetween(this.actorToken, outcome.target) || outcome.oldVisibility || outcome.currentVisibility;
                    outcome.changed = outcome.overrideState !== (outcome.oldVisibility || outcome.currentVisibility);
                    outcome.hasActionableChange = outcome.overrideState !== currentVisibility;
                    this.updateActionButtonsForToken(targetId, outcome.hasActionableChange);
                }
                
                this.changes = this.outcomes.filter(outcome => outcome.changed);
            });
        });
    }
    
    updateActionButtonsForToken(tokenId, hasActionableChange) {
        const row = this.element.querySelector(`tr[data-token-id="${tokenId}"]`);
        if (!row) return;
        
        const actionsCell = row.querySelector('.actions');
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
    }
}
