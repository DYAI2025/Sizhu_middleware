/**
 * Unit tests for the browser-side ApiWorkflowRepository
 * (feat/supabase-data-layer — WORKFLOWS vertical, mirrors the Products reference).
 *
 * ARCHITECTURE: the browser routes reads/writes through the SERVER data API
 * (/api/v1/workflow-runs, /workflow-logs, /visual-workflows, service-role behind
 * apiGuard), presenting the current Supabase access token as a Bearer credential.
 * It NEVER holds the service-role key.
 *
 * NO NETWORK: `fetch` is stubbed, and the auth snapshot (token source) is mocked.
 * The tests assert correct endpoint + method + auth header per method, JSON parse,
 * a non-2xx response THROWS (fails loud, never a silent empty result), and an
 * unauthenticated call throws BEFORE any network round-trip.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the access token the repo reads. Default: a valid token.
let mockToken: string | null = "test-access-token";
vi.mock("../lib/auth/authState", () => ({
  getAuthSnapshot: () => ({ accessToken: mockToken }),
}));

import {
  ApiWorkflowRepository,
  WorkflowApiError,
} from "../lib/repositories/apiWorkflowRepository";
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../types";

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run_1",
    orderNumber: "ORD-9001",
    productId: "prod_1",
    customerName: "Ada Lovelace",
    birthDate: "1990-12-10",
    birthTime: "11:00",
    birthTimeKnown: true,
    birthPlace: "London",
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    currentIteration: 1,
    ...overrides,
  };
}

function makeLog(overrides: Partial<WorkflowLog> = {}): WorkflowLog {
  return {
    id: "log_1",
    runId: "run_1",
    orderNumber: "ORD-9001",
    timestamp: "2026-01-01T00:00:01.000Z",
    step: "generate",
    message: "candidate generated",
    status: "info",
    ...overrides,
  };
}

function makeVisualWorkflow(overrides: Partial<VisualWorkflow> = {}): VisualWorkflow {
  return {
    productId: "prod_1",
    nodes: [],
    edges: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/** Build a minimal Response-like stub the repo consumes (ok / status / json). */
function fakeResponse(
  body: unknown,
  init: { ok: boolean; status: number; statusText?: string },
): Response {
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

describe("ApiWorkflowRepository — workflow runs", () => {
  it("GETs /api/v1/workflow-runs with the Bearer header and parses the body", async () => {
    const runs = [makeRun()];
    fetchMock.mockResolvedValue(fakeResponse(runs, { ok: true, status: 200 }));

    const repo = new ApiWorkflowRepository();
    const result = await repo.getWorkflowRuns();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/workflow-runs");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(result).toEqual(runs);
  });

  it("getWorkflowRuns THROWS a typed WorkflowApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error_code: "AUTH_REQUIRED" }, { ok: false, status: 401 }),
    );
    const repo = new ApiWorkflowRepository();
    await expect(repo.getWorkflowRuns()).rejects.toBeInstanceOf(WorkflowApiError);
    await expect(repo.getWorkflowRuns()).rejects.toMatchObject({
      code: "WORKFLOW_API_ERROR",
      status: 401,
    });
  });

  it("getWorkflowRuns throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiWorkflowRepository();
    await expect(repo.getWorkflowRuns()).rejects.toMatchObject({
      code: "WORKFLOW_API_ERROR",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saveWorkflowRuns POSTs the runs as JSON with auth + content-type headers", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const runs = [makeRun({ id: "run_save" })];
    await repo.saveWorkflowRuns(runs);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/workflow-runs");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(runs);
  });

  it("saveWorkflowRuns THROWS on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(fakeResponse({}, { ok: false, status: 500 }));
    const repo = new ApiWorkflowRepository();
    await expect(repo.saveWorkflowRuns([makeRun()])).rejects.toMatchObject({ status: 500 });
  });
});

describe("ApiWorkflowRepository — workflow logs", () => {
  it("GETs /api/v1/workflow-logs and parses the body", async () => {
    const logs = [makeLog()];
    fetchMock.mockResolvedValue(fakeResponse(logs, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const result = await repo.getWorkflowLogs();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/workflow-logs");
    expect(init.method).toBe("GET");
    expect(result).toEqual(logs);
  });

  it("saveWorkflowLogs POSTs the logs as JSON with auth header", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const logs = [makeLog({ id: "log_save" })];
    await repo.saveWorkflowLogs(logs);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/workflow-logs");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(JSON.parse(init.body)).toEqual(logs);
  });

  it("getWorkflowLogs throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiWorkflowRepository();
    await expect(repo.getWorkflowLogs()).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ApiWorkflowRepository — visual workflows", () => {
  it("GETs /api/v1/visual-workflows and parses the body", async () => {
    const wfs = [makeVisualWorkflow()];
    fetchMock.mockResolvedValue(fakeResponse(wfs, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const result = await repo.getVisualWorkflows();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/visual-workflows");
    expect(init.method).toBe("GET");
    expect(result).toEqual(wfs);
  });

  it("getVisualWorkflow GETs /api/v1/visual-workflows/:productId", async () => {
    const wf = makeVisualWorkflow({ productId: "prod_42" });
    fetchMock.mockResolvedValue(fakeResponse(wf, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const result = await repo.getVisualWorkflow("prod_42");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/visual-workflows/prod_42");
    expect(init.method).toBe("GET");
    expect(result).toEqual(wf);
  });

  it("getVisualWorkflow URL-encodes the productId", async () => {
    fetchMock.mockResolvedValue(fakeResponse(makeVisualWorkflow(), { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    await repo.getVisualWorkflow("prod/with space");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/visual-workflows/${encodeURIComponent("prod/with space")}`);
  });

  it("saveVisualWorkflow POSTs to /api/v1/visual-workflows/:productId with the workflow body", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }, { ok: true, status: 200 }));
    const repo = new ApiWorkflowRepository();
    const wf = makeVisualWorkflow({ productId: "prod_99" });
    await repo.saveVisualWorkflow("prod_99", wf);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/visual-workflows/prod_99");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(wf);
  });

  it("saveVisualWorkflow THROWS on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(fakeResponse({}, { ok: false, status: 500 }));
    const repo = new ApiWorkflowRepository();
    await expect(repo.saveVisualWorkflow("prod_1", makeVisualWorkflow())).rejects.toMatchObject({
      status: 500,
    });
  });

  it("getVisualWorkflow throws BEFORE any network call when there is no session token", async () => {
    mockToken = null;
    const repo = new ApiWorkflowRepository();
    await expect(repo.getVisualWorkflow("prod_1")).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
