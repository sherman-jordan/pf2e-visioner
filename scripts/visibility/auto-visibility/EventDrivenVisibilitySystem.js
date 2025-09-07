/**
 * EventDrivenVisibilitySystem - Zero-delay event-driven visibility management
 * Uses zero-delay components with no artificial throttling
 * Relies purely on event batching and requestAnimationFrame for performance
 */

import { MODULE_ID } from '../../constants.js';
import { refreshEveryonesPerceptionOptimized } from '../../services/optimized-socket.js';
import { getVisibilityMap, setVisibilityBetween } from '../../stores/visibility-map.js';
import { optimizedVisibilityCalculator } from './VisibilityCalculator.js';

export class EventDrivenVisibilitySystem {
    /** @type {EventDrivenVisibilitySystem} */
    static #instance = null;

    /** @type {boolean} */
    #enabled = false;

    /** @type {Set<string>} - Tokens that have changed and affect others */
    #changedTokens = new Set();

    /** @type {Map<string, Object>} - Store updated token documents for position calculations */
    #updatedTokenDocs = new Map();

    /** @type {boolean} - Batch processing flag */
    #processingBatch = false;

    /** @type {number} - Count of processed updates for debugging */
    #updateCount = 0;

    /** @type {boolean} - Flag to prevent reacting to our own effect changes */
    #isUpdatingEffects = false;

    constructor() {
        if (EventDrivenVisibilitySystem.#instance) {
            return EventDrivenVisibilitySystem.#instance;
        }
        EventDrivenVisibilitySystem.#instance = this;
    }

    static getInstance() {
        if (!EventDrivenVisibilitySystem.#instance) {
            EventDrivenVisibilitySystem.#instance = new EventDrivenVisibilitySystem();
        }
        return EventDrivenVisibilitySystem.#instance;
    }

    /**
     * Initialize the system - self-contained with optimized components (ZERO DELAYS)
     */
    async initialize() {
        console.log(`${MODULE_ID} | Initializing EventDrivenVisibilitySystem - Zero Delays Architecture`);

        // Create core components
        const { LightingCalculator } = await import('./LightingCalculator.js');
        const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
        const { ConditionManager } = await import('./ConditionManager.js');
        const { ManualOverrideDetector } = await import('./ManualOverrideDetector.js');

        const lightingCalculator = LightingCalculator.getInstance();
        const visionAnalyzer = VisionAnalyzer.getInstance();
        const invisibilityManager = ConditionManager.getInstance();
        const manualOverrideDetector = ManualOverrideDetector.getInstance();

        // Initialize the optimized visibility calculator with the core components
        optimizedVisibilityCalculator.initialize(lightingCalculator, visionAnalyzer, invisibilityManager, manualOverrideDetector);

        this.#enabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');

        if (this.#enabled) {
            this.#registerEventListeners();
        }
    }

    /**
     * Register only the essential Foundry event listeners
     */
    #registerEventListeners() {
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        if (debugMode) {
            console.log(`${MODULE_ID} | Registering OPTIMIZED event listeners (zero-delay)`);
        }

