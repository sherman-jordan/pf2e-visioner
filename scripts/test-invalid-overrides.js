/**
 * Test script to cr    // Step 3: Verify overrides were created (check flags)
    console.log("📋 Step 3: Checking created overrides...");
    const allTokens = canvas.tokens.placeables;
    let overrideCount = 0;
    for (const token of allTokens) {
        const flags = token.document.flags['pf2e-visioner'] || {};
        for (const flagKey of Object.keys(flags)) {
            if (flagKey.startsWith('avs-override-from-')) {
                overrideCount++;
                console.log(`   ✅ Found persistent override: ${token.name} <- ${flagKey}`);
            }
        }
    }
    console.log(`📊 Total persistent overrides: ${overrideCount}`); where override validation dialog should appear
 * Run these commands in console to test different validation scenarios
 */

// Create sneak overrides first, then test validation with PERSISTENCE
window.createSneakAndTestValidation = async () => {
    console.log("🧪 Testing complete sneak -> bright light validation flow with PERSISTENCE...");
    
    const kyraToken = canvas.tokens.placeables.find(t => t.name === "Kyra");
    if (!kyraToken) {
        console.log("❌ Kyra token not found");
        return;
    }
    
    // Step 1: Move to darkness
    console.log("🌑 Step 1: Moving Kyra to darkness...");
    await kyraToken.document.update({ x: 2650, y: 1850 });
    
    // Step 2: Apply sneak to create PERSISTENT overrides
    console.log("🥷 Step 2: Applying sneak action (creates persistent flags)...");
    const SneakActionService = game.modules.get('pf2e-visioner').api.services.SneakActionService;
    await SneakActionService.processSneakAction(kyraToken.actor);
    
    // Step 3: Verify overrides were created (check flags)
    console.log("📋 Step 3: Checking created overrides...");
    const allTokens = canvas.tokens.placeables;
    let overrideCount = 0;
    for (const token of allTokens) {
        const flags = token.document.flags['pf2e-visioner'] || {};
        for (const flagKey of Object.keys(flags)) {
            if (flagKey.startsWith('avs-override-to-')) {
                overrideCount++;
                console.log(`   ✅ Found persistent override: ${token.name} -> ${flagKey}`);
            }
        }
    }
    console.log(`� Total persistent overrides: ${overrideCount}`);
    
    if (overrideCount === 0) {
        console.log("❌ No persistent overrides created - cannot test validation");
        return;
    }
    
    // Step 4: Move to bright light (should trigger validation dialog)
    console.log("☀️ Step 4: Moving to bright light (should trigger validation dialog)...");
    await kyraToken.document.update({ x: 2000, y: 1550 });
    
    console.log("✅ Complete! Validation dialog should appear...");
    console.log("🔄 These overrides will persist between sessions unless manually cleared!");
};

// Check what persistent overrides currently exist
window.checkPersistentOverrides = () => {
    console.log("🔍 Checking all persistent override flags...");
    
    const allTokens = canvas.tokens.placeables;
    let totalOverrides = 0;
    
    for (const token of allTokens) {
        const flags = token.document.flags['pf2e-visioner'] || {};
        for (const [flagKey, flagData] of Object.entries(flags)) {
            if (flagKey.startsWith('avs-override-from-')) {
                totalOverrides++;
                const observerId = flagKey.replace('avs-override-from-', '');
                const observerToken = canvas.tokens.get(observerId);
                
                console.log(`   📍 ${observerToken?.name || observerId} -> ${token.name}:`, {
                    state: flagData.state,
                    source: flagData.source,
                    permanent: true,
                    created: new Date(flagData.timestamp).toLocaleString()
                });
            }
        }
    }
    
    console.log(`📊 Total persistent overrides: ${totalOverrides}`);
    if (totalOverrides === 0) {
        console.log("✅ No persistent overrides found");
    }
    
    return totalOverrides;
};

