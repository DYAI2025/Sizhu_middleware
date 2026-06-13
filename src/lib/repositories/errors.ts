/**
 * Bazzi Middleware Platform - Persistence boundary errors.
 *
 * REQ-D-001 (AC-D-001a): In any non-DEMO_LOCAL mode the persistence boundary must
 * surface an EXPLICIT, machine-readable error — never a silent mock/localStorage
 * fallback and never a vague "offline" string a caller might treat as transient.
 *
 * The canonical code is SUPABASE_NOT_CONFIGURED, matching the auth layer
 * (src/lib/auth/authState.ts) so the whole system speaks one error vocabulary.
 */

/** Stable, machine-readable code for "production persistence is not configured". */
export const SUPABASE_NOT_CONFIGURED = "SUPABASE_NOT_CONFIGURED" as const;

export type PersistenceErrorCode = typeof SUPABASE_NOT_CONFIGURED;

/**
 * Typed error raised by the Supabase persistence stub outside DEMO_LOCAL.
 *
 * Carries both a machine-readable `code` (for callers that branch on it) and a
 * human message that embeds the code (so log lines and `.toThrow(/CODE/)` checks
 * both see it). It is deliberately NOT a transient/retryable signal.
 */
export class SupabaseNotConfiguredError extends Error {
  readonly code: PersistenceErrorCode = SUPABASE_NOT_CONFIGURED;
  readonly retryable = false;

  constructor(detail?: string) {
    super(
      `${SUPABASE_NOT_CONFIGURED}: Supabase persistence is not configured in this mode. ` +
        `Real persistence is offline; mock/localStorage is only permitted in DEMO_LOCAL.` +
        (detail ? ` (${detail})` : ""),
    );
    this.name = "SupabaseNotConfiguredError";
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, SupabaseNotConfiguredError.prototype);
  }
}
