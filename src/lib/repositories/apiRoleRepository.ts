/**
 * Browser-side RoleRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — the ROLES/RBAC vertical, mirrors
 * `apiProductRepository.ts`).
 *
 * ARCHITECTURE: data goes through the SERVER (service-role, behind apiGuard), NOT
 * browser-direct. The browser never holds the service-role key; it presents its
 * Supabase access token as a Bearer credential, the server's apiGuard verifies the
 * session (RBAC WRITES are additionally admin-gated server-side — see
 * server/routes/roles.ts + SENSITIVE_API_ROUTES), and the server-side
 * `SupabaseRoleRepository` performs the privileged read/write. So in non-DEMO_LOCAL
 * modes `appServices.roles` returns THIS class.
 *
 * Endpoints (all under /api/v1/roles):
 *   GET  /api/v1/roles                  → Role[]
 *   GET  /api/v1/roles/permissions      → Permission[]
 *   GET  /api/v1/roles/role-permissions → RolePermissions[]
 *   POST /api/v1/roles/role-permissions ← RolePermissions[]   (privileged)
 *   GET  /api/v1/roles/users            → AppUser[]
 *   POST /api/v1/roles/users            ← AppUser[]            (privileged)
 *   GET  /api/v1/roles/active-role      → { role }
 *   POST /api/v1/roles/active-role      ← { role }             (privileged)
 *
 * Fail-loud, never silent: a non-2xx response THROWS a typed error so the
 * persistence-offline / unauthorized UX surfaces — it never degrades to a silent
 * empty array/default that a caller would mistake for real data. An unauthenticated
 * call (no access token) throws BEFORE any network round-trip.
 */

import type { Role, AppUser, AppRoleName, Permission, RolePermissions } from "../domain/models";
import type { RoleRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const ROLES_ENDPOINT = "/api/v1/roles";
const PERMISSIONS_ENDPOINT = "/api/v1/roles/permissions";
const ROLE_PERMISSIONS_ENDPOINT = "/api/v1/roles/role-permissions";
const USERS_ENDPOINT = "/api/v1/roles/users";
const ACTIVE_ROLE_ENDPOINT = "/api/v1/roles/active-role";

/** Stable, machine-readable code for a failed server data call. */
export const ROLE_API_ERROR = "ROLE_API_ERROR" as const;

/**
 * Typed error raised when the server data API call fails (non-2xx) or when there
 * is no session token to authorize the request. Carries the HTTP status (0 when
 * the failure is pre-flight, e.g. no token) so callers can branch on it.
 */
export class RoleApiError extends Error {
  readonly code = ROLE_API_ERROR;
  readonly status: number;

  constructor(message: string, status: number) {
    super(`${ROLE_API_ERROR} (${status}): ${message}`);
    this.name = "RoleApiError";
    this.status = status;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, RoleApiError.prototype);
  }
}

/** Build the Authorization header from the current browser session, or throw. */
function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) {
    // Fail BEFORE the network: an unauthenticated read/write can never succeed
    // against the default-deny apiGuard, and a silent empty result would lie.
    throw new RoleApiError("No active session — login required.", 0);
  }
  return { Authorization: `Bearer ${token}` };
}

/** Drain a non-2xx response into a useful message without leaking on parse fail. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error_code?: string };
    return body.message ?? body.error_code ?? res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** GET a JSON list endpoint, failing loud on non-2xx / no-token. */
async function getJson<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new RoleApiError(await errorMessage(res), res.status);
  }
  return (await res.json()) as T;
}

/** POST a JSON body to an endpoint, failing loud on non-2xx / no-token. */
async function postJson(endpoint: string, body: unknown): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new RoleApiError(await errorMessage(res), res.status);
  }
}

export class ApiRoleRepository implements RoleRepository {
  async getRoles(): Promise<Role[]> {
    return getJson<Role[]>(ROLES_ENDPOINT);
  }

  async getPermissions(): Promise<Permission[]> {
    return getJson<Permission[]>(PERMISSIONS_ENDPOINT);
  }

  async getRolePermissions(): Promise<RolePermissions[]> {
    return getJson<RolePermissions[]>(ROLE_PERMISSIONS_ENDPOINT);
  }

  async saveRolePermissions(bindings: RolePermissions[]): Promise<void> {
    await postJson(ROLE_PERMISSIONS_ENDPOINT, bindings);
  }

  async getUsers(): Promise<AppUser[]> {
    return getJson<AppUser[]>(USERS_ENDPOINT);
  }

  async saveUsers(users: AppUser[]): Promise<void> {
    await postJson(USERS_ENDPOINT, users);
  }

  async getActiveRole(): Promise<AppRoleName> {
    // The active-role endpoint returns an envelope `{ role }` (a bare string is
    // not valid top-level JSON for all callers); unwrap it here.
    const body = await getJson<{ role: AppRoleName }>(ACTIVE_ROLE_ENDPOINT);
    return body.role;
  }

  async setActiveRole(role: AppRoleName): Promise<void> {
    await postJson(ACTIVE_ROLE_ENDPOINT, { role });
  }
}
