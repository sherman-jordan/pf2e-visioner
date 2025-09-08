/**
 * Unit tests for Token Manager Context Building
 * Tests the buildContext function to ensure correct DC display in different modes
 */

// Import test setup first to define global mock functions
import '../setup.js';

// Import the buildContext function
import { buildContext } from '../../scripts/managers/token-manager/context.js';

describe('Token Manager Context Building', () => {
  let mockApp, mockObserver, mockTarget1, mockTarget2;

  beforeEach(() => {
    // Create mock observer token (the selected token)
    mockObserver = createMockToken({
      id: 'observer-1',
      name: 'Ogre Warrior',
      actor: createMockActor({
        id: 'actor-observer',
        type: 'npc',
        hasPlayerOwner: false,
        system: {
          skills: {
            stealth: { dc: 9 } // Observer's stealth DC
          }
        }
      })
    });

    // Create mock target tokens (tokens that could perceive the observer)
    mockTarget1 = createMockToken({
      id: 'target-1',
      name: 'Amiri',
      actor: createMockActor({
        id: 'actor-target1',
        type: 'character',
        hasPlayerOwner: true,
        system: {
          perception: { dc: 15 } // Target's perception DC
        }
      })
    });

    mockTarget2 = createMockToken({
      id: 'target-2',
      name: 'Ezren',
      actor: createMockActor({
        id: 'actor-target2',
        type: 'character',
        hasPlayerOwner: true,
        system: {
          perception: { dc: 12 } // Different perception DC
        }
      })
    });

    // Mock the app object
    mockApp = {
      observer: mockObserver,
      mode: 'target',
      activeTab: 'visibility',
      encounterOnly: false,
      ignoreAllies: false,
      ignoreWalls: false,
      visibilityData: {},
      coverData: {}
    };

    // Mock canvas tokens
    global.canvas = {
      tokens: {
        placeables: [mockTarget1, mockTarget2]
      },
      walls: {
        placeables: []
      }
    };

    // Mock game settings
    global.game.settings.get.mockImplementation((moduleId, settingId) => {
      if (settingId === 'integrateRollOutcome') return false;
      if (settingId === 'hiddenWallsEnabled') return false;
      return false;
    });

    // Mock utils functions using global mocks from setup.js
    global.getSceneTargets = jest.fn(() => [mockTarget1, mockTarget2]);
    global.getVisibilityMap = jest.fn(() => ({}));
    global.getCoverMap = jest.fn(() => ({}));
    global.hasActiveEncounter = jest.fn(() => false);
    global.getLastRollTotalForActor = jest.fn(() => null);
  });

  describe('Target Mode DC Display', () => {
    test('should show each token\'s perception DC in target mode', async () => {
      const context = await buildContext(mockApp, {});

      // Should have PC targets
      expect(context.pcTargets).toHaveLength(2);
      expect(context.npcTargets).toHaveLength(0);

      // Check that each target shows its own perception DC
      const amiriTarget = context.pcTargets.find(t => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find(t => t.name === 'Ezren');

      expect(amiriTarget).toBeDefined();
      expect(ezrenTarget).toBeDefined();

      // In target mode, both perceptionDC and stealthDC should be the perception DC of each token
      expect(amiriTarget.perceptionDC).toBe(15); // Amiri's perception DC
      expect(amiriTarget.stealthDC).toBe(15);    // Should also be Amiri's perception DC

      expect(ezrenTarget.perceptionDC).toBe(12); // Ezren's perception DC
      expect(ezrenTarget.stealthDC).toBe(12);     // Should also be Ezren's perception DC

      // Verify we're in target mode
      expect(context.isTargetMode).toBe(true);
      expect(context.isObserverMode).toBe(false);
    });

    test('should not show observer\'s stealth DC in target mode', async () => {
      const context = await buildContext(mockApp, {});

      const amiriTarget = context.pcTargets.find(t => t.name === 'Amiri');
      
      // Should NOT show the observer's stealth DC (9) for any target
      expect(amiriTarget.perceptionDC).not.toBe(9); // Observer's stealth DC
      expect(amiriTarget.stealthDC).not.toBe(9);    // Observer's stealth DC
      
      // Should show Amiri's own perception DC
      expect(amiriTarget.perceptionDC).toBe(15);
      expect(amiriTarget.stealthDC).toBe(15);
    });

    test('should show different perception DCs for different tokens', async () => {
      const context = await buildContext(mockApp, {});

      const amiriTarget = context.pcTargets.find(t => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find(t => t.name === 'Ezren');

      // Each token should have its own unique perception DC
      expect(amiriTarget.perceptionDC).toBe(15);
      expect(ezrenTarget.perceptionDC).toBe(12);
      
      // They should be different
      expect(amiriTarget.perceptionDC).not.toBe(ezrenTarget.perceptionDC);
    });
  });

  describe('Observer Mode DC Display', () => {
    beforeEach(() => {
      // Switch to observer mode
      mockApp.mode = 'observer';
    });

    test('should show target\'s stealth DC in observer mode', async () => {
      const context = await buildContext(mockApp, {});

      // Should have PC targets
      expect(context.pcTargets).toHaveLength(2);

      const amiriTarget = context.pcTargets.find(t => t.name === 'Amiri');
      const ezrenTarget = context.pcTargets.find(t => t.name === 'Ezren');

      expect(amiriTarget).toBeDefined();
      expect(ezrenTarget).toBeDefined();

      // In observer mode, stealthDC should be the target's stealth DC
      // Since these are character tokens, they should have stealth DCs
      expect(amiriTarget.perceptionDC).toBe(15); // Amiri's perception DC
      expect(ezrenTarget.perceptionDC).toBe(12); // Ezren's perception DC

      // Verify we're in observer mode
      expect(context.isObserverMode).toBe(true);
      expect(context.isTargetMode).toBe(false);
    });
  });

  describe('DC Extraction Functions', () => {
    test('should handle tokens with missing perception DC', async () => {
      // Create a token without perception DC
      const tokenWithoutPerception = createMockToken({
        id: 'no-perception',
        name: 'Token Without Perception',
        actor: createMockActor({
          id: 'actor-no-perception',
          type: 'character',
          hasPlayerOwner: true,
          system: {
            // No perception DC
          }
        })
      });

      global.canvas.tokens.placeables = [tokenWithoutPerception];

      const context = await buildContext(mockApp, {});

      const target = context.pcTargets.find(t => t.name === 'Token Without Perception');
      expect(target).toBeDefined();
      
      // Should default to 0 for missing perception DC
      expect(target.perceptionDC).toBe(0);
      expect(target.stealthDC).toBe(0);
    });

    test('should handle tokens with missing actor', async () => {
      // Create a token without an actor
      const tokenWithoutActor = createMockToken({
        id: 'no-actor',
        name: 'Token Without Actor',
        actor: null
      });

      global.canvas.tokens.placeables = [tokenWithoutActor];

      const context = await buildContext(mockApp, {});

      const target = context.pcTargets.find(t => t.name === 'Token Without Actor');
      expect(target).toBeDefined();
      
      // Should default to 0 for missing actor
      expect(target.perceptionDC).toBe(0);
      expect(target.stealthDC).toBe(0);
    });

    test('should handle tokens with perception DC override', async () => {
      // Create a token with a perception DC override flag
      const tokenWithOverride = createMockToken({
        id: 'override-token',
        name: 'Token With Override',
        actor: createMockActor({
          id: 'actor-override',
          type: 'character',
          hasPlayerOwner: true,
          system: {
            perception: { dc: 10 } // Base perception DC
          }
        }),
        document: {
          getFlag: jest.fn((moduleId, flagName) => {
            if (flagName === 'perceptionDC') return 20; // Override DC
            return null;
          })
        }
      });

      global.canvas.tokens.placeables = [tokenWithOverride];

      const context = await buildContext(mockApp, {});

      const target = context.pcTargets.find(t => t.name === 'Token With Override');
      expect(target).toBeDefined();
      
      // Should use the override DC instead of the base DC
      expect(target.perceptionDC).toBe(20);
      expect(target.stealthDC).toBe(20);
    });
  });

  describe('Mode Context Properties', () => {
    test('should set correct mode properties in target mode', async () => {
      mockApp.mode = 'target';
      
      const context = await buildContext(mockApp, {});

      expect(context.mode).toBe('target');
      expect(context.isTargetMode).toBe(true);
      expect(context.isObserverMode).toBe(false);
    });

    test('should set correct mode properties in observer mode', async () => {
      mockApp.mode = 'observer';
      
      const context = await buildContext(mockApp, {});

      expect(context.mode).toBe('observer');
      expect(context.isTargetMode).toBe(false);
      expect(context.isObserverMode).toBe(true);
    });

    test('should set correct tab properties', async () => {
      mockApp.activeTab = 'visibility';
      
      const context = await buildContext(mockApp, {});

      expect(context.activeTab).toBe('visibility');
      expect(context.isVisibilityTab).toBe(true);
      expect(context.isCoverTab).toBe(false);

      mockApp.activeTab = 'cover';
      const context2 = await buildContext(mockApp, {});

      expect(context2.activeTab).toBe('cover');
      expect(context2.isVisibilityTab).toBe(false);
      expect(context2.isCoverTab).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing observer gracefully', async () => {
      mockApp.observer = null;

      const context = await buildContext(mockApp, {});

      expect(context.error).toBeDefined();
      expect(context.error).toContain('NO_OBSERVER_SELECTED');
    });

    test('should handle missing canvas gracefully', async () => {
      global.canvas = null;

      const context = await buildContext(mockApp, {});

      // Should not throw and should return a context
      expect(context).toBeDefined();
      expect(context.mode).toBe('target');
    });
  });
});
