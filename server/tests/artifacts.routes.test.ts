import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { apiGuard } from "../middleware/auth";
import { registerArtifactRoutes } from "../routes/artifacts";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import type { ArtifactRepository } from "../../src/lib/repositories/interfaces";
import type { ImageArtifact } from "../../src/types";

/**
 * Route-level tests for the Artifacts data API (feat/supabase-data-layer).
 *
 * These prove the route wiring: the `/api/v1/artifacts` routes are registered by
 * `registerArtifactRoutes`, sit BELOW the real `apiGuard`, and are backed by an
 * INJECTED ArtifactRepository. Artifacts CRUD is SESSION-class (a valid token +
 * verified email is enough) — NOT sensitive: it requires neither admin role nor
 * MFA nor a scope.
 *
 * NOTE on assembly: the production composition root (`server/index.ts`/`createApp`)
 * does not yet mount these routes (a follow-up wiring slice owns that — this slice
 * only creates NEW files). So the test assembles a minimal app that mirrors exactly
 * how createApp wires products: `express.json()` → `app.use("/api", apiGuard)` →
 * `registerArtifactRoutes(app, repo)`. This exercises the REAL apiGuard against the
 * REAL route handler with an in-memory repo double (no Supabase / network).
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal1", // artifacts are session-class: aal1 is sufficient
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

function validArtifact(overrides: Partial<ImageArtifact> = {}): ImageArtifact {
  return {
    id: "art-1",
    workflowRunId: "run-1",
    orderNumber: "ORD-9001",
    productId: "prod-1",
    templateId: "tpl-1",
    iteration: 2,
    candidateIndex: 3,
    storagePath: "data:image/png;base64,AAAA",
    status: "accepted",
    qaScore: 87,
    rejectionReason: "too dark",
    qaResultJson: '{"score":87}',
    generatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Minimal in-memory ArtifactRepository double — no Supabase, no network. */
class InMemoryArtifactRepo implements ArtifactRepository {
  artifacts: ImageArtifact[] = [];
  async getImageArtifacts(): Promise<ImageArtifact[]> {
    return [...this.artifacts];
  }
  async saveImageArtifacts(artifacts: ImageArtifact[]): Promise<void> {
    // Upsert-by-id semantics, mirroring the real repo.
    for (const a of artifacts) {
      const idx = this.artifacts.findIndex((x) => x.id === a.id);
      if (idx >= 0) this.artifacts[idx] = a;
      else this.artifacts.push(a);
    }
  }
}

/** Assemble a minimal app exactly as createApp wires the products vertical. */
function makeApp(repo: ArtifactRepository): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", apiGuard);
  registerArtifactRoutes(app, repo);
  return app;
}

let app: Express;
let repo: InMemoryArtifactRepo;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  // Fresh shared repo per test, injected into the route registration.
  repo = new InMemoryArtifactRepo();
  app = makeApp(repo);
});

describe("GET /api/v1/artifacts", () => {
  it("rejects unauthenticated requests (default-deny session)", async () => {
    const res = await request(app).get("/api/v1/artifacts");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns the artifacts array for a valid session", async () => {
    repo.artifacts = [validArtifact()];
    const res = await request(app)
      .get("/api/v1/artifacts")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((a: ImageArtifact) => a.id)).toContain("art-1");
  });

  it("returns 500 when the repo fails loud (never a fabricated empty array)", async () => {
    const failingRepo: ArtifactRepository = {
      async getImageArtifacts() {
        throw new Error("SUPABASE_ARTIFACT_STORE_ERROR (getImageArtifacts): boom");
      },
      async saveImageArtifacts() {},
    };
    const failApp = makeApp(failingRepo);
    const res = await request(failApp)
      .get("/api/v1/artifacts")
      .set(...bearer(token()));
    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe("ARTIFACT_STORE_ERROR");
    // The raw boundary message must NOT be relayed to the client.
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});

describe("POST /api/v1/artifacts", () => {
  const path = "/api/v1/artifacts";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send([validArtifact()]);
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("saves artifacts for a valid session and reads them back (shared repo)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send([validArtifact({ id: "art-shared" })]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, count: 1 });

    // A SECOND, independent supertest call must see it (shared, not per-request).
    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.status).toBe(200);
    expect(list.body.map((a: ImageArtifact) => a.id)).toContain("art-shared");
  });

  it("rejects a non-array body with 400 and does NOT persist", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({ id: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
    expect(await repo.getImageArtifacts()).toEqual([]);
  });

  it("does NOT require admin role or MFA (session-class, not sensitive)", async () => {
    // A plain aal1 session with a non-admin email still authorizes the write.
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: "viewer@example.com", aal: "aal1" })))
      .send([validArtifact({ id: "art-session" })]);
    expect(res.status).toBe(200);
  });
});
