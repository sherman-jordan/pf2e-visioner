/**
 * Unit tests for SneakPositionTracker
 */

import { jest } from '@jest/globals';

// Mock the constants
jest.mock('../../scripts/constants.js', () => ({
  VISIBILITY_STATES: {
    observed: { label: 'Observed', visible: true },
    concealed: { label: 'Concealed', visible: true },
    hidden: { label: 'Hidden', visible: true },
    undetected: { label: 'Undetected', visible: false }
  },
  COVER_STATES: {
    none: { label: 'None', bonusStealth: 0, canHide: false },
    lesser: { label: 'Lesser Cover', bonusStealth: 0, canHide: false },
    standard: { label: 'Standard Cover', bonusStealth: 2, canHide: true },
    greater: { label: 'Greater Cover', bonusStealth: 4, canHide: true }
  }
}));

// Mock the utils
jest.mock('../../scripts/utils.js', () => ({
  getVisibilityBetween: jest.fn(),
  getCoverBetween: jest.fn()
}));

// Mock the auto-cover system
const mockAutoCoverSystem = {
  isEnabled: jest.fn(() => true),
  detectCover: jest.fn(() => 'none')
};

jest.mock('../../scripts/cover/auto-cover/AutoCoverSystem.js', () => ({
  default: mockAutoCoverSystem
}));

// Mock FoundryVTT globals
global.game = {
  settings: {
    get: jest.fn((module, setting) => {
      if (setting === 'autoVisibilityEnabled') return true;
      if (setting === 'autoCover') return true;
      return true;
    })
  }
};

global.canvas = {
  grid: {
    measureDistances: jest.fn(() => [5])
  },
  walls: {
    checkCollision: jest.fn(() => false)
  },
  lighting: {
    getIllumination: jest.fn(() => 0.5)
  }
};

global.Ray = class MockRay {
  constructor(start, end) {
    this.A = start;
    this.B = end;
  }
};

