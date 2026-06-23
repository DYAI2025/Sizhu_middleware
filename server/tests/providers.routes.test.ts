import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Express } from "express";
import { apiGuard } from "../middleware/auth";
import { registerProviderRoutes } from "../routes/providers";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import type { ProviderRepository } from "../../src/lib/repositories/interfaces";
import type { ApiProvider } from "../../src/lib/domain/models";

/**
 * Route-level tests for the Providers data API (feat/supabase-data-layer).
 *
 * These prove the apiGuard wiring: the `/api/v1/providers` routes are mounted
 * BELOW `app.use("/api", apiGuard)`, backed by an INJECTED ProviderRepository, and
 * gated by default-deny session auth. Providers CRUD is SESSION-class (a valid
 * token + verified email is enough) — NOT sensitive: it requires neither admin
 * role nor MFA nor a scope.
 *
 * NOTE: `createApp` is left untouched in this slice (the orchestrator integrates
 * the composition-root wiring to avoid a parallel conflict), so this test mirrors
 * the real composition directly: express.json() → apiGuard → registerProviderRoutes
 * on a fresh app, with the repo injected on an in-memory double so no Supabase /
 * network is touched and reads-after-writes prove a shared (not per-request) repo.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal1", // providers are session-class: aal1 is sufficient
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

function validProvider(overrides: Partial<ApiProvider> = {}): ApiProvider {
  return {
    id: "prov-1",
    name: "FuFire Personalization API",
    type: "personalization",
    status: "CONFIGURED",
    baseUrl: "https://api.fufire.io/v1/personalization",
    secretRef: "SECRET_REF_FUFIRE_LIVE_KEY",
    ...overrides,
  };
}

/** Minimal in-memory ProviderRepository double — no Supabase, no network. */
class InMemoryProviderRepo implements ProviderRepository {
  providers: ApiProvider[] = [];
  async getProviders(): Promise<ApiProvider[]> {
    return [...this.providers];
  }
  async saveProvider(provider: ApiProvider): Promise<void> {
    // Upsert-by-id semantics, mirroring the real repo.
    const idx = this.providers.findIndex((x) => x.id === provider.id);
    if (idx >= 0) this.providers[idx] = provider;
    else this.providers.push(provider);
  }
  async performHealthCheck(providerId: string): Promise<ApiProvider["status"]> {
    const found = this.providers.find((p) => p.id === providerId);
    if (!found) return "ERROR";
    return "MOCK";
  }
}

/** Build a fresh app mirroring the real composition (json → apiGuard → routes). */
function buildApp(repo: ProviderRepository): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", apiGuard);
  registerProviderRoutes(app, repo);
  return app;
}

let app: Express;
let repo: InMemoryProviderRepo;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  repo = new InMemoryProviderRepo();
  app = buildApp(repo);
});

describe("GET /api/v1/providers", () => {
  it("rejects unauthenticated requests (default-deny session)", async () => {
    const res = await request(app).get("/api/v1/providers");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns the providers array for a valid session", async () => {
    repo.providers = [validProvider()];
    const res = await request(app)
      .get("/api/v1/providers")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((p: ApiProvider) => p.id)).toContain("prov-1");
  });

  it("returns 500 when the repo fails loud (never a fabricated empty array)", async () => {
    const failingRepo: ProviderRepository = {
      async getProviders() {
        throw new Error("SUPABASE_PROVIDER_STORE_ERROR (getProviders): boom");
      },
      async saveProvider() {},
      async performHealthCheck() {
        return "ERROR";
      },
    };
    const failApp = buildApp(failingRepo);
    const res = await request(failApp)
      .get("/api/v1/providers")
      .set(...bearer(token()));
    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe("PROVIDER_STORE_ERROR");
    // The raw boundary message must NOT be relayed to the client.
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});

describe("POST /api/v1/providers", () => {
  const path = "/api/v1/providers";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send(validProvider());
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("saves a provider for a valid session and reads it back (shared repo)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send(validProvider({ id: "prov-shared" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    // A SECOND, independent supertest call must see it (shared, not per-request).
    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.status).toBe(200);
    expect(list.body.map((p: ApiProvider) => p.id)).toContain("prov-shared");
  });

  it("rejects an array body with 400 and does NOT persist (single-object contract)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send([validProvider()]);
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
    expect(await repo.getProviders()).toEqual([]);
  });

  it("does NOT require admin role or MFA (session-class, not sensitive)", async () => {
    // A plain aal1 session with a non-admin email still authorizes the write.
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: "viewer@example.com", aal: "aal1" })))
      .send(validProvider({ id: "prov-session" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/providers/:id/health-check", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/v1/providers/prov-1/health-check");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns MOCK for an existing provider (never a fabricated LIVE)", async () => {
    repo.providers = [validProvider({ id: "prov-hc" })];
    const res = await request(app)
      .post("/api/v1/providers/prov-hc/health-check")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "MOCK" });
  });

  it("returns ERROR for an unknown provider id", async () => {
    const res = await request(app)
      .post("/api/v1/providers/does-not-exist/health-check")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ERROR" });
  });

  it("returns 500 when the repo fails loud (never a fabricated status)", async () => {
    const failingRepo: ProviderRepository = {
      async getProviders() {
        return [];
      },
      async saveProvider() {},
      async performHealthCheck() {
        throw new Error("SUPABASE_PROVIDER_STORE_ERROR (getProviders): boom");
      },
    };
    const failApp = buildApp(failingRepo);
    const res = await request(failApp)
      .post("/api/v1/providers/prov-1/health-check")
      .set(...bearer(token()));
    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe("PROVIDER_STORE_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});
