/**
 * Unit tests for the browser-side ApiProductRepository
 * (feat/supabase-data-layer — the FIRST data-domain vertical, REFERENCE pattern).
 *
 * ARCHITECTURE: the browser routes reads/writes through the SERVER data API
 * (/api/v1/products, service-role behind apiGuard), presenting the current Supabase
 * access token as a Bearer credential. It NEVER holds the service-role key.
 *
 * NO NETWORK: `fetch` is stubbed, and the auth snapshot (token source) is mocked.
 * The tests assert:
 *   - getProducts hits /api/v1/products with the Authorization: Bearer <token> header,
 *   - parses the JSON body into Product[],
 *   - saveProducts POSTs the products as JSON with the auth header,
 *   - a non-2xx response THROWS (fails loud, never a silent empty result),
 *   - an unauthenticated call (no token) throws BEFORE any network round-trip.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the access token the repo reads. Default: a valid token.
let mockToken: string | null = "test-access-token";
vi.mock("../lib/auth/authState", () => ({
  getAuthSnapshot: () => ({ accessToken: mockToken }),
}));

import {
  ApiProductRepository,
  ProductApiError,
} from "../lib/repositories/apiProductRepository";
// `Product` is the `ShopProduct` alias; src/types.ts exports `ShopProduct`.
import type { ShopProduct as Product } from "../types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_1",
    shopProvider: "Etsy",
    externalProductId: "ext-prod-1",
    externalVariantId: "ext-var-1",
    title: "Personalized BaZi Print",
    productType: "poster",
    isActive: true,
    activeTemplateId: "tpl_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Build a minimal Response-like stub the repo consumes (ok / status / json). */
function fakeResponse(body: unknown, init: { ok: boolean; status: number; statusText?: string }): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? "",
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockToken = "test-access-token";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("ApiProductRepository.getProducts", () => {
  it("GETs /api/v1/products with the Authorization Bearer header and parses the body", async () => {
    const products = [makeProduct()];
    fetchMock.mockResolvedValue(fakeResponse(products, { ok: true, status: 200 }));

    const repo = new ApiProductRepository();
    const result = await repo.getProducts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/products");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(result).toEqual(products);
  });

  it("THROWS a typed ProductApiError on a non-2xx response (not a silent empty array)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "AUTH_REQUIRED", message: "Login required." }, {
        ok: false,
        status: 401,
      }),
    );

    const repo = new ApiProductRepository();
    await expect(repo.getProducts()).rejects.toBeInstanceOf(ProductApiError);
    await expect(repo.getProducts()).rejects.toMatchObject({
      code: "PRODUCT_API_ERROR",
      status: 401,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiProductRepository();
    await expect(repo.getProducts()).rejects.toMatchObject({
      code: "PRODUCT_API_ERROR",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ApiProductRepository.saveProducts", () => {
  it("POSTs the products as JSON with the auth + content-type headers", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true, count: 1 }, { ok: true, status: 200 }));

    const repo = new ApiProductRepository();
    const products = [makeProduct({ id: "prod_save" })];
    await repo.saveProducts(products);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/products");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(products);
  });

  it("THROWS a typed ProductApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "PRODUCT_STORE_ERROR", message: "Failed to save." }, {
        ok: false,
        status: 500,
      }),
    );

    const repo = new ApiProductRepository();
    await expect(repo.saveProducts([makeProduct()])).rejects.toMatchObject({
      code: "PRODUCT_API_ERROR",
      status: 500,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiProductRepository();
    await expect(repo.saveProducts([makeProduct()])).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
