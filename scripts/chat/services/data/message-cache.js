// Centralized message-scoped caches and deduplication structures

export const processedMessages = new Set();

// Seek: messageId -> Array<{ targetId: string, oldVisibility: string }>
export const appliedSeekChangesByMessage = new Map();

// Hide: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedHideChangesByMessage = new Map();

// Sneak: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedSneakChangesByMessage = new Map();

// Create a Diversion: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedDiversionChangesByMessage = new Map();

// Consequences: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedConsequencesChangesByMessage = new Map();

// Point Out: messageId -> Array<{ allyId: string, targetTokenId: string, oldVisibility: string }>
export const appliedPointOutChangesByMessage = new Map();

// Take Cover: messageId -> Array<{ observerId: string, oldCover: string }>
export const appliedTakeCoverChangesByMessage = new Map();


