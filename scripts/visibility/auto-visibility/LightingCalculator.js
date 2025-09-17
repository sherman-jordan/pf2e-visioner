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

    // Start with base illumination only when global illumination is active.
    // In bright daylight (darkness = 0), base illumination is 1 (bright)
    // In complete darkness (darkness = 1), base illumination is 0
    let baseIllumination = hasGlobalIllumination ? Math.max(0, 1 - sceneDarkness) : 0;

    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];

    let maxLightIllumination = 0;
    let darknessReduction = 0; // Track darkness sources

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      // Check if this is a darkness source first before filtering
      const isDarknessSource = light.isDarknessSource || light.document?.config?.negative || false;

      // Skip only if (hidden AND not a darkness source) OR (doesn't emit light AND isn't a darkness source)
      if ((light.document.hidden && !isDarknessSource) || (!light.emitsLight && !isDarknessSource))
        continue;

      // Try multiple property paths for light radius FIRST
      const brightRadius =
        light.document.config?.bright || light.document.bright || light.config?.bright || 0;
      const dimRadius = light.document.config?.dim || light.document.dim || light.config?.dim || 0;

      // Use the correct coordinate properties - light.x and light.y (not light.center)
      const lightX = light.x || light.document.x;
      const lightY = light.y || light.document.y;

      const distance = Math.sqrt(
        Math.pow(position.x - lightX, 2) + Math.pow(position.y - lightY, 2),
      );

      // Convert light radii from scene units (feet) to pixels for distance comparison
      const pixelsPerGridSquare = canvas.grid?.size || 100;
      const feetPerGridSquare = canvas.scene?.grid?.distance || 5;
      const pixelsPerFoot = pixelsPerGridSquare / feetPerGridSquare;

      const brightRadiusPixels = Math.abs(brightRadius) * pixelsPerFoot;
      const dimRadiusPixels = Math.abs(dimRadius) * pixelsPerFoot;

      // isDarknessSource already detected above for filtering

      if (isDarknessSource) {

        // Handle darkness sources (they reduce illumination) - use pixel-converted radii
        // For darkness sources, both bright and dim areas provide full darkness
        if (distance <= brightRadiusPixels) {
          darknessReduction = Math.max(darknessReduction, 1); // Full darkness
        } else if (distance <= dimRadiusPixels) {
          darknessReduction = Math.max(darknessReduction, 1); // Full darkness (same as bright)
        }
      } else {
        // Handle normal light sources (they increase illumination) - use pixel-converted radii
        if (distance <= brightRadiusPixels) {
          maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
        } else if (distance <= dimRadiusPixels) {
          maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
        }
      }
    }

    // Check light-emitting tokens using cached results
    const lightEmittingTokens = this.#getLightEmittingTokens();

    for (const tokenInfo of lightEmittingTokens) {
      const distance = Math.sqrt(
        Math.pow(position.x - tokenInfo.x, 2) + Math.pow(position.y - tokenInfo.y, 2),
      );

      // Convert token radii from scene units to pixels (same as dedicated light sources)
      const pixelsPerGridSquare = canvas.grid?.size || 100;
      const feetPerGridSquare = canvas.scene?.grid?.distance || 5;
      const pixelsPerFoot = pixelsPerGridSquare / feetPerGridSquare;

      const brightRadiusPixels = tokenInfo.brightRadius * pixelsPerFoot;
      const dimRadiusPixels = tokenInfo.dimRadius * pixelsPerFoot;

      if (distance <= brightRadiusPixels) {
        maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
      } else if (distance <= dimRadiusPixels) {
        maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
      }
    }

  // Final illumination is the maximum of base and light sources, reduced by darkness sources
    let finalIllumination = Math.max(baseIllumination, maxLightIllumination);

    // Apply darkness reduction (darkness sources reduce illumination)
    finalIllumination = Math.max(0, finalIllumination - darknessReduction);

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
      lightIllumination: maxLightIllumination,
    };

    return result;
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
