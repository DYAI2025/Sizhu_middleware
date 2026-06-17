import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * Route-level security tests.
 *
 * These guard against the most important regression: a new (or existing) admin
 * API accidentally becoming reachable without auth, role or MFA.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const SERVICE_ROLE_KEY = "test-service-role-key-SHOULD-NEVER-LEAK";
const ADMIN_EMAIL = "admin@example.com";
const NON_ADMIN_EMAIL = "stranger@example.com";

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
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  app = createApp();
});

beforeEach(() => {
  // Reset to the enforced posture before each test.
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

describe("public routes", () => {
  it("/api/health is public and returns 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("static asset paths are not gated by the API auth layer", async () => {
    // apiGuard is mounted only on /api, so non-API paths are never 401/403.
    const res = await request(app).get("/assets/index-123.js");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("protected read routes", () => {
  it("/api/readiness rejects unauthenticated requests when AUTH_REQUIRED=true", async () => {
    const res = await request(app).get("/api/readiness");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("/api/readiness allows a valid session (no role/MFA escalation)", async () => {
    const res = await request(app).get("/api/readiness").set(...bearer(token()));
    // Either READY (200) or NOT_READY (503), but never an auth rejection.
    expect([200, 503]).toContain(res.status);
  });
});

describe("sensitive route: FuFire test-run", () => {
  const path = "/api/data-requests/fufire/test-run";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("rejects authenticated but non-admin users", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: NON_ADMIN_EMAIL })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
  });

  it("rejects admin users at aal1 when MFA is required", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ aal: "aal1" })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MFA_REQUIRED_FOR_ACTION");
    expect(res.body.status).toBe("MFA_REQUIRED");
  });

  it("allows admin users at aal2", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({});
    expect(res.status).toBe(200);
  });

  it("rejects admin users with an unverified email", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email_confirmed_at: null, email_verified: false })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});

describe("sensitive route: Gelato/POD dispatch", () => {
  const path = "/api/fulfillment/pod/dispatch";

  it("requires authentication", async () => {
    const res = await request(app).post(path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("requires an admin role", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: NON_ADMIN_EMAIL })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
  });

  it("requires MFA (aal2) for admins when enabled", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ aal: "aal1" })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MFA_REQUIRED_FOR_ACTION");
  });

  it("passes the auth layer for admin aal2 (handler decides outcome)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({});
    // The auth LAYER (apiGuard) must clear an aal2 admin and hand off to the
    // handler. After REQ-001 (sizhu-agent-safe-ops) the handler's own money gate
    // legitimately rejects this bare, un-approved dispatch with 403
    // DISPATCH_NOT_ALLOWED — that is a HANDLER decision, not an auth-layer block.
    // So we assert the auth layer passed by the absence of any auth-layer code,
    // not by a blanket "not 403".
    expect(res.status).not.toBe(401);
    const AUTH_LAYER_CODES = [
      "AUTH_REQUIRED",
      "INVALID_AUTH_TOKEN",
      "EMAIL_VERIFICATION_REQUIRED",
      "ADMIN_ROLE_REQUIRED",
      "MFA_REQUIRED_FOR_ACTION",
    ];
    expect(AUTH_LAYER_CODES).not.toContain(res.body?.error_code);
  });
});

describe("token handling", () => {
  it("missing Authorization header returns AUTH_REQUIRED", async () => {
    const res = await request(app).get("/api/readiness");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("an invalid token returns INVALID_AUTH_TOKEN", async () => {
    const res = await request(app)
      .get("/api/readiness")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("INVALID_AUTH_TOKEN");
  });

  it("a token signed with the wrong secret returns INVALID_AUTH_TOKEN", async () => {
    const forged = signJwtHS256(
      { sub: "x", email: ADMIN_EMAIL, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 },
      "the-wrong-secret",
    );
    const res = await request(app)
      .get("/api/readiness")
      .set(...bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("INVALID_AUTH_TOKEN");
  });

  it("a non-allowlisted email is denied admin role on sensitive routes", async () => {
    const res = await request(app)
      .post("/api/data-requests/fufire/test-run")
      .set(...bearer(token({ email: NON_ADMIN_EMAIL })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
  });
});

describe("default-deny for unknown API routes", () => {
  it("an unlisted /api route still requires a session", async () => {
    const res = await request(app).get("/api/something-new-and-unmapped");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });
});

describe("secret hygiene", () => {
  it("never returns the JWT secret or service-role key in responses", async () => {
    const responses = await Promise.all([
      request(app).get("/api/health"),
      request(app).get("/api/readiness").set(...bearer(token())),
      request(app).get("/api/config/all").set(...bearer(token())),
      request(app).get("/api/secret-references/status").set(...bearer(token())),
      request(app)
        .post("/api/secret-references/check")
        .set(...bearer(token()))
        .send({ ref: "SUPABASE_SERVICE_ROLE_KEY" }),
      request(app)
        .post("/api/data-requests/fufire/test-run")
        .set(...bearer(token()))
        .send({}),
    ]);
    for (const res of responses) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(JWT_SECRET);
      expect(serialized).not.toContain(SERVICE_ROLE_KEY);
    }
  });
});

describe("flag behavior", () => {
  it("when AUTH_REQUIRED is false, read routes are reachable without a token", async () => {
    process.env.AUTH_REQUIRED = "false";
    const res = await request(app).get("/api/readiness");
    expect(res.status).not.toBe(401);
  });

  it("when MFA is disabled, admin aal1 can perform sensitive actions", async () => {
    process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "false";
    const res = await request(app)
      .post("/api/data-requests/fufire/test-run")
      .set(...bearer(token({ aal: "aal1" })))
      .send({});
    expect(res.status).toBe(200);
  });
});
