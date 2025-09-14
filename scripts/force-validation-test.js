/**
 * Force Override Validation Test
 * This script forces some overrides to appear invalid to test the validation dialog
 */

window.forceOverrideValidationTest = async function() {
  console.log('🧪 Forcing override validation test...');
  
  try {
    // Get the EventDrivenVisibilitySystem 
    const { eventDrivenVisibilitySystem } = await import('./visibility/auto-visibility/EventDrivenVisibilitySystem.js');
    
    // Create some test override data if none exists
    const tokens = canvas.tokens.placeables;
    if (tokens.length < 2) {
      console.log('❌ Need at least 2 tokens on the canvas for testing');
      return;
    }
    
    const token1 = tokens[0];
    const token2 = tokens[1];
    
    console.log(`🎯 Creating test override: ${token1.document.name} → ${token2.document.name}`);
    
    // Manually add an override to the system
    const overrideKey = `${token1.id}-${token2.id}`;
    const testOverride = {
      state: 'undetected',
      source: 'manual_action',
      hasCover: true,
      hasConcealment: true,
      timestamp: Date.now()
    };
    
    // Access private field for testing (this is normally set via hooks)
    const activeOverrides = eventDrivenVisibilitySystem._activeOverrides || new Map();
    activeOverrides.set(overrideKey, testOverride);
    
    console.log('✅ Test override added:', { key: overrideKey, override: testOverride });
    
    // Now manually trigger the validation with a mock that will fail
    const invalidOverrides = [{
      observerId: token1.id,
      targetId: token2.id,
      override: testOverride,
      reason: 'moved into bright light - test forced validation'
    }];
    
    console.log('🎭 Calling showOverrideValidationDialog directly...');
    
    // Call the private method directly for testing
    await eventDrivenVisibilitySystem._showOverrideValidationDialog(invalidOverrides);
    
  } catch (error) {
    console.error('❌ Error in forced override validation test:', error);
  }
};

window.triggerValidationForActiveOverrides = async function() {
  console.log('🧪 Triggering validation for active overrides...');
  
  try {
    const { eventDrivenVisibilitySystem } = await import('./visibility/auto-visibility/EventDrivenVisibilitySystem.js');
    
    // Get active overrides
    const activeOverrides = eventDrivenVisibilitySystem._activeOverrides || new Map();
    
    if (activeOverrides.size === 0) {
      console.log('ℹ️ No active overrides to validate. Create some sneak overrides first.');
      return;
    }
    
    console.log(`📊 Found ${activeOverrides.size} active overrides to force validate`);
    
    // Force all overrides to appear invalid
    const invalidOverrides = [];
    for (const [key, override] of activeOverrides.entries()) {
      const [observerId, targetId] = key.split('-');
      
      invalidOverrides.push({
        observerId,
        targetId, 
        override,
        reason: 'forced validation test - moved into bright light with clear visibility'
      });
    }
    
    console.log('🎭 Forcing validation dialog with existing overrides...');
    
    // Call the validation dialog directly
    await eventDrivenVisibilitySystem._showOverrideValidationDialog(invalidOverrides);
    
  } catch (error) {
    console.error('❌ Error triggering validation for active overrides:', error);
  }
};

console.log('🔧 Override validation test functions loaded!');
console.log('📞 Run forceOverrideValidationTest() to create test overrides and show dialog');
console.log('📞 Run triggerValidationForActiveOverrides() to force validate existing overrides');