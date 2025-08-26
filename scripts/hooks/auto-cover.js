/**
 * Auto-cover hooks wrapper (simplified)
 * All cover logic is handled in onPreCreateChatMessage for better maintainability.
 */

import { MODULE_ID } from '../constants.js';
console.debug('PF2E Visioner | MODULE_ID imported:', MODULE_ID);

import {
  detectCoverStateForAttack,
  detectCoverStateFromPoint,
  onPreCreateChatMessage,
  onRenderChatMessage,
  onRenderCheckModifiersDialog,
  onUpdateToken,
} from '../cover/auto-cover.js';
import {
  isAttackContext,
  resolveAttackerFromCtx,
  resolveTargetFromCtx,
} from '../cover/context-resolution.js';
import { getCoverBonusByState } from '../helpers/cover-helpers.js';

// Cover overrides are now stored in global window objects:
// - window.pf2eVisionerPopupOverrides (from popup)
// - window.pf2eVisionerDialogOverrides (from roll dialog)

export function registerAutoCoverHooks() {
  console.debug('PF2E Visioner | registerAutoCoverHooks called');
  Hooks.on('preCreateChatMessage', onPreCreateChatMessage);
  Hooks.on('renderChatMessageHTML', onRenderChatMessage);
  Hooks.on('renderCheckModifiersDialog', onRenderCheckModifiersDialog);
  Hooks.on('updateToken', onUpdateToken);

  // Store template data with their targets for reflex save calculations
  console.debug('PF2E Visioner | Initializing template data maps');
  if (!window.pf2eVisionerTemplateData) {
    window.pf2eVisionerTemplateData = new Map();
    console.debug('PF2E Visioner | Created new pf2eVisionerTemplateData map');
  } else {
    console.debug('PF2E Visioner | pf2eVisionerTemplateData map already exists', {
      size: window.pf2eVisionerTemplateData.size
    });
  }

  // Temporary map to track which templates are currently being processed for reflex saves
  if (!window.pf2eVisionerActiveReflexSaves) {
    window.pf2eVisionerActiveReflexSaves = new Map();
    console.debug('PF2E Visioner | Created new pf2eVisionerActiveReflexSaves map');
  } else {
    console.debug('PF2E Visioner | pf2eVisionerActiveReflexSaves map already exists', {
      size: window.pf2eVisionerActiveReflexSaves.size
    });
  }

  // Clean up old templates periodically (those older than 10 minutes)
  console.debug('PF2E Visioner | Registering ready hook for template cleanup');
  Hooks.on('ready', () => {
    console.debug('PF2E Visioner | Ready hook called for template cleanup');
    const cleanupInterval = setInterval(() => {
      try {
        if (!window.pf2eVisionerTemplateData) return;
        const now = Date.now();
        const oldTemplates = [];

        for (const [id, data] of window.pf2eVisionerTemplateData.entries()) {
          // Keep templates with active reflex saves regardless of age
          if (window.pf2eVisionerActiveReflexSaves?.has?.(id)) continue;

          // Remove templates older than 10 minutes
          if (now - data.timestamp > 600000) { // 10 minutes
            oldTemplates.push(id);
          }
        }

        // Only remove template data from our maps, don't delete templates from canvas
        for (const id of oldTemplates) {
          window.pf2eVisionerTemplateData.delete(id);
        }

        if (oldTemplates.length > 0) {
          console.debug('PF2E Visioner | Template data cleanup:', {
            removedCount: oldTemplates.length,
            remainingCount: window.pf2eVisionerTemplateData.size
          });
        }
      } catch (e) {
        console.error('PF2E Visioner | Error in template data cleanup:', e);
      }
    }, 60000); // Check every minute

    // Clean up interval when module is deactivated
    Hooks.once('closeGame', () => {
      if (cleanupInterval) clearInterval(cleanupInterval);
    });
  });

  // Hook into Measured Template creation (when template is added to the canvas)
  // Using createMeasuredTemplate instead of renderMeasuredTemplate as it's more reliably called
  console.debug('PF2E Visioner | Registering createMeasuredTemplate hook');
  Hooks.on('createMeasuredTemplate', async (document, options, userId) => {
    try {
      console.debug('PF2E Visioner | createMeasuredTemplate HOOK - START', {
        templateId: document?.id,
        templateDocument: document?.toJSON?.(),
        userId,
        isOwnUser: userId === game.userId
      });

      // Only process templates created by this user
      if (userId !== game.userId) {
        console.debug('PF2E Visioner | createMeasuredTemplate: skipping template from other user');
        return;
      }

      // Check if autoCover is enabled
      const autoCoverEnabled = game.settings.get(MODULE_ID, 'autoCover');
      console.debug('PF2E Visioner | autoCover setting:', autoCoverEnabled);

      if (!autoCoverEnabled) {
        console.debug('PF2E Visioner | autoCover is disabled, skipping template processing');
        return;
      }

      // Get template details
      const x = Number(document?.x ?? 0);
      const y = Number(document?.y ?? 0);
      const center = { x, y };
      const tType = String(document.t || document.type || 'circle');
      const radiusFeet = Number(document.distance) || 0;
      const dirDeg = Number(document.direction ?? 0);
      const halfAngle = Number(document.angle ?? 90) / 2;

      // Try to determine the caster/creator of the template
      let creator = null;
      let creatorId = null;
      let creatorType = 'unknown';

      // First, check if this is a spell template with a source actor
      if (document.flags?.pf2e?.origin?.type === 'spell') {
        // Get actor from document ID
        try {
          const originActorId = document.flags.pf2e.origin.actorId;
          const actor = game.actors.get(originActorId);

          if (actor) {
            // Find a token for this actor on the current scene
            const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
            if (tokens.length > 0) {
              creator = tokens[0];
              creatorId = creator.id;
              creatorType = 'spell-origin';
            } else {
              // Use actor ID if no token is found
              creatorId = `actor:${actor.id}`;
              creatorType = 'actor-only';
            }
          }
        } catch (e) {
          console.debug('PF2E Visioner | Error getting spell origin actor:', e);
        }
      }

      // If not found via spell origin, check for controlled token
      if (!creatorId) {
        creator = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0];
        if (creator) {
          creatorId = creator.id;
          creatorType = 'controlled';
        }
      }

      console.debug('PF2E Visioner | createMeasuredTemplate: Template creator determined', {
        creatorId,
        creatorType,
        creatorName: creator?.name || 'Unknown',
        templateId: document.id
      });

      // Find all tokens inside the template
      const gridSize = canvas.grid?.size || 100;
      const feetPerSquare = canvas.dimensions?.distance || 5;
      const radiusSquares = radiusFeet / feetPerSquare;
      const radiusWorld = radiusSquares * gridSize;

      const candidates = canvas.tokens.placeables.filter((t) => t?.actor);
      console.debug('PF2E Visioner | createMeasuredTemplate: checking tokens', {
        templateId: document.id,
        candidateCount: candidates.length,
        radiusFeet,
        radiusWorld,
        templateType: tType,
        center
      });

      const norm = (a) => ((a % 360) + 360) % 360;
      const angDist = (a, b) => {
        const d = Math.abs(norm(a) - norm(b));
        return d > 180 ? 360 - d : d;
      };

      const tokensInside = candidates.filter((t) => {
        try {
          const cx = (t.center?.x ?? t.x);
          const cy = (t.center?.y ?? t.y);
          const dx = cx - center.x;
          const dy = cy - center.y;
          const dist = Math.hypot(dx, dy);

          if (dist > radiusWorld + 1) return false;
          if (tType === 'cone') {
            const theta = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
            const delta = angDist(theta, dirDeg);
            return delta <= halfAngle + 0.5; // small tolerance
          }
          // Default: circle-like
          return true;
        } catch (_) {
          return false;
        }
      });

      console.debug('PF2E Visioner | createMeasuredTemplate: tokens inside template', {
        templateId: document.id,
        count: tokensInside.length,
        ids: tokensInside.map((t) => t.id),
      });

      // Calculate cover for each token inside and store in our template data map
      const targetData = {};
      const tokenIds = [];

      for (const token of tokensInside) {
        try {
          // Calculate cover from template center to token
          const { detectCoverStateFromPoint } = await import('../cover/auto-cover.js');
          const state = detectCoverStateFromPoint(center, token);
          const { getCoverBonusByState } = await import('../helpers/cover-helpers.js');
          const bonus = getCoverBonusByState(state) || 0;

          targetData[token.id] = {
            tokenId: token.id,
            tokenName: token.name,
            actorId: token.actor?.id,
            actorName: token.actor?.name,
            state,
            bonus,
            saveProcessed: false
          };

          tokenIds.push(token.id);

          console.debug('PF2E Visioner | createMeasuredTemplate: cover calculated', {
            templateId: document.id,
            tokenId: token.id,
            tokenName: token.name,
            state,
            bonus
          });
        } catch (e) {
          console.error('PF2E Visioner | Error calculating cover for token:', e);
        }
      }

      // Store template data with all targets inside it
      const templateData = {
        id: document.id,
        type: tType,
        center,
        radiusFeet,
        dirDeg,
        halfAngle,
        creatorId,
        creatorType,
        tokenIds,
        targets: targetData,
        timestamp: Date.now()
      };

      window.pf2eVisionerTemplateData.set(document.id, templateData);

      console.debug('PF2E Visioner | createMeasuredTemplate: template data stored', {
        templateId: document.id,
        targetCount: tokenIds.length,
        creatorId,
        timestamp: templateData.timestamp,
        templateDataSize: window.pf2eVisionerTemplateData.size,
        targetDataKeys: Object.keys(targetData)
      });

      // Backwards compatibility: also store in the old template origins map
      if (creatorId && creatorId.indexOf('actor:') !== 0) {
        if (!window.pf2eVisionerTemplateOrigins) window.pf2eVisionerTemplateOrigins = new Map();
        window.pf2eVisionerTemplateOrigins.set(creatorId, {
          point: center,
          shape: {
            t: tType,
            distance: radiusFeet,
            direction: dirDeg,
            angle: halfAngle * 2,
          },
          ts: Date.now(),
          templateId: document.id
        });

        console.debug('PF2E Visioner | Template origins map updated', {
          creatorId,
          templateOriginsMapSize: window.pf2eVisionerTemplateOrigins.size
        });
      }

      console.debug('PF2E Visioner | createMeasuredTemplate HOOK - END', {
        templateId: document.id,
        storedTokenCount: tokenIds.length
      });
    } catch (e) {
      console.error('PF2E Visioner | Error in createMeasuredTemplate hook:', e);
    }
  });

  // Hook into document updates for MeasuredTemplate
  console.debug('PF2E Visioner | Registering updateDocument hook for MeasuredTemplate');
  Hooks.on('updateDocument', (document, changes, options, userId) => {
    try {
      // Check if this is a MeasuredTemplate document
      if (document?.documentName === 'MeasuredTemplate') {
        console.debug('PF2E Visioner | updateDocument HOOK for MeasuredTemplate', {
          templateId: document?.id,
          changes,
          timestamp: Date.now()
        });

        // If position or shape changed, we might need to recalculate cover
        if (changes.x !== undefined || changes.y !== undefined ||
          changes.distance !== undefined || changes.direction !== undefined ||
          changes.angle !== undefined || changes.t !== undefined) {

          console.debug('PF2E Visioner | updateDocument: template shape/position changed, triggering recalculation', {
            templateId: document.id,
            changes
          });

          // Trigger recalculation by calling our create hook logic
          // This is a simplified version - in a real implementation we might want to optimize this
          // For now, we'll just log that a recalculation might be needed
        }
      }
    } catch (e) {
      console.error('PF2E Visioner | Error in updateDocument hook:', e);
    }
  });

  // Clean up template data when template is deleted
  console.debug('PF2E Visioner | Registering deleteDocument hook for MeasuredTemplate');
  Hooks.on('deleteDocument', (document, options, userId) => {
    try {
      // Check if this is a MeasuredTemplate document
      if (document?.documentName === 'MeasuredTemplate') {
        console.debug('PF2E Visioner | deleteDocument HOOK for MeasuredTemplate', {
          templateId: document?.id,
          timestamp: Date.now()
        });

        if (window.pf2eVisionerTemplateData && document?.id) {
          // Get template data before removing
          const templateData = window.pf2eVisionerTemplateData.get(document.id);

          // Check if this template is currently being used for reflex saves
          const isTemplateActiveForReflexSaves = window.pf2eVisionerActiveReflexSaves?.has?.(document.id);

          if (isTemplateActiveForReflexSaves) {
            // If the template is currently being used for reflex saves, don't delete it immediately
            // Instead, mark it for cleanup after a delay to allow reflex saves to be processed
            console.debug('PF2E Visioner | deleteDocument: template is active for reflex saves, scheduling delayed cleanup', {
              templateId: document.id,
              templateAge: templateData ? Date.now() - templateData.timestamp : 'unknown'
            });

            // Schedule cleanup after 10 seconds to allow reflex saves to be processed
            setTimeout(() => {
              try {
                if (window.pf2eVisionerTemplateData?.has?.(document.id)) {
                  console.debug('PF2E Visioner | deleteDocument: delayed cleanup of template data', {
                    templateId: document.id,
                    reason: 'timeout after reflex save processing'
                  });

                  // Remove from our maps
                  window.pf2eVisionerTemplateData.delete(document.id);

                  // Also clean up from active reflex saves tracking
                  if (window.pf2eVisionerActiveReflexSaves) {
                    window.pf2eVisionerActiveReflexSaves.delete(document.id);
                  }
                }
              } catch (e) {
                console.error('PF2E Visioner | Error in delayed template cleanup:', e);
              }
            }, 10000); // 10 seconds delay
          } else {
            // If the template is not being used for reflex saves, we can delete it immediately
            console.debug('PF2E Visioner | deleteDocument: template not active for reflex saves, immediate cleanup', {
              templateId: document.id
            });

            // Only remove from our maps, don't delete the actual template from canvas
            window.pf2eVisionerTemplateData.delete(document.id);

            // Also clean up from active reflex saves tracking
            if (window.pf2eVisionerActiveReflexSaves) {
              window.pf2eVisionerActiveReflexSaves.delete(document.id);
            }

            console.debug('PF2E Visioner | deleteDocument: template data removed from tracking maps', {
              templateId: document.id,
              hadData: !!templateData,
              remainingTemplates: window.pf2eVisionerTemplateData.size,
              templateData: templateData ? {
                targets: Object.keys(templateData.targets || {}),
                timestamp: templateData.timestamp
              } : null
            });
          }
        }
      }
    } catch (e) {
      console.error('PF2E Visioner | Error in deleteDocument hook:', e);
    }
  });

  // Simple libWrapper ONLY for popup detection - all other logic in onPreCreateChatMessage
  Hooks.on('pf2e.systemReady', () => {
    if (game.modules.get('lib-wrapper')?.active && typeof libWrapper?.register === 'function') {
      libWrapper.register(
        MODULE_ID,
        'game.pf2e.Check.roll',
        async function coverPopupWrapper(wrapped, check, context = {}, event = null, callback) {
          // CRITICAL DEBUG: Always log entry to verify wrapper is executing
          console.debug('PF2E Visioner | 🔧 POPUP WRAPPER ENTRY', {
            contextType: context?.type,
            contextStatistic: context?.statistic,
            contextDomains: context?.domains,
            contextActor: context?.actor?.name,
            hasCheck: !!check,
            autoCoverEnabled: game?.settings?.get?.(MODULE_ID, 'autoCover')
          });

          try {
            // Handle both attack contexts AND reflex save contexts
            const isAttackCtx = game?.settings?.get?.(MODULE_ID, 'autoCover') && isAttackContext(context);
            const isReflexSaveCtx = game?.settings?.get?.(MODULE_ID, 'autoCover') &&
              context?.type === 'saving-throw' &&
              (context?.statistic === 'reflex' ||
                (Array.isArray(context?.domains) && context.domains.includes('reflex')));
            const isStealthCheck = game?.settings?.get?.(MODULE_ID, 'autoCover') &&
              context?.type === 'skill-check' &&
              (context?.skill === 'stealth' ||
                (Array.isArray(context?.domains) && context.domains.includes('stealth')));

            console.debug('PF2E Visioner | 🎯 CONTEXT ANALYSIS', {
              isAttackCtx,
              isReflexSaveCtx,
              isStealthCheck,
              contextType: context?.type,
              contextStatistic: context?.statistic,
              contextDomains: context?.domains,
              isAttackContextResult: isAttackContext ? isAttackContext(context) : 'function not available',
              priorityDecision: isReflexSaveCtx ? 'REFLEX SAVE (priority)' : isAttackCtx ? 'ATTACK' : 'NONE'
            });

            // CRITICAL: Handle reflex saves FIRST since they can also be detected as attack contexts
            if (isReflexSaveCtx) {
              console.debug('PF2E Visioner | 🎯 HANDLING REFLEX SAVE CONTEXT - ENTRY');
              console.debug('PF2E Visioner | Reflex save context detected', {
                type: context.type,
                statistic: context.statistic,
                domains: context.domains,
                actor: context.actor?.name,
                actorId: context.actor?.id,
                hasActor: !!context.actor
              });

              // For reflex saves, the actor making the save is the "target" (defender)
              let target = context.actor?.getActiveTokens?.()?.[0];
              if (!target) {
                // Fallback: try to resolve from context
                target = resolveTargetFromCtx(context);
                console.debug('PF2E Visioner | 🚨 Using fallback target resolution');
              }

              console.debug('PF2E Visioner | 🎯 TARGET RESOLUTION', {
                target: target?.id,
                targetName: target?.name,
                targetActor: target?.actor?.name,
                hasTarget: !!target
              });

              if (!target) {
                console.debug('PF2E Visioner | ❌ No target token found for reflex save - ABORTING');
                return await wrapped(check, context, event, callback);
              }

              // Find the attacker (origin of the area effect) and template data
              let attacker = null;
              let templateOriginPoint = null;
              let isTargetInTemplate = false;
              let templateId = null;
              let templateData = null;

              console.debug('PF2E Visioner | 📍 SEARCHING FOR TEMPLATE ORIGIN', {
                targetId: target.id,
                targetName: target.name,
                reflexSaveId: `${target.id}-${Date.now()}`
              });

              // First check our dedicated template data map
              const savedTemplateData = window?.pf2eVisionerTemplateData;

              console.debug('PF2E Visioner | Checking template data map', {
                hasTemplateDataMap: !!savedTemplateData,
                templateDataMapSize: savedTemplateData?.size || 0,
                targetId: target.id
              });

              if (savedTemplateData && savedTemplateData.size > 0) {
                console.debug('PF2E Visioner | Template data available:', {
                  templateCount: savedTemplateData.size,
                  targetId: target.id,
                  templateIds: Array.from(savedTemplateData.keys())
                });

                // Find the most recent template that contains this target
                let mostRecentTemplate = null;
                let mostRecentTs = 0;

                for (const [id, data] of savedTemplateData.entries()) {
                  console.debug('PF2E Visioner | Checking template for target', {
                    templateId: id,
                    targetId: target.id,
                    hasTargets: !!data.targets,
                    targetInTemplate: !!data.targets?.[target.id],
                    timestamp: data.timestamp
                  });

                  // Check if this target is in the template's targets
                  if (data.targets && data.targets[target.id]) {
                    // Found a match - check if it's the most recent
                    if (data.timestamp > mostRecentTs) {
                      mostRecentTemplate = { id, data };
                      mostRecentTs = data.timestamp;
                    }
                  }
                }

                if (mostRecentTemplate) {
                  const { id, data } = mostRecentTemplate;
                  templateId = id;
                  templateData = data;
                  templateOriginPoint = data.center;
                  isTargetInTemplate = true;

                  // Track that this template is being used for a reflex save
                  if (!window.pf2eVisionerActiveReflexSaves) window.pf2eVisionerActiveReflexSaves = new Map();
                  window.pf2eVisionerActiveReflexSaves.set(id, Date.now());

                  // Try to get the attacker token if creator ID is available
                  if (data.creatorId && !data.creatorId.startsWith('actor:')) {
                    attacker = canvas.tokens.get(data.creatorId) || null;
                  }

                  console.debug('PF2E Visioner | ✅ FOUND TEMPLATE DATA FOR TARGET', {
                    templateId: id,
                    templateAge: Date.now() - data.timestamp,
                    targetId: target.id,
                    hasAttacker: !!attacker,
                    attackerName: attacker?.name || 'Unknown',
                    creatorId: data.creatorId,
                    creatorType: data.creatorType,
                    coverState: data.targets[target.id]?.state || 'unknown',
                    coverBonus: data.targets[target.id]?.bonus || 0
                  });
                } else {
                  console.debug('PF2E Visioner | ❌ No template found containing target', {
                    targetId: target.id,
                    templateCount: savedTemplateData.size
                  });
                }
              } else {
                console.debug('PF2E Visioner | ❌ No template data available', {
                  targetId: target.id,
                  hasTemplateDataMap: !!savedTemplateData
                });
              }

              // Mark that this target's save has been processed for this template
              if (templateData && templateData.targets && templateData.targets[target.id]) {
                templateData.targets[target.id].saveProcessed = true;

                // Check if all targets have been processed
                const allProcessed = Object.values(templateData.targets).every(t => t.saveProcessed);

                if (allProcessed) {
                  console.debug('PF2E Visioner | ✅ ALL TARGETS PROCESSED FOR TEMPLATE', {
                    templateId,
                    targetCount: Object.keys(templateData.targets).length
                  });

                  // Schedule cleanup if all targets have been processed
                  setTimeout(() => {
                    try {
                      // Only clean up if it hasn't been cleaned up already
                      if (window.pf2eVisionerTemplateData?.has?.(templateId)) {
                        // Only remove template data from our maps, don't delete templates from canvas
                        window.pf2eVisionerTemplateData.delete(templateId);

                        if (window.pf2eVisionerActiveReflexSaves) {
                          window.pf2eVisionerActiveReflexSaves.delete(templateId);
                        }

                        console.debug('PF2E Visioner | 🔄 TEMPLATE DATA CLEANED UP AFTER PROCESSING', {
                          templateId,
                          remainingTemplates: window.pf2eVisionerTemplateData?.size || 0
                        });
                      }
                    } catch (e) {
                      console.error('PF2E Visioner | Error cleaning up template data:', e);
                    }
                  }, 5000); // Give a 5 second buffer to ensure all related operations complete
                }
              }

              // IMPORTANT: If we have an attacker token but no template data or the target is not in the template,
              // handle the alternative detection based on domains and traits
              if (!attacker || !isTargetInTemplate) {
                // Try to determine if this is an AOE attack from context (area trait, etc.)
                const isAreaEffect = (context?.traits?.has?.('area') ||
                  Array.isArray(context?.traits) && context.traits.includes('area')) ||
                  (Array.isArray(context?.options) && context.options.includes('area-effect'));

                if (isAreaEffect) {
                  console.debug('PF2E Visioner | ❗ Target might be in template - area effect traits detected');

                  // Since we know this is an area effect but don't have template data,
                  // try to get an attacker token and assume target is valid
                  if (!attacker) {
                    // Try controlled token or targeted token as fallback
                    const controlled = canvas.tokens.controlled?.[0];
                    const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;

                    attacker = controlled || targeted;
                    console.debug('PF2E Visioner | Using fallback attacker for area effect', {
                      attackerId: attacker?.id,
                      attackerName: attacker?.name
                    });
                  }

                  // Assume the target is in the template since we detected area traits
                  isTargetInTemplate = true;
                } else {
                  // Try one more fallback - check if there are any recent templates at all
                  // This handles cases where the template data might not have been fully processed yet
                  if (savedTemplateData && savedTemplateData.size > 0) {
                    console.debug('PF2E Visioner | ❗ No direct template match, checking recent templates');

                    // Find the most recent template overall
                    let mostRecentTemplate = null;
                    let mostRecentTs = 0;

                    for (const [id, data] of savedTemplateData.entries()) {
                      if (data.timestamp > mostRecentTs) {
                        mostRecentTemplate = { id, data };
                        mostRecentTs = data.timestamp;
                      }
                    }

                    if (mostRecentTemplate) {
                      const { id, data } = mostRecentTemplate;
                      templateId = id;
                      templateData = data;
                      templateOriginPoint = data.center;

                      // Try to get the attacker token if creator ID is available
                      if (data.creatorId && !data.creatorId.startsWith('actor:')) {
                        attacker = canvas.tokens.get(data.creatorId) || null;
                      }

                      console.debug('PF2E Visioner | ✅ USING MOST RECENT TEMPLATE AS FALLBACK', {
                        templateId: id,
                        templateAge: Date.now() - data.timestamp,
                        hasAttacker: !!attacker,
                        attackerName: attacker?.name || 'Unknown',
                        creatorId: data.creatorId,
                        creatorType: data.creatorType
                      });

                      // For area effects, we'll calculate cover from the template origin even if we can't verify the target is inside
                      isTargetInTemplate = true;
                    }
                  }

                  // IMPORTANT: If we have an attacker token but no template data or the target is not in the template,
                  // handle the alternative detection based on domains and traits
                  if (!attacker || !isTargetInTemplate) {
                    console.debug('PF2E Visioner | Checking for area effect traits', {
                      hasContextTraits: !!context?.traits,
                      contextTraits: context?.traits,
                      hasContextOptions: !!context?.options,
                      contextOptions: context?.options,
                      contextType: context?.type,
                      contextStatistic: context?.statistic,
                      contextDomains: context?.domains
                    });

                    // Try to determine if this is an AOE attack from context (area trait, etc.)
                    const isAreaEffect = (context?.traits?.has?.('area') ||
                      Array.isArray(context?.traits) && context.traits.includes('area')) ||
                      (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
                      (context?.options?.has && context.options.has('area-effect'));

                    console.debug('PF2E Visioner | Area effect detection result', {
                      isAreaEffect,
                      hasAreaTrait: context?.traits?.has?.('area'),
                      hasAreaInTraitsArray: Array.isArray(context?.traits) && context.traits.includes('area'),
                      hasAreaEffectInOptions: (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
                        (context?.options?.has && context.options.has('area-effect'))
                    });

                    if (isAreaEffect) {
                      console.debug('PF2E Visioner | ❗ Target might be in template - area effect traits detected');

                      // Since we know this is an area effect but don't have template data,
                      // try to get an attacker token and assume target is valid
                      if (!attacker) {
                        // Try controlled token or targeted token as fallback
                        const controlled = canvas.tokens.controlled?.[0];
                        const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;

                        attacker = controlled || targeted;
                        console.debug('PF2E Visioner | Using fallback attacker for area effect', {
                          attackerId: attacker?.id,
                          attackerName: attacker?.name
                        });
                      }

                      // Assume the target is in the template since we detected area traits
                      isTargetInTemplate = true;
                    } else {
                      console.debug('PF2E Visioner | ❌ Target is not inside any recent template - ABORTING REFLEX SAVE');
                      return await wrapped(check, context, event, callback);
                    }
                  }
                }
              }

              console.debug('PF2E Visioner | Reflex save tokens resolved', {
                attackerId: attacker.id,
                targetId: target.id
              });

              // Calculate cover state
              console.debug('PF2E Visioner | 📀 CALCULATING COVER STATE');

              // For AOE reflex saves, use the precalculated cover from template data
              let state;

              // If we found a template and it has precalculated cover for this target, use it
              if (templateData && templateData.targets && templateData.targets[target.id]) {
                state = templateData.targets[target.id].state;

                console.debug('PF2E Visioner | ✅ USING PRECALCULATED COVER FROM TEMPLATE', {
                  templateId,
                  targetId: target.id,
                  state,
                  bonus: templateData.targets[target.id].bonus
                });
              }
              // If we have a template origin point but no precalculated state, calculate it now
              else if (templateOriginPoint) {
                // Import the detectCoverStateFromPoint function
                const { detectCoverStateFromPoint } = await import('../cover/auto-cover.js');
                state = detectCoverStateFromPoint(templateOriginPoint, target);

                console.debug('PF2E Visioner | 🎯 CALCULATED COVER FROM TEMPLATE ORIGIN', {
                  targetId: target.id,
                  state,
                  originPoint: templateOriginPoint
                });
              }
              // If we have an attacker token but no template data, use standard calculation
              else if (attacker) {
                // Fallback to normal calculation
                console.debug('PF2E Visioner | ⚠️ FALLBACK: Using standard token-to-token cover calculation');
                const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
                state = detectCoverStateForAttack(attacker, target);
              }
              // Final fallback - check for area effect traits in context
              else {
                // Try to determine if this is an AOE attack from context (area trait, etc.)
                const isAreaEffect = (context?.traits?.has?.('area') ||
                  Array.isArray(context?.traits) && context.traits.includes('area')) ||
                  (Array.isArray(context?.options) && context.options.includes('area-effect')) ||
                  (context?.options?.has && context.options.has('area-effect'));

                if (isAreaEffect) {
                  console.debug('PF2E Visioner | ❗ Area effect traits detected but no template data found');
                  // Try to get attacker from alternative methods
                  if (!attacker) {
                    const controlled = canvas.tokens.controlled?.[0];
                    const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;
                    attacker = controlled || targeted;
                  }

                  if (attacker) {
                    // Use standard calculation
                    const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
                    state = detectCoverStateForAttack(attacker, target);
                    console.debug('PF2E Visioner | ⚠️ AREA EFFECT WITH NO TEMPLATE: Using standard calculation', {
                      attackerId: attacker.id,
                      targetId: target.id,
                      state
                    });
                  }
                }
              }

              // Last resort fallback - if we still don't have a state, try to calculate from context
              if (!state) {
                console.debug('PF2E Visioner | ❗ No cover state determined yet, trying context-based calculation');

                // Try to get any available attacker
                if (!attacker) {
                  const controlled = canvas.tokens.controlled?.[0];
                  const targeted = Array.from(game.user.targets || [])?.[0]?.document?.object;
                  attacker = controlled || targeted;
                }

                // If we have an attacker now, try standard calculation
                if (attacker) {
                  const { detectCoverStateForAttack } = await import('../cover/auto-cover.js');
                  state = detectCoverStateForAttack(attacker, target);
                  console.debug('PF2E Visioner | 🎯 LAST RESORT: Calculated cover from available attacker', {
                    attackerId: attacker.id,
                    targetId: target.id,
                    state
                  });
                }
              }

              if (!state) {
                console.debug('PF2E Visioner | ❌ No valid cover state could be determined - ABORTING');
                return await wrapped(check, context, event, callback);
              }

              console.debug('PF2E Visioner | Computed final cover state for reflex save', {
                state,
                attackerId: attacker?.id,
                targetId: target.id,
                fromTemplateData: !!templateData,
                templateId
              });

              // Persist cover info early so it's available for final safety injection
              try {
                const earlyBonus = getCoverBonusByState(state) || 0;
                context._visionerCover = { state, bonus: earlyBonus };
              } catch (e) {
                console.error('PF2E Visioner | Error persisting cover info:', e);
              }

              if (state !== 'none') {
                const bonus = getCoverBonusByState(state) || 0;

                console.debug('PF2E Visioner | 🛡️ COVER DETECTED FOR REFLEX SAVE', {
                  state,
                  bonus,
                  targetActor: target.actor.name,
                  willProceedWithCloning: bonus > 0
                });

                if (bonus > 0) {
                  console.debug('PF2E Visioner | 🏠 STARTING ACTOR CLONING PROCESS');

                  // CRITICAL: Complete actor cloning implementation
                  console.debug('PF2E Visioner | 🏠 APPLYING COVER VIA ACTOR CLONING', {
                    state,
                    bonus,
                    targetActor: target.actor.name,
                    originalActorId: target.actor.id
                  });

                  const tgtActor = target.actor;
                  const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);

                  // Remove any existing one-roll cover effects
                  const filteredItems = items.filter(
                    (i) =>
                      !(
                        i?.type === 'effect' &&
                        i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                      ),
                  );

                  console.debug('PF2E Visioner | Items filtered:', {
                    originalCount: items.length,
                    filteredCount: filteredItems.length
                  });

                  const { getCoverLabel, getCoverImageForState } = await import(
                    '../helpers/cover-helpers.js'
                  );
                  const label = getCoverLabel(state);
                  const img = getCoverImageForState(state);

                  // Add the cover effect with rules for both AC and reflex saves
                  const coverEffect = {
                    name: label,
                    type: 'effect',
                    system: {
                      description: {
                        value: `<p>${label}: +${bonus} circumstance bonus to AC and Reflex saves vs area effects.</p>`,
                        gm: '',
                      },
                      rules: [
                        {
                          key: 'FlatModifier',
                          selector: 'ac',
                          type: 'circumstance',
                          value: bonus,
                        },
                        {
                          key: 'FlatModifier',
                          selector: 'reflex',
                          type: 'circumstance',
                          value: bonus,
                          predicate: ['area-effect'],
                        },
                      ],
                      traits: { otherTags: [], value: [] },
                      level: { value: 1 },
                      duration: { value: -1, unit: 'unlimited' },
                      tokenIcon: { show: false },
                      unidentified: false,
                      start: { value: 0 },
                      badge: null,
                    },
                    img,
                    flags: {
                      'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true },
                    },
                  };

                  filteredItems.push(coverEffect);

                  console.debug('PF2E Visioner | 🛡️ Cover effect added:', {
                    effectName: coverEffect.name,
                    totalItems: filteredItems.length,
                    effectRules: coverEffect.system.rules
                  });

                  // Clone the actor with the temporary cover effect
                  const clonedActor = tgtActor.clone(
                    { items: filteredItems },
                    { keepId: true },
                  );

                  console.debug('PF2E Visioner | 🏠 Actor cloned successfully:', {
                    originalActor: tgtActor.name,
                    clonedActor: clonedActor.name,
                    clonedActorId: clonedActor.id,
                    itemsCount: clonedActor.items?.size || 0
                  });

                  // Ensure area-effect is in the roll options to trigger the predicate
                  if (!context.options) context.options = [];
                  // Handle both arrays and Sets for context.options
                  if (Array.isArray(context.options)) {
                    if (!context.options.includes('area-effect')) {
                      context.options.push('area-effect');
                    }
                  } else if (context.options?.has && !context.options.has('area-effect')) {
                    // If it's a Set, we need to convert it to an array to add the option
                    context.options = Array.from(context.options);
                    context.options.push('area-effect');
                  } else if (!context.options) {
                    context.options = ['area-effect'];
                  }

                  // Store computed cover for final pre-roll safety injection
                  try { context._visionerCover = { state, bonus }; } catch (_) { }

                  console.debug('PF2E Visioner | ✅ REFLEX SAVE ACTOR CLONING COMPLETE', {
                    originalActor: tgtActor.name,
                    clonedActor: clonedActor.name,
                    effectsCount: filteredItems.filter(i => i.type === 'effect').length,
                    rollOptions: context.options,
                    coverState: state,
                    coverBonus: bonus,
                    finalContextActor: context.actor?.name
                  });

                  // CRITICAL: Mark this reflex save as handled by popup wrapper
                  // Use a time-based global flag that doesn't depend on context
                  if (!window.pf2eVisionerPopupHandled) window.pf2eVisionerPopupHandled = new Map();
                  const reflexSaveKey = `${attacker.id}-${target.id}-reflex`;
                  const timestamp = Date.now();
                  window.pf2eVisionerPopupHandled.set(reflexSaveKey, timestamp);

                  console.debug('PF2E Visioner | 🏷️ REFLEX SAVE MARKED AS HANDLED BY POPUP', {
                    key: reflexSaveKey,
                    timestamp,
                    handledMapSize: window.pf2eVisionerPopupHandled.size
                  });

                  // CRITICAL DEBUG: Verify the cloned actor has the cover effect
                  console.debug('PF2E Visioner | 🔍 VERIFYING CLONED ACTOR EFFECTS:', {
                    clonedActorItems: clonedActor.items?.size || 0,
                    clonedActorEffects: Array.from(clonedActor.items || [])
                      .filter(item => item.type === 'effect')
                      .map(effect => ({
                        name: effect.name,
                        slug: effect.slug || 'no-slug',
                        rules: effect.system?.rules?.length || 0
                      })),
                    contextActorSame: context.actor === clonedActor,
                    contextActorId: context.actor?.id,
                    clonedActorId: clonedActor.id
                  });

                  // CRITICAL DEBUG: Check if the cloned actor's reflex statistic has the modifier
                  try {
                    const reflexStat = clonedActor.getStatistic?.('reflex');
                    if (reflexStat) {
                      console.debug('PF2E Visioner | 🔍 CLONED ACTOR REFLEX STAT:', {
                        baseModifier: reflexStat.mod,
                        totalModifier: reflexStat.totalModifier,
                        modifiers: reflexStat.modifiers?.map(m => ({
                          label: m.label,
                          modifier: m.modifier,
                          type: m.type,
                          slug: m.slug
                        })) || []
                      });

                      // CRITICAL: Try to manually create a roll to verify the modifier shows up
                      try {
                        const testRollOptions = new Set(context.options || []);
                        testRollOptions.add('area-effect');
                        // Use the correct method for creating checks in current PF2E system version
                        const testCheck = reflexStat.check?.clone({ options: testRollOptions });
                        console.debug('PF2E Visioner | 🧪 TEST ROLL WITH CLONED ACTOR:', {
                          checkModifier: testCheck?.modifier,
                          checkModifiers: testCheck?.modifiers?.map(m => ({
                            label: m.label,
                            modifier: m.modifier,
                            type: m.type
                          })) || [],
                          rollOptions: Array.from(testRollOptions)
                        });
                      } catch (testError) {
                        console.debug('PF2E Visioner | ❌ Test roll creation failed:', testError);
                      }
                    } else {
                      console.debug('PF2E Visioner | ❌ Could not get reflex statistic from cloned actor');
                    }
                  } catch (e) {
                    console.debug('PF2E Visioner | ❌ Error checking cloned actor reflex stat:', e);
                  }

                  // CRITICAL: Store the original context actor for comparison
                  const originalContextActor = context.actor;
                  context.actor = clonedActor;

                  console.debug('PF2E Visioner | 🔄 Context actor replaced:', {
                    originalActorName: originalContextActor?.name,
                    newActorName: context.actor?.name,
                    replacementSuccess: context.actor === clonedActor,
                    contextActorId: context.actor?.id,
                    clonedActorId: clonedActor.id,
                    actorsAreIdentical: context.actor === clonedActor
                  });

                  // CRITICAL: Verify the context actor has the effect immediately after replacement
                  try {
                    const contextReflexStat = context.actor.getStatistic?.('reflex');
                    if (contextReflexStat) {
                      console.debug('PF2E Visioner | 🔍 CONTEXT ACTOR REFLEX STAT (after replacement):', {
                        baseModifier: contextReflexStat.mod,
                        totalModifier: contextReflexStat.totalModifier,
                        modifiers: contextReflexStat.modifiers?.map(m => ({
                          label: m.label,
                          modifier: m.modifier,
                          type: m.type,
                          slug: m.slug
                        })) || [],
                        hasAreaEffectOptions: (Array.isArray(context.options) && context.options.includes('area-effect')) ||
                          (context.options?.has && context.options.has('area-effect'))
                      });
                    }
                  } catch (e) {
                    console.debug('PF2E Visioner | ❌ Error checking context actor reflex stat:', e);
                  }

                  // IMPORTANT: Rebuild the CheckModifier using the cloned actor's statistic
                  try {
                    // Decide statistic slug and enforce in context
                    let statSlug = context?.statistic || (Array.isArray(context?.domains) && context.domains.includes('reflex') ? 'reflex' : null);
                    if (!statSlug) statSlug = 'reflex';
                    context.statistic = statSlug;

                    // Ensure required domains and options
                    const domSet = new Set(Array.isArray(context.domains) ? context.domains : []);
                    domSet.add('saving-throw');
                    domSet.add(statSlug);
                    const optSet = new Set(Array.isArray(context.options) ? context.options : []);
                    optSet.add('area-effect');
                    context.domains = Array.from(domSet);
                    context.options = Array.from(optSet);

                    const statObj = context.actor?.getStatistic?.(statSlug);
                    // Use the correct method for creating checks in current PF2E system version
                    if (statObj?.check?.clone) {
                      const rebuildCtx = {
                        domains: context.domains,
                        options: new Set(context.options),
                        type: 'saving-throw'
                      };
                      const rebuilt = statObj.check.clone(rebuildCtx);
                      console.debug('PF2E Visioner | ♻️ Rebuilt CheckModifier from cloned actor', {
                        statSlug,
                        oldModifier: check?.modifier,
                        newModifier: rebuilt?.modifier,
                        domains: rebuildCtx.domains,
                        options: Array.from(rebuildCtx.options)
                      });
                      check = rebuilt;

                      // Fallback: if the rebuilt check still doesn't include our cover, inject directly
                      try {
                        const alreadyHas = Array.isArray(check?.modifiers) && check.modifiers.some(m => m?.slug === 'pf2e-visioner-cover');
                        if (!alreadyHas && (bonus || 0) > 0) {
                          const label = state === 'greater' ? 'Greater Cover' : state === 'standard' ? 'Cover' : 'Lesser Cover';
                          let pf2eMod;
                          try {
                            pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                              slug: 'pf2e-visioner-cover',
                              label,
                              modifier: bonus,
                              type: 'circumstance',
                              predicate: { any: ['area-effect'] },
                            }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                          } catch (_) {
                            pf2eMod = { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                          }
                          // Push onto the check's modifiers array if present
                          if (Array.isArray(check.modifiers)) check.modifiers.push(pf2eMod);
                          console.debug('PF2E Visioner | ✅ Injected cover modifier into check as fallback', {
                            injected: true,
                            modifier: pf2eMod,
                            checkModifierCount: check?.modifiers?.length || 0,
                          });
                        } else {
                          console.debug('PF2E Visioner | Cover modifier already present on rebuilt check or no bonus to inject', {
                            alreadyHas,
                            bonus,
                          });
                        }
                      } catch (injErr) {
                        console.debug('PF2E Visioner | ⚠️ Failed fallback injection of cover modifier:', injErr);
                      }
                    } else {
                      console.debug('PF2E Visioner | ⚠️ Could not rebuild CheckModifier: statistic not found', {
                        statSlug: context?.statistic,
                        domains: context?.domains
                      });
                    }
                  } catch (rebuildErr) {
                    console.debug('PF2E Visioner | ❌ Failed to rebuild CheckModifier for reflex save:', rebuildErr);
                  }
                } else {
                  console.debug('PF2E Visioner | ❌ Cover detected but no bonus for reflex save', {
                    state,
                    bonus,
                    reason: 'bonus is 0 or negative'
                  });
                }
              } else {
                console.debug('PF2E Visioner | ❌ No cover detected for reflex save', {
                  state,
                  reason: 'state is none'
                });
              }

            } else if (isAttackCtx) {
              console.debug('PF2E Visioner | 🎯 HANDLING ATTACK CONTEXT');
              const attacker = resolveAttackerFromCtx(context);
              const target = resolveTargetFromCtx(context);

              if (attacker && target && (attacker.isOwner || game.user.isGM)) {
                // Ensure visibility-driven off-guard ephemerals are up-to-date on defender before any DC calculation
                try {
                  const { getVisibilityBetween, setVisibilityBetween } = await import(
                    '../utils.js'
                  );
                  const currentVisEarly = getVisibilityBetween(attacker, target);
                  await setVisibilityBetween(attacker, target, currentVisEarly, {
                    skipEphemeralUpdate: false,
                    direction: 'observer_to_target',
                  });
                } catch (_) { }
                // Check for custom keybind - ONLY show popup when keybind is held
                const isHoldingCoverOverrideKey = () => {
                  try {
                    const keybinding = game.keybindings.get(MODULE_ID, 'holdCoverOverride');
                    if (!keybinding?.[0]) {
                      return false;
                    }

                    const binding = keybinding[0];

                    // Check current keyboard state using game.keyboard
                    const keyboard = game.keyboard;
                    if (!keyboard) {
                      return false;
                    }

                    // Convert key code to the format used by keyboard manager
                    let keyCode = binding.key;
                    if (keyCode.startsWith('Key')) {
                      keyCode = keyCode.replace('Key', ''); // 'KeyX' -> 'X'
                    }

                    const isKeyPressed =
                      keyboard.downKeys.has(keyCode) || keyboard.downKeys.has(binding.key);
                    const isCtrlPressed =
                      keyboard.downKeys.has('Control') ||
                      keyboard.downKeys.has('ControlLeft') ||
                      keyboard.downKeys.has('ControlRight');
                    const isAltPressed =
                      keyboard.downKeys.has('Alt') ||
                      keyboard.downKeys.has('AltLeft') ||
                      keyboard.downKeys.has('AltRight');
                    const isShiftPressed =
                      keyboard.downKeys.has('Shift') ||
                      keyboard.downKeys.has('ShiftLeft') ||
                      keyboard.downKeys.has('ShiftRight');
                    const isMetaPressed =
                      keyboard.downKeys.has('Meta') ||
                      keyboard.downKeys.has('MetaLeft') ||
                      keyboard.downKeys.has('MetaRight');

                    const keyMatch = isKeyPressed;
                    const ctrlMatch =
                      isCtrlPressed === (binding.modifiers?.includes('Control') || false);
                    const altMatch = isAltPressed === (binding.modifiers?.includes('Alt') || false);
                    const shiftMatch =
                      isShiftPressed === (binding.modifiers?.includes('Shift') || false);
                    const metaMatch =
                      isMetaPressed === (binding.modifiers?.includes('Meta') || false);

                    const matches = keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;

                    return matches;
                  } catch (e) {
                    console.warn('PF2E Visioner | Error checking keybind:', e);
                    return false;
                  }
                };

                const isHoldingOverrideKey = isHoldingCoverOverrideKey();
                const shouldShowPopup = isHoldingOverrideKey; // Only show popup when keybind is held

                if (shouldShowPopup) {
                  const state = detectCoverStateForAttack(attacker, target);
                  try {
                    const { openCoverQuickOverrideDialog } = await import(
                      '../cover/quick-override-dialog.js'
                    );
                    const chosen = await openCoverQuickOverrideDialog(state);

                    if (chosen !== null) {
                      // Store the override for onPreCreateChatMessage
                      if (!window.pf2eVisionerPopupOverrides)
                        window.pf2eVisionerPopupOverrides = new Map();
                      const overrideKey = `${attacker.id}-${target.id}`;
                      window.pf2eVisionerPopupOverrides.set(overrideKey, chosen);

                      // Apply the cover effect to the target actor NOW (before roll calculation)
                      const bonus = getCoverBonusByState(chosen) || 0;

                      if (bonus > 0) {
                        // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                        const tgtActor = target.actor;
                        const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                        // Remove any existing one-roll cover effects we may have added
                        const filteredItems = items.filter(
                          (i) =>
                            !(
                              i?.type === 'effect' &&
                              i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                            ),
                        );
                        const { getCoverLabel, getCoverImageForState } = await import(
                          '../helpers/cover-helpers.js'
                        );
                        const label = getCoverLabel(chosen);
                        const img = getCoverImageForState(chosen);
                        filteredItems.push({
                          name: label,
                          type: 'effect',
                          system: {
                            description: {
                              value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                              gm: '',
                            },
                            rules: [
                              {
                                key: 'FlatModifier',
                                selector: 'ac',
                                type: 'circumstance',
                                value: bonus,
                              },
                              {
                                key: 'FlatModifier',
                                selector: 'reflex',
                                type: 'circumstance',
                                value: bonus,
                                predicate: ['area-effect'],
                              },
                            ],
                            traits: { otherTags: [], value: [] },
                            level: { value: 1 },
                            duration: { value: -1, unit: 'unlimited' },
                            tokenIcon: { show: false },
                            unidentified: false,
                            start: { value: 0 },
                            badge: null,
                          },
                          img,
                          flags: {
                            'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true },
                          },
                        });
                        // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                        try {
                          const { getVisibilityBetween } = await import(
                            '../stores/visibility-map.js'
                          );
                          const visState = getVisibilityBetween(target, attacker);
                          if (['hidden', 'undetected'].includes(visState)) {
                            const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                            filteredItems.push({
                              name: `Off-Guard (${reason})`,
                              type: 'effect',
                              system: {
                                description: {
                                  value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                  gm: '',
                                },
                                rules: [
                                  {
                                    key: 'FlatModifier',
                                    selector: 'ac',
                                    type: 'circumstance',
                                    value: -2,
                                  },
                                ],
                                traits: { otherTags: [], value: [] },
                                level: { value: 1 },
                                duration: { value: -1, unit: 'unlimited' },
                                tokenIcon: { show: false },
                                unidentified: false,
                                start: { value: 0 },
                                badge: null,
                              },
                              img: 'icons/svg/terror.svg',
                              flags: {
                                'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                              },
                            });
                          }
                        } catch (_) { }
                        const clonedActor = tgtActor.clone(
                          { items: filteredItems },
                          { keepId: true },
                        );
                        const dcObj = context.dc;
                        if (dcObj?.slug) {
                          const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                          if (clonedStat) {
                            dcObj.value = clonedStat.value;
                            dcObj.statistic = clonedStat;
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('PF2E Visioner | Popup error:', e);
                  }
                } else {
                  // No popup - apply automatic cover detection
                  const state = detectCoverStateForAttack(attacker, target);

                  if (state !== 'none') {
                    // Apply the cover effect automatically
                    const bonus = getCoverBonusByState(state) || 0;

                    if (bonus > 0) {
                      // Clone the target actor with a temporary cover effect so the roll shows an itemized bonus
                      const tgtActor = target.actor;
                      const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                      // Remove any existing one-roll cover effects we may have added
                      const filteredItems = items.filter(
                        (i) =>
                          !(
                            i?.type === 'effect' &&
                            i?.flags?.['pf2e-visioner']?.ephemeralCoverRoll === true
                          ),
                      );
                      const { getCoverLabel, getCoverImageForState } = await import(
                        '../helpers/cover-helpers.js'
                      );
                      const label = getCoverLabel(state);
                      const img = getCoverImageForState(state);
                      filteredItems.push({
                        name: label,
                        type: 'effect',
                        system: {
                          description: {
                            value: `<p>${label}: +${bonus} circumstance bonus to AC for this roll.</p>`,
                            gm: '',
                          },
                          rules: [
                            {
                              key: 'FlatModifier',
                              selector: 'ac',
                              type: 'circumstance',
                              value: bonus,
                            },
                            {
                              key: 'FlatModifier',
                              selector: 'reflex',
                              type: 'circumstance',
                              value: bonus,
                              predicate: ['area-effect'],
                            },
                          ],
                          traits: { otherTags: [], value: [] },
                          level: { value: 1 },
                          duration: { value: -1, unit: 'unlimited' },
                          tokenIcon: { show: false },
                          unidentified: false,
                          start: { value: 0 },
                          badge: null,
                        },
                        img,
                        flags: { 'pf2e-visioner': { forThisRoll: true, ephemeralCoverRoll: true } },
                      });
                      // If defender is hidden/undetected to attacker, add a one-roll Flat-Footed item so it shows on the roll
                      try {
                        const { getVisibilityBetween } = await import(
                          '../stores/visibility-map.js'
                        );
                        const visState = getVisibilityBetween(target, attacker);
                        if (['hidden', 'undetected'].includes(visState)) {
                          const reason = visState.charAt(0).toUpperCase() + visState.slice(1);
                          filteredItems.push({
                            name: `Off-Guard (${reason})`,
                            type: 'effect',
                            system: {
                              description: {
                                value: `<p>Off-Guard (${reason}): -2 circumstance penalty to AC for this roll.</p>`,
                                gm: '',
                              },
                              rules: [
                                {
                                  key: 'FlatModifier',
                                  selector: 'ac',
                                  type: 'circumstance',
                                  value: -2,
                                },
                              ],
                              traits: { otherTags: [], value: [] },
                              level: { value: 1 },
                              duration: { value: -1, unit: 'unlimited' },
                              tokenIcon: { show: false },
                              unidentified: false,
                              start: { value: 0 },
                              badge: null,
                            },
                            img: 'icons/svg/terror.svg',
                            flags: {
                              'pf2e-visioner': { forThisRoll: true, ephemeralOffGuardRoll: true },
                            },
                          });
                        }
                      } catch (_) { }
                      const clonedActor = tgtActor.clone(
                        { items: filteredItems },
                        { keepId: true },
                      );
                      const dcObj = context.dc;
                      if (dcObj?.slug) {
                        const clonedStat = clonedActor.getStatistic?.(dcObj.slug)?.dc;
                        if (clonedStat) {
                          dcObj.value = clonedStat.value;
                          dcObj.statistic = clonedStat;
                        }
                      }
                    }
                  }
                }
              }
            } else if (isStealthCheck) {
              console.debug('PF2E Visioner | 🥷 HANDLING STEALTH CHECK');

              // Resolve the hider (actor making the stealth check)
              let hider = context?.actor?.getActiveTokens?.()?.[0] || context?.token?.object || null;
              if (!hider) hider = resolveAttackerFromCtx(context);

              // We don't require a specific observer for stealth cover; consider ANY other token
              console.debug('PF2E Visioner | Stealth participant', {
                hiderId: hider?.id,
                hiderName: hider?.name,
              });

              if (hider && (hider.isOwner || game.user.isGM)) {
                try {
                  // Check for a manual override set by the Check Modifiers dialog
                  let state = null;
                  let isOverride = false;
                  try {
                    const stealthDialog = Object.values(ui.windows).find(
                      (w) => w?.constructor?.name === 'CheckModifiersDialog',
                    );
                    if (stealthDialog?._pvCoverOverride) {
                      state = stealthDialog._pvCoverOverride;
                      isOverride = true;
                    }
                  } catch (_) { }

                  // If not overridden, evaluate cover against all other tokens and pick the best (highest stealth bonus)
                  let candidateStates = [];
                  if (!state) {
                    try {
                      const observers = (canvas?.tokens?.placeables || [])
                        .filter((t) => t && t.actor && t.id !== hider.id);
                      for (const obs of observers) {
                        try {
                          const s = detectCoverStateForAttack(hider, obs);
                          if (s) {
                            candidateStates.push(s)
                            break;
                          };
                        } catch (_) { }
                      }
                      console.debug('PF2E Visioner | Stealth cover candidates', candidateStates);
                    } catch (_) { }
                    state = candidateStates[0];
                  }

                  const { COVER_STATES } = await import('../constants.js');
                  const bonus = Number(COVER_STATES?.[state]?.bonusStealth ?? 0);

                  try {
                    context._visionerCover = { state, bonus };
                  } catch (_) { }

                  // Persist early for potential downstream usage
                  try { context._visionerStealth = { state, bonus, isOverride, source: isOverride ? 'override' : 'automatic' }; } catch (_) { }
                  // Also store globally for post-roll analyzers (e.g., Hide outcome processing)
                  try {
                    if (typeof window !== 'undefined') {
                      window.pf2eVisionerStealthLast = { state, bonus, ts: Date.now(), isOverride };
                    }
                  } catch (_) { }

                  if (state !== 'none' && bonus > 0) {
                    console.debug('PF2E Visioner | 🥷 Stealth cover detected', { state, bonus });

                    // Prefer adjusting the DC if present (Perception DC of the observer)
                    const dcObj = context?.dc;
                    if (dcObj && typeof dcObj.value === 'number') {
                      const before = dcObj.value;
                      dcObj.value = Math.max(0, Number(dcObj.value) - bonus);
                      try {
                        const labelPrefix = dcObj?.label ? `${dcObj.label}` : 'Perception DC';
                        dcObj.label = `${labelPrefix} (Cover -${bonus})`;
                      } catch (_) { }
                      console.debug('PF2E Visioner | ✅ Reduced Perception DC for stealth', {
                        before,
                        after: dcObj.value,
                        bonus,
                      });
                    } else {
                      // No DC in context: show as an itemized bonus by cloning the hider with a 1-roll effect
                      const tgtActor = hider.actor;
                      const items = foundry.utils.deepClone(tgtActor._source?.items ?? []);
                      const filteredItems = items.filter(
                        (i) =>
                          !(
                            i?.type === 'effect' &&
                            i?.flags?.['pf2e-visioner']?.ephemeralStealthCoverRoll === true
                          ),
                      );
                      const { getCoverLabel, getCoverImageForState } = await import(
                        '../helpers/cover-helpers.js'
                      );
                      const label = getCoverLabel(state);
                      const img = getCoverImageForState(state);
                      filteredItems.push({
                        name: label,
                        type: 'effect',
                        system: {
                          description: {
                            value: `<p>${label}: +${bonus} circumstance bonus to Stealth for this roll.</p>`,
                            gm: '',
                          },
                          rules: [
                            {
                              key: 'FlatModifier',
                              selector: 'stealth',
                              type: 'circumstance',
                              value: bonus,
                            },
                          ],
                          traits: { otherTags: [], value: [] },
                          level: { value: 1 },
                          duration: { value: -1, unit: 'unlimited' },
                          tokenIcon: { show: false },
                          unidentified: false,
                          start: { value: 0 },
                          badge: null,
                        },
                        img,
                        flags: {
                          'pf2e-visioner': { forThisRoll: true, ephemeralStealthCoverRoll: true },
                        },
                      });

                      const clonedActor = tgtActor.clone({ items: filteredItems }, { keepId: true });

                      // Replace context actor to apply the itemized modifier
                      const originalActor = context.actor;
                      context.actor = clonedActor;

                      // Ensure domains include stealth for the check
                      try {
                        const domSet = new Set(Array.isArray(context.domains) ? context.domains : []);
                        domSet.add('skill-check');
                        domSet.add('stealth');
                        context.domains = Array.from(domSet);
                      } catch (_) { }

                      console.debug('PF2E Visioner | ✅ Applied stealth cover via actor cloning', {
                        state,
                        bonus,
                        originalActor: originalActor?.name,
                        clonedActor: clonedActor?.name,
                      });
                    }
                  } else {
                    console.debug('PF2E Visioner | ❌ No cover bonus applicable for stealth', { state, bonus });
                  }
                } catch (e) {
                  console.debug('PF2E Visioner | ⚠️ Stealth cover handling failed', e);
                }
              } else {
                console.debug('PF2E Visioner | ❌ Skipping stealth handling (missing tokens or permissions)', {
                  hasHider: !!hider,
                  hiderOwner: hider?.isOwner,
                  isGM: game.user.isGM,
                });
              }

            } else {
              console.debug('PF2E Visioner | ❎ NOT HANDLING - No matching context', {
                isAttackCtx,
                isReflexSaveCtx,
                contextType: context?.type,
                reason: 'Neither attack nor reflex save context'
              });
            }
          } catch (e) {
            console.warn('PF2E Visioner | ❌ Error in popup wrapper:', e);
          }

          console.debug('PF2E Visioner | 🏁 POPUP WRAPPER CALLING ORIGINAL', {
            contextType: context?.type,
            finalContextActor: context?.actor?.name
          });

          // Diagnostic: dump the cover override state and any modifiers attached to the Check
          try {
            console.debug('PF2E Visioner | POPUP WRAPPER DIAGNOSTIC', {
              coverOverrideState: context?.coverOverrideState,
              checkModifiers: Array.isArray(check?.modifiers) ? check.modifiers.map(m => ({ label: m?.label || m?.name || null, modifier: m?.modifier ?? m?.value ?? null })) : check?.modifiers
            });
          } catch (diagErr) {
            console.debug('PF2E Visioner | POPUP WRAPPER DIAGNOSTIC: failed to print modifiers', diagErr);
          }

          // (Moved earlier) off-guard ephemerals ensured before calculation

          // FINAL REFLEX COVER INJECTION (minimal): push cover modifier into the Check
          try {
            const isReflex = Array.isArray(context?.domains)
              ? context.domains.includes('reflex')
              : context?.statistic === 'reflex' || context?.type === 'saving-throw';
            const coverInfo = context?._visionerCover;
            const isStealthCheck = context?.type === 'skill-check' && context?.domains?.includes('stealth');
            const bonus = Number(coverInfo?.bonus) || 0;
            if (isReflex && bonus > 1 || isStealthCheck && bonus > 1) {
              const state = coverInfo?.state ?? 'standard';
              // Ensure predicate support
              const optSet = new Set(Array.isArray(context.options) ? context.options : []);
              optSet.add('area-effect');
              context.options = Array.from(optSet);

              // Build PF2E Modifier
              const label = state === 'greater' ? 'Greater Cover' : state === 'standard' ? 'Standard Cover' : 'Lesser Cover';
              let pf2eMod;
              try {
                if (isReflex) {
                  pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                    predicate: ['area-effect'],
                  }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', predicate: ['area-effect'], enabled: true };
                } else if (isStealthCheck) {
                  pf2eMod = game?.pf2e?.Modifier ? new game.pf2e.Modifier({
                    slug: 'pf2e-visioner-cover',
                    label,
                    modifier: bonus,
                    type: 'circumstance',
                  }) : { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
                }
              } catch (_) {
                pf2eMod = { slug: 'pf2e-visioner-cover', label, modifier: bonus, type: 'circumstance', enabled: true };
              }

              const already = !!(check?.modifiers && typeof check.modifiers.some === 'function' && check.modifiers.some(m => m?.slug === 'pf2e-visioner-cover'));
              if (!already && check && typeof check.push === 'function') {
                check.push(pf2eMod);
              }

              console.debug('PF2E Visioner | ✅ Applied cover to reflex check via push()', { state, bonus });
            }
          } catch (finalErr) {
            console.debug('PF2E Visioner | ⚠️ Minimal reflex injection failed', finalErr);
          }

          return await wrapped(check, context, event, callback);
        },
        'WRAPPER',
      );

      // Wrap template preview to show cover visualization and hide template fill
      try {
        libWrapper.register(
          MODULE_ID,
          'MeasuredTemplate.createPreview',
          function previewWrapper(wrapped, data, options) {
            try {
              // Call original
              const result = wrapped(data, options);

              // Prepare overlay container
              if (!window.pf2eVisionerTemplateOverlay) window.pf2eVisionerTemplateOverlay = {};
              const overlay = (window.pf2eVisionerTemplateOverlay.graphics = new PIXI.Graphics());
              canvas.interface.addChild(overlay);
              console.debug('PF2E Visioner | template preview: overlay created');

              // Helper to safely get the live preview object and center/shape
              const getPreviewState = () => {
                const layer = canvas?.templates;
                const preview = layer?.preview ?? layer?._preview;
                const template = preview?.template ?? preview?.object ?? preview;
                if (!template) return null;
                const cx = Number(template.x ?? template.document?.x ?? data?.x ?? 0);
                const cy = Number(template.y ?? template.document?.y ?? data?.y ?? 0);
                const distance = Number(template.document?.distance ?? data?.distance ?? 0);
                return { template, center: { x: cx, y: cy }, distance };
              };

              // Hide template fill (keep border)
              const tryHideFill = () => {
                try {
                  const state = getPreviewState();
                  if (!state) return;
                  // Many versions expose fill alpha on the primary object
                  if (state.template?.fill) state.template.fill.alpha = 0;
                  if (state.template) state.template.alpha = 1; // ensure visible border
                  console.debug('PF2E Visioner | template preview: hide fill applied');
                } catch (_) { }
              };

              // Color by cover state
              const COVER_COLORS = (game.modules.get(MODULE_ID) && CONFIG?.[MODULE_ID]?.COVER_COLORS) || {
                none: 0x000000, // rendered with very low alpha
                lesser: 0xffeb3b,
                standard: 0xff9800,
                greater: 0xf44336,
              };

              const drawOverlay = () => {
                tryHideFill();
                const state = getPreviewState();
                if (!state) return;

                const overlayG = window.pf2eVisionerTemplateOverlay?.graphics;
                if (!overlayG) return;
                overlayG.clear();

                const attacker = canvas.tokens.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0];
                if (!attacker) {
                  console.debug('PF2E Visioner | template preview: no attacker token');
                  return;
                }

                // Sample grid squares within the template radius and color by default (none)
                const gridSize = canvas.grid?.size || 100;
                const feetPerSquare = canvas.dimensions?.distance || 5;
                const radiusFeet = Number(state.distance) || 0;
                const radiusSquares = radiusFeet / feetPerSquare;
                const radiusWorld = radiusSquares * gridSize;

                const minX = Math.floor((state.center.x - radiusWorld) / gridSize) * gridSize + gridSize / 2;
                const maxX = Math.ceil((state.center.x + radiusWorld) / gridSize) * gridSize - gridSize / 2;
                const minY = Math.floor((state.center.y - radiusWorld) / gridSize) * gridSize + gridSize / 2;
                const maxY = Math.ceil((state.center.y + radiusWorld) / gridSize) * gridSize - gridSize / 2;

                // Pre-compute tokens within template to compute precise cover for them
                const tokens = canvas.tokens.placeables.filter((t) => t?.actor);
                const tokensInside = tokens.filter((t) => {
                  const dx = (t.center?.x ?? t.x) - state.center.x;
                  const dy = (t.center?.y ?? t.y) - state.center.y;
                  const dist = Math.hypot(dx, dy);
                  return dist <= radiusWorld + 1;
                });
                console.debug('PF2E Visioner | template preview: tokens inside radius', {
                  count: tokensInside.length,
                  ids: tokensInside.map((t) => t.id),
                });

                // Build a map of token id -> cover state
                const perTokenCover = new Map();
                for (const t of tokensInside) {
                  try {
                    const cov = detectCoverStateFromPoint(state.center, t);
                    perTokenCover.set(t.id, cov);
                  } catch (_) { }
                }
                console.debug('PF2E Visioner | template preview: per-token cover computed');

                // Draw every grid square within the radius with a base low-alpha color for 'none'
                const baseColor = COVER_COLORS.none;
                const baseAlpha = 0.08; // subtle background
                const strongAlpha = 0.28; // tokens area highlight

                for (let wx = minX; wx <= maxX; wx += gridSize) {
                  for (let wy = minY; wy <= maxY; wy += gridSize) {
                    const dx = wx - state.center.x;
                    const dy = wy - state.center.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > radiusWorld + 1) continue;

                    // Determine if this square is under a token that's inside
                    let color = baseColor;
                    let alpha = baseAlpha;
                    const tokenHere = tokensInside.find((t) => {
                      const left = t.document.x;
                      const top = t.document.y;
                      const right = left + t.document.width * gridSize;
                      const bottom = top + t.document.height * gridSize;
                      const cx = wx;
                      const cy = wy;
                      return cx >= left && cx <= right && cy >= top && cy <= bottom;
                    });

                    if (tokenHere) {
                      const st = perTokenCover.get(tokenHere.id) || 'none';
                      color = COVER_COLORS[st] ?? baseColor;
                      alpha = strongAlpha;
                    }

                    overlayG.beginFill(color, alpha);
                    overlayG.drawRect(wx - gridSize / 2, wy - gridSize / 2, gridSize, gridSize);
                    overlayG.endFill();
                  }
                }
              };

              // Initial draw and listeners
              drawOverlay();
              const moveHandler = () => drawOverlay();
              canvas.stage.on('pointermove', moveHandler);
              console.debug('PF2E Visioner | template preview: draw + pointermove handler attached');

              // Clean up when preview completes/cancels
              const cleanup = () => {
                try {
                  canvas.stage.off('pointermove', moveHandler);
                } catch (_) { }
                try {
                  if (window.pf2eVisionerTemplateOverlay?.graphics) {
                    window.pf2eVisionerTemplateOverlay.graphics.destroy(true);
                  }
                } catch (_) { }
                window.pf2eVisionerTemplateOverlay = null;
                console.debug('PF2E Visioner | template preview: overlay cleaned');
              };

              // Listen once for placement via createMeasuredTemplate
              const onCreate = (placed) => {
                try {
                  if (placed?.user?.id !== game.userId) return;
                } finally {
                  Hooks.off('createMeasuredTemplate', onCreate);
                  cleanup();
                }
              };
              Hooks.on('createMeasuredTemplate', onCreate);

              // Also attempt to catch cancel by monitoring right-click on stage once
              const cancelHandler = () => {
                canvas.stage.off('rightdown', cancelHandler);
                cleanup();
              };
              canvas.stage.on('rightdown', cancelHandler, { once: true });
              console.debug('PF2E Visioner | template preview: cleanup listeners attached');

              return result;
            } catch (e) {
              console.warn('PF2E Visioner | Template preview wrapper failed:', e);
              return wrapped(data, options);
            }
          },
          'WRAPPER',
        );
      } catch (_) { }
    }
  });

  // Register essential wrapper on ready
  Hooks.once('ready', () => {
    console.debug('PF2E Visioner | Ready hook: module initialization complete');
    // Note: Main wrapper registration is handled in pf2e.systemReady hook above
  });
}
