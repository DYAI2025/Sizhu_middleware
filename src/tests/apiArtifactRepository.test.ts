/**
 * Unit tests for the browser-side ApiArtifactRepository
 * (feat/supabase-data-layer — mirrors `apiProductRepository.test.ts`).
 *
 * ARCHITECTURE: the browser routes reads/writes through the SERVER data API
 * (/api/v1/artifacts, service-role behind apiGuard), presenting the current Supabase
 * access token as a Bearer credential. It NEVER holds the service-role key.
 *
 * NO NETWORK: `fetch` is stubbed, and the auth snapshot (token source) is mocked.
 * The tests assert:
 *   - getImageArtifacts hits /api/v1/artifacts with the Authorization: Bearer <token> header,
 *   - parses the JSON body into ImageArtifact[],
 *   - saveImageArtifacts POSTs the artifacts as JSON with the auth header,
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
  ApiArtifactRepository,
  ArtifactApiError,
} from "../lib/repositories/apiArtifactRepository";
import type { ImageArtifact } from "../types";

function makeArtifact(overrides: Partial<ImageArtifact> = {}): ImageArtifact {
  return {
    id: "art_1",
    workflowRunId: "run_1",
    orderNumber: "ORD-9001",
    productId: "prod_1",
    templateId: "tpl_1",
    iteration: 2,
    candidateIndex: 3,
    storagePath: "data:image/png;base64,AAAA",
    status: "accepted",
    qaScore: 87,
    rejectionReason: "too dark",
    qaResultJson: '{"score":87}',
    generatedAt: "2026-01-01T00:00:00.000Z",
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

describe("ApiArtifactRepository.getImageArtifacts", () => {
  it("GETs /api/v1/artifacts with the Authorization Bearer header and parses the body", async () => {
    const artifacts = [makeArtifact()];
    fetchMock.mockResolvedValue(fakeResponse(artifacts, { ok: true, status: 200 }));

    const repo = new ApiArtifactRepository();
    const result = await repo.getImageArtifacts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/artifacts");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(result).toEqual(artifacts);
  });

  it("THROWS a typed ArtifactApiError on a non-2xx response (not a silent empty array)", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "AUTH_REQUIRED", message: "Login required." }, {
        ok: false,
        status: 401,
      }),
    );

    const repo = new ApiArtifactRepository();
    await expect(repo.getImageArtifacts()).rejects.toBeInstanceOf(ArtifactApiError);
    await expect(repo.getImageArtifacts()).rejects.toMatchObject({
      code: "ARTIFACT_API_ERROR",
      status: 401,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiArtifactRepository();
    await expect(repo.getImageArtifacts()).rejects.toMatchObject({
      code: "ARTIFACT_API_ERROR",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ApiArtifactRepository.saveImageArtifacts", () => {
  it("POSTs the artifacts as JSON with the auth + content-type headers", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true, count: 1 }, { ok: true, status: 200 }));

    const repo = new ApiArtifactRepository();
    const artifacts = [makeArtifact({ id: "art_save" })];
    await repo.saveImageArtifacts(artifacts);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/artifacts");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(artifacts);
  });

  it("THROWS a typed ArtifactApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "ARTIFACT_STORE_ERROR", message: "Failed to save." }, {
        ok: false,
        status: 500,
      }),
    );

    const repo = new ApiArtifactRepository();
    await expect(repo.saveImageArtifacts([makeArtifact()])).rejects.toMatchObject({
      code: "ARTIFACT_API_ERROR",
      status: 500,
    });
  });

  it("throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiArtifactRepository();
    await expect(repo.saveImageArtifacts([makeArtifact()])).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