        // Token events that affect visibility
        Hooks.on('updateToken', this.#onTokenUpdate.bind(this));
        Hooks.on('createToken', this.#onTokenCreate.bind(this));
        Hooks.on('deleteToken', this.#onTokenDelete.bind(this));

        // Lighting events
        Hooks.on('updateAmbientLight', this.#onLightUpdate.bind(this));
        Hooks.on('createAmbientLight', this.#onLightCreate.bind(this));
        Hooks.on('deleteAmbientLight', this.#onLightDelete.bind(this));

        // Wall events (affect line of sight)
        Hooks.on('updateWall', this.#onWallUpdate.bind(this));
        Hooks.on('createWall', this.#onWallCreate.bind(this));
        Hooks.on('deleteWall', this.#onWallDelete.bind(this));

        // Actor events (conditions, vision, etc.)
        Hooks.on('updateActor', this.#onActorUpdate.bind(this));
        Hooks.on('preUpdateActor', this.#onPreUpdateActor.bind(this));

        // Effect events (conditions are often implemented as effects)
        Hooks.on('createActiveEffect', this.#onEffectCreate.bind(this));
        Hooks.on('updateActiveEffect', this.#onEffectUpdate.bind(this));
        Hooks.on('deleteActiveEffect', this.#onEffectDelete.bind(this));

        // PF2e specific condition hooks if they exist
        Hooks.on('createItem', this.#onItemCreate.bind(this));
        Hooks.on('updateItem', this.#onItemUpdate.bind(this));
        Hooks.on('deleteItem', this.#onItemDelete.bind(this));

        // Additional equipment/feature changes that might affect vision
        Hooks.on('updateItem', this.#onEquipmentChange.bind(this));

        // Scene darkness changes
        Hooks.on('updateScene', this.#onSceneUpdate.bind(this));

        // Template changes (can affect lighting and vision)
        Hooks.on('createMeasuredTemplate', this.#onTemplateCreate.bind(this));
        Hooks.on('updateMeasuredTemplate', this.#onTemplateUpdate.bind(this));
        Hooks.on('deleteMeasuredTemplate', this.#onTemplateDelete.bind(this));
    }

    /**
     * Token position or properties changed
     */
    #onTokenUpdate(tokenDoc, changes) {
        if (!this.#enabled || !game.user.isGM) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        // Check what actually changed
        const positionChanged = changes.x !== undefined || changes.y !== undefined;
        const lightChanged = changes.light !== undefined;
        const visionChanged = changes.vision !== undefined;
        const effectsChanged = changes.effects !== undefined || changes.actorData !== undefined;

        const updateOnMovement = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnMovement');
        const updateOnLighting = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting');

        let shouldUpdate = false;

        if (positionChanged && updateOnMovement) {
            // Only update if movement is significant
            const distance = this.#getMovementDistance(tokenDoc, changes);
            const threshold = (canvas.grid?.size || 100) * 0.5;

            if (distance >= threshold) {
                shouldUpdate = true;
                if (debugMode) {
                    console.log(`${MODULE_ID} | OPTIMIZED: Token ${tokenDoc.name} moved ${distance.toFixed(1)}px - IMMEDIATE update`);
                }
            }
        }

        if ((lightChanged || visionChanged) && updateOnLighting) {
            shouldUpdate = true;
            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Token ${tokenDoc.name} vision/light changed - IMMEDIATE update`);
            }
        }

        if (effectsChanged) {
            shouldUpdate = true;
            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Token ${tokenDoc.name} effects changed - IMMEDIATE update`);
            }
        }

        if (shouldUpdate) {
            // Store the updated document for position calculations
            // Use the NEW coordinates from changes, fallback to current if not changed
            this.#updatedTokenDocs.set(tokenDoc.id, {
                id: tokenDoc.id,
                x: changes.x !== undefined ? changes.x : tokenDoc.x,
                y: changes.y !== undefined ? changes.y : tokenDoc.y,
                width: tokenDoc.width,
                height: tokenDoc.height,
                name: tokenDoc.name
            });
            this.#markTokenChangedImmediate(tokenDoc.id);
        }
    }

    /**
     * New token created - affects visibility with all other tokens
     */
    #onTokenCreate(tokenDoc) {
        if (!this.#enabled || !game.user.isGM) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Token ${tokenDoc.name} created - IMMEDIATE update`);
        }

        this.#markTokenChangedImmediate(tokenDoc.id);
    }

    /**
     * Token deleted - clean up its visibility relationships
     */
    #onTokenDelete(tokenDoc) {
        if (!this.#enabled || !game.user.isGM) return;

        // Clean up any pending changes for this token
        this.#changedTokens.delete(tokenDoc.id);

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Token ${tokenDoc.name} deleted - cleaned up`);
        }
    }

    /**
     * Light source changed - affects visibility for all tokens
     */
    #onLightUpdate(lightDoc, changes) {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        // Check what changed about the light
        const significantChange = changes.config !== undefined ||
            changes.x !== undefined ||
            changes.y !== undefined ||
            changes.disabled !== undefined ||
            changes.hidden !== undefined;

        if (significantChange) {
            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Light updated (${Object.keys(changes).join(', ')}) - IMMEDIATE update for all tokens`);
            }
            this.#markAllTokensChangedImmediate();
        }
    }

    #onLightCreate() {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Light created - IMMEDIATE update for all tokens`);
        }

        this.#markAllTokensChangedImmediate();
    }

    #onLightDelete() {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Light deleted - IMMEDIATE update for all tokens`);
        }

        this.#markAllTokensChangedImmediate();
    }

    /**
     * Wall changed - affects line of sight for all tokens
     */
    #onWallUpdate() {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Wall updated - IMMEDIATE update for all tokens`);
        }

        this.#markAllTokensChangedImmediate();
    }

    #onWallCreate() {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Wall created - IMMEDIATE update for all tokens`);
        }

        this.#markAllTokensChangedImmediate();
    }

    #onWallDelete() {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Wall deleted - IMMEDIATE update for all tokens`);
        }

        this.#markAllTokensChangedImmediate();
    }

    /**
     * Actor about to be updated - catch condition changes early
     */
    #onPreUpdateActor(actor, changes) {
        if (!this.#enabled || !game.user.isGM) return;

        // Ignore changes when we're updating effects to prevent feedback loops
        if (this.#isUpdatingEffects) {
            return;
        }

        // Check for condition-related changes
        const hasConditionChanges = changes.system?.conditions !== undefined ||
            changes.effects !== undefined ||
            changes.items !== undefined;

        if (hasConditionChanges) {
            const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) || [];

            if (tokens.length > 0) {
                const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
                if (debugMode) {
                    console.log(`${MODULE_ID} | PRE-UPDATE: Actor ${actor.name} conditions changing - IMMEDIATE update for ${tokens.length} tokens`);
                }

                tokens.forEach(token => this.#markTokenChangedImmediate(token.document.id));
            }
        }
    }

    /**
     * Actor updated - might affect vision capabilities or conditions
     */
    #onActorUpdate(actor) {
        if (!this.#enabled || !game.user.isGM) return;

        // Ignore changes when we're updating effects to prevent feedback loops
        if (this.#isUpdatingEffects) {
            return;
        }

        // Find tokens for this actor
        const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) || [];

        if (tokens.length > 0) {
            const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Actor ${actor.name} updated - IMMEDIATE update for ${tokens.length} tokens`);
            }

            tokens.forEach(token => this.#markTokenChangedImmediate(token.document.id));
        }
    }

    /**
     * Scene updated - might affect darkness level
     */
    #onSceneUpdate(scene, changes) {
        if (!this.#enabled || !game.user.isGM) return;

        // Check if darkness or lighting changed
        if (changes.darkness !== undefined || changes.environment !== undefined) {
            const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Scene darkness/environment updated - IMMEDIATE update for all tokens`);
            }

            this.#markAllTokensChangedImmediate();
        }
    }