describe('SneakPositionTracker', () => {
  let tracker;
  let mockSneakingToken;
  let mockObserverToken;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Import the tracker after mocks are set up
    const { SneakPositionTracker } = await import('../../scripts/chat/services/position/SneakPositionTracker.js');
    tracker = new SneakPositionTracker();

    // Create mock tokens
    mockSneakingToken = {
      document: { id: 'sneaking-token-1' },
      center: { x: 100, y: 100 }
    };

    mockObserverToken = {
      document: { id: 'observer-token-1' },
      center: { x: 200, y: 200 }
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('captureStartPositions', () => {
    it('should capture position states for all targets', async () => {
      // Mock the utils
      const { getVisibilityBetween, getCoverBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('hidden');
      getCoverBetween.mockReturnValue('standard');

      const targets = [mockObserverToken];
      const result = await tracker.captureStartPositions(mockSneakingToken, targets);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      
      const positionState = result.get('observer-token-1');
      expect(positionState).toBeDefined();
      expect(positionState.avsVisibility).toBe('hidden');
      expect(positionState.coverState).toBe('standard');
      expect(positionState.stealthBonus).toBe(2);
      expect(positionState.avsCalculated).toBe(true);
      expect(positionState.coverCalculated).toBe(true);
    });

    it('should handle invalid parameters gracefully', async () => {
      const result1 = await tracker.captureStartPositions(null, []);
      expect(result1).toBeInstanceOf(Map);
      expect(result1.size).toBe(0);

      const result2 = await tracker.captureStartPositions(mockSneakingToken, null);
      expect(result2).toBeInstanceOf(Map);
      expect(result2.size).toBe(0);
    });

    it('should handle errors in position calculation', async () => {
      // Mock utils to throw errors
      const { getVisibilityBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockImplementation(() => {
        throw new Error('AVS calculation failed');
      });

      const targets = [mockObserverToken];
      const result = await tracker.captureStartPositions(mockSneakingToken, targets);

      expect(result.size).toBe(1);
      const positionState = result.get('observer-token-1');
      expect(positionState.systemErrors).toContain('AVS calculation failed: AVS calculation failed');
      expect(positionState.avsCalculated).toBe(false);
    });
  });

  describe('calculateEndPositions', () => {
    it('should calculate end positions same as start positions', async () => {
      const { getVisibilityBetween, getCoverBetween } = await import('../../scripts/utils.js');
      getVisibilityBetween.mockReturnValue('concealed');
      getCoverBetween.mockReturnValue('none');

      const targets = [mockObserverToken];
      const result = await tracker.calculateEndPositions(mockSneakingToken, targets);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      
      const positionState = result.get('observer-token-1');
      expect(positionState.avsVisibility).toBe('concealed');
      expect(positionState.coverState).toBe('none');
    });
  });

  describe('analyzePositionTransitions', () => {
    it('should analyze transitions between start and end positions', async () => {
      // Create start positions
      const startPositions = new Map();
      startPositions.set('observer-token-1', {
        avsVisibility: 'observed',
        coverState: 'none',
        stealthBonus: 0,
        timestamp: Date.now()
      });

      // Create end positions
      const endPositions = new Map();
      endPositions.set('observer-token-1', {
        avsVisibility: 'hidden',
        coverState: 'standard',
        stealthBonus: 2,
        timestamp: Date.now()
      });

      const transitions = tracker.analyzePositionTransitions(startPositions, endPositions);

      expect(transitions).toBeInstanceOf(Map);
      expect(transitions.size).toBe(1);

      const transition = transitions.get('observer-token-1');
      expect(transition.hasChanged).toBe(true);
      expect(transition.avsVisibilityChanged).toBe(true);
      expect(transition.coverStateChanged).toBe(true);
      expect(transition.stealthBonusChange).toBe(2);
      expect(transition.transitionType).toBe('improved');
      expect(transition.avsTransition.from).toBe('observed');
      expect(transition.avsTransition.to).toBe('hidden');
      expect(transition.coverTransition.from).toBe('none');
      expect(transition.coverTransition.to).toBe('standard');
    });

    it('should detect no changes when positions are identical', async () => {
      const samePosition = {
        avsVisibility: 'concealed',
        coverState: 'lesser',
        stealthBonus: 0,
        timestamp: Date.now()
      };

      const startPositions = new Map();
      startPositions.set('observer-token-1', samePosition);

      const endPositions = new Map();
      endPositions.set('observer-token-1', { ...samePosition });

      const transitions = tracker.analyzePositionTransitions(startPositions, endPositions);
      const transition = transitions.get('observer-token-1');

      expect(transition.hasChanged).toBe(false);
      expect(transition.avsVisibilityChanged).toBe(false);
      expect(transition.coverStateChanged).toBe(false);
      expect(transition.transitionType).toBe('unchanged');
    });

    it('should detect worsened transitions', async () => {
      const startPositions = new Map();
      startPositions.set('observer-token-1', {
        avsVisibility: 'hidden',
        coverState: 'standard',
        stealthBonus: 2
      });

      const endPositions = new Map();
      endPositions.set('observer-token-1', {
        avsVisibility: 'observed',
        coverState: 'none',
        stealthBonus: 0
      });

      const transitions = tracker.analyzePositionTransitions(startPositions, endPositions);
      const transition = transitions.get('observer-token-1');

      expect(transition.transitionType).toBe('worsened');
      expect(transition.stealthBonusChange).toBe(-2);
    });
  });

  describe('system status checking', () => {
    it('should check AVS system status', async () => {
      // Test when AVS is enabled
      global.game.settings.get.mockReturnValue(true);
      expect(tracker._isAVSEnabled()).toBe(true);

      // Test when AVS is disabled
      global.game.settings.get.mockReturnValue(false);
      expect(tracker._isAVSEnabled()).toBe(true); // Should still return true as AVS is always available
    });

    it('should check Auto-Cover system status', async () => {
      // Test when Auto-Cover is enabled
      mockAutoCoverSystem.isEnabled.mockReturnValue(true);
      expect(tracker._isAutoCoverEnabled()).toBe(true);

      // Test when Auto-Cover is disabled
      mockAutoCoverSystem.isEnabled.mockReturnValue(false);
      expect(tracker._isAutoCoverEnabled()).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should calculate distance between tokens', () => {
      const distance = tracker._calculateDistance(mockSneakingToken, mockObserverToken);
      expect(distance).toBe(5);
      expect(global.canvas.grid.measureDistances).toHaveBeenCalled();
    });

    it('should check line of sight between tokens', () => {
      const hasLOS = tracker._hasLineOfSight(mockSneakingToken, mockObserverToken);
      expect(hasLOS).toBe(true);
      expect(global.canvas.walls.checkCollision).toHaveBeenCalled();
    });

    it('should get lighting conditions', () => {
      const lighting = tracker._getLightingConditions(mockSneakingToken, mockObserverToken);
      expect(lighting).toBe('dim');
      expect(global.canvas.lighting.getIllumination).toHaveBeenCalled();
    });

    it('should handle errors in utility methods gracefully', () => {
      // Mock canvas methods to throw errors
      global.canvas.grid.measureDistances.mockImplementation(() => {
        throw new Error('Distance calculation failed');
      });
      global.canvas.walls.checkCollision.mockImplementation(() => {
        throw new Error('LOS calculation failed');
      });
      global.canvas.lighting.getIllumination.mockImplementation(() => {
        throw new Error('Lighting calculation failed');
      });

      expect(tracker._calculateDistance(mockSneakingToken, mockObserverToken)).toBe(0);
      expect(tracker._hasLineOfSight(mockSneakingToken, mockObserverToken)).toBe(true);
      expect(tracker._getLightingConditions(mockSneakingToken, mockObserverToken)).toBe('unknown');
    });
  });

  describe('effective visibility determination', () => {
    it('should preserve hidden and undetected states regardless of cover', () => {
      expect(tracker._determineEffectiveVisibility('hidden', 'standard')).toBe('hidden');
      expect(tracker._determineEffectiveVisibility('undetected', 'greater')).toBe('undetected');
    });

    it('should upgrade observed to concealed when cover allows hiding', () => {
      expect(tracker._determineEffectiveVisibility('observed', 'standard')).toBe('concealed');
      expect(tracker._determineEffectiveVisibility('observed', 'greater')).toBe('concealed');
    });

    it('should keep observed when cover does not allow hiding', () => {
      expect(tracker._determineEffectiveVisibility('observed', 'none')).toBe('observed');
      expect(tracker._determineEffectiveVisibility('observed', 'lesser')).toBe('observed');
    });

    it('should preserve concealed state', () => {
      expect(tracker._determineEffectiveVisibility('concealed', 'none')).toBe('concealed');
      expect(tracker._determineEffectiveVisibility('concealed', 'standard')).toBe('concealed');
    });
  });

  describe('visibility improvement for stealth', () => {
    it('should correctly identify improvements for stealth', () => {
      expect(tracker._isVisibilityImprovedForStealth('observed', 'concealed')).toBe(true);
      expect(tracker._isVisibilityImprovedForStealth('concealed', 'hidden')).toBe(true);
      expect(tracker._isVisibilityImprovedForStealth('hidden', 'undetected')).toBe(true);
      expect(tracker._isVisibilityImprovedForStealth('observed', 'undetected')).toBe(true);
    });

    it('should correctly identify non-improvements for stealth', () => {
      expect(tracker._isVisibilityImprovedForStealth('hidden', 'concealed')).toBe(false);
      expect(tracker._isVisibilityImprovedForStealth('undetected', 'observed')).toBe(false);
      expect(tracker._isVisibilityImprovedForStealth('concealed', 'observed')).toBe(false);
    });

    it('should handle same visibility states', () => {
      expect(tracker._isVisibilityImprovedForStealth('hidden', 'hidden')).toBe(false);
      expect(tracker._isVisibilityImprovedForStealth('observed', 'observed')).toBe(false);
    });
  });
});