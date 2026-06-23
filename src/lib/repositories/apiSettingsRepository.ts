/**
 * Browser-side SettingsRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — the SETTINGS data vertical). Mirrors
 * `apiProductRepository.ts`.
 *
 * ARCHITECTURE: data goes through the SERVER (service-role, behind apiGuard), NOT
 * browser-direct. The browser never holds the service-role key; it presents its
 * Supabase access token as a Bearer credential, the server's apiGuard verifies the
 * session, and the server-side `SupabaseSettingsRepository` performs the privileged
 * read/write. So in non-DEMO_LOCAL modes `appServices.settings` returns THIS class.
 *
 * Fail-loud, never silent: a non-2xx response THROWS a typed error so the
 * persistence-offline / unauthorized UX surfaces — it never degrades to a silent
 * empty result that a caller would mistake for "no config". An unauthenticated call
 * (no access token) throws BEFORE any network round-trip.
 *
 * SECRET-REF INDIRECTION: these configs carry secret-REFERENCE names, NEVER raw
 * keys — the browser only ever sees/sends reference names.
 *
 * Endpoints (under /api/v1/settings, GET + POST each):
 *   /gen-configs        ↔ GenerationConfig[]
 *   /quality-configs    ↔ QualityGateConfig[]
 *   /personalization    ↔ PersonalizationApiConfig (single)
 *   /pod                ↔ PodProviderConfig (single)
 */

import type {
  GenerationConfig,
  QualityGateConfig,
  PersonalizationApiConfig,
  PodProviderConfig,
} from "../domain/models";
import type { SettingsRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const SETTINGS_BASE = "/api/v1/settings";
const GEN_ENDPOINT = `${SETTINGS_BASE}/gen-configs`;
const QUALITY_ENDPOINT = `${SETTINGS_BASE}/quality-configs`;
const PERSONALIZATION_ENDPOINT = `${SETTINGS_BASE}/personalization`;
const POD_ENDPOINT = `${SETTINGS_BASE}/pod`;

/** Stable, machine-readable code for a failed server settings call. */
export const SETTINGS_API_ERROR = "SETTINGS_API_ERROR" as const;

/**
 * Typed error raised when the server settings API call fails (non-2xx) or when
 * there is no session token to authorize the request. Carries the HTTP status
 * (0 when the failure is pre-flight, e.g. no token) so callers can branch on it.
 */
export class SettingsApiError extends Error {
  readonly code = SETTINGS_API_ERROR;
  readonly status: number;

  constructor(message: string, status: number) {
    super(`${SETTINGS_API_ERROR} (${status}): ${message}`);
    this.name = "SettingsApiError";
    this.status = status;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, SettingsApiError.prototype);
  }
}

/** Build the Authorization header from the current browser session, or throw. */
function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) {
    // Fail BEFORE the network: an unauthenticated read/write can never succeed
    // against the default-deny apiGuard, and a silent empty result would lie.
    throw new SettingsApiError("No active session — login required.", 0);
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

/** GET a typed JSON payload from `endpoint`, failing loud on non-2xx / no-token. */
async function getJson<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new SettingsApiError(await errorMessage(res), res.status);
  }
  return (await res.json()) as T;
}

/** POST `body` as JSON to `endpoint`, failing loud on non-2xx / no-token. */
async function postJson(endpoint: string, body: unknown): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SettingsApiError(await errorMessage(res), res.status);
  }
}

export class ApiSettingsRepository implements SettingsRepository {
  getGenConfigs(): Promise<GenerationConfig[]> {
    return getJson<GenerationConfig[]>(GEN_ENDPOINT);
  }

  saveGenConfigs(configs: GenerationConfig[]): Promise<void> {
    return postJson(GEN_ENDPOINT, configs);
  }

  getQualityConfigs(): Promise<QualityGateConfig[]> {
    return getJson<QualityGateConfig[]>(QUALITY_ENDPOINT);
  }

  saveQualityConfigs(configs: QualityGateConfig[]): Promise<void> {
    return postJson(QUALITY_ENDPOINT, configs);
  }

  getPersonalizationConfig(): Promise<PersonalizationApiConfig> {
    return getJson<PersonalizationApiConfig>(PERSONALIZATION_ENDPOINT);
  }

  savePersonalizationConfig(config: PersonalizationApiConfig): Promise<void> {
    return postJson(PERSONALIZATION_ENDPOINT, config);
  }

  getPodConfig(): Promise<PodProviderConfig> {
    return getJson<PodProviderConfig>(POD_ENDPOINT);
  }

  savePodConfig(config: PodProviderConfig): Promise<void> {
    return postJson(POD_ENDPOINT, config);
  }
}
