/**
 * AutoVisibilitySystem - Refactored modular version
 * Singleton service for automatically setting visibility flags based on lighting conditions and creature senses
 */

import { MODULE_ID } from '../../constants.js';
import { refreshEveryonesPerception } from '../../services/socket.js';
import { getVisibilityMap, setVisibilityBetween } from '../../stores/visibility-map.js';
import { InvisibilityManager } from './InvisibilityManager.js';
import { LightingCalculator } from './LightingCalculator.js';
import { ManualOverrideDetector } from './ManualOverrideDetector.js';
import { VisionAnalyzer } from './VisionAnalyzer.js';

/**
 * Singleton class that manages automatic visibility detection using modular components
 */
class AutoVisibilitySystem {
  /** @type {AutoVisibilitySystem} */
  static #instance = null;

  /** @type {boolean} */
  #initialized = false;

  /** @type {boolean} */
  #enabled = false;

  /** @type {boolean} */
  #pendingSceneUpdate = false;

  /** @type {boolean} */
  #sceneConfigOpen = false;

  /** @type {Set<string>} */
  #processingTokens = new Set();

  /** @type {Map<string, Promise>} */
  #tokenUpdateThrottles = new Map();

  /** @type {number|null} */
  #recalculateTimeout = null;

  /** @type {number|null} */
  #lastRecalculation = null;

  /** @type {number} */
  #perceptionRefreshTimeout = null;

  // Emergency circuit breaker to prevent runaway calculations
  /** @type {number} */
  #circuitBreakerCount = 0;
  
  /** @type {number} */
  #circuitBreakerWindow = 10000; // 10 seconds
  
  /** @type {number} */
  #circuitBreakerLimit = 3; // Max 3 calculations per window
  
  /** @type {number|null} */
  #circuitBreakerReset = null;
  
  /** @type {boolean} */
  #circuitBreakerTripped = false;

  /** @type {boolean} - Flag to prevent reacting to our own effect changes */
  #isUpdatingEffects = false;

  /** @type {LightingCalculator} */
  #lightingCalculator;

  /** @type {VisionAnalyzer} */
  #visionAnalyzer;

  /** @type {InvisibilityManager} */
  #invisibilityManager;

  /** @type {ManualOverrideDetector} */
  #manualOverrideDetector;

