/**
 * Unit tests for AttackRollUseCase  
 * Tests attack roll context handling and cover application in attack scenarios
 */

import '../../../setup.js';

describe('AttackRollUseCase', () => {
  let attackRollUseCase;
  let mockAutoCoverSystem, mockCoverUIManager, mockTemplateManager;

  beforeEach(async () => {
    jest.resetModules();

    // Mock dependencies
    mockAutoCoverSystem = {
      detectCoverBetweenTokens: jest.fn().mockReturnValue('standard'),
      getCoverBonusByState: jest.fn().mockImplementation((state) => {
        const bonuses = { none: 0, lesser: 1, standard: 2, greater: 4 };
        return bonuses[state] || 0;
      }),
      normalizeTokenRef: jest.fn().mockImplementation((ref) => {
        // Simple mock implementation that returns the ref as-is if it's a token-like object
        if (ref && typeof ref === 'object' && ref.id) return ref;
        return null;
      }),
    };

    mockCoverUIManager = {
      injectDialogCoverUI: jest.fn(),
      shouldShowCoverOverrideIndicator: jest.fn().mockResolvedValue(false),
      injectCoverOverrideIndicator: jest.fn(),
    };

    mockTemplateManager = {
      getTemplatesData: jest.fn().mockReturnValue(new Map()),
      getTemplateOrigin: jest.fn().mockReturnValue(null),
      setTemplateOrigin: jest.fn(),
    };

    // Mock the modules - return both the mock directly and as default export
    jest.doMock('../../../../scripts/cover/auto-cover/AutoCoverSystem.js', () => mockAutoCoverSystem);

    jest.doMock('../../../../scripts/cover/auto-cover/CoverUIManager.js', () => mockCoverUIManager);

    jest.doMock('../../../../scripts/cover/auto-cover/TemplateManager.js', () => mockTemplateManager);

    // Import the use case
    const { AttackRollUseCase } = await import('../../../../scripts/cover/auto-cover/usecases/AttackRollUseCase.js');
    attackRollUseCase = new AttackRollUseCase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct dependencies', () => {
      expect(attackRollUseCase).toBeDefined();
      // The BaseUseCase unwraps the default export, so we need to check for the inner mock
      expect(attackRollUseCase.autoCoverSystem).toBe(mockAutoCoverSystem);
      expect(attackRollUseCase.coverUIManager).toBe(mockCoverUIManager);
      expect(attackRollUseCase.templateManager).toBe(mockTemplateManager);
    });
  });

  describe('handlePreCreateChatMessage', () => {
    test('should return undefined (not implemented)', async () => {
      const result = await attackRollUseCase.handlePreCreateChatMessage({}, {});
      expect(result).toBeUndefined();
    });
  });

  describe('handleRenderChatMessage', () => {
    test('should return undefined (not implemented)', async () => {
      const result = await attackRollUseCase.handleRenderChatMessage({}, {});
      expect(result).toBeUndefined();
    });
  });

  describe('handleCheckDialog', () => {
    let mockDialog, mockHtml, attackerToken, targetToken;

    beforeEach(() => {
      attackerToken = global.createMockToken({ id: 'attacker' });
      targetToken = global.createMockToken({ id: 'target' });

      mockDialog = {
        context: {},
        check: {
          modifiers: [],
          calculateTotal: jest.fn(),
        },
        render: jest.fn(),
      };

      mockHtml = document.createElement('div');

      // Mock token resolution
      attackRollUseCase._resolveAttackerFromCtx = jest.fn().mockReturnValue(attackerToken);
      attackRollUseCase._resolveTargetFromCtx = jest.fn().mockReturnValue(targetToken);
    });

    test('should return early if no attacker or target', async () => {
      attackRollUseCase._resolveAttackerFromCtx.mockReturnValue(null);

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(mockCoverUIManager.injectDialogCoverUI).not.toHaveBeenCalled();
    });

    test('should detect cover and inject UI', async () => {
      attackRollUseCase._detectCover = jest.fn().mockReturnValue('standard');

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(attackRollUseCase._detectCover).toHaveBeenCalledWith(attackerToken, targetToken);
      expect(mockCoverUIManager.injectDialogCoverUI).toHaveBeenCalledWith(
        mockDialog,
        mockHtml,
        'standard',
        targetToken,
        false, // manualCover
        expect.any(Function) // onChosen callback
      );
    });

    test('should handle UI injection errors gracefully', async () => {
      mockCoverUIManager.injectDialogCoverUI.mockRejectedValue(new Error('UI injection failed'));

      await expect(
        attackRollUseCase.handleCheckDialog(mockDialog, mockHtml)
      ).resolves.toBeUndefined();
    });

    test('should handle missing dialog check', async () => {
      mockDialog.check = null;

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation((dialog, html, state, target, manualCover, callback) => {
        callbackFunction = callback;
      });

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      // Callback should handle missing check gracefully
      expect(() => {
        if (typeof callbackFunction === 'function') {
          callbackFunction({
            chosen: 'standard',
            target: targetToken,
            targetActor: targetToken.actor,
          });
        }
      }).not.toThrow();
    });

    test('should handle calculateTotal errors gracefully', async () => {
      mockDialog.check.calculateTotal.mockImplementation(() => {
        throw new Error('Calculate total failed');
      });

      let callbackFunction;
      mockCoverUIManager.injectDialogCoverUI.mockImplementation((dialog, html, state, target, manualCover, callback) => {
        callbackFunction = callback;
      });

      await attackRollUseCase.handleCheckDialog(mockDialog, mockHtml);

      expect(() => {
        if (typeof callbackFunction === 'function') {
          callbackFunction({
            chosen: 'standard',
            target: targetToken,
            targetActor: targetToken.actor,
          });
        }
      }).not.toThrow();
    });
  });

  describe('handleCheckRoll', () => {
    test('should handle check roll and return success', async () => {
      const result = await attackRollUseCase.handleCheckRoll({}, {});
      expect(result).toEqual({ success: true });
    });
  });

  describe('_resolveAttackerFromCtx', () => {
    test('should resolve attacker from context token object', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const ctx = {
        token: {
          object: attackerToken,
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
    });

    test('should resolve attacker from token ID', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });
      
      // Mock canvas.tokens.get to return the token
      global.canvas.tokens.get = jest.fn().mockReturnValue(attackerToken);

      const ctx = {
        token: {
          id: 'attacker',
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
      expect(global.canvas.tokens.get).toHaveBeenCalledWith('attacker');
    });

    test('should resolve attacker from actor active tokens', () => {
      const attackerToken = global.createMockToken({ id: 'attacker' });
      const ctx = {
        actor: {
          getActiveTokens: jest.fn().mockReturnValue([attackerToken]),
        },
      };

      const result = attackRollUseCase._resolveAttackerFromCtx(ctx);
      expect(result).toBe(attackerToken);
      expect(ctx.actor.getActiveTokens).toHaveBeenCalled();
    });

    test('should return null for invalid context', () => {
      expect(attackRollUseCase._resolveAttackerFromCtx({})).toBeNull();
      expect(attackRollUseCase._resolveAttackerFromCtx(null)).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle malformed dialog objects', async () => {
      const malformedDialog = {
        context: null,
        check: undefined,
      };

      await expect(
        attackRollUseCase.handleCheckDialog(malformedDialog, document.createElement('div'))
      ).resolves.toBeUndefined();
    });
  });
});
