/**
 * Awareness Propagation System
 * 
 * Provides realistic ally awareness without revealing exact positions.
 * Implements fuzzy awareness markers, LoS checks, and privacy safeguards.
 */

import { AWARENESS_CONFIG, AWARENESS_STATES, MODULE_ID } from '../constants.js';

// Ray is available globally in FoundryVTT, no import needed

export class AwarenessPropagationService {
  constructor() {
    this.cache = new Map(); // Cache for performance optimization
    this.throttleTimeout = null;
  }

  /**
   * Check if awareness propagation is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return game.settings.get(MODULE_ID, 'awarenessEnabled');
  }

  /**
   * Get current privacy level configuration
   * @returns {Object}
   */
  getPrivacyConfig() {
    const level = game.settings.get(MODULE_ID, 'awarenessPrivacyLevel');
    return AWARENESS_CONFIG.PRIVACY_LEVELS[level];
  }

  /**
   * Propagate awareness to allies after a stealth action
   * @param {Object} options - Propagation options
   * @param {Token} options.actor - The token performing the action
   * @param {string} options.action - The action type (hide, sneak, etc.)
   * @param {Object} options.result - The action result
   * @param {Token[]} options.targets - Optional specific targets
   */
  async propagateAwareness({ actor, action, result, targets = null }) {
    console.log('PF2E Visioner | Awareness propagation called:', { actor: actor?.name, action, enabled: this.isEnabled() });
    
    if (!this.isEnabled() || !actor) {
      console.log('PF2E Visioner | Awareness propagation skipped - disabled or no actor');
      return;
    }

    // Only process triggering actions
    if (!AWARENESS_CONFIG.TRIGGERING_ACTIONS.includes(action)) {
      console.log('PF2E Visioner | Awareness propagation skipped - unsupported action:', action);
      return;
    }

    const privacyConfig = this.getPrivacyConfig();
    const observers = this._findEligibleObservers(actor, targets);
    
    console.log('PF2E Visioner | Found observers:', observers.length, observers.map(o => o.name));
    
    // Debug: Show all tokens in scene
    const allTokens = canvas.tokens.placeables;
    console.log('PF2E Visioner | All tokens in scene:', allTokens.map(t => `${t.name} (${t.actor?.type}, ${t.actor?.alliance})`));
    
    if (observers.length === 0) {
      console.log('PF2E Visioner | No eligible observers found, skipping awareness propagation');
      return;
    }

    const propagationResults = [];

    for (const observer of observers) {
      const awarenessResult = await this._calculateAwarenessForObserver(actor, observer, action, result);
      
      if (awarenessResult.state !== 'none') {
        propagationResults.push({
          observer,
          ...awarenessResult
        });
      }
    }

    // Apply awareness results
    if (propagationResults.length > 0) {
      await this._applyAwarenessResults(actor, propagationResults, action);
      
      // Create visual overlays
      await this._createVisualOverlays(propagationResults);
    }

    // Log to GM if enabled
    if (game.settings.get(MODULE_ID, 'awarenessLogToGM')) {
      this._logPropagationToGM(actor, action, propagationResults);
    }
  }

  /**
   * Find eligible observers for awareness propagation
   * @param {Token} actor - The acting token
   * @param {Token[]} specificTargets - Optional specific targets
   * @returns {Token[]}
   */
  _findEligibleObservers(actor, specificTargets = null) {
    if (specificTargets) {
      return specificTargets.filter(t => this._isValidObserver(actor, t));
    }

    const maxRange = game.settings.get(MODULE_ID, 'awarenessMaxRange');
    const observers = [];

    for (const token of canvas.tokens.placeables) {
      if (!this._isValidObserver(actor, token)) continue;
      
      const distance = this._calculateDistance(actor, token);
      if (distance <= maxRange) {
        observers.push(token);
      }
    }

    return observers;
  }

  /**
   * Check if a token is a valid observer for awareness propagation
   * @param {Token} actor - The acting token
   * @param {Token} potential - The potential observer
   * @returns {boolean}
   */
  _isValidObserver(actor, potential) {
    // Basic validation
    if (!potential || potential === actor) return false;
    if (!potential.actor || !actor.actor) return false;
    
    // All tokens can be observers - no alliance restrictions
    // All token types can observe - characters, NPCs, etc.
    console.log(`PF2E Visioner | Valid observer: ${potential.name} (${potential.actor.type}, ${potential.actor.alliance || 'neutral'})`);
    return true;
  }

