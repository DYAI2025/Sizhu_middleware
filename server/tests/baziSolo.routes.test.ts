import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import { InMemoryBaZiSoloStore } from "../services/baziSoloPipeline";
import type { FuFireDataServiceLike } from "../services/baziSoloRunService";

/**
 * ST-8 — route + composed pipeline wiring (REQ-F-001, P1).
 * Proves: the bazi-solo route is reachable from createApp, session-protected by the
 * default-deny apiGuard, fail-closed (never a fake ready), and persists every run.
 * The FuFire boundary is INJECTED (a fake) so no live call is made; the full
 * ready_for_shipping path is proven end-to-end by the real DoD smoke (real FuFire + font).
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

// Minimal FuFireTestRunResult-shaped fakes (cast — only the fields createBaziSoloRun reads).
function fakeFufire(readinessStatus: "READY" | "NOT_READY", responses: unknown[] = []): FuFireDataServiceLike {
  return {
    async executeTestRun() {
      return {
        readinessStatus,
        requests: [],
        responses,
        gatewayIssues: [],
        warnings: [],
        normalizedBirthPayload: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    },
  };
}

const ORDER = { orderId: "ord-1", birthDate: "1990-02-06", birthTime: "12:00", manualLat: 39.9, manualLon: 116.4, manualTimezone: "Asia/Shanghai" };

function appWith(fufire: FuFireDataServiceLike, store = new InMemoryBaZiSoloStore()): Express {
  return createApp({
    baziSolo: { fufire, store, generateRunId: () => "run-fixed-1", now: () => "2026-06-22T00:00:00Z" },
  });
}

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});
beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

describe("ST-8 bazi-solo route wiring", () => {
  it("unauthenticated POST → 401 (default-deny apiGuard)", async () => {
    const res = await request(appWith(fakeFufire("READY"))).post("/api/v1/bazi-solo/runs").send(ORDER);
    expect(res.status).toBe(401);
  });

  it("authed POST with a not-READY FuFire → 200 BLOCKED FUFIRE_NOT_READY (no fake success) + persisted", async () => {
    const store = new InMemoryBaZiSoloStore();
    const app = appWith(fakeFufire("NOT_READY"), store);
    const res = await request(app)
      .post("/api/v1/bazi-solo/runs")
      .set("Authorization", `Bearer ${token()}`)
      .send(ORDER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("BLOCKED");
    expect(res.body.reason).toBe("FUFIRE_NOT_READY");
    expect(res.body.runId).toBe("run-fixed-1");
    // persisted + retrievable on a fresh request (proves the store seam)
    const got = await request(app).get("/api/v1/bazi-solo/runs/run-fixed-1").set("Authorization", `Bearer ${token()}`);
    expect(got.status).toBe(200);
    expect(got.body.status).toBe("BLOCKED");
    expect(got.body.rawBundle).toBeDefined();
  });

  it("authed POST with READY-but-garbage bazi response → 200 BLOCKED (compile fail-closed, never a fake ready)", async () => {
    const res = await request(appWith(fakeFufire("READY", [{ operation: "bazi", data: {} }])))
      .post("/api/v1/bazi-solo/runs")
      .set("Authorization", `Bearer ${token()}`)
      .send(ORDER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("BLOCKED"); // compile/lichun blocks — no ready on unverifiable data
    expect(res.body.status).not.toBe("ready_for_shipping");
  });

  it("authed POST with invalid order (no birthDate) → 400 INVALID_ORDER", async () => {
    const res = await request(appWith(fakeFufire("READY")))
      .post("/api/v1/bazi-solo/runs")
      .set("Authorization", `Bearer ${token()}`)
      .send({ orderId: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_ORDER");
  });

  it("authed GET unknown run id → 404", async () => {
    const res = await request(appWith(fakeFufire("READY")))
      .get("/api/v1/bazi-solo/runs/does-not-exist")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(404);
    expect(res.body.error_code).toBe("RUN_NOT_FOUND");
  });

  it("P1 wired-in-prod: registerBaziSoloRoutes is imported + called from createApp (server/index.ts)", () => {
    const src = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
    expect(src).toMatch(/import\s*\{[^}]*registerBaziSoloRoutes[^}]*\}\s*from\s*["']\.\/routes\/baziSolo["']/);
    expect(src).toMatch(/registerBaziSoloRoutes\(\s*app\s*,/);
  });
});
