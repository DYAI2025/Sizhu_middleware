import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const SERVICE_ROLE_KEY = "test-service-role-key-SHOULD-NEVER-LEAK";
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

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

describe("POST /api/workflows/:id/run — auth guards", () => {
  const RUN_BODY = {
    orderNumber: "ORD-001",
    productId: "prod-001",
    customerName: "Test User",
    birthDate: "2026-01-01",
    birthTime: "14:00",
    birthTimeKnown: true,
    birthPlace: "Berlin",
  };

  it("returns 401 AUTH_REQUIRED without a token", async () => {
    const res = await request(app).post("/api/workflows/run-123/run").send(RUN_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 ADMIN_ROLE_REQUIRED for a non-admin session", async () => {
    const res = await request(app)
      .post("/api/workflows/run-123/run")
      .set(...bearer(token({ email: "stranger@example.com" })))
      .send(RUN_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
  });

  it("returns 403 MFA_REQUIRED_FOR_ACTION for an admin at aal1", async () => {
    const res = await request(app)
      .post("/api/workflows/run-123/run")
      .set(...bearer(token({ aal: "aal1" })))
      .send(RUN_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MFA_REQUIRED_FOR_ACTION");
  });

  it("returns 400 INVALID_REQUEST when body is missing required fields", async () => {
    const res = await request(app)
      .post("/api/workflows/run-123/run")
      .set(...bearer(token()))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
  });

  it("returns 200 with a WorkflowRun for a valid request", async () => {
    const res = await request(app)
      .post("/api/workflows/run-123/run")
      .set(...bearer(token()))
      .send(RUN_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("orderNumber", "ORD-001");
  });
});