  /**
   * Calculate awareness level for a specific observer
   * @param {Token} actor - The acting token
   * @param {Token} observer - The observer token
   * @param {string} action - The action type
   * @param {Object} result - The action result
   * @returns {Object} Awareness calculation result
   */
  async _calculateAwarenessForObserver(actor, observer, action, result) {
    const distance = this._calculateDistance(actor, observer);
    const hasLoS = await this._checkLineOfSight(observer, actor);
    const senseResult = this._checkApplicableSenses(observer, actor, distance, hasLoS);
    const privacyConfig = this.getPrivacyConfig();
    
    console.log(`PF2E Visioner | Awareness calculation for ${observer.name} -> ${actor.name}:`);
    console.log(`  Distance: ${distance.toFixed(1)}`);
    console.log(`  Has LoS: ${hasLoS}`);
    console.log(`  Sense result:`, senseResult);

    // Determine detection state based on PF2e sense rules
    let detectionState = 'none';
    let reason = 'no-detection';
    let exactPosition = false;
    let fuzzyRadius = 0;

    // 1. Check for precise senses (including LoS with vision)
    if (hasLoS) {
      // Line of sight with vision = precise sense = observed
      detectionState = 'observed';
      reason = 'line-of-sight';
      exactPosition = privacyConfig.revealExact;
      fuzzyRadius = exactPosition ? 0 : 5;
    } else if (senseResult.hasSense) {
      // Use the detection state from the best available sense
      const acuityConfig = AWARENESS_CONFIG.SENSE_ACUITY[senseResult.acuity];
      detectionState = acuityConfig.detectionState;
      reason = `${senseResult.senseType}-sense`;
      
      // Apply privacy settings
      if (detectionState === 'observed' && !privacyConfig.revealExact) {
        // Downgrade precise senses if privacy is conservative
        detectionState = 'lastKnownArea';
        exactPosition = false;
        fuzzyRadius = 5;
      } else if (detectionState === 'observed') {
        exactPosition = true;
        fuzzyRadius = 0;
      } else if (detectionState === 'hidden') {
        // Imprecise senses - know general area but not exact location
        exactPosition = false;
        fuzzyRadius = Math.max(5, Math.floor(distance / 4));
      } else if (detectionState === 'suspicious') {
        // Vague senses - only know something is there
        exactPosition = false;
        fuzzyRadius = Math.max(10, Math.floor(distance / 2));
      }
    } else {
      // 2. Fall back to noise-based detection for basic hearing
      const noiseRadius = game.settings.get(MODULE_ID, 'awarenessNoiseRadius');
      if (distance <= noiseRadius) {
        // Basic hearing (imprecise) - target is hidden
        detectionState = 'hidden';
        reason = 'noise';
        exactPosition = false;
        fuzzyRadius = Math.max(10, Math.floor(distance / 2));
      } else {
        // 3. Check communication radius for very vague awareness
        const commRadius = game.settings.get(MODULE_ID, 'awarenessCommunicationRadius');
        if (distance <= commRadius && !privacyConfig.requireAction) {
          // Very vague awareness - suspicious
          detectionState = 'suspicious';
          reason = 'communication';
          exactPosition = false;
          fuzzyRadius = Math.max(15, Math.floor(distance / 1.5));
        }
      }
    }

    // Special handling for Seek actions - upgrade detection states
    if (action === 'seek' && result.success) {
      detectionState = this._applySeekUpgrade(detectionState, result.success);
    }

    const awarenessResult = {
      state: detectionState,
      reason,
      exactPosition,
      fuzzyRadius,
      senseType: senseResult.senseType,
      acuity: senseResult.acuity
    };
    
    console.log(`PF2E Visioner | Final detection state: ${detectionState} (${reason})`);
    console.log(`  Exact position: ${exactPosition}, Fuzzy radius: ${fuzzyRadius}`);
    
    return awarenessResult;
  }

