import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { apiGuard } from "../middleware/auth";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import { registerWorkflowRoutes } from "../routes/workflows";
import type { WorkflowRepository } from "../../src/lib/repositories/interfaces";
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../../src/types";

/**
 * Route-level tests for the Workflows data API (feat/supabase-data-layer).
 *
 * These prove the routes are gated by the REAL apiGuard (default-deny SESSION) and
 * backed by an INJECTED WorkflowRepository. Workflows CRUD is SESSION-class (a valid
 * token + verified email is enough) — NOT sensitive (no admin role / MFA / scope).
 *
 * The app is composed exactly as the production composition root does it
 * (express.json → app.use("/api", apiGuard) → registerWorkflowRoutes), but without
 * touching createApp, so the test owns the repo injection on an in-memory double:
 * no Supabase / network, and reads-after-writes prove a shared (not per-request) repo.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal1", // workflows are session-class: aal1 is sufficient
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run-1",
    orderNumber: "ORD-1",
    productId: "prod-1",
    customerName: "Ada",
    birthDate: "1990-12-10",
    birthTime: "11:00",
    birthTimeKnown: true,
    birthPlace: "London",
    status: "running",
    startedAt: "2024-01-01T00:00:00Z",
    currentIteration: 1,
    ...overrides,
  };
}

function makeLog(overrides: Partial<WorkflowLog> = {}): WorkflowLog {
  return {
    id: "log-1",
    runId: "run-1",
    orderNumber: "ORD-1",
    timestamp: "2024-01-01T00:00:01Z",
    step: "generate",
    message: "ok",
    status: "info",
    ...overrides,
  };
}

function makeVisualWorkflow(overrides: Partial<VisualWorkflow> = {}): VisualWorkflow {
  return {
    productId: "prod-1",
    nodes: [],
    edges: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

/** Minimal in-memory WorkflowRepository double — no Supabase, no network. */
class InMemoryWorkflowRepo implements WorkflowRepository {
  runs: WorkflowRun[] = [];
  logs: WorkflowLog[] = [];
  visual: VisualWorkflow[] = [];

  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    return [...this.runs];
  }
  async saveWorkflowRuns(runs: WorkflowRun[]): Promise<void> {
    for (const r of runs) {
      const idx = this.runs.findIndex((x) => x.id === r.id);
      if (idx >= 0) this.runs[idx] = r;
      else this.runs.push(r);
    }
  }
  async getWorkflowLogs(): Promise<WorkflowLog[]> {
    return [...this.logs];
  }
  async saveWorkflowLogs(logs: WorkflowLog[]): Promise<void> {
    for (const l of logs) {
      const idx = this.logs.findIndex((x) => x.id === l.id);
      if (idx >= 0) this.logs[idx] = l;
      else this.logs.push(l);
    }
  }
  async getVisualWorkflows(): Promise<VisualWorkflow[]> {
    return [...this.visual];
  }
  async saveVisualWorkflow(productId: string, workflow: VisualWorkflow): Promise<void> {
    const next = { ...workflow, productId };
    const idx = this.visual.findIndex((w) => w.productId === productId);
    if (idx >= 0) this.visual[idx] = next;
    else this.visual.push(next);
  }
  async getVisualWorkflow(productId: string): Promise<VisualWorkflow> {
    return (
      this.visual.find((w) => w.productId === productId) ?? makeVisualWorkflow({ productId })
    );
  }
}

/** Compose an app exactly like the production composition root, repo injected. */
function buildApp(repo: WorkflowRepository): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", apiGuard);
  registerWorkflowRoutes(app, repo);
  return app;
}

let app: Express;
let repo: InMemoryWorkflowRepo;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  repo = new InMemoryWorkflowRepo();
  app = buildApp(repo);
});

