/**
 * Unit tests for the browser-side ApiProviderRepository
 * (feat/supabase-data-layer — the PROVIDERS data vertical, mirrors the Products
 * reference test `apiProductRepository.test.ts`).
 *
 * ARCHITECTURE: the browser routes reads/writes/health-checks through the SERVER
 * data API (/api/v1/providers, service-role behind apiGuard), presenting the
 * current Supabase access token as a Bearer credential. It NEVER holds the
 * service-role key.
 *
 * NO NETWORK: `fetch` is stubbed, and the auth snapshot (token source) is mocked.
 * The tests assert:
 *   - getProviders hits /api/v1/providers with Authorization: Bearer <token>,
 *   - parses the JSON body into ApiProvider[],
 *   - saveProvider POSTs the single provider as JSON with the auth header,
 *   - performHealthCheck POSTs /:id/health-check and returns the body status,
 *   - a non-2xx response THROWS (fails loud, never a silent empty/fabricated result),
 *   - an unauthenticated call (no token) throws BEFORE any network round-trip.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the access token the repo reads. Default: a valid token.
let mockToken: string | null = "test-access-token";
vi.mock("../lib/auth/authState", () => ({
  getAuthSnapshot: () => ({ accessToken: mockToken }),
}));

import {
  ApiProviderRepository,
  ProviderApiError,
} from "../lib/repositories/apiProviderRepository";
import type { ApiProvider } from "../lib/domain/models";

function makeProvider(overrides: Partial<ApiProvider> = {}): ApiProvider {
  return {
    id: "prov_1",
    name: "FuFire Personalization API",
    type: "personalization",
    status: "CONFIGURED",
    baseUrl: "https://api.fufire.io/v1/personalization",
    secretRef: "SECRET_REF_FUFIRE_LIVE_KEY",
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

describe("ApiProviderRepository.getProviders", () => {
  it("GETs /api/v1/providers with the Authorization Bearer header and parses the body", async () => {
    const providers = [makeProvider()];
    fetchMock.mockResolvedValue(fakeResponse(providers, { ok: true, status: 200 }));

    const repo = new ApiProviderRepository();
    const result = await repo.getProviders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/providers");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(result).toEqual(providers);
  });

  it("THROWS a typed ProviderApiError on a non-2xx response (not a silent empty array)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "AUTH_REQUIRED", message: "Login required." }, {
        ok: false,
        status: 401,
      }),
    );

    const repo = new ApiProviderRepository();
    await expect(repo.getProviders()).rejects.toBeInstanceOf(ProviderApiError);
    await expect(repo.getProviders()).rejects.toMatchObject({
      code: "PROVIDER_API_ERROR",
      status: 401,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiProviderRepository();
    await expect(repo.getProviders()).rejects.toMatchObject({
      code: "PROVIDER_API_ERROR",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ApiProviderRepository.saveProvider", () => {
  it("POSTs the single provider as JSON with the auth + content-type headers", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }, { ok: true, status: 200 }));

    const repo = new ApiProviderRepository();
    const provider = makeProvider({ id: "prov_save" });
    await repo.saveProvider(provider);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/providers");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(provider);
  });

  it("THROWS a typed ProviderApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "PROVIDER_STORE_ERROR", message: "Failed to save." }, {
        ok: false,
        status: 500,
      }),
    );

    const repo = new ApiProviderRepository();
    await expect(repo.saveProvider(makeProvider())).rejects.toMatchObject({
      code: "PROVIDER_API_ERROR",
      status: 500,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiProviderRepository();
    await expect(repo.saveProvider(makeProvider())).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ApiProviderRepository.performHealthCheck", () => {
  it("POSTs /api/v1/providers/:id/health-check and returns the body status", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: "MOCK" }, { ok: true, status: 200 }));

    const repo = new ApiProviderRepository();
    const status = await repo.performHealthCheck("prov_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/providers/prov_1/health-check");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(status).toBe("MOCK");
  });

  it("url-encodes the provider id in the path", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: "ERROR" }, { ok: true, status: 200 }));

    const repo = new ApiProviderRepository();
    await repo.performHealthCheck("prov/with space");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/providers/prov%2Fwith%20space/health-check");
  });

  it("THROWS a typed ProviderApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "PROVIDER_STORE_ERROR", message: "Failed." }, {
        ok: false,
        status: 500,
      }),
    );

    const repo = new ApiProviderRepository();
    await expect(repo.performHealthCheck("prov_1")).rejects.toMatchObject({
      code: "PROVIDER_API_ERROR",
      status: 500,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiProviderRepository();
    await expect(repo.performHealthCheck("prov_1")).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
