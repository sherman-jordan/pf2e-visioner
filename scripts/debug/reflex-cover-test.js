/**
 * Test utilities for debugging reflex save cover modifiers
 * Use these functions in the browser console to debug issues
 */

// Test if Statistic class is accessible and can be wrapped
window.pf2eVisionerDebugReflexCover = {
  
  // Test 1: Check if we can find the Statistic class
  findStatisticClass() {
    console.log('=== Testing Statistic Class Detection ===');
    
    // Method 1: Try to find through an actor
    const testActor = game.actors.find(a => a.type === 'character');
    if (testActor) {
      console.log('Found test actor:', testActor.name);
      const reflexStat = testActor.getStatistic('reflex');
      if (reflexStat) {
        console.log('Found reflex statistic:', reflexStat);
        console.log('Statistic class:', reflexStat.constructor.name);
        console.log('Has roll method:', typeof reflexStat.roll === 'function');
        console.log('Roll method prototype:', reflexStat.constructor.prototype.roll);
        return reflexStat.constructor;
      }
    }
    
    // Method 2: Try CONFIG paths
    console.log('Checking CONFIG paths...');
    console.log('CONFIG.PF2E exists:', !!CONFIG.PF2E);
    console.log('game.pf2e exists:', !!game.pf2e);
    
    return null;
  },
  
  // Test 2: Check current libWrapper registrations
  checkWrappers() {
    console.log('=== Checking libWrapper Registrations ===');
    if (window.libWrapper) {
      console.log('libWrapper registrations:', window.libWrapper.get_libwrapper_meta());
      const pf2eRegistrations = Object.keys(window.libWrapper.get_libwrapper_meta())
        .filter(key => key.includes('pf2e-visioner'))
        .map(key => ({
          target: key,
          data: window.libWrapper.get_libwrapper_meta()[key]
        }));
      console.log('PF2E Visioner registrations:', pf2eRegistrations);
    } else {
      console.log('libWrapper not available');
    }
  },
  
  // Test 3: Simulate a reflex save with cover
  async testReflexSaveWithCover() {
    console.log('=== Testing Reflex Save with Cover ===');
    
    const actor = game.actors.find(a => a.type === 'character');
    if (!actor) {
      console.error('No character actor found');
      return;
    }
    
    const reflexStat = actor.getStatistic('reflex');
    if (!reflexStat) {
      console.error('No reflex statistic found');
      return;
    }
    
    console.log('Testing actor:', actor.name);
    console.log('Reflex statistic:', reflexStat);
    
    // Test with area-effect roll options
    const rollArgs = {
      extraRollOptions: ['area-effect'],
      createMessage: false  // Don't spam chat
    };
    
    console.log('Roll arguments:', rollArgs);
    
    try {
      const result = await reflexStat.roll(rollArgs);
      console.log('Roll result:', result);
      console.log('Roll total:', result?.total);
      console.log('Roll modifiers:', result?.options?.modifiers);
      return result;
    } catch (error) {
      console.error('Roll failed:', error);
      return null;
    }
  },
  
  // Test 4: Check template cover cache
  checkTemplateCover() {
    console.log('=== Checking Template Cover Cache ===');
    console.log('Template origins:', window.pf2eVisionerTemplateOrigins);
    console.log('Template cover cache:', window.pf2eVisionerTemplateCoverByTarget);
    
    if (window.pf2eVisionerTemplateCoverByTarget) {
      console.log('Cover cache entries:');
      for (const [key, value] of window.pf2eVisionerTemplateCoverByTarget.entries()) {
        console.log(`  ${key}: ${value.state} (bonus: ${value.bonus})`);
      }
    }
  },
  
  // Test 5: Force create a cover modifier for testing
  createTestCoverModifier(bonus = 2) {
    console.log('=== Creating Test Cover Modifier ===');
    
    if (!game.pf2e?.Modifier) {
      console.error('game.pf2e.Modifier not available');
      return null;
    }
    
    const modifier = new game.pf2e.Modifier({
      slug: 'test-cover',
      label: 'Test Cover',
      modifier: bonus,
      type: 'circumstance'
    });
    
    console.log('Created modifier:', modifier);
    return modifier;
  },
  
  // Test 6: Full end-to-end test
  async fullTest() {
    console.log('=== Running Full End-to-End Test ===');
    
    this.findStatisticClass();
    this.checkWrappers();
    this.checkTemplateCover();
    await this.testReflexSaveWithCover();
    this.createTestCoverModifier();
    
    console.log('=== Test Complete ===');
  }
};

// Auto-run basic checks on load
console.log('PF2E Visioner: Reflex cover debug utilities loaded. Use pf2eVisionerDebugReflexCover.fullTest() to run all tests.');