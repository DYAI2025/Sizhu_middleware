/**
 * Browser-side ProductRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — the FIRST data-domain vertical, REFERENCE pattern).
 *
 * ARCHITECTURE: data goes through the SERVER (service-role, behind apiGuard), NOT
 * browser-direct. The browser never holds the service-role key; it presents its
 * Supabase access token as a Bearer credential, the server's apiGuard verifies the
 * session, and the server-side `SupabaseProductRepository` performs the privileged
 * read/write. So in non-DEMO_LOCAL modes `appServices.products` returns THIS class.
 *
 * Fail-loud, never silent: a non-2xx response THROWS a typed error so the
 * persistence-offline / unauthorized UX surfaces — it never degrades to a silent
 * empty array that a caller would mistake for "no products". An unauthenticated
 * call (no access token) throws BEFORE any network round-trip.
 */

import type { Product } from "../domain/models";
import type { ProductRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const PRODUCTS_ENDPOINT = "/api/v1/products";

/** Stable, machine-readable code for a failed server data call. */
export const PRODUCT_API_ERROR = "PRODUCT_API_ERROR" as const;

/**
 * Typed error raised when the server data API call fails (non-2xx) or when there
 * is no session token to authorize the request. Carries the HTTP status (0 when
 * the failure is pre-flight, e.g. no token) so callers can branch on it.
 */
export class ProductApiError extends Error {
  readonly code = PRODUCT_API_ERROR;
  readonly status: number;

  constructor(message: string, status: number) {
    super(`${PRODUCT_API_ERROR} (${status}): ${message}`);
    this.name = "ProductApiError";
    this.status = status;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, ProductApiError.prototype);
  }
}

/** Build the Authorization header from the current browser session, or throw. */
function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) {
    // Fail BEFORE the network: an unauthenticated read/write can never succeed
    // against the default-deny apiGuard, and a silent empty result would lie.
    throw new ProductApiError("No active session — login required.", 0);
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

export class ApiProductRepository implements ProductRepository {
  async getProducts(): Promise<Product[]> {
    const res = await fetch(PRODUCTS_ENDPOINT, {
      method: "GET",
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      throw new ProductApiError(await errorMessage(res), res.status);
    }
    return (await res.json()) as Product[];
  }

  async saveProducts(products: Product[]): Promise<void> {
    const res = await fetch(PRODUCTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(products),
    });
    if (!res.ok) {
      throw new ProductApiError(await errorMessage(res), res.status);
    }
  }
}