  /**
   * Apply Seek action detection state upgrades per PF2e rules
   * @param {string} currentState - Current detection state
   * @param {boolean} criticalSuccess - Whether the Seek was a critical success
   * @returns {string} Upgraded detection state
   */
  _applySeekUpgrade(currentState, criticalSuccess = false) {
    const upgradeTable = criticalSuccess ? 
      AWARENESS_CONFIG.SEEK_UPGRADES.criticalSuccess : 
      AWARENESS_CONFIG.SEEK_UPGRADES.success;
    
    return upgradeTable[currentState] || currentState;
  }

  /**
   * Check line of sight between two tokens
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {boolean}
   */
  async _checkLineOfSight(observer, target) {
    const requireLoS = game.settings.get(MODULE_ID, 'awarenessRequireLoS');
    console.log(`PF2E Visioner | LoS check: ${observer.name} -> ${target.name}, requireLoS=${requireLoS}`);
    
    // If LoS is not required, assume LoS exists (return true)
    if (!requireLoS) {
      console.log(`PF2E Visioner | LoS not required, assuming LoS exists`);
      return true;
    }

    try {
      // Use Foundry's built-in LoS calculation
      const ray = this._createRay(observer.center, target.center);
      const hasCollision = canvas.walls.checkCollision(ray, { type: 'sight' });
      const hasLoS = !hasCollision;
      console.log(`PF2E Visioner | LoS calculation: collision=${hasCollision}, hasLoS=${hasLoS}`);
      return hasLoS;
    } catch (error) {
      console.warn('PF2E Visioner | LoS check failed:', error);
      return false;
    }
  }

  /**
   * Check if observer has applicable senses that could detect the target
   * Returns the most precise sense available within range following PF2e rules
   * @param {Token} observer - The observer token
   * @param {Token} target - The target token
   * @param {number} distance - Distance between tokens
   * @param {boolean} hasLoS - Whether there is line of sight
   * @returns {Object} Sense detection result with acuity level
   */
  _checkApplicableSenses(observer, target, distance, hasLoS) {
    if (!game.settings.get(MODULE_ID, 'awarenessAllowSenses')) {
      return { hasSense: false, senseType: null, acuity: null };
    }

    const observerActor = observer.actor;
    if (!observerActor) return { hasSense: false, senseType: null, acuity: null };

    let bestSense = null;
    let bestAcuity = null;

    // Check each sense type in order of precision (precise > imprecise > vague)
    const sensesByPrecision = [
      // Precise senses first
      ...Object.entries(AWARENESS_CONFIG.SENSES).filter(([_, config]) => config.acuity === 'PRECISE'),
      // Then imprecise
      ...Object.entries(AWARENESS_CONFIG.SENSES).filter(([_, config]) => config.acuity === 'IMPRECISE'),
      // Finally vague
      ...Object.entries(AWARENESS_CONFIG.SENSES).filter(([_, config]) => config.acuity === 'VAGUE')
    ];

    for (const [senseType, senseConfig] of sensesByPrecision) {
      // Skip if we already found a more precise sense
      if (bestSense && this._getAcuityPriority(senseConfig.acuity) <= this._getAcuityPriority(bestAcuity)) {
        continue;
      }

      let hasThisSense = false;
      let senseRange = 0;

      if (senseType === 'vision') {
        // Basic vision - only applicable if there's line of sight and not blind
        hasThisSense = hasLoS && !observerActor.system?.attributes?.senses?.blinded;
        senseRange = 999; // Effectively unlimited in most scenes
      } else if (senseType === 'hearing') {
        // Basic hearing - always present unless deaf
        hasThisSense = !observerActor.system?.attributes?.senses?.deafened;
        senseRange = senseConfig.range;
      } else {
        // Special senses from actor data
        const senseData = observerActor.system?.attributes?.senses?.[senseType];
        if (senseData && (senseData.value > 0 || senseData.range > 0)) {
          hasThisSense = true;
          senseRange = senseData.value || senseData.range;
        }
      }

      if (hasThisSense && distance <= senseRange) {
        // Check light requirements for vision-based senses
        if (senseConfig.requiresLight && !this._checkLightRequirements(observer, target, senseConfig)) {
          continue;
        }

        bestSense = senseType;
        bestAcuity = senseConfig.acuity;
        
        // If we found a precise sense, we can stop looking
        if (senseConfig.acuity === 'PRECISE') {
          break;
        }
      }
    }

    return { 
      hasSense: !!bestSense, 
      senseType: bestSense, 
      acuity: bestAcuity,
      range: bestSense ? AWARENESS_CONFIG.SENSES[bestSense].range : null
    };
  }

