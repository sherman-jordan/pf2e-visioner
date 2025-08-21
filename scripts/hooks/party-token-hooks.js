/**
 * Hooks for detecting party token operations
 */


/**
 * Hook into actor updates to detect party member changes
 */
export function registerPartyTokenHooks() {
  // Hook into actor updates to detect when characters are added to/removed from parties
  Hooks.on("updateActor", onUpdateActor);
}

/**
 * Handle actor updates to detect party membership changes
 */
async function onUpdateActor(actor, updateData, options, userId) {
  try {
    if (!game.user.isGM) return;
    
    // Check if this is a party actor being updated
    if (actor.type === "party" && updateData.system?.details?.members) {
      const oldMembers = actor.system.details.members || [];
      const newMembers = updateData.system.details.members || [];
      
      // Find members that were removed (consolidated into party)
      const removedMembers = oldMembers.filter(oldId => !newMembers.includes(oldId));
      
      // Save state for any tokens of removed members
      for (const memberId of removedMembers) {
        const memberActor = game.actors.get(memberId);
        if (!memberActor) continue;
        
        // Find any tokens of this actor on the current scene
        const memberTokens = canvas.tokens?.placeables?.filter(t => 
          t.actor?.id === memberId || t.actor?.sourceId === memberActor.uuid
        ) || [];
        
        for (const token of memberTokens) {
          const { saveTokenStateForParty } = await import("../services/party-token-state.js");
          await saveTokenStateForParty(token.document);
        }
      }
      
      // Note: Members being added back will be handled by the token creation hook
    }
    
  } catch (error) {
    console.error("PF2E Visioner: Error handling party actor update:", error);
  }
}
