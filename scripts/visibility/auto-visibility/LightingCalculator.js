/**
 * Handles all lighting-related calculations for the auto-visibility system
 * Manages light sources, token light emission, scene darkness, and caching
 * SINGLETON PATTERN
 */

import { MODULE_ID } from '../../constants.js';

export class LightingCalculator {
  /** @type {LightingCalculator} */
  static #instance = null;

  #lightEmittingTokensCache = null;
  #lightCacheTimestamp = 0;
  #lightCacheTimeout = 250; // 250ms cache for faster response

  constructor() {
    if (LightingCalculator.#instance) {
      return LightingCalculator.#instance;
    }

    this.#lightEmittingTokensCache = null;
    this.#lightCacheTimestamp = 0;

    LightingCalculator.#instance = this;
  }

  /**
   * Get the singleton instance
   * @returns {LightingCalculator}
   */
  static getInstance() {
    if (!LightingCalculator.#instance) {
      LightingCalculator.#instance = new LightingCalculator();
    }
    return LightingCalculator.#instance;
  }

  /**
   * Get the light level at a specific position
   * @param {Object} position - {x, y} coordinates
   * @returns {Object} Light level information
   */
  getLightLevelAt(position) {

    const sceneDarkness = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;

    // Determine if the scene actually has global illumination enabled.
    // If not, there should be no base illumination and only light sources contribute.
    // v13+: Use environment.globalLight.enabled; fall back to hasGlobalIllumination for older scenes
    const hasGlobalIllumination =
      canvas.scene?.environment?.globalLight?.enabled ??
      canvas.scene?.hasGlobalIllumination ??
      false;

    // Start with base illumination only when global illumination is active
    // Foundry determines dark to be 75% or higher darkness
    // Addition of global dim lighting requires addtion of a scene-wide setting.
    // This also doesn't take darkness regions into consideration.
    const DARK = 0;
    const DIM = 1;
    const BRIGHT = 2;
    const FOUNDRY_DARK = 0.25;
    const baseIllumination = hasGlobalIllumination ? 1.0 - sceneDarkness : 0.0;

    function makeIlluminationResult(illumination) { 
      const LIGHT_LEVELS = ['darkness','dim','bright' ];
      const LIGHT_THRESHOLDS = [0.0, 0.5, 1.0];
      return {
        level: LIGHT_LEVELS[illumination],
        illumination,
        sceneDarkness,
        baseIllumination,
        lightIllumination: LIGHT_THRESHOLDS[illumination],
      };
    }
    let illumination = baseIllumination > FOUNDRY_DARK ? BRIGHT : DARK;

    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];

    // Convert light radii from scene units (feet) to pixels for distance comparison
    const pixelsPerGridSquare = canvas.grid?.size || 100;
    const unitsPerGridSquare = canvas.scene?.grid?.distance || 5;
    const pixelsPerUnit = pixelsPerGridSquare / unitsPerGridSquare;

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      // Check if this is a darkness source first before filtering
      const isDarknessSource = light.isDarknessSource || light.document?.config?.negative || false;

      // Skip disabled lights
      if (light.document.hidden || !light.emitsLight)
        continue;

      // Try multiple property paths for light radius FIRST
      const brightRadius =
        light.document.config?.bright || light.document.bright || light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || light.document.dim || light.config?.dim || 0;

      // Use the correct coordinate properties - light.x and light.y (not light.center)
      const lightX = light.x || light.document.x;
      const lightY = light.y || light.document.y;

      // Calculated distances are in squared pixel units
      const distanceSquared = 
        Math.pow(position.x - lightX, 2) + Math.pow(position.y - lightY, 2) ;
      const brightRadiusSquared = Math.pow(brightRadius * pixelsPerUnit, 2);
      const dimRadiusSquared = Math.pow(dimRadius * pixelsPerUnit, 2);

      // Handle darkness sources (they eliminate illumination)
      // For darkness sources, both bright and dim areas provide full darkness
      if (isDarknessSource) {
        if (distanceSquared <= brightRadiusSquared || distanceSquared <= dimRadiusSquared) {
          return makeIlluminationResult(DARK);
        }
      } else {
        // Handle normal light sources (they increase illumination) - use pixel-converted radii
        if (distanceSquared <= brightRadiusSquared) {
          // can't return right away because darkness source trumps this
          illumination = BRIGHT;
        } else if (distanceSquared <= dimRadiusSquared) {
          illumination = Math.max(illumination, DIM); // Dim light
        }
      }
    }

    // If we were in a darkness source then we've already returned DARK
    // If we find ourselves in BRIGHT illumination we can return immediately
    if (illumination === BRIGHT) 
      return makeIlluminationResult(BRIGHT);

    // Check light-emitting tokens using cached results
    const lightEmittingTokens = this.#getLightEmittingTokens();
    for (const tokenInfo of lightEmittingTokens) {
      const distanceSquared = 
        Math.pow(position.x - tokenInfo.x, 2) + Math.pow(position.y - tokenInfo.y, 2) ;

      const brightRadiusSquared = Math.pow(tokenInfo.brightRadius * pixelsPerUnit, 2);
      const dimRadiusSquared = Math.pow(tokenInfo.dimRadius * pixelsPerUnit, 2);

      if (distanceSquared <= brightRadiusSquared) {
        return makeIlluminationResult(BRIGHT);
      } else if (distanceSquared <= dimRadiusSquared) {
        // no need for max here since BRIGHT case already returned
        illumination = DIM;
      }
    }

    return makeIlluminationResult(illumination);
  }

  /**
   * Get cached light-emitting tokens or refresh cache if expired
   * @returns {Array} Array of light-emitting token information
   */
  #getLightEmittingTokens() {
    const now = Date.now();

    // Return cached results if still valid
    if (
      this.#lightEmittingTokensCache &&
      now - this.#lightCacheTimestamp < this.#lightCacheTimeout
    ) {
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

    this.#lightEmittingTokensCache = tokens
      .filter((token) => {
        if (!token?.document) return false;

        // Check multiple property paths for light emission
        const brightRadius =
          token.document.light?.bright ||
          token.light?.bright ||
          token.document.config?.light?.bright ||
          token.document.data?.light?.bright ||
          token.data?.light?.bright ||
          0;
        const dimRadius =
          token.document.light?.dim ||
          token.light?.dim ||
          token.document.config?.light?.dim ||
          token.document.data?.light?.dim ||
          token.data?.light?.dim ||
          0;

        // Don't treat vision range as light emission - only actual light sources count
        const hasLight = brightRadius > 0 || dimRadius > 0;

        // Debug logging for each token if debug mode is on (only for tokens with light)

        return hasLight;
      })
      .map((token) => ({
        name: token.name,
        x: token.center.x,
        y: token.center.y,
        brightRadius:
          token.document.light?.bright ||
          token.light?.bright ||
          token.document.config?.light?.bright ||
          token.document.data?.light?.bright ||
          token.data?.light?.bright ||
          0,
        dimRadius:
          token.document.light?.dim ||
          token.light?.dim ||
          token.document.config?.light?.dim ||
          token.document.data?.light?.dim ||
          token.data?.light?.dim ||
          0,
      }));

    this.#lightCacheTimestamp = Date.now();
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
}
