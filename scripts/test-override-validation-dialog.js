/**
 * Test script for the Override Validation Dialog
 * Run this in the browser console to test the ApplicationV2 dialog
 */

window.testOverrideValidationDialog = async function() {
  console.log('🧪 Testing Override Validation Dialog...');
  
  try {
    // Import the dialog
    const { OverrideValidationDialog } = await import('./ui/override-validation-dialog.js');
    
    // Create mock invalid override data
    const mockInvalidOverrides = [
      {
        id: 'test1',
        observerId: 'mock-observer-1',
        targetId: 'mock-target-1', 
        observerName: 'Test Observer 1',
        targetName: 'Test Target 1',
        state: 'undetected',
        source: 'sneak_action',
        reason: 'is now clearly visible with no concealment or cover',
        hasCover: false,
        hasConcealment: false,
        isManual: true
      },
      {
        id: 'test2',
        observerId: 'mock-observer-2',
        targetId: 'mock-target-2',
        observerName: 'Test Observer 2', 
        targetName: 'Test Target 2',
        state: 'undetected',
        source: 'manual_action',
        reason: 'no longer has cover and is now observed',
        hasCover: false,
        hasConcealment: false,
        isManual: true
      }
    ];
    
    console.log('🎭 Showing dialog with mock data:', mockInvalidOverrides);
    
    // Show the dialog
    const result = await OverrideValidationDialog.show({
      overrides: mockInvalidOverrides,
      title: 'Test Override Validation - 2 Invalid Overrides'
    });
    
    console.log('✅ Dialog result:', result);
    
    if (result) {
      console.log(`🎯 User selected action: ${result.action}`);
      switch (result.action) {
        case 'clear-all':
          console.log('🧹 Would clear all overrides');
          break;
        case 'clear-manual':
          console.log('🔧 Would clear manual overrides only');
          break;
        case 'keep':
          console.log('✋ Would keep all current overrides');
          break;
      }
    } else {
      console.log('❌ Dialog was cancelled');
    }
    
  } catch (error) {
    console.error('❌ Error testing dialog:', error);
  }
};

// Also create a function to test with real overrides
window.testWithRealOverrides = async function() {
  console.log('🧪 Testing with real override data...');
  
  try {
    // Get the EventDrivenVisibilitySystem
    const { eventDrivenVisibilitySystem } = await import('./visibility/auto-visibility/EventDrivenVisibilitySystem.js');
    
    // Get current active overrides
    const activeOverrides = eventDrivenVisibilitySystem._activeOverrides || new Map();
    console.log('📊 Current active overrides:', activeOverrides);
    
    if (activeOverrides.size === 0) {
      console.log('ℹ️ No active overrides found. Create some sneak overrides first.');
      return;
    }
    
    // Convert to dialog format and mark as invalid for testing
    const invalidOverrides = [];
    for (const [key, override] of activeOverrides.entries()) {
      const [observerId, targetId] = key.split('-');
      const observer = canvas.tokens?.get(observerId);
      const target = canvas.tokens?.get(targetId);
      
      if (observer && target) {
        invalidOverrides.push({
          id: key,
          observerId,
          targetId,
          observerName: observer.document.name,
          targetName: target.document.name,
          state: override.state || 'undetected',
          source: override.source || 'unknown',
          reason: 'moved into bright light with clear line of sight (test)',
          hasCover: override.hasCover || false,
          hasConcealment: override.hasConcealment || false,
          isManual: override.source === 'manual_action'
        });
      }
    }
    
    if (invalidOverrides.length === 0) {
      console.log('ℹ️ No valid token pairs found for testing.');
      return;
    }
    
    console.log('🎭 Testing with real override data:', invalidOverrides);
    
    // Import and show the dialog
    const { OverrideValidationDialog } = await import('./ui/override-validation-dialog.js');
    
    const result = await OverrideValidationDialog.show({
      overrides: invalidOverrides,
      title: `Real Override Test - ${invalidOverrides.length} Override${invalidOverrides.length > 1 ? 's' : ''}`
    });
    
    console.log('✅ Real dialog result:', result);
    
  } catch (error) {
    console.error('❌ Error testing with real overrides:', error);
  }
};

console.log('🧪 Override Validation Dialog test functions loaded!');
console.log('📞 Run testOverrideValidationDialog() to test with mock data');
console.log('📞 Run testWithRealOverrides() to test with current overrides');