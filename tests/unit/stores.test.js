/**
 * Test file for store functions
 */

import { getCoverBetween, setCoverBetween } from '../../scripts/stores/cover-map.js';
import { getVisibilityBetween, setVisibilityBetween } from '../../scripts/stores/visibility-map.js';

describe('Store Functions', () => {
  test('should import visibility functions', () => {
    expect(typeof getVisibilityBetween).toBe('function');
    expect(typeof setVisibilityBetween).toBe('function');
  });

  test('should import cover functions', () => {
    expect(typeof getCoverBetween).toBe('function');
    expect(typeof setCoverBetween).toBe('function');
  });

  test('should get default visibility state', () => {
    const mockObserver = global.createMockToken({ id: 'observer' });
    const mockTarget = global.createMockToken({ id: 'target' });
    
    const result = getVisibilityBetween(mockObserver, mockTarget);
    expect(result).toBe('observed'); // Default state
  });

  test('should get default cover state', () => {
    const mockObserver = global.createMockToken({ id: 'observer' });
    const mockTarget = global.createMockToken({ id: 'target' });
    
    const result = getCoverBetween(mockObserver, mockTarget);
    expect(result).toBe('none'); // Default state
  });
});
