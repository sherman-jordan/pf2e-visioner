/**
 * Unit tests for Position State Data Models and Validation
 */

import { jest } from '@jest/globals';

describe('Position State Models and Validation', () => {
  let PositionStateModels;
  let PositionStateHelpers;

  beforeAll(async () => {
    // Import the modules
    PositionStateModels = await import('../../scripts/chat/services/position/PositionStateModels.js');
    PositionStateHelpers = await import('../../scripts/chat/services/position/PositionStateHelpers.js');
  });

  describe('Constants', () => {
    it('should export correct AVS visibility states', () => {
      expect(PositionStateModels.AVS_VISIBILITY_STATES).toEqual([
        'hidden',
        'concealed',
        'observed',
        'undetected'
      ]);
    });

    it('should export correct Auto-Cover states', () => {
      expect(PositionStateModels.AUTO_COVER_STATES).toEqual([
        'none',
        'lesser',
        'standard',
        'greater'
      ]);
    });

    it('should export correct lighting conditions', () => {
      expect(PositionStateModels.LIGHTING_CONDITIONS).toEqual([
        'bright',
        'dim',
        'darkness',
        'unknown'
      ]);
    });

    it('should export correct transition types', () => {
      expect(PositionStateModels.TRANSITION_TYPES).toEqual([
        'improved',
        'worsened',
        'unchanged'
      ]);
    });
  });

  describe('createDefaultPositionState', () => {
    it('should create a valid default position state', () => {
      const state = PositionStateModels.createDefaultPositionState();
      
      expect(state).toHaveProperty('avsVisibility', 'observed');
      expect(state).toHaveProperty('avsCalculated', false);
      expect(state).toHaveProperty('avsOverride', null);
      expect(state).toHaveProperty('coverState', 'none');
      expect(state).toHaveProperty('coverCalculated', false);
      expect(state).toHaveProperty('coverOverride', null);
      expect(state).toHaveProperty('stealthBonus', 0);
      expect(state).toHaveProperty('effectiveVisibility', 'observed');
      expect(state).toHaveProperty('distance', 0);
      expect(state).toHaveProperty('hasLineOfSight', true);
      expect(state).toHaveProperty('lightingConditions', 'unknown');
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('avsEnabled', true);
      expect(state).toHaveProperty('autoCoverEnabled', true);
      expect(state).toHaveProperty('systemErrors');
      expect(Array.isArray(state.systemErrors)).toBe(true);
      expect(state.systemErrors).toHaveLength(0);
    });

    it('should apply overrides correctly', () => {
      const overrides = {
        avsVisibility: 'hidden',
        stealthBonus: 5,
        distance: 10
      };
      
      const state = PositionStateModels.createDefaultPositionState(overrides);
      
      expect(state.avsVisibility).toBe('hidden');
      expect(state.stealthBonus).toBe(5);
      expect(state.distance).toBe(10);
      // Other fields should remain default
      expect(state.coverState).toBe('none');
      expect(state.avsCalculated).toBe(false);
    });
  });

  describe('createDefaultPositionTransition', () => {
    it('should create a valid default position transition', () => {
      const startPos = PositionStateModels.createDefaultPositionState({ avsVisibility: 'observed' });
      const endPos = PositionStateModels.createDefaultPositionState({ avsVisibility: 'hidden' });
      
      const transition = PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos);
      
      expect(transition).toHaveProperty('targetId', 'target-1');
      expect(transition).toHaveProperty('startPosition', startPos);
      expect(transition).toHaveProperty('endPosition', endPos);
      expect(transition).toHaveProperty('hasChanged', false);
      expect(transition).toHaveProperty('avsVisibilityChanged', false);
      expect(transition).toHaveProperty('coverStateChanged', false);
      expect(transition).toHaveProperty('impactOnDC', 0);
      expect(transition).toHaveProperty('stealthBonusChange', 0);
      expect(transition).toHaveProperty('transitionType', 'unchanged');
      expect(transition).toHaveProperty('avsTransition');
      expect(transition).toHaveProperty('coverTransition');
    });

    it('should handle missing position states', () => {
      const transition = PositionStateModels.createDefaultPositionTransition('target-1');
      
      expect(transition.targetId).toBe('target-1');
      expect(transition.startPosition).toBeDefined();
      expect(transition.endPosition).toBeDefined();
    });

    it('should apply overrides correctly', () => {
      const overrides = {
        hasChanged: true,
        transitionType: 'improved'
      };
      
      const transition = PositionStateModels.createDefaultPositionTransition('target-1', null, null, overrides);
      
      expect(transition.hasChanged).toBe(true);
      expect(transition.transitionType).toBe('improved');
    });
  });

  describe('validatePositionState', () => {
    it('should validate a correct position state', () => {
      const validState = PositionStateModels.createDefaultPositionState();
      const result = PositionStateModels.validatePositionState(validState);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null or undefined input', () => {
      const result1 = PositionStateModels.validatePositionState(null);
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Position state must be a non-null object');

      const result2 = PositionStateModels.validatePositionState(undefined);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('Position state must be a non-null object');
    });

    it('should reject non-object input', () => {
      const result = PositionStateModels.validatePositionState('not an object');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Position state must be a non-null object');
    });

    it('should validate AVS visibility state', () => {
      const invalidState = PositionStateModels.createDefaultPositionState({
        avsVisibility: 'invalid-state'
      });
      
      const result = PositionStateModels.validatePositionState(invalidState);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid avsVisibility'))).toBe(true);
    });

    it('should validate boolean fields', () => {
      const invalidState = PositionStateModels.createDefaultPositionState({
        avsCalculated: 'not a boolean',
        hasLineOfSight: 1
      });
      
      const result = PositionStateModels.validatePositionState(invalidState);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('avsCalculated must be a boolean');
      expect(result.errors).toContain('hasLineOfSight must be a boolean');
    });

    it('should validate numeric fields', () => {
      const invalidState = PositionStateModels.createDefaultPositionState({
        stealthBonus: 'not a number',
        distance: -5,
        timestamp: 0
      });
      
      const result = PositionStateModels.validatePositionState(invalidState);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('stealthBonus must be a finite number');
      expect(result.errors).toContain('distance must be a non-negative finite number');
      expect(result.errors).toContain('timestamp must be a positive finite number');
    });

    it('should validate cover state', () => {
      const invalidState = PositionStateModels.createDefaultPositionState({
        coverState: 'invalid-cover'
      });
      
      const result = PositionStateModels.validatePositionState(invalidState);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid coverState'))).toBe(true);
    });

    it('should validate lighting conditions', () => {
      const invalidState = PositionStateModels.createDefaultPositionState({
        lightingConditions: 'invalid-lighting'
      });
      
      const result = PositionStateModels.validatePositionState(invalidState);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid lightingConditions'))).toBe(true);
    });

    it('should validate system errors array', () => {
      const invalidState1 = PositionStateModels.createDefaultPositionState({
        systemErrors: 'not an array'
      });
      
      const result1 = PositionStateModels.validatePositionState(invalidState1);
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('systemErrors must be an array');

      const invalidState2 = PositionStateModels.createDefaultPositionState({
        systemErrors: ['valid error', 123, 'another valid error']
      });
      
      const result2 = PositionStateModels.validatePositionState(invalidState2);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.some(error => error.includes('systemErrors[1] must be a string'))).toBe(true);
    });

    it('should validate override fields can be null or string', () => {
      const validState = PositionStateModels.createDefaultPositionState({
        avsOverride: 'some override',
        coverOverride: null
      });
      
      const result = PositionStateModels.validatePositionState(validState);
      expect(result.isValid).toBe(true);

      const invalidState = PositionStateModels.createDefaultPositionState({
        avsOverride: 123
      });
      
      const invalidResult = PositionStateModels.validatePositionState(invalidState);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('avsOverride must be null or a string');
    });
  });

  describe('validatePositionTransition', () => {
    it('should validate a correct position transition', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      const validTransition = PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos);
      
      const result = PositionStateModels.validatePositionTransition(validTransition);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null or undefined input', () => {
      const result = PositionStateModels.validatePositionTransition(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Position transition must be a non-null object');
    });

    it('should validate target ID', () => {
      const transition = PositionStateModels.createDefaultPositionTransition(123);
      const result = PositionStateModels.validatePositionTransition(transition);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('targetId must be a string');
    });

    it('should validate position states', () => {
      const invalidTransition = {
        targetId: 'target-1',
        startPosition: null,
        endPosition: { invalid: 'position' },
        hasChanged: true,
        avsVisibilityChanged: false,
        coverStateChanged: false,
        impactOnDC: 0,
        stealthBonusChange: 0,
        transitionType: 'unchanged',
        avsTransition: { from: 'observed', to: 'hidden', changed: false },
        coverTransition: { from: 'none', to: 'none', bonusChange: 0, changed: false }
      };
      
      const result = PositionStateModels.validatePositionTransition(invalidTransition);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('startPosition is required');
      expect(result.errors.some(error => error.includes('endPosition validation failed'))).toBe(true);
    });

    it('should validate transition type', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      const invalidTransition = PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos, {
        transitionType: 'invalid-type'
      });
      
      const result = PositionStateModels.validatePositionTransition(invalidTransition);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid transitionType'))).toBe(true);
    });

    it('should validate AVS transition object', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      const invalidTransition = PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos, {
        avsTransition: {
          from: 'invalid-state',
          to: 'hidden',
          changed: 'not a boolean'
        }
      });
      
      const result = PositionStateModels.validatePositionTransition(invalidTransition);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid avsTransition.from'))).toBe(true);
      expect(result.errors.some(error => error.includes('avsTransition.changed must be a boolean'))).toBe(true);
    });

    it('should validate cover transition object', () => {
      const startPos = PositionStateModels.createDefaultPositionState();
      const endPos = PositionStateModels.createDefaultPositionState();
      const invalidTransition = PositionStateModels.createDefaultPositionTransition('target-1', startPos, endPos, {
        coverTransition: {
          from: 'invalid-cover',
          to: 'standard',
          bonusChange: 'not a number',
          changed: true
        }
      });
      
      const result = PositionStateModels.validatePositionTransition(invalidTransition);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid coverTransition.from'))).toBe(true);
      expect(result.errors.some(error => error.includes('coverTransition.bonusChange must be a finite number'))).toBe(true);
    });
  });
});