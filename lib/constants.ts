// Constants safe to import from any context (client or server).
// Keep this file free of server-only dependencies.

export const MIN_STAKE = 1;
export const MAX_STAKE = 1000;

// Default lockup duration. The factory enforces a per-market lockup
// in [MIN_LOCKUP_DURATION = 1 day, MAX_LOCKUP_DURATION = 365 days]; the
// miniapp defaults to 30 days. When a per-market lockup picker is added
// to the composer, the caller can override this.
export const LOCKUP_DAYS = 30;
export const LOCKUP_MS = LOCKUP_DAYS * 24 * 60 * 60 * 1000;
export const LOCKUP_SECONDS = LOCKUP_DAYS * 24 * 60 * 60;

export const MATCH_THRESHOLD = 0.85;
export const AMBIGUOUS_THRESHOLD = 0.7;