  constructor() {
    if (AutoVisibilitySystem.#instance) {
      return AutoVisibilitySystem.#instance;
    }

    // Initialize modular components
    this.#lightingCalculator = new LightingCalculator();
    this.#visionAnalyzer = new VisionAnalyzer();
    this.#invisibilityManager = new InvisibilityManager();
    this.#manualOverrideDetector = new ManualOverrideDetector();

    AutoVisibilitySystem.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {AutoVisibilitySystem}
   */
  static getInstance() {
    if (!AutoVisibilitySystem.#instance) {
      AutoVisibilitySystem.#instance = new AutoVisibilitySystem();
    }
    return AutoVisibilitySystem.#instance;
  }

  /**
   * Initialize the system
   */
  async initialize() {
    if (this.#initialized) return;

    console.log(`${MODULE_ID} | Initializing AutoVisibilitySystem (Refactored)`);
    
    this.#enabled = game.settings.get(MODULE_ID, 'autoVisibilityEnabled');
    
    if (this.#enabled) {
      this.#registerHooks();
    }

    this.#initialized = true;
  }

  /**
   * Register FoundryVTT hooks
   */
  #registerHooks() {
    // Update visibility when tokens move
    Hooks.on('updateToken', this.#onTokenUpdate.bind(this));
    
    // Update visibility when tokens are created
    Hooks.on('createToken', this.#onTokenCreate.bind(this));
    
    // Update visibility when lighting changes
    Hooks.on('lightingRefresh', this.#onLightingRefresh.bind(this));
    
    // Update visibility when light sources change
    Hooks.on('createAmbientLight', this.#onLightSourceChange.bind(this));
    Hooks.on('updateAmbientLight', this.#onLightSourceChange.bind(this));
    Hooks.on('deleteAmbientLight', this.#onLightSourceChange.bind(this));
    
    // Update visibility when walls change (affects line of sight)
    Hooks.on('updateWall', this.#onWallUpdate.bind(this));
    Hooks.on('createWall', this.#onWallUpdate.bind(this));
    Hooks.on('deleteWall', this.#onWallUpdate.bind(this));
    
    // Update visibility when scene darkness changes
    Hooks.on('updateScene', this.#onSceneConfigSave.bind(this));
    
    // Also listen for canvas lighting refresh (more immediate than scene updates)
    Hooks.on('canvasReady', this.#onCanvasReady.bind(this));
    
    // Listen for actor updates to track invisibility condition changes
    // Use both hooks for maximum compatibility
    Hooks.on('updateActor', this.#onActorUpdate.bind(this));
    Hooks.on('updateDocument', this.#onDocumentUpdate.bind(this));
    
    // Also listen for item changes that might affect vision
    Hooks.on('createItem', this.#onItemChange.bind(this));
    Hooks.on('updateItem', this.#onItemChange.bind(this));
    Hooks.on('deleteItem', this.#onItemChange.bind(this));
    
    // Listen for Scene Config render/close to properly track its state
    Hooks.on('renderSceneConfig', this.#onSceneConfigRender.bind(this));
    Hooks.on('closeApplication', this.#onCloseApplication.bind(this));
    
    // Additional hooks for more reliable Scene Config detection
    Hooks.on('closeSceneConfig', this.#onSceneConfigClose.bind(this));
    
    // Periodic check to ensure Scene Config state is accurate (reduced frequency to prevent memory leak)
    setInterval(() => {
      this.#periodicSceneConfigCheck();
    }, 60000); // Check every 60 seconds (reduced from 10s)
    

  }

  /**
   * Handle token updates (movement, etc.)
   * @param {TokenDocument} tokenDoc
   * @param {Object} changes
   */
  #onTokenUpdate(tokenDoc, changes) {
    if (!this.#enabled || !game.user.isGM) return;
    
    const updateOnMovement = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnMovement');
    if (!updateOnMovement) return;

    // Check if position or light properties changed
    const positionChanged = changes.x !== undefined || changes.y !== undefined;
    const lightChanged = changes.light !== undefined;
    const actorChanged = changes.actorId !== undefined || changes.actorData !== undefined;
    
    // Only update for significant position changes (prevent spam from animations/tweening)
    let significantPositionChange = false;
    if (positionChanged) {
      const currentX = tokenDoc.x || 0;
      const currentY = tokenDoc.y || 0;
      const newX = changes.x !== undefined ? changes.x : currentX;
      const newY = changes.y !== undefined ? changes.y : currentY;
      
      // Only update if moved more than half a grid square (50 pixels default)
      const gridSize = canvas.grid?.size || 100;
      const threshold = gridSize * 0.5;
      const distance = Math.sqrt(Math.pow(newX - currentX, 2) + Math.pow(newY - currentY, 2));
      significantPositionChange = distance >= threshold;
      
      const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      if (debugMode && positionChanged) {
        console.log(`${MODULE_ID} | Token ${tokenDoc.name} moved ${distance.toFixed(1)}px (threshold: ${threshold.toFixed(1)}px) - ${significantPositionChange ? 'UPDATING' : 'IGNORING'}`);
      }
    }
    
    if (significantPositionChange || lightChanged || actorChanged) {
      if (lightChanged) {
        this.#lightingCalculator.invalidateLightCache();
      }
      
      if (actorChanged) {
        this.#visionAnalyzer.invalidateVisionCache(tokenDoc.id);
      }
      
      // Throttle token updates to prevent lag
      this.#throttledTokenUpdate(tokenDoc);
    }
  }

  /**
   * Handle token creation
   * @param {TokenDocument} tokenDoc
   */
  #onTokenCreate(tokenDoc) {
    if (!this.#enabled || !game.user.isGM) return;
    
    // Invalidate caches when new tokens are created
    this.#lightingCalculator.invalidateLightCache();
    this.#visionAnalyzer.invalidateVisionCache();
    
    // Update visibility for the new token
    setTimeout(() => {
      this.#updateTokenVisibility(tokenDoc);
    }, 100);
  }

  /**
   * Handle lighting refresh
   */
  #onLightingRefresh() {
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    
    if (this.#shouldSkipUpdates()) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Lighting refresh detected - but updates are disabled, skipping`);
      }
      return;
    }
    
    const updateOnLighting = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting');
    if (!updateOnLighting) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Lighting refresh detected - but updateOnLighting is disabled`);
      }
      return;
    }

    if (debugMode) {
      console.log(`${MODULE_ID} | Lighting refresh detected - triggering debounced visibility update`);
    }
    
    // Clear light cache when lighting changes
    this.#lightingCalculator.invalidateLightCache();
    
    // Use debounced recalculation to prevent spam from frequent lighting updates
    this.recalculateAllVisibility();
  }

  /**
   * Handle light source changes (create/update/delete ambient lights)
   * @param {AmbientLightDocument} lightDoc
   * @param {Object} changes
   */
  #onLightSourceChange(lightDoc, changes = {}) {
    if (!this.#enabled || !game.user.isGM) return;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Light source changed: ${lightDoc.id} - updating visibility`, {
        changes,
        'lightDoc.isDarknessSource': lightDoc.object?.isDarknessSource,
        'lightDoc.config.negative': lightDoc.config?.negative,
        'full_lightDoc': lightDoc
      });
    }
    
    // Clear light cache since light sources changed
    this.#lightingCalculator.invalidateLightCache();
    
    // Debounced recalculation to handle multiple light changes
    this.recalculateAllVisibility();
  }

  /**
   * Handle wall updates
   */
  #onWallUpdate() {
    if (!this.#enabled || !game.user.isGM) return;
    
    const updateOnLighting = game.settings.get(MODULE_ID, 'autoVisibilityUpdateOnLighting');
    if (!updateOnLighting) return;

    // Walls affect line of sight, so recalculate visibility
    setTimeout(() => {
      this.recalculateAllVisibility();
    }, 100);
  }



  /**
   * Handle canvas ready events
   */
  async #onCanvasReady() {
    if (!this.#enabled || !game.user.isGM) return;
    
    // Invalidate all caches when canvas is ready (new scene loaded)
    this.#lightingCalculator.invalidateLightCache();
    this.#visionAnalyzer.invalidateVisionCache();
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Canvas ready - recalculating all visibility`);
    }
    
    // Recalculate visibility when canvas is ready (scene change, etc.)
    setTimeout(() => {
      this.recalculateAllVisibility();
    }, 500); // Longer delay to ensure everything is loaded
  }

  /**
   * Handle item changes that might affect vision
   * @param {Item} item
   * @param {Object} changes
   * @param {Object} options
   */
  #onItemChange(item, changes, options) {
    if (!this.#enabled || !game.user.isGM) return;
    
    // Only care about items that belong to actors
    if (!item.actor) return;
    
    // Ignore changes when we're updating effects to prevent feedback loops
    if (this.#isUpdatingEffects) {
      return;
    }
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    
    // Check if this item might affect vision (darkvision, low-light vision, etc.)
    const itemName = item.name?.toLowerCase() || '';
    const itemType = item.type?.toLowerCase() || '';
    
    // Check for vision-related changes in the system data
    const hasVisionChanges = changes?.system?.vision !== undefined ||
                            changes?.system?.traits?.senses !== undefined ||
                            changes?.system?.perception !== undefined;
    
    const isVisionRelated = itemName.includes('darkvision') || 
                           itemName.includes('low-light') || 
                           itemName.includes('vision') ||
                           itemName.includes('sight') ||
                           itemType === 'effect' ||
                           itemType === 'condition' ||
                           itemType === 'ancestry' ||  // Ancestry changes can affect vision
                           hasVisionChanges;
    
    if (isVisionRelated || debugMode) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Item change detected for ${item.actor.name}:`, {
          itemName: item.name,
          itemType: item.type,
          isVisionRelated,
          hasVisionChanges,
          visionChange: changes?.system?.vision,
          sensesChange: changes?.system?.traits?.senses,
          perceptionChange: changes?.system?.perception,
          changes
        });
      }
      
      if (isVisionRelated) {
        // Clear vision cache for this actor
        this.#visionAnalyzer.clearVisionCache?.(item.actor.id);
        
        // Recalculate visibility after item change
        setTimeout(() => {
          this.recalculateAllVisibility();
        }, 100);
      }
    }
  }

  /**
   * Handle document updates (FoundryVTT v13 compatible)
   * @param {Document} document
   * @param {Object} changes
   * @param {Object} options
   */
  #onDocumentUpdate(document, changes, options) {
    // Only handle Actor documents
    if (document.documentName !== 'Actor') return;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Document update detected for Actor ${document.name}:`, {
        changes,
        documentName: document.documentName,
        documentType: document.type
      });
    }
    
    // Delegate to the actor update handler
    this.#onActorUpdate(document, changes);
  }

  /**
   * Handle actor updates to track invisibility condition changes and vision changes
   * @param {Actor} actor
   * @param {Object} changes
   */
  #onActorUpdate(actor, changes) {
    if (!this.#enabled || !game.user.isGM) return;

    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    let needsRecalculation = false;

    // Check if conditions were updated (invisibility added/removed)
    if (changes.system?.conditions) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Actor ${actor.name} conditions changed`);
      }
      this.#invisibilityManager.handleInvisibilityChange(actor);
      needsRecalculation = true;
    }

    // Check if perception/senses were updated (darkvision, low-light vision, etc.)
    if (changes.system?.perception || changes.system?.traits?.senses || changes.system?.traits) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Actor ${actor.name} vision/senses changed:`, {
          perception: changes.system?.perception,
          senses: changes.system?.traits?.senses,
          traits: changes.system?.traits
        });
      }
      
      // Clear vision cache for this actor
      this.#visionAnalyzer.clearVisionCache?.(actor.id);
      needsRecalculation = true;
    }

    // Check if any other system properties that might affect vision changed
    if (changes.system?.details?.level || changes.system?.abilities || changes.items) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Actor ${actor.name} level, abilities, or items changed - might affect vision:`, {
          level: changes.system?.details?.level,
          abilities: changes.system?.abilities,
          items: changes.items ? 'Items changed' : undefined
        });
      }
      
      // Clear vision cache for this actor
      this.#visionAnalyzer.clearVisionCache?.(actor.id);
      needsRecalculation = true;
    }

    // Also check for any changes that might indicate item additions/removals
    if (changes.effects || changes.flags) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Actor ${actor.name} effects or flags changed - might affect vision:`, {
          effects: changes.effects,
          flags: changes.flags
        });
      }
      
      // Clear vision cache for this actor
      this.#visionAnalyzer.clearVisionCache?.(actor.id);
      needsRecalculation = true;
    }

    if (needsRecalculation) {
      // Recalculate visibility after any relevant changes
      setTimeout(() => {
        this.recalculateAllVisibility();
      }, 100); // Small delay to ensure changes are applied
    }
  }

  /**
   * Handle Scene Config render
   * @param {SceneConfig} app
   */
  #onSceneConfigRender(app) {
    if (!this.#enabled || !game.user.isGM) return;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Scene Config opened - pausing auto-visibility updates`);
    }
    
    this.#sceneConfigOpen = true;
  }

  /**
   * Handle application close events (especially Scene Config)
   * @param {Application} app
   */
  #onCloseApplication(app) {
    if (!this.#enabled || !game.user.isGM) return;
    
    // Always log for debugging
    console.log(`${MODULE_ID} | Application closed: ${app.constructor.name}`);
    
    // If Scene Config was closed, trigger deferred updates
    if (app.constructor.name === 'SceneConfig') {
      console.log(`${MODULE_ID} | Scene Config closed - resuming auto-visibility updates`);
      
      // Mark Scene Config as closed
      this.#sceneConfigOpen = false;
      
      // Clear the pending flag
      this.#pendingSceneUpdate = false;
      
      // Clear light cache since scene may have changed
      this.#lightingCalculator.invalidateLightCache();
      
      // Trigger updates after a short delay to ensure scene changes are applied
      setTimeout(() => {
        console.log(`${MODULE_ID} | Executing deferred visibility recalculation`);
        this.recalculateAllVisibility(true); // Force recalculation
      }, 500);
    }
  }

  /**
   * Handle Scene Config close hook (more specific than closeApplication)
   * @param {SceneConfig} _app
   */
  #onSceneConfigClose(_app) {
    if (!this.#enabled || !game.user.isGM) return;
    
    console.log(`${MODULE_ID} | Scene Config closed (via closeSceneConfig hook) - resuming auto-visibility updates`);
    
    // Mark Scene Config as closed
    this.#sceneConfigOpen = false;
    
    // Clear the pending flag
    this.#pendingSceneUpdate = false;
    
    // Clear light cache since scene may have changed
    this.#lightingCalculator.invalidateLightCache();
    
    // Trigger updates after a short delay
    setTimeout(() => {
      console.log(`${MODULE_ID} | Executing deferred visibility recalculation (from closeSceneConfig)`);
      this.recalculateAllVisibility(true);
    }, 500);
  }

  /**
   * Periodic check to ensure Scene Config state is accurate
   * This helps recover from stuck states
   */
  #periodicSceneConfigCheck() {
    if (!this.#enabled || !game.user.isGM) return;
    
    const wasOpen = this.#sceneConfigOpen;
    
    // This will auto-correct the flag if needed
    const isOpen = this.#isSceneConfigOpen();
    
    // If the flag was stuck and we just corrected it, trigger updates
    if (wasOpen && !isOpen && this.#pendingSceneUpdate) {
      console.log(`${MODULE_ID} | Periodic check detected Scene Config was closed - triggering deferred updates`);
      this.#pendingSceneUpdate = false;
      this.#lightingCalculator.invalidateLightCache();
      this.recalculateAllVisibility(true);
    }
  }

  /**
   * Handle scene updates that might come from Scene Config save
   * @param {Scene} scene
   * @param {Object} changes
   */
  #onSceneConfigSave(scene, changes, options = {}) {
    if (!this.#enabled || !game.user.isGM) return;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    
    // Only process vision-relevant changes to avoid unnecessary updates
    const visionRelevantChanges = [
      'darkness', 'environment', 'tokenVision', 'fog', 'globalLight'
    ];
    
    const hasVisionChanges = Object.keys(changes).some(key => 
      visionRelevantChanges.some(relevantKey => key.includes(relevantKey))
    );
    
    if (!hasVisionChanges) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Scene updated but no vision-relevant changes detected - skipping`);
      }
      return;
    }
    
    // Check if this is a significant darkness change (not just slider dragging)
    const darknessChanged = changes.darkness !== undefined || changes.environment?.darknessLevel !== undefined;
    if (darknessChanged) {
      const newDarkness = changes.environment?.darknessLevel ?? changes.darkness;
      const oldDarkness = scene.environment?.darknessLevel ?? scene.darkness ?? 0;
      const significantChange = Math.abs(newDarkness - oldDarkness) > 0.01; // Only update for changes > 1%
      
      if (significantChange) {
        if (debugMode) {
          console.log(`${MODULE_ID} | Significant darkness change detected: ${oldDarkness} → ${newDarkness}`);
        }
        
        // Clear light cache when scene darkness changes
        this.#lightingCalculator.invalidateLightCache();
        
        // Debounced update to prevent spam during slider dragging
        this.recalculateAllVisibility();
      } else if (debugMode) {
        console.log(`${MODULE_ID} | Minor darkness change ignored: ${oldDarkness} → ${newDarkness}`);
      }
    }
    
    // Handle other vision-relevant changes
    if (changes.tokenVision !== undefined || changes.fog !== undefined) {
      if (debugMode) {
        console.log(`${MODULE_ID} | Vision settings changed - updating visibility`);
      }
      this.recalculateAllVisibility();
    }
  }

  /**
   * Throttled token update to prevent lag
   * @param {TokenDocument} tokenDoc
   */
  #throttledTokenUpdate(tokenDoc) {
    const tokenId = tokenDoc.id;
    const delay = game.settings.get(MODULE_ID, 'autoVisibilityThrottleDelay');
    
    // Cancel existing throttle for this token
    if (this.#tokenUpdateThrottles.has(tokenId)) {
      clearTimeout(this.#tokenUpdateThrottles.get(tokenId));
    }
    
    // Set new throttle
    const timeoutId = setTimeout(() => {
      this.#updateTokenVisibility(tokenDoc);
      this.#tokenUpdateThrottles.delete(tokenId);
    }, delay);
    
    this.#tokenUpdateThrottles.set(tokenId, timeoutId);
  }

  /**
   * Update visibility for a specific token relative to all other tokens
   * @param {TokenDocument} tokenDoc
   */
  async #updateTokenVisibility(tokenDoc) {
    if (this.#processingTokens.has(tokenDoc.id)) return;
    
    this.#processingTokens.add(tokenDoc.id);
    
    try {
      const token = tokenDoc.object;
      if (!token?.actor) return;
      
      const otherTokens = canvas.tokens.placeables.filter(t => 
        t !== token && t.actor && t.document.id !== tokenDoc.id
      );
      
      const maxTokensToProcess = 15; // Limit to prevent lag
      const tokensToProcess = otherTokens.slice(0, maxTokensToProcess);
      
      const updates = [];
      
      for (const otherToken of tokensToProcess) {
        // Calculate visibility in both directions
        const visibility1 = await this.calculateVisibility(token, otherToken);
        const visibility2 = await this.calculateVisibility(otherToken, token);
        
        // Debug logging for Hidden state calculation
        const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode && (visibility1 === 'hidden' || visibility2 === 'hidden')) {
          console.log(`${MODULE_ID} | 👁️ HIDDEN CALCULATED: ${token.name} ↔ ${otherToken.name} (${visibility1}, ${visibility2})`);
        }
        
        // Check for manual overrides
        const respectManualActions = game.settings.get(MODULE_ID, 'autoVisibilityRespectManualActions');
        
        const hasOverride1 = respectManualActions ? 
          await this.#manualOverrideDetector.hasManualVisibilityOverride(token, otherToken) : false;
        const hasOverride2 = respectManualActions ? 
          await this.#manualOverrideDetector.hasManualVisibilityOverride(otherToken, token) : false;
        
        // Only update if visibility has changed AND it's not a manual override
        const currentVisibility1 = getVisibilityMap(token)[otherToken.document.id] || 'observed';
        const currentVisibility2 = getVisibilityMap(otherToken)[token.document.id] || 'observed';
        
        if (visibility1 !== currentVisibility1 && !hasOverride1) {
          updates.push({ observer: token, target: otherToken, visibility: visibility1 });
        }
        
        if (visibility2 !== currentVisibility2 && !hasOverride2) {
          updates.push({ observer: otherToken, target: token, visibility: visibility2 });
        }
      }
      
      // Apply all updates in batch
      if (updates.length > 0) {
        // Debug logging for Hidden state application
        const debugMode2 = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
        if (debugMode2) {
          const hiddenUpdates = updates.filter(u => u.visibility === 'hidden');
          if (hiddenUpdates.length > 0) {
            console.log(`${MODULE_ID} | 🔄 APPLYING HIDDEN UPDATES: ${hiddenUpdates.length} updates`);
          }
        }
        
        for (const update of updates) {
          setVisibilityBetween(update.observer, update.target, update.visibility, { isAutomatic: true });
        }
        

        
        // Trigger perception refresh to update visual representation
        this.#refreshPerception();
      }
      
    } finally {
      this.#processingTokens.delete(tokenDoc.id);
    }
  }

  /**
   * Calculate visibility between observer and target tokens
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<string>} Visibility state
   */
  async calculateVisibility(observer, target) {
    if (!observer?.actor || !target?.actor) return 'observed';

    try {
      // Step 1: Check for manual action overrides first
      const respectManualActions = game.settings.get(MODULE_ID, 'autoVisibilityRespectManualActions');
      
      if (respectManualActions) {
        // Check for Point Out overrides
        const hasPointOutOverride = await this.#manualOverrideDetector.hasPointOutOverride(observer, target);
        if (hasPointOutOverride) {
          // Point Out makes invisible creatures "hidden" instead of "undetected"
          if (this.#invisibilityManager.isInvisibleTo(observer, target)) {
            return 'hidden';
          }
          // For non-invisible creatures, Point Out doesn't change the base calculation
          // Fall through to normal lighting-based calculation
        }

        // Check for Seek overrides
        const seekOverride = await this.#manualOverrideDetector.getSeekOverride(observer, target);
        if (seekOverride) {
          // Seek can upgrade visibility regardless of invisibility or lighting
          const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
          if (debugMode) {
            console.log(`${MODULE_ID} | Seek override found: ${observer.name} → ${target.name} = ${seekOverride}`);
          }
          return seekOverride; // 'hidden' or 'observed' based on Seek result
        }
      }

      // Step 2: Check if target is completely invisible to observer
      // Invisibility has complex rules in PF2E - see InvisibilityManager
      if (this.#invisibilityManager.isInvisibleTo(observer, target)) {
        // Determine if observer can see normally in current lighting conditions
        const lightLevel = this.#lightingCalculator.getLightLevelAt(target.center);
        const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);
        const normalVisibility = this.#visionAnalyzer.determineVisibilityFromLighting(lightLevel, observerVision);
        const canSeeNormally = normalVisibility === 'observed';
        
        return await this.#invisibilityManager.getInvisibilityState(
          observer, 
          target, 
          this.#manualOverrideDetector.hasSneakOverride.bind(this.#manualOverrideDetector),
          canSeeNormally
        );
      }

      // Step 3: Check line of sight
      const hasLineOfSight = this.#visionAnalyzer.hasLineOfSight(observer, target);
      if (!hasLineOfSight) {
        // No line of sight - check if observer has special senses
        if (this.#visionAnalyzer.canDetectWithoutSight(observer, target)) {
          return 'hidden'; // Can detect but not see clearly
        }
        return 'hidden'; // Cannot see at all
      }

      // Step 4: Check lighting conditions at target's position
      const lightLevel = this.#lightingCalculator.getLightLevelAt(target.center);
      const observerVision = this.#visionAnalyzer.getVisionCapabilities(observer);

      // Step 5: Determine visibility based on light level and observer's vision
      return this.#visionAnalyzer.determineVisibilityFromLighting(lightLevel, observerVision);

    } catch (error) {
      console.error(`${MODULE_ID} | Error calculating visibility:`, error);
      return 'observed'; // Default fallback
    }
  }

  /**
   * Recalculate visibility for all tokens on the scene
   * @param {boolean} force - Force recalculation even if Scene Config is open
   */
  async recalculateAllVisibility(force = false) {
    if (!force && this.#shouldSkipUpdates()) return;
    
    const now = Date.now();
    
    // Circuit breaker: prevent runaway calculations
    if (!this.#circuitBreakerReset || now > this.#circuitBreakerReset) {
      // Reset the circuit breaker window
      this.#circuitBreakerCount = 0;
      this.#circuitBreakerReset = now + this.#circuitBreakerWindow;
      this.#circuitBreakerTripped = false;
    }
    
    if (!force) {
      this.#circuitBreakerCount++;
      
      if (this.#circuitBreakerCount > this.#circuitBreakerLimit) {
        if (!this.#circuitBreakerTripped) {
          const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
          if (debugMode) {
            console.warn(`${MODULE_ID} | Circuit breaker activated - preventing excessive recalculations (${this.#circuitBreakerCount} in ${this.#circuitBreakerWindow}ms)`);
          }
          this.#circuitBreakerTripped = true;
        }
        return;
      }
    }
    
    // TEMPORARY: Aggressive throttling to stop jittering and slider resets
    // Only allow recalculation once every 2 seconds to prevent spam
    if (!force && this.#lastRecalculation && (now - this.#lastRecalculation) < 2000) {
      const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
      if (debugMode) {
        console.log(`${MODULE_ID} | Recalculation throttled - too recent (${now - this.#lastRecalculation}ms ago)`);
      }
      return;
    }
    
    // Debounce to prevent excessive calls (memory leak fix)
    if (this.#recalculateTimeout) {
      clearTimeout(this.#recalculateTimeout);
    }
    
    this.#recalculateTimeout = setTimeout(async () => {
      this.#lastRecalculation = Date.now();
      await this.#doRecalculateAllVisibility(force);
      this.#recalculateTimeout = null;
    }, 500); // Increased debounce from 100ms to 500ms
  }

  /**
   * Internal method that actually performs the recalculation
   * @param {boolean} force - Force recalculation even if Scene Config is open
   */
  async #doRecalculateAllVisibility(force = false) {
    if (!force && this.#shouldSkipUpdates()) return;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Recalculating visibility for all tokens`);
      console.log(`${MODULE_ID} | Scene darkness level: ${canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0}`);
      console.log(`${MODULE_ID} | Light sources count: ${canvas.lighting?.placeables?.length || 0}`);
    }
    
    const tokens = canvas.tokens?.placeables?.filter(t => t.actor) || [];
    const maxTokensToProcess = 15; // Limit to prevent lag
    const tokensToProcess = tokens.slice(0, maxTokensToProcess);
    
    if (debugMode) {
      console.log(`${MODULE_ID} | Processing ${tokensToProcess.length} tokens with valid actors`);
    }
    
    // Process tokens in batches to prevent lag
    for (const token of tokensToProcess) {
      await this.#updateTokenVisibility(token.document);
    }
    
    if (debugMode) {
      console.log(`${MODULE_ID} | Finished recalculating visibility for all tokens`);
    }
    
    // Trigger perception refresh after recalculating all visibility
    this.#refreshPerception();
  }