  /**
   * Get numeric priority for acuity levels (higher = more precise)
   */
  _getAcuityPriority(acuity) {
    switch (acuity) {
      case 'PRECISE': return 3;
      case 'IMPRECISE': return 2;
      case 'VAGUE': return 1;
      default: return 0;
    }
  }

  /**
   * Check if light requirements are met for vision-based senses
   */
  _checkLightRequirements(observer, target, senseConfig) {
    if (!senseConfig.requiresLight) return true;
    
    // For now, assume adequate lighting - could be enhanced with scene lighting detection
    // TODO: Integrate with Foundry's lighting system
    return true;
  }

  /**
   * Calculate distance between two tokens in feet
   * @param {Token} token1 - First token
   * @param {Token} token2 - Second token
   * @returns {number} Distance in feet
   */
  _calculateDistance(token1, token2) {
    const dx = token1.center.x - token2.center.x;
    const dy = token1.center.y - token2.center.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Convert to feet (assuming standard 5ft grid)
    const gridSize = canvas.grid.size;
    const gridDistance = pixelDistance / gridSize;
    return gridDistance * 5; // 5 feet per grid square
  }

  /**
   * Apply awareness results to observers
   * @param {Token} actor - The acting token
   * @param {Array} results - Awareness results
   * @param {string} action - The action type
   */
  async _applyAwarenessResults(actor, results, action) {
    const updates = [];
    const whispers = [];

    for (const result of results) {
      const { observer, state, reason, exactPosition, fuzzyRadius, senseType, acuity } = result;
      
      // Store awareness in token flags
      const awarenessData = {
        state,
        reason,
        exactPosition,
        fuzzyRadius,
        senseType,
        acuity,
        sourceToken: actor.id,
        timestamp: Date.now(),
        action
      };

      updates.push({
        _id: observer.id,
        [`flags.${MODULE_ID}.awareness.${actor.id}`]: awarenessData
      });

      // Create whisper message if enabled and observer has a connected player
      if (game.settings.get(MODULE_ID, 'awarenessAutoWhisper')) {
        const shouldWhisper = this._shouldSendWhisper(observer);
        console.log(`PF2E Visioner | Whisper check for ${observer.name}: ${shouldWhisper}`);
        if (shouldWhisper) {
          whispers.push(this._createAwarenessWhisper(observer, actor, result, action));
        }
      }
    }

    // Apply token updates
    if (updates.length > 0) {
      await canvas.scene.updateEmbeddedDocuments('Token', updates);
    }

    // Send whisper messages
    console.log(`PF2E Visioner | Sending ${whispers.length} whisper messages`);
    for (const whisper of whispers) {
      console.log(`PF2E Visioner | Whisper to players:`, whisper.whisper);
      console.log(`PF2E Visioner | Whisper content:`, whisper.content.substring(0, 100) + '...');
      await game.messages.create(whisper);
    }

    // Update visual overlays - send to all clients via socket
    this._updateAwarenessOverlays(results, actor);
  }

