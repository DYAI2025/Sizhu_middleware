import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import {
  TemplateStoreService,
  InMemoryAuditSink,
} from "../services/templateStoreService";
import type { TemplateRepository } from "../../src/lib/repositories/interfaces";
import type { PromptTemplate } from "../../src/types";

/**
 * Route-level tests for the server-template-config-store CRUD routes (REQ-002).
 *
 * These prove the composition-root wiring (P1): the `/api/v1/templates` routes
 * are mounted into createApp, backed by a SHARED TemplateStoreService, gated by
 * apiGuard (session) and — for writes — `requireScope("templates:write")`.
 *
 * The store is injected on an in-memory repo double so no Supabase / network is
 * touched and reads-after-writes prove a shared (not per-request) store.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal2",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

/** A token carrying the `templates:write` capability scope. */
function writeToken(overrides: Partial<JwtPayload> = {}): string {
  return token({ app_metadata: { scopes: ["templates:write"] }, ...overrides });
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

function validTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "tpl-1",
    name: "Birth chart prose",
    content: "Hello {{name}}",
    version: 1,
    status: "draft",
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: ADMIN_EMAIL,
    ...overrides,
  };
}

/** Minimal in-memory TemplateRepository double — no Supabase, no network. */
class InMemoryTemplateRepo implements TemplateRepository {
  private templates: PromptTemplate[] = [];
  private versionsById = new Map<string, PromptTemplate[]>();

  async getTemplates(): Promise<PromptTemplate[]> {
    return [...this.templates];
  }
  async saveTemplates(templates: PromptTemplate[]): Promise<void> {
    this.templates = [...templates];
  }
  async saveTemplate(template: PromptTemplate): Promise<PromptTemplate> {
    const idx = this.templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      const prior = this.templates[idx];
      const versions = this.versionsById.get(template.id) ?? [];
      versions.unshift(prior);
      this.versionsById.set(template.id, versions);
      this.templates[idx] = template;
    } else {
      this.templates.push(template);
    }
    return template;
  }
  async setActive(id: string, active: boolean): Promise<void> {
    const t = this.templates.find((x) => x.id === id);
    if (t) t.status = active ? "active" : "archived";
  }
  async listVersions(id: string): Promise<PromptTemplate[]> {
    return [...(this.versionsById.get(id) ?? [])];
  }
}

let app: Express;
let repo: InMemoryTemplateRepo;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.TEMPLATE_WRITE_REQUIRE_SCOPE = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  // Fresh shared store per test, injected at the composition root.
  repo = new InMemoryTemplateRepo();
  const store = new TemplateStoreService(repo, new InMemoryAuditSink());
  app = createApp({ templateStore: store });
});

describe("GET /api/v1/templates", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/templates");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns an array for a valid session", async () => {
    const res = await request(app)
      .get("/api/v1/templates")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/v1/templates (write-gated)", () => {
  const path = "/api/v1/templates";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send(validTemplate());
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("rejects an admin WITHOUT the templates:write scope (403 MISSING_SCOPE)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token())) // admin, but no scope
      .send(validTemplate());
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MISSING_SCOPE");
  });

  it("saves a valid template for an admin WITH the scope (200) and lists it", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(writeToken()))
      .send(validTemplate());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("tpl-1");

    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.status).toBe(200);
    expect(list.body.map((t: PromptTemplate) => t.id)).toContain("tpl-1");
  });

  it("reads back a saved template across a fresh request (shared store, not per-request)", async () => {
    await request(app)
      .post(path)
      .set(...bearer(writeToken()))
      .send(validTemplate({ id: "tpl-shared" }));

    // A SECOND, independent supertest call must see it.
    const res = await request(app)
      .get("/api/v1/templates/tpl-shared")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("tpl-shared");
  });

  it("rejects an invalid body with 422 and does NOT persist it", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(writeToken()))
      .send({ id: "", name: "", content: "", version: 0, status: "bogus" });
    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe("TEMPLATE_VALIDATION_ERROR");
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);

    // Nothing persisted.
    const all = await repo.getTemplates();
    expect(all.length).toBe(0);
  });
});

describe("GET /api/v1/templates/:id", () => {
  it("returns 404 for a missing template", async () => {
    const res = await request(app)
      .get("/api/v1/templates/does-not-exist")
      .set(...bearer(token()));
    expect(res.status).toBe(404);
  });

  it("returns 200 for an existing template", async () => {
    await request(app)
      .post("/api/v1/templates")
      .set(...bearer(writeToken()))
      .send(validTemplate({ id: "tpl-get" }));

    const res = await request(app)
      .get("/api/v1/templates/tpl-get")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("tpl-get");
  });
});

describe("POST /api/v1/templates/:id/active (write-gated set-active)", () => {
  it("rejects an admin WITHOUT the templates:write scope (403)", async () => {
    const res = await request(app)
      .post("/api/v1/templates/tpl-x/active")
      .set(...bearer(token()))
      .send({ active: true });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MISSING_SCOPE");
  });

  it("flips a template's status to active", async () => {
    await request(app)
      .post("/api/v1/templates")
      .set(...bearer(writeToken()))
      .send(validTemplate({ id: "tpl-active", status: "draft" }));

    const res = await request(app)
      .post("/api/v1/templates/tpl-active/active")
      .set(...bearer(writeToken()))
      .send({ active: true });
    expect(res.status).toBe(200);

    const got = await request(app)
      .get("/api/v1/templates/tpl-active")
      .set(...bearer(token()));
    expect(got.body.status).toBe("active");
  });
});
