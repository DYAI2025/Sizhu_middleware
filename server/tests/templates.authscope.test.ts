import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import { apiGuard, requireScope } from "../middleware/auth";

/**
 * REQ-006 / OQ-DESIGN-1 — capability/scope check for template writes.
 *
 * `requireScope('templates:write')` must enforce:
 *   - a valid session (verified token + verified email),
 *   - admin role (owner/admin/operator),
 *   - the named scope present on the verified token,
 * but NOT aal2/MFA (deliberate per the design decision).
 *
 * Tokens are minted with signJwtHS256 + SUPABASE_JWT_SECRET, exactly like
 * auth.routes.test.ts, so these exercise the real verification path.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";
const NON_ADMIN_EMAIL = "stranger@example.com";

/**
 * Build a token. `scopes` is injected into app_metadata.scopes — the claim the
 * design decided to read (Supabase access tokens carry app_metadata in the JWT).
 */
function token(
  overrides: Partial<JwtPayload> = {},
  scopes?: string[] | string,
): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    // aal1 on purpose: scope checks must NOT require MFA.
    aal: "aal1",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const payload: JwtPayload = { ...base, ...overrides };
  if (scopes !== undefined) {
    const existingAppMeta =
      (payload.app_metadata as Record<string, unknown> | undefined) ?? {};
    payload.app_metadata = { ...existingAppMeta, scopes };
  }
  return signJwtHS256(payload, JWT_SECRET);
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

/**
 * A minimal app that mounts the real apiGuard (so default-deny session/email
 * verification runs first) and a template-write route protected by requireScope.
 * This mirrors how a future template route would be wired.
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", apiGuard);
  app.post(
    "/api/templates",
    requireScope("templates:write"),
    (_req, res) => {
      res.status(200).json({ ok: true });
    },
  );
  return app;
}

let app: Express;

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  delete process.env.TEMPLATE_WRITE_REQUIRE_SCOPE;
});

afterEach(() => {
  delete process.env.TEMPLATE_WRITE_REQUIRE_SCOPE;
});

describe("requireScope('templates:write')", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/templates").send({});
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("allows an admin token WITH the scope — no MFA/aal2 required", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set(...bearer(token({ aal: "aal1" }, ["templates:write", "other:read"])))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("accepts a space-delimited scopes claim", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set(...bearer(token({ aal: "aal1" }, "other:read templates:write")))
      .send({});
    expect(res.status).toBe(200);
  });

  it("rejects an admin token WITHOUT the scope → 403 MISSING_SCOPE", async () => {
    // RED-on-revert: dropping the scope check makes this pass.
    const res = await request(app)
      .post("/api/templates")
      .set(...bearer(token({ aal: "aal1" }, ["other:read"])))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MISSING_SCOPE");
  });

  it("rejects an admin token with NO scopes claim at all → 403 MISSING_SCOPE", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set(...bearer(token({ aal: "aal1" })))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("MISSING_SCOPE");
  });

  it("rejects a non-admin user even WITH the scope → role still required", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set(
        ...bearer(
          token({ email: NON_ADMIN_EMAIL, aal: "aal1" }, ["templates:write"]),
        ),
      )
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
  });

  it("rejects an admin with an unverified email → email verification required", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set(
        ...bearer(
          token(
            { email_confirmed_at: null, email_verified: false, aal: "aal1" },
            ["templates:write"],
          ),
        ),
      )
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  describe("fallback: TEMPLATE_WRITE_REQUIRE_SCOPE=false", () => {
    it("allows an admin WITHOUT the scope (documented downgrade, still no MFA)", async () => {
      process.env.TEMPLATE_WRITE_REQUIRE_SCOPE = "false";
      const res = await request(app)
        .post("/api/templates")
        .set(...bearer(token({ aal: "aal1" })))
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("still requires admin role even with the scope check downgraded", async () => {
      process.env.TEMPLATE_WRITE_REQUIRE_SCOPE = "false";
      const res = await request(app)
        .post("/api/templates")
        .set(...bearer(token({ email: NON_ADMIN_EMAIL, aal: "aal1" })))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe("ADMIN_ROLE_REQUIRED");
    });
  });
});