  /**
   * Check if a whisper should be sent to the observer
   * @param {Token} observer - The observer token
   * @returns {boolean}
   */
  _shouldSendWhisper(observer) {
    if (!observer.actor) return false;
    
    // Get connected non-GM users
    const connectedUsers = game.users.filter(u => u.active && !u.isGM);
    if (connectedUsers.length === 0) {
      console.log(`PF2E Visioner | No whisper for ${observer.name} - no connected players`);
      return false;
    }
    
    // Check if the observer has any connected players
    const hasConnectedPlayer = observer.actor.hasPlayerOwner;
    if (!hasConnectedPlayer) {
      console.log(`PF2E Visioner | No whisper for ${observer.name} - no player owner`);
      return false;
    }
    
    // Try multiple methods to find the actual player owners
    let observerUsers = observer.actor.players || [];
    
    // If players array is empty but hasPlayerOwner is true, try alternative methods
    if (observerUsers.length === 0 && hasConnectedPlayer) {
      // Method 1: Check if any connected user owns this actor
      observerUsers = connectedUsers.filter(user => {
        const ownsActor = user.character === observer.actor || 
                         (user.character && user.character.id === observer.actor.id);
        console.log(`PF2E Visioner | User ${user.name} owns ${observer.name}: ${ownsActor}`);
        return ownsActor;
      });
      
      // Method 2: Check actor ownership directly
      if (observerUsers.length === 0) {
        observerUsers = connectedUsers.filter(user => {
          const hasPermission = observer.actor.testUserPermission(user, "OWNER");
          console.log(`PF2E Visioner | User ${user.name} has OWNER permission for ${observer.name}: ${hasPermission}`);
          return hasPermission;
        });
      }
    }
    
    const hasConnectedUser = observerUsers.length > 0;
    
    if (!hasConnectedUser) {
      console.log(`PF2E Visioner | No whisper for ${observer.name} - no connected players (${observer.actor.players?.length || 0} owners, ${connectedUsers.length} connected)`);
      return false;
    }
    
    console.log(`PF2E Visioner | Sending whisper to ${observer.name} - has connected player`);
    return true;
  }

  /**
   * Get the user IDs for an observer token
   * @param {Token} observer - The observer token
   * @returns {string[]} Array of user IDs
   */
  _getObserverUserIds(observer) {
    if (!observer.actor) return [];
    
    const connectedUsers = game.users.filter(u => u.active && !u.isGM);
    let observerUsers = observer.actor.players || [];
    
    // If players array is empty but hasPlayerOwner is true, try alternative methods
    if (observerUsers.length === 0 && observer.actor.hasPlayerOwner) {
      // Method 1: Check if any connected user owns this actor
      observerUsers = connectedUsers.filter(user => {
        const ownsActor = user.character === observer.actor || 
                         (user.character && user.character.id === observer.actor.id);
        return ownsActor;
      });
      
      // Method 2: Check actor ownership directly
      if (observerUsers.length === 0) {
        observerUsers = connectedUsers.filter(user => {
          const hasPermission = observer.actor.testUserPermission(user, "OWNER");
          return hasPermission;
        });
      }
    }
    
    return observerUsers.map(user => user.id);
  }

  /**
   * Create a whisper message for awareness
   * @param {Token} observer - The observer token
   * @param {Token} actor - The acting token
   * @param {Object} result - Awareness result
   * @param {string} action - The action type
   * @returns {Object} Chat message data
   */
  _createAwarenessWhisper(observer, actor, result, action) {
    const { state, reason, fuzzyRadius, senseType, acuity } = result;
    const stateConfig = AWARENESS_STATES[state];
    
    let message = '';
    let senseDescription = '';
    const direction = this._getDirectionDescription(observer, actor);
    
    // Create sense-specific messages based on PF2e rules
    if (senseType && acuity) {
      const acuityConfig = AWARENESS_CONFIG.SENSE_ACUITY[acuity];
      senseDescription = ` (${senseType} - ${acuityConfig.description})`;
    }
    
    switch (state) {
      case 'suspicious':
        if (senseType === 'smell') {
          message = `You detect a faint scent ${direction}. Something might be there, but you can't pinpoint it.`;
        } else if (senseType === 'hearing') {
          message = `You hear something ${direction}, but it's too vague to locate precisely.`;
        } else {
          message = `You sense movement ${direction}. Something might be there.`;
        }
        break;
      case 'lastKnownArea':
        if (reason === 'line-of-sight') {
          message = `You glimpse ${actor.name} ${direction}, but lose sight of their exact position.`;
        } else if (senseType === 'hearing') {
          message = `You hear ${actor.name} ${direction}. You know roughly where they are but need to target carefully (DC 11 flat check).`;
        } else if (senseType === 'scent') {
          message = `You catch ${actor.name}'s scent ${direction}. You can track their general area but not their exact position.`;
        } else if (senseType === 'tremorsense') {
          message = `You feel vibrations from ${actor.name} ${direction}. You sense their movement but not precise location.`;
        } else {
          message = `You have a general sense of ${actor.name} ${direction}.`;
        }
        break;
      case 'observed':
        if (senseType === 'vision') {
          message = `You can clearly see ${actor.name} ${direction}.`;
        } else if (senseType === 'darkvision') {
          message = `Your darkvision reveals ${actor.name} ${direction}.`;
        } else if (senseType === 'echolocation') {
          message = `Your echolocation pinpoints ${actor.name} ${direction}.`;
        } else if (senseType === 'lifesense') {
          message = `Your lifesense detects ${actor.name} ${direction}.`;
        } else {
          message = `You can precisely locate ${actor.name} ${direction}.`;
        }
        break;
    }

    return {
      content: `<div class="pf2e-visioner-awareness-whisper">
        <h4><i class="${stateConfig.icon}"></i> ${game.i18n.localize(stateConfig.label)}</h4>
        <p>${message}</p>
        <small><strong>Detection:</strong> ${game.i18n.localize(stateConfig.description)}${senseDescription}</small>
        ${fuzzyRadius > 0 ? `<small><br/><strong>Area:</strong> ~${fuzzyRadius}ft radius</small>` : ''}
      </div>`,
      whisper: this._getObserverUserIds(observer),
      speaker: { alias: 'PF2e Awareness System' },
      flags: {
        [MODULE_ID]: {
          awarenessWhisper: true,
          sourceToken: actor.id,
          targetToken: observer.id,
          state,
          reason,
          senseType,
          acuity
        }
      }
    };
  }

