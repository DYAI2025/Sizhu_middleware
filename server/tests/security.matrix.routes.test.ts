import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * REQ-S-001 / REQ-S-002 — Protect all admin/provider APIs; email-verified admin
 * role + MFA/AAL2 for sensitive actions. VCHK-SFB-003 (real auth value).
 *
 * BLACK-BOX, derived from PRD §2 (AC-S-001a..c, AC-S-002a..c) and the §6 security
 * matrix. This complements server/tests/auth.routes.test.ts: it adds the security
 * matrix rows the baseline did not yet pin — notably the §6 RESOLVED finding that
 * `POST /api/fulfillment/pod/validate-dispatch` must be `sensitive` (admin+aal2),
 * and `POST /api/secret-references/check`.
 *
 * Kritische semantische Glättung — REQ-S-001/S-002 (BOUNDARY: HTTP auth path):
 *   These:      "Sensitive routes are guarded; auth.routes.test.ts is green."
 *   Gegenthese: A NEW sensitive route (validate-dispatch) is added but NOT listed in
 *               SENSITIVE_API_ROUTES, so it silently downgrades to `session` only — a
 *               valid non-admin/aal1 session writes through it. Auth suite stays green
 *               because it never names this route. Value (only admin+aal2 can perform
 *               sensitive fulfillment actions) is breached.
 *   Schärfung:  Hit validate-dispatch through createApp() with (a) no token, (b) a
 *               non-admin session, (c) an aal1 admin session, and assert 401/403 with
 *               the correct codes. A pass is impossible if the route is misclassified.
 *
 * Evidence class: real-boundary-smoke.
 *
 * STATUS: validate-dispatch tests are RED CONTRACT (route currently `session`-only;
 * auth.ts:141-152 has no validate-dispatch entry). The rest verify shipped behavior.
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
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

// The full set of routes the §6 matrix declares `sensitive` (session+admin+aal2).
const SENSITIVE_POST_ROUTES = [
  "/api/data-requests/fufire/test-run",
  "/api/fulfillment/pod/dispatch",
  "/api/fulfillment/pod/validate-dispatch", // §6 RESOLVED: must be sensitive
  "/api/secret-references/check",
];

describe("AC-S-001a — public health stays open", () => {
  it("GET /api/health → 200 { status: 'ok' } with no Authorization header", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("AC-S-001b — default-deny on unlisted routes", () => {
  it("an unlisted /api route requires a session (401 AUTH_REQUIRED)", async () => {
    const res = await request(app).get("/api/some-brand-new-unlisted-route");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });
});

describe("AC-S-001c / §6 matrix — every sensitive POST route denies without auth", () => {
  for (const route of SENSITIVE_POST_ROUTES) {
    it(`${route} → 401 AUTH_REQUIRED without a token`, async () => {
      const res = await request(app).post(route).send({});
      expect(res.status).toBe(401);
      expect(res.body.error_code).toBe("AUTH_REQUIRED");
    });
  }
});

describe("AC-S-002a — invalid token / unverified email", () => {
  it("a token that fails verification → 401 INVALID_AUTH_TOKEN", async () => {
    const res = await request(app)
      .post("/api/data-requests/fufire/test-run")
      .set("Authorization", "Bearer not-a-real-token")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("INVALID_AUTH_TOKEN");
  });

  it("a valid token with emailVerified=false → 403 EMAIL_VERIFICATION_REQUIRED", async () => {
    const res = await request(app)
      .post("/api/data-requests/fufire/test-run")
      .set(...bearer(token({ email_confirmed_at: null, email_verified: false })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});

describe("AC-S-002b — role gate on every sensitive route", () => {
  for (const route of SENSITIVE_POST_ROUTES) {
    it(`${route} → 403 ADMIN_ROLE_REQUIRED for a verified non-admin session`, async () => {
      const res = await request(app)
        .post(route)
        .set(...bearer(token({ email: NON_ADMIN_EMAIL })))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
    });
  }
});

describe("AC-S-002c — MFA/AAL2 gate on every sensitive route", () => {
  for (const route of SENSITIVE_POST_ROUTES) {
    it(`${route} → 403 MFA_REQUIRED_FOR_ACTION for an admin at aal1`, async () => {
      const res = await request(app)
        .post(route)
        .set(...bearer(token({ aal: "aal1" })))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("MFA_REQUIRED_FOR_ACTION");
    });

    it(`${route} → passes the guard for an admin at aal2 (not 401/403)`, async () => {
      const res = await request(app)
        .post(route)
        .set(...bearer(token()))
        .send({});
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  }
});
