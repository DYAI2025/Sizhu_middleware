import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import { getAppMode } from "../../src/lib/app/appMode";

/**
 * REQ-D-001 / AC-D-001d (audit note N5) — server-reported appMode must agree with the
 * REAL getAppMode() resolver. There must be a single source of truth for the
 * production-vs-DEMO_LOCAL boundary.
 *
 * Kritische semantische Glättung — AC-D-001d (BOUNDARY: config snapshot vs real mode):
 *   These:      "/api/config returns an appMode string; it's informational."
 *   Gegenthese: server/index.ts defaulted appMode to 'CONFIG_REQUIRED' while the app
 *               resolver (getAppMode) defaults to 'DEMO_LOCAL'. An operator reading the
 *               console sees one mode while the running pipeline behaves as another —
 *               the exact "demo-mode leakage" surface. A test that only checks "appMode is
 *               a string" never catches the divergence.
 *   Schärfung:  Assert the API-reported appMode EQUALS getAppMode() for several APP_MODE
 *               values AND for the unset default — pinning both to the single real source.
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

beforeAll(() => {
  app = createApp();
});

const savedMode = {
  APP_MODE: process.env.APP_MODE,
  VITE_APP_MODE: process.env.VITE_APP_MODE,
};

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

afterEach(() => {
  if (savedMode.APP_MODE === undefined) delete process.env.APP_MODE;
  else process.env.APP_MODE = savedMode.APP_MODE;
  if (savedMode.VITE_APP_MODE === undefined) delete process.env.VITE_APP_MODE;
  else process.env.VITE_APP_MODE = savedMode.VITE_APP_MODE;
});

describe("AC-D-001d / N5 — /api/config appMode equals the real getAppMode() resolver", () => {
  for (const mode of ["DEMO_LOCAL", "PRODUCTION", "SUPABASE_READY", "CONFIG_REQUIRED"]) {
    it(`APP_MODE=${mode}: reported appMode === getAppMode()`, async () => {
      process.env.APP_MODE = mode;
      const res = await request(app).get("/api/config/snapshot").set(...bearer(token()));
      expect(res.status).toBe(200);
      expect(res.body.appMode).toBe(getAppMode());
    });
  }

  it("unset APP_MODE: reported appMode still equals getAppMode() (no CONFIG_REQUIRED/DEMO_LOCAL drift)", async () => {
    delete process.env.APP_MODE;
    delete process.env.VITE_APP_MODE;
    const res = await request(app).get("/api/config/snapshot").set(...bearer(token()));
    expect(res.status).toBe(200);
    // Single source of truth: whatever getAppMode() defaults to, the server reports the SAME.
    expect(res.body.appMode).toBe(getAppMode());
  });
});
