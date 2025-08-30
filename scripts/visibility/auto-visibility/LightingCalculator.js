/**
 * Handles all lighting-related calculations for the auto-visibility system
 * Manages light sources, token light emission, scene darkness, and caching
 */

import { MODULE_ID } from '../../constants.js';

export class LightingCalculator {
  #lightEmittingTokensCache = null;
  #lightCacheTimestamp = 0;
  #lightCacheTimeout = 1000; // 1 second cache

  constructor() {
    this.#lightEmittingTokensCache = null;
    this.#lightCacheTimestamp = 0;
  }

  /**
   * Get the light level at a specific position
   * @param {Object} position - {x, y} coordinates
   * @returns {Object} Light level information
   */
  getLightLevelAt(position) {
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    
    if (debugMode) {
      console.log(`${MODULE_ID} | Light level calculation at (${position.x}, ${position.y}):`, position);
    }
    
    const sceneDarkness = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;
    
    // Start with base illumination based on scene darkness
    // In bright daylight (darkness = 0), base illumination is 1 (bright)
    // In complete darkness (darkness = 1), base illumination is 0
    let baseIllumination = Math.max(0, 1 - sceneDarkness);
    
    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];
    let maxLightIllumination = 0;
    let darknessReduction = 0; // Track darkness sources

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      if (!light.emitsLight || light.document.hidden) continue;
      
      const distance = Math.sqrt(
        Math.pow(position.x - light.center.x, 2) + 
        Math.pow(position.y - light.center.y, 2)
      );
      
      // Try multiple property paths for light radius
      const brightRadius = light.document.config?.bright || 
                          light.document.bright || 
                          light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || 
                       light.document.dim || 
                       light.config?.dim || 0;
      
      // Check if this is a darkness source using the correct FoundryVTT property
      const isDarknessSource = light.isDarknessSource || light.document?.isDarknessSource || false;
      
      if (isDarknessSource) {
        // Handle darkness sources (they reduce illumination)
        if (distance <= Math.abs(brightRadius)) {
          darknessReduction = Math.max(darknessReduction, 1); // Strong darkness
        } else if (distance <= Math.abs(dimRadius)) {
          darknessReduction = Math.max(darknessReduction, 0.5); // Weak darkness
        }
        
        if (debugMode && (distance <= Math.abs(brightRadius) || distance <= Math.abs(dimRadius))) {
          console.log(`${MODULE_ID} | Darkness source detected at distance ${distance.toFixed(1)} (bright: ${Math.abs(brightRadius)}, dim: ${Math.abs(dimRadius)})`);
        }
      } else {
        // Handle normal light sources (they increase illumination)
        if (distance <= brightRadius) {
          maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
        } else if (distance <= dimRadius) {
          maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
        }
      }
    }

    // Check light-emitting tokens using cached results
    const lightEmittingTokens = this.#getLightEmittingTokens();
    
    if (debugMode && lightEmittingTokens.length > 0) {
      console.log(`${MODULE_ID} | Checking ${lightEmittingTokens.length} light-emitting tokens`);
    }

    for (const tokenInfo of lightEmittingTokens) {
      const distance = Math.sqrt(
        Math.pow(position.x - tokenInfo.x, 2) + 
        Math.pow(position.y - tokenInfo.y, 2)
      );
      
      if (debugMode) {
        console.log(`${MODULE_ID} | Light-emitting token "${tokenInfo.name}" at (${tokenInfo.x}, ${tokenInfo.y}):`, tokenInfo);
      }
      
      if (distance <= tokenInfo.brightRadius) {
        maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
      } else if (distance <= tokenInfo.dimRadius) {
        maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
      }
    }

    // Final illumination is the maximum of base and light sources, reduced by darkness sources
    let finalIllumination = Math.max(baseIllumination, maxLightIllumination);
    
    // Apply darkness reduction (darkness sources reduce illumination)
    finalIllumination = Math.max(0, finalIllumination - darknessReduction);
    
    if (debugMode && darknessReduction > 0) {
      console.log(`${MODULE_ID} | Applied darkness reduction: ${darknessReduction} (final illumination: ${finalIllumination})`);
    }
    
    // Determine light level category
    let lightLevel;
    if (finalIllumination >= 1) {
      lightLevel = 'bright';
    } else if (finalIllumination >= 0.5) {
      lightLevel = 'dim';
    } else {
      lightLevel = 'darkness';
    }

    const result = {
      level: lightLevel,
      illumination: finalIllumination,
      sceneDarkness,
      baseIllumination,
      lightIllumination: maxLightIllumination
    };

    if (debugMode) {
      console.log(`${MODULE_ID} | ${lightLevel.charAt(0).toUpperCase() + lightLevel.slice(1)} light detected`, result);
    }

    return result;
  }

  /**
   * Get cached light-emitting tokens or refresh cache if expired
   * @returns {Array} Array of light-emitting token information
   */
  #getLightEmittingTokens() {
    const now = Date.now();
    
    // Return cached results if still valid
    if (this.#lightEmittingTokensCache && (now - this.#lightCacheTimestamp) < this.#lightCacheTimeout) {
      return this.#lightEmittingTokensCache;
    }
    
    // Refresh cache
    this.#refreshLightEmittingTokensCache();
    return this.#lightEmittingTokensCache || [];
  }

  /**
   * Refresh the cache of light-emitting tokens
   */
  #refreshLightEmittingTokensCache() {
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');
    const tokens = canvas.tokens?.placeables || [];
    
    this.#lightEmittingTokensCache = tokens.filter(token => {
      if (!token?.document) return false;
      
      // Check multiple property paths for light emission
      const brightRadius = token.document.light?.bright || 
                          token.light?.bright || 
                          token.document.config?.light?.bright || 0;
      const dimRadius = token.document.light?.dim || 
                       token.light?.dim || 
                       token.document.config?.light?.dim || 0;
      
      return brightRadius > 0 || dimRadius > 0;
    }).map(token => ({
      name: token.name,
      x: token.center.x,
      y: token.center.y,
      brightRadius: token.document.light?.bright || 
                   token.light?.bright || 
                   token.document.config?.light?.bright || 0,
      dimRadius: token.document.light?.dim || 
                token.light?.dim || 
                token.document.config?.light?.dim || 0
    }));
    
    this.#lightCacheTimestamp = Date.now();
    
    if (debugMode) {
      console.log(`${MODULE_ID} | Refreshed light-emitting tokens cache: ${this.#lightEmittingTokensCache.length} tokens`);
    }
  }

  /**
   * Invalidate the light cache (call when lighting changes)
   */
  invalidateLightCache() {
    this.#lightEmittingTokensCache = null;
    this.#lightCacheTimestamp = 0;
  }

  /**
   * Clear the light cache (public API)
   */
  clearLightCache() {
    this.invalidateLightCache();
  }

  /**
   * Get debug information about lights at a position
   * @param {Object} position - {x, y} coordinates
   * @returns {Object} Debug information
   */
  getDebugInfo(position) {
    const lightLevel = this.getLightLevelAt(position);
    const lightSources = canvas.lighting?.placeables || [];
    const lightEmittingTokens = this.#getLightEmittingTokens();
    
    return {
      position,
      lightLevel,
      sceneDarkness: canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0,
      dedicatedLightSources: lightSources.length,
      lightEmittingTokens: lightEmittingTokens.length,
      lightEmittingTokensDetails: lightEmittingTokens
    };
  }
}
