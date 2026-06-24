/**
 * Browser-side ProviderRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — the PROVIDERS data vertical, mirrors the Products
 * reference `apiProductRepository.ts` exactly).
 *
 * ARCHITECTURE: data goes through the SERVER (service-role, behind apiGuard), NOT
 * browser-direct. The browser never holds the service-role key; it presents its
 * Supabase access token as a Bearer credential, the server's apiGuard verifies the
 * session, and the server-side `SupabaseProviderRepository` performs the privileged
 * read/write. So in non-DEMO_LOCAL modes `appServices.providers` returns THIS class.
 *
 * Fail-loud, never silent: a non-2xx response THROWS a typed error so the
 * persistence-offline / unauthorized UX surfaces — it never degrades to a silent
 * empty array (read) or a fabricated status (health check) that a caller would
 * mistake for a real result. An unauthenticated call (no access token) throws
 * BEFORE any network round-trip.
 */

import type { ApiProvider } from "../domain/models";
import type { ProviderRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const PROVIDERS_ENDPOINT = "/api/v1/providers";

/** Stable, machine-readable code for a failed server data call. */
export const PROVIDER_API_ERROR = "PROVIDER_API_ERROR" as const;

/**
 * Typed error raised when the server data API call fails (non-2xx) or when there
 * is no session token to authorize the request. Carries the HTTP status (0 when
 * the failure is pre-flight, e.g. no token) so callers can branch on it.
 */
export class ProviderApiError extends Error {
  readonly code = PROVIDER_API_ERROR;
  readonly status: number;

  constructor(message: string, status: number) {
    super(`${PROVIDER_API_ERROR} (${status}): ${message}`);
    this.name = "ProviderApiError";
    this.status = status;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, ProviderApiError.prototype);
  }
}

/** Build the Authorization header from the current browser session, or throw. */
function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) {
    // Fail BEFORE the network: an unauthenticated read/write can never succeed
    // against the default-deny apiGuard, and a silent empty result would lie.
    throw new ProviderApiError("No active session — login required.", 0);
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

export class ApiProviderRepository implements ProviderRepository {
  async getProviders(): Promise<ApiProvider[]> {
    const res = await fetch(PROVIDERS_ENDPOINT, {
      method: "GET",
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      throw new ProviderApiError(await errorMessage(res), res.status);
    }
    return (await res.json()) as ApiProvider[];
  }

  async saveProvider(provider: ApiProvider): Promise<void> {
    const res = await fetch(PROVIDERS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(provider),
    });
    if (!res.ok) {
      throw new ProviderApiError(await errorMessage(res), res.status);
    }
  }

  async performHealthCheck(providerId: string): Promise<ApiProvider["status"]> {
    const res = await fetch(
      `${PROVIDERS_ENDPOINT}/${encodeURIComponent(providerId)}/health-check`,
      {
        method: "POST",
        headers: { ...authHeaders() },
      },
    );
    if (!res.ok) {
      throw new ProviderApiError(await errorMessage(res), res.status);
    }
    const body = (await res.json()) as { status: ApiProvider["status"] };
    return body.status;
  }
}