// Test 1: Move token to bright light (should invalidate stealth overrides)
window.testBrightLightInvalidation = async () => {
    console.log("🧪 Testing bright light invalidation...");
    
    const kyraToken = canvas.tokens.placeables.find(t => t.name === "Kyra");
    if (!kyraToken) {
        console.log("❌ Kyra token not found");
        return;
    }
    
    // Move Kyra to the bright light source center (should invalidate stealth)
    const brightLightX = 2000;
    const brightLightY = 1550;
    
    console.log(`📍 Moving Kyra from (${kyraToken.x}, ${kyraToken.y}) to bright light at (${brightLightX}, ${brightLightY})`);
    
    await kyraToken.document.update({
        x: brightLightX,
        y: brightLightY
    });
    
    console.log("✅ Kyra moved to bright light. Watch for validation dialog...");
};

// Test 2: Manually check current override states
window.checkCurrentOverrides = () => {
    console.log("🔍 Checking current override states...");
    
    // Access the EventDrivenVisibilitySystem
    const evsModule = game.modules.get("pf2e-visioner")?.api?.autoVisibilitySystem;
    if (!evsModule?.activeOverrides) {
        console.log("❌ Cannot access override system");
        return;
    }
    
    console.log("Current active overrides:", evsModule.activeOverrides);
    
    // Show override details
    if (evsModule.activeOverrides.size === 0) {
        console.log("✅ No active overrides");
    } else {
        console.log(`📊 Found ${evsModule.activeOverrides.size} active overrides:`);
        for (const [key, override] of evsModule.activeOverrides) {
            console.log(`  - ${key}:`, override);
        }
    }
};

// Test 3: Force create an obviously invalid override scenario
window.forceInvalidOverrideTest = async () => {
    console.log("🧪 Creating forced invalid override scenario...");
    
    const kyraToken = canvas.tokens.placeables.find(t => t.name === "Kyra");
    const adeptToken = canvas.tokens.placeables.find(t => t.name === "Adept");
    
    if (!kyraToken || !adeptToken) {
        console.log("❌ Required tokens not found");
        return;
    }
    
    // First, manually set an override
    console.log("1️⃣ Setting manual override...");
    Hooks.call("avsOverride", {
        observerId: adeptToken.id,
        targetId: kyraToken.id,
        state: "undetected",
        source: "manual_test"
    });
    
    // Wait a moment for the override to be set
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now move Kyra to a very bright position where stealth should be impossible
    console.log("2️⃣ Moving to invalidating position...");
    await kyraToken.document.update({
        x: 2000,  // Bright light center
        y: 1550   // Bright light center
    });
    
    console.log("3️⃣ Override invalidation test complete. Check for validation dialog.");
};

// Test 4: Check if validation is even running
window.testValidationSystem = () => {
    console.log("🔧 Testing validation system status...");
    
    const evsModule = game.modules.get("pf2e-visioner")?.api?.autoVisibilitySystem;
    if (!evsModule) {
        console.log("❌ Cannot access EventDrivenVisibilitySystem");
        return;
    }
    
    console.log("✅ Validation system accessible");
    console.log("Active overrides count:", evsModule.activeOverrides?.size || 0);
    console.log("Validation queue:", evsModule.validationQueue || "Not accessible");
};

// Instructions
console.log(`
🧪 OVERRIDE VALIDATION TESTING COMMANDS:

1. Check current overrides:
   checkCurrentOverrides()

2. Test validation system:
   testValidationSystem()

3. Move to bright light (should invalidate stealth):
   testBrightLightInvalidation()

4. Force invalid override scenario:
   forceInvalidOverrideTest()

📋 The validation dialog should appear when:
- Manual "undetected" overrides become invalid due to lighting changes
- Stealth overrides become impossible due to environmental changes
- Token moves from concealment to open bright light

💡 Current situation: Your stealth overrides are still VALID because
   Kyra is still in dim light where stealth can be maintained.
`);