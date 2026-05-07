// Constants safe to import from any context (client or server).
// Keep this file free of server-only dependencies.

export const MIN_STAKE = 1;
export const MAX_STAKE = 1000;

// Default lockup duration. Settlement happens at market_created_at + LOCKUP_MS.
// V0 uses this as informational; V2 contracts will enforce it on-chain.
export const LOCKUP_DAYS = 30;
export const LOCKUP_MS = LOCKUP_DAYS * 24 * 60 * 60 * 1000;

export const MATCH_THRESHOLD = 0.85;
export const AMBIGUOUS_THRESHOLD = 0.7;
