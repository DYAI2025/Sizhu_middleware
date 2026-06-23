/**
 * Browser-side ArtifactRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — mirrors the `apiProductRepository.ts` REFERENCE
 * pattern for the ARTIFACTS data vertical).
 *
 * ARCHITECTURE: data goes through the SERVER (service-role, behind apiGuard), NOT
 * browser-direct. The browser never holds the service-role key; it presents its
 * Supabase access token as a Bearer credential, the server's apiGuard verifies the
 * session, and the server-side `SupabaseArtifactRepository` performs the privileged
 * read/write. So in non-DEMO_LOCAL modes `appServices.artifacts` returns THIS class.
 *
 * Fail-loud, never silent: a non-2xx response THROWS a typed error so the
 * persistence-offline / unauthorized UX surfaces — it never degrades to a silent
 * empty array that a caller would mistake for "no artifacts". An unauthenticated
 * call (no access token) throws BEFORE any network round-trip.
 */

import type { ImageArtifact } from "../../types";
import type { ArtifactRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const ARTIFACTS_ENDPOINT = "/api/v1/artifacts";

/** Stable, machine-readable code for a failed server data call. */
export const ARTIFACT_API_ERROR = "ARTIFACT_API_ERROR" as const;

/**
 * Typed error raised when the server data API call fails (non-2xx) or when there
 * is no session token to authorize the request. Carries the HTTP status (0 when
 * the failure is pre-flight, e.g. no token) so callers can branch on it.
 */
export class ArtifactApiError extends Error {
  readonly code = ARTIFACT_API_ERROR;
  readonly status: number;

  constructor(message: string, status: number) {
    super(`${ARTIFACT_API_ERROR} (${status}): ${message}`);
    this.name = "ArtifactApiError";
    this.status = status;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, ArtifactApiError.prototype);
  }
}

/** Build the Authorization header from the current browser session, or throw. */
function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) {
    // Fail BEFORE the network: an unauthenticated read/write can never succeed
    // against the default-deny apiGuard, and a silent empty result would lie.
    throw new ArtifactApiError("No active session — login required.", 0);
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

export class ApiArtifactRepository implements ArtifactRepository {
  async getImageArtifacts(): Promise<ImageArtifact[]> {
    const res = await fetch(ARTIFACTS_ENDPOINT, {
      method: "GET",
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      throw new ArtifactApiError(await errorMessage(res), res.status);
    }
    return (await res.json()) as ImageArtifact[];
  }

  async saveImageArtifacts(artifacts: ImageArtifact[]): Promise<void> {
    const res = await fetch(ARTIFACTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(artifacts),
    });
    if (!res.ok) {
      throw new ArtifactApiError(await errorMessage(res), res.status);
    }
  }
}