  /**
   * Check if Scene Config dialog is open
   * @returns {boolean}
   */
  #isSceneConfigOpen() {
    // First check our internal flag
    let isOpen = this.#sceneConfigOpen;
    
    // Double-check by looking for actual Scene Config applications
    try {
      const sceneConfigs = Object.values(ui.windows).filter(app => 
        app.constructor.name === 'SceneConfig' || 
        app.constructor.name.includes('SceneConfig') ||
        (app.options && app.options.id && app.options.id.includes('scene-config'))
      );
      
      const actuallyOpen = sceneConfigs.length > 0;
      
      // If our flag says it's open but no Scene Config windows exist, reset the flag
      if (isOpen && !actuallyOpen) {
        console.log(`${MODULE_ID} | Scene Config flag was stuck - resetting to false`);
        this.#sceneConfigOpen = false;
        isOpen = false;
      }
      
      // If our flag says it's closed but Scene Config windows exist, update the flag
      if (!isOpen && actuallyOpen) {
        console.log(`${MODULE_ID} | Scene Config detected but flag was false - updating to true`);
        this.#sceneConfigOpen = true;
        isOpen = true;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Error checking Scene Config state:`, error);
    }
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode) {
      console.log(`${MODULE_ID} | Scene Config check: ${isOpen}`);
    }
    
    return isOpen;
  }

  /**
   * Check if we should skip updates (Scene Config open or system disabled)
   * @returns {boolean}
   */
  #shouldSkipUpdates() {
    const enabled = this.#enabled;
    const isGM = game.user.isGM;
    const sceneConfigOpen = this.#isSceneConfigOpen();
    const shouldSkip = !enabled || !isGM || sceneConfigOpen;
    
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    if (debugMode && shouldSkip) {
      console.log(`${MODULE_ID} | Skipping updates:`, {
        enabled,
        isGM,
        sceneConfigOpen,
        shouldSkip
      });
    }
    
    return shouldSkip;
  }

  /**
   * Enable the system
   */
  enable() {
    this.#enabled = true;
    if (!this.#initialized) {
      this.#registerHooks();
    }
    console.log(`${MODULE_ID} | AutoVisibilitySystem enabled`);
  }

  /**
   * Disable the system
   */
  disable() {
    this.#enabled = false;
    
    // Clean up timeouts to prevent memory leaks
    if (this.#recalculateTimeout) {
      clearTimeout(this.#recalculateTimeout);
      this.#recalculateTimeout = null;
    }
    
    if (this.#perceptionRefreshTimeout) {
      clearTimeout(this.#perceptionRefreshTimeout);
      this.#perceptionRefreshTimeout = null;
    }
    
    if (this.#circuitBreakerReset) {
      clearTimeout(this.#circuitBreakerReset);
      this.#circuitBreakerReset = null;
    }
    
    // Reset circuit breaker state
    this.#circuitBreakerCount = 0;
    this.#circuitBreakerTripped = false;
    
    // Clear all token update throttles
    for (const timeoutId of this.#tokenUpdateThrottles.values()) {
      clearTimeout(timeoutId);
    }
    this.#tokenUpdateThrottles.clear();
    
    console.log(`${MODULE_ID} | AutoVisibilitySystem disabled and cleaned up`);
  }

  /**
   * Get system status
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.#initialized,
      enabled: this.#enabled,
      processingTokens: this.#processingTokens.size,
      throttledUpdates: this.#tokenUpdateThrottles.size
    };
  }

  // Public API methods that delegate to the modular components

  /**
   * Get vision capabilities for a token (public API)
   * @param {Token} token
   * @returns {Object}
   */
  getVisionCapabilities(token) {
    return this.#visionAnalyzer.getVisionCapabilities(token);
  }

  /**
   * Get the vision analyzer instance (public API for testing)
   * @returns {VisionAnalyzer}
   */
  get visionAnalyzer() {
    return this.#visionAnalyzer;
  }

  /**
   * Clear light cache (public API)
   */
  clearLightCache() {
    this.#lightingCalculator.clearLightCache();
  }

  /**
   * Clear vision cache (public API)
   */
  clearVisionCache(actorId = null) {
    this.#visionAnalyzer.clearVisionCache(actorId);
  }

  /**
   * Debug method to list all open applications
   */
  debugOpenApplications() {
    const apps = Object.values(ui.windows).map(app => ({
      name: app.constructor.name,
      rendered: app.rendered,
      id: app.id,
      title: app.title || 'No title'
    }));
    console.log(`${MODULE_ID} | Open applications:`, apps);
    return apps;
  }

  /**
   * Reset Scene Config flag (emergency fix for stuck state)
   */
  resetSceneConfigFlag() {
    console.log(`${MODULE_ID} | Resetting Scene Config flag from ${this.#sceneConfigOpen} to false`);
    this.#sceneConfigOpen = false;
    this.#pendingSceneUpdate = false;
  }

  /**
   * Refresh perception to update visual representation on canvas (throttled)
   * @private
   */
  #refreshPerception() {
    // Clear existing timeout
    if (this.#perceptionRefreshTimeout) {
      clearTimeout(this.#perceptionRefreshTimeout);
    }
    
    // Throttle perception refresh to avoid excessive calls
    this.#perceptionRefreshTimeout = setTimeout(() => {
      try {
        // Refresh everyone's perception via socket
        refreshEveryonesPerception();
      } catch (error) {
        console.warn(`${MODULE_ID} | Error refreshing everyone's perception:`, error);
      }
      
      try {
        // Also refresh local canvas perception
        canvas.perception.update({ 
          refreshVision: true,
          refreshLighting: false,
          refreshOcclusion: true
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Error refreshing canvas perception:`, error);
      }
      
      this.#perceptionRefreshTimeout = null;
    }, 100); // 100ms throttle
  }

  /**
   * Get debug information
   * @param {Token} observer
   * @param {Token} target
   * @returns {Promise<Object>}
   */
  async getVisibilityDebugInfo(observer, target) {
    if (!observer || !target) {
      return { error: 'Observer and target tokens required' };
    }

    const lightLevel = this.#lightingCalculator.getLightLevelAt(target.center);
    const vision = this.#visionAnalyzer.getVisionCapabilities(observer);
    const hasLineOfSight = this.#visionAnalyzer.hasLineOfSight(observer, target);
    const canDetectWithoutSight = this.#visionAnalyzer.canDetectWithoutSight(observer, target);
    const isInvisible = this.#invisibilityManager.isInvisibleTo(observer, target);
    const calculatedVisibility = await this.calculateVisibility(observer, target);
    const manualOverrides = await this.#manualOverrideDetector.checkAllOverrides(observer, target);

    return {
      observer: observer.name,
      target: target.name,
      lightLevel,
      vision,
      hasLineOfSight,
      canDetectWithoutSight,
      isInvisible,
      calculatedVisibility,
      manualOverrides,
      components: {
        lighting: this.#lightingCalculator.getDebugInfo(target.center),
        vision: this.#visionAnalyzer.getDebugInfo(observer),
        invisibility: this.#invisibilityManager.getDebugInfo(observer, target),
        overrides: await this.#manualOverrideDetector.getDebugInfo(observer, target)
      }
    };
  }

  /**
   * Test invisibility detection for debugging
   * @param {Token} observer
   * @param {Token} target
   * @returns {boolean}
   */
  testInvisibility(observer, target) {
    return this.#invisibilityManager.isInvisibleTo(observer, target);
  }

  /**
   * Set the updating effects flag (internal use only)
   * @param {boolean} isUpdating
   */
  _setUpdatingEffects(isUpdating) {
    this.#isUpdatingEffects = isUpdating;
  }


}

// Export singleton instance
export const autoVisibilitySystem = AutoVisibilitySystem.getInstance();
