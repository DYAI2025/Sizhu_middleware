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
 * `canPersist` is true in every mode with a working repo path:
 *   - DEMO_LOCAL    → Local* repos (localStorage),
 *   - SUPABASE_READY / PRODUCTION → the Api* repos that route through the SERVER
 *     data API (service-role behind apiGuard) onto the live Supabase tables.
 * The ONLY offline mode is CONFIG_REQUIRED — config is incomplete, so the repos
 * cannot reach a backend. (Before the data layer landed, SUPABASE_READY/PRODUCTION
 * were throwing stubs; no longer — see appServices + the Api*Repository wiring.)
 */
export function getPersistenceStatus(): PersistenceStatus {
  const mode = getAppMode();
  const canPersist = mode !== 'CONFIG_REQUIRED';
  const reason = canPersist
    ? ''
    : `Persistenz offline (Modus ${mode}). Setze VITE_APP_MODE=SUPABASE_READY ` +
      `(+ VITE_SUPABASE_URL/ANON_KEY) für echte Persistenz, oder DEMO_LOCAL für lokale Mock-Läufe.`;
  return { mode, canPersist, reason };
}