    /**
     * Active Effect created - might be invisibility condition
     */
    #onEffectCreate(effect) {
        if (!this.#enabled || !game.user.isGM) return;
        this.#handleEffectChange(effect, 'created');
    }

    /**
     * Active Effect updated - might be invisibility condition
     */
    #onEffectUpdate(effect) {
        if (!this.#enabled || !game.user.isGM) return;
        this.#handleEffectChange(effect, 'updated');
    }

    /**
     * Active Effect deleted - might be invisibility condition
     */
    #onEffectDelete(effect) {
        if (!this.#enabled || !game.user.isGM) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | 🗑️ EFFECT DELETED: "${effect.name || effect.label}" from ${effect.parent?.name || 'unknown'}`);
        }

        this.#handleEffectChange(effect, 'deleted');
    }

    /**
     * Item created - might be condition in PF2e
     */
    #onItemCreate(item) {
        if (!this.#enabled || !game.user.isGM) return;
        this.#handleItemChange(item, 'created');
    }

    /**
     * Item updated - might be condition in PF2e
     */
    #onItemUpdate(item) {
        if (!this.#enabled || !game.user.isGM) return;
        this.#handleItemChange(item, 'updated');
    }

    /**
     * Item deleted - might be condition in PF2e
     */
    #onItemDelete(item) {
        if (!this.#enabled || !game.user.isGM) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | 🗑️ ITEM DELETED: "${item.name}" (type: ${item.type}) from ${item.parent?.name || 'unknown'}`);
        }

        this.#handleItemChange(item, 'deleted');
    }

    /**
     * Handle effect changes that might affect visibility
     */
    #handleEffectChange(effect, action) {
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        // Debug: Always log effect changes to see what we're missing
        if (debugMode) {
            console.log(`${MODULE_ID} | EFFECT ${action.toUpperCase()}: "${effect.name || effect.label}" on ${effect.parent?.name || 'unknown'}`);
        }

        // Check if this effect is related to invisibility, vision, or conditions that affect sight
        const effectName = effect.name?.toLowerCase() || effect.label?.toLowerCase() || '';
        const isVisibilityRelated = effectName.includes('invisible') ||
            effectName.includes('hidden') ||
            effectName.includes('concealed') ||
            effectName.includes('blinded') ||
            effectName.includes('dazzled') ||
            effectName.includes('vision') ||
            effectName.includes('darkvision') ||
            effectName.includes('low-light') ||
            effectName.includes('see') ||
            effectName.includes('sight') ||
            effectName.includes('detect') ||
            effectName.includes('blind') ||
            effectName.includes('deaf') ||
            effectName.includes('light') ||
            effectName.includes('darkness') ||
            effectName.includes('continual flame') ||
            effectName.includes('dancing lights') ||
            effectName.includes('true seeing');

        if (isVisibilityRelated && effect.parent?.documentName === 'Actor') {
            const actor = effect.parent;
            const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) || [];

            if (tokens.length > 0) {
                if (debugMode) {
                    console.log(`${MODULE_ID} | VISIBILITY TRIGGER: EFFECT ${action.toUpperCase()} "${effectName}" on ${actor.name} - IMMEDIATE update for ${tokens.length} tokens`);
                }

                tokens.forEach(token => this.#markTokenChangedImmediate(token.document.id));
            }
        }
    }

    /**
     * Handle item changes that might affect visibility (PF2e conditions)
     */
    #handleItemChange(item, action) {
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        // Debug: Always log item changes to see what we're missing
        if (debugMode) {
            console.log(`${MODULE_ID} | ITEM ${action.toUpperCase()}: "${item.name}" (type: ${item.type}) on ${item.parent?.name || 'unknown'}`);
        }

        // In PF2e, conditions might be items, but also spells and effects
        const itemName = item.name?.toLowerCase() || '';
        const itemType = item.type?.toLowerCase() || '';

        // Expand the types that might affect visibility
        const isRelevantType = itemType === 'condition' ||
            itemType === 'effect' ||
            itemType === 'spell' ||
            itemType === 'feat' ||
            itemType === 'action';

        const isVisibilityRelated = itemName.includes('invisible') ||
            itemName.includes('hidden') ||
            itemName.includes('concealed') ||
            itemName.includes('blinded') ||
            itemName.includes('dazzled') ||
            itemName.includes('vision') ||
            itemName.includes('darkvision') ||
            itemName.includes('low-light') ||
            itemName.includes('light') ||
            itemName.includes('darkness') ||
            itemName.includes('see invisibility') ||
            itemName.includes('true seeing') ||
            itemName.includes('dancing lights') ||
            itemName.includes('continual flame');

        if (isRelevantType && isVisibilityRelated && item.parent?.documentName === 'Actor') {
            const actor = item.parent;
            const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) || [];

            if (tokens.length > 0) {
                if (debugMode) {
                    console.log(`${MODULE_ID} | VISIBILITY TRIGGER: ${action.toUpperCase()} "${itemName}" (${itemType}) on ${actor.name} - IMMEDIATE update for ${tokens.length} tokens`);
                }

                tokens.forEach(token => this.#markTokenChangedImmediate(token.document.id));
            }
        }
    }

    /**
     * Mark a token as changed - triggers IMMEDIATE processing with fresh coordinates
     */
    #markTokenChangedImmediate(tokenId) {
        this.#changedTokens.add(tokenId);

        // Use requestAnimationFrame for immediate processing with fresh coordinates from #updatedTokenDocs
        if (!this.#processingBatch) {
            requestAnimationFrame(() => this.#processBatch());
        }
    }

    /**
     * Mark all tokens as needing recalculation - triggers IMMEDIATE processing
     */
    #markAllTokensChangedImmediate() {
        const tokens = canvas.tokens?.placeables || [];
        tokens.forEach(token => {
            if (token.actor) {
                this.#changedTokens.add(token.document.id);
            }
        });

        if (!this.#processingBatch) {
            requestAnimationFrame(() => this.#processBatch());
        }
    }

    /**
     * Process all accumulated changes in a single batch - IMMEDIATE processing
     */
    async #processBatch() {
        if (this.#processingBatch || this.#changedTokens.size === 0) return;

        this.#processingBatch = true;

        try {
            const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
            const startTime = performance.now();

            if (debugMode) {
                console.log(`${MODULE_ID} | OPTIMIZED: Processing visibility batch IMMEDIATELY: ${this.#changedTokens.size} changed tokens`);
            }

            const allTokens = canvas.tokens?.placeables?.filter(t => t.actor) || [];
            const updates = [];

            // For each changed token, recalculate visibility with all other tokens
            for (const changedTokenId of this.#changedTokens) {
                const changedToken = allTokens.find(t => t.document.id === changedTokenId);
                if (!changedToken) continue;

                for (const otherToken of allTokens) {
                    if (otherToken.document.id === changedTokenId) continue;

                    // Get the actual current position for the changed token
                    const changedTokenPosition = this.#getTokenPosition(changedToken);
                    const otherTokenPosition = this.#getTokenPosition(otherToken);

                    // Calculate visibility in both directions using optimized calculator
                    // Pass position overrides to ensure we use the latest coordinates
                    const visibility1 = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                        changedToken, otherToken, changedTokenPosition, otherTokenPosition
                    );
                    const visibility2 = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                        otherToken, changedToken, otherTokenPosition, changedTokenPosition
                    );

                    // Check for manual overrides using optimized calculator
                    const hasOverride1 = await optimizedVisibilityCalculator.hasManualOverride(changedToken, otherToken);
                    const hasOverride2 = await optimizedVisibilityCalculator.hasManualOverride(otherToken, changedToken);

                    // Only update if visibility changed and no manual override
                    const currentVisibility1 = getVisibilityMap(changedToken)[otherToken.document.id] || 'observed';
                    const currentVisibility2 = getVisibilityMap(otherToken)[changedToken.document.id] || 'observed';

                    // Enhanced debugging to show calculated vs current values
                    if (debugMode) { // Always show for now to debug the issue
                        console.log(`${MODULE_ID} | VISIBILITY CHECK: ${changedToken.name} → ${otherToken.name}`);
                        console.log(`  Calculated: ${visibility1}, Current: ${currentVisibility1}, Override: ${hasOverride1}`);
                        console.log(`${MODULE_ID} | VISIBILITY CHECK: ${otherToken.name} → ${changedToken.name}`);
                        console.log(`  Calculated: ${visibility2}, Current: ${currentVisibility2}, Override: ${hasOverride2}`);
                    }

                    if (visibility1 !== currentVisibility1 && !hasOverride1) {
                        console.log(`${MODULE_ID} | UPDATING: ${changedToken.name} → ${otherToken.name} from ${currentVisibility1} to ${visibility1}`);
                        updates.push({ observer: changedToken, target: otherToken, visibility: visibility1 });
                    }

                    if (visibility2 !== currentVisibility2 && !hasOverride2) {
                        console.log(`${MODULE_ID} | UPDATING: ${otherToken.name} → ${changedToken.name} from ${currentVisibility2} to ${visibility2}`);
                        updates.push({ observer: otherToken, target: changedToken, visibility: visibility2 });
                    }
                }
            }

            // Apply all updates immediately
            if (updates.length > 0) {
                const processingTime = performance.now() - startTime;

                if (debugMode) {
                    console.log(`${MODULE_ID} | OPTIMIZED: Applying ${updates.length} visibility updates IMMEDIATELY (calculated in ${processingTime.toFixed(1)}ms)`);

                    const hiddenUpdates = updates.filter(u => u.visibility === 'hidden');
                    if (hiddenUpdates.length > 0) {
                        console.log(`${MODULE_ID} | OPTIMIZED: Setting ${hiddenUpdates.length} tokens to hidden`);
                    }
                }

                for (const update of updates) {
                    setVisibilityBetween(update.observer, update.target, update.visibility, { isAutomatic: true });
                }

                // Refresh perception once for all updates - IMMEDIATELY
                refreshEveryonesPerceptionOptimized();

                this.#updateCount += updates.length;
            }

            // Clear processed changes
            this.#changedTokens.clear();
            this.#updatedTokenDocs.clear();

            if (debugMode) {
                const totalTime = performance.now() - startTime;
                console.log(`${MODULE_ID} | OPTIMIZED: Batch completed in ${totalTime.toFixed(1)}ms (total updates: ${this.#updateCount})`);
            }

        } finally {
            this.#processingBatch = false;
        }
    }

    /**
     * Calculate movement distance for threshold checking
     */
    #getMovementDistance(tokenDoc, changes) {
        const currentX = tokenDoc.x || 0;
        const currentY = tokenDoc.y || 0;
        const newX = changes.x !== undefined ? changes.x : currentX;
        const newY = changes.y !== undefined ? changes.y : currentY;

        return Math.sqrt(Math.pow(newX - currentX, 2) + Math.pow(newY - currentY, 2));
    }

    /**
     * Get the actual position for a token, using updated coordinates if available
     */
    #getTokenPosition(token) {
        const updatedDoc = this.#updatedTokenDocs.get(token.document.id);
        if (updatedDoc) {
            // Use updated coordinates
            return {
                x: updatedDoc.x + (updatedDoc.width * canvas.grid.size) / 2,
                y: updatedDoc.y + (updatedDoc.height * canvas.grid.size) / 2
            };
        } else {
            // Fallback to current document
            return {
                x: token.document.x + (token.document.width * canvas.grid.size) / 2,
                y: token.document.y + (token.document.height * canvas.grid.size) / 2
            };
        }
    }

    /**
     * Enable the system
     */
    enable() {
        if (this.#enabled) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED system enabled - zero delays, immediate processing`);
        }

        this.#enabled = true;
        this.#registerEventListeners();

        // Initial full calculation - immediate
        this.#markAllTokensChangedImmediate();
    }

    /**
     * Disable the system
     */
    disable() {
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED system disabled`);
        }

        this.#enabled = false;

        // Clear all pending changes
        this.#changedTokens.clear();
    }

    /**
     * Force recalculation of all visibility (for manual triggers) - IMMEDIATE
     */
    recalculateAll() {
        if (!this.#enabled) return;

        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode) {
            console.log(`${MODULE_ID} | OPTIMIZED: Manual recalculation triggered - IMMEDIATE processing`);
        }

        this.#markAllTokensChangedImmediate();
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            enabled: this.#enabled,
            changedTokens: this.#changedTokens.size,
            processingBatch: this.#processingBatch,
            totalUpdates: this.#updateCount,
            optimized: true,
            description: 'Zero-delay event-driven visibility system'
        };
    }

    /**
     * Set the updating effects flag to prevent feedback loops
     * @param {boolean} isUpdating - Whether effects are being updated
     */
    _setUpdatingEffects(isUpdating) {
        this.#isUpdatingEffects = isUpdating;
    }

    /**
     * Force recalculation of all token visibility
     * @param {boolean} force - Force recalculation even if recently done
     */
    async recalculateAllVisibility(force = false) {
        if (!this.#enabled && !force) return;

        const tokens = canvas.tokens?.placeables || [];
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

        if (debugMode) {
            console.log(`${MODULE_ID} | 🔄 RECALCULATING ALL VISIBILITY (${tokens.length} tokens, force=${force})`);
        }

        // Process all tokens in a single batch
        for (const token of tokens) {
            this.#changedTokens.add(token.id);
        }

        await this.#processBatch();
    }

    /**
     * Calculate visibility between two tokens using optimized calculator
     * @param {Token} observer - The observing token
     * @param {Token} target - The target token
     * @returns {Promise<string>} Visibility state
     */
    async calculateVisibility(observer, target) {
        return await optimizedVisibilityCalculator.calculateVisibility(observer, target);
    }

    /**
     * Get visibility debug information between two tokens
     * @param {Token} observer - The observing token
     * @param {Token} target - The target token
     * @returns {Promise<Object>} Debug information
     */
    async getVisibilityDebugInfo(observer, target) {
        return await optimizedVisibilityCalculator.getDebugInfo(observer, target);
    }

    /**
     * Handle equipment changes that might affect vision capabilities
     */
    #onEquipmentChange(item, changes) {
        if (!this.#enabled || !game.user.isGM) return;

        // Check if this is equipment that might affect vision
        const itemName = item.name?.toLowerCase() || '';
        const itemType = item.type?.toLowerCase() || '';

        const isVisionEquipment = itemType === 'equipment' && (
            itemName.includes('goggles') ||
            itemName.includes('glasses') ||
            itemName.includes('lens') ||
            itemName.includes('vision') ||
            itemName.includes('sight') ||
            itemName.includes('eye') ||
            changes.system?.equipped !== undefined // Equipment state changed
        );

        if (isVisionEquipment && item.parent?.documentName === 'Actor') {
            const actor = item.parent;
            const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) || [];

            if (tokens.length > 0) {
                const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
                if (debugMode) {
                    console.log(`${MODULE_ID} | EQUIPMENT CHANGE: ${itemName} on ${actor.name} - IMMEDIATE update for ${tokens.length} tokens`);
                }

                tokens.forEach(token => this.#markTokenChangedImmediate(token.document.id));
            }
        }
    }

    /**
     * Handle template creation (might affect lighting)
     */
    #onTemplateCreate(template) {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        // Check if this template might affect visibility (light spells, darkness, etc.)
        const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
        const isLightTemplate = templateName.includes('light') ||
            templateName.includes('darkness') ||
            templateName.includes('shadow');

        if (isLightTemplate) {
            const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
            if (debugMode) {
                console.log(`${MODULE_ID} | TEMPLATE CREATED: ${templateName} - IMMEDIATE update for all tokens`);
            }
            this.#markAllTokensChangedImmediate();
        }
    }

    /**
     * Handle template updates (might affect lighting)
     */
    #onTemplateUpdate(template, changes) {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        // Check if position or configuration changed
        const significantChange = changes.x !== undefined ||
            changes.y !== undefined ||
            changes.config !== undefined ||
            changes.hidden !== undefined;

        if (significantChange) {
            const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
            const isLightTemplate = templateName.includes('light') ||
                templateName.includes('darkness') ||
                templateName.includes('shadow');

            if (isLightTemplate) {
                const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
                if (debugMode) {
                    console.log(`${MODULE_ID} | TEMPLATE UPDATED: ${templateName} - IMMEDIATE update for all tokens`);
                }
                this.#markAllTokensChangedImmediate();
            }
        }
    }

    /**
     * Handle template deletion (might affect lighting)
     */
    #onTemplateDelete(template) {
        if (!this.#enabled || !game.user.isGM) return;
        if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

        const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
        const isLightTemplate = templateName.includes('light') ||
            templateName.includes('darkness') ||
            templateName.includes('shadow');

        if (isLightTemplate) {
            const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
            if (debugMode) {
                console.log(`${MODULE_ID} | TEMPLATE DELETED: ${templateName} - IMMEDIATE update for all tokens`);
            }
            this.#markAllTokensChangedImmediate();
        }
    }
}

// Export singleton instance
export const eventDrivenVisibilitySystem = EventDrivenVisibilitySystem.getInstance();
