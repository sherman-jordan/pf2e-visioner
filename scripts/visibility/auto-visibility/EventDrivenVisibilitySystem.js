/**
 * EventDrivenVisibilitySystem - Zero-delay event-driven visibility management
 * Uses zero-delay components with no artificial throttling
 * Relies purely on event batching and requestAnimationFrame for performance
 */

import { MODULE_ID } from '../../constants.js';
import { refreshEveryonesPerceptionOptimized } from '../../services/optimized-socket.js';
import { getVisibilityMap, setVisibilityBetween } from '../../stores/visibility-map.js';
import { optimizedVisibilityCalculator } from './VisibilityCalculator.js';
import AvsOverrideManager from '../../chat/services/infra/avs-override-manager.js';
import { optimizedPerceptionManager } from './PerceptionManager.js';

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

  // AVS Override Management
  /** @type {Map<string, Object>} - Active overrides by "observerId-targetId" key */
  #activeOverrides = new Map();

  // Override Validation for Token Movement
  /** @type {Set<string>} - Tokens queued for override validation */
  #tokensQueuedForValidation = new Set();

  /** @type {number} - Timeout ID for batched override validation */
  #validationTimeoutId = null;

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
    // Removed debug log

    // Create core components
    const { LightingCalculator } = await import('./LightingCalculator.js');
    const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
    const { ConditionManager } = await import('./ConditionManager.js');

    const lightingCalculator = LightingCalculator.getInstance();
    const visionAnalyzer = VisionAnalyzer.getInstance();
    const invisibilityManager = ConditionManager.getInstance();

    // Initialize the optimized visibility calculator with the core components
    optimizedVisibilityCalculator.initialize(
      lightingCalculator,
      visionAnalyzer,
      invisibilityManager,
    );

    this.#enabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');

    if (this.#enabled) {
      this.#registerEventListeners();
    }
  }

  /**
   * Register only the essential Foundry event listeners
   */
  #registerEventListeners() {
    // Removed debug log

    // Token events that affect visibility
    Hooks.on('updateToken', this.#onTokenUpdate.bind(this));
    Hooks.on('createToken', this.#onTokenCreate.bind(this));
    Hooks.on('deleteToken', this.#onTokenDelete.bind(this));

  // AVS Override Management Hook is centralized in AvsOverrideManager
  try { AvsOverrideManager.registerHooks(); } catch {}

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

    // Skip if token is Foundry hidden (either before or after the update)
    // Exception: Allow processing for sneaking tokens even when hidden
    // const wasHidden = tokenDoc.hidden;
    // const isHidden = changes.hidden !== undefined ? changes.hidden : tokenDoc.hidden;
    const isSneaking = tokenDoc.getFlag('pf2e-visioner', 'sneak-active');
    
    // Removed skip logic for Foundry hidden tokens to test if it's related to the issue
    // if ((wasHidden || isHidden) && !isSneaking) {
    //   console.log('PF2E Visioner | AVS Skipping hidden token (not sneaking):', tokenDoc.name);
    //   return;
    // }

    // Check what actually changed
    const positionChanged = changes.x !== undefined || changes.y !== undefined;
    const lightChanged = changes.light !== undefined;
    const visionChanged = changes.vision !== undefined;
    const effectsChanged =
      changes.actorData?.effects !== undefined || changes.actorData !== undefined;

    const updateOnMovement = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnMovement');
    const updateOnLighting = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting');

    let shouldUpdate = false;

    if (positionChanged && updateOnMovement) {
      // For sneaking tokens, always update regardless of distance
      // For other tokens, only update if movement is significant
      if (isSneaking) {
        shouldUpdate = true;
      } else {
        const distance = this.#getMovementDistance(tokenDoc, changes);
        const threshold = (canvas.grid?.size || 100) * 0.5;

        if (distance >= threshold) {
          shouldUpdate = true;
        }
      }
    }

    if ((lightChanged || visionChanged) && updateOnLighting) {
      shouldUpdate = true;
      // Removed debug log
    }

    if (effectsChanged) {
      shouldUpdate = true;
      // Removed debug log
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
        name: tokenDoc.name,
      });
      this.#markTokenChangedImmediate(tokenDoc.id);

      // Queue override validation if position changed
      if (positionChanged) {
        console.log('PF2E Visioner | Token moved, queueing override validation:', tokenDoc.name);
        this.#queueOverrideValidation(tokenDoc.id);
      }
    }
  }

  /**
   * New token created - affects visibility with all other tokens
   */
  #onTokenCreate(tokenDoc) {
    if (!this.#enabled || !game.user.isGM) return;


    // Removed debug log

    this.#markTokenChangedImmediate(tokenDoc.id);
  }

  /**
   * Token deleted - clean up its visibility relationships
   */
  #onTokenDelete(tokenDoc) {
    if (!this.#enabled || !game.user.isGM) return;

    // Clean up any pending changes for this token
    this.#changedTokens.delete(tokenDoc.id);

    // Removed debug log
  }

  /**
   * Light source changed - affects visibility for all tokens
   */
  #onLightUpdate(lightDoc, changes) {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Check what changed about the light
    const significantChange =
      changes.config !== undefined ||
      changes.x !== undefined ||
      changes.y !== undefined ||
      changes.disabled !== undefined ||
      changes.hidden !== undefined;

    if (significantChange) {
      // Removed debug log
      this.#markAllTokensChangedImmediate();
    }
  }

  #onLightCreate() {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  #onLightDelete() {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  /**
   * Wall changed - affects line of sight for all tokens
   */
  #onWallUpdate() {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  #onWallCreate() {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Removed debug log

    this.#markAllTokensChangedImmediate();
  }

  #onWallDelete() {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Removed debug log

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
    const hasConditionChanges =
      changes.system?.conditions !== undefined ||
      changes.actorData?.effects !== undefined ||
      changes.items !== undefined;

    if (hasConditionChanges) {
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && (!t.document.hidden || t.document.getFlag('pf2e-visioner', 'sneak-active'))) || [];
      
      console.log('PF2E Visioner | AVS Actor Update - Token Filtering:', {
        actorId: actor.id,
        actorName: actor.name,
        totalTokens: canvas.tokens?.placeables?.length || 0,
        filteredTokens: tokens.length,
        tokenDetails: tokens.map(t => ({
          id: t.document.id,
          name: t.document.name,
          hidden: t.document.hidden,
          isSneaking: t.document.getFlag('pf2e-visioner', 'sneak-active')
        }))
      });

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
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

    // Find tokens for this actor - skip hidden tokens
    const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && (!t.document.hidden || t.document.getFlag('pf2e-visioner', 'sneak-active'))) || [];

    if (tokens.length > 0) {
      // Removed debug log

      tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
    }
  }

  /**
   * Scene updated - might affect darkness level
   */
  #onSceneUpdate(scene, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    // Check if darkness level or other lighting changed (FoundryVTT v13+ compatibility)
    const darknessChanged = changes.environment?.darknessLevel !== undefined || changes.darkness !== undefined;
    if (darknessChanged || changes.environment !== undefined) {
      // Removed debug log

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

    // Removed debug log

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

    // Removed debug log

    this.#handleItemChange(item, 'deleted');
  }

  /**
   * Handle effect changes that might affect visibility
   */
  #handleEffectChange(effect) {
    // Removed debug log

    // Check if this effect is related to invisibility, vision, or conditions that affect sight
    const effectName = effect.name?.toLowerCase() || effect.label?.toLowerCase() || '';
    const isVisibilityRelated =
      effectName.includes('invisible') ||
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
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && (!t.document.hidden || t.document.getFlag('pf2e-visioner', 'sneak-active'))) || [];
      
      console.log('PF2E Visioner | AVS Actor Update - Token Filtering:', {
        actorId: actor.id,
        actorName: actor.name,
        totalTokens: canvas.tokens?.placeables?.length || 0,
        filteredTokens: tokens.length,
        tokenDetails: tokens.map(t => ({
          id: t.document.id,
          name: t.document.name,
          hidden: t.document.hidden,
          isSneaking: t.document.getFlag('pf2e-visioner', 'sneak-active')
        }))
      });

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  /**
   * Handle item changes that might affect visibility (PF2e conditions)
   */
  #handleItemChange(item) {
    // Removed debug log

    // In PF2e, conditions might be items, but also spells and effects
    const itemName = item.name?.toLowerCase() || '';
    const itemType = item.type?.toLowerCase() || '';

    // Expand the types that might affect visibility
    const isRelevantType =
      itemType === 'condition' ||
      itemType === 'effect' ||
      itemType === 'spell' ||
      itemType === 'feat' ||
      itemType === 'action';

    const isVisibilityRelated =
      itemName.includes('invisible') ||
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
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && (!t.document.hidden || t.document.getFlag('pf2e-visioner', 'sneak-active'))) || [];
      
      console.log('PF2E Visioner | AVS Actor Update - Token Filtering:', {
        actorId: actor.id,
        actorName: actor.name,
        totalTokens: canvas.tokens?.placeables?.length || 0,
        filteredTokens: tokens.length,
        tokenDetails: tokens.map(t => ({
          id: t.document.id,
          name: t.document.name,
          hidden: t.document.hidden,
          isSneaking: t.document.getFlag('pf2e-visioner', 'sneak-active')
        }))
      });

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  /**
   * Mark a token as changed - triggers IMMEDIATE processing with fresh coordinates
   */
  #markTokenChangedImmediate(tokenId) {
    const token = canvas.tokens?.get(tokenId);

    console.log('PF2E Visioner | AVS Marking token for change:', {
      tokenId,
      tokenName: token?.document?.name,
      hidden: token?.document?.hidden,
      isSneaking: token?.document?.getFlag('pf2e-visioner', 'sneak-active')
    });

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
    const sneakingTokens = [];
    
    tokens.forEach((token) => {
      if (token.actor && (!token.document.hidden || token.document.getFlag('pf2e-visioner', 'sneak-active'))) {
        this.#changedTokens.add(token.document.id);
        if (token.document.getFlag('pf2e-visioner', 'sneak-active')) {
          sneakingTokens.push({
            id: token.document.id,
            name: token.document.name,
            hidden: token.document.hidden
          });
        }
      }
    });

    console.log('PF2E Visioner | AVS Marking all tokens for change:', {
      totalTokens: tokens.length,
      changedTokens: this.#changedTokens.size,
      sneakingTokens
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
      // Add a small delay only if there are sneaking tokens active to allow override flags to be set
      // This prevents race conditions where dual-system sets flags but AVS processes before they take effect
      const hasSneakingTokens = Array.from(this.#changedTokens).some(tokenId => {
        const token = canvas.tokens?.get(tokenId);
        return token?.document?.getFlag('pf2e-visioner', 'sneak-active');
      });
      
      if (hasSneakingTokens) {
        await new Promise(resolve => setTimeout(resolve, 25)); // Reduced delay, only when needed
      }

      // Removed debug log
      // const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      // const startTime = performance.now();

      // Always include sneaking tokens, even if they're hidden by Foundry
      const allTokens = canvas.tokens?.placeables?.filter((t) => {
        if (!t.actor) return false;
        
        // Include visible tokens
        if (!t.document.hidden) return true;
        
        // Include sneaking tokens even if hidden
        if (t.document.getFlag('pf2e-visioner', 'sneak-active')) return true;
        
        return false;
      }) || [];
      const updates = [];

      console.log('PF2E Visioner | AVS Processing Batch:', {
        changedTokens: Array.from(this.#changedTokens),
        allTokensCount: allTokens.length,
        allTokensDetails: allTokens.map(t => ({
          id: t.document.id,
          name: t.document.name,
          hidden: t.document.hidden,
          isSneaking: t.document.getFlag('pf2e-visioner', 'sneak-active')
        }))
      });

      // For each changed token, recalculate visibility with all other tokens
      for (const changedTokenId of this.#changedTokens) {
        const changedToken = allTokens.find((t) => t.document.id === changedTokenId);
        if (!changedToken) {
          console.log('PF2E Visioner | AVS Changed token not found in allTokens:', changedTokenId);
          continue;
        }
        
        console.log('PF2E Visioner | AVS Processing changed token:', {
          id: changedToken.document.id,
          name: changedToken.document.name,
          hidden: changedToken.document.hidden,
          isSneaking: changedToken.document.getFlag('pf2e-visioner', 'sneak-active')
        });

        // Process visibility with all other tokens
        for (const otherToken of allTokens) {
          if (otherToken.document.id === changedTokenId) continue;



          let effectiveVisibility1, effectiveVisibility2;

          // Check for visibility overrides before calculating
          let hasOverride1 = false;
          let hasOverride2 = false;
          
          try {
            // Check for active AVS overrides first (new system)
            const avsOverride1 = this.#getActiveOverride(changedToken.document.id, otherToken.document.id);
            const avsOverride2 = this.#getActiveOverride(otherToken.document.id, changedToken.document.id);
            
            if (avsOverride1) {
              effectiveVisibility1 = avsOverride1.state;
              hasOverride1 = true;
              console.log('PF2E Visioner | ✅ AVS Using new override system:', {
                from: changedToken.document.name,
                to: otherToken.name,
                overrideState: avsOverride1.state,
                source: avsOverride1.source,
                remainingMinutes: Math.round((avsOverride1.expiryTime - Date.now()) / (1000 * 60))
              });
            } else {
              // Fallback to old flag-based system for compatibility
              const override1FlagKey = `avs-override-from-${changedToken.document.id}`;
              const override1Flag = otherToken.document.getFlag('pf2e-visioner', override1FlagKey);
              
              hasOverride1 = !!override1Flag;
              
              if (hasOverride1) {
                effectiveVisibility1 = override1Flag.state;
                console.log('PF2E Visioner | ✅ AVS Using flag override:', {
                  from: changedToken.document.name,
                  to: otherToken.name,
                  overrideState: override1Flag.state,
                  source: override1Flag.source
                });
              }
            }
            
            if (avsOverride2) {
              effectiveVisibility2 = avsOverride2.state;
              hasOverride2 = true;
              console.log('PF2E Visioner | ✅ AVS Using new override system:', {
                from: otherToken.name,
                to: changedToken.document.name,
                overrideState: avsOverride2.state,
                source: avsOverride2.source,
                remainingMinutes: Math.round((avsOverride2.expiryTime - Date.now()) / (1000 * 60))
              });
            } else {
              // Fallback to old flag-based system for compatibility
              const override2FlagKey = `avs-override-from-${otherToken.document.id}`;
              const override2Flag = changedToken.document.getFlag('pf2e-visioner', override2FlagKey);
              
              hasOverride2 = !!override2Flag;
              
              if (hasOverride2) {
                effectiveVisibility2 = override2Flag.state;
                console.log('PF2E Visioner | ✅ AVS Using flag override:', {
                  from: otherToken.name,
                  to: changedToken.document.name,
                  overrideState: override2Flag.state,
                  source: override2Flag.source
                });
              }
            }
            
          } catch (overrideError) {
            console.warn('PF2E Visioner | Failed to check visibility overrides:', overrideError);
          }

          // Only calculate visibility if we don't have overrides
          if (!hasOverride1 || !hasOverride2) {
            const changedTokenPosition = this.#getTokenPosition(changedToken);
            const otherTokenPosition = this.#getTokenPosition(otherToken);

            // Calculate visibility in both directions using optimized calculator
            // Pass position overrides to ensure we use the latest coordinates
            console.log('PF2E Visioner | AVS Calculating visibility:', {
              from: changedToken.document.name,
              to: otherToken.name,
              fromPosition: changedTokenPosition,
              toPosition: otherTokenPosition,
              hasOverride1,
              hasOverride2
            });
            
            if (!hasOverride1) {
              const visibility1 = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                changedToken,
                otherToken,
                changedTokenPosition,
                otherTokenPosition,
              );
              effectiveVisibility1 = visibility1;
            }
            
            if (!hasOverride2) {
              const visibility2 = await optimizedVisibilityCalculator.calculateVisibilityWithPosition(
                otherToken,
                changedToken,
                otherTokenPosition,
                changedTokenPosition,
              );
              effectiveVisibility2 = visibility2;
            }
            
            console.log('PF2E Visioner | AVS Visibility results:', {
              from: changedToken.document.name,
              to: otherToken.name,
              visibility1: effectiveVisibility1,
              visibility2: effectiveVisibility2,
              hasOverride1,
              hasOverride2
            });
          }
            
          // Check if this is a sneaking token and log the result
          if (changedToken.document.getFlag('pf2e-visioner', 'sneak-active')) {
            console.log('PF2E Visioner | 🥷 SNEAKING TOKEN AVS RESULT:', {
              sneakingToken: changedToken.document.name,
              toToken: otherToken.name,
              calculatedVisibility: effectiveVisibility1,
              shouldBeConcealed: effectiveVisibility1 === 'concealed',
              wasOverridden: hasOverride1
            });
          }
          

          // Only update if visibility changed
          const currentVisibility1 =
            getVisibilityMap(changedToken)[otherToken.document.id] || 'observed';
          const currentVisibility2 =
            getVisibilityMap(otherToken)[changedToken.document.id] || 'observed';

          // Log current vs calculated visibility for sneaking tokens
          if (changedToken.document.getFlag('pf2e-visioner', 'sneak-active')) {
            const visibilityMap = getVisibilityMap(changedToken);
            const otherVisibilityMap = getVisibilityMap(otherToken);
            console.log('PF2E Visioner | 🥷 VISIBILITY COMPARISON:', {
              sneakingToken: changedToken.document.name,
              toToken: otherToken.name,
              currentVisibility: currentVisibility1,
              calculatedVisibility: effectiveVisibility1,
              isDifferent: currentVisibility1 !== effectiveVisibility1,
              sneakingTokenVisibilityMap: visibilityMap,
              otherTokenVisibilityMap: otherVisibilityMap,
              // Add debug info about the visibility map state
              hasVisibilityMapEntry: otherToken.document.id in visibilityMap,
              visibilityMapKeys: Object.keys(visibilityMap),
              otherTokenId: otherToken.document.id
            });
            
            // Also log the reverse direction
            console.log('PF2E Visioner | 🥷 REVERSE VISIBILITY COMPARISON:', {
              fromToken: otherToken.name,
              toSneakingToken: changedToken.document.name,
              currentVisibility: currentVisibility2,
              calculatedVisibility: effectiveVisibility2,
              isDifferent: currentVisibility2 !== effectiveVisibility2
            });
          }

          // Removed debug log

          // Only generate updates if overrides are not present
          // When overrides are present, the dual-system has already applied the visibility
          // and we should not interfere with it
          if (!hasOverride1 && effectiveVisibility1 !== currentVisibility1) {
            console.log('PF2E Visioner | ✅ UPDATE WILL BE APPLIED:', {
              from: changedToken.document.name,
              to: otherToken.name,
              currentVisibility: currentVisibility1,
              newVisibility: effectiveVisibility1,
              hasOverride: !!hasOverride1
            });
            updates.push({
              observer: changedToken,
              target: otherToken,
              visibility: effectiveVisibility1,
            });
            
            // Log if this is a sneaking token
            if (changedToken.document.getFlag('pf2e-visioner', 'sneak-active')) {
              console.log('PF2E Visioner | 🥷 STORING SNEAKING TOKEN VISIBILITY CHANGE:', {
                sneakingToken: changedToken.document.name,
                toToken: otherToken.name,
                oldVisibility: currentVisibility1,
                newVisibility: effectiveVisibility1
              });
            }
          } else {
            console.log('PF2E Visioner | ❌ UPDATE SKIPPED:', {
              from: changedToken.document.name,
              to: otherToken.name,
              currentVisibility: currentVisibility1,
              calculatedVisibility: effectiveVisibility1,
              hasOverride: !!hasOverride1,
              reason: hasOverride1 ? 'override_present' : 'visibility_unchanged'
            });
          }

          if (!hasOverride2 && effectiveVisibility2 !== currentVisibility2) {
            console.log('PF2E Visioner | ✅ REVERSE UPDATE WILL BE APPLIED:', {
              from: otherToken.name,
              to: changedToken.document.name,
              currentVisibility: currentVisibility2,
              newVisibility: effectiveVisibility2,
              hasOverride: !!hasOverride2
            });
            updates.push({
              observer: otherToken,
              target: changedToken,
              visibility: effectiveVisibility2,
            });
          } else {
            console.log('PF2E Visioner | ❌ REVERSE UPDATE SKIPPED:', {
              from: otherToken.name,
              to: changedToken.document.name,
              currentVisibility: currentVisibility2,
              calculatedVisibility: effectiveVisibility2,
              hasOverride: !!hasOverride2,
              reason: hasOverride2 ? 'override_present' : 'visibility_unchanged'
            });
          }
        }
      }

      // Apply all updates immediately
      if (updates.length > 0) {
        console.log('PF2E Visioner | AVS Applying updates:', {
          updateCount: updates.length,
          updates: updates.map(u => ({
            observer: u.observer.document.name,
            target: u.target.name,
            visibility: u.visibility
          }))
        });

        for (const update of updates) {
          setVisibilityBetween(update.observer, update.target, update.visibility, {
            isAutomatic: true,
          });
          
          // Trigger hook for Token Manager refresh
          Hooks.call('pf2e-visioner.visibilityChanged', 
            update.observer.document.id, 
            update.target.document.id, 
            update.visibility
          );
        }

        // Refresh perception once for all updates - IMMEDIATELY
        refreshEveryonesPerceptionOptimized();

        this.#updateCount += updates.length;
      }

      // Clear processed changes
      this.#changedTokens.clear();
      this.#updatedTokenDocs.clear();

      // Removed debug log
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
   * Get the actual position for a token, using live canvas coordinates first
   */
  #getTokenPosition(token) {
    // During an update cycle, prioritize stored updated coordinates if available
    // This ensures we use the NEW position from the update, not the stale canvas position
    const updatedDoc = this.#updatedTokenDocs.get(token.document.id);
    if (updatedDoc) {
      const position = {
        x: updatedDoc.x + (updatedDoc.width * canvas.grid.size) / 2,
        y: updatedDoc.y + (updatedDoc.height * canvas.grid.size) / 2,
      };
      
      console.log(`PF2E Visioner | 📍 TOKEN POSITION SOURCE: ${token.document.name}`, {
        source: 'updated_document',
        tokenId: token.document.id,
        position,
        documentPos: { x: updatedDoc.x, y: updatedDoc.y }
      });
      
      return position;
    }

    // Fallback to live token position from canvas if available
    const canvasToken = canvas.tokens.get(token.document.id);
    if (canvasToken && canvasToken.document) {
      const position = {
        x: canvasToken.document.x + (canvasToken.document.width * canvas.grid.size) / 2,
        y: canvasToken.document.y + (canvasToken.document.height * canvas.grid.size) / 2,
      };
      
      // Debug log position source
      console.log(`PF2E Visioner | 📍 TOKEN POSITION SOURCE: ${token.document.name}`, {
        source: 'live_canvas',
        tokenId: token.document.id,
        position,
        documentPos: { x: canvasToken.document.x, y: canvasToken.document.y }
      });
      
      return position;
    }

    // Final fallback to document coordinates
    const position = {
      x: token.document.x + (token.document.width * canvas.grid.size) / 2,
      y: token.document.y + (token.document.height * canvas.grid.size) / 2,
    };
    
    console.log(`PF2E Visioner | 📍 TOKEN POSITION SOURCE: ${token.document.name}`, {
      source: 'fallback_document',
      tokenId: token.document.id,
      position,
      documentPos: { x: token.document.x, y: token.document.y }
    });
    
    return position;
  }

  /**
   * Enable the system
   */
  enable() {
    if (this.#enabled) return;

    // Removed debug log

    this.#enabled = true;
    this.#registerEventListeners();

    // Initial full calculation - immediate
    this.#markAllTokensChangedImmediate();
  }

  /**
   * Disable the system
   */
  disable() {
    // Removed debug log

    this.#enabled = false;

    // Clear all pending changes
    this.#changedTokens.clear();
  }

  /**
   * Force recalculation of all visibility (for manual triggers) - IMMEDIATE
   */
  recalculateAll() {
    if (!this.#enabled) return;

    // Removed debug log

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
      description: 'Zero-delay event-driven visibility system',
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
    // Removed debug log

    // Process all tokens in a single batch
    for (const token of tokens) {
      this.#changedTokens.add(token.id);
    }

    await this.#processBatch();
  }

  /**
   * Force recalculation specifically for sneaking tokens
   * This ensures AVS processes sneaking tokens even when they're hidden by Foundry
   */
  async recalculateSneakingTokens() {
    if (!this.#enabled) return;

    const sneakingTokens = canvas.tokens?.placeables?.filter((t) => 
      t.actor && t.document.getFlag('pf2e-visioner', 'sneak-active')
    ) || [];

    console.log('PF2E Visioner | AVS Force recalculating sneaking tokens:', {
      count: sneakingTokens.length,
      tokens: sneakingTokens.map(t => ({
        id: t.document.id,
        name: t.document.name,
        hidden: t.document.hidden
      }))
    });

    // Mark all sneaking tokens as changed
    for (const token of sneakingTokens) {
      this.#changedTokens.add(token.document.id);
    }

    // Process immediately
    if (this.#changedTokens.size > 0) {
      await this.#processBatch();
    }
  }

  /**
   * Recalculate visibility for a specific set of tokens (by id).
   * Useful when overrides are cleared and we need precise, immediate updates.
   * @param {string[]|Set<string>} tokenIds
   */
  async recalculateForTokens(tokenIds) {
    if (!this.#enabled) return;
    const ids = Array.from(new Set((tokenIds || []).filter(Boolean)));
    if (ids.length === 0) return;
    for (const id of ids) this.#changedTokens.add(id);
    await this.#processBatch();
  }

  /**
   * Calculate visibility between two tokens using optimized calculator
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    try {
      // Ensure we don't use stale cached vision capabilities when movement just happened
      const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
      const visionAnalyzer = VisionAnalyzer.getInstance();
      visionAnalyzer.invalidateVisionCache?.(observer?.document?.id);
    } catch {
      // Best effort only
    }
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

    const isVisionEquipment =
      itemType === 'equipment' &&
      (itemName.includes('goggles') ||
        itemName.includes('glasses') ||
        itemName.includes('lens') ||
        itemName.includes('vision') ||
        itemName.includes('sight') ||
        itemName.includes('eye') ||
        changes.system?.equipped !== undefined); // Equipment state changed

    if (isVisionEquipment && item.parent?.documentName === 'Actor') {
      const actor = item.parent;
      const tokens = canvas.tokens?.placeables.filter((t) => t.actor?.id === actor.id && (!t.document.hidden || t.document.getFlag('pf2e-visioner', 'sneak-active'))) || [];
      
      console.log('PF2E Visioner | AVS Actor Update - Token Filtering:', {
        actorId: actor.id,
        actorName: actor.name,
        totalTokens: canvas.tokens?.placeables?.length || 0,
        filteredTokens: tokens.length,
        tokenDetails: tokens.map(t => ({
          id: t.document.id,
          name: t.document.name,
          hidden: t.document.hidden,
          isSneaking: t.document.getFlag('pf2e-visioner', 'sneak-active')
        }))
      });

      if (tokens.length > 0) {
        // Removed debug log

        tokens.forEach((token) => this.#markTokenChangedImmediate(token.document.id));
      }
    }
  }

  // ==========================================
  // AVS OVERRIDE MANAGEMENT SYSTEM
  // ==========================================

  /**
   * Handle AVS override requests from actions like sneak
   * @param {Object} overrideData - Override data structure
   */
  // AVS override handling is centralized in AvsOverrideManager

  /**
   * Store override as persistent token flag
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token  
   * @param {string} state - Visibility state
   * @param {string} source - Override source
   * @param {boolean} hasCover - Whether target has cover
  * @param {boolean} hasConcealment - Whether target has concealment
  * @param {('none'|'lesser'|'standard'|'greater')} [expectedCover] - Explicit expected cover level at apply-time
   */
  // Removed: #storeOverrideAsFlag (moved to AvsOverrideManager)

  /**
   * Apply override from persistent flag
   * @param {Token} observer - Observer token
   * @param {Token} target - Target token
   * @param {string} state - Visibility state
   */
  // Removed: #applyOverrideFromFlag (moved to AvsOverrideManager)

  /**
   * Check if there's an active override for a token pair
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @returns {Object|null} Override data or null
   */
  #getActiveOverride(observerId, targetId) {
    const overrideKey = `${observerId}-${targetId}`;
    return this.#activeOverrides.get(overrideKey) || null;
  }

  /**
   * Remove a specific override (both memory and persistent flag types)
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID
   * @param {Object} options - Options including type and token reference
   */
  async removeOverride(observerId, targetId) {
    // Delegate to AvsOverrideManager; keep memory map cleanup for legacy if desired
    const overrideKey = `${observerId}-${targetId}`;
    this.#activeOverrides.delete(overrideKey);
    return AvsOverrideManager.removeOverride(observerId, targetId);
  }

  /**
   * Clear all overrides (memory and persistent flags)
   */
  async clearAllOverrides() {
    // Clear memory and delegate persistent flags cleanup to manager
    this.#activeOverrides.clear();
    await AvsOverrideManager.clearAllOverrides();
  }

  /**
   * Debug method to create a test override
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID  
   * @param {boolean} hasCover - Whether override claims cover
   * @param {boolean} hasConcealment - Whether override claims concealment
   */
  debugCreateOverride(observerId, targetId, hasCover = true, hasConcealment = false) {
    const overrideKey = `${observerId}-${targetId}`;
    this.#activeOverrides.set(overrideKey, {
      state: 'active',
      source: 'debug-test',
      targetId,
      targetName: canvas.tokens?.get(targetId)?.name || 'Unknown',
      hasCover,
      hasConcealment
    });
    console.log('PF2E Visioner | Created debug override:', { observerId, targetId, hasCover, hasConcealment });
  }

  // ==========================================
  // TEMPLATE EVENTS
  // ==========================================

  /**
   * Handle template creation (might affect lighting)
   */
  #onTemplateCreate(template) {
    if (!this.#enabled || !game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting')) return;

    // Check if this template might affect visibility (light spells, darkness, etc.)
    const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
    const isLightTemplate =
      templateName.includes('light') ||
      templateName.includes('darkness') ||
      templateName.includes('shadow');

    if (isLightTemplate) {
      // Removed debug log
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
    const significantChange =
      changes.x !== undefined ||
      changes.y !== undefined ||
      changes.config !== undefined ||
      changes.hidden !== undefined;

    if (significantChange) {
      const templateName = template.flags?.pf2e?.item?.name?.toLowerCase() || '';
      const isLightTemplate =
        templateName.includes('light') ||
        templateName.includes('darkness') ||
        templateName.includes('shadow');

      if (isLightTemplate) {
        // Removed debug log
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
    const isLightTemplate =
      templateName.includes('light') ||
      templateName.includes('darkness') ||
      templateName.includes('shadow');

    if (isLightTemplate) {
      // Removed debug log
      this.#markAllTokensChangedImmediate();
    }
  }

  // ==========================================
  // OVERRIDE VALIDATION SYSTEM
  // ==========================================

  /**
   * Queue a token for override validation after movement
   * @param {string} tokenId - ID of the token that moved
   */
  #queueOverrideValidation(tokenId) {
    if (!this.#enabled || !game.user.isGM) {
      console.log('PF2E Visioner | Override validation skipped:', { enabled: this.#enabled, isGM: game.user.isGM });
      return;
    }

    console.log('PF2E Visioner | Queueing override validation for token:', tokenId);
    this.#tokensQueuedForValidation.add(tokenId);

    // Clear existing timeout and set new one to batch validations
    if (this.#validationTimeoutId) {
      clearTimeout(this.#validationTimeoutId);
    }

    // Validate after a short delay to handle waypoints and complete movements
    this.#validationTimeoutId = setTimeout(() => {
      console.log('PF2E Visioner | Processing queued validations...');
      this.#processQueuedValidations();
    }, 500); // 500ms delay to ensure movement is complete
  }

  /**
   * Process all queued override validations
   */
  async #processQueuedValidations() {
    if (!this.#enabled || !game.user.isGM) return;
    
    // Ensure perception/vision are up-to-date before running validations
    try {
      optimizedPerceptionManager.forceRefreshPerception();
      // Wait for rendering/perception to settle (2 RAFs)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (e) {
      // Non-fatal: proceed even if refresh fails
      console.warn('PF2E Visioner | Perception refresh before validation failed (continuing):', e);
    }

    const tokensToValidate = Array.from(this.#tokensQueuedForValidation);
    this.#tokensQueuedForValidation.clear();
    this.#validationTimeoutId = null;

    console.log('PF2E Visioner | Processing override validation for tokens:', tokensToValidate);
    console.log('PF2E Visioner | Current active overrides:', this.#activeOverrides);

    for (const tokenId of tokensToValidate) {
      await this.#validateOverridesForToken(tokenId);
    }
  }

  /**
   * Validate all overrides involving a specific token that just moved
   * @param {string} movedTokenId - ID of the token that moved
   */
  async #validateOverridesForToken(movedTokenId) {
    const movedToken = canvas.tokens?.get(movedTokenId);
    if (!movedToken) {
      console.log('PF2E Visioner | Could not find moved token:', movedTokenId);
      return;
    }

    console.log('PF2E Visioner | Validating overrides for moved token:', movedToken.name);

    const overridesToCheck = [];

    // Check memory-based overrides first (backwards compatibility)
    for (const [overrideKey, override] of this.#activeOverrides.entries()) {
      const [observerId, targetId] = overrideKey.split('-');
      
      if (observerId === movedTokenId || targetId === movedTokenId) {
        console.log('PF2E Visioner | Found memory override to check:', { key: overrideKey, override });
        overridesToCheck.push({
          key: overrideKey,
          override,
          observerId,
          targetId,
          type: 'memory'
        });
      }
    }

    // Check persistent flag-based overrides for all tokens
    const allTokens = canvas.tokens?.placeables || [];
    for (const token of allTokens) {
      if (!token?.document) continue;
      
      // Check all override flags on this token (target has flags FROM observers)
      const flags = token.document.flags['pf2e-visioner'] || {};
      for (const [flagKey, flagData] of Object.entries(flags)) {
        if (!flagKey.startsWith('avs-override-from-')) continue;
        
        const observerId = flagKey.replace('avs-override-from-', '');
        const targetId = token.document.id;
        
        // Skip if not involving the moved token
        if (observerId !== movedTokenId && targetId !== movedTokenId) continue;

        console.log('PF2E Visioner | Found persistent flag override to check:', { 
          flagKey, 
          observerId, 
          targetId, 
          flagData 
        });
        
        overridesToCheck.push({
          key: `${observerId}-${targetId}`,
          override: {
            observer: canvas.tokens?.get(observerId),
            target: token,
            state: flagData.state,
            source: flagData.source,
            hasCover: flagData.hasCover,
            hasConcealment: flagData.hasConcealment,
            expectedCover: flagData.expectedCover,
            observerId,
            targetId,
            observerName: flagData.observerName,
            targetName: flagData.targetName || token.name
          },
          observerId,
          targetId,
          type: 'flag',
          flagKey,
          token: token
        });
      }
    }

    console.log('PF2E Visioner | Total overrides to check:', overridesToCheck.length);

    // Check each override for validity and collect invalid ones
    const invalidOverrides = [];
    for (const checkData of overridesToCheck) {
      const { override, observerId, targetId, type, flagKey, token } = checkData;
      const checkResult = await this.#checkOverrideValidity(observerId, targetId, override);
      
      console.log('PF2E Visioner | Validity check result:', { 
        observerId, 
        targetId, 
        shouldRemove: checkResult,
        override: override 
      });
      
      if (checkResult) {
        console.log('PF2E Visioner | Override should be removed:', { 
          observerId, 
          targetId, 
          type,
          reason: checkResult.reason 
        });
        invalidOverrides.push({
          observerId,
          targetId,
          override,
          reason: checkResult.reason,
          reasonIcons: checkResult.reasonIcons || [],
          currentVisibility: checkResult.currentVisibility,
          currentCover: checkResult.currentCover,
          type,
          flagKey,
          token
        });
      } else {
        console.log('PF2E Visioner | Override is still valid:', { observerId, targetId, type });
      }
    }

    // If we found invalid overrides, show the validation dialog
    if (invalidOverrides.length > 0) {
      console.log('PF2E Visioner | About to show validation dialog with invalid overrides:', {
        count: invalidOverrides.length,
        overrides: invalidOverrides
      });
      await this.#showOverrideValidationDialog(invalidOverrides);
    } else {
      console.log('PF2E Visioner | No invalid overrides found to show dialog for');
    }
  }

  /**
   * Check if an override is still valid based on current visibility/cover state
   * @param {string} observerId - Observer token ID
   * @param {string} targetId - Target token ID  
   * @param {Object} override - Override object with hasCover/hasConcealment flags
   * @returns {Promise<{shouldRemove: boolean, reason: string}|null>}
   */
  async #checkOverrideValidity(observerId, targetId, override) {
    const observer = canvas.tokens?.get(observerId);
    const target = canvas.tokens?.get(targetId);
    
    if (!observer || !target) return null;

    try {
      // Get current positions for detailed logging
      const observerPos = { x: observer.document.x, y: observer.document.y };
      const targetPos = { x: target.document.x, y: target.document.y };
      
      console.log('PF2E Visioner | Validation position check:', {
        observer: observer.name,
        target: target.name,
        observerPos,
        targetPos,
        observerCanvas: { x: observer.x, y: observer.y },
        targetCanvas: { x: target.x, y: target.y }
      });
      
      // Calculate current visibility and get detailed information
  const visibility = await this.calculateVisibility(observer, target);
      
      // Get cover information using CoverDetector - checking if target has cover from observer
      // Only consider 'standard' and 'greater' cover as significant for override validation
  let targetHasCoverFromObserver = false;
  let coverResult = 'none';
      try {
        const { CoverDetector } = await import('../../cover/auto-cover/CoverDetector.js');
        const coverDetector = new CoverDetector();
        coverResult = coverDetector.detectBetweenTokens(observer, target);
        
        // Only standard and greater cover count as "having cover" for override purposes
        targetHasCoverFromObserver = coverResult === 'standard' || coverResult === 'greater';
        
        console.log('PF2E Visioner | Cover detection result:', {
          observer: observer.name,
          target: target.name,
          coverResult,
          targetHasCoverFromObserver,
          direction: `${target.name} has cover from ${observer.name}'s perspective`,
          note: `Only 'standard' and 'greater' cover considered significant (not 'lesser')`
        });
      } catch (coverError) {
        console.warn('PF2E Visioner | Could not calculate cover:', coverError);
        // Fallback - assume no cover if we can't calculate it
        targetHasCoverFromObserver = false;
        coverResult = 'none';
      }
      
      // Check if target has concealment from observer (based on visibility result)
      const targetHasConcealmentFromObserver = visibility === 'concealed' || visibility === 'hidden';
      const targetIsVisibleToObserver = visibility === 'observed' || visibility === 'concealed';
      
      console.log('PF2E Visioner | Validation check for override:', {
        observer: observer.name,
        target: target.name,
        storedOverride: override,
        storedFlags: {
          hasCover: override.hasCover,
          hasConcealment: override.hasConcealment,
          state: override.state,
          source: override.source
        },
        currentVisibility: visibility,
        currentState: {
          targetHasCoverFromObserver,
          targetHasConcealmentFromObserver,
          targetIsVisibleToObserver
        }
      });
      
      if (!visibility) return null;

      console.log('PF2E Visioner | Cover calculation breakdown:', {
        'coverLevel': coverResult,
        'targetHasCoverFromObserver': targetHasCoverFromObserver,
        'coverDecision': `${coverResult} ${targetHasCoverFromObserver ? '→ COUNTS as cover' : '→ does NOT count as cover'}`,
        'coverRule': 'Only standard/greater cover counts for override validation (lesser cover ignored)',
        'concealment': targetHasConcealmentFromObserver,
        'visibility string': visibility,
        'Position analysis': `${target.name} at (${targetPos.x}, ${targetPos.y}) observed by ${observer.name} at (${observerPos.x}, ${observerPos.y})`,
        'Relationship': `Does ${target.name} have cover/concealment from ${observer.name}?`
      });

      // Enhanced debug logging for validation logic
      console.log('PF2E Visioner | Detailed validation logic:', {
        'override.hasCover': override.hasCover,
        'targetHasCoverFromObserver': targetHasCoverFromObserver,
        'Cover mismatch - expected but not found': override.hasCover && !targetHasCoverFromObserver,
        'Cover mismatch - not expected but found': !override.hasCover && targetHasCoverFromObserver,
        'override.hasConcealment': override.hasConcealment,
        'targetHasConcealmentFromObserver': targetHasConcealmentFromObserver,
        'Concealment mismatch - expected but not found': override.hasConcealment && !targetHasConcealmentFromObserver,
        'Concealment mismatch - not expected but found': !override.hasConcealment && targetHasConcealmentFromObserver
      });

      const reasons = [];
      // Check if cover conditions have changed from what the override expected
      if (override.hasCover && !targetHasCoverFromObserver) {
        console.log('PF2E Visioner | Validation reason: expected cover but target has no standard/greater cover');
        if (coverResult === 'none')  {
          reasons.push({
            icon: 'fas fa-shield-alt',
            text: 'no cover',
            type: 'cover-none',
            crossed: true
          });
      }
    }
      if (!override.hasCover && targetHasCoverFromObserver) {
        console.log('PF2E Visioner | Validation reason: did not expect cover but target now has standard/greater cover');
        reasons.push({
          icon: 'fas fa-shield-alt',
          text: `has ${coverResult} cover`,
          type: `cover-${coverResult}`
        });
      }

      // Check if concealment conditions have changed from what the override expected
      if (override.hasConcealment && targetIsVisibleToObserver && !targetHasConcealmentFromObserver) {
        console.log('PF2E Visioner | Validation reason: expected concealment but target has no concealment');
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'no concealment',
          type: 'concealment-none',
          crossed: true
        });
      }
      if (!override.hasConcealment && targetHasConcealmentFromObserver) {
        console.log('PF2E Visioner | Validation reason: did not expect concealment but target now has concealment');
        reasons.push({
          icon: 'fas fa-eye-slash',
          text: 'has concealment',
          type: 'concealment-has'
        });
      }

      // Additional check for concealment: if override expected concealment but token is now clearly observed
      if (override.hasConcealment && visibility === 'observed') {
        reasons.push({
          icon: 'fas fa-eye',
          text: 'clearly visible',
          type: 'visibility-clear'
        });
      }

      // Check for "undetected" overrides that may become invalid when visibility improves significantly
      // Check overrides from manual actions, sneak actions, etc.
      if ((override.source === 'manual_action' || override.source === 'sneak_action')) {
        // If target is now clearly observed (in bright light with no concealment), 
        // "undetected" may be too strong
        if (visibility === 'observed' && !targetHasCoverFromObserver && !targetHasConcealmentFromObserver) {
          // Only flag if the observer has normal vision capabilities
          const observerToken = canvas.tokens?.get(observerId);
          if (observerToken?.actor) {
            try {
              const { VisionAnalyzer } = await import('./VisionAnalyzer.js');
              const visionAnalyzer = VisionAnalyzer.getInstance();
              const visionCapabilities = visionAnalyzer.getVisionCapabilities(observerToken.actor);
              
              // If observer has normal vision and target is in bright light with no obstructions,
              // "undetected" might be questionable for stealth
              // Note: We can't easily get lighting level without the debug info, so we'll be more conservative
              if (!visionCapabilities.hasDarkvision) {
                if (override.source !== 'sneak_action') {
                  reasons.push({
                    icon: 'fas fa-eye',
                    text: 'clearly visible',
                    type: 'visibility-clear'
                  });
                }
              }
            } catch (error) {
              console.warn('PF2E Visioner | Error checking vision capabilities:', error);
            }
          }
        }
        
        // Removed additional ninja reason icons; a single ninja tag will be added for UI separately
      }

      // Build reason icons for UI: add a compact source tag icon for each action type
      // Hide eye/eye-slash/shield reason icons in the UI; keep them internal for logic
      const reasonIconsForUi = [];
      const sourceIconMap = {
        sneak_action: { icon: 'fas fa-user-ninja', text: 'sneak', type: 'sneak-source' },
        seek_action: { icon: 'fas fa-search', text: 'seek', type: 'seek-source' },
        point_out_action: { icon: 'fas fa-hand-point-right', text: 'point out', type: 'pointout-source' },
        hide_action: { icon: 'fas fa-mask', text: 'hide', type: 'hide-source' },
        diversion_action: { icon: 'fas fa-theater-masks', text: 'diversion', type: 'diversion-source' },
        manual_action: { icon: 'fas fa-tools', text: 'manual', type: 'manual-source' },
      };
      const srcKey = override.source || 'manual_action';
      if (sourceIconMap[srcKey]) reasonIconsForUi.push(sourceIconMap[srcKey]);

      if (reasons.length > 0) {
        console.log('PF2E Visioner | Override validation FAILED - reasons:', reasons);
        return {
          shouldRemove: true,
          reason: reasons.map(r => r.text).join(' and '), // Keep text for logging
          reasonIcons: reasonIconsForUi, // Pass icon data for UI (with single ninja tag if applicable)
          currentVisibility: visibility,
          currentCover: coverResult
        };
      }

      console.log('PF2E Visioner | Override validation PASSED - no reasons to remove');
      return null;
    } catch (error) {
      console.warn('PF2E Visioner | Error validating override:', error);
      return null;
    }
  }

  /**
   * Show the override validation dialog for multiple invalid overrides
   * @param {Array} invalidOverrides - Array of invalid override objects
   */
  async #showOverrideValidationDialog(invalidOverrides) {
    if (invalidOverrides.length === 0) return;

    // Prepare the override data for the dialog
  const overrideData = invalidOverrides.map(({ observerId, targetId, override, reason, reasonIcons, currentVisibility, currentCover }) => {
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);
      
      console.log('PF2E Visioner | Preparing dialog data for override:', {
        observer: observer?.document?.name,
        target: target?.document?.name,
        reason,
        reasonIcons,
        storedState: override,
        observerId,
        targetId
      });
      
      return {
        id: `${observerId}-${targetId}`,
        observerId,
        targetId,
        observerName: observer?.document?.name || 'Unknown',
        targetName: target?.document?.name || 'Unknown',
        state: override.state || 'undetected',
        source: override.source || 'unknown',
        reason,
        reasonIcons: reasonIcons || [],
        hasCover: override.hasCover || false,
        hasConcealment: override.hasConcealment || false,
        expectedCover: override.expectedCover,
        // Pass through the actual computed current states for UI icons
        currentVisibility: currentVisibility,
        currentCover: currentCover,
        isManual: override.source === 'manual_action'
      };
    });

    // Get the name of the token that moved (for context in dialog title)
    const movedTokenName = invalidOverrides.length > 0 ? 
      (canvas.tokens?.get(invalidOverrides[0].targetId)?.document?.name) : 'Unknown Token';

    // Non-obtrusive indicator instead of auto-opening dialog
    try {
      const { default: indicator } = await import('../../ui/override-validation-indicator.js');
      indicator.show(overrideData, movedTokenName);
    } catch (err) {
      console.warn('PF2E Visioner | Failed to show indicator, falling back to dialog:', err);
      try {
        const { OverrideValidationDialog } = await import('../../ui/override-validation-dialog.js');
        await OverrideValidationDialog.show(overrideData, movedTokenName);
      } catch (error) {
        console.error('PF2E Visioner | Error showing override validation dialog:', error);
      }
    }
  }
}

// Export singleton instance
export const eventDrivenVisibilitySystem = EventDrivenVisibilitySystem.getInstance();