describe("GET /api/v1/workflow-runs", () => {
  it("rejects unauthenticated requests (default-deny session)", async () => {
    const res = await request(app).get("/api/v1/workflow-runs");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns the runs array for a valid session", async () => {
    repo.runs = [makeRun()];
    const res = await request(app)
      .get("/api/v1/workflow-runs")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.map((r: WorkflowRun) => r.id)).toContain("run-1");
  });

  it("returns 500 when the repo fails loud (never a fabricated empty array)", async () => {
    const failing: WorkflowRepository = {
      async getWorkflowRuns() {
        throw new Error("SUPABASE_WORKFLOW_STORE_ERROR (getWorkflowRuns): boom");
      },
      async saveWorkflowRuns() {},
      async getWorkflowLogs() {
        return [];
      },
      async saveWorkflowLogs() {},
      async getVisualWorkflows() {
        return [];
      },
      async saveVisualWorkflow() {},
      async getVisualWorkflow() {
        return makeVisualWorkflow();
      },
    };
    const failApp = buildApp(failing);
    const res = await request(failApp)
      .get("/api/v1/workflow-runs")
      .set(...bearer(token()));
    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe("WORKFLOW_STORE_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});

describe("POST /api/v1/workflow-runs", () => {
  const path = "/api/v1/workflow-runs";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send([makeRun()]);
    expect(res.status).toBe(401);
  });

  it("saves runs for a valid session and reads them back (shared repo)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send([makeRun({ id: "run-shared" })]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, count: 1 });

    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.body.map((r: WorkflowRun) => r.id)).toContain("run-shared");
  });

  it("rejects a non-array body with 400 and does NOT persist", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({ id: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
    expect(await repo.getWorkflowRuns()).toEqual([]);
  });

  it("does NOT require admin role or MFA (session-class, not sensitive)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: "viewer@example.com", aal: "aal1" })))
      .send([makeRun({ id: "run-session" })]);
    expect(res.status).toBe(200);
  });
});

describe("GET/POST /api/v1/workflow-logs", () => {
  const path = "/api/v1/workflow-logs";

  it("rejects unauthenticated GET", async () => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  it("saves and reads back logs (shared repo)", async () => {
    const post = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send([makeLog({ id: "log-shared" })]);
    expect(post.status).toBe(200);
    expect(post.body).toMatchObject({ ok: true, count: 1 });

    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.body.map((l: WorkflowLog) => l.id)).toContain("log-shared");
  });

  it("rejects a non-array body with 400", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({ id: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
  });
});

describe("GET /api/v1/visual-workflows", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/visual-workflows");
    expect(res.status).toBe(401);
  });

  it("returns the visual workflows array for a valid session", async () => {
    repo.visual = [makeVisualWorkflow()];
    const res = await request(app)
      .get("/api/v1/visual-workflows")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.map((w: VisualWorkflow) => w.productId)).toContain("prod-1");
  });
});

describe("GET /api/v1/visual-workflows/:productId", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/visual-workflows/prod-1");
    expect(res.status).toBe(401);
  });

  it("returns a seeded blank graph for an unknown product (never 404)", async () => {
    const res = await request(app)
      .get("/api/v1/visual-workflows/prod-unknown")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.productId).toBe("prod-unknown");
    expect(res.body.nodes).toEqual([]);
    expect(res.body.edges).toEqual([]);
  });

  it("returns the persisted graph for a known product", async () => {
    repo.visual = [
      makeVisualWorkflow({
        productId: "prod-7",
        nodes: [{ id: "n1", type: "template", title: "T", description: "", x: 0, y: 0, config: {} }],
      }),
    ];
    const res = await request(app)
      .get("/api/v1/visual-workflows/prod-7")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.productId).toBe("prod-7");
    expect(res.body.nodes).toHaveLength(1);
  });
});

describe("POST /api/v1/visual-workflows/:productId", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/v1/visual-workflows/prod-1")
      .send(makeVisualWorkflow());
    expect(res.status).toBe(401);
  });

  it("saves a workflow bound to the path productId and reads it back", async () => {
    const res = await request(app)
      .post("/api/v1/visual-workflows/prod-99")
      .set(...bearer(token()))
      .send(makeVisualWorkflow({ productId: "prod-99" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    const got = await request(app)
      .get("/api/v1/visual-workflows/prod-99")
      .set(...bearer(token()));
    expect(got.body.productId).toBe("prod-99");
  });

  it("binds the saved workflow to the PATH productId, not the body's productId", async () => {
    const res = await request(app)
      .post("/api/v1/visual-workflows/prod-path")
      .set(...bearer(token()))
      .send(makeVisualWorkflow({ productId: "prod-body" }));
    expect(res.status).toBe(200);

    // Stored under the path id, not the body id.
    expect(repo.visual.map((w) => w.productId)).toContain("prod-path");
    expect(repo.visual.map((w) => w.productId)).not.toContain("prod-body");
  });

  it("rejects a non-object body with 400", async () => {
    const res = await request(app)
      .post("/api/v1/visual-workflows/prod-1")
      .set(...bearer(token()))
      .set("Content-Type", "application/json")
      .send("[]"); // array is not a single workflow object
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
  });
});
