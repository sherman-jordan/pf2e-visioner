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
    const debugMode = game.settings.get(MODULE_ID, 'autoVisibilityDebugMode');

    const sceneDarkness = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;

    // Start with base illumination based on scene darkness
    // In bright daylight (darkness = 0), base illumination is 1 (bright)
    // In complete darkness (darkness = 1), base illumination is 0
    let baseIllumination = Math.max(0, 1 - sceneDarkness);

    // Check if position is illuminated by any light sources OR light-emitting tokens
    const lightSources = canvas.lighting?.placeables || [];

    // Only log when darkness sources are found for debugging
    const hasDarknessSources = lightSources.some(
      (light) => light.isDarknessSource || light.document?.config?.negative,
    );
    if (debugMode && hasDarknessSources) {
      console.log(`${MODULE_ID} | 🌑 DARKNESS SOURCES DETECTED at (${position.x}, ${position.y})`);
    }

    let maxLightIllumination = 0;
    let darknessReduction = 0; // Track darkness sources

    // Check dedicated light sources first (including darkness sources)
    for (const light of lightSources) {
      // Check if this is a darkness source first before filtering
      const isDarknessSource = light.isDarknessSource || light.document?.config?.negative || false;

      // Debug filtering decision
      if (debugMode && isDarknessSource) {
        console.log(`${MODULE_ID} | 🔧 DARKNESS SOURCE FILTERING:`, {
          'light.id': light.id,
          isDarknessSource: isDarknessSource,
          'light.document.hidden': light.document.hidden,
          'light.emitsLight': light.emitsLight,
          'will be filtered?':
            (light.document.hidden && !isDarknessSource) ||
            (!light.emitsLight && !isDarknessSource),
        });
      }

      // Skip only if (hidden AND not a darkness source) OR (doesn't emit light AND isn't a darkness source)
      if ((light.document.hidden && !isDarknessSource) || (!light.emitsLight && !isDarknessSource))
        continue;

      // Debug light center coordinates
      if (debugMode && isDarknessSource) {
        console.log(`${MODULE_ID} | 🗺️ DARKNESS SOURCE COORDS:`, {
          'light.center': light.center,
          'light.x': light.x,
          'light.y': light.y,
          'light.document.x': light.document.x,
          'light.document.y': light.document.y,
        });
      }

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

      // Debug coordinate calculation with unit conversion
      if (debugMode) {
        console.log(`${MODULE_ID} | 🔍 COORDINATE DEBUG:`, {
          lightX: lightX,
          lightY: lightY,
          'token position': position,
          'calculated distance (pixels)': distance.toFixed(1),
          'brightRadius (feet)': Math.abs(brightRadius),
          'dimRadius (feet)': Math.abs(dimRadius),
          'brightRadius (pixels)': brightRadiusPixels.toFixed(1),
          'dimRadius (pixels)': dimRadiusPixels.toFixed(1),
          'should be in range?': distance <= dimRadiusPixels,
          pixelsPerFoot: pixelsPerFoot,
        });
      }

      // isDarknessSource already detected above for filtering

      // Debug log all light properties to understand the structure
      if (debugMode) {
        console.log(`${MODULE_ID} | Light source properties:`, {
          id: light.id,
          lightPos: `(${light.document.x}, ${light.document.y})`,
          tokenPos: `(${position.x}, ${position.y})`,
          brightRadius,
          dimRadius,
          distance: distance.toFixed(1),
          isDarknessSource,
          inBrightRange: distance <= Math.abs(brightRadius),
          inDimRange: distance <= Math.abs(dimRadius),
          'light.isDarknessSource': light.isDarknessSource,
          'light.document.config.negative': light.document?.config?.negative,
        });
      }

      if (isDarknessSource) {
        if (debugMode) {
          console.log(
            `${MODULE_ID} | DARKNESS SOURCE FOUND! ID: ${light.id}, Distance: ${distance.toFixed(1)}, Bright: ${brightRadius}, Dim: ${dimRadius}`,
          );
        }

        // Handle darkness sources (they reduce illumination) - use pixel-converted radii
        // For darkness sources, both bright and dim areas provide full darkness
        if (distance <= brightRadiusPixels) {
          darknessReduction = Math.max(darknessReduction, 1); // Full darkness
          if (debugMode) {
            console.log(
              `${MODULE_ID} | Token in BRIGHT DARKNESS area - applying full darkness reduction`,
            );
          }
        } else if (distance <= dimRadiusPixels) {
          darknessReduction = Math.max(darknessReduction, 1); // Full darkness (same as bright)
          if (debugMode) {
            console.log(
              `${MODULE_ID} | Token in DIM DARKNESS area - applying full darkness reduction`,
            );
          }
        }

        if (debugMode && (distance <= brightRadiusPixels || distance <= dimRadiusPixels)) {
          console.log(
            `${MODULE_ID} | 🌑 DARKNESS affecting token at distance ${distance.toFixed(1)} pixels`,
          );
        } else if (debugMode) {
          console.log(
            `${MODULE_ID} | 🌑 Token OUTSIDE darkness range: distance ${distance.toFixed(1)} pixels > radius ${dimRadiusPixels.toFixed(1)} pixels`,
          );
        }
      } else {
        // Handle normal light sources (they increase illumination) - use pixel-converted radii
        if (distance <= brightRadiusPixels) {
          maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
          if (debugMode) {
            console.log(
              `${MODULE_ID} | 🔦 LIGHT SOURCE ${light.id} provides BRIGHT light at distance ${distance.toFixed(1)} pixels`,
            );
          }
        } else if (distance <= dimRadiusPixels) {
          maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
          if (debugMode) {
            console.log(
              `${MODULE_ID} | 🔦 LIGHT SOURCE ${light.id} provides DIM light at distance ${distance.toFixed(1)} pixels`,
            );
          }
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

      // Debug token light calculation
      if (debugMode) {
        console.log(`${MODULE_ID} | 🔦 TOKEN LIGHT CHECK: ${tokenInfo.name}`, {
          'token position': `(${tokenInfo.x}, ${tokenInfo.y})`,
          'check position': `(${position.x}, ${position.y})`,
          'distance (pixels)': distance.toFixed(1),
          'brightRadius (feet)': tokenInfo.brightRadius,
          'dimRadius (feet)': tokenInfo.dimRadius,
          'brightRadius (pixels)': brightRadiusPixels.toFixed(1),
          'dimRadius (pixels)': dimRadiusPixels.toFixed(1),
          'in bright range?': distance <= brightRadiusPixels,
          'in dim range?': distance <= dimRadiusPixels,
        });
      }

      if (distance <= brightRadiusPixels) {
        maxLightIllumination = Math.max(maxLightIllumination, 1); // Bright light
        if (debugMode) {
          console.log(
            `${MODULE_ID} | 🔦 TOKEN ${tokenInfo.name} provides BRIGHT light at distance ${distance.toFixed(1)} pixels`,
          );
        }
      } else if (distance <= dimRadiusPixels) {
        maxLightIllumination = Math.max(maxLightIllumination, 0.5); // Dim light
        if (debugMode) {
          console.log(
            `${MODULE_ID} | 🔦 TOKEN ${tokenInfo.name} provides DIM light at distance ${distance.toFixed(1)} pixels`,
          );
        }
      }
    }

    // Final illumination is the maximum of base and light sources, reduced by darkness sources
    let finalIllumination = Math.max(baseIllumination, maxLightIllumination);

    // Apply darkness reduction (darkness sources reduce illumination)
    finalIllumination = Math.max(0, finalIllumination - darknessReduction);

    if (debugMode && darknessReduction > 0) {
      console.log(
        `${MODULE_ID} | 🌑 DARKNESS applied: reduction ${darknessReduction} → final illumination ${finalIllumination}`,
      );
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

    // Debug final light level determination
    if (debugMode) {
      console.log(
        `${MODULE_ID} | 💡 LIGHT CALC RESULT: position(${position.x}, ${position.y}) → level="${lightLevel}" illumination=${finalIllumination}`,
      );
    }

    const result = {
      level: lightLevel,
      illumination: finalIllumination,
      sceneDarkness,
      baseIllumination,
      lightIllumination: maxLightIllumination,
    };

    // Only log when darkness is detected for debugging
    if (debugMode && lightLevel === 'darkness') {
      console.log(`${MODULE_ID} | 🌑 DARKNESS LEVEL detected at (${position.x}, ${position.y})`);
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

    if (debugMode) {
      console.log(`${MODULE_ID} | Checking ${tokens.length} tokens for light emission...`);
    }

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
        if (debugMode && hasLight) {
          console.log(`${MODULE_ID} | Token ${token.name} light check:`, {
            brightRadius,
            dimRadius,
            hasLight,
            tokenLight: token.document.light,
            tokenData: token.document.data?.light,
            tokenConfig: token.document.config?.light,
            sight: token.document.sight,
            // Additional debugging for PF2e-specific properties
            actor: token.actor?.name,
            actorEffects: token.actor?.effects?.map((e) => e.name) || [],
            lightEffects:
              token.actor?.effects
                ?.filter((e) => e.name?.toLowerCase().includes('light'))
                ?.map((e) => ({
                  name: e.name,
                  data: e.system,
                })) || [],
            // Check if there are any light-related flags
            flags: token.document.flags,
            // Check the full document structure
            fullDocument: token.document,
          });
        }

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

    if (debugMode) {
      console.log(
        `${MODULE_ID} | Refreshed light-emitting tokens cache: ${this.#lightEmittingTokensCache.length} tokens`,
      );
      if (this.#lightEmittingTokensCache.length > 0) {
        console.log(
          `${MODULE_ID} | Light-emitting tokens:`,
          this.#lightEmittingTokensCache.map(
            (t) => `${t.name} (bright: ${t.brightRadius}, dim: ${t.dimRadius})`,
          ),
        );
      }
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
      globalLight: canvas.scene?.globalLight ?? false,
      hasGlobalIllumination: canvas.scene?.hasGlobalIllumination ?? false,
      ambientLight: canvas.scene?.ambientLight ?? false,
      globalIllumination: canvas.scene?.globalIllumination ?? false,
      dedicatedLightSources: lightSources.length,
      lightEmittingTokens: lightEmittingTokens.length,
      lightEmittingTokensDetails: lightEmittingTokens,
    };
  }
}
