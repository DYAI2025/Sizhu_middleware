/**
 * Bazzi Middleware Platform - Persistence status (UI-facing surface).
 *
 * The persistence boundary (src/lib/repositories/supabaseRepository.stub.ts)
 * throws a TYPED `SupabaseNotConfiguredError` (code SUPABASE_NOT_CONFIGURED) on
 * EVERY call outside DEMO_LOCAL — this is the security-correct fail-closed
 * behaviour (no silent mock/localStorage fallback; see persistence.boundary.test.ts).
 *
 * Views used to `catch (e) { console.error(e) }` and SWALLOW that error, leaving
 * a silent "dead simulator": empty catalog, disabled run button, no reason. This
 * module turns the swallowed error into a mode-aware, ACTIONABLE status the UI can
 * render — WITHOUT weakening the fail-closed boundary.
 */
import { getAppMode, AppMode } from './appMode';
import { SupabaseNotConfiguredError, SUPABASE_NOT_CONFIGURED } from '../repositories/errors';

/**
 * Robust predicate for "this thrown value is the persistence-not-configured error".
 *
 * Checks BOTH `instanceof SupabaseNotConfiguredError` AND the machine-readable
 * `.code === SUPABASE_NOT_CONFIGURED`. The `.code` branch is load-bearing: across
 * the bundler/module boundary (and across re-thrown / structured-clone copies)
 * `instanceof` can fail even though the value is semantically the same error, so we
 * fall back to the stable code. Dropping the `.code` branch is a behaviour change
 * caught by the unit test (the plain `{ code: ... }` case goes RED).
 *
 * @param e - any thrown/caught value
 * @returns true iff it represents the SUPABASE_NOT_CONFIGURED persistence boundary
 */
export function isSupabaseNotConfigured(e: unknown): boolean {
  if (e instanceof SupabaseNotConfiguredError) return true;
  return (e as { code?: unknown } | null | undefined)?.code === SUPABASE_NOT_CONFIGURED;
}

/** Mode-aware persistence status the UI renders to explain a dead boundary. */
export interface PersistenceStatus {
  mode: AppMode;
  /** True only when calling the repos won't throw the boundary error. */
  canPersist: boolean;
  /** Human, actionable reason (German). Empty string when `canPersist`. */
  reason: string;
}

/**
 * Resolve the current persistence status from the REAL getAppMode() resolver.
 *
 * `canPersist` is true ONLY in DEMO_LOCAL — the single mode whose repos
 * (Local*) don't throw today. In every other mode the Supabase workflow/product
 * repos are still THROWING stubs (supabaseRepository.stub.ts raises
 * SUPABASE_NOT_CONFIGURED), so persistence is effectively offline regardless of
 * whether real Supabase env vars are present. When a real Supabase repository
 * lands, this getter is where the SUPABASE_READY/PRODUCTION mapping gets refined.
 */
export function getPersistenceStatus(): PersistenceStatus {
  const mode = getAppMode();
  const canPersist = mode === 'DEMO_LOCAL';
  const reason = canPersist
    ? ''
    : `Persistenz offline (Modus ${mode} · DB: SUPABASE STUB). ` +
      `Setze APP_MODE=DEMO_LOCAL für lokale Mock-Läufe, oder konfiguriere Supabase.`;
  return { mode, canPersist, reason };
}