  /**
   * Get directional description between tokens
   * @param {Token} observer - The observing token
   * @param {Token} target - The target token
   * @returns {string} Direction description
   */
  _getDirectionDescription(observer, target) {
    const dx = target.center.x - observer.center.x;
    const dy = target.center.y - observer.center.y;
    
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const normalizedAngle = ((angle + 360) % 360);
    
    if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) return 'to the east';
    if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) return 'to the southeast';
    if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) return 'to the south';
    if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) return 'to the southwest';
    if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) return 'to the west';
    if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) return 'to the northwest';
    if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) return 'to the north';
    if (normalizedAngle >= 292.5 && normalizedAngle < 337.5) return 'to the northeast';
    
    return 'nearby';
  }

  /**
   * Update visual awareness overlays (client-side only, like hidden wall overlays)
   * @param {Array} results - Awareness results
   */
  _updateAwarenessOverlays(results, actor) {
    if (!game.settings.get(MODULE_ID, 'awarenessShowFuzzyMarkers')) return;

    // Safety check for undefined actor
    if (!actor) {
      console.warn(`PF2E Visioner | Cannot update awareness overlays - actor is undefined`);
      return;
    }

    console.log(`PF2E Visioner | Updating awareness overlays:`, {
      resultsCount: results.length,
      actor: actor.name,
      results: results.map(r => ({
        observer: r.observer?.name,
        state: r.state,
        hasPlayerOwner: r.observer?.actor?.hasPlayerOwner
      }))
    });

    // Clear existing overlays first
    this._clearAwarenessOverlays();

    // Filter results to only those with player observers
    const playerResults = results.filter(result => 
      result.observer?.actor?.hasPlayerOwner
    );

    if (playerResults.length === 0) {
      console.log(`PF2E Visioner | No player observers found, skipping overlays`);
      return;
    }

    // Create overlays directly on this client (like hidden wall overlays)
    for (const result of playerResults) {
      this._createFuzzyMarkerOverlay(actor, result);
    }
  }

  /**
   * Create a fuzzy marker overlay for awareness (like hidden wall overlays)
   * @param {Token} actor - The target token (the one being observed)
   * @param {Object} result - Awareness result
   */
  _createFuzzyMarkerOverlay(actor, result) {
    // Safety check for undefined actor
    if (!actor) {
      console.warn(`PF2E Visioner | Cannot create fuzzy overlay - actor is undefined`);
      return;
    }

    const { state, fuzzyRadius, exactPosition } = result;
    const stateConfig = AWARENESS_STATES[state];
    
    console.log(`PF2E Visioner | Creating fuzzy overlay:`, {
      actor: actor.name,
      state,
      actorPos: { x: actor.center.x, y: actor.center.y }
    });
    
    // Safety check for undefined state
    if (!stateConfig) {
      console.warn(`PF2E Visioner | Unknown awareness state: ${state}. Available states:`, Object.keys(AWARENESS_STATES));
      return;
    }
    
    // Convert CSS custom property to actual color value
    const color = this._resolveCSSColor(stateConfig.color);
    
    // Create client-side overlay
    const overlay = new PIXI.Graphics();
    overlay.lineStyle(2, color, 0.8);
    overlay.beginFill(color, 0.1);
    
    if (exactPosition) {
      // Small precise marker
      overlay.drawCircle(0, 0, canvas.grid.size * 0.25);
    } else {
      // Fuzzy area marker
      const pixelRadius = (fuzzyRadius / 5) * canvas.grid.size;
      overlay.drawCircle(0, 0, pixelRadius);
      
      // Add border for uncertainty (solid line since PIXI doesn't support dashed lines easily)
      overlay.lineStyle(2, color, 0.5);
      overlay.drawCircle(0, 0, pixelRadius);
    }
    
    overlay.endFill();
    overlay.position.set(actor.center.x, actor.center.y);
    
    console.log(`PF2E Visioner | Overlay positioned at:`, { x: actor.center.x, y: actor.center.y });
    
    // Add to interface layer (client-only)
    canvas.interface.addChild(overlay);
    
    // Store reference on the actor token (like hidden wall overlays)
    actor._pvAwarenessOverlay = overlay;
  }

  /**
   * Clear all awareness overlays (like hidden wall overlays)
   */
  _clearAwarenessOverlays() {
    // Clear overlays from all tokens (like removeEcho function)
    for (const token of canvas.tokens.placeables) {
      this._removeAwarenessOverlay(token);
    }
  }

  /**
   * Remove awareness overlay from a specific token (like removeEcho)
   * @param {Token} token - The token to remove overlay from
   */
  _removeAwarenessOverlay(token) {
    try {
      if (token?._pvAwarenessOverlay) {
        token._pvAwarenessOverlay.parent?.removeChild(token._pvAwarenessOverlay);
        token._pvAwarenessOverlay.destroy?.();
      }
    } catch (_) {}
    token._pvAwarenessOverlay = null;
  }

  /**
   * Log propagation results to GM
   * @param {Token} actor - The acting token
   * @param {string} action - The action type
   * @param {Array} results - Propagation results
   */
  _logPropagationToGM(actor, action, results) {
    if (!game.user.isGM) return;
    
    const logData = {
      actor: actor.name,
      action,
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        observer: r.observer.name,
        state: r.state,
        reason: r.reason,
        senseType: r.senseType || 'none',
        acuity: r.acuity || 'none',
        distance: this._calculateDistance(actor, r.observer),
        fuzzyRadius: r.fuzzyRadius
      }))
    };
    
    console.log('PF2E Visioner | Awareness Propagation:', logData);
    
    // Optional: Create GM-only chat message
    game.messages.create({
      content: `<div class="pf2e-visioner-gm-log">
        <h4>Awareness Propagation Log</h4>
        <p><strong>${actor.name}</strong> performed <em>${action}</em></p>
        <ul>
          ${results.map(r => `<li>${r.observer.name}: ${r.state} (${r.reason})</li>`).join('')}
        </ul>
      </div>`,
      whisper: [game.user.id],
      speaker: { alias: 'Awareness System' }
    });
  }

  /**
   * Clean up awareness data for a token
   * @param {string} tokenId - The token ID to clean up
   */
  async cleanupAwarenessForToken(tokenId) {
    const updates = [];
    
    for (const token of canvas.tokens.placeables) {
      const awarenessData = token.document.getFlag(MODULE_ID, 'awareness');
      if (awarenessData && awarenessData[tokenId]) {
        updates.push({
          _id: token.id,
          [`flags.${MODULE_ID}.awareness.-=${tokenId}`]: null
        });
      }
    }
    
    if (updates.length > 0) {
      await canvas.scene.updateEmbeddedDocuments('Token', updates);
    }
  }

  /**
   * Get awareness data for a token
   * @param {Token} token - The token
   * @returns {Object} Awareness data
   */
  getAwarenessData(token) {
    return token.document.getFlag(MODULE_ID, 'awareness') || {};
  }

  /**
   * Create visual overlays for awareness markers
   * @param {Array} results - Awareness propagation results
   */
  async _createVisualOverlays(results) {
    if (!game.settings.get(MODULE_ID, 'awarenessShowFuzzyMarkers')) return;

    // Clear existing awareness overlays
    this._clearAwarenessOverlays();

    for (const result of results) {
      if (result.state === 'suspicious' || result.state === 'lastKnownArea') {
        await this._createFuzzyMarker(result);
      }
    }
  }

  /**
   * Create a fuzzy awareness marker
   * @param {Object} result - Awareness result
   */
  async _createFuzzyMarker(result) {
    const observer = result.observer;
    if (!observer) return;

    const graphics = new PIXI.Graphics();
    const radius = (result.fuzzyRadius || 10) * canvas.grid.size / canvas.grid.distance;

    // Get color based on awareness state
    let fillColor = 0xffc107; // Default yellow
    let strokeColor = 0xffc107;
    
    if (result.state === 'suspicious') {
      fillColor = strokeColor = 0xffc107; // Yellow
    } else if (result.state === 'lastKnownArea') {
      fillColor = strokeColor = 0x2196f3; // Blue
    }

    // Draw fuzzy circle
    graphics.beginFill(fillColor, 0.2);
    graphics.lineStyle(2, strokeColor, 0.6);
        graphics.drawCircle(observer.x, observer.y, radius);
    graphics.endFill();

    // Add to canvas
    graphics.zIndex = 100;
    graphics.name = `awareness-overlay-${observer.id}`;
    canvas.interface.addChild(graphics);

    // Store reference for cleanup
    if (!this._awarenessOverlays) this._awarenessOverlays = [];
    this._awarenessOverlays.push(graphics);
    
    console.log(`PF2E Visioner | Created fuzzy marker for ${observer.name} at (${observer.x}, ${observer.y}) with radius ${radius}`);
  }

  /**
   * Create a Ray object for line-of-sight calculations
   * @param {Point} p1 - Start point
   * @param {Point} p2 - End point
   * @returns {Ray} Ray object for collision detection
   */
  _createRay(p1, p2) {
    try {
      return new foundry.canvas.geometry.Ray(p1, p2);
    } catch (e) {
      // Fallback for older Foundry versions
      return new globalThis.Ray(p1, p2);
    }
  }

  /**
   * Resolve CSS custom property to actual color value
   * @param {string} cssColor - CSS color value (may include custom properties)
   * @returns {number} PIXI color value
   */
  _resolveCSSColor(cssColor) {
    console.log(`PF2E Visioner | Resolving CSS color: ${cssColor}`);
    
    // If it's already a hex color, convert it
    if (cssColor.startsWith('#')) {
      const hexValue = parseInt(cssColor.substring(1), 16);
      console.log(`PF2E Visioner | Converted hex color: ${cssColor} -> ${hexValue}`);
      return hexValue;
    }
    
    // If it's a CSS custom property, try to resolve it
    if (cssColor.startsWith('var(')) {
      // Extract the custom property name and fallback
      const match = cssColor.match(/var\(--([^,]+),\s*([^)]+)\)/);
      if (match) {
        const [, propName, fallback] = match;
        console.log(`PF2E Visioner | CSS var: prop=${propName}, fallback=${fallback}`);
        
        // Try to get the computed value from the document
        const computedValue = getComputedStyle(document.documentElement)
          .getPropertyValue(`--${propName}`).trim();
        
        console.log(`PF2E Visioner | Computed value: "${computedValue}"`);
        
        // Use computed value if available and not empty, otherwise use fallback
        const colorValue = (computedValue && computedValue !== '') ? computedValue : fallback;
        console.log(`PF2E Visioner | Using color value: ${colorValue}`);
        
        // Convert to hex if it's a hex color
        if (colorValue.startsWith('#')) {
          const hexValue = parseInt(colorValue.substring(1), 16);
          console.log(`PF2E Visioner | Converted fallback hex: ${colorValue} -> ${hexValue}`);
          return hexValue;
        }
      }
    }
    
    // Fallback to a default color (green)
    console.log(`PF2E Visioner | Using default fallback color: 0x4caf50`);
    return 0x4caf50;
  }
}

// Export singleton instance
export const awarenessService = new AwarenessPropagationService();
