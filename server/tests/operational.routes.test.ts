import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * REQ-O-001 — health public + readiness truthful + CORS deterministic.
 * (AC-O-001a, AC-O-001b, AC-O-001c)
 *
 * Kritische semantische Glättung — REQ-O-001 (BOUNDARY: HTTP + env-driven readiness):
 *   These:      "/api/health returns 200; readiness returns a status."
 *   Gegenthese: readiness returns READY even though required env/config is missing
 *               (e.g. because mock mode 'works'), so an operator trusts a system that
 *               cannot actually serve. Health-200 stays green; readiness lies.
 *   Schärfung:  With required env vars unset, GET /api/readiness must be 503 NOT_READY
 *               and name the missing vars. A pass is impossible if readiness laundered
 *               mock-success into READY.
 *
 * Evidence class: real-boundary-smoke.
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
function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

let app: Express;
const READINESS_ENV = [
  "SECRET_REF_FUFIRE_API_KEY",
  "SECRET_REF_SUPABASE_SERVICE_ROLE",
  "FUFIRE_API_KEY_SECRET_REF",
  "SUPABASE_SERVICE_ROLE_SECRET_REF",
  "FUFIRE_BASE_URL",
  "SUPABASE_URL",
];

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

describe("AC-O-001a — health is public and always 200 while alive", () => {
  it("GET /api/health → 200 without auth", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});

describe("AC-O-001b — readiness is truthful (503 when required config missing)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of READINESS_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of READINESS_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("GET /api/readiness → 503 NOT_READY with missing[] when required env is absent", async () => {
    const res = await request(app).get("/api/readiness").set(...bearer(token()));
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("NOT_READY");
    expect(Array.isArray(res.body.missing)).toBe(true);
    expect(res.body.missing.length).toBeGreaterThan(0);
  });

  it("readiness never returns READY merely because mock mode works", async () => {
    process.env.APP_MODE = "DEMO_LOCAL"; // demo/mock is 'working' …
    const res = await request(app).get("/api/readiness").set(...bearer(token()));
    // … but real config is missing, so readiness must still be NOT_READY.
    expect(res.body.status).not.toBe("READY");
  });
});

describe("AC-O-001c — CORS: unknown origin never produces an unhandled 500; static not gated", () => {
  it("an unknown API origin does not produce an unhandled 500", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://totally-unknown-origin.example.com");
    expect(res.status).not.toBe(500);
  });

  it("static (non-/api) paths are not gated by the API auth layer", async () => {
    const res = await request(app).get("/assets/index-abc.js");
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
