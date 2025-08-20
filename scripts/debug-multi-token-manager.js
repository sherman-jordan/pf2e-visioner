/**
 * Debug script for Multi Token Manager issues
 * Run this in the console to diagnose problems
 */

export async function debugMultiTokenManager() {
  console.log("=== Multi Token Manager Debug ===");
  
  try {
    // Check if we have tokens in the scene
    const allTokens = canvas?.tokens?.placeables || [];
    console.log(`Scene has ${allTokens.length} tokens`);
    
    if (allTokens.length < 2) {
      console.warn("Need at least 2 tokens in scene to test multi-token manager");
      return;
    }
    
    // Select first two tokens for testing
    const testTokens = allTokens.slice(0, 2);
    console.log(`Using test tokens: ${testTokens.map(t => t.name).join(", ")}`);
    
    // Test imports
    console.log("Testing imports...");
    const { VisionerMultiTokenManager } = await import("./managers/multi-token-manager/multi-token-manager.js");
    console.log("✓ Main class imported");
    
    const { buildMultiTokenContext } = await import("./managers/multi-token-manager/context.js");
    console.log("✓ Context builder imported");
    
    // Create instance
    console.log("Creating instance...");
    const instance = new VisionerMultiTokenManager(testTokens);
    console.log("✓ Instance created");
    
    // Test properties
    console.log("Testing properties...");
    console.log(`Current token: ${instance.currentToken?.name}`);
    console.log(`Total pages: ${instance.totalPages}`);
    console.log(`Current page: ${instance.currentPage}`);
    console.log(`Has next page: ${instance.hasNextPage}`);
    console.log(`Has previous page: ${instance.hasPreviousPage}`);
    
    // Test context building
    console.log("Testing context building...");
    const context = await buildMultiTokenContext(instance, {});
    console.log("Context built:", {
      currentToken: context.currentToken?.name,
      totalPages: context.totalPages,
      currentPage: context.currentPage,
      pageNumbers: context.pageNumbers,
      hasTargets: context.hasTargets,
      targetCounts: {
        pc: context.pcTargets?.length || 0,
        npc: context.npcTargets?.length || 0,
        loot: context.lootTargets?.length || 0
      }
    });
    
    // Test Handlebars helpers
    console.log("Testing Handlebars helpers...");
    if (typeof Handlebars !== 'undefined') {
      console.log(`eq helper: ${Handlebars.helpers.eq(1, 1)}`);
      console.log(`add helper: ${Handlebars.helpers.add(1, 2)}`);
      console.log(`times helper exists: ${typeof Handlebars.helpers.times === 'function'}`);
    }
    
    console.log("=== Debug Complete ===");
    return { instance, context };
    
  } catch (error) {
    console.error("Debug failed:", error);
    console.error(error.stack);
    return null;
  }
}

// Make available globally
if (typeof window !== "undefined") {
  window.debugMultiTokenManager = debugMultiTokenManager;
}
